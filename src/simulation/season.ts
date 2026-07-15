import type {
  CarComponents,
  CarSnapshot,
  Driver,
  WeekendContext,
  WeekendStage,
} from '../types'
import { createCarComponents, normalizeCarComponents } from './components'

const grandPrixPoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
const sprintPoints = [8, 7, 6, 5, 4, 3, 2, 1]
const quarterRacePoints = [6, 4, 3, 2, 1]
const halfRacePoints = [13, 10, 8, 6, 5, 4, 3, 2, 1]
const threeQuarterRacePoints = [19, 14, 12, 9, 8, 6, 5, 3, 2, 1]

export type SeasonState = {
  completedRounds: string[]
  driverPoints: Record<string, number>
  teamPoints: Record<string, number>
  /** Race finishing positions used for FIA championship countback. */
  driverResults: Record<string, number[]>
  teamResults: Record<string, number[]>
  garage: SeasonGarageState
}

export type SeasonGarageState = {
  componentsByDriver: Record<string, CarComponents>
  /** Component-allocation penalties waiting to be served at a Grand Prix. */
  pendingGridPenaltyByDriver: Record<string, number>
}

export function seasonSessionId(
  trackId: string,
  stage: Extract<WeekendStage, 'race' | 'sprint'>,
) {
  return `${trackId}:${stage}`
}

export function canonicalSeasonSessionId(value: string) {
  const legacy = /^([^:]+):(race|sprint)(?::.+)?$/.exec(value)

  return legacy
    ? seasonSessionId(
        legacy[1],
        legacy[2] as Extract<WeekendStage, 'race' | 'sprint'>,
      )
    : value
}

export function createSeasonState(drivers: Driver[] = []): SeasonState {
  return {
    completedRounds: [],
    driverPoints: {},
    teamPoints: {},
    driverResults: {},
    teamResults: {},
    garage: {
      componentsByDriver: Object.fromEntries(
        drivers.map((driver) => [driver.id, createCarComponents()]),
      ),
      pendingGridPenaltyByDriver: {},
    },
  }
}

export function applySeasonGarageToWeekend(
  weekend: WeekendContext,
  season: SeasonState,
  drivers: Driver[],
): WeekendContext {
  const componentConditionByDriver = {
    ...weekend.componentConditionByDriver,
  }
  const gridPenaltyByDriver = { ...weekend.gridPenaltyByDriver }

  for (const driver of drivers) {
    componentConditionByDriver[driver.id] = normalizeCarComponents(
      season.garage.componentsByDriver[driver.id] ??
        componentConditionByDriver[driver.id],
    )
    const pendingPenalty = Math.max(
      0,
      Math.min(
        drivers.length,
        season.garage.pendingGridPenaltyByDriver[driver.id] ?? 0,
      ),
    )

    if (pendingPenalty > 0) {
      gridPenaltyByDriver[driver.id] = pendingPenalty
    }
  }

  return {
    ...weekend,
    componentConditionByDriver,
    gridPenaltyByDriver,
  }
}

export function updateSeasonGarageFromCars(
  season: SeasonState,
  cars: CarSnapshot[],
): SeasonState {
  return {
    ...season,
    garage: {
      ...season.garage,
      componentsByDriver: {
        ...season.garage.componentsByDriver,
        ...Object.fromEntries(
          cars.map((car) => [
            car.driverId,
            normalizeCarComponents(car.components),
          ]),
        ),
      },
    },
  }
}

export function updateSeasonGarageReplacement(
  season: SeasonState,
  driverId: string,
  components: CarComponents,
  addedGridPenalty: number,
): SeasonState {
  return {
    ...season,
    garage: {
      componentsByDriver: {
        ...season.garage.componentsByDriver,
        [driverId]: normalizeCarComponents(components),
      },
      pendingGridPenaltyByDriver: {
        ...season.garage.pendingGridPenaltyByDriver,
        [driverId]:
          (season.garage.pendingGridPenaltyByDriver[driverId] ?? 0) +
          Math.max(0, addedGridPenalty),
      },
    },
  }
}

function completedLapsFor(car: CarSnapshot): number {
  return Math.max(car.lapHistory.length, Math.max(0, Math.floor(car.totalDistance) - 1))
}

