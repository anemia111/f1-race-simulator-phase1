import { supportSeriesTracks } from '../data/supportSeriesTracks'
import { tracks as f1Tracks } from '../data/tracks'
import { seatedDriverFrom } from '../series/seriesRegistry'
import type {
  SeriesId,
  SeriesPackage,
  SeriesQualifyingSegmentRule,
  SeriesRules,
} from '../series/types'
import { runSeriesQualifying } from '../simulation/qualifying'
import { createSeededRandom, normalizeSimulationSeed } from '../simulation/random'
import { startingGridDistance } from '../simulation/startingGrid'
import { buildTimedSessionPlan } from '../simulation/timedSessionPlan'
import { weatherFor } from '../simulation/weather'
import { createWeekendContext } from '../simulation/weekend'
import type {
  MachinePerformanceProfile,
  RaceConfig,
  Team,
  TrackDefinition,
  WeekendStage,
} from '../types'
import {
  FREE_MODE_MAX_CARS,
  freeModeQualifyingResultMatches,
  validateFreeModeConfiguration,
} from './freeModeValidation'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModeEntrant,
  FreeModeRuntime,
  FreeModeTrackOption,
  FreeModeTrackSource,
  FreeModeWeatherMode,
} from './types'

const physicalTracks = [...f1Tracks, ...supportSeriesTracks]
const physicalTrackById = new Map(physicalTracks.map((track) => [track.id, track]))

const cloneTeam = (team: Team): Team => ({
  ...team,
  machine: { ...team.machine },
  performanceSource: team.performanceSource
    ? {
        ...team.performanceSource,
        rawRatings: { ...team.performanceSource.rawRatings },
      }
    : undefined,
})

const cloneTrack = (track: TrackDefinition): TrackDefinition => ({
  ...track,
  centerline: track.centerline.map((point) => [...point]),
  sectorMarks: [...track.sectorMarks],
  aeroActivationZones: track.aeroActivationZones?.map((zone) => ({ ...zone })),
  overtakeControlLines: track.overtakeControlLines?.map((line) => ({ ...line })),
  pitLane: track.pitLane ? { ...track.pitLane } : undefined,
  corners: track.corners?.map((corner) => ({
    ...corner,
    position: [...corner.position],
  })),
  marshalPosts: track.marshalPosts?.map((position) => [...position]),
})

export function freeModeTrackOptions(
  seriesById: Map<SeriesId, SeriesPackage>,
): FreeModeTrackOption[] {
  const f1Ids = new Set(
    (seriesById.get('f1-custom')?.tracks ?? []).map((track) => track.id),
  )
  const sfIds = new Set(
    (seriesById.get('super-formula')?.tracks ?? []).map((track) => track.id),
  )
  const ids = [...new Set([...f1Ids, ...sfIds])]

  return ids
    .map((id): FreeModeTrackOption | null => {
      const physicalTrack = physicalTrackById.get(id)

      if (!physicalTrack) {
        return null
      }

      const sources: FreeModeTrackSource[] = [
        ...(f1Ids.has(id) ? (['F1'] as const) : []),
        ...(sfIds.has(id) ? (['SF'] as const) : []),
      ]

      return {
        id,
        location: physicalTrack.location,
        name: physicalTrack.name.replace(/\s+Approx$/u, ''),
        physicalTrack,
        sources,
      }
    })
    .filter((option): option is FreeModeTrackOption => option !== null)
    .sort(
      (left, right) =>
        left.location.localeCompare(right.location) ||
        left.name.localeCompare(right.name),
    )
}

function deepCloneRules(rules: SeriesRules): SeriesRules {
  return JSON.parse(JSON.stringify(rules)) as SeriesRules
}

