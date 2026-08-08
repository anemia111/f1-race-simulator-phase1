import historicalDriverPoolJson from '../data/historicalDriverPool2026.json'
import {
  expandedDriverSkills,
  type CompactDriverRatings,
} from '../data/driverProfiles'
import {
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_LIMIT_BREAK_MAX,
} from '../simulation/driverAbility'
import type { Driver, DriverStyleProfile } from '../types'
import {
  isDriverSourceSeriesId,
  isExecutableSeriesId,
  type DriverSourceSeriesId,
  type ExecutableSeriesId,
} from './seriesIds'

export type { CompactDriverRatings } from '../data/driverProfiles'

export const HISTORICAL_DRIVER_POOL_SOURCE_FILE =
  'src/data/motorsportSeries2026.json'
export const HISTORICAL_DRIVER_POOL_METHOD_VERSION =
  'seriesRegistry.compactRatingsFor.v1'

export type DriverRatingSourceType =
  | 'observed'
  | 'derived'
  | 'editorial'
  | 'synthetic'

export type DriverRatingConfidence = 'high' | 'medium' | 'low'

export type DriverSourceTeamSnapshot = {
  /** Historical source identifier; this is not a live Team foreign key. */
  sourceId: string
  name: string
}

export type DriverSourceRole =
  | 'regular'
  | 'reserve'
  | 'development'
  | 'substitute'
  | 'test'

export type DriverPoolProvenance = {
  id: string
  sourceType: DriverRatingSourceType
  sourceSeason?: number
  sourceSeriesId: DriverSourceSeriesId
  sourceTeam?: DriverSourceTeamSnapshot
  sourceCarNumber?: number
  sourceRole?: DriverSourceRole
  sourceFile: string
  sourceDate: string
  sourceIds: string[]
  methodVersion?: string
  confidence: DriverRatingConfidence
}

export type DriverRatingProvenance = DriverPoolProvenance

export type DriverCareerEntry = {
  season: number
  seriesId: DriverSourceSeriesId
  /** Historical snapshot identifier; never resolve it as a live Team key. */
  sourceTeamId?: string
  sourceTeamName?: string
  sourceCarNumber?: number
  role: DriverSourceRole
  sourceIds: string[]
}

export type DriverPoolRecord = {
  id: string
  code: string
  name: string
  nationality: string
  /** Published 0-100 points, with the existing 120 limit-break ceiling. */
  overall: number
  /** Physics-facing normalized ratings. Historical source metadata is excluded. */
  ratings: CompactDriverRatings
  /** Published 0-100 points, with the existing 120 limit-break ceiling. */
  potential: number
  ratingSourceProvenanceId: string
  provenance: [DriverPoolProvenance, ...DriverPoolProvenance[]]
  careerHistory: [DriverCareerEntry, ...DriverCareerEntry[]]
}

export type DriverPoolValidationOptions = {
  expectedIdentityCount?: number
  expectedProvenanceCount?: number
  expectedProvenanceBySourceSeries?: Partial<
    Record<DriverSourceSeriesId, number>
  >
}

export type HistoricalDriverPoolDocument = {
  schemaVersion: 1
  generationType: 'derived'
  ratingSourceType: 'synthetic'
  sourceFile: string
  sourceDate: string
  methodVersion: string
  drivers: DriverPoolRecord[]
}

const compactRatingKeys = [
  'adaptability',
  'consistency',
  'defending',
  'errorControl',
  'experience',
  'overtaking',
  'qualifyingPace',
  'racePace',
  'raceStart',
  'technicalFeedback',
  'tyreManagement',
  'wetSkill',
] as const satisfies readonly (keyof CompactDriverRatings)[]

const ratingSourceTypes = new Set<DriverRatingSourceType>([
  'observed',
  'derived',
  'editorial',
  'synthetic',
])
const ratingConfidences = new Set<DriverRatingConfidence>([
  'high',
  'medium',
  'low',
])
const driverSourceRoles = new Set<DriverSourceRole>([
  'regular',
  'reserve',
  'development',
  'substitute',
  'test',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function assertExpectedCount(label: string, value: unknown) {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || (value as number) < 0)
  ) {
    throw new Error(`Invalid driver-pool validation option: ${label}`)
  }
}

