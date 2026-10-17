import {
  superFormulaOperationalRules2026,
  type SuperFormulaRule,
  type SuperFormulaRuleProvenance,
  type VerifiedSuperFormulaRule,
} from '../data/superFormulaRules2026'

/**
 * An event OTS pack is deliberately separate from the binding JAF base
 * regulation. Article 24.3.8 delegates the exact OTS operation to event
 * special regulations or official notices, so no event pack means no OTS
 * runtime configuration.
 */
export type SuperFormulaEventOtsPack = {
  readonly activationConditions: string
  readonly allocationSeconds: number
  readonly boostPowerKw: number
  readonly cooldownSeconds: number
  readonly kind: 'super-formula-ots-event-pack'
  readonly provenance: {
    readonly authority: 'event-special-regulation' | 'official-notice'
    readonly checksum: string
    readonly documentId: string
    readonly publishedAt: string
    readonly url: string
  }
  readonly schemaVersion: 1
  readonly seriesId: 'super-formula'
}

export type SuperFormulaRefuellingSafetyEvidence = {
  readonly cowlAirOutletsProtected: boolean
  readonly cowlInstalled: boolean
  readonly dedicatedFireMarshalCount: number
  readonly designatedWorkingArea: boolean
  readonly equipmentInspectedBeforeUse: boolean
  readonly equipmentSecuredAgainstTipping: boolean
  readonly fireExtinguisherCapacityKg: number
  readonly postRefuellingLeakCheckScheduled: boolean
}

export type SuperFormulaOperationalRequest = {
  /**
   * External event documents are parsed as unknown input. A malformed or
   * incomplete document is rejected rather than receiving a historic default.
   */
  readonly eventOtsPack?: unknown
  readonly refuellingSafetyEvidence?: SuperFormulaRefuellingSafetyEvidence | null
}

export type SuperFormulaPitLaneResolution =
  | {
      readonly availability: 'unavailable'
      readonly enforcement: 'disabled'
      readonly provenance: SuperFormulaRuleProvenance
      readonly reason: string
      readonly speedLimitKph: null
    }
  | {
      readonly availability: 'verified'
      readonly enforcement: 'enabled'
      readonly provenance: SuperFormulaRuleProvenance
      readonly speedLimitKph: number
    }

export type SuperFormulaUnavailableOtsResolution = {
  readonly activationConditions: null
  readonly active: false
  readonly allocationSeconds: null
  readonly availability: 'unavailable'
  readonly boostPowerKw: null
  readonly cooldownSeconds: null
  readonly eventPackStatus: 'base-rule-conflict' | 'invalid' | 'missing'
  readonly provenance: SuperFormulaRuleProvenance
  readonly reason: string
  readonly runtimeEligibility: {
    readonly canActivate: false
    readonly status: 'unavailable'
  }
}

export type SuperFormulaEventConfiguredOtsResolution = {
  readonly activationConditions: string
  /** The resolver never activates OTS; the race runtime must evaluate it. */
  readonly active: false
  readonly allocationSeconds: number
  readonly availability: 'verified-event-rule'
  readonly boostPowerKw: number
  readonly cooldownSeconds: number
  readonly eventPackStatus: 'accepted'
  readonly provenance: SuperFormulaEventOtsPack['provenance']
  readonly runtimeEligibility: {
    readonly canActivate: false
    readonly status: 'requires-event-condition-evaluation'
  }
}

export type SuperFormulaOtsResolution =
  | SuperFormulaUnavailableOtsResolution
  | SuperFormulaEventConfiguredOtsResolution

export type SuperFormulaRefuellingInterlockId =
  | 'cowl-air-outlets-protected'
  | 'cowl-installed'
  | 'dedicated-fire-marshal'
  | 'designated-working-area'
  | 'equipment-inspected-before-use'
  | 'equipment-secured-against-tipping'
  | 'fire-extinguisher-capacity'
  | 'post-refuelling-leak-check-scheduled'