export function buildFreeModeQualifyingRules(
  baseRules: SeriesRules,
  baseCarCount: number,
  actualCarCount: number,
): SeriesRules {
  const rules = deepCloneRules(baseRules)
  rules.supportsOpenF1 = false

  if (actualCarCount <= 2 || rules.qualifying.format === 'single-session') {
    rules.qualifying = {
      ...rules.qualifying,
      format: 'single-session',
      grouping: undefined,
      segments: [
        {
          ...rules.qualifying.segments[0],
          advanceCount: null,
          name: 'Q1',
        },
      ],
    }
    return rules
  }

  if (rules.qualifying.format === 'grouped') {
    const opening = rules.qualifying.segments[0]
    const final = rules.qualifying.segments[1]

    if (!final || actualCarCount <= 3) {
      rules.qualifying = {
        ...rules.qualifying,
        segments: [{ ...opening, advanceCount: null }],
      }
      return rules
    }

    const baseAdvance = opening.advanceCount ?? Math.ceil(baseCarCount / 2)
    const advanceCount = Math.max(
      2,
      Math.min(
        actualCarCount - 1,
        Math.round((actualCarCount * baseAdvance) / Math.max(1, baseCarCount)),
      ),
    )
    rules.qualifying = {
      ...rules.qualifying,
      segments: [
        { ...opening, advanceCount },
        { ...final, advanceCount: null },
      ],
    }
    return rules
  }

  const [q1, q2, q3] = rules.qualifying.segments
  const q2Count = Math.max(
    2,
    Math.min(
      actualCarCount - 1,
      actualCarCount > 20
        ? actualCarCount - Math.ceil((actualCarCount - 10) / 2)
        : Math.min(15, actualCarCount),
    ),
  )
  const q3Count = Math.max(
    1,
    Math.min(q2Count - 1, 10),
  )
  const segments: SeriesQualifyingSegmentRule[] = [
    { ...q1, advanceCount: q2Count, name: 'Q1' },
    { ...q2, advanceCount: q3Count, name: 'Q2' },
    { ...q3, advanceCount: null, name: 'Q3' },
  ]

  rules.qualifying = { ...rules.qualifying, segments }
  return rules
}

export function freeModeStageFor(
  sessionKind: FreeModeConfiguration['sessionKind'],
): WeekendStage {
  return sessionKind === 'practice'
    ? 'fp1'
    : sessionKind === 'qualifying'
      ? 'qualifying'
      : 'race'
}

export function suggestFreeModeRaceLaps(
  series: SeriesPackage,
  track: TrackDefinition,
): number {
  const calendarEvent = series.calendar.find((event) => event.trackId === track.id)

  if (calendarEvent?.raceLaps) {
    return calendarEvent.raceLaps
  }

  const configuredDistance =
    series.rules.race.featureDistanceOverridesKm[track.id] ??
    series.rules.race.featureDistanceKm

  if (configuredDistance) {
    return Math.max(1, Math.round(configuredDistance / track.lengthKm))
  }

  const nativeTrack = series.tracks.find((candidate) => candidate.id === track.id)
  if (nativeTrack?.raceLaps) {
    return nativeTrack.raceLaps
  }

  return Math.max(
    1,
    Math.round(
      ((track.raceLaps ?? 50) * series.rules.raceDistanceRatio),
    ),
  )
}

export function createEntrantsFromCategoryGrid(
  series: SeriesPackage,
  count = series.drivers.length,
): FreeModeEntrant[] {
  if (series.drivers.length === 0 || series.teams.length === 0) {
    return []
  }

  const usedNumbers = new Set<number>()

  return Array.from(
    {
      length: Math.min(
        FREE_MODE_MAX_CARS,
        series.drivers.length,
        Math.max(1, count),
      ),
    },
    (_, index) => {
      const driver = series.drivers[index % series.drivers.length]
      let carNumber = driver.carNumber

      while (usedNumbers.has(carNumber)) {
        carNumber = (carNumber + 1) % 1000
      }
      usedNumbers.add(carNumber)

      return {
        carNumber,
        driverId: driver.id,
        id: `free-entry-${String(index + 1).padStart(3, '0')}`,
        sourceTeamId: driver.teamId,
      }
    },
  )
}

