import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  CarSetup,
  Driver,
  RacePaceMode,
  Team,
  TrackDefinition,
  WeatherState,
  WeekendStage,
} from '../types'
import {
  DRIVER_PERFORMANCE_INTERNAL_MAX,
  driverPerformanceAbility,
  driverSkillBlend,
} from './driverAbility'
import {
  effectiveMachineRating,
  MACHINE_PERFORMANCE_REFERENCE,
  MACHINE_PERFORMANCE_SPREAD_FACTOR,
} from './machinePerformance'
import {
  categoryPhysicsFor,
  type CategoryPhysicsProfile,
} from './categoryPhysics'
import {
  advanceClutchState,
  advanceTurboState,
  selectGear,
  type GearSelection,
} from './drivetrain'
import { trackDynamicsAt, type TrackDynamicPoint } from './trackDynamics'
import {
  GRAVITY_MPS2,
  longitudinalTyreForceCapacityAt,
  maximumLateralAccelerationMps2,
} from './tyreForces'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback

export const MACHINE_PACE_REFERENCE = MACHINE_PERFORMANCE_REFERENCE
export const MACHINE_PACE_SPREAD_FACTOR = MACHINE_PERFORMANCE_SPREAD_FACTOR
export const MACHINE_SEGMENT_RESPONSE = 0.135
export const DRIVER_SEGMENT_RESPONSE = 0.14
/**
 * Blended skill of a front-running driver. Pace deviations are measured from
 * here, so the leaders stay on their calibrated lap time while the response
 * factor controls how far the rest of the field falls back.
 */
export const DRIVER_SKILL_REFERENCE = 0.9175
/**
 * Extra pace for a genuine top-of-the-scale ace. The threshold corresponds to
 * roughly 95 on the authored 0-100 scale, so the current F1 ceiling can still
 * reach the real-world calibration without lifting the midfield or junior
 * categories. The cap prevents a custom 100-rated driver from creating grip
 * or power beyond the former top-driver calibration.
 */
export const ACE_PACE_THRESHOLD = 0.9764
export const ACE_PACE_GAIN = 2.8
export const ACE_PACE_MAX_GAIN = 0.0157
export const ACE_RACE_PACE_MAX_GAIN = 0.0035
export const machinePaceRating = effectiveMachineRating

export type TrackLoadProfile = {
  accelerationShare: number
  brakingShare: number
  corneringShare: number
  highSpeedShare: number
  lowSpeedShare: number
  mediumSpeedShare: number
  straightShare: number
}

export type LongitudinalDynamicsInput = {
  bankingDegrees?: number
  brakingDistanceAheadMeters?: number
  brakingTargetSpeedKph?: number
  corneringSpeedLimitKph?: number
  effectiveCornerRadiusM?: number
  gradient: number
  referenceLineOffsetM?: number
  segmentLengthMeters?: number
  straightness: number
}

export type LongitudinalStepInput = {
  activeAeroMode: ActiveAeroMode
  /** Ballast or carried mass beyond the category minimum and fuel. */
  additionalMassKg?: number
  airDensityKgM3: number
  brakeReleaseSpeedKph?: number
  brakePercent: number
  categoryPhysics?: CategoryPhysicsProfile
  /** Physical ICE output override. Team PU output is used when omitted. */
  combustionPowerKw?: number
  /** Stateful clutch connection from the previous live tick. */
  clutchEngagementFraction?: number
  currentSpeedKph: number
  deltaSeconds: number
  /** Wake loss applied to generated downforce, never directly to road speed. */
  dirtyAirDownforceMultiplier?: number
  dynamics: LongitudinalDynamicsInput
  drivePowerScale?: number
  ersPowerKw: number
  /** Combustion boost such as Super Formula OTS. */
  extraCombustionPowerKw?: number
  /** @deprecated Use `extraCombustionPowerKw`; retained for call compatibility. */
  extraDrivePowerKw?: number
  fuelLoadKg: number
  gripMultiplier: number
  headwindMps?: number
  regenerativeResistancePowerKw?: number
  /** Desired live deceleration. When present, brake pressure is solved against
   * the current tyre/brake capacity instead of treating a hardware-maximum
   * percentage as a tyre-capacity percentage. */
  requestedBrakeDecelerationMps2?: number
  setup?: CarSetup
  team: Team
  throttlePercent: number
  towDragReduction?: number
  /** Physical crankshaft-to-wheel efficiency override. */
  transmissionEfficiency?: number
  /** Stateful turbo compressor speed from the previous live tick. */
  turboSpoolFraction?: number
}

export type LongitudinalStepResult = {
  accelerationMps2: number
  brakeForceN: number
  clutchEngagementFraction: number
  dragForceN: number
  driveForceN: number
  gear: number
  gradeForceN: number
  regenerativeResistanceForceN: number
  rollingResistanceForceN: number
  rpm: number
  speedKph: number
  tractionLimitN: number
  turboSpoolFraction: number
}

const profileCache = new WeakMap<TrackDefinition, TrackLoadProfile>()
const performanceLapGainCache = new WeakMap<
  TrackDefinition,
  WeakMap<Team, WeakMap<Driver, Map<string, number>>>
>()
const liveCorneringLimitCache = new Map<string, number>()

