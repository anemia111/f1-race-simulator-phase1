import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { DriverTunableStat } from '../types'
import {
  CURRENT_DRIVER_ABILITY_CEILING,
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_SCALE_MAX,
  DRIVER_ABILITY_STATS,
  clampDriverAbility,
  driverAbilityPoints,
  driverAbilityValue,
  driverOverallAbility,
  driverOverallAbilityPoints,
  driverPerformanceAbility,
} from './driverAbility'

const driverStats: DriverTunableStat[] = [...DRIVER_ABILITY_STATS]

describe('driver ability scale', () => {
  it('supports a 150-point ceiling', () => {
    expect(DRIVER_ABILITY_SCALE_MAX).toBe(150)
    expect(DRIVER_ABILITY_INTERNAL_MAX).toBe(1.5)
    expect(clampDriverAbility(2)).toBe(1.5)
    expect(driverAbilityPoints(1.5)).toBe(150)
  })

  it('keeps every configured 2026 driver at or below 100', () => {
    for (const driver of initialDrivers) {
      for (const stat of driverStats) {
        expect(driverAbilityPoints(driverAbilityValue(driver, stat))).toBeLessThanOrEqual(
          CURRENT_DRIVER_ABILITY_CEILING,
        )
      }
      expect(driverOverallAbilityPoints(driver)).toBeLessThanOrEqual(
        CURRENT_DRIVER_ABILITY_CEILING,
      )
    }
  })

  it('uses the arithmetic mean of all 12 attributes as overall ability', () => {
    const driver = {
      ...initialDrivers[0],
      adaptability: 0.84,
      braking: 0.91,
      cornering: 0.93,
      defense: 0.86,
      overtaking: 0.92,
      qualifyingPace: 0.95,
      raceAwareness: 0.89,
      racePace: 0.9,
      starts: 0.88,
      wetSkill: 0.87,
    }
    const expectedMean =
      driverStats.reduce(
        (total, stat) => total + driverAbilityValue(driver, stat),
        0,
      ) / driverStats.length

    expect(driverStats).toHaveLength(12)
    expect(driverOverallAbility(driver)).toBeCloseTo(expectedMean, 10)
    expect(driverOverallAbilityPoints(driver)).toBe(
      Math.round(expectedMean * 100),
    )
  })

  it('blends the overall rating into each domain performance value', () => {
    const balanced = {
      ...initialDrivers[0],
      qualifyingPace: 0.9,
    }
    const strongerAcrossField = {
      ...balanced,
      adaptability: 1,
      braking: 1,
      cornering: 1,
      defense: 1,
      overtaking: 1,
      raceAwareness: 1,
      racePace: 1,
      starts: 1,
      wetSkill: 1,
    }

    expect(driverAbilityValue(strongerAcrossField, 'qualifyingPace')).toBe(
      driverAbilityValue(balanced, 'qualifyingPace'),
    )
    expect(
      driverPerformanceAbility(strongerAcrossField, 'qualifyingPace'),
    ).toBeGreaterThan(driverPerformanceAbility(balanced, 'qualifyingPace'))
  })
})
