import type { ExecutableSeriesId } from './seriesIds'

export type RegulationAuthorityLevel =
  | 'binding-base-regulation'
  | 'binding-official-correction'
  | 'binding-official-bulletin'
  | 'binding-calendar-notice'
  | 'binding-event-special-regulation'
  | 'race-director-instruction'
  | 'official-guideline'
  | 'observed-inference'
  | 'simulator-policy'

export type PolicyParameterSource =
  | 'regulation'
  | 'official-guideline'
  | 'event-instruction'
  | 'observed-inference'
  | 'simulator-policy'

export type RuleValue =
  | boolean
  | number
  | string
  | null
  | readonly RuleValue[]
  | { readonly [key: string]: RuleValue }

export type RegulationRuleDefinition = {
  readonly effectiveFrom?: string
  readonly effectiveTo?: string
  readonly eventIds?: readonly string[]
  readonly id: string
  readonly key: string
  readonly sessionTypes?: readonly string[]
  /** Rule ids replaced by this exact rule, rather than whole source ids. */
  readonly supersedes?: readonly string[]
  readonly value: RuleValue
}

export type RegulationRuleCandidate = RegulationRuleDefinition & {
  readonly sourceId: string
}

export type RegulationSourceRef = {
  readonly authorityLevel: RegulationAuthorityLevel
  readonly checksum: string | null
  readonly effectiveFrom?: string
  readonly effectiveTo?: string
  readonly eventIds?: readonly string[]
  readonly id: string
  readonly parameterSource: PolicyParameterSource
  readonly publishedAt: string
  readonly rules?: readonly RegulationRuleDefinition[]
  readonly seriesId: ExecutableSeriesId
  readonly sessionTypes?: readonly string[]
  readonly status?: string
  /** Whole source ids replaced by this source. */
  readonly supersedes?: readonly string[]
  readonly title: string
  readonly url: string
}

export const REGULATION_AUTHORITY_PRIORITY = {
  'binding-event-special-regulation': 900,
  'binding-calendar-notice': 850,
  'binding-official-bulletin': 800,
  'binding-official-correction': 750,
  'binding-base-regulation': 700,
  'race-director-instruction': 600,
  'official-guideline': 400,
  'observed-inference': 200,
  'simulator-policy': 100,
} as const satisfies Readonly<Record<RegulationAuthorityLevel, number>>

