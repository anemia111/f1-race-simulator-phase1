import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import type { CarSnapshot, TrackDefinition } from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import {
  f1TireForceEnvelopeFor,
  tireOperatingWindowFor,
  tireTrackGripMultiplier,
  type F1TireForceEnvelopeInput,
} from './tires'
import { trackDynamicsAt } from './trackDynamics'
import { gripForSurfaceWater } from './trackWater'
import {
  integrateVehicleLongitudinalStep,
  liveCorneringSpeedLimitKph,
} from './vehicleDynamics'

const f1Driver = initialDrivers[0]
const f1Team = initialTeams.find((team) => team.id === f1Driver.teamId)!
const f1Track = tracks.find((track) => track.id === 'monza-approx')!
const f1Physics = categoryPhysicsFor('f1-custom')
const mediumWindow = tireOperatingWindowFor('M', f1Track.tireNomination)

// This deliberately puts a dry Medium on a saturated, unworked racing line.
// The pre-Phase-6 compatibility floor of 0.34 would flatten both F1 states
// below; the force chain must preserve their distinct contact-patch limits.
const saturatedMismatchCondition = {
  dryingLine: 0,
  rainIntensityMmH: 24,
  surfaceWaterMm: 4.5,
} as const

type F1TirePatch = Partial<
  Extract<CarSnapshot['runtimeSystems'], { kind: 'f1' }>['tires']
>

function f1EnvelopeFor(
  state: Partial<F1TireForceEnvelopeInput['state']> = {},
) {
  return f1TireForceEnvelopeFor({
    compound: 'M',
    nomination: f1Track.tireNomination,
    state: {
      carcassTemperatureC: mediumWindow.targetC,
      grainingPercent: 0,
      overheatingPercent: 0,
      surfaceTemperatureC: mediumWindow.targetC,
      thermalStressPercent: 0,
      wearPercent: 0,
      ...state,
    },
  })
}

function localF1GripFor(envelope: ReturnType<typeof f1EnvelopeFor>) {
  return (
    gripForSurfaceWater(
      0.52,
      saturatedMismatchCondition.surfaceWaterMm,
      saturatedMismatchCondition.dryingLine,
    ) *
    tireTrackGripMultiplier('M', saturatedMismatchCondition) *
    envelope.gripMultiplier
  )
}

function f1CarForLiveBrake(
  tirePatch: F1TirePatch,
  track: TrackDefinition = f1Track,
): CarSnapshot {
  const snapshot = createInitialRace({
    drivers: [f1Driver],
    seed: 'phase6-f1-force-acceptance',
    teams: [f1Team],
    track,
  })
  const initial = snapshot.cars[0]

  if (initial.runtimeSystems.kind !== 'f1') {
    throw new Error('Expected an F1 Pirelli runtime fixture.')
  }

  const brakingApproach = Array.from({ length: 720 }, (_, index) => {
    const progress = index / 720

    return {
      progress,
      dynamics: trackDynamicsAt(track, progress, f1Physics),
    }
  })
    .sort(
      (left, right) =>
        right.dynamics.brakingDistanceAheadMeters -
        left.dynamics.brakingDistanceAheadMeters,
    )[0]

  return {
    ...initial,
    gapToAhead: 10,
    pitPhase: 'none',
    progress: brakingApproach.progress,
    speedKph: Math.max(
      270,
      brakingApproach.dynamics.brakingTargetSpeedKph + 110,
    ),
    status: 'running',
    timedRunPhase: null,
    totalDistance: brakingApproach.progress,
    runtimeSystems: {
      ...initial.runtimeSystems,
      tires: {
        ...initial.runtimeSystems.tires,
        tire: 'M',
        tireCarcassTemperatureC: mediumWindow.targetC,
        tireGrainingPercent: 0,
        tireOverheatingPercent: 0,
        tirePerformanceState: 'optimal',
        tireTemperatureC: mediumWindow.targetC,
        tireThermalStressPercent: 0,
        tireWearPercent: 0,
        ...tirePatch,
      },
    },
  }
}

