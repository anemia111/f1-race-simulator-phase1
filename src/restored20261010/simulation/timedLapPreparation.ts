import type { TimedRunPhase, TrackDefinition } from '../types'
import { trackDynamicsAt } from './trackDynamics'

const launchStartCache = new WeakMap<TrackDefinition, number>()

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function nearestCenterlineProgress(
  track: TrackDefinition,
  position: [number, number, number],
) {
  let nearestIndex = 0
  let nearestDistanceSquared = Number.POSITIVE_INFINITY

  track.centerline.forEach((point, index) => {
    const dx = point[0] - position[0]
    const dz = point[2] - position[2]
    const distanceSquared = dx * dx + dz * dz

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared
      nearestIndex = index
    }
  })

  return nearestIndex / Math.max(1, track.centerline.length)
}

function inferredFinalCornerProgress(track: TrackDefinition) {
  const sampleCount = Math.max(120, track.centerline.length)
  let finalCornerProgress = 0.93
  let strongestLateCurvature = 0

  for (let index = Math.floor(sampleCount * 0.72); index < sampleCount; index += 1) {
    const progress = index / sampleCount
    const dynamics = trackDynamicsAt(track, progress)

    if (
      dynamics.curvature >= 0.07 &&
      (progress > finalCornerProgress ||
        dynamics.curvature > strongestLateCurvature * 1.35)
    ) {
      finalCornerProgress = progress
      strongestLateCurvature = dynamics.curvature
    }
  }

  return finalCornerProgress
}

/**
 * Start of the flying-lap launch. Timing still begins at the control line; this
 * only lets the driver commit to throttle and deployment from the final corner.
 */
export function timedLapLaunchStartProgress(track: TrackDefinition) {
  const cached = launchStartCache.get(track)

  if (cached !== undefined) {
    return cached
  }

  const finalCorner = track.corners?.slice().sort(
    (left, right) => right.number - left.number,
  )[0]
  const markedProgress = finalCorner
    ? nearestCenterlineProgress(track, finalCorner.position)
    : inferredFinalCornerProgress(track)
  const credibleMarkedProgress =
    markedProgress >= 0.7 && markedProgress < 0.999
      ? markedProgress
      : inferredFinalCornerProgress(track)
  const lapLengthMeters = Math.max(1, track.lengthKm * 1000)
  const minimumLaunchDistanceMeters = clamp(lapLengthMeters * 0.025, 90, 180)
  const latestUsefulStart = 1 - minimumLaunchDistanceMeters / lapLengthMeters
  const apexExitOffset = clamp(18 / lapLengthMeters, 0.0025, 0.006)
  const launchStart = clamp(
    Math.min(credibleMarkedProgress + apexExitOffset, latestUsefulStart),
    0.82,
    0.985,
  )

  launchStartCache.set(track, launchStart)
  return launchStart
}

export function timedLapLaunchBlend(
  track: TrackDefinition,
  progress: number,
  phase: TimedRunPhase | null,
) {
  if (phase !== 'out-lap') {
    return 0
  }

  const normalizedProgress = ((progress % 1) + 1) % 1
  const launchStart = timedLapLaunchStartProgress(track)

  if (normalizedProgress < launchStart) {
    return 0
  }

  const linear = clamp(
    (normalizedProgress - launchStart) / Math.max(0.001, 1 - launchStart),
    0,
    1,
  )

  return linear * linear * (3 - 2 * linear)
}
