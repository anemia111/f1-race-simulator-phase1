import type { SeriesId } from '../series/types'
import {
  parseFreeModeConfiguration,
  validateFreeModeConfiguration,
} from './freeModeValidation'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModePreset,
  FreeModeQualifyingResult,
  FreeModeStoredState,
} from './types'

export const FREE_MODE_STORAGE_KEY = 'race-sim-free-mode-v1'
export const FREE_MODE_PRESETS_STORAGE_KEY =
  'race-sim-free-mode-presets-v1'
export const FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY =
  'race-sim-free-race-checkpoint-v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseQualifyingResult(
  value: unknown,
  configuration: FreeModeConfiguration,
): FreeModeQualifyingResult | null {
  if (
    value === null ||
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.categoryId !== 'string' ||
    value.categoryId !== configuration.categoryId ||
    typeof value.trackId !== 'string' ||
    value.trackId !== configuration.trackId ||
    typeof value.seed !== 'string' ||
    value.seed.length > 120 ||
    typeof value.completedAt !== 'string' ||
    value.completedAt.length > 80 ||
    !Array.isArray(value.orderedDriverIds) ||
    value.orderedDriverIds.length !== configuration.entrants.length ||
    value.orderedDriverIds.some(
      (driverId) => typeof driverId !== 'string' || driverId.length > 120,
    )
  ) {
    return null
  }

  const configuredDriverIds = new Set(
    configuration.entrants.map((entrant) => entrant.driverId),
  )
  const orderedDriverIds = value.orderedDriverIds as string[]

  if (
    new Set(orderedDriverIds).size !== orderedDriverIds.length ||
    !orderedDriverIds.every((driverId) => configuredDriverIds.has(driverId))
  ) {
    return null
  }

  return {
    categoryId: value.categoryId as SeriesId,
    completedAt: value.completedAt,
    orderedDriverIds,
    seed: value.seed,
    trackId: value.trackId,
    version: 1,
  }
}

export function parseFreeModeStoredState(
  raw: string | null,
  context: FreeModeBuildContext,
): FreeModeStoredState | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== 1) {
      return null
    }
    const configuration = parseFreeModeConfiguration(
      parsed.configuration,
      context,
      { requireQualifyingResult: false },
    )
    if (!configuration) {
      return null
    }
    const qualifyingResult = parseQualifyingResult(
      parsed.qualifyingResult,
      configuration,
    )
    if (
      validateFreeModeConfiguration(configuration, {
        ...context,
        qualifyingResult,
      }).length > 0
    ) {
      return null
    }

    return {
      configuration,
      qualifyingResult,
      version: 1,
    }
  } catch {
    return null
  }
}

export function loadFreeModeStoredState(
  storage: StorageLike,
  context: FreeModeBuildContext,
) {
  try {
    return parseFreeModeStoredState(
      storage.getItem(FREE_MODE_STORAGE_KEY),
      context,
    )
  } catch {
    return null
  }
}

export function saveFreeModeStoredState(
  storage: StorageLike,
  state: FreeModeStoredState,
) {
  try {
    storage.setItem(FREE_MODE_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function parsePreset(
  value: unknown,
  context: FreeModeBuildContext,
): FreeModePreset | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    value.id.length > 120 ||
    typeof value.name !== 'string' ||
    value.name.trim().length < 1 ||
    value.name.length > 80 ||
    typeof value.updatedAt !== 'string' ||
    value.updatedAt.length > 80
  ) {
    return null
  }
  const configuration = parseFreeModeConfiguration(value.configuration, context)

  return configuration
    ? {
        configuration,
        id: value.id,
        name: value.name.trim(),
        updatedAt: value.updatedAt,
      }
    : null
}

export function loadFreeModePresets(
  storage: StorageLike,
  context: FreeModeBuildContext,
): FreeModePreset[] {
  try {
    const raw = storage.getItem(FREE_MODE_PRESETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length > 100) return []

    const presets = parsed.map((value) => parsePreset(value, context))
    return presets.filter((preset): preset is FreeModePreset => preset !== null)
  } catch {
    return []
  }
}

export function saveFreeModePresets(
  storage: StorageLike,
  presets: FreeModePreset[],
) {
  try {
    storage.setItem(
      FREE_MODE_PRESETS_STORAGE_KEY,
      JSON.stringify(presets.slice(0, 100)),
    )
    return true
  } catch {
    return false
  }
}

export function exportFreeModeConfiguration(
  configuration: FreeModeConfiguration,
) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: 'race-sim-free-mode',
      configuration,
      version: 1,
    },
    null,
    2,
  )
}

export function importFreeModeConfiguration(
  raw: string,
  context: FreeModeBuildContext,
) {
  if (raw.length > 1_000_000) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    const candidate =
      isRecord(parsed) && 'configuration' in parsed
        ? parsed.configuration
        : parsed

    return parseFreeModeConfiguration(candidate, context)
  } catch {
    return null
  }
}