function validateCompactRatings(
  input: unknown,
  label: string,
): asserts input is CompactDriverRatings {
  if (!isRecord(input)) {
    throw new Error(`Invalid ${label}: expected compact ratings`)
  }

  if (
    Object.keys(input).length !== compactRatingKeys.length ||
    compactRatingKeys.some(
      (key) =>
        !isBoundedNumber(input[key], 0, DRIVER_ABILITY_INTERNAL_MAX),
    )
  ) {
    throw new Error(
      `Invalid ${label}: compact ratings must contain all twelve 0-${DRIVER_ABILITY_INTERNAL_MAX} axes`,
    )
  }
}

function validateSourceTeamSnapshot(
  input: unknown,
  label: string,
): asserts input is DriverSourceTeamSnapshot {
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.sourceId) ||
    !isNonEmptyString(input.name) ||
    'teamId' in input
  ) {
    throw new Error(`Invalid ${label}: malformed historical team snapshot`)
  }
}

function validateProvenance(
  input: unknown,
  label: string,
): asserts input is DriverPoolProvenance {
  if (!isRecord(input)) {
    throw new Error(`Invalid ${label}: expected provenance object`)
  }

  if (
    !isNonEmptyString(input.id) ||
    !ratingSourceTypes.has(input.sourceType as DriverRatingSourceType) ||
    !isDriverSourceSeriesId(input.sourceSeriesId) ||
    !isNonEmptyString(input.sourceFile) ||
    !isIsoDate(input.sourceDate) ||
    !ratingConfidences.has(input.confidence as DriverRatingConfidence) ||
    'teamId' in input
  ) {
    throw new Error(`Invalid ${label}: identity or source metadata`)
  }

  if (
    input.sourceSeason !== undefined &&
    (!Number.isSafeInteger(input.sourceSeason) ||
      (input.sourceSeason as number) < 1900 ||
      (input.sourceSeason as number) > 2200)
  ) {
    throw new Error(`Invalid ${label}: sourceSeason`)
  }

  if (
    input.sourceCarNumber !== undefined &&
    (!Number.isSafeInteger(input.sourceCarNumber) ||
      (input.sourceCarNumber as number) < 0 ||
      (input.sourceCarNumber as number) > 999)
  ) {
    throw new Error(`Invalid ${label}: sourceCarNumber`)
  }

  if (
    input.sourceRole !== undefined &&
    !driverSourceRoles.has(input.sourceRole as DriverSourceRole)
  ) {
    throw new Error(`Invalid ${label}: sourceRole`)
  }

  if (input.sourceTeam !== undefined) {
    validateSourceTeamSnapshot(input.sourceTeam, `${label} sourceTeam`)
  }

  if (
    !Array.isArray(input.sourceIds) ||
    input.sourceIds.length === 0 ||
    input.sourceIds.some((sourceId) => !isNonEmptyString(sourceId)) ||
    new Set(input.sourceIds).size !== input.sourceIds.length
  ) {
    throw new Error(`Invalid ${label}: sourceIds must be nonempty and unique`)
  }

  if (
    input.methodVersion !== undefined &&
    !isNonEmptyString(input.methodVersion)
  ) {
    throw new Error(`Invalid ${label}: methodVersion`)
  }

  if (
    (input.sourceType === 'derived' || input.sourceType === 'synthetic') &&
    !isNonEmptyString(input.methodVersion)
  ) {
    throw new Error(
      `Invalid ${label}: ${input.sourceType} ratings require methodVersion`,
    )
  }
}