/** Phase 0's frozen, current binding regulation references. */
export const frozenRegulationSources2026 = [
  {
    authorityLevel: 'binding-base-regulation',
    checksum: 'cbe329807d7803a4db511f80d829de1212d0c6a1c3b327cddb1b841823baa9fd',
    effectiveFrom: '2026-08-05',
    id: 'fia-f1-2026-sporting-b08',
    parameterSource: 'regulation',
    publishedAt: '2026-08-05',
    seriesId: 'f1-custom',
    status: 'current-at-cutoff',
    title: '2026 Formula 1 Sporting Regulations, Section B, Issue 08',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_08_-_2026-08-05_7.pdf',
  },
  {
    authorityLevel: 'binding-base-regulation',
    checksum: 'cf0b919eef5eecc27497fb6de012f8d27e200f6dbd34d62b7e5385f7274ff652',
    effectiveFrom: '2026-08-05',
    id: 'fia-f1-2026-technical-c20',
    parameterSource: 'regulation',
    publishedAt: '2026-08-05',
    seriesId: 'f1-custom',
    status: 'current-at-cutoff',
    title: '2026 Formula 1 Technical Regulations, Section C, Issue 20',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf',
  },
  {
    authorityLevel: 'binding-base-regulation',
    checksum: 'c53c9f07e6313d0c0a0263204d745ba1f99e8c496286924a2166bc66dac38845',
    effectiveFrom: '2026-08-05',
    id: 'fia-f1-2026-operational-f10',
    parameterSource: 'regulation',
    publishedAt: '2026-08-05',
    seriesId: 'f1-custom',
    status: 'current-at-cutoff',
    title: '2026 Formula 1 Operational Regulations, Section F, Issue 10',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_10_-_2026-08-05.pdf',
  },
  {
    authorityLevel: 'binding-base-regulation',
    checksum: '9e5eb324f2f4c8660d9b716cbf35a1874247fc6baa8706ae2b2539630ae2369a',
    effectiveFrom: '2026-01-01',
    id: 'jaf-sf-2026-unified-regulations',
    parameterSource: 'regulation',
    publishedAt: '2026-01-23',
    seriesId: 'super-formula',
    status: 'current-consolidated-at-cutoff',
    title: '2026 SUPER FORMULA Unified Regulations',
    url: 'https://motorsports.jaf.or.jp/-/media/1/3375/3379/3400/3462/3466/3492/2026_touitsu_kisoku_superformula_20260101.pdf',
  },
  {
    authorityLevel: 'binding-official-correction',
    checksum: '0a46c56d502e5f60cfc258658cd108393b59f77c4214846e5dcc0da24d679623',
    effectiveFrom: '2026-02-03',
    id: 'jaf-sf-2026-correction-web011',
    parameterSource: 'regulation',
    publishedAt: '2026-02-03',
    seriesId: 'super-formula',
    status: 'incorporated-into-current-consolidated-pdf',
    title: 'Correction notice No.2026-WEB011',
    url: 'https://motorsports.jaf.or.jp/-/media/1/3375/3379/3402/3404/4458/20260203.pdf',
  },
  {
    authorityLevel: 'binding-official-bulletin',
    checksum: 'a93903db08d3f0c90aa3785a6b7159a2ada3042c097a928488ead3165a87c9d3',
    effectiveFrom: '2026-06-10',
    id: 'jaf-race-bulletin-003-2026',
    parameterSource: 'regulation',
    publishedAt: '2026-06-10',
    seriesId: 'super-formula',
    status: 'current-at-cutoff',
    title: 'Race Championship Bulletin No.003-2026',
    url: 'https://motorsports.jaf.or.jp/-/media/1/3375/3379/3400/3462/3466/3493/race_bulletin_003-2026_20260610.pdf',
  },
  {
    authorityLevel: 'binding-calendar-notice',
    checksum: null,
    effectiveFrom: '2026-07-15',
    eventIds: ['sf-03-replacement', 'sf-06', 'sf-07'],
    id: 'jaf-sf-2026-substitute-round-3-web056',
    parameterSource: 'regulation',
    publishedAt: '2026-07-15',
    seriesId: 'super-formula',
    status: 'current-at-cutoff',
    title: 'Substitute Round 3 notice No.2026-WEB056',
    url: 'https://motorsports.jaf.or.jp/regulations/announcement/notice/2026/20260715_01',
  },
] as const satisfies readonly RegulationSourceRef[]

/**
 * These ids are references from C20, not public source documents. They remain
 * unavailable and are intentionally absent from `frozenRegulationSources2026`.
 */
export const unavailableRegulationAuthorities = [
  {
    ids: ['FIA-F1-DOC-034', 'FIA-F1-DOC-058', 'FIA-F1-DOC-111'],
    reason:
      'Referenced event parameters were not publicly available at the Phase 0 cutoff.',
    resolution: 'unavailable',
  },
] as const

type ResolutionLane = 'official' | 'observed-inference' | 'simulator-policy'

export type RulePrecedence = {
  readonly authorityPriority: number
  readonly effectiveFrom: string | null
  readonly scopeSpecificity: number
}

export type ResolvedEffectiveRule = {
  readonly candidateIds: readonly string[]
  readonly key: string
  readonly parameterSources: readonly PolicyParameterSource[]
  readonly precedence: RulePrecedence
  readonly sourceIds: readonly string[]
  readonly value: RuleValue
}

export type UnresolvedRuleConflict = {
  readonly candidateIds: readonly string[]
  readonly key: string
  readonly lane: ResolutionLane
  readonly reason: 'equal-precedence-conflict'
  readonly sourceIds: readonly string[]
  readonly values: readonly RuleValue[]
}

export type ExcludedSource = {
  readonly reason:
    | 'event-scope-mismatch'
    | 'expired'
    | 'not-yet-effective'
    | 'series-mismatch'
    | 'session-scope-mismatch'
    | 'superseded'
  readonly sourceId: string
  readonly supersededBy?: readonly string[]
}

