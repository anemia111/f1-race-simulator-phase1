import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot, F1EnergyIntent } from '../types'
import { createInitialRace } from './race'
import { advanceEnergyStore, createInitialEnergyStore } from './energySystem'
import {
  advanceSuperClipping,
  superClippingGeneratorRequestForIntensity,
  superClippingRegulatoryOpportunityForSpeedKph,
} from './superClipping'
import {
  airDensityKgM3,
  integrateVehicleLongitudinalStep,
} from './vehicleDynamics'
import {
  calculateCarTelemetry,
  overtakeAllowanceBoundedDcPowerLimitKw,
  overtakeIncrementalDcEnergyUsedMj,
} from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

const team = initialTeams[0]
const driver = initialDrivers.find((candidate) => candidate.teamId === team.id)!
const lowDragSetup: CarSetup = {
  brakeBiasPercent: 56.5,
  coolingPercent: 55,
  differentialPercent: 58,
  frontWing: 2,
  rearWing: 2,
  rideHeightMm: 26,
}
const standardSetup: CarSetup = {
  brakeBiasPercent: 56,
  coolingPercent: 50,
  differentialPercent: 55,
  frontWing: 6,
  rearWing: 6,
  rideHeightMm: 30,
}
const highDownforceSetup: CarSetup = {
  brakeBiasPercent: 55.5,
  coolingPercent: 66,
  differentialPercent: 48,
  frontWing: 8,
  rearWing: 9,
  rideHeightMm: 38,
}

const lowSocIntent: F1EnergyIntent = {
  propulsionAggression: 0.2,
  harvestPreference: 1,
  liftCoastPreference: 0.9,
  superclipAcceptance: 1,
  endOfStraightHarvestBias: 0.9,
  defendEnergyReserve: 0.2,
  attackEnergyReserve: 0.18,
  qualifyingSpendBias: 0.1,
}

function carWithEnergyState(
  car: CarSnapshot,
  stateOfCharge: number,
  rechargedAtCuKBusThisLapMj: number,
  removedThisLapMj: number,
): CarSnapshot {
  const currentEnergyMJ =
    car.energyStore.minimumUsableEnergyMJ +
    car.energyStore.usableEnergyMJ * stateOfCharge
  const rechargeLimit = car.energyStore.rechargeRule.limit
  const remainingMJ =
    rechargeLimit.kind === 'finite'
      ? Math.max(
          0,
          rechargeLimit.maxCuKBusRechargeMj -
            rechargedAtCuKBusThisLapMj,
        )
      : null
  const storedEnergyThisLapMj = rechargedAtCuKBusThisLapMj * 0.96

  return {
    ...car,
    energyDeployedThisLapMj: removedThisLapMj,
    energyHarvestedThisLapMj: rechargedAtCuKBusThisLapMj,
    ersBatteryPercent: Math.round(stateOfCharge * 100),
    energyStore: {
      ...car.energyStore,
      currentEnergyMJ,
      deployedAtCuKBusThisLapMJ: removedThisLapMj * 0.97,
      energyRemovedThisLapMJ: removedThisLapMj,
      lapStartEnergyMJ:
        currentEnergyMJ - storedEnergyThisLapMj + removedThisLapMj,
      rechargedAtCuKBusThisLapMJ: rechargedAtCuKBusThisLapMj,
      rechargeRule: {
        ...car.energyStore.rechargeRule,
        remainingMJ,
        usedMJ: rechargedAtCuKBusThisLapMj,
      },
      stateOfCharge,
      storedEnergyThisLapMJ: storedEnergyThisLapMj,
    },
  }
}

type StraightTracePoint = {
  distanceMeters: number
  generatorMechanicalPowerKw: number
  netPowerUnitWheelPowerKw: number
  speedKph: number
  timeSeconds: number
}

