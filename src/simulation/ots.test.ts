import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import {
  advanceRace,
  createInitialRace,
  skipFormationLap,
} from './race'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

describe('Super Formula OTS', () => {
  it('uses a finite 200-second race allocation as power, not DRS eligibility', () => {
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
    const saving = calculateCarTelemetry({
      ...common,
      car: {
        ...baseCar,
        battlePhase: 'single-file',
        gapToAhead: 4,
        racePaceMode: 'standard',
      },
    })

    expect(active.overtakeStatus).toBe('active')
    expect(active.otsRemainingSeconds).toBeCloseTo(199, 6)
    expect(saving.overtakeStatus).toBe('available')
    expect(saving.otsRemainingSeconds).toBe(200)
    expect(active.speedKph).toBeGreaterThan(saving.speedKph)
    expect(active.activeAeroMode).toBe('corner')
  })

  it('enables OTS at lights out so it can be used on the opening lap', () => {
    const series = seriesPackageById.get('super-formula')!
    const config = {
      drivers: series.drivers,
      overtakeActivation: series.rules.overtakeActivation,
      overtakeSystem: series.rules.overtakeSystem,
      seed: 'sf-opening-lap-ots',
      seriesId: series.id,
      teams: series.teams,
      track: { ...series.tracks[0], rainProbability: 0 },
      weekendStage: 'race' as const,
    }
    let snapshot = createInitialRace(config)

    expect(snapshot.overtakeEnabled).toBe(false)
    snapshot = skipFormationLap(snapshot, config)
    snapshot = advanceRace(snapshot, 8, config)
    snapshot = advanceRace(snapshot, 5, config)

    expect(snapshot.startProcedure).toBe('racing')
    expect(snapshot.overtakeEnabled).toBe(true)
    expect(snapshot.overtakeEnableAtLeaderDistance).toBeNull()
  })

  it('holds support-series DRS until one lap and the next detection line', () => {
    const series = seriesPackageById.get('f2')!
    const track = series.tracks[0]
    const snapshot = createInitialRace({
      drivers: series.drivers,
      overtakeActivation: series.rules.overtakeActivation,
      overtakeSystem: series.rules.overtakeSystem,
      seed: 'f2-drs-after-one-lap',
      seriesId: series.id,
      teams: series.teams,
      track,
      weekendStage: 'sprint',
    })
    const detectionProgress =
      track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2

    expect(snapshot.overtakeEnabled).toBe(false)
    expect(snapshot.overtakeEnableAtLeaderDistance).toBeCloseTo(
      2 + detectionProgress,
      6,
    )
  })

  it('disables OTS without consuming time under low-grip control', () => {
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
    expect(result.otsRemainingSeconds).toBe(73)
  })
})