export function trackLoadProfileFor(track: TrackDefinition): TrackLoadProfile {
  const cached = profileCache.get(track)

  if (cached) {
    return cached
  }

  const samples = Array.from({ length: 96 }, (_, index) =>
    trackDynamicsAt(track, index / 96),
  )
  const count = samples.length
  const shareOf = (predicate: (point: TrackDynamicPoint) => boolean) =>
    samples.filter(predicate).length / count
  const corneringShare =
    samples.reduce((total, point) => total + point.curvature, 0) / count
  const brakingShare =
    samples.reduce((total, point) => total + point.brakingSeverity, 0) / count
  const profile = {
    accelerationShare: clamp(
      samples.reduce(
        (total, point) => total + (point.fullThrottle ? 1 : point.straightness),
        0,
      ) / count,
      0.3,
      0.92,
    ),
    brakingShare: clamp(brakingShare, 0.05, 0.55),
    corneringShare: clamp(corneringShare, 0.08, 0.78),
    highSpeedShare: shareOf((point) => point.cornerClass === 'high'),
    lowSpeedShare: shareOf((point) => point.cornerClass === 'low'),
    mediumSpeedShare: shareOf((point) => point.cornerClass === 'medium'),
    straightShare: shareOf((point) => point.cornerClass === 'straight'),
  }

  profileCache.set(track, profile)
  return profile
}

function machineCornerScore(team: Team, dynamics: TrackDynamicPoint) {
  const machine = team.machine

  switch (dynamics.cornerClass) {
    case 'low':
      return (
        machinePaceRating(machine.lowSpeedCornerPerformance) * 0.38 +
        machinePaceRating(machine.mechanicalGrip) * 0.25 +
        machinePaceRating(machine.traction) * 0.22 +
        machinePaceRating(machine.rideCompliance) * 0.15
      )
    case 'medium':
      return (
        machinePaceRating(machine.mediumSpeedCornerPerformance) * 0.4 +
        machinePaceRating(machine.downforceGeneration) * 0.25 +
        machinePaceRating(machine.mechanicalGrip) * 0.2 +
        machinePaceRating(machine.aerodynamicEfficiency) * 0.15
      )
    case 'high':
      return (
        machinePaceRating(machine.highSpeedCornerPerformance) * 0.42 +
        machinePaceRating(machine.downforceGeneration) * 0.3 +
        machinePaceRating(machine.aerodynamicEfficiency) * 0.18 +
        machinePaceRating(machine.rideCompliance) * 0.1
      )
    default:
      return (
        machinePaceRating(machine.straightLineEfficiency) * 0.35 +
        machinePaceRating(machine.dragEfficiency) * 0.3 +
        machinePaceRating(machine.puOutput) * 0.25 +
        machinePaceRating(machine.activeAeroEfficiency) * 0.1
      )
  }
}

export function machineSegmentCapability(options: {
  dynamics: TrackDynamicPoint
  session?: 'qualifying' | 'race'
  team: Team
  weather?: WeatherState
}) {
  const { dynamics, session = 'race', team, weather = 'clear' } = options
  const machine = team.machine
  const cornerScore = machineCornerScore(team, dynamics)
  const brakingScore =
    machinePaceRating(machine.brakingPerformance) * 0.55 +
    machinePaceRating(machine.brakingStability) * 0.45
  const wetScore =
    weather === 'heavy-rain'
      ? machinePaceRating(machine.wetPerformance)
      : weather === 'light-rain'
        ? machinePaceRating(machine.intermediatePerformance)
        : machinePaceRating(machine.racePace)
  const localScore =
    cornerScore * (1 - dynamics.brakingSeverity * 0.3) +
    brakingScore * dynamics.brakingSeverity * 0.3
  const weatherSpecialtyWeight =
    weather === 'heavy-rain' ? 0.78 : weather === 'light-rain' ? 0.48 : 0
  const wetSpecialty =
    wetScore - machinePaceRating(machine.racePace)
  const weatherAdjusted =
    localScore + wetSpecialty * weatherSpecialtyWeight
  const sessionPace =
    machinePaceRating(
      session === 'qualifying' ? machine.qualifyingPace : machine.racePace,
    )
  const sessionAdjusted = weatherAdjusted * 0.94 + sessionPace * 0.06

  // Each axis decides where a car gains or loses time. The source data keeps
  // the lower field competitive while the response preserves visible car gaps.
  return clamp(
    1 +
      (sessionAdjusted - MACHINE_PACE_REFERENCE) *
        MACHINE_SEGMENT_RESPONSE,
    0.96,
    1.035,
  )
}

