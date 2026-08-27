import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { fiaSuzukaPuEventInput2026 } from '../data/fiaPuEventInputs2026'
import { tracks } from '../data/tracks'
import { FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY } from '../freeMode/freeModePersistence'
import { seriesPackageById } from '../series/seriesRegistry'
import { advanceRace, createInitialRace } from '../simulation/race'
import { createInitialActiveAeroState } from '../simulation/activeAero'
import {
  deserializeTrackSurfaceState,
  serializeTrackSurfaceState,
  trackSurfaceSectorSummary,
} from '../simulation/trackSurface'
import { strictTrackSurfaceStateForTrack } from '../simulation/trackSurfaceValidation'
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
  modelVersion?: unknown
  snapshot: {
    [key: string]: unknown
    cars: Array<Record<string, unknown>>
    trackSurface?: unknown
  }
  version?: unknown
}

function mutableCheckpoint(now: number): MutableCheckpoint {
  return JSON.parse(
    serializeRaceCheckpoint('session-a', createInitialRace(config), now)!,
  ) as MutableCheckpoint
}

function mutableEnergyStore(checkpoint: MutableCheckpoint) {
  const runtimeSystems = mutableF1Runtime(checkpoint)

  return runtimeSystems.energyStore as Record<string, unknown>
}

function mutableF1Runtime(
  checkpoint: MutableCheckpoint,
  carIndex = 0,
) {
  const runtimeSystems = checkpoint.snapshot.cars[carIndex]
    .runtimeSystems as Record<string, unknown>

  if (runtimeSystems.kind !== 'f1') {
    throw new Error('Expected an F1 runtime payload.')
  }

  return runtimeSystems
}

function mutableRechargeRule(checkpoint: MutableCheckpoint) {
  return mutableEnergyStore(checkpoint).rechargeRule as Record<string, unknown>
}

function f1Runtime(car: RaceSnapshot['cars'][number]) {
  if (car.runtimeSystems.kind !== 'f1') {
    throw new Error('Expected an F1 runtime payload.')
  }

  return car.runtimeSystems
}

function convertCheckpointToLegacyF1(checkpoint: MutableCheckpoint) {
  addLegacySurfaceProjection(checkpoint)
  checkpoint.version = 1
  checkpoint.modelVersion = '2026.08.09.1'
  delete checkpoint.snapshot.trackSurface

  for (const car of checkpoint.snapshot.cars) {
    delete car.driverObservationInbox
    const runtimeSystems = car.runtimeSystems as Record<string, unknown>
    delete car.runtimeSystems
    Object.assign(car, runtimeSystems)
    delete car.kind
  }
}

function convertCheckpointToV2(checkpoint: MutableCheckpoint) {
  addLegacySurfaceProjection(checkpoint)
  checkpoint.version = 2
  checkpoint.modelVersion = '2026.08.11.3'
  delete checkpoint.snapshot.trackSurface
  for (const car of checkpoint.snapshot.cars) {
    delete car.driverObservationInbox
  }
}

function addLegacySurfaceProjection(checkpoint: MutableCheckpoint) {
  const surface = deserializeTrackSurfaceState(checkpoint.snapshot.trackSurface)

  if (!surface) {
    throw new Error('Expected a canonical surface fixture.')
  }

  const sectors = trackSurfaceSectorSummary(surface)
  Object.assign(checkpoint.snapshot, sectors, {
    trackEvolutionLevel:
      sectors.rubberLevelBySector.reduce((sum, value) => sum + value, 0) /
      sectors.rubberLevelBySector.length,
  })
}