function validateCareerEntry(
  input: unknown,
  label: string,
): asserts input is DriverCareerEntry {
  if (
    !isRecord(input) ||
    !Number.isSafeInteger(input.season) ||
    (input.season as number) < 1900 ||
    (input.season as number) > 2200 ||
    !isDriverSourceSeriesId(input.seriesId) ||
    !driverSourceRoles.has(input.role as DriverSourceRole) ||
    'teamId' in input ||
    'carNumber' in input
  ) {
    throw new Error(`Invalid ${label}: identity or live seat data`)
  }

  if (
    (input.sourceTeamId !== undefined &&
      !isNonEmptyString(input.sourceTeamId)) ||
    (input.sourceTeamName !== undefined &&
      !isNonEmptyString(input.sourceTeamName)) ||
    (input.sourceTeamId === undefined) !==
      (input.sourceTeamName === undefined)
  ) {
    throw new Error(
      `Invalid ${label}: historical team id and name must be a complete snapshot`,
    )
  }

  if (
    input.sourceCarNumber !== undefined &&
    (!Number.isSafeInteger(input.sourceCarNumber) ||
      (input.sourceCarNumber as number) < 0 ||
      (input.sourceCarNumber as number) > 999)
  ) {
    throw new Error(`Invalid ${label}: sourceCarNumber`)
  }

  if (
    !Array.isArray(input.sourceIds) ||
    input.sourceIds.length === 0 ||
    input.sourceIds.some((sourceId) => !isNonEmptyString(sourceId)) ||
    new Set(input.sourceIds).size !== input.sourceIds.length
  ) {
    throw new Error(`Invalid ${label}: sourceIds must be nonempty and unique`)
  }
}

/**
 * Strictly validates driver-pool identities without mutating the input.
 * Optional counts let callers enforce either the 52-record migration subset or
 * the later canonical 110-identity/111-provenance aggregate.
 */
export function validateDriverPool(
  input: unknown,
  options: DriverPoolValidationOptions = {},
): DriverPoolRecord[] {
  assertExpectedCount('expectedIdentityCount', options.expectedIdentityCount)
  assertExpectedCount(
    'expectedProvenanceCount',
    options.expectedProvenanceCount,
  )

  for (const [seriesId, expectedCount] of Object.entries(
    options.expectedProvenanceBySourceSeries ?? {},
  )) {
    if (!isDriverSourceSeriesId(seriesId)) {
      throw new Error(
        `Invalid driver-pool validation option: unknown source series ${seriesId}`,
      )
    }
    assertExpectedCount(
      `expectedProvenanceBySourceSeries.${seriesId}`,
      expectedCount,
    )
  }

  if (!Array.isArray(input)) {
    throw new Error('Driver pool must be an array')
  }

  if (
    options.expectedIdentityCount !== undefined &&
    input.length !== options.expectedIdentityCount
  ) {
    throw new Error(
      `Driver pool expected ${options.expectedIdentityCount} identities, received ${input.length}`,
    )
  }

  const driverIds = new Set<string>()
  const provenanceIds = new Set<string>()
  const provenanceBySourceSeries = new Map<DriverSourceSeriesId, number>()
  let provenanceCount = 0

  for (const [index, value] of input.entries()) {
    const label = `driver-pool record ${index}`

    if (
      !isRecord(value) ||
      !isNonEmptyString(value.id) ||
      !isNonEmptyString(value.code) ||
      !isNonEmptyString(value.name) ||
      !isNonEmptyString(value.nationality) ||
      !isBoundedNumber(value.overall, 0, DRIVER_ABILITY_LIMIT_BREAK_MAX) ||
      !isBoundedNumber(value.potential, 0, DRIVER_ABILITY_LIMIT_BREAK_MAX) ||
      !isNonEmptyString(value.ratingSourceProvenanceId) ||
      'teamId' in value ||
      'carNumber' in value
    ) {
      throw new Error(`Invalid ${label}: identity, rating bounds, or live seat data`)
    }

    if (driverIds.has(value.id)) {
      throw new Error(`Invalid ${label}: duplicate driver id ${value.id}`)
    }
    driverIds.add(value.id)
    validateCompactRatings(value.ratings, `${label} ratings`)

    if (!Array.isArray(value.provenance) || value.provenance.length === 0) {
      throw new Error(`Invalid ${label}: provenance must be nonempty`)
    }

    if (!Array.isArray(value.careerHistory) || value.careerHistory.length === 0) {
      throw new Error(`Invalid ${label}: careerHistory must be nonempty`)
    }

    const recordProvenanceIds = new Set<string>()

    for (const [provenanceIndex, provenance] of value.provenance.entries()) {
      const provenanceLabel = `${label} provenance ${provenanceIndex}`
      validateProvenance(provenance, provenanceLabel)

      if (provenanceIds.has(provenance.id)) {
        throw new Error(
          `Invalid ${provenanceLabel}: duplicate provenance id ${provenance.id}`,
        )
      }
      provenanceIds.add(provenance.id)
      recordProvenanceIds.add(provenance.id)
      provenanceCount += 1
      provenanceBySourceSeries.set(
        provenance.sourceSeriesId,
        (provenanceBySourceSeries.get(provenance.sourceSeriesId) ?? 0) + 1,
      )
    }

    if (!recordProvenanceIds.has(value.ratingSourceProvenanceId)) {
      throw new Error(
        `Invalid ${label}: ratingSourceProvenanceId does not reference this driver`,
      )
    }

    for (const [careerIndex, careerEntry] of value.careerHistory.entries()) {
      validateCareerEntry(careerEntry, `${label} careerHistory ${careerIndex}`)
    }
  }

  if (
    options.expectedProvenanceCount !== undefined &&
    provenanceCount !== options.expectedProvenanceCount
  ) {
    throw new Error(
      `Driver pool expected ${options.expectedProvenanceCount} provenance records, received ${provenanceCount}`,
    )
  }

  for (const [seriesId, expectedCount] of Object.entries(
    options.expectedProvenanceBySourceSeries ?? {},
  ) as [DriverSourceSeriesId, number][]) {
    const actualCount = provenanceBySourceSeries.get(seriesId) ?? 0

    if (actualCount !== expectedCount) {
      throw new Error(
        `Driver pool expected ${expectedCount} ${seriesId} provenance records, received ${actualCount}`,
      )
    }
  }

  return input as DriverPoolRecord[]
}

