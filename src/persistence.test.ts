import { describe, expect, it } from 'vitest'
import { initialDrivers } from './data/grid2026'
import { tracks } from './data/tracks'
import {
  parsePersistedDriverRatings,
  parsePersistedSeason,
  parsePersistedWeekend,
  serializeDriverRatings,
} from './persistence'

describe('V2 persistence migration', () => {
  it('round-trips explicit 12-stat driver tuning without materializing fallbacks', () => {
    const tuned = initialDrivers.map((driver, index) =>
      index === 0
        ? {
            ...driver,
            adaptability: 0.93,
            qualifyingPace: 0.97,
            raceAwareness: 0.95,
          }
        : driver,
    )
    const serialized = serializeDriverRatings(tuned)
    const restored = parsePersistedDriverRatings(
      JSON.stringify(serialized),
      initialDrivers,
    )

    expect(restored[0]).toMatchObject({
      adaptability: 0.93,
      qualifyingPace: 0.97,
      raceAwareness: 0.95,
    })
    expect(restored[1]).not.toHaveProperty('qualifyingPace')
  })

  it('normalizes a legacy weekend against its saved track', () => {
    const track = tracks.find((candidate) => candidate.id === 'suzuka-approx')!
    const raw = JSON.stringify({
      trackId: track.id,
      stage: 'qualifying',
      seed: 'legacy-save',
      gridSource: 'qualifying',
      weekendContext: {
        completed: ['fp1', 'invalid-stage'],
        componentConditionByDriver: {
          norris: {
            ice: { allocationLimit: 4, allocationUsed: 2, conditionPercent: 63 },
          },
        },
      },
    })
    const restored = parsePersistedWeekend(raw, tracks, initialDrivers)

    expect(restored?.version).toBe(2)
    expect(restored?.weekendContext.completed).toEqual(['fp1'])
    expect(
      restored?.weekendContext.componentConditionByDriver.norris.ice
        .conditionPercent,
    ).toBe(63)
    expect(
      restored?.weekendContext.componentConditionByDriver.norris.exhaust
        .allocationLimit,
    ).toBe(4)
    expect(
      restored?.weekendContext.tireSetInventoryByDriver.norris.find(
        (set) => set.compound === 'H',
      )?.family,
    ).toBe(track.tireNomination?.H)
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
})
