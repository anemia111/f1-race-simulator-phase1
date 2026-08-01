/**
 * Power unit and gearbox.
 *
 * Drive force used to be `powerKw / v`, which assumes the unit makes its rated
 * output at every engine speed and in every gear. That left two
 * representations of the same thing: a force that ignored revs, and an RPM
 * computed only so the dashboard had a number to show.
 *
 * Here there is one. Road speed and the selected gear give crankshaft speed,
 * crankshaft speed gives torque, and torque through the gearing gives force at
 * the contact patch. The RPM on the dashboard is the RPM the physics used.
 *
 * The 2026 unit is treated as a whole rather than as an engine with a bonus.
 * The MGU-K is coupled to the crankshaft, so its torque adds there and passes
 * through the same ratios; it is a motor, so it makes flat torque up to its
 * base speed and constant power above it, which is a different shape from the
 * combustion curve. The turbocharger appears as the delay before combustion
 * torque arrives, not as separate power. What the Energy Store will release,
 * and the regulatory speed de-rate on it, stay in `energySystem.ts` and
 * `activeAero.ts`: this module takes the resulting kW and asks what force it
 * makes at these revs.
 *
 * Gear ratios are derived rather than published: teams do not release them.
 * Top gear is geared so the rev limit arrives at the speed the category is
 * geared for, the spread fixes first gear, and the intermediate ratios are a
 * geometric progression, which is how a real ratio set is laid out.
 */
import type { CategoryPhysicsProfile } from './categoryPhysics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback

const DEFAULT_TRANSMISSION_EFFICIENCY = 0.94
const LAUNCH_RPM_FRACTION = 0.38
const DEFAULT_CLUTCH_BITE_FRACTION = 0.35
// Preserve the existing category map by default. An absolute crankshaft RPM
// can be supplied when a category has a documented motor torque limit.
const DEFAULT_MGU_K_BASE_SPEED_FRACTION = 0.35

/** Ratios from first to top, including the final drive. */
export function gearRatiosFor(physics: CategoryPhysicsProfile): number[] {
  const wheelCircumferenceM = 2 * Math.PI * physics.wheelRadiusM
  const topSpeedMps = physics.topGearEfficiencyStartKph / 3.6
  // Top gear reaches the limiter at the speed the category is geared for.
  const topRatio =
    (physics.maximumEngineRpm / 60) * (wheelCircumferenceM / topSpeedMps)
  const gearCount = Math.max(1, physics.gearCount)

  if (gearCount === 1) {
    return [topRatio]
  }

  const firstRatio = topRatio * physics.gearSpread
  const step = Math.pow(topRatio / firstRatio, 1 / (gearCount - 1))

  return Array.from(
    { length: gearCount },
    (_, index) => firstRatio * Math.pow(step, index),
  )
}

/** Engine speed for a road speed in a given gear. Gear is 1-based. */
export function engineRpmFor(options: {
  gear: number
  physics: CategoryPhysicsProfile
  speedMps: number
}) {
  const { gear, physics, speedMps } = options
  const ratios = gearRatiosFor(physics)
  const ratio = ratios[clamp(gear, 1, ratios.length) - 1]
  const wheelRevsPerSecond =
    Math.max(0, finiteOr(speedMps, 0)) /
    (2 * Math.PI * physics.wheelRadiusM)

  return wheelRevsPerSecond * ratio * 60
}

/**
 * Normalised torque against normalised engine speed.
 *
 * A turbocharged engine pulls hard from low revs, peaks in the middle and
 * falls away toward the limiter. The falling side is what makes peak power
 * arrive later than peak torque.
 */
export function normalisedTorqueAt(
  revFraction: number,
  peakTorqueRevFraction: number,
) {
  const fraction = clamp(revFraction, 0, 1.05)
  const peak = clamp(peakTorqueRevFraction, 0.3, 0.9)

  if (fraction <= 0) {
    return 0
  }

  // Rising side: torque comes in quickly and flattens at the plateau.
  if (fraction < peak) {
    const approach = fraction / peak

    return 0.62 + 0.38 * Math.sin((Math.PI / 2) * approach)
  }

  // Falling side: a gentle decline to about three quarters at the limiter.
  const beyond = (fraction - peak) / Math.max(0.05, 1 - peak)

  return 1 - 0.26 * beyond * beyond
}

