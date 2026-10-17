import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
  ValidationVehicleEraId,
  VehicleEraId,
} from './seriesIds'

type VehicleSpecVersionBase<
  EraId extends VehicleEraId,
  Availability extends 'runtime' | 'validation-only',
> = {
  readonly aeroSystemId: string
  readonly availability: Availability
  /**
   * Start of the vehicle specification, not the date of a later validation
   * run using that specification.
   */
  readonly effectiveFrom: string
  readonly eraId: EraId
  readonly powerUnitSystemId: string
  readonly regulationSetId: string
  readonly regulationSourceIds: readonly string[]
  readonly seriesId: ExecutableSeriesId
  readonly tyreFamilyId: string
  readonly vehiclePhysicsId: string
}

export type RuntimeVehicleSpecVersion = VehicleSpecVersionBase<
  RuntimeVehicleEraId,
  'runtime'
>

export type ValidationVehicleSpecVersion = VehicleSpecVersionBase<
  ValidationVehicleEraId,
  'validation-only'
> & {
  /** Evidence can identify a validation run without being a regulation. */
  readonly validationEvidenceSourceIds: readonly string[]
}

export type VehicleSpecVersion =
  | RuntimeVehicleSpecVersion
  | ValidationVehicleSpecVersion

/**
 * Explicit vehicle-generation packages. Identifiers are deliberately different
 * across generations/categories so tyre, aero, and power-unit state cannot
 * leak through a shared "F1-like" package.
 */
export const vehicleEraRegistry: readonly VehicleSpecVersion[] = [
  {
    aeroSystemId: 'f1-2025-drs',
    availability: 'validation-only',
    effectiveFrom: '2025-01-01',
    eraId: 'f1-2025-tpc',
    powerUnitSystemId: 'f1-2025-hybrid',
    regulationSetId: 'fia-f1-2025-validation',
    // No 2025 rulebook was frozen in Phase 0. Do not imply that the Haas
    // announcement is a technical regulation source.
    regulationSourceIds: [],
    seriesId: 'f1-custom',
    tyreFamilyId: 'pirelli-f1-2025',
    validationEvidenceSourceIds: ['haas-fuji-tpc-2026-06-25'],
    vehiclePhysicsId: 'f1-2025-tpc-vehicle',
  },
  {
    aeroSystemId: 'f1-2026-active-aero',
    availability: 'runtime',
    effectiveFrom: '2026-01-01',
    eraId: 'f1-2026-current',
    powerUnitSystemId: 'f1-2026-hybrid',
    regulationSetId: 'fia-f1-2026-b08-c20-f10',
    regulationSourceIds: [
      'fia-f1-2026-sporting-b08',
      'fia-f1-2026-technical-c20',
      'fia-f1-2026-operational-f10',
    ],
    seriesId: 'f1-custom',
    tyreFamilyId: 'pirelli-f1-2026',
    vehiclePhysicsId: 'f1-2026-current-vehicle',
  },
  {
    aeroSystemId: 'sf23-fixed-aero',
    availability: 'runtime',
    effectiveFrom: '2026-01-01',
    eraId: 'sf-2026',
    powerUnitSystemId: 'sf-nre-2026',
    regulationSetId: 'jaf-sf-2026-effective',
    regulationSourceIds: [
      'jaf-sf-2026-unified-regulations',
      'jaf-sf-2026-correction-web011',
      'jaf-race-bulletin-003-2026',
      'jaf-sf-2026-substitute-round-3-web056',
    ],
    seriesId: 'super-formula',
    tyreFamilyId: 'yokohama-sf-2026-control',
    vehiclePhysicsId: 'dallara-sf23-2026',
  },
] as const

export type RuntimeVehicleEraQuery = {
  readonly eventDate: string
  readonly requestedEraId?: VehicleEraId
  readonly seriesId: ExecutableSeriesId
}

function dateValue(value: string, label: string): number {
  const parsed = Date.parse(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }

  return parsed
}

export function vehicleEraForId(eraId: VehicleEraId): VehicleSpecVersion {
  const match = vehicleEraRegistry.find((candidate) => candidate.eraId === eraId)

  if (!match) {
    // The parameter is type-safe for callers, but keep the runtime boundary
    // strict for deserialised values.
    throw new Error(`Unknown vehicle era: ${String(eraId)}`)
  }

  return match
}

/**
 * Resolves the only live vehicle package valid for a series/date. Historical
 * TPC packages are rejected even when explicitly requested.
 */
export function resolveRuntimeVehicleEra(
  query: RuntimeVehicleEraQuery,
): RuntimeVehicleSpecVersion {
  const eventDate = dateValue(query.eventDate, 'event date')

  if (query.requestedEraId) {
    const requested = vehicleEraForId(query.requestedEraId)

    if (requested.availability !== 'runtime') {
      throw new Error(
        `Vehicle era ${requested.eraId} is validation-only and cannot run a live simulation`,
      )
    }

    if (requested.seriesId !== query.seriesId) {
      throw new Error(
        `Vehicle era ${requested.eraId} belongs to ${requested.seriesId}, not ${query.seriesId}`,
      )
    }

    if (dateValue(requested.effectiveFrom, 'era effective date') > eventDate) {
      throw new Error(
        `Vehicle era ${requested.eraId} is not effective on ${query.eventDate}`,
      )
    }

    return requested
  }

  const matches = vehicleEraRegistry.filter(
    (candidate): candidate is RuntimeVehicleSpecVersion =>
      candidate.availability === 'runtime' &&
      candidate.seriesId === query.seriesId &&
      dateValue(candidate.effectiveFrom, 'era effective date') <= eventDate,
  )

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `No runtime vehicle era is effective for ${query.seriesId} on ${query.eventDate}`
        : `Multiple runtime vehicle eras are effective for ${query.seriesId} on ${query.eventDate}`,
    )
  }

  return matches[0]
}

/** Validation access is explicit and never participates in runtime selection. */
export function validationVehicleEraForId(
  eraId: ValidationVehicleEraId,
): ValidationVehicleSpecVersion {
  const era = vehicleEraForId(eraId)

  if (era.availability !== 'validation-only') {
    throw new Error(`Vehicle era ${era.eraId} is not a validation-only package`)
  }

  return era
}