export function createDefaultFreeModeConfiguration(
  seriesById: Map<SeriesId, SeriesPackage>,
  seed = 'free-run',
): FreeModeConfiguration {
  const category = seriesById.get('f1-custom') ?? [...seriesById.values()][0]
  const track = freeModeTrackOptions(seriesById)[0]

  if (!category || !track) {
    throw new Error('Free Mode requires at least one category and one track')
  }

  return {
    categoryId: category.id,
    entrants: createEntrantsFromCategoryGrid(category),
    equalCars: false,
    gridMode: 'manual',
    practiceDurationMinutes: Math.round(
      category.rules.freePracticeDurationSeconds / 60,
    ),
    raceLaps: suggestFreeModeRaceLaps(category, track.physicalTrack),
    seed: normalizeSimulationSeed(seed),
    sessionKind: 'race',
    trackId: track.id,
    version: 1,
    weatherMode: 'random',
  }
}

function deterministicShuffle<T>(values: T[], seed: string): T[] {
  const result = [...values]
  const random = createSeededRandom(seed)

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[target]
    result[target] = current
  }

  return result
}

function orderedEntrants(
  configuration: FreeModeConfiguration,
  qualifyingResult: FreeModeBuildContext['qualifyingResult'],
) {
  if (configuration.gridMode === 'random') {
    return deterministicShuffle(
      configuration.entrants,
      `${configuration.seed}:free-grid`,
    )
  }

  if (
    configuration.gridMode === 'qualifying-result' &&
    freeModeQualifyingResultMatches(qualifyingResult, configuration)
  ) {
    const byDriver = new Map(
      configuration.entrants.map((entrant) => [entrant.driverId, entrant]),
    )
    return qualifyingResult!.orderedDriverIds.map((driverId) => byDriver.get(driverId)!)
  }

  return [...configuration.entrants]
}

function averageMachine(teams: Team[]): MachinePerformanceProfile {
  const keys = Object.keys(teams[0].machine) as Array<keyof MachinePerformanceProfile>

  return Object.fromEntries(
    keys.map((key) => [
      key,
      teams.reduce((sum, team) => sum + team.machine[key], 0) / teams.length,
    ]),
  ) as MachinePerformanceProfile
}

function derivedControlLines(track: TrackDefinition) {
  const starts =
    track.aeroActivationZones?.map((zone) => zone.start) ??
    [track.sectorMarks[1] ?? 0.34, track.sectorMarks[2] ?? 0.68]

  return starts.slice(0, 3).map((start) => ({
    activationProgress: start,
    detectionGapSeconds: 1,
    detectionProgress: (start + 0.96) % 1,
    source: 'fallback' as const,
  }))
}

function derivedAeroZones(track: TrackDefinition) {
  const starts =
    track.overtakeControlLines?.map((line) => line.activationProgress) ??
    [track.sectorMarks[1] ?? 0.34, track.sectorMarks[2] ?? 0.68]

  return starts.slice(0, 3).map((start, index) => ({
    end: (start + 0.1) % 1,
    label: `SIM ZONE ${index + 1}`,
    lowGripMode: 'disabled' as const,
    source: 'fallback' as const,
    start,
  }))
}

