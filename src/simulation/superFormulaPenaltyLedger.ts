import {
  superFormulaOperationalRules2026,
  type SuperFormulaRuleProvenance,
} from '../data/superFormulaRules2026'

/**
 * Article 5 is an entrant-independent, driver-specific discipline record.
 * This intentionally has no FIA/F1 penalty-ledger compatibility shape: a
 * SUPER FORMULA suspension is assessed for the next event and its tally is
 * cleared only when that suspension is explicitly recorded as lifted.
 */
export type SuperFormula2026PenaltyPointEntry = {
  readonly assessedOn: string
  readonly clearedBySuspensionId: string | null
  readonly clearedOn: string | null
  readonly expiresOn: string
  readonly id: string
  readonly points: number
}

export type SuperFormula2026NextEventSuspension = {
  readonly assessedOn: string
  readonly clearedPointEntryIds: readonly string[] | null
  readonly id: string
  readonly kind: 'next-event-suspension'
  readonly relevantPointEntryIds: readonly string[]
  readonly servedOn: string | null
  readonly tallyAtAssessment: number
  readonly thresholdPoints: number
}

export type SuperFormula2026PenaltyPointLedger = {
  readonly driverId: string
  readonly kind: 'super-formula-2026-penalty-point-ledger'
  readonly latestTransitionOn: string | null
  readonly pointEntries: readonly SuperFormula2026PenaltyPointEntry[]
  readonly ruleProvenance: {
    readonly suspension: SuperFormulaRuleProvenance
    readonly validity: SuperFormulaRuleProvenance
  }
  readonly schemaVersion: 1
  readonly seasonYear: 2026
  readonly seriesId: 'super-formula'
  readonly suspensions: readonly SuperFormula2026NextEventSuspension[]
}

export type SuperFormula2026PenaltyPointTally = {
  readonly activeEntries: readonly SuperFormula2026PenaltyPointEntry[]
  readonly asOf: string
  readonly points: number
  readonly thresholdPoints: number
}

export type SuperFormula2026PenaltySuspensionAssessment = {
  readonly ledger: SuperFormula2026PenaltyPointLedger
  readonly status:
    | 'below-suspension-threshold'
    | 'next-event-suspension-assessed'
    | 'next-event-suspension-pending'
  readonly suspension: SuperFormula2026NextEventSuspension | null
  readonly tally: SuperFormula2026PenaltyPointTally
}

export type SuperFormula2026SuspensionServedTransition = {
  readonly ledger: SuperFormula2026PenaltyPointLedger
  readonly servedSuspension: SuperFormula2026NextEventSuspension
}

export type SuperFormula2026PenaltyPointLedgerValidation =
  | {
      readonly issues: readonly string[]
      readonly valid: false
    }
  | {
      readonly issues: readonly []
      readonly ledger: SuperFormula2026PenaltyPointLedger
      readonly valid: true
    }

type ParsedDate = {
  readonly day: number
  readonly month: number
  readonly year: number
}

type VerifiedPenaltyPointRules = {
  readonly suspensionProvenance: SuperFormulaRuleProvenance
  readonly thresholdPoints: {
    readonly afterFirstServedSuspension: number
    readonly afterSubsequentServedSuspension: number
    readonly initial: number
  }
  readonly validityMonths: number
  readonly validityProvenance: SuperFormulaRuleProvenance
}

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const hasExactlyKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const daysInMonth = (year: number, month: number) => {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

const parseIsoDate = (value: string, label: string): ParsedDate => {
  const match = isoDatePattern.exec(value)
  if (!match) {
    throw new TypeError(`${label} must use canonical YYYY-MM-DD format.`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError(`${label} is not a valid Gregorian calendar date.`)
  }

  return { day, month, year }
}

const canonicalDate = (value: string, label: string) => {
  const { day, month, year } = parseIsoDate(value, label)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const compareDates = (left: string, right: string) =>
  left === right ? 0 : left < right ? -1 : 1

const isCanonicalDate = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false
  }

  try {
    return canonicalDate(value, 'Persisted date') === value
  } catch {
    return false
  }
}

const addContinuousMonths = (date: string, months: number) => {
  const { day, month, year } = parseIsoDate(date, 'Penalty-point assessment date')
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = (targetMonthIndex % 12) + 1
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth))

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
}

