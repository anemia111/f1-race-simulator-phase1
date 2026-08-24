import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import type {
  ActiveAeroState,
  ActiveFlagPhase,
  CarSetup,
  CarSnapshot,
  Driver,
  DriverDecisionPath,
  OvertakeStatus,
  Team,
  TrackDefinition,
  WeatherState,
  WeekendStage,
} from '../types'
import {
  activeAeroDisplayModeForState,
  advanceActiveAeroState,
  createInitialActiveAeroState,
  overtakeStatusFor,
} from './activeAero'
import {
  categoryHasHybridEnergyStore,
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
  type CategoryPhysicsProfile,
  type OperationalVehicleMassResolution,
} from './categoryPhysics'
import { driverSkillBlend } from './driverAbility'
import {
  driverBehaviorTraits,
  type DriverDecision,
} from './driverDecision'
import {
  f1ActiveAeroModeForPath,
  f1ElectricalOvertakeIntentForPath,
  f1EnergyIntentForPath,
  f1ErsModeIntentForPath,
  sfOtsUseRequestedForPath,
} from './categoryDriverAgent'
import {
  advanceEnergyStore,
  energyDeploymentRequestFor,
  normalizeEnergyStoreState,
} from './energySystem'
import {
  permittedMguKDcPowerKwForSpeed,
  type MguKPowerCurve,
} from './regulations'
import {
  advanceSuperClipping,
  type SuperClippingResult,
} from './superClipping'
import { resolveSuperFormulaOperational } from './superFormulaOperational'
import {
  f1TireForceEnvelopeFor,
  tireOperatingWindowFor,
  tireTrackGripMultiplier,
  type TireTrackCondition,
} from './tires'
import { brakeHardwareCapacityFor } from './brakeDynamics'
import { trackDynamicsAt } from './trackDynamics'
import { gripForSurfaceWater } from './trackWater'
import {
  airDensityKgM3,
  combustionWheelPowerKwAt,
  dirtyAirDownforceMultiplier,
  fuelMassEffects,
  integrateVehicleLongitudinalStep,
  liveCorneringSpeedLimitKph,
  previewServiceBrakeMechanicalBudget,
  towDragReductionFor,
  type LongitudinalStepInput,
} from './vehicleDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Debits only CU-K DC energy that could not have been used on the normal curve. */
export function overtakeIncrementalDcEnergyUsedMj(options: {
  actualDeploymentDcPowerKw: number
  active: boolean
  deltaSeconds: number
  normalDeploymentDcLimitKw: number
  remainingAllowanceMj: number
}) {
  if (!options.active) return 0

  const incrementalDcPowerKw = Math.max(
    0,
    options.actualDeploymentDcPowerKw - options.normalDeploymentDcLimitKw,
  )

  return Math.min(
    Math.max(0, options.remainingAllowanceMj),
    (Math.max(0, options.deltaSeconds) * incrementalDcPowerKw) / 1000,
  )
}

/**
 * Caps the Overtake DC curve before integration so the remaining per-lap
 * allowance cannot be spent beyond its ledger inside one simulation frame.
 */
export function overtakeAllowanceBoundedDcPowerLimitKw(options: {
  active: boolean
  declaredDeploymentDcPowerLimitKw: number
  deltaSeconds: number
  normalDeploymentDcPowerLimitKw: number
  remainingAllowanceMj: number
}) {
  const declaredLimitKw = Math.max(
    0,
    options.declaredDeploymentDcPowerLimitKw,
  )
  if (!options.active) return declaredLimitKw

  const deltaSeconds = Math.max(0, options.deltaSeconds)
  const remainingAllowanceMj = Math.max(0, options.remainingAllowanceMj)
  const allowancePowerKw =
    deltaSeconds > 0 ? (remainingAllowanceMj * 1000) / deltaSeconds : 0

  return Math.min(
    declaredLimitKw,
    Math.max(0, options.normalDeploymentDcPowerLimitKw) + allowancePowerKw,
  )
}

type CalculatedTelemetry = {
  brakePercent: number
  /** Frame-averaged contact-patch work dissipated by service-brake friction. */
  frictionServiceBrakePowerKw: number
  gear: number
  rpm: number
  /** Category-owned F1 or SUPER FORMULA state after this force step. */
  runtimeSystems: CarSnapshot['runtimeSystems']
  speedKph: number
  throttlePercent: number
  /** F1 Pirelli temperature only; SF physical coefficients are unavailable. */
  tireTemperatureC: number | null
  overtakeStatus: OvertakeStatus
  turboSpoolFraction: number
  clutchEngagementFraction: number
}

