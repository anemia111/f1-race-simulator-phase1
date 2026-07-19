import type {
  CarComponents,
  CarSnapshot,
  Driver,
  Team,
  WeekendContext,
  WeekendStage,
} from '../types'
import { createCarComponents, normalizeCarComponents } from './components'
import { driverOverallAbilityPoints } from './driverAbility'

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
  /** Immutable race-day identities and ratings; later transfers cannot rewrite history. */
  resultArchive: SeasonResultSnapshot[]
}

export type SeasonResultSnapshot = {
  entries: Array<{
    carNumber: number
    code: string
    completedLaps: number
    driverId: string
    driverOverall: number | null
    driverSnapshot: Pick<
      Driver,
      | 'carNumber'
      | 'code'
      | 'id'
      | 'name'
      | 'nationality'
      | 'potential'
      | 'seatRole'
      | 'skills'
      | 'teamId'
    > | null
    pointsAwarded: number
    position: number
    status: CarSnapshot['status']
    teamId: string
    machineOverall: number | null
    teamSnapshot: Pick<
      Team,
      'color' | 'id' | 'machine' | 'name' | 'pitCrewSpeed'
    > | null
  }>
  roundId: string
  stage: Extract<WeekendStage, 'race' | 'race2' | 'sprint'>
}

export type SeasonGarageState = {
  componentsByDriver: Record<string, CarComponents>
  /** Component-allocation penalties waiting to be served at a Grand Prix. */
  pendingGridPenaltyByDriver: Record<string, number>
}

export function seasonSessionId(
  trackId: string,
  stage: Extract<WeekendStage, 'race' | 'race2' | 'sprint'>,
) {
  return `${trackId}:${stage}`
}

