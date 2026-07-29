import { describe, expect, it } from 'vitest'
import {
  driverPool2026,
  seriesPackageById,
  seriesPackages,
} from '../series/seriesRegistry'
import { createInitialRace } from '../simulation/race'
import type { SeriesId, SeriesPackage } from '../series/types'
import type { Driver } from '../types'
import {
  buildFreeModeQualifyingRules,
  buildFreeModeRaceConfig,
  buildFreeModeRuntime,
  createDefaultFreeModeConfiguration,
  createEntrantsFromCategoryGrid,
  freeModeTrackOptions,
} from './freeModeRegistry'
import {
  FREE_MODE_MAX_CARS,
  validateFreeModeConfiguration,
} from './freeModeValidation'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModeEntrant,
  FreeModeQualifyingResult,
} from './types'

const seriesById = new Map<SeriesId, SeriesPackage>(
  seriesPackages.map((series) => [series.id, series]),
)
const driverOverridesById = new Map<string, Driver>(
  seriesPackages.flatMap((series) =>
    series.drivers.map((driver) => [driver.id, driver] as const),
  ),
)

const context = (
  qualifyingResult: FreeModeQualifyingResult | null = null,
): FreeModeBuildContext => ({
  driverOverridesById,
  driverPool: driverPool2026,
  qualifyingResult,
  seriesById,
})

const entrantsFor = (
  categoryId: SeriesId,
  count: number,
): FreeModeEntrant[] => {
  const series = seriesById.get(categoryId)!

  return driverPool2026.slice(0, count).map((driver, index) => ({
    carNumber: index,
    driverId: driver.id,
    id: `entry-${index + 1}`,
    sourceTeamId: series.teams[index % series.teams.length].id,
  }))
}

const configurationFor = (
  categoryId: SeriesId,
  trackId: string,
  count: number,
): FreeModeConfiguration => ({
  categoryId,
  entrants: entrantsFor(categoryId, count),
  equalCars: false,
  gridMode: 'manual',
  practiceDurationMinutes: 60,
  raceLaps: 3,
  seed: 'free-mode-test',
  sessionKind: 'race',
  trackId,
  version: 1,
  weatherMode: 'clear',
})

describe('Free Mode registry and validation', () => {
  it('unifies every F1 and SUPER FORMULA track without duplicate IDs', () => {
    const options = freeModeTrackOptions(seriesById)
    const expectedIds = new Set([
      ...seriesPackageById.get('f1-custom')!.tracks.map((track) => track.id),
      ...seriesPackageById
        .get('super-formula')!
        .tracks.map((track) => track.id),
    ])

    expect(options).toHaveLength(expectedIds.size)
    expect(new Set(options.map((track) => track.id)).size).toBe(options.length)
    expect(options.find((track) => track.id === 'suzuka-approx')?.sources).toEqual([
      'F1',
      'SF',
    ])
    expect(options.some((track) => track.id === 'fuji-sf')).toBe(true)
  })

  it('loads all four vehicle categories and the complete 110-driver pool', () => {
    expect([...seriesById.keys()]).toEqual([
      'f1-custom',
      'f2',
      'f3',
      'super-formula',
    ])
    expect(driverPool2026).toHaveLength(110)
  })

  it.each(Array.from({ length: FREE_MODE_MAX_CARS }, (_, index) => index + 1))(
    'accepts a valid %i-car field',
    (count) => {
      const configuration = configurationFor(
        'f1-custom',
        'suzuka-approx',
        count,
      )

      expect(validateFreeModeConfiguration(configuration, context())).toEqual([])
    },
  )

  it('rejects zero and 41 cars', () => {
    const zero = configurationFor('f1-custom', 'suzuka-approx', 1)
    zero.entrants = []
    const fortyOne = configurationFor('f1-custom', 'suzuka-approx', 41)

    expect(
      validateFreeModeConfiguration(zero, context()).some(
        (issue) => issue.code === 'car-count',
      ),
    ).toBe(true)
    expect(fortyOne.entrants).toHaveLength(FREE_MODE_MAX_CARS + 1)
    expect(
      validateFreeModeConfiguration(fortyOne, context()).some(
        (issue) => issue.code === 'car-count',
      ),
    ).toBe(true)
  })

  it('allows duplicate vehicles but rejects duplicate people and numbers', () => {
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      2,
    )
    configuration.entrants[1].sourceTeamId =
      configuration.entrants[0].sourceTeamId

    expect(validateFreeModeConfiguration(configuration, context())).toEqual([])

    configuration.entrants[1].driverId =
      configuration.entrants[0].driverId
    configuration.entrants[1].carNumber =
      configuration.entrants[0].carNumber
    const issues = validateFreeModeConfiguration(configuration, context())

    expect(issues.some((issue) => issue.code === 'duplicate-driver')).toBe(true)
    expect(
      issues.some((issue) => issue.code === 'duplicate-car-number'),
    ).toBe(true)
  })

  it('rejects unknown drivers, vehicles and tracks', () => {
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      1,
    )
    configuration.entrants[0].driverId = 'unknown-driver'
    configuration.entrants[0].sourceTeamId = 'unknown-team'
    configuration.trackId = 'unknown-track'
    const codes = new Set(
      validateFreeModeConfiguration(configuration, context()).map(
        (issue) => issue.code,
      ),
    )

    expect(codes).toEqual(
      new Set(['unknown-driver', 'unknown-team', 'unknown-track']),
    )
  })

  it('loads a category standard grid without repeating a person', () => {
    for (const series of seriesPackages) {
      const entrants = createEntrantsFromCategoryGrid(series)
      expect(entrants).toHaveLength(series.carCount)
      expect(new Set(entrants.map((entrant) => entrant.driverId)).size).toBe(
        entrants.length,
      )
    }
  })
})

