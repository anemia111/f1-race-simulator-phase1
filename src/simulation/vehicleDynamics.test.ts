import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type {
  Driver,
  DriverSkillProfile,
  MachinePerformanceProfile,
  Team,
  TrackDefinition,
} from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import { decideDriverBehavior } from './driverDecision'
import { selectGear } from './drivetrain'
import { simulatePhysicalLap } from './physicalLap'
import {
  runPracticeSession,
  runQualifying,
  timedSessionDriverExecutionLossSeconds,
} from './qualifying'
import {
  activeAeroForceComponents,
  activeAeroReferenceAreaMultipliers,
  airDensityKgM3,
  baseFuelBurnKgPerLap,
  combustionPowerKwFor,
  combustionWheelPowerKwAt,
  integrateVehicleLongitudinalStep,
  integrateVehicleSpeedKph,
  liveCorneringSpeedLimitKph,
  machinePaceRating,
  previewServiceBrakeMechanicalBudget,
  vehicleDownforceMultiplier,
  vehicleDragAreaM2,
  vehicleTyreGripMultiplierForTeam,
} from './vehicleDynamics'

function driverAt(value: number): Driver {
  const base = initialDrivers[0]
  const skills = Object.fromEntries(
    Object.keys(base.skills).map((key) => [key, value]),
  ) as DriverSkillProfile

  return { ...base, skills }
}

function physicalLapForTeam(team: Team, track: TrackDefinition) {
  const categoryPhysics = categoryPhysicsFor('f1-custom')
  const physics = {
    ...categoryPhysics,
    combustionPowerKw: combustionPowerKwFor(team, categoryPhysics),
    liftAreaM2:
      categoryPhysics.liftAreaM2 * vehicleDownforceMultiplier({ team }),
  }

  return simulatePhysicalLap(track, {
    deploymentPowerKw: categoryPhysics.hybridDeploymentPowerLimitKw,
    dragAreaM2: vehicleDragAreaM2({
      activeAeroMode: 'corner',
      categoryPhysics,
      team,
    }),
    gripMultiplier: vehicleTyreGripMultiplierForTeam(team, 1),
    physics,
  }).lapTimeSeconds
}

