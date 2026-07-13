import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import {
  compliesWithGrandPrixTireRule,
  sessionDistanceLapsFor,
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
})