export type DiscardedRuleCandidate = {
  readonly candidateId: string
  readonly reason:
    | 'event-scope-mismatch'
    | 'expired'
    | 'lower-precedence'
    | 'not-yet-effective'
    | 'session-scope-mismatch'
    | 'source-inactive'
    | 'superseded'
}

export type EffectiveRuleSet = {
  readonly adoptedSourceIds: readonly string[]
  readonly conflicts: readonly UnresolvedRuleConflict[]
  readonly discardedCandidates: readonly DiscardedRuleCandidate[]
  readonly effectiveSourceIds: readonly string[]
  readonly effectiveSources: readonly RegulationSourceRef[]
  readonly excludedSources: readonly ExcludedSource[]
  readonly observedInferences: Readonly<Record<string, ResolvedEffectiveRule>>
  readonly rules: Readonly<Record<string, ResolvedEffectiveRule>>
  readonly simulatorPolicies: Readonly<Record<string, ResolvedEffectiveRule>>
  readonly supersededSourceIds: readonly string[]
  readonly unresolvedItems: readonly string[]
}

export type EffectiveRuleQuery = {
  readonly candidates?: readonly RegulationRuleCandidate[]
  readonly eventDate: string
  readonly eventId?: string
  readonly seriesId: ExecutableSeriesId
  readonly sessionType?: string
  readonly sources?: readonly RegulationSourceRef[]
}

type ApplicableCandidate = {
  readonly candidate: RegulationRuleCandidate
  readonly effectiveFromMs: number
  readonly lane: ResolutionLane
  readonly precedence: RulePrecedence
  readonly source: RegulationSourceRef
}

function parseDate(value: string, label: string): number {
  const parsed = Date.parse(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }

  return parsed
}

function optionalDate(value: string | undefined, label: string): number | null {
  return value === undefined ? null : parseDate(value, label)
}

function assertWindow(
  effectiveFrom: string | undefined,
  effectiveTo: string | undefined,
  label: string,
) {
  const from = optionalDate(effectiveFrom, `${label} effectiveFrom`)
  const to = optionalDate(effectiveTo, `${label} effectiveTo`)

  if (from !== null && to !== null && from > to) {
    throw new Error(`${label} has effectiveFrom after effectiveTo`)
  }
}

