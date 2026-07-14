import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { DriverTunableStat } from '../types'
import {
  CURRENT_DRIVER_ABILITY_CEILING,
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_SCALE_MAX,
  clampDriverAbility,
  driverAbilityPoints,
  driverAbilityValue,
} from './driverAbility'

const driverStats: DriverTunableStat[] = [
  'speed',
  'consistency',
  'tireManagement',
  'overtaking',
  'defense',
  'wetSkill',
]

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
    }
  })
})
