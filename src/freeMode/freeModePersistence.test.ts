import { describe, expect, it } from 'vitest'
import {
  driverPool2026,
  seriesPackages,
} from '../series/seriesRegistry'
import type { SeriesId, SeriesPackage } from '../series/types'
import {
  createDefaultFreeModeConfiguration,
} from './freeModeRegistry'
import {
  FREE_MODE_PRESETS_STORAGE_KEY,
  FREE_MODE_STORAGE_KEY,
  exportFreeModeConfiguration,
  importFreeModeConfiguration,
  loadFreeModePresets,
  loadFreeModeStoredState,
  saveFreeModePresets,
  saveFreeModeStoredState,
} from './freeModePersistence'
import type {
  FreeModeBuildContext,
  FreeModePreset,
  FreeModeStoredState,
} from './types'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const seriesById = new Map<SeriesId, SeriesPackage>(
  seriesPackages.map((series) => [series.id, series]),
)
const context: FreeModeBuildContext = {
  driverPool: driverPool2026,
  seriesById,
}

describe('Free Mode persistence', () => {
  it('round-trips the last configuration and qualifying result', () => {
    const storage = new MemoryStorage()
    const configuration = createDefaultFreeModeConfiguration(
      seriesById,
      'persisted-free',
    )
    const state: FreeModeStoredState = {
      configuration,
      qualifyingResult: {
        categoryId: configuration.categoryId,
        completedAt: '2026-07-29T00:00:00.000Z',
        orderedDriverIds: configuration.entrants.map(
          (entrant) => entrant.driverId,
        ),
        seed: configuration.seed,
        trackId: configuration.trackId,
        version: 1,
      },
      version: 1,
    }

    expect(saveFreeModeStoredState(storage, state)).toBe(true)
    expect(loadFreeModeStoredState(storage, context)).toEqual(state)
  })

  it('restores a race that uses its matching qualifying result', () => {
    const storage = new MemoryStorage()
    const configuration = createDefaultFreeModeConfiguration(
      seriesById,
      'qualified-free',
    )
    configuration.gridMode = 'qualifying-result'
    const qualifyingResult = {
      categoryId: configuration.categoryId,
      completedAt: '2026-07-29T00:00:00.000Z',
      orderedDriverIds: configuration.entrants
        .map((entrant) => entrant.driverId)
        .reverse(),
      seed: configuration.seed,
      trackId: configuration.trackId,
      version: 1 as const,
    }
    const state: FreeModeStoredState = {
      configuration,
      qualifyingResult,
      version: 1,
    }

    saveFreeModeStoredState(storage, state)

    expect(loadFreeModeStoredState(storage, context)).toEqual(state)
  })

  it('ignores corrupt or out-of-range saved data', () => {
    const storage = new MemoryStorage()
    storage.setItem(FREE_MODE_STORAGE_KEY, '{broken')
    expect(loadFreeModeStoredState(storage, context)).toBeNull()

    const configuration = createDefaultFreeModeConfiguration(seriesById)
    configuration.entrants = Array.from(
      { length: 41 },
      (_, index) => ({
        carNumber: index,
        driverId: driverPool2026[index].id,
        id: `entry-${index}`,
        sourceTeamId: seriesPackageFor(configuration.categoryId).teams[0].id,
      }),
    )
    storage.setItem(
      FREE_MODE_STORAGE_KEY,
      JSON.stringify({ configuration, qualifyingResult: null, version: 1 }),
    )
    expect(loadFreeModeStoredState(storage, context)).toBeNull()

    storage.setItem(
      FREE_MODE_STORAGE_KEY,
      JSON.stringify({
        configuration: { ...configuration, categoryId: 'f3' },
        qualifyingResult: null,
        version: 1,
      }),
    )
    expect(loadFreeModeStoredState(storage, context)).toBeNull()
  })

  it('saves, loads and deletes validated presets', () => {
    const storage = new MemoryStorage()
    const configuration = createDefaultFreeModeConfiguration(seriesById)
    const preset: FreeModePreset = {
      configuration,
      id: 'preset-1',
      name: 'Forty at Fuji',
      updatedAt: '2026-07-29T00:00:00.000Z',
    }

    expect(saveFreeModePresets(storage, [preset])).toBe(true)
    expect(loadFreeModePresets(storage, context)).toEqual([preset])
    expect(saveFreeModePresets(storage, [])).toBe(true)
    expect(loadFreeModePresets(storage, context)).toEqual([])
    expect(storage.getItem(FREE_MODE_PRESETS_STORAGE_KEY)).toBe('[]')
  })

  it('exports and imports only a complete valid configuration', () => {
    const configuration = createDefaultFreeModeConfiguration(
      seriesById,
      'json-export',
    )
    const exported = exportFreeModeConfiguration(configuration)

    expect(importFreeModeConfiguration(exported, context)).toEqual(configuration)
    expect(importFreeModeConfiguration('{"version":1}', context)).toBeNull()

    const duplicate = structuredClone(configuration)
    duplicate.entrants[1].driverId = duplicate.entrants[0].driverId
    expect(
      importFreeModeConfiguration(JSON.stringify(duplicate), context),
    ).toBeNull()

    const oversizedSeed = structuredClone(configuration)
    oversizedSeed.seed = 'x'.repeat(121)
    expect(
      importFreeModeConfiguration(JSON.stringify(oversizedSeed), context),
    ).toBeNull()

    const oversizedId = structuredClone(configuration)
    oversizedId.entrants[0].id = 'x'.repeat(121)
    expect(
      importFreeModeConfiguration(JSON.stringify(oversizedId), context),
    ).toBeNull()
  })
})

function seriesPackageFor(id: SeriesId) {
  return seriesById.get(id)!
}
