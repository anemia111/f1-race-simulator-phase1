import { describe, expect, it } from 'vitest'
import {
  bestSectorTime,
  classifySectorTime,
  isCurrentLapEligibleForBest,
  latestTimingLapForSegment,
} from './sectorTiming'

describe('sector timing colors', () => {
  it('keeps unmeasured sectors gray', () => {
    expect(classifySectorTime(null, null, null)).toBe('pending')
  })

  it('prioritizes the overall best over a personal best', () => {
    expect(classifySectorTime(28.123, 28.123, 28.123)).toBe('overall-best')
  })

  it('marks a non-overall personal best green', () => {
    expect(classifySectorTime(28.456, 28.123, 28.456)).toBe('personal-best')
  })

  it('marks a slower completed sector yellow', () => {
    expect(classifySectorTime(28.9, 28.123, 28.456)).toBe('slower')
  })

  it('finds the fastest finite measured sample', () => {
    expect(bestSectorTime([null, 29.1, undefined, 28.4, 28.7])).toBe(28.4)
  })

  it('moves the provisional purple sector to a faster later finisher', () => {
    const firstTime = 29.4

    expect(classifySectorTime(firstTime, firstTime, firstTime)).toBe(
      'overall-best',
    )

    const laterFasterTime = 29.1
    const newOverallBest = bestSectorTime([firstTime, laterFasterTime])

    expect(classifySectorTime(firstTime, newOverallBest, firstTime)).toBe(
      'personal-best',
    )
    expect(
      classifySectorTime(laterFasterTime, newOverallBest, laterFasterTime),
    ).toBe('overall-best')
  })

  it('does not mark a merely rounded-equal split as overall best', () => {
    expect(classifySectorTime(28.1234, 28.1231, 28.1234)).toBe(
      'personal-best',
    )
  })

  it('only lets race and timed attack laps establish live bests', () => {
    expect(isCurrentLapEligibleForBest(null)).toBe(true)
    expect(isCurrentLapEligibleForBest('attack-lap')).toBe(true)
    expect(isCurrentLapEligibleForBest('out-lap')).toBe(false)
    expect(isCurrentLapEligibleForBest('in-lap')).toBe(false)
    expect(isCurrentLapEligibleForBest('cooldown')).toBe(false)
    expect(isCurrentLapEligibleForBest('garage')).toBe(false)
  })

  it('starts each qualifying segment from a clean timing sheet', () => {
    const q1Lap = {
      invalidReason: null,
      isValid: true,
      lap: 1,
      lapTimeSeconds: 90,
      pitStop: false,
      position: 1,
      sectors: [30, 30, 30] as [number, number, number],
      segment: 'Q1',
      tireRun: { ageLaps: 1, compound: 'S' as const, kind: 'f1-pirelli' as const },
      trackGrip: 1,
      weather: 'clear' as const,
    }
    const q2Lap = {
      ...q1Lap,
      lapTimeSeconds: 89,
      sectors: [29.5, 29.5, 30] as [number, number, number],
      segment: 'Q2',
    }

    expect(latestTimingLapForSegment([q1Lap], 'Q2')).toBeNull()
    expect(latestTimingLapForSegment([q1Lap, q2Lap], 'Q2')).toBe(q2Lap)
    expect(latestTimingLapForSegment([q1Lap, q2Lap], null)).toBe(q2Lap)
  })
})