/** Validates the mechanically generated, F2/F3-only migration artifact. */
export function validateHistoricalDriverPoolDocument(
  input: unknown,
): HistoricalDriverPoolDocument {
  if (
    !isRecord(input) ||
    input.schemaVersion !== 1 ||
    input.generationType !== 'derived' ||
    input.ratingSourceType !== 'synthetic' ||
    input.sourceFile !== HISTORICAL_DRIVER_POOL_SOURCE_FILE ||
    !isIsoDate(input.sourceDate) ||
    input.methodVersion !== HISTORICAL_DRIVER_POOL_METHOD_VERSION
  ) {
    throw new Error('Invalid historical driver-pool document metadata')
  }

  const drivers = validateDriverPool(input.drivers, {
    expectedIdentityCount: 52,
    expectedProvenanceCount: 52,
    expectedProvenanceBySourceSeries: { f2: 22, f3: 30 },
  })

  for (const driver of drivers) {
    if (driver.provenance.length !== 1) {
      throw new Error(
        `Historical driver ${driver.id} must have one source snapshot`,
      )
    }

    const source = driver.provenance[0]
    const career = driver.careerHistory[0]

    if (
      driver.careerHistory.length !== 1 ||
      (source.sourceSeriesId !== 'f2' && source.sourceSeriesId !== 'f3') ||
      source.sourceType !== 'synthetic' ||
      source.sourceSeason !== 2026 ||
      source.sourceTeam === undefined ||
      source.sourceCarNumber === undefined ||
      source.sourceRole !== 'regular' ||
      source.sourceFile !== input.sourceFile ||
      source.sourceDate !== input.sourceDate ||
      source.methodVersion !== input.methodVersion ||
      career.season !== source.sourceSeason ||
      career.seriesId !== source.sourceSeriesId ||
      career.sourceTeamId !== source.sourceTeam.sourceId ||
      career.sourceTeamName !== source.sourceTeam.name ||
      career.sourceCarNumber !== source.sourceCarNumber ||
      career.role !== source.sourceRole ||
      career.sourceIds.length !== source.sourceIds.length ||
      career.sourceIds.some(
        (sourceId, index) => sourceId !== source.sourceIds[index],
      )
    ) {
      throw new Error(
        `Historical driver ${driver.id} is missing its explicit F2/F3 source snapshot`,
      )
    }
  }

  return {
    schemaVersion: 1,
    generationType: 'derived',
    ratingSourceType: 'synthetic',
    sourceFile: input.sourceFile,
    sourceDate: input.sourceDate,
    methodVersion: input.methodVersion,
    drivers,
  }
}

