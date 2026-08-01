/**
 * Quasi-steady-state lap from forces alone.
 *
 * This is the replacement for the curvature heuristic and its `baseLapTime`
 * rescale. Nothing here is told what lap time to produce. The circuit supplies
 * corner radii, the tyre model says how fast each radius can be taken, the
 * power unit says how hard the car can accelerate away, and the brakes and
 * tyres say how late it can arrive. Lap time is whatever those three agree on.
 *
 * The method is the standard one for a point-mass lap: take the grip-limited
 * speed at every point, then sweep forward under acceleration and backward
 * under braking, keeping the lower of the two. Combined grip is respected in
 * both sweeps through the friction ellipse, so a car still cornering has less
 * left for braking or power.
 *
 * It stays a point mass. There is no yaw, no slip angle and no suspension
 * here; the car is assumed to be on the limit of a friction ellipse whose size
 * comes from `tyreForces`.
 */
import { categoryPhysicsFor, type CategoryPhysicsProfile } from './categoryPhysics'
import { powerUnitDriveForceN } from './drivetrain'
import {
  aerodynamicDownforceN,
  corneringSpeedLimitMps,
  GRAVITY_MPS2,
  remainingEllipseForceN,
  tyreGripAt,
} from './tyreForces'
import type { TrackDefinition } from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type PhysicalLapOptions = {
  airDensityKgM3?: number
  /** Frontal drag area in m^2, from `vehicleDragAreaM2` for a real car. */
  dragAreaM2?: number
  /** Surface and compound state, as in `tyreForces`. */
  gripMultiplier?: number
  massKg?: number
  /**
   * MGU-K deployment assumed available under acceleration while constructing
   * an offline reference profile. This is never a live Energy Store command.
   */
  deploymentPowerKw?: number
  physics?: CategoryPhysicsProfile
}

/**
 * Deployment policy used only by the offline/reference lap planner.
 *
 * The planner assumes the category limit is available wherever full power is
 * requested. A live simulation must instead pass the power authorised by its
 * Energy Store and deployment state into the drivetrain on every tick. This
 * policy deliberately has no state-of-charge, harvesting or lap strategy.
 */
export const REFERENCE_DEPLOYMENT_POLICY = {
  scope: 'offline-reference-only',
  strategy: 'category-limit-under-acceleration',
} as const

export type BankedSection = {
  /** Lap progress the banking runs between, 0 to 1. */
  fromProgress: number
  toProgress: number
  degrees: number
}

/**
 * Banked sections, by lap progress.
 *
 * Almost every modern circuit is within a couple of degrees of flat and is
 * treated as flat. Only a corner whose banking is a published feature of the
 * layout appears here.
 *
 * The angles come from those published descriptions. The progress ranges do
 * not: they are placed from the corner's position in the lap, so they locate
 * a real feature approximately rather than exactly. Applying a circuit's
 * banking to its whole lap instead is far worse — it lifted Zandvoort's
 * slowest corner to 164 km/h and cost 18 % of the lap time.
 */
export const TRACK_BANKED_SECTIONS: Record<string, BankedSection[]> = {
  'zandvoort-approx': [
    // Hugenholtz, turn 3 of 14.
    { degrees: 19, fromProgress: 0.16, toProgress: 0.24 },
    // Arie Luyendyk, the banked final corner onto the straight.
    { degrees: 18, fromProgress: 0.92, toProgress: 1 },
  ],
  'madrid-approx': [
    // La Monumental, published as a 24 % banking, which is 13.5 degrees.
    { degrees: 13.5, fromProgress: 0.86, toProgress: 0.96 },
  ],
}

/** Banking at a point on the lap, in degrees. */
export function bankingDegreesAt(track: TrackDefinition, progress: number) {
  const sections = TRACK_BANKED_SECTIONS[track.id]

  if (!sections) {
    return 0
  }

  const normalized = ((progress % 1) + 1) % 1
  const section = sections.find(
    (candidate) =>
      normalized >= candidate.fromProgress && normalized <= candidate.toProgress,
  )

  return section?.degrees ?? 0
}

