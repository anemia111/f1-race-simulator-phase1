import { describe, expect, it } from 'vitest'
import {
  driverPool2026,
  seriesPackages,
} from '../series/seriesRegistry'
import type { SeriesId, SeriesPackage } from '../series/types'
import {
  advanceRace,
  createInitialRace,
  skipFormationLap,
} from '../simulation/race'
import type { RaceConfig, RaceSnapshot, TireCompound } from '../types'
import { buildFreeModeRaceConfig } from './freeModeRegistry'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
} from './types'

const seriesById = new Map<SeriesId, SeriesPackage>(
  seriesPackages.map((series) => [series.id, series]),
)
const context: FreeModeBuildContext = {
  driverPool: driverPool2026,
  seriesById,
}

function configurationFor({
  categoryId,
  carCount,
  raceLaps = 1,
  sessionKind = 'race',
  trackId,
}: {
  categoryId: SeriesId
  carCount: number
  raceLaps?: number
  sessionKind?: FreeModeConfiguration['sessionKind']
  trackId: string
}): FreeModeConfiguration {
  const series = seriesById.get(categoryId)!

  return {
    categoryId,
    entrants: driverPool2026.slice(0, carCount).map((driver, index) => ({
      carNumber: index + 1,
      driverId: driver.id,
      id: `integration-entry-${index + 1}`,
      sourceTeamId: series.teams[index % series.teams.length].id,
    })),
    equalCars: false,
    gridMode: 'manual',
    practiceDurationMinutes: 5,
    raceLaps,
    seed: `free-integration:${categoryId}:${trackId}:${carCount}:${sessionKind}`,
    sessionKind,
    trackId,
    version: 1,
    weatherMode: 'clear',
  }
}

function startRace(config: RaceConfig) {
  let snapshot = skipFormationLap(createInitialRace(config), config)
  snapshot = advanceRace(snapshot, 8, config)
  return advanceRace(snapshot, 5, config)
}

function advanceUntil(
  snapshot: RaceSnapshot,
  config: RaceConfig,
  predicate: (candidate: RaceSnapshot) => boolean,
  maximumSteps: number,
  stepSeconds = 3,
  pitRequests?: Map<string, TireCompound>,
) {
  for (
    let step = 0;
    step < maximumSteps && !predicate(snapshot);
    step += 1
  ) {
    snapshot = advanceRace(snapshot, stepSeconds, config, pitRequests)
  }

  return snapshot
}

function runSessionToFinish(config: RaceConfig, maximumSteps: number) {
  let snapshot =
    config.weekendStage === 'race'
      ? startRace(config)
      : createInitialRace(config)

  snapshot = advanceUntil(
    snapshot,
    config,
    (candidate) => candidate.sessionStatus === 'finished',
    maximumSteps,
  )
  return snapshot
}

