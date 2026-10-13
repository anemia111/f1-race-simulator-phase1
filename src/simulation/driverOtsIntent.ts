import type { BattlePhase, RacePaceMode } from '../types'

export type SfOtsUseRequestOptions = {
  alreadyActive?: boolean
  battlePhase: BattlePhase
  brakePercent: number
  gapToAheadSeconds: number
  isFinalLap: boolean
  paceMode: RacePaceMode
  straightness: number
  throttlePercent: number
  raceBudget?: {
    allocationSeconds: number
    remainingSeconds: number
    cooldownSeconds: number
    remainingRaceSeconds: number
    raceFractionRemaining: number
  }
}

/** Driver preference only: OTS has no circuit activation zone. */
export function sfOtsUseRequestedFor(
  options: SfOtsUseRequestOptions,
): boolean {
  const tacticalUse = (options.gapToAheadSeconds > 0 && options.gapToAheadSeconds < 2.2) ||
    options.battlePhase !== 'single-file' || options.paceMode === 'push' || options.isFinalLap
  const budget = options.raceBudget
  let scheduledUse = false
  if (budget && budget.remainingSeconds > 0 && options.paceMode !== 'save') {
    const fraction = Math.max(0, Math.min(1, budget.raceFractionRemaining))
    const estimatedRaceSeconds = budget.remainingRaceSeconds / Math.max(0.001, fraction)
    // Group planned use into worthwhile bursts separated by the event cooldown.
    // A held burst spends ahead of the pacing target so it cannot chatter on/off.
    const burstSeconds = Math.max(8, Math.min(25,
      budget.allocationSeconds * budget.cooldownSeconds /
      Math.max(1, estimatedRaceSeconds - budget.allocationSeconds)))
    const plannedRemaining = budget.allocationSeconds * fraction
    const trigger = options.alreadyActive ? -burstSeconds : burstSeconds * 0.35
    const behindPlan = budget.remainingSeconds > plannedRemaining + trigger
    // Releasing now could lock the remaining allocation behind the cooldown.
    const useBeforeFinish = budget.remainingRaceSeconds <=
      budget.remainingSeconds + budget.cooldownSeconds + 15
    scheduledUse = behindPlan || useBeforeFinish
  }
  // Releasing on every bend/pedal lift would unnecessarily trigger the long
  // event cooldown. A held tactical use can cross a braking/cornering section;
  // the physical engine still supplies power only through actual throttle/grip.
  return (tacticalUse || scheduledUse) && (options.alreadyActive === true ||
    (options.brakePercent <= 3 && options.throttlePercent >= 55))
}