function convertCheckpointToV3(checkpoint: MutableCheckpoint) {
  addLegacySurfaceProjection(checkpoint)
  checkpoint.version = 3
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
    expect(f1Runtime(restored!.cars[0]).activeAeroState).toEqual(
      f1Runtime(snapshot.cars[0]).activeAeroState,
    )
    expect(
      f1Runtime(restored!.cars[0]).overtakeRechargeAllowanceActiveThisLap,
    ).toBe(
      f1Runtime(snapshot.cars[0]).overtakeRechargeAllowanceActiveThisLap,
    )
    expect(f1Runtime(restored!.cars[0]).energyStore.rechargeRule).toEqual(
      f1Runtime(snapshot.cars[0]).energyStore.rechargeRule,
    )
    expect(JSON.parse(raw!).modelVersion).toBe(RACE_SIMULATION_MODEL_VERSION)
    expect(JSON.parse(raw!).version).toBe(4)
  })

  it('persists and validates causal driver observations across restore', () => {
    const now = 1_800_000_000_000
    const evolved = advanceRace(createInitialRace(config), 0.75, config)
    const raw = serializeRaceCheckpoint('driver-inbox', evolved, now)!
    const restored = parseRaceCheckpoint(
      raw,
      'driver-inbox',
      config,
      now,
    )

    expect(restored).not.toBeNull()
    expect(restored?.cars.map((car) => car.driverObservationInbox)).toEqual(
      evolved.cars.map((car) => car.driverObservationInbox),
    )
    expect(advanceRace(restored!, 0.25, config)).toEqual(
      advanceRace(evolved, 0.25, config),
    )

    const missing = JSON.parse(raw) as MutableCheckpoint
    delete missing.snapshot.cars[0].driverObservationInbox
    expect(
      parseRaceCheckpoint(
        JSON.stringify(missing),
        'driver-inbox',
        config,
        now,
      ),
    ).toBeNull()

    const malformed = JSON.parse(raw) as MutableCheckpoint
    const inbox = malformed.snapshot.cars[0]
      .driverObservationInbox as Record<string, unknown>
    inbox.seriesId = 'super-formula'
    expect(
      parseRaceCheckpoint(
        JSON.stringify(malformed),
        'driver-inbox',
        config,
        now,
      ),
    ).toBeNull()
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

    expect(f1Runtime(restored!.cars[0]).energyStore.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
      resolution: 'verified-event',
      ruleId: 'suzuka-race-overtake-inactive',
      sourceId: fiaSuzukaPuEventInput2026.source.sourceId,
    })
  })

  it('round-trips a strict SUPER FORMULA v4 checkpoint and rejects F1 runtime payloads', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const sfConfig: RaceConfig = {
      drivers: series.drivers,
      overtakeSystem: series.rules.overtakeSystem,
      seed: 'sf-checkpoint-boundary',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: series.teams,
      track: series.tracks[0],
      weekendStage: 'race',
    }
    const now = 1_800_000_000_000
    const raw = serializeRaceCheckpoint(
      'sf-session',
      createInitialRace(sfConfig),
      now,
    )!
    const restored = parseRaceCheckpoint(raw, 'sf-session', sfConfig, now)
    const f1Injected = JSON.parse(raw) as MutableCheckpoint
    const nestedF1Injected = JSON.parse(raw) as MutableCheckpoint
    const liveTireInjected = JSON.parse(raw) as MutableCheckpoint
    const refuellingTaskInjected = JSON.parse(raw) as MutableCheckpoint
    const fiaPenaltyInjected = JSON.parse(raw) as MutableCheckpoint
    const legacy = JSON.parse(raw) as MutableCheckpoint
    const nestedRuntime = nestedF1Injected.snapshot.cars[0]
      .runtimeSystems as Record<string, unknown>
    const nestedControlTires = nestedRuntime.controlTires as Record<
      string,
      unknown
    >
    const liveTireRuntime = liveTireInjected.snapshot.cars[0]
      .runtimeSystems as Record<string, unknown>
    const refuellingTaskRuntime = refuellingTaskInjected.snapshot.cars[0]
      .runtimeSystems as Record<string, unknown>
    const liveTires = liveTireRuntime.liveTires as Record<string, unknown>
    const refuellingTask = refuellingTaskRuntime.refuellingTask as Record<
      string,
      unknown
    >

    f1Injected.snapshot.cars[0].energyStore = {}
    nestedRuntime.controlTires = {
      ...nestedControlTires,
      energyStore: {},
    }
    liveTireRuntime.liveTires = {
      ...liveTires,
      tire: 'M',
    }
    refuellingTask.canExecute = true
    Object.assign(fiaPenaltyInjected.snapshot.cars[0], {
      penalties: [{ kind: 'time', penaltyPoints: 1, seconds: 5 }],
      penaltyLaps: 1,
      penaltyPoints: 1,
      penaltySeconds: 5,
      servedPenaltySeconds: 2,
    })
    const fiaPenaltySnapshot = fiaPenaltyInjected.snapshot as unknown as Record<
      string,
      unknown
    >
    fiaPenaltySnapshot.stewardCases = [{ id: 'fia-isc-case' }]
    legacy.version = 1

    expect(restored?.cars[0].runtimeSystems.kind).toBe('super-formula')
    expect(restored?.cars[0].runtimeSystems).toMatchObject({
      kind: 'super-formula',
      refuellingTask: { canExecute: false },
    })
    expect(parseRaceCheckpoint(JSON.stringify(f1Injected), 'sf-session', sfConfig, now)).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify(nestedF1Injected),
        'sf-session',
        sfConfig,
        now,
      ),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify(liveTireInjected),
        'sf-session',
        sfConfig,
        now,
      ),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify(refuellingTaskInjected),
        'sf-session',
        sfConfig,
        now,
      ),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify(fiaPenaltyInjected),
        'sf-session',
        sfConfig,
        now,
      ),
    ).toBeNull()
    expect(parseRaceCheckpoint(JSON.stringify(legacy), 'sf-session', sfConfig, now)).toBeNull()
  })

  it('hydrates v2 F1 and SUPER FORMULA surface checkpoints deterministically', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const sfConfig: RaceConfig = {
      drivers: series.drivers,
      overtakeSystem: series.rules.overtakeSystem,
      seed: 'sf-v2-surface-migration',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: series.teams,
      track: series.tracks[0],
      weekendStage: 'race',
    }
    const now = 1_800_000_000_000

    for (const [sessionKey, checkpointConfig] of [
      ['f1-v2-surface', config],
      ['sf-v2-surface', sfConfig],
    ] as const) {
      const snapshot = advanceRace(
        createInitialRace(checkpointConfig),
        2,
        checkpointConfig,
      )
      const checkpoint = JSON.parse(
        serializeRaceCheckpoint(sessionKey, snapshot, now)!,
      ) as MutableCheckpoint
      convertCheckpointToV2(checkpoint)

      const restored = parseRaceCheckpoint(
        JSON.stringify(checkpoint),
        sessionKey,
        checkpointConfig,
        now,
      )

      expect(restored).not.toBeNull()
      // v2 carried only aggregate sector values, so the newly hydrated lane
      // arrays can differ by last-bit rounding from a pre-v3 transient array.
      // Once migrated and saved as v4, however, continuation is byte-stable.
      const v4Raw = serializeRaceCheckpoint(sessionKey, restored!, now)
      const reloaded = parseRaceCheckpoint(
        v4Raw,
        sessionKey,
        checkpointConfig,
        now,
      )

      expect(v4Raw).not.toBeNull()
      expect(reloaded).toEqual(restored)

      const uninterrupted = advanceRace(restored!, 0.25, checkpointConfig)
      const replayed = advanceRace(reloaded!, 0.25, checkpointConfig)

      expect(replayed).toEqual(uninterrupted)
    }
  })

  it('requires one well-formed v4 surface and strips pre-v4 projections', () => {
    const now = 1_800_000_000_000
    const snapshot = createInitialRace(config)
    const raw = serializeRaceCheckpoint('session-a', snapshot, now)!
    const normalizedCheckpoint = JSON.parse(raw) as MutableCheckpoint
    const normalizedSnapshot = normalizedCheckpoint.snapshot as Record<
      string,
      unknown
    >

    normalizedSnapshot.rubberLevelBySector = [1, 1, 1]
    normalizedSnapshot.surfaceWaterMmBySector = [6, 6, 6]
    normalizedSnapshot.dryingLineBySector = [0, 0, 0]
    normalizedSnapshot.trackEvolutionLevel = 1

    const normalized = parseRaceCheckpoint(
      JSON.stringify(normalizedCheckpoint),
      'session-a',
      config,
      now,
    )

    expect(normalized?.trackSurface).toEqual(snapshot.trackSurface)
    expect(Object.hasOwn(normalized!, 'rubberLevelBySector')).toBe(false)
    expect(Object.hasOwn(normalized!, 'surfaceWaterMmBySector')).toBe(false)
    expect(Object.hasOwn(normalized!, 'dryingLineBySector')).toBe(false)
    expect(Object.hasOwn(normalized!, 'trackEvolutionLevel')).toBe(false)

    const v3Checkpoint = JSON.parse(raw) as MutableCheckpoint
    convertCheckpointToV3(v3Checkpoint)
    const migratedV3 = parseRaceCheckpoint(
      JSON.stringify(v3Checkpoint),
      'session-a',
      config,
      now,
    )

    expect(migratedV3?.trackSurface).toEqual(snapshot.trackSurface)
    expect(Object.hasOwn(migratedV3!, 'rubberLevelBySector')).toBe(false)
    expect(Object.hasOwn(migratedV3!, 'surfaceWaterMmBySector')).toBe(false)
    expect(Object.hasOwn(migratedV3!, 'dryingLineBySector')).toBe(false)
    expect(Object.hasOwn(migratedV3!, 'trackEvolutionLevel')).toBe(false)

    const dynamicCheckpoint = JSON.parse(raw) as MutableCheckpoint
    const dynamicSurface = dynamicCheckpoint.snapshot.trackSurface as Record<
      string,
      unknown
    >
    const waterFilmMm = [...(dynamicSurface.waterFilmMm as number[])]
    const bondedRubber = [...(dynamicSurface.bondedRubber as number[])]
    waterFilmMm[0] = 0.25
    bondedRubber[0] = 0.5
    dynamicSurface.waterFilmMm = waterFilmMm
    dynamicSurface.bondedRubber = bondedRubber

    expect(
      parseRaceCheckpoint(
        JSON.stringify(dynamicCheckpoint),
        'session-a',
        config,
        now,
      ),
    ).not.toBeNull()

    const profiledConfig: RaceConfig = {
      ...config,
      track: {
        ...config.track,
        surfaceProfile: {
          baseFriction: 0.99,
          source: 'simulator-policy',
          sourceLabel: 'Checkpoint profile validation fixture',
        },
      },
    }
    const profiledSnapshot = createInitialRace(profiledConfig)

    expect(
      parseRaceCheckpoint(
        serializeRaceCheckpoint('profiled', profiledSnapshot, now),
        'profiled',
        profiledConfig,
        now,
      ),
    ).not.toBeNull()

    const corruptions: Array<(checkpoint: MutableCheckpoint) => void> = [
      (checkpoint) => {
        delete checkpoint.snapshot.trackSurface
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        trackSurface.version = 2
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        delete trackSurface.waterFilmMm
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        const waterFilmMm = [...(trackSurface.waterFilmMm as number[])]
        waterFilmMm[0] = 999
        trackSurface.waterFilmMm = waterFilmMm
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        const bondedRubber = [...(trackSurface.bondedRubber as number[])]
        bondedRubber[0] = -1
        trackSurface.bondedRubber = bondedRubber
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        const baseFriction = [...(trackSurface.baseFriction as number[])]
        baseFriction[0] = baseFriction[0] === 1 ? 0.99 : 1
        trackSurface.baseFriction = baseFriction
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        trackSurface.defaults = {
          ...(trackSurface.defaults as Record<string, unknown>),
          baseFriction: 999,
        }
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        trackSurface.defaults = {
          ...(trackSurface.defaults as Record<string, unknown>),
          source: 'forged-checkpoint-source',
        }
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        trackSurface.sectorMarks = [0, 0.25, 0.75]
      },
      (checkpoint) => {
        const trackSurface = checkpoint.snapshot.trackSurface as Record<
          string,
          unknown
        >
        trackSurface.profile = {
          baseFriction: 0.99,
          source: 'simulator-policy',
          sourceLabel: 'FORGED CHECKPOINT PROFILE',
          sourceUrl: null,
        }
      },
    ]

    for (const corrupt of corruptions) {
      const checkpoint = JSON.parse(raw) as MutableCheckpoint
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

  it('continues heterogeneous local-surface evolution identically after v4 replay', () => {
    const now = 1_800_000_000_000
    const initial = createInitialRace(config)
    const surface = deserializeTrackSurfaceState(initial.trackSurface)

    if (!surface) {
      throw new Error('Expected canonical checkpoint surface')
    }

    surface.waterFilmMm[0] = 1.1
    surface.waterFilmMm[1] = 0.2
    surface.bondedRubber[0] = 0.5
    surface.bondedRubber[1] = 0.1
    surface.marbles[1] = 0.18
    const evolved = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                offTrackSinceSeconds: null,
                pitPhase: 'none' as const,
                speedKph: 210,
                status: 'running' as const,
              }
            : car,
        ),
        trackSurface: serializeTrackSurfaceState(surface),
      },
      0.25,
      config,
    )
    const restored = parseRaceCheckpoint(
      serializeRaceCheckpoint('surface-replay', evolved, now),
      'surface-replay',
      config,
      now,
    )

    expect(restored).not.toBeNull()

    const uninterrupted = advanceRace(evolved, 0.25, config)
    const replayed = advanceRace(restored!, 0.25, config)

    expect(replayed).toEqual(uninterrupted)
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
    convertCheckpointToLegacyF1(checkpoint)

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
    })
    expect(f1Runtime(restored!.cars[0])).toMatchObject({
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
    delete mutableF1Runtime(withoutLapStartLatch)
      .overtakeRechargeAllowanceActiveThisLap

    expect(
      parseRaceCheckpoint(
        JSON.stringify(withoutLapStartLatch),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()

    const withoutRechargeRule = JSON.parse(valid) as MutableCheckpoint
    delete mutableEnergyStore(withoutRechargeRule).rechargeRule

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
    // The field can straddle the Line after a control transition. Car zero
    // started its current energy lap under low-grip SC control; every other car
    // still carries the ordinary finite rule. The current global state has
    // already returned to normal, so only the persisted per-car latch is valid.
    const unlimitedRuntime = mutableF1Runtime(contextProvenUnlimited)
    unlimitedRuntime.energyLapStartedBehindSafetyCar = true
    unlimitedRuntime.energyLapStartedInLowGripConditions = true
    const energyStore = unlimitedRuntime.energyStore as Record<string, unknown>
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

    unlimitedRuntime.energyLapStartedBehindSafetyCar = false
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
        mutableF1Runtime(checkpoint).ersBatteryPercent = 50
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).energyHarvestedThisLapMj = 0.5
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).overtakeEnergyRemainingMj = 0.500001
      },
      (checkpoint) => {
        checkpoint.snapshot.cars[0].overtakeStatus = 'active'
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).overtakeEligibility = {
          activationLap: 1,
          controlLineIndex: 999,
          detectedGapSeconds: 0.8,
          eligible: true,
        }
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).ersPowerKw = 1
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).superClippingIntensity = 1.01
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).superClippingRegenPowerKw = 1
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).superClippingRecoveredThisLapMj = 0.01
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).superClippingStartedAtSeconds = 0
      },
      (checkpoint) => {
        mutableF1Runtime(checkpoint).superClippingDurationSeconds = -1
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
    mutableF1Runtime(checkpoint).activeAeroState = {
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
      strictTrackSurfaceStateForTrack(snapshot.trackSurface, config.track),
    ).not.toBeNull()
    for (const car of snapshot.cars) {
      if (
        car.runtimeSystems.kind === 'f1' &&
        car.runtimeSystems.superClippingIntensity === 0
      ) {
        expect(car.runtimeSystems.superClippingRegenPowerKw).toBe(0)
      }
    }
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
    expect(f1Runtime(snapshot.cars[0]).activeAeroState.transition).not.toBeNull()

    const restored = parseRaceCheckpoint(
      serializeRaceCheckpoint('session-a', snapshot, now),
      'session-a',
      activeConfig,
      now,
    )
    expect(f1Runtime(restored!.cars[0]).activeAeroState).toEqual(
      f1Runtime(snapshot.cars[0]).activeAeroState,
    )

    const uninterrupted = advanceRace(snapshot, 0.1, activeConfig)
    const replayed = advanceRace(restored!, 0.1, activeConfig)
    const aeroProjection = (race: typeof uninterrupted) =>
      race.cars.map((car) => ({
        activeAeroMode: f1Runtime(car).activeAeroMode,
        activeAeroState: f1Runtime(car).activeAeroState,
        driverId: car.driverId,
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
          tireRun:
            car.runtimeSystems.kind === 'f1'
              ? {
                  ageLaps: index % 20,
                  compound: car.runtimeSystems.tires.tire,
                  kind: 'f1-pirelli' as const,
                }
              : {
                  kind: 'super-formula-control-tire' as const,
                  lapsOnCurrentSet: index % 20,
                  physicalModelAvailability: 'unavailable' as const,
                  surface: car.runtimeSystems.liveTires.activeSurface,
                },
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
          modelVersion: '2026.08.20.1',
        }),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
    expect(
      parseRaceCheckpoint(
        JSON.stringify({
          ...current,
          modelVersion: '2026.08.20.2',
        }),
        'session-a',
        config,
        now,
      ),
    ).toBeNull()
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