/**
 * Peak torque in newton-metres, set so the curve's maximum power equals the
 * category's rated output. The published kW stays the constraint; the curve
 * decides where in the rev range it is reached.
 */
export function peakTorqueNm(physics: CategoryPhysicsProfile) {
  let bestPowerPerNm = 0

  for (let step = 0; step <= 100; step += 1) {
    const fraction = step / 100
    const rpm = fraction * physics.maximumEngineRpm
    const angularSpeed = (rpm * 2 * Math.PI) / 60
    const powerPerNm =
      normalisedTorqueAt(fraction, physics.peakTorqueRevFraction) *
      angularSpeed

    bestPowerPerNm = Math.max(bestPowerPerNm, powerPerNm)
  }

  return (physics.combustionPowerKw * 1000) / Math.max(1, bestPowerPerNm)
}

export function engineTorqueNm(options: {
  physics: CategoryPhysicsProfile
  rpm: number
}) {
  const { physics, rpm } = options

  if (rpm > physics.maximumEngineRpm) {
    return 0
  }

  return (
    peakTorqueNm(physics) *
    normalisedTorqueAt(
      rpm / Math.max(1, physics.maximumEngineRpm),
      physics.peakTorqueRevFraction,
    )
  )
}

export function enginePowerKwAt(options: {
  physics: CategoryPhysicsProfile
  rpm: number
}) {
  const torqueNm = engineTorqueNm(options)
  const angularSpeed = (Math.max(0, options.rpm) * 2 * Math.PI) / 60

  return (torqueNm * angularSpeed) / 1000
}

/**
 * Turbocharger response. Combustion torque is not available the instant the
 * throttle opens; the turbo has to spin up, and it spools faster when the
 * crankshaft is already turning quickly.
 *
 * Returns the fraction of combustion torque available. Electrical torque is
 * not affected, which is exactly why the hybrid unit fills the gap.
 */
export function turboResponseFraction(options: {
  physics: CategoryPhysicsProfile
  rpm: number
  secondsSinceThrottleOpened: number
}) {
  const { physics, rpm, secondsSinceThrottleOpened } = options
  return advanceTurboState({
    deltaSeconds: Math.max(0, finiteOr(secondsSinceThrottleOpened, 0)),
    physics,
    previousState: { spoolFraction: 0 },
    rpm,
    throttleFraction: 1,
  }).spoolFraction
}

export type TurboState = {
  /** Fraction of the available combustion torque currently supported. */
  spoolFraction: number
}

/**
 * Advances turbo spool by one simulation step.
 *
 * Spool rises toward the requested throttle and decays again on a lift. The
 * rise time shortens with crankshaft speed, while the previous value makes the
 * result continuous between ticks. This state applies only to combustion
 * torque; the MGU-K is deliberately outside this calculation.
 */
export function advanceTurboState(options: {
  deltaSeconds: number
  physics: CategoryPhysicsProfile
  previousState: TurboState
  rpm: number
  throttleFraction: number
}): TurboState {
  const previous = clamp(
    finiteOr(options.previousState.spoolFraction, 0),
    0,
    1,
  )
  const elapsed = Math.max(0, finiteOr(options.deltaSeconds, 0))
  const throttle = clamp(finiteOr(options.throttleFraction, 0), 0, 1)
  const revFraction = clamp(
    finiteOr(options.rpm, 0) /
      Math.max(1, options.physics.maximumEngineRpm),
    0,
    1,
  )
  const target = throttle
  // A loaded turbo builds in about half a second at low revs and much faster
  // near the limiter. It sheds speed on a lift, but not instantaneously.
  const timeConstantSeconds =
    target >= previous ? 0.55 - 0.42 * revFraction : 0.3
  const retained = Math.exp(
    -elapsed / Math.max(0.05, timeConstantSeconds),
  )

  return {
    spoolFraction: clamp(
      target + (previous - target) * retained,
      0,
      1,
    ),
  }
}

/**
 * MGU-K torque at the crankshaft.
 *
 * An electric motor holds flat torque to its base speed and constant power
 * above it. `P / omega` tends to infinity as speed tends to zero, so the low
 * speed side must be capped by the motor's maximum torque; only above base
 * speed does the power limit determine torque.
 */
