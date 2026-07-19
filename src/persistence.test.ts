import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from './data/grid2026'
import { tracks } from './data/tracks'
import {
  parsePersistedDriverRatings,
  parsePersistedSeason,
  parsePersistedWeekend,
  readFirstAvailableStorageValue,
  serializeDriverRatings,
} from './persistence'
import { MAX_SIMULATION_SEED_LENGTH } from './simulation/random'
import { createInitialRace } from './simulation/race'
import { createSeasonState, recordSeasonRound } from './simulation/season'

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

    expect(restored?.version).toBe(3)
    expect(restored?.seriesId).toBe('f1-custom')
    expect(restored?.weekendContext.completed).toEqual(['fp1'])
    expect(
      restored?.weekendContext.componentConditionByDriver[driverId].ice
        .conditionPercent,
    ).toBe(63)
    expect(
      restored?.weekendContext.componentConditionByDriver[driverId].exhaust
        .allocationLimit,
    ).toBe(4)
    expect(
      restored?.weekendContext.tireSetInventoryByDriver[driverId].find(
        (set) => set.compound === 'H',
      )?.family,
    ).toBe(track.tireNomination?.H)
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
        pendingGridPenaltyByDriver: {},
      },
      resultArchive: [],
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

    expect(restored?.weekendContext.setupByDriver[driverId]).toEqual({
      brakeBiasPercent: 60,
      coolingPercent: 25,
      differentialPercent: 75,
      frontWing: 10,
      rearWing: 1,
      rideHeightMm: 45,
    })
    expect(restored?.weekendContext.setupBonusByDriver[driverId]).toBe(0.35)
    expect(restored?.weekendContext.setupConfidenceByDriver[driverId]).toBe(0)
    expect(restored?.weekendContext.gridPenaltyByDriver[driverId]).toBe(
      initialDrivers.length,
    )
    expect(restored?.weekendContext.tireSetInventoryByDriver[driverId][0]).toMatchObject({
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
})
