import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  CarSnapshot,
  Driver,
  ErsMode,
  OvertakeStatus,
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
import { approachSpeed, trackDynamicsAt } from './trackDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const compoundBaseTemperature = {
  H: 86,
  I: 66,
  M: 92,
  S: 98,
  W: 56,
} as const

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
  trackGrip: number
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
    trackGrip,
    weather,
  } = options
  const { curvature, referenceSpeedKph, straightness } = trackDynamicsAt(
    track,
    car.progress,
  )
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
        ? 145
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
      curvature * 92 + profileDeceleration * 0.75 + wetBrakingLoad,
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
  const targetSpeedKph = clamp(
    referenceSpeedKph *
      clamp(paceScale, 0.48, 1.12) *
      clamp(localFlagPaceScale, 0.5, 1) +
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
  const tireTemperatureC = Math.round(
    clamp(
      compoundBaseTemperature[car.tire] +
        (1 - trackGrip) * -12 +
        speedKph * 0.028 +
        brakePercent * 0.1 +
        car.tireAgeLaps * 0.38 -
        car.damage * 7,
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
