import type { Driver } from '../types'
import type { DriverDecision } from './driverDecision'
import { driverSkillBlend } from './driverAbility'

/** Intent requests electrical power; the energy integrator owns every limit. */
export function straightAttackDeployment(input: {
  intent?: DriverDecision['intent']; straightness: number; throttlePercent: number
  brakePercent: number; stateOfCharge: number; skill: number; enabled: boolean
}): number {
  if (!input.enabled || !['attack', 'tow-alignment'].includes(input.intent ?? '') ||
      input.straightness < 0.72 || input.throttlePercent < 70 || input.brakePercent > 5) return 0
  const reserve = Math.max(0, Math.min(1, (input.stateOfCharge - 0.1) / 0.2))
  return (0.72 + Math.max(0, Math.min(1, input.skill / 1.2)) * 0.28) * reserve
}

/** Continuous physical overlap, separate from a cosmetic battle label. */
export type WheelBattleState = { opponentId: string; startedAt: number; conceding: boolean; resolved?: boolean }

export function validWheelBattle(value: unknown, seconds: number): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const state = value as WheelBattleState
  return typeof state.opponentId === 'string' && Number.isFinite(state.startedAt) &&
    state.startedAt >= 0 && state.startedAt <= seconds && typeof state.conceding === 'boolean' &&
    (state.resolved === undefined || typeof state.resolved === 'boolean')
}

const judgement = (driver: Driver) => driverSkillBlend(driver, {
  overtakingSkill: 0.3, brakingSkill: 0.2, racecraft: 0.2,
  tractionControl: 0.15, raceAwareness: 0.15,
})

/** A prolonged overlap ends by a driver's controlled lift, never a position swap. */
export function advanceWheelBattle(input: {
  previous?: WheelBattleState; seconds: number; enabled: boolean
  own: Driver; opponent?: Driver; gapM: number; lateralSeparationM: number
  speedDeltaMps: number
}): WheelBattleState | undefined {
  const { previous, seconds, own, opponent, gapM } = input
  if (!input.enabled || !opponent) return undefined
  const continuing = previous?.opponentId === opponent.id
  if (continuing && (previous.conceding || previous.resolved)) {
    return Math.abs(gapM) < 14 ? previous : undefined
  }
  if (Math.abs(gapM) > 6 || input.lateralSeparationM < 1.6) return undefined
  const state = continuing ? previous : { opponentId: opponent.id, startedAt: seconds, conceding: false }
  if (seconds - state.startedAt < 6) return state
  // A clear physical advantage takes priority over skill. Equal contests use
  // racecraft; the stable identity tie-break ensures both cars agree.
  const ownAdvantage = Math.abs(gapM) > 1.5 ? -gapM :
    Math.abs(input.speedDeltaMps) > 0.7 ? input.speedDeltaMps :
      judgement(own) - judgement(opponent)
  const concedes = Math.abs(ownAdvantage) > 1e-6 ? ownAdvantage < 0 : own.id > opponent.id
  return { ...state, conceding: concedes, resolved: true }
}

export function applyWheelBattleDecision(decision: DriverDecision, state?: WheelBattleState, currentLateralM?: number): DriverDecision {
  if (!state?.conceding || !['attack', 'defend', 'tow-alignment', 'dirty-air-avoidance', 'physical-reference-line'].includes(decision.intent)) return decision
  // Keep the occupied lane while dropping behind; merging is still subject to
  // the physical occupancy model. The normal target line returns after clearance.
  return { ...decision, intent: 'physical-reference-line', role: 'reference',
    desiredLateralOffsetM: currentLateralM ?? decision.desiredLateralOffsetM, throttleOpeningScale: Math.min(decision.throttleOpeningScale, 0.72),
    brakeOnsetDeltaSeconds: Math.max(decision.brakeOnsetDeltaSeconds, 0.06) }
}
