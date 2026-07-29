import { describe, expect, it } from 'vitest'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import type {
  CarSnapshot,
  Driver,
  Team,
  TrackDefinition,
} from '../types'
import { idealSetupForTrack } from './engineering'
import {
  categoryHasHybridEnergyStore,
  categoryPhysicsFor,
} from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import {
  progressForProfileSpeed,
  speedForProfileTravelKph,
} from './trackDynamics'

type CategoryLapTrace = {
  lapTimeSeconds: number
  maximumSpeedKph: number
}

function fastestEntrantFor(seriesId: Parameters<typeof categoryPhysicsFor>[0]) {
  const series = seriesPackageById.get(seriesId ?? 'f1-custom')!
  const driver = [...series.drivers].sort(
    (left, right) =>
      (right.performanceSource?.overall ?? 0) -
      (left.performanceSource?.overall ?? 0),
  )[0]
  const team = series.teams.find((candidate) => candidate.id === driver.teamId)!

  return { driver, team }
}

function traceQualifyingLap(options: {
  driver: Driver
  seriesId: Parameters<typeof categoryPhysicsFor>[0]
  team: Team
  track: TrackDefinition
}): CategoryLapTrace {
  const { driver, seriesId, team, track } = options
  const categoryPhysics = categoryPhysicsFor(seriesId)
  const snapshot = createInitialRace({
    drivers: [driver],
    overtakeSystem:
      seriesId === 'super-formula'
        ? 'ots'
        : seriesId === 'f1-custom'
          ? 'active-aero'
          : 'drs',
    seed: `category-lap:${seriesId}:${track.id}`,
    seriesId,
    teams: [team],
    track,
    weekendStage: 'qualifying',
  })
  let car: CarSnapshot = {
    ...snapshot.cars[0],
    fuelLoadKg: 8,
    gapToAhead: 10,
    pitPhase: 'none',
    pitUntilSeconds: null,
    progress: 0.82,
    speedKph: 180,
    status: 'running',
    timedRunPhase: 'out-lap',
    totalDistance: 0.82,
  }
  const deltaSeconds = 0.1
  let elapsedSeconds = 0
  let lapStartedAtSeconds: number | null = null
  let maximumSpeedKph = 0

  for (let step = 0; step < 4_000; step += 1) {
    const telemetry = calculateCarTelemetry({
      car,
      categoryPhysics,
      deltaSeconds,
      driver,
      elapsedSeconds,
      lowGripConditions: false,
      phase: null,
      raceLap: Math.max(1, Math.floor(car.totalDistance)),
      sessionType: 'limited-time',
      setup: idealSetupForTrack(track),
      team,
      timedRunPhase: car.timedRunPhase,
      track,
      trackGrip: 1,
      weather: 'clear',
    })
    const progressDelta = progressForProfileSpeed(
      track,
      car.progress,
      telemetry.speedKph,
      deltaSeconds,
    )
    const nextTotalDistance = car.totalDistance + progressDelta
    const crossedTimingLine =
      Math.floor(nextTotalDistance) > Math.floor(car.totalDistance)

    elapsedSeconds += deltaSeconds
    if (lapStartedAtSeconds !== null) {
      maximumSpeedKph = Math.max(maximumSpeedKph, telemetry.speedKph)
    }

    if (crossedTimingLine && lapStartedAtSeconds === null) {
      lapStartedAtSeconds = elapsedSeconds
    } else if (crossedTimingLine && lapStartedAtSeconds !== null) {
      return {
        lapTimeSeconds: elapsedSeconds - lapStartedAtSeconds,
        maximumSpeedKph,
      }
    }

    car = {
      ...car,
      ...telemetry,
      progress: (car.progress + progressDelta) % 1,
      timedRunPhase:
        lapStartedAtSeconds === null ? 'out-lap' : 'attack-lap',
      totalDistance: nextTotalDistance,
    }
  }

  throw new Error(
    `Category lap did not finish: ${seriesId} ${track.id} ` +
      `distance=${car.totalDistance.toFixed(4)} progress=${car.progress.toFixed(4)} ` +
      `speed=${car.speedKph} brake=${car.brakePercent} throttle=${car.throttlePercent}`,
  )
}