export type TrackGeometryPoint = {
  /** Radius of the racing line in metres; Infinity on a straight. */
  radiusMeters: number
  /** Radius of the centreline itself, before the line is widened out. */
  centrelineRadiusMeters: number
  /** Turn angle of the corner this point belongs to, in radians. */
  cornerArcRadians: number
  /** Distance to the next point, in metres. */
  segmentLengthMeters: number
  /** Signed local change in heading, in radians. */
  signedTurnRadians: number
  /** Direction of the local turn; zero when effectively straight. */
  turnDirection: -1 | 0 | 1
}

/** Half a modern single-seater's width, kept off the usable track edge. */
const CAR_HALF_WIDTH_M = 1
/** Above this the road is straight enough that it is not a corner. */
const CORNER_RADIUS_LIMIT_M = 900

/**
 * How much of the theoretical racing line the stored geometry has not already
 * taken.
 *
 * The centreline is recorded at roughly 33 m intervals, and that spacing
 * smooths corners on its own: the radius that comes out of it is already wider
 * than a true centreline and closer to a driven line. Applying the full
 * outside-apex-outside widening on top counts the same effect twice, which
 * measured 10 % a lap.
 *
 * This is a correction for the resolution of the source data, not a property
 * of the car. Higher-resolution centrelines would let it go to 1.
 */
const RACING_LINE_REALISATION = 0.28

/**
 * Fraction of the theoretical friction limit a real lap sustains.
 *
 * A quasi-steady-state point mass is always exactly on the limit. A real car
 * is not: yaw inertia, the time load transfer takes to settle, and steering
 * corrections all cost grip that this model cannot represent directly. Lap
 * simulation normally carries a factor of this kind, and it is one global
 * constant rather than a per-circuit target.
 */
const DRIVER_TRANSIENT_EFFICIENCY = 0.97

/**
 * Carriageway width in metres.
 *
 * `TrackDefinition.width` cannot be used for this: it is a rendering value in
 * scene units, and converting it through the centreline scale gives 50 to 130
 * metres. Rather than invent twenty-four separate figures, everything takes
 * the modern-circuit default and only a genuinely different circuit carries an
 * override. The FIA requires at least 12 m and current permanent circuits are
 * typically 13 to 15 m.
 */
const DEFAULT_TRACK_WIDTH_M = 13
const TRACK_WIDTH_METERS: Record<string, number> = {
  // The narrowest circuit of the season; barriers both sides.
  'monaco-approx': 10,
  // Wide modern permanent layouts.
  'cota-approx': 15,
  'spa-approx': 15,
  'silverstone-approx': 15,
}

/** Carriageway width of a circuit, in metres. */
export function trackWidthMeters(track: TrackDefinition) {
  return TRACK_WIDTH_METERS[track.id] ?? DEFAULT_TRACK_WIDTH_M
}

/**
 * Radius the racing line can describe through a corner of this arc angle,
 * given the track width.
 *
 * A driver does not follow the centreline. Entering at the outside edge,
 * clipping the apex and running out to the far edge describes a larger circle
 * than the centreline does, and the shallower the corner the more it can be
 * straightened. For an arc of angle `phi` and usable half-width `h`:
 *
 *   R_line = R + h (1 + cos(phi/2)) / (1 - cos(phi/2))
 *
 * A hairpin (`phi` = 180 degrees) gains only `h`, because there is nowhere to
 * straighten it to. A gentle kink tends to infinity: it is taken flat.
 */
export function racingLineRadiusMeters(options: {
  centrelineRadiusMeters: number
  cornerArcRadians: number
  usableHalfWidthMeters: number
}) {
  const { centrelineRadiusMeters, cornerArcRadians, usableHalfWidthMeters } =
    options

  if (!Number.isFinite(centrelineRadiusMeters)) {
    return Number.POSITIVE_INFINITY
  }

  const halfWidth = Math.max(0, usableHalfWidthMeters)
  const halfArc = clamp(Math.abs(cornerArcRadians), 0.02, Math.PI) / 2
  const cos = Math.cos(halfArc)
  const denominator = 1 - cos

  if (denominator <= 1e-6) {
    return Number.POSITIVE_INFINITY
  }

  const theoreticalGain = (halfWidth * (1 + cos)) / denominator

  return centrelineRadiusMeters + theoreticalGain * RACING_LINE_REALISATION
}

