import { MAX_SIMULATION_SEED_LENGTH } from '../simulation/random'
import { isExecutableSeriesId } from '../series/seriesIds'
import type { SeriesId } from '../series/types'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModeEntrant,
  FreeModeQualifyingResult,
  FreeModeValidationIssue,
} from './types'

export const FREE_MODE_MIN_CARS = 1
export const FREE_MODE_MAX_CARS = 40

const sessionKinds = new Set(['practice', 'qualifying', 'race'])
const practiceStages = new Set(['fp1', 'fp2', 'fp3'])
const gridModes = new Set(['manual', 'random', 'qualifying-result'])
const weatherModes = new Set([
  'random',
  'clear',
  'light-rain',
  'heavy-rain',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function freeModeQualifyingResultMatches(
  result: FreeModeQualifyingResult | null | undefined,
  configuration: FreeModeConfiguration,
) {
  if (
    !result ||
    result.categoryId !== configuration.categoryId ||
    result.trackId !== configuration.trackId ||
    result.orderedDriverIds.length !== configuration.entrants.length
  ) {
    return false
  }

  const entrants = new Set(configuration.entrants.map((entrant) => entrant.driverId))
  return (
    new Set(result.orderedDriverIds).size === result.orderedDriverIds.length &&
    result.orderedDriverIds.every((driverId) => entrants.has(driverId))
  )
}

export function validateFreeModeConfiguration(
  configuration: FreeModeConfiguration,
  context: FreeModeBuildContext,
): FreeModeValidationIssue[] {
  const issues: FreeModeValidationIssue[] = []
  const series = context.seriesById.get(configuration.categoryId)
  const driverIds = new Set(context.driverPool.map((driver) => driver.id))
  const trackIds = new Set([
    ...(context.seriesById.get('f1-custom')?.tracks ?? []).map(
      (track) => track.id,
    ),
    ...(context.seriesById.get('super-formula')?.tracks ?? []).map(
      (track) => track.id,
    ),
  ])

  if (!series) {
    issues.push({
      code: 'unknown-category',
      field: 'categoryId',
      message: 'Select a supported category.',
    })
  }
  if (!trackIds.has(configuration.trackId)) {
    issues.push({
      code: 'unknown-track',
      field: 'trackId',
      message: 'Select a track from the F1 / SUPER FORMULA pool.',
    })
  }
  if (
    configuration.entrants.length < FREE_MODE_MIN_CARS ||
    configuration.entrants.length > FREE_MODE_MAX_CARS
  ) {
    issues.push({
      code: 'car-count',
      field: 'entrants',
      message: `Field size must be ${FREE_MODE_MIN_CARS}-${FREE_MODE_MAX_CARS} cars.`,
    })
  }
  if (
    !Number.isInteger(configuration.raceLaps) ||
    configuration.raceLaps < 1 ||
    configuration.raceLaps > 999
  ) {
    issues.push({
      code: 'race-laps',
      field: 'raceLaps',
      message: 'Race distance must be 1-999 laps.',
    })
  }
  if (
    !Number.isInteger(configuration.practiceDurationMinutes) ||
    configuration.practiceDurationMinutes < 5 ||
    configuration.practiceDurationMinutes > 240
  ) {
    issues.push({
      code: 'practice-duration',
      field: 'practiceDurationMinutes',
      message: 'Practice duration must be 5-240 minutes.',
    })
  }
  if (
    typeof configuration.seed !== 'string' ||
    configuration.seed.length > MAX_SIMULATION_SEED_LENGTH
  ) {
    issues.push({
      code: 'seed',
      field: 'seed',
      message: `Seed must be at most ${MAX_SIMULATION_SEED_LENGTH} characters.`,
    })
  }

  const entrantIds = new Set<string>()
  const selectedDriverIds = new Set<string>()
  const carNumbers = new Set<number>()
  const teamIds = new Set(series?.teams.map((team) => team.id) ?? [])

  for (const entrant of configuration.entrants) {
    if (!entrant.id || entrantIds.has(entrant.id)) {
      issues.push({
        code: 'entrant-id',
        entrantId: entrant.id,
        message: 'Every entry needs a unique runtime ID.',
      })
    }
    entrantIds.add(entrant.id)

    if (!driverIds.has(entrant.driverId)) {
      issues.push({
        code: 'unknown-driver',
        entrantId: entrant.id,
        field: 'driverId',
        message: 'Driver is not in the 2026 pool.',
      })
    } else if (selectedDriverIds.has(entrant.driverId)) {
      issues.push({
        code: 'duplicate-driver',
        entrantId: entrant.id,
        field: 'driverId',
        message: 'The same person cannot enter twice.',
      })
    }
    selectedDriverIds.add(entrant.driverId)

    if (!teamIds.has(entrant.sourceTeamId)) {
      issues.push({
        code: 'unknown-team',
        entrantId: entrant.id,
        field: 'sourceTeamId',
        message: 'Vehicle is not registered in the selected category.',
      })
    }

    if (
      !Number.isInteger(entrant.carNumber) ||
      entrant.carNumber < 0 ||
      entrant.carNumber > 999
    ) {
      issues.push({
        code: 'car-number',
        entrantId: entrant.id,
        field: 'carNumber',
        message: 'Car number must be an integer from 0 to 999.',
      })
    } else if (carNumbers.has(entrant.carNumber)) {
      issues.push({
        code: 'duplicate-car-number',
        entrantId: entrant.id,
        field: 'carNumber',
        message: 'Car number must be unique in this session.',
      })
    }
    carNumbers.add(entrant.carNumber)
  }

  if (
    configuration.sessionKind === 'race' &&
    configuration.gridMode === 'qualifying-result' &&
    !freeModeQualifyingResultMatches(
      context.qualifyingResult,
      configuration,
    )
  ) {
    issues.push({
      code: 'missing-qualifying-result',
      field: 'gridMode',
      message:
        'A matching Free Mode qualifying result is required for this grid.',
    })
  }

  return issues
}

function parseEntrant(value: unknown): FreeModeEntrant | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    value.id.length > 120 ||
    typeof value.driverId !== 'string' ||
    value.driverId.length < 1 ||
    value.driverId.length > 120 ||
    typeof value.sourceTeamId !== 'string' ||
    value.sourceTeamId.length < 1 ||
    value.sourceTeamId.length > 120 ||
    typeof value.carNumber !== 'number'
  ) {
    return null
  }

  return {
    carNumber: value.carNumber,
    driverId: value.driverId.slice(0, 120),
    id: value.id.slice(0, 120),
    sourceTeamId: value.sourceTeamId.slice(0, 120),
  }
}

