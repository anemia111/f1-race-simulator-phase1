// Tire compound model. Pure TypeScript, no rendering dependencies.
// Lap-time deltas are relative to a fresh Medium tire.

import type {
  DryCompoundFamily,
  TireCompound,
  TireNomination,
  WeatherState,
} from '../types'

export type TireCompoundSpec = {
  /** Lap-time offset of a fresh tire vs a fresh Medium (negative = faster). */
  offsetSeconds: number
  /** Linear wear cost per lap of age. */
  wearPerLapSeconds: number
  /** Age in laps where the performance cliff begins. */
  cliffLaps: number
  /** Extra cost per lap beyond the cliff. */
  cliffPerLapSeconds: number
}

export type TireCondition = {
  lifeRemainingPercent: number
  operatingState: 'cold' | 'window' | 'overheated'
  wearState: 'fresh' | 'used' | 'critical'
}

export type ObservedTireCalibration = {
  degradationPerLapSeconds?: number | null
  paceOffsetSeconds?: number | null
  sampleCount?: number
}

export const tireCompounds: Record<TireCompound, TireCompoundSpec> = {
  S: { offsetSeconds: -0.9, wearPerLapSeconds: 0.11, cliffLaps: 12, cliffPerLapSeconds: 0.44 },
  M: { offsetSeconds: 0, wearPerLapSeconds: 0.064, cliffLaps: 21, cliffPerLapSeconds: 0.34 },
  H: { offsetSeconds: 0.62, wearPerLapSeconds: 0.039, cliffLaps: 34, cliffPerLapSeconds: 0.27 },
  I: { offsetSeconds: 1.25, wearPerLapSeconds: 0.074, cliffLaps: 22, cliffPerLapSeconds: 0.33 },
  W: { offsetSeconds: 3.05, wearPerLapSeconds: 0.052, cliffLaps: 30, cliffPerLapSeconds: 0.26 },
}

export const dryCompoundFamilies: Record<DryCompoundFamily, TireCompoundSpec> = {
  C1: { offsetSeconds: 0.95, wearPerLapSeconds: 0.032, cliffLaps: 38, cliffPerLapSeconds: 0.24 },
  C2: { offsetSeconds: 0.48, wearPerLapSeconds: 0.044, cliffLaps: 31, cliffPerLapSeconds: 0.28 },
  C3: { offsetSeconds: 0, wearPerLapSeconds: 0.062, cliffLaps: 24, cliffPerLapSeconds: 0.33 },
  C4: { offsetSeconds: -0.48, wearPerLapSeconds: 0.086, cliffLaps: 17, cliffPerLapSeconds: 0.39 },
  C5: { offsetSeconds: -0.92, wearPerLapSeconds: 0.115, cliffLaps: 12, cliffPerLapSeconds: 0.46 },
}

function specFor(
  compound: TireCompound,
  nomination?: TireNomination,
): TireCompoundSpec {
  if (
    nomination &&
    (compound === 'H' || compound === 'M' || compound === 'S')
  ) {
    const selected = dryCompoundFamilies[nomination[compound]]
    const medium = dryCompoundFamilies[nomination.M]

    return {
      ...selected,
      // The circuit allocation changes which C-family is called S/M/H.
      // Keep the displayed Medium as the zero reference at every event.
      offsetSeconds: selected.offsetSeconds - medium.offsetSeconds,
    }
  }

  return tireCompounds[compound]
}

export function isWetCompound(compound: TireCompound): boolean {
  return compound === 'I' || compound === 'W'
}

export function isDryCompound(compound: TireCompound): boolean {
  return !isWetCompound(compound)
}

/**
 * Effective cliff for a driver: good tire management stretches the stint.
 * tireManagement 0.7 gives ~0.97x, 0.9 gives ~1.05x of the base cliff.
 */
export function effectiveCliffLaps(
  compound: TireCompound,
  tireManagement: number,
  nomination?: TireNomination,
): number {
  return specFor(compound, nomination).cliffLaps * (0.69 + tireManagement * 0.4)
}

/** Lap-time delta in seconds for a compound at a given age. */
export function tireDeltaSeconds(
  compound: TireCompound,
  ageLaps: number,
  tireManagement: number,
  weather: WeatherState = 'clear',
  trackGrip = 1,
  tireTemperatureC?: number,
  tireWearPercent = 0,
  nomination?: TireNomination,
  observed?: ObservedTireCalibration,
): number {
  const spec = specFor(compound, nomination)
  const sampleWeight = Math.min(0.55, Math.max(0, (observed?.sampleCount ?? 0) / 40))
  const observedWearPerLapSeconds = observed?.degradationPerLapSeconds
  const observedPaceOffsetSeconds = observed?.paceOffsetSeconds
  const wearPerLapSeconds =
    observedWearPerLapSeconds === null ||
    observedWearPerLapSeconds === undefined
      ? spec.wearPerLapSeconds
      : spec.wearPerLapSeconds * (1 - sampleWeight) +
        observedWearPerLapSeconds * sampleWeight
  const freshPaceOffset =
    observedPaceOffsetSeconds === null ||
    observedPaceOffsetSeconds === undefined
      ? spec.offsetSeconds
      : spec.offsetSeconds * (1 - sampleWeight) +
        observedPaceOffsetSeconds * sampleWeight
  // Better tire management shallows the wear slope.
  const wearFactor = 1.35 - tireManagement * 0.5
  const cliff = effectiveCliffLaps(compound, tireManagement, nomination)
  const beyondCliff = Math.max(0, ageLaps - cliff)
  const weatherPenalty = weatherTirePenalty(compound, weather, trackGrip)
  const targetTemperature = compound === 'W' ? 72 : compound === 'I' ? 82 : 98
  const thermalPenalty =
    tireTemperatureC === undefined
      ? 0
      : tireTemperatureC < targetTemperature - 13
        ? (targetTemperature - 13 - tireTemperatureC) * 0.055
        : tireTemperatureC > targetTemperature + 17
          ? (tireTemperatureC - targetTemperature - 17) * 0.075
          : 0
  const surfaceWearPenalty = Math.max(0, tireWearPercent - 55) * 0.018

  return (
    freshPaceOffset +
    wearPerLapSeconds * ageLaps * wearFactor +
    spec.cliffPerLapSeconds * beyondCliff +
    weatherPenalty +
    thermalPenalty +
    surfaceWearPenalty
  )
}

