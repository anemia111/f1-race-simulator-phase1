import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { DriverDecisionPath } from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

describe('Super Formula OTS', () => {
  it('fails closed without a verified event OTS pack and clears legacy allocation state', () => {
    const series = seriesPackageById.get('super-formula')!
    const track = series.tracks[0]
    const team = series.teams[0]
    const driver = series.drivers.find((candidate) => candidate.teamId === team.id)!
    const snapshot = createInitialRace({
      drivers: series.drivers,
      overtakeSystem: 'ots',
      seed: 'sf-ots-test',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: series.teams,
      track,
      weekendStage: 'race',
    })
    const straightProgress = Array.from({ length: 1_000 }, (_, index) => index / 1_000)
      .map((progress) => ({ progress, dynamics: trackDynamicsAt(track, progress) }))
      .sort((left, right) => right.dynamics.straightness - left.dynamics.straightness)[0]
      .progress
    const baseCar = {
      ...snapshot.cars.find((car) => car.driverId === driver.id)!,
      battlePhase: 'attacking' as const,
      gapToAhead: 1.1,
      position: 2,
      progress: straightProgress,
      racePaceMode: 'push' as const,
      speedKph: 250,
      status: 'running' as const,
    }
    const common = {
      categoryPhysics: categoryPhysicsFor('super-formula'),
      deltaSeconds: 1,
      driver,
      elapsedSeconds: 120,
      lowGripConditions: false,
      overtakeSystem: 'ots' as const,
      phase: null,
      raceControlOvertakeEnabled: true,
      raceLap: 2,
      seriesId: 'super-formula' as const,
      sessionType: 'race-distance' as const,
      team,
      track,
      trackGrip: 1,
      vehicleEraId: 'sf-2026' as const,
      weather: 'clear' as const,
    }
    const legacy = calculateCarTelemetry({
      ...common,
      car: baseCar,
      driverDecisionPath: 'legacy-direct',
    })
    const category = calculateCarTelemetry({
      ...common,
      car: baseCar,
      driverDecisionPath: 'category-agent-v1',
    })
    const defaulted = calculateCarTelemetry({ ...common, car: baseCar })
    const shortCircuited = calculateCarTelemetry({
      ...common,
      car: baseCar,
      driverDecisionPath: 'invalid-after-unavailable' as DriverDecisionPath,
    })

    expect(legacy.overtakeStatus).toBe('disabled')
    expect(category).toEqual(legacy)
    expect(defaulted).toEqual(category)
    expect(shortCircuited).toEqual(category)
    expect(category.runtimeSystems.kind).toBe('super-formula')
    expect(category).not.toHaveProperty('otsRemainingSeconds')
    expect(category).not.toHaveProperty('otsCooldownUntilSeconds')
    expect(category).not.toHaveProperty('activeAeroMode')
  })

  it('does not retain a historic OTS value during low-grip control', () => {
    const series = seriesPackageById.get('super-formula')!
    const track = series.tracks[0]
    const team = series.teams[0]
    const driver = series.drivers[0]
    const car = {
      ...createInitialRace({
        drivers: series.drivers,
        overtakeSystem: 'ots' as const,
        seed: 'sf-ots-low-grip',
        seriesId: 'super-formula',
        teams: series.teams,
        track,
        sessionRaceLapsOverride: 25,
      }).cars[0],
      battlePhase: 'attacking' as const,
      gapToAhead: 0.8,
      progress: 0.5,
      racePaceMode: 'push' as const,
      speedKph: 250,
      status: 'running' as const,
    }
    const result = calculateCarTelemetry({
      car,
      categoryPhysics: categoryPhysicsFor('super-formula'),
      deltaSeconds: 2,
      driver,
      elapsedSeconds: 200,
      lowGripConditions: true,
      overtakeSystem: 'ots',
      phase: null,
      raceControlOvertakeEnabled: true,
      raceLap: 3,
      team,
      track,
      trackGrip: 0.8,
      weather: 'light-rain',
    })

    expect(result.overtakeStatus).toBe('disabled')
    expect(result.runtimeSystems.kind).toBe('super-formula')
    expect(result).not.toHaveProperty('otsRemainingSeconds')
    expect(result).not.toHaveProperty('otsCooldownUntilSeconds')
  })

  it('never dispatches the SF OTS request seam for an F1 runtime', () => {
    const series = seriesPackageById.get('f1-custom')!
    const track = series.tracks[0]
    const team = series.teams[0]
    const driver = series.drivers.find(
      (candidate) => candidate.teamId === team.id,
    )!
    const car = createInitialRace({
      drivers: series.drivers,
      overtakeSystem: 'active-aero',
      seed: 'f1-no-sf-ots-intent',
      seriesId: 'f1-custom',
      teams: series.teams,
      track,
      vehicleEraId: 'f1-2026-current',
    }).cars.find((candidate) => candidate.driverId === driver.id)!

    const result = calculateCarTelemetry({
      car,
      categoryPhysics: categoryPhysicsFor('f1-custom'),
      deltaSeconds: 0.5,
      driver,
      driverDecisionPath: 'category-agent-v1',
      elapsedSeconds: 30,
      lowGripConditions: false,
      overtakeSystem: 'ots',
      phase: null,
      raceLap: 1,
      seriesId: 'f1-custom',
      team,
      track,
      trackGrip: 1,
      vehicleEraId: 'f1-2026-current',
      weather: 'clear',
    })

    expect(result.overtakeStatus).toBe('disabled')
    expect(result.runtimeSystems.kind).toBe('f1')
  })
})