export function mguKTorqueNm(options: {
  deploymentPowerKw: number
  /** Crankshaft RPM where the motor changes from torque to power limiting. */
  mguKBaseSpeedRpm?: number
  physics: CategoryPhysicsProfile
  rpm: number
}) {
  const { deploymentPowerKw, mguKBaseSpeedRpm, physics, rpm } = options
  const powerW = Math.max(0, deploymentPowerKw) * 1000

  if (powerW <= 0 || rpm <= 0) {
    return 0
  }

  const baseSpeedRpm = clamp(
    finiteOr(
      mguKBaseSpeedRpm ??
        physics.maximumEngineRpm * DEFAULT_MGU_K_BASE_SPEED_FRACTION,
      physics.maximumEngineRpm * DEFAULT_MGU_K_BASE_SPEED_FRACTION,
    ),
    1,
    physics.maximumEngineRpm,
  )
  const baseAngularSpeed = (baseSpeedRpm * 2 * Math.PI) / 60
  const flatTorqueNm = powerW / baseAngularSpeed
  const angularSpeed = (rpm * 2 * Math.PI) / 60

  return rpm <= baseSpeedRpm ? flatTorqueNm : powerW / angularSpeed
}

export type GearSelection = {
  /** Effective clutch engagement used for this force calculation. */
  clutchEngagementFraction: number
  /** Whether crankshaft and driven-wheel speeds differ through clutch slip. */
  clutchSlipping: boolean
  gear: number
  /** Crankshaft RPM used by ICE, MGU-K and force calculations. */
  rpm: number
  /** Tractive force at the contact patch before any traction limit. */
  driveForceN: number
  /** RPM implied by wheel speed and gearing before clutch slip. */
  wheelCoupledRpm: number
}

export type ClutchState = {
  engagementFraction: number
}

/**
 * Advances clutch engagement for a standing launch.
 *
 * Below the speed at which first gear can hold idle, throttle brings the
 * clutch to its bite point and wheel speed progressively closes it. Once the
 * wheel-coupled crankshaft speed reaches idle the clutch can lock. A lift at a
 * standstill releases it again. This contains no circuit-specific launch
 * correction.
 */
export function advanceClutchState(options: {
  deltaSeconds: number
  physics: CategoryPhysicsProfile
  previousState: ClutchState
  speedMps: number
  throttleFraction: number
}): ClutchState {
  const previous = clamp(
    finiteOr(options.previousState.engagementFraction, 0),
    0,
    1,
  )
  const elapsed = Math.max(0, finiteOr(options.deltaSeconds, 0))
  const throttle = clamp(finiteOr(options.throttleFraction, 0), 0, 1)
  const firstGearRpm = engineRpmFor({
    gear: 1,
    physics: options.physics,
    speedMps: options.speedMps,
  })
  const couplingProgress = clamp(
    firstGearRpm / Math.max(1, options.physics.minimumEngineRpm),
    0,
    1,
  )
  const launchTarget =
    throttle *
    (DEFAULT_CLUTCH_BITE_FRACTION +
      (1 - DEFAULT_CLUTCH_BITE_FRACTION) * couplingProgress)
  const target = couplingProgress >= 1 ? 1 : launchTarget
  const timeConstantSeconds = target >= previous ? 0.48 : 0.16
  const retained = Math.exp(
    -elapsed / Math.max(0.02, timeConstantSeconds),
  )

  return {
    engagementFraction: clamp(
      target + (previous - target) * retained,
      0,
      1,
    ),
  }
}

export type PowerUnitInput = {
  /** Current clutch engagement. Omit to use the compatible launch default. */
  clutchEngagementFraction?: number
  /** MGU-K deployment already limited by regulation and state of charge. */
  deploymentPowerKw?: number
  /** Optional crankshaft torque capacity while the clutch is slipping. */
  launchTorqueLimitNm?: number
  /** Optional physical MGU-K torque/power crossover speed at the crankshaft. */
  mguKBaseSpeedRpm?: number
  physics: CategoryPhysicsProfile
  /** Omit for a fully spooled unit. */
  secondsSinceThrottleOpened?: number
  speedMps: number
  transmissionEfficiency?: number
  /** Stateful turbo value. Takes precedence over the legacy elapsed time. */
  turboSpoolFraction?: number
}