describe('multi-axis vehicle dynamics', () => {
  it('decomposes F1 Straight Mode into front/rear drag, load, and balance', () => {
    const categoryPhysics = categoryPhysicsFor('f1-custom')
    const common = {
      airDensityKgM3: 1.225,
      airSpeedMps: 80,
      categoryPhysics,
      team: initialTeams[0],
    }
    const corner = activeAeroForceComponents({
      ...common,
      activeAeroState: {
        frontStraightFraction: 0,
        rearStraightFraction: 0,
        transitionProgress: 1,
      },
    })
    const transition = activeAeroForceComponents({
      ...common,
      activeAeroState: {
        frontStraightFraction: 0.5,
        rearStraightFraction: 0.5,
        transitionProgress: 0.5,
      },
    })
    const straight = activeAeroForceComponents({
      ...common,
      activeAeroState: {
        frontStraightFraction: 1,
        rearStraightFraction: 1,
        transitionProgress: 1,
      },
    })

    expect(straight.frontDragN).toBeLessThan(corner.frontDragN)
    expect(straight.rearDragN).toBeLessThan(corner.rearDragN)
    expect(straight.frontDownforceN).toBeLessThan(corner.frontDownforceN)
    expect(straight.rearDownforceN).toBeLessThan(corner.rearDownforceN)
    expect(transition.totalDragN).toBeLessThan(corner.totalDragN)
    expect(transition.totalDragN).toBeGreaterThan(straight.totalDragN)
    expect(transition.transitionTransientDragN).toBeGreaterThan(0)
    expect(transition.transitionTransientDownforceLossN).toBeGreaterThan(0)
    expect(straight.aeroBalanceFrontFraction).toBeLessThan(
      corner.aeroBalanceFrontFraction,
    )
    expect(straight.provenance.classification).toBe(
      'category-level-prior-only',
    )
    expect(straight.provenance).toMatchObject({
      confidence: 'low',
      publicCoefficientRange: null,
      validationStatus: 'prior-only',
    })
    expect(straight.provenance.sourceIds).toContain(
      'fia-f1-2026-technical-c20',
    )
  })

  it('keeps the offline reference adapter decomposed and Super Formula fixed', () => {
    const f1 = categoryPhysicsFor('f1-custom')
    const sf = categoryPhysicsFor('super-formula')
    const state = (fraction: number) => ({
      frontStraightFraction: fraction,
      rearStraightFraction: fraction,
      transitionProgress: 1,
    })
    const f1Corner = activeAeroReferenceAreaMultipliers({
      activeAeroState: state(0),
      categoryPhysics: f1,
    })
    const f1Straight = activeAeroReferenceAreaMultipliers({
      activeAeroState: state(1),
      categoryPhysics: f1,
    })
    const sfCorner = activeAeroReferenceAreaMultipliers({
      activeAeroState: state(0),
      categoryPhysics: sf,
    })
    const sfInjectedStraight = activeAeroReferenceAreaMultipliers({
      activeAeroState: state(1),
      categoryPhysics: sf,
    })

    expect(f1Corner.dragAreaMultiplier).toBe(1)
    expect(f1Corner.downforceAreaMultiplier).toBe(1)
    expect(f1Straight.frontDragAreaMultiplier).toBeLessThan(
      f1Corner.frontDragAreaMultiplier,
    )
    expect(f1Straight.rearDragAreaMultiplier).toBeLessThan(
      f1Corner.rearDragAreaMultiplier,
    )
    expect(f1Straight.dragAreaMultiplier).toBeLessThan(1)
    expect(f1Straight.downforceAreaMultiplier).toBeLessThan(1)
    expect(sfInjectedStraight).toEqual(sfCorner)
  })

  it('uses the continuous aero state in the live cornering envelope', () => {
    const categoryPhysics = categoryPhysicsFor('f1-custom')
    const common = {
      airDensityKgM3: 1.225,
      bankingDegrees: 0,
      categoryPhysics,
      evaluationSpeedKph: 180,
      fuelLoadKg: 40,
      gripMultiplier: 1,
      radiusMeters: 110,
      team: initialTeams[0],
    }
    const corner = liveCorneringSpeedLimitKph({
      ...common,
      activeAeroState: {
        frontStraightFraction: 0,
        rearStraightFraction: 0,
        transitionProgress: 1,
      },
    })
    const straight = liveCorneringSpeedLimitKph({
      ...common,
      activeAeroState: {
        frontStraightFraction: 1,
        rearStraightFraction: 1,
        transitionProgress: 1,
      },
    })

    expect(straight).toBeLessThan(corner)
  })

  it('keeps fuel planning independent of the compatibility lap-time target', () => {
    const track = tracks[0]
    const changedObservation = {
      ...track,
      baseLapTime: track.baseLapTime * 1.8,
    }

    expect(baseFuelBurnKgPerLap(changedObservation)).toBeCloseTo(
      baseFuelBurnKgPerLap(track),
      12,
    )
  })

  it('keeps simplified qualifying and practice independent of baseLapTime', () => {
    const track = { ...tracks[0], rainProbability: 0 }
    const config = {
      drivers: initialDrivers,
      seed: 'timed-session-base-lap-independence',
      seriesId: 'f1-custom' as const,
      teams: initialTeams,
      track,
    }
    const changedObservation = {
      ...config,
      track: { ...track, baseLapTime: track.baseLapTime * 1.8 },
    }

    expect(
      runQualifying(config).map((result) => result.lapTimeSeconds),
    ).toEqual(
      runQualifying(changedObservation).map(
        (result) => result.lapTimeSeconds,
      ),
    )
    expect(
      runPracticeSession(config, 'fp2').map(
        (result) => result.bestLapTimeSeconds,
      ),
    ).toEqual(
      runPracticeSession(changedObservation, 'fp2').map(
        (result) => result.bestLapTimeSeconds,
      ),
    )
  })

  it('compresses machine effects without changing the source rating', () => {
    expect(machinePaceRating(0.86)).toBeCloseTo(0.86, 10)
    expect(machinePaceRating(0.96)).toBeCloseTo(0.93, 10)
    expect(machinePaceRating(0.62)).toBeCloseTo(0.692, 10)
    expect(machinePaceRating(0.96) - machinePaceRating(0.62)).toBeLessThan(
      0.96 - 0.62,
    )
  })

  it('narrows every machine axis while preserving team order', () => {
    const keys = Object.keys(
      initialTeams[0].machine,
    ) as Array<keyof MachinePerformanceProfile>

    for (const key of keys) {
      const raw = initialTeams.map((team) => team.machine[key])
      const effective = raw.map(machinePaceRating)
      const rawOrder = raw
        .map((value, index) => ({ index, value }))
        .sort((left, right) => right.value - left.value)
        .map(({ index }) => index)
      const effectiveOrder = effective
        .map((value, index) => ({ index, value }))
        .sort((left, right) => right.value - left.value)
        .map(({ index }) => index)
      const rawSpread = Math.max(...raw) - Math.min(...raw)
      const effectiveSpread = Math.max(...effective) - Math.min(...effective)

      expect(effectiveOrder).toEqual(rawOrder)
      if (rawSpread === 0) {
        expect(effectiveSpread).toBe(0)
      } else {
        expect(effectiveSpread).toBeGreaterThan(0)
        expect(effectiveSpread).toBeLessThan(rawSpread)
      }
    }
  })

  it('turns driver skill into lower pedal and line-control error, not a speed multiplier', () => {
    const lowerDriver = driverAt(0.7)
    const higherDriver = driverAt(1)
    const controlError = (driver: Driver) =>
      Array.from({ length: 240 }, (_, sample) => {
        const decision = decideDriverBehavior({
          currentLateralOffsetM: 0,
          driver,
          lap: Math.floor(sample / 12),
          physicalReferenceLineOffsetM: 1.2,
          seed: `vehicle-driver-control:${sample}`,
          trackHalfWidthM: 6.5,
          trackProgress: (sample % 12) / 12,
        })

        return (
          Math.abs(decision.controlError) +
          Math.abs(decision.lineErrorM) / 6.5 +
          Math.max(0, 1 - decision.throttleOpeningScale) +
          Math.max(0, 1 - decision.brakePressureScale)
        )
      }).reduce((total, value) => total + value, 0)

    expect(controlError(higherDriver)).toBeLessThan(
      controlError(lowerDriver),
    )
  })

  it('does not let displayed OVR alter an otherwise identical decision', () => {
    const driver = driverAt(0.9)
    const context = {
      currentLateralOffsetM: 0,
      lap: 3,
      physicalReferenceLineOffsetM: -0.8,
      seed: 'displayed-overall-is-not-a-control-input',
      trackHalfWidthM: 6.5,
      trackProgress: 0.42,
    }
    const lowDisplayedOverall = {
      ...driver,
      performanceSource: {
        fileName: 'low.csv',
        overall: 1,
        rawRatings: {},
      },
    }
    const highDisplayedOverall = {
      ...driver,
      performanceSource: {
        fileName: 'high.csv',
        overall: 100,
        rawRatings: {},
      },
    }

    expect(
      decideDriverBehavior({ ...context, driver: lowDisplayedOverall }),
    ).toEqual(
      decideDriverBehavior({ ...context, driver: highDisplayedOverall }),
    )
  })

  it('uses drag-limited acceleration instead of adding a fixed top speed', () => {
    const team = initialTeams[0]
    let speedKph = 300

    for (let step = 0; step < 500; step += 1) {
      speedKph = integrateVehicleSpeedKph({
        activeAeroMode: 'straight',
        airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
        brakePercent: 0,
        currentSpeedKph: speedKph,
        deltaSeconds: 0.1,
        dynamics: { roadGradeFraction: 0, straightness: 1 },
        ersPowerKw: speedKph < 355 ? 350 : 0,
        fuelLoadKg: 8,
        gripMultiplier: 1,
        team,
        throttlePercent: 100,
        towDragReduction: 0.15,
      })
    }

    // What this checks is that speed converges on a drag limit rather than a
    // stored top-speed constant. The limit itself is now the physical one: the
    // tow ceiling is 7 %, so the 0.15 requested above is clamped, and observed
    // field peaks run 291 to 360 km/h.
    expect(speedKph).toBeGreaterThan(340)
    expect(speedKph).toBeLessThan(402)
  })

  it('keeps coarse simulation ticks close to fine-grained integration', () => {
    const team = initialTeams[0]
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
      brakePercent: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 350,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      towDragReduction: 0,
    }
    const coarse = integrateVehicleSpeedKph({
      ...common,
      currentSpeedKph: 0,
      deltaSeconds: 8,
    })
    let fine = 0

    for (let step = 0; step < 80; step += 1) {
      fine = integrateVehicleSpeedKph({
        ...common,
        currentSpeedKph: fine,
        deltaSeconds: 0.1,
      })
    }

    expect(coarse).toBeGreaterThan(0)
    expect(Math.abs(coarse - fine)).toBeLessThan(3)
  })

  it('turns ERS deployment into acceleration and recovery into resistance', () => {
    const team = initialTeams[0]
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: airDensityKgM3({
        altitudeMeters: 0,
        temperatureC: 25,
      }),
      brakePercent: 0,
      currentSpeedKph: 260,
      deltaSeconds: 0.5,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      fuelLoadKg: 70,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      towDragReduction: 0,
    }
    const combustionOnly = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 0,
    })
    const deploying = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 350,
    })
    const harvesting = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 0,
      regenerativeResistancePowerKw: 180,
    })

    expect(deploying).toBeGreaterThan(combustionOnly)
    expect(harvesting).toBeLessThan(combustionOnly)
  })

  it('turns 0, 250 and 350 mechanical MGU-K kW into monotonic force and acceleration', () => {
    const team = initialTeams[0]
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: 1.225,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      currentSpeedKph: 220,
      deltaSeconds: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      fuelLoadKg: 30,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      turboSpoolFraction: 1,
    }
    const results = [0, 250, 350].map((ersPowerKw) =>
      integrateVehicleLongitudinalStep({ ...common, ersPowerKw }),
    )

    expect(results[1].driveForceN).toBeGreaterThan(results[0].driveForceN)
    expect(results[2].driveForceN).toBeGreaterThan(results[1].driveForceN)
    expect(results[1].accelerationMps2).toBeGreaterThan(
      results[0].accelerationMps2,
    )
    expect(results[2].accelerationMps2).toBeGreaterThan(
      results[1].accelerationMps2,
    )
  })

  it('does not apply a second electrical-efficiency axis to mechanical MGU-K kW', () => {
    const result = integrateVehicleLongitudinalStep({
      activeAeroMode: 'straight',
      airDensityKgM3: 1.225,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      combustionPowerKw: 0,
      currentSpeedKph: 180,
      deltaSeconds: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 350,
      fuelLoadKg: 20,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 100,
      turboSpoolFraction: 0,
    })

    expect(result.driveForceN).toBeGreaterThan(0)
    expect(result.accelerationMps2).toBeGreaterThan(0)
  })

  it('evaluates positive ICE wheel power from the live drivetrain state', () => {
    const common = {
      clutchEngagementFraction: 1,
      currentSpeedKph: 320,
      team: initialTeams[0],
      turboSpoolFraction: 1,
    }
    const fullThrottle = combustionWheelPowerKwAt({
      ...common,
      throttlePercent: 100,
    })
    const halfThrottle = combustionWheelPowerKwAt({
      ...common,
      throttlePercent: 50,
    })
    const noThrottle = combustionWheelPowerKwAt({
      ...common,
      throttlePercent: 0,
    })

    expect(fullThrottle).toBeGreaterThan(0)
    expect(halfThrottle).toBeCloseTo(fullThrottle / 2, 10)
    expect(noThrottle).toBe(0)
  })

  it('makes fuel mass reduce acceleration and the available braking deceleration', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      clutchEngagementFraction: 1,
      currentSpeedKph: 140,
      deltaSeconds: 0,
      dynamics: {
        effectiveCornerRadiusM: 120,
        roadGradeFraction: 0,
        straightness: 0.3,
      },
      ersPowerKw: 0,
      gripMultiplier: 1,
      team: initialTeams[0],
      turboSpoolFraction: 1,
    }
    const lightAcceleration = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 0,
      fuelLoadKg: 5,
      throttlePercent: 100,
    })
    const heavyAcceleration = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 0,
      fuelLoadKg: 105,
      throttlePercent: 100,
    })
    const lightBraking = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 100,
      fuelLoadKg: 5,
      throttlePercent: 0,
    })
    const heavyBraking = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 100,
      fuelLoadKg: 105,
      throttlePercent: 0,
    })

    expect(heavyAcceleration.accelerationMps2).toBeLessThan(
      lightAcceleration.accelerationMps2,
    )
    expect(heavyBraking.accelerationMps2).toBeGreaterThan(
      lightBraking.accelerationMps2,
    )
    expect(
      heavyAcceleration.tractionLimitN / (768 + 105),
    ).toBeLessThan(lightAcceleration.tractionLimitN / (768 + 5))
  })

  it('intersects temperature-limited hardware with tyre braking before force integration', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      clutchEngagementFraction: 1,
      currentSpeedKph: 360,
      deltaSeconds: 0,
      dynamics: {
        roadGradeFraction: 0,
        straightness: 1,
      },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const operatingWindow = integrateVehicleLongitudinalStep({
      ...common,
      brakeTemperatureC: 620,
    })
    const overheated = integrateVehicleLongitudinalStep({
      ...common,
      brakeTemperatureC: 1_150,
    })

    expect(overheated.brakeHardwareCapacityMultiplier).toBeLessThan(
      operatingWindow.brakeHardwareCapacityMultiplier,
    )
    expect(overheated.brakeForceN).toBeLessThan(operatingWindow.brakeForceN)
    expect(overheated.accelerationMps2).toBeGreaterThan(
      operatingWindow.accelerationMps2,
    )
  })

  it('integrates a temperature-limited service-brake mechanical budget over the frame', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      clutchEngagementFraction: 1,
      currentSpeedKph: 360,
      deltaSeconds: 0.4,
      dynamics: {
        roadGradeFraction: 0,
        straightness: 1,
      },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const operatingWindow = previewServiceBrakeMechanicalBudget({
      ...common,
      brakeTemperatureC: 620,
    })
    const cold = previewServiceBrakeMechanicalBudget({
      ...common,
      brakeTemperatureC: 120,
    })
    const overheated = previewServiceBrakeMechanicalBudget({
      ...common,
      brakeTemperatureC: 1_150,
    })

    expect(operatingWindow.mechanicalEnergyMJ).toBeGreaterThan(
      cold.mechanicalEnergyMJ,
    )
    expect(operatingWindow.mechanicalEnergyMJ).toBeGreaterThan(
      overheated.mechanicalEnergyMJ,
    )
    expect(operatingWindow.averageMechanicalPowerKw).toBeCloseTo(
      (operatingWindow.mechanicalEnergyMJ * 1000) / common.deltaSeconds,
      10,
    )
  })

  it('applies release modulation and lateral tyre demand to the brake budget', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      aeroYawDegrees: 0,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 310,
      deltaSeconds: 0.3,
      dynamics: {
        roadGradeFraction: 0,
        straightness: 1,
      },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const unrestrictedRelease = previewServiceBrakeMechanicalBudget(common)
    const releasing = previewServiceBrakeMechanicalBudget({
      ...common,
      brakeReleaseSpeedKph: 300,
    })
    const lateralDemand = previewServiceBrakeMechanicalBudget({
      ...common,
      currentSpeedKph: 200,
      dynamics: {
        effectiveCornerRadiusM: 95,
        roadGradeFraction: 0,
        straightness: 1,
      },
    })
    const sameSpeedStraight = previewServiceBrakeMechanicalBudget({
      ...common,
      currentSpeedKph: 200,
    })

    expect(releasing.mechanicalEnergyMJ).toBeGreaterThan(0)
    expect(releasing.mechanicalEnergyMJ).toBeLessThan(
      unrestrictedRelease.mechanicalEnergyMJ,
    )
    expect(lateralDemand.mechanicalEnergyMJ).toBeLessThan(
      sameSpeedStraight.mechanicalEnergyMJ,
    )
  })

  it('bounds the preview at a stop and returns finite zero budgets for empty or invalid frames', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 12,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const stopped = previewServiceBrakeMechanicalBudget({
      ...common,
      deltaSeconds: 2,
      regenerativeResistancePowerKw: 350,
    })
    const longerStoppedFrame = previewServiceBrakeMechanicalBudget({
      ...common,
      deltaSeconds: 4,
      regenerativeResistancePowerKw: 0,
    })
    const zeroFrame = previewServiceBrakeMechanicalBudget({
      ...common,
      deltaSeconds: 0,
    })
    const invalidFrame = previewServiceBrakeMechanicalBudget({
      ...common,
      brakePercent: Number.POSITIVE_INFINITY,
      currentSpeedKph: Number.POSITIVE_INFINITY,
      deltaSeconds: Number.POSITIVE_INFINITY,
    })
    const cappedLongFrame = previewServiceBrakeMechanicalBudget({
      ...common,
      brakePercent: 0,
      deltaSeconds: 30,
    })
    const initialKineticEnergyMJ =
      (0.5 * (768 + common.fuelLoadKg) * (common.currentSpeedKph / 3.6) ** 2) /
      1_000_000

    expect(stopped.mechanicalEnergyMJ).toBeGreaterThan(0)
    expect(stopped.mechanicalEnergyMJ).toBeLessThanOrEqual(
      initialKineticEnergyMJ,
    )
    expect(longerStoppedFrame.mechanicalEnergyMJ).toBeCloseTo(
      stopped.mechanicalEnergyMJ,
      10,
    )
    expect(zeroFrame).toEqual({
      averageMechanicalPowerKw: 0,
      brakingRegenerativeMechanicalEnergyMJ: 0,
      brakingRegenerativeMechanicalEnergyProfileMJ: [0],
      frictionBrakeMechanicalEnergyMJ: 0,
      frictionBrakeMechanicalEnergyProfileMJ: [0],
      mechanicalEnergyMJ: 0,
      mechanicalEnergyProfileMJ: [0],
    })
    expect(Number.isFinite(invalidFrame.averageMechanicalPowerKw)).toBe(true)
    expect(Number.isFinite(invalidFrame.mechanicalEnergyMJ)).toBe(true)
    expect(invalidFrame).toEqual(zeroFrame)
    expect(cappedLongFrame.mechanicalEnergyProfileMJ).toHaveLength(240)
    expect(cappedLongFrame.mechanicalEnergyMJ).toBe(0)
  })

  it('splits local service-brake work without changing its force or trajectory', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 82,
      brakeReleaseSpeedKph: 185,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 240,
      deltaSeconds: 0.5,
      dynamics: {
        effectiveCornerRadiusM: 150,
        roadGradeFraction: 0,
        straightness: 0.45,
      },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      regenerativeResistancePowerKw: 0,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const preview = previewServiceBrakeMechanicalBudget(common)
    const frictionOnly = integrateVehicleLongitudinalStep({
      ...common,
      serviceBrakeRegenerativeFraction: 0,
    })
    const blended = integrateVehicleLongitudinalStep({
      ...common,
      serviceBrakeRegenerativeFraction: 0.4,
    })
    const shortProfileTakesPrecedence = integrateVehicleLongitudinalStep({
      ...common,
      serviceBrakeRegenerativeFraction: 0.9,
      serviceBrakeRegenerativeFractionProfile: [0.25],
    })

    expect(blended.speedKph).toBe(frictionOnly.speedKph)
    expect(blended.brakeForceN).toBe(frictionOnly.brakeForceN)
    expect(blended.serviceBrakeMechanicalEnergyMJ).toBeCloseTo(
      preview.mechanicalEnergyMJ,
      12,
    )
    expect(blended.brakingRegenerativeMechanicalEnergyMJ).toBeCloseTo(
      blended.serviceBrakeMechanicalEnergyMJ * 0.4,
      12,
    )
    expect(blended.frictionBrakeMechanicalEnergyMJ).toBeCloseTo(
      blended.serviceBrakeMechanicalEnergyMJ * 0.6,
      12,
    )
    expect(
      blended.brakingRegenerativeMechanicalEnergyMJ +
        blended.frictionBrakeMechanicalEnergyMJ,
    ).toBeCloseTo(blended.serviceBrakeMechanicalEnergyMJ, 12)
    expect(
      shortProfileTakesPrecedence.brakingRegenerativeMechanicalEnergyMJ,
    ).toBeCloseTo(preview.mechanicalEnergyProfileMJ[0] * 0.25, 12)
    expect(
      shortProfileTakesPrecedence.brakingRegenerativeMechanicalEnergyMJ +
        shortProfileTakesPrecedence.frictionBrakeMechanicalEnergyMJ,
    ).toBeCloseTo(
      shortProfileTakesPrecedence.serviceBrakeMechanicalEnergyMJ,
      12,
    )
  })

  it('aligns recovery fractions to equal internal slices and released zero-work slices', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      brakeReleaseSpeedKph: 200,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 204,
      deltaSeconds: 0.5,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      headwindMps: 80,
      regenerativeResistancePowerKw: 0,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const preview = previewServiceBrakeMechanicalBudget(common)
    const final = integrateVehicleLongitudinalStep({
      ...common,
      serviceBrakeRegenerativeFractionProfile: [0.25, 1, 1, 1, 1],
    })

    expect(preview.mechanicalEnergyProfileMJ).toHaveLength(5)
    expect(preview.mechanicalEnergyProfileMJ[0]).toBeGreaterThan(0)
    expect(preview.mechanicalEnergyProfileMJ.slice(1)).toEqual([0, 0, 0, 0])
    expect(
      preview.mechanicalEnergyProfileMJ.reduce(
        (total, energyMJ) => total + energyMJ,
        0,
      ),
    ).toBe(preview.mechanicalEnergyMJ)
    expect(final.serviceBrakeMechanicalEnergyMJ).toBe(
      preview.mechanicalEnergyMJ,
    )
    expect(final.brakingRegenerativeMechanicalEnergyMJ).toBeCloseTo(
      preview.mechanicalEnergyProfileMJ[0] * 0.25,
      12,
    )
    expect(
      final.brakingRegenerativeMechanicalEnergyMJ +
        final.frictionBrakeMechanicalEnergyMJ,
    ).toBeCloseTo(final.serviceBrakeMechanicalEnergyMJ, 12)
  })

  it('stops brake recovery with release while preserving legacy standalone generation', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakeTemperatureC: 620,
      clutchEngagementFraction: 1,
      currentSpeedKph: 180,
      deltaSeconds: 0.2,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 1,
    }
    const releasedBrakeRecovery = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 100,
      brakeReleaseSpeedKph: 200,
      regenerativeResistancePowerKw: 0,
      serviceBrakeRegenerativeFraction: 0.75,
    })
    const legacyStandalone = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 0,
      regenerativeResistancePowerKw: 120,
    })
    const explicitLegacyStandalone = integrateVehicleLongitudinalStep({
      ...common,
      brakePercent: 0,
      regenerativeResistancePowerKw: 120,
      serviceBrakeRegenerativeFraction: undefined,
      serviceBrakeRegenerativeFractionProfile: undefined,
    })

    expect(releasedBrakeRecovery.serviceBrakeMechanicalEnergyMJ).toBe(0)
    expect(
      releasedBrakeRecovery.brakingRegenerativeMechanicalEnergyMJ,
    ).toBe(0)
    expect(releasedBrakeRecovery.regenerativeResistanceForceN).toBe(0)
    expect(releasedBrakeRecovery.generatorMechanicalPowerKw).toBe(0)
    expect(explicitLegacyStandalone).toEqual(legacyStandalone)
    expect(legacyStandalone.regenerativeResistanceForceN).toBeGreaterThan(0)
    expect(legacyStandalone.generatorMechanicalPowerKw).toBeCloseTo(120, 10)
    expect(legacyStandalone.serviceBrakeMechanicalEnergyMJ).toBe(0)
  })

  it('uses wet grip and dirty-air downforce as tyre-force inputs', () => {
    const common = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      currentSpeedKph: 170,
      deltaSeconds: 0,
      dynamics: {
        effectiveCornerRadiusM: 180,
        roadGradeFraction: 0,
        straightness: 0.4,
      },
      ersPowerKw: 350,
      fuelLoadKg: 30,
      team: initialTeams[0],
      throttlePercent: 100,
      turboSpoolFraction: 1,
    }
    const dry = integrateVehicleLongitudinalStep({
      ...common,
      gripMultiplier: 1,
    })
    const wet = integrateVehicleLongitudinalStep({
      ...common,
      gripMultiplier: 0.65,
    })
    const wake = integrateVehicleLongitudinalStep({
      ...common,
      dirtyAirDownforceMultiplier: 0.75,
      gripMultiplier: 1,
    })

    expect(wet.tractionLimitN).toBeLessThan(dry.tractionLimitN)
    expect(wet.accelerationMps2).toBeLessThan(dry.accelerationMps2)
    expect(wake.tractionLimitN).toBeLessThan(dry.tractionLimitN)
  })

  it('changes drag and terminal behaviour through active aero area', () => {
    const team = initialTeams[0]
    const common = {
      airDensityKgM3: 1.225,
      brakePercent: 0,
      currentSpeedKph: 300,
      deltaSeconds: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
    }
    const corner = integrateVehicleLongitudinalStep({
      ...common,
      activeAeroMode: 'corner',
    })
    const straight = integrateVehicleLongitudinalStep({
      ...common,
      activeAeroMode: 'straight',
    })
    let cornerSpeedKph = 300
    let straightSpeedKph = 300

    for (let step = 0; step < 300; step += 1) {
      cornerSpeedKph = integrateVehicleSpeedKph({
        ...common,
        activeAeroMode: 'corner',
        currentSpeedKph: cornerSpeedKph,
        deltaSeconds: 0.1,
      })
      straightSpeedKph = integrateVehicleSpeedKph({
        ...common,
        activeAeroMode: 'straight',
        currentSpeedKph: straightSpeedKph,
        deltaSeconds: 0.1,
      })
    }

    expect(straight.dragForceN).toBeLessThan(corner.dragForceN)
    expect(straightSpeedKph).toBeGreaterThan(cornerSpeedKph)
  })

  it('launches finitely and returns the gear and RPM used at the resulting speed', () => {
    const physics = categoryPhysicsFor('f1-custom')
    const team = initialTeams[0]
    const result = integrateVehicleLongitudinalStep({
      activeAeroMode: 'corner',
      airDensityKgM3: 1.225,
      brakePercent: 0,
      categoryPhysics: physics,
      clutchEngagementFraction: 0,
      currentSpeedKph: 0,
      deltaSeconds: 0.1,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 350,
      fuelLoadKg: 30,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      turboSpoolFraction: 0,
    })
    const drivetrain = selectGear({
      clutchEngagementFraction: result.clutchEngagementFraction,
      combustionPowerKw: combustionPowerKwFor(team, physics),
      deploymentPowerKw: 350,
      physics,
      speedMps: result.speedKph / 3.6,
      transmissionEfficiency: physics.drivetrainEfficiency,
      turboSpoolFraction: result.turboSpoolFraction,
    })

    expect(result.speedKph).toBeGreaterThan(0)
    expect(Number.isFinite(result.speedKph)).toBe(true)
    expect(result.clutchEngagementFraction).toBeGreaterThan(0)
    expect(result.turboSpoolFraction).toBeGreaterThan(0)
    expect(result.gear).toBe(drivetrain.gear)
    expect(result.rpm).toBeCloseTo(drivetrain.rpm, 10)
  })

  it('uses direct physical road grade with a signed force and neutral invalid fallback', () => {
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: 1.225,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      currentSpeedKph: 180,
      deltaSeconds: 0,
      ersPowerKw: 0,
      fuelLoadKg: 30,
      gripMultiplier: 1,
      team: initialTeams[0],
      throttlePercent: 0,
      turboSpoolFraction: 0,
    }
    const stepAtGrade = (roadGradeFraction: number) =>
      integrateVehicleLongitudinalStep({
        ...common,
        dynamics: { roadGradeFraction, straightness: 1 },
      })
    const level = stepAtGrade(0)
    const uphill = stepAtGrade(0.01)
    const downhill = stepAtGrade(-0.01)
    const cappedUphill = stepAtGrade(0.035)
    const overLimitUphill = stepAtGrade(0.35)
    const unavailable = stepAtGrade(Number.NaN)

    expect(uphill.gradeForceN).toBeGreaterThan(0)
    expect(downhill.gradeForceN).toBeLessThan(0)
    expect(uphill.accelerationMps2).toBeLessThan(level.accelerationMps2)
    expect(downhill.accelerationMps2).toBeGreaterThan(level.accelerationMps2)
    expect(overLimitUphill.gradeForceN).toBeCloseTo(
      cappedUphill.gradeForceN,
      10,
    )
    expect(unavailable.gradeForceN).toBe(0)
    expect(unavailable.accelerationMps2).toBeCloseTo(level.accelerationMps2, 10)
  })

  it('contains non-finite external inputs without emitting invalid vehicle state', () => {
    const result = integrateVehicleLongitudinalStep({
      activeAeroMode: 'straight',
      additionalMassKg: Number.POSITIVE_INFINITY,
      airDensityKgM3: Number.NaN,
      brakePercent: Number.NaN,
      currentSpeedKph: Number.NEGATIVE_INFINITY,
      deltaSeconds: 0.1,
      dynamics: {
        effectiveCornerRadiusM: Number.NaN,
        roadGradeFraction: Number.NaN,
        straightness: 1,
      },
      ersPowerKw: Number.POSITIVE_INFINITY,
      fuelLoadKg: Number.NaN,
      gripMultiplier: Number.NaN,
      headwindMps: Number.NaN,
      regenerativeResistancePowerKw: Number.POSITIVE_INFINITY,
      team: initialTeams[0],
      throttlePercent: Number.POSITIVE_INFINITY,
    })

    for (const value of Object.values(result)) {
      if (Array.isArray(value)) {
        for (const energyMJ of value) {
          expect(Number.isFinite(energyMJ)).toBe(true)
        }
      } else {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
    expect(result.speedKph).toBeGreaterThanOrEqual(0)
    expect(result.driveForceN).toBeGreaterThanOrEqual(0)
    expect(result.brakeForceN).toBeGreaterThanOrEqual(0)
  })

  it('compares every CSV machine through physical power, drag and grip', () => {
    const monza = tracks.find((track) => track.id === 'monza-approx')!
    const monaco = tracks.find((track) => track.id === 'monaco-approx')!
    const resultFor = (track: (typeof tracks)[number]) =>
      initialTeams
        .map((team) => ({
          lapTimeSeconds: physicalLapForTeam(team, track),
          teamId: team.id,
        }))
        .sort((left, right) => left.lapTimeSeconds - right.lapTimeSeconds)

    const monzaResults = resultFor(monza)
    const monacoResults = resultFor(monaco)

    expect(monzaResults).toHaveLength(initialTeams.length)
    expect(
      new Set(
        monzaResults.map((result) => result.lapTimeSeconds.toFixed(5)),
      ).size,
    ).toBeGreaterThan(7)
    expect(monzaResults.map((result) => result.teamId)).not.toEqual(
      monacoResults.map((result) => result.teamId),
    )
  })

  it('turns a real PU-output difference into a faster physical lap', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const team = initialTeams[0]
    const lowerOutput = {
      ...team,
      machine: { ...team.machine, puOutput: 0.6 },
    }
    const higherOutput = {
      ...team,
      machine: { ...team.machine, puOutput: 1 },
    }

    expect(physicalLapForTeam(higherOutput, track)).toBeLessThan(
      physicalLapForTeam(lowerOutput, track),
    )
  })

  it('produces team-relative high-speed acceleration from CSV power and drag axes', () => {
    const terminalSpeeds = new Map(initialTeams.map((team) => {
      let speedKph = 300

      for (let tick = 0; tick < 100; tick += 1) {
        speedKph = integrateVehicleSpeedKph({
          activeAeroMode: 'straight',
          airDensityKgM3: airDensityKgM3({
            altitudeMeters: 650,
            temperatureC: 28,
          }),
          brakePercent: 0,
          currentSpeedKph: speedKph,
          deltaSeconds: 0.1,
          dynamics: { roadGradeFraction: 0, straightness: 1 },
          ersPowerKw: speedKph < 355 ? 350 : 0,
          fuelLoadKg: 8,
          gripMultiplier: 1,
          team,
          throttlePercent: 100,
          towDragReduction: 0.08,
        })
      }

      return [team.id, speedKph] as const
    }))
    const speedValues = [...terminalSpeeds.values()]

    expect(new Set(speedValues.map((speed) => speed.toFixed(2))).size).toBe(
      initialTeams.length,
    )
    const terminalSpeedSpreadKph =
      Math.max(...speedValues) - Math.min(...speedValues)

    expect(terminalSpeeds.get('aston-martin')).toBeLessThan(
      Math.max(...speedValues),
    )
    expect(terminalSpeedSpreadKph).toBeGreaterThan(0.5)
    expect(terminalSpeedSpreadKph).toBeLessThan(10)
  })

  it('makes execution loss non-negative and lower for precise drivers', () => {
    const referenceTeam = initialTeams.find((team) => team.id === 'mclaren')!
    const track = tracks[0]
    const config = {
      drivers: initialDrivers,
      seed: 'execution-loss-physical-reference',
      seriesId: 'f1-custom' as const,
      teams: initialTeams,
      track,
    }
    const common = {
      tire: {
        compound: 'S' as const,
        kind: 'f1-pirelli-session-tire' as const,
      },
      config,
      fuelLoadKg: 6,
      setup: {
        brakeBiasPercent: 55,
        coolingPercent: 50,
        differentialPercent: 55,
        frontWing: 5.5,
        rearWing: 5.5,
        rideHeightMm: 28,
      },
      team: referenceTeam,
      trackGrip: 1,
      weather: 'clear' as const,
      weekendStage: 'qualifying' as const,
    }
    const high = driverAt(1)
    const low = driverAt(0.65)
    const meanLoss = (driver: Driver) =>
      Array.from({ length: 120 }, (_, run) =>
        timedSessionDriverExecutionLossSeconds({
          ...common,
          driver,
          run,
          seed: `execution-loss:${run}`,
        }),
      ).reduce((total, loss) => total + loss, 0) / 120
    const highLoss = meanLoss(high)
    const lowLoss = meanLoss(low)

    expect(highLoss).toBeGreaterThanOrEqual(0)
    expect(lowLoss).toBeGreaterThanOrEqual(0)
    expect(highLoss).toBeLessThan(lowLoss)
  })
})
