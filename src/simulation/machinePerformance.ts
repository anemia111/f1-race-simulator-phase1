const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Neutral competitive baseline used only by the simulation model. */
export const MACHINE_PERFORMANCE_REFERENCE = 0.86

/**
 * Retains every CSV ordering and specialty while reducing the field-wide gap.
 * Raw source ratings remain untouched for audit and UI display.
 */
export const MACHINE_PERFORMANCE_SPREAD_FACTOR = 0.7

export function effectiveMachineRating(value: number): number {
  return clamp(
    MACHINE_PERFORMANCE_REFERENCE +
      (value - MACHINE_PERFORMANCE_REFERENCE) *
        MACHINE_PERFORMANCE_SPREAD_FACTOR,
    0.45,
    1.05,
  )
}

/** Reliability compression improves weaker cars without making strong cars fail more. */
export function effectiveMachineReliability(value: number): number {
  return Math.max(value, effectiveMachineRating(value))
}
