import type { Driver, DriverTunableStat } from '../types'

export const DRIVER_ABILITY_SCALE_MAX = 100
/**
 * A rating may exceed the published scale. The scale itself stays at 100 so
 * every other driver's normalisation is untouched — raising the scale would
 * make the whole grid slower rather than one driver faster.
 */
export const DRIVER_ABILITY_LIMIT_BREAK_MAX = 120
export const CURRENT_DRIVER_ABILITY_CEILING = DRIVER_ABILITY_LIMIT_BREAK_MAX
export const DRIVER_ABILITY_INTERNAL_MAX = DRIVER_ABILITY_LIMIT_BREAK_MAX / 100
export const DRIVER_ABILITY_SCALE_INTERNAL_MAX = DRIVER_ABILITY_SCALE_MAX / 100
export const DRIVER_ABILITY_INTERNAL_MIN = 0
export const DRIVER_PERFORMANCE_INTERNAL_MIN = 0.55
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
    (DRIVER_ABILITY_SCALE_INTERNAL_MAX - DRIVER_ABILITY_INTERNAL_MIN)

  return (
    DRIVER_PERFORMANCE_INTERNAL_MIN +
    normalized *
      (DRIVER_PERFORMANCE_INTERNAL_MAX - DRIVER_PERFORMANCE_INTERNAL_MIN)
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

  // Bounded by the limit-break ceiling rather than the published scale, so a
  // rating deliberately placed past 100 is displayed as authored instead of
  // being shown as 100 while the physics uses the higher figure.
  return Math.round(
    Math.min(DRIVER_ABILITY_LIMIT_BREAK_MAX, Math.max(0, configuredOverall)),
  )
}

/**
 * Converts the 0-100 source/editor scale into the 0.55-1.00 execution range
 * used by the physics and strategy models. A rating of 100 means ideal
 * execution, not extra grip, power, tire life, or reliability.
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

/**
 * How far past the published scale a driver's rating sits, as a fraction of
 * the scale. Zero for every rating up to 100, 0.2 at 120.
 *
 * The quasi-steady reference lap deliberately gives away
 * `DRIVER_TRANSIENT_EFFICIENCY` worth of grip to yaw inertia, load-transfer
 * settling and steering corrections. A rating on the published scale can at
 * best execute that lap perfectly, which is why a driver at 100 already loses
 * nothing and cannot be made faster by raising the number. This fraction is
 * the only handle a rating above the scale has: it recovers part of what the
 * reference conceded, and nothing more.
 */
export function driverLimitBreakFraction(driver: Driver): number {
  const abilities = DRIVER_ABILITY_STATS.map((stat) => driver.skills[stat])
  const mean =
    abilities.reduce((total, value) => total + value, 0) / abilities.length

  return Math.max(0, mean - DRIVER_ABILITY_SCALE_INTERNAL_MAX)
}
