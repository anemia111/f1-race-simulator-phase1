/**
 * Shared timing display helpers. The timing tower, race analysis, and pit wall
 * all read the same measured values, so they must render them identically
 * instead of each keeping a private formatter.
 */

/** Placeholder for a value the simulation has not measured yet. */
export const UNMEASURED_LAP_TIME = '--:--.---'
/** Placeholder for an unmeasured sector or mini-sector interval. */
export const UNMEASURED_SECTOR_TIME = '--.---'

export function formatLapTime(seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return UNMEASURED_LAP_TIME
  }

  const minutes = Math.floor(seconds / 60)
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remaining}`
}

export function formatSectorTime(seconds: number | null | undefined) {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? seconds.toFixed(3)
    : UNMEASURED_SECTOR_TIME
}

export function formatSignedSeconds(
  seconds: number | null | undefined,
  fractionDigits = 1,
) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return '--'
  }

  return `${seconds >= 0 ? '+' : ''}${seconds.toFixed(fractionDigits)}s`
}
