import type { AeroActivationZone, TrackDefinition } from '../types'

/**
 * Straight detection over a surveyed centerline. It lives apart from the F1
 * track pool so the domestic support circuits can derive their 2026 activation
 * zones from their own geometry rather than carrying hand-written progress
 * values that no measurement backs.
 */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const pointDistance = (
  a: TrackDefinition['centerline'][number],
  b: TrackDefinition['centerline'][number],
) => Math.hypot(b[0] - a[0], b[2] - a[2])

/** 1 means the road holds its heading; 0 means it turns hard. */
export const straightnessAt = (
  centerline: TrackDefinition['centerline'],
  index: number,
) => {
  const length = centerline.length
  const pointAt = (offset: number) => centerline[(index + offset + length) % length]
  const previous = pointAt(-2)
  const center = pointAt(0)
  const next = pointAt(2)
  const inVector = { x: center[0] - previous[0], z: center[2] - previous[2] }
  const outVector = { x: next[0] - center[0], z: next[2] - center[2] }
  const inLength = Math.hypot(inVector.x, inVector.z) || 1
  const outLength = Math.hypot(outVector.x, outVector.z) || 1
  const dot =
    (inVector.x * outVector.x + inVector.z * outVector.z) / (inLength * outLength)
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)))

  return clamp01(1 - angle / 1.15)
}

export const runDistance = (
  centerline: TrackDefinition['centerline'],
  startIndex: number,
  endIndex: number,
) => {
  let distance = 0

  for (let index = startIndex; index < endIndex; index += 1) {
    distance += pointDistance(
      centerline[index],
      centerline[(index + 1) % centerline.length],
    )
  }

  return distance
}

export type AeroZoneDerivationOptions = {
  /** Label for each derived zone, so it reads like the circuit's others. */
  label?: (index: number) => string
  /**
   * Published lap distance in metres. Centerline coordinates are scene units,
   * so this is what lets `minimumStraightMeters` mean actual metres. Without it
   * runs are only ranked against each other.
   */
  lapMeters?: number
  lowGripMode?: AeroActivationZone['lowGripMode']
  /**
   * A straight must be at least this long to earn a zone. It stops a short
   * circuit from being given one on a corner exit merely because that exit
   * happens to be its longest run. Requires `lapMeters`.
   */
  minimumStraightMeters?: number
  targetCount?: number
  threshold?: number
}

/**
 * Rank the centerline's straight runs by measured length and return an
 * activation zone for each of the longest ones.
 */
export const deriveAeroActivationZones = (
  centerline: TrackDefinition['centerline'],
  kind: TrackDefinition['kind'],
  options: AeroZoneDerivationOptions = {},
): AeroActivationZone[] => {
  const threshold = options.threshold ?? (kind === 'street' ? 0.82 : 0.78)
  const minimumSpan = kind === 'street' ? 0.035 : 0.045
  const targetCount = options.targetCount ?? (kind === 'street' ? 2 : 3)
  const label = options.label ?? ((index: number) => `SM A${index + 1}`)
  const lowGripMode = options.lowGripMode ?? 'partial'
  const minimumStraightMeters = options.minimumStraightMeters ?? 0
  // Centerline units are arbitrary, so the published lap distance sets the
  // scale. Without it the metre threshold cannot be applied and runs are only
  // ranked against one another.
  const perimeter = runDistance(centerline, 0, centerline.length)
  const metersPerUnit =
    options.lapMeters && perimeter > 0 ? options.lapMeters / perimeter : null
  const minimumRunDistance =
    metersPerUnit === null ? 0 : minimumStraightMeters / metersPerUnit
  const runs: Array<{ startIndex: number; endIndex: number; distance: number }> = []
  let startIndex: number | null = null

  for (let index = 0; index < centerline.length; index += 1) {
    const isStraight = straightnessAt(centerline, index) >= threshold

    if (isStraight && startIndex === null) {
      startIndex = index
    }

    if ((!isStraight || index === centerline.length - 1) && startIndex !== null) {
      const endIndex = isStraight ? index + 1 : index
      const span = (endIndex - startIndex) / centerline.length

      if (span >= minimumSpan) {
        runs.push({
          startIndex,
          endIndex,
          distance: runDistance(centerline, startIndex, endIndex),
        })
      }

      startIndex = null
    }
  }

  // A straight that spans the start/finish line arrives as two runs, one ending
  // at the last index and one starting at index 0. Left split it would be
  // published as two back-to-back zones on one piece of road, each with its own
  // detection point. Merge it back into the single straight it is.
  const firstRun = runs[0]
  const lastRun = runs[runs.length - 1]

  if (
    runs.length > 1 &&
    firstRun.startIndex === 0 &&
    lastRun.endIndex >= centerline.length - 1 &&
    straightnessAt(centerline, 0) >= threshold
  ) {
    runs.pop()
    runs[0] = {
      startIndex: lastRun.startIndex - centerline.length,
      endIndex: firstRun.endIndex,
      distance: lastRun.distance + firstRun.distance,
    }
  }

  const selectedRuns = runs
    .filter((run) => run.distance >= minimumRunDistance)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, targetCount)
    .sort((a, b) => a.startIndex - b.startIndex)

  const usableRuns =
    selectedRuns.length > 0
      ? selectedRuns
      : centerline
          .slice(0, -1)
          .map((_, startIndex) => ({
            startIndex,
            endIndex: startIndex + 1,
            distance: pointDistance(
              centerline[startIndex],
              centerline[startIndex + 1],
            ),
          }))
          .sort((a, b) => b.distance - a.distance)
          .slice(0, targetCount)
          .sort((a, b) => a.startIndex - b.startIndex)

  // A merged start/finish straight has a negative start index, so its progress
  // wraps past 1 rather than clamping to 0. Zone consumers already read a
  // start > end as a wrapping zone.
  const wrapProgress = (value: number) => ((value % 1) + 1) % 1

  return usableRuns.map((run, index) => ({
    end: Number(clamp01(run.endIndex / centerline.length).toFixed(3)),
    label: label(index),
    lowGripMode,
    source: 'derived' as const,
    start: Number(
      (run.startIndex < 0
        ? wrapProgress(run.startIndex / centerline.length)
        : clamp01(run.startIndex / centerline.length)
      ).toFixed(3),
    ),
  }))
}
