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
  resolveF1MinimumMass,
  resolveMinimumVehicleMass,
  resolveOperationalVehicleMass,
} from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import {
  progressForProfileSpeed,
  speedForProfileTravelKph,
} from './trackDynamics'

/** Algebra fixture only; it is not an FIA C4.7 Nominal Tyre Mass observation. */
const TEST_FIXTURE_NOMINAL_TYRE_MASS_KG = 40

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
      seriesId === 'super-formula' ? 'ots' : 'active-aero',
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

describe('2026 minimum-mass authority', () => {
  it('uses the 3400 mm F1 wheelbase maximum', () => {
    expect(categoryPhysicsFor('f1-custom').wheelbaseM).toBe(3.4)
    expect(categoryPhysicsFor('f1-custom').wheelbaseM).toBeLessThanOrEqual(3.4)
  })

  it('uses 726 kg plus the named tyre input only in SQ and qualifying', () => {
    const nominalTyreMassFixtureKg = TEST_FIXTURE_NOMINAL_TYRE_MASS_KG

    for (const weekendStage of ['sprintQualifying', 'qualifying'] as const) {
      expect(
        resolveF1MinimumMass({
          nominalTyreMassKg: nominalTyreMassFixtureKg,
          weekendStage,
        }),
      ).toMatchObject({
        minimumMassKg: 726 + nominalTyreMassFixtureKg,
        nominalTyreMassKg: nominalTyreMassFixtureKg,
        regulationBaseMassKg: 726,
        status: 'resolved',
      })
    }
  })

  it('uses 724 kg plus the named tyre input in every other session', () => {
    const nominalTyreMassFixtureKg = TEST_FIXTURE_NOMINAL_TYRE_MASS_KG

    for (const weekendStage of [
      'fp1',
      'fp2',
      'fp3',
      'sprint',
      'qualifying2',
      'race',
      'race2',
    ] as const) {
      expect(
        resolveF1MinimumMass({
          nominalTyreMassKg: nominalTyreMassFixtureKg,
          weekendStage,
        }),
      ).toMatchObject({
        minimumMassKg: 724 + nominalTyreMassFixtureKg,
        regulationBaseMassKg: 724,
        status: 'resolved',
      })
    }
  })

  it('adds heat-hazard mass explicitly after base and tyre mass', () => {
    expect(
      resolveF1MinimumMass({
        heatHazardAddedMassKg: 5,
        nominalTyreMassKg: TEST_FIXTURE_NOMINAL_TYRE_MASS_KG,
        weekendStage: 'race',
      }),
    ).toMatchObject({
      heatHazardAddedMassKg: 5,
      minimumMassKg: 769,
      regulationBaseMassKg: 724,
      status: 'resolved',
    })
  })

  it('returns unavailable rather than deriving a nominal tyre mass', () => {
    expect(
      resolveF1MinimumMass({
        heatHazardAddedMassKg: 2,
        nominalTyreMassKg: null,
        weekendStage: 'qualifying',
      }),
    ).toEqual({
      heatHazardAddedMassKg: 2,
      minimumMassKg: null,
      nominalTyreMassKg: null,
      reason: 'nominal-tyre-mass-unavailable',
      regulationBaseMassKg: 726,
      seriesId: 'f1-custom',
      sourceId: 'fia-f1-2026-technical-c20',
      status: 'unavailable',
      weekendStage: 'qualifying',
    })
  })

  it('requires the whole-kilogram C4.7 input instead of accepting a guess', () => {
    expect(() =>
      resolveF1MinimumMass({
        nominalTyreMassKg: 40.5,
        weekendStage: 'race',
      }),
    ).toThrow(/C4\.7 whole-kilogram value/)
  })

  it('keeps the fixed Super Formula mass rule intact', () => {
    expect(
      resolveMinimumVehicleMass({
        seriesId: 'super-formula',
        weekendStage: 'race',
      }),
    ).toMatchObject({
      heatHazardAddedMassKg: 0,
      minimumMassKg: 670,
      regulationBaseMassKg: 670,
      seriesId: 'super-formula',
      status: 'resolved',
    })
  })

  it('uses a typed non-regulatory fallback and adds heat mass once', () => {
    expect(
      resolveOperationalVehicleMass({
        f1NominalTyreMassKg: null,
        heatHazardAddedMassKg: 5,
        physics: categoryPhysicsFor('f1-custom'),
        weekendStage: 'qualifying',
      }),
    ).toMatchObject({
      basis: 'non-regulatory-simulation-reference',
      minimumMassResolution: {
        heatHazardAddedMassKg: 5,
        minimumMassKg: null,
        reason: 'nominal-tyre-mass-unavailable',
        regulationBaseMassKg: 726,
      },
      operationalMassKg: 773,
      referenceMassKg: 768,
      status: 'resolved-non-regulatory-simulation-reference',
    })
    expect(
      'minimumMassKg' in categoryPhysicsFor('f1-custom'),
    ).toBe(false)
  })

  it('switches to the session minimum when a C4.7 input arrives', () => {
    const qualifying = resolveOperationalVehicleMass({
      f1NominalTyreMassKg: TEST_FIXTURE_NOMINAL_TYRE_MASS_KG,
      heatHazardAddedMassKg: 5,
      physics: categoryPhysicsFor('f1-custom'),
      weekendStage: 'qualifying',
    })
    const race = resolveOperationalVehicleMass({
      f1NominalTyreMassKg: TEST_FIXTURE_NOMINAL_TYRE_MASS_KG,
      heatHazardAddedMassKg: 5,
      physics: categoryPhysicsFor('f1-custom'),
      weekendStage: 'race',
    })

    expect(qualifying).toMatchObject({
      basis: 'regulatory-minimum',
      operationalMassKg: 771,
      status: 'resolved-regulatory-minimum',
    })
    expect(race).toMatchObject({
      basis: 'regulatory-minimum',
      operationalMassKg: 769,
      status: 'resolved-regulatory-minimum',
    })
    expect(qualifying.operationalMassKg - race.operationalMassKg).toBe(2)
  })
})

