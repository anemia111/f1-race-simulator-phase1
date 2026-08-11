import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
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
      overtakeActivation: series.rules.overtakeActivation,
      overtakeSystem: 'ots',
      seed: 'sf-ots-test',
      seriesId: 'super-formula',
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
      ersBatteryPercent: 100,
      gapToAhead: 1.1,
      otsRemainingSeconds: 200,
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
      sessionType: 'race-distance' as const,
      team,
      track,
      trackGrip: 1,
      weather: 'clear' as const,
    }
    const active = calculateCarTelemetry({ ...common, car: baseCar })

    expect(active.overtakeStatus).toBe('disabled')
    expect(active.otsRemainingSeconds).toBeUndefined()
    expect(active.otsCooldownUntilSeconds).toBeUndefined()
    expect(active.activeAeroMode).toBe('corner')
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
        teams: series.teams,
        track,
      }).cars[0],
      battlePhase: 'attacking' as const,
      gapToAhead: 0.8,
      otsRemainingSeconds: 73,
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
    expect(result.otsRemainingSeconds).toBeUndefined()
    expect(result.otsCooldownUntilSeconds).toBeUndefined()
  })
})
