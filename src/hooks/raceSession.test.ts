import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY } from '../freeMode/freeModePersistence'
import { advanceRace, createInitialRace } from '../simulation/race'
import type { RaceConfig } from '../types'
import {
  RACE_CHECKPOINT_MAX_AGE_MS,
  RACE_CHECKPOINT_STORAGE_KEY,
  RACE_SIMULATION_MODEL_VERSION,
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
    expect(JSON.parse(raw!).modelVersion).toBe(RACE_SIMULATION_MODEL_VERSION)
  })

  it('migrates legacy checkpoints without drivetrain or lateral state', () => {
    const now = 1_800_000_000_000
    const checkpoint = JSON.parse(
      serializeRaceCheckpoint(
        'session-a',
        createInitialRace(config),
        now,
      )!,
    ) as { snapshot: { cars: Array<Record<string, unknown>> } }

    for (const [index, car] of checkpoint.snapshot.cars.entries()) {
      delete car.turboSpoolFraction
      delete car.clutchEngagementFraction
      delete car.lateralOffsetM
      delete car.lateralVelocityMps
      delete car.desiredLateralOffsetM

      if (index === 0) {
        car.trackLateralOffset = 2.25
      } else {
        delete car.trackLateralOffset
      }
    }

    const restored = parseRaceCheckpoint(
      JSON.stringify(checkpoint),
      'session-a',
      config,
      now,
    )

    expect(restored).not.toBeNull()
    expect(restored?.cars[0]).toMatchObject({
      desiredLateralOffsetM: 2.25,
      lateralOffsetM: 2.25,
      lateralVelocityMps: 0,
      trackLateralOffset: 2.25,
    })
    expect(restored?.cars[1]).toMatchObject({
      desiredLateralOffsetM: 0,
      lateralOffsetM: 0,
      lateralVelocityMps: 0,
      trackLateralOffset: 0,
    })
  })

  it('round-trips and normalizes physical lateral state', () => {
    const now = 1_800_000_000_000
    const initial = createInitialRace(config)
    const snapshot = {
      ...initial,
      cars: initial.cars.map((car, index) => ({
        ...car,
        desiredLateralOffsetM: index === 0 ? -2.5 : 0,
        lateralOffsetM: index === 0 ? 1.75 : 0,
        lateralVelocityMps: index === 0 ? -0.4 : 0,
        // Deliberately stale: the canonical physical field wins on restore.
        trackLateralOffset: index === 0 ? -8 : 0,
      })),
    }

    const restored = parseRaceCheckpoint(
      serializeRaceCheckpoint('session-a', snapshot, now),
      'session-a',
      config,
      now,
    )

    expect(restored?.cars[0]).toMatchObject({
      desiredLateralOffsetM: -2.5,
      lateralOffsetM: 1.75,
      lateralVelocityMps: -0.4,
      trackLateralOffset: 1.75,
    })
  })

  it('rejects invalid persisted live drivetrain state', () => {
    const now = 1_800_000_000_000
    const valid = serializeRaceCheckpoint(
      'session-a',
      createInitialRace(config),
      now,
    )!
    const invalidStates = [
      ['turboSpoolFraction', -0.01],
      ['turboSpoolFraction', 1.01],
      ['turboSpoolFraction', Number.NaN],
      ['clutchEngagementFraction', -0.01],
      ['clutchEngagementFraction', 1.01],
      ['clutchEngagementFraction', Number.POSITIVE_INFINITY],
    ] as const

    for (const [field, value] of invalidStates) {
      const checkpoint = JSON.parse(valid) as {
        snapshot: { cars: Array<Record<string, unknown>> }
      }
      checkpoint.snapshot.cars[0][field] = value

      expect(
        parseRaceCheckpoint(
          JSON.stringify(checkpoint),
          'session-a',
          config,
          now,
        ),
      ).toBeNull()
    }
  })

  it('rejects invalid persisted lateral state', () => {
    const now = 1_800_000_000_000
    const valid = serializeRaceCheckpoint(
      'session-a',
      createInitialRace(config),
      now,
    )!
    const invalidStates = [
      ['lateralOffsetM', 100.01],
      ['lateralOffsetM', Number.NaN],
      ['trackLateralOffset', Number.NEGATIVE_INFINITY],
      ['desiredLateralOffsetM', -100.01],
      ['desiredLateralOffsetM', 'outside'],
      ['lateralVelocityMps', 100.01],
      ['lateralVelocityMps', Number.POSITIVE_INFINITY],
    ] as const

    for (const [field, value] of invalidStates) {
      const checkpoint = JSON.parse(valid) as {
        snapshot: { cars: Array<Record<string, unknown>> }
      }
      checkpoint.snapshot.cars[0][field] = value

      expect(
        parseRaceCheckpoint(
          JSON.stringify(checkpoint),
          'session-a',
          config,
          now,
        ),
      ).toBeNull()
    }
  })

  it('round-trips a populated multi-lap snapshot within browser storage limits', () => {
    const now = 1_800_000_000_000
    let snapshot = createInitialRace(config)

    for (
      let step = 0;
      step < 240 &&
      !snapshot.cars.some((car) => car.lapHistory.length >= 2);
      step += 1
    ) {
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
      modelVersion: RACE_SIMULATION_MODEL_VERSION,
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

  it('rejects structurally valid checkpoints from an older simulation model', () => {
    const now = 1_800_000_000_000
    const snapshot = createInitialRace(config)
    const current = JSON.parse(
      serializeRaceCheckpoint('session-a', snapshot, now)!,
    ) as Record<string, unknown>
    const legacyWithoutModelVersion = { ...current }
    delete legacyWithoutModelVersion.modelVersion

    expect(
      parseRaceCheckpoint(
        JSON.stringify({
          ...current,
          modelVersion: '2026.07.25.1',
        }),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify(legacyWithoutModelVersion),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
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

  it('keeps Free Mode and championship checkpoints isolated', () => {
    const storage = memoryStorage()
    const championshipSnapshot = {
      ...createInitialRace(config),
      elapsedSeconds: 42,
    }
    const freeSnapshot = {
      ...createInitialRace(config),
      elapsedSeconds: 84,
    }

    saveRaceCheckpoint(
      storage,
      'championship',
      championshipSnapshot,
      10_000,
    )
    saveRaceCheckpoint(
      storage,
      'free',
      freeSnapshot,
      10_000,
      FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY,
    )

    expect(storage.getItem(RACE_CHECKPOINT_STORAGE_KEY)).not.toBeNull()
    expect(
      storage.getItem(FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY),
    ).not.toBeNull()
    expect(
      restoreRaceCheckpoint(
        storage,
        'free',
        config,
        11_000,
        FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY,
      )?.elapsedSeconds,
    ).toBe(84)
    expect(storage.getItem(RACE_CHECKPOINT_STORAGE_KEY)).not.toBeNull()
  })
})
