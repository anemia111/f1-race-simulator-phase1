import type { SuperFormulaRuleProvenance } from '../data/superFormulaRules2026'
import {
  resolveSuperFormulaOperational,
  type SuperFormulaRefuellingInterlockId,
  type SuperFormulaRefuellingResolution,
  type SuperFormulaRefuellingSafetyEvidence,
} from './superFormulaOperational'

/**
 * Article 25 establishes the safety conditions under which refuelling may be
 * permitted, but it does not publish a universal service time, transfer rate,
 * or fuel mass.  A numerical task therefore requires a separately verified
 * event document.  All three values are required together so the simulator
 * never derives one from the other two.
 */
export type SuperFormulaEventRefuellingPack = {
  readonly fuelMassGainKg: number
  readonly kind: 'super-formula-refuelling-event-pack'
  readonly provenance: {
    readonly authority: 'event-special-regulation' | 'official-notice'
    readonly checksum: string
    readonly documentId: string
    readonly publishedAt: string
    readonly url: string
  }
  readonly schemaVersion: 1
  readonly seriesId: 'super-formula'
  readonly serviceDurationSeconds: number
  readonly transferRateKgPerSecond: number
}

export type SuperFormulaRefuellingTaskRequest = {
  /**
   * Event documents are external input.  The resolver rejects incomplete or
   * unprovenanced input rather than using a historic pit-stop number.
   */
  readonly eventPack?: unknown
  /**
   * A malformed safety declaration is treated exactly as absent evidence.
   */
  readonly safetyEvidence?: unknown
}

export type SuperFormulaRefuellingTaskSafety = {
  readonly allowedLocations: readonly string[] | null
  readonly engineShutdownRequired: boolean | null
  readonly missingInterlocks: readonly SuperFormulaRefuellingInterlockId[]
  readonly permittedByRegulation: boolean
  readonly status: 'blocked' | 'ready'
}

export type SuperFormulaUnavailableRefuellingNumericalTask = {
  readonly availability: 'unavailable'
  readonly fuelMassGainKg: null
  readonly provenance: SuperFormulaRuleProvenance | SuperFormulaEventRefuellingPack['provenance']
  readonly reason: string
  readonly serviceDurationSeconds: null
  readonly transferRateKgPerSecond: null
}

export type SuperFormulaVerifiedEventRefuellingNumericalTask = {
  readonly availability: 'verified-event-rule'
  readonly fuelMassGainKg: number
  readonly provenance: SuperFormulaEventRefuellingPack['provenance']
  readonly serviceDurationSeconds: number
  readonly transferRateKgPerSecond: number
}

export type SuperFormulaRefuellingNumericalTask =
  | SuperFormulaUnavailableRefuellingNumericalTask
  | SuperFormulaVerifiedEventRefuellingNumericalTask

export type SuperFormulaRefuellingTaskStatus =
  | 'blocked-by-safety'
  | 'ready'
  | 'unavailable-event-task'
  | 'unavailable-regulation'

export type SuperFormulaRefuellingTaskResolution = {
  /** True only when Article 25 safeguards and a complete event task agree. */
  readonly canExecute: boolean
  readonly eventPackStatus:
    | 'accepted'
    | 'base-regulation-unavailable'
    | 'invalid'
    | 'missing'
  readonly kind: 'super-formula-refuelling-task'
  /**
   * The only values a later race integration may use to change fuel state.
   * They are null on every non-ready path.
   */
  readonly numericalTask: SuperFormulaRefuellingNumericalTask
  /** Retains the direct Article 25 resolution and source provenance. */
  readonly regulation: SuperFormulaRefuellingResolution
  readonly safety: SuperFormulaRefuellingTaskSafety
  readonly status: SuperFormulaRefuellingTaskStatus
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function safetyEvidenceFrom(
  value: unknown,
): SuperFormulaRefuellingSafetyEvidence | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.cowlAirOutletsProtected !== 'boolean' ||
    typeof value.cowlInstalled !== 'boolean' ||
    !isNonNegativeFiniteNumber(value.dedicatedFireMarshalCount) ||
    typeof value.designatedWorkingArea !== 'boolean' ||
    typeof value.equipmentInspectedBeforeUse !== 'boolean' ||
    typeof value.equipmentSecuredAgainstTipping !== 'boolean' ||
    !isNonNegativeFiniteNumber(value.fireExtinguisherCapacityKg) ||
    typeof value.postRefuellingLeakCheckScheduled !== 'boolean'
  ) {
    return null
  }

  return {
    cowlAirOutletsProtected: value.cowlAirOutletsProtected,
    cowlInstalled: value.cowlInstalled,
    dedicatedFireMarshalCount: value.dedicatedFireMarshalCount,
    designatedWorkingArea: value.designatedWorkingArea,
    equipmentInspectedBeforeUse: value.equipmentInspectedBeforeUse,
    equipmentSecuredAgainstTipping: value.equipmentSecuredAgainstTipping,
    fireExtinguisherCapacityKg: value.fireExtinguisherCapacityKg,
    postRefuellingLeakCheckScheduled: value.postRefuellingLeakCheckScheduled,
  }
}

