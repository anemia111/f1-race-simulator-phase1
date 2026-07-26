import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import {
  assessTrackRejoin,
  canRejoinTrack,
  REJOIN_MIN_AHEAD_GAP_SECONDS,
  REJOIN_MIN_BEHIND_GAP_SECONDS,
} from './trackRejoin'

const initialCars = () =>
  createInitialRace({
    drivers: initialDrivers,
    seed: 'safe-rejoin',
    teams: initialTeams,
    track: tracks[0],
  }).cars

describe('safe track rejoining', () => {
  it('waits while a car is approaching from behind', () => {
    const [offTrack, traffic] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    const approaching = {
      ...traffic,
      status: 'running' as const,
      totalDistance: 3.39,
    }
    const assessment = assessTrackRejoin(
      waitingCar,
      [waitingCar, approaching],
      90,
    )

    expect(assessment.nearestBehindGapSeconds).toBeCloseTo(0.9, 6)
    expect(assessment.safe).toBe(false)
    expect(
      canRejoinTrack(waitingCar, [waitingCar, approaching], 12, 90),
    ).toBe(false)
  })

  it('also waits until a passing car has cleared the rejoin point', () => {
    const [offTrack, traffic] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    const justAhead = {
      ...traffic,
      status: 'running' as const,
      totalDistance:
        3.4 + (REJOIN_MIN_AHEAD_GAP_SECONDS - 0.1) / 90,
    }

    expect(
      assessTrackRejoin(waitingCar, [waitingCar, justAhead], 90).safe,
    ).toBe(false)
  })

  it('rejoins only after both sides of the traffic gap are clear', () => {
    const [offTrack, ahead, behind] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    const clearAhead = {
      ...ahead,
      status: 'running' as const,
      totalDistance:
        3.4 + (REJOIN_MIN_AHEAD_GAP_SECONDS + 0.2) / 90,
    }
    const clearBehind = {
      ...behind,
      status: 'running' as const,
      totalDistance:
        3.4 - (REJOIN_MIN_BEHIND_GAP_SECONDS + 0.2) / 90,
    }

    expect(
      canRejoinTrack(
        waitingCar,
        [waitingCar, clearAhead, clearBehind],
        10.9,
        90,
      ),
    ).toBe(false)
    expect(
      canRejoinTrack(
        waitingCar,
        [waitingCar, clearAhead, clearBehind],
        11,
        90,
      ),
    ).toBe(true)
  })
})
