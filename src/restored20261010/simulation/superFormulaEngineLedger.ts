import {
  superFormulaOperationalRules2026,
  type SuperFormulaRuleProvenance,
} from '../data/superFormulaRules2026'

/**
 * The Article 24 engine allowance applies to an entrant over a season. This
 * deliberately models one engine ledger only; it is not a compatibility
 * shape for the F1 ICE/turbo/ERS component pool.
 */
export type SuperFormula2026EngineLedger = {
  readonly engine: {
    readonly maximumPerEntrantPerSeason: number
    readonly used: number
  }
  readonly entrantId: string
  readonly kind: 'super-formula-2026-engine-ledger'
  readonly ruleProvenance: {
    readonly maximumPerEntrantPerSeason: SuperFormulaRuleProvenance
    readonly replacementConsequences: SuperFormulaRuleProvenance
  }
  readonly schemaVersion: 1
  readonly seasonYear: 2026
  readonly seriesId: 'super-formula'
}

export type SuperFormula2026EngineLedgerValidation =
  | {
      readonly issues: readonly string[]
      readonly valid: false
    }
  | {
      readonly ledger: SuperFormula2026EngineLedger
      readonly valid: true
    }

export type SuperFormula2026EngineReplacementConsequences = NonNullable<
  (typeof superFormulaOperationalRules2026.engines.replacementConsequences)['value']
>

/**
 * Timing and force-majeure assessment remain an event-steward decision. The
 * ledger exposes the published consequence metadata without converting it to
 * an invented numeric or F1-style penalty.
 */
export type SuperFormula2026EngineReplacementConsequenceReference = {
  readonly availability: 'verified'
  readonly provenance: SuperFormulaRuleProvenance
  readonly resolution: 'event-timing-context-required'
  readonly value: SuperFormula2026EngineReplacementConsequences
}

export type SuperFormula2026EngineReplacementResult =
  | {
      readonly consequenceReference: SuperFormula2026EngineReplacementConsequenceReference
      readonly ledger: SuperFormula2026EngineLedger
      readonly remaining: number
      readonly status: 'replaced'
    }
  | {
      readonly consequenceReference: SuperFormula2026EngineReplacementConsequenceReference
      readonly ledger: SuperFormula2026EngineLedger
      readonly remaining: 0
      readonly status: 'season-allocation-exhausted'
    }
  | {
      readonly issues: readonly string[]
      readonly status: 'invalid-ledger'
    }

type VerifiedEngineRules = {
  readonly maximumPerEntrantPerSeason: number
  readonly maximumProvenance: SuperFormulaRuleProvenance
  readonly replacementConsequences: SuperFormula2026EngineReplacementConsequences
  readonly replacementProvenance: SuperFormulaRuleProvenance
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactlyKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
) => {
  const actual = Object.keys(value)
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key))
  )
}

function verifiedEngineRules(): VerifiedEngineRules | null {
  const maximum =
    superFormulaOperationalRules2026.engines.maxPerEntrantPerSeason
  const replacement =
    superFormulaOperationalRules2026.engines.replacementConsequences

  if (
    maximum.availability !== 'verified' ||
    replacement.availability !== 'verified' ||
    !Number.isInteger(maximum.value) ||
    maximum.value < 1
  ) {
    return null
  }

  return {
    maximumPerEntrantPerSeason: maximum.value,
    maximumProvenance: maximum.provenance,
    replacementConsequences: replacement.value,
    replacementProvenance: replacement.provenance,
  }
}

function requiredEngineRules(): VerifiedEngineRules {
  const rules = verifiedEngineRules()
  if (!rules) {
    throw new TypeError(
      'SUPER FORMULA 2026 engine rules are unavailable or incomplete.',
    )
  }
  return rules
}

function sameProvenance(
  value: unknown,
  expected: SuperFormulaRuleProvenance,
) {
  return (
    isRecord(value) &&
    value.article === expected.article &&
    value.authority === expected.authority &&
    value.checksum === expected.checksum &&
    value.publishedAt === expected.publishedAt &&
    value.sourceId === expected.sourceId &&
    value.url === expected.url
  )
}

function consequenceReference(
  rules: VerifiedEngineRules = requiredEngineRules(),
): SuperFormula2026EngineReplacementConsequenceReference {
  return {
    availability: 'verified',
    provenance: rules.replacementProvenance,
    resolution: 'event-timing-context-required',
    value: rules.replacementConsequences,
  }
}

function ledgerFrom(options: {
  entrantId: string
  rules: VerifiedEngineRules
  used: number
}): SuperFormula2026EngineLedger {
  return {
    engine: {
      maximumPerEntrantPerSeason:
        options.rules.maximumPerEntrantPerSeason,
      used: options.used,
    },
    entrantId: options.entrantId,
    kind: 'super-formula-2026-engine-ledger',
    ruleProvenance: {
      maximumPerEntrantPerSeason: options.rules.maximumProvenance,
      replacementConsequences: options.rules.replacementProvenance,
    },
    schemaVersion: 1,
    seasonYear: 2026,
    seriesId: 'super-formula',
  }
}

