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

  it('uses the arithmetic mean of all 30 skills as display ability', () => {
    const driver = {
      ...initialDrivers[0],
      skills: {
        ...initialDrivers[0].skills,
        adaptability: 0.84,
        brakingSkill: 0.91,
        defendingSkill: 0.86,
        highSpeedCornerSkill: 0.93,
        overtakingSkill: 0.92,
        qualifyingPace: 0.95,
        raceAwareness: 0.89,
        racePace: 0.9,
        startSkill: 0.88,
        wetSkill: 0.87,
      },
    }
    const expectedMean =
      driverStats.reduce(
        (total, stat) => total + driverAbilityValue(driver, stat),
        0,
      ) / driverStats.length

    expect(driverStats).toHaveLength(30)
    expect(driverOverallAbility(driver)).toBeCloseTo(expectedMean, 10)
    expect(driverOverallAbilityPoints(driver)).toBe(
      Math.round(expectedMean * 100),
    )
  })

  it('keeps domain performance independent from the display-only mean', () => {
    const balanced = {
      ...initialDrivers[0],
      skills: { ...initialDrivers[0].skills, qualifyingPace: 0.9 },
    }
    const strongerAcrossField = {
      ...balanced,
      skills: Object.fromEntries(
        Object.keys(balanced.skills).map((stat) => [
          stat,
          stat === 'qualifyingPace' ? 0.9 : 1,
        ]),
      ) as typeof balanced.skills,
    }

    expect(driverAbilityValue(strongerAcrossField, 'qualifyingPace')).toBe(
      driverAbilityValue(balanced, 'qualifyingPace'),
    )
    expect(
      driverPerformanceAbility(strongerAcrossField, 'qualifyingPace'),
    ).toBe(driverPerformanceAbility(balanced, 'qualifyingPace'))
  })
})