export function driverSegmentExecution(options: {
  driver: Driver
  dynamics: TrackDynamicPoint
  pressure?: number
  session?: 'qualifying' | 'race'
  weather?: WeatherState
}) {
  const {
    driver,
    dynamics,
    pressure = 0.45,
    session = 'race',
    weather = 'clear',
  } = options
  const cornerSkill =
    dynamics.cornerClass === 'low'
      ? driverPerformanceAbility(driver, 'lowSpeedCornerSkill')
      : dynamics.cornerClass === 'medium'
        ? driverPerformanceAbility(driver, 'mediumSpeedCornerSkill')
        : dynamics.cornerClass === 'high'
          ? driverPerformanceAbility(driver, 'highSpeedCornerSkill')
          : driverPerformanceAbility(driver, 'throttleControl')
  const wetSkill =
    weather === 'heavy-rain'
      ? driverPerformanceAbility(driver, 'wetSkill')
      : weather === 'light-rain'
        ? driverPerformanceAbility(driver, 'intermediateSkill')
        : 0.9
  const sessionPace =
    session === 'qualifying'
      ? driverPerformanceAbility(driver, 'qualifyingPace')
      : driverPerformanceAbility(driver, 'racePace')
  const skill = clamp(
    sessionPace * 0.24 +
      cornerSkill * 0.22 +
      driverPerformanceAbility(driver, 'precision') * 0.12 +
      driverPerformanceAbility(driver, 'brakingSkill') *
        dynamics.brakingSeverity *
        0.14 +
      driverPerformanceAbility(driver, 'tractionControl') *
        (1 - dynamics.straightness) *
        0.1 +
      wetSkill * 0.1 +
      driverPerformanceAbility(driver, 'pressureHandling') * pressure * 0.08,
    0,
    DRIVER_PERFORMANCE_INTERNAL_MAX,
  )

  // Drivers cannot create grip or power beyond the machine limit. Their skills
  // determine how closely and consistently they approach it. Deviations are
  // measured from a front-running reference rather than a perfect score, so
  // raising the response separates the field without slowing every car.
  // The floor has to clear the bottom of the shared rating scale, which now
  // reaches into the junior categories, so a weak driver is not silently
  // lifted to midfield pace.
  // A genuine number-one ace (top-band race pace) gains extra segment pace on
  // top of the normal calibration. It is zero for the midfield down, so it
  // separates a standout leader without spreading the whole field, changing
  // junior-category racing, or reducing attrition.
  const aceBonus = Math.min(
    session === 'qualifying'
      ? ACE_PACE_MAX_GAIN
      : ACE_RACE_PACE_MAX_GAIN,
    Math.max(0, sessionPace - ACE_PACE_THRESHOLD) * ACE_PACE_GAIN,
  )

  return clamp(
    1 - (DRIVER_SKILL_REFERENCE - skill) * DRIVER_SEGMENT_RESPONSE + aceBonus,
    0.9,
    1.16,
  )
}

export function dirtyAirDownforceMultiplier(options: {
  dynamics: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  gapSeconds: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds >= 2.5 || dynamics.curvature < 0.025) {
    return 1
  }

  const proximity = 1 - clamp(gapSeconds / 2.5, 0, 1)
  const sensitivity =
    1.08 - machinePaceRating(team.machine.dirtyAirTolerance) * 0.22
  const loss = proximity ** 1.35 * dynamics.curvature * 0.115 * sensitivity

  return clamp(1 - loss, 0.88, 1)
}

export function towDragReductionFor(options: {
  dynamics: Pick<TrackDynamicPoint, 'straightness'>
  gapSeconds: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds > 1.8 || dynamics.straightness < 0.72) {
    return 0
  }

  const proximity = 1 - clamp((gapSeconds - 0.08) / 1.72, 0, 1)

  return clamp(
    proximity *
      dynamics.straightness *
      (0.105 + machinePaceRating(team.machine.towSensitivity) * 0.075),
    0,
    0.19,
  )
}

export function airDensityKgM3(options: {
  altitudeMeters?: number
  temperatureC?: number
}) {
  const altitudeMeters = options.altitudeMeters ?? 100
  const temperatureK = (options.temperatureC ?? 25) + 273.15
  const pressurePa =
    101325 * Math.pow(1 - 2.25577e-5 * clamp(altitudeMeters, -100, 3000), 5.25588)

  return pressurePa / (287.05 * temperatureK)
}

function activeAeroDragMultiplier(
  mode: ActiveAeroMode,
  team: Team,
  categoryPhysics: CategoryPhysicsProfile,
) {
  const efficiency = machinePaceRating(team.machine.activeAeroEfficiency)
  const efficiencyCorrection = clamp(
    1 - (efficiency - MACHINE_PERFORMANCE_REFERENCE) * 0.12,
    0.975,
    1.025,
  )

  if (mode === 'straight') {
    return clamp(
      categoryPhysics.straightAeroDragMultiplier * efficiencyCorrection,
      0.45,
      1,
    )
  }

  if (mode === 'partial-straight') {
    return clamp(
      categoryPhysics.partialAeroDragMultiplier * efficiencyCorrection,
      0.65,
      1,
    )
  }

  return 1
}

export function vehicleDragAreaM2(options: {
  activeAeroMode: ActiveAeroMode
  categoryPhysics?: CategoryPhysicsProfile
  setup?: CarSetup
  team: Team
  towDragReduction?: number
}) {
  const {
    activeAeroMode,
    categoryPhysics = categoryPhysicsFor(undefined),
    setup,
    team,
    towDragReduction = 0,
  } = options
  const machine = team.machine
  const baseDragArea =
    1.18 -
    machinePaceRating(machine.dragEfficiency) * 0.1 -
    machinePaceRating(machine.aerodynamicEfficiency) * 0.03 -
    machinePaceRating(machine.straightLineEfficiency) * 0.025

  return clamp(
    baseDragArea *
      categoryPhysics.dragAreaScale *
      setupDragAreaMultiplier(setup) *
      activeAeroDragMultiplier(activeAeroMode, team, categoryPhysics) *
      (1 - clamp(towDragReduction, 0, 0.2)),
    0.325,
    1.45,
  )
}