function assertNonEmptyScope(values: readonly string[] | undefined, label: string) {
  if (values !== undefined && values.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
}

function laneFor(source: RegulationSourceRef): ResolutionLane {
  if (source.parameterSource === 'simulator-policy') {
    return 'simulator-policy'
  }

  if (source.parameterSource === 'observed-inference') {
    return 'observed-inference'
  }

  return 'official'
}

function validateSource(source: RegulationSourceRef) {
  if (!source.id || !source.title || !source.url) {
    throw new Error('Regulation sources require non-empty id, title, and url')
  }

  parseDate(source.publishedAt, `source ${source.id} publishedAt`)
  assertWindow(source.effectiveFrom, source.effectiveTo, `source ${source.id}`)
  assertNonEmptyScope(source.eventIds, `source ${source.id} eventIds`)
  assertNonEmptyScope(source.sessionTypes, `source ${source.id} sessionTypes`)

  const policyAuthority = source.authorityLevel === 'simulator-policy'
  const policyProvenance = source.parameterSource === 'simulator-policy'

  if (policyAuthority !== policyProvenance) {
    throw new Error(
      `Source ${source.id} must keep simulator-policy authority and provenance together`,
    )
  }
}

function validateCandidate(candidate: RegulationRuleCandidate) {
  if (!candidate.id || !candidate.key || !candidate.sourceId) {
    throw new Error('Rule candidates require non-empty id, key, and sourceId')
  }

  assertWindow(
    candidate.effectiveFrom,
    candidate.effectiveTo,
    `candidate ${candidate.id}`,
  )
  assertNonEmptyScope(candidate.eventIds, `candidate ${candidate.id} eventIds`)
  assertNonEmptyScope(
    candidate.sessionTypes,
    `candidate ${candidate.id} sessionTypes`,
  )
  canonicalValue(candidate.value)
}

function sourceExclusionReason(
  source: RegulationSourceRef,
  query: EffectiveRuleQuery,
  eventDateMs: number,
): ExcludedSource['reason'] | null {
  if (source.seriesId !== query.seriesId) {
    return 'series-mismatch'
  }

  const from = optionalDate(source.effectiveFrom, `source ${source.id} effectiveFrom`)
  const to = optionalDate(source.effectiveTo, `source ${source.id} effectiveTo`)

  if (from !== null && from > eventDateMs) {
    return 'not-yet-effective'
  }
  if (to !== null && to < eventDateMs) {
    return 'expired'
  }
  if (source.eventIds && (!query.eventId || !source.eventIds.includes(query.eventId))) {
    return 'event-scope-mismatch'
  }
  if (
    source.sessionTypes &&
    (!query.sessionType || !source.sessionTypes.includes(query.sessionType))
  ) {
    return 'session-scope-mismatch'
  }

  return null
}

function candidateExclusionReason(
  candidate: RegulationRuleCandidate,
  query: EffectiveRuleQuery,
  eventDateMs: number,
): DiscardedRuleCandidate['reason'] | null {
  const from = optionalDate(
    candidate.effectiveFrom,
    `candidate ${candidate.id} effectiveFrom`,
  )
  const to = optionalDate(candidate.effectiveTo, `candidate ${candidate.id} effectiveTo`)

  if (from !== null && from > eventDateMs) {
    return 'not-yet-effective'
  }
  if (to !== null && to < eventDateMs) {
    return 'expired'
  }
  if (
    candidate.eventIds &&
    (!query.eventId || !candidate.eventIds.includes(query.eventId))
  ) {
    return 'event-scope-mismatch'
  }
  if (
    candidate.sessionTypes &&
    (!query.sessionType || !candidate.sessionTypes.includes(query.sessionType))
  ) {
    return 'session-scope-mismatch'
  }

  return null
}

function assertUniqueIds<T>(items: readonly T[], idFor: (item: T) => string, label: string) {
  const seen = new Set<string>()

  for (const item of items) {
    const id = idFor(item)
    if (seen.has(id)) {
      throw new Error(`Duplicate ${label} id: ${id}`)
    }
    seen.add(id)
  }
}

function assertAcyclicSupersession<T>(
  items: readonly T[],
  idFor: (item: T) => string,
  supersedesFor: (item: T) => readonly string[] | undefined,
  label: string,
) {
  const byId = new Map(items.map((item) => [idFor(item), item]))
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (id: string) => {
    if (visiting.has(id)) {
      throw new Error(`${label} supersession cycle includes ${id}`)
    }
    if (visited.has(id)) {
      return
    }

    const item = byId.get(id)
    if (!item) {
      return
    }

    visiting.add(id)
    for (const replacedId of supersedesFor(item) ?? []) {
      if (byId.has(replacedId)) {
        visit(replacedId)
      }
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of [...byId.keys()].sort()) {
    visit(id)
  }
}

function canonicalValue(value: RuleValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Rule values must contain only finite numbers')
    }
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(',')}]`
  }

  const objectValue = value as Readonly<Record<string, RuleValue>>
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(objectValue[key])}`)
    .join(',')}}`
}

function sourceEffectiveFromMs(source: RegulationSourceRef): number {
  return source.effectiveFrom
    ? parseDate(source.effectiveFrom, `source ${source.id} effectiveFrom`)
    : Number.NEGATIVE_INFINITY
}

function candidatePrecedence(
  candidate: RegulationRuleCandidate,
  source: RegulationSourceRef,
): { effectiveFromMs: number; precedence: RulePrecedence } {
  const sourceFrom = sourceEffectiveFromMs(source)
  const candidateFrom = candidate.effectiveFrom
    ? parseDate(candidate.effectiveFrom, `candidate ${candidate.id} effectiveFrom`)
    : Number.NEGATIVE_INFINITY
  const effectiveFromMs = Math.max(sourceFrom, candidateFrom)
  const eventSpecific = Boolean(source.eventIds || candidate.eventIds)
  const sessionSpecific = Boolean(source.sessionTypes || candidate.sessionTypes)

  return {
    effectiveFromMs,
    precedence: {
      authorityPriority: REGULATION_AUTHORITY_PRIORITY[source.authorityLevel],
      effectiveFrom:
        effectiveFromMs === Number.NEGATIVE_INFINITY
          ? null
          : new Date(effectiveFromMs).toISOString(),
      scopeSpecificity: Number(eventSpecific) + Number(sessionSpecific),
    },
  }
}

function comparePrecedence(left: ApplicableCandidate, right: ApplicableCandidate): number {
  return (
    left.precedence.authorityPriority - right.precedence.authorityPriority ||
    left.precedence.scopeSpecificity - right.precedence.scopeSpecificity ||
    left.effectiveFromMs - right.effectiveFromMs
  )
}

function recordFor(entries: readonly ResolvedEffectiveRule[]) {
  return Object.freeze(
    Object.fromEntries(entries.map((entry) => [entry.key, entry])) as Record<
      string,
      ResolvedEffectiveRule
    >,
  )
}

/**
 * Resolves applicable rules without depending on source or object insertion
 * order. A true precedence tie with different values stays unresolved.
 */
export function resolveEffectiveRuleSet(query: EffectiveRuleQuery): EffectiveRuleSet {
  const eventDateMs = parseDate(query.eventDate, 'event date')
  const sourceInput: readonly RegulationSourceRef[] =
    query.sources ?? frozenRegulationSources2026
  const sources = [...sourceInput].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  assertUniqueIds(sources, (source) => source.id, 'source')
  sources.forEach(validateSource)

  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const excludedSources: ExcludedSource[] = []
  const initiallyApplicable: RegulationSourceRef[] = []

  for (const source of sources) {
    const reason = sourceExclusionReason(source, query, eventDateMs)
    if (reason) {
      excludedSources.push({ reason, sourceId: source.id })
    } else {
      initiallyApplicable.push(source)
    }
  }

  assertAcyclicSupersession(
    initiallyApplicable,
    (source) => source.id,
    (source) => source.supersedes,
    'Source',
  )

  const applicableSourceById = new Map(
    initiallyApplicable.map((source) => [source.id, source]),
  )
  const supersededBySourceId = new Map<string, Set<string>>()

  for (const source of initiallyApplicable) {
    for (const supersededId of source.supersedes ?? []) {
      const target = applicableSourceById.get(supersededId)
      if (!target) {
        continue
      }
      if (laneFor(source) !== laneFor(target)) {
        throw new Error(
          `Source ${source.id} cannot supersede ${target.id} across provenance lanes`,
        )
      }
      const superseders = supersededBySourceId.get(target.id) ?? new Set<string>()
      superseders.add(source.id)
      supersededBySourceId.set(target.id, superseders)
    }
  }

  const effectiveSources = initiallyApplicable.filter((source) => {
    const superseders = supersededBySourceId.get(source.id)
    if (!superseders) {
      return true
    }
    excludedSources.push({
      reason: 'superseded',
      sourceId: source.id,
      supersededBy: [...superseders].sort(),
    })
    return false
  })
  const effectiveSourceIds = new Set(effectiveSources.map((source) => source.id))

  const embeddedCandidates = sources.flatMap((source) =>
    (source.rules ?? []).map((rule) => ({ ...rule, sourceId: source.id })),
  )
  const candidates = [...embeddedCandidates, ...(query.candidates ?? [])].sort(
    (left, right) => left.id.localeCompare(right.id),
  )
  assertUniqueIds(candidates, (candidate) => candidate.id, 'candidate')
  candidates.forEach(validateCandidate)

  for (const candidate of candidates) {
    if (!sourceById.has(candidate.sourceId)) {
      throw new Error(
        `Rule candidate ${candidate.id} references missing source ${candidate.sourceId}`,
      )
    }
  }

  const discardedCandidates: DiscardedRuleCandidate[] = []
  const initiallyApplicableCandidates: ApplicableCandidate[] = []

  for (const candidate of candidates) {
    const source = sourceById.get(candidate.sourceId)!
    if (!effectiveSourceIds.has(source.id)) {
      discardedCandidates.push({
        candidateId: candidate.id,
        reason: 'source-inactive',
      })
      continue
    }

    const reason = candidateExclusionReason(candidate, query, eventDateMs)
    if (reason) {
      discardedCandidates.push({ candidateId: candidate.id, reason })
      continue
    }

    const { effectiveFromMs, precedence } = candidatePrecedence(candidate, source)
    initiallyApplicableCandidates.push({
      candidate,
      effectiveFromMs,
      lane: laneFor(source),
      precedence,
      source,
    })
  }

  assertAcyclicSupersession(
    initiallyApplicableCandidates,
    (entry) => entry.candidate.id,
    (entry) => entry.candidate.supersedes,
    'Rule',
  )

  const applicableCandidateById = new Map(
    initiallyApplicableCandidates.map((entry) => [entry.candidate.id, entry]),
  )
  const supersededCandidateIds = new Set<string>()

  for (const entry of initiallyApplicableCandidates) {
    for (const supersededId of entry.candidate.supersedes ?? []) {
      const target = applicableCandidateById.get(supersededId)
      if (!target) {
        continue
      }
      if (entry.lane !== target.lane) {
        throw new Error(
          `Rule ${entry.candidate.id} cannot supersede ${target.candidate.id} across provenance lanes`,
        )
      }
      supersededCandidateIds.add(target.candidate.id)
    }
  }

  const applicableCandidates = initiallyApplicableCandidates.filter((entry) => {
    if (!supersededCandidateIds.has(entry.candidate.id)) {
      return true
    }
    discardedCandidates.push({
      candidateId: entry.candidate.id,
      reason: 'superseded',
    })
    return false
  })

  const grouped = new Map<string, ApplicableCandidate[]>()
  for (const entry of applicableCandidates) {
    const groupId = `${entry.lane}\u0000${entry.candidate.key}`
    const group = grouped.get(groupId) ?? []
    group.push(entry)
    grouped.set(groupId, group)
  }

  const resolvedByLane: Record<ResolutionLane, ResolvedEffectiveRule[]> = {
    official: [],
    'observed-inference': [],
    'simulator-policy': [],
  }
  const conflicts: UnresolvedRuleConflict[] = []

  for (const groupId of [...grouped.keys()].sort()) {
    const group = grouped.get(groupId)!
    const best = group.reduce((current, candidate) =>
      comparePrecedence(candidate, current) > 0 ? candidate : current,
    )
    const top = group.filter((candidate) => comparePrecedence(candidate, best) === 0)
    const topValueKeys = new Set(top.map((candidate) => canonicalValue(candidate.candidate.value)))

    for (const lower of group.filter((candidate) => !top.includes(candidate))) {
      discardedCandidates.push({
        candidateId: lower.candidate.id,
        reason: 'lower-precedence',
      })
    }

    if (topValueKeys.size > 1) {
      conflicts.push({
        candidateIds: top.map((entry) => entry.candidate.id).sort(),
        key: best.candidate.key,
        lane: best.lane,
        reason: 'equal-precedence-conflict',
        sourceIds: [...new Set(top.map((entry) => entry.source.id))].sort(),
        values: top.map((entry) => entry.candidate.value),
      })
      continue
    }

    resolvedByLane[best.lane].push({
      candidateIds: top.map((entry) => entry.candidate.id).sort(),
      key: best.candidate.key,
      parameterSources: [
        ...new Set(top.map((entry) => entry.source.parameterSource)),
      ].sort(),
      precedence: best.precedence,
      sourceIds: [...new Set(top.map((entry) => entry.source.id))].sort(),
      value: top[0].candidate.value,
    })
  }

  const allResolved = Object.values(resolvedByLane).flat()

  return {
    adoptedSourceIds: [...new Set(allResolved.flatMap((rule) => rule.sourceIds))].sort(),
    conflicts: conflicts.sort(
      (left, right) => left.lane.localeCompare(right.lane) || left.key.localeCompare(right.key),
    ),
    discardedCandidates: discardedCandidates.sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
    effectiveSourceIds: effectiveSources.map((source) => source.id).sort(),
    effectiveSources: [...effectiveSources].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    excludedSources: excludedSources.sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId),
    ),
    observedInferences: recordFor(resolvedByLane['observed-inference']),
    rules: recordFor(resolvedByLane.official),
    simulatorPolicies: recordFor(resolvedByLane['simulator-policy']),
    supersededSourceIds: [...supersededBySourceId.keys()].sort(),
    unresolvedItems: [...new Set(conflicts.map((conflict) => conflict.key))].sort(),
  }
}
