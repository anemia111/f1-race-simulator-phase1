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
import { activeAeroZoneAt } from './activeAero'
import {
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
  type CategoryPhysicsProfile,
} from './categoryPhysics'
import { powerUnitDriveForceN } from './drivetrain'
import {
  deploymentPowerLimitKwForSpeed,
  FIA_2026_REGULATION_PROFILE,
} from './regulations'
import { FORMULA_VEHICLE_HALF_WIDTH_M } from './vehicleGeometry'
import { activeAeroReferenceAreaMultipliers } from './vehicleDynamics'
import {
  aerodynamicDownforceN,
  corneringSpeedLimitMps,
  GRAVITY_MPS2,
  remainingEllipseForceN,
  tyreGripAt,
} from './tyreForces'
import type { TrackDefinition, WeekendStage } from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type PhysicalLapOptions = {
  airDensityKgM3?: number
  /** Frontal drag area in m^2, from `vehicleDragAreaM2` for a real car. */
  dragAreaM2?: number
  /** Surface and compound state, as in `tyreForces`. */
  gripMultiplier?: number
  /** Authoritative FIA event input; null/omission keeps it unavailable. */
  fiaNominalTyreMassKg?: number | null
  /** C4.1/C4.6 mass added by a declared heat hazard. */
  heatHazardAddedMassKg?: number
  massKg?: number
  /**
   * MGU-K deployment assumed available under acceleration while constructing
   * an offline reference profile. This is never a live Energy Store command.
   */
  deploymentPowerKw?: number
  /**
   * MGU-K energy the lap is allowed to spend, in MJ.
   *
   * Omitted, an F1 lap takes the regulation's qualifying recharge limit,
   * because a reference lap that spends more than the rules permit is not a
   * lap the rules allow however well its time matches. `null` removes the
   * budget and restores the unbounded capability envelope; only a consumer
   * that wants "what the car could do here" rather than "what one lap does"
   * should ask for that.
   */
  deploymentEnergyBudgetMj?: number | null
  /**
   * Whether the lap opens the active-aero flap in the circuit's declared
   * zones. True for any caller asking what one lap does.
   *
   * A caller that wants the car's capability envelope rather than a particular
   * lap should pass false, and generally wants `deploymentEnergyBudgetMj:
   * null` for the same reason. Braking uses Corner Mode; inside an activation
   * zone, drag and load come from the same decomposed front/rear reference map.
   */
  activeAeroZones?: boolean
  physics?: CategoryPhysicsProfile
  /** Defaults to qualifying because this is an offline reference lap. */
  weekendStage?: WeekendStage
}

/**
 * Deployment policy used only by the offline/reference lap planner.
 *
 * The planner grants the category power limit, bounded by the regulation's
 * speed ramp and by a lap energy budget. A live simulation must instead pass
 * the power authorised by its Energy Store and deployment state into the
 * drivetrain on every tick. This policy deliberately has no state-of-charge or
 * harvesting model: it spends a fixed allowance and never asks where the
 * allowance came from.
 */
export const REFERENCE_DEPLOYMENT_POLICY = {
  scope: 'offline-reference-only',
  strategy: 'regulation-energy-budget-by-marginal-value',
} as const

/**
 * How many times the allocation is re-costed against the profile it produced.
 *
 * The ranking is computed once, from the fully deployed profile, so it cannot
 * oscillate. Only the point where the budget runs out moves: withdrawing
 * deployment slows the car, a slower car spends longer on each segment, and
 * the same segments therefore cost more than they did at full power. Three
 * passes is where the spend stops moving by more than a few kJ on the
 * circuits in the calibration split.
 */
const DEPLOYMENT_ALLOCATION_PASSES = 3

/**
 * How many times the finished profile is given back the energy it overspent.
 *
 * The exact Issue 20 speed curve can move a segment across a piecewise power
 * boundary after a sweep. Five bounded passes let the final profile settle to
 * sub-kJ agreement after that boundary movement; this is numerical
 * convergence, not an additional energy allowance.
 */
const DEPLOYMENT_TRIM_PASSES = 5

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
export const DRIVER_TRANSIENT_EFFICIENCY = 0.97

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
    trackWidthMeters(track) / 2 - FORMULA_VEHICLE_HALF_WIDTH_M,
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


/**
 * The reference lap is offline, but it is still a 2026 car: the regulation's
 * speed-based MGU-K ramp applies here exactly as it does live, or the offline
 * profile would report a terminal speed the live car can never reach.
 * Manual Override is a driver action and has no place on a reference lap, so
 * the standard cutoff is used.
 */