/**
 * Converts the existing setup controls into aerodynamic drag. The result is a
 * coefficient multiplier, not a top-speed preset, so terminal velocity still
 * emerges from power, air density, wind, slope, tow, and drag.
 */
export function setupDragAreaMultiplier(setup?: CarSetup) {
  if (!setup) {
    return 1
  }

  return clamp(
    1 +
      (setup.frontWing - 5.5) * 0.02 +
      (setup.rearWing - 5.5) * 0.035 +
      (setup.rideHeightMm - 28) * 0.004 +
      (setup.coolingPercent - 50) * 0.0015,
    0.68,
    1.25,
  )
}

export function combustionPowerKwFor(
  team: Team,
  categoryPhysics = categoryPhysicsFor(undefined),
) {
  const performanceScale = clamp(
    1 +
      (machinePaceRating(team.machine.puOutput) -
        MACHINE_PERFORMANCE_REFERENCE) *
        0.55,
    0.93,
    1.05,
  )

  return categoryPhysics.combustionPowerKw * performanceScale
}

/**
 * Team and setup variation expressed as generated aerodynamic load. Dirty air
 * reduces this quantity; it never multiplies speed or lap progress directly.
 */
export function vehicleDownforceMultiplier(options: {
  dirtyAirDownforceMultiplier?: number
  setup?: CarSetup
  team: Team
}) {
  const machineScale = clamp(
    1 +
      (machinePaceRating(options.team.machine.downforceGeneration) -
        MACHINE_PERFORMANCE_REFERENCE) *
        0.42 +
      (machinePaceRating(options.team.machine.aerodynamicEfficiency) -
        MACHINE_PERFORMANCE_REFERENCE) *
        0.1,
    0.9,
    1.08,
  )
  const setupScale = options.setup
    ? clamp(
        1 +
          (options.setup.frontWing - 5.5) * 0.018 +
          (options.setup.rearWing - 5.5) * 0.03 -
          (options.setup.rideHeightMm - 28) * 0.003,
        0.78,
        1.2,
      )
    : 1

  return (
    machineScale *
    setupScale *
    clamp(finiteOr(options.dirtyAirDownforceMultiplier ?? 1, 1), 0.5, 1)
  )
}

function tyreGripMultiplierForTeam(team: Team, surfaceMultiplier: number) {
  const physicalTyreScale = clamp(
    1 +
      (machinePaceRating(team.machine.mechanicalGrip) -
        MACHINE_PERFORMANCE_REFERENCE) *
        0.12 +
      (machinePaceRating(team.machine.traction) -
        MACHINE_PERFORMANCE_REFERENCE) *
        0.05,
    0.96,
    1.04,
  )

  return clamp(finiteOr(surfaceMultiplier, 1), 0.05, 1.2) * physicalTyreScale
}

/**
 * Live lateral speed limit for the current car state. Geometry comes from the
 * physical profile, while carried mass, setup, team grip, surface condition
 * and wake downforce are evaluated at runtime. `Infinity` means the corner is
 * flat within the numerical search range; it is never used as a road-speed
 * target on its own.
 */
export function liveCorneringSpeedLimitKph(options: {
  additionalMassKg?: number
  airDensityKgM3: number
  bankingDegrees: number
  categoryPhysics: CategoryPhysicsProfile
  dirtyAirDownforceMultiplier?: number
  /** Speed at which the live downforce/load-sensitive tyre state is sampled. */
  evaluationSpeedKph?: number
  fuelLoadKg: number
  gripMultiplier: number
  radiusMeters: number
  setup?: CarSetup
  team: Team
}) {
  if (options.radiusMeters >= 100_000) {
    return Number.POSITIVE_INFINITY
  }

  const exactMassKg =
    options.categoryPhysics.minimumMassKg +
    clamp(finiteOr(options.fuelLoadKg, 0), 0, 120) +
    clamp(finiteOr(options.additionalMassKg ?? 0, 0), 0, 250)
  const exactDownforceMultiplier = vehicleDownforceMultiplier({
    dirtyAirDownforceMultiplier: options.dirtyAirDownforceMultiplier,
    setup: options.setup,
    team: options.team,
  })
  const exactGripMultiplier = tyreGripMultiplierForTeam(
    options.team,
    options.gripMultiplier,
  )
  // Evaluate on a deterministic numerical grid so nearby ticks share the
  // tyre/downforce balance solve. The quantised values themselves are
  // fed into the model, so results never depend on which car populated the
  // cache first or on input array order.
  const massKg = Math.round(exactMassKg * 2) / 2
  const airDensity =
    Math.round(Math.max(0, finiteOr(options.airDensityKgM3, 1.225)) * 100) /
    100
  const bankingDegrees =
    Math.round(finiteOr(options.bankingDegrees, 0) * 20) / 20
  const radiusMeters =
    Math.round(Math.max(1, finiteOr(options.radiusMeters, 1)) * 10) / 10
  const downforceMultiplier =
    Math.round(exactDownforceMultiplier * 200) / 200
  const gripMultiplier = Math.round(exactGripMultiplier * 200) / 200
  const evaluationSpeedKph =
    Math.round(
      clamp(
        finiteOr(options.evaluationSpeedKph ?? 0, 0),
        0,
        options.categoryPhysics.topGearDesignSpeedKph * 1.5,
      ) / 2,
    ) * 2
  const cacheKey = [
    options.categoryPhysics.id,
    massKg,
    airDensity,
    bankingDegrees,
    radiusMeters,
    downforceMultiplier,
    gripMultiplier,
    evaluationSpeedKph,
  ].join(':')
  const cached = liveCorneringLimitCache.get(cacheKey)

  if (cached !== undefined) {
    return cached
  }

  const searchCeilingMps = Math.max(
    200,
    (options.categoryPhysics.topGearDesignSpeedKph / 3.6) * 1.5,
  )
  // Live control only needs the force balance at the car's present (or
  // planned target) speed. Re-evaluating on every tick gives the feedback loop
  // its next limit without repeating the offline 28-step root search.
  const sampledAccelerationMps2 = maximumLateralAccelerationMps2({
    airDensityKgM3: airDensity,
    bankingDegrees,
    downforceMultiplier,
    gripMultiplier,
    massKg,
    physics: options.categoryPhysics,
    speedMps: evaluationSpeedKph / 3.6,
  })
  const sampledLimitMps = Math.sqrt(
    Math.max(0, sampledAccelerationMps2 * radiusMeters),
  )
  const limitMps =
    sampledLimitMps >= searchCeilingMps
      ? Number.POSITIVE_INFINITY
      : sampledLimitMps
  const limitKph = Number.isFinite(limitMps)
    ? Math.max(0, limitMps * 3.6)
    : Number.POSITIVE_INFINITY

  if (liveCorneringLimitCache.size >= 50_000) {
    liveCorneringLimitCache.clear()
  }
  liveCorneringLimitCache.set(cacheKey, limitKph)
  return limitKph
}

