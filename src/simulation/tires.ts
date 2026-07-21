// Tire compound model. Pure TypeScript, no rendering dependencies.
// Lap-time deltas are relative to a fresh Medium tire.

import type {
  DryCompoundFamily,
  RacePaceMode,
  TireCompound,
  TireNomination,
  TirePerformanceState,
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

export type TireTrackCondition = {
  dryingLine: number
  rainIntensityMmH: number
  surfaceWaterMm: number
}

export type TireDynamicState = {
  carcassTemperatureC: number
  grainingPercent: number
  overheatingPercent: number
  performanceState: TirePerformanceState
  surfaceTemperatureC: number
  thermalStressPercent: number
  wearPercent: number
}

export type TireThermalWear = {
  permanentStressPercentPerLap: number
  wearMultiplier: number
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

export const SLICK_WATER_MAX_MM = 0.8
export const INTERMEDIATE_WATER_MAX_MM = 3.4
export const WET_WATER_MIN_MM = 3.5

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

function dryFamilyFor(
  compound: TireCompound,
  nomination?: TireNomination,
) {
  return compound === 'H' || compound === 'M' || compound === 'S'
    ? nomination?.[compound] ?? ({ H: 'C2', M: 'C3', S: 'C4' } as const)[compound]
    : null
}

export function tireOperatingWindowFor(
  compound: TireCompound,
  nomination?: TireNomination,
) {
  if (compound === 'I') return { lowerC: 70, upperC: 98, targetC: 84 }
  if (compound === 'W') return { lowerC: 55, upperC: 86, targetC: 72 }

  const targetByFamily: Record<DryCompoundFamily, number> = {
    C1: 101,
    C2: 100,
    C3: 98,
    C4: 96,
    C5: 94,
  }
  const targetC = targetByFamily[dryFamilyFor(compound, nomination) ?? 'C3']

  return { lowerC: targetC - 13, upperC: targetC + 17, targetC }
}

/**
 * Segment-level mechanical and thermal wear. Exact carcass temperatures are
 * team-confidential, so this is a bounded model calibrated by the nominated
 * Pirelli C-family and any OpenF1 stint degradation available for the event.
 */
export function tireThermalWearForLap(options: {
  brakePercent: number
  compound: TireCompound
  curvature: number
  nomination?: TireNomination
  paceMode: RacePaceMode
  throttlePercent: number
  tireTemperatureC: number
  trackTemperatureC: number
  weather: WeatherState
  dryingLine?: number
  fuelLoadMultiplier?: number
  rainIntensityMmH?: number
  surfaceWaterMm?: number
}): TireThermalWear {
  const {
    brakePercent,
    compound,
    curvature,
    nomination,
    paceMode,
    throttlePercent,
    tireTemperatureC,
    trackTemperatureC,
    weather,
    dryingLine = weather === 'clear' ? 1 : 0,
    fuelLoadMultiplier = 1,
    rainIntensityMmH = 0,
    surfaceWaterMm = weather === 'heavy-rain' ? 2.2 : weather === 'light-rain' ? 0.55 : 0,
  } = options
  const window = tireOperatingWindowFor(compound, nomination)
  const overheatC = Math.max(0, tireTemperatureC - window.upperC)
  const coldC = Math.max(0, window.lowerC - tireTemperatureC)
  const paceFactor: Record<RacePaceMode, number> = {
    defend: 1.08,
    push: 1.22,
    save: 0.78,
    standard: 1,
  }
  const mechanicalDemand =
    (0.78 +
    curvature * 0.42 +
    (brakePercent / 100) * 0.14 +
    curvature * (throttlePercent / 100) * 0.16) * fuelLoadMultiplier
  const hotTrackLoad =
    weather === 'clear' ? Math.max(0, trackTemperatureC - 38) * 0.012 : 0
  const trackCondition = {
    dryingLine,
    rainIntensityMmH,
    surfaceWaterMm,
  }
  const coolingDeficit = wetTireCoolingDeficit(compound, trackCondition)
  const wetTyreUnderCooled = coolingDeficit > 0
  const dryWetTyreMultiplier =
    compound === 'W'
      ? 1 + coolingDeficit ** 1.35 * 6.8
      : compound === 'I'
        ? 1 + coolingDeficit ** 1.3 * 3.6
        : 1
  const effectiveWaterMm = effectiveLineWaterMm(trackCondition)
  const slickAquaplaningLoad =
    isDryCompound(compound) && effectiveWaterMm > 0.28
      ? 1 + Math.min(1.8, effectiveWaterMm ** 1.2 * 0.5)
      : 1
  const thermalMultiplier =
    1 +
    Math.min(1.2, overheatC * 0.055) +
    Math.min(0.28, coldC * 0.012) +
    Math.min(0.3, hotTrackLoad)
  const wearMultiplier = Math.min(
    9,
    Math.max(
      0.42,
      mechanicalDemand *
        paceFactor[paceMode] *
        thermalMultiplier *
        dryWetTyreMultiplier *
        slickAquaplaningLoad,
    ),
  )
  const permanentStressPercentPerLap = Math.min(
    wetTyreUnderCooled && compound === 'W' ? 5.2 : 2.4,
    (overheatC ** 1.16 * 0.03 + coldC ** 1.08 * 0.008) *
      mechanicalDemand *
      paceFactor[paceMode] *
      (wetTyreUnderCooled ? dryWetTyreMultiplier * 0.72 : 1),
  )

  return { permanentStressPercentPerLap, wearMultiplier }
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
  thermalStressPercent = 0,
  trackCondition?: TireTrackCondition,
  dynamicState?: Pick<
    TireDynamicState,
    'carcassTemperatureC' | 'grainingPercent' | 'overheatingPercent'
  >,
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
  const weatherPenalty = weatherTirePenalty(
    compound,
    weather,
    trackGrip,
    trackCondition,
  )
  const window = tireOperatingWindowFor(compound, nomination)
  const thermalPenalty =
    tireTemperatureC === undefined
      ? 0
      : tireTemperatureC < window.lowerC
        ? (window.lowerC - tireTemperatureC) * 0.055
        : tireTemperatureC > window.upperC
          ? (tireTemperatureC - window.upperC) * 0.075
          : 0
  const effectiveWearPercent = Math.min(
    100,
    tireWearPercent + thermalStressPercent,
  )
  const surfaceWearPenalty = Math.max(0, effectiveWearPercent - 55) * 0.018
  const carcassPenalty =
    dynamicState === undefined
      ? 0
      : dynamicState.carcassTemperatureC < window.lowerC - 7
        ? (window.lowerC - 7 - dynamicState.carcassTemperatureC) * 0.028
        : dynamicState.carcassTemperatureC > window.upperC + 5
          ? (dynamicState.carcassTemperatureC - window.upperC - 5) * 0.034
          : 0
  const grainingPenalty = (dynamicState?.grainingPercent ?? 0) * 0.025
  const overheatingPenalty = (dynamicState?.overheatingPercent ?? 0) * 0.032

  return (
    freshPaceOffset +
    wearPerLapSeconds * ageLaps * wearFactor +
    spec.cliffPerLapSeconds * beyondCliff +
    weatherPenalty +
    thermalPenalty +
    surfaceWearPenalty +
    carcassPenalty +
    grainingPenalty +
    overheatingPenalty
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
  const baseWearPercent = 56 / Math.max(6, cliff)
  const observedWear = observed?.degradationPerLapSeconds
  const observedScale =
    observedWear === null || observedWear === undefined
      ? 1
      : Math.min(1.65, Math.max(0.55, observedWear / spec.wearPerLapSeconds))

  return baseWearPercent * observedScale
}

export function advanceTireDynamicState(options: {
  baseWearPercentPerLap: number
  brakePercent: number
  compound: TireCompound
  current: TireDynamicState
  curvature: number
  deltaLaps: number
  deltaSeconds: number
  dryingLine: number
  fuelLoadMultiplier: number
  nomination?: TireNomination
  paceMode: RacePaceMode
  rainIntensityMmH: number
  surfaceTemperatureC: number
  surfaceWaterMm: number
  throttlePercent: number
  trackTemperatureC: number
  weather: WeatherState
}): TireDynamicState {
  const {
    baseWearPercentPerLap,
    brakePercent,
    compound,
    current,
    curvature,
    deltaLaps,
    deltaSeconds,
    dryingLine,
    fuelLoadMultiplier,
    nomination,
    paceMode,
    rainIntensityMmH,
    surfaceTemperatureC,
    surfaceWaterMm,
    throttlePercent,
    trackTemperatureC,
    weather,
  } = options
  const window = tireOperatingWindowFor(compound, nomination)
  const trackCondition = {
    dryingLine,
    rainIntensityMmH,
    surfaceWaterMm,
  }
  const lineWaterMm = effectiveLineWaterMm(trackCondition)
  const requiredCoolingWaterMm =
    compound === 'W'
      ? WET_WATER_MIN_MM
      : compound === 'I'
        ? SLICK_WATER_MAX_MM
        : 0
  const coolingDeficit = wetTireCoolingDeficit(compound, trackCondition)
  const coolingSurplusMm = Math.max(
    0,
    lineWaterMm - requiredCoolingWaterMm * 0.65,
  )
  const wetPatchCoolingC =
    compound === 'I' || compound === 'W'
      ? Math.min(8, coolingSurplusMm * 2)
      : 0
  const dryWetTyreHeatC =
    compound === 'W'
      ? 24 * coolingDeficit ** 1.22
      : compound === 'I'
        ? 12 * coolingDeficit ** 1.18
        : 0
  const resolvedSurfaceTemperatureC = Math.max(
    35,
    surfaceTemperatureC + dryWetTyreHeatC - wetPatchCoolingC,
  )
  const carcassTargetC =
    resolvedSurfaceTemperatureC * 0.76 + trackTemperatureC * 0.24
  const carcassResponse = 1 - Math.exp(-Math.max(0, deltaSeconds) * 0.038)
  const carcassTemperatureC =
    current.carcassTemperatureC +
    (carcassTargetC - current.carcassTemperatureC) * carcassResponse
  const coldSeverity = Math.max(0, window.lowerC - resolvedSurfaceTemperatureC)
  const hotSeverity = Math.max(0, resolvedSurfaceTemperatureC - window.upperC)
  const dampSlickGraining =
    isDryCompound(compound) && lineWaterMm > 0.08 && lineWaterMm < 0.55
      ? 18 + lineWaterMm * 34
      : 0
  const grainingTarget = Math.min(
    100,
    coldSeverity * 3.4 + dampSlickGraining + curvature * coldSeverity * 2.1,
  )
  const grainingResponse = Math.min(
    1,
    deltaLaps * (grainingTarget > current.grainingPercent ? 0.72 : 0.24),
  )
  const grainingPercent = Math.max(
    0,
    current.grainingPercent +
      (grainingTarget - current.grainingPercent) * grainingResponse,
  )
  const overheatingTarget = Math.min(
    100,
    hotSeverity * 4.1 + dryWetTyreHeatC * 3.2,
  )
  const overheatingResponse = Math.min(
    1,
    deltaLaps * (overheatingTarget > current.overheatingPercent ? 1.1 : 0.34),
  )
  const overheatingPercent = Math.max(
    0,
    current.overheatingPercent +
      (overheatingTarget - current.overheatingPercent) * overheatingResponse,
  )
  const thermalWear = tireThermalWearForLap({
    brakePercent,
    compound,
    curvature,
    dryingLine,
    fuelLoadMultiplier,
    nomination,
    paceMode,
    rainIntensityMmH,
    surfaceWaterMm,
    throttlePercent,
    tireTemperatureC: resolvedSurfaceTemperatureC,
    trackTemperatureC,
    weather,
  })
  const rainSlideWear =
    isDryCompound(compound) && lineWaterMm > 0.35
      ? 1 + Math.min(1.2, lineWaterMm * 0.42)
      : 1
  const wearPercent = Math.min(
    100,
    current.wearPercent +
      deltaLaps *
        baseWearPercentPerLap *
        thermalWear.wearMultiplier *
        rainSlideWear,
  )
  const thermalStressPercent = Math.min(
    100,
    current.thermalStressPercent +
      deltaLaps * thermalWear.permanentStressPercentPerLap,
  )
  const performanceState: TirePerformanceState =
    wearPercent + thermalStressPercent >= 88
      ? 'degraded'
      : overheatingPercent >= 34
        ? 'overheating'
        : grainingPercent >= 28
          ? 'graining'
          : coldSeverity >= 7
            ? 'cold'
            : 'optimal'

  return {
    carcassTemperatureC,
    grainingPercent,
    overheatingPercent,
    performanceState,
    surfaceTemperatureC: resolvedSurfaceTemperatureC,
    thermalStressPercent,
    wearPercent,
  }
}

export function tireConditionFor(
  compound: TireCompound,
  ageLaps: number,
  tireManagement: number,
  tireTemperatureC: number,
  tireWearPercent = 0,
  nomination?: TireNomination,
  thermalStressPercent = 0,
): TireCondition {
  const cliff = effectiveCliffLaps(compound, tireManagement, nomination)
  const ageLifePercent = (1 - ageLaps / Math.max(1, cliff + 6)) * 100
  const lifeRemainingPercent = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        ageLifePercent,
        100 - tireWearPercent - thermalStressPercent,
      ),
    ),
  )
  const window = tireOperatingWindowFor(compound, nomination)
  const operatingState =
    tireTemperatureC < window.lowerC
      ? 'cold'
      : tireTemperatureC > window.upperC
        ? 'overheated'
        : 'window'
  const effectiveWearPercent = tireWearPercent + thermalStressPercent
  const wearState =
    ageLaps >= cliff || effectiveWearPercent >= 85
      ? 'critical'
      : ageLaps >= cliff * 0.58 || effectiveWearPercent >= 55
        ? 'used'
        : 'fresh'

  return { lifeRemainingPercent, operatingState, wearState }
}