const historicalDriverPoolDocument = validateHistoricalDriverPoolDocument(
  historicalDriverPoolJson,
)

/** The 52 F2/F3 identities retained as pool-only historical records. */
export const historicalDriverPool2026 = historicalDriverPoolDocument.drivers

export const historicalDriverPool2026Audit = {
  identityCount: historicalDriverPool2026.length,
  provenanceCount: historicalDriverPool2026.reduce(
    (count, driver) => count + driver.provenance.length,
    0,
  ),
  f2Count: historicalDriverPool2026.filter(
    (driver) => driver.provenance[0].sourceSeriesId === 'f2',
  ).length,
  f3Count: historicalDriverPool2026.filter(
    (driver) => driver.provenance[0].sourceSeriesId === 'f3',
  ).length,
  sourceFile: historicalDriverPoolDocument.sourceFile,
  sourceDate: historicalDriverPoolDocument.sourceDate,
  methodVersion: historicalDriverPoolDocument.methodVersion,
  ratingSourceType: historicalDriverPoolDocument.ratingSourceType,
} as const

export type DriverSeatAssignment = {
  seriesId: ExecutableSeriesId
  season: number
  teamId: string
  carNumber: number
  seatRole?: NonNullable<Driver['seatRole']>
  startOffset?: number
  tire?: Driver['tire']
}

const neutralDriverStyle: DriverStyleProfile = {
  brakingAggression: 0.5,
  cornerShapePreference: 0,
  frontEndPreference: 0,
  oversteerTolerance: 0.5,
  rearStabilityNeed: 0,
  understeerTolerance: 0.5,
}

function validateSeatAssignment(seat: DriverSeatAssignment) {
  if (
    !isExecutableSeriesId(seat.seriesId) ||
    !Number.isSafeInteger(seat.season) ||
    seat.season < 1900 ||
    seat.season > 2200 ||
    !isNonEmptyString(seat.teamId) ||
    !Number.isSafeInteger(seat.carNumber) ||
    seat.carNumber < 0 ||
    seat.carNumber > 999 ||
    (seat.startOffset !== undefined && !Number.isFinite(seat.startOffset))
  ) {
    throw new Error('Invalid driver seat assignment')
  }
}

function rawRatingsFor(driver: DriverPoolRecord) {
  return {
    Overall: driver.overall,
    Potential: driver.potential,
    'Qualifying pace': Math.round(driver.ratings.qualifyingPace * 100),
    'Race pace': Math.round(driver.ratings.racePace * 100),
    Consistency: Math.round(driver.ratings.consistency * 100),
    'Tyre management': Math.round(driver.ratings.tyreManagement * 100),
    'Wet skill': Math.round(driver.ratings.wetSkill * 100),
    'Race start': Math.round(driver.ratings.raceStart * 100),
    Overtaking: Math.round(driver.ratings.overtaking * 100),
    Defending: Math.round(driver.ratings.defending * 100),
    'Technical feedback': Math.round(
      driver.ratings.technicalFeedback * 100,
    ),
    Adaptability: Math.round(driver.ratings.adaptability * 100),
    Experience: Math.round(driver.ratings.experience * 100),
    'Error control': Math.round(driver.ratings.errorControl * 100),
  }
}

/**
 * Materializes a pool identity into a live seat.
 *
 * Only compact ratings feed the physics-facing skill profile. The target seat
 * owns the runtime team and number; source series/team/number provenance is
 * presentation and audit metadata only.
 */