function lateralTyreForceDemandN(options: {
  bankingDegrees?: number
  massKg: number
  radiusMeters?: number
  speedMps: number
}) {
  const radiusMeters = finiteOr(
    options.radiusMeters ?? Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  )

  if (radiusMeters <= 0 || !Number.isFinite(radiusMeters)) {
    return 0
  }

  const centripetalAccelerationMps2 =
    (Math.max(0, options.speedMps) ** 2) / Math.max(1, radiusMeters)
  const bankingRadians =
    (clamp(Math.abs(finiteOr(options.bankingDegrees ?? 0, 0)), 0, 45) *
      Math.PI) /
    180
  // The inward component of the banked road supports part of the centripetal
  // demand. The remainder has to be supplied at the tyre contact patches.
  const supportedAccelerationMps2 =
    GRAVITY_MPS2 * Math.tan(bankingRadians)

  return (
    Math.max(0, centripetalAccelerationMps2 - supportedAccelerationMps2) *
    Math.max(1, options.massKg)
  )
}

function defaultGearSelection(options: {
  clutchEngagementFraction?: number
  combustionPowerKw: number
  deploymentPowerKw: number
  physics: CategoryPhysicsProfile
  speedMps: number
  transmissionEfficiency: number
  turboSpoolFraction: number
}) {
  return selectGear({
    clutchEngagementFraction: options.clutchEngagementFraction,
    combustionPowerKw: options.combustionPowerKw,
    deploymentPowerKw: options.deploymentPowerKw,
    physics: options.physics,
    speedMps: options.speedMps,
    transmissionEfficiency: options.transmissionEfficiency,
    turboSpoolFraction: options.turboSpoolFraction,
  })
}

/**
 * Advances one longitudinal simulation tick through a single physical chain:
 * PU torque curve -> gearing -> driven-axle traction -> road loads -> speed.
 * Gear and RPM in the result come from the same drivetrain evaluation that
 * produced force, so telemetry cannot drift onto a separate display model.
 */