const permittedDeploymentKw = (requestedPowerKw: number, speedMps: number) =>
  deploymentPowerLimitKwForSpeed({
    curve: 'normal',
    requestedPowerKw,
    speedKph: Math.max(0, speedMps) * 3.6,
  })

/**
 * Lap energy allowance, in MJ, or null where the concept does not apply.
 *
 * A category with no MGU-K has nothing to budget. For one that has, the
 * allowance is what a clear qualifying lap can actually put on the road, which
 * is the sum of two published numbers and not a fitted one:
 *
 * - `qualifyingRechargeLimitMj`, the energy the lap may recover as it runs;
 * - `usableStateOfChargeWindowMj`, the store the car arrives with, having
 *   filled it on the out lap.
 *
 * The recharge limit alone would describe a lap repeated forever in a steady
 * state, and the reference lap is documented as the opposite of that: a single
 * clear attack lap. A driver on that lap empties the store and banks nothing
 * for the next one, which is why the window is spendable here and is not
 * double counting. `energySystem.ts` reaches the same total from the other
 * side, capping recovery per lap and letting deployment draw the store down.
 */
function resolveEnergyBudgetMj(
  options: PhysicalLapOptions,
  physics: CategoryPhysicsProfile,
) {
  if (physics.hybridDeploymentPowerLimitKw <= 0) {
    return null
  }

  if (options.deploymentEnergyBudgetMj === undefined) {
    return (
      FIA_2026_REGULATION_PROFILE.energy.qualifyingRechargeLimitMj +
      FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj
    )
  }

  const requested = options.deploymentEnergyBudgetMj

  return requested === null || !Number.isFinite(requested)
    ? null
    : Math.max(0, requested)
}

function resolveOptions(options: PhysicalLapOptions) {
  const physics = options.physics ?? categoryPhysicsFor(undefined)
  const operationalMass = resolveOperationalVehicleMass({
    f1NominalTyreMassKg: options.fiaNominalTyreMassKg ?? null,
    heatHazardAddedMassKg: options.heatHazardAddedMassKg,
    physics,
    weekendStage: options.weekendStage ?? 'qualifying',
  })

  return {
    airDensityKgM3: options.airDensityKgM3 ?? 1.225,
    deploymentEnergyBudgetMj: resolveEnergyBudgetMj(options, physics),
    deploymentPowerKw:
      options.deploymentPowerKw ?? physics.hybridDeploymentPowerLimitKw,
    dragAreaM2: options.dragAreaM2 ?? 1.05 * physics.dragAreaScale,
    gripMultiplier: options.gripMultiplier ?? 1,
    massKg: options.massKg ?? operationalMass.operationalMassKg + 30,
    physics,
  }
}

/**
 * Aerodynamic drag plus rolling resistance, in newtons.
 *
 * `dragAreaScale` is a pure area ratio supplied by the decomposed front/rear
 * active-aero reference adapter. It is not a target-speed correction.
 */
export function resistanceForceN(
  speedMps: number,
  options: PhysicalLapOptions = {},
  dragAreaScale = 1,
) {
  const { airDensityKgM3, dragAreaM2, massKg, physics } =
    resolveOptions(options)
  const speed = Math.max(0, speedMps)

  return (
    0.5 * airDensityKgM3 * dragAreaM2 * dragAreaScale * speed * speed +
    massKg * GRAVITY_MPS2 * physics.rollingResistanceCoefficient
  )
}

/**
 * Speed where the power unit can no longer overcome drag. This is the physical
 * replacement for the old constant speed ceiling.
 */