export function materializeAssignedDriver(
  poolDriver: DriverPoolRecord,
  seat: DriverSeatAssignment,
): Driver {
  validateDriverPool([poolDriver], {
    expectedIdentityCount: 1,
  })
  validateSeatAssignment(seat)

  const ratingSource = poolDriver.provenance.find(
    (source) => source.id === poolDriver.ratingSourceProvenanceId,
  )!

  return {
    carNumber: seat.carNumber,
    code: poolDriver.code,
    id: poolDriver.id,
    name: poolDriver.name,
    nationality: poolDriver.nationality,
    performanceSource: {
      fileName: ratingSource.sourceFile,
      overall: poolDriver.overall,
      rawRatings: rawRatingsFor(poolDriver),
    },
    potential: poolDriver.potential / 100,
    seatRole: seat.seatRole ?? 'regular',
    skills: expandedDriverSkills(poolDriver.ratings),
    startOffset: seat.startOffset ?? 0,
    style: { ...neutralDriverStyle },
    teamId: seat.teamId,
    tire: seat.tire ?? 'M',
  }
}

export type ReplaceSeriesSeatContext = {
  seriesId: ExecutableSeriesId
  season: number
}

/** Returns a new field with one existing seat occupied by the pool driver. */
export function replaceSeriesSeat(
  drivers: readonly Driver[],
  outgoingDriverId: string,
  incomingDriver: DriverPoolRecord,
  context: ReplaceSeriesSeatContext,
): Driver[] {
  if (!isNonEmptyString(outgoingDriverId)) {
    throw new Error('A target driver id is required to replace a series seat')
  }

  const targetIndexes = drivers.flatMap((driver, index) =>
    driver.id === outgoingDriverId ? [index] : [],
  )
  const targetIndex = targetIndexes[0]

  if (targetIndex === undefined) {
    throw new Error(`Cannot replace missing series seat ${outgoingDriverId}`)
  }
  if (targetIndexes.length !== 1) {
    throw new Error(`Cannot replace ambiguous series seat ${outgoingDriverId}`)
  }

  if (
    drivers.some(
      (driver, index) =>
        index !== targetIndex && driver.id === incomingDriver.id,
    )
  ) {
    throw new Error(
      `Driver ${incomingDriver.id} already occupies another series seat`,
    )
  }

  const target = drivers[targetIndex]
  const replacement = materializeAssignedDriver(incomingDriver, {
    seriesId: context.seriesId,
    season: context.season,
    teamId: target.teamId,
    carNumber: target.carNumber,
    seatRole: target.seatRole,
    startOffset: target.startOffset,
    tire: target.tire,
  })

  return drivers.map((driver, index) =>
    index === targetIndex ? replacement : driver,
  )
}

export type DriverAssignmentRole = DriverSourceRole

export type DriverAssignment = {
  active: boolean
  carNumber: number | null
  driverId: string
  role: DriverAssignmentRole
  season: number
  seriesId: ExecutableSeriesId
  teamId: string
}

export type DriverAssignmentTeam = {
  id: string
  seriesId: ExecutableSeriesId
  seatCapacity: number
}

export type DriverAssignmentValidationContext = {
  driverPool: readonly Pick<DriverPoolRecord, 'id'>[]
  teams: readonly DriverAssignmentTeam[]
  expectedSeason?: number
  seriesCarCapacity?: Partial<Record<ExecutableSeriesId, number>>
}

const driverAssignmentRoles = new Set<DriverAssignmentRole>(driverSourceRoles)

