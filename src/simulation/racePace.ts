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
  fuelMarginKg?: number
  gapBehindSeconds: number | null
  isRaceDistance: boolean
  phaseActive: boolean
  pursuitSkill: number
  raceLaps: number
  seed: string
}): RacePaceMode {
  const {
    car,
    fuelMarginKg = Number.POSITIVE_INFINITY,
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
  const fuelAtRisk = fuelMarginKg < 1.25
  const fuelHealthyForPush = fuelMarginKg >= 1.8
  const healthyForPush =
    car.tireWearPercent < 82 &&
    car.tireOverheatingPercent < 55 &&
    car.damage < 0.28

  if (tireAtRisk || carAtRisk) {
    return 'save'
  }

  if (fuelAtRisk) {
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
    fuelHealthyForPush &&
    healthyForPush
  ) {
    return 'push'
  }

  if (lowEnergy) {
    return 'save'
  }

  // Defending is not the leader's privilege. Any driver with a car in range
  // behind covers, and the mode is what makes that visible on the pit wall.
  const underAttack =
    gapBehindSeconds !== null &&
    gapBehindSeconds > 0 &&
    gapBehindSeconds < 1.05

  if (car.position === 1) {
    // A leader with clear air and the resources to use it builds the gap
    // rather than sitting on the pace. Escaping is worth more than covering
    // while the car behind is still reachable but not yet alongside.
    const canEscape =
      gapBehindSeconds !== null &&
      gapBehindSeconds >= 1.05 &&
      gapBehindSeconds <= 3.2 &&
      car.ersBatteryPercent >= 46 &&
      fuelHealthyForPush &&
      healthyForPush

    if (canEscape) {
      return 'push'
    }

    if (underAttack && car.ersBatteryPercent >= 30) {
      return 'defend'
    }

    return car.ersBatteryPercent < 40 ? 'save' : 'standard'
  }

  const gap = car.gapToAhead

  // Covering the car behind outranks chasing the one ahead when the attacker
  // is close enough to be the more immediate loss.
  if (
    underAttack &&
    car.ersBatteryPercent >= 30 &&
    (gap <= 0 || gap > 1.4)
  ) {
    return 'defend'
  }

  if (gap <= 0) {
    return 'standard'
  }

  // Once the car is near Overtake range, prioritize closing the final gap.
  if (
    gap <= 2.4 &&
    car.ersBatteryPercent >= 30 &&
    fuelHealthyForPush &&
    healthyForPush
  ) {
    return 'push'
  }

  // Farther back, choose one push or recovery plan for the lap instead of
  // draining the Energy Store with several sub-lap mode reversals.
  if (
    gap <= 5.5 &&
    car.ersBatteryPercent >= 36 &&
    fuelHealthyForPush &&
    healthyForPush
  ) {
    const decisionWindow = Math.floor(car.totalDistance)
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