export function terminalSpeedMps(
  options: PhysicalLapOptions = {},
  dragAreaScale = 1,
) {
  const resolved = resolveOptions(options)
  let low = 0
  let high = 200

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const middle = (low + high) / 2
    const surplus =
      powerUnitDriveForceN({
        deploymentPowerKw: permittedDeploymentKw(
          resolved.deploymentPowerKw,
          middle,
        ),
        physics: resolved.physics,
        speedMps: middle,
        throttleFraction: 1,
      }) - resistanceForceN(middle, options, dragAreaScale)

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
  /**
   * MGU-K energy the lap assumes, in megajoules.
   *
   * `REFERENCE_DEPLOYMENT_POLICY` grants the category limit wherever full
   * power is requested and keeps no account of what that costs, so this is
   * what the lap spends rather than what it is allowed. Comparing it with
   * `FIA_2026_REGULATION_PROFILE.energy` is the point of reporting it:
   * a lap that spends more than the regulation permits is not a lap the rules
   * allow, however well its time matches.
   */
  deploymentEnergyMj: number
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
  // The offline lap reads the same declared zones as live runtime, but at the
  // category prior's neutral point because pitch, yaw, setup and wake are not
  // observations available to this planner.
  const cornerAeroAreas = activeAeroReferenceAreaMultipliers({
    activeAeroState: {
      frontStraightFraction: 0,
      rearStraightFraction: 0,
      transitionProgress: 1,
    },
    categoryPhysics: resolved.physics,
  })
  const straightAeroAreas = activeAeroReferenceAreaMultipliers({
    activeAeroState: {
      frontStraightFraction: 1,
      rearStraightFraction: 1,
      transitionProgress: 1,
    },
    categoryPhysics: resolved.physics,
  })
  const aeroAreasAt = geometry.map((_, index) =>
    options.activeAeroZones !== false &&
    activeAeroZoneAt(track, index / count)
      ? straightAeroAreas
      : cornerAeroAreas,
  )
  const dragScaleAt = aeroAreasAt.map(({ dragAreaMultiplier }) =>
    dragAreaMultiplier,
  )
  const cornerCeilingMps = terminalSpeedMps(options)
  const straightCeilingMps = terminalSpeedMps(
    options,
    straightAeroAreas.dragAreaMultiplier,
  )
  const ceilingAt = dragScaleAt.map((scale) =>
    scale < 1 ? straightCeilingMps : cornerCeilingMps,
  )
  const ceilingMps = straightCeilingMps
  const gripArgs = {
    airDensityKgM3: resolved.airDensityKgM3,
    // The transient efficiency rides on the same multiplier the surface and
    // compound state use, so it reduces cornering, braking and traction
    // together rather than only one of them.
    gripMultiplier: resolved.gripMultiplier * DRIVER_TRANSIENT_EFFICIENCY,
    massKg: resolved.massKg,
  }
  const physicsAt = (index: number) => ({
    ...resolved.physics,
    liftAreaM2:
      resolved.physics.liftAreaM2 *
      aeroAreasAt[index].downforceAreaMultiplier,
  })
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
      physics: physicsAt(index),
      radiusMeters: point.radiusMeters,
    })

    return Number.isFinite(limit) ? limit : lateralSearchCeilingMps
  })
  /**
   * Share of the deployment limit this segment is allowed to draw.
   *
   * The lap starts unbudgeted; `allocateDeployment` below replaces this once
   * the profile it produces has been costed against the energy allowance.
   */
  let deploymentShare = new Array<number>(count).fill(1)
  let speeds = corneringSpeedLimits.map((limit, index) =>
    Math.min(ceilingAt[index], limit),
  )
  /** Fraction of the friction ellipse already spent turning at this speed. */
  const lateralUseFraction = (index: number, speedMps: number) => {
    const radius = geometry[index].radiusMeters

    if (!Number.isFinite(radius)) {
      return 0
    }

    const grip = tyreGripAt({
      ...gripArgs,
      physics: physicsAt(index),
      speedMps,
    })
    const demandN = (resolved.massKg * speedMps * speedMps) / radius

    return clamp(demandN / Math.max(1, grip.availableForceN), 0, 1)
  }
  /**
   * Longitudinal acceleration available at a point, drawing `share` of the
   * permitted MGU-K power. `share` 0 is the combustion engine alone.
   */
  const accelerationWithShareMps2 = (
    index: number,
    speedMps: number,
    share: number,
  ) => {
    const grip = tyreGripAt({
      ...gripArgs,
      physics: physicsAt(index),
      speedMps,
    })
    const longitudinalBudgetN = remainingEllipseForceN({
      availableForceN: grip.availableForceN,
      usedForceN:
        grip.availableForceN * lateralUseFraction(index, speedMps),
    })
    const driveForceN = Math.min(
      powerUnitDriveForceN({
        deploymentPowerKw: permittedDeploymentKw(
          resolved.deploymentPowerKw * share,
          speedMps,
        ),
        physics: resolved.physics,
        speedMps,
        throttleFraction: 1,
      }),
      longitudinalBudgetN,
    )

    return (
      (driveForceN -
        resistanceForceN(speedMps, options, dragScaleAt[index])) /
      resolved.massKg
    )
  }
  const tractionLimitedAccelerationMps2 = (index: number, speedMps: number) =>
    accelerationWithShareMps2(index, speedMps, deploymentShare[index])
  const brakingDecelerationMps2 = (index: number, speedMps: number) => {
    const grip = tyreGripAt({
      ...gripArgs,
      // The driver-adjustable bodywork returns to Corner Mode on the brakes.
      physics: resolved.physics,
      speedMps,
    })
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

    // Braking runs the closed-wing drag area even inside a zone: the flap
    // shuts on the brake pedal, so a car slowing down never has the shed drag
    // helping it stop.
    return (
      (brakeForceN + resistanceForceN(speedMps, options)) / resolved.massKg
    )
  }

  /** The complete envelope for the deployment shares currently in force. */
  const sweepSpeeds = () => {
    const profile = corneringSpeedLimits.map((limit, index) =>
      Math.min(ceilingAt[index], limit),
    )

    // Two laps of each sweep so the profile closes on itself at the line.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let step = 0; step < count; step += 1) {
        const index = step % count
        const nextIndex = (index + 1) % count
        const accelerationMps2 = Math.max(
          0,
          tractionLimitedAccelerationMps2(index, profile[index]),
        )
        const reachableMps = Math.sqrt(
          Math.max(
            0,
            profile[index] ** 2 +
              2 * accelerationMps2 * geometry[index].segmentLengthMeters,
          ),
        )

        profile[nextIndex] = Math.min(profile[nextIndex], reachableMps)
      }

      for (let step = count - 1; step >= 0; step -= 1) {
        const index = step % count
        const nextIndex = (index + 1) % count
        const decelerationMps2 = brakingDecelerationMps2(
          nextIndex,
          profile[nextIndex],
        )
        const entryMps = Math.sqrt(
          Math.max(
            0,
            profile[nextIndex] ** 2 +
              2 * decelerationMps2 * geometry[index].segmentLengthMeters,
          ),
        )

        profile[index] = Math.min(profile[index], entryMps)
      }
    }

    return profile
  }

  /**
   * Seconds and megajoules a segment costs when it draws `share`, taken on its
   * own from a given entry speed. This is the marginal quantity the ranking
   * needs; what the lap is actually billed is `energyDrawMj` below.
   */
  const segmentCost = (index: number, entryMps: number, share: number) => {
    const lengthMeters = geometry[index].segmentLengthMeters
    const accelerationMps2 = accelerationWithShareMps2(index, entryMps, share)
    const exitMps = Math.sqrt(
      Math.max(0, entryMps ** 2 + 2 * accelerationMps2 * lengthMeters),
    )
    // The same trapezoidal rule the lap time and the energy integral use, so a
    // segment's ranking and its bill are computed the same way.
    const averageMps = Math.max(1, (entryMps + exitMps) / 2)
    const seconds = lengthMeters / averageMps

    return {
      energyMj:
        (permittedDeploymentKw(resolved.deploymentPowerKw * share, averageMps) *
          seconds) /
        1000,
      seconds,
    }
  }

  /**
   * What a segment adds to the lap's bill in a completed profile.
   *
   * This is the energy integral's own rule, and the allocation has to use it
   * too. A segment where the finished lap is braking or holding a cornering
   * limit is not drive-force limited, so deployment there changes nothing and
   * is charged nothing; costing it as if it were spent would make the
   * allocation buy far less than the allowance actually pays for.
   */
  const energyDrawMj = (
    index: number,
    profile: number[],
    share = 1,
  ) => {
    const entryMps = profile[index]
    const exitMps = profile[(index + 1) % count]

    if (exitMps <= entryMps) {
      return 0
    }

    const averageMps = Math.max(1, (entryMps + exitMps) / 2)

    return (
      (permittedDeploymentKw(
        resolved.deploymentPowerKw * clamp(share, 0, 1),
        averageMps,
      ) *
        (geometry[index].segmentLengthMeters / averageMps)) /
      1000
    )
  }

  /**
   * Finds the greatest request share whose exact, speed-limited energy draw is
   * affordable. A proportional share is wrong near a C5.2.8 boundary because
   * the regulatory cap can hold output flat while requested power is reduced.
   */
  const affordableDeploymentShare = (
    index: number,
    profile: number[],
    affordableMj: number,
    maximumShare = 1,
  ) => {
    let lower = 0
    let upper = clamp(maximumShare, 0, 1)

    for (let iteration = 0; iteration < 32; iteration += 1) {
      const candidate = (lower + upper) / 2

      if (energyDrawMj(index, profile, candidate) <= affordableMj) {
        lower = candidate
      } else {
        upper = candidate
      }
    }

    return lower
  }

  /**
   * Spends the lap's MGU-K allowance where it buys the most lap time.
   *
   * At constant power the extra force is P/v, so the time a joule buys falls
   * steeply with speed: a segment's value works out proportional to its length
   * over the cube of its speed. Slow corner exits therefore come first and the
   * top end of a straight comes last, which is where a real driver spends the
   * allowance and why spending it evenly is the wrong comparison. Two effects
   * fall out of ranking by measured value rather than by speed alone: a
   * traction-limited exit is skipped, because electrical power the tyres
   * cannot put down buys nothing, and so is anything above the regulation's
   * speed ramp, because there is no power to spend there.
   *
   * The ranking is taken once, from the fully deployed profile. Only the point
   * where the allowance runs out is re-costed, so the allocation cannot chase
   * its own output around in a circle.
   */
  const rankedCandidates = () => {
    const fullyDeployed = speeds

    return geometry
      .map((_point, index) => {
        const entryMps = fullyDeployed[index]
        const deployed = segmentCost(index, entryMps, 1)
        const coasting = segmentCost(index, entryMps, 0)
        const benefitSeconds = coasting.seconds - deployed.seconds

        return {
          index,
          value:
            deployed.energyMj > 1e-9 && benefitSeconds > 1e-9
              ? benefitSeconds / deployed.energyMj
              : 0,
        }
      })
      .filter((candidate) => candidate.value > 0)
      .sort((left, right) =>
        right.value === left.value
          ? left.index - right.index
          : right.value - left.value,
      )
      .map((candidate) => candidate.index)
  }

  speeds = sweepSpeeds()

  if (resolved.deploymentEnergyBudgetMj !== null) {
    const order = rankedCandidates()

    for (let pass = 0; pass < DEPLOYMENT_ALLOCATION_PASSES; pass += 1) {
      const next = new Array<number>(count).fill(0)
      let remainingMj = resolved.deploymentEnergyBudgetMj

      for (const index of order) {
        if (remainingMj <= 0) {
          break
        }

        const drawMj = energyDrawMj(index, speeds)

        if (drawMj <= 0) {
          // Free: the finished lap is not drive-force limited here, so the
          // share cannot change either the speed or the bill.
          next[index] = 1
          continue
        }

        // The segment the allowance runs out on takes the share it can pay
        // for, rather than being switched off, so the profile stays continuous.
        next[index] =
          remainingMj >= drawMj
            ? 1
            : affordableDeploymentShare(index, speeds, remainingMj)
        remainingMj -= energyDrawMj(index, speeds, next[index])
      }

      deploymentShare = next
      speeds = sweepSpeeds()
    }

    // Each allocation is costed against the profile it inherited, and the
    // profile it produces is slightly slower, so the finished lap can end a
    // few hundred joules the wrong side of the allowance. Give the lowest
    // valued granted segments back until it is inside. Trimming only ever
    // removes energy, so this cannot run away.
    for (let trim = 0; trim < DEPLOYMENT_TRIM_PASSES; trim += 1) {
      const spentMj = order.reduce(
        (total, index) =>
          total + energyDrawMj(index, speeds, deploymentShare[index]),
        0,
      )
      let excessMj = spentMj - resolved.deploymentEnergyBudgetMj

      if (excessMj <= 0) {
        break
      }

      for (let rank = order.length - 1; rank >= 0 && excessMj > 0; rank -= 1) {
        const index = order[rank]
        const spentHereMj = energyDrawMj(
          index,
          speeds,
          deploymentShare[index],
        )

        if (spentHereMj <= 0) {
          continue
        }

        const targetMj = Math.max(0, spentHereMj - excessMj)
        const nextShare = affordableDeploymentShare(
          index,
          speeds,
          targetMj,
          deploymentShare[index],
        )
        const releasedMj =
          spentHereMj - energyDrawMj(index, speeds, nextShare)
        deploymentShare[index] = nextShare
        excessMj -= releasedMj
      }

      speeds = sweepSpeeds()
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
    trackWidthMeters(track) / 2 - FORMULA_VEHICLE_HALF_WIDTH_M,
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

  // Deployment is drawn wherever the lap is gaining speed, at the share the
  // allocation granted that segment. Integrating the permitted power over
  // exactly those segments gives what the finished lap spends, which is the
  // number `deployment-energy-budget` compares with the regulation.
  const deploymentEnergyMj = geometry.reduce(
    (total, _point, index) =>
      total + energyDrawMj(index, speeds, deploymentShare[index]),
    0,
  )

  return {
    deploymentEnergyMj,
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
