import type {
  ActiveAeroState,
  ActiveAeroMode,
  ActiveFlagPhase,
  CarSetup,
  CarSnapshot,
  Driver,
  ErsMode,
  OvertakeStatus,
  Team,
  TrackDefinition,
  WeatherState,
  WeekendStage,
} from '../types'
import {
  activeAeroDisplayModeForState,
  activeAeroModeFor,
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
import { f1EnergyIntentFor } from './driverEnergyIntent'
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
  tireOperatingWindowFor,
  tireTrackGripMultiplier,
  type TireTrackCondition,
} from './tires'
import { trackDynamicsAt } from './trackDynamics'
import { gripForSurfaceWater } from './trackWater'
import {
  airDensityKgM3,
  combustionWheelPowerKwAt,
  dirtyAirDownforceMultiplier,
  fuelMassEffects,
  integrateVehicleLongitudinalStep,
  liveCorneringSpeedLimitKph,
  towDragReductionFor,
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

function ersModeFor(options: {
  batteryPercent: number
  brakePercent: number
  car: CarSnapshot
  fullThrottle: boolean
  overtakeStatus: OvertakeStatus
  phase: ActiveFlagPhase | null
  straightLengthAheadMeters: number
  straightness: number
}) {
  const {
    batteryPercent,
    brakePercent,
    car,
    fullThrottle,
    overtakeStatus,
    phase,
    straightLengthAheadMeters,
    straightness,
  } = options

  if (phase || batteryPercent < 14 || brakePercent > 5) {
    return batteryPercent < 96 ? ('harvest' satisfies ErsMode) : ('balanced' satisfies ErsMode)
  }

  if (
    batteryPercent > 22 &&
    car.status === 'running' &&
    (overtakeStatus === 'active' ||
      car.gapToAhead < 1.4 ||
      fullThrottle ||
      straightness > 0.74 ||
      straightLengthAheadMeters >= 180)
  ) {
    return 'deploy' satisfies ErsMode
  }

  return 'balanced' satisfies ErsMode
}

type CalculatedTelemetry = {
  activeAeroMode: ActiveAeroMode
  activeAeroState: ActiveAeroState
  brakePercent: number
  ersBatteryPercent: number
  energyStore: CarSnapshot['energyStore']
  ersMode: ErsMode
  ersPowerKw: number
  gear: number
  rpm: number
  speedKph: number
  throttlePercent: number
  tireTemperatureC: number
  overtakeStatus: OvertakeStatus
  overtakeEnergyRemainingMj: number
  otsRemainingSeconds?: number
  otsCooldownUntilSeconds?: number
  energyHarvestedThisLapMj: number
  energyDeployedThisLapMj: number
  superClippingIntensity: number
  superClippingRegenPowerKw: number
  superClippingRecoveredThisLapMj: number
  superClippingStartedAtSeconds: number | null
  superClippingStartedAtProgress: number | null
  superClippingDurationSeconds: number
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
  elapsedSeconds: number
  phase: ActiveFlagPhase | null
  localFlagPaceScale?: number
  lowGripConditions: boolean
  isFinalLap?: boolean
  /** Authoritative FIA event input; null/omission keeps it unavailable. */
  fiaNominalTyreMassKg?: number | null
  raceControlOvertakeEnabled?: boolean
  overtakeSystem?: 'active-aero' | 'ots'
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
  weekendStage?: WeekendStage
}): CalculatedTelemetry {
  const {
    car,
    aheadLateralOffsetM,
    categoryPhysics = categoryPhysicsFor(undefined),
    deltaSeconds,
    driver,
    driverDecision,
    elapsedSeconds,
    phase,
    localFlagPaceScale = 1,
    lowGripConditions,
    isFinalLap = false,
    raceControlOvertakeEnabled = true,
    overtakeSystem = 'active-aero',
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
  } = options
  const hasHybridEnergyStore =
    categoryHasHybridEnergyStore(categoryPhysics)
  const superFormulaOperational =
    categoryPhysics.id === 'super-formula'
      ? resolveSuperFormulaOperational()
      : null
  const superFormulaOts = superFormulaOperational?.ots
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
  const energyStoreAtFrameStart = normalizeEnergyStoreState(
    car.energyStore,
    team,
    car.ersBatteryPercent,
  )
  const batteryPercentAtFrameStart = energyStoreAtFrameStart.stateOfCharge * 100
  const massEquivalentFuelLoadKg =
    car.fuelLoadKg + Math.max(0, regulatoryMassIncreaseKg)
  const fuelEffects = fuelMassEffects({
    fuelLoadKg: massEquivalentFuelLoadKg,
    localDynamics: dynamics,
    track,
  })
  const requestedActiveAeroMode =
    isPreparationLap || overtakeSystem === 'ots'
      ? ('corner' as const)
      : activeAeroModeFor({
          car,
          lowGripConditions,
          phase,
          track,
        })
  const activeAeroState =
    categoryPhysics.id === 'f1-custom' && overtakeSystem !== 'ots'
      ? advanceActiveAeroState({
          car,
          deltaSeconds,
          elapsedSeconds,
          lowGripConditions,
          phase,
          previous: car.activeAeroState ?? createInitialActiveAeroState(),
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
  const compoundGrip = tireTrackGripMultiplier(car.tire, trackCondition)
  const surfaceGrip = gripForSurfaceWater(
    trackGrip,
    trackCondition.surfaceWaterMm,
    trackCondition.dryingLine,
  )
  const localGrip = clamp(surfaceGrip * compoundGrip, 0.34, 1.08)
  // Skill controls how much of the physical tyre envelope the driver can use;
  // it never raises the tyre above its modelled maximum.
  const utilisedGrip =
    localGrip * (0.94 + behaviorTraits.tyreLimitUtilisation * 0.06)
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
      ? track.pitLane?.speedLimitKph ?? 80
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
    !lowGripConditions &&
    car.status === 'running' &&
    (car.otsRemainingSeconds ?? 0) > 0 &&
    elapsedSeconds >= (car.otsCooldownUntilSeconds ?? 0)
  const otsActive =
    otsAvailable &&
    brakePercent <= 3 &&
    throttlePercent >= 88 &&
    dynamics.straightness >= 0.72 &&
    (car.gapToAhead > 0 && car.gapToAhead < 2.2 ||
      car.battlePhase !== 'single-file' ||
      car.racePaceMode === 'push' ||
      isFinalLap)
  const overtakeStatus = isPreparationLap
    ? ('disabled' as const)
    : overtakeSystem === 'ots'
      ? otsActive
        ? ('active' as const)
        : otsAvailable
          ? ('available' as const)
          : ('disabled' as const)
      : overtakeStatusFor({
          batteryPercent: batteryPercentAtFrameStart,
          car,
          lowGripConditions,
          phase,
          raceControlEnabled: raceControlOvertakeEnabled,
          raceLap,
          overtakeEnergyRemainingMj: car.overtakeEnergyRemainingMj,
          sessionType,
          track,
        })
  const energyIntent = f1EnergyIntentFor({
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
  })
  const rechargeRemainingAtCuKBusMj =
    energyStoreAtFrameStart.rechargeRule.limit.kind === 'finite'
      ? Math.max(
          0,
          energyStoreAtFrameStart.rechargeRule.limit
            .maxCuKBusRechargeMj -
            energyStoreAtFrameStart.rechargedAtCuKBusThisLapMJ,
        )
      : energyStoreAtFrameStart.rechargeRule.limit.kind === 'unlimited'
        ? Number.POSITIVE_INFINITY
        : 0
  const superClipping: SuperClippingResult = hasHybridEnergyStore
    ? advanceSuperClipping({
        battlePhase: car.battlePhase,
        batteryPercent: batteryPercentAtFrameStart,
        brakePercent,
        currentIntensity: car.superClippingIntensity ?? 0,
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
  const requestedErsMode = ersModeFor({
    batteryPercent: batteryPercentAtFrameStart,
    brakePercent,
    car,
    fullThrottle: dynamics.fullThrottle,
    overtakeStatus,
    phase,
    straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
    straightness: dynamics.straightness,
  })
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
  const ersCurve: MguKPowerCurve | null = lowGripConditions
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
  const standardDeploymentDcLimitKw = lowGripConditions
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
      remainingAllowanceMj: car.overtakeEnergyRemainingMj,
    })
  const driverErsManagement = driverSkillBlend(driver, {
    ersManagement: 0.64,
    raceAwareness: 0.22,
    precision: 0.14,
  })
  const deploymentRequest = energyDeploymentRequestFor({
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
  const intentScheduledDeploymentRequest =
    deploymentRequest * (0.5 + energyIntent.propulsionAggression * 0.5)
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
  const qualifyingRecoveryRequestScale = isQualifyingAttack
    ? batteryPercentAtFrameStart < 18
      ? 0.82
      : batteryPercentAtFrameStart < 35
        ? 0.56
        : 0.32
    : 1
  const energyStep = advanceEnergyStore({
    allowLiftCoastRecovery:
      hasHybridEnergyStore && energyIntent.liftCoastPreference > 0.08,
    ambientTemperatureC: airTemperatureC,
    brakePercent,
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
    recoveryRequestScale: !hasHybridEnergyStore
      ? 0
      : qualifyingRecoveryRequestScale *
        (0.65 + energyIntent.harvestPreference * 0.35),
    speedKph: car.speedKph,
    state: energyStoreAtFrameStart,
    superclipGeneratorRequestKw:
      superClipping.requestedGeneratorMechanicalPowerKw,
    surfaceWaterMm,
    team,
    throttlePercent,
    tire: car.tire,
    vehicleMassKg:
      operationalVehicleMass.operationalMassKg + car.fuelLoadKg,
  })
  const energyStore = energyStep.state
  const ersPowerKw = energyStore.actualDeploymentPowerKw
  const actualSuperClipping =
    energyStore.operatingMode === 'full-throttle-superclip'
  const superClippingHarvestedThisFrameMj =
    energyStep.audit.superclipRechargedAtCuKBusMJ
  const superClippingRecoveredThisLapMj =
    (car.superClippingRecoveredThisLapMj ?? 0) +
    superClippingHarvestedThisFrameMj
  const energyDeployedThisLapMj = energyStore.deployedAtCuKBusThisLapMJ
  const overtakeEnergyUsedMj = overtakeIncrementalDcEnergyUsedMj({
    actualDeploymentDcPowerKw: energyStore.actualDeploymentDcPowerKw,
    active: overtakeCurveActive,
    deltaSeconds,
    normalDeploymentDcLimitKw: normalRegulatoryDeploymentPowerLimitKw,
    remainingAllowanceMj: car.overtakeEnergyRemainingMj,
  })
  const overtakeEnergyRemainingMj = Math.max(
    0,
    car.overtakeEnergyRemainingMj - overtakeEnergyUsedMj,
  )
  const ersBatteryPercent = Math.round(energyStore.stateOfCharge * 100)
  const towDragReduction = phase || car.gapToAhead <= 0
    ? 0
    : towDragReductionFor({
        dynamics,
        gapSeconds: car.gapToAhead,
        lateralSeparationM,
        team,
      })
  const longitudinalStep = integrateVehicleLongitudinalStep({
    activeAeroMode,
    activeAeroState,
    airDensityKgM3: ambientAirDensityKgM3,
    baseVehicleMassKg: operationalVehicleMass.operationalMassKg,
    brakePercent,
    brakeReleaseSpeedKph:
      pitLaneSpeedLimitKph ??
      (brakePercent > 3
        ? Math.min(targetSpeedKph, brakingTargetSpeedKph) * 0.98
        : undefined),
    categoryPhysics,
    currentSpeedKph: car.speedKph,
    deltaSeconds,
    dirtyAirDownforceMultiplier: dirtyAirDownforce,
    dynamics,
    ersPowerKw,
    extraCombustionPowerKw,
    fuelLoadKg: car.fuelLoadKg,
    gripMultiplier: utilisedGrip,
    headwindMps,
    regenerativeResistancePowerKw:
      energyStep.regenerativeResistancePowerKw,
    requestedBrakeDecelerationMps2:
      (brakePercent / 100) *
      categoryPhysics.maximumBrakeDecelerationMps2,
    setup,
    team,
    throttlePercent,
    towDragReduction,
    turboSpoolFraction: car.turboSpoolFraction,
    clutchEngagementFraction: car.clutchEngagementFraction,
  })
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
  const tireWindow = tireOperatingWindowFor(car.tire, track.tireNomination)
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
  const tireTemperatureC = Math.round(
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
        Math.min(3, (car.tireThermalStressPercent ?? 0) * 0.08),
      car.tire === 'W' ? 42 : 62,
      car.tire === 'S' ? 124 : 116,
    ),
  )
  const superClippingActive = actualSuperClipping
  const superClippingWasActive =
    (car.superClippingIntensity ?? 0) >= 0.04 &&
    (car.superClippingRegenPowerKw ?? 0) > 0
  const superClippingStartedAtSeconds = superClippingActive
    ? superClippingWasActive
      ? car.superClippingStartedAtSeconds
      : elapsedSeconds
    : null
  const superClippingStartedAtProgress = superClippingActive
    ? superClippingWasActive
      ? car.superClippingStartedAtProgress
      : car.progress
    : null
  const superClippingDurationSeconds = superClippingActive
    ? (superClippingWasActive ? car.superClippingDurationSeconds ?? 0 : 0) +
      deltaSeconds
    : 0
  const otsRemainingSeconds =
    overtakeSystem !== 'ots'
      ? car.otsRemainingSeconds
      : otsRuntimeCanActivate
        ? Math.max(0, (car.otsRemainingSeconds ?? 0) - (otsActive ? deltaSeconds : 0))
        : undefined
  // A cooldown can only be created from an accepted event pack. Historic
  // per-circuit values are intentionally not a runtime fallback.
  const otsJustReleased =
    overtakeSystem === 'ots' &&
    otsRuntimeCanActivate &&
    car.overtakeStatus === 'active' &&
    !otsActive
  const otsCooldownUntilSeconds =
    overtakeSystem !== 'ots'
      ? car.otsCooldownUntilSeconds
      : !otsRuntimeCanActivate
        ? undefined
        : otsJustReleased && superFormulaOts?.availability === 'verified-event-rule'
          ? elapsedSeconds + superFormulaOts.cooldownSeconds
          : car.otsCooldownUntilSeconds

  return {
    activeAeroMode,
    activeAeroState,
    brakePercent,
    energyStore,
    ersBatteryPercent,
    ersMode,
    ersPowerKw,
    gear,
    rpm,
    speedKph,
    throttlePercent,
    tireTemperatureC,
    overtakeStatus,
    overtakeEnergyRemainingMj,
    otsRemainingSeconds,
    otsCooldownUntilSeconds,
    energyHarvestedThisLapMj: energyStore.rechargedAtCuKBusThisLapMJ,
    energyDeployedThisLapMj,
    superClippingIntensity: actualSuperClipping ? superClipping.intensity : 0,
    superClippingRegenPowerKw:
      energyStep.actualRecoverySourcePowerKw.superclip,
    superClippingRecoveredThisLapMj,
    superClippingStartedAtSeconds,
    superClippingStartedAtProgress,
    superClippingDurationSeconds,
    turboSpoolFraction: longitudinalStep.turboSpoolFraction,
    clutchEngagementFraction: longitudinalStep.clutchEngagementFraction,
  }
}