export function calculateCarTelemetry(options: {
  car: CarSnapshot
  /** Physical lateral position of the nearest car ahead, when one exists. */
  aheadLateralOffsetM?: number
  deltaSeconds: number
  driver: Driver
  driverDecision?: DriverDecision
  driverDecisionPath?: DriverDecisionPath
  elapsedSeconds: number
  phase: ActiveFlagPhase | null
  localFlagPaceScale?: number
  lowGripConditions: boolean
  isFinalLap?: boolean
  /** Authoritative FIA event input; null/omission keeps it unavailable. */
  fiaNominalTyreMassKg?: number | null
  raceControlOvertakeEnabled?: boolean
  overtakeSystem?: 'active-aero' | 'ots'
  seriesId?: ExecutableSeriesId
  /** Pre-resolved by the weekend runtime when available. */
  operationalVehicleMass?: OperationalVehicleMassResolution
  regulatoryMassIncreaseKg?: number
  performanceSession?: 'qualifying' | 'race'
  raceLap: number
  sessionType?: 'race-distance' | 'limited-time'
  timedRunPhase?: CarSnapshot['timedRunPhase']
  timedTrafficYield?: boolean
  standingStartLaunchActive?: boolean
  standingStartMguKRestricted?: boolean
  specifiedErsPowerSector?: boolean
  surfaceWaterMm?: number
  trackCondition?: TireTrackCondition
  setup?: CarSetup
  headwindMps?: number
  categoryPhysics?: CategoryPhysicsProfile
  track: TrackDefinition
  team: Team
  trackGrip: number
  airTemperatureC?: number
  trackTemperatureC?: number
  weather: WeatherState
  vehicleEraId?: RuntimeVehicleEraId
  weekendStage?: WeekendStage
}): CalculatedTelemetry {
  const {
    car,
    aheadLateralOffsetM,
    categoryPhysics = categoryPhysicsFor(undefined),
    deltaSeconds,
    driver,
    driverDecision,
    driverDecisionPath,
    elapsedSeconds,
    phase,
    localFlagPaceScale = 1,
    lowGripConditions,
    isFinalLap = false,
    raceControlOvertakeEnabled = true,
    overtakeSystem = 'active-aero',
    seriesId,
    regulatoryMassIncreaseKg = 0,
    sessionType = 'race-distance',
    raceLap,
    timedRunPhase = car.timedRunPhase,
    timedTrafficYield = false,
    standingStartLaunchActive = false,
    standingStartMguKRestricted = false,
    specifiedErsPowerSector = false,
    surfaceWaterMm: providedSurfaceWaterMm,
    trackCondition: providedTrackCondition,
    setup,
    headwindMps = 0,
    track,
    team,
    trackGrip,
    airTemperatureC = 25,
    trackTemperatureC = 30,
    weather,
    vehicleEraId,
  } = options
  const f1Runtime =
    car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
  const f1Tires = f1Runtime?.tires ?? null
  const superFormulaRuntime =
    car.runtimeSystems.kind === 'super-formula' ? car.runtimeSystems : null
  // A hybrid Energy Store is a runtime subsystem, not merely a zero-valued
  // category-physics capability.  This prevents the SF path from creating or
  // normalising an F1 electrical ledger.
  const hasHybridEnergyStore =
    f1Runtime !== null && categoryHasHybridEnergyStore(categoryPhysics)
  const superFormulaOperational =
    categoryPhysics.id === 'super-formula'
      ? resolveSuperFormulaOperational()
      : null
  const superFormulaOts = superFormulaRuntime?.ots
  // Article 24.3.8 delegates OTS operation to an event source. With no
  // verified event pack (or no evaluated event conditions), this is false and
  // the runtime must neither activate OTS nor preserve a legacy allocation.
  const otsRuntimeCanActivate =
    superFormulaOts?.availability === 'verified-event-rule' &&
    superFormulaOts.runtimeEligibility.canActivate
  const operationalVehicleMass =
    options.operationalVehicleMass ??
    resolveOperationalVehicleMass({
      f1NominalTyreMassKg: options.fiaNominalTyreMassKg ?? null,
      heatHazardAddedMassKg: regulatoryMassIncreaseKg,
      physics: categoryPhysics,
      weekendStage:
        options.weekendStage ??
        (options.performanceSession === 'qualifying' ? 'qualifying' : 'race'),
    })
  const behaviorTraits = driverDecision?.traits ?? driverBehaviorTraits(driver)
  const lateralSeparationM =
    aheadLateralOffsetM === undefined
      ? undefined
      : car.lateralOffsetM - aheadLateralOffsetM
  const isPreparationLap =
    timedRunPhase === 'out-lap' ||
    timedRunPhase === 'in-lap' ||
    timedRunPhase === 'cooldown'
  const preparationPaceScale =
    timedRunPhase === 'in-lap'
      ? 0.76
      : timedRunPhase === 'out-lap'
        ? 0.84
        : timedRunPhase === 'cooldown'
          ? 0.8
          : 1
  const surfaceWaterMm =
    providedSurfaceWaterMm ??
    (weather === 'heavy-rain' ? 1.2 : weather === 'light-rain' ? 0.35 : 0)
  const trackCondition =
    providedTrackCondition ??
    ({
      dryingLine: weather === 'clear' ? 1 : 0,
      rainIntensityMmH: 0,
      surfaceWaterMm,
    } satisfies TireTrackCondition)
  const ambientAirDensityKgM3 = airDensityKgM3({
    altitudeMeters: track.altitudeMeters,
    temperatureC: airTemperatureC,
  })
  const dynamics = trackDynamicsAt(
    track,
    standingStartLaunchActive && car.progress >= 0.88 ? 0 : car.progress,
    categoryPhysics,
  )
  const energyStoreAtFrameStart = f1Runtime
    ? normalizeEnergyStoreState(
        f1Runtime.energyStore,
        team,
        f1Runtime.ersBatteryPercent,
      )
    : null
  const batteryPercentAtFrameStart = energyStoreAtFrameStart
    ? energyStoreAtFrameStart.stateOfCharge * 100
    : 0
  const massEquivalentFuelLoadKg =
    car.fuelLoadKg + Math.max(0, regulatoryMassIncreaseKg)
  const fuelEffects = fuelMassEffects({
    fuelLoadKg: massEquivalentFuelLoadKg,
    localDynamics: dynamics,
    track,
  })
  const requestedActiveAeroMode =
    f1Runtime === null || isPreparationLap || overtakeSystem === 'ots'
      ? ('corner' as const)
      : f1ActiveAeroModeForPath({
          options: {
            car,
            lowGripConditions,
            phase,
            track,
          },
          path: driverDecisionPath,
          seriesId,
          vehicleEraId,
        })
  const activeAeroState =
    f1Runtime !== null && overtakeSystem !== 'ots'
      ? advanceActiveAeroState({
          car,
          deltaSeconds,
          elapsedSeconds,
          lowGripConditions,
          phase,
          previous:
            f1Runtime.activeAeroState ?? createInitialActiveAeroState(),
          requestedMode: requestedActiveAeroMode,
          track,
        })
      : createInitialActiveAeroState()
  const activeAeroMode = activeAeroDisplayModeForState(activeAeroState)
  const dirtyAirDownforce = phase
    ? 1
    : dirtyAirDownforceMultiplier({
        dynamics,
        gapSeconds: car.gapToAhead,
        lateralSeparationM,
        team,
      })
  const compoundGrip = f1Tires
    ? tireTrackGripMultiplier(f1Tires.tire, trackCondition)
    : 1
  // The F1 Pirelli runtime carries the state needed to resolve a live tyre
  // force envelope. SUPER FORMULA deliberately has no equivalent coefficient
  // state: its control-tire branch remains unavailable rather than borrowing
  // an F1 zero-loss compatibility value.
  const f1TireForceEnvelope =
    f1Tires !== null && categoryPhysics.id === 'f1-custom'
      ? f1TireForceEnvelopeFor({
          compound: f1Tires.tire,
          nomination: track.tireNomination,
          state: {
            carcassTemperatureC: f1Tires.tireCarcassTemperatureC,
            grainingPercent: f1Tires.tireGrainingPercent,
            overheatingPercent: f1Tires.tireOverheatingPercent,
            surfaceTemperatureC: f1Tires.tireTemperatureC,
            thermalStressPercent: f1Tires.tireThermalStressPercent,
            wearPercent: f1Tires.tireWearPercent,
          },
        })
      : null
  const surfaceGrip = gripForSurfaceWater(
    trackGrip,
    trackCondition.surfaceWaterMm,
    trackCondition.dryingLine,
  )
  // This is the sole composition point for F1 tyre-state grip. Both the live
  // cornering limit and the longitudinal force ellipse receive `utilisedGrip`
  // below, so there is no separate lap-time-only tyre-state correction.
  const localGrip = clamp(
    surfaceGrip *
      compoundGrip *
      (f1TireForceEnvelope?.gripMultiplier ?? 1),
    // `tyreForces` is numerically stable down to 0.05. Keeping the same
    // lower boundary here ensures a wet/mismatched F1 tyre's dynamic-state
    // loss remains visible instead of being flattened by a compatibility
    // floor before it reaches the force ellipse.
    0.05,
    1.08,
  )
  // Skill controls how much of the physical tyre envelope the driver can use;
  // it never raises the tyre above its modelled maximum.
  const utilisedGrip =
    localGrip * (0.94 + behaviorTraits.tyreLimitUtilisation * 0.06)
  // This exact ceiling is also passed to the Energy Store. It prevents a
  // cold/hot brake from crediting recovery against a nominal 5.1 g stop that
  // the live vehicle solver will subsequently reject.
  const brakeHardwareCapacity = brakeHardwareCapacityFor({
    brakeTemperatureC: car.brakeTemperatureC,
    maximumBrakeDecelerationMps2:
      categoryPhysics.maximumBrakeDecelerationMps2,
  })
  const brakeRecoveryDecelerationLimitMps2 = Math.min(
    5.1 * 9.81 * utilisedGrip,
    brakeHardwareCapacity.maximumBrakeDecelerationMps2,
  )
  // Geometry and the offline look-ahead event come from physicalLap, but the
  // limits themselves are solved again for this car's live mass, setup,
  // surface and wake. The offline terminal/deployment policy never becomes a
  // live speed target.
  const liveLimitFor = (
    radiusMeters: number,
    bankingDegrees: number,
    evaluationSpeedKph: number,
    aeroState: ActiveAeroState,
  ) =>
    liveCorneringSpeedLimitKph({
      activeAeroState: aeroState,
      airDensityKgM3: ambientAirDensityKgM3,
      bankingDegrees,
      baseVehicleMassKg: operationalVehicleMass.operationalMassKg,
      categoryPhysics,
      dirtyAirDownforceMultiplier: dirtyAirDownforce,
      evaluationSpeedKph,
      fuelLoadKg: car.fuelLoadKg,
      gripMultiplier: utilisedGrip,
      radiusMeters,
      setup,
      team,
    })
  const corneringSpeedLimitKph = liveLimitFor(
    dynamics.effectiveCornerRadiusM,
    dynamics.bankingDegrees,
    car.speedKph,
    activeAeroState,
  )
  const liveBrakingTargetSpeedKph =
    dynamics.brakingDistanceAheadMeters > 0
      ? liveLimitFor(
          dynamics.brakingTargetCornerRadiusM,
          dynamics.brakingTargetBankingDegrees,
          dynamics.brakingTargetSpeedKph,
          // The command returns to Corner Mode before braking. The future
          // target must not carry Straight-Mode load loss into that corner.
          createInitialActiveAeroState(),
        )
      : Number.POSITIVE_INFINITY
  const brakingTargetSpeedKph = Number.isFinite(
    liveBrakingTargetSpeedKph,
  )
    ? liveBrakingTargetSpeedKph
    : dynamics.brakingTargetSpeedKph
  // Neutralisation and preparation rules are operational speed ceilings. They
  // shape pedal demand without scaling engine power or the integrated speed.
  const neutralisedSpeedCeilingKph = phase
    ? dynamics.referenceSpeedKph * clamp(localFlagPaceScale, 0.42, 1)
    : Number.POSITIVE_INFINITY
  const preparationSpeedCeilingKph = isPreparationLap
    ? dynamics.referenceSpeedKph * preparationPaceScale
    : Number.POSITIVE_INFINITY
  const targetSpeedKph = Math.min(
    corneringSpeedLimitKph,
    neutralisedSpeedCeilingKph,
    preparationSpeedCeilingKph,
  )
  const currentSpeedMps = car.speedKph / 3.6
  const brakingTargetSpeedMps = brakingTargetSpeedKph / 3.6
  const brakingDistanceWithDriverTimingM = Math.max(
    1,
    dynamics.brakingDistanceAheadMeters -
      currentSpeedMps * (driverDecision?.brakeOnsetDeltaSeconds ?? 0),
  )
  const liveRequiredBrakingDecelerationMps2 =
    dynamics.brakingDistanceAheadMeters > 0
      ? Math.max(
          0,
          (currentSpeedMps ** 2 - brakingTargetSpeedMps ** 2) /
            (2 * brakingDistanceWithDriverTimingM),
        )
      : 0
  const requiredBrakeUtilization = clamp(
    liveRequiredBrakingDecelerationMps2 /
      Math.max(1, categoryPhysics.maximumBrakeDecelerationMps2),
    0,
    1,
  )
  // If the car is already inside a corner above its lateral limit, resolve
  // the required local deceleration over the current physical segment. This
  // replaces the former category-specific overspeed gains with the same
  // kinematic relation used by the look-ahead braking plan.
  const targetSpeedMps = targetSpeedKph / 3.6
  const localOverspeedDecelerationMps2 = Math.max(
    0,
    (currentSpeedMps ** 2 - targetSpeedMps ** 2) /
      (2 * Math.max(1, dynamics.segmentLengthMeters)),
  )
  const localOverspeedBrakeUtilization = clamp(
    localOverspeedDecelerationMps2 /
      Math.max(1, categoryPhysics.maximumBrakeDecelerationMps2),
    0,
    1,
  )
  const pitLaneSpeedLimitKph =
    car.status === 'pit' &&
    car.pitPhase !== 'none' &&
    car.pitPhase !== 'box'
      ? categoryPhysics.id === 'super-formula'
        ? superFormulaOperational?.pitLane.enforcement === 'enabled'
          ? superFormulaOperational.pitLane.speedLimitKph
          : null
        : track.pitLane?.speedLimitKph ?? 80
      : null
  const immobilizedIncident =
    car.incidentTrackState === 'on-track-stopped' &&
    car.battleDeltaSecondsRemaining < -0.01
  const pitLaneBrakeDemand =
    pitLaneSpeedLimitKph === null
      ? 0
      : clamp((car.speedKph - pitLaneSpeedLimitKph) * 1.8, 0, 55)
  const profileBrakeDemand =
    Math.max(requiredBrakeUtilization, localOverspeedBrakeUtilization) * 100 +
    pitLaneBrakeDemand
  const brakeControl = driverSkillBlend(driver, {
    brakingSkill: 0.58,
    precision: 0.24,
    pressureHandling: 0.18,
  })
  const brakePercent = Math.round(
    clamp(
      phase?.flag === 'red' || immobilizedIncident
        ? 100
        : profileBrakeDemand *
          (driverDecision?.brakePressureScale ??
            (0.96 + brakeControl * 0.04)),
      0,
      100,
    ),
  )
  const baseThrottle =
    car.pitPhase === 'box'
      ? 0
      : pitLaneSpeedLimitKph !== null
        ? car.speedKph < pitLaneSpeedLimitKph - 3
          ? 34
          : car.speedKph < pitLaneSpeedLimitKph + 1
            ? 8
            : 0
    : brakePercent > 3
      ? 0
      : dynamics.fullThrottle
        ? 100
        : 34 + dynamics.straightness * 62 +
          Math.max(0, targetSpeedKph - car.speedKph) * 0.24
  const controlThrottleScale = phase?.flag === 'red' ? 0 : phase ? 0.84 : 1
  const requestedThrottlePercent = Math.round(
    clamp(baseThrottle * controlThrottleScale, 0, 100),
  )
  const preparationThrottleCeiling =
    timedRunPhase === 'in-lap'
      ? 68
      : timedRunPhase === 'out-lap'
        ? 82
        : timedRunPhase === 'cooldown'
          ? 76
          : 100
  const phaseManagedThrottlePercent = Math.min(
    requestedThrottlePercent,
    preparationThrottleCeiling,
  )
  const throttleTimingScale =
    driverDecision === undefined
      ? 1
      : driverDecision.throttleTimingDeltaSeconds >= 0
        ? clamp(1 - driverDecision.throttleTimingDeltaSeconds / 0.5, 0, 1)
        : clamp(1 - driverDecision.throttleTimingDeltaSeconds * 0.4, 1, 1.08)
  const behaviorManagedThrottlePercent = Math.round(
    clamp(
      phaseManagedThrottlePercent *
        throttleTimingScale *
        (driverDecision?.throttleOpeningScale ?? 1),
      0,
      100,
    ),
  )
  const throttlePercent = timedTrafficYield
    ? Math.min(38, behaviorManagedThrottlePercent)
    : behaviorManagedThrottlePercent
  const otsAvailable =
    overtakeSystem === 'ots' &&
    otsRuntimeCanActivate &&
    !isPreparationLap &&
    sessionType === 'race-distance' &&
    raceControlOvertakeEnabled &&
    !phase &&
    car.status === 'running'
  // Preserve the legacy short-circuit: the driver-use predicate is not read
  // until the independent runtime and race-control availability gates pass.
  const sfOtsUseRequested = otsAvailable
    ? sfOtsUseRequestedForPath({
        options: {
          battlePhase: car.battlePhase,
          brakePercent,
          gapToAheadSeconds: car.gapToAhead,
          isFinalLap,
          paceMode: car.racePaceMode,
          straightness: dynamics.straightness,
          throttlePercent,
        },
        path: driverDecisionPath,
        seriesId,
        vehicleEraId,
      })
    : false
  const otsActive = otsAvailable && sfOtsUseRequested
  const f1ElectricalOvertakeRequest =
    !isPreparationLap &&
    overtakeSystem !== 'ots' &&
    f1Runtime &&
    energyStoreAtFrameStart
      ? f1ElectricalOvertakeIntentForPath({
          path: driverDecisionPath,
          seriesId,
          vehicleEraId,
        })
      : null
  const overtakeStatus = isPreparationLap
    ? ('disabled' as const)
    : overtakeSystem === 'ots'
      ? otsActive
        ? ('active' as const)
        : otsAvailable
          ? ('available' as const)
          : ('disabled' as const)
      : f1Runtime &&
          energyStoreAtFrameStart &&
          f1ElectricalOvertakeRequest
        ? overtakeStatusFor({
            batteryPercent: batteryPercentAtFrameStart,
            car,
            lowGripConditions,
            phase,
            raceControlEnabled: raceControlOvertakeEnabled,
            raceLap,
            overtakeEnergyRemainingMj:
              f1Runtime.overtakeEnergyRemainingMj,
            requestedAction: f1ElectricalOvertakeRequest,
            sessionType,
            track,
          })
        : ('disabled' as const)
  const energyIntent = energyStoreAtFrameStart
    ? f1EnergyIntentForPath({
        options: {
          battlePhase: car.battlePhase,
          driver,
          isFinalLap,
          lapProgress: car.progress,
          paceMode: car.racePaceMode,
          phaseActive: phase !== null,
          state: energyStoreAtFrameStart,
          straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
          straightness: dynamics.straightness,
          timedRunPhase,
        },
        path: driverDecisionPath,
        seriesId,
        vehicleEraId,
      })
    : null
  const rechargeRemainingAtCuKBusMj =
    energyStoreAtFrameStart?.rechargeRule.limit.kind === 'finite'
      ? Math.max(
          0,
          energyStoreAtFrameStart.rechargeRule.limit
            .maxCuKBusRechargeMj -
            energyStoreAtFrameStart.rechargedAtCuKBusThisLapMJ,
        )
      : energyStoreAtFrameStart?.rechargeRule.limit.kind === 'unlimited'
        ? Number.POSITIVE_INFINITY
        : 0
  const superClipping: SuperClippingResult =
    hasHybridEnergyStore && energyStoreAtFrameStart && energyIntent && f1Runtime
    ? advanceSuperClipping({
        battlePhase: car.battlePhase,
        batteryPercent: batteryPercentAtFrameStart,
        brakePercent,
        currentIntensity: f1Runtime.superClippingIntensity,
        deltaSeconds,
        deployedAtCuKBusThisLapMj:
          energyStoreAtFrameStart.deployedAtCuKBusThisLapMJ,
        driver,
        energyIntent,
        fuelLoadKg: massEquivalentFuelLoadKg,
        gapToAheadSeconds: car.gapToAhead,
        lap: raceLap,
        lowGripConditions,
        phaseActive: phase !== null,
        racePaceMode: car.racePaceMode,
        rechargeRemainingAtCuKBusMj,
        rechargedAtCuKBusThisLapMj:
          energyStoreAtFrameStart.rechargedAtCuKBusThisLapMJ,
        sessionType,
        speedKph: car.speedKph,
        straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
        straightness: dynamics.straightness,
        team,
        throttlePercent,
      })
    : {
        demandIntensity: 0,
        intensity: 0,
        level: 'off',
        requestedGeneratorMechanicalPowerKw: 0,
      }
  const requestedErsMode = hasHybridEnergyStore
    ? f1ErsModeIntentForPath({
        options: {
          batteryPercent: batteryPercentAtFrameStart,
          brakePercent,
          car,
          fullThrottle: dynamics.fullThrottle,
          overtakeStatus,
          phase,
          straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
          straightness: dynamics.straightness,
        },
        path: driverDecisionPath,
        seriesId,
        vehicleEraId,
      })
    : ('balanced' as const)
  const isQualifyingAttack = timedRunPhase === 'attack-lap'
  const ersMode = !hasHybridEnergyStore || standingStartMguKRestricted
    ? ('balanced' as const)
    : isPreparationLap ||
        timedTrafficYield ||
        superClipping.intensity >= 0.04
      ? ('harvest' as const)
      : isQualifyingAttack && brakePercent <= 5 && batteryPercentAtFrameStart > 8
        ? ('deploy' as const)
      : requestedErsMode
  const ersCurve: MguKPowerCurve | null =
    !hasHybridEnergyStore || lowGripConditions
    ? null
    : specifiedErsPowerSector
      ? 'race-sprint-power-limited'
      : overtakeStatus === 'active'
        ? 'overtake'
        : 'normal'
  const declaredDeploymentPowerKw = ersCurve
    ? permittedMguKDcPowerKwForSpeed({
        curve: ersCurve,
        speedKph: car.speedKph,
      })
    : 0
  const uncappedRegulatoryDeploymentPowerLimitKw = standingStartMguKRestricted
    ? 0
    : Math.min(
        categoryPhysics.hybridDeploymentPowerLimitKw,
        declaredDeploymentPowerKw,
      )
  const standardDeploymentDcLimitKw =
    !hasHybridEnergyStore || lowGripConditions
    ? 0
    : permittedMguKDcPowerKwForSpeed({
        curve: specifiedErsPowerSector
          ? 'race-sprint-power-limited'
          : 'normal',
        speedKph: car.speedKph,
      })
  const normalRegulatoryDeploymentPowerLimitKw = standingStartMguKRestricted
    ? 0
    : Math.min(
        categoryPhysics.hybridDeploymentPowerLimitKw,
        standardDeploymentDcLimitKw,
      )
  const overtakeCurveActive = ersCurve === 'overtake'
  const regulatoryDeploymentPowerLimitKw =
    overtakeAllowanceBoundedDcPowerLimitKw({
      active: overtakeCurveActive,
      declaredDeploymentDcPowerLimitKw:
        uncappedRegulatoryDeploymentPowerLimitKw,
      deltaSeconds,
      normalDeploymentDcPowerLimitKw:
        normalRegulatoryDeploymentPowerLimitKw,
      remainingAllowanceMj: f1Runtime?.overtakeEnergyRemainingMj ?? 0,
    })
  const driverErsManagement = driverSkillBlend(driver, {
    ersManagement: 0.64,
    raceAwareness: 0.22,
    precision: 0.14,
  })
  const deploymentRequest = energyStoreAtFrameStart
    ? energyDeploymentRequestFor({
        battlePhase: car.battlePhase,
        driverErsManagement,
        isFinalLap,
        lapProgress: car.progress,
        overtakeActive: overtakeStatus === 'active',
        paceMode: car.racePaceMode,
        phaseActive: phase !== null,
        speedKph: car.speedKph,
        standingStartLaunchActive,
        state: energyStoreAtFrameStart,
        straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
        straightness: dynamics.straightness,
        team,
        throttlePercent,
        timedRunPhase,
      })
    : 0
  const intentScheduledDeploymentRequest =
    deploymentRequest *
    (0.5 + (energyIntent?.propulsionAggression ?? 0) * 0.5)
  const effectiveDeploymentRequest =
    !hasHybridEnergyStore ||
    standingStartMguKRestricted ||
    ersMode === 'harvest'
      ? 0
      : ersMode === 'balanced'
        ? intentScheduledDeploymentRequest * 0.72
        : intentScheduledDeploymentRequest
  const extraCombustionPowerKw =
    otsActive && superFormulaOts?.availability === 'verified-event-rule'
      ? superFormulaOts.boostPowerKw
      : 0
  const combustionWheelPowerKw = combustionWheelPowerKwAt({
    categoryPhysics,
    clutchEngagementFraction: car.clutchEngagementFraction,
    currentSpeedKph: car.speedKph,
    extraCombustionPowerKw,
    team,
    throttlePercent,
    turboSpoolFraction: car.turboSpoolFraction,
  })
  const towDragReduction = phase || car.gapToAhead <= 0
    ? 0
    : towDragReductionFor({
        dynamics,
        gapSeconds: car.gapToAhead,
        lateralSeparationM,
        team,
      })
  const brakeReleaseSpeedKph =
    pitLaneSpeedLimitKph ??
    (brakePercent > 3
      ? Math.min(targetSpeedKph, brakingTargetSpeedKph) * 0.98
      : undefined)
  const longitudinalInputWithoutEnergy: LongitudinalStepInput = {
    activeAeroMode,
    activeAeroState,
    airDensityKgM3: ambientAirDensityKgM3,
    baseVehicleMassKg: operationalVehicleMass.operationalMassKg,
    brakePercent,
    brakeTemperatureC: car.brakeTemperatureC,
    brakeReleaseSpeedKph,
    categoryPhysics,
    currentSpeedKph: car.speedKph,
    deltaSeconds,
    dirtyAirDownforceMultiplier: dirtyAirDownforce,
    dynamics,
    ersPowerKw: 0,
    extraCombustionPowerKw,
    fuelLoadKg: car.fuelLoadKg,
    gripMultiplier: utilisedGrip,
    headwindMps,
    regenerativeResistancePowerKw: 0,
    requestedBrakeDecelerationMps2:
      (brakePercent / 100) *
      categoryPhysics.maximumBrakeDecelerationMps2,
    setup,
    team,
    throttlePercent,
    towDragReduction,
    turboSpoolFraction: car.turboSpoolFraction,
    clutchEngagementFraction: car.clutchEngagementFraction,
  }
  const brakeMechanicalBudget = hasHybridEnergyStore && brakePercent > 0
    ? previewServiceBrakeMechanicalBudget(longitudinalInputWithoutEnergy)
    : null
  const qualifyingRecoveryRequestScale = isQualifyingAttack
    ? batteryPercentAtFrameStart < 18
      ? 0.82
      : batteryPercentAtFrameStart < 35
        ? 0.56
        : 0.32
    : 1
  const energyStep =
    hasHybridEnergyStore && energyStoreAtFrameStart && energyIntent
      ? advanceEnergyStore({
          allowLiftCoastRecovery:
            energyIntent.liftCoastPreference > 0.08,
          ambientTemperatureC: airTemperatureC,
          brakeMechanicalEnergyProfileMJ:
            brakeMechanicalBudget?.mechanicalEnergyProfileMJ,
          brakePercent,
          brakeDecelerationLimitMps2: brakeRecoveryDecelerationLimitMps2,
          combustionWheelPowerKw,
          deltaSeconds,
          deploymentDcPowerLimitKw: regulatoryDeploymentPowerLimitKw,
          deploymentRequest: effectiveDeploymentRequest,
          driverErsManagement,
          driverWetSkill: driverSkillBlend(driver, {
            wetSkill: 0.68,
            brakingSkill: 0.18,
            adaptability: 0.14,
          }),
          gripMultiplier: localGrip,
          rechargeRule: energyStoreAtFrameStart.rechargeRule,
          recoveryRequestScale:
            qualifyingRecoveryRequestScale *
            (0.65 + energyIntent.harvestPreference * 0.35),
          speedKph: car.speedKph,
          state: energyStoreAtFrameStart,
          superclipGeneratorRequestKw:
            superClipping.requestedGeneratorMechanicalPowerKw,
          surfaceWaterMm,
          team,
          throttlePercent,
          tire: f1Tires!.tire,
          vehicleMassKg:
            operationalVehicleMass.operationalMassKg + car.fuelLoadKg,
        })
      : null
  const energyStore = energyStep?.state ?? null
  const ersPowerKw = energyStore?.actualDeploymentPowerKw ?? 0
  const actualSuperClipping =
    energyStore?.operatingMode === 'full-throttle-superclip'
  const superClippingHarvestedThisFrameMj =
    energyStep?.audit.superclipRechargedAtCuKBusMJ ?? 0
  const superClippingRecoveredThisLapMj =
    (f1Runtime?.superClippingRecoveredThisLapMj ?? 0) +
    superClippingHarvestedThisFrameMj
  const energyDeployedThisLapMj =
    energyStore?.deployedAtCuKBusThisLapMJ ?? 0
  const overtakeEnergyUsedMj = overtakeIncrementalDcEnergyUsedMj({
    actualDeploymentDcPowerKw: energyStore?.actualDeploymentDcPowerKw ?? 0,
    active: overtakeCurveActive,
    deltaSeconds,
    normalDeploymentDcLimitKw: normalRegulatoryDeploymentPowerLimitKw,
    remainingAllowanceMj: f1Runtime?.overtakeEnergyRemainingMj ?? 0,
  })
  const overtakeEnergyRemainingMj = Math.max(
    0,
    (f1Runtime?.overtakeEnergyRemainingMj ?? 0) - overtakeEnergyUsedMj,
  )
  const ersBatteryPercent = Math.round((energyStore?.stateOfCharge ?? 0) * 100)
  const serviceBrakeRegenerativeFractionProfile = brakeMechanicalBudget
    ? brakeMechanicalBudget.mechanicalEnergyProfileMJ.map(
        (serviceBrakeEnergyMJ, index) =>
          serviceBrakeEnergyMJ > 1e-12
            ? clamp(
                (energyStep?.audit
                  .acceptedBrakeRecoveryMechanicalEnergyProfileMJ[index] ??
                  0) / serviceBrakeEnergyMJ,
                0,
                1,
              )
            : 0,
      )
    : undefined
  const standaloneRecoveryPowerKw = energyStep
    ? energyStep.actualRecoverySourcePowerKw.liftCoast +
      energyStep.actualRecoverySourcePowerKw.superclip
    : 0
  const longitudinalStep = integrateVehicleLongitudinalStep({
    ...longitudinalInputWithoutEnergy,
    ersPowerKw,
    regenerativeResistancePowerKw: standaloneRecoveryPowerKw,
    serviceBrakeRegenerativeFractionProfile,
  })
  const frictionServiceBrakePowerKw =
    deltaSeconds > 0
      ? (longitudinalStep.frictionBrakeMechanicalEnergyMJ * 1000) /
        deltaSeconds
      : 0
  // The timing tower, map movement, and lap clock all consume this integrated
  // result. The profile only controls pedals; it never overwrites road speed.
  const powerUnitStopped =
    phase?.flag === 'red' || car.pitPhase === 'box' || immobilizedIncident
  const speedKph = powerUnitStopped
    ? 0
    : Number(longitudinalStep.speedKph.toFixed(2))
  // A running car at 0 km/h is launching in first with clutch slip. Only an
  // explicit stopped state (red flag, incident, or pit box) reports neutral
  // and 0 RPM.
  const gear = powerUnitStopped ? 0 : longitudinalStep.gear
  const rpm = powerUnitStopped ? 0 : longitudinalStep.rpm
  const tireWindow = f1Tires
    ? tireOperatingWindowFor(f1Tires.tire, track.tireNomination)
    : null
  const paceModeHeat =
    car.racePaceMode === 'push'
      ? 4
      : car.racePaceMode === 'defend'
        ? 2.5
        : car.racePaceMode === 'save'
          ? -3
          : 0
  const tireManagement = driverSkillBlend(driver, {
    tireManagement: 0.62,
    throttleControl: 0.2,
    precision: 0.18,
  })
  const tireTemperatureC =
    f1Tires && tireWindow
      ? Math.round(
          clamp(
            tireWindow.targetC -
              12 +
              (trackTemperatureC - 30) * 0.22 +
              (1 - trackGrip) * -12 +
              speedKph * 0.018 +
              brakePercent * 0.075 +
              dynamics.curvature * 7 +
              paceModeHeat +
              (1 - tireManagement) * 5 +
              car.damage * 5 +
              (fuelEffects.tireLoadMultiplier - 1) * 13 +
              Math.min(3, f1Tires.tireThermalStressPercent * 0.08),
            f1Tires.tire === 'W' ? 42 : 62,
            f1Tires.tire === 'S' ? 124 : 116,
          ),
        )
      : null
  const superClippingActive = actualSuperClipping
  const superClippingWasActive =
    (f1Runtime?.superClippingIntensity ?? 0) >= 0.04 &&
    (f1Runtime?.superClippingRegenPowerKw ?? 0) > 0
  const superClippingStartedAtSeconds = superClippingActive
    ? superClippingWasActive
      ? f1Runtime?.superClippingStartedAtSeconds ?? null
      : elapsedSeconds
    : null
  const superClippingStartedAtProgress = superClippingActive
    ? superClippingWasActive
      ? f1Runtime?.superClippingStartedAtProgress ?? null
      : car.progress
    : null
  const superClippingDurationSeconds = superClippingActive
    ? (superClippingWasActive
        ? f1Runtime?.superClippingDurationSeconds ?? 0
        : 0) +
      deltaSeconds
    : 0
  const runtimeSystems =
    f1Runtime && energyStore
      ? {
          ...f1Runtime,
          activeAeroMode,
          activeAeroState,
          energyDeployedThisLapMj,
          energyHarvestedThisLapMj:
            energyStore.rechargedAtCuKBusThisLapMJ,
          energyStore,
          ersBatteryPercent,
          ersMode,
          ersPowerKw,
          overtakeEnergyRemainingMj,
          superClippingDurationSeconds,
          superClippingIntensity: actualSuperClipping
            ? superClipping.intensity
            : 0,
          // The energy allocator can leave a sub-watt floating-point residue
          // on an inactive source. Keep the public episode field semantic:
          // inactive super-clipping has exactly zero recovery power.
          superClippingRegenPowerKw: actualSuperClipping
            ? (energyStep?.actualRecoverySourcePowerKw.superclip ?? 0)
            : 0,
          superClippingRecoveredThisLapMj,
          superClippingStartedAtProgress,
          superClippingStartedAtSeconds,
        }
      : car.runtimeSystems

  return {
    brakePercent,
    frictionServiceBrakePowerKw,
    gear,
    rpm,
    runtimeSystems,
    speedKph,
    throttlePercent,
    tireTemperatureC,
    overtakeStatus,
    turboSpoolFraction: longitudinalStep.turboSpoolFraction,
    clutchEngagementFraction: longitudinalStep.clutchEngagementFraction,
  }
}
