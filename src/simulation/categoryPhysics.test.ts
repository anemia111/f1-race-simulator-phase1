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
    expect(f1.topGearDesignSpeedKph).toBe(402)
    expect(f1.drivetrainEfficiency).toBeGreaterThan(0.9)
    expect(f1.drivetrainEfficiency).toBeLessThan(1)
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

  it('does not let baseLapTime force representative category laps', () => {
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
      const changedObservation = traceQualifyingLap({
        ...entrant,
        seriesId,
        track: {
          ...track,
          baseLapTime: track.baseLapTime * 1.7,
        },
      })

      expect(changedObservation.lapTimeSeconds).toBeCloseTo(
        trace.lapTimeSeconds,
        10,
      )
      expect(changedObservation.maximumSpeedKph).toBeCloseTo(
        trace.maximumSpeedKph,
        10,
      )
    }
  })

  it('finishes every native circuit with finite category-bounded motion', () => {
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
        expect(Number.isFinite(trace.lapTimeSeconds)).toBe(true)
        expect(Number.isFinite(trace.maximumSpeedKph)).toBe(true)
        expect(trace.lapTimeSeconds).toBeGreaterThan(20)
        expect(trace.lapTimeSeconds).toBeLessThan(300)
        expect(trace.maximumSpeedKph).toBeGreaterThan(80)
        expect(trace.maximumSpeedKph).toBeLessThanOrEqual(
          categoryPhysicsFor(seriesId).topGearDesignSpeedKph * 1.02,
        )
      }
    }
  }, 30_000)

  it('keeps F2 ahead of F3 on their shared circuits', () => {
    for (const trackId of ['albert-park-approx', 'barcelona-approx']) {
      const f2Track = seriesPackageById
        .get('f2')!
        .tracks.find((candidate) => candidate.id === trackId)!
      const f3Track = seriesPackageById
        .get('f3')!
        .tracks.find((candidate) => candidate.id === trackId)!
      const f2 = traceQualifyingLap({
        ...fastestEntrantFor('f2'),
        seriesId: 'f2',
        track: f2Track,
      })
      const f3 = traceQualifyingLap({
        ...fastestEntrantFor('f3'),
        seriesId: 'f3',
        track: f3Track,
      })

      expect(f2.lapTimeSeconds).toBeLessThan(f3.lapTimeSeconds)
    }
  })

  it('reaches each category top-gear design region without overspeed', () => {
    const cases = [
      {
        seriesId: 'f1-custom',
        trackId: 'las-vegas-approx',
      },
      {
        seriesId: 'f2',
        trackId: 'monza-approx',
      },
      {
        seriesId: 'f3',
        trackId: 'monza-approx',
      },
      {
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
      const designSpeedKph =
        categoryPhysicsFor(testCase.seriesId).topGearDesignSpeedKph

      expect(trace.maximumSpeedKph).toBeGreaterThanOrEqual(
        designSpeedKph * 0.82,
      )
      expect(trace.maximumSpeedKph).toBeLessThanOrEqual(
        designSpeedKph * 1.02,
      )
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
