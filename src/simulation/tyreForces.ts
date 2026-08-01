/**
 * Tyre force model.
 *
 * `tires.ts` owns tyre *condition* — compound, wear, temperature, the cliff.
 * This module owns tyre *force*: how much grip a loaded tyre can actually
 * deliver, and how that grip is shared between accelerating, braking and
 * cornering.
 *
 * The engine used to express grip as a multiplier on a target speed. Here the
 * chain is physical:
 *
 *   vertical load  =  weight + aerodynamic downforce +/- load transfer
 *   friction       =  peak coefficient, reduced as load rises
 *   available force=  friction x vertical load
 *   combined use   =  a friction ellipse shared by both axes
 *
 * That is what makes a fast corner behave differently from a hairpin without
 * anything being told about corner types: downforce scales with v^2, so at
 * speed the car has grip it simply does not have at 80 km/h.
 */
import type { CategoryPhysicsProfile } from './categoryPhysics'

export const GRAVITY_MPS2 = 9.80665

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * Aerodynamic vertical load, the same `0.5 * rho * A * v^2` form as drag.
 * `liftAreaM2` already folds the coefficient into the area.
 */
export function aerodynamicDownforceN(options: {
  airDensityKgM3: number
  liftAreaM2: number
  speedMps: number
}) {
  const { airDensityKgM3, liftAreaM2, speedMps } = options
  const speed = Math.max(0, speedMps)

  return 0.5 * airDensityKgM3 * Math.max(0, liftAreaM2) * speed * speed
}

/**
 * Load sensitivity: a tyre carrying twice the load does not make twice the
 * force. `mu = mu0 * (Fz / Fz_ref)^-k`.
 *
 * This is why load transfer costs time. Under braking the front gains what the
 * rear loses, but the front's grip rises by less than the rear's falls, so the
 * axle pair is worse off than it was in balance.
 */
export function tyreFrictionCoefficient(options: {
  physics: CategoryPhysicsProfile
  referenceLoadN: number
  verticalLoadN: number
}) {
  const { physics, referenceLoadN, verticalLoadN } = options
  const reference = Math.max(1, referenceLoadN)
  const load = Math.max(1, verticalLoadN)

  return (
    physics.peakTyreFrictionCoefficient *
    Math.pow(load / reference, -physics.tyreLoadSensitivity)
  )
}

export type TyreGripState = {
  /** Total vertical load on all four tyres, in newtons. */
  verticalLoadN: number
  /** Load-sensitive friction coefficient at that load. */
  frictionCoefficient: number
  /** Total horizontal force the tyres can carry, in newtons. */
  availableForceN: number
  /** That force expressed as an acceleration, in m/s^2. */
  availableAccelerationMps2: number
}

/**
 * Grip available to the whole car at a given speed. `gripMultiplier` carries
 * the existing surface and compound state from `tires.ts` so wet running, a
 * green track and a worn set still reduce grip — but they now reduce a force
 * rather than a speed.
 */
export function tyreGripAt(options: {
  airDensityKgM3?: number
  gripMultiplier?: number
  massKg: number
  physics: CategoryPhysicsProfile
  speedMps: number
}): TyreGripState {
  const {
    airDensityKgM3 = 1.225,
    gripMultiplier = 1,
    massKg,
    physics,
    speedMps,
  } = options
  const weightN = Math.max(1, massKg) * GRAVITY_MPS2
  const downforceN = aerodynamicDownforceN({
    airDensityKgM3,
    liftAreaM2: physics.liftAreaM2,
    speedMps,
  })
  const verticalLoadN = weightN + downforceN
  // Static weight is the reference, so the coefficient equals the published
  // peak when the car is standing still and falls away under aerodynamic load.
  const frictionCoefficient =
    tyreFrictionCoefficient({
      physics,
      referenceLoadN: weightN,
      verticalLoadN,
    }) * clamp(gripMultiplier, 0.05, 1.2)
  const availableForceN = frictionCoefficient * verticalLoadN

  return {
    availableAccelerationMps2: availableForceN / Math.max(1, massKg),
    availableForceN,
    frictionCoefficient,
    verticalLoadN,
  }
}

/**
 * Friction ellipse. A tyre already spending grip along one axis has less left
 * for the other: `(Fx/Fmax)^2 + (Fy/Fmax)^2 <= 1`.
 *
 * Returns the force still available on the second axis. Trail braking and
 * power-down on corner exit both fall out of this rather than being scripted.
 */
