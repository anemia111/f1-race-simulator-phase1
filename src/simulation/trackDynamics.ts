import type { BattlePhase, TrackDefinition } from '../types'
import {
  categoryPhysicsFor,
  type CategoryPhysicsProfile,
} from './categoryPhysics'
import {
  simulatePhysicalLap,
  trackGeometry,
  trackWidthMeters,
  type PhysicalReferenceLinePhase,
  type TrackGeometryPoint,
} from './physicalLap'

export type TrackDynamicPoint = {
  bankingDegrees: number
  brakingDistanceAheadMeters: number
  brakingSeverity: number
  brakingTargetBankingDegrees: number
  brakingTargetCornerRadiusM: number
  brakingTargetSpeedKph: number
  cornerClass: 'low' | 'medium' | 'high' | 'straight'
  corneringSpeedLimitKph: number
  /** Legacy controller curvature, now derived from physical heading change. */
  curvature: number
  effectiveCornerRadiusM: number
  fullThrottle: boolean
  gradient: number
  referenceLineOffsetM: number
  referenceSpeedKph: number
  requiredBrakingDecelerationMps2: number
  segmentLengthMeters: number
  /** Signed physical inverse radius, in 1/m. */
  signedCurvaturePerMeter: number
  signedTurnRadians: number
  straightLengthAheadMeters: number
  straightness: number
  turnDirection: -1 | 0 | 1
}

type CachedGeometry = {
  cumulativeArcLength: number[]
  points: TrackGeometryPoint[]
}

type CachedProfile = {
  linePhases: PhysicalReferenceLinePhase[]
  points: TrackDynamicPoint[]
}

// Distance and progress never depend on vehicle category. Profile speeds do,
// so they are deliberately held in a separate cache keyed by both the track
// object and the exact physics-profile object.
const geometryCache = new WeakMap<TrackDefinition, CachedGeometry>()
const profileCache = new WeakMap<
  TrackDefinition,
  WeakMap<CategoryPhysicsProfile, CachedProfile>
>()
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function pointAt(track: TrackDefinition, index: number) {
  const length = track.centerline.length

  return track.centerline[((index % length) + length) % length]
}

function buildGeometry(track: TrackDefinition): CachedGeometry {
  const points = trackGeometry(track)
  const lapLengthMeters = points.reduce(
    (total, point) => total + point.segmentLengthMeters,
    0,
  )
  const cumulativeArcLength = [0]

  for (const point of points) {
    cumulativeArcLength.push(
      cumulativeArcLength[cumulativeArcLength.length - 1] +
        point.segmentLengthMeters / lapLengthMeters,
    )
  }

  cumulativeArcLength[cumulativeArcLength.length - 1] = 1

  return { cumulativeArcLength, points }
}

function geometryFor(track: TrackDefinition) {
  let geometry = geometryCache.get(track)

  if (!geometry) {
    geometry = buildGeometry(track)
    geometryCache.set(track, geometry)
  }

  return geometry
}

function gradientAt(track: TrackDefinition, index: number) {
  const previous = pointAt(track, index - 2)
  const next = pointAt(track, index + 2)

  // Elevation in the legacy centreline is only a scene-relative signal. Keep
  // the public field for setup/weather consumers, but do not use it to scale
  // the physical reference speed.
  return clamp((next[1] - previous[1]) / 8, -1, 1)
}

/**
 * Builds an offline planning profile from the force-based lap model.
 *
 * It is a geometry/reference source only. Live vehicle speed must come from
 * force integration using the current tyres, aero, Energy Store and controls.
 */
