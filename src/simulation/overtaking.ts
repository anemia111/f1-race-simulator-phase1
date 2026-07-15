// Wheel-to-wheel model: deterministic close-battle rolls for passing,
// defending, and contact. The race loop owns state mutation; this module
// only describes what happened during a lap-crossing battle.

import type {
  CarSnapshot,
  Driver,
  FlagState,
  TrackDefinition,
  WeatherState,
} from '../types'
import { hashChance } from './random'
import { driverPerformanceAbility } from './driverAbility'
import { tireDeltaSeconds } from './tires'

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
  zone: 'straight' | 'corner'
  assistance: 'overtake' | 'tow' | 'none'
  message: string
}

export type OvertakeContext = {
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
  /** Number of battle checks made per lap; scales a lap-level attempt chance. */
  evaluationsPerLap?: number
}

export type BattleDynamics = {
  zone: OvertakeOutcome['zone']
  assistance: OvertakeOutcome['assistance']
  tirePerformanceEdge: number
  electricalPerformanceEdge: number
  ersPowerDeltaKw: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function driverOvertaking(driver: Driver): number {
  return driverPerformanceAbility(driver, 'overtaking')
}

function driverDefense(driver: Driver): number {
  return driverPerformanceAbility(driver, 'defense')
}

function driverWetSkill(driver: Driver): number {
  return clamp(
    driverPerformanceAbility(driver, 'wetSkill') * 0.78 +
      driverPerformanceAbility(driver, 'adaptability') * 0.22,
    0.55,
    1.5,
  )
}

function driverErrorRate(driver: Driver): number {
  const awareness = driverPerformanceAbility(driver, 'raceAwareness')

  return clamp01(driver.errorRate ?? (1 - awareness) * 0.5)
}

function progressIsInZone(progress: number, start: number, end: number): boolean {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
}

export function battleDynamicsFor(
  context: Pick<
    OvertakeContext,
    | 'attacker'
    | 'attackerCar'
    | 'defender'
    | 'defenderCar'
    | 'gapToAheadSeconds'
    | 'lap'
    | 'seed'
    | 'track'
    | 'trackGrip'
    | 'trackProgress'
    | 'weather'
  >,
): BattleDynamics {
  const {
    attacker,
    attackerCar,
    defender,
    defenderCar,
    gapToAheadSeconds,
    lap,
    seed,
    track,
    trackGrip,
    trackProgress,
    weather,
  } = context
  const key = `${seed}:battle:${attacker.id}:${defender.id}:${lap}`
  const aeroZones = track?.aeroActivationZones ?? []
  const inMappedStraight =
    trackProgress !== undefined &&
    aeroZones.some((aeroZone) =>
      progressIsInZone(trackProgress, aeroZone.start, aeroZone.end),
    )
  const zone: BattleDynamics['zone'] =
    trackProgress === undefined
      ? aeroZones.length > 0 && hashChance(`${key}:zone`) < 0.62
        ? 'straight'
        : 'corner'
      : inMappedStraight
        ? 'straight'
        : 'corner'
  const hasActiveOvertake =
    zone === 'straight' && attackerCar.overtakeStatus === 'active'
  const assistance: BattleDynamics['assistance'] = hasActiveOvertake
    ? 'overtake'
    : zone === 'straight' && gapToAheadSeconds <= 1.2
      ? 'tow'
      : 'none'
  const attackerTireDelta = tireDeltaSeconds(
    attackerCar.tire,
    attackerCar.tireAgeLaps,
    attacker.tireManagement,
    weather,
    trackGrip,
    attackerCar.tireTemperatureC,
    attackerCar.tireWearPercent,
    track?.tireNomination,
    undefined,
    attackerCar.tireThermalStressPercent ?? 0,
    undefined,
    {
      carcassTemperatureC: attackerCar.tireCarcassTemperatureC,
      grainingPercent: attackerCar.tireGrainingPercent,
      overheatingPercent: attackerCar.tireOverheatingPercent,
    },
  )
  const defenderTireDelta = tireDeltaSeconds(
    defenderCar.tire,
    defenderCar.tireAgeLaps,
    defender.tireManagement,
    weather,
    trackGrip,
    defenderCar.tireTemperatureC,
    defenderCar.tireWearPercent,
    track?.tireNomination,
    undefined,
    defenderCar.tireThermalStressPercent ?? 0,
    undefined,
    {
      carcassTemperatureC: defenderCar.tireCarcassTemperatureC,
      grainingPercent: defenderCar.tireGrainingPercent,
      overheatingPercent: defenderCar.tireOverheatingPercent,
    },
  )
  const tirePerformanceEdge = clamp(
    (defenderTireDelta - attackerTireDelta) * 0.085,
    -0.18,
    0.18,
  )
  const ersPowerDeltaKw =
    zone === 'straight'
      ? attackerCar.ersPowerKw - defenderCar.ersPowerKw
      : 0
  const electricalPerformanceEdge =
    zone === 'straight'
      ? clamp((ersPowerDeltaKw / 150) * 0.075, -0.075, 0.075)
      : 0

  return {
    assistance,
    electricalPerformanceEdge,
    ersPowerDeltaKw,
    tirePerformanceEdge,
    zone,
  }
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
    weather,
    sector: currentSector,
    evaluationsPerLap = 1,
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
  const battleDynamics = battleDynamicsFor(context)
  const {
    assistance,
    electricalPerformanceEdge,
    tirePerformanceEdge,
    zone,
  } = battleDynamics
  const gapPressure = clamp01(1 - gapToAheadSeconds / attackWindow)
  const skillEdge = driverOvertaking(attacker) - driverDefense(defender)
  const wetEdge =
    weather === 'clear' ? 0 : driverWetSkill(attacker) - driverWetSkill(defender)
  const chaos =
    (isOpeningLap ? 0.18 : 0) + (inRestartWindow ? 0.12 : 0) + (1 - trackGrip) * 0.18
  const lapAttemptChance = clamp(
    0.14 +
      gapPressure * 0.48 +
      skillEdge * 0.22 +
      tirePerformanceEdge +
      wetEdge * 0.12 +
      chaos +
      electricalPerformanceEdge +
      (zone === 'straight' ? 0.025 : 0),
    0.05,
    0.82,
  )
  const attemptChance =
    1 - Math.pow(1 - lapAttemptChance, 1 / Math.max(1, evaluationsPerLap))

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
      tirePerformanceEdge * 1.12 +
      wetEdge * 0.18 -
      (1 - trackGrip) * 0.1 -
      (isOpeningLap ? 0.05 : 0) +
      electricalPerformanceEdge * 1.2 +
      (zone === 'straight' ? 0.03 : 0),
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
      const attackerRetires = hashChance(`${key}:attacker-out`) < 0.68
      const defenderRetires = hashChance(`${key}:defender-out`) < 0.32
      const majorMultiCarCrash = attackerRetires && defenderRetires
      const flagResponse: Exclude<FlagState, 'clear'> =
        responseRoll > (majorMultiCarCrash ? 0.68 : 0.92)
          ? 'red'
          : responseRoll > 0.42
            ? 'sc'
            : 'vsc'

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
        assistance,
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
      assistance,
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
      assistance,
      message:
        assistance === 'overtake'
          ? `${attacker.code} passes ${defender.code} with Overtake on the straight.`
          : assistance === 'tow'
            ? `${attacker.code} uses the tow and passes ${defender.code} on the straight.`
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
    assistance,
    message: `${defender.code} defends hard from ${attacker.code}.`,
  }
}
