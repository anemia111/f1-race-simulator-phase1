import type {
  CarSetup,
  Driver,
  RaceConfig,
  TrackDefinition,
  WeekendStage,
} from '../types'
import { driverPerformanceAbility } from './driverAbility'
import { hashChance } from './random'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const defaultCarSetup: CarSetup = {
  frontWing: 6,
  rearWing: 6,
  rideHeightMm: 30,
  brakeBiasPercent: 56,
  differentialPercent: 55,
  coolingPercent: 50,
}

export function normalizeCarSetup(setup: CarSetup): CarSetup {
  return {
    frontWing: clamp(Math.round(setup.frontWing), 1, 10),
    rearWing: clamp(Math.round(setup.rearWing), 1, 10),
    rideHeightMm: clamp(Math.round(setup.rideHeightMm), 20, 45),
    brakeBiasPercent: clamp(setup.brakeBiasPercent, 52, 60),
    differentialPercent: clamp(Math.round(setup.differentialPercent), 35, 75),
    coolingPercent: clamp(Math.round(setup.coolingPercent), 25, 90),
  }
}

export function idealSetupForTrack(track: TrackDefinition): CarSetup {
  if (track.id === 'las-vegas-approx') {
    return {
      frontWing: 1,
      rearWing: 1,
      rideHeightMm: 24,
      brakeBiasPercent: 56.5,
      differentialPercent: 60,
      coolingPercent: 44,
    }
  }

  if (track.id === 'monza-approx') {
    return {
      frontWing: 2,
      rearWing: 2,
      rideHeightMm: 26,
      brakeBiasPercent: 56.5,
      differentialPercent: 58,
      coolingPercent: 55,
    }
  }

  if (track.kind === 'street') {
    return {
      frontWing: 8,
      rearWing: 9,
      rideHeightMm: 36,
      brakeBiasPercent: 55.5,
      differentialPercent: 48,
      coolingPercent: 66,
    }
  }

  if (track.kind === 'hybrid') {
    return {
      frontWing: 5,
      rearWing: 5,
      rideHeightMm: 29,
      brakeBiasPercent: 56.5,
      differentialPercent: 57,
      coolingPercent: 52,
    }
  }

  return {
    frontWing: 7,
    rearWing: 7,
    rideHeightMm: 30,
    brakeBiasPercent: 56,
    differentialPercent: 52,
    coolingPercent: 55,
  }
}

/**
 * Teams arrive with a circuit-specific simulator baseline, then refine it in
 * practice. This prevents a generic high-downforce setup from being carried
 * into Las Vegas while preserving a measurable FP setup gain.
 */
export function baselineSetupForTrack(track?: TrackDefinition): CarSetup {
  if (!track) {
    return { ...defaultCarSetup }
  }

  if (track.id === 'las-vegas-approx') {
    return normalizeCarSetup({
      frontWing: 1,
      rearWing: 1,
      rideHeightMm: 24,
      brakeBiasPercent: 56.5,
      differentialPercent: 60,
      coolingPercent: 44,
    })
  }

  const ideal = idealSetupForTrack(track)
  const priorKnowledge = 0.68
  const approach = (from: number, to: number) =>
    from + (to - from) * priorKnowledge

  return normalizeCarSetup({
    frontWing: approach(defaultCarSetup.frontWing, ideal.frontWing),
    rearWing: approach(defaultCarSetup.rearWing, ideal.rearWing),
    rideHeightMm: approach(
      defaultCarSetup.rideHeightMm,
      ideal.rideHeightMm,
    ),
    brakeBiasPercent: approach(
      defaultCarSetup.brakeBiasPercent,
      ideal.brakeBiasPercent,
    ),
    differentialPercent: approach(
      defaultCarSetup.differentialPercent,
      ideal.differentialPercent,
    ),
    coolingPercent: approach(
      defaultCarSetup.coolingPercent,
      ideal.coolingPercent,
    ),
  })
}

function setupDistance(left: CarSetup, right: CarSetup) {
  return (
    Math.abs(left.frontWing - right.frontWing) / 9 +
    Math.abs(left.rearWing - right.rearWing) / 9 +
    Math.abs(left.rideHeightMm - right.rideHeightMm) / 25 +
    Math.abs(left.brakeBiasPercent - right.brakeBiasPercent) / 8 +
    Math.abs(left.differentialPercent - right.differentialPercent) / 40 +
    Math.abs(left.coolingPercent - right.coolingPercent) / 65
  ) / 6
}

