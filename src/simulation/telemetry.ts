import type {
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
} from '../types'
import {
  activeAeroModeFor,
  ersDeploymentPowerKw,
  overtakeStatusFor,
} from './activeAero'
import { driverSkillBlend } from './driverAbility'
import {
  advanceEnergyStore,
  energyDeploymentRequestFor,
  normalizeEnergyStoreState,
} from './energySystem'
import { FIA_2026_REGULATION_PROFILE } from './regulations'
import { advanceSuperClipping } from './superClipping'
import { tireOperatingWindowFor } from './tires'
import { trackDynamicsAt } from './trackDynamics'
import {
  airDensityKgM3,
  dirtyAirDownforceMultiplier,
  driverSegmentExecution,
  fuelMassEffects,
  integrateVehicleSpeedKph,
  machineSegmentCapability,
  towDragReductionFor,
} from './vehicleDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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

  if (phase || batteryPercent < 24 || brakePercent > 5) {
    return batteryPercent < 96 ? ('harvest' satisfies ErsMode) : ('balanced' satisfies ErsMode)
  }

  if (
    batteryPercent > 36 &&
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
  brakePercent: number
  ersBatteryPercent: number
  energyStore: CarSnapshot['energyStore']
  ersMode: ErsMode
  ersPowerKw: number
  gear: number
  performanceDeltaSeconds: number
  rpm: number
  speedKph: number
  throttlePercent: number
  tireTemperatureC: number
  overtakeStatus: OvertakeStatus
  overtakeEnergyRemainingMj: number
  energyHarvestedThisLapMj: number
  energyDeployedThisLapMj: number
  superClippingIntensity: number
  superClippingDrivePowerScale: number
  superClippingRegenPowerKw: number
  superClippingRecoveredThisLapMj: number
  superClippingStartedAtSeconds: number | null
  superClippingStartedAtProgress: number | null
  superClippingDurationSeconds: number
}

