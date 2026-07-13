// Incident model: deterministic per-lap rolls for mechanical failures and
// driver errors, plus the flag response each incident triggers. Replaces the
// Phase 3-A precomputed flag timeline with incident-driven flags.
// Pure TypeScript, all randomness derived from the race seed.

import type { Driver, FlagState, Team } from '../types'
import { hashChance } from './random'

export type IncidentKind =
  | 'mechanical'
  | 'minor-error'
  | 'damage-error'
  | 'terminal-crash'

export type IncidentOutcome = {
  kind: IncidentKind
  /** Car is out of the race. */
  retirement: boolean
  /** Added to CarSnapshot.damage (0..1). */
  damageDelta: number
  /** One-off time loss in seconds (running wide, recovery, flat spot). */
  timeLossSeconds: number
  /** Flag phase this incident triggers, if any. */
  flagResponse: Exclude<FlagState, 'clear'> | null
  flagDurationSeconds: number
  /** Sector where the incident happened (0-based). */
  sector: number
  /** Ticker/log message. */
  message: string
}

export const incidentTuning = {
  /** Per-lap mechanical failure chance factor (scaled by 1 - reliability). */
  mechanicalBaseChance: 0.02,
  /** Per-lap driver error chance factor (scaled by 1 - consistency). */
  errorBaseChance: 0.035,
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
): IncidentOutcome | null {
  if (lap < 2) {
    // Opening-lap contact is owned by the wheel-to-wheel battle model. Avoid
    // rolling a second unrelated incident for the same launch phase.
    return null
  }

  const sector = Math.floor(hashChance(`${seed}:incident-sector:${driver.id}:${lap}`) * 3)
  const detail = hashChance(`${seed}:incident-detail:${driver.id}:${lap}`)

  const mechanicalChance =
    incidentTuning.mechanicalBaseChance * (1 - team.reliability) * riskMultiplier

  if (hashChance(`${seed}:mechanical:${driver.id}:${lap}`) < mechanicalChance) {
    // Mechanical retirement: the car pulls off, marshals respond.
    const usesVsc = detail < 0.5
    return {
      kind: 'mechanical',
      retirement: true,
      damageDelta: 0,
      timeLossSeconds: 0,
      flagResponse: usesVsc ? 'vsc' : 'yellow',
      flagDurationSeconds: usesVsc ? 25 + detail * 40 : 18 + detail * 24,
      sector,
      message: `${driver.code} retires: mechanical failure in sector ${sector + 1}.`,
    }
  }

  const errorChance =
    incidentTuning.errorBaseChance * (1 - driver.consistency) * riskMultiplier

  if (hashChance(`${seed}:error:${driver.id}:${lap}`) >= errorChance) {
    return null
  }

  const severity = hashChance(`${seed}:severity:${driver.id}:${lap}`)

  if (severity < incidentTuning.minorSeverityShare) {
    return {
      kind: 'minor-error',
      retirement: false,
      damageDelta: 0,
      timeLossSeconds: 1.5 + detail * 3,
      flagResponse: null,
      flagDurationSeconds: 0,
      sector,
      message: `${driver.code} runs wide in sector ${sector + 1} and loses time.`,
    }
  }

  if (severity < incidentTuning.damageSeverityShare) {
    return {
      kind: 'damage-error',
      retirement: false,
      damageDelta: 0.3 + detail * 0.2,
      timeLossSeconds: 3 + detail * 4,
      flagResponse: 'yellow',
      flagDurationSeconds: 15 + detail * 18,
      sector,
      message: `${driver.code} clips the wall in sector ${sector + 1}: front wing damage.`,
    }
  }

  // Terminal crash: retirement plus a strong flag response.
  const response: Exclude<FlagState, 'clear'> =
    detail < 0.6 ? 'sc' : detail < 0.9 ? 'vsc' : 'red'
  const duration =
    response === 'sc'
      ? 55 + detail * 45
      : response === 'vsc'
        ? 30 + detail * 25
        : 70 + detail * 40

  return {
    kind: 'terminal-crash',
    retirement: true,
    damageDelta: 1,
    timeLossSeconds: 0,
    flagResponse: response,
    flagDurationSeconds: duration,
    sector,
    message: `${driver.code} crashes out in sector ${sector + 1}!`,
  }
}
