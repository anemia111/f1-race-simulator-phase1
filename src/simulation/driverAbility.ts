import type { Driver, DriverTunableStat } from '../types'

export const DRIVER_ABILITY_SCALE_MAX = 150
export const CURRENT_DRIVER_ABILITY_CEILING = 100
export const DRIVER_ABILITY_INTERNAL_MAX = DRIVER_ABILITY_SCALE_MAX / 100
export const DRIVER_ABILITY_INTERNAL_MIN = 0.55

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
    case 'overtaking':
      return driver.overtaking ?? driver.speed
    case 'defense':
      return driver.defense ?? driver.consistency
    case 'wetSkill':
      return (
        driver.wetSkill ??
        driver.consistency * 0.6 + driver.tireManagement * 0.4
      )
    default:
      return driver[stat]
  }
}

export function driverAbilityDeficit(value: number): number {
  return Math.max(0, 1 - clampDriverAbility(value))
}