export function weatherTirePenalty(
  compound: TireCompound,
  weather: WeatherState,
  trackGrip: number,
  condition?: TireTrackCondition,
): number {
  if (condition) {
    return tireTrackPenaltySeconds(compound, condition)
  }

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

export function effectiveLineWaterMm(condition: TireTrackCondition) {
  return Math.max(
    0,
    condition.surfaceWaterMm *
      (1 - Math.min(1, Math.max(0, condition.dryingLine)) * 0.68) +
      condition.rainIntensityMmH * 0.015,
  )
}

export function wetTireCoolingDeficit(
  compound: TireCompound,
  condition: TireTrackCondition,
) {
  const requiredWaterMm =
    compound === 'W'
      ? WET_WATER_MIN_MM
      : compound === 'I'
        ? SLICK_WATER_MAX_MM
        : 0

  if (requiredWaterMm === 0) {
    return 0
  }

  return Math.min(
    1,
    Math.max(
      0,
      (requiredWaterMm - effectiveLineWaterMm(condition)) / requiredWaterMm,
    ),
  )
}

export function tireTrackPenaltySeconds(
  compound: TireCompound,
  condition: TireTrackCondition,
) {
  const waterMm = effectiveLineWaterMm(condition)
  const absoluteWaterPenalty =
    waterMm * 0.42 + Math.pow(waterMm, 1.35) * 0.12

  if (isDryCompound(compound)) {
    const crossoverLoss =
      Math.max(0, waterMm - SLICK_WATER_MAX_MM) * 5
    const aquaplaning =
      Math.max(0, waterMm - 1.4) ** 1.25 * 2.8

    return absoluteWaterPenalty + crossoverLoss + aquaplaning
  }

  if (compound === 'I') {
    const shallowWaterLoss =
      Math.max(0, SLICK_WATER_MAX_MM - waterMm) * 4
    const deepWaterLoss =
      Math.max(0, waterMm - INTERMEDIATE_WATER_MAX_MM) * 1.2

    return absoluteWaterPenalty + 0.04 + shallowWaterLoss + deepWaterLoss
  }

  const insufficientWaterLoss =
    Math.max(0, WET_WATER_MIN_MM - waterMm) * 2

  return absoluteWaterPenalty + 0.1 + insufficientWaterLoss
}

export function preferredTireCategoryFor(condition: TireTrackCondition) {
  const waterMm = effectiveLineWaterMm(condition)

  if (waterMm <= SLICK_WATER_MAX_MM) return 'M' satisfies TireCompound
  if (waterMm >= WET_WATER_MIN_MM) return 'W' satisfies TireCompound
  return 'I' satisfies TireCompound
}

/**
 * Water margin, in millimetres on the racing line, that a fitted tyre keeps
 * beyond its ideal range before a change is worth a stop.
 *
 * Water drifts back and forth across a threshold in unsettled rain. Judging the
 * fitted tyre by the same knife edge that picks a new one makes the call flip
 * every time it crosses, and a car pits again a few laps later to undo it. The
 * margin leaves a band where the tyre already on the car is simply left alone.
 */
export const TIRE_CROSSOVER_MARGIN_MM = 0.25

/**
 * Whether the tyre already fitted is good enough to stay out on, as opposed to
 * `preferredTireCategoryFor`, which picks the best tyre for a fresh set.
 */
export function compoundStillViable(
  compound: TireCompound,
  condition: TireTrackCondition,
): boolean {
  const waterMm = effectiveLineWaterMm(condition)

  if (isDryCompound(compound)) {
    return waterMm <= SLICK_WATER_MAX_MM + TIRE_CROSSOVER_MARGIN_MM
  }

  if (compound === 'I') {
    return (
      waterMm >= SLICK_WATER_MAX_MM - TIRE_CROSSOVER_MARGIN_MM &&
      waterMm <= WET_WATER_MIN_MM + TIRE_CROSSOVER_MARGIN_MM
    )
  }

  return waterMm >= WET_WATER_MIN_MM - TIRE_CROSSOVER_MARGIN_MM
}

export function tireTrackGripMultiplier(
  compound: TireCompound,
  condition: TireTrackCondition,
) {
  const preferred = preferredTireCategoryFor(condition)
  const preferredPenalty = tireTrackPenaltySeconds(preferred, condition)
  const mismatchPenalty = Math.max(
    0,
    tireTrackPenaltySeconds(compound, condition) - preferredPenalty,
  )

  return Math.min(1, Math.max(0.56, 1 - mismatchPenalty * 0.035))
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
  condition?: TireTrackCondition,
): TireCompound {
  const preferredCategory = condition
    ? preferredTireCategoryFor(condition)
    : null

  if (preferredCategory === 'W' || preferredCategory === 'I') {
    return preferredCategory
  }

  if (!condition && (weather === 'heavy-rain' || trackGrip < 0.74)) {
    return avoid === 'W' ? 'I' : 'W'
  }

  if (!condition && (weather === 'light-rain' || trackGrip < 0.93)) {
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
  condition?: TireTrackCondition,
): boolean {
  if (condition) {
    const preferred = preferredTireCategoryFor(condition)

    return preferred === 'M'
      ? isDryCompound(compound)
      : compound === preferred
  }

  if (weather === 'heavy-rain' || trackGrip < 0.74) {
    return compound === 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return trackGrip < 0.78 ? compound === 'W' : compound === 'I'
  }

  return isDryCompound(compound)
}