/**
 * Corner radius at every centreline point, from the circle through three
 * points: `R = abc / 4A`.
 *
 * The tightest of the two spans wins. Averaging spans blends a hairpin with
 * the straight either side and turns every corner into the same medium-speed
 * bend; the wider span only stops a single bad vertex reading as a corner.
 *
 * Resolution is the limit here. The stored centrelines carry roughly 174
 * points per lap, about 33 m apart, so a corner tighter than that spacing is
 * already averaged in the source data and reads wider than it is. See
 * `docs/PHYSICS_ENGINE_2026.md`.
 */
export function trackGeometry(track: TrackDefinition): TrackGeometryPoint[] {
  const points = track.centerline
  const count = points.length
  const at = (index: number) => points[((index % count) + count) % count]
  const planarLengths = points.map((point, index) => {
    const next = at(index + 1)

    return Math.max(1e-6, Math.hypot(next[0] - point[0], next[2] - point[2]))
  })
  const planarLap = planarLengths.reduce((total, length) => total + length, 0)
  const lapMeters = track.lengthKm * 1000
  // The stored layout is in plan units, not metres, so every length measured
  // off it is converted through the published lap distance.
  const metreScale = lapMeters / planarLap
  const segmentLengths = planarLengths.map((length) => length * metreScale)
  const circumradiusAtSpan = (index: number, span: number) => {
    const previous = at(index - span)
    const current = at(index)
    const next = at(index + span)
    const a =
      Math.hypot(current[0] - previous[0], current[2] - previous[2]) *
      metreScale
    const b = Math.hypot(next[0] - current[0], next[2] - current[2]) * metreScale
    const c = Math.hypot(next[0] - previous[0], next[2] - previous[2]) * metreScale
    // Twice the triangle area, by the cross product.
    const twiceArea = Math.abs(
      (current[0] - previous[0]) * (next[2] - previous[2]) -
        (current[2] - previous[2]) * (next[0] - previous[0]),
    ) * metreScale * metreScale

    if (twiceArea < 1e-9) {
      return Number.POSITIVE_INFINITY
    }

    return (a * b * c) / (2 * twiceArea)
  }

  const centrelineRadii = points.map((_, index) =>
    Math.min(circumradiusAtSpan(index, 1), circumradiusAtSpan(index, 2)),
  )
  const signedTurns = points.map((_, index) => {
    const previous = at(index - 1)
    const current = at(index)
    const next = at(index + 1)
    const incomingX = current[0] - previous[0]
    const incomingZ = current[2] - previous[2]
    const outgoingX = next[0] - current[0]
    const outgoingZ = next[2] - current[2]
    const incomingLength = Math.max(1e-9, Math.hypot(incomingX, incomingZ))
    const outgoingLength = Math.max(1e-9, Math.hypot(outgoingX, outgoingZ))
    const dot = clamp(
      (incomingX * outgoingX + incomingZ * outgoingZ) /
        (incomingLength * outgoingLength),
      -1,
      1,
    )
    const magnitude = Math.acos(dot)
    const cross = incomingX * outgoingZ - incomingZ * outgoingX

    return magnitude * (cross >= 0 ? 1 : -1)
  })
  const usableHalfWidthMeters = Math.max(
    0,
    trackWidthMeters(track) / 2 - CAR_HALF_WIDTH_M,
  )
  /** How far the corner this point belongs to turns, in radians. */
  const cornerArcRadians = centrelineRadii.map((radius, index) => {
    if (!Number.isFinite(radius) || radius > CORNER_RADIUS_LIMIT_M) {
      return 0
    }

    let arc = 0

    // Walk both ways while the road is still turning about as tightly, so a
    // long constant-radius corner is measured whole rather than per point.
    for (const direction of [1, -1]) {
      for (let step = 0; step < count / 2; step += 1) {
        const at = index + direction * step
        const neighbour = centrelineRadii[((at % count) + count) % count]

        if (
          !Number.isFinite(neighbour) ||
          neighbour > Math.min(CORNER_RADIUS_LIMIT_M, radius * 3)
        ) {
          break
        }

        arc +=
          segmentLengths[((at % count) + count) % count] / Math.max(1, neighbour)
      }
    }

    return arc
  })

  return points.map((_, index) => {
    const signedTurnRadians = signedTurns[index]
    const turnDirection: -1 | 0 | 1 =
      Math.abs(signedTurnRadians) < 0.002
        ? 0
        : signedTurnRadians > 0
          ? 1
          : -1

    return {
      centrelineRadiusMeters: centrelineRadii[index],
      cornerArcRadians: cornerArcRadians[index],
      radiusMeters: racingLineRadiusMeters({
        centrelineRadiusMeters: centrelineRadii[index],
        cornerArcRadians: cornerArcRadians[index],
        usableHalfWidthMeters,
      }),
      segmentLengthMeters: segmentLengths[index],
      signedTurnRadians,
      turnDirection,
    }
  })
}

