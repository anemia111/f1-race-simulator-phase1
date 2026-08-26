import { describe, expect, it } from 'vitest'
import { initialDrivers } from './grid2026'
import {
  expandedDriverSkills,
  type CompactDriverRatings,
} from './driverProfiles'
import {
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_STATS,
  driverPerformanceValue,
  driverSkillBlend,
} from '../simulation/driverAbility'
import { driverBehaviorTraits } from '../simulation/driverDecision'

const compactRatingKeys = [
  'adaptability',
  'consistency',
  'defending',
  'errorControl',
  'experience',
  'overtaking',
  'qualifyingPace',
  'racePace',
  'raceStart',
  'technicalFeedback',
  'tyreManagement',
  'wetSkill',
] as const satisfies readonly (keyof CompactDriverRatings)[]

function compactRatings(value: number): CompactDriverRatings {
  return Object.fromEntries(
    compactRatingKeys.map((key) => [key, value]),
  ) as CompactDriverRatings
}

describe('expanded driver skill construction', () => {
  it('is a non-negative row-normalized 12-to-30 expansion', () => {
    const zero = compactRatings(0)
    const coefficients = compactRatingKeys.map((source) => {
      const oneHot = { ...zero, [source]: 1 }
      return [source, expandedDriverSkills(oneHot)] as const
    })

    expect(compactRatingKeys).toHaveLength(12)
    expect(Object.keys(expandedDriverSkills(zero)).sort()).toEqual(
      [...DRIVER_ABILITY_STATS].sort(),
    )
    expect(DRIVER_ABILITY_STATS).toHaveLength(30)

    for (const target of DRIVER_ABILITY_STATS) {
      const targetCoefficients = coefficients.map(([, skills]) => skills[target])
      expect(targetCoefficients.every((coefficient) => coefficient >= 0)).toBe(
        true,
      )
      expect(
        targetCoefficients.reduce((sum, coefficient) => sum + coefficient, 0),
      ).toBeCloseTo(1, 10)
    }

    for (const [, skills] of coefficients) {
      expect(DRIVER_ABILITY_STATS.some((target) => skills[target] > 0)).toBe(
        true,
      )
    }
  })

  it('preserves equal inputs and stays within the compact source envelope', () => {
    for (const value of [0, 0.73, DRIVER_ABILITY_INTERNAL_MAX]) {
      const expanded = expandedDriverSkills(compactRatings(value))
      for (const target of DRIVER_ABILITY_STATS) {
        expect(expanded[target]).toBeCloseTo(value, 10)
      }
    }

    const mixed = Object.fromEntries(
      compactRatingKeys.map((key, index) => [
        key,
        (index / (compactRatingKeys.length - 1)) *
          DRIVER_ABILITY_INTERNAL_MAX,
      ]),
    ) as CompactDriverRatings
    const expanded = expandedDriverSkills(mixed)
    const sourceValues = Object.values(mixed)
    const sourceMin = Math.min(...sourceValues)
    const sourceMax = Math.max(...sourceValues)

    for (const target of DRIVER_ABILITY_STATS) {
      expect(expanded[target]).toBeGreaterThanOrEqual(sourceMin)
      expect(expanded[target]).toBeLessThanOrEqual(sourceMax)
    }
  })

  it('does not amplify equal values when expanded skills rejoin a blend', () => {
    const value = 0.73
    const driver = {
      ...initialDrivers[0],
      skills: expandedDriverSkills(compactRatings(value)),
    }
    const traits = driverBehaviorTraits(driver)

    expect(traits.brakingPrecision).toBeCloseTo(value, 10)
    expect(traits.racecraft).toBeCloseTo(value, 10)
    expect(
      driverSkillBlend(driver, {
        brakingSkill: 0.58,
        precision: 0.24,
        pressureHandling: 0.18,
      }),
    ).toBeCloseTo(driverPerformanceValue(value), 10)
  })
})