function eventPackFrom(value: unknown): SuperFormulaEventRefuellingPack | null {
  if (!isRecord(value) || !isRecord(value.provenance)) {
    return null
  }

  const provenance = value.provenance
  if (
    value.kind !== 'super-formula-refuelling-event-pack' ||
    value.schemaVersion !== 1 ||
    value.seriesId !== 'super-formula' ||
    !isPositiveFiniteNumber(value.fuelMassGainKg) ||
    !isPositiveFiniteNumber(value.serviceDurationSeconds) ||
    !isPositiveFiniteNumber(value.transferRateKgPerSecond) ||
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
    fuelMassGainKg: value.fuelMassGainKg,
    kind: 'super-formula-refuelling-event-pack',
    provenance: {
      authority: provenance.authority,
      checksum: provenance.checksum,
      documentId: provenance.documentId,
      publishedAt: provenance.publishedAt,
      url: provenance.url,
    },
    schemaVersion: 1,
    seriesId: 'super-formula',
    serviceDurationSeconds: value.serviceDurationSeconds,
    transferRateKgPerSecond: value.transferRateKgPerSecond,
  }
}

function safetyFrom(
  regulation: SuperFormulaRefuellingResolution,
): SuperFormulaRefuellingTaskSafety {
  return {
    allowedLocations: regulation.allowedLocations,
    engineShutdownRequired: regulation.engineShutdownRequired,
    missingInterlocks: regulation.safetyGate.missingInterlocks,
    permittedByRegulation: regulation.permittedByRegulation,
    status: regulation.safetyGate.status,
  }
}

function unavailableNumericalTask(options: {
  provenance: SuperFormulaUnavailableRefuellingNumericalTask['provenance']
  reason: string
}): SuperFormulaUnavailableRefuellingNumericalTask {
  return {
    availability: 'unavailable',
    fuelMassGainKg: null,
    provenance: options.provenance,
    reason: options.reason,
    serviceDurationSeconds: null,
    transferRateKgPerSecond: null,
  }
}

/**
 * Resolves an executable SUPER FORMULA refuelling task without mutating race
 * state.  A caller may only use a numerical task when `canExecute` is true;
 * no rate, duration, or mass gain is inferred from Article 25 or F1 logic.
 */
export function resolveSuperFormulaRefuellingTask(
  request: SuperFormulaRefuellingTaskRequest = {},
): SuperFormulaRefuellingTaskResolution {
  const regulation = resolveSuperFormulaOperational({
    refuellingSafetyEvidence: safetyEvidenceFrom(request.safetyEvidence),
  }).refuelling
  const safety = safetyFrom(regulation)

  if (
    regulation.availability !== 'verified' ||
    !regulation.permittedByRegulation
  ) {
    return {
      canExecute: false,
      eventPackStatus: 'base-regulation-unavailable',
      kind: 'super-formula-refuelling-task',
      numericalTask: unavailableNumericalTask({
        provenance: regulation.provenance,
        reason:
          regulation.availability === 'unavailable'
            ? regulation.reason
            : 'The Article 25 refuelling permission is not available for execution.',
      }),
      regulation,
      safety,
      status: 'unavailable-regulation',
    }
  }

  const eventPackInputProvided =
    request.eventPack !== undefined && request.eventPack !== null
  const eventPack = eventPackFrom(request.eventPack)
  const eventPackStatus = eventPack
    ? 'accepted'
    : eventPackInputProvided
      ? 'invalid'
      : 'missing'

  if (safety.status !== 'ready') {
    return {
      canExecute: false,
      eventPackStatus,
      kind: 'super-formula-refuelling-task',
      numericalTask: unavailableNumericalTask({
        provenance: eventPack?.provenance ?? regulation.provenance,
        reason:
          'Article 25 refuelling safety evidence is incomplete; numerical event inputs are not released to a pit task.',
      }),
      regulation,
      safety,
      status: 'blocked-by-safety',
    }
  }

  if (!eventPack) {
    return {
      canExecute: false,
      eventPackStatus,
      kind: 'super-formula-refuelling-task',
      numericalTask: unavailableNumericalTask({
        provenance: regulation.provenance,
        reason:
          eventPackStatus === 'missing'
            ? 'No verified SUPER FORMULA event refuelling pack is supplied; Article 25 has no numerical runtime default.'
            : 'The supplied SUPER FORMULA event refuelling pack is incomplete or lacks provenance.',
      }),
      regulation,
      safety,
      status: 'unavailable-event-task',
    }
  }

  return {
    canExecute: true,
    eventPackStatus: 'accepted',
    kind: 'super-formula-refuelling-task',
    numericalTask: {
      availability: 'verified-event-rule',
      fuelMassGainKg: eventPack.fuelMassGainKg,
      provenance: eventPack.provenance,
      serviceDurationSeconds: eventPack.serviceDurationSeconds,
      transferRateKgPerSecond: eventPack.transferRateKgPerSecond,
    },
    regulation,
    safety,
    status: 'ready',
  }
}
