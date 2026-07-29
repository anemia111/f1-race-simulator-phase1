import type { BattlePhase, TrackDefinition } from '../types'

export type TrackDynamicPoint = {
  brakingSeverity: number
  requiredBrakingDecelerationMps2: number
  cornerClass: 'low' | 'medium' | 'high' | 'straight'
  curvature: number
  fullThrottle: boolean
  gradient: number
  referenceSpeedKph: number
  straightLengthAheadMeters: number
  straightness: number
  turnDirection: -1 | 0 | 1
}

type CachedProfile = {
  cumulativeArcLength: number[]
  points: TrackDynamicPoint[]
}

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
  const visualSegmentLengths = track.centerline.map((point, index) => {
    const next = pointAt(track, index + 1)

    return Math.max(
      0.000001,
      Math.hypot(next[0] - point[0], next[2] - point[2]),
    )
  })
  const visualLapLength = visualSegmentLengths.reduce(
    (total, length) => total + length,
    0,
  )
  const segmentWeights = visualSegmentLengths.map(
    (length) => length / visualLapLength,
  )
  const segmentLengthMeters = segmentWeights.map(
    (weight) => weight * track.lengthKm * 1000,
  )
  const cumulativeArcLength = [0]

  for (const weight of segmentWeights) {
    cumulativeArcLength.push(
      cumulativeArcLength[cumulativeArcLength.length - 1] + weight,
    )
  }
  cumulativeArcLength[cumulativeArcLength.length - 1] = 1
  const averageSpeedKph = (track.lengthKm / track.baseLapTime) * 3600
  let speedScale =
    averageSpeedKph /
    (1 /
      raw.reduce(
        (total, point, index) =>
          total + segmentWeights[index] / point.rawSpeedFactor,
        0,
      ))

  const feasibleSpeedsForScale = (scale: number) => {
    const speeds = raw.map((point) =>
      clamp(
        point.rawSpeedFactor * scale,
        MIN_REFERENCE_SPEED_KPH,
        MAX_REFERENCE_SPEED_KPH,
      ) / 3.6,
    )

    // Curvature alone can jump from a hairpin to 395 km/h at the next sampled
    // point. Forward/backward passes turn that shape into a physically
    // reachable envelope before it is used by throttle and brake control.
    for (let pass = 0; pass < 4; pass += 1) {
      for (let index = 0; index < speeds.length; index += 1) {
        const nextIndex = (index + 1) % speeds.length
        const maximumNextMps = Math.sqrt(
          speeds[index] ** 2 +
            2 * 12.5 * segmentLengthMeters[index],
        )

        speeds[nextIndex] = Math.min(speeds[nextIndex], maximumNextMps)
      }

      for (let index = speeds.length - 1; index >= 0; index -= 1) {
        const nextIndex = (index + 1) % speeds.length
        const maximumEntryMps = Math.sqrt(
          speeds[nextIndex] ** 2 +
            2 * 44 * segmentLengthMeters[index],
        )

        speeds[index] = Math.min(speeds[index], maximumEntryMps)
      }
    }

    return speeds.map((speedMps) => speedMps * 3.6)
  }

  // Curvature creates a wide F1-like speed range while this iterative scale
  // keeps the distance-weighted lap time anchored to the configured circuit
  // baseline, including tracks that touch the hairpin or straight-line bounds.
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const speeds = feasibleSpeedsForScale(speedScale)
    const achievedAverageSpeedKph =
      1 /
      speeds.reduce(
        (total, speedKph, index) =>
          total + segmentWeights[index] / speedKph,
        0,
      )

    speedScale *= averageSpeedKph / achievedAverageSpeedKph
  }

  const feasibleSpeeds = feasibleSpeedsForScale(speedScale)
  const speedPoints = raw.map((point, index) => ({
    curvature: point.curvature,
    gradient: point.gradient,
    referenceSpeedKph: feasibleSpeeds[index],
    straightness: point.straightness,
    turnDirection: point.turnDirection,
  }))
  const points = speedPoints.map((point, index) => {
    let requiredBrakingDecelerationMps2 = 0
    let distanceMeters = 0

    for (let lookAhead = 1; lookAhead <= Math.min(14, speedPoints.length / 5); lookAhead += 1) {
      const target = speedPoints[(index + lookAhead) % speedPoints.length]
      distanceMeters +=
        segmentLengthMeters[
          (index + lookAhead - 1) % segmentLengthMeters.length
        ]
      const currentMps = point.referenceSpeedKph / 3.6
      const targetMps = target.referenceSpeedKph / 3.6
      const requiredDeceleration = Math.max(
        0,
        (currentMps * currentMps - targetMps * targetMps) /
          (2 * distanceMeters),
      )

      requiredBrakingDecelerationMps2 = Math.max(
        requiredBrakingDecelerationMps2,
        target.curvature < 0.08 && target.referenceSpeedKph >= 220
          ? 0
          : requiredDeceleration,
      )
    }
    // The map-level severity is an F1 reference only. Telemetry converts the
    // raw required deceleration into the actual category's brake capability,
    // so an F3 car starts earlier than an F1 car without changing the circuit.
    const brakingSeverity = clamp(
      (requiredBrakingDecelerationMps2 - 14) / 30,
      0,
      1,
    )
    let straightLengthAheadMeters = 0

    for (let lookAhead = 0; lookAhead < speedPoints.length / 3; lookAhead += 1) {
      const candidate = speedPoints[(index + lookAhead) % speedPoints.length]

      // Gentle kinks remain flat in this category. Treat them as part of the
      // same acceleration zone so long straights such as the Las Vegas Strip
      // are not split by resampled-layout noise.
      if (lookAhead > 1 && candidate.curvature >= 0.16) {
        break
      }

      straightLengthAheadMeters +=
        segmentLengthMeters[
          (index + lookAhead) % segmentLengthMeters.length
        ]
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
      requiredBrakingDecelerationMps2,
      cornerClass,
      fullThrottle:
        (point.straightness > 0.68 || straightLengthAheadMeters >= 100) &&
        point.referenceSpeedKph >= 190 &&
        brakingSeverity < 0.14,
      straightLengthAheadMeters,
    }
  })

  return { cumulativeArcLength, points }
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

