import type { CarSnapshot, RaceSnapshot, TireCompound } from '../types'
import type { PitDecision } from './strategy'

export const MAX_STRATEGY_DECISIONS = 240

export type StrategyDecision = {
  id: string
  driverId: string
  teamId: string
  elapsedSeconds: number
  lap: number
  reason: PitDecision['reason'] | 'penalty-service'
  compound: TireCompound
  positionBefore: number
  projectedRejoinPosition: number
  estimatedLossSeconds: number
  doubleStackRisk: boolean
  outcome: { elapsedSeconds: number; position: number } | null
  interrupted: boolean
}

export const decisionReasonLabels: Record<StrategyDecision['reason'], string> = {
  wear: 'Tyre wear', damage: 'Repair damage', 'safety-car': 'Neutralised pit opportunity',
  'compound-rule': 'Required compound change', 'mandatory-stop': 'Mandatory stop',
  weather: 'Track conditions', forecast: 'Weather forecast', undercut: 'Undercut attempt',
  overcut: 'Overcut response', traffic: 'Avoid traffic', 'tire-condition': 'Tyre condition',
  'brake-cooling': 'Cool brakes', manual: 'Manual box instruction',
  'penalty-service': 'Serve procedural penalty',
}

/** Resolve only from the first ranked snapshot after physically leaving the pits. */
export function settleStrategyDecisions(
  decisions: StrategyDecision[], cars: CarSnapshot[], elapsedSeconds: number,
): StrategyDecision[] {
  let changed = false
  const next = decisions.map((decision) => {
    if (decision.outcome || decision.interrupted || elapsedSeconds <= decision.elapsedSeconds) return decision
    const car = cars.find((candidate) => candidate.driverId === decision.driverId)
    if (!car) return decision
    if (car.status === 'running' && car.pitPhase === 'none') {
      changed = true
      return { ...decision, outcome: { elapsedSeconds, position: car.position } }
    }
    if (['retired', 'disqualified', 'finished', 'dns'].includes(car.status)) {
      changed = true
      return { ...decision, interrupted: true }
    }
    return decision
  })
  return changed ? next : decisions
}

/** Optional additive checkpoint data; invalid logs are discarded without losing the race. */
export function parseStrategyDecisions(value: unknown, snapshot: RaceSnapshot): StrategyDecision[] {
  if (!Array.isArray(value) || value.length > MAX_STRATEGY_DECISIONS) return []
  const position = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= snapshot.cars.length
  const time = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= snapshot.elapsedSeconds
  const ids = new Set<string>()
  const valid = value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false
    const d = entry as StrategyDecision
    const car = snapshot.cars.find((candidate) => candidate.driverId === d.driverId)
    if (typeof d.id !== 'string' || d.id.length > 160 || ids.has(d.id)) return false
    ids.add(d.id)
    return car?.runtimeSystems.kind === 'f1' && car.teamId === d.teamId &&
      time(d.elapsedSeconds) && Number.isSafeInteger(d.lap) && d.lap >= 0 && d.lap <= snapshot.raceLaps + 1 &&
      Object.hasOwn(decisionReasonLabels, d.reason) && ['S', 'M', 'H', 'I', 'W'].includes(d.compound) &&
      position(d.positionBefore) && position(d.projectedRejoinPosition) &&
      typeof d.estimatedLossSeconds === 'number' && Number.isFinite(d.estimatedLossSeconds) && d.estimatedLossSeconds >= 0 &&
      typeof d.doubleStackRisk === 'boolean' && typeof d.interrupted === 'boolean' &&
      (d.outcome === null || (typeof d.outcome === 'object' && time(d.outcome.elapsedSeconds) &&
        d.outcome.elapsedSeconds >= d.elapsedSeconds && position(d.outcome.position)))
  })
  return valid ? value.map((d: StrategyDecision) => ({
    id: d.id, driverId: d.driverId, teamId: d.teamId, elapsedSeconds: d.elapsedSeconds,
    lap: d.lap, reason: d.reason, compound: d.compound, positionBefore: d.positionBefore,
    projectedRejoinPosition: d.projectedRejoinPosition, estimatedLossSeconds: d.estimatedLossSeconds,
    doubleStackRisk: d.doubleStackRisk, interrupted: d.interrupted,
    outcome: d.outcome ? { elapsedSeconds: d.outcome.elapsedSeconds, position: d.outcome.position } : null,
  })) : []
}