export function remainingEllipseForceN(options: {
  availableForceN: number
  usedForceN: number
}) {
  const available = Math.max(0, options.availableForceN)
  const used = clamp(Math.abs(options.usedForceN), 0, available)
  const remainingFraction = Math.sqrt(
    Math.max(0, 1 - (used / Math.max(1, available)) ** 2),
  )

  return available * remainingFraction
}

export type AxleLoads = {
  frontN: number
  rearN: number
}

/**
 * Longitudinal load transfer. Braking moves `m * a * h / L` onto the front
 * axle and takes it off the rear; acceleration does the reverse.
 *
 * `longitudinalAccelerationMps2` is positive under acceleration and negative
 * under braking.
 */
export function axleLoadsN(options: {
  longitudinalAccelerationMps2: number
  massKg: number
  physics: CategoryPhysicsProfile
  totalVerticalLoadN: number
  /** Static front weight distribution; F1 sits near 45 % front. */
  staticFrontShare?: number
}): AxleLoads {
  const {
    longitudinalAccelerationMps2,
    massKg,
    physics,
    staticFrontShare = 0.45,
    totalVerticalLoadN,
  } = options
  const share = clamp(staticFrontShare, 0.2, 0.8)
  const transferN =
    (Math.max(1, massKg) *
      longitudinalAccelerationMps2 *
      physics.centreOfGravityHeightM) /
    Math.max(0.5, physics.wheelbaseM)

  return {
    frontN: Math.max(0, totalVerticalLoadN * share - transferN),
    rearN: Math.max(0, totalVerticalLoadN * (1 - share) + transferN),
  }
}

/**
 * Lateral load transfer across the track width, `m * a * h / T`. Returned as
 * the load on the pair of tyres on each side.
 */
export function lateralLoadsN(options: {
  lateralAccelerationMps2: number
  massKg: number
  physics: CategoryPhysicsProfile
  totalVerticalLoadN: number
}) {
  const {
    lateralAccelerationMps2,
    massKg,
    physics,
    totalVerticalLoadN,
  } = options
  const transferN =
    (Math.max(1, massKg) *
      Math.abs(lateralAccelerationMps2) *
      physics.centreOfGravityHeightM) /
    Math.max(0.5, physics.trackWidthM)

  return {
    innerN: Math.max(0, totalVerticalLoadN / 2 - transferN),
    outerN: Math.max(0, totalVerticalLoadN / 2 + transferN),
  }
}

/**
 * Lateral acceleration on a banked surface.
 *
 * On the flat the tyres carry the whole cornering load. Banked, the road is
 * tilted into the turn, so the surface takes part of it and the centripetal
 * force presses the car into the track instead of trying to slide it off.
 * Resolving along and perpendicular to the surface:
 *
 *   a = [mu (g cos0 + D/m) + g sin0] / (cos0 - mu sin0)
 *
 * At zero degrees this collapses to `mu (g + D/m)`, the flat case. As the
 * banking steepens the denominator shrinks, which is why a steeply banked
 * corner can be taken far faster than its radius alone suggests.
 */
export function bankedLateralAccelerationMps2(options: {
  bankingDegrees: number
  downforceN: number
  lateralForceBudgetN: number
  massKg: number
  verticalLoadN: number
}) {
  const {
    bankingDegrees,
    downforceN,
    lateralForceBudgetN,
    massKg,
    verticalLoadN,
  } = options
  const mass = Math.max(1, massKg)
  const flatAcceleration = lateralForceBudgetN / mass

  if (Math.abs(bankingDegrees) < 0.05) {
    return flatAcceleration
  }

  // Effective coefficient implied by the budget already worked out above, so
  // load sensitivity and the friction ellipse both carry through.
  const effectiveMu = lateralForceBudgetN / Math.max(1, verticalLoadN)
  const angle = (Math.abs(bankingDegrees) * Math.PI) / 180
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const denominator = cos - effectiveMu * sin

  if (denominator <= 0.05) {
    // Banking steep enough that friction is no longer the limit. Cap rather
    // than return an asymptote; no circuit in these categories is near this.
    return flatAcceleration * 4
  }

  const banked =
    (effectiveMu * (GRAVITY_MPS2 * cos + downforceN / mass) +
      GRAVITY_MPS2 * sin) /
    denominator

  return Math.max(flatAcceleration, banked)
}

/**
 * Steady-state lateral acceleration the car can hold at a given speed.
 *
 * Lateral load transfer depends on the lateral acceleration it is trying to
 * find, so this converges rather than solving in closed form. Four passes are
 * enough: the correction is a few percent and shrinks fast.
 */
