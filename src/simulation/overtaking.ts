// Wheel-to-wheel model: deterministic close-battle rolls for passing,
// defending, and contact. The race loop owns state mutation; this module
// only describes what happened during a lap-crossing battle.

import type {
  CarSnapshot,
  Driver,
  FlagState,
  TrackDefinition,
  TireCompound,
  WeatherState,
} from '../types'
import { hashChance } from './random'
import { effectiveCliffLaps, isWetCompound } from './tires'

export type OvertakeOutcomeKind = 'pass' | 'defended' | 'contact' | 'crash'

export type OvertakeOutcome = {
  kind: OvertakeOutcomeKind
  attackerTimeGainSeconds: number
  attackerTimeLossSeconds: number
  defenderTimeLossSeconds: number
  attackerDamageDelta: number
  defenderDamageDelta: number
  attackerRetires: boolean
  defenderRetires: boolean
  flagResponse: Exclude<FlagState, 'clear'> | null
  flagDurationSeconds: number
  sector: number
  zone: 'overtake' | 'corner'
  message: string
}

type OvertakeContext = {
  seed: string
  attacker: Driver
  defender: Driver
  attackerCar: CarSnapshot
  defenderCar: CarSnapshot
  lap: number
  gapToAheadSeconds: number
  isOpeningLap: boolean
  inRestartWindow: boolean
  weather: WeatherState
  trackGrip: number
  track?: TrackDefinition
  trackProgress?: number
  sector?: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const dryTireAttackBias: Record<TireCompound, number> = {
  S: 0.09,
  M: 0.03,
  H: -0.04,
  I: -0.07,
  W: -0.12,
}

function driverOvertaking(driver: Driver): number {
  return clamp01(driver.overtaking ?? driver.speed)
}

function driverDefense(driver: Driver): number {
  return clamp01(driver.defense ?? driver.consistency)
}

function driverWetSkill(driver: Driver): number {
  return clamp01(driver.wetSkill ?? (driver.consistency * 0.6 + driver.tireManagement * 0.4))
}

function driverErrorRate(driver: Driver): number {
  return clamp01(driver.errorRate ?? (1 - driver.consistency) * 0.5)
}

function progressIsInZone(progress: number, start: number, end: number): boolean {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
}

function tireBattleBias(
  attackerCompound: TireCompound,
  defenderCompound: TireCompound,
  weather: WeatherState,
): number {
  if (weather !== 'clear') {
    const attackerWet = isWetCompound(attackerCompound)
    const defenderWet = isWetCompound(defenderCompound)

    if (attackerWet && !defenderWet) {
      return 0.18
    }

    if (!attackerWet && defenderWet) {
      return -0.2
    }
  }

  return dryTireAttackBias[attackerCompound] - dryTireAttackBias[defenderCompound]
}

export function overtakeForLap(context: OvertakeContext): OvertakeOutcome | null {
  const {
    attacker,
    attackerCar,
    defender,
    defenderCar,
    gapToAheadSeconds,
    inRestartWindow,
    isOpeningLap,
    lap,
    seed,
    trackGrip,
    track,
    trackProgress,
    weather,
    sector: currentSector,
  } = context
  const attackWindow = isOpeningLap ? 1.65 : inRestartWindow ? 1.25 : 1.05

  if (
    gapToAheadSeconds <= 0 ||
    gapToAheadSeconds > attackWindow ||
    attackerCar.status !== 'running' ||
    defenderCar.status !== 'running'
  ) {
    return null
  }

  const key = `${seed}:battle:${attacker.id}:${defender.id}:${lap}`
  const aeroZones = track?.aeroActivationZones ?? []
  const inMappedOvertakeZone =
    trackProgress !== undefined &&
    aeroZones.some((aeroZone) =>
      progressIsInZone(trackProgress, aeroZone.start, aeroZone.end),
    )
  const zone: OvertakeOutcome['zone'] =
    trackProgress === undefined
      ? aeroZones.length > 0 && hashChance(`${key}:zone`) < 0.62
        ? 'overtake'
        : 'corner'
      : inMappedOvertakeZone
        ? 'overtake'
        : 'corner'
  const overtakeEdge =
    zone === 'overtake' ? 0.12 + Math.min(0.08, aeroZones.length * 0.02) : 0
  const gapPressure = clamp01(1 - gapToAheadSeconds / attackWindow)
  const skillEdge = driverOvertaking(attacker) - driverDefense(defender)
  const wetEdge =
    weather === 'clear' ? 0 : driverWetSkill(attacker) - driverWetSkill(defender)
  const tireEdge = tireBattleBias(attackerCar.tire, defenderCar.tire, weather)
  const attackerWear = attackerCar.tireAgeLaps / effectiveCliffLaps(attackerCar.tire, attacker.tireManagement)
  const defenderWear = defenderCar.tireAgeLaps / effectiveCliffLaps(defenderCar.tire, defender.tireManagement)
  const tireAgeEdge = clamp((defenderWear - attackerWear) * 0.16, -0.14, 0.14)
  const chaos =
    (isOpeningLap ? 0.18 : 0) + (inRestartWindow ? 0.12 : 0) + (1 - trackGrip) * 0.18
  const attemptChance = clamp(
    0.14 + gapPressure * 0.48 + skillEdge * 0.22 + tireEdge * 0.4 + tireAgeEdge + wetEdge * 0.12 + chaos + overtakeEdge,
    0.05,
    0.82,
  )

  if (hashChance(`${key}:attempt`) > attemptChance) {
    return null
  }

  const detail = hashChance(`${key}:detail`)
  const sector = currentSector ?? Math.floor(hashChance(`${key}:sector`) * 3)
  const contactChance = clamp(
    0.025 +
      driverErrorRate(attacker) * 0.2 +
      driverErrorRate(defender) * 0.12 +
      (1 - trackGrip) * 0.16 +
      (isOpeningLap ? 0.08 : 0) +
      (inRestartWindow ? 0.06 : 0) +
      Math.max(0, -skillEdge) * 0.08 +
      (zone === 'corner' ? 0.025 : -0.012),
    0.02,
    0.34,
  )
  const passChance = clamp(
    0.22 +
      gapPressure * 0.5 +
      skillEdge * 0.36 +
      tireEdge * 0.5 +
      tireAgeEdge +
      wetEdge * 0.18 -
      (1 - trackGrip) * 0.1 -
      (isOpeningLap ? 0.05 : 0) +
      overtakeEdge * 0.22,
    0.08,
    0.86,
  )
  const outcomeRoll = hashChance(`${key}:outcome`)

  if (outcomeRoll < contactChance) {
    const crashRoll = hashChance(`${key}:crash`)
    const crashThreshold = clamp(
      0.09 + (1 - trackGrip) * 0.2 + (isOpeningLap ? 0.08 : 0) + detail * 0.05,
      0.08,
      0.3,
    )

    if (crashRoll < crashThreshold) {
      const responseRoll = hashChance(`${key}:flag`)
      const flagResponse: Exclude<FlagState, 'clear'> =
        responseRoll > 0.92 ? 'red' : responseRoll > 0.42 ? 'sc' : 'vsc'
      const attackerRetires = hashChance(`${key}:attacker-out`) < 0.68
      const defenderRetires = hashChance(`${key}:defender-out`) < 0.32

      return {
        kind: 'crash',
        attackerTimeGainSeconds: 0,
        attackerTimeLossSeconds: attackerRetires ? 0 : 7 + detail * 4,
        defenderTimeLossSeconds: defenderRetires ? 0 : 5 + detail * 3,
        attackerDamageDelta: attackerRetires ? 1 : 0.65,
        defenderDamageDelta: defenderRetires ? 1 : 0.45,
        attackerRetires,
        defenderRetires,
        flagResponse,
        flagDurationSeconds:
          flagResponse === 'red'
            ? 75 + detail * 45
            : flagResponse === 'sc'
              ? 55 + detail * 42
              : 28 + detail * 26,
        sector,
        zone,
        message: `${attacker.code} and ${defender.code} collide in sector ${sector + 1}.`,
      }
    }

    const needsYellow = detail > 0.46

    return {
      kind: 'contact',
      attackerTimeGainSeconds: 0,
      attackerTimeLossSeconds: 2.2 + detail * 3.4,
      defenderTimeLossSeconds: 1.4 + detail * 2.8,
      attackerDamageDelta: 0.12 + detail * 0.16,
      defenderDamageDelta: 0.08 + detail * 0.14,
      attackerRetires: false,
      defenderRetires: false,
      flagResponse: needsYellow ? 'yellow' : null,
      flagDurationSeconds: needsYellow ? 12 + detail * 18 : 0,
      sector,
      zone,
      message: `${attacker.code} tags ${defender.code} in sector ${sector + 1}; both lose time.`,
    }
  }

  if (outcomeRoll < contactChance + passChance) {
    return {
      kind: 'pass',
      attackerTimeGainSeconds: gapToAheadSeconds + 0.18 + detail * 0.32,
      attackerTimeLossSeconds:
        zone === 'corner' ? 0.16 + detail * 0.34 : 0,
      defenderTimeLossSeconds: 0,
      attackerDamageDelta: 0,
      defenderDamageDelta: 0,
      attackerRetires: false,
      defenderRetires: false,
      flagResponse: null,
      flagDurationSeconds: 0,
      sector,
      zone,
      message:
        zone === 'overtake'
          ? `${attacker.code} completes the pass with Overtake on the straight.`
          : `${attacker.code} passes ${defender.code} under braking after a close fight.`,
    }
  }

  return {
    kind: 'defended',
    attackerTimeGainSeconds: 0,
    attackerTimeLossSeconds:
      0.35 + detail * 0.85 + (zone === 'corner' ? 0.22 : 0),
    defenderTimeLossSeconds: 0,
    attackerDamageDelta: 0,
    defenderDamageDelta: 0,
    attackerRetires: false,
    defenderRetires: false,
    flagResponse: null,
    flagDurationSeconds: 0,
    sector,
    zone,
    message: `${defender.code} defends hard from ${attacker.code}.`,
  }
}