export function integrateVehicleLongitudinalStep(
  input: LongitudinalStepInput,
): LongitudinalStepResult {
  const categoryPhysics =
    input.categoryPhysics ?? categoryPhysicsFor(undefined)
  const massKg = Math.max(
    1,
    categoryPhysics.minimumMassKg +
      clamp(finiteOr(input.fuelLoadKg, 0), 0, 120) +
      clamp(finiteOr(input.additionalMassKg ?? 0, 0), 0, 250),
  )
  const drivePowerScale = clamp(
    finiteOr(input.drivePowerScale ?? 1, 1),
    0,
    1,
  )
  const extraCombustionPowerKw = Math.max(
    0,
    finiteOr(
      input.extraCombustionPowerKw ?? input.extraDrivePowerKw ?? 0,
      0,
    ),
  )
  const combustionPowerKw =
    Math.max(
      0,
      finiteOr(
        input.combustionPowerKw ??
          combustionPowerKwFor(input.team, categoryPhysics),
        categoryPhysics.combustionPowerKw,
      ) + extraCombustionPowerKw,
    ) * drivePowerScale
  // Energy-system output is already mechanical MGU-K power. It passes through
  // the driveline once below and must not receive a second electrical-efficiency
  // multiplier here.
  const deploymentPowerKw = Math.max(0, finiteOr(input.ersPowerKw, 0))
  const transmissionEfficiency = clamp(
    finiteOr(
      input.transmissionEfficiency ?? categoryPhysics.drivetrainEfficiency,
      categoryPhysics.drivetrainEfficiency,
    ),
    0,
    1,
  )
  const dragAreaM2 = vehicleDragAreaM2({
    activeAeroMode: input.activeAeroMode,
    categoryPhysics,
    setup: input.setup,
    team: input.team,
    towDragReduction: input.towDragReduction,
  })
  const downforceMultiplier = vehicleDownforceMultiplier({
    dirtyAirDownforceMultiplier: input.dirtyAirDownforceMultiplier,
    setup: input.setup,
    team: input.team,
  })
  const gripMultiplier = tyreGripMultiplierForTeam(
    input.team,
    input.gripMultiplier,
  )
  const rollingResistanceForceN =
    massKg * GRAVITY_MPS2 * categoryPhysics.rollingResistanceCoefficient
  // Track elevations use a compact normalized coordinate. Convert it to the
  // local road-grade fraction before resolving the weight component.
  const roadGrade = clamp(
    finiteOr(input.dynamics.gradient, 0) * 0.025,
    -0.035,
    0.035,
  )
  const gradeForceN = massKg * GRAVITY_MPS2 * Math.sin(Math.atan(roadGrade))
  const elapsedSeconds = Math.max(0, finiteOr(input.deltaSeconds, 0))
  const integrationSteps = Math.min(
    240,
    // A tenth-second force step keeps launch/turbo/clutch state continuous and
    // bounds high-speed Euler error, while avoiding redundant inner solves in
    // 2x/5x/60x race playback. Large ticks are still subdivided.
    Math.max(1, Math.ceil(elapsedSeconds / 0.1)),
  )
  const stepSeconds = elapsedSeconds / integrationSteps
  let nextMps = Math.max(0, finiteOr(input.currentSpeedKph, 0) / 3.6)
  let turboSpoolFraction = clamp(
    finiteOr(input.turboSpoolFraction ?? 1, 1),
    0,
    1,
  )
  let clutchEngagementFraction =
    input.clutchEngagementFraction === undefined
      ? undefined
      : clamp(finiteOr(input.clutchEngagementFraction, 0), 0, 1)
  let lastAccelerationMps2 = 0
  let lastBrakeForceN = 0
  let lastDragForceN = 0
  let lastDriveForceN = 0
  let lastRegenerativeResistanceForceN = 0
  let lastTractionLimitN = 0
  let lastSelection: GearSelection = defaultGearSelection({
    clutchEngagementFraction,
    combustionPowerKw,
    deploymentPowerKw,
    physics: categoryPhysics,
    speedMps: nextMps,
    transmissionEfficiency,
    turboSpoolFraction,
  })

  if (clutchEngagementFraction === undefined) {
    clutchEngagementFraction = lastSelection.clutchEngagementFraction
  }

  const evaluateForcesAt = (
    speedMps: number,
    selection: GearSelection,
    initialAccelerationGuessMps2: number,
  ) => {
    const speedKph = speedMps * 3.6
    const requestedDriveForceN =
      selection.driveForceN *
      clamp(finiteOr(input.throttlePercent, 0) / 100, 0, 1)
    const airSpeedMps = Math.max(
      0,
      speedMps + finiteOr(input.headwindMps ?? 0, 0),
    )
    const dragForceN =
      0.5 *
      Math.max(0, finiteOr(input.airDensityKgM3, 1.225)) *
      dragAreaM2 *
      airSpeedMps *
      airSpeedMps
    const lateralForceN = lateralTyreForceDemandN({
      bankingDegrees: input.dynamics.bankingDegrees,
      massKg,
      radiusMeters: input.dynamics.effectiveCornerRadiusM,
      speedMps,
    })
    const brakeModulation =
      input.brakeReleaseSpeedKph === undefined
        ? 1
        : clamp(
            (speedKph - finiteOr(input.brakeReleaseSpeedKph, 0)) / 18,
            0,
            1,
          )
    let accelerationMps2 = initialAccelerationGuessMps2
    let brakeForceN = 0
    let driveForceN = 0
    let regenerativeResistanceForceN = 0
    let tractionLimitN = 0

    for (let forcePass = 0; forcePass < 4; forcePass += 1) {
      const capacity = longitudinalTyreForceCapacityAt({
        airDensityKgM3: input.airDensityKgM3,
        brakeBiasFraction: (input.setup?.brakeBiasPercent ?? 56) / 100,
        downforceMultiplier,
        gripMultiplier,
        lateralForceN,
        longitudinalAccelerationMps2: accelerationMps2,
        massKg,
        physics: categoryPhysics,
        speedMps,
      })
      const serviceBrakeCapacityN = Math.min(
        capacity.brakeForceCapacityN,
        categoryPhysics.maximumBrakeDecelerationMps2 * massKg,
      )

      tractionLimitN = capacity.drivenAxleForceCapacityN
      driveForceN = Math.min(requestedDriveForceN, tractionLimitN)
      const requestedServiceBrakeForceN =
        input.requestedBrakeDecelerationMps2 === undefined
          ? serviceBrakeCapacityN *
            clamp(finiteOr(input.brakePercent, 0) / 100, 0, 1) *
            brakeModulation
          : Math.min(
              serviceBrakeCapacityN,
              Math.max(
                0,
                finiteOr(input.requestedBrakeDecelerationMps2, 0),
              ) * massKg,
            ) * brakeModulation
      // Regeneration is a dissipative torque, so P/v is valid here. The
      // low-speed denominator and tyre cap prevent a singular braking force.
      const requestedRegenerativeForceN =
        (Math.max(
          0,
          finiteOr(input.regenerativeResistancePowerKw ?? 0, 0),
        ) *
          1000) /
        Math.max(8, speedMps)
      regenerativeResistanceForceN = Math.min(
        requestedRegenerativeForceN,
        requestedServiceBrakeForceN > 0
          ? requestedServiceBrakeForceN
          : serviceBrakeCapacityN,
      )
      // Under normal braking regeneration replaces part of the friction-brake
      // request. With the service brake released it remains a standalone
      // harvesting torque (for lift-and-coast/super-clipping operation).
      brakeForceN =
        requestedServiceBrakeForceN > 0
          ? requestedServiceBrakeForceN
          : regenerativeResistanceForceN
      accelerationMps2 =
        (driveForceN -
          brakeForceN -
          dragForceN -
          rollingResistanceForceN -
          gradeForceN) /
        massKg
    }

    return {
      accelerationMps2: finiteOr(accelerationMps2, 0),
      brakeForceN,
      dragForceN,
      driveForceN,
      regenerativeResistanceForceN,
      tractionLimitN,
    }
  }

  for (let step = 0; step < integrationSteps; step += 1) {
    const preliminarySelection = defaultGearSelection({
      clutchEngagementFraction,
      combustionPowerKw,
      deploymentPowerKw,
      physics: categoryPhysics,
      speedMps: nextMps,
      transmissionEfficiency,
      turboSpoolFraction,
    })
    turboSpoolFraction = advanceTurboState({
      deltaSeconds: stepSeconds,
      physics: categoryPhysics,
      previousState: { spoolFraction: turboSpoolFraction },
      rpm: preliminarySelection.rpm,
      throttleFraction: clamp(finiteOr(input.throttlePercent, 0) / 100, 0, 1),
    }).spoolFraction
    clutchEngagementFraction = advanceClutchState({
      deltaSeconds: stepSeconds,
      physics: categoryPhysics,
      previousState: { engagementFraction: clutchEngagementFraction },
      speedMps: nextMps,
      throttleFraction: clamp(finiteOr(input.throttlePercent, 0) / 100, 0, 1),
    }).engagementFraction
    lastSelection = defaultGearSelection({
      clutchEngagementFraction,
      combustionPowerKw,
      deploymentPowerKw,
      physics: categoryPhysics,
      speedMps: nextMps,
      transmissionEfficiency,
      turboSpoolFraction,
    })
    const forces = evaluateForcesAt(
      nextMps,
      lastSelection,
      lastAccelerationMps2,
    )

    lastAccelerationMps2 = forces.accelerationMps2
    lastBrakeForceN = forces.brakeForceN
    lastDragForceN = forces.dragForceN
    lastDriveForceN = forces.driveForceN
    lastRegenerativeResistanceForceN =
      forces.regenerativeResistanceForceN
    lastTractionLimitN = forces.tractionLimitN
    nextMps = Math.max(0, nextMps + lastAccelerationMps2 * stepSeconds)
  }

  // State advances exactly once per substep. Re-evaluate the drivetrain and
  // force budgets at the resulting road speed without advancing either state,
  // keeping returned speed, gear, RPM and contact-patch force on one instant.
  lastSelection = defaultGearSelection({
    clutchEngagementFraction,
    combustionPowerKw,
    deploymentPowerKw,
    physics: categoryPhysics,
    speedMps: nextMps,
    transmissionEfficiency,
    turboSpoolFraction,
  })
  const finalForces = evaluateForcesAt(
    nextMps,
    lastSelection,
    lastAccelerationMps2,
  )
  lastAccelerationMps2 = finalForces.accelerationMps2
  lastBrakeForceN = finalForces.brakeForceN
  lastDragForceN = finalForces.dragForceN
  lastDriveForceN = finalForces.driveForceN
  lastRegenerativeResistanceForceN =
    finalForces.regenerativeResistanceForceN
  lastTractionLimitN = finalForces.tractionLimitN

  const speedKph = Math.max(0, finiteOr(nextMps * 3.6, 0))

  return {
    accelerationMps2: finiteOr(lastAccelerationMps2, 0),
    brakeForceN: Math.max(0, finiteOr(lastBrakeForceN, 0)),
    clutchEngagementFraction: clamp(
      finiteOr(clutchEngagementFraction, 0),
      0,
      1,
    ),
    dragForceN: Math.max(0, finiteOr(lastDragForceN, 0)),
    driveForceN: Math.max(0, finiteOr(lastDriveForceN, 0)),
    gear: lastSelection.gear,
    gradeForceN: finiteOr(gradeForceN, 0),
    regenerativeResistanceForceN: Math.max(
      0,
      finiteOr(lastRegenerativeResistanceForceN, 0),
    ),
    rollingResistanceForceN: Math.max(
      0,
      finiteOr(rollingResistanceForceN, 0),
    ),
    rpm: Math.max(0, finiteOr(lastSelection.rpm, 0)),
    speedKph,
    tractionLimitN: Math.max(0, finiteOr(lastTractionLimitN, 0)),
    turboSpoolFraction: clamp(finiteOr(turboSpoolFraction, 0), 0, 1),
  }
}