export type SuperFormulaRefuellingSafetyInterlocks = {
  readonly cowlMustBeInstalled: boolean
  readonly designatedWorkingAreaOnly: boolean
  readonly equipmentMustBeInspectedBeforeUse: boolean
  readonly equipmentMustBeSecuredAgainstTipping: boolean
  readonly fireMarshalDedicatedToFireDuty: boolean
  readonly minimumDedicatedFireMarshalCount: number
  readonly minimumFireExtinguisherCapacityKg: number
  readonly postRefuellingLeakCheckRequired: boolean
  readonly protectCowlAirOutletsFromFuelSpray: boolean
}

export type SuperFormulaNumericOperationalInput = {
  readonly availability: 'unavailable' | 'verified'
  readonly provenance: SuperFormulaRuleProvenance
  readonly reason: string | null
  readonly value: number | null
}

export type SuperFormulaRefuellingResolution =
  | {
      readonly allowedLocations: null
      readonly availability: 'unavailable'
      readonly engineShutdownRequired: null
      readonly permittedByRegulation: false
      readonly provenance: SuperFormulaRuleProvenance
      readonly reason: string
      readonly safetyGate: {
        readonly missingInterlocks: readonly SuperFormulaRefuellingInterlockId[]
        readonly status: 'blocked'
      }
      readonly serviceDurationSeconds: SuperFormulaNumericOperationalInput
      readonly transferRateKgPerSecond: SuperFormulaNumericOperationalInput
    }
  | {
      readonly allowedLocations: readonly string[]
      readonly availability: 'verified'
      readonly engineShutdownRequired: boolean
      readonly permittedByRegulation: true
      readonly provenance: SuperFormulaRuleProvenance
      readonly safetyGate: {
        readonly missingInterlocks: readonly SuperFormulaRefuellingInterlockId[]
        readonly status: 'blocked' | 'ready'
      }
      /** No timed stop model can be released while this remains unavailable. */
      readonly serviceDurationSeconds: SuperFormulaNumericOperationalInput
      /** No fuel-mass transfer model can be released while this remains unavailable. */
      readonly transferRateKgPerSecond: SuperFormulaNumericOperationalInput
    }

