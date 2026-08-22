import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from './data/grid2026'
import { tracks } from './data/tracks'
import { seriesPackageById } from './series/seriesRegistry'
import {
  parsePersistedDriverRatings,
  parsePersistedSeason,
  parsePersistedWeekend,
  readFirstAvailableStorageValue,
  serializeDriverRatings,
} from './persistence'
import { MAX_SIMULATION_SEED_LENGTH } from './simulation/random'
import { createInitialRace } from './simulation/race'
import {
  createSeasonState,
  recordOfficialSuperFormulaPenaltyPointAdjudication,
  recordSeasonRound,
  superFormulaNextEventEligibility,
} from './simulation/season'
import { createWeekendContext } from './simulation/weekend'

describe('V2 persistence migration', () => {
  it('round-trips the explicit 30-skill driver profile', () => {
    const tuned = initialDrivers.map((driver, index) =>
      index === 0
        ? {
          ...driver,
            skills: {
              ...driver.skills,
              adaptability: 0.93,
              qualifyingPace: 0.97,
              raceAwareness: 0.95,
            },
          }
        : driver,
    )
    const serialized = serializeDriverRatings(tuned)
    const restored = parsePersistedDriverRatings(
      JSON.stringify(serialized),
      initialDrivers,
    )

    expect(restored[0].skills).toMatchObject({
      adaptability: 0.93,
      qualifyingPace: 0.97,
      raceAwareness: 0.95,
    })
    expect(restored[1].skills).toEqual(initialDrivers[1].skills)
  })

  it('normalizes a legacy weekend against its saved track', () => {
    const track = tracks.find((candidate) => candidate.id === 'suzuka-approx')!
    const driverId = initialDrivers[0].id
    const raw = JSON.stringify({
      trackId: track.id,
      stage: 'qualifying',
      seed: 'legacy-save',
      gridSource: 'qualifying',
      weekendContext: {
        completed: ['fp1', 'invalid-stage'],
        componentConditionByDriver: {
          [driverId]: {
            ice: { allocationLimit: 4, allocationUsed: 2, conditionPercent: 63 },
          },
        },
      },
    })
    const restored = parsePersistedWeekend(raw, tracks, initialDrivers)
    const context = restored?.weekendContext

    if (!context || context.seriesId !== 'f1-custom') {
      throw new Error('Expected a migrated F1 weekend context.')
    }

    expect(restored?.version).toBe(4)
    expect(restored?.seriesId).toBe('f1-custom')
    expect(context.completed).toEqual(['fp1'])
    expect(
      context.componentConditionByDriver[driverId].ice
        .conditionPercent,
    ).toBe(63)
    expect(
      context.componentConditionByDriver[driverId].exhaust
        .allocationLimit,
    ).toBe(4)
    expect(
      context.tireSetInventoryByDriver[driverId].find(
        (set) => set.compound === 'H',
      )?.family,
    ).toBe(track.tireNomination?.H)
  })

  it('restores only an exact same-track canonical weekend surface carry', () => {
    const track = tracks[0]
    const context = createWeekendContext(
      initialDrivers,
      track.isSprintWeekend,
      track,
    )
    const initial = createInitialRace({
      drivers: initialDrivers,
      seed: 'persisted-weekend-surface',
      teams: initialTeams,
      track,
    })
    const state = {
      ...initial.trackSurface,
      bondedRubber: initial.trackSurface.bondedRubber.map((value, index) =>
        index === 3 ? 0.45 : value,
      ),
    }
    const persisted = {
      eventId: 'surface-carry-event',
      gridSource: 'brief',
      seed: 'persisted-weekend-surface',
      seriesId: 'f1-custom',
      stage: 'qualifying',
      trackId: track.id,
      version: 4,
      weekendContext: {
        ...context,
        trackSurfaceCarry: { state, trackId: track.id },
      },
    }
    const restored = parsePersistedWeekend(
      JSON.stringify(persisted),
      tracks,
      initialDrivers,
    )

    expect(restored?.weekendContext.trackSurfaceCarry).toEqual({
      state,
      trackId: track.id,
    })

    const crossTrack = structuredClone(persisted)
    crossTrack.weekendContext.trackSurfaceCarry.trackId = tracks[1].id
    expect(
      parsePersistedWeekend(
        JSON.stringify(crossTrack),
        tracks,
        initialDrivers,
      )?.weekendContext.trackSurfaceCarry,
    ).toBeNull()

    const corrupt = structuredClone(persisted)
    corrupt.weekendContext.trackSurfaceCarry.state.waterFilmMm[0] = 999
    expect(
      parsePersistedWeekend(
        JSON.stringify(corrupt),
        tracks,
        initialDrivers,
      )?.weekendContext.trackSurfaceCarry,
    ).toBeNull()
  })

  it('rejects an explicit removed series instead of silently loading F1', () => {
    const track = tracks[0]
    const restored = parsePersistedWeekend(
      JSON.stringify({
        gridSource: 'brief',
        seed: 'removed-series-save',
        seriesId: 'f2',
        stage: 'race',
        trackId: track.id,
        weekendContext: {},
      }),
      tracks,
      initialDrivers,
    )

    expect(restored).toBeNull()
  })

  it('retains a safe calendar event identity for repeated-track rounds', () => {
    const track = tracks.find((candidate) => candidate.id === 'suzuka-approx')!
    const restored = parsePersistedWeekend(
      JSON.stringify({
        eventId: 'sf-11',
        gridSource: 'qualifying',
        seed: 'repeated-round',
        stage: 'race2',
        trackId: track.id,
        weekendContext: {
          gridByStage: {
            race2: initialDrivers.map((driver) => driver.id),
          },
        },
      }),
      tracks,
      initialDrivers,
    )

    expect(restored?.eventId).toBe('sf-11')
    expect(restored?.stage).toBe('race2')
    expect(restored?.weekendContext.gridByStage.race2).toHaveLength(
      initialDrivers.length,
    )
  })

  it('rejects unknown tracks and repairs malformed season data', () => {
    expect(
      parsePersistedWeekend(
        JSON.stringify({
          trackId: 'missing',
          stage: 'race',
          seed: 'x',
          gridSource: 'brief',
          weekendContext: {},
        }),
        tracks,
        initialDrivers,
      ),
    ).toBeNull()
    expect(parsePersistedSeason('{"driverPoints":null}')).toEqual({
      completedRounds: [],
      driverPoints: {},
      driverResults: {},
      garage: {
        componentsByDriver: {},
        kind: 'f1',
        pendingGridPenaltyByDriver: {},
      },
      resultArchive: [],
      seriesId: 'f1-custom',
      teamPoints: {},
      teamResults: {},
    })
  })

  it('restores season garage components and pending penalties', () => {
    const restored = parsePersistedSeason(
      JSON.stringify({
        completedRounds: [],
        driverPoints: {},
        garage: {
          componentsByDriver: {
            norris: {
              ice: {
                allocationLimit: 4,
                allocationUsed: 3,
                conditionPercent: 44,
              },
            },
          },
          pendingGridPenaltyByDriver: { norris: 10 },
        },
        teamPoints: {},
      }),
    )

    expect(restored.garage.componentsByDriver.norris.ice.conditionPercent).toBe(44)
    expect(restored.garage.componentsByDriver.norris.mguK.allocationLimit).toBe(3)
    expect(restored.garage.pendingGridPenaltyByDriver.norris).toBe(10)
  })

  it('preserves immutable race-day driver and machine snapshots', () => {
    const race = createInitialRace({
      drivers: initialDrivers,
      seed: 'archive-persistence',
      teams: initialTeams,
      track: tracks[0],
    })
    const recorded = recordSeasonRound(createSeasonState(), {
      cars: race.cars.map((car, index) => ({
        ...car,
        position: index + 1,
        status: 'finished' as const,
        totalDistance: race.raceLaps,
      })),
      drivers: initialDrivers,
      roundId: 'archive-race:race',
      stage: 'race',
      teams: initialTeams,
    })
    const restored = parsePersistedSeason(JSON.stringify(recorded))
    const archivedLeader = recorded.resultArchive[0].entries[0]

    expect(restored.resultArchive).toHaveLength(1)
    expect(restored.resultArchive[0].entries[0].driverSnapshot?.name).toBe(
      initialDrivers.find((driver) => driver.id === archivedLeader.driverId)?.name,
    )
    expect(restored.resultArchive[0].entries[0].teamSnapshot?.name).toBe(
      initialTeams.find((team) => team.id === archivedLeader.teamId)?.name,
    )
  })

  it('repairs corrupted season standings before they reach countback', () => {
    const restored = parsePersistedSeason(`{
      "completedRounds":["round:1","round:1",null,"not allowed"],
      "driverPoints":{"valid":25,"infinite":1e309,"negative":-4},
      "teamPoints":{"valid-team":43,"text":"43"},
      "driverResults":{"valid":[1,2,1e309,0,-1,2.5,"3"]},
      "teamResults":{"valid-team":[1,2,3]},
      "garage":{"pendingGridPenaltyByDriver":{"__proto__":10,"valid":1e200}}
    }`)

    expect(restored.completedRounds).toEqual(['round:1'])
    expect(restored.driverPoints).toEqual({ valid: 25 })
    expect(restored.teamPoints).toEqual({ 'valid-team': 43 })
    expect(restored.driverResults).toEqual({ valid: [1, 2] })
    expect(restored.teamResults).toEqual({ 'valid-team': [1, 2, 3] })
    expect(restored.garage.pendingGridPenaltyByDriver).toEqual({ valid: 100 })
  })

  it('migrates seed-specific race records to one championship round', () => {
    const restored = parsePersistedSeason(
      JSON.stringify({
        completedRounds: [
          'melbourne-approx:race:auto-one',
          'melbourne-approx:race:auto-two',
          'shanghai-approx:sprint:auto-three',
        ],
        driverPoints: {},
        teamPoints: {},
      }),
    )

    expect(restored.completedRounds).toEqual([
      'melbourne-approx:race',
      'shanghai-approx:sprint',
    ])
  })

  it('falls back cleanly when browser storage access is blocked', () => {
    expect(
      readFirstAvailableStorageValue(['primary', 'legacy'], (key) =>
        key === 'legacy' ? 'saved-value' : null,
      ),
    ).toBe('saved-value')
    expect(
      readFirstAvailableStorageValue(['primary'], () => {
        throw new DOMException('Storage blocked', 'SecurityError')
      }),
    ).toBeNull()
  })

  it('clamps legacy weekend engineering data to legal ranges', () => {
    const track = tracks[0]
    const driverId = initialDrivers[0].id
    const restored = parsePersistedWeekend(
      JSON.stringify({
        trackId: track.id,
        stage: 'race',
        seed: 'corrupt-weekend',
        gridSource: 'brief',
        weekendContext: {
          gridPenaltyByDriver: { [driverId]: 1e200 },
          setupBonusByDriver: { [driverId]: 10 },
          setupConfidenceByDriver: { [driverId]: -5 },
          setupByDriver: {
            [driverId]: {
              brakeBiasPercent: 1e200,
              coolingPercent: -1e200,
              differentialPercent: 1e200,
              frontWing: 1e200,
              rearWing: -1e200,
              rideHeightMm: 1e200,
            },
          },
          tireSetsByDriver: {
            [driverId]: { H: 1e200, I: 1e200, M: 1e200, S: 1e200, W: 1e200 },
          },
          tireSetInventoryByDriver: {
            [driverId]: [
              {
                compound: 'S',
                heatCycles: 1e200,
                id: 'legacy-soft',
                laps: 1e200,
                status: 'used',
              },
            ],
          },
        },
      }),
      tracks,
      initialDrivers,
    )
    const context = restored?.weekendContext

    if (!context || context.seriesId !== 'f1-custom') {
      throw new Error('Expected a migrated F1 weekend context.')
    }

    expect(context.setupByDriver[driverId]).toEqual({
      brakeBiasPercent: 60,
      coolingPercent: 25,
      differentialPercent: 75,
      frontWing: 10,
      rearWing: 1,
      rideHeightMm: 45,
    })
    expect(context.setupBonusByDriver[driverId]).toBe(0.35)
    expect(context.setupConfidenceByDriver[driverId]).toBe(0)
    expect(context.gridPenaltyByDriver[driverId]).toBe(
      initialDrivers.length,
    )
    expect(context.tireSetInventoryByDriver[driverId][0]).toMatchObject({
      heatCycles: 20,
      laps: 1_000,
    })
  })

  it('bounds persisted text before it reaches repeated simulation hashing or UI', () => {
    const track = tracks[0]
    const longSeed = `  ${'seed'.repeat(2_000)}  `
    const longNote = 'n'.repeat(2_000)
    const restored = parsePersistedWeekend(
      JSON.stringify({
        trackId: track.id,
        stage: 'race',
        seed: longSeed,
        gridSource: 'brief',
        weekendContext: { notes: [longNote] },
      }),
      tracks,
      initialDrivers,
    )

    expect(restored?.seed).toHaveLength(MAX_SIMULATION_SEED_LENGTH)
    expect(restored?.seed.startsWith('seed')).toBe(true)
    expect(restored?.weekendContext.notes[0]).toHaveLength(240)
  })

  it('does not migrate F1 lifecycle state into a SUPER FORMULA save', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const restoredWeekend = parsePersistedWeekend(
      JSON.stringify({
        gridSource: 'brief',
        seed: 'sf-runtime-boundary',
        seriesId: 'super-formula',
        stage: 'race',
        trackId: series.tracks[0].id,
        version: 4,
        weekendContext: {
          componentConditionByDriver: { copied: {} },
          seriesId: 'super-formula',
          tireSetsByDriver: { copied: { S: 6 } },
        },
      }),
      series.tracks,
      series.drivers,
      'super-formula',
    )
    const restoredSeason = parsePersistedSeason(
      JSON.stringify({
        completedRounds: [],
        driverPoints: {},
        garage: {
          componentsByDriver: { copied: {} },
          kind: 'super-formula',
          pendingGridPenaltyByDriver: { copied: 10 },
        },
        seriesId: 'super-formula',
        teamPoints: {},
      }),
      'super-formula',
    )

    if (
      !restoredWeekend ||
      restoredWeekend.weekendContext.seriesId !== 'super-formula'
    ) {
      throw new Error('Expected a source-backed SUPER FORMULA weekend context.')
    }

    expect(restoredWeekend.weekendContext).not.toHaveProperty(
      'componentConditionByDriver',
    )
    expect(restoredWeekend.weekendContext).not.toHaveProperty('tireSetsByDriver')
    expect(restoredSeason.garage).toMatchObject({ kind: 'super-formula' })
    expect(restoredSeason.garage).not.toHaveProperty('componentsByDriver')
  })

  it('round-trips only the sourced SUPER FORMULA lifecycle payload', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const weekendContext = createWeekendContext(
      series.drivers,
      series.tracks[0].isSprintWeekend,
      series.tracks[0],
      undefined,
      'super-formula',
    )
    const season = createSeasonState(series.drivers, 'super-formula')
    const restoredWeekend = parsePersistedWeekend(
      JSON.stringify({
        gridSource: 'brief',
        seed: 'sf-source-backed-save',
        seriesId: 'super-formula',
        stage: 'race',
        trackId: series.tracks[0].id,
        version: 4,
        weekendContext,
      }),
      series.tracks,
      series.drivers,
      'super-formula',
    )
    const restoredSeason = parsePersistedSeason(
      JSON.stringify(season),
      'super-formula',
    )

    if (
      !restoredWeekend ||
      restoredWeekend.weekendContext.seriesId !== 'super-formula'
    ) {
      throw new Error('Expected a restored SUPER FORMULA weekend context.')
    }

    const firstDriver = series.drivers[0]
    expect(
      restoredWeekend.weekendContext.controlTireInventoryByDriver[
        firstDriver.id
      ],
    ).toMatchObject({
      sets: { dry: { maximumSets: 6 }, wet: { maximumSets: 6 } },
    })
    expect(
      restoredWeekend.weekendContext.engineLedgerByEntrant[firstDriver.teamId],
    ).toMatchObject({ engine: { maximumPerEntrantPerSeason: 2, used: 1 } })
    expect(restoredSeason.garage).toMatchObject({ kind: 'super-formula' })
    expect(restoredSeason.garage).not.toHaveProperty('componentsByDriver')
  })

  it('round-trips only explicit SUPER FORMULA Article 5 official ledgers', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const driver = series.drivers[0]
    const adjudicated = recordOfficialSuperFormulaPenaltyPointAdjudication(
      createSeasonState(series.drivers, 'super-formula'),
      {
        assessedOn: '2026-08-01',
        driverId: driver.id,
        officialDecisionId: 'official-save-article-5-1',
        points: 6,
      },
    )
    const restored = parsePersistedSeason(
      JSON.stringify(adjudicated.season),
      'super-formula',
    )

    expect(restored.discipline).toMatchObject({
      kind: 'super-formula-article-5',
      penaltyLedgerByDriver: {
        [driver.id]: {
          kind: 'super-formula-2026-penalty-point-ledger',
          pointEntries: [
            expect.objectContaining({ id: 'official-save-article-5-1' }),
          ],
        },
      },
    })
    expect(superFormulaNextEventEligibility(restored, driver.id)).toMatchObject({
      status: 'next-event-suspension-pending',
    })

    const corrupted = JSON.parse(JSON.stringify(adjudicated.season)) as {
      discipline: unknown
    }
    corrupted.discipline = {
      kind: 'f1',
      penaltyPointsByDriver: { [driver.id]: 6 },
    }
    const repaired = parsePersistedSeason(
      JSON.stringify(corrupted),
      'super-formula',
    )

    expect(repaired.discipline).toEqual({
      kind: 'super-formula-article-5',
      penaltyLedgerByDriver: {},
    })
  })
})
