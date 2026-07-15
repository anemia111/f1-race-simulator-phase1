import type { Driver, DriverTunableStat } from '../types'

export const DRIVER_ABILITY_SCALE_MAX = 150
export const CURRENT_DRIVER_ABILITY_CEILING = 100
export const DRIVER_ABILITY_INTERNAL_MAX = DRIVER_ABILITY_SCALE_MAX / 100
export const DRIVER_ABILITY_INTERNAL_MIN = 0.55
export const DRIVER_ABILITY_STATS = [
  'rawPace',
  'qualifyingPace',
  'racePace',
  'brakingSkill',
  'lowSpeedCornerSkill',
  'mediumSpeedCornerSkill',
  'highSpeedCornerSkill',
  'tractionControl',
  'throttleControl',
  'tireManagement',
  'tireWarmupSkill',
  'wetSkill',
  'intermediateSkill',
  'overtakingSkill',
  'defendingSkill',
  'racecraft',
  'consistency',
  'mistakeResistance',
  'pressureHandling',
  'trafficManagement',
  'dirtyAirManagement',
  'fuelManagement',
  'ersManagement',
  'restartSkill',
  'startSkill',
  'confidence',
  'precision',
  'adaptability',
  'raceAwareness',
  'carBalanceAdaptation',
] as const satisfies readonly DriverTunableStat[]

export function clampDriverAbility(value: number): number {
  return Math.min(
    DRIVER_ABILITY_INTERNAL_MAX,
    Math.max(DRIVER_ABILITY_INTERNAL_MIN, value),
  )
}

export function driverAbilityPoints(value: number): number {
  return Math.round(clampDriverAbility(value) * 100)
}

export function driverAbilityValue(
  driver: Driver,
  stat: DriverTunableStat,
): number {
  return clampDriverAbility(driver.skills[stat])
}

export function driverOverallAbility(driver: Driver): number {
  return (
    DRIVER_ABILITY_STATS.reduce(
      (total, stat) => total + driverAbilityValue(driver, stat),
      0,
    ) / DRIVER_ABILITY_STATS.length
  )
}

export function driverOverallAbilityPoints(driver: Driver): number {
  return driverAbilityPoints(driverOverallAbility(driver))
}

/**
 * Kept as the call-site API for domain skills. It deliberately returns only
 * the requested skill: the OVR mean is display-only and never becomes a
 * hidden all-purpose driver rating.
 */
export function driverPerformanceAbility(
  driver: Driver,
  stat: DriverTunableStat,
): number {
  return driverAbilityValue(driver, stat)
}

export function driverSkillBlend(
  driver: Driver,
  weights: Partial<Record<DriverTunableStat, number>>,
) {
  let weighted = 0
  let totalWeight = 0

  for (const [stat, weight] of Object.entries(weights) as Array<
    [DriverTunableStat, number]
  >) {
    if (weight <= 0) {
      continue
    }

    weighted += driverAbilityValue(driver, stat) * weight
    totalWeight += weight
  }

  return totalWeight > 0
    ? clampDriverAbility(weighted / totalWeight)
    : DRIVER_ABILITY_INTERNAL_MIN
}

export function driverAbilityDeficit(value: number): number {
  return Math.max(0, 1 - Math.min(1, clampDriverAbility(value)))
}