export function parseFreeModeConfiguration(
  value: unknown,
  context: FreeModeBuildContext,
  options: { requireQualifyingResult?: boolean } = {},
): FreeModeConfiguration | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isExecutableSeriesId(value.categoryId) ||
    typeof value.trackId !== 'string' ||
    value.trackId.length < 1 ||
    value.trackId.length > 120 ||
    typeof value.sessionKind !== 'string' ||
    !sessionKinds.has(value.sessionKind) ||
    (value.practiceStage !== undefined &&
      (typeof value.practiceStage !== 'string' ||
        !practiceStages.has(value.practiceStage))) ||
    typeof value.gridMode !== 'string' ||
    !gridModes.has(value.gridMode) ||
    typeof value.weatherMode !== 'string' ||
    !weatherModes.has(value.weatherMode) ||
    typeof value.raceLaps !== 'number' ||
    typeof value.practiceDurationMinutes !== 'number' ||
    typeof value.seed !== 'string' ||
    value.seed.length > MAX_SIMULATION_SEED_LENGTH ||
    typeof value.equalCars !== 'boolean' ||
    !Array.isArray(value.entrants) ||
    value.entrants.length > FREE_MODE_MAX_CARS
  ) {
    return null
  }

  const entrants = value.entrants.map(parseEntrant)
  if (entrants.some((entrant) => entrant === null)) {
    return null
  }

  const configuration: FreeModeConfiguration = {
    categoryId: value.categoryId as SeriesId,
    entrants: entrants as FreeModeEntrant[],
    equalCars: value.equalCars,
    gridMode: value.gridMode as FreeModeConfiguration['gridMode'],
    practiceDurationMinutes: value.practiceDurationMinutes,
    // A stored version-1 payload has no practice stage and means FP1.
    ...(value.practiceStage === undefined
      ? {}
      : {
          practiceStage:
            value.practiceStage as FreeModeConfiguration['practiceStage'],
        }),
    raceLaps: value.raceLaps,
    seed: value.seed.slice(0, MAX_SIMULATION_SEED_LENGTH),
    sessionKind: value.sessionKind as FreeModeConfiguration['sessionKind'],
    trackId: value.trackId.slice(0, 120),
    version: 1,
    weatherMode: value.weatherMode as FreeModeConfiguration['weatherMode'],
  }

  const issues = validateFreeModeConfiguration(configuration, context)
  const blockingIssues =
    options.requireQualifyingResult === false
      ? issues.filter((issue) => issue.code !== 'missing-qualifying-result')
      : issues

  return blockingIssues.length === 0 ? configuration : null
}