function runStraight(options: {
  clippingStartsAtMeters?: number
  durationSeconds?: number
  initialSpeedKph?: number
  intensity: number
  setup: CarSetup
  straightLengthMeters?: number
}) {
  const durationSeconds = options.durationSeconds ?? 80
  const straightLengthMeters =
    options.straightLengthMeters ?? Number.POSITIVE_INFINITY
  const deltaSeconds = 0.1
  let distanceMeters = 0
  let recoveredMechanicalMj = 0
  let speedKph = options.initialSpeedKph ?? 300
  let timeSeconds = 0
  let rampedIntensity = 0
  const trace: StraightTracePoint[] = []

  while (
    timeSeconds < durationSeconds - 1e-9 &&
    distanceMeters < straightLengthMeters
  ) {
    const clippingActive =
      distanceMeters >= (options.clippingStartsAtMeters ?? 0)
    const targetIntensity = clippingActive ? options.intensity : 0
    const rate = targetIntensity > rampedIntensity ? 0.46 : 0.82
    rampedIntensity =
      targetIntensity > rampedIntensity
        ? Math.min(targetIntensity, rampedIntensity + rate * deltaSeconds)
        : Math.max(targetIntensity, rampedIntensity - rate * deltaSeconds)
    const request = superClippingGeneratorRequestForIntensity(rampedIntensity)
    const step = integrateVehicleLongitudinalStep({
      activeAeroMode: 'straight',
      airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
      brakePercent: 0,
      currentSpeedKph: speedKph,
      deltaSeconds,
      dynamics: { gradient: 0, straightness: 1 },
      ersPowerKw: speedKph < 290 && rampedIntensity < 0.04 ? 350 : 0,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      regenerativeResistancePowerKw:
        request.requestedGeneratorMechanicalPowerKw,
      setup: options.setup,
      team,
      throttlePercent: 100,
      towDragReduction: 0.07,
    })
    distanceMeters += ((speedKph + step.speedKph) / 2 / 3.6) * deltaSeconds
    recoveredMechanicalMj +=
      step.generatorMechanicalPowerKw * deltaSeconds / 1000
    speedKph = step.speedKph
    timeSeconds += deltaSeconds

    if (Math.abs(timeSeconds - Math.round(timeSeconds)) < 0.001) {
      trace.push({
        distanceMeters,
        generatorMechanicalPowerKw: step.generatorMechanicalPowerKw,
        netPowerUnitWheelPowerKw: step.netPowerUnitWheelPowerKw,
        speedKph,
        timeSeconds,
      })
    }
  }

  return {
    distanceMeters,
    recoveredMechanicalMj,
    speedKph,
    timeSeconds,
    trace,
  }
}

function terminalSpeed(setup: CarSetup) {
  return runStraight({ intensity: 0, setup }).speedKph
}