export function maximumLateralAccelerationMps2(options: {
  airDensityKgM3?: number
  /**
   * Banking angle in degrees. On a banked corner part of the cornering load is
   * carried by the road surface rather than by the tyres, so the same tyre
   * makes a higher lateral acceleration than it can on the flat.
   */
  bankingDegrees?: number
  gripMultiplier?: number
  /** Longitudinal force already being used, as a fraction of the total. */
  longitudinalUseFraction?: number
  massKg: number
  physics: CategoryPhysicsProfile
  speedMps: number
}) {
  const {
    airDensityKgM3 = 1.225,
    bankingDegrees = 0,
    gripMultiplier = 1,
    longitudinalUseFraction = 0,
    massKg,
    physics,
    speedMps,
  } = options
  const grip = tyreGripAt({
    airDensityKgM3,
    gripMultiplier,
    massKg,
    physics,
    speedMps,
  })
  const lateralBudgetN = remainingEllipseForceN({
    availableForceN: grip.availableForceN,
    usedForceN: grip.availableForceN * clamp(longitudinalUseFraction, 0, 1),
  })
  const weightN = Math.max(1, massKg) * GRAVITY_MPS2
  let lateralAccelerationMps2 = lateralBudgetN / Math.max(1, massKg)

  for (let pass = 0; pass < 4; pass += 1) {
    const { innerN, outerN } = lateralLoadsN({
      lateralAccelerationMps2,
      massKg,
      physics,
      totalVerticalLoadN: grip.verticalLoadN,
    })
    // Each side makes force at its own load-sensitive coefficient, so the
    // unloaded inside pair gives back less than the loaded outside pair gains.
    //
    // The reference is half the static weight, matching what one side carries
    // in balance. Comparing a single side against the whole car's weight would
    // make the coefficient read high for both sides and split the car into
    // more grip than it started with.
    const sideReferenceLoadN = weightN / 2
    const sideForceN = [innerN, outerN].reduce(
      (total, loadN) =>
        total +
        tyreFrictionCoefficient({
          physics,
          referenceLoadN: sideReferenceLoadN,
          verticalLoadN: loadN,
        }) *
          loadN,
      0,
    )
    const transferredBudgetN = remainingEllipseForceN({
      availableForceN: sideForceN * clamp(gripMultiplier, 0.05, 1.2),
      usedForceN:
        sideForceN *
        clamp(gripMultiplier, 0.05, 1.2) *
        clamp(longitudinalUseFraction, 0, 1),
    })

    lateralAccelerationMps2 = bankedLateralAccelerationMps2({
      bankingDegrees,
      downforceN: grip.verticalLoadN - weightN,
      lateralForceBudgetN: transferredBudgetN,
      massKg,
      verticalLoadN: grip.verticalLoadN,
    })
  }

  return lateralAccelerationMps2
}

/**
 * Fastest a car can hold a corner of this radius, from the lateral grip it can
 * actually generate there.
 *
 * `v^2 / R = a_lat(v)` and `a_lat` rises with `v^2` through downforce, so above
 * a certain radius the aerodynamic term alone satisfies the demand and the
 * corner is flat. That threshold arriving at a tighter radius for a car with
 * more downforce is the whole difference between the categories.
 *
 * Returns `Infinity` when the corner is not grip-limited.
 */
export function corneringSpeedLimitMps(options: {
  airDensityKgM3?: number
  bankingDegrees?: number
  gripMultiplier?: number
  longitudinalUseFraction?: number
  massKg: number
  physics: CategoryPhysicsProfile
  radiusMeters: number
  /** Speed the search is capped at, so a flat corner terminates. */
  ceilingMps?: number
}) {
  const { ceilingMps = 130, radiusMeters, ...rest } = options
  const radius = Math.max(1, radiusMeters)
  // a_lat(v) - v^2/R is monotonically decreasing in v wherever the corner is
  // grip-limited, so a bisection converges on the crossing.
  const balanceAt = (speedMps: number) =>
    maximumLateralAccelerationMps2({ ...rest, speedMps }) -
    (speedMps * speedMps) / radius

  if (balanceAt(ceilingMps) > 0) {
    return Number.POSITIVE_INFINITY
  }

  let low = 0
  let high = ceilingMps

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2

    if (balanceAt(middle) > 0) {
      low = middle
    } else {
      high = middle
    }
  }

  return (low + high) / 2
}