/** Sort points using FIA A2.1.4 race-result countback, then a stable id fallback. */
export function rankSeasonEntries(
  points: Record<string, number>,
  raceResults: Record<string, number[]>,
): Array<[string, number]> {
  return Object.entries(points).sort((left, right) => {
    const leftPoints = Number.isFinite(left[1]) ? left[1] : 0
    const rightPoints = Number.isFinite(right[1]) ? right[1] : 0

    if (rightPoints !== leftPoints) {
      return rightPoints - leftPoints
    }

    const leftResults = raceResults[left[0]] ?? []
    const rightResults = raceResults[right[0]] ?? []
    const positions = Array.from(
      new Set(
        [...leftResults, ...rightResults].filter(
          (position) => Number.isSafeInteger(position) && position >= 1,
        ),
      ),
    ).sort((leftPosition, rightPosition) => leftPosition - rightPosition)

    for (const position of positions) {
      const leftCount = leftResults.filter((result) => result === position).length
      const rightCount = rightResults.filter((result) => result === position).length

      if (rightCount !== leftCount) {
        return rightCount - leftCount
      }
    }

    return left[0].localeCompare(right[0])
  })
}

export function recordSeasonRound(
  season: SeasonState,
  options: {
    cars: CarSnapshot[]
    roundId: string
    stage: Extract<WeekendStage, 'race' | 'sprint'>
    scheduledLaps?: number
    greenFlagLaps?: number
  },
): SeasonState {
  if (season.completedRounds.includes(options.roundId)) {
    return season
  }

  const winnerCompletedLaps = Math.max(
    0,
    ...options.cars.map(completedLapsFor),
  )
  const completionRatio = options.scheduledLaps
    ? winnerCompletedLaps / options.scheduledLaps
    : 1
  const hasMinimumGreenRunning =
    (options.greenFlagLaps ?? winnerCompletedLaps) >= 2
  const pointsTable =
    !hasMinimumGreenRunning
      ? []
      : options.stage === 'sprint'
        ? completionRatio >= 0.5
          ? sprintPoints
          : []
        : completionRatio < 0.25
          ? quarterRacePoints
          : completionRatio < 0.5
            ? halfRacePoints
            : completionRatio < 0.75
              ? threeQuarterRacePoints
              : grandPrixPoints
  const classificationThreshold = Math.floor(winnerCompletedLaps * 0.9)
  const classified = options.cars
    .filter(
      (car) =>
        car.status !== 'disqualified' &&
        car.status !== 'dns' &&
        (car.status === 'finished' ||
          (winnerCompletedLaps > 0 &&
            completedLapsFor(car) >= classificationThreshold)),
    )
    .slice()
    .sort((left, right) => left.position - right.position)
  const driverPoints = { ...season.driverPoints }
  const teamPoints = { ...season.teamPoints }
  const driverResults = { ...season.driverResults }
  const teamResults = { ...season.teamResults }
  const garageAfterSession = updateSeasonGarageFromCars(season, options.cars).garage

  for (const car of classified) {
    const points = pointsTable[car.position - 1] ?? 0

    if (points === 0) {
      continue
    }

    driverPoints[car.driverId] = (driverPoints[car.driverId] ?? 0) + points
    teamPoints[car.teamId] = (teamPoints[car.teamId] ?? 0) + points
  }

  if (options.stage === 'race') {
    for (const car of options.cars.filter(
      (candidate) =>
        candidate.status !== 'disqualified' && candidate.status !== 'dns',
    )) {
      driverResults[car.driverId] = [
        ...(driverResults[car.driverId] ?? []),
        car.position,
      ]
      teamResults[car.teamId] = [
        ...(teamResults[car.teamId] ?? []),
        car.position,
      ]
    }
  }

  return {
    completedRounds: [...season.completedRounds, options.roundId],
    driverPoints,
    teamPoints,
    driverResults,
    teamResults,
    garage: {
      ...garageAfterSession,
      pendingGridPenaltyByDriver:
        options.stage === 'race'
          ? {}
          : garageAfterSession.pendingGridPenaltyByDriver,
    },
  }
}