function requiredPenaltyPointRules(): VerifiedPenaltyPointRules {
  const validity = superFormulaOperationalRules2026.penaltyPoints.validity
  const suspension = superFormulaOperationalRules2026.penaltyPoints.suspension

  if (
    validity.availability !== 'verified' ||
    suspension.availability !== 'verified' ||
    !isPositiveSafeInteger(validity.value.continuousMonths) ||
    !isPositiveSafeInteger(suspension.value.thresholdPoints.initial) ||
    !isPositiveSafeInteger(
      suspension.value.thresholdPoints.afterFirstServedSuspension,
    ) ||
    !isPositiveSafeInteger(
      suspension.value.thresholdPoints.afterSubsequentServedSuspension,
    ) ||
    suspension.value.kind !== 'next-event-suspension' ||
    suspension.value.clearsRelevantTallyWhen !== 'suspension-is-lifted'
  ) {
    throw new Error('SUPER FORMULA 2026 Article 5 penalty-point rules are unavailable or incomplete.')
  }

  return {
    suspensionProvenance: suspension.provenance,
    thresholdPoints: suspension.value.thresholdPoints,
    validityMonths: validity.value.continuousMonths,
    validityProvenance: validity.provenance,
  }
}

const suspensionThresholdFor = (
  servedSuspensionCount: number,
  rules: VerifiedPenaltyPointRules,
) => {
  if (servedSuspensionCount === 0) {
    return rules.thresholdPoints.initial
  }

  return servedSuspensionCount === 1
    ? rules.thresholdPoints.afterFirstServedSuspension
    : rules.thresholdPoints.afterSubsequentServedSuspension
}

const servedSuspensionCountAt = (
  ledger: SuperFormula2026PenaltyPointLedger,
  asOf: string,
) =>
  ledger.suspensions.filter(
    (suspension) =>
      suspension.servedOn !== null &&
      compareDates(suspension.servedOn, asOf) <= 0,
  ).length

const pendingSuspensionFor = (
  ledger: SuperFormula2026PenaltyPointLedger,
) => ledger.suspensions.find((suspension) => suspension.servedOn === null) ?? null

const isActiveOn = (
  entry: SuperFormula2026PenaltyPointEntry,
  asOf: string,
) =>
  compareDates(entry.assessedOn, asOf) <= 0 &&
  compareDates(asOf, entry.expiresOn) < 0 &&
  (entry.clearedOn === null || compareDates(asOf, entry.clearedOn) < 0)

const assertTransitionDate = (
  ledger: SuperFormula2026PenaltyPointLedger,
  transitionOn: string,
) => {
  if (
    ledger.latestTransitionOn !== null &&
    compareDates(transitionOn, ledger.latestTransitionOn) < 0
  ) {
    throw new RangeError(
      `SUPER FORMULA penalty-ledger transitions must remain chronological (latest is ${ledger.latestTransitionOn}).`,
    )
  }
}

const ledgerFrom = (options: {
  readonly driverId: string
  readonly latestTransitionOn: string | null
  readonly pointEntries: readonly SuperFormula2026PenaltyPointEntry[]
  readonly rules: VerifiedPenaltyPointRules
  readonly suspensions: readonly SuperFormula2026NextEventSuspension[]
}): SuperFormula2026PenaltyPointLedger => ({
  driverId: options.driverId,
  kind: 'super-formula-2026-penalty-point-ledger',
  latestTransitionOn: options.latestTransitionOn,
  pointEntries: options.pointEntries,
  ruleProvenance: {
    suspension: options.rules.suspensionProvenance,
    validity: options.rules.validityProvenance,
  },
  schemaVersion: 1,
  seasonYear: 2026,
  seriesId: 'super-formula',
  suspensions: options.suspensions,
})

const sameProvenance = (
  value: unknown,
  expected: SuperFormulaRuleProvenance,
) =>
  isRecord(value) &&
  value.article === expected.article &&
  value.authority === expected.authority &&
  value.checksum === expected.checksum &&
  value.publishedAt === expected.publishedAt &&
  value.sourceId === expected.sourceId &&
  value.url === expected.url

const isActivePersistedEntryOn = (
  entry: SuperFormula2026PenaltyPointEntry,
  asOf: string,
) =>
  compareDates(entry.assessedOn, asOf) <= 0 &&
  compareDates(asOf, entry.expiresOn) < 0 &&
  (entry.clearedOn === null || compareDates(asOf, entry.clearedOn) < 0)

const isActiveImmediatelyBeforeClearingOn = (
  entry: SuperFormula2026PenaltyPointEntry,
  clearingOn: string,
) =>
  compareDates(entry.assessedOn, clearingOn) <= 0 &&
  compareDates(clearingOn, entry.expiresOn) < 0 &&
  (entry.clearedOn === null || entry.clearedOn === clearingOn)

