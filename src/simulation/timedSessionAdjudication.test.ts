import { describe, expect, it } from 'vitest'
import { hashChance } from './random'
import {
  lapHasTrackLimitWarning,
  trackLimitAdjudicationChance,
} from './raceEvents'
import {
  liveTimedLapAdjudication,
  offlineQualifyingRunAdjudication,
} from './timedSessionAdjudication'

describe('driver-independent timed-session adjudication', () => {
  it('keeps offline run keys and base thresholds explicit', () => {
    const runKey = 'adjudication:run-lap:Q1:driver:2'
    const result = offlineQualifyingRunAdjudication(runKey)
    const expectedAborted = hashChance(`${runKey}:abort`) < 0.012

    expect(result).toEqual({
      aborted: expectedAborted,
      deleted:
        !expectedAborted &&
        hashChance(`${runKey}:track-limit`) < 0.008,
    })
  })

  it('keeps live timed-lap keys and base thresholds explicit', () => {
    const options = {
      completedTimedLap: 3,
      driverId: 'driver',
      seed: 'adjudication',
      segmentKey: 'Q2',
    }

    expect(liveTimedLapAdjudication(options)).toEqual({
      causedYellow:
        hashChance('adjudication:timed-yellow:Q2:driver:3') < 0.01,
      trackLimitDeleted:
        hashChance('adjudication:timed-track-limit:Q2:driver:3') < 0.018,
    })
  })

  it('keeps race track-limit context without a driver-ability input', () => {
    expect(trackLimitAdjudicationChance()).toBeCloseTo(0.026, 12)
    expect(
      trackLimitAdjudicationChance({
        pressure: 1,
        tireWearPercent: 100,
        trackGrip: 0,
        weather: 'heavy-rain',
      }),
    ).toBeCloseTo(0.116, 12)
    expect(
      lapHasTrackLimitWarning('adjudication', 'driver', 1),
    ).toBe(false)
    expect(
      lapHasTrackLimitWarning('adjudication', 'driver', 12),
    ).toBe(
      hashChance('adjudication:track-limit:driver:12') < 0.026,
    )
  })
})
