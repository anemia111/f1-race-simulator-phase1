import type { CarSnapshot, RacePaceMode } from '../types'
import { hashChance } from './random'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type PursuitCar = Pick<
  CarSnapshot,
  | 'damage'
  | 'driverId'
  | 'ersBatteryPercent'
  | 'gapToAhead'
  | 'position'
  | 'racePaceMode'
  | 'status'
  | 'tireOverheatingPercent'
  | 'tireWearPercent'
  | 'totalDistance'
>

export function automaticRacePaceModeFor(options: {
  car: PursuitCar
  gapBehindSeconds: number | null
  isRaceDistance: boolean
  phaseActive: boolean
  pursuitSkill: number
  raceLaps: number
  seed: string
}): RacePaceMode {
  const {
    car,
    gapBehindSeconds,
    isRaceDistance,
    phaseActive,
    pursuitSkill,
    raceLaps,
    seed,
  } = options

  if (!isRaceDistance || car.status !== 'running') {
    return car.racePaceMode
  }

  if (phaseActive) {
    return 'save'
  }

  const completedLaps = Math.max(0, Math.floor(car.totalDistance) - 1)
  const remainingLaps = Math.max(1, raceLaps - completedLaps)
  const finalSprintLaps = Math.max(2, Math.ceil(raceLaps * 0.05))
  const tireAtRisk =
    car.tireWearPercent >= 88 || car.tireOverheatingPercent >= 68
  const carAtRisk = car.damage >= 0.45
  const lowEnergy = car.ersBatteryPercent < 24
  const healthyForPush =
    car.tireWearPercent < 82 &&
    car.tireOverheatingPercent < 55 &&
    car.damage < 0.28

  if (tireAtRisk || carAtRisk) {
    return 'save'
  }

  // In the closing laps, spend the usable reserve on a reachable car before
  // falling back to the normal low-SOC conservation threshold.
  if (
    car.position > 1 &&
    remainingLaps <= finalSprintLaps &&
    car.gapToAhead > 0 &&
    car.gapToAhead <= 6 &&
    car.ersBatteryPercent >= 18 &&
    healthyForPush
  ) {
    return 'push'
  }

  if (lowEnergy) {
    return 'save'
  }

  if (car.position === 1) {
    if (
      gapBehindSeconds !== null &&
      gapBehindSeconds > 0 &&
      gapBehindSeconds < 1.05 &&
      car.ersBatteryPercent >= 30
    ) {
      return 'defend'
    }

    return car.ersBatteryPercent < 40 ? 'save' : 'standard'
  }

  const gap = car.gapToAhead

  if (gap <= 0) {
    return 'standard'
  }

  // Once the car is near Overtake range, prioritize closing the final gap.
  if (gap <= 2.4 && car.ersBatteryPercent >= 30 && healthyForPush) {
    return 'push'
  }

  // Farther back, alternate push and recovery windows instead of draining the
  // Energy Store every lap. Better managers commit more often and for longer.
  if (gap <= 5.5 && car.ersBatteryPercent >= 36 && healthyForPush) {
    const decisionWindow = Math.floor(car.totalDistance * 3)
    const gapUrgency = clamp((5.5 - gap) / 3.1, 0, 1)
    const commitment = clamp(
      0.48 +
        clamp(pursuitSkill, 0, 1) * 0.3 +
        gapUrgency * 0.16 +
        (car.racePaceMode === 'push' ? 0.12 : 0),
      0,
      0.98,
    )

    if (
      hashChance(
        `${seed}:pursuit:${car.driverId}:${decisionWindow}`,
      ) < commitment
    ) {
      return 'push'
    }
  }

  if (
    car.ersBatteryPercent < 42 ||
    car.tireOverheatingPercent >= 48
  ) {
    return 'save'
  }

  return 'standard'
}