describe('category-specific physical models', () => {
  it('uses distinct published vehicle fundamentals', () => {
    const f1 = categoryPhysicsFor('f1-custom')
    const superFormula = categoryPhysicsFor('super-formula')

    expect(f1.minimumMassRule).toMatchObject({
      kind: 'f1-2026-session-base-plus-nominal-tyre-mass',
      otherSessionBaseKg: 724,
      qualifyingBaseKg: 726,
    })
    expect(f1.hybridDeploymentPowerLimitKw).toBe(350)
    expect(f1.gearCount).toBe(8)
    expect(f1.topGearDesignSpeedKph).toBe(402)
    expect(f1.drivetrainEfficiency).toBeGreaterThan(0.9)
    expect(f1.drivetrainEfficiency).toBeLessThan(1)
    expect(categoryHasHybridEnergyStore(f1)).toBe(true)

    expect(superFormula.minimumMassRule).toMatchObject({
      kind: 'fixed-minimum-mass',
      massKg: 670,
    })
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
    const traceFor = (
      seriesId: 'f1-custom' | 'super-formula',
      team: Team,
    ) =>
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
    const sameMachineWithSfHardware = traceFor(
      'super-formula',
      slowestF1Team,
    )

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
        sameMachineWithSfHardware.lapTimeSeconds -
          slowestF1.lapTimeSeconds,
      ),
    ).toBeGreaterThan(0.5)
  })

  it('does not let baseLapTime force representative category laps', () => {
    const representativeTracks = {
      f1: tracks.find((track) => track.id === 'suzuka-approx')!,
      superFormula: seriesPackageById
        .get('super-formula')!
        .tracks.find((track) => track.id === 'fuji-sf')!,
    }
    const cases = [
      ['f1-custom', representativeTracks.f1],
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
    for (const seriesId of ['f1-custom', 'super-formula'] as const) {
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

  it('reaches each category top-gear design region without overspeed', () => {
    const cases = [
      {
        seriesId: 'f1-custom',
        trackId: 'las-vegas-approx',
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