function buildProfile(
  track: TrackDefinition,
  physics: CategoryPhysicsProfile,
): CachedProfile {
  const physical = simulatePhysicalLap(track, { physics })
  const maximumCorneringLimitMps = Math.max(
    ...physical.points.map((point) => point.corneringSpeedLimitMps),
  )
  const points = physical.points.map((point, index): TrackDynamicPoint => {
    const next = physical.points[(index + 1) % physical.points.length]
    const curvature = clamp(Math.abs(point.signedTurnRadians) / 1.15, 0, 1)
    const brakingSeverity = clamp(
      point.requiredBrakingDecelerationMps2 /
        Math.max(1e-6, physics.maximumBrakeDecelerationMps2),
      0,
      1,
    )
    let straightLengthAheadMeters = 0

    for (let lookAhead = 0; lookAhead < physical.points.length; lookAhead += 1) {
      const candidate =
        physical.points[(index + lookAhead) % physical.points.length]
      const isFlat =
        candidate.corneringSpeedLimitMps >= maximumCorneringLimitMps * 0.985

      if (
        lookAhead > 0 &&
        (!isFlat || candidate.requiredBrakingDecelerationMps2 > 1e-6)
      ) {
        break
      }

      straightLengthAheadMeters += candidate.segmentLengthMeters
    }

    const referenceSpeedKph = point.referenceSpeedMps * 3.6
    const cornerClass: TrackDynamicPoint['cornerClass'] =
      point.turnDirection === 0
        ? 'straight'
        : referenceSpeedKph < 155
          ? 'low'
          : referenceSpeedKph < 235
            ? 'medium'
            : 'high'
    const accelerating = next.referenceSpeedMps > point.referenceSpeedMps + 1e-6
    const flatAtThisPoint =
      point.corneringSpeedLimitMps >= maximumCorneringLimitMps * 0.985

    return {
      bankingDegrees: point.bankingDegrees,
      brakingDistanceAheadMeters: point.brakingDistanceAheadMeters,
      brakingSeverity,
      brakingTargetBankingDegrees: point.brakingTargetBankingDegrees,
      brakingTargetCornerRadiusM: point.brakingTargetCornerRadiusM,
      brakingTargetSpeedKph: point.brakingTargetSpeedMps * 3.6,
      cornerClass,
      corneringSpeedLimitKph: point.corneringSpeedLimitMps * 3.6,
      curvature,
      effectiveCornerRadiusM: point.effectiveCornerRadiusM,
      fullThrottle:
        point.requiredBrakingDecelerationMps2 <= 1e-6 &&
        (accelerating || flatAtThisPoint),
      gradient: gradientAt(track, index),
      referenceLineOffsetM: point.referenceLineOffsetM,
      referenceSpeedKph,
      requiredBrakingDecelerationMps2:
        point.requiredBrakingDecelerationMps2,
      segmentLengthMeters: point.segmentLengthMeters,
      signedCurvaturePerMeter: point.curvaturePerMeter,
      signedTurnRadians: point.signedTurnRadians,
      straightLengthAheadMeters,
      straightness: 1 - curvature,
      turnDirection: point.turnDirection,
    }
  })

  return {
    linePhases: physical.points.map((point) => point.referenceLinePhase),
    points,
  }
}

function profileFor(
  track: TrackDefinition,
  physics: CategoryPhysicsProfile = categoryPhysicsFor(undefined),
) {
  let profilesForTrack = profileCache.get(track)

  if (!profilesForTrack) {
    profilesForTrack = new WeakMap<CategoryPhysicsProfile, CachedProfile>()
    profileCache.set(track, profilesForTrack)
  }

  let profile = profilesForTrack.get(physics)

  if (!profile) {
    profile = buildProfile(track, physics)
    profilesForTrack.set(physics, profile)
  }

  return profile
}

export function trackDynamicsAt(
  track: TrackDefinition,
  progress: number,
  physics: CategoryPhysicsProfile = categoryPhysicsFor(undefined),
): TrackDynamicPoint {
  const profile = profileFor(track, physics)
  const normalized = ((progress % 1) + 1) % 1
  const index = Math.min(
    profile.points.length - 1,
    Math.floor(normalized * profile.points.length),
  )

  return profile.points[index]
}

export type RacingLinePhase = PhysicalReferenceLinePhase

