import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import {
  FIA_2026_REGULATION_PROFILE,
  compliesWithGrandPrixTireRule,
  maxRechargePerLapMjFor,
  nextLowGripCondition,
  sessionDistanceLapsFor,
  shouldDeclareRainHazard,
  sprintLapsFor,
} from './regulations'

describe('2026 session regulations', () => {
  const silverstone = tracks.find((track) => track.id === 'silverstone-approx')!

  it('uses the least full-lap Sprint distance above 100 km', () => {
    expect(sprintLapsFor(silverstone)).toBe(17)
    expect(sprintLapsFor(silverstone) * silverstone.lengthKm).toBeGreaterThan(100)
    expect(sessionDistanceLapsFor(silverstone, 'race')).toBe(52)
  })

  it('requires two dry specifications unless wet-weather tyres were used', () => {
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['M'] })).toBe(false)
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['M', 'H'] })).toBe(true)
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['S', 'I'] })).toBe(true)
  })

  it('pins public ERS limits to Technical Regulations Issue 19', () => {
    expect(FIA_2026_REGULATION_PROFILE.technical.issue).toBe('19')
    expect(FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw).toBe(350)
    expect(
      FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj,
    ).toBe(4)
    expect(maxRechargePerLapMjFor({ stage: 'race' })).toBe(8.5)
    expect(
      maxRechargePerLapMjFor({
        eventLimitMj: 6,
        stage: 'qualifying',
      }),
    ).toBe(6)
    expect(
      maxRechargePerLapMjFor({
        behindSafetyCar: true,
        eventLimitMj: 7,
        lowGripConditions: true,
        stage: 'race',
      }),
    ).toBe(Number.POSITIVE_INFINITY)
  })

  it('models Race Director grip declarations with drying hysteresis', () => {
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0,
        previous: false,
        trackGrip: 0.86,
        weather: 'light-rain',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.12,
        previous: true,
        trackGrip: 0.96,
        weather: 'clear',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.04,
        previous: true,
        trackGrip: 0.97,
        weather: 'clear',
      }),
    ).toBe(false)
  })

  it('declares Rain Hazard above the FIA 40 percent threshold', () => {
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.4,
        weather: 'clear',
      }),
    ).toBe(false)
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.401,
        weather: 'clear',
      }),
    ).toBe(true)
  })
})
