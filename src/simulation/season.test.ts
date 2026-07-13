import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import {
  applySeasonGarageToWeekend,
  createSeasonState,
  rankSeasonEntries,
  recordSeasonRound,
  updateSeasonGarageFromCars,
  updateSeasonGarageReplacement,
} from './season'
import { createWeekendContext } from './weekend'

describe('local season standings', () => {
  it('awards points by classified position and records a round only once', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'season-points',
      teams: initialTeams,
      track: tracks[0],
    })
    const cars = snapshot.cars.map((car, index) => ({
      ...car,
      position: index + 1,
      status: index === 2 ? ('retired' as const) : ('finished' as const),
      totalDistance: index === 2 ? 54 : 57,
    }))
    const recorded = recordSeasonRound(createSeasonState(), {
      cars,
      roundId: 'bahrain:race:one',
      stage: 'race',
    })

    expect(recorded.driverPoints[cars[0].driverId]).toBe(25)
    expect(recorded.driverPoints[cars[1].driverId]).toBe(18)
    expect(recorded.driverPoints[cars[2].driverId]).toBe(15)
    expect(recordSeasonRound(recorded, {
      cars,
      roundId: 'bahrain:race:one',
      stage: 'race',
    })).toBe(recorded)
  })

  it('does not award points to a retirement below 90 percent distance', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'season-unclassified',
      teams: initialTeams,
      track: tracks[0],
    })
    const cars = snapshot.cars.map((car, index) => ({
      ...car,
      position: index + 1,
      status: index === 2 ? ('retired' as const) : ('finished' as const),
      totalDistance: index === 2 ? 40 : 57,
    }))
    const recorded = recordSeasonRound(createSeasonState(), {
      cars,
      roundId: 'bahrain:race:unclassified',
      stage: 'race',
    })

    expect(recorded.driverPoints[cars[2].driverId] ?? 0).toBe(0)
    expect(recorded.driverPoints[cars[3].driverId]).toBe(12)
  })

  it('never awards points or countback results to a disqualified car', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'season-dsq',
      teams: initialTeams,
      track: tracks[0],
    })
    const cars = snapshot.cars.map((car, index) => ({
      ...car,
      position: index + 1,
      status: index === 0 ? ('disqualified' as const) : ('finished' as const),
      totalDistance: 57,
    }))
    const recorded = recordSeasonRound(createSeasonState(), {
      cars,
      roundId: 'test:race:dsq',
      stage: 'race',
    })

    expect(recorded.driverPoints[cars[0].driverId] ?? 0).toBe(0)
    expect(recorded.driverResults[cars[0].driverId]).toBeUndefined()
  })

  it('breaks equal championship points by race wins, then lower places', () => {
    const ranked = rankSeasonEntries(
      { driverA: 120, driverB: 120, driverC: 120 },
      {
        driverA: [2, 2, 3],
        driverB: [1, 8, 10],
        driverC: [2, 2, 4],
      },
    )

    expect(ranked.map(([driverId]) => driverId)).toEqual([
      'driverB',
      'driverA',
      'driverC',
    ])
  })

  it('carries component wear and pending allocation penalties between rounds', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'season-garage',
      teams: initialTeams,
      track: tracks[0],
    })
    const wornCars = snapshot.cars.map((car, index) =>
      index === 0
        ? {
            ...car,
            components: {
              ...car.components,
              ice: { ...car.components.ice, conditionPercent: 52 },
            },
          }
        : car,
    )
    const stored = updateSeasonGarageFromCars(
      createSeasonState(initialDrivers),
      wornCars,
    )
    const replacementStored = updateSeasonGarageReplacement(
      stored,
      wornCars[0].driverId,
      wornCars[0].components,
      10,
    )
    const nextWeekend = applySeasonGarageToWeekend(
      createWeekendContext(initialDrivers, false, tracks[1]),
      replacementStored,
      initialDrivers,
    )

    expect(
      nextWeekend.componentConditionByDriver[wornCars[0].driverId].ice
        .conditionPercent,
    ).toBe(52)
    expect(nextWeekend.gridPenaltyByDriver[wornCars[0].driverId]).toBe(10)

    const afterRace = recordSeasonRound(replacementStored, {
      cars: wornCars,
      roundId: 'garage:race',
      stage: 'race',
    })

    expect(afterRace.garage.pendingGridPenaltyByDriver).toEqual({})
  })
})