/** Validates executable-series assignments and their active-seat invariants. */
export function validateDriverAssignments(
  input: unknown,
  context: DriverAssignmentValidationContext,
): DriverAssignment[] {
  if (!Array.isArray(input)) {
    throw new Error('Driver assignments must be an array')
  }

  const poolIds = new Set(context.driverPool.map((driver) => driver.id))
  if (poolIds.size !== context.driverPool.length) {
    throw new Error('Driver assignment context has duplicate pool identities')
  }

  const teamByKey = new Map<string, DriverAssignmentTeam>()
  for (const team of context.teams) {
    if (
      !isExecutableSeriesId(team.seriesId) ||
      !isNonEmptyString(team.id) ||
      !Number.isSafeInteger(team.seatCapacity) ||
      team.seatCapacity < 0
    ) {
      throw new Error('Driver assignment context has an invalid team')
    }
    const key = `${team.seriesId}:${team.id}`
    if (teamByKey.has(key)) {
      throw new Error(`Driver assignment context has duplicate team ${key}`)
    }
    teamByKey.set(key, team)
  }

  if (
    context.expectedSeason !== undefined &&
    (!Number.isSafeInteger(context.expectedSeason) ||
      context.expectedSeason < 1900 ||
      context.expectedSeason > 2200)
  ) {
    throw new Error('Driver assignment context has an invalid expectedSeason')
  }

  for (const [seriesId, capacity] of Object.entries(
    context.seriesCarCapacity ?? {},
  )) {
    if (
      !isExecutableSeriesId(seriesId) ||
      !Number.isSafeInteger(capacity) ||
      (capacity as number) < 0
    ) {
      throw new Error('Driver assignment context has an invalid series capacity')
    }
  }

  const activeDriverSeries = new Set<string>()
  const activeRegularDrivers = new Set<string>()
  const activeCarNumbers = new Set<string>()
  const activeTeamSeatCounts = new Map<string, number>()
  const activeSeriesSeatCounts = new Map<string, number>()

  for (const [index, value] of input.entries()) {
    const label = `driver assignment ${index}`
    if (
      !isRecord(value) ||
      typeof value.active !== 'boolean' ||
      !isNonEmptyString(value.driverId) ||
      !driverAssignmentRoles.has(value.role as DriverAssignmentRole) ||
      !Number.isSafeInteger(value.season) ||
      (value.season as number) < 1900 ||
      (value.season as number) > 2200 ||
      !isExecutableSeriesId(value.seriesId) ||
      !isNonEmptyString(value.teamId) ||
      (value.carNumber !== null &&
        (!Number.isSafeInteger(value.carNumber) ||
          (value.carNumber as number) < 0 ||
          (value.carNumber as number) > 999))
    ) {
      throw new Error(`Invalid ${label}`)
    }

    if (!poolIds.has(value.driverId)) {
      throw new Error(`Invalid ${label}: driver is not in the pool`)
    }

    const teamKey = `${value.seriesId}:${value.teamId}`
    const team = teamByKey.get(teamKey)
    if (!team) {
      throw new Error(`Invalid ${label}: target team does not exist`)
    }

    if (
      context.expectedSeason !== undefined &&
      value.season !== context.expectedSeason
    ) {
      throw new Error(`Invalid ${label}: season does not match the session`)
    }

    if (!value.active) continue

    const driverSeriesKey = `${value.season}:${value.seriesId}:${value.driverId}`
    if (activeDriverSeries.has(driverSeriesKey)) {
      throw new Error(`Invalid ${label}: duplicate active driver/series`)
    }
    activeDriverSeries.add(driverSeriesKey)

    if (value.role === 'regular' || value.role === 'substitute') {
      const regularKey = `${value.season}:${value.driverId}`
      if (activeRegularDrivers.has(regularKey)) {
        throw new Error(`Invalid ${label}: driver has multiple active regular seats`)
      }
      activeRegularDrivers.add(regularKey)
    }

    if (
      value.carNumber === null &&
      (value.role === 'regular' || value.role === 'substitute')
    ) {
      throw new Error(`Invalid ${label}: an active race seat needs a car number`)
    }

    if (value.carNumber === null) continue

    const carNumberKey = `${value.season}:${value.seriesId}:${value.carNumber}`
    if (activeCarNumbers.has(carNumberKey)) {
      throw new Error(`Invalid ${label}: duplicate active car number`)
    }
    activeCarNumbers.add(carNumberKey)

    const teamCount = (activeTeamSeatCounts.get(teamKey) ?? 0) + 1
    if (teamCount > team.seatCapacity) {
      throw new Error(`Invalid ${label}: target team exceeds seat capacity`)
    }
    activeTeamSeatCounts.set(teamKey, teamCount)

    const seriesKey = `${value.season}:${value.seriesId}`
    const seriesCount = (activeSeriesSeatCounts.get(seriesKey) ?? 0) + 1
    const seriesCapacity = context.seriesCarCapacity?.[value.seriesId]
    if (seriesCapacity !== undefined && seriesCount > seriesCapacity) {
      throw new Error(`Invalid ${label}: series exceeds car capacity`)
    }
    activeSeriesSeatCounts.set(seriesKey, seriesCount)
  }

  return input as DriverAssignment[]
}