describe('Free Mode RaceConfig generation', () => {
  it('builds 22-16-10 and 20-15-10 F1 qualifying rules', () => {
    const f1 = seriesPackageById.get('f1-custom')!
    const rules22 = buildFreeModeQualifyingRules(f1.rules, f1.carCount, 22)
    const rules20 = buildFreeModeQualifyingRules(f1.rules, f1.carCount, 20)

    expect(
      rules22.qualifying.segments.map((_, index) =>
        index === 0 ? 22 : rules22.qualifying.segments[index - 1].advanceCount,
      ),
    ).toEqual([22, 16, 10])
    expect(
      rules20.qualifying.segments.map((_, index) =>
        index === 0 ? 20 : rules20.qualifying.segments[index - 1].advanceCount,
      ),
    ).toEqual([20, 15, 10])
  })

  it('falls back to a valid single session for one car', () => {
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      1,
    )
    configuration.sessionKind = 'qualifying'
    const runtime = buildFreeModeRuntime(configuration, context())
    const snapshot = createInitialRace(runtime.raceConfig)

    expect(runtime.rules.qualifying.format).toBe('single-session')
    expect(runtime.raceConfig.timedSessionPlan?.segments).toHaveLength(1)
    expect(snapshot.cars).toHaveLength(1)
    expect(snapshot.cars[0].status).toBe('pit')
  })

  it.each([
    ['f1-custom', 'albert-park-approx', 'active-aero'],
    ['f1-custom', 'fuji-sf', 'active-aero'],
    ['super-formula', 'albert-park-approx', 'ots'],
    ['super-formula', 'fuji-sf', 'ots'],
    ['f2', 'albert-park-approx', 'drs'],
    ['f2', 'fuji-sf', 'drs'],
    ['f3', 'albert-park-approx', 'drs'],
    ['f3', 'fuji-sf', 'drs'],
  ] as const)(
    'runs %s machinery on %s while retaining %s rules',
    (categoryId, trackId, overtakeSystem) => {
      const configuration = configurationFor(categoryId, trackId, 10)
      const config = buildFreeModeRaceConfig(configuration, context())

      expect(config.seriesId).toBe(categoryId)
      expect(config.overtakeSystem).toBe(overtakeSystem)
      expect(config.track.id).toBe(trackId)
      expect(config.track.freeModeProvenance).toBeDefined()
      expect(createInitialRace(config).cars).toHaveLength(10)
    },
  )

  it('generates 40 unique runtime teams, grid offsets and pit boxes', () => {
    const configuration = configurationFor(
      'f1-custom',
      'fuji-sf',
      40,
    )
    configuration.entrants.forEach((entrant) => {
      entrant.sourceTeamId = 'ferrari'
    })
    const config = buildFreeModeRaceConfig(configuration, context())

    expect(config.teams).toHaveLength(40)
    expect(new Set(config.teams.map((team) => team.id)).size).toBe(40)
    expect(new Set(config.drivers.map((driver) => driver.teamId)).size).toBe(40)
    expect(new Set(config.drivers.map((driver) => driver.startOffset)).size).toBe(
      40,
    )
    expect(config.track.pitLane?.boxCount).toBeGreaterThanOrEqual(40)
    expect(createInitialRace(config).cars).toHaveLength(40)
  })

  it('equalises only runtime machine copies', () => {
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      3,
    )
    configuration.equalCars = true
    const source = seriesPackageById.get('f1-custom')!.teams.map(
      (team) => team.machine.racePace,
    )
    const config = buildFreeModeRaceConfig(configuration, context())

    expect(new Set(config.teams.map((team) => team.machine.racePace)).size).toBe(
      1,
    )
    expect(
      seriesPackageById
        .get('f1-custom')!
        .teams.map((team) => team.machine.racePace),
    ).toEqual(source)
  })

  it('uses a matching qualifying result as the race grid', () => {
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      4,
    )
    configuration.gridMode = 'qualifying-result'
    const orderedDriverIds = configuration.entrants
      .map((entrant) => entrant.driverId)
      .reverse()
    const result: FreeModeQualifyingResult = {
      categoryId: configuration.categoryId,
      completedAt: '2026-07-29T00:00:00.000Z',
      orderedDriverIds,
      seed: configuration.seed,
      trackId: configuration.trackId,
      version: 1,
    }
    const config = buildFreeModeRaceConfig(configuration, context(result))

    expect(config.drivers.map((driver) => driver.id)).toEqual(orderedDriverIds)
  })

  it('replays seeded random grids exactly', () => {
    const configuration = configurationFor(
      'super-formula',
      'fuji-sf',
      24,
    )
    configuration.gridMode = 'random'

    const first = buildFreeModeRaceConfig(configuration, context())
    const second = buildFreeModeRaceConfig(configuration, context())

    expect(first.drivers.map((driver) => driver.id)).toEqual(
      second.drivers.map((driver) => driver.id),
    )
  })

  it.each(['clear', 'light-rain', 'heavy-rain'] as const)(
    'starts in the selected %s weather',
    (weatherMode) => {
      const configuration = configurationFor(
        'f1-custom',
        'suzuka-approx',
        2,
      )
      configuration.weatherMode = weatherMode
      const config = buildFreeModeRaceConfig(configuration, context())
      const snapshot = createInitialRace(config)

      expect(snapshot.weather).toBe(weatherMode)
    },
  )

  it('creates a complete default from the Cadillac-era 22-car F1 grid', () => {
    const configuration = createDefaultFreeModeConfiguration(
      seriesById,
      'default-grid',
    )

    expect(configuration.categoryId).toBe('f1-custom')
    expect(configuration.entrants).toHaveLength(22)
    expect(
      configuration.entrants.some(
        (entrant) => entrant.sourceTeamId === 'cadillac',
      ),
    ).toBe(true)
  })

  it('keeps OpenF1 disabled without mutating the source category rules', () => {
    const source = seriesPackageById.get('f1-custom')!
    const configuration = configurationFor(
      'f1-custom',
      'suzuka-approx',
      2,
    )
    const runtime = buildFreeModeRuntime(configuration, context())

    expect(source.rules.supportsOpenF1).toBe(true)
    expect(runtime.rules.supportsOpenF1).toBe(false)
  })
})