/** Backward-compatible scalar wrapper for callers that only consume speed. */
export function integrateVehicleSpeedKph(input: LongitudinalStepInput) {
  return integrateVehicleLongitudinalStep(input).speedKph
}

export function vehicleSpeedPerformanceMultiplier(options: {
  driver: Driver
  dynamics: TrackDynamicPoint
  session?: 'qualifying' | 'race'
  team: Team
  weather?: WeatherState
}) {
  return (
    machineSegmentCapability(options) *
    driverSegmentExecution({
      driver: options.driver,
      dynamics: options.dynamics,
      session: options.session,
      weather: options.weather,
    })
  )
}

export function performanceLapGainSeconds(options: {
  driver: Driver
  team: Team
  track: TrackDefinition
  weather?: WeatherState
  session?: 'qualifying' | 'race'
}) {
  let byTeam = performanceLapGainCache.get(options.track)

  if (!byTeam) {
    byTeam = new WeakMap()
    performanceLapGainCache.set(options.track, byTeam)
  }

  let byDriver = byTeam.get(options.team)

  if (!byDriver) {
    byDriver = new WeakMap()
    byTeam.set(options.team, byDriver)
  }

  let byCondition = byDriver.get(options.driver)

  if (!byCondition) {
    byCondition = new Map()
    byDriver.set(options.driver, byCondition)
  }

  const conditionKey = `${options.session ?? 'race'}:${options.weather ?? 'clear'}`
  const cached = byCondition.get(conditionKey)

  if (cached !== undefined) {
    return cached
  }

  const samples = Array.from({ length: 120 }, (_, index) =>
    trackDynamicsAt(options.track, index / 120),
  )
  const baselineSliceSeconds = options.track.baseLapTime / samples.length
  const modeledSeconds = samples.reduce((total, dynamics) => {
    const machine = machineSegmentCapability({
      dynamics,
      session: options.session,
      team: options.team,
      weather: options.weather,
    })
    const driver = driverSegmentExecution({
      driver: options.driver,
      dynamics,
      session: options.session,
      weather: options.weather,
    })

    return total + baselineSliceSeconds / (machine * driver)
  }, 0)

  const result = options.track.baseLapTime - modeledSeconds
  byCondition.set(conditionKey, result)
  return result
}