/**
 * Strictly validates an Article 5 ledger at the persistence boundary. The
 * serialized rule provenance is checked against the current JAF source, and
 * every derived date and suspension relation is rebuilt from the saved
 * official decisions rather than trusted as an executable input.
 */
export function validateSuperFormula2026PenaltyPointLedger(
  input: unknown,
): SuperFormula2026PenaltyPointLedgerValidation {
  const invalid = (issue: string): SuperFormula2026PenaltyPointLedgerValidation => ({
    issues: [issue],
    valid: false,
  })
  let rules: VerifiedPenaltyPointRules

  try {
    rules = requiredPenaltyPointRules()
  } catch {
    return invalid('source-rules-unavailable')
  }

  if (!isRecord(input)) {
    return invalid('ledger-must-be-an-object')
  }
  if (
    !hasExactlyKeys(input, [
      'driverId',
      'kind',
      'latestTransitionOn',
      'pointEntries',
      'ruleProvenance',
      'schemaVersion',
      'seasonYear',
      'seriesId',
      'suspensions',
    ]) ||
    input.kind !== 'super-formula-2026-penalty-point-ledger' ||
    input.schemaVersion !== 1 ||
    input.seasonYear !== 2026 ||
    input.seriesId !== 'super-formula' ||
    typeof input.driverId !== 'string' ||
    input.driverId.trim().length === 0 ||
    !isRecord(input.ruleProvenance) ||
    !hasExactlyKeys(input.ruleProvenance, ['suspension', 'validity']) ||
    !sameProvenance(input.ruleProvenance.suspension, rules.suspensionProvenance) ||
    !sameProvenance(input.ruleProvenance.validity, rules.validityProvenance) ||
    !Array.isArray(input.pointEntries) ||
    !Array.isArray(input.suspensions) ||
    !(
      input.latestTransitionOn === null ||
      isCanonicalDate(input.latestTransitionOn)
    )
  ) {
    return invalid('invalid-ledger-schema-or-provenance')
  }

  const driverId = input.driverId.trim()
  const pointEntries: SuperFormula2026PenaltyPointEntry[] = []
  const pointIds = new Set<string>()
  let previousPointAssessment: string | null = null

  for (const rawEntry of input.pointEntries) {
    if (
      !isRecord(rawEntry) ||
      !hasExactlyKeys(rawEntry, [
        'assessedOn',
        'clearedBySuspensionId',
        'clearedOn',
        'expiresOn',
        'id',
        'points',
      ]) ||
      typeof rawEntry.id !== 'string' ||
      rawEntry.id.trim().length === 0 ||
      pointIds.has(rawEntry.id) ||
      !isPositiveSafeInteger(rawEntry.points) ||
      !isCanonicalDate(rawEntry.assessedOn) ||
      !isCanonicalDate(rawEntry.expiresOn) ||
      !(
        rawEntry.clearedOn === null || isCanonicalDate(rawEntry.clearedOn)
      ) ||
      !(
        rawEntry.clearedBySuspensionId === null ||
        (typeof rawEntry.clearedBySuspensionId === 'string' &&
          rawEntry.clearedBySuspensionId.trim().length > 0)
      ) ||
      (rawEntry.clearedOn === null) !== (rawEntry.clearedBySuspensionId === null) ||
      rawEntry.expiresOn !==
        addContinuousMonths(rawEntry.assessedOn, rules.validityMonths) ||
      (previousPointAssessment !== null &&
        compareDates(rawEntry.assessedOn, previousPointAssessment) < 0)
    ) {
      return invalid('invalid-point-entry')
    }

    pointIds.add(rawEntry.id)
    previousPointAssessment = rawEntry.assessedOn
    pointEntries.push({
      assessedOn: rawEntry.assessedOn,
      clearedBySuspensionId: rawEntry.clearedBySuspensionId,
      clearedOn: rawEntry.clearedOn,
      expiresOn: rawEntry.expiresOn,
      id: rawEntry.id,
      points: rawEntry.points,
    })
  }

  const suspensions: SuperFormula2026NextEventSuspension[] = []
  const suspensionIds = new Set<string>()
  let priorTransition: string | null = null

  for (const [index, rawSuspension] of input.suspensions.entries()) {
    if (!isRecord(rawSuspension)) {
      return invalid('invalid-suspension')
    }
    const assessedOn = rawSuspension.assessedOn
    const clearedPointEntryIds = rawSuspension.clearedPointEntryIds
    const id = rawSuspension.id
    const relevantPointEntryIds = rawSuspension.relevantPointEntryIds
    const servedOn = rawSuspension.servedOn
    const tallyAtAssessment = rawSuspension.tallyAtAssessment
    const thresholdPoints = rawSuspension.thresholdPoints

    if (
      !hasExactlyKeys(rawSuspension, [
        'assessedOn',
        'clearedPointEntryIds',
        'id',
        'kind',
        'relevantPointEntryIds',
        'servedOn',
        'tallyAtAssessment',
        'thresholdPoints',
      ]) ||
      typeof id !== 'string' ||
      id.trim().length === 0 ||
      suspensionIds.has(id) ||
      rawSuspension.kind !== 'next-event-suspension' ||
      !isCanonicalDate(assessedOn) ||
      !isStringArray(relevantPointEntryIds) ||
      !relevantPointEntryIds.every((entryId) => pointIds.has(entryId)) ||
      new Set(relevantPointEntryIds).size !== relevantPointEntryIds.length ||
      typeof tallyAtAssessment !== 'number' ||
      !Number.isSafeInteger(tallyAtAssessment) ||
      tallyAtAssessment < 0 ||
      thresholdPoints !==
        (index === 0
          ? rules.thresholdPoints.initial
          : index === 1
            ? rules.thresholdPoints.afterFirstServedSuspension
            : rules.thresholdPoints.afterSubsequentServedSuspension) ||
      !(
        servedOn === null || isCanonicalDate(servedOn)
      ) ||
      !(
        clearedPointEntryIds === null ||
        (isStringArray(clearedPointEntryIds) &&
          clearedPointEntryIds.every((entryId) => pointIds.has(entryId)))
      ) ||
      (servedOn === null) !== (clearedPointEntryIds === null) ||
      (servedOn !== null && compareDates(servedOn, assessedOn) < 0) ||
      (priorTransition !== null &&
        compareDates(assessedOn, priorTransition) < 0)
    ) {
      return invalid('invalid-suspension')
    }

    if (
      servedOn !== null &&
      clearedPointEntryIds !== null &&
      (new Set(clearedPointEntryIds).size !== clearedPointEntryIds.length ||
        clearedPointEntryIds.some(
          (entryId) => !relevantPointEntryIds.includes(entryId),
        ))
    ) {
      return invalid('invalid-suspension-clearing')
    }

    const relevantEntries = pointEntries.filter(
      (entry) =>
        relevantPointEntryIds.includes(entry.id) &&
        isActivePersistedEntryOn(entry, assessedOn),
    )
    const tally = relevantEntries.reduce((total, entry) => total + entry.points, 0)
    if (
      relevantEntries.length !== relevantPointEntryIds.length ||
      tally !== tallyAtAssessment ||
      tally < thresholdPoints
    ) {
      return invalid('invalid-suspension-tally')
    }

    const suspension: SuperFormula2026NextEventSuspension = {
      assessedOn,
      clearedPointEntryIds:
        clearedPointEntryIds === null
          ? null
          : [...clearedPointEntryIds],
      id,
      kind: 'next-event-suspension',
      relevantPointEntryIds: [...relevantPointEntryIds],
      servedOn,
      tallyAtAssessment,
      thresholdPoints,
    }
    suspensions.push(suspension)
    suspensionIds.add(suspension.id)
    priorTransition = suspension.servedOn ?? suspension.assessedOn
  }

  if (
    suspensions.filter((suspension) => suspension.servedOn === null).length > 1 ||
    (suspensions.some((suspension) => suspension.servedOn === null) &&
      suspensions.at(-1)?.servedOn !== null)
  ) {
    return invalid('multiple-or-nonterminal-pending-suspensions')
  }

  for (const entry of pointEntries) {
    if (entry.clearedBySuspensionId === null || entry.clearedOn === null) {
      continue
    }
    const suspension = suspensions.find(
      (candidate) => candidate.id === entry.clearedBySuspensionId,
    )
    if (
      !suspension ||
      suspension.servedOn !== entry.clearedOn ||
      suspension.clearedPointEntryIds === null ||
      !suspension.clearedPointEntryIds.includes(entry.id)
    ) {
      return invalid('invalid-entry-clearing-reference')
    }
  }

  for (const suspension of suspensions) {
    if (suspension.servedOn === null || suspension.clearedPointEntryIds === null) {
      continue
    }
    const expectedClearedIds = pointEntries
      .filter(
        (entry) =>
          suspension.relevantPointEntryIds.includes(entry.id) &&
          isActiveImmediatelyBeforeClearingOn(entry, suspension.servedOn!),
      )
      .map((entry) => entry.id)
    if (
      expectedClearedIds.length !== suspension.clearedPointEntryIds.length ||
      expectedClearedIds.some(
        (entryId, index) => entryId !== suspension.clearedPointEntryIds![index],
      )
    ) {
      return invalid('invalid-suspension-cleared-entries')
    }
  }

  const transitions = [
    ...pointEntries.map((entry) => entry.assessedOn),
    ...suspensions.flatMap((suspension) =>
      suspension.servedOn === null
        ? [suspension.assessedOn]
        : [suspension.assessedOn, suspension.servedOn],
    ),
  ]
  const latestTransitionOn = transitions.reduce<string | null>(
    (latest, transition) =>
      latest === null || compareDates(transition, latest) > 0
        ? transition
        : latest,
    null,
  )
  if (input.latestTransitionOn !== latestTransitionOn) {
    return invalid('invalid-latest-transition')
  }

  return {
    issues: [],
    ledger: ledgerFrom({
      driverId,
      latestTransitionOn,
      pointEntries,
      rules,
      suspensions,
    }),
    valid: true,
  }
}

