import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import {
  assessTrackRejoin,
  canRejoinTrack,
  REJOIN_MAX_WAIT_SECONDS,
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

  it('rejoins once nothing is within three seconds behind', () => {
    const [offTrack, ahead, behind] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    // A car just ahead does not block the rejoin: the danger is what is
    // closing from behind.
    const justAhead = {
      ...ahead,
      status: 'running' as const,
      totalDistance: 3.4 + (REJOIN_MIN_AHEAD_GAP_SECONDS - 0.1) / 90,
    }
    const clearBehind = {
      ...behind,
      status: 'running' as const,
      totalDistance: 3.4 - (REJOIN_MIN_BEHIND_GAP_SECONDS + 0.2) / 90,
    }

    expect(
      canRejoinTrack(waitingCar, [waitingCar, justAhead, clearBehind], 10.9, 90),
    ).toBe(false)
    expect(
      canRejoinTrack(waitingCar, [waitingCar, justAhead, clearBehind], 11, 90),
    ).toBe(true)
  })

  it('never waits longer than the maximum, however heavy the traffic', () => {
    const [offTrack, traffic] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    const rightBehind = {
      ...traffic,
      status: 'running' as const,
      totalDistance: 3.399,
    }

    expect(
      canRejoinTrack(waitingCar, [waitingCar, rightBehind], 14.9, 90),
    ).toBe(false)
    expect(
      canRejoinTrack(
        waitingCar,
        [waitingCar, rightBehind],
        10 + REJOIN_MAX_WAIT_SECONDS,
        90,
      ),
    ).toBe(true)
  })

  it('waits for the whole pack when it goes off on the opening lap', () => {
    const [offTrack, ahead, behind] = initialCars()
    const waitingCar = {
      ...offTrack,
      lap: 0,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 0.4,
    }
    const packBehind = {
      ...behind,
      lap: 0,
      status: 'running' as const,
      // Well clear of the three-second rule, but still to come past.
      totalDistance: 0.4 - 8 / 90,
    }
    const packAhead = {
      ...ahead,
      lap: 0,
      status: 'running' as const,
      totalDistance: 0.4 + 4 / 90,
    }

    // Neither the three-second gap nor the five-second cap releases it.
    expect(
      canRejoinTrack(waitingCar, [waitingCar, packAhead, packBehind], 11, 90),
    ).toBe(false)
    expect(
      canRejoinTrack(waitingCar, [waitingCar, packAhead, packBehind], 40, 90),
    ).toBe(false)
    // Once the last car is by, it rejoins at the back.
    expect(
      canRejoinTrack(waitingCar, [waitingCar, packAhead], 11, 90),
    ).toBe(true)
  })

  it('ignores a crashed car that has dropped out of the opening-lap pack', () => {
    const [offTrack, crashed] = initialCars()
    const waitingCar = {
      ...offTrack,
      lap: 0,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 0.4,
    }
    const crashedBehind = {
      ...crashed,
      incidentTrackState: 'off-track-stopped' as const,
      lap: 0,
      status: 'running' as const,
      totalDistance: 0.4 - 2 / 90,
    }

    expect(
      canRejoinTrack(waitingCar, [waitingCar, crashedBehind], 11, 90),
    ).toBe(true)
  })

  it('does not count cars from the same accident as blocking traffic', () => {
    const [offTrack, alsoCrashed, stranded] = initialCars()
    const waitingCar = {
      ...offTrack,
      offTrackSinceSeconds: 10,
      rejoinEligibleAtSeconds: 11,
      totalDistance: 3.4,
    }
    // Both are right behind, but neither is running traffic: one is off the
    // circuit with it, the other is stopped on it.
    const crashedBehind = {
      ...alsoCrashed,
      offTrackSinceSeconds: 10,
      status: 'running' as const,
      totalDistance: 3.399,
    }
    const strandedBehind = {
      ...stranded,
      incidentTrackState: 'on-track-stopped' as const,
      status: 'running' as const,
      totalDistance: 3.398,
    }
    const cars = [waitingCar, crashedBehind, strandedBehind]

    expect(
      assessTrackRejoin(waitingCar, cars, 90).nearestBehindGapSeconds,
    ).toBe(null)
    expect(canRejoinTrack(waitingCar, cars, 11, 90)).toBe(true)
  })
})