describe('Free Mode runtime integration', () => {
  it.each([
    ['practice', 180],
    ['qualifying', 700],
    ['race', 300],
  ] as const)('finishes a one-car %s session', (sessionKind, maximumSteps) => {
    const configuration = configurationFor({
      carCount: 1,
      categoryId: 'f1-custom',
      sessionKind,
      trackId: 'suzuka-approx',
    })
    const config = buildFreeModeRaceConfig(configuration, context)
    const snapshot = runSessionToFinish(config, maximumSteps)

    expect(snapshot.cars).toHaveLength(1)
    expect(snapshot.sessionStatus).toBe('finished')
  })

  it('finishes a 30-car F3 session on an F1 circuit', () => {
    const config = buildFreeModeRaceConfig(
      configurationFor({
        carCount: 30,
        categoryId: 'f3',
        sessionKind: 'practice',
        trackId: 'suzuka-approx',
      }),
      context,
    )
    const snapshot = runSessionToFinish(config, 180)

    expect(snapshot.cars).toHaveLength(30)
    expect(snapshot.sessionStatus).toBe('finished')
  })

  it('finishes a 40-car F1 race on a SUPER FORMULA circuit', () => {
    const config = buildFreeModeRaceConfig(
      configurationFor({
        carCount: 40,
        categoryId: 'f1-custom',
        trackId: 'fuji-sf',
      }),
      context,
    )
    const snapshot = runSessionToFinish(config, 500)

    expect(snapshot.cars).toHaveLength(40)
    expect(snapshot.sessionStatus).toBe('finished')
  })

  it.each([
    ['f1-custom', 40, 'albert-park-approx'],
    ['f1-custom', 40, 'fuji-sf'],
    ['super-formula', 40, 'albert-park-approx'],
    ['super-formula', 40, 'fuji-sf'],
    ['f2', 30, 'albert-park-approx'],
    ['f2', 30, 'fuji-sf'],
    ['f3', 30, 'albert-park-approx'],
    ['f3', 30, 'fuji-sf'],
  ] as const)(
    'advances %s machinery with %i cars on %s',
    (categoryId, carCount, trackId) => {
      const config = buildFreeModeRaceConfig(
        configurationFor({ carCount, categoryId, trackId }),
        context,
      )
      const initial = startRace(config)
      const advanced = advanceRace(initial, 3, config)

      expect(advanced.cars).toHaveLength(carCount)
      expect(
        advanced.cars.some(
          (car, index) =>
            car.totalDistance !== initial.cars[index].totalDistance,
        ),
      ).toBe(true)
    },
  )

  it('completes SC, VSC and red-flag procedures with 40 cars', () => {
    const config = buildFreeModeRaceConfig(
      configurationFor({
        carCount: 40,
        categoryId: 'f1-custom',
        raceLaps: 5,
        trackId: 'suzuka-approx',
      }),
      context,
    )
    const base = startRace(config)

    let safetyCar = advanceRace(
      {
        ...base,
        flag: 'sc',
        flagLabel: 'SC',
        flagPhase: {
          endMessage: 'Safety Car in.',
          endSeconds: base.elapsedSeconds + 1,
          flag: 'sc',
          id: 'free-40-sc',
          lappedCarsMayOvertakeAtSeconds: null,
          sector: 0,
          startMessage: 'Safety Car deployed.',
          startSeconds: base.elapsedSeconds,
        },
        overtakeEnabled: false,
        overtakeEnableAtLeaderDistance: null,
        overtakeEnableTargetsByDriver: null,
      },
      2,
      config,
    )
    safetyCar = advanceUntil(
      safetyCar,
      config,
      (snapshot) => snapshot.flagPhase?.flag !== 'sc',
      500,
      2,
    )
    expect(safetyCar.flagPhase?.flag).not.toBe('sc')

    let vsc = advanceRace(
      {
        ...base,
        flag: 'vsc',
        flagLabel: 'VSC',
        flagPhase: {
          endMessage: 'VSC ending.',
          endSeconds: base.elapsedSeconds + 1,
          flag: 'vsc',
          id: 'free-40-vsc',
          sector: 0,
          startMessage: 'Virtual Safety Car deployed.',
          startSeconds: base.elapsedSeconds,
        },
        overtakeEnabled: false,
      },
      2,
      config,
    )
    vsc = advanceUntil(
      vsc,
      config,
      (snapshot) => snapshot.flagPhase?.flag !== 'vsc',
      20,
      1,
    )
    expect(vsc.flagPhase?.flag).not.toBe('vsc')

    let red = advanceRace(
      {
        ...base,
        flag: 'red',
        flagLabel: 'RED',
        flagPhase: {
          endMessage: 'Red flag lifted.',
          endSeconds: base.elapsedSeconds + 1,
          flag: 'red',
          id: 'free-40-red',
          sector: 1,
          startMessage: 'Red flag.',
          startSeconds: base.elapsedSeconds,
        },
      },
      2,
      config,
    )
    red = advanceUntil(
      red,
      config,
      (snapshot) => snapshot.restartProcedure === 'none',
      60,
      1,
    )
    expect(red.restartProcedure).toBe('none')
  }, 60_000)

  it('completes requested pit stops across a 40-car field', () => {
    const config = buildFreeModeRaceConfig(
      configurationFor({
        carCount: 40,
        categoryId: 'f1-custom',
        raceLaps: 10,
        trackId: 'fuji-sf',
      }),
      context,
    )
    let snapshot = startRace(config)
    const requests = new Map(
      snapshot.cars.map((car) => [car.driverId, 'M' as const]),
    )

    snapshot = advanceUntil(
      snapshot,
      config,
      (candidate) =>
        requests.size === 0 &&
        candidate.cars.every(
          (car) =>
            car.status === 'retired' ||
            (car.pitStops > 0 &&
              car.status === 'running' &&
              car.pitPhase === 'none'),
        ),
      1_200,
      3,
      requests,
    )

    expect(requests.size).toBe(0)
    expect(
      snapshot.cars.every(
        (car) =>
          car.status === 'retired' ||
          (car.pitStops > 0 &&
            car.status === 'running' &&
            car.pitPhase === 'none'),
      ),
    ).toBe(true)
  }, 60_000)
})