/** Creates an empty, Article-5-sourced driver penalty-point ledger. */
export function createSuperFormula2026PenaltyPointLedger(options: {
  readonly driverId: string
}): SuperFormula2026PenaltyPointLedger {
  const driverId = options.driverId.trim()
  if (driverId.length === 0) {
    throw new TypeError('SUPER FORMULA penalty ledger requires a driver id.')
  }

  return ledgerFrom({
    driverId,
    latestTransitionOn: null,
    pointEntries: [],
    rules: requiredPenaltyPointRules(),
    suspensions: [],
  })
}

/**
 * Reads a deterministic tally at a supplied date. Entries expire exactly at
 * the start of their assessment date plus the sourced continuous-month span.
 */
export function superFormula2026PenaltyPointTally(options: {
  readonly asOf: string
  readonly ledger: SuperFormula2026PenaltyPointLedger
}): SuperFormula2026PenaltyPointTally {
  const asOf = canonicalDate(options.asOf, 'Penalty-point tally date')
  const activeEntries = options.ledger.pointEntries.filter((entry) =>
    isActiveOn(entry, asOf),
  )
  const rules = requiredPenaltyPointRules()

  return {
    activeEntries,
    asOf,
    points: activeEntries.reduce((total, entry) => total + entry.points, 0),
    thresholdPoints: suspensionThresholdFor(
      servedSuspensionCountAt(options.ledger, asOf),
      rules,
    ),
  }
}

