import { FIA_2026_REGULATION_PROFILE } from './regulations'

export type F1StandingStartMguKDecision = {
  positiveTorqueAllowed: boolean
  reason:
    | 'not-standing-start'
    | 'below-release-speed'
    | 'release-speed-reached'
    | 'release-latched'
    | 'secu-safety-exception'
  releaseLatched: boolean
}

/**
 * Resolves the C5.2.12 standing-start MGU-K positive-torque gate.
 *
 * Crossing the release speed is latched for that launch so a later reduction
 * below 50 km/h cannot re-arm the restriction. The low-power-start exception
 * represents an SECU safety intervention; it permits positive torque without
 * pretending the normal release threshold has been crossed.
 */
export function f1StandingStartMguKDecision(options: {
  releaseLatched: boolean
  secuSafetyExceptionActive: boolean
  speedKph: number
  standingStartActive: boolean
}): F1StandingStartMguKDecision {
  if (!options.standingStartActive) {
    return {
      positiveTorqueAllowed: true,
      reason: 'not-standing-start',
      releaseLatched: options.releaseLatched,
    }
  }

  if (options.releaseLatched) {
    return {
      positiveTorqueAllowed: true,
      reason: 'release-latched',
      releaseLatched: true,
    }
  }

  const speedKph = Number.isFinite(options.speedKph)
    ? Math.max(0, options.speedKph)
    : 0

  if (
    speedKph >=
    FIA_2026_REGULATION_PROFILE.energy.standingStartDeploymentMinKph
  ) {
    return {
      positiveTorqueAllowed: true,
      reason: 'release-speed-reached',
      releaseLatched: true,
    }
  }

  if (options.secuSafetyExceptionActive) {
    return {
      positiveTorqueAllowed: true,
      reason: 'secu-safety-exception',
      releaseLatched: false,
    }
  }

  return {
    positiveTorqueAllowed: false,
    reason: 'below-release-speed',
    releaseLatched: false,
  }
}