export function referenceProfileLapTimeSeconds(track: TrackDefinition) {
  let profile = profileCache.get(track)

  if (!profile) {
    profile = buildProfile(track)
    profileCache.set(track, profile)
  }

  return profile.points.reduce((lapSeconds, point, index) => {
    const distanceFraction =
      profile.cumulativeArcLength[index + 1] -
      profile.cumulativeArcLength[index]

    return (
      lapSeconds +
      (distanceFraction * track.lengthKm * 3600) /
        point.referenceSpeedKph
    )
  }, 0)
}

function profileArcProgressAt(
  profile: CachedProfile,
  unwrappedProgress: number,
) {
  const completedLaps = Math.floor(unwrappedProgress)
  const normalizedProgress = unwrappedProgress - completedLaps
  const pointPosition = normalizedProgress * profile.points.length
  const pointIndex = Math.min(
    profile.points.length - 1,
    Math.floor(pointPosition),
  )
  const pointFraction = pointPosition - pointIndex
  const segmentStartArc = profile.cumulativeArcLength[pointIndex]
  const segmentEndArc = profile.cumulativeArcLength[pointIndex + 1]

  return (
    completedLaps +
    segmentStartArc +
    (segmentEndArc - segmentStartArc) * pointFraction
  )
}

export function profileDistanceKmBetween(
  track: TrackDefinition,
  startProgress: number,
  endProgress: number,
) {
  let profile = profileCache.get(track)

  if (!profile) {
    profile = buildProfile(track)
    profileCache.set(track, profile)
  }

  return (
    Math.max(
      0,
      profileArcProgressAt(profile, endProgress) -
        profileArcProgressAt(profile, startProgress),
    ) * track.lengthKm
  )
}

export function speedForProfileTravelKph(
  track: TrackDefinition,
  startProgress: number,
  endProgress: number,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    return 0
  }

  return (
    (profileDistanceKmBetween(track, startProgress, endProgress) * 3600) /
    deltaSeconds
  )
}

export function progressForProfileSpeed(
  track: TrackDefinition,
  progress: number,
  speedKph: number,
  deltaSeconds: number,
) {
  let profile = profileCache.get(track)

  if (!profile) {
    profile = buildProfile(track)
    profileCache.set(track, profile)
  }

  const normalizedProgress = ((progress % 1) + 1) % 1
  const startArc = profileArcProgressAt(profile, normalizedProgress)
  const distanceFraction =
    Math.max(0, speedKph) * (deltaSeconds / 3600) / track.lengthKm
  const unwrappedEndArc = startArc + distanceFraction
  const completedLaps = Math.floor(unwrappedEndArc)
  const endArc = unwrappedEndArc - completedLaps
  let endPointIndex = profile.points.length - 1

  for (let index = 0; index < profile.points.length; index += 1) {
    if (profile.cumulativeArcLength[index + 1] >= endArc) {
      endPointIndex = index
      break
    }
  }

  const endSegmentStart = profile.cumulativeArcLength[endPointIndex]
  const endSegmentLength = Math.max(
    0.0000001,
    profile.cumulativeArcLength[endPointIndex + 1] - endSegmentStart,
  )
  const endPointFraction = clamp(
    (endArc - endSegmentStart) / endSegmentLength,
    0,
    1,
  )
  const unwrappedEndProgress =
    completedLaps +
    (endPointIndex + endPointFraction) / profile.points.length

  // The same telemetry speed shown in the timing tower now advances the car by
  // v * dt over the centerline's actual arc length.
  return Math.max(0, unwrappedEndProgress - normalizedProgress)
}