function trackForConfiguration(
  configuration: FreeModeConfiguration,
  series: SeriesPackage,
  trackOption: FreeModeTrackOption,
): TrackDefinition {
  const nativeTrack = series.tracks.find((track) => track.id === trackOption.id)
  const track = nativeTrack
    ? cloneTrack(nativeTrack)
    : {
        ...cloneTrack(trackOption.physicalTrack),
        baseLapTime: Number(
          (
            trackOption.physicalTrack.baseLapTime *
            series.rules.baseLapTimeMultiplier
          ).toFixed(3),
        ),
        baseLapTimeSource: 'estimated' as const,
        paceReference2026: undefined,
        raceLaps: suggestFreeModeRaceLaps(series, trackOption.physicalTrack),
        raceLapsSource: 'estimated' as const,
      }
  const pitLane = track.pitLane

  if (pitLane) {
    const boxCount = Math.max(pitLane.boxCount, configuration.entrants.length)
    const boxSpan = (pitLane.exitProgress + 1 - pitLane.boxStartProgress) % 1

    track.pitLane = {
      ...pitLane,
      boxCount,
      boxSpacingProgress:
        boxCount <= 1
          ? 0
          : Math.max(0.00045, (boxSpan * 0.78) / (boxCount - 1)),
    }
  }

  if (
    (series.rules.overtakeSystem === 'active-aero' ||
      series.rules.overtakeSystem === 'drs') &&
    !track.overtakeControlLines?.length
  ) {
    track.overtakeControlLines = derivedControlLines(track)
  }

  if (
    series.rules.overtakeSystem === 'active-aero' &&
    !track.aeroActivationZones?.length
  ) {
    track.aeroActivationZones = derivedAeroZones(track)
  }

  track.freeModeProvenance = {
    overtakeZones:
      series.tracks.some((candidate) => candidate.id === trackOption.id)
        ? 'native'
        : 'simulated',
    pace: nativeTrack ? 'native' : 'simulated',
    sourceSeries: [...trackOption.sources],
  }

  return track
}

function seedAndTrackForWeather(
  baseSeed: string,
  track: TrackDefinition,
  mode: FreeModeWeatherMode,
) {
  if (mode === 'random') {
    return { seed: normalizeSimulationSeed(baseSeed), track }
  }

  const weatherTrack = {
    ...track,
    rainProbability: mode === 'clear' ? 0 : 0.75,
  }
  const expected = mode
  const seedPrefix = normalizeSimulationSeed(baseSeed).slice(0, 72)

  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = normalizeSimulationSeed(
      `${seedPrefix}:weather:${mode}:${attempt}`,
    )

    if (weatherFor(candidate, weatherTrack, 0) === expected) {
      return { seed: candidate, track: weatherTrack }
    }
  }

  throw new Error(`Could not derive deterministic ${mode} weather seed`)
}

