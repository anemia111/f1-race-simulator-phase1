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
  const runtimeSystems =
    car.runtimeSystems.kind === 'f1'
      ? (() => {
          const energyStore = {
            ...car.runtimeSystems.energyStore,
            chargeDcPowerKw: 0,
            dischargeDcPowerKw: 0,
            storedChargePowerKw: 0,
            storedDischargePowerKw: 0,
            requestedDeploymentDcPowerKw: 0,
            actualDeploymentDcPowerKw: 0,
            actualDeploymentPowerKw: 0,
            actualRecoveryPowerKw: 0,
            deploymentRequest: 0,
            frictionBrakePowerKw: 0,
            motorMechanicalPowerKw: 0,
            batteryLossPowerKw: 0,
            inverterLossPowerKw: 0,
            motorLossPowerKw: 0,
            operatingMode: 'inactive' as const,
            recoveryTorqueNm: 0,
            requestedBrakePowerKw: 0,
            requestedRecoveryPowerKw: 0,
          }

          return {
            ...car.runtimeSystems,
            activeAeroMode: 'corner' as const,
            activeAeroState: createInitialActiveAeroState(),
            energyStore,
            energyDeployedThisLapMj:
              energyStore.deployedAtCuKBusThisLapMJ,
            energyHarvestedThisLapMj:
              energyStore.rechargedAtCuKBusThisLapMJ,
            ersBatteryPercent: Math.round(energyStore.stateOfCharge * 100),
            ersMode: 'harvest' as const,
            ersPowerKw: 0,
            overtakeEligibility: null,
            superClippingDurationSeconds: 0,
            superClippingIntensity: 0,
            superClippingRegenPowerKw: 0,
            superClippingStartedAtProgress: null,
            superClippingStartedAtSeconds: null,
          }
        })()
      : car.runtimeSystems

  return {
    ...car,
    battleDeltaSecondsRemaining: 0,
    battlePhase: 'resolved',
    brakePercent,
    gear,
    lap,
    overtakeStatus: 'disabled',
    progress: clamp(totalDistance - lap, 0, 1),
    rpm,
    runtimeSystems,
    speedKph,
    throttlePercent: 0,
    totalDistance,
  }
}
