// Incident model: deterministic per-lap rolls for mechanical failures and
// driver errors, plus the flag response each incident triggers. Replaces the
// Phase 3-A precomputed flag timeline with incident-driven flags.
// Pure TypeScript, all randomness derived from the race seed.

import type { Driver, FlagState, Team, WeatherState } from '../types'
import { driverSkillBlend } from './driverAbility'
import { hashChance } from './random'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type IncidentKind =
  | 'mechanical'
  | 'minor-error'
  | 'damage-error'
  | 'terminal-crash'

export type IncidentOutcome = {
  kind: IncidentKind
  /** Race Control terminology: an occurrence or a safety-relevant accident. */
  classification: 'incident' | 'accident'
  /** Car is out of the race. */
  retirement: boolean
  /** Added to CarSnapshot.damage (0..1). */
  damageDelta: number
  /** One-off time loss in seconds (running wide, recovery, flat spot). */
  timeLossSeconds: number
  /** Flag phase this incident triggers, if any. */
  flagResponse: Exclude<FlagState, 'clear'> | null
  flagDurationSeconds: number
  /** Main track is obstructed near pit entry, so B5.13.3 routing may apply. */
  safetyCarUsesPitLane: boolean
  /** Sector where the incident happened (0-based). */
  sector: number
  /** Ticker/log message. */
  message: string
}

export const incidentTuning = {
  /** Per-lap mechanical failure chance factor (scaled by 1 - reliability). */
  mechanicalBaseChance: 0.006,
  /** Per-lap driver error chance factor (scaled by 1 - consistency). */
  errorBaseChance: 0.02,
  /** Error severity split: first minor, then damage, otherwise a crash. */
  minorSeverityShare: 0.55,
  damageSeverityShare: 0.85,
} as const

const flagRank: Record<Exclude<FlagState, 'clear'>, number> = {
  yellow: 1,
  vsc: 2,
  sc: 3,
  red: 4,
}

export function flagSeverityRank(flag: Exclude<FlagState, 'clear'> | null): number {
  return flag ? flagRank[flag] : 0
}

export function terminalCrashFlagResponse(
  obstructionRoll: number,
): Exclude<FlagState, 'clear'> {
  if (obstructionRoll < 0.28) return 'yellow'
  if (obstructionRoll < 0.72) return 'vsc'
  if (obstructionRoll < 0.96) return 'sc'
  return 'red'
}

/**
 * Roll for an incident when `driver` completes `lap`. Returns null on a clean
 * lap. Deterministic for (seed, driver, lap); `riskMultiplier` raises the
 * odds in high-risk conditions (restart laps) without breaking determinism.
 */
export function incidentForLap(
  seed: string,
  driver: Driver,
  team: Team,
  lap: number,
  riskMultiplier = 1,
  context: {
    pressure?: number
    tireWearPercent?: number
    weather?: WeatherState
  } = {},
): IncidentOutcome | null {
  if (lap < 2) {
    // Opening-lap contact is owned by the wheel-to-wheel battle model. Avoid
    // rolling a second unrelated incident for the same launch phase.
    return null
  }

  const sector = Math.floor(hashChance(`${seed}:incident-sector:${driver.id}:${lap}`) * 3)
  const detail = hashChance(`${seed}:incident-detail:${driver.id}:${lap}`)

  const mechanicalChance =
    incidentTuning.mechanicalBaseChance *
    Math.max(0.025, 1 - team.machine.reliability) *
    riskMultiplier

  if (hashChance(`${seed}:mechanical:${driver.id}:${lap}`) < mechanicalChance) {
    // Mechanical retirement: the car pulls off, marshals respond.
    const usesVsc = detail < 0.2
    return {
      kind: 'mechanical',
      classification: 'incident',
      retirement: true,
      damageDelta: 0,
      timeLossSeconds: 0,
      flagResponse: usesVsc ? 'vsc' : 'yellow',
      flagDurationSeconds: usesVsc ? 25 + detail * 40 : 18 + detail * 24,
      safetyCarUsesPitLane: false,
      sector,
      message: `INCIDENT: ${driver.code} retires with a mechanical failure in sector ${sector + 1}.`,
    }
  }

  const controlSkill = driverSkillBlend(driver, {
    consistency: 0.26,
    mistakeResistance: 0.3,
    pressureHandling: 0.14,
    precision: 0.14,
    raceAwareness: 0.16,
  })
  const weatherRisk =
    context.weather === 'heavy-rain'
      ? 1.7 - driver.skills.wetSkill * 0.55
      : context.weather === 'light-rain'
        ? 1.35 - driver.skills.intermediateSkill * 0.3
        : 1
  const tireRisk = 1 + Math.max(0, (context.tireWearPercent ?? 0) - 75) / 70
  const pressureRisk = 1 + clamp(context.pressure ?? 0.45, 0, 1) * 0.2
  const errorChance =
    incidentTuning.errorBaseChance *
    Math.max(0.035, 1 - controlSkill) *
    weatherRisk *
    tireRisk *
    pressureRisk *
    riskMultiplier

  if (hashChance(`${seed}:error:${driver.id}:${lap}`) >= errorChance) {
    return null
  }

  const severity = hashChance(`${seed}:severity:${driver.id}:${lap}`)

  if (severity < incidentTuning.minorSeverityShare) {
    return {
      kind: 'minor-error',
      classification: 'incident',
      retirement: false,
      damageDelta: 0,
      timeLossSeconds: 0.05 + detail * 0.25,
      flagResponse: null,
      flagDurationSeconds: 0,
      safetyCarUsesPitLane: false,
      sector,
      message: `INCIDENT: ${driver.code} runs wide in sector ${sector + 1} and loses time.`,
    }
  }

  if (severity < incidentTuning.damageSeverityShare) {
    return {
      kind: 'damage-error',
      classification: 'accident',
      retirement: false,
      damageDelta: 0.3 + detail * 0.2,
      timeLossSeconds: 0.3 + detail * 1.2,
      flagResponse: 'yellow',
      flagDurationSeconds: 15 + detail * 18,
      safetyCarUsesPitLane: false,
      sector,
      message: `ACCIDENT: ${driver.code} clips the wall in sector ${sector + 1}: front wing damage.`,
    }
  }

  // Terminal crash: retirement plus a strong flag response.
  const response = terminalCrashFlagResponse(detail)
  const duration =
    response === 'yellow'
      ? 18 + detail * 20
      : response === 'sc'
      ? 55 + detail * 45
      : response === 'vsc'
        ? 30 + detail * 25
        : 70 + detail * 40

  return {
    kind: 'terminal-crash',
    classification: 'accident',
    retirement: true,
    damageDelta: 1,
    timeLossSeconds: 0,
    flagResponse: response,
    flagDurationSeconds: duration,
    safetyCarUsesPitLane:
      response === 'sc' &&
      sector === 2 &&
      hashChance(`${seed}:pit-lane-route:${driver.id}:${lap}`) < 0.22,
    sector,
    message: `ACCIDENT: ${driver.code} crashes out in sector ${sector + 1}.`,
  }
}
