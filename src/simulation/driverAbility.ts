import type { Driver, DriverTunableStat } from '../types'

export const DRIVER_ABILITY_SCALE_MAX = 150
export const CURRENT_DRIVER_ABILITY_CEILING = 100
export const DRIVER_ABILITY_INTERNAL_MAX = DRIVER_ABILITY_SCALE_MAX / 100
export const DRIVER_ABILITY_INTERNAL_MIN = 0.55
export const DRIVER_ABILITY_STATS = [
  'qualifyingPace',
  'racePace',
  'consistency',
  'tireManagement',
  'overtaking',
  'defense',
  'wetSkill',
  'starts',
  'braking',
  'cornering',
  'raceAwareness',
  'adaptability',
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
  switch (stat) {
    case 'qualifyingPace':
      return clampDriverAbility(
        driver.qualifyingPace ?? driver.speed * 0.78 + driver.consistency * 0.22,
      )
    case 'racePace':
      return clampDriverAbility(
        driver.racePace ??
          driver.speed * 0.55 +
            driver.consistency * 0.25 +
            driver.tireManagement * 0.2,
      )
    case 'overtaking':
      return clampDriverAbility(driver.overtaking ?? driver.speed)
    case 'defense':
      return clampDriverAbility(driver.defense ?? driver.consistency)
    case 'wetSkill':
      return clampDriverAbility(
        driver.wetSkill ??
          driver.consistency * 0.6 + driver.tireManagement * 0.4,
      )
    case 'starts':
      return clampDriverAbility(
        driver.starts ?? driver.speed * 0.55 + driver.consistency * 0.45,
      )
    case 'braking':
      return clampDriverAbility(
        driver.braking ?? driver.speed * 0.65 + driver.consistency * 0.35,
      )
    case 'cornering':
      return clampDriverAbility(
        driver.cornering ?? driver.speed * 0.78 + driver.consistency * 0.22,
      )
    case 'raceAwareness':
      return clampDriverAbility(
        driver.raceAwareness ??
          driver.consistency * 0.7 + driver.tireManagement * 0.3,
      )
    case 'adaptability': {
      const wetSkill =
        driver.wetSkill ??
        driver.consistency * 0.6 + driver.tireManagement * 0.4

      return clampDriverAbility(
        driver.adaptability ??
          driver.consistency * 0.45 + wetSkill * 0.3 + driver.speed * 0.25,
      )
    }
    default:
      return clampDriverAbility(driver[stat])
  }
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
 * Domain skills remain the main signal while the 12-stat average contributes
 * to every outcome, so a driver's displayed overall rating is not cosmetic.
 */
export function driverPerformanceAbility(
  driver: Driver,
  stat: DriverTunableStat,
): number {
  return clampDriverAbility(
    driverAbilityValue(driver, stat) * 0.72 + driverOverallAbility(driver) * 0.28,
  )
}

export function driverAbilityDeficit(value: number): number {
  return Math.max(0, 1 - clampDriverAbility(value))
}