/**
 * Assesses the Article 5 next-event suspension using the current sourced
 * twelve-month tally. A pending suspension never clears points on its own.
 */
export function assessSuperFormula2026PenaltyPointSuspension(options: {
  readonly assessedOn: string
  readonly ledger: SuperFormula2026PenaltyPointLedger
}): SuperFormula2026PenaltySuspensionAssessment {
  const assessedOn = canonicalDate(
    options.assessedOn,
    'Penalty-point suspension assessment date',
  )
  assertTransitionDate(options.ledger, assessedOn)

  const tally = superFormula2026PenaltyPointTally({
    asOf: assessedOn,
    ledger: options.ledger,
  })
  const pending = pendingSuspensionFor(options.ledger)
  if (pending) {
    return {
      ledger: options.ledger,
      status: 'next-event-suspension-pending',
      suspension: pending,
      tally,
    }
  }

  if (tally.points < tally.thresholdPoints) {
    return {
      ledger: options.ledger,
      status: 'below-suspension-threshold',
      suspension: null,
      tally,
    }
  }

  const servedCount = servedSuspensionCountAt(options.ledger, assessedOn)
  const suspension: SuperFormula2026NextEventSuspension = {
    assessedOn,
    clearedPointEntryIds: null,
    id: `super-formula-2026-next-event-suspension-${servedCount + 1}-${assessedOn}`,
    kind: 'next-event-suspension',
    relevantPointEntryIds: tally.activeEntries.map((entry) => entry.id),
    servedOn: null,
    tallyAtAssessment: tally.points,
    thresholdPoints: tally.thresholdPoints,
  }
  const ledger = ledgerFrom({
    driverId: options.ledger.driverId,
    latestTransitionOn: assessedOn,
    pointEntries: options.ledger.pointEntries,
    rules: requiredPenaltyPointRules(),
    suspensions: [...options.ledger.suspensions, suspension],
  })

  return {
    ledger,
    status: 'next-event-suspension-assessed',
    suspension,
    tally,
  }
}