/** Estimated physical wear accumulated over one representative lap. */
export function tireWearPercentPerLap(
  compound: TireCompound,
  tireManagement: number,
  nomination?: TireNomination,
  observed?: ObservedTireCalibration,
): number {
  const spec = specFor(compound, nomination)
  const cliff = effectiveCliffLaps(compound, tireManagement, nomination)
  const baseWearPercent = 82 / Math.max(6, cliff)
  const observedWear = observed?.degradationPerLapSeconds
  const observedScale =
    observedWear === null || observedWear === undefined
      ? 1
      : Math.min(1.65, Math.max(0.55, observedWear / spec.wearPerLapSeconds))

  return baseWearPercent * observedScale
}

export function tireConditionFor(
  compound: TireCompound,
  ageLaps: number,
  tireManagement: number,
  tireTemperatureC: number,
  tireWearPercent = 0,
  nomination?: TireNomination,
): TireCondition {
  const cliff = effectiveCliffLaps(compound, tireManagement, nomination)
  const ageLifePercent = (1 - ageLaps / Math.max(1, cliff + 6)) * 100
  const lifeRemainingPercent = Math.round(
    Math.max(0, Math.min(100, ageLifePercent, 100 - tireWearPercent)),
  )
  const targetTemperature = compound === 'W' ? 72 : compound === 'I' ? 82 : 98
  const operatingState =
    tireTemperatureC < targetTemperature - 13
      ? 'cold'
      : tireTemperatureC > targetTemperature + 17
        ? 'overheated'
        : 'window'
  const wearState =
    ageLaps >= cliff || tireWearPercent >= 85
      ? 'critical'
      : ageLaps >= cliff * 0.58 || tireWearPercent >= 55
        ? 'used'
        : 'fresh'

  return { lifeRemainingPercent, operatingState, wearState }
}

export function weatherTirePenalty(
  compound: TireCompound,
  weather: WeatherState,
  trackGrip: number,
): number {
  const wetness = Math.max(0, Math.min(1, 1 - trackGrip))
  const fullWet = weather === 'heavy-rain' || trackGrip < 0.74
  const intermediateWet = weather === 'light-rain' || trackGrip < 0.93

  if (!fullWet && intermediateWet) {
    if (compound === 'I') {
      return -0.75
    }

    if (compound === 'W') {
      return wetness > 0.28 ? 0.35 : 2.2
    }

    return 1.2 + 13 * wetness
  }

  if (fullWet) {
    if (compound === 'W') {
      return -1.3
    }

    if (compound === 'I') {
      return 1.1 + wetness * 4.6
    }

    return 6 + 18 * wetness
  }

  if (compound === 'I') {
    return 2.8
  }

  if (compound === 'W') {
    return 6
  }

  return 0
}

/**
 * Compound choice for a stint of `remainingLaps`. `avoid` supports the
 * two-compound rule; `roll` (0..1, seed-derived) breaks ties so the field
 * does not converge on identical strategies.
 */
export function chooseCompound(
  remainingLaps: number,
  avoid: TireCompound | null,
  roll: number,
  weather: WeatherState = 'clear',
  trackGrip = 1,
): TireCompound {
  if (weather === 'heavy-rain' || trackGrip < 0.74) {
    return avoid === 'W' ? 'I' : 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    const preferred = trackGrip < 0.78 ? 'W' : 'I'
    const backup = preferred === 'W' ? 'I' : 'W'

    return avoid === preferred ? backup : preferred
  }

  const ranked: TireCompound[] =
    remainingLaps <= 12
      ? roll < 0.7
        ? ['S', 'M', 'H']
        : ['M', 'S', 'H']
      : remainingLaps <= 24
        ? roll < 0.6
          ? ['M', 'H', 'S']
          : ['H', 'M', 'S']
        : ['H', 'M', 'S']

  for (const compound of ranked) {
    if (compound !== avoid) {
      return compound
    }
  }

  return ranked[0]
}

export function compoundMatchesWeather(
  compound: TireCompound,
  weather: WeatherState,
  trackGrip: number,
): boolean {
  if (weather === 'heavy-rain' || trackGrip < 0.74) {
    return compound === 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return trackGrip < 0.78 ? compound === 'W' : compound === 'I'
  }

  return isDryCompound(compound)
}
