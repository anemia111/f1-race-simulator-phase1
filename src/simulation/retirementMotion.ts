import type { CarSnapshot } from '../types'
import { createInitialActiveAeroState } from './activeAero'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const impactRetirement = (reason: string | null) =>
  /contact|crash|collision|terminal/i.test(reason ?? '')

export function advanceRetiredCarMotion(
  car: CarSnapshot,
  options: {
    deltaSeconds: number
    elapsedSeconds: number
    trackLengthKm: number
  },
): CarSnapshot {
  if (car.status !== 'retired') {
    return car
  }

  const deltaSeconds = Math.max(0, options.deltaSeconds)
  const currentSpeedKph = Math.max(0, car.speedKph)
  const ageSeconds =
    car.retiredAtSeconds === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, options.elapsedSeconds - car.retiredAtSeconds)
  const impact = impactRetirement(car.retiredReason)
  const coastWindowSeconds = impact ? 2.4 : 7
  const decelerationKphPerSecond = impact ? 170 : 52
  const mayCoast =
    !car.hiddenFromTrack &&
    ageSeconds < coastWindowSeconds &&
    currentSpeedKph > 0.5
  const speedKph = mayCoast
    ? Math.max(0, currentSpeedKph - decelerationKphPerSecond * deltaSeconds)
    : 0
  const averageSpeedKph = mayCoast ? (currentSpeedKph + speedKph) / 2 : 0
  const distanceLaps =
    (averageSpeedKph * deltaSeconds) /
    (3600 * Math.max(0.5, options.trackLengthKm))
  const totalDistance = car.totalDistance + distanceLaps
  const lap = Math.floor(totalDistance)
  const brakePercent =
    speedKph <= 0.5 ? 0 : impact ? 100 : clamp(Math.round(28 + speedKph * 0.04), 28, 48)
  const gear = speedKph <= 0.5 ? 1 : clamp(Math.ceil(speedKph / 45), 1, 8)
  const rpm =
    speedKph <= 0.5 ? 0 : Math.round(clamp(3000 + speedKph * 20, 3000, 11000))

  return {
    ...car,
    activeAeroMode: 'corner',
    activeAeroState: createInitialActiveAeroState(),
    battleDeltaSecondsRemaining: 0,
    battlePhase: 'resolved',
    brakePercent,
    energyStore: {
      ...car.energyStore,
      actualDeploymentPowerKw: 0,
      actualRecoveryPowerKw: 0,
      batteryChargePowerKw: 0,
      batteryDischargePowerKw: 0,
      chargePowerKw: 0,
      deploymentRequest: 0,
      dischargePowerKw: 0,
      frictionBrakePowerKw: 0,
      motorMechanicalPowerKw: 0,
      recoveryMode: 'none',
      recoveryTorqueNm: 0,
      requestedBrakePowerKw: 0,
      requestedDeploymentPowerKw: 0,
      requestedRecoveryPowerKw: 0,
    },
    ersMode: 'harvest',
    ersPowerKw: 0,
    gear,
    lap,
    overtakeEligibility: null,
    overtakeStatus: 'disabled',
    progress: clamp(totalDistance - lap, 0, 1),
    rpm,
    speedKph,
    superClippingDrivePowerScale: 1,
    superClippingDurationSeconds: 0,
    superClippingIntensity: 0,
    superClippingRegenPowerKw: 0,
    superClippingStartedAtProgress: null,
    superClippingStartedAtSeconds: null,
    throttlePercent: 0,
    totalDistance,
  }
}