export function setupPaceDeltaSeconds(track: TrackDefinition, setup: CarSetup) {
  return clamp(setupDistance(normalizeCarSetup(setup), idealSetupForTrack(track)) * 2.4, 0, 2.4)
}

/**
 * How good a driver is at feeding back to the engineers and dialling the car in
 * — a blend of car-balance feel and adaptability. Drives how complete a setup a
 * driver reaches in practice and how much they extract from it in one lap.
 */
export function driverSetupFeedback(driver: Driver): number {
  return clamp(
    driverPerformanceAbility(driver, 'carBalanceAdaptation') * 0.6 +
      driverPerformanceAbility(driver, 'adaptability') * 0.4,
    0,
    1,
  )
}

/**
 * Setup completeness on a 0-100% scale: how close the car is to its ideal
 * setup, lifted by the driver's feedback ability. 100% is a perfectly dialled
 * car in the hands of a driver who nails the balance.
 */
export function setupCompletenessPercent(
  track: TrackDefinition,
  setup: CarSetup,
  driver: Driver,
): number {
  const setupState =
    1 - clamp(setupDistance(normalizeCarSetup(setup), idealSetupForTrack(track)), 0, 1)
  const feedback = driverSetupFeedback(driver)

  return Math.round(clamp(setupState * 80 + feedback * 20, 0, 100))
}

// Peak lap time a fully unresolved setup costs in qualifying — a single
// flat-out lap, so an imperfect balance bites hard. The race already prices
// setup through setupPaceDeltaSeconds over the stint.
const QUALIFYING_SETUP_MAX_SECONDS = 1.1

/** Qualifying single-lap penalty from an incomplete setup. */
export function qualifyingSetupPenaltySeconds(
  track: TrackDefinition,
  setup: CarSetup,
  driver: Driver,
): number {
  const completeness = setupCompletenessPercent(track, setup, driver)

  return clamp((1 - completeness / 100) * QUALIFYING_SETUP_MAX_SECONDS, 0, QUALIFYING_SETUP_MAX_SECONDS)
}

export function practiceSetupRecommendation(options: {
  config: RaceConfig
  driver: Driver
  lapsCompleted: number
  setupScore: number
  stage: Extract<WeekendStage, 'fp1' | 'fp2' | 'fp3'>
}) {
  const { config, driver, lapsCompleted, setupScore, stage } = options
  const ideal = idealSetupForTrack(config.track)
  const current =
    config.weekendContext?.setupByDriver?.[driver.id] ?? defaultCarSetup
  const stageFactor = stage === 'fp1' ? 0.48 : stage === 'fp2' ? 0.7 : 0.86
  // A driver who feeds back well converges the setup toward the ideal faster.
  const feedback = driverSetupFeedback(driver)
  const confidence = clamp(
    lapsCompleted / 28 * 0.57 +
      setupScore / 100 * 0.25 +
      stageFactor * 0.1 +
      feedback * 0.08,
    0.18,
    0.96,
  )
  const noise = (key: string, range: number) =>
    (hashChance(`${config.seed}:${stage}:${driver.id}:setup:${key}`) - 0.5) *
    range *
    (1 - confidence)
  const approach = (from: number, to: number, key: string, range: number) =>
    from + (to - from) * stageFactor * confidence + noise(key, range)
  const recommendation = normalizeCarSetup({
    frontWing: approach(current.frontWing, ideal.frontWing, 'fw', 3),
    rearWing: approach(current.rearWing, ideal.rearWing, 'rw', 3),
    rideHeightMm: approach(current.rideHeightMm, ideal.rideHeightMm, 'rh', 6),
    brakeBiasPercent: approach(
      current.brakeBiasPercent,
      ideal.brakeBiasPercent,
      'bb',
      1.5,
    ),
    differentialPercent: approach(
      current.differentialPercent,
      ideal.differentialPercent,
      'diff',
      10,
    ),
    coolingPercent: approach(
      current.coolingPercent,
      ideal.coolingPercent,
      'cool',
      12,
    ),
  })

  return { confidence, recommendation }
}
