import { driverBehaviorTraits } from './driverDecision'
import type { DriverDecisionContext } from './driverDecision'

/** Local team decisions only consume the team's own information. Opponents'
 * hidden fuel, tyre life or future strategy are deliberately outside this API. */
export type TeamCarObservation = {
  id: string; teamId: string; classId: string
  distanceM: number; speedMps: number; running: boolean
  expectedLapSeconds: number | null; tyreLife: number
}
export type TeamInstruction = {
  kind: 'hold-position' | 'let-teammate-through' | 'free-to-fight'
  teammateId: string | null
  reason: 'no-team-battle' | 'protect-team-result' | 'faster-teammate'
}
const free = (): TeamInstruction => ({kind:'free-to-fight',teammateId:null,reason:'no-team-battle'})

/** The team defaults to avoiding unnecessary fighting. It frees its drivers
 * when they are not contesting the same position; a genuinely faster teammate
 * is released rather than trapped behind a permanent order. */
export function decideTeamInstruction(own: TeamCarObservation, teamCars: readonly TeamCarObservation[], lengthM: number): TeamInstruction {
  if (!own.running || lengthM<=0) return free()
  const teammate=teamCars.filter(car=>car.id!==own.id && car.teamId===own.teamId && car.classId===own.classId && car.running)
    .filter(car=>Math.abs(car.distanceM-own.distanceM)<Math.min(lengthM*0.45,Math.max(own.speedMps,car.speedMps,10)*2))
    .sort((a,b)=>Math.abs(a.distanceM-own.distanceM)-Math.abs(b.distanceM-own.distanceM) || a.id.localeCompare(b.id))[0]
  if (!teammate) return free()
  const ahead=own.distanceM>=teammate.distanceM?own:teammate
  const behind=ahead===own?teammate:own
  const paceAdvantage=ahead.expectedLapSeconds!==null && behind.expectedLapSeconds!==null
    ? ahead.expectedLapSeconds-behind.expectedLapSeconds : 0
  // A measured pace advantage or a substantial own-team tyre offset justifies
  // a swap; a transient speed difference in a corner does not.
  const swap=paceAdvantage>0.35 || behind.tyreLife-ahead.tyreLife>0.12
  if (swap && ahead===own) return {kind:'let-teammate-through',teammateId:teammate.id,reason:'faster-teammate'}
  if (swap) return {...free(),teammateId:teammate.id,reason:'faster-teammate'}
  return {kind:'hold-position',teammateId:teammate.id,reason:'protect-team-result'}
}

/** Driver compliance is distinct from the team's preference. The result stays
 * deterministic through a decision window and never changes vehicle ability. */
export function driverAcceptsTeamInstruction(seed: string, driverId: string, window: number, awareness: number, aggression: number) {
  let hash=2166136261
  for (const char of `${seed}:${driverId}:${window}:team`) hash=Math.imul(hash^char.charCodeAt(0),16777619)
  const compliance=Math.min(0.995,Math.max(0.65,0.76+awareness*0.22-aggression*0.06))
  return (hash>>>0)/4294967296<compliance
}

export function delayTeammatePit(input: {
  teammateBusy: boolean; fuelLaps: number; tyreLife: number
  mandatoryStopDue: boolean; weatherEmergency: boolean
}) {
  return input.teammateBusy && input.fuelLaps>2.2 && input.tyreLife>0.18 && !input.mandatoryStopDue && !input.weatherEmergency
}

/** A team message changes a driver's choices, never the car's power or pace. */
export function applyTeamInstruction(context: DriverDecisionContext, instruction: TeamInstruction,
  behind?: { id: string; gapSeconds: number; lateralM: number }): DriverDecisionContext {
  const traits=driverBehaviorTraits(context.driver)
  const accepts=driverAcceptsTeamInstruction(context.seed,context.driver.id,
    Math.floor(context.lap)*12+Math.floor(context.trackProgress*12),traits.awareness,traits.aggression)
  if (!accepts || instruction.kind==='free-to-fight') return context
  const next={...context}
  if (instruction.kind==='hold-position') {
    if (context.attack?.opponentId===instruction.teammateId) next.attack={...context.attack,active:false}
    if (context.defend?.opponentId===instruction.teammateId) next.defend={...context.defend,active:false}
  } else if (!context.yield?.active && behind?.id===instruction.teammateId && behind.gapSeconds<1.5) {
    next.yield={active:true,reason:'team-order',approachingId:behind.id,
      approachingLateralOffsetM:behind.lateralM,requiredSeparationM:2.25,preferredSide:1}
    if (context.defend?.opponentId===instruction.teammateId) next.defend={...context.defend,active:false}
  }
  return next
}
