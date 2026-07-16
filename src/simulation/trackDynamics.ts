import type { BattlePhase, TrackDefinition } from '../types'

export type TrackDynamicPoint = {
  brakingSeverity: number
  cornerClass: 'low' | 'medium' | 'high' | 'straight'
  curvature: number
  fullThrottle: boolean
  gradient: number
  referenceSpeedKph: number
  straightLengthAheadMeters: number
  straightness: number
  turnDirection: -1 | 0 | 1
}

type CachedProfile = { points: TrackDynamicPoint[] }

const profileCache = new WeakMap<TrackDefinition, CachedProfile>()
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const MIN_REFERENCE_SPEED_KPH = 68
const MAX_REFERENCE_SPEED_KPH = 395

function pointAt(track: TrackDefinition, index: number) {
  const length = track.centerline.length
  return track.centerline[((index % length) + length) % length]
}

function curvatureAtSpan(
  track: TrackDefinition,
  index: number,
  span: number,
) {
  const previous = pointAt(track, index - span)
  const current = pointAt(track, index)
  const next = pointAt(track, index + span)
  const incoming = {
    x: current[0] - previous[0],
    z: current[2] - previous[2],
  }
  const outgoing = {
    x: next[0] - current[0],
    z: next[2] - current[2],
  }
  const incomingLength = Math.hypot(incoming.x, incoming.z) || 1
  const outgoingLength = Math.hypot(outgoing.x, outgoing.z) || 1
  const dot = clamp(
    (incoming.x * outgoing.x + incoming.z * outgoing.z) /
      (incomingLength * outgoingLength),
    -1,
    1,
  )
  const curvature = clamp(Math.acos(dot) / 1.15, 0, 1)
  const cross = incoming.x * outgoing.z - incoming.z * outgoing.x

  return { cross, curvature }
}

function rawProfileAt(track: TrackDefinition, index: number) {
  const previous = pointAt(track, index - 2)
  const next = pointAt(track, index + 2)
  const localCurve = curvatureAtSpan(track, index, 2)

  // Real layouts are resampled to a shared point count. Blending several
  // baselines stops one noisy map vertex from becoming a prolonged hairpin.
  const curvature = clamp(
    localCurve.curvature * 0.42 +
      curvatureAtSpan(track, index, 4).curvature * 0.36 +
      curvatureAtSpan(track, index, 6).curvature * 0.22,
    0,
    1,
  )
  const turnDirection: -1 | 0 | 1 =
    curvature < 0.04 ? 0 : localCurve.cross >= 0 ? 1 : -1
  const straightness = 1 - curvature
  const gradient = clamp((next[1] - previous[1]) / 8, -1, 1)
  const rawSpeedFactor = clamp(
    0.33 +
      Math.pow(straightness, 1.35) * 1.27 -
      Math.max(0, gradient) * 0.08,
    0.29,
    1.62,
  )

  return { curvature, gradient, rawSpeedFactor, straightness, turnDirection }
}

function buildProfile(track: TrackDefinition): CachedProfile {
  const raw = track.centerline.map((_, index) => rawProfileAt(track, index))
  const averageSpeedKph = (track.lengthKm / track.baseLapTime) * 3600
  let speedScale =
    averageSpeedKph /
    (raw.length /
      raw.reduce((total, point) => total + 1 / point.rawSpeedFactor, 0))

  // Curvature creates a wide F1-like speed range while this iterative scale
  // keeps the distance-weighted lap time anchored to the configured circuit
  // baseline, including tracks that touch the hairpin or straight-line bounds.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const speeds = raw.map((point) =>
      clamp(
        point.rawSpeedFactor * speedScale,
        MIN_REFERENCE_SPEED_KPH,
        MAX_REFERENCE_SPEED_KPH,
      ),
    )
    const achievedAverageSpeedKph =
      speeds.length /
      speeds.reduce((total, speedKph) => total + 1 / speedKph, 0)

    speedScale *= averageSpeedKph / achievedAverageSpeedKph
  }

  const speedPoints = raw.map((point) => ({
    curvature: point.curvature,
    gradient: point.gradient,
    referenceSpeedKph: clamp(
      point.rawSpeedFactor * speedScale,
      MIN_REFERENCE_SPEED_KPH,
      MAX_REFERENCE_SPEED_KPH,
    ),
    straightness: point.straightness,
    turnDirection: point.turnDirection,
  }))
  const pointLengthMeters = (track.lengthKm * 1000) / Math.max(1, raw.length)
  const points = speedPoints.map((point, index) => {
    let brakingSeverity = 0

    for (let lookAhead = 1; lookAhead <= Math.min(14, speedPoints.length / 5); lookAhead += 1) {
      const target = speedPoints[(index + lookAhead) % speedPoints.length]
      const distanceMeters = Math.max(1, lookAhead * pointLengthMeters)
      const currentMps = point.referenceSpeedKph / 3.6
      const targetMps = target.referenceSpeedKph / 3.6
      const requiredDeceleration = Math.max(
        0,
        (currentMps * currentMps - targetMps * targetMps) /
          (2 * distanceMeters),
      )

      brakingSeverity = Math.max(
        brakingSeverity,
        clamp(requiredDeceleration / 13.5, 0, 1),
      )
    }
    let straightLengthAheadMeters = 0

    for (let lookAhead = 0; lookAhead < speedPoints.length / 3; lookAhead += 1) {
      const candidate = speedPoints[(index + lookAhead) % speedPoints.length]

      // Gentle kinks remain flat in this category. Treat them as part of the
      // same acceleration zone so long straights such as the Las Vegas Strip
      // are not split by resampled-layout noise.
      if (lookAhead > 1 && candidate.curvature >= 0.16) {
        break
      }

      straightLengthAheadMeters += pointLengthMeters
    }

    const cornerClass: TrackDynamicPoint['cornerClass'] =
      point.curvature < 0.055
        ? 'straight'
        : point.referenceSpeedKph < 155
          ? 'low'
          : point.referenceSpeedKph < 235
            ? 'medium'
            : 'high'

    return {
      ...point,
      brakingSeverity,
      cornerClass,
      fullThrottle:
        (point.straightness > 0.68 || straightLengthAheadMeters >= 100) &&
        point.referenceSpeedKph >= 190 &&
        brakingSeverity < 0.32,
      straightLengthAheadMeters,
    }
  })

  return { points }
}