function resolveOptions(options: PhysicalLapOptions) {
  const physics = options.physics ?? categoryPhysicsFor(undefined)

  return {
    airDensityKgM3: options.airDensityKgM3 ?? 1.225,
    deploymentPowerKw:
      options.deploymentPowerKw ?? physics.hybridDeploymentPowerLimitKw,
    dragAreaM2: options.dragAreaM2 ?? 1.05 * physics.dragAreaScale,
    gripMultiplier: options.gripMultiplier ?? 1,
    massKg: options.massKg ?? physics.minimumMassKg + 30,
    physics,
  }
}

/** Aerodynamic drag plus rolling resistance, in newtons. */
export function resistanceForceN(
  speedMps: number,
  options: PhysicalLapOptions = {},
) {
  const { airDensityKgM3, dragAreaM2, massKg, physics } =
    resolveOptions(options)
  const speed = Math.max(0, speedMps)

  return (
    0.5 * airDensityKgM3 * dragAreaM2 * speed * speed +
    massKg * GRAVITY_MPS2 * physics.rollingResistanceCoefficient
  )
}

/**
 * Speed where the power unit can no longer overcome drag. This is the physical
 * replacement for the old constant speed ceiling.
 */
export function terminalSpeedMps(options: PhysicalLapOptions = {}) {
  const resolved = resolveOptions(options)
  let low = 0
  let high = 200

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const middle = (low + high) / 2
    const surplus =
      powerUnitDriveForceN({
        deploymentPowerKw: resolved.deploymentPowerKw,
        physics: resolved.physics,
        speedMps: middle,
        throttleFraction: 1,
      }) - resistanceForceN(middle, options)

    if (surplus > 0) {
      low = middle
    } else {
      high = middle
    }
  }

  return (low + high) / 2
}

export type PhysicalLapResult = {
  lapTimeSeconds: number
  speedsMps: number[]
  maximumSpeedKph: number
  minimumSpeedKph: number
  /** One offline planning point for every centreline point. */
  points: PhysicalLapPoint[]
  /** Constant deployment assumption used to construct this reference only. */
  referenceDeploymentPowerKw: number
}

export type PhysicalReferenceLinePhase =
  | 'straight'
  | 'entry'
  | 'apex'
  | 'exit'

