import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { DriverTunableStat } from '../types'
import {
  CURRENT_DRIVER_ABILITY_CEILING,
  DRIVER_ABILITY_GROUPS,
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_SCALE_MAX,
  DRIVER_ABILITY_STATS,
  DRIVER_PERFORMANCE_INTERNAL_MAX,
  clampDriverAbility,
  driverAbilityGroupValue,
  driverAbilityPoints,
  driverAbilityValue,
  driverConfiguredOverallAbilityPoints,
  driverOverallAbility,
  driverOverallAbilityPoints,
  driverPerformanceAbility,
  driverPerformanceValue,
} from './driverAbility'

const driverStats: DriverTunableStat[] = [...DRIVER_ABILITY_STATS]

describe('driver ability scale', () => {
  it('uses the specification-wide 0-100 source and editor scale', () => {
    expect(DRIVER_ABILITY_SCALE_MAX).toBe(100)
    expect(DRIVER_ABILITY_INTERNAL_MAX).toBe(1)
    expect(clampDriverAbility(2)).toBe(1)
    expect(driverAbilityPoints(1)).toBe(100)
    expect(DRIVER_PERFORMANCE_INTERNAL_MAX).toBe(1)
    expect(driverPerformanceValue(0)).toBe(0.55)
    expect(driverPerformanceValue(0.55)).toBeCloseTo(0.7975, 10)
    expect(driverPerformanceValue(1)).toBe(1)
  })

  it('keeps every CSV-configured driver within the supported scale', () => {
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

  it('groups all 30 detailed skills exactly once into 12 editable abilities', () => {
    const groupedStats = DRIVER_ABILITY_GROUPS.flatMap((group) => group.stats)

    expect(DRIVER_ABILITY_GROUPS).toHaveLength(12)
    expect(groupedStats).toHaveLength(30)
    expect(new Set(groupedStats).size).toBe(30)
    expect([...groupedStats].sort()).toEqual([...driverStats].sort())
  })

  it('uses the equal-weight mean of the 12 displayed groups as overall ability', () => {
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
      DRIVER_ABILITY_GROUPS.reduce(
        (total, group) =>
          total + driverAbilityGroupValue(driver, group.stats),
        0,
      ) / DRIVER_ABILITY_GROUPS.length

    expect(driverStats).toHaveLength(30)
    expect(driverOverallAbility(driver)).toBeCloseTo(expectedMean, 10)
    expect(driverOverallAbilityPoints(driver)).toBe(
      Math.round(expectedMean * 100),
    )
  })

  it('keeps the configured CSV overall separate from the skill mean', () => {
    const max = initialDrivers.find((driver) => driver.code === 'VER')!
    const withoutSource = { ...max, performanceSource: undefined }

    expect(driverConfiguredOverallAbilityPoints(max)).toBe(98)
    expect(driverOverallAbilityPoints(max)).toBeGreaterThanOrEqual(98)
    expect(driverConfiguredOverallAbilityPoints(withoutSource)).toBe(
      driverOverallAbilityPoints(withoutSource),
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
