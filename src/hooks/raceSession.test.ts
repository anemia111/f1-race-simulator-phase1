import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { fiaSuzukaPuEventInput2026 } from '../data/fiaPuEventInputs2026'
import { tracks } from '../data/tracks'
import { FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY } from '../freeMode/freeModePersistence'
import { advanceRace, createInitialRace } from '../simulation/race'
import { createInitialActiveAeroState } from '../simulation/activeAero'
import type { RaceConfig, RaceSnapshot } from '../types'
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

type MutableCheckpoint = {
  snapshot: { cars: Array<Record<string, unknown>> }
}

function mutableCheckpoint(now: number): MutableCheckpoint {
  return JSON.parse(
    serializeRaceCheckpoint('session-a', createInitialRace(config), now)!,
  ) as MutableCheckpoint
}

function mutableEnergyStore(checkpoint: MutableCheckpoint) {
  return checkpoint.snapshot.cars[0].energyStore as Record<string, unknown>
}

function mutableRechargeRule(checkpoint: MutableCheckpoint) {
  return mutableEnergyStore(checkpoint).rechargeRule as Record<string, unknown>
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
    expect(restored?.cars[0].activeAeroState).toEqual(
      snapshot.cars[0].activeAeroState,
    )
    expect(restored?.cars[0].overtakeRechargeAllowanceActiveThisLap).toBe(
      snapshot.cars[0].overtakeRechargeAllowanceActiveThisLap,
    )
    expect(restored?.cars[0].energyStore.rechargeRule).toEqual(
      snapshot.cars[0].energyStore.rechargeRule,
    )
    expect(JSON.parse(raw!).modelVersion).toBe(RACE_SIMULATION_MODEL_VERSION)
  })

  it('round-trips an event-authorized recharge rule from the supplied FIA input', () => {
    const now = 1_800_000_000_000
    const eventConfig: RaceConfig = {
      ...config,
      fiaPuEventInput: fiaSuzukaPuEventInput2026,
      eventId: 'f1-03',
      track: tracks.find((track) => track.id === 'suzuka-approx')!,
    }
    const snapshot = createInitialRace(eventConfig)
    const restored = parseRaceCheckpoint(
      serializeRaceCheckpoint('session-a', snapshot, now),
      'session-a',
      eventConfig,
      now,
    )

    expect(restored?.cars[0].energyStore.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
      resolution: 'verified-event',
      ruleId: 'suzuka-race-overtake-inactive',
      sourceId: fiaSuzukaPuEventInput2026.source.sourceId,
    })
  })

  it('migrates legacy checkpoints without drivetrain, lateral, or active-aero state', () => {
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
      delete car.activeAeroState

      if (index === 0) {
        car.trackLateralOffset = 2.25
        car.activeAeroMode = 'straight'
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
      activeAeroMode: 'corner',
      activeAeroState: createInitialActiveAeroState(),
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

  it('rejects current-version checkpoints without Phase 4 energy authority', () => {
    const now = 1_800_000_000_000
    const valid = serializeRaceCheckpoint(
      'session-a',
      createInitialRace(config),
      now,
    )!
    const withoutLapStartLatch = JSON.parse(valid) as {
      snapshot: { cars: Array<Record<string, unknown>> }
    }
    delete withoutLapStartLatch.snapshot.cars[0]
      .overtakeRechargeAllowanceActiveThisLap

    expect(
      parseRaceCheckpoint(
        JSON.stringify(withoutLapStartLatch),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()

    const withoutRechargeRule = JSON.parse(valid) as {
      snapshot: { cars: Array<{ energyStore: Record<string, unknown> }> }
    }
    delete withoutRechargeRule.snapshot.cars[0].energyStore.rechargeRule

    expect(
      parseRaceCheckpoint(
        JSON.stringify(withoutRechargeRule),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()

    const partialRechargeRule = mutableCheckpoint(now)
    mutableEnergyStore(partialRechargeRule).rechargeRule = { ruleId: 'x' }

    expect(
      parseRaceCheckpoint(
        JSON.stringify(partialRechargeRule),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
  })

  it('rejects malformed and context-swapped recharge-limit unions', () => {
    const now = 1_800_000_000_000
    const corruptions: Array<(checkpoint: MutableCheckpoint) => void> = [
      (checkpoint) => {
        mutableRechargeRule(checkpoint).limit = {
          kind: 'finite',
          maxCuKBusRechargeMj: null,
        }
      },
      (checkpoint) => {
        const rule = mutableRechargeRule(checkpoint)
        rule.usedMJ = 1
        rule.remainingMJ = 8
        mutableEnergyStore(checkpoint).rechargedAtCuKBusThisLapMJ = 1
      },
      (checkpoint) => {
        mutableRechargeRule(checkpoint).limit = {
          kind: 'unlimited',
          maxCuKBusRechargeMj: 8.5,
        }
      },
      (checkpoint) => {
        const rule = mutableRechargeRule(checkpoint)
        rule.limit = {
          kind: 'unavailable',
          maxCuKBusRechargeMj: null,
        }
        rule.baseLimitMJ = null
        rule.remainingMJ = null
        rule.usedMJ = 0.25
        mutableEnergyStore(checkpoint).rechargedAtCuKBusThisLapMJ = 0.25
      },
    ]

    for (const corrupt of corruptions) {
      const checkpoint = mutableCheckpoint(now)
      corrupt(checkpoint)

      expect(
        parseRaceCheckpoint(
          JSON.stringify(checkpoint),
          'session-a',
          config,
          now,
        ),
      ).toBeNull()
    }

    const fabricatedFinite = mutableCheckpoint(now)
    mutableEnergyStore(fabricatedFinite).rechargeRule = {
      additionalAllowanceMJ: 0,
      baseLimitMJ: 11,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 11 },
      measuredAt: 'CU-K-HV-DC-bus',
      remainingMJ: 11,
      resolution: 'technical-default',
      ruleId: 'fabricated-technical-default',
      sourceId: 'fia-f1-2026-technical-c20',
      usedMJ: 0,
    }

    expect(
      parseRaceCheckpoint(
        JSON.stringify(fabricatedFinite),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()

    const contextSwappedUnlimited = mutableCheckpoint(now)
    mutableEnergyStore(contextSwappedUnlimited).rechargeRule = {
      additionalAllowanceMJ: 0,
      baseLimitMJ: null,
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      remainingMJ: null,
      resolution: 'technical-low-grip-safety-car',
      ruleId: 'fia-c5.2.10-low-grip-safety-car',
      sourceId: 'fia-f1-2026-technical-c20',
      usedMJ: 0,
    }

    expect(
      parseRaceCheckpoint(
        JSON.stringify(contextSwappedUnlimited),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()

    const contextProvenUnlimited = mutableCheckpoint(now)
    const contextualSnapshot = contextProvenUnlimited.snapshot as Record<
      string,
      unknown
    > & { cars: Array<Record<string, unknown>> }
    // The field can straddle the Line after a control transition. Car zero
    // started its current energy lap under low-grip SC control; every other car
    // still carries the ordinary finite rule. The current global state has
    // already returned to normal, so only the persisted per-car latch is valid.
    const unlimitedCar = contextualSnapshot.cars[0]
    unlimitedCar.energyLapStartedBehindSafetyCar = true
    unlimitedCar.energyLapStartedInLowGripConditions = true
    const energyStore = unlimitedCar.energyStore as Record<string, unknown>
    energyStore.rechargeRule = {
      additionalAllowanceMJ: 0,
      baseLimitMJ: null,
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      remainingMJ: null,
      resolution: 'technical-low-grip-safety-car',
      ruleId: 'fia-c5.2.10-low-grip-safety-car',
      sourceId: 'fia-f1-2026-technical-c20',
      usedMJ: 0,
    }

    expect(
      parseRaceCheckpoint(
        JSON.stringify(contextProvenUnlimited),
        'session-a',
        config,
        now,
      ),
    ).not.toBeNull()

    unlimitedCar.energyLapStartedBehindSafetyCar = false
    expect(
      parseRaceCheckpoint(
        JSON.stringify(contextProvenUnlimited),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
  })

  it('keeps the lap-start recharge rule when global SC conditions begin mid-lap', () => {
    const now = 1_800_000_000_000
    const checkpoint = mutableCheckpoint(now)
    const snapshot = checkpoint.snapshot as Record<string, unknown> & {
      cars: Array<Record<string, unknown>>
    }
    snapshot.flag = 'sc'
    snapshot.flagPhase = { flag: 'sc' }
    snapshot.formationBehindSafetyCar = true
    snapshot.lowGripConditions = true
    snapshot.sectorFlags = ['sc', 'sc', 'sc']

    expect(
      parseRaceCheckpoint(
        JSON.stringify(checkpoint),
        'session-a',
        config,
        now,
      ),
    ).not.toBeNull()
  })

  it('requires the exact event identity for event-scoped PU inputs', () => {
    const now = 1_800_000_000_000
    const eventConfig: RaceConfig = {
      ...config,
      eventId: 'f1-03',
      fiaPuEventInput: fiaSuzukaPuEventInput2026,
      track: tracks.find((track) => track.id === 'suzuka-approx')!,
    }
    const raw = serializeRaceCheckpoint(
      'session-a',
      createInitialRace(eventConfig),
      now,
    )

    expect(
      parseRaceCheckpoint(raw, 'session-a', { ...eventConfig, eventId: null }, now),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        raw,
        'session-a',
        { ...eventConfig, eventId: 'f1-04' },
        now,
      ),
    ).toBeNull()
  })

  it('rejects corrupted Phase 4 energy fields and derived displays', () => {
    const now = 1_800_000_000_000
    const corruptions: Array<(checkpoint: MutableCheckpoint) => void> = [
      (checkpoint) => {
        delete mutableEnergyStore(checkpoint).actualDeploymentDcPowerKw
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).currentEnergyMJ = null
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).batteryLossPowerKw = -1
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).requestedBrakePowerKw = 20_001
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).batteryTemperatureC = 106
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).operatingMode = 'generator'
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).stateOfCharge = 0.5
      },
      (checkpoint) => {
        const energyStore = mutableEnergyStore(checkpoint)
        energyStore.usableEnergyMJ = 5
        energyStore.maximumUsableEnergyMJ = 5.36
      },
      (checkpoint) => {
        mutableEnergyStore(checkpoint).conversionLossThisLapMJ = 1
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].ersBatteryPercent = 50
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].energyHarvestedThisLapMj = 0.5
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].overtakeEnergyRemainingMj = 0.500001
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].overtakeStatus = 'active'
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].overtakeEligibility = {
          activationLap: 1,
          controlLineIndex: 999,
          detectedGapSeconds: 0.8,
          eligible: true,
        }
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].ersPowerKw = 1
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].superClippingIntensity = 1.01
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].superClippingRegenPowerKw = 1
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].superClippingRecoveredThisLapMj = 0.01
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].superClippingStartedAtSeconds = 0
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].superClippingDurationSeconds = -1
      },
    ]

    for (const corrupt of corruptions) {
      const checkpoint = mutableCheckpoint(now)
      corrupt(checkpoint)

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

  it('rejects a corrupt persisted active-aero transition', () => {
    const now = 1_800_000_000_000
    const checkpoint = JSON.parse(
      serializeRaceCheckpoint(
        'session-a',
        createInitialRace(config),
        now,
      )!,
    ) as { snapshot: { cars: Array<Record<string, unknown>> } }
    checkpoint.snapshot.cars[0].activeAeroState = {
      ...createInitialActiveAeroState(),
      frontStraightFraction: 0.5,
    }

    expect(
      parseRaceCheckpoint(
        JSON.stringify(checkpoint),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
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

  it('continues a live active-aero transition identically after restore', () => {
    const now = 1_800_000_000_000
    const activeConfig: RaceConfig = {
      ...config,
      seriesId: 'f1-custom',
      track: {
        ...config.track,
        aeroActivationZones: [
          {
            end: 0.8,
            label: 'CHECKPOINT SM A1',
            lowGripMode: 'partial',
            source: 'official',
            start: 0.2,
          },
        ],
        rainProbability: 0,
      },
    }
    const initial = createInitialRace(activeConfig)
    let snapshot: RaceSnapshot = {
      ...initial,
      elapsedLabel: '00:00:10',
      elapsedSeconds: 10,
      raceStartedAtSeconds: 0,
      startProcedure: 'racing' as const,
      startProcedureRemainingSeconds: 0,
      cars: initial.cars.map((car, index) =>
        index === 0
          ? {
              ...car,
              lap: 2,
              pitPhase: 'none' as const,
              pitLaneProgress: null,
              position: 1,
              progress: 0.3,
              speedKph: 240,
              status: 'running' as const,
              totalDistance: 2.3,
            }
          : {
              ...car,
              position: index + 1,
              status: 'dns' as const,
            },
      ),
    }

    snapshot = advanceRace(snapshot, 0.1, activeConfig)
    expect(snapshot.cars[0].activeAeroState?.transition).not.toBeNull()

    const restored = parseRaceCheckpoint(
      serializeRaceCheckpoint('session-a', snapshot, now),
      'session-a',
      activeConfig,
      now,
    )
    expect(restored?.cars[0].activeAeroState).toEqual(
      snapshot.cars[0].activeAeroState,
    )

    const uninterrupted = advanceRace(snapshot, 0.1, activeConfig)
    const replayed = advanceRace(restored!, 0.1, activeConfig)
    const aeroProjection = (race: typeof uninterrupted) =>
      race.cars.map(({ activeAeroMode, activeAeroState, driverId }) => ({
        activeAeroMode,
        activeAeroState,
        driverId,
      }))

    expect(aeroProjection(replayed)).toEqual(aeroProjection(uninterrupted))
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
          modelVersion: '2026.07.26.2',
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