/** Crankshaft torque from the whole unit at a given engine speed. */
export function powerUnitTorqueNm(options: {
  deploymentPowerKw?: number
  mguKBaseSpeedRpm?: number
  physics: CategoryPhysicsProfile
  rpm: number
  secondsSinceThrottleOpened?: number
  turboSpoolFraction?: number
}) {
  const {
    deploymentPowerKw = 0,
    mguKBaseSpeedRpm,
    physics,
    rpm,
    secondsSinceThrottleOpened,
    turboSpoolFraction,
  } = options
  const combustionAvailability =
    turboSpoolFraction === undefined
      ? secondsSinceThrottleOpened === undefined
        ? 1
        : turboResponseFraction({
            physics,
            rpm,
            secondsSinceThrottleOpened,
          })
      : clamp(finiteOr(turboSpoolFraction, 0), 0, 1)
  const combustionNm =
    engineTorqueNm({ physics, rpm }) * combustionAvailability
  const electricalNm = mguKTorqueNm({
    deploymentPowerKw,
    mguKBaseSpeedRpm,
    physics,
    rpm,
  })

  return combustionNm + electricalNm
}

const automaticClutchEngagementFraction = (
  physics: CategoryPhysicsProfile,
  speedMps: number,
) => {
  const firstGearRpm = engineRpmFor({ gear: 1, physics, speedMps })
  const progress = clamp(
    firstGearRpm / Math.max(1, physics.minimumEngineRpm),
    0,
    1,
  )

  return (
    DEFAULT_CLUTCH_BITE_FRACTION +
    (1 - DEFAULT_CLUTCH_BITE_FRACTION) * progress
  )
}

/**
 * Crankshaft RPM used for torque while launching. Wheel-coupled RPM remains a
 * separate value until the clutch locks, avoiding both a stalled 0 RPM engine
 * and an unbounded `power / speed` launch force.
 */
export function powerUnitRpmFor(options: {
  clutchEngagementFraction?: number
  gear: number
  physics: CategoryPhysicsProfile
  speedMps: number
}) {
  const wheelCoupledRpm = engineRpmFor(options)

  if (wheelCoupledRpm >= options.physics.minimumEngineRpm) {
    return wheelCoupledRpm
  }

  const engagement = clamp(
    finiteOr(
      options.clutchEngagementFraction ??
        automaticClutchEngagementFraction(
          options.physics,
          options.speedMps,
        ),
      DEFAULT_CLUTCH_BITE_FRACTION,
    ),
    0,
    1,
  )
  const launchRpm = clamp(
    options.physics.maximumEngineRpm * LAUNCH_RPM_FRACTION,
    options.physics.minimumEngineRpm,
    options.physics.maximumEngineRpm,
  )
  const slippingRpm =
    wheelCoupledRpm + (launchRpm - wheelCoupledRpm) * (1 - engagement)

  return Math.max(options.physics.minimumEngineRpm, slippingRpm)
}

const defaultLaunchTorqueLimitNm = (
  physics: CategoryPhysicsProfile,
  mguKBaseSpeedRpm?: number,
) => {
  const baseSpeedRpm = clamp(
    finiteOr(
      mguKBaseSpeedRpm ??
        physics.maximumEngineRpm * DEFAULT_MGU_K_BASE_SPEED_FRACTION,
      physics.maximumEngineRpm * DEFAULT_MGU_K_BASE_SPEED_FRACTION,
    ),
    1,
    physics.maximumEngineRpm,
  )
  const maximumElectricalTorqueNm = mguKTorqueNm({
    deploymentPowerKw: physics.hybridDeploymentPowerLimitKw,
    mguKBaseSpeedRpm: baseSpeedRpm,
    physics,
    rpm: baseSpeedRpm,
  })

  return peakTorqueNm(physics) + maximumElectricalTorqueNm
}

/**
 * Evaluates one gear. `selectGear` uses this same result, so the RPM reported
 * to telemetry is necessarily the RPM used for ICE torque, MGU-K torque and
 * contact-patch force.
 */
