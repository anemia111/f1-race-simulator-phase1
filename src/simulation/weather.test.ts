import { describe, expect, it } from 'vitest'
import {
  heatHazardMassIncreaseKgFor,
  heatIndexCFor,
  simulatedHumidityPercentFor,
} from './weather'

describe('2026 Heat Hazard', () => {
  it('uses air temperature below the NOAA regression range directly', () => {
    expect(heatIndexCFor(25, 75)).toBe(25)
  })

  it('produces a Heat Index above the 31C declaration threshold in hot humid air', () => {
    expect(heatIndexCFor(33, 70)).toBeGreaterThan(31)
  })

  it('applies C4.6 mass increases for the declared session and other sessions at the competition', () => {
    expect(
      heatHazardMassIncreaseKgFor({
        competitionDeclared: false,
        sessionDeclared: false,
      }),
    ).toBe(0)
    expect(
      heatHazardMassIncreaseKgFor({
        competitionDeclared: true,
        sessionDeclared: false,
      }),
    ).toBe(2)
    expect(
      heatHazardMassIncreaseKgFor({
        competitionDeclared: true,
        sessionDeclared: true,
      }),
    ).toBe(5)
  })

  it('raises humidity when rain reaches the circuit', () => {
    const track = { rainProbability: 0.3 }

    expect(simulatedHumidityPercentFor(track, 'light-rain')).toBeGreaterThan(
      simulatedHumidityPercentFor(track, 'clear'),
    )
  })
})