describe('category-specific physical models', () => {
  it('uses distinct published vehicle fundamentals', () => {
    const f1 = categoryPhysicsFor('f1-custom')
    const f2 = categoryPhysicsFor('f2')
    const f3 = categoryPhysicsFor('f3')
    const superFormula = categoryPhysicsFor('super-formula')

    expect(f1.minimumMassKg).toBe(768)
    expect(f1.hybridDeploymentPowerLimitKw).toBe(350)
    expect(f1.gearCount).toBe(8)
    expect(categoryHasHybridEnergyStore(f1)).toBe(true)

    expect(f2.minimumMassKg).toBe(795)
    expect(f2.combustionPowerKw).toBeCloseTo(456.3, 1)
    expect(f2.gearCount).toBe(6)
    expect(categoryHasHybridEnergyStore(f2)).toBe(false)

    expect(f3.minimumMassKg).toBe(699)
    expect(f3.combustionPowerKw).toBeCloseTo(279.4, 1)
    expect(f3.gearCount).toBe(6)
    expect(categoryHasHybridEnergyStore(f3)).toBe(false)

    expect(superFormula.minimumMassKg).toBe(670)
    expect(superFormula.combustionPowerKw).toBe(405)
    expect(superFormula.overtakeBoostPowerKw).toBe(37)
    expect(categoryHasHybridEnergyStore(superFormula)).toBe(false)
  })

  it('keeps F1 faster than Super Formula at Fuji through the same physical path', () => {
    const fuji = supportSeriesTracks.find((track) => track.id === 'fuji-sf')!
    const f1Entrant = fastestEntrantFor('f1-custom')
    const superFormulaEntrant = fastestEntrantFor('super-formula')
    const superFormulaTrack =
      seriesPackageById
        .get('super-formula')!
        .tracks.find((track) => track.id === 'fuji-sf') ?? fuji
    const f1 = traceQualifyingLap({
      ...f1Entrant,
      seriesId: 'f1-custom',
      track: fuji,
    })
    const superFormula = traceQualifyingLap({
      ...superFormulaEntrant,
      seriesId: 'super-formula',
      track: superFormulaTrack,
    })

    expect(f1.lapTimeSeconds).toBeLessThan(superFormula.lapTimeSeconds)
  })

  it('keeps displayed overall out of physics and lets category hardware decide', () => {
    const fuji = supportSeriesTracks.find((track) => track.id === 'fuji-sf')!
    const f1Series = seriesPackageById.get('f1-custom')!
    const referenceDriver = fastestEntrantFor('f1-custom').driver
    const slowestF1Team = [...f1Series.teams].sort(
      (left, right) =>
        (left.performanceSource?.overall ?? 0) -
        (right.performanceSource?.overall ?? 0),
    )[0]
    const traceFor = (seriesId: 'f1-custom' | 'f2', team: Team) =>
      traceQualifyingLap({
        driver: {
          ...referenceDriver,
          id: `${referenceDriver.id}:${seriesId}`,
          teamId: team.id,
        },
        seriesId,
        team,
        track: fuji,
      })
    const slowestF1 = traceFor('f1-custom', slowestF1Team)
    const relabelledF1 = traceFor('f1-custom', {
      ...slowestF1Team,
      performanceSource: {
        ...slowestF1Team.performanceSource!,
        overall: 100,
      },
    })
    const sameMachineWithF2Hardware = traceFor('f2', slowestF1Team)

    expect(relabelledF1.lapTimeSeconds).toBeCloseTo(
      slowestF1.lapTimeSeconds,
      10,
    )
    expect(relabelledF1.maximumSpeedKph).toBeCloseTo(
      slowestF1.maximumSpeedKph,
      10,
    )
    expect(
      Math.abs(
        sameMachineWithF2Hardware.lapTimeSeconds -
          slowestF1.lapTimeSeconds,
      ),
    ).toBeGreaterThan(0.5)
  })

  it('finishes representative category laps near their track baselines', () => {
    const representativeTracks = {
      f1: tracks.find((track) => track.id === 'suzuka-approx')!,
      f2: seriesPackageById
        .get('f2')!
        .tracks.find((track) => track.id === 'monza-approx')!,
      f3: seriesPackageById
        .get('f3')!
        .tracks.find((track) => track.id === 'monza-approx')!,
      superFormula: seriesPackageById
        .get('super-formula')!
        .tracks.find((track) => track.id === 'fuji-sf')!,
    }
    const cases = [
      ['f1-custom', representativeTracks.f1],
      ['f2', representativeTracks.f2],
      ['f3', representativeTracks.f3],
      ['super-formula', representativeTracks.superFormula],
    ] as const

    for (const [seriesId, track] of cases) {
      const entrant = fastestEntrantFor(seriesId)
      const trace = traceQualifyingLap({
        ...entrant,
        seriesId,
        track,
      })

      expect(
        trace.lapTimeSeconds / track.baseLapTime,
        `${seriesId} ${track.id}: ${trace.lapTimeSeconds.toFixed(3)} s`,
      ).toBeGreaterThanOrEqual(0.94)
      expect(
        trace.lapTimeSeconds / track.baseLapTime,
        `${seriesId} ${track.id}: ${trace.lapTimeSeconds.toFixed(3)} s`,
      ).toBeLessThanOrEqual(1.1)
    }
  })

  it('keeps every native circuit inside its calibrated category envelope', () => {
    const bounds = {
      'f1-custom': [0.94, 1.08],
      f2: [0.92, 1.07],
      f3: [0.92, 1.11],
      'super-formula': [0.97, 1.06],
    } as const

    for (const seriesId of [
      'f1-custom',
      'f2',
      'f3',
      'super-formula',
    ] as const) {
      const series = seriesPackageById.get(seriesId)!
      const entrant = fastestEntrantFor(seriesId)

      for (const track of series.tracks) {
        const trace = traceQualifyingLap({
          ...entrant,
          seriesId,
          track,
        })
        const ratio = trace.lapTimeSeconds / track.baseLapTime

        expect(
          ratio,
          `${seriesId} ${track.id}: ${trace.lapTimeSeconds.toFixed(3)} s`,
        ).toBeGreaterThanOrEqual(bounds[seriesId][0])
        expect(
          ratio,
          `${seriesId} ${track.id}: ${trace.lapTimeSeconds.toFixed(3)} s`,
        ).toBeLessThanOrEqual(bounds[seriesId][1])
      }
    }
  }, 30_000)

  it('tracks official 2026 feeder-series pole benchmarks', () => {
    const officialBenchmarks = [
      {
        seriesId: 'f2',
        trackId: 'albert-park-approx',
        poleSeconds: 88.695,
        toleranceSeconds: 3,
      },
      {
        seriesId: 'f2',
        trackId: 'barcelona-approx',
        poleSeconds: 84.81,
        toleranceSeconds: 3,
      },
      {
        seriesId: 'f3',
        trackId: 'albert-park-approx',
        poleSeconds: 94.187,
        toleranceSeconds: 4.5,
      },
      {
        seriesId: 'f3',
        trackId: 'barcelona-approx',
        poleSeconds: 88.263,
        toleranceSeconds: 3,
      },
    ] as const

    for (const benchmark of officialBenchmarks) {
      const series = seriesPackageById.get(benchmark.seriesId)!
      const track = series.tracks.find(
        (candidate) => candidate.id === benchmark.trackId,
      )!
      const trace = traceQualifyingLap({
        ...fastestEntrantFor(benchmark.seriesId),
        seriesId: benchmark.seriesId,
        track,
      })

      expect(
        Math.abs(trace.lapTimeSeconds - benchmark.poleSeconds),
        `${benchmark.seriesId} ${track.id}: ${trace.lapTimeSeconds.toFixed(3)} s`,
      ).toBeLessThanOrEqual(benchmark.toleranceSeconds)
    }
  })

  it('produces category-specific straight-line speed ranges', () => {
    const cases = [
      {
        maximumKph: 430,
        minimumKph: 395,
        seriesId: 'f1-custom',
        trackId: 'las-vegas-approx',
      },
      {
        maximumKph: 342,
        minimumKph: 320,
        seriesId: 'f2',
        trackId: 'monza-approx',
      },
      {
        maximumKph: 310,
        minimumKph: 290,
        seriesId: 'f3',
        trackId: 'monza-approx',
      },
      {
        maximumKph: 325,
        minimumKph: 295,
        seriesId: 'super-formula',
        trackId: 'fuji-sf',
      },
    ] as const

    for (const testCase of cases) {
      const series = seriesPackageById.get(testCase.seriesId)!
      const track = series.tracks.find(
        (candidate) => candidate.id === testCase.trackId,
      )!
      const trace = traceQualifyingLap({
        ...fastestEntrantFor(testCase.seriesId),
        seriesId: testCase.seriesId,
        track,
      })

      expect(trace.maximumSpeedKph).toBeGreaterThanOrEqual(
        testCase.minimumKph,
      )
      expect(trace.maximumSpeedKph).toBeLessThanOrEqual(testCase.maximumKph)
    }
  })

  it('round-trips displayed speed through actual centerline distance', () => {
    const uniqueTracks = new Map(
      [...tracks, ...supportSeriesTracks].map((track) => [track.id, track]),
    )

    for (const track of uniqueTracks.values()) {
      const startProgress = 0.973
      const speedKph = 273.4
      const deltaSeconds = 0.25
      const progressDelta = progressForProfileSpeed(
        track,
        startProgress,
        speedKph,
        deltaSeconds,
      )
      const reconstructedSpeedKph = speedForProfileTravelKph(
        track,
        startProgress,
        startProgress + progressDelta,
        deltaSeconds,
      )

      expect(
        reconstructedSpeedKph,
        `${track.id}: map motion must equal timing speed`,
      ).toBeCloseTo(speedKph, 5)
    }
  })
})
