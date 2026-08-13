import type {
  CarComponents,
  CarSnapshot,
  Driver,
  Team,
  WeekendContext,
  WeekendStage,
} from '../types'
import {
  createF1CarComponents,
  normalizeF1CarComponents,
} from './components'
import { driverOverallAbilityPoints } from './driverAbility'
import {
  createSuperFormula2026EngineLedger,
  type SuperFormula2026EngineLedger,
} from './superFormulaEngineLedger'
import {
  createSuperFormula2026PenaltyPointLedger,
  recordSuperFormula2026PenaltyPoints,
  serveSuperFormula2026NextEventSuspension,
  type SuperFormula2026NextEventSuspension,
  type SuperFormula2026PenaltyPointLedger,
  type SuperFormula2026PenaltySuspensionAssessment,
  type SuperFormula2026SuspensionServedTransition,
} from './superFormulaPenaltyLedger'
import { isF1RuntimeSystems, isSuperFormulaRuntimeSystems } from './runtimeSystems'

const grandPrixPoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
const sprintPoints = [8, 7, 6, 5, 4, 3, 2, 1]
const quarterRacePoints = [6, 4, 3, 2, 1]
const halfRacePoints = [13, 10, 8, 6, 5, 4, 3, 2, 1]
const threeQuarterRacePoints = [19, 14, 12, 9, 8, 6, 5, 3, 2, 1]

