import { describe, expect, it } from 'vitest'
import type { DriverPoolRecord } from '../series/driverPool'
import type { DriverAssignmentRecord } from '../series/types'
import type { Driver } from '../types'
import {
  activeRuntimeAssignments,
  driverDirectorySearchText,
  runtimeSeatAssignmentFor,
  seriesLabels,
  swapDriversBetweenRuntimeSeats,
} from './SeriesDataManager'

const poolDriver: DriverPoolRecord = {
  careerHistory: [
    {
      role: 'regular',
      season: 2026,
      seriesId: 'f3',
      sourceCarNumber: 31,
      sourceIds: ['fia-f3-entry-31'],
      sourceTeamId: 'historical-f3-team',
      sourceTeamName: 'Historical F3 Team',
    },
  ],
  code: 'HIS',
  id: 'historical-driver',
  name: 'Historical Driver',
  nationality: 'FRA',
  overall: 78,
  potential: 88,
  provenance: [
    {
      confidence: 'medium',
      id: 'historical-driver-f3-2026',
      sourceCarNumber: 31,
      sourceDate: '2026-08-08',
      sourceFile: 'historical-driver-pool.json',
      sourceIds: ['fia-f3-entry-31'],
      sourceRole: 'regular',
      sourceSeason: 2026,
      sourceSeriesId: 'f3',
      sourceTeam: {
        name: 'Historical F3 Team',
        sourceId: 'historical-f3-team',
      },
      sourceType: 'editorial',
    },
  ],
  ratingSourceProvenanceId: 'historical-driver-f3-2026',
  ratings: {
    adaptability: 0.78,
    consistency: 0.78,
    defending: 0.78,
    errorControl: 0.78,
    experience: 0.78,
    overtaking: 0.78,
    qualifyingPace: 0.78,
    racePace: 0.78,
    raceStart: 0.78,
    technicalFeedback: 0.78,
    tyreManagement: 0.78,
    wetSkill: 0.78,
  },
}

function runtimeDriver(
  id: string,
  seat: Pick<Driver, 'carNumber' | 'seatRole' | 'startOffset' | 'teamId'>,
): Driver {
  return {
    ...seat,
    code: id.toUpperCase(),
    id,
    name: id,
    skills: { marker: id } as unknown as Driver['skills'],
    style: { marker: id } as unknown as Driver['style'],
    tire: 'M',
  }
}

describe('Series Data Manager pool boundaries', () => {
  it('offers only executable series as active filters', () => {
    expect(seriesLabels).toEqual({
      'f1-custom': 'F1',
      'super-formula': 'SF',
    })
  })

  it('searches historical F2/F3 provenance without making it an affiliation', () => {
    const searchText = driverDirectorySearchText(poolDriver)

    expect(searchText).toContain('f3 history')
    expect(searchText).toContain('historical f3 team')
    expect(searchText).toContain('31')

    const runtimeAssignment: DriverAssignmentRecord = {
      active: true,
      carNumber: 5,
      driverId: poolDriver.id,
      role: 'regular',
      season: 2026,
      seriesId: 'f1-custom',
      teamId: 'runtime-f1-team',
    }
    const staleHistoricalAssignment = {
      ...runtimeAssignment,
      seriesId: 'f3',
      teamId: 'historical-f3-team',
    } as unknown as DriverAssignmentRecord

    expect(
      activeRuntimeAssignments([
        runtimeAssignment,
        staleHistoricalAssignment,
        { ...runtimeAssignment, active: false, seriesId: 'super-formula' },
      ]),
    ).toEqual([runtimeAssignment])
  })

  it('moves identity between complete runtime seats', () => {
    const first = runtimeDriver('first', {
      carNumber: 11,
      seatRole: 'regular',
      startOffset: 0,
      teamId: 'team-a',
    })
    const second = runtimeDriver('second', {
      carNumber: 22,
      seatRole: 'reserve',
      startOffset: -0.25,
      teamId: 'team-b',
    })

    const swapped = swapDriversBetweenRuntimeSeats(
      [first, second],
      first.id,
      second.id,
    )

    expect(swapped[0]).toMatchObject({
      carNumber: 22,
      id: 'first',
      seatRole: 'reserve',
      startOffset: -0.25,
      teamId: 'team-b',
    })
    expect(swapped[1]).toMatchObject({
      carNumber: 11,
      id: 'second',
      seatRole: 'regular',
      startOffset: 0,
      teamId: 'team-a',
    })
    expect(swapped[0].skills).toBe(first.skills)
    expect(swapped[1].skills).toBe(second.skills)
  })

  it('materializes a signing from the target runtime seat only', () => {
    const target = runtimeDriver('target', {
      carNumber: 44,
      seatRole: 'development',
      startOffset: -0.5,
      teamId: 'runtime-sf-team',
    })

    expect(runtimeSeatAssignmentFor(target, 'super-formula')).toEqual({
      carNumber: 44,
      seatRole: 'development',
      seriesId: 'super-formula',
      startOffset: -0.5,
      teamId: 'runtime-sf-team',
    })
    expect(
      runtimeSeatAssignmentFor(target, 'super-formula').carNumber,
    ).not.toBe(
      poolDriver.careerHistory[0].sourceCarNumber,
    )
  })
})
