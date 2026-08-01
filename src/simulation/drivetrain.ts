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
    Math.max(0, speedMps) / (2 * Math.PI * physics.wheelRadiusM)

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
  const revFraction = clamp(rpm / Math.max(1, physics.maximumEngineRpm), 0, 1)
  // Spool takes roughly half a second from low revs and very little near the
  // top of the range.
  const timeConstantSeconds = 0.55 - 0.42 * revFraction
  const elapsed = Math.max(0, secondsSinceThrottleOpened)

  return 1 - Math.exp(-elapsed / Math.max(0.05, timeConstantSeconds))
}

/**
 * MGU-K torque at the crankshaft.
 *
 * An electric motor holds flat torque to its base speed and constant power
 * above it, so at low revs the electrical side contributes far more torque
 * than its power rating divided by engine speed would suggest. This is what
 * makes a 2026 car leave a slow corner the way it does.
 */
export function mguKTorqueNm(options: {
  deploymentPowerKw: number
  physics: CategoryPhysicsProfile
  rpm: number
}) {
  const { deploymentPowerKw, physics, rpm } = options
  const powerW = Math.max(0, deploymentPowerKw) * 1000

  if (powerW <= 0 || rpm <= 0) {
    return 0
  }

  const baseSpeedRpm = physics.maximumEngineRpm * 0.35
  const baseAngularSpeed = (baseSpeedRpm * 2 * Math.PI) / 60
  const flatTorqueNm = powerW / baseAngularSpeed
  const angularSpeed = (rpm * 2 * Math.PI) / 60

  return rpm <= baseSpeedRpm ? flatTorqueNm : powerW / angularSpeed
}

export type GearSelection = {
  gear: number
  rpm: number
  /** Tractive force at the contact patch before any traction limit. */
  driveForceN: number
}

export type PowerUnitInput = {
  /** MGU-K deployment already limited by regulation and state of charge. */
  deploymentPowerKw?: number
  physics: CategoryPhysicsProfile
  /** Omit for a fully spooled unit. */
  secondsSinceThrottleOpened?: number
  speedMps: number
  transmissionEfficiency?: number
}

/** Crankshaft torque from the whole unit at a given engine speed. */
export function powerUnitTorqueNm(options: {
  deploymentPowerKw?: number
  physics: CategoryPhysicsProfile
  rpm: number
  secondsSinceThrottleOpened?: number
}) {
  const {
    deploymentPowerKw = 0,
    physics,
    rpm,
    secondsSinceThrottleOpened,
  } = options
  const combustionNm =
    engineTorqueNm({ physics, rpm }) *
    (secondsSinceThrottleOpened === undefined
      ? 1
      : turboResponseFraction({
          physics,
          rpm,
          secondsSinceThrottleOpened,
        }))
  const electricalNm = mguKTorqueNm({ deploymentPowerKw, physics, rpm })

  return combustionNm + electricalNm
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
  const {
    deploymentPowerKw = 0,
    physics,
    secondsSinceThrottleOpened,
    speedMps,
    transmissionEfficiency = 0.94,
  } = options
  const ratios = gearRatiosFor(physics)
  const forceAt = (gear: number, rpm: number) =>
    (powerUnitTorqueNm({
      deploymentPowerKw,
      physics,
      rpm,
      secondsSinceThrottleOpened,
    }) *
      ratios[gear - 1] *
      transmissionEfficiency) /
    physics.wheelRadiusM
  let best: GearSelection = { driveForceN: 0, gear: 1, rpm: 0 }

  for (let gear = 1; gear <= ratios.length; gear += 1) {
    const rpm = engineRpmFor({ gear, physics, speedMps })

    if (rpm > physics.maximumEngineRpm) {
      continue
    }

    const driveForceN = forceAt(gear, rpm)

    if (driveForceN > best.driveForceN) {
      best = { driveForceN, gear, rpm }
    }
  }

  if (best.driveForceN <= 0) {
    // Above the top gear's limiter, or stationary. Hold the nearest usable
    // gear rather than reporting no gear at all.
    const gear = speedMps <= 0 ? 1 : ratios.length
    const rpm = Math.min(
      physics.maximumEngineRpm,
      engineRpmFor({ gear, physics, speedMps }),
    )

    return { driveForceN: forceAt(gear, rpm), gear, rpm }
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

  return selection.driveForceN * clamp(options.throttleFraction, 0, 1)
}
