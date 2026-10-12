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
  driverLimitBreakFraction,
  driverOverallAbility,
  driverOverallAbilityPoints,
  driverPerformanceAbility,
  driverPerformanceValue,
  driverPublishedAbilityValue,
  driverSkillBlend,
  f1DriverTyreEnvelopeUtilisation,
} from './driverAbility'

const driverStats: DriverTunableStat[] = [...DRIVER_ABILITY_STATS]

describe('driver ability scale', () => {
  it('leaves force execution headroom through 120 without exceeding the tyre envelope', () => {
    const values = [0, 0.95, 1, 1.1, 1.2].map(f1DriverTyreEnvelopeUtilisation)
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
    expect(values.at(-1)).toBe(1)
    expect(f1DriverTyreEnvelopeUtilisation(2)).toBe(1)
    expect(f1DriverTyreEnvelopeUtilisation(1)).toBeCloseTo(0.97)
    expect(f1DriverTyreEnvelopeUtilisation(-1)).toBe(0.82)
  })
  it('uses the specification-wide 0-100 source and editor scale', () => {
    // The published scale is unchanged. Only the ceiling a rating may be
    // authored past moves, so every driver on the scale normalises exactly as
    // before. Named execution consumers also retain the authored excess.
    expect(DRIVER_ABILITY_SCALE_MAX).toBe(100)
    expect(DRIVER_ABILITY_INTERNAL_MAX).toBe(1.2)
    expect(clampDriverAbility(2)).toBe(1.2)
    expect(clampDriverAbility(1)).toBe(1)
    expect(driverAbilityPoints(1)).toBe(100)
    expect(DRIVER_PERFORMANCE_INTERNAL_MAX).toBeCloseTo(1.09)
    expect(driverPerformanceValue(0)).toBe(0.55)
    expect(driverPerformanceValue(0.55)).toBeCloseTo(0.7975, 10)
    expect(driverPerformanceValue(1)).toBe(1)
    expect(driverPerformanceValue(1.1)).toBeCloseTo(1.045)
    expect(driverPerformanceValue(1.2)).toBeCloseTo(1.09)
    expect(driverPerformanceValue(2)).toBe(driverPerformanceValue(1.2))
  })

  it('retains ratings through 120 in named runtime consumers', () => {
    const atScale = {
      ...initialDrivers[0],
      skills: Object.fromEntries(driverStats.map((stat) => [stat, 1])) as Record<
        DriverTunableStat,
        number
      >,
    }
    const limitBreak = {
      ...atScale,
      skills: Object.fromEntries(
        driverStats.map((stat) => [stat, 1.2]),
      ) as Record<DriverTunableStat, number>,
    }

    expect(driverPerformanceAbility(limitBreak, 'rawPace')).toBeGreaterThan(
      driverPerformanceAbility(atScale, 'rawPace'),
    )
    expect(driverPublishedAbilityValue(limitBreak, 'tireManagement')).toBeGreaterThan(
      driverPublishedAbilityValue(atScale, 'tireManagement'),
    )
    expect(
      driverSkillBlend(limitBreak, { rawPace: 0.4, raceAwareness: 0.6 }),
    ).toBeGreaterThan(driverSkillBlend(atScale, { rawPace: 0.4, raceAwareness: 0.6 }))
    expect(driverLimitBreakFraction(atScale)).toBe(0)
    expect(driverLimitBreakFraction(limitBreak)).toBeCloseTo(0.2, 10)
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

  it('reads the configured CSV overall and falls back to the skill mean', () => {
    const max = initialDrivers.find((driver) => driver.code === 'VER')!
    const withoutSource = { ...max, performanceSource: undefined }

    expect(driverConfiguredOverallAbilityPoints(max)).toBe(95)
    expect(driverOverallAbilityPoints(max)).toBe(95)
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