export type PhysicalLapPoint = {
  /** Banking applied only to this part of the circuit. */
  bankingDegrees: number
  /** Banking at the end of the current braking event. */
  brakingTargetBankingDegrees: number
  /** Corner radius at the end of the current braking event. */
  brakingTargetCornerRadiusM: number
  /** Speed dictated by tyres, radius and banking before the longitudinal sweeps. */
  corneringSpeedLimitMps: number
  /** Signed inverse effective radius. Zero represents a straight. */
  curvaturePerMeter: number
  /** Distance from this point to the braking target, or zero off the brakes. */
  brakingDistanceAheadMeters: number
  /** Reference speed at the end of the current braking event. */
  brakingTargetSpeedMps: number
  /** Finite racing-line radius; a very large value represents a straight. */
  effectiveCornerRadiusM: number
  /** Physical lateral offset from the centreline, in metres. */
  referenceLineOffsetM: number
  referenceLinePhase: PhysicalReferenceLinePhase
  /** Speed selected by the complete forward/backward physical envelope. */
  referenceSpeedMps: number
  /** Average deceleration needed to reach the target, or zero off the brakes. */
  requiredBrakingDecelerationMps2: number
  segmentLengthMeters: number
  signedTurnRadians: number
  turnDirection: -1 | 0 | 1
}

const STRAIGHT_EFFECTIVE_RADIUS_M = 1_000_000_000

function referenceLinePlanAt(
  geometry: TrackGeometryPoint[],
  index: number,
  usableHalfWidthMeters: number,
) {
  const point = geometry[index]

  if (point.turnDirection === 0 || !Number.isFinite(point.radiusMeters)) {
    return {
      offsetM: 0,
      phase: 'straight' as const,
    }
  }

  const curvatureAt = (candidateIndex: number) => {
    const candidate =
      geometry[
        ((candidateIndex % geometry.length) + geometry.length) %
          geometry.length
      ]

    return Number.isFinite(candidate.radiusMeters)
      ? 1 / Math.max(1, candidate.radiusMeters)
      : 0
  }
  const curvature = curvatureAt(index)
  const previousCurvature = curvatureAt(index - 3)
  const nextCurvature = curvatureAt(index + 3)
  const phase: PhysicalReferenceLinePhase =
    nextCurvature > curvature * 1.08
      ? 'entry'
      : previousCurvature > curvature * 1.08
        ? 'exit'
        : 'apex'
  const realisedHalfWidth =
    Math.max(0, usableHalfWidthMeters) * RACING_LINE_REALISATION
  const offsetM =
    phase === 'apex'
      ? -point.turnDirection * realisedHalfWidth
      : phase === 'entry'
        ? point.turnDirection * realisedHalfWidth * 0.85
        : point.turnDirection * realisedHalfWidth * 0.65

  return { offsetM, phase }
}

/**
 * Speed at every point and the lap time that follows.
 *
 * Both sweeps ask the tyre model what is left after cornering: a car using
 * most of its grip to turn cannot also brake at its peak rate, which is what
 * makes a long corner cost more than its apex speed alone suggests.
 */
