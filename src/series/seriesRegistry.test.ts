import { describe, expect, it } from 'vitest'
import { reversedSprintGrid, runSeriesQualifying } from '../simulation/qualifying'
import { sessionDistanceLapsFor } from '../simulation/regulations'
import { buildWeekendTirePlan } from '../simulation/weekendTires'
import {
  driverAssignments2026,
  driverPool2026,
  seriesPackageById,
  seriesPackages,
  seriesRegistryAudit,
  validateSeriesPackage,
} from './seriesRegistry'

describe('2026 multi-series registry', () => {
  it('loads the four requested categories with their exact field sizes', () => {
    expect(
      seriesPackages.map(({ id, teamCount, carCount }) => ({
        id,
        teamCount,
        carCount,
      })),
    ).toEqual([
      { id: 'f1-custom', teamCount: 10, carCount: 30 },
      { id: 'f2', teamCount: 11, carCount: 22 },
      { id: 'f3', teamCount: 10, carCount: 30 },
      { id: 'super-formula', teamCount: 16, carCount: 24 },
    ])

    for (const series of seriesPackages) {
      expect(series.teams).toHaveLength(series.teamCount)
      expect(series.drivers).toHaveLength(series.carCount)
      expect(new Set(series.drivers.map((driver) => driver.id)).size).toBe(
        series.carCount,
      )
      expect(new Set(series.drivers.map((driver) => driver.carNumber)).size).toBe(
        series.carCount,
      )
    }
  })

  it('keeps the unified pool at 110 unique people and assignments relational', () => {
    expect(seriesRegistryAudit.driverPoolCount).toBe(110)
    expect(driverPool2026).toHaveLength(110)
    expect(new Set(driverPool2026.map((driver) => driver.id)).size).toBe(110)

    const poolIds = new Set(driverPool2026.map((driver) => driver.id))
    expect(
      driverAssignments2026.every((assignment) =>
        poolIds.has(assignment.driverId),
      ),
    ).toBe(true)
    expect(
      driverAssignments2026.some(
        (assignment) =>
          assignment.driverId === 'yuki_nakayama' &&
          assignment.seriesId === 'f1-custom' &&
          assignment.teamId === 'ferrari' &&
          assignment.carNumber === 31,
      ),
    ).toBe(true)
    expect(poolIds.has('yuki_tsunoda')).toBe(true)
    expect(poolIds.has('yuki_nakayama')).toBe(true)
  })

  it('stores every category rating once on the common 0-100 scale', () => {
    for (const series of seriesPackages) {
      for (const driver of series.drivers) {
        expect(driver.performanceSource?.overall).toBeGreaterThanOrEqual(0)
        expect(driver.performanceSource?.overall).toBeLessThanOrEqual(100)
        expect(driver.potential).toBeGreaterThanOrEqual(0)
        expect(driver.potential).toBeLessThanOrEqual(1)
        expect(
          Object.values(driver.skills).every(
            (rating) => rating >= 0 && rating <= 1,
          ),
        ).toBe(true)
      }
    }
  })

  it('encodes category-specific calendars and sporting rules', () => {
    const f1 = seriesPackageById.get('f1-custom')!
    const f2 = seriesPackageById.get('f2')!
    const f3 = seriesPackageById.get('f3')!
    const superFormula = seriesPackageById.get('super-formula')!

    expect(f1.calendar).toHaveLength(24)
    expect(f1.calendar.filter((event) => !event.cancelled)).toHaveLength(22)
    expect(f1.rules.qualifying.segments.map((segment) => segment.advanceCount)).toEqual([
      20,
      10,
      null,
    ])
    expect(f2.calendar).toHaveLength(14)
    expect(f2.calendar.reduce((sum, event) => sum + event.raceCount, 0)).toBe(28)
    expect(f2.rules.sprintGridReverseCount).toBe(10)
    expect(f2.rules.featureRaceMandatoryPitStop).toBe(true)
    expect(f2.rules.overtakeActivation).toBe('after-one-lap')
    expect(f2.rules.race.featureDistanceKm).toBe(170)
    expect(f2.rules.race.sprintDistanceKm).toBe(120)
    expect(f2.rules.race.featureTimeLimitSeconds).toBe(60 * 60)
    expect(f2.rules.race.sprintTimeLimitSeconds).toBe(45 * 60)
    expect(f2.rules.tires.standardAllocation).toEqual({
      H: 3,
      I: 2,
      M: 0,
      S: 2,
      W: 1,
    })
    expect(f3.rules.sprintGridReverseCount).toBe(12)
    expect(f3.rules.race.featureTimeLimitSeconds).toBe(45 * 60)
    expect(f3.rules.race.sprintTimeLimitSeconds).toBe(40 * 60)
    expect(f3.rules.tires.qualifyingDryCompound).toBe('M')
    expect(
      f3.calendar.find((event) => event.trackId === 'madrid-approx')?.raceCount,
    ).toBe(3)
    expect(
      f3.calendar.find((event) => event.trackId === 'madrid-approx')
        ?.weekendStages,
    ).toEqual([
      'fp1',
      'qualifying',
      'qualifying2',
      'sprint',
      'race',
      'race2',
    ])
    expect(f2.rules.points.fastestLap).toEqual({
      maximumClassifiedPosition: 10,
      minimumCompletionRatio: 0.5,
      points: 1,
    })
    expect(f3.rules.points.reduced?.sprint[0]).toEqual([3, 2, 1])
    expect(
      superFormula.calendar
        .filter((event) => !event.cancelled)
        .reduce((sum, event) => sum + event.raceCount, 0),
    ).toBe(12)
    expect(superFormula.rules.overtakeSystem).toBe('ots')
    expect(superFormula.rules.overtakeActivation).toBe('immediate')
    expect(superFormula.rules.tireSupplier).toBe('Yokohama')
    expect(superFormula.rules.tires.standardAllocation.H).toBe(0)
    expect(superFormula.rules.tires.standardAllocation.S).toBe(0)
    expect(
      superFormula.calendar.find((event) => event.id === 'sf-03-replacement'),
    ).toMatchObject({
      featurePoints: [12, 9, 7, 6, 5, 4, 3, 2, 1],
      featureRaceMandatoryPitStop: false,
      gridSourceTrackId: 'autopolis-sf',
      raceLaps: 25,
      raceTimeLimitSeconds: 3000,
      weekendStages: ['race'],
    })
  })

  it('derives race laps from each category distance rule', () => {
    const f1 = seriesPackageById.get('f1-custom')!
    const f2 = seriesPackageById.get('f2')!
    const f3 = seriesPackageById.get('f3')!
    const f2AlbertPark = f2.tracks.find(
      (track) => track.id === 'albert-park-approx',
    )!
    const f2Monaco = f2.tracks.find(
      (track) => track.id === 'monaco-approx',
    )!
    const f3AlbertPark = f3.tracks.find(
      (track) => track.id === 'albert-park-approx',
    )!

    expect(
      sessionDistanceLapsFor(f2AlbertPark, 'sprint', f2.rules.race),
    ).toBe(Math.floor(120 / f2AlbertPark.lengthKm) + 1)
    expect(
      sessionDistanceLapsFor(f2AlbertPark, 'race', f2.rules.race),
    ).toBe(Math.floor(170 / f2AlbertPark.lengthKm) + 1)
    expect(
      sessionDistanceLapsFor(f2Monaco, 'sprint', f2.rules.race),
    ).toBe(Math.floor(100 / f2Monaco.lengthKm) + 1)
    expect(
      sessionDistanceLapsFor(f2Monaco, 'race', f2.rules.race),
    ).toBe(Math.floor(140 / f2Monaco.lengthKm) + 1)
    expect(
      sessionDistanceLapsFor(f3AlbertPark, 'sprint', f3.rules.race),
    ).toBe(Math.round(f3AlbertPark.raceLaps! * (40 / 45)))
    expect(
      sessionDistanceLapsFor(f1.tracks[0], 'sprint', f1.rules.race),
    ).toBe(Math.floor(100 / f1.tracks[0].lengthKm) + 1)
  })

  it('runs each configured qualifying structure and reverse sprint grid', () => {
    const qualifyingBySeries = new Map(
      seriesPackages.map((series) => {
        const qualifying = runSeriesQualifying(
          {
            drivers: series.drivers,
            seed: `registry-${series.id}`,
            teams: series.teams,
            track: { ...series.tracks[0], rainProbability: 0 },
            weekendStage: 'qualifying',
          },
          series.rules,
        )
        return [series.id, qualifying] as const
      }),
    )

    expect(
      qualifyingBySeries
        .get('f1-custom')!
        .segments.map((segment) => segment.results.length),
    ).toEqual([30, 20, 10])
    expect(qualifyingBySeries.get('f2')!.segments).toHaveLength(1)
    expect(qualifyingBySeries.get('f2')!.classification).toHaveLength(22)
    expect(
      qualifyingBySeries
        .get('f2')!
        .segments[0].results.every((result) => result.compound === 'S'),
    ).toBe(true)
    expect(qualifyingBySeries.get('f3')!.segments).toHaveLength(1)
    expect(qualifyingBySeries.get('f3')!.classification).toHaveLength(30)
    expect(
      qualifyingBySeries
        .get('f3')!
        .segments[0].results.every((result) => result.compound === 'M'),
    ).toBe(true)
    expect(
      qualifyingBySeries
        .get('super-formula')!
        .segments.map((segment) => segment.results.length),
    ).toEqual([24, 12])
    expect(
      qualifyingBySeries
        .get('super-formula')!
        .segments.every((segment) =>
          segment.results.every((result) => result.compound === 'M'),
        ),
    ).toBe(true)

    const f2Classification = qualifyingBySeries.get('f2')!.classification
    const sprintGrid = reversedSprintGrid(f2Classification, 10)
    expect(sprintGrid[0].driverId).toBe(f2Classification[9].driverId)
    expect(sprintGrid[9].driverId).toBe(f2Classification[0].driverId)
    expect(sprintGrid.slice(10).map((result) => result.driverId)).toEqual(
      f2Classification.slice(10).map((result) => result.driverId),
    )
  })

  it('keeps a qualifying-used F2 option set reusable for the feature race', () => {
    const f2 = seriesPackageById.get('f2')!
    const config = {
      drivers: f2.drivers,
      featureRaceMandatoryPitStop: f2.rules.featureRaceMandatoryPitStop,
      featureRaceTwoDryCompounds: f2.rules.featureRaceTwoDryCompounds,
      qualifyingDryCompound: f2.rules.tires.qualifyingDryCompound,
      seed: 'f2-reusable-option-set',
      teams: f2.teams,
      tireAllocation: f2.rules.tires.standardAllocation,
      track: f2.tracks[0],
      weekendStage: 'qualifying' as const,
    }
    const qualifying = runSeriesQualifying(config, f2.rules)
    const plan = buildWeekendTirePlan(config, qualifying)

    expect(
      plan.driverPlans.every(
        ({ qualifyingUsed, remaining }) =>
          qualifyingUsed.S > 0 && remaining.H > 0 && remaining.S > 0,
      ),
    ).toBe(true)
  })

  it('accepts a validated event-specific SF qualifying bulletin including Q3', () => {
    const sf = seriesPackageById.get('super-formula')!
    const qualifying = {
      breakSeconds: 300,
      format: 'grouped' as const,
      segments: [
        { advanceCount: 12, durationSeconds: 1_200, name: 'Q1' as const },
        { advanceCount: 8, durationSeconds: 420, name: 'Q2' as const },
        { advanceCount: null, durationSeconds: 420, name: 'Q3' as const },
      ],
    }

    expect(() =>
      validateSeriesPackage({
        ...sf,
        calendar: sf.calendar.map((event, index) =>
          index === 0 ? { ...event, qualifying } : event,
        ),
      }),
    ).not.toThrow()
  })

  it('stores official F2/F3 Monaco and Monza group durations as event overrides', () => {
    const f2 = seriesPackageById.get('f2')!
    const f3 = seriesPackageById.get('f3')!

    expect(f2.calendar.find((event) => event.id === 'f2-04')?.qualifying).toMatchObject({
      format: 'grouped',
      segments: [{ durationSeconds: 32 * 60 }],
    })
    expect(f3.calendar.find((event) => event.id === 'f3-02')?.qualifying).toMatchObject({
      format: 'grouped',
      segments: [{ durationSeconds: 32 * 60 }],
    })
    expect(f3.calendar.find((event) => event.id === 'f3-08')?.qualifying).toMatchObject({
      format: 'grouped',
      segments: [{ durationSeconds: 20 * 60 }],
    })
  })

  it('rejects invalid category tire and qualifying data before simulation', () => {
    const f2 = seriesPackageById.get('f2')!

    expect(() =>
      validateSeriesPackage({
        ...f2,
        rules: {
          ...f2.rules,
          tires: {
            ...f2.rules.tires,
            standardAllocation: {
              ...f2.rules.tires.standardAllocation,
              S: -1,
            },
          },
        },
      }),
    ).toThrow(/invalid S count/)

    expect(() =>
      validateSeriesPackage({
        ...f2,
        rules: {
          ...f2.rules,
          qualifying: {
            ...f2.rules.qualifying,
            segments: [
              {
                advanceCount: f2.carCount,
                durationSeconds: 0,
                name: 'Q1',
              },
            ],
          },
        },
      }),
    ).toThrow(/invalid qualifying structure/)
  })
})
