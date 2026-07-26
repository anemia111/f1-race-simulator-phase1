import { describe, expect, it } from 'vitest'
import { initialTeams } from '../data/grid2026'
import { pitStopLossSeconds } from './strategy'

describe('team pit-stop loss', () => {
  it('uses the team crew calibration in both total loss and repair stops', () => {
    const ferrari = initialTeams.find((team) => team.id === 'ferrari')!
    const astonMartin = initialTeams.find(
      (team) => team.id === 'aston-martin',
    )!
    const common = ['pit-team-calibration', 'driver', 1] as const
    const ferrariLoss = pitStopLossSeconds(
      common[0],
      common[1],
      ferrari,
      common[2],
      false,
      18,
    )
    const astonLoss = pitStopLossSeconds(
      common[0],
      common[1],
      astonMartin,
      common[2],
      false,
      18,
    )

    expect(ferrariLoss).toBeLessThan(astonLoss)
    expect(astonLoss - ferrariLoss).toBeCloseTo(
      (ferrari.pitCrewSpeed - astonMartin.pitCrewSpeed) * 4,
      10,
    )
    expect(
      pitStopLossSeconds(
        common[0],
        common[1],
        ferrari,
        common[2],
        true,
        18,
      ) - ferrariLoss,
    ).toBe(3)
  })
})