export type SeasonStateBase = {
  completedRounds: string[]
  driverPoints: Record<string, number>
  teamPoints: Record<string, number>
  /** Race finishing positions used for FIA championship countback. */
  driverResults: Record<string, number[]>
  teamResults: Record<string, number[]>
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

/** FIA B8.2 lifecycle state, valid only for F1 seasons. */
export type F1SeasonGarageState = {
  kind: 'f1'
  componentsByDriver: Record<string, CarComponents>
  /** Component-allocation penalties waiting to be served at a Grand Prix. */
  pendingGridPenaltyByDriver: Record<string, number>
}

/** Article 24 engine lifecycle state, valid only for SUPER FORMULA seasons. */
export type SuperFormulaSeasonGarageState = {
  engineLedgerByEntrant: Record<string, SuperFormula2026EngineLedger>
  kind: 'super-formula'
}

/**
 * Article 5 driver discipline is a separate legal record, not a race-session
 * stewarding counter. It is stored only in a SUPER FORMULA season and only
 * changed from explicit official adjudications.
 */
export type SuperFormulaSeasonDisciplineState = {
  kind: 'super-formula-article-5'
  penaltyLedgerByDriver: Record<string, SuperFormula2026PenaltyPointLedger>
}

export type SeasonGarageState =
  | F1SeasonGarageState
  | SuperFormulaSeasonGarageState

export type F1SeasonState = SeasonStateBase & {
  garage: F1SeasonGarageState
  seriesId: 'f1-custom'
}

export type SuperFormulaSeasonState = SeasonStateBase & {
  discipline: SuperFormulaSeasonDisciplineState
  garage: SuperFormulaSeasonGarageState
  seriesId: 'super-formula'
}

export type SeasonState = F1SeasonState | SuperFormulaSeasonState

export function seasonSessionId(
  trackId: string,
  stage: Extract<WeekendStage, 'race' | 'race2' | 'sprint'>,
) {
  return `${trackId}:${stage}`
}

const seasonSessionSuffix =
  /:(?:qualifying2|sprintQualifying|qualifying|race2|sprint|race)$/

export function completedSeasonEventCount(completedSessions: string[]): number {
  return new Set(
    completedSessions
      .filter((sessionId) => sessionId.length > 0)
      .map((sessionId) => sessionId.replace(seasonSessionSuffix, '')),
  ).size
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

export function createSeasonState(
  drivers?: Driver[],
  seriesId?: 'f1-custom',
): F1SeasonState
export function createSeasonState(
  drivers: Driver[],
  seriesId: 'super-formula',
): SuperFormulaSeasonState
export function createSeasonState(
  drivers: Driver[],
  seriesId: SeasonState['seriesId'],
): SeasonState
export function createSeasonState(
  drivers: Driver[] = [],
  seriesId: SeasonState['seriesId'] = 'f1-custom',
): SeasonState {
  const shared: SeasonStateBase = {
    completedRounds: [],
    driverPoints: {},
    teamPoints: {},
    driverResults: {},
    teamResults: {},
    resultArchive: [],
  }

  if (seriesId === 'super-formula') {
    return {
      ...shared,
      seriesId,
      discipline: {
        kind: 'super-formula-article-5',
        penaltyLedgerByDriver: Object.fromEntries(
          drivers.map((driver) => [
            driver.id,
            createSuperFormula2026PenaltyPointLedger({
              driverId: driver.id,
            }),
          ]),
        ),
      },
      garage: {
        engineLedgerByEntrant: Object.fromEntries(
          [...new Set(drivers.map((driver) => driver.teamId))].map(
            (entrantId) => [
              entrantId,
              createSuperFormula2026EngineLedger({ entrantId }),
            ],
          ),
        ),
        kind: 'super-formula',
      },
    }
  }

  return {
    ...shared,
    seriesId,
    garage: {
      componentsByDriver: Object.fromEntries(
        drivers.map((driver) => [driver.id, createF1CarComponents()]),
      ),
      kind: 'f1',
      pendingGridPenaltyByDriver: {},
    },
  }
}

const superFormulaPenaltyLedgerForDriver = (
  season: SuperFormulaSeasonState,
  driverId: string,
) =>
  season.discipline.penaltyLedgerByDriver[driverId] ??
  createSuperFormula2026PenaltyPointLedger({ driverId })

const withSuperFormulaPenaltyLedger = (
  season: SuperFormulaSeasonState,
  driverId: string,
  ledger: SuperFormula2026PenaltyPointLedger,
): SuperFormulaSeasonState => ({
  ...season,
  discipline: {
    ...season.discipline,
    penaltyLedgerByDriver: {
      ...season.discipline.penaltyLedgerByDriver,
      [driverId]: ledger,
    },
  },
})

export type SuperFormulaOfficialPenaltyPointAdjudication = {
  /** Stable ID from the official decision; never a simulated incident ID. */
  officialDecisionId: string
  assessedOn: string
  driverId: string
  points: number
}

export type SuperFormulaOfficialPenaltyPointAdjudicationResult = {
  assessment: SuperFormula2026PenaltySuspensionAssessment
  season: SuperFormulaSeasonState
}

/**
 * Records a source-of-truth Article 5 decision. This intentionally accepts no
 * `CarSnapshot`, steward-case, or generic race `penaltyPoints` input: those
 * simulation outcomes are not an official JAF point adjudication.
 */
export function recordOfficialSuperFormulaPenaltyPointAdjudication(
  season: SuperFormulaSeasonState,
  adjudication: SuperFormulaOfficialPenaltyPointAdjudication,
): SuperFormulaOfficialPenaltyPointAdjudicationResult {
  const ledger = superFormulaPenaltyLedgerForDriver(
    season,
    adjudication.driverId,
  )
  const assessment = recordSuperFormula2026PenaltyPoints({
    assessedOn: adjudication.assessedOn,
    ledger,
    pointEntryId: adjudication.officialDecisionId,
    points: adjudication.points,
  })

  return {
    assessment,
    season: withSuperFormulaPenaltyLedger(
      season,
      adjudication.driverId,
      assessment.ledger,
    ),
  }
}

export type SuperFormulaOfficialSuspensionServedRecord = {
  driverId: string
  suspensionId: string
  suspensionLiftedOn: string
}

export type SuperFormulaOfficialSuspensionServedResult = {
  season: SuperFormulaSeasonState
  transition: SuperFormula2026SuspensionServedTransition
}

/**
 * Clears Article 5 points only after the pending next-event suspension is
 * explicitly recorded as served and lifted by an official result.
 */
export function recordOfficialSuperFormulaSuspensionServed(
  season: SuperFormulaSeasonState,
  record: SuperFormulaOfficialSuspensionServedRecord,
): SuperFormulaOfficialSuspensionServedResult {
  const ledger = superFormulaPenaltyLedgerForDriver(season, record.driverId)
  const transition = serveSuperFormula2026NextEventSuspension({
    ledger,
    suspensionId: record.suspensionId,
    suspensionLiftedOn: record.suspensionLiftedOn,
  })

  return {
    season: withSuperFormulaPenaltyLedger(
      season,
      record.driverId,
      transition.ledger,
    ),
    transition,
  }
}

export type SuperFormulaNextEventEligibility = {
  driverId: string
  ledger: SuperFormula2026PenaltyPointLedger
  status: 'eligible' | 'next-event-suspension-pending'
  suspension: SuperFormula2026NextEventSuspension | null
}

/**
 * Category-specific entry gate for the next event. Callers must not start a
 * driver with a pending Article 5 suspension; serving it remains an explicit
 * official transition rather than a simulated race-side effect.
 */
export function superFormulaNextEventEligibility(
  season: SuperFormulaSeasonState,
  driverId: string,
): SuperFormulaNextEventEligibility {
  const ledger = superFormulaPenaltyLedgerForDriver(season, driverId)
  const suspension =
    ledger.suspensions.find((candidate) => candidate.servedOn === null) ?? null

  return {
    driverId,
    ledger,
    status:
      suspension === null ? 'eligible' : 'next-event-suspension-pending',
    suspension,
  }
}

/**
 * Production entrant gate for a SUPER FORMULA event. The returned list is
 * deliberately derived only from the Article 5 official ledger; it does not
 * inspect the shared simulator penalty counter or incident history.
 */
export function eligibleSuperFormulaDriversForNextEvent(
  season: SuperFormulaSeasonState,
  drivers: readonly Driver[],
): Driver[] {
  return drivers.filter(
    (driver) =>
      superFormulaNextEventEligibility(season, driver.id).status === 'eligible',
  )
}

export function applySeasonGarageToWeekend(
  weekend: WeekendContext,
  season: SeasonState,
  drivers: Driver[],
): WeekendContext {
  if (weekend.seriesId !== season.seriesId) {
    return weekend
  }

  if (
    weekend.seriesId === 'super-formula' &&
    season.seriesId === 'super-formula'
  ) {
    return {
      ...weekend,
      engineLedgerByEntrant: {
        ...weekend.engineLedgerByEntrant,
        ...season.garage.engineLedgerByEntrant,
      },
    }
  }

  if (weekend.seriesId !== 'f1-custom' || season.seriesId !== 'f1-custom') {
    return weekend
  }

  const componentConditionByDriver = {
    ...weekend.componentConditionByDriver,
  }
  const gridPenaltyByDriver = { ...weekend.gridPenaltyByDriver }

  for (const driver of drivers) {
    componentConditionByDriver[driver.id] = normalizeF1CarComponents(
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
  season: F1SeasonState,
  cars: CarSnapshot[],
): F1SeasonState
export function updateSeasonGarageFromCars(
  season: SuperFormulaSeasonState,
  cars: CarSnapshot[],
): SuperFormulaSeasonState
export function updateSeasonGarageFromCars(
  season: SeasonState,
  cars: CarSnapshot[],
): SeasonState
export function updateSeasonGarageFromCars(
  season: SeasonState,
  cars: CarSnapshot[],
): SeasonState {
  if (season.seriesId === 'super-formula') {
    return {
      ...season,
      garage: {
        ...season.garage,
        engineLedgerByEntrant: cars.reduce<
          SuperFormulaSeasonGarageState['engineLedgerByEntrant']
        >(
          (ledgers, car) =>
            isSuperFormulaRuntimeSystems(car.runtimeSystems)
              ? {
                  ...ledgers,
                  [car.runtimeSystems.engineLedger.entrantId]:
                    car.runtimeSystems.engineLedger,
                }
              : ledgers,
          { ...season.garage.engineLedgerByEntrant },
        ),
      },
    }
  }

  return {
    ...season,
    garage: {
      ...season.garage,
      componentsByDriver: {
        ...season.garage.componentsByDriver,
        ...Object.fromEntries(
          cars.flatMap((car) =>
            isF1RuntimeSystems(car.runtimeSystems)
              ? [
                  [
                    car.driverId,
                    normalizeF1CarComponents(car.runtimeSystems.components),
                  ] as const,
                ]
              : [],
          ),
        ),
      },
    },
  }
}

export function updateSeasonGarageReplacement(
  season: F1SeasonState,
  driverId: string,
  components: CarComponents,
  addedGridPenalty: number,
): F1SeasonState {
  return {
    ...season,
    garage: {
      componentsByDriver: {
        ...season.garage.componentsByDriver,
        [driverId]: normalizeF1CarComponents(components),
      },
      pendingGridPenaltyByDriver: {
        ...season.garage.pendingGridPenaltyByDriver,
        [driverId]:
          (season.garage.pendingGridPenaltyByDriver[driverId] ?? 0) +
          Math.max(0, addedGridPenalty),
      },
      kind: 'f1',
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
  const seasonAfterGarage = updateSeasonGarageFromCars(season, options.cars)
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

  const common = {
    completedRounds: [...season.completedRounds, options.roundId],
    driverPoints,
    teamPoints,
    driverResults,
    teamResults,
    resultArchive: [
      ...(season.resultArchive ?? []),
      resultSnapshot,
    ].slice(-64),
  }

  if (seasonAfterGarage.seriesId === 'f1-custom') {
    return {
      ...seasonAfterGarage,
      ...common,
      garage: {
        ...seasonAfterGarage.garage,
        pendingGridPenaltyByDriver:
          options.stage === 'race' || options.stage === 'race2'
            ? {}
            : seasonAfterGarage.garage.pendingGridPenaltyByDriver,
      },
    }
  }

  return {
    ...seasonAfterGarage,
    ...common,
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
