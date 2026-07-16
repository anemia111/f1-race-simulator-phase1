import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { advanceRace, createInitialRace } from '../simulation/race'
import type { RaceConfig } from '../types'
import {
  RACE_CHECKPOINT_MAX_AGE_MS,
  activeRaceSessionFor,
  parseRaceCheckpoint,
  restoreRaceCheckpoint,
  saveRaceCheckpoint,
  serializeRaceCheckpoint,
} from './raceSession'

const config: RaceConfig = {
  drivers: initialDrivers,
  seed: 'checkpoint-test',
  teams: initialTeams,
  track: tracks[0],
}

function memoryStorage() {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('race session continuity', () => {
  it('holds the active config while live calibration refreshes the same session', () => {
    const current = { config, key: 'session-a' }
    const refreshedConfig = {
      ...config,
      track: { ...config.track, baseLapTime: config.track.baseLapTime - 1 },
    }

    expect(activeRaceSessionFor(current, 'session-a', refreshedConfig)).toBe(
      current,
    )
    expect(
      activeRaceSessionFor(current, 'session-b', refreshedConfig),
    ).toEqual({ config: refreshedConfig, key: 'session-b' })
  })

  it('round-trips a compatible race checkpoint', () => {
    const now = 1_800_000_000_000
    const snapshot = {
      ...createInitialRace(config),
      elapsedLabel: '00:02:03',
      elapsedSeconds: 123,
    }
    const raw = serializeRaceCheckpoint('session-a', snapshot, now)
    const restored = parseRaceCheckpoint(raw, 'session-a', config, now + 1_000)

    expect(restored?.elapsedSeconds).toBe(123)
    expect(restored?.cars).toHaveLength(initialDrivers.length)
  })

  it('round-trips a populated multi-lap snapshot within browser storage limits', () => {
    const now = 1_800_000_000_000
    let snapshot = createInitialRace(config)

    for (let step = 0; step < 120; step += 1) {
      snapshot = advanceRace(snapshot, 3, config)
    }

    const raw = serializeRaceCheckpoint('session-a', snapshot, now)

    expect(raw).not.toBeNull()
    expect(raw!.length).toBeLessThan(1_500_000)
    expect(
      snapshot.cars.some((car) => car.lapHistory.length >= 2),
    ).toBe(true)
    expect(
      parseRaceCheckpoint(raw, 'session-a', config, now + 1_000)
        ?.elapsedSeconds,
    ).toBe(snapshot.elapsedSeconds)
  })

  it('keeps a full-distance timing history below the checkpoint size cap', () => {
    const base = createInitialRace(config)
    const snapshot = {
      ...base,
      cars: base.cars.map((car) => ({
        ...car,
        lapHistory: Array.from({ length: 57 }, (_, index) => ({
          invalidReason: null,
          isValid: true,
          lap: index + 1,
          lapTimeSeconds: 90 + index / 100,
          miniSectors: Array.from(
            { length: 24 },
            (__, miniSector) => 3.5 + miniSector / 100,
          ),
          pitStop: index === 19,
          position: car.position,
          sectors: [30, 30, 30] as [number, number, number],
          tire: car.tire,
          tireAgeLaps: index % 20,
          trackGrip: 0.96,
          weather: 'clear' as const,
        })),
      })),
      elapsedSeconds: 5_400,
    }
    const raw = serializeRaceCheckpoint('session-a', snapshot)

    expect(raw).not.toBeNull()
    expect(raw!.length).toBeLessThan(4_000_000)
  })

  it('rejects stale, mismatched, and malformed checkpoints', () => {
    const now = 1_800_000_000_000
    const snapshot = createInitialRace(config)
    const valid = serializeRaceCheckpoint('session-a', snapshot, now)!
    const malformed = JSON.stringify({
      savedAt: now,
      sessionKey: 'session-a',
      snapshot: { ...snapshot, cars: [] },
      version: 1,
    })

    expect(parseRaceCheckpoint(valid, 'session-b', config, now)).toBeNull()
    expect(
      parseRaceCheckpoint(
        serializeRaceCheckpoint(
          'session-a',
          snapshot,
          now - RACE_CHECKPOINT_MAX_AGE_MS - 1,
        ),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
    expect(parseRaceCheckpoint(malformed, 'session-a', config, now)).toBeNull()
    expect(parseRaceCheckpoint('{broken', 'session-a', config, now)).toBeNull()
  })

  it('saves through a storage adapter and removes invalid data on restore', () => {
    const storage = memoryStorage()
    const snapshot = {
      ...createInitialRace(config),
      elapsedSeconds: 42,
    }

    expect(saveRaceCheckpoint(storage, 'session-a', snapshot, 10_000)).toBe(true)
    expect(
      restoreRaceCheckpoint(storage, 'session-a', config, 11_000)
        ?.elapsedSeconds,
    ).toBe(42)
    expect(restoreRaceCheckpoint(storage, 'session-b', config, 11_000)).toBeNull()
    expect(restoreRaceCheckpoint(storage, 'session-a', config, 11_000)).toBeNull()
  })
})