export function calculateCarTelemetry(options: {
  car: CarSnapshot
  deltaSeconds: number
  driver: Driver
  elapsedSeconds: number
  phase: ActiveFlagPhase | null
  localFlagPaceScale?: number
  lowGripConditions: boolean
  isFinalLap?: boolean
  maxRechargePerLapMj?: number
  raceControlOvertakeEnabled?: boolean
  regulatoryMassIncreaseKg?: number
  paceScale?: number
  raceLap: number
  sessionType?: 'race-distance' | 'limited-time'
  timedRunPhase?: CarSnapshot['timedRunPhase']
  standingStartMguKRestricted?: boolean
  specifiedErsPowerSector?: boolean
  surfaceWaterMm?: number
  setup?: CarSetup
  headwindMps?: number
  track: TrackDefinition
  team: Team
  trackGrip: number
  airTemperatureC?: number
  trackTemperatureC?: number
  weather: WeatherState
}): CalculatedTelemetry {
  const {
    car,
    deltaSeconds,
    driver,
    elapsedSeconds,
    phase,
    localFlagPaceScale = 1,
    lowGripConditions,
    isFinalLap = false,
    maxRechargePerLapMj = FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
    raceControlOvertakeEnabled = true,
    regulatoryMassIncreaseKg = 0,
    paceScale = 1,
    raceLap,
    sessionType = 'race-distance',
    timedRunPhase = car.timedRunPhase,
    standingStartMguKRestricted = false,
    specifiedErsPowerSector = false,
    surfaceWaterMm: providedSurfaceWaterMm,
    setup,
    headwindMps = 0,
    track,
    team,
    trackGrip,
    airTemperatureC = 25,
    trackTemperatureC = 30,
    weather,
  } = options
  const surfaceWaterMm =
    providedSurfaceWaterMm ??
    (weather === 'heavy-rain' ? 1.2 : weather === 'light-rain' ? 0.35 : 0)
  const dynamics = trackDynamicsAt(track, car.progress)
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
  const activeAeroMode = activeAeroModeFor({
    car,
    lowGripConditions,
    phase,
    track,
  })
  const machineCapability = machineSegmentCapability({
    dynamics,
    session: sessionType === 'limited-time' ? 'qualifying' : 'race',
    team,
    weather,
  })
  const driverExecution = driverSegmentExecution({
    driver,
    dynamics,
    session: sessionType === 'limited-time' ? 'qualifying' : 'race',
    weather,
  })
  const dirtyAirMultiplier = phase
    ? 1
    : dirtyAirDownforceMultiplier({
        dynamics,
        gapSeconds: car.gapToAhead,
        team,
      })
  const waterGrip = clamp(1 - surfaceWaterMm * 0.055, 0.72, 1)
  const localGrip = clamp(trackGrip * waterGrip, 0.38, 1.08)
  const targetSpeedKph =
    dynamics.referenceSpeedKph *
    clamp(paceScale, 0.42, 1.14) *
    clamp(localFlagPaceScale, 0.42, 1) *
    machineCapability *
    driverExecution *
    dirtyAirMultiplier *
    fuelEffects.cornerSpeedMultiplier
  const speedExcess = Math.max(0, car.speedKph - targetSpeedKph)
  const brakingActivation = clamp(
    (car.speedKph / Math.max(1, targetSpeedKph) - 0.78) / 0.22,
    0,
    1,
  )
  const profileBrakeDemand =
    dynamics.brakingSeverity * 91 * brakingActivation +
    speedExcess * (0.7 + dynamics.brakingSeverity * 0.65) +
    (phase?.flag === 'yellow'
      ? (phase.yellowSeverity === 'double' ? 11 : 7) + car.speedKph * 0.01
      : 0)
  const brakeControl = driverSkillBlend(driver, {
    brakingSkill: 0.58,
    precision: 0.24,
    pressureHandling: 0.18,
  })
  const brakePercent = Math.round(
    clamp(
      phase?.flag === 'red'
        ? 100
        : profileBrakeDemand * fuelEffects.brakeLoadMultiplier *
            (1.04 - brakeControl * 0.08),
      0,
      100,
    ),
  )
  const baseThrottle =
    brakePercent > 3
      ? 0
      : dynamics.fullThrottle
        ? 100
        : 34 + dynamics.straightness * 62 +
          Math.max(0, targetSpeedKph - car.speedKph) * 0.24
  const controlThrottleScale = phase?.flag === 'red' ? 0 : phase ? 0.84 : 1
  const throttlePercent = Math.round(
    clamp(baseThrottle * controlThrottleScale, 0, 100),
  )
  const overtakeStatus = overtakeStatusFor({
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
  const superClipping = advanceSuperClipping({
    battlePhase: car.battlePhase,
    batteryPercent: batteryPercentAtFrameStart,
    brakePercent,
    currentIntensity: car.superClippingIntensity ?? 0,
    deltaSeconds,
    deployedThisLapMj: car.energyDeployedThisLapMj ?? 0,
    driver,
    fuelLoadKg: massEquivalentFuelLoadKg,
    gapToAheadSeconds: car.gapToAhead,
    harvestedThisLapMj: car.energyHarvestedThisLapMj,
    lap: raceLap,
    lowGripConditions,
    maxRechargePerLapMj,
    phaseActive: phase !== null,
    racePaceMode: car.racePaceMode,
    sessionType,
    setup,
    speedKph: car.speedKph,
    straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
    straightness: dynamics.straightness,
    team,
    throttlePercent,
  })
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
  const isPreparationLap =
    timedRunPhase === 'out-lap' ||
    timedRunPhase === 'in-lap' ||
    timedRunPhase === 'cooldown'
  const ersMode = standingStartMguKRestricted
    ? ('balanced' as const)
    : isPreparationLap || superClipping.intensity >= 0.04
      ? ('harvest' as const)
      : requestedErsMode
  const keyAccelerationZone =
    specifiedErsPowerSector ||
    dynamics.fullThrottle ||
    (dynamics.straightness >= 0.7 &&
      dynamics.brakingSeverity < 0.22 &&
      dynamics.straightLengthAheadMeters >= 110)
  const ersCurve = lowGripConditions
    ? ('low-grip-estimate' as const)
    : keyAccelerationZone
      ? ('specified-sector' as const)
      : ('standard' as const)
  const regulatoryDeploymentPowerLimitKw = standingStartMguKRestricted
    ? 0
    : ersDeploymentPowerKw({
        curve: ersCurve,
        ersMode: 'deploy',
        overtakeStatus,
        speedKph: car.speedKph,
      })
  const standardErsPowerKw = ersDeploymentPowerKw({
    curve: ersCurve,
    ersMode,
    overtakeStatus: 'available',
    speedKph: car.speedKph,
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
    state: energyStoreAtFrameStart,
    straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
    straightness: dynamics.straightness,
    team,
    throttlePercent,
    timedRunPhase,
  })
  const effectiveDeploymentRequest =
    standingStartMguKRestricted || ersMode === 'harvest'
      ? 0
      : ersMode === 'balanced'
        ? deploymentRequest * 0.62
        : deploymentRequest
  const energyStep = advanceEnergyStore({
    additionalRecoveryRequestKw:
      superClipping.regenerativeResistancePowerKw,
    ambientTemperatureC: airTemperatureC,
    brakePercent,
    deltaSeconds,
    deploymentPowerLimitKw: regulatoryDeploymentPowerLimitKw,
    deploymentRequest: effectiveDeploymentRequest,
    driverErsManagement,
    driverWetSkill: driverSkillBlend(driver, {
      wetSkill: 0.68,
      brakingSkill: 0.18,
      adaptability: 0.14,
    }),
    gripMultiplier: localGrip,
    maxRechargePerLapMj,
    speedKph: car.speedKph,
    state: energyStoreAtFrameStart,
    surfaceWaterMm,
    team,
    throttlePercent,
    tire: car.tire,
    vehicleMassKg: 768 + massEquivalentFuelLoadKg,
  })
  const energyStore = energyStep.state
  const ersPowerKw = energyStore.actualDeploymentPowerKw
  const harvestedThisFrameMj = Math.max(
    0,
    energyStore.actualHarvestedThisLapMJ -
      energyStoreAtFrameStart.actualHarvestedThisLapMJ,
  )
  const superClippingRecoveryShare =
    energyStore.requestedRecoveryPowerKw > 0
      ? clamp(
          superClipping.regenerativeResistancePowerKw /
            energyStore.requestedRecoveryPowerKw,
          0,
          1,
        )
      : 0
  const superClippingHarvestedThisFrameMj =
    harvestedThisFrameMj * superClippingRecoveryShare
  const superClippingRecoveredThisLapMj =
    (car.superClippingRecoveredThisLapMj ?? 0) +
    superClippingHarvestedThisFrameMj
  const energyDeployedThisLapMj = energyStore.energyRemovedThisLapMJ
  const overtakeBoostShare =
    overtakeStatus === 'active' && regulatoryDeploymentPowerLimitKw > 0
      ? clamp(
          (regulatoryDeploymentPowerLimitKw - standardErsPowerKw) /
            regulatoryDeploymentPowerLimitKw,
          0,
          1,
        )
      : 0
  const overtakeEnergyUsedMj =
    overtakeStatus === 'active'
      ? Math.min(
          car.overtakeEnergyRemainingMj,
          (deltaSeconds * ersPowerKw * overtakeBoostShare) / 1000,
        )
      : 0
  const overtakeEnergyRemainingMj = Math.max(
    0,
    car.overtakeEnergyRemainingMj - overtakeEnergyUsedMj,
  )
  const ersBatteryPercent = Math.round(energyStore.stateOfCharge * 100)
  const towDragReduction = phase
    ? 0
    : towDragReductionFor({
        dynamics,
        gapSeconds: car.gapToAhead,
        team,
      })
  const physicallyIntegratedSpeedKph = integrateVehicleSpeedKph({
    activeAeroMode,
    airDensityKgM3: airDensityKgM3({
      altitudeMeters: track.altitudeMeters,
      temperatureC: trackTemperatureC,
    }),
    brakePercent,
    currentSpeedKph: car.speedKph,
    deltaSeconds,
    drivePowerScale: superClipping.drivePowerScale,
    dynamics,
    ersPowerKw,
    fuelLoadKg: car.fuelLoadKg,
    gripMultiplier: localGrip,
    headwindMps,
    regenerativeResistancePowerKw:
      energyStep.regenerativeResistancePowerKw,
    setup,
    team,
    throttlePercent,
    towDragReduction,
  })
  // A coarse simulation tick can span an entire braking event. Modulate the
  // brake release at the local speed target so a multi-second tick does not
  // hold maximum braking all the way to zero. The target remains flag-, grip-,
  // machine-, and driver-dependent rather than becoming a speed cap.
  const brakeModulatedSpeedKph =
    brakePercent > 3 &&
    phase?.flag !== 'red' &&
    phase?.flag !== 'yellow'
      ? Math.max(
          physicallyIntegratedSpeedKph,
          Math.min(car.speedKph, targetSpeedKph * 0.96),
        )
      : physicallyIntegratedSpeedKph
  const cornerLimitedSpeedKph =
    dynamics.fullThrottle && !phase
      ? brakeModulatedSpeedKph
      : Math.min(brakeModulatedSpeedKph, targetSpeedKph * 1.035)
  const pitSpeedKph =
    car.pitPhase === 'box'
      ? 0
      : car.status === 'pit'
        ? Math.min(cornerLimitedSpeedKph, track.pitLane?.speedLimitKph ?? 80)
        : cornerLimitedSpeedKph
  const speedKph = Math.round(phase?.flag === 'red' ? 0 : pitSpeedKph)
  const gear = speedKph === 0 ? 0 : Math.round(clamp((speedKph - 28) / 49, 1, 8))
  const rpm = Math.round(
    speedKph === 0
      ? 0
      : clamp(
          6650 + speedKph * 22 + throttlePercent * 23 - brakePercent * 9,
          4200,
          13500,
        ),
  )
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
  const superClippingActive = superClipping.intensity >= 0.04
  const superClippingWasActive = (car.superClippingIntensity ?? 0) >= 0.04
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

  return {
    activeAeroMode,
    brakePercent,
    energyStore,
    ersBatteryPercent,
    ersMode,
    ersPowerKw,
    gear,
    performanceDeltaSeconds: 0,
    rpm,
    speedKph,
    throttlePercent,
    tireTemperatureC,
    overtakeStatus,
    overtakeEnergyRemainingMj,
    energyHarvestedThisLapMj: energyStore.actualHarvestedThisLapMJ,
    energyDeployedThisLapMj,
    superClippingIntensity: superClipping.intensity,
    superClippingDrivePowerScale: superClipping.drivePowerScale,
    superClippingRegenPowerKw:
      energyStore.actualRecoveryPowerKw * superClippingRecoveryShare,
    superClippingRecoveredThisLapMj,
    superClippingStartedAtSeconds,
    superClippingStartedAtProgress,
    superClippingDurationSeconds,
  }
}
