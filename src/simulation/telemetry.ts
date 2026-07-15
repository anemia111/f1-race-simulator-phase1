import type {
  ActiveAeroMode,
  ActiveFlagPhase,
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
  activeAeroSpeedGainKph,
  ersDeploymentPowerKw,
  overtakeStatusFor,
} from './activeAero'
import { hashChance } from './random'
import { FIA_2026_REGULATION_PROFILE } from './regulations'
import { tireOperatingWindowFor } from './tires'
import { approachSpeed, trackDynamicsAt } from './trackDynamics'
import {
  fuelMassEffects,
  vehicleSpeedPerformanceMultiplier,
} from './vehicleDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function ersModeFor(options: {
  batteryPercent: number
  brakePercent: number
  car: CarSnapshot
  overtakeStatus: OvertakeStatus
  straightness: number
}) {
  const { batteryPercent, brakePercent, car, overtakeStatus, straightness } = options

  if (batteryPercent < 24 || brakePercent > 5) {
    return 'harvest' satisfies ErsMode
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
  paceScale?: number
  raceLap: number
  sessionType?: 'race-distance' | 'limited-time'
  standingStartMguKRestricted?: boolean
  specifiedErsPowerSector?: boolean
  track: TrackDefinition
  team?: Team
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
    maxRechargePerLapMj =
      FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
    raceControlOvertakeEnabled = true,
    paceScale = 1,
    raceLap,
    sessionType = 'race-distance',
    standingStartMguKRestricted = false,
    specifiedErsPowerSector = false,
    track,
    team,
    trackGrip,
    trackTemperatureC = 30,
    weather,
  } = options
  const { curvature, referenceSpeedKph, straightness } = trackDynamicsAt(
    track,
    car.progress,
  )
  const fuelEffects = fuelMassEffects({
    fuelLoadKg: car.fuelLoadKg,
    localDynamics: { curvature, straightness },
    track,
  })
  const activeAeroMode = activeAeroModeFor({
    car,
    lowGripConditions,
    phase,
    track,
  })
  const flagSpeedCap =
    phase?.flag === 'red'
      ? 0
      : phase?.flag === 'sc'
        ? 230
        : track.observedCalibration?.maxSpeedKph
          ? clamp(track.observedCalibration.maxSpeedKph + 10, 300, 365)
          : 365
  const seedPulse =
    Math.sin(elapsedSeconds / 3.8 + hashChance(`${driver.id}:telemetry`) * Math.PI * 2) *
    5
  const profileDeceleration = Math.max(0, car.speedKph - referenceSpeedKph)
  const wetBrakingLoad =
    weather === 'heavy-rain' &&
    (curvature > 0.04 || profileDeceleration > 0)
      ? 8
      : 0
  const brakePercent = Math.round(
    clamp(
      (curvature * 92 + profileDeceleration * 0.75 + wetBrakingLoad) *
        fuelEffects.brakeLoadMultiplier,
      0,
      100,
    ),
  )
  const throttlePercent = Math.round(
    clamp(
      28 + straightness * 72 - curvature * 25 + Math.max(0, referenceSpeedKph - car.speedKph) * 0.22 - (phase ? 20 : 0),
      0,
      100,
    ),
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
  const requestedErsMode = ersModeFor({
    batteryPercent: car.ersBatteryPercent,
    brakePercent,
    car,
    overtakeStatus,
    straightness,
  })
  const ersMode = standingStartMguKRestricted
    ? ('balanced' as const)
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
  const regenerativePowerKw =
    ersMode === 'harvest'
      ? Math.min(
          FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
          35 + brakePercent * 2.8 + (100 - throttlePercent) * 0.18,
        )
      : 0
  const harvestedThisFrameMj = Math.min(
    remainingRechargeMj,
    (regenerativePowerKw * deltaSeconds) / 1000,
  )
  const harvestedEnergyMj =
    car.energyHarvestedThisLapMj + harvestedThisFrameMj
  const deployedThisFrameMj = (ersPowerKw * deltaSeconds) / 1000
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
  const aeroGain = activeAeroSpeedGainKph(activeAeroMode)
  const ersGain =
    ersMode === 'deploy' ? (ersPowerKw / 350) * 20 : ersMode === 'harvest' ? -7 : 0
  const vehiclePerformanceMultiplier = team
    ? vehicleSpeedPerformanceMultiplier({
        driver,
        dynamics: { curvature, straightness },
        team,
      })
    : 1
  const massSpeedMultiplier =
    fuelEffects.longitudinalSpeedMultiplier *
    (1 - curvature * (1 - fuelEffects.cornerSpeedMultiplier))
  const targetSpeedKph = clamp(
    referenceSpeedKph *
      clamp(paceScale, 0.48, 1.12) *
      clamp(localFlagPaceScale, 0.5, 1) *
      vehiclePerformanceMultiplier *
      massSpeedMultiplier +
      aeroGain +
      ersGain +
      seedPulse,
    phase?.flag === 'red'
      ? 0
      : phase?.flag === 'vsc'
        ? 35
        : car.status === 'pit'
          ? 78
          : 55,
    flagSpeedCap,
  )
  const speedKph = Math.round(
    approachSpeed(car.speedKph, targetSpeedKph, deltaSeconds),
  )
  const gear = speedKph === 0 ? 0 : Math.round(clamp((speedKph - 38) / 39, 1, 8))
  const rpm = Math.round(
    speedKph === 0
      ? 0
      : clamp(6900 + speedKph * 29 + throttlePercent * 24 - brakePercent * 10, 4200, 13500),
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
  const tireTemperatureC = Math.round(
    clamp(
      tireWindow.targetC -
        12 +
        (trackTemperatureC - 30) * 0.22 +
        (1 - trackGrip) * -12 +
        speedKph * 0.018 +
        brakePercent * 0.075 +
        curvature * 7 +
        paceModeHeat +
        (1 - driver.tireManagement) * 5 +
        car.damage * 5 +
        (fuelEffects.tireLoadMultiplier - 1) * 13 +
        Math.min(3, (car.tireThermalStressPercent ?? 0) * 0.08),
      car.tire === 'W' ? 42 : 62,
      car.tire === 'S' ? 124 : 116,
    ),
  )
  const performanceDeltaSeconds =
    (activeAeroMode === 'straight'
      ? -0.16
      : activeAeroMode === 'partial-straight'
        ? -0.07
        : 0) +
    (overtakeBoostPowerKw / 150) * -0.18 +
    (ersMode === 'deploy'
      ? (ersPowerKw / 350) * -0.22
      : ersMode === 'harvest'
        ? 0.14
        : 0) +
    (weather === 'heavy-rain' && activeAeroMode === 'straight' ? 0.2 : 0)

  return {
    activeAeroMode,
    brakePercent,
    ersBatteryPercent,
    ersMode,
    ersPowerKw,
    gear,
    performanceDeltaSeconds,
    rpm,
    speedKph,
    throttlePercent,
    tireTemperatureC,
    overtakeStatus,
    overtakeEnergyRemainingMj,
    energyHarvestedThisLapMj: harvestedEnergyMj,
  }
}