export function racingLineAt(
  track: TrackDefinition,
  progress: number,
  physics: CategoryPhysicsProfile = categoryPhysicsFor(undefined),
): TrackDynamicPoint & { offset: number; phase: RacingLinePhase } {
  const profile = profileFor(track, physics)
  const normalized = ((progress % 1) + 1) % 1
  const index = Math.min(
    profile.points.length - 1,
    Math.floor(normalized * profile.points.length),
  )
  const point = profile.points[index]

  // `offset` is retained for compatibility, but is now the physical offset in
  // metres and is never derived from TrackDefinition.width (render units).
  return {
    ...point,
    offset: point.referenceLineOffsetM,
    phase: profile.linePhases[index],
  }
}

/** Local time cost of leaving the ideal line during an active battle. */
export function lineDeviationPenaltySeconds(
  track: TrackDefinition,
  progress: number,
  dynamicOffset: number,
  battlePhase: BattlePhase,
  physics: CategoryPhysicsProfile = categoryPhysicsFor(undefined),
) {
  if (Math.abs(dynamicOffset) < 0.02) {
    return 0
  }

  const line = racingLineAt(track, progress, physics)
  const usableHalfWidthMeters = Math.max(0.4, trackWidthMeters(track) / 2 - 1)
  const normalizedOffset = clamp(
    Math.abs(dynamicOffset) / usableHalfWidthMeters,
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

export function referenceProfileLapTimeSeconds(
  track: TrackDefinition,
  physics: CategoryPhysicsProfile = categoryPhysicsFor(undefined),
) {
  const profile = profileFor(track, physics)

  return profile.points.reduce((lapSeconds, point, index) => {
    const next = profile.points[(index + 1) % profile.points.length]
    const averageSpeedMps = Math.max(
      1,
      (point.referenceSpeedKph + next.referenceSpeedKph) / 7.2,
    )

    return lapSeconds + point.segmentLengthMeters / averageSpeedMps
  }, 0)
}

function profileArcProgressAt(
  geometry: CachedGeometry,
  unwrappedProgress: number,
) {
  const completedLaps = Math.floor(unwrappedProgress)
  const normalizedProgress = unwrappedProgress - completedLaps
  const pointPosition = normalizedProgress * geometry.points.length
  const pointIndex = Math.min(
    geometry.points.length - 1,
    Math.floor(pointPosition),
  )
  const pointFraction = pointPosition - pointIndex
  const segmentStartArc = geometry.cumulativeArcLength[pointIndex]
  const segmentEndArc = geometry.cumulativeArcLength[pointIndex + 1]

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
  const geometry = geometryFor(track)

  return (
    Math.max(
      0,
      profileArcProgressAt(geometry, endProgress) -
        profileArcProgressAt(geometry, startProgress),
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
  const geometry = geometryFor(track)
  const normalizedProgress = ((progress % 1) + 1) % 1
  const startArc = profileArcProgressAt(geometry, normalizedProgress)
  const distanceFraction =
    Math.max(0, speedKph) * (deltaSeconds / 3600) / track.lengthKm
  const unwrappedEndArc = startArc + distanceFraction
  const completedLaps = Math.floor(unwrappedEndArc)
  const endArc = unwrappedEndArc - completedLaps
  let endPointIndex = geometry.points.length - 1

  for (let index = 0; index < geometry.points.length; index += 1) {
    if (geometry.cumulativeArcLength[index + 1] >= endArc) {
      endPointIndex = index
      break
    }
  }

  const endSegmentStart = geometry.cumulativeArcLength[endPointIndex]
  const endSegmentLength = Math.max(
    0.0000001,
    geometry.cumulativeArcLength[endPointIndex + 1] - endSegmentStart,
  )
  const endPointFraction = clamp(
    (endArc - endSegmentStart) / endSegmentLength,
    0,
    1,
  )
  const unwrappedEndProgress =
    completedLaps +
    (endPointIndex + endPointFraction) / geometry.points.length

  return Math.max(0, unwrappedEndProgress - normalizedProgress)
}