export function simulatePhysicalLap(
  track: TrackDefinition,
  options: PhysicalLapOptions = {},
): PhysicalLapResult {
  const resolved = resolveOptions(options)
  const geometry = trackGeometry(track)
  const count = geometry.length
  const ceilingMps = terminalSpeedMps(options)
  const gripArgs = {
    airDensityKgM3: resolved.airDensityKgM3,
    // The transient efficiency rides on the same multiplier the surface and
    // compound state use, so it reduces cornering, braking and traction
    // together rather than only one of them.
    gripMultiplier: resolved.gripMultiplier * DRIVER_TRANSIENT_EFFICIENCY,
    massKg: resolved.massKg,
    physics: resolved.physics,
  }
  // Keep the lateral limit separate from the offline reference envelope. The
  // latter is capped by the reference PU/drag policy so a quasi-steady lap can
  // be integrated, but live control must never mistake that terminal-speed
  // assumption for a cornering limit on a straight.
  const corneringSpeedLimits = geometry.map((point, index) => {
    const lateralSearchCeilingMps = Math.max(200, ceilingMps * 1.5)
    const limit = corneringSpeedLimitMps({
      ...gripArgs,
      // Banking only helps where the road is actually turning.
      bankingDegrees: Number.isFinite(point.centrelineRadiusMeters)
        ? bankingDegreesAt(track, index / count)
        : 0,
      ceilingMps: lateralSearchCeilingMps,
      radiusMeters: point.radiusMeters,
    })

    return Number.isFinite(limit) ? limit : lateralSearchCeilingMps
  })
  const speeds = corneringSpeedLimits.map((limit) =>
    Math.min(ceilingMps, limit),
  )
  /** Fraction of the friction ellipse already spent turning at this speed. */
  const lateralUseFraction = (index: number, speedMps: number) => {
    const radius = geometry[index].radiusMeters

    if (!Number.isFinite(radius)) {
      return 0
    }

    const grip = tyreGripAt({ ...gripArgs, speedMps })
    const demandN = (resolved.massKg * speedMps * speedMps) / radius

    return clamp(demandN / Math.max(1, grip.availableForceN), 0, 1)
  }
  const tractionLimitedAccelerationMps2 = (index: number, speedMps: number) => {
    const grip = tyreGripAt({ ...gripArgs, speedMps })
    const longitudinalBudgetN = remainingEllipseForceN({
      availableForceN: grip.availableForceN,
      usedForceN:
        grip.availableForceN * lateralUseFraction(index, speedMps),
    })
    const driveForceN = Math.min(
      powerUnitDriveForceN({
        deploymentPowerKw: resolved.deploymentPowerKw,
        physics: resolved.physics,
        speedMps,
        throttleFraction: 1,
      }),
      longitudinalBudgetN,
    )

    return (
      (driveForceN - resistanceForceN(speedMps, options)) / resolved.massKg
    )
  }
  const brakingDecelerationMps2 = (index: number, speedMps: number) => {
    const grip = tyreGripAt({ ...gripArgs, speedMps })
    const longitudinalBudgetN = remainingEllipseForceN({
      availableForceN: grip.availableForceN,
      usedForceN:
        grip.availableForceN * lateralUseFraction(index, speedMps),
    })
    // The brake system is its own ceiling; downforce is what lets the tyres
    // use more than it at speed, so the tyre budget can be the binding limit
    // low down and the brakes the binding limit high up.
    const brakeForceN = Math.min(
      longitudinalBudgetN,
      resolved.physics.maximumBrakeDecelerationMps2 * resolved.massKg,
    )

    return (
      (brakeForceN + resistanceForceN(speedMps, options)) / resolved.massKg
    )
  }

  // Two laps of each sweep so the profile closes on itself at the line.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let step = 0; step < count; step += 1) {
      const index = step % count
      const nextIndex = (index + 1) % count
      const accelerationMps2 = Math.max(
        0,
        tractionLimitedAccelerationMps2(index, speeds[index]),
      )
      const reachableMps = Math.sqrt(
        Math.max(
          0,
          speeds[index] ** 2 +
            2 * accelerationMps2 * geometry[index].segmentLengthMeters,
        ),
      )

      speeds[nextIndex] = Math.min(speeds[nextIndex], reachableMps)
    }

    for (let step = count - 1; step >= 0; step -= 1) {
      const index = step % count
      const nextIndex = (index + 1) % count
      const decelerationMps2 = brakingDecelerationMps2(
        nextIndex,
        speeds[nextIndex],
      )
      const entryMps = Math.sqrt(
        Math.max(
          0,
          speeds[nextIndex] ** 2 +
            2 * decelerationMps2 * geometry[index].segmentLengthMeters,
        ),
      )

      speeds[index] = Math.min(speeds[index], entryMps)
    }
  }

  const lapTimeSeconds = geometry.reduce((total, point, index) => {
    const entryMps = speeds[index]
    const exitMps = speeds[(index + 1) % count]
    // Trapezoidal in speed over the segment rather than a single endpoint.
    const averageMps = Math.max(1, (entryMps + exitMps) / 2)

    return total + point.segmentLengthMeters / averageMps
  }, 0)
  const usableHalfWidthMeters = Math.max(
    0,
    trackWidthMeters(track) / 2 - CAR_HALF_WIDTH_M,
  )
  const points = geometry.map((point, index): PhysicalLapPoint => {
    const currentSpeedMps = speeds[index]
    const nextSpeedMps = speeds[(index + 1) % count]
    let brakingTargetSpeedMps = currentSpeedMps
    let brakingDistanceAheadMeters = 0
    let brakingTargetIndex = index

    // A braking event is the monotonically falling portion of the completed
    // reference envelope. Its target is the local minimum at the end of that
    // event, rather than a speed guessed from a fixed look-ahead window.
    if (nextSpeedMps < currentSpeedMps - 1e-6) {
      let distanceMeters = 0
      let previousSpeedMps = currentSpeedMps

      for (let step = 1; step < count; step += 1) {
        distanceMeters +=
          geometry[(index + step - 1) % count].segmentLengthMeters
        const candidateSpeedMps = speeds[(index + step) % count]

        if (candidateSpeedMps < brakingTargetSpeedMps) {
          brakingTargetSpeedMps = candidateSpeedMps
          brakingDistanceAheadMeters = distanceMeters
          brakingTargetIndex = (index + step) % count
        }

        if (candidateSpeedMps > previousSpeedMps + 1e-6) {
          break
        }

        previousSpeedMps = candidateSpeedMps
      }
    }

    const requiredBrakingDecelerationMps2 =
      brakingDistanceAheadMeters > 0
        ? Math.max(
            0,
            (currentSpeedMps ** 2 - brakingTargetSpeedMps ** 2) /
              (2 * brakingDistanceAheadMeters),
          )
        : 0
    const effectiveCornerRadiusM = Number.isFinite(point.radiusMeters)
      ? point.radiusMeters
      : STRAIGHT_EFFECTIVE_RADIUS_M
    const referenceLine = referenceLinePlanAt(
      geometry,
      index,
      usableHalfWidthMeters,
    )

    return {
      bankingDegrees: Number.isFinite(point.centrelineRadiusMeters)
        ? bankingDegreesAt(track, index / count)
        : 0,
      brakingDistanceAheadMeters,
      brakingTargetBankingDegrees: Number.isFinite(
        geometry[brakingTargetIndex].centrelineRadiusMeters,
      )
        ? bankingDegreesAt(track, brakingTargetIndex / count)
        : 0,
      brakingTargetCornerRadiusM: Number.isFinite(
        geometry[brakingTargetIndex].radiusMeters,
      )
        ? geometry[brakingTargetIndex].radiusMeters
        : STRAIGHT_EFFECTIVE_RADIUS_M,
      brakingTargetSpeedMps,
      corneringSpeedLimitMps: corneringSpeedLimits[index],
      curvaturePerMeter:
        point.turnDirection === 0
          ? 0
          : point.turnDirection / effectiveCornerRadiusM,
      effectiveCornerRadiusM,
      referenceLineOffsetM: referenceLine.offsetM,
      referenceLinePhase: referenceLine.phase,
      referenceSpeedMps: currentSpeedMps,
      requiredBrakingDecelerationMps2,
      segmentLengthMeters: point.segmentLengthMeters,
      signedTurnRadians: point.signedTurnRadians,
      turnDirection: point.turnDirection,
    }
  })

  return {
    lapTimeSeconds,
    maximumSpeedKph: Math.max(...speeds) * 3.6,
    minimumSpeedKph: Math.min(...speeds) * 3.6,
    points,
    referenceDeploymentPowerKw: resolved.deploymentPowerKw,
    speedsMps: speeds,
  }
}

/** Peak downforce the car generates anywhere on the lap, in newtons. */
export function peakDownforceN(
  result: PhysicalLapResult,
  options: PhysicalLapOptions = {},
) {
  const resolved = resolveOptions(options)

  return aerodynamicDownforceN({
    airDensityKgM3: resolved.airDensityKgM3,
    liftAreaM2: resolved.physics.liftAreaM2,
    speedMps: result.maximumSpeedKph / 3.6,
  })
}