export type SuperFormulaOperationalResolution = {
  readonly effectiveFrom: string
  readonly ots: SuperFormulaOtsResolution
  readonly pitLane: SuperFormulaPitLaneResolution
  readonly refuelling: SuperFormulaRefuellingResolution
  readonly seriesId: 'super-formula'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isPositiveFiniteNumber = (value: unknown): value is number =>
  isNonNegativeFiniteNumber(value) && value > 0

function isVerifiedRule<Value>(
  rule: SuperFormulaRule<Value>,
): rule is VerifiedSuperFormulaRule<Value> {
  return rule.availability === 'verified'
}

/**
 * Keeps the resolver robust if a future source package changes a currently
 * verified literal into an unavailable rule. Const inference must not erase
 * that runtime branch merely because the 2026 source happens to be complete.
 */
function asPotentiallyUnavailableRule<Value>(
  rule: SuperFormulaRule<Value>,
): SuperFormulaRule<Value> {
  return rule
}

function eventOtsPackFrom(value: unknown): SuperFormulaEventOtsPack | null {
  if (!isRecord(value) || !isRecord(value.provenance)) {
    return null
  }

  const provenance = value.provenance
  if (
    value.kind !== 'super-formula-ots-event-pack' ||
    value.schemaVersion !== 1 ||
    value.seriesId !== 'super-formula' ||
    !isNonEmptyString(value.activationConditions) ||
    !isPositiveFiniteNumber(value.allocationSeconds) ||
    !isNonNegativeFiniteNumber(value.boostPowerKw) ||
    !isNonNegativeFiniteNumber(value.cooldownSeconds) ||
    (provenance.authority !== 'event-special-regulation' &&
      provenance.authority !== 'official-notice') ||
    !isNonEmptyString(provenance.checksum) ||
    !isNonEmptyString(provenance.documentId) ||
    !isNonEmptyString(provenance.publishedAt) ||
    !isNonEmptyString(provenance.url)
  ) {
    return null
  }

  return {
    activationConditions: value.activationConditions,
    allocationSeconds: value.allocationSeconds,
    boostPowerKw: value.boostPowerKw,
    cooldownSeconds: value.cooldownSeconds,
    kind: 'super-formula-ots-event-pack',
    provenance: {
      authority: provenance.authority,
      checksum: provenance.checksum,
      documentId: provenance.documentId,
      publishedAt: provenance.publishedAt,
      url: provenance.url,
    },
    schemaVersion: 1,
    seriesId: 'super-formula',
  }
}

function resolvePitLane(): SuperFormulaPitLaneResolution {
  const rule = asPotentiallyUnavailableRule<number>(
    superFormulaOperationalRules2026.pitLane.speedLimitKph
  )

  if (!isVerifiedRule(rule)) {
    return {
      availability: 'unavailable',
      enforcement: 'disabled',
      provenance: rule.provenance,
      reason: rule.reason,
      speedLimitKph: null,
    }
  }

  return {
    availability: 'verified',
    enforcement: 'enabled',
    provenance: rule.provenance,
    speedLimitKph: rule.value,
  }
}

function baseRulesDelegateOtsOperation() {
  const rules = superFormulaOperationalRules2026.overtakeSystem

  return [
    rules.activationConditions,
    rules.allocationSeconds,
    rules.boostPowerKw,
    rules.cooldownSeconds,
  ].every((rule) => rule.availability === 'unavailable')
}

function resolveOts(eventOtsPack: unknown): SuperFormulaOtsResolution {
  const baseProvenance =
    superFormulaOperationalRules2026.overtakeSystem.activationConditions
      .provenance

  if (!baseRulesDelegateOtsOperation()) {
    return {
      activationConditions: null,
      active: false,
      allocationSeconds: null,
      availability: 'unavailable',
      boostPowerKw: null,
      cooldownSeconds: null,
      eventPackStatus: 'base-rule-conflict',
      provenance: baseProvenance,
      reason:
        'The binding rule package no longer consistently delegates OTS operation to an event document.',
      runtimeEligibility: { canActivate: false, status: 'unavailable' },
    }
  }

  if (eventOtsPack === undefined || eventOtsPack === null) {
    return {
      activationConditions: null,
      active: false,
      allocationSeconds: null,
      availability: 'unavailable',
      boostPowerKw: null,
      cooldownSeconds: null,
      eventPackStatus: 'missing',
      provenance: baseProvenance,
      reason:
        'No verified SUPER FORMULA event OTS pack is supplied; Article 24.3.8 does not publish a runtime default.',
      runtimeEligibility: { canActivate: false, status: 'unavailable' },
    }
  }

  const eventPack = eventOtsPackFrom(eventOtsPack)
  if (!eventPack) {
    return {
      activationConditions: null,
      active: false,
      allocationSeconds: null,
      availability: 'unavailable',
      boostPowerKw: null,
      cooldownSeconds: null,
      eventPackStatus: 'invalid',
      provenance: baseProvenance,
      reason:
        'The supplied SUPER FORMULA event OTS pack is incomplete or lacks provenance.',
      runtimeEligibility: { canActivate: false, status: 'unavailable' },
    }
  }

  return {
    activationConditions: eventPack.activationConditions,
    active: false,
    allocationSeconds: eventPack.allocationSeconds,
    availability: 'verified-event-rule',
    boostPowerKw: eventPack.boostPowerKw,
    cooldownSeconds: eventPack.cooldownSeconds,
    eventPackStatus: 'accepted',
    provenance: eventPack.provenance,
    runtimeEligibility: {
      canActivate: false,
      status: 'requires-event-condition-evaluation',
    },
  }
}

function numericOperationalInput(
  rule: SuperFormulaRule<number>,
): SuperFormulaNumericOperationalInput {
  if (isVerifiedRule(rule)) {
    return {
      availability: 'verified',
      provenance: rule.provenance,
      reason: null,
      value: rule.value,
    }
  }

  return {
    availability: 'unavailable',
    provenance: rule.provenance,
    reason: rule.reason,
    value: null,
  }
}

function missingRefuellingInterlocks(
  required: SuperFormulaRefuellingSafetyInterlocks,
  evidence: SuperFormulaRefuellingSafetyEvidence | null | undefined,
): SuperFormulaRefuellingInterlockId[] {
  if (!evidence) {
    return [
      'cowl-air-outlets-protected',
      'cowl-installed',
      'dedicated-fire-marshal',
      'designated-working-area',
      'equipment-inspected-before-use',
      'equipment-secured-against-tipping',
      'fire-extinguisher-capacity',
      'post-refuelling-leak-check-scheduled',
    ]
  }

  const missing: SuperFormulaRefuellingInterlockId[] = []
  if (required.protectCowlAirOutletsFromFuelSpray && !evidence.cowlAirOutletsProtected) {
    missing.push('cowl-air-outlets-protected')
  }
  if (required.cowlMustBeInstalled && !evidence.cowlInstalled) {
    missing.push('cowl-installed')
  }
  if (
    required.fireMarshalDedicatedToFireDuty &&
    evidence.dedicatedFireMarshalCount < required.minimumDedicatedFireMarshalCount
  ) {
    missing.push('dedicated-fire-marshal')
  }
  if (required.designatedWorkingAreaOnly && !evidence.designatedWorkingArea) {
    missing.push('designated-working-area')
  }
  if (
    required.equipmentMustBeInspectedBeforeUse &&
    !evidence.equipmentInspectedBeforeUse
  ) {
    missing.push('equipment-inspected-before-use')
  }
  if (
    required.equipmentMustBeSecuredAgainstTipping &&
    !evidence.equipmentSecuredAgainstTipping
  ) {
    missing.push('equipment-secured-against-tipping')
  }
  if (
    evidence.fireExtinguisherCapacityKg <
    required.minimumFireExtinguisherCapacityKg
  ) {
    missing.push('fire-extinguisher-capacity')
  }
  if (
    required.postRefuellingLeakCheckRequired &&
    !evidence.postRefuellingLeakCheckScheduled
  ) {
    missing.push('post-refuelling-leak-check-scheduled')
  }

  return missing
}

function resolveRefuelling(
  evidence: SuperFormulaRefuellingSafetyEvidence | null | undefined,
): SuperFormulaRefuellingResolution {
  const refuellingRule = asPotentiallyUnavailableRule<{
    readonly allowedLocations: readonly string[]
    readonly engineShutdownRequired: boolean
    readonly safetyInterlocks: SuperFormulaRefuellingSafetyInterlocks
  }>(superFormulaOperationalRules2026.fuel.refuelling)
  const serviceDurationSeconds = numericOperationalInput(
    superFormulaOperationalRules2026.fuel.serviceDurationSeconds,
  )
  const transferRateKgPerSecond = numericOperationalInput(
    superFormulaOperationalRules2026.fuel.transferRateKgPerSecond,
  )

  if (!isVerifiedRule(refuellingRule)) {
    return {
      allowedLocations: null,
      availability: 'unavailable',
      engineShutdownRequired: null,
      permittedByRegulation: false,
      provenance: refuellingRule.provenance,
      reason: refuellingRule.reason,
      safetyGate: { missingInterlocks: [], status: 'blocked' },
      serviceDurationSeconds,
      transferRateKgPerSecond,
    }
  }

  const required = refuellingRule.value.safetyInterlocks
  const missingInterlocks = missingRefuellingInterlocks(required, evidence)

  return {
    allowedLocations: refuellingRule.value.allowedLocations,
    availability: 'verified',
    engineShutdownRequired: refuellingRule.value.engineShutdownRequired,
    permittedByRegulation: true,
    provenance: refuellingRule.provenance,
    safetyGate: {
      missingInterlocks,
      status: missingInterlocks.length === 0 ? 'ready' : 'blocked',
    },
    serviceDurationSeconds,
    transferRateKgPerSecond,
  }
}

/**
 * Resolves only directly sourced operational state. It intentionally has no
 * legacy OTS or refuelling-rate fallback, and does not mutate race state.
 */
export function resolveSuperFormulaOperational(
  request: SuperFormulaOperationalRequest = {},
): SuperFormulaOperationalResolution {
  return {
    effectiveFrom: superFormulaOperationalRules2026.effectiveFrom,
    ots: resolveOts(request.eventOtsPack),
    pitLane: resolvePitLane(),
    refuelling: resolveRefuelling(request.refuellingSafetyEvidence),
    seriesId: 'super-formula',
  }
}
