import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { performanceLapGainSeconds } from './vehicleDynamics'

describe('driver ability integration', () => {
  it('turns the 12-stat overall average into measurable race pace', () => {
    const driver = initialDrivers[0]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const shared = {
      ...driver,
      braking: 0.9,
      cornering: 0.9,
      racePace: 0.9,
    }
    const lowerOverall = {
      ...shared,
      adaptability: 0.65,
      consistency: 0.65,
      defense: 0.65,
      overtaking: 0.65,
      qualifyingPace: 0.65,
      raceAwareness: 0.65,
      starts: 0.65,
      tireManagement: 0.65,
      wetSkill: 0.65,
    }
    const higherOverall = {
      ...shared,
      adaptability: 1,
      consistency: 1,
      defense: 1,
      overtaking: 1,
      qualifyingPace: 1,
      raceAwareness: 1,
      starts: 1,
      tireManagement: 1,
      wetSkill: 1,
    }

    expect(
      performanceLapGainSeconds({
        driver: higherOverall,
        team,
        track: tracks[0],
      }),
    ).toBeGreaterThan(
      performanceLapGainSeconds({
        driver: lowerOverall,
        team,
        track: tracks[0],
      }),
    )
  })
})
