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
  const adaptability = driverPerformanceAbility(driver, 'adaptability')
  const confidence = clamp(
    lapsCompleted / 28 * 0.57 +
      setupScore / 100 * 0.25 +
      stageFactor * 0.1 +
      adaptability * 0.08,
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
