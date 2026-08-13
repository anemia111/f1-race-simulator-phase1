import { describe, expect, it } from 'vitest'
import type { DriverPoolRecord } from '../series/driverPool'
import type { FreeModeEntrant } from '../freeMode/types'
import {
  assignDriverToFreeModeSeat,
  driverHistorySearchTerms,
  freeModeCategoryLabels,
  freeModeRaceLapsProvenanceLabel,
  matchesDriverSearch,
} from './FreeModeBuilder'

const poolDriver: DriverPoolRecord = {
  careerHistory: [
    {
      role: 'regular',
      season: 2026,
      seriesId: 'f2',
      sourceCarNumber: 77,
      sourceIds: ['fia-f2-entry-77'],
      sourceTeamId: 'historical-team-id',
      sourceTeamName: 'Historical F2 Team',
    },
  ],
  code: 'HIS',
  id: 'historical-driver',
  name: 'Historical Driver',
  nationality: 'JPN',
  overall: 82,
  potential: 91,
  provenance: [
    {
      confidence: 'medium',
      id: 'historical-driver-f2-2026',
      sourceCarNumber: 77,
      sourceDate: '2026-08-08',
      sourceFile: 'historical-driver-pool.json',
      sourceIds: ['fia-f2-entry-77'],
      sourceRole: 'regular',
      sourceSeason: 2026,
      sourceSeriesId: 'f2',
      sourceTeam: {
        name: 'Historical F2 Team',
        sourceId: 'historical-team-id',
      },
      sourceType: 'editorial',
    },
  ],
  ratingSourceProvenanceId: 'historical-driver-f2-2026',
  ratings: {
    adaptability: 0.82,
    consistency: 0.81,
    defending: 0.8,
    errorControl: 0.79,
    experience: 0.7,
    overtaking: 0.83,
    qualifyingPace: 0.84,
    racePace: 0.82,
    raceStart: 0.8,
    technicalFeedback: 0.78,
    tyreManagement: 0.81,
    wetSkill: 0.8,
  },
}

describe('Free Mode driver-pool UI boundaries', () => {
  it('offers only executable F1 and SUPER FORMULA categories', () => {
    expect(freeModeCategoryLabels).toEqual({
      'f1-custom': 'F1',
      'super-formula': 'SUPER FORMULA',
    })
  })

  it('labels editable Free Mode race distance as a user choice', () => {
    expect(freeModeRaceLapsProvenanceLabel).toBe('user-selected')
  })

  it('finds F2/F3 metadata as history rather than a runtime category', () => {
    const terms = driverHistorySearchTerms(poolDriver)

    expect(terms).toContain('F2 history')
    expect(terms).toContain('Historical F2 Team')
    expect(terms).toContain('77')
    expect(matchesDriverSearch('f2', poolDriver, terms)).toBe(true)
    expect(matchesDriverSearch('historical team', poolDriver, terms)).toBe(true)
  })

  it('changes identity without inheriting a historical car number or team', () => {
    const runtimeSeat: FreeModeEntrant = {
      carNumber: 12,
      driverId: 'outgoing-driver',
      id: 'runtime-seat-1',
      sourceTeamId: 'runtime-f1-team',
    }

    const assigned = assignDriverToFreeModeSeat(runtimeSeat, poolDriver.id)

    expect(assigned).toEqual({
      ...runtimeSeat,
      driverId: poolDriver.id,
    })
    expect(assigned.carNumber).toBe(12)
    expect(assigned.sourceTeamId).toBe('runtime-f1-team')
    expect(assigned.carNumber).not.toBe(
      poolDriver.careerHistory[0].sourceCarNumber,
    )
  })
})
