import {
  validateDriverPool,
  type DriverCareerEntry,
  type DriverPoolProvenance,
  type DriverPoolRecord,
} from './driverPool'

export const DRIVER_POOL_SCHEMA_VERSION = 1 as const
export const MAX_DRIVER_POOL_BYTES = 2_000_000

const CANONICAL_DRIVER_COUNT = 110
const CANONICAL_PROVENANCE_COUNT = 111
const CANONICAL_F2_PROVENANCE_COUNT = 22
const CANONICAL_F3_PROVENANCE_COUNT = 30

export type PersistedDriverPool = {
  drivers: DriverPoolRecord[]
  schemaVersion: typeof DRIVER_POOL_SCHEMA_VERSION
  sourceManifestVersion: string
}

export type DriverPoolParseOptions = {
  /** Require the exact identity and historical-source totals of the 2026 pool. */
  strictCanonical?: boolean
}

export type DriverPoolParseResult =
  | { status: 'missing' }
  | { schemaVersion: unknown; status: 'incompatible' }
  | { reason: string; status: 'corrupt' }
  | {
      records: DriverPoolRecord[]
      schemaVersion: typeof DRIVER_POOL_SCHEMA_VERSION
      sourceManifestVersion: string
      status: 'ready'
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validateSourceManifestVersion(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value
  ) {
    throw new Error(
      'sourceManifestVersion must be a nonempty string of at most 160 characters.',
    )
  }
}

function cloneProvenance(
  provenance: DriverPoolProvenance,
): DriverPoolProvenance {
  return {
    ...provenance,
    ...(provenance.sourceTeam
      ? { sourceTeam: { ...provenance.sourceTeam } }
      : {}),
    sourceIds: [...provenance.sourceIds],
  }
}

function cloneCareerEntry(career: DriverCareerEntry): DriverCareerEntry {
  return {
    ...career,
    sourceIds: [...career.sourceIds],
  }
}

function cloneDriverPool(
  records: readonly DriverPoolRecord[],
): DriverPoolRecord[] {
  return records.map((record) => ({
    ...record,
    careerHistory: record.careerHistory.map(
      cloneCareerEntry,
    ) as DriverPoolRecord['careerHistory'],
    provenance: record.provenance.map(
      cloneProvenance,
    ) as DriverPoolRecord['provenance'],
    ratings: { ...record.ratings },
  }))
}

function driverPoolValidationOptions(options: DriverPoolParseOptions) {
  return options.strictCanonical
    ? {
        expectedIdentityCount: CANONICAL_DRIVER_COUNT,
        expectedProvenanceBySourceSeries: {
          f2: CANONICAL_F2_PROVENANCE_COUNT,
          f3: CANONICAL_F3_PROVENANCE_COUNT,
        },
        expectedProvenanceCount: CANONICAL_PROVENANCE_COUNT,
      }
    : undefined
}

export function createPersistedDriverPool(
  records: readonly DriverPoolRecord[],
  sourceManifestVersion: string,
): PersistedDriverPool {
  validateSourceManifestVersion(sourceManifestVersion)
  const validated = validateDriverPool(records)

  return {
    drivers: cloneDriverPool(validated),
    schemaVersion: DRIVER_POOL_SCHEMA_VERSION,
    sourceManifestVersion,
  }
}

export function serializeDriverPool(
  records: readonly DriverPoolRecord[],
  sourceManifestVersion: string,
) {
  return JSON.stringify(
    createPersistedDriverPool(records, sourceManifestVersion),
  )
}

/**
 * Parses storage without substituting registry defaults. Callers must handle
 * every result explicitly, especially incompatible and corrupt saved pools.
 */
export function parseDriverPool(
  raw: unknown,
  options: DriverPoolParseOptions = {},
): DriverPoolParseResult {
  if (raw === null || raw === undefined) {
    return { status: 'missing' }
  }

  let candidate: unknown = raw

  if (typeof raw === 'string') {
    if (new TextEncoder().encode(raw).byteLength > MAX_DRIVER_POOL_BYTES) {
      return {
        reason: `Driver pool exceeds the ${MAX_DRIVER_POOL_BYTES} byte limit.`,
        status: 'corrupt',
      }
    }

    try {
      candidate = JSON.parse(raw) as unknown
    } catch {
      return { reason: 'Driver pool is not valid JSON.', status: 'corrupt' }
    }
  }

  if (!isRecord(candidate)) {
    return { reason: 'Driver pool must be an object.', status: 'corrupt' }
  }

  if (!('schemaVersion' in candidate)) {
    return {
      reason: 'Driver pool has no schemaVersion.',
      status: 'corrupt',
    }
  }

  if (
    !Number.isSafeInteger(candidate.schemaVersion) ||
    (candidate.schemaVersion as number) < 1
  ) {
    return {
      reason: 'Driver pool has an invalid schemaVersion.',
      status: 'corrupt',
    }
  }

  if (candidate.schemaVersion !== DRIVER_POOL_SCHEMA_VERSION) {
    return {
      schemaVersion: candidate.schemaVersion,
      status: 'incompatible',
    }
  }

  try {
    validateSourceManifestVersion(candidate.sourceManifestVersion)
    const validated = validateDriverPool(
      candidate.drivers,
      driverPoolValidationOptions(options),
    )

    return {
      records: cloneDriverPool(validated),
      schemaVersion: DRIVER_POOL_SCHEMA_VERSION,
      sourceManifestVersion: candidate.sourceManifestVersion,
      status: 'ready',
    }
  } catch (error) {
    return {
      reason:
        error instanceof Error ? error.message : 'Driver pool is invalid.',
      status: 'corrupt',
    }
  }
}
