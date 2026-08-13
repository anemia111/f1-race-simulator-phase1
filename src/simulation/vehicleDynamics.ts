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
import { driverSkillBlend } from './driverAbility'
import {
  effectiveMachineRating,
  MACHINE_PERFORMANCE_REFERENCE,
} from './machinePerformance'
import {
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
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
import { brakeHardwareCapacityFor } from './brakeDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback

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

/**
 * Structural subset of the active-aero State of Deployment. A full
 * `ActiveAeroState` is structurally assignable to this input, which keeps the
 * force model independent from the command/state-machine implementation.
 */
export type ActiveAeroStructuralInput = Readonly<{
  frontStraightFraction: number
  rearStraightFraction: number
  transitionProgress: number
}>

export type LongitudinalStepInput = {
  activeAeroMode: ActiveAeroMode
  /** Continuous wing positions. `activeAeroMode` is a compatibility fallback. */
  activeAeroState?: ActiveAeroStructuralInput
  /** Ballast or carried mass beyond the resolved operational mass and fuel. */
  additionalMassKg?: number
  airDensityKgM3: number
  /** Positive pitch is a bounded nose-down aerodynamic approximation. */
  aeroPitchDegrees?: number
  /** Absolute body-to-air yaw used for the bounded aero sensitivity term. */
  aeroYawDegrees?: number
  /**
   * Session-aware base vehicle mass, already including any heat-hazard mass.
   * Live production callers should pass the operational resolver output.
   */
  baseVehicleMassKg?: number
  /** Current disc/pad temperature used to constrain service-brake hardware. */
  brakeTemperatureC?: number
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
  /** Service-brake hardware availability applied before tyre-force limiting. */
  brakeHardwareCapacityMultiplier: number
  brakeForceN: number
  clutchEngagementFraction: number
  dragForceN: number
  driveForceN: number
  gear: number
  /** Mechanical generator power actually resisted at the tyre contact patch. */
  generatorMechanicalPowerKw: number
  gradeForceN: number
  /** Wheel drive power after subtracting generator resistance. */
  netPowerUnitWheelPowerKw: number
  regenerativeResistanceForceN: number
  rollingResistanceForceN: number
  rpm: number
  speedKph: number
  tractionLimitN: number
  turboSpoolFraction: number
  /** Positive ICE + MGU-K wheel power before generator resistance. */
  wheelDrivePowerKw: number
}

const profileCache = new WeakMap<TrackDefinition, TrackLoadProfile>()
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

export function dirtyAirDownforceMultiplier(options: {
  dynamics: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  gapSeconds: number
  /** Physical centre-to-centre offset. A car outside the wake loses less load. */
  lateralSeparationM?: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds >= 2.5 || dynamics.curvature < 0.025) {
    return 1
  }

  const proximity = 1 - clamp(gapSeconds / 2.5, 0, 1)
  const sensitivity =
    1.08 - machinePaceRating(team.machine.dirtyAirTolerance) * 0.22
  const wakeAlignment =
    options.lateralSeparationM === undefined
      ? 1
      : clamp(1 - Math.abs(options.lateralSeparationM) / 3.2, 0, 1) ** 1.35
  const loss =
    proximity ** 1.35 *
    dynamics.curvature *
    0.115 *
    sensitivity *
    wakeAlignment

  return clamp(1 - loss, 0.88, 1)
}

export function towDragReductionFor(options: {
  dynamics: Pick<TrackDynamicPoint, 'straightness'>
  gapSeconds: number
  /** Physical centre-to-centre offset. Tow vanishes when cars do not align. */
  lateralSeparationM?: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds > 1.8 || dynamics.straightness < 0.72) {
    return 0
  }

  const proximity = 1 - clamp((gapSeconds - 0.08) / 1.72, 0, 1)
  const wakeAlignment =
    options.lateralSeparationM === undefined
      ? 1
      : clamp(1 - Math.abs(options.lateralSeparationM) / 2.8, 0, 1) ** 1.2

  // A 19 % drag reduction is worth roughly 35 km/h of top speed, which is why
  // race peaks ran far further from observation than clear-air qualifying
  // peaks did. A tow is a real but far smaller effect than an open rear wing.
  return clamp(
    proximity *
      dynamics.straightness *
      (0.039 + machinePaceRating(team.machine.towSensitivity) * 0.028) *
      wakeAlignment,
    0,
    0.07,
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

export type ActiveAeroForceAssumptions = Readonly<{
  frontDownforceShare: number
  frontDragShare: number
  frontStraightDownforceRetention: number
  frontStraightDragRetention: number
  frontWakeExponent: number
  pitchBalanceShiftMaximum: number
  pitchDownforceLossMaximum: number
  pitchReferenceDegrees: number
  rearStraightDownforceRetention: number
  rearStraightDragRetention: number
  rearWakeExponent: number
  rideHeightDownforceLossMaximum: number
  rideHeightDragPenaltyMaximum: number
  rideHeightReferenceMm: number
  rideHeightSensitivityRangeMm: number
  transitionDownforceLossFraction: number
  transitionDragPenaltyFraction: number
  yawDownforceLossMaximum: number
  yawDragPenaltyMaximum: number
  yawReferenceDegrees: number
}>

export type ActiveAeroForceProvenance = Readonly<{
  assumptionSetId: string
  classification: 'category-level-prior-only'
  confidence: 'low' | 'high'
  methodVersion: 'decomposed-active-aero-force-v1'
  /** No public 2026 constructor range exists; never replace null by inference. */
  publicCoefficientRange: null
  sourceIds: readonly string[]
  statement: string
  validationStatus: 'prior-only' | 'structural-fixed-aero'
}>

type ActiveAeroCategoryPrior = Readonly<{
  activeAeroAvailable: boolean
  assumptions: ActiveAeroForceAssumptions
  provenance: ActiveAeroForceProvenance
}>

/**
 * Conservative category priors, not a fit to a speed, lap, circuit or team.
 * The cited public material establishes the mechanisms (independent front and
 * rear movement, lower drag in Straight Mode, ride/yaw/wake sensitivity), but
 * does not publish the coefficients. The bounded coefficients below are
 * therefore returned with every force result as explicit modeling assumptions.
 */
const ACTIVE_AERO_CATEGORY_PRIORS = {
  'f1-custom': {
    activeAeroAvailable: true,
    assumptions: {
      frontDownforceShare: 0.44,
      frontDragShare: 0.42,
      frontStraightDownforceRetention: 0.72,
      frontStraightDragRetention: 0.82,
      frontWakeExponent: 1.2,
      pitchBalanceShiftMaximum: 0.025,
      pitchDownforceLossMaximum: 0.05,
      pitchReferenceDegrees: 3,
      rearStraightDownforceRetention: 0.88,
      rearStraightDragRetention: 0.68,
      rearWakeExponent: 0.8,
      rideHeightDownforceLossMaximum: 0.08,
      rideHeightDragPenaltyMaximum: 0.025,
      rideHeightReferenceMm: 28,
      rideHeightSensitivityRangeMm: 18,
      transitionDownforceLossFraction: 0.02,
      transitionDragPenaltyFraction: 0.015,
      yawDownforceLossMaximum: 0.1,
      yawDragPenaltyMaximum: 0.04,
      yawReferenceDegrees: 8,
    },
    provenance: {
      assumptionSetId: 'f1-2026-decomposed-active-aero-prior-v1',
      classification: 'category-level-prior-only',
      confidence: 'low',
      methodVersion: 'decomposed-active-aero-force-v1',
      publicCoefficientRange: null,
      sourceIds: [
        'fia-f1-2026-technical-c20',
        'fia-f1-2026-active-aero-overview',
        'fia-f1-2026-australia-post-race-transcript',
        'dimastrogiovanni-reina-burzoni-2019-active-drag',
        'diba-barari-esmailzadeh-2014-active-aero-handling',
        'buscariolo-et-al-2019-imperial-front-wing',
      ],
      statement:
        'Qualitative mechanisms are source-backed; all quantitative coefficients are conservative bounded category priors.',
      validationStatus: 'prior-only',
    },
  },
  'super-formula': {
    activeAeroAvailable: false,
    assumptions: {
      frontDownforceShare: 0.43,
      frontDragShare: 0.43,
      frontStraightDownforceRetention: 1,
      frontStraightDragRetention: 1,
      frontWakeExponent: 1.15,
      pitchBalanceShiftMaximum: 0.02,
      pitchDownforceLossMaximum: 0.04,
      pitchReferenceDegrees: 3,
      rearStraightDownforceRetention: 1,
      rearStraightDragRetention: 1,
      rearWakeExponent: 0.82,
      rideHeightDownforceLossMaximum: 0.065,
      rideHeightDragPenaltyMaximum: 0.02,
      rideHeightReferenceMm: 28,
      rideHeightSensitivityRangeMm: 20,
      transitionDownforceLossFraction: 0,
      transitionDragPenaltyFraction: 0,
      yawDownforceLossMaximum: 0.08,
      yawDragPenaltyMaximum: 0.035,
      yawReferenceDegrees: 8,
    },
    provenance: {
      assumptionSetId: 'sf-2026-fixed-aero-prior-v1',
      classification: 'category-level-prior-only',
      confidence: 'high',
      methodVersion: 'decomposed-active-aero-force-v1',
      publicCoefficientRange: null,
      sourceIds: ['jaf-sf-2026-unified-regulations'],
      statement:
        'Super Formula has fixed bodywork in this model; deployment fractions are intentionally neutral.',
      validationStatus: 'structural-fixed-aero',
    },
  },
} as const satisfies Record<
  CategoryPhysicsProfile['id'],
  ActiveAeroCategoryPrior
>

export type ActiveAeroForceResult = Readonly<{
  activeAeroAvailable: boolean
  aeroBalanceFrontFraction: number
  aeroBalanceShift: number
  assumptions: ActiveAeroForceAssumptions
  effectiveDownforceMultiplier: number
  effectiveDragAreaM2: number
  frontDownforceN: number
  frontDragN: number
  modifiers: Readonly<{
    frontWakeMultiplier: number
    pitchBalanceShift: number
    pitchDownforceMultiplier: number
    rearWakeMultiplier: number
    rideHeightDownforceMultiplier: number
    rideHeightDragMultiplier: number
    transitionEnvelope: number
    yawDownforceMultiplier: number
    yawDragMultiplier: number
  }>
  provenance: ActiveAeroForceProvenance
  rearDownforceN: number
  rearDragN: number
  structuralInput: ActiveAeroStructuralInput
  totalDownforceN: number
  totalDragN: number
  transitionTransientDownforceLossN: number
  transitionTransientDragN: number
}>

function activeAeroStateForMode(
  mode: ActiveAeroMode,
): ActiveAeroStructuralInput {
  if (mode === 'straight') {
    return {
      frontStraightFraction: 1,
      rearStraightFraction: 1,
      transitionProgress: 1,
    }
  }

  if (mode === 'partial-straight') {
    return {
      frontStraightFraction: 1,
      rearStraightFraction: 0,
      transitionProgress: 1,
    }
  }

  return {
    frontStraightFraction: 0,
    rearStraightFraction: 0,
    transitionProgress: 1,
  }
}

export type ActiveAeroReferenceAreaMultipliers = Readonly<{
  aeroBalanceFrontFraction: number
  downforceAreaMultiplier: number
  dragAreaMultiplier: number
  frontDownforceAreaMultiplier: number
  frontDragAreaMultiplier: number
  rearDownforceAreaMultiplier: number
  rearDragAreaMultiplier: number
  structuralInput: ActiveAeroStructuralInput
}>

/**
 * Category-neutral area ratios for offline/reference laps.
 *
 * The live force path additionally applies team, setup, ride-height, pitch,
 * yaw and wake inputs. An offline lap has none of those observations, so this
 * adapter uses the same decomposed category prior at its neutral point instead
 * of reviving one aggregate Straight-Mode drag scalar.
 */
export function activeAeroReferenceAreaMultipliers(options: {
  activeAeroState: ActiveAeroStructuralInput
  categoryPhysics: CategoryPhysicsProfile
}): ActiveAeroReferenceAreaMultipliers {
  const prior = ACTIVE_AERO_CATEGORY_PRIORS[options.categoryPhysics.id]
  const assumptions = prior.assumptions
  const structuralInput = {
    frontStraightFraction: prior.activeAeroAvailable
      ? clamp(finiteOr(options.activeAeroState.frontStraightFraction, 0), 0, 1)
      : 0,
    rearStraightFraction: prior.activeAeroAvailable
      ? clamp(finiteOr(options.activeAeroState.rearStraightFraction, 0), 0, 1)
      : 0,
    transitionProgress: prior.activeAeroAvailable
      ? clamp(finiteOr(options.activeAeroState.transitionProgress, 1), 0, 1)
      : 1,
  } satisfies ActiveAeroStructuralInput
  const retention = (straightRetention: number, straightFraction: number) =>
    1 - (1 - straightRetention) * straightFraction
  const transitionEnvelope = prior.activeAeroAvailable
    ? Math.sin(Math.PI * structuralInput.transitionProgress)
    : 0
  const transitionDragMultiplier =
    assumptions.transitionDragPenaltyFraction * transitionEnvelope
  const transitionDownforceMultiplier =
    1 - assumptions.transitionDownforceLossFraction * transitionEnvelope
  const frontDragAreaMultiplier =
    assumptions.frontDragShare *
    (retention(
      assumptions.frontStraightDragRetention,
      structuralInput.frontStraightFraction,
    ) + transitionDragMultiplier)
  const rearDragAreaMultiplier =
    (1 - assumptions.frontDragShare) *
    (retention(
      assumptions.rearStraightDragRetention,
      structuralInput.rearStraightFraction,
    ) + transitionDragMultiplier)
  const frontDownforceAreaMultiplier =
    assumptions.frontDownforceShare *
    retention(
      assumptions.frontStraightDownforceRetention,
      structuralInput.frontStraightFraction,
    ) *
    transitionDownforceMultiplier
  const rearDownforceAreaMultiplier =
    (1 - assumptions.frontDownforceShare) *
    retention(
      assumptions.rearStraightDownforceRetention,
      structuralInput.rearStraightFraction,
    ) *
    transitionDownforceMultiplier
  const downforceAreaMultiplier =
    frontDownforceAreaMultiplier + rearDownforceAreaMultiplier

  return {
    aeroBalanceFrontFraction:
      downforceAreaMultiplier > 1e-9
        ? frontDownforceAreaMultiplier / downforceAreaMultiplier
        : assumptions.frontDownforceShare,
    downforceAreaMultiplier,
    dragAreaMultiplier: frontDragAreaMultiplier + rearDragAreaMultiplier,
    frontDownforceAreaMultiplier,
    frontDragAreaMultiplier,
    rearDownforceAreaMultiplier,
    rearDragAreaMultiplier,
    structuralInput,
  }
}

function baseVehicleDragAreaM2(options: {
  categoryPhysics: CategoryPhysicsProfile
  setup?: CarSetup
  team: Team
}) {
  const machine = options.team.machine
  const baseDragArea =
    1.18 -
    machinePaceRating(machine.dragEfficiency) * 0.1 -
    machinePaceRating(machine.aerodynamicEfficiency) * 0.03 -
    machinePaceRating(machine.straightLineEfficiency) * 0.025

  return clamp(
    baseDragArea *
      options.categoryPhysics.dragAreaScale *
      setupDragAreaMultiplier(options.setup),
    0.325,
    1.45,
  )
}

/**
 * Pure decomposed aerodynamic force model for the continuous State of
 * Deployment. Positive pitch means nose-down; yaw is the absolute body-to-air
 * angle. Neither input is inferred from a lap-time or speed observation.
 */
export function activeAeroForceComponents(options: {
  activeAeroState: ActiveAeroStructuralInput
  airDensityKgM3: number
  airSpeedMps: number
  categoryPhysics: CategoryPhysicsProfile
  dirtyAirDownforceMultiplier?: number
  pitchDegrees?: number
  setup?: CarSetup
  team: Team
  towDragReduction?: number
  yawDegrees?: number
}): ActiveAeroForceResult {
  const prior = ACTIVE_AERO_CATEGORY_PRIORS[options.categoryPhysics.id]
  const assumptions = prior.assumptions
  const activeAeroAvailable = prior.activeAeroAvailable
  const structuralInput = {
    frontStraightFraction: activeAeroAvailable
      ? clamp(
          finiteOr(options.activeAeroState.frontStraightFraction, 0),
          0,
          1,
        )
      : 0,
    rearStraightFraction: activeAeroAvailable
      ? clamp(
          finiteOr(options.activeAeroState.rearStraightFraction, 0),
          0,
          1,
        )
      : 0,
    transitionProgress: activeAeroAvailable
      ? clamp(finiteOr(options.activeAeroState.transitionProgress, 1), 0, 1)
      : 1,
  } satisfies ActiveAeroStructuralInput
  const dynamicPressurePa =
    0.5 *
    Math.max(0, finiteOr(options.airDensityKgM3, 1.225)) *
    Math.max(0, finiteOr(options.airSpeedMps, 0)) ** 2
  const baseDragAreaM2 = baseVehicleDragAreaM2({
    categoryPhysics: options.categoryPhysics,
    setup: options.setup,
    team: options.team,
  })
  const baseLiftAreaM2 =
    options.categoryPhysics.liftAreaM2 *
    vehicleDownforceMultiplier({ setup: options.setup, team: options.team })
  const efficiencyDelta =
    machinePaceRating(options.team.machine.activeAeroEfficiency) -
    MACHINE_PERFORMANCE_REFERENCE
  const dragEffectScale = clamp(1 + efficiencyDelta * 0.08, 0.98, 1.02)
  const downforceLossScale = clamp(1 - efficiencyDelta * 0.05, 0.985, 1.015)
  const retention = (
    straightRetention: number,
    straightFraction: number,
    effectScale: number,
  ) =>
    clamp(
      1 -
        (1 - straightRetention) * straightFraction * effectScale,
      straightRetention * 0.97,
      1,
    )
  const rideHeightMm = finiteOr(
    options.setup?.rideHeightMm ?? assumptions.rideHeightReferenceMm,
    assumptions.rideHeightReferenceMm,
  )
  const rideHeightSensitivity = clamp(
    Math.abs(rideHeightMm - assumptions.rideHeightReferenceMm) /
      assumptions.rideHeightSensitivityRangeMm,
    0,
    1,
  )
  const rideHeightDownforceMultiplier =
    1 -
    assumptions.rideHeightDownforceLossMaximum * rideHeightSensitivity ** 2
  const rideHeightDragMultiplier =
    1 + assumptions.rideHeightDragPenaltyMaximum * rideHeightSensitivity ** 2
  const pitchFraction = clamp(
    finiteOr(options.pitchDegrees ?? 0, 0) / assumptions.pitchReferenceDegrees,
    -1,
    1,
  )
  const pitchDownforceMultiplier =
    1 - assumptions.pitchDownforceLossMaximum * Math.abs(pitchFraction) ** 2
  const pitchBalanceShift =
    assumptions.pitchBalanceShiftMaximum * pitchFraction
  const yawFraction = clamp(
    Math.abs(finiteOr(options.yawDegrees ?? 0, 0)) /
      assumptions.yawReferenceDegrees,
    0,
    1,
  )
  const yawDownforceMultiplier =
    1 - assumptions.yawDownforceLossMaximum * yawFraction ** 2
  const yawDragMultiplier =
    1 + assumptions.yawDragPenaltyMaximum * yawFraction ** 2
  const wake = clamp(
    finiteOr(options.dirtyAirDownforceMultiplier ?? 1, 1),
    0.5,
    1,
  )
  const frontWakeMultiplier = clamp(
    wake ** assumptions.frontWakeExponent,
    0.4,
    1,
  )
  const rearWakeMultiplier = clamp(
    wake ** assumptions.rearWakeExponent,
    0.4,
    1,
  )
  const tow = clamp(finiteOr(options.towDragReduction ?? 0, 0), 0, 0.2)
  const frontTowMultiplier = clamp(1 - tow * 1.05, 0.75, 1)
  const rearTowMultiplier = clamp(1 - tow * 0.85, 0.75, 1)
  const transitionEnvelope = activeAeroAvailable
    ? Math.sin(Math.PI * structuralInput.transitionProgress)
    : 0
  const frontDragRetention = retention(
    assumptions.frontStraightDragRetention,
    structuralInput.frontStraightFraction,
    dragEffectScale,
  )
  const rearDragRetention = retention(
    assumptions.rearStraightDragRetention,
    structuralInput.rearStraightFraction,
    dragEffectScale,
  )
  const transitionDragAreaM2 =
    baseDragAreaM2 *
    assumptions.transitionDragPenaltyFraction *
    transitionEnvelope
  const frontDragAreaM2 =
    baseDragAreaM2 *
      assumptions.frontDragShare *
      frontDragRetention *
      rideHeightDragMultiplier *
      yawDragMultiplier *
      frontTowMultiplier +
    transitionDragAreaM2 * assumptions.frontDragShare
  const rearDragAreaM2 =
    baseDragAreaM2 *
      (1 - assumptions.frontDragShare) *
      rearDragRetention *
      rideHeightDragMultiplier *
      yawDragMultiplier *
      rearTowMultiplier +
    transitionDragAreaM2 * (1 - assumptions.frontDragShare)
  const frontBalanceBeforeDeployment = clamp(
    assumptions.frontDownforceShare + pitchBalanceShift,
    0.35,
    0.6,
  )
  const frontDownforceRetention = retention(
    assumptions.frontStraightDownforceRetention,
    structuralInput.frontStraightFraction,
    downforceLossScale,
  )
  const rearDownforceRetention = retention(
    assumptions.rearStraightDownforceRetention,
    structuralInput.rearStraightFraction,
    downforceLossScale,
  )
  const commonDownforceMultiplier =
    rideHeightDownforceMultiplier *
    pitchDownforceMultiplier *
    yawDownforceMultiplier
  const transitionDownforceMultiplier =
    1 -
    assumptions.transitionDownforceLossFraction * transitionEnvelope
  const frontDownforceAreaBeforeTransitionM2 =
    baseLiftAreaM2 *
    frontBalanceBeforeDeployment *
    frontDownforceRetention *
    frontWakeMultiplier *
    commonDownforceMultiplier
  const rearDownforceAreaBeforeTransitionM2 =
    baseLiftAreaM2 *
    (1 - frontBalanceBeforeDeployment) *
    rearDownforceRetention *
    rearWakeMultiplier *
    commonDownforceMultiplier
  const frontDownforceAreaM2 =
    frontDownforceAreaBeforeTransitionM2 * transitionDownforceMultiplier
  const rearDownforceAreaM2 =
    rearDownforceAreaBeforeTransitionM2 * transitionDownforceMultiplier
  const effectiveDragAreaM2 = Math.max(0, frontDragAreaM2 + rearDragAreaM2)
  const effectiveDownforceAreaM2 = Math.max(
    0,
    frontDownforceAreaM2 + rearDownforceAreaM2,
  )
  const frontDragN = dynamicPressurePa * frontDragAreaM2
  const rearDragN = dynamicPressurePa * rearDragAreaM2
  const frontDownforceN = dynamicPressurePa * frontDownforceAreaM2
  const rearDownforceN = dynamicPressurePa * rearDownforceAreaM2
  const totalDownforceN = frontDownforceN + rearDownforceN
  const aeroBalanceFrontFraction =
    effectiveDownforceAreaM2 > 1e-9
      ? frontDownforceAreaM2 / effectiveDownforceAreaM2
      : assumptions.frontDownforceShare

  return {
    activeAeroAvailable,
    aeroBalanceFrontFraction,
    aeroBalanceShift:
      aeroBalanceFrontFraction - assumptions.frontDownforceShare,
    assumptions,
    effectiveDownforceMultiplier:
      effectiveDownforceAreaM2 /
      Math.max(1e-9, options.categoryPhysics.liftAreaM2),
    effectiveDragAreaM2,
    frontDownforceN,
    frontDragN,
    modifiers: {
      frontWakeMultiplier,
      pitchBalanceShift,
      pitchDownforceMultiplier,
      rearWakeMultiplier,
      rideHeightDownforceMultiplier,
      rideHeightDragMultiplier,
      transitionEnvelope,
      yawDownforceMultiplier,
      yawDragMultiplier,
    },
    provenance: prior.provenance,
    rearDownforceN,
    rearDragN,
    structuralInput,
    totalDownforceN,
    totalDragN: frontDragN + rearDragN,
    transitionTransientDownforceLossN:
      dynamicPressurePa *
      (frontDownforceAreaBeforeTransitionM2 +
        rearDownforceAreaBeforeTransitionM2) *
      (1 - transitionDownforceMultiplier),
    transitionTransientDragN: dynamicPressurePa * transitionDragAreaM2,
  }
}

export function vehicleDragAreaM2(options: {
  activeAeroMode: ActiveAeroMode
  activeAeroState?: ActiveAeroStructuralInput
  categoryPhysics?: CategoryPhysicsProfile
  setup?: CarSetup
  team: Team
  towDragReduction?: number
}) {
  const categoryPhysics =
    options.categoryPhysics ?? categoryPhysicsFor(undefined)

  return activeAeroForceComponents({
    activeAeroState:
      options.activeAeroState ?? activeAeroStateForMode(options.activeAeroMode),
    // q = 1 Pa makes the pure force decomposition directly observable as area.
    airDensityKgM3: 2,
    airSpeedMps: 1,
    categoryPhysics,
    setup: options.setup,
    team: options.team,
    towDragReduction: options.towDragReduction,
  }).effectiveDragAreaM2
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
    // Wings trim a car between its Monza and Monaco configurations. That is
    // real but bounded: it does not move a third of the drag area in each
    // direction, which the old 0.68-1.25 range allowed.
    0.86,
    1.14,
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
 * Evaluates positive ICE power at the driven wheels using the same gear,
 * torque curve, turbo, clutch and transmission model as the live integrator.
 * This classifies full-throttle super-clipping before the following tick; it
 * does not alter an Energy Store or regulatory limit.
 */
export function combustionWheelPowerKwAt(options: {
  categoryPhysics?: CategoryPhysicsProfile
  clutchEngagementFraction?: number
  currentSpeedKph: number
  extraCombustionPowerKw?: number
  team: Team
  throttlePercent: number
  transmissionEfficiency?: number
  turboSpoolFraction?: number
}) {
  const physics = options.categoryPhysics ?? categoryPhysicsFor(undefined)
  const speedMps = Math.max(0, finiteOr(options.currentSpeedKph, 0)) / 3.6
  const transmissionEfficiency = clamp(
    finiteOr(
      options.transmissionEfficiency ?? physics.drivetrainEfficiency,
      physics.drivetrainEfficiency,
    ),
    0,
    1,
  )
  const selection = selectGear({
    clutchEngagementFraction: options.clutchEngagementFraction,
    combustionPowerKw:
      combustionPowerKwFor(options.team, physics) +
      Math.max(0, finiteOr(options.extraCombustionPowerKw ?? 0, 0)),
    deploymentPowerKw: 0,
    physics,
    speedMps,
    transmissionEfficiency,
    turboSpoolFraction: options.turboSpoolFraction,
  })

  return Math.max(
    0,
    (selection.driveForceN *
      speedMps *
      clamp(finiteOr(options.throttlePercent, 0) / 100, 0, 1)) /
      1000,
  )
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

export function vehicleTyreGripMultiplierForTeam(
  team: Team,
  surfaceMultiplier: number,
) {
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
  /** Continuous bodywork position used by the same live force decomposition. */
  activeAeroState?: ActiveAeroStructuralInput
  additionalMassKg?: number
  airDensityKgM3: number
  /** Session-aware base mass, already including heat-hazard mass. */
  baseVehicleMassKg?: number
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

  const baseVehicleMassKg =
    options.baseVehicleMassKg ??
    resolveOperationalVehicleMass({
      f1NominalTyreMassKg: null,
      physics: options.categoryPhysics,
      weekendStage: 'race',
    }).operationalMassKg
  const exactMassKg =
    baseVehicleMassKg +
    clamp(finiteOr(options.fuelLoadKg, 0), 0, 120) +
    clamp(finiteOr(options.additionalMassKg ?? 0, 0), 0, 250)
  const exactDownforceMultiplier = options.activeAeroState
    ? activeAeroForceComponents({
        activeAeroState: options.activeAeroState,
        // q = 1 Pa exposes the effective load area without introducing a
        // speed target; the returned multiplier is independent of q.
        airDensityKgM3: 2,
        airSpeedMps: 1,
        categoryPhysics: options.categoryPhysics,
        dirtyAirDownforceMultiplier: options.dirtyAirDownforceMultiplier,
        setup: options.setup,
        team: options.team,
      }).effectiveDownforceMultiplier
    : vehicleDownforceMultiplier({
        dirtyAirDownforceMultiplier: options.dirtyAirDownforceMultiplier,
        setup: options.setup,
        team: options.team,
      })
  const exactGripMultiplier = vehicleTyreGripMultiplierForTeam(
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
  const baseVehicleMassKg =
    input.baseVehicleMassKg ??
    resolveOperationalVehicleMass({
      f1NominalTyreMassKg: null,
      physics: categoryPhysics,
      weekendStage: 'race',
    }).operationalMassKg
  const massKg = Math.max(
    1,
    baseVehicleMassKg +
      clamp(finiteOr(input.fuelLoadKg, 0), 0, 120) +
      clamp(finiteOr(input.additionalMassKg ?? 0, 0), 0, 250),
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
    )
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
  // 620 C lies inside the neutral simulator-policy operating window. It
  // preserves the compatibility behavior for callers that do not yet own a
  // live disc-temperature state, while production telemetry supplies one.
  const brakeHardwareCapacity = brakeHardwareCapacityFor({
    brakeTemperatureC: input.brakeTemperatureC ?? 620,
    maximumBrakeDecelerationMps2:
      categoryPhysics.maximumBrakeDecelerationMps2,
  })
  const gripMultiplier = vehicleTyreGripMultiplierForTeam(
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
  const activeAeroState =
    input.activeAeroState ?? activeAeroStateForMode(input.activeAeroMode)
  const inferredPitchDegrees =
    input.aeroPitchDegrees ??
    clamp(
      clamp(finiteOr(input.brakePercent, 0) / 100, 0, 1) * 1.2 -
        clamp(finiteOr(input.throttlePercent, 0) / 100, 0, 1) * 0.35,
      -3,
      3,
    )
  const inferredYawDegrees =
    input.aeroYawDegrees ??
    clamp(
      (1 - clamp(finiteOr(input.dynamics.straightness, 1), 0, 1)) * 2.5 +
        Math.abs(finiteOr(input.dynamics.referenceLineOffsetM ?? 0, 0)) *
          0.2,
      0,
      8,
    )
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
    const aeroForces = activeAeroForceComponents({
      activeAeroState,
      airDensityKgM3: input.airDensityKgM3,
      airSpeedMps,
      categoryPhysics,
      dirtyAirDownforceMultiplier: input.dirtyAirDownforceMultiplier,
      pitchDegrees: inferredPitchDegrees,
      setup: input.setup,
      team: input.team,
      towDragReduction: input.towDragReduction,
      yawDegrees: inferredYawDegrees,
    })
    const dragForceN = aeroForces.totalDragN
    const staticWeightN = massKg * GRAVITY_MPS2
    const staticFrontShare = clamp(
      (staticWeightN * 0.45 + aeroForces.frontDownforceN) /
        Math.max(1, staticWeightN + aeroForces.totalDownforceN),
      0.35,
      0.6,
    )
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
        downforceMultiplier: aeroForces.effectiveDownforceMultiplier,
        gripMultiplier,
        lateralForceN,
        longitudinalAccelerationMps2: accelerationMps2,
        massKg,
        physics: categoryPhysics,
        speedMps,
        staticFrontShare,
      })
      const serviceBrakeCapacityN = Math.min(
        capacity.brakeForceCapacityN,
        brakeHardwareCapacity.maximumBrakeDecelerationMps2 * massKg,
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
  const wheelDrivePowerKw = Math.max(
    0,
    (lastDriveForceN * nextMps) / 1000,
  )
  const generatorMechanicalPowerKw = Math.max(
    0,
    (lastRegenerativeResistanceForceN * nextMps) / 1000,
  )

  return {
    accelerationMps2: finiteOr(lastAccelerationMps2, 0),
    brakeHardwareCapacityMultiplier: brakeHardwareCapacity.capacityMultiplier,
    brakeForceN: Math.max(0, finiteOr(lastBrakeForceN, 0)),
    clutchEngagementFraction: clamp(
      finiteOr(clutchEngagementFraction, 0),
      0,
      1,
    ),
    dragForceN: Math.max(0, finiteOr(lastDragForceN, 0)),
    driveForceN: Math.max(0, finiteOr(lastDriveForceN, 0)),
    gear: lastSelection.gear,
    generatorMechanicalPowerKw,
    gradeForceN: finiteOr(gradeForceN, 0),
    netPowerUnitWheelPowerKw:
      wheelDrivePowerKw - generatorMechanicalPowerKw,
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
    wheelDrivePowerKw,
  }
}

/** Backward-compatible scalar wrapper for callers that only consume speed. */
export function integrateVehicleSpeedKph(input: LongitudinalStepInput) {
  return integrateVehicleLongitudinalStep(input).speedKph
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
