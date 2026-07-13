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
  overtakePowerGainKph,
  overtakeStatusFor,
} from './activeAero'
import { hashChance } from './random'
import { approachSpeed, trackDynamicsAt } from './trackDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const MAX_RECHARGE_PER_LAP_MJ = 7

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

  if (batteryPercent < 24 || brakePercent > 58) {
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
  raceControlOvertakeEnabled?: boolean
  paceScale?: number
  raceLap: number
  sessionType?: 'race-distance' | 'limited-time'
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
    raceControlOvertakeEnabled = true,
    paceScale = 1,
    raceLap,
    sessionType = 'race-distance',
    track,
    trackGrip,
    weather,
  } = options
  const { curvature, referenceSpeedKph, straightness } = trackDynamicsAt(
    track,
    car.progress,
  )
  const activeAeroMode = activeAeroModeFor({ car, phase, track, trackGrip, weather })
  const flagSpeedCap =
    phase?.flag === 'red'
      ? 0
      : phase?.flag === 'sc'
        ? 145
        : phase?.flag === 'vsc'
          ? 185
          : phase?.flag === 'yellow'
            ? 225
            : track.observedCalibration?.maxSpeedKph
              ? clamp(track.observedCalibration.maxSpeedKph + 10, 300, 365)
              : 365
  const seedPulse =
    Math.sin(elapsedSeconds / 3.8 + hashChance(`${driver.id}:telemetry`) * Math.PI * 2) *
    5
  const profileDeceleration = Math.max(0, car.speedKph - referenceSpeedKph)
  const brakePercent = Math.round(
    clamp(
      curvature * 92 + profileDeceleration * 0.75 + (weather === 'heavy-rain' ? 8 : 0),
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
  const projectedBattery = clamp(
    car.ersBatteryPercent +
      (brakePercent / 100) * deltaSeconds * 1.4 -
      (straightness > 0.8 ? deltaSeconds * 0.45 : 0),
    5,
    100,
  )
  const overtakeStatus = overtakeStatusFor({
    batteryPercent: projectedBattery,
    car,
    phase,
    raceControlEnabled: raceControlOvertakeEnabled,
    raceLap,
    overtakeEnergyRemainingMj: car.overtakeEnergyRemainingMj,
    sessionType,
    track,
    trackGrip,
  })
  const ersMode = ersModeFor({
    batteryPercent: projectedBattery,
    brakePercent,
    car,
    overtakeStatus,
    straightness,
  })
  const ersDelta =
    ersMode === 'deploy'
      ? -deltaSeconds * (overtakeStatus === 'active' ? 1.75 : 1.1)
      : ersMode === 'harvest'
        ? deltaSeconds * 0.85
        : -deltaSeconds * 0.18
  const harvestedEnergyMj = Math.min(
    MAX_RECHARGE_PER_LAP_MJ,
    car.energyHarvestedThisLapMj +
      (brakePercent / 100) * deltaSeconds * 0.09,
  )
  const overtakeEnergyUsedMj =
    overtakeStatus === 'active'
      ? Math.min(car.overtakeEnergyRemainingMj, deltaSeconds * 0.18)
      : 0
  const overtakeEnergyRemainingMj = Math.max(
    0,
    car.overtakeEnergyRemainingMj - overtakeEnergyUsedMj,
  )
  const ersBatteryPercent = Math.round(clamp(projectedBattery + ersDelta, 5, 100))
  const aeroGain = activeAeroSpeedGainKph(activeAeroMode)
  const overtakeGain = overtakePowerGainKph(overtakeStatus, ersBatteryPercent)
  const ersGain = ersMode === 'deploy' ? 14 : ersMode === 'harvest' ? -7 : 0
  const targetSpeedKph = clamp(
    referenceSpeedKph * clamp(paceScale, 0.48, 1.12) +
      aeroGain +
      overtakeGain +
      ersGain +
      seedPulse,
    phase?.flag === 'red' ? 0 : car.status === 'pit' ? 78 : 55,
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
    (overtakeStatus === 'active' ? -0.28 : 0) +
    (ersMode === 'deploy' ? -0.22 : ersMode === 'harvest' ? 0.14 : 0) +
    (weather === 'heavy-rain' && activeAeroMode === 'straight' ? 0.2 : 0)

  return {
    activeAeroMode,
    brakePercent,
    ersBatteryPercent,
    ersMode,
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
