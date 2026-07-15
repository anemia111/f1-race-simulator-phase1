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
  overtakeStatus: OvertakeStatus
  phase: ActiveFlagPhase | null
  straightness: number
}) {
  const {
    batteryPercent,
    brakePercent,
    car,
    overtakeStatus,
    phase,
    straightness,
  } = options

  if (phase || batteryPercent < 24 || brakePercent > 5) {
    return batteryPercent < 96 ? ('harvest' satisfies ErsMode) : ('balanced' satisfies ErsMode)
  }

  if (
    batteryPercent > 36 &&
    car.status === 'running' &&
    (overtakeStatus === 'active' || car.gapToAhead < 1.4 || straightness > 0.82)
  ) {
    return 'deploy' satisfies ErsMode
  }

  return 'balanced' satisfies ErsMode
}

type CalculatedTelemetry = {
  activeAeroMode: ActiveAeroMode
  brakePercent: number
  ersBatteryPercent: number
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
  maxRechargePerLapMj?: number
  raceControlOvertakeEnabled?: boolean
  regulatoryMassIncreaseKg?: number
  paceScale?: number
  raceLap: number
  sessionType?: 'race-distance' | 'limited-time'
  standingStartMguKRestricted?: boolean
  specifiedErsPowerSector?: boolean
  surfaceWaterMm?: number
  setup?: CarSetup
  headwindMps?: number
  track: TrackDefinition
  team: Team
  trackGrip: number
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
    maxRechargePerLapMj = FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
    raceControlOvertakeEnabled = true,
    regulatoryMassIncreaseKg = 0,
    paceScale = 1,
    raceLap,
    sessionType = 'race-distance',
    standingStartMguKRestricted = false,
    specifiedErsPowerSector = false,
    surfaceWaterMm: providedSurfaceWaterMm,
    setup,
    headwindMps = 0,
    track,
    team,
    trackGrip,
    trackTemperatureC = 30,
    weather,
  } = options
  const surfaceWaterMm =
    providedSurfaceWaterMm ??
    (weather === 'heavy-rain' ? 1.2 : weather === 'light-rain' ? 0.35 : 0)
  const dynamics = trackDynamicsAt(track, car.progress)
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
    speedExcess * (0.7 + dynamics.brakingSeverity * 0.65)
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
    batteryPercent: car.ersBatteryPercent,
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
    batteryPercent: car.ersBatteryPercent,
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
    speedKph: car.speedKph,
    straightLengthAheadMeters: dynamics.straightLengthAheadMeters,
    straightness: dynamics.straightness,
    team,
    throttlePercent,
  })
  const requestedErsMode = ersModeFor({
    batteryPercent: car.ersBatteryPercent,
    brakePercent,
    car,
    overtakeStatus,
    phase,
    straightness: dynamics.straightness,
  })
  const ersMode = standingStartMguKRestricted
    ? ('balanced' as const)
    : superClipping.intensity >= 0.04
      ? ('harvest' as const)
      : requestedErsMode
  const ersCurve = lowGripConditions
    ? ('low-grip-estimate' as const)
    : specifiedErsPowerSector
      ? ('specified-sector' as const)
      : ('standard' as const)
  const ersPowerKw = ersDeploymentPowerKw({
    curve: ersCurve,
    ersMode,
    overtakeStatus,
    speedKph: car.speedKph,
  })
  const standardErsPowerKw = ersDeploymentPowerKw({
    curve: ersCurve,
    ersMode,
    overtakeStatus: 'available',
    speedKph: car.speedKph,
  })
  const overtakeBoostPowerKw = Math.max(0, ersPowerKw - standardErsPowerKw)
  const remainingRechargeMj = Math.max(
    0,
    maxRechargePerLapMj - car.energyHarvestedThisLapMj,
  )
  const recoveryControl = driverSkillBlend(driver, {
    ersManagement: 0.65,
    brakingSkill: 0.2,
    raceAwareness: 0.15,
  })
  const brakingRegenerativePowerKw =
    ersMode === 'harvest'
      ? Math.min(
          FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
          (brakePercent * 2.8 + Math.max(0, 80 - throttlePercent) * 0.32) *
            team.machine.energyRecoveryEfficiency *
            (0.82 + recoveryControl * 0.18),
        )
      : 0
  const regenerativePowerKw = Math.min(
    FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
    brakingRegenerativePowerKw + superClipping.electricalRecoveryPowerKw,
  )
  const harvestedThisFrameMj = Math.min(
    remainingRechargeMj,
    (regenerativePowerKw * deltaSeconds) / 1000,
  )
  const harvestedEnergyMj = car.energyHarvestedThisLapMj + harvestedThisFrameMj
  const superClippingHarvestedThisFrameMj = Math.min(
    harvestedThisFrameMj,
    (superClipping.electricalRecoveryPowerKw * deltaSeconds) / 1000,
  )
  const superClippingRecoveredThisLapMj =
    (car.superClippingRecoveredThisLapMj ?? 0) +
    superClippingHarvestedThisFrameMj
  const deploymentEfficiency = clamp(
    team.machine.electricalDeploymentEfficiency,
    0.72,
    1,
  )
  const deployedThisFrameMj =
    (ersPowerKw * deltaSeconds) / (1000 * deploymentEfficiency)
  const energyDeployedThisLapMj =
    (car.energyDeployedThisLapMj ?? 0) + deployedThisFrameMj
  const overtakeEnergyUsedMj =
    overtakeStatus === 'active'
      ? Math.min(
          car.overtakeEnergyRemainingMj,
          (deltaSeconds * overtakeBoostPowerKw) / 1000,
        )
      : 0
  const overtakeEnergyRemainingMj = Math.max(
    0,
    car.overtakeEnergyRemainingMj - overtakeEnergyUsedMj,
  )
  const ersBatteryPercent = Math.round(
    clamp(
      car.ersBatteryPercent +
        ((harvestedThisFrameMj - deployedThisFrameMj) /
          FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj) *
          100,
      0,
      100,
    ),
  )
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
      superClipping.regenerativeResistancePowerKw,
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
    brakePercent > 3 && phase?.flag !== 'red'
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
    energyHarvestedThisLapMj: harvestedEnergyMj,
    energyDeployedThisLapMj,
    superClippingIntensity: superClipping.intensity,
    superClippingDrivePowerScale: superClipping.drivePowerScale,
    superClippingRegenPowerKw: superClipping.electricalRecoveryPowerKw,
    superClippingRecoveredThisLapMj,
    superClippingStartedAtSeconds,
    superClippingStartedAtProgress,
    superClippingDurationSeconds,
  }
}