function f1LiveBrakeTelemetry(
  tirePatch: F1TirePatch,
  track: TrackDefinition = f1Track,
) {
  return calculateCarTelemetry({
    car: f1CarForLiveBrake(tirePatch, track),
    categoryPhysics: f1Physics,
    deltaSeconds: 0.5,
    driver: f1Driver,
    elapsedSeconds: 40,
    lowGripConditions: true,
    phase: null,
    raceLap: 2,
    team: f1Team,
    track,
    trackCondition: saturatedMismatchCondition,
    trackGrip: 0.52,
    weather: 'heavy-rain',
  })
}

function f1BrakeHardwareTelemetry(brakeTemperatureC: number) {
  return calculateCarTelemetry({
    car: {
      ...f1CarForLiveBrake({}),
      brakeTemperatureC,
    },
    categoryPhysics: f1Physics,
    deltaSeconds: 0.5,
    driver: f1Driver,
    elapsedSeconds: 40,
    lowGripConditions: false,
    phase: null,
    raceLap: 2,
    team: f1Team,
    track: f1Track,
    trackCondition: {
      dryingLine: 1,
      rainIntensityMmH: 0,
      surfaceWaterMm: 0,
    },
    trackGrip: 1,
    weather: 'clear',
  })
}

describe('Phase 6 F1 tyre-force acceptance', () => {
  it('keeps a degraded F1 state below the legacy grip floor in both live cornering and braking force', () => {
    const healthyEnvelope = f1EnvelopeFor()
    const degradedEnvelope = f1EnvelopeFor({
      carcassTemperatureC: mediumWindow.upperC + 80,
      grainingPercent: 100,
      overheatingPercent: 100,
      surfaceTemperatureC: mediumWindow.upperC + 80,
      thermalStressPercent: 100,
      wearPercent: 100,
    })
    const healthyGrip = localF1GripFor(healthyEnvelope)
    const degradedGrip = localF1GripFor(degradedEnvelope)

    expect(healthyGrip).toBeLessThan(0.34)
    expect(degradedGrip).toBeLessThan(0.34)
    expect(degradedGrip).toBeLessThan(healthyGrip)

    const corneringInput = {
      airDensityKgM3: 1.225,
      bankingDegrees: 0,
      categoryPhysics: f1Physics,
      evaluationSpeedKph: 180,
      fuelLoadKg: 35,
      radiusMeters: 110,
      team: f1Team,
    }
    const healthyCorneringLimit = liveCorneringSpeedLimitKph({
      ...corneringInput,
      gripMultiplier: healthyGrip,
    })
    const degradedCorneringLimit = liveCorneringSpeedLimitKph({
      ...corneringInput,
      gripMultiplier: degradedGrip,
    })

    expect(degradedCorneringLimit).toBeLessThan(healthyCorneringLimit)

    const brakingInput = {
      activeAeroMode: 'corner' as const,
      airDensityKgM3: 1.225,
      brakePercent: 100,
      categoryPhysics: f1Physics,
      currentSpeedKph: 250,
      deltaSeconds: 0,
      dynamics: { roadGradeFraction: 0, straightness: 1 },
      ersPowerKw: 0,
      fuelLoadKg: 35,
      team: f1Team,
      throttlePercent: 0,
    }
    const healthyBraking = integrateVehicleLongitudinalStep({
      ...brakingInput,
      gripMultiplier: healthyGrip,
    })
    const degradedBraking = integrateVehicleLongitudinalStep({
      ...brakingInput,
      gripMultiplier: degradedGrip,
    })

    expect(degradedBraking.brakeForceN).toBeLessThan(
      healthyBraking.brakeForceN,
    )
    expect(degradedBraking.accelerationMps2).toBeGreaterThan(
      healthyBraking.accelerationMps2,
    )
  })

  it('routes F1 runtime degradation through the live braking path rather than a lap-time-only penalty', () => {
    const healthy = f1LiveBrakeTelemetry({})
    const degraded = f1LiveBrakeTelemetry({
      tireCarcassTemperatureC: mediumWindow.upperC + 80,
      tireGrainingPercent: 100,
      tireOverheatingPercent: 100,
      tirePerformanceState: 'degraded',
      tireTemperatureC: mediumWindow.upperC + 80,
      tireThermalStressPercent: 100,
      tireWearPercent: 100,
    })

    expect(healthy.brakePercent).toBeGreaterThan(0)
    expect(degraded.brakePercent).toBeGreaterThan(0)
    expect(degraded.speedKph).toBeGreaterThan(healthy.speedKph)
  })

  it('keeps live F1 telemetry independent of render centreline elevation', () => {
    const renderElevationOnly: TrackDefinition = {
      ...f1Track,
      centerline: f1Track.centerline.map(
        ([x, _y, z], index): [number, number, number] => [
          x,
          index % 2 === 0 ? Number.NaN : 1_000_000,
          z,
        ],
      ),
    }

    expect(f1LiveBrakeTelemetry({}, renderElevationOnly)).toEqual(
      f1LiveBrakeTelemetry({}, f1Track),
    )
  })

  it('closes the live F1 recovery and friction ledger against contact-patch brake work', () => {
    const operatingWindow = f1BrakeHardwareTelemetry(620)
    const overheated = f1BrakeHardwareTelemetry(1_150)

    expect(operatingWindow.brakePercent).toBeGreaterThan(0)
    expect(overheated.brakePercent).toBeGreaterThan(0)
    expect(operatingWindow.runtimeSystems.kind).toBe('f1')
    expect(overheated.runtimeSystems.kind).toBe('f1')
    if (
      operatingWindow.runtimeSystems.kind !== 'f1' ||
      overheated.runtimeSystems.kind !== 'f1'
    ) {
      throw new Error('Expected F1 Energy Store telemetry.')
    }

    for (const telemetry of [operatingWindow, overheated]) {
      if (telemetry.runtimeSystems.kind !== 'f1') {
        throw new Error('Expected F1 Energy Store telemetry.')
      }
      const store = telemetry.runtimeSystems.energyStore

      expect(store.requestedBrakePowerKw).toBeGreaterThan(0)
      expect(store.actualRecoveryPowerKw).toBeGreaterThanOrEqual(0)
      expect(store.actualRecoveryPowerKw).toBeLessThanOrEqual(
        store.requestedBrakePowerKw,
      )
      expect(
        store.frictionBrakePowerKw + store.actualRecoveryPowerKw,
      ).toBeCloseTo(store.requestedBrakePowerKw, 8)
    }
  })

  it('does not couple an F1 tyre envelope into SUPER FORMULA runtime state', () => {
    const superFormula = seriesPackageById.get('super-formula')!
    const superFormulaTrack = superFormula.tracks[0]
    const superFormulaTeam = superFormula.teams[0]
    const superFormulaDriver = superFormula.drivers.find(
      (driver) => driver.teamId === superFormulaTeam.id,
    )!
    const snapshot = createInitialRace({
      drivers: superFormula.drivers,
      overtakeSystem: 'ots',
      seed: 'phase6-sf-tyre-envelope-boundary',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: superFormula.teams,
      track: superFormulaTrack,
      weekendStage: 'race',
    })
    const car = {
      ...snapshot.cars.find(
        (candidate) => candidate.driverId === superFormulaDriver.id,
      )!,
      gapToAhead: 10,
      pitPhase: 'none' as const,
      progress: 0.25,
      speedKph: 200,
      status: 'running' as const,
      timedRunPhase: null,
    }
    const telemetryOptions = {
      car,
      categoryPhysics: categoryPhysicsFor('super-formula'),
      deltaSeconds: 0.5,
      driver: superFormulaDriver,
      elapsedSeconds: 40,
      lowGripConditions: false,
      overtakeSystem: 'ots' as const,
      phase: null,
      raceLap: 2,
      team: superFormulaTeam,
      track: superFormulaTrack,
      trackGrip: 1,
      weather: 'clear' as const,
    }
    const baseline = calculateCarTelemetry(telemetryOptions)

    expect(
      f1EnvelopeFor({
        grainingPercent: 100,
        overheatingPercent: 100,
        wearPercent: 100,
      }).gripMultiplier,
    ).toBeLessThan(1)

    const afterF1EnvelopeEvaluation = calculateCarTelemetry(telemetryOptions)

    expect(afterF1EnvelopeEvaluation).toEqual(baseline)
    expect(afterF1EnvelopeEvaluation.runtimeSystems.kind).toBe(
      'super-formula',
    )
    expect(afterF1EnvelopeEvaluation.tireTemperatureC).toBeNull()
    expect('tires' in afterF1EnvelopeEvaluation.runtimeSystems).toBe(false)
  })
})
