import type { Driver } from '../types'
import { driverAbilityValue } from './driverAbility'

/** SIM driving plan. Requests change energy use, never hardware limits or gaps. */
export type TowEnergyPlan = {
  opponentId: string
  phase: 'save' | 'attack' | 'escape'
  startedAt: number
  phaseStartedAt: number
  targetSoc: number
}

export function validTowEnergyPlan(value: unknown, seconds: number): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object') return false
  const plan = value as TowEnergyPlan
  return Object.keys(plan).length === 5 && typeof plan.opponentId === 'string' && plan.opponentId.length > 0 &&
    ['save', 'attack', 'escape'].includes(plan.phase) && Number.isFinite(plan.startedAt) &&
    Number.isFinite(plan.phaseStartedAt) && plan.startedAt >= 0 && plan.phaseStartedAt >= plan.startedAt &&
    plan.phaseStartedAt <= seconds && Number.isFinite(plan.targetSoc) && plan.targetSoc >= 0.4 && plan.targetSoc <= 0.8
}

export function advanceTowEnergyPlan(input: {
  previous?: TowEnergyPlan
  driver: Driver
  seconds: number
  enabled: boolean
  isFinalLap: boolean
  stateOfCharge: number
  speedKph: number
  straightness: number
  straightMeters: number
  detectionMeters: number | null
  towDragReduction: number
  sideBySide: boolean
  rearThreat: boolean
  opponent?: { id: string; gapSeconds: number; speedKph: number; braking: boolean }
}): TowEnergyPlan | undefined {
  const { previous, opponent, seconds, stateOfCharge: soc } = input
  if (!input.enabled || !opponent || Math.abs(opponent.gapSeconds) > 2.5) return undefined
  const skill = Math.min(1.2, driverAbilityValue(input.driver, 'ersManagement') * 0.4 +
    driverAbilityValue(input.driver, 'raceAwareness') * 0.3 +
    driverAbilityValue(input.driver, 'racecraft') * 0.2 +
    driverAbilityValue(input.driver, 'overtakingSkill') * 0.1)
  const same = previous?.opponentId === opponent.id
  const change = (phase: TowEnergyPlan['phase']): TowEnergyPlan => ({
    opponentId: opponent.id, phase, startedAt: same ? previous.startedAt : seconds,
    phaseStartedAt: same && previous.phase === phase ? previous.phaseStartedAt : seconds,
    targetSoc: same ? previous.targetSoc : Math.min(0.76, 0.48 + skill * 0.2),
  })
  if (opponent.gapSeconds < 0) {
    // Retain the passed rival, even after the nearest car ahead changes.
    if (!same || previous.phase === 'save' || -opponent.gapSeconds >= 1.15 || soc < 0.14 ||
      seconds - previous.phaseStartedAt > 10) return undefined
    return change('escape')
  }
  if (same && previous.phase === 'escape') return change('attack')
  const closingKph = input.speedKph - opponent.speedKph
  const immediatePass = input.sideBySide || opponent.gapSeconds < 0.18 ||
    (closingKph > 15 && opponent.gapSeconds < 0.65) || opponent.braking
  if (immediatePass || input.isFinalLap || input.rearThreat) return change('attack')
  if (same && previous.phase === 'attack' && soc > 0.18 && seconds - previous.phaseStartedAt < 14) {
    return previous
  }
  // Predict only from observed speed, own battery and known map distances.
  // This preference is deliberately approximate; the force integrator decides success.
  const speedMps = Math.max(20, input.speedKph / 3.6)
  const usableSeconds = Math.min(input.straightMeters / speedMps, Math.max(0, soc - 0.14) * 12)
  const closingMps = Math.max(1, closingKph / 3.6 + 4 + skill * 3)
  const passSeconds = (opponent.gapSeconds * speedMps + 6) / closingMps
  const escapeSeconds = passSeconds + speedMps * 1.15 / closingMps
  const detectionSeconds = input.detectionMeters === null ? Infinity : input.detectionMeters / speedMps
  const canBreakDetection = escapeSeconds < Math.min(usableSeconds, detectionSeconds)
  const opportunity = input.straightness >= 0.8 && input.straightMeters >= 320 && passSeconds < usableSeconds
  const straddlesDetection = passSeconds < detectionSeconds && escapeSeconds >= detectionSeconds && detectionSeconds < 8
  const target = same ? previous.targetSoc : 0.48 + skill * 0.2
  const waited = same ? seconds - previous.startedAt : 0
  if (opportunity && (!straddlesDetection || waited >= 18) && (soc >= target || canBreakDetection || waited >= 18)) return change('attack')
  // Saving remains through intervening corners, using normal braking recovery.
  // Start it only in a real aligned tow; abandon it if the train pulls away.
  if (opponent.gapSeconds > 1.4 || closingKph < -10 || soc >= 0.9) return undefined
  if ((same && previous.phase === 'save') || (input.towDragReduction >= 0.008 && skill >= 0.65)) {
    return change('save')
  }
  return undefined
}

export function towEnergyDeployment(input: {
  plan?: TowEnergyPlan; towDragReduction: number; speedDeficitKph: number
  straightness: number; throttlePercent: number; brakePercent: number; enabled: boolean
}) {
  if (!input.enabled || !input.plan) return { cap: 1, attack: 0 }
  if (input.plan.phase === 'save') {
    // Never drag the car down just to charge: release the cap when tow is lost.
    const cap = input.towDragReduction >= 0.008 && input.speedDeficitKph <= 4
      ? Math.min(0.3, 0.1 + Math.max(0, input.speedDeficitKph) * 0.05) : 1
    return { cap, attack: 0 }
  }
  return { cap: 1, attack: input.straightness >= 0.72 && input.throttlePercent >= 70 && input.brakePercent <= 5 ? 1 : 0 }
}