export function powerUnitForceInGear(
  options: PowerUnitInput & { gear: number },
): GearSelection {
  const ratios = gearRatiosFor(options.physics)
  const gear = clamp(
    Math.round(finiteOr(options.gear, 1)),
    1,
    ratios.length,
  )
  const wheelCoupledRpm = engineRpmFor({
    gear,
    physics: options.physics,
    speedMps: options.speedMps,
  })
  const clutchEngagementFraction = clamp(
    finiteOr(
      options.clutchEngagementFraction ??
        automaticClutchEngagementFraction(
          options.physics,
          options.speedMps,
        ),
      DEFAULT_CLUTCH_BITE_FRACTION,
    ),
    0,
    1,
  )
  const rpm = powerUnitRpmFor({
    clutchEngagementFraction,
    gear,
    physics: options.physics,
    speedMps: options.speedMps,
  })
  const clutchSlipping = wheelCoupledRpm < options.physics.minimumEngineRpm
  const crankshaftTorqueNm = powerUnitTorqueNm({
    deploymentPowerKw: options.deploymentPowerKw,
    mguKBaseSpeedRpm: options.mguKBaseSpeedRpm,
    physics: options.physics,
    rpm,
    secondsSinceThrottleOpened: options.secondsSinceThrottleOpened,
    turboSpoolFraction: options.turboSpoolFraction,
  })
  const launchTorqueLimitNm = Math.max(
    0,
    finiteOr(
      options.launchTorqueLimitNm ??
        defaultLaunchTorqueLimitNm(
          options.physics,
          options.mguKBaseSpeedRpm,
        ),
      0,
    ),
  )
  const transmittedTorqueNm = clutchSlipping
    ? Math.min(
        crankshaftTorqueNm,
        launchTorqueLimitNm * clutchEngagementFraction,
      )
    : crankshaftTorqueNm
  const transmissionEfficiency = clamp(
    finiteOr(
      options.transmissionEfficiency ?? DEFAULT_TRANSMISSION_EFFICIENCY,
      DEFAULT_TRANSMISSION_EFFICIENCY,
    ),
    0,
    1,
  )
  const driveForceN =
    wheelCoupledRpm > options.physics.maximumEngineRpm
      ? 0
      : (transmittedTorqueNm *
          ratios[gear - 1] *
          transmissionEfficiency) /
        options.physics.wheelRadiusM

  return {
    clutchEngagementFraction,
    clutchSlipping,
    driveForceN: Math.max(0, finiteOr(driveForceN, 0)),
    gear,
    rpm: finiteOr(rpm, options.physics.minimumEngineRpm),
    wheelCoupledRpm: finiteOr(wheelCoupledRpm, 0),
  }
}

/**
 * The gear a driver would actually hold: the one producing the most force
 * without hitting the limiter. Below the lowest usable speed it stays in
 * first, which is what happens on a standing start.
 *
 * Selection sees the whole unit, so a car with deployment available can hold a
 * different gear from the same car without it.
 */
export function selectGear(options: PowerUnitInput): GearSelection {
  const ratios = gearRatiosFor(options.physics)
  let best: GearSelection | undefined

  for (let gear = 1; gear <= ratios.length; gear += 1) {
    const candidate = powerUnitForceInGear({ ...options, gear })

    if (candidate.wheelCoupledRpm > options.physics.maximumEngineRpm) {
      continue
    }

    if (best === undefined || candidate.driveForceN > best.driveForceN) {
      best = candidate
    }
  }

  if (best === undefined) {
    // Above top gear's limiter. Keep a finite dashboard state while the
    // limiter supplies no further drive force.
    const fallback = powerUnitForceInGear({
      ...options,
      gear: ratios.length,
    })

    return {
      ...fallback,
      driveForceN: 0,
      rpm: options.physics.maximumEngineRpm,
    }
  }

  return best
}

/**
 * Tractive force at the contact patch from the whole power unit, before any
 * traction limit. The tyre model decides how much of it reaches the road.
 */
export function powerUnitDriveForceN(
  options: PowerUnitInput & { throttleFraction: number },
) {
  const selection = selectGear(options)

  return (
    selection.driveForceN *
    clamp(finiteOr(options.throttleFraction, 0), 0, 1)
  )
}
