import type { CarSnapshot } from '../types'
import { incidentTrackStateForCar } from './incidentTraffic'

// These are simulation safety margins, not fixed FIA timing thresholds. The
// sporting rule is that a driver may rejoin only when it is safe to do so.
export const REJOIN_MIN_AHEAD_GAP_SECONDS = 1.5
export const REJOIN_MIN_BEHIND_GAP_SECONDS = 3
/**
 * A car never sits beside the circuit longer than this. Recovering from an
 * excursion takes a few seconds; waiting indefinitely for a gap strands the
 * car for a whole train of traffic and takes it out of the race by accident.
 */
export const REJOIN_MAX_WAIT_SECONDS = 5

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
      // Cars caught in the same incident do not hold each other up: a car
      // stopped off the circuit, or stranded on it, is not traffic to wait for.
      incidentTrackStateForCar(candidate) !== 'clear'
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

/**
 * A car rejoins as soon as nothing is closing on it — nothing within three
 * seconds behind — and in any case once it has been off the circuit for
 * `REJOIN_MAX_WAIT_SECONDS`.
 *
 * The opening lap is the exception. The field is still one bunch there, so
 * rejoining into it drops the car into a train of cars at full racing speed.
 * A car that goes off on the opening lap waits for the whole pack to go by and
 * rejoins at the back, with no time limit.
 *
 * Cars from the same incident are never counted as traffic, and a crashed car
 * that has dropped out of the pack is not part of the pack to wait for, so a
 * multi-car accident does not leave everyone waiting on each other.
 */
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

  const isOpeningLap = car.lap < 1

  if (
    !isOpeningLap &&
    elapsedSeconds >= offTrackSinceSeconds + REJOIN_MAX_WAIT_SECONDS
  ) {
    return true
  }

  const eligibleAtSeconds =
    car.rejoinEligibleAtSeconds ?? offTrackSinceSeconds

  if (elapsedSeconds < eligibleAtSeconds) {
    return false
  }

  const { nearestBehindGapSeconds } = assessTrackRejoin(
    car,
    cars,
    referenceLapTimeSeconds,
  )

  if (isOpeningLap) {
    return nearestBehindGapSeconds === null
  }

  return (
    nearestBehindGapSeconds === null ||
    nearestBehindGapSeconds >= REJOIN_MIN_BEHIND_GAP_SECONDS
  )
}
