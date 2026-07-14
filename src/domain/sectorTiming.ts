import type { SectorTimingStatus, TimedRunPhase } from '../types'

// Samples come from the same immutable crossing records, so only floating-point
// noise should count as equal. A display-rounding tolerance can incorrectly
// paint several different drivers purple.
const TIMING_EPSILON_SECONDS = 1e-9

export function bestSectorTime(
  values: Array<number | null | undefined>,
): number | null {
  const finiteValues = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  )

  return finiteValues.length > 0 ? Math.min(...finiteValues) : null
}

export function isCurrentLapEligibleForBest(
  phase: TimedRunPhase | null,
): boolean {
  return phase === null || phase === 'attack-lap'
}

export function classifySectorTime(
  value: number | null,
  overallBest: number | null,
  personalBest: number | null,
): SectorTimingStatus {
  if (value === null || !Number.isFinite(value)) {
    return 'pending'
  }

  if (
    overallBest !== null &&
    Math.abs(value - overallBest) <= TIMING_EPSILON_SECONDS
  ) {
    return 'overall-best'
  }

  if (
    personalBest !== null &&
    Math.abs(value - personalBest) <= TIMING_EPSILON_SECONDS
  ) {
    return 'personal-best'
  }

  return 'slower'
}