export function trackDynamicsAt(
  track: TrackDefinition,
  progress: number,
): TrackDynamicPoint {
  let profile = profileCache.get(track)

  if (!profile) {
    profile = buildProfile(track)
    profileCache.set(track, profile)
  }

  const normalized = ((progress % 1) + 1) % 1
  const index = Math.min(
    profile.points.length - 1,
    Math.floor(normalized * profile.points.length),
  )

  return profile.points[index]
}

export type RacingLinePhase = 'straight' | 'entry' | 'apex' | 'exit'

export function racingLineAt(
  track: TrackDefinition,
  progress: number,
): TrackDynamicPoint & { offset: number; phase: RacingLinePhase } {
  let profile = profileCache.get(track)

  if (!profile) {
    profile = buildProfile(track)
    profileCache.set(track, profile)
  }

  const normalized = ((progress % 1) + 1) % 1
  const index = Math.min(
    profile.points.length - 1,
    Math.floor(normalized * profile.points.length),
  )
  const point = profile.points[index]
  const previous = profile.points[
    (index - 3 + profile.points.length) % profile.points.length
  ]
  const next = profile.points[(index + 3) % profile.points.length]
  const phase: RacingLinePhase =
    point.curvature < 0.09
      ? 'straight'
      : next.curvature > point.curvature * 1.08
        ? 'entry'
        : previous.curvature > point.curvature * 1.08
          ? 'exit'
          : 'apex'
  const width = track.width
  const offset =
    point.turnDirection === 0
      ? 0
      : phase === 'entry'
        ? point.turnDirection * Math.min(1.05, width * 0.22)
        : phase === 'exit'
          ? point.turnDirection * Math.min(0.82, width * 0.17)
          : -point.turnDirection * Math.min(1.3, width * 0.28)

  return { ...point, offset, phase }
}

/** Local time cost of leaving the ideal line during an active battle. */
export function lineDeviationPenaltySeconds(
  track: TrackDefinition,
  progress: number,
  dynamicOffset: number,
  battlePhase: BattlePhase,
) {
  if (Math.abs(dynamicOffset) < 0.02) {
    return 0
  }

  const line = racingLineAt(track, progress)
  const normalizedOffset = clamp(
    Math.abs(dynamicOffset) / Math.max(0.4, track.width * 0.38),
    0,
    1.5,
  )
  const phaseCost =
    line.phase === 'exit'
      ? 1.35
      : line.phase === 'apex'
        ? 0.9
        : line.phase === 'entry'
          ? 0.52
          : 0.12
  const battleCost =
    battlePhase === 'side-by-side'
      ? 1.2
      : battlePhase === 'attacking' || battlePhase === 'defending'
        ? 1
        : 0.45

  return (
    normalizedOffset ** 1.25 *
    (0.18 + line.curvature * 0.82) *
    phaseCost *
    battleCost *
    0.92
  )
}

export function progressForSpeed(
  track: TrackDefinition,
  speedKph: number,
  deltaSeconds: number,
) {
  return Math.max(0, speedKph) * (deltaSeconds / 3600) / track.lengthKm
}

export function progressForProfileSpeed(
  track: TrackDefinition,
  progress: number,
  speedKph: number,
  deltaSeconds: number,
) {
  const referenceSpeedKph = trackDynamicsAt(track, progress).referenceSpeedKph
  const localPaceRatio = clamp(
    Math.max(0, speedKph) / Math.max(1, referenceSpeedKph),
    0,
    2.2,
  )

  return (deltaSeconds / Math.max(1, track.baseLapTime)) * localPaceRatio
}