describe('super clipping physical integration', () => {
  it('uses one mechanical generator request as the sole wheel-power sacrifice', () => {
    const speedKph = 340
    const generatorRequestKw = 180
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: 1.1,
      brakePercent: 0,
      clutchEngagementFraction: 1,
      currentSpeedKph: speedKph,
      deltaSeconds: 0,
      dynamics: { gradient: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      setup: lowDragSetup,
      team,
      throttlePercent: 100,
      turboSpoolFraction: 1,
    }
    const baseline = integrateVehicleLongitudinalStep(common)
    const clipped = integrateVehicleLongitudinalStep({
      ...common,
      regenerativeResistancePowerKw: generatorRequestKw,
    })

    expect(clipped.wheelDrivePowerKw).toBeCloseTo(
      baseline.wheelDrivePowerKw,
      10,
    )
    expect(clipped.generatorMechanicalPowerKw).toBeCloseTo(
      generatorRequestKw,
      10,
    )
    expect(clipped.netPowerUnitWheelPowerKw).toBeCloseTo(
      clipped.wheelDrivePowerKw - generatorRequestKw,
      10,
    )
    expect(clipped.accelerationMps2).toBeLessThan(baseline.accelerationMps2)
  })

  it('derives opportunity from the C5.2.8 normal curve, not a target speed', () => {
    const belowDerate = superClippingRegulatoryOpportunityForSpeedKph(289)
    const derating = superClippingRegulatoryOpportunityForSpeedKph(310)
    const nearCutoff = superClippingRegulatoryOpportunityForSpeedKph(344.999)

    expect(belowDerate.normalDeploymentDcPowerKw).toBe(350)
    expect(belowDerate.opportunity).toBe(0)
    expect(derating.normalDeploymentDcPowerKw).toBe(250)
    expect(derating.opportunity).toBeGreaterThan(0)
    expect(nearCutoff.normalDeploymentDcPowerKw).toBeCloseTo(0.02, 6)
    expect(nearCutoff.opportunity).toBe(1)
  })

  it('debits Overtake allowance from actual incremental CU-K DC energy only', () => {
    const incremental = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: 320,
      active: true,
      deltaSeconds: 0.5,
      normalDeploymentDcLimitKw: 100,
      remainingAllowanceMj: 0.5,
    })
    const belowNormalCurve = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: 90,
      active: true,
      deltaSeconds: 0.5,
      normalDeploymentDcLimitKw: 100,
      remainingAllowanceMj: 0.5,
    })
    const inactive = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: 320,
      active: false,
      deltaSeconds: 0.5,
      normalDeploymentDcLimitKw: 100,
      remainingAllowanceMj: 0.5,
    })

    expect(incremental).toBeCloseTo(0.11, 10)
    expect(belowNormalCurve).toBe(0)
    expect(inactive).toBe(0)
  })

  it('caps physical Overtake DC deployment before a large tick can overspend the remaining allowance', () => {
    const remainingAllowanceMj = 0.001
    const deltaSeconds = 0.5
    const normalDeploymentDcPowerLimitKw = 100
    const boundedLimitKw = overtakeAllowanceBoundedDcPowerLimitKw({
      active: true,
      declaredDeploymentDcPowerLimitKw: 350,
      deltaSeconds,
      normalDeploymentDcPowerLimitKw,
      remainingAllowanceMj,
    })
    const actualDebitMj = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: boundedLimitKw,
      active: true,
      deltaSeconds,
      normalDeploymentDcLimitKw: normalDeploymentDcPowerLimitKw,
      remainingAllowanceMj,
    })

    expect(boundedLimitKw).toBe(102)
    expect(actualDebitMj).toBeCloseTo(remainingAllowanceMj, 12)
    expect(
      ((boundedLimitKw - normalDeploymentDcPowerLimitKw) * deltaSeconds) /
        1000,
    ).toBeCloseTo(actualDebitMj, 12)
    expect(
      overtakeAllowanceBoundedDcPowerLimitKw({
        active: true,
        declaredDeploymentDcPowerLimitKw: 90,
        deltaSeconds,
        normalDeploymentDcPowerLimitKw,
        remainingAllowanceMj,
      }),
    ).toBe(90)
    expect(
      overtakeAllowanceBoundedDcPowerLimitKw({
        active: false,
        declaredDeploymentDcPowerLimitKw: 350,
        deltaSeconds,
        normalDeploymentDcPowerLimitKw,
        remainingAllowanceMj: 0,
      }),
    ).toBe(350)
  })

  it('keeps physical Overtake CU-K output and the remaining allowance on the same ledger', () => {
    const remainingAllowanceMj = 0.011
    const deltaSeconds = 1
    const speedKph = 344.999
    const normalDeploymentDcPowerLimitKw =
      superClippingRegulatoryOpportunityForSpeedKph(speedKph)
        .normalDeploymentDcPowerKw
    const boundedLimitKw = overtakeAllowanceBoundedDcPowerLimitKw({
      active: true,
      declaredDeploymentDcPowerLimitKw: 350,
      deltaSeconds,
      normalDeploymentDcPowerLimitKw,
      remainingAllowanceMj,
    })
    const initial = createInitialEnergyStore(team, 0.85)
    const step = advanceEnergyStore({
      ambientTemperatureC: 25,
      brakePercent: 0,
      combustionWheelPowerKw: 520,
      deltaSeconds,
      deploymentDcPowerLimitKw: boundedLimitKw,
      deploymentRequest: 1,
      driverErsManagement: driver.skills.ersManagement,
      driverWetSkill: driver.skills.wetSkill,
      gripMultiplier: 1,
      rechargeRule: initial.rechargeRule,
      speedKph,
      state: initial,
      surfaceWaterMm: 0,
      team,
      throttlePercent: 100,
      tire: 'M',
      vehicleMassKg: 840,
    })
    const actualIncrementalDcEnergyMj =
      (Math.max(
        0,
        step.state.actualDeploymentDcPowerKw -
          normalDeploymentDcPowerLimitKw,
      ) *
        deltaSeconds) /
      1000
    const debitedAllowanceMj = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: step.state.actualDeploymentDcPowerKw,
      active: true,
      deltaSeconds,
      normalDeploymentDcLimitKw: normalDeploymentDcPowerLimitKw,
      remainingAllowanceMj,
    })

    expect(debitedAllowanceMj).toBeGreaterThan(0)
    expect(actualIncrementalDcEnergyMj).toBeCloseTo(debitedAllowanceMj, 12)
    expect(actualIncrementalDcEnergyMj).toBeLessThanOrEqual(
      remainingAllowanceMj + 1e-12,
    )
  })

  it('produces monotonic generator power, recovery and speed loss by intensity', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const results = [0.3, 0.6, 1].map((intensity) =>
      runStraight({
        durationSeconds: 14,
        initialSpeedKph: normalTopSpeed,
        intensity,
        setup: lowDragSetup,
      }),
    )

    expect(results[0].speedKph).toBeGreaterThan(results[1].speedKph)
    expect(results[1].speedKph).toBeGreaterThan(results[2].speedKph)
    expect(results[0].recoveredMechanicalMj).toBeLessThan(
      results[1].recoveredMechanicalMj,
    )
    expect(results[1].recoveredMechanicalMj).toBeLessThan(
      results[2].recoveredMechanicalMj,
    )
    expect(results[0].trace.at(-1)!.generatorMechanicalPowerKw).toBeLessThan(
      results[1].trace.at(-1)!.generatorMechanicalPowerKw,
    )
    expect(results[1].trace.at(-1)!.generatorMechanicalPowerKw).toBeLessThan(
      results[2].trace.at(-1)!.generatorMechanicalPowerKw,
    )
  })

  it('preserves setup-relative terminal speeds instead of converging on a clamp', () => {
    const setups = [lowDragSetup, standardSetup, highDownforceSetup]
    const results = setups.map((setup) => {
      const normal = terminalSpeed(setup)
      const clipped = runStraight({
        durationSeconds: 18,
        initialSpeedKph: normal,
        intensity: 1,
        setup,
      }).speedKph

      return { clipped, normal }
    })

    expect(results[0].normal).toBeGreaterThan(results[1].normal)
    expect(results[1].normal).toBeGreaterThan(results[2].normal)
    expect(results[0].clipped).toBeGreaterThan(results[1].clipped)
    expect(results[1].clipped).toBeGreaterThan(results[2].clipped)
  })

  it('loses more time and recharges more when clipping starts earlier', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const baseline = runStraight({
      initialSpeedKph: normalTopSpeed,
      intensity: 0,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })
    const early = runStraight({
      clippingStartsAtMeters: 150,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })
    const late = runStraight({
      clippingStartsAtMeters: 1_750,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })

    expect(early.timeSeconds - baseline.timeSeconds).toBeGreaterThan(
      late.timeSeconds - baseline.timeSeconds,
    )
    expect(early.recoveredMechanicalMj).toBeGreaterThan(
      late.recoveredMechanicalMj,
    )
  })

  it('requests clipping only with intent, recharge headroom and a derated high-speed curve', () => {
    const shared = {
      battlePhase: 'single-file' as const,
      batteryPercent: 7,
      brakePercent: 0,
      currentIntensity: 0,
      deltaSeconds: 0.5,
      deployedAtCuKBusThisLapMj: 3.4,
      driver,
      energyIntent: lowSocIntent,
      fuelLoadKg: 70,
      gapToAheadSeconds: 3,
      lap: 8,
      lowGripConditions: false,
      phaseActive: false,
      racePaceMode: 'save' as const,
      rechargeRemainingAtCuKBusMj: 8.1,
      rechargedAtCuKBusThisLapMj: 0.4,
      sessionType: 'race-distance' as const,
      straightLengthAheadMeters: 900,
      straightness: 1,
      team,
      throttlePercent: 100,
    }
    const needed = advanceSuperClipping({ ...shared, speedKph: 340 })
    const belowCurveOpportunity = advanceSuperClipping({
      ...shared,
      speedKph: 289,
    })
    const noLedgerHeadroom = advanceSuperClipping({
      ...shared,
      rechargeRemainingAtCuKBusMj: 0,
      speedKph: 340,
    })
    const lowThrottle = advanceSuperClipping({
      ...shared,
      speedKph: 340,
      throttlePercent: 94,
    })

    expect(needed.demandIntensity).toBeGreaterThan(0)
    expect(needed.requestedGeneratorMechanicalPowerKw).toBeGreaterThan(0)
    expect(belowCurveOpportunity.intensity).toBe(0)
    expect(noLedgerHeadroom.intensity).toBe(0)
    expect(lowThrottle.intensity).toBe(0)
  })

  it('integrates actual full-throttle generation and CU-K recharge into telemetry', () => {
    const track = tracks.find(
      (candidate) => candidate.id === 'las-vegas-approx',
    )!
    const straight = track.centerline
      .map((_, index) => {
        const progress = index / track.centerline.length
        return { dynamics: trackDynamicsAt(track, progress), progress }
      })
      .filter(
        ({ dynamics }) =>
          dynamics.fullThrottle &&
          dynamics.brakingSeverity < 0.02 &&
          dynamics.straightness >= 0.78 &&
          dynamics.straightLengthAheadMeters >= 150,
      )
      .sort(
        (left, right) =>
          right.dynamics.straightLengthAheadMeters -
          left.dynamics.straightLengthAheadMeters,
      )[0]
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'super-clipping-telemetry',
      teams: initialTeams,
      track,
    })
    const car = {
      ...carWithEnergyState(snapshot.cars[0], 0.07, 0.4, 3.4),
      progress: straight.progress,
      racePaceMode: 'save' as const,
      speedKph: 340,
      status: 'running' as const,
      turboSpoolFraction: 1,
      clutchEngagementFraction: 1,
    }
    const telemetry = calculateCarTelemetry({
      car,
      deltaSeconds: 0.5,
      driver,
      elapsedSeconds: 240,
      lowGripConditions: false,
      phase: null,
      raceLap: 8,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })
    const healthyTelemetry = calculateCarTelemetry({
      car: carWithEnergyState(car, 0.82, 0.4, 0.3),
      deltaSeconds: 0.5,
      driver,
      elapsedSeconds: 240,
      lowGripConditions: false,
      phase: null,
      raceLap: 8,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })

    expect(telemetry.throttlePercent).toBeGreaterThanOrEqual(95)
    expect(telemetry.energyStore.operatingMode).toBe(
      'full-throttle-superclip',
    )
    expect(telemetry.superClippingIntensity).toBeGreaterThan(0)
    expect(telemetry.superClippingRegenPowerKw).toBeGreaterThan(0)
    expect(telemetry.energyHarvestedThisLapMj).toBeGreaterThan(
      car.energyStore.rechargedAtCuKBusThisLapMJ,
    )
    expect(telemetry.superClippingRecoveredThisLapMj).toBeGreaterThan(
      car.superClippingRecoveredThisLapMj,
    )
    expect(
      telemetry.superClippingRecoveredThisLapMj -
        car.superClippingRecoveredThisLapMj,
    ).toBeCloseTo(
      telemetry.energyStore.rechargedAtCuKBusThisLapMJ -
        car.energyStore.rechargedAtCuKBusThisLapMJ,
      10,
    )
    expect(telemetry.superClippingRegenPowerKw).toBeCloseTo(
      telemetry.energyStore.actualRecoveryPowerKw,
      10,
    )
    expect(telemetry.speedKph).toBeLessThan(healthyTelemetry.speedKph)
  })
})
