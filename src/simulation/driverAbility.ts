import type { Driver, DriverTunableStat } from '../types'

export const DRIVER_ABILITY_SCALE_MAX = 150
export const CURRENT_DRIVER_ABILITY_CEILING = DRIVER_ABILITY_SCALE_MAX
export const DRIVER_ABILITY_INTERNAL_MAX = DRIVER_ABILITY_SCALE_MAX / 100
export const DRIVER_ABILITY_INTERNAL_MIN = 0.55
export const DRIVER_PERFORMANCE_INTERNAL_MAX = 1
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

export const DRIVER_ABILITY_GROUPS = [
  {
    key: 'pace',
    label: 'Pace',
    stats: ['rawPace', 'qualifyingPace', 'racePace'],
  },
  {
    key: 'braking',
    label: 'Braking',
    stats: ['brakingSkill', 'precision'],
  },
  {
    key: 'cornering',
    label: 'Cornering',
    stats: [
      'lowSpeedCornerSkill',
      'mediumSpeedCornerSkill',
      'highSpeedCornerSkill',
    ],
  },
  {
    key: 'traction',
    label: 'Traction',
    stats: ['tractionControl', 'throttleControl'],
  },
  {
    key: 'tires',
    label: 'Tires',
    stats: ['tireManagement', 'tireWarmupSkill'],
  },
  {
    key: 'racecraft',
    label: 'Racecraft',
    stats: [
      'overtakingSkill',
      'defendingSkill',
      'racecraft',
      'trafficManagement',
      'dirtyAirManagement',
    ],
  },
  {
    key: 'wet',
    label: 'Wet',
    stats: ['wetSkill', 'intermediateSkill'],
  },
  {
    key: 'consistency',
    label: 'Consistency',
    stats: ['consistency', 'mistakeResistance', 'pressureHandling'],
  },
  {
    key: 'energy',
    label: 'Energy',
    stats: ['fuelManagement', 'ersManagement'],
  },
  {
    key: 'starts',
    label: 'Starts',
    stats: ['restartSkill', 'startSkill'],
  },
  {
    key: 'awareness',
    label: 'Awareness',
    stats: ['raceAwareness', 'adaptability'],
  },
  {
    key: 'car-feel',
    label: 'Car feel',
    stats: ['confidence', 'carBalanceAdaptation'],
  },
] as const satisfies readonly {
  key: string
  label: string
  stats: readonly DriverTunableStat[]
}[]

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

export function driverPerformanceValue(value: number): number {
  const rating = clampDriverAbility(value)
  const normalized =
    (rating - DRIVER_ABILITY_INTERNAL_MIN) /
    (DRIVER_ABILITY_INTERNAL_MAX - DRIVER_ABILITY_INTERNAL_MIN)

  return (
    DRIVER_ABILITY_INTERNAL_MIN +
    normalized *
      (DRIVER_PERFORMANCE_INTERNAL_MAX - DRIVER_ABILITY_INTERNAL_MIN)
  )
}

export function driverAbilityGroupValue(
  driver: Driver,
  stats: readonly DriverTunableStat[],
): number {
  if (stats.length === 0) {
    return DRIVER_ABILITY_INTERNAL_MIN
  }

  return (
    stats.reduce(
      (total, stat) => total + driverAbilityValue(driver, stat),
      0,
    ) / stats.length
  )
}

export function driverOverallAbility(driver: Driver): number {
  return (
    DRIVER_ABILITY_GROUPS.reduce(
      (total, group) =>
        total + driverAbilityGroupValue(driver, group.stats),
      0,
    ) / DRIVER_ABILITY_GROUPS.length
  )
}

export function driverOverallAbilityPoints(driver: Driver): number {
  return driverAbilityPoints(driverOverallAbility(driver))
}

export function driverConfiguredOverallAbilityPoints(driver: Driver): number {
  const configuredOverall = driver.performanceSource?.overall

  if (
    typeof configuredOverall !== 'number' ||
    !Number.isFinite(configuredOverall)
  ) {
    return driverOverallAbilityPoints(driver)
  }

  return Math.round(
    Math.min(DRIVER_ABILITY_SCALE_MAX, Math.max(0, configuredOverall)),
  )
}

/**
 * Converts the 55-150 editor scale into the 0.55-1.00 execution range used by
 * the physics and strategy models. A rating of 150 means ideal execution, not
 * 150% grip, power, tire life, or reliability.
 */
export function driverPerformanceAbility(
  driver: Driver,
  stat: DriverTunableStat,
): number {
  return driverPerformanceValue(driverAbilityValue(driver, stat))
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

    weighted += driverPerformanceAbility(driver, stat) * weight
    totalWeight += weight
  }

  return totalWeight > 0
    ? clampDriverAbility(weighted / totalWeight)
    : DRIVER_ABILITY_INTERNAL_MIN
}

export function driverAbilityDeficit(value: number): number {
  return Math.max(0, 1 - driverPerformanceValue(value))
}