export function buildFreeModeRaceConfig(
  configuration: FreeModeConfiguration,
  context: FreeModeBuildContext,
): RaceConfig {
  const issues = validateFreeModeConfiguration(configuration, context)

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join('; '))
  }

  const series = context.seriesById.get(configuration.categoryId)!
  const trackOption = freeModeTrackOptions(context.seriesById).find(
    (option) => option.id === configuration.trackId,
  )!
  const rules = buildFreeModeQualifyingRules(
    series.rules,
    series.carCount,
    configuration.entrants.length,
  )
  const entrants = orderedEntrants(configuration, context.qualifyingResult)
  const sourceTeamById = new Map(series.teams.map((team) => [team.id, team]))
  const poolById = new Map(context.driverPool.map((driver) => [driver.id, driver]))
  const selectedSourceTeams = entrants.map(
    (entrant) => sourceTeamById.get(entrant.sourceTeamId)!,
  )
  const equalMachine =
    configuration.equalCars && selectedSourceTeams.length > 0
      ? averageMachine(selectedSourceTeams)
      : null
  const teams = entrants.map((entrant, index): Team => {
    const source = sourceTeamById.get(entrant.sourceTeamId)!
    const syntheticId = `free-entry-${String(index + 1).padStart(3, '0')}`

    return {
      ...cloneTeam(source),
      id: syntheticId,
      machine: equalMachine ? { ...equalMachine } : { ...source.machine },
      performanceSource: source.performanceSource
        ? {
            ...source.performanceSource,
            fileName: configuration.equalCars
              ? `${source.performanceSource.fileName} (Free Mode equal cars)`
              : source.performanceSource.fileName,
            rawRatings: { ...source.performanceSource.rawRatings },
          }
        : undefined,
    }
  })
  const drivers = entrants.map((entrant, index) => {
    const poolDriver = poolById.get(entrant.driverId)!
    const syntheticTeamId = teams[index].id
    const seated = seatedDriverFrom(poolDriver, {
      carNumber: entrant.carNumber,
      startOffset: startingGridDistance(index) - 1,
      teamId: syntheticTeamId,
    })
    const override = context.driverOverridesById?.get(entrant.driverId)

    return override
      ? {
          ...seated,
          performanceSource: override.performanceSource
            ? {
                ...override.performanceSource,
                rawRatings: { ...override.performanceSource.rawRatings },
              }
            : seated.performanceSource,
          potential: override.potential,
          skills: { ...override.skills },
          style: { ...override.style },
        }
      : seated
  })
  const categoryTrack = trackForConfiguration(configuration, series, trackOption)
  const weatherResolved = seedAndTrackForWeather(
    configuration.seed,
    categoryTrack,
    configuration.weatherMode,
  )
  const weekendStage = freeModeStageFor(configuration.sessionKind)
  const tireAllocation = { ...rules.tires.standardAllocation }
  const config: RaceConfig = {
    categoryRaceFormat: rules.race,
    drivers,
    featureRaceMandatoryPitStop: rules.featureRaceMandatoryPitStop,
    featureRaceTwoDryCompounds: rules.featureRaceTwoDryCompounds,
    overtakeActivation: rules.overtakeActivation,
    overtakeSystem: rules.overtakeSystem,
    qualifyingDryCompound: rules.tires.qualifyingDryCompound,
    seed: weatherResolved.seed,
    seriesId: series.id,
    sessionDurationSeconds:
      configuration.sessionKind === 'practice'
        ? configuration.practiceDurationMinutes * 60
        : null,
    sessionRaceLapsOverride:
      configuration.sessionKind === 'race' ? configuration.raceLaps : null,
    teams,
    tireAllocation,
    tireSupplier: rules.tireSupplier,
    track: weatherResolved.track,
    weekendContext: createWeekendContext(
      drivers,
      false,
      weatherResolved.track,
      tireAllocation,
    ),
    weekendStage,
  }

  if (configuration.sessionKind === 'qualifying') {
    const qualifying = runSeriesQualifying(config, rules)
    config.timedSessionPlan = buildTimedSessionPlan(
      qualifying,
      rules.qualifying.breakSeconds,
      rules.qualifying.format,
    )
  }

  return config
}

export function buildFreeModeRuntime(
  configuration: FreeModeConfiguration,
  context: FreeModeBuildContext,
): FreeModeRuntime {
  const series = context.seriesById.get(configuration.categoryId)
  if (!series) {
    throw new Error(`Unknown Free Mode category ${configuration.categoryId}`)
  }
  const rules = buildFreeModeQualifyingRules(
    series.rules,
    series.carCount,
    configuration.entrants.length,
  )
  const trackOption = freeModeTrackOptions(context.seriesById).find(
    (option) => option.id === configuration.trackId,
  )
  const raceConfig = buildFreeModeRaceConfig(configuration, context)
  const segmentFlow = rules.qualifying.segments
    .map((segment, index) =>
      index < rules.qualifying.segments.length - 1
        ? `${segment.name} ${index === 0 ? configuration.entrants.length : rules.qualifying.segments[index - 1].advanceCount}→${segment.advanceCount}`
        : `${segment.name} ${index === 0 ? configuration.entrants.length : rules.qualifying.segments[index - 1].advanceCount}`,
    )
    .join(' / ')

  return {
    configuration,
    qualifyingFormatLabel:
      rules.qualifying.format === 'single-session'
        ? `SIM single session · ${configuration.entrants.length} cars`
        : `SIM ${rules.qualifying.format} · ${segmentFlow}`,
    raceConfig,
    rules,
    sourceTeams: series.teams.map(cloneTeam),
    trackSources: trackOption?.sources ?? [],
  }
}