export function canonicalSeasonSessionId(value: string) {
  const legacy = /^([^:]+):(race|race2|sprint)(?::.+)?$/.exec(value)

  return legacy
    ? seasonSessionId(
        legacy[1],
        legacy[2] as Extract<WeekendStage, 'race' | 'race2' | 'sprint'>,
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
    resultArchive: [],
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
    drivers?: Driver[]
    roundId: string
    stage: Extract<WeekendStage, 'race' | 'race2' | 'sprint'>
    scheduledLaps?: number
    greenFlagLaps?: number
    pointsTable?: number[]
    reducedPointsTables?: [number[], number[], number[]] | null
    fastestLapRule?: {
      maximumClassifiedPosition: number
      minimumCompletionRatio: number
      points: number
    } | null
    teamScoring?: 'all-cars' | 'best-two'
    teams?: Team[]
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
  const defaultPointsTable =
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
  const pointsTable = options.pointsTable
    ? !hasMinimumGreenRunning
      ? []
      : options.reducedPointsTables
        ? completionRatio < 0.25
          ? options.reducedPointsTables[0]
          : completionRatio < 0.5
            ? options.reducedPointsTables[1]
            : completionRatio < 0.75
              ? options.reducedPointsTables[2]
              : options.pointsTable
        : options.stage === 'sprint' && completionRatio < 0.5
          ? []
          : options.pointsTable
    : defaultPointsTable
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
  const scoringCarsByTeam = new Map<string, number>()
  const pointsAwardedByDriver = new Map<string, number>()

  for (const car of classified) {
    const points = pointsTable[car.position - 1] ?? 0

    if (points === 0) {
      continue
    }

    driverPoints[car.driverId] = (driverPoints[car.driverId] ?? 0) + points
    pointsAwardedByDriver.set(
      car.driverId,
      (pointsAwardedByDriver.get(car.driverId) ?? 0) + points,
    )
    const alreadyScored = scoringCarsByTeam.get(car.teamId) ?? 0

    if (options.teamScoring !== 'best-two' || alreadyScored < 2) {
      teamPoints[car.teamId] = (teamPoints[car.teamId] ?? 0) + points
      scoringCarsByTeam.set(car.teamId, alreadyScored + 1)
    }
  }

  const fastestLap = classified
    .filter((car) => car.bestLapTimeSeconds !== null)
    .sort(
      (left, right) =>
        (left.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) -
          (right.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) ||
        (left.bestLapLap ?? Number.POSITIVE_INFINITY) -
          (right.bestLapLap ?? Number.POSITIVE_INFINITY) ||
        left.position - right.position,
    )[0]
  const fastestLapRule = options.fastestLapRule

  if (
    fastestLapRule &&
    fastestLap &&
    completionRatio >= fastestLapRule.minimumCompletionRatio &&
    fastestLap.position <= fastestLapRule.maximumClassifiedPosition
  ) {
    driverPoints[fastestLap.driverId] =
      (driverPoints[fastestLap.driverId] ?? 0) + fastestLapRule.points
    teamPoints[fastestLap.teamId] =
      (teamPoints[fastestLap.teamId] ?? 0) + fastestLapRule.points
    pointsAwardedByDriver.set(
      fastestLap.driverId,
      (pointsAwardedByDriver.get(fastestLap.driverId) ?? 0) +
        fastestLapRule.points,
    )
  }

  if (options.stage === 'race' || options.stage === 'race2') {
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

  const driverById = new Map(
    (options.drivers ?? []).map((driver) => [driver.id, driver]),
  )
  const teamById = new Map(
    (options.teams ?? []).map((team) => [team.id, team]),
  )
  const resultSnapshot: SeasonResultSnapshot = {
    entries: options.cars
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((car) => {
        const driver = driverById.get(car.driverId)
        const team = teamById.get(car.teamId)

        return {
          carNumber: car.carNumber,
          code: car.code,
          completedLaps: completedLapsFor(car),
          driverId: car.driverId,
          driverOverall: driver ? driverOverallAbilityPoints(driver) : null,
          driverSnapshot: driver
            ? {
                carNumber: driver.carNumber,
                code: driver.code,
                id: driver.id,
                name: driver.name,
                nationality: driver.nationality,
                potential: driver.potential,
                seatRole: driver.seatRole,
                skills: { ...driver.skills },
                teamId: driver.teamId,
              }
            : null,
          pointsAwarded: pointsAwardedByDriver.get(car.driverId) ?? 0,
          position: car.position,
          status: car.status,
          teamId: car.teamId,
          machineOverall: team
            ? Math.round(
                (Object.values(team.machine).reduce(
                  (total, value) => total + value,
                  0,
                ) /
                  Object.values(team.machine).length) *
                  100,
              )
            : null,
          teamSnapshot: team
            ? {
                color: team.color,
                id: team.id,
                machine: { ...team.machine },
                name: team.name,
                pitCrewSpeed: team.pitCrewSpeed,
              }
            : null,
        }
      }),
    roundId: options.roundId,
    stage: options.stage,
  }

  return {
    completedRounds: [...season.completedRounds, options.roundId],
    driverPoints,
    teamPoints,
    driverResults,
    teamResults,
    resultArchive: [
      ...(season.resultArchive ?? []),
      resultSnapshot,
    ].slice(-64),
    garage: {
      ...garageAfterSession,
      pendingGridPenaltyByDriver:
        options.stage === 'race' || options.stage === 'race2'
          ? {}
          : garageAfterSession.pendingGridPenaltyByDriver,
    },
  }
}

export function recordQualifyingPoints(
  season: SeasonState,
  options: {
    classification: Array<{
      driverId: string
      position: number
      teamId: string
    }>
    pointsTable: number[]
    roundId: string
    teamScoring?: 'all-cars' | 'best-two'
  },
): SeasonState {
  if (
    options.pointsTable.length === 0 ||
    season.completedRounds.includes(options.roundId)
  ) {
    return season
  }

  const driverPoints = { ...season.driverPoints }
  const teamPoints = { ...season.teamPoints }
  const scoringCarsByTeam = new Map<string, number>()

  for (const result of options.classification
    .slice()
    .sort((left, right) => left.position - right.position)) {
    const points = options.pointsTable[result.position - 1] ?? 0

    if (points <= 0) {
      continue
    }

    driverPoints[result.driverId] =
      (driverPoints[result.driverId] ?? 0) + points
    const alreadyScored = scoringCarsByTeam.get(result.teamId) ?? 0

    if (options.teamScoring !== 'best-two' || alreadyScored < 2) {
      teamPoints[result.teamId] = (teamPoints[result.teamId] ?? 0) + points
      scoringCarsByTeam.set(result.teamId, alreadyScored + 1)
    }
  }

  return {
    ...season,
    completedRounds: [...season.completedRounds, options.roundId],
    driverPoints,
    teamPoints,
  }
}