/** Creates a source-pinned first or already-declared engine ledger. */
export function createSuperFormula2026EngineLedger(options: {
  readonly entrantId: string
  readonly used?: number
}): SuperFormula2026EngineLedger {
  const rules = requiredEngineRules()
  const entrantId = options.entrantId.trim()
  const used = options.used ?? 1

  if (entrantId.length === 0) {
    throw new TypeError('SUPER FORMULA engine ledger requires an entrant id.')
  }
  if (
    !Number.isInteger(used) ||
    used < 1 ||
    used > rules.maximumPerEntrantPerSeason
  ) {
    throw new RangeError(
      `SUPER FORMULA 2026 permits 1-${rules.maximumPerEntrantPerSeason} declared engines per entrant season.`,
    )
  }

  return ledgerFrom({ entrantId, rules, used })
}

/**
 * Strictly validates persisted input and rebuilds it from the current sourced
 * rules. Extra F1-component-shaped fields are intentionally not accepted.
 */
export function validateSuperFormula2026EngineLedger(
  input: unknown,
): SuperFormula2026EngineLedgerValidation {
  const rules = verifiedEngineRules()
  if (!rules) {
    return {
      issues: ['source-rules-unavailable'],
      valid: false,
    }
  }
  if (!isRecord(input)) {
    return { issues: ['ledger-must-be-an-object'], valid: false }
  }
  if (
    !hasExactlyKeys(input, [
      'engine',
      'entrantId',
      'kind',
      'ruleProvenance',
      'schemaVersion',
      'seasonYear',
      'seriesId',
    ])
  ) {
    return { issues: ['unexpected-ledger-fields'], valid: false }
  }
  if (!isRecord(input.engine) || !isRecord(input.ruleProvenance)) {
    return { issues: ['missing-engine-or-provenance'], valid: false }
  }
  if (
    !hasExactlyKeys(input.engine, [
      'maximumPerEntrantPerSeason',
      'used',
    ]) ||
    !hasExactlyKeys(input.ruleProvenance, [
      'maximumPerEntrantPerSeason',
      'replacementConsequences',
    ])
  ) {
    return { issues: ['unexpected-engine-or-provenance-fields'], valid: false }
  }

  const used =
    typeof input.engine.used === 'number' ? input.engine.used : Number.NaN
  const entrantId =
    typeof input.entrantId === 'string' ? input.entrantId.trim() : ''
  const sourceMatches =
    sameProvenance(
      input.ruleProvenance.maximumPerEntrantPerSeason,
      rules.maximumProvenance,
    ) &&
    sameProvenance(
      input.ruleProvenance.replacementConsequences,
      rules.replacementProvenance,
    )

  if (
    input.kind !== 'super-formula-2026-engine-ledger' ||
    input.schemaVersion !== 1 ||
    input.seasonYear !== 2026 ||
    input.seriesId !== 'super-formula' ||
    entrantId.length === 0 ||
    input.engine.maximumPerEntrantPerSeason !==
      rules.maximumPerEntrantPerSeason ||
    !Number.isInteger(used) ||
    used < 1 ||
    used > rules.maximumPerEntrantPerSeason ||
    !sourceMatches
  ) {
    return { issues: ['invalid-engine-ledger-values'], valid: false }
  }

  return {
    ledger: ledgerFrom({ entrantId, rules, used }),
    valid: true,
  }
}

/** Returns the Article 24 timing and exemption text without adjudicating it. */
export function superFormula2026EngineReplacementConsequences(): SuperFormula2026EngineReplacementConsequenceReference {
  return consequenceReference()
}

/**
 * Replaces one declared engine when the sourced season allocation permits it.
 * No grid-drop, pit-lane-start, or other F1-style synthetic penalty is
 * calculated here; the verified Article 24 metadata is returned for a later
 * event-timing adjudicator.
 */
export function replaceSuperFormula2026Engine(
  input: unknown,
): SuperFormula2026EngineReplacementResult {
  const validation = validateSuperFormula2026EngineLedger(input)
  if (!validation.valid) {
    return { issues: validation.issues, status: 'invalid-ledger' }
  }

  const rules = requiredEngineRules()
  const { ledger } = validation
  const remaining = ledger.engine.maximumPerEntrantPerSeason - ledger.engine.used
  const consequences = consequenceReference(rules)

  if (remaining === 0) {
    return {
      consequenceReference: consequences,
      ledger,
      remaining: 0,
      status: 'season-allocation-exhausted',
    }
  }

  const nextLedger = ledgerFrom({
    entrantId: ledger.entrantId,
    rules,
    used: ledger.engine.used + 1,
  })

  return {
    consequenceReference: consequences,
    ledger: nextLedger,
    remaining: nextLedger.engine.maximumPerEntrantPerSeason - nextLedger.engine.used,
    status: 'replaced',
  }
}
