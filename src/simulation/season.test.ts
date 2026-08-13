import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace } from './race'
import {
  applySeasonGarageToWeekend,
  completedSeasonEventCount,
  createSeasonState,
  eligibleSuperFormulaDriversForNextEvent,
  rankSeasonEntries,
  recordOfficialSuperFormulaPenaltyPointAdjudication,
  recordOfficialSuperFormulaSuspensionServed,
  recordQualifyingPoints,
  recordSeasonRound,
  seasonSessionId,
  superFormulaNextEventEligibility,
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
      drivers: initialDrivers,
      roundId: 'bahrain:race:one',
      stage: 'race',
      teams: initialTeams,
    })

    expect(recorded.driverPoints[cars[0].driverId]).toBe(25)
    expect(recorded.driverPoints[cars[1].driverId]).toBe(18)
    expect(recorded.driverPoints[cars[2].driverId]).toBe(15)
    expect(recorded.resultArchive).toHaveLength(1)
    expect(recorded.resultArchive[0].entries[0]).toMatchObject({
      carNumber: cars[0].carNumber,
      driverId: cars[0].driverId,
      driverOverall: expect.any(Number),
      pointsAwarded: 25,
      position: 1,
      teamId: cars[0].teamId,
      machineOverall: expect.any(Number),
    })
    expect(recorded.resultArchive[0].entries[0].driverSnapshot?.skills).toEqual(
      initialDrivers.find((driver) => driver.id === cars[0].driverId)?.skills,
    )
    expect(recorded.resultArchive[0].entries[0].teamSnapshot?.machine).toEqual(
      initialTeams.find((team) => team.id === cars[0].teamId)?.machine,
    )
    expect(recordSeasonRound(recorded, {
      cars,
      roundId: 'bahrain:race:one',
      stage: 'race',
    })).toBe(recorded)
  })

  it('uses a seed-independent championship key for each race session', () => {
    expect(seasonSessionId('melbourne-approx', 'race')).toBe(
      'melbourne-approx:race',
    )
    expect(seasonSessionId('shanghai-approx', 'sprint')).toBe(
      'shanghai-approx:sprint',
    )
    expect(
      completedSeasonEventCount([
        'shanghai-approx:qualifying',
        'shanghai-approx:sprint',
        'shanghai-approx:race',
        'melbourne-approx:race',
      ]),
    ).toBe(2)
  })

  it('supports category points and best-two entrant scoring', () => {
    const classification = initialDrivers.slice(0, 4).map((driver, index) => ({
      driverId: driver.id,
      position: index + 1,
      teamId: driver.teamId,
    }))
    const recorded = recordQualifyingPoints(createSeasonState(), {
      classification,
      pointsTable: [3, 2, 1],
      roundId: 'suzuka:qualifying',
      teamScoring: 'best-two',
    })

    expect(recorded.driverPoints[classification[0].driverId]).toBe(3)
    expect(recorded.driverPoints[classification[2].driverId]).toBe(1)
    expect(recorded.teamPoints[classification[0].teamId]).toBe(5)
    expect(
      recordQualifyingPoints(recorded, {
        classification,
        pointsTable: [3, 2, 1],
        roundId: 'suzuka:qualifying',
        teamScoring: 'best-two',
      }),
    ).toBe(recorded)
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

  it('awards Sprint points only after 50 percent and two consecutive green laps', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'season-sprint-distance',
      teams: initialTeams,
      track: tracks[0],
    })
    const cars = snapshot.cars.map((car, index) => ({
      ...car,
      position: index + 1,
      status: 'finished' as const,
      totalDistance: 10,
    }))
    const shortSprint = recordSeasonRound(createSeasonState(), {
      cars,
      greenFlagLaps: 4,
      roundId: 'sprint:short',
      scheduledLaps: 21,
      stage: 'sprint',
    })
    const neutralisedSprint = recordSeasonRound(createSeasonState(), {
      cars: cars.map((car) => ({ ...car, totalDistance: 12 })),
      greenFlagLaps: 1,
      roundId: 'sprint:no-green-running',
      scheduledLaps: 21,
      stage: 'sprint',
    })
    const halfSprint = recordSeasonRound(createSeasonState(), {
      cars: cars.map((car) => ({ ...car, totalDistance: 12 })),
      greenFlagLaps: 2,
      roundId: 'sprint:half',
      scheduledLaps: 21,
      stage: 'sprint',
    })

    expect(shortSprint.driverPoints[cars[0].driverId] ?? 0).toBe(0)
    expect(neutralisedSprint.driverPoints[cars[0].driverId] ?? 0).toBe(0)
    expect(halfSprint.driverPoints[cars[0].driverId]).toBe(8)
  })

  it('uses supplied reduced points tables at each distance threshold', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'reduced-points-policy',
      teams: initialTeams,
      track: tracks[0],
    })
    const reducedPointsTables: [number[], number[], number[]] = [
      [6, 4, 3, 2, 1],
      [13, 10, 8, 6, 5, 4, 3, 2, 1],
      [19, 14, 12, 9, 8, 6, 5, 3, 2, 1],
    ]
    const winnerPointsAt = (completedLaps: number) => {
      const cars = snapshot.cars.map((car, index) => ({
        ...car,
        position: index + 1,
        status: 'finished' as const,
        totalDistance: completedLaps + 1,
      }))

      return recordSeasonRound(createSeasonState(), {
        cars,
        greenFlagLaps: 2,
        pointsTable: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
        reducedPointsTables,
        roundId: `reduced:${completedLaps}`,
        scheduledLaps: 100,
        stage: 'race',
      }).driverPoints[cars[0].driverId]
    }

    expect(winnerPointsAt(20)).toBe(6)
    expect(winnerPointsAt(30)).toBe(13)
    expect(winnerPointsAt(60)).toBe(19)
    expect(winnerPointsAt(80)).toBe(25)
  })

  it('awards the support-series fastest-lap point only to the overall fastest classified top-ten car', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'support-series-fastest-lap',
      teams: initialTeams,
      track: tracks[0],
    })
    const baseCars = snapshot.cars.map((car, index) => ({
      ...car,
      bestLapLap: 12,
      bestLapTimeSeconds: 90 + index,
      position: index + 1,
      status: 'finished' as const,
      totalDistance: 61,
    }))
    const fastestLapRule = {
      maximumClassifiedPosition: 10,
      minimumCompletionRatio: 0.5,
      points: 1,
    }
    const outsideTopTenFastest = baseCars.map((car, index) => ({
      ...car,
      bestLapTimeSeconds: index === 10 ? 70 : car.bestLapTimeSeconds,
    }))
    const noBonus = recordSeasonRound(createSeasonState(), {
      cars: outsideTopTenFastest,
      fastestLapRule,
      pointsTable: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      roundId: 'fastest:no-bonus',
      scheduledLaps: 100,
      stage: 'race',
    })
    const topTenFastest = baseCars.map((car, index) => ({
      ...car,
      bestLapTimeSeconds: index === 4 ? 70 : car.bestLapTimeSeconds,
    }))
    const bonus = recordSeasonRound(createSeasonState(), {
      cars: topTenFastest,
      fastestLapRule,
      pointsTable: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      roundId: 'fastest:bonus',
      scheduledLaps: 100,
      stage: 'race',
    })

    expect(noBonus.driverPoints[outsideTopTenFastest[4].driverId]).toBe(10)
    expect(bonus.driverPoints[topTenFastest[4].driverId]).toBe(11)
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

  it('ignores impossible countback values without iterating through them', () => {
    const ranked = rankSeasonEntries(
      { driverA: 120, driverB: 120, driverC: Number.POSITIVE_INFINITY },
      {
        driverA: [Number.POSITIVE_INFINITY, -1, 2.5],
        driverB: [1],
        driverC: [2],
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
      index === 0 && car.runtimeSystems.kind === 'f1'
        ? {
            ...car,
            runtimeSystems: {
              ...car.runtimeSystems,
              components: {
                ...car.runtimeSystems.components,
                ice: {
                  ...car.runtimeSystems.components.ice,
                  conditionPercent: 52,
                },
              },
            },
          }
        : car,
    )
    const firstCar = wornCars[0]

    if (firstCar.runtimeSystems.kind !== 'f1') {
      throw new Error('Expected F1 runtime state for F1 garage coverage.')
    }
    const stored = updateSeasonGarageFromCars(
      createSeasonState(initialDrivers),
      wornCars,
    )
    const replacementStored = updateSeasonGarageReplacement(
      stored,
      firstCar.driverId,
      firstCar.runtimeSystems.components,
      10,
    )
    const nextWeekend = applySeasonGarageToWeekend(
      createWeekendContext(initialDrivers, false, tracks[1]),
      replacementStored,
      initialDrivers,
    )

    if (nextWeekend.seriesId !== 'f1-custom') {
      throw new Error('Expected an F1 weekend lifecycle payload.')
    }

    expect(
      nextWeekend.componentConditionByDriver[firstCar.driverId].ice
        .conditionPercent,
    ).toBe(52)
    expect(nextWeekend.gridPenaltyByDriver[wornCars[0].driverId]).toBe(10)

    const afterRace = recordSeasonRound(replacementStored, {
      cars: wornCars,
      roundId: 'garage:race',
      stage: 'race',
    })

    if (afterRace.seriesId !== 'f1-custom') {
      throw new Error('Expected an F1 season lifecycle payload.')
    }
    expect(afterRace.garage.pendingGridPenaltyByDriver).toEqual({})
  })

  it('caps corrupted carried grid penalties to the size of the field', () => {
    const driverId = initialDrivers[0].id
    const weekend = applySeasonGarageToWeekend(
      createWeekendContext(initialDrivers, false, tracks[0]),
      {
        ...createSeasonState(),
        garage: {
          componentsByDriver: {},
          kind: 'f1',
          pendingGridPenaltyByDriver: { [driverId]: 500 },
        },
      },
      initialDrivers,
    )

    if (weekend.seriesId !== 'f1-custom') {
      throw new Error('Expected an F1 weekend lifecycle payload.')
    }

    expect(weekend.gridPenaltyByDriver[driverId]).toBe(initialDrivers.length)
  })

  it('creates a SUPER FORMULA lifecycle without an F1 component garage or Pirelli inventory', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const weekend = createWeekendContext(
      series.drivers,
      false,
      series.tracks[0],
      undefined,
      'super-formula',
    )
    const season = createSeasonState(series.drivers, 'super-formula')

    expect(weekend.seriesId).toBe('super-formula')
    expect(weekend).not.toHaveProperty('componentConditionByDriver')
    expect(weekend).not.toHaveProperty('tireSetsByDriver')
    expect(weekend.controlTireInventoryByDriver[series.drivers[0].id]).toMatchObject({
      sets: { dry: { maximumSets: 6 }, wet: { maximumSets: 6 } },
    })
    expect(season.garage).toMatchObject({
      kind: 'super-formula',
    })
    expect(season.garage).not.toHaveProperty('componentsByDriver')
    expect(season.discipline).toMatchObject({
      kind: 'super-formula-article-5',
      penaltyLedgerByDriver: {
        [series.drivers[0].id]: {
          kind: 'super-formula-2026-penalty-point-ledger',
        },
      },
    })
    expect(createSeasonState()).not.toHaveProperty('discipline')
  })

  it('uses explicit Article 5 official adjudications to gate a SUPER FORMULA next event', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const driver = series.drivers[0]
    const initial = createSeasonState(series.drivers, 'super-formula')
    const race = createInitialRace({
      drivers: series.drivers,
      overtakeSystem: 'ots',
      seed: 'sf-article-5-official-only',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: series.teams,
      track: series.tracks[0],
      weekendStage: 'race',
    })
    const afterGenericRacePoints = recordSeasonRound(initial, {
      cars: race.cars.map((car) =>
        car.driverId === driver.id
          ? { ...car, penaltyPoints: 6, status: 'finished' as const }
          : { ...car, status: 'finished' as const },
      ),
      roundId: 'sf-article-5-generic-race-points',
      stage: 'race',
    })

    if (afterGenericRacePoints.seriesId !== 'super-formula') {
      throw new Error('Expected a SUPER FORMULA season state.')
    }

    expect(
      afterGenericRacePoints.discipline.penaltyLedgerByDriver[driver.id]
        .pointEntries,
    ).toEqual([])
    expect(
      superFormulaNextEventEligibility(afterGenericRacePoints, driver.id),
    ).toMatchObject({ status: 'eligible', suspension: null })

    const adjudicated = recordOfficialSuperFormulaPenaltyPointAdjudication(
      afterGenericRacePoints,
      {
        assessedOn: '2026-08-01',
        driverId: driver.id,
        officialDecisionId: 'official-article-5-2026-08-01',
        points: 6,
      },
    )

    expect(adjudicated.assessment).toMatchObject({
      status: 'next-event-suspension-assessed',
      suspension: { thresholdPoints: 6 },
    })
    expect(
      superFormulaNextEventEligibility(adjudicated.season, driver.id),
    ).toMatchObject({ status: 'next-event-suspension-pending' })
    expect(
      eligibleSuperFormulaDriversForNextEvent(
        adjudicated.season,
        series.drivers,
      ).map((candidate) => candidate.id),
    ).not.toContain(driver.id)

    if (!adjudicated.assessment.suspension) {
      throw new Error('Expected Article 5 next-event suspension.')
    }
    const served = recordOfficialSuperFormulaSuspensionServed(
      adjudicated.season,
      {
        driverId: driver.id,
        suspensionId: adjudicated.assessment.suspension.id,
        suspensionLiftedOn: '2026-08-08',
      },
    )

    expect(
      superFormulaNextEventEligibility(served.season, driver.id),
    ).toMatchObject({ status: 'eligible', suspension: null })
    expect(
      eligibleSuperFormulaDriversForNextEvent(
        served.season,
        series.drivers,
      ).map((candidate) => candidate.id),
    ).toContain(driver.id)
    expect(
      served.season.discipline.penaltyLedgerByDriver[driver.id].pointEntries,
    ).toEqual([
      expect.objectContaining({
        clearedOn: '2026-08-08',
        id: 'official-article-5-2026-08-01',
      }),
    ])
  })
})
