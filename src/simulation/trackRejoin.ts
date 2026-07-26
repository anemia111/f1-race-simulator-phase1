import type { CarSnapshot } from '../types'

// These are simulation safety margins, not fixed FIA timing thresholds. The
// sporting rule is that a driver may rejoin only when it is safe to do so.
export const REJOIN_MIN_AHEAD_GAP_SECONDS = 1.5
export const REJOIN_MIN_BEHIND_GAP_SECONDS = 3

export type TrackRejoinAssessment = {
  nearestAheadGapSeconds: number | null
  nearestBehindGapSeconds: number | null
  safe: boolean
}

function signedTrackDistance(from: number, to: number) {
  const raw = to - from

  return ((raw + 0.5) % 1 + 1) % 1 - 0.5
}

export function assessTrackRejoin(
  car: CarSnapshot,
  cars: CarSnapshot[],
  referenceLapTimeSeconds: number,
): TrackRejoinAssessment {
  const lapTime = Math.max(40, referenceLapTimeSeconds)
  let nearestAheadGapSeconds: number | null = null
  let nearestBehindGapSeconds: number | null = null

  for (const candidate of cars) {
    if (
      candidate.driverId === car.driverId ||
      candidate.status !== 'running' ||
      candidate.offTrackSinceSeconds != null
    ) {
      continue
    }

    const signedDistance = signedTrackDistance(
      car.totalDistance,
      candidate.totalDistance,
    )
    const gapSeconds = Math.abs(signedDistance) * lapTime

    if (Math.abs(signedDistance) < 1e-6) {
      nearestAheadGapSeconds = 0
      nearestBehindGapSeconds = 0
      continue
    }

    if (signedDistance > 0) {
      nearestAheadGapSeconds =
        nearestAheadGapSeconds === null
          ? gapSeconds
          : Math.min(nearestAheadGapSeconds, gapSeconds)
    } else {
      nearestBehindGapSeconds =
        nearestBehindGapSeconds === null
          ? gapSeconds
          : Math.min(nearestBehindGapSeconds, gapSeconds)
    }
  }

  return {
    nearestAheadGapSeconds,
    nearestBehindGapSeconds,
    safe:
      (nearestAheadGapSeconds === null ||
        nearestAheadGapSeconds >= REJOIN_MIN_AHEAD_GAP_SECONDS) &&
      (nearestBehindGapSeconds === null ||
        nearestBehindGapSeconds >= REJOIN_MIN_BEHIND_GAP_SECONDS),
  }
}

export function canRejoinTrack(
  car: CarSnapshot,
  cars: CarSnapshot[],
  elapsedSeconds: number,
  referenceLapTimeSeconds: number,
) {
  const offTrackSinceSeconds = car.offTrackSinceSeconds ?? null

  if (offTrackSinceSeconds === null) {
    return false
  }

  const eligibleAtSeconds =
    car.rejoinEligibleAtSeconds ?? offTrackSinceSeconds

  return (
    elapsedSeconds >= eligibleAtSeconds &&
    assessTrackRejoin(car, cars, referenceLapTimeSeconds).safe
  )
}