/**
 * Appends an adjudicated Article 5 point entry and immediately assesses the
 * sourced threshold. The caller supplies both identity and date, so no clock
 * or random identifier is introduced by the simulation.
 */
export function recordSuperFormula2026PenaltyPoints(options: {
  readonly assessedOn: string
  readonly ledger: SuperFormula2026PenaltyPointLedger
  readonly pointEntryId: string
  readonly points: number
}): SuperFormula2026PenaltySuspensionAssessment {
  const assessedOn = canonicalDate(options.assessedOn, 'Penalty-point assessment date')
  const pointEntryId = options.pointEntryId.trim()
  const rules = requiredPenaltyPointRules()

  assertTransitionDate(options.ledger, assessedOn)
  if (pointEntryId.length === 0) {
    throw new TypeError('SUPER FORMULA penalty-point entries require an id.')
  }
  if (!isPositiveSafeInteger(options.points)) {
    throw new RangeError('SUPER FORMULA penalty points must be a positive safe integer.')
  }
  if (options.ledger.pointEntries.some((entry) => entry.id === pointEntryId)) {
    throw new RangeError(`SUPER FORMULA penalty-point entry id already exists: ${pointEntryId}.`)
  }

  const ledger = ledgerFrom({
    driverId: options.ledger.driverId,
    latestTransitionOn: assessedOn,
    pointEntries: [
      ...options.ledger.pointEntries,
      {
        assessedOn,
        clearedBySuspensionId: null,
        clearedOn: null,
        expiresOn: addContinuousMonths(assessedOn, rules.validityMonths),
        id: pointEntryId,
        points: options.points,
      },
    ],
    rules,
    suspensions: options.ledger.suspensions,
  })

  return assessSuperFormula2026PenaltyPointSuspension({
    assessedOn,
    ledger,
  })
}

/**
 * Records that an already-assessed next-event suspension has been served and
 * lifted. This is the only transition that clears the point entries captured
 * in that suspension's relevant tally.
 */
export function serveSuperFormula2026NextEventSuspension(options: {
  readonly ledger: SuperFormula2026PenaltyPointLedger
  readonly suspensionId: string
  readonly suspensionLiftedOn: string
}): SuperFormula2026SuspensionServedTransition {
  const suspensionLiftedOn = canonicalDate(
    options.suspensionLiftedOn,
    'SUPER FORMULA suspension-lifted date',
  )
  const suspension = options.ledger.suspensions.find(
    (candidate) => candidate.id === options.suspensionId,
  )

  if (!suspension) {
    throw new RangeError(
      `SUPER FORMULA next-event suspension does not exist: ${options.suspensionId}.`,
    )
  }
  if (suspension.servedOn !== null) {
    throw new RangeError(
      `SUPER FORMULA next-event suspension is already served: ${options.suspensionId}.`,
    )
  }

  assertTransitionDate(options.ledger, suspensionLiftedOn)
  if (compareDates(suspensionLiftedOn, suspension.assessedOn) < 0) {
    throw new RangeError('A SUPER FORMULA suspension cannot be lifted before it is assessed.')
  }

  const relevantIds = new Set(suspension.relevantPointEntryIds)
  const clearedPointEntryIds: string[] = []
  const pointEntries = options.ledger.pointEntries.map((entry) => {
    if (!relevantIds.has(entry.id) || !isActiveOn(entry, suspensionLiftedOn)) {
      return entry
    }

    clearedPointEntryIds.push(entry.id)
    return {
      ...entry,
      clearedBySuspensionId: suspension.id,
      clearedOn: suspensionLiftedOn,
    }
  })
  const servedSuspension: SuperFormula2026NextEventSuspension = {
    ...suspension,
    clearedPointEntryIds,
    servedOn: suspensionLiftedOn,
  }
  const ledger = ledgerFrom({
    driverId: options.ledger.driverId,
    latestTransitionOn: suspensionLiftedOn,
    pointEntries,
    rules: requiredPenaltyPointRules(),
    suspensions: options.ledger.suspensions.map((candidate) =>
      candidate.id === suspension.id ? servedSuspension : candidate,
    ),
  })

  return { ledger, servedSuspension }
}