export function baseFuelBurnKgPerLap(track: TrackDefinition) {
  const profile = trackLoadProfileFor(track)
  // Fuel planning is derived from distance and the amount of accelerating and
  // high-speed running. Lap-time observations are deliberately excluded: a
  // compatibility/UI baseLapTime must never change carried mass and therefore
  // feed back into live acceleration.
  const burnKgPerKm =
    0.225 +
    profile.accelerationShare * 0.055 +
    profile.highSpeedShare * 0.025

  return clamp(
    track.lengthKm * burnKgPerKm,
    1.28,
    2.18,
  )
}

export function fuelBurnKgPerLap(options: {
  phase: ActiveFlagPhase | null
  paceMode: RacePaceMode
  team?: Team
  track: TrackDefinition
  weather: WeatherState
}) {
  const { phase, paceMode, team, track, weather } = options
  const paceFactor: Record<RacePaceMode, number> = {
    defend: 1.025,
    push: 1.055,
    save: 0.9,
    standard: 1,
  }
  const controlFactor =
    phase?.flag === 'sc'
      ? 0.62
      : phase?.flag === 'vsc'
        ? 0.7
        : phase?.flag === 'yellow'
          ? 0.9
          : 1
  const weatherFactor =
    weather === 'heavy-rain' ? 0.86 : weather === 'light-rain' ? 0.94 : 1
  const efficiencyFactor = team
    ? clamp(
        1.055 - machinePaceRating(team.machine.fuelEfficiency) * 0.065,
        0.985,
        1.015,
      )
    : 1

  return (
    baseFuelBurnKgPerLap(track) *
    paceFactor[paceMode] *
    controlFactor *
    weatherFactor *
    efficiencyFactor
  )
}

export function initialFuelLoadKg(options: {
  raceLaps: number
  stage: WeekendStage
  track: TrackDefinition
}) {
  const { raceLaps, stage, track } = options
  const burn = baseFuelBurnKgPerLap(track)

  if (stage === 'race' || stage === 'sprint') {
    return clamp(burn * (raceLaps + 1.35), 35, 110)
  }

  if (stage === 'qualifying' || stage === 'sprintQualifying') {
    return clamp(burn * 4.2, 5.5, 10.5)
  }

  return clamp(burn * 9.5, 12, 24)
}

export type FuelMassEffects = {
  lapTimeDeltaSeconds: number
  tireLoadMultiplier: number
}

export function fuelMassEffects(options: {
  fuelLoadKg: number
  localDynamics?: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  track: TrackDefinition
}): FuelMassEffects {
  const { fuelLoadKg, localDynamics, track } = options
  const profile = trackLoadProfileFor(track)
  const fuelRatio = clamp(fuelLoadKg / 110, 0, 1)
  const accelerationMassRatio = (768 + fuelLoadKg) / 768
  const accelerationTimeShare =
    profile.accelerationShare * 0.19 + profile.brakingShare * 0.11
  const curvature = localDynamics?.curvature ?? profile.corneringShare

  return {
    lapTimeDeltaSeconds:
      track.baseLapTime *
      accelerationTimeShare *
      (accelerationMassRatio - 1) *
      0.58,
    tireLoadMultiplier: 1 + fuelRatio * (0.08 + curvature * 0.13),
  }
}

export function driverFuelUseMultiplier(driver: Driver) {
  return clamp(
    1.035 -
      driverSkillBlend(driver, {
        fuelManagement: 0.7,
        throttleControl: 0.3,
      }) *
        0.045,
    0.99,
    1.02,
  )
}
