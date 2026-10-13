import type { EnergyStoreState, RaceConfig, RechargeRuleDefinition } from '../types'
import { resolveF1RechargeRule } from './regulations'

type RechargeContext = Parameters<typeof resolveF1RechargeRule>[0]

/** Explicit SIM fallback only without event input. Supplied-event unknown or
 * conflicting contexts remain unavailable under the strict official resolver. */
export function simulationRechargeRuleFor(config: Pick<RaceConfig,'freeMode'|'fiaPuEventInput'|'eventId'|'track'>,
  stage: RechargeContext['stage'], context: Pick<RechargeContext,'behindSafetyCar'|'lowGripConditions'|'overtakeAtLapStart'|'timedRunPhase'> = {}): RechargeRuleDefinition {
  const options = {...context,stage,eventId:config.eventId??undefined,eventInput:config.fiaPuEventInput,trackId:config.track.id}
  if(config.freeMode) return resolveF1RechargeRule({...options,allowUnverifiedSessionDefault:true})
  const strict = resolveF1RechargeRule(options)
  if(config.fiaPuEventInput || strict.limit.kind!=='unavailable') return strict
  return {...resolveF1RechargeRule({...options,allowUnverifiedSessionDefault:true}),ruleId:'sim-session-default'}
}

/** Repair the rule without resetting SOC, lap use, temperatures or losses. */
export function repairUnavailableSimRecharge(state: EnergyStoreState, rule: RechargeRuleDefinition): EnergyStoreState {
  if(state.rechargeRule.limit.kind!=='unavailable' || rule.ruleId!=='sim-session-default' || rule.limit.kind!=='finite') return state
  return {...state,rechargeRule:{...rule,usedMJ:state.rechargedAtCuKBusThisLapMJ,
    remainingMJ:Math.max(0,rule.limit.maxCuKBusRechargeMj-state.rechargedAtCuKBusThisLapMJ)}}
}
