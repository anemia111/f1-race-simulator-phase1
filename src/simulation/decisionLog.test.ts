import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import { parseStrategyDecisions, settleStrategyDecisions, type StrategyDecision } from './decisionLog'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'

const config = { drivers: initialDrivers, teams: initialTeams, track: tracks[0], seed: 'decision-log' }
const snapshot = { ...createInitialRace(config), elapsedSeconds: 100 }
const car = snapshot.cars[0]
const decision: StrategyDecision = {
  id: 'call', driverId: car.driverId, teamId: car.teamId, elapsedSeconds: 80,
  lap: 3, reason: 'manual', compound: 'H', positionBefore: 2,
  projectedRejoinPosition: 8, estimatedLossSeconds: 23, doubleStackRisk: true,
  outcome: null, interrupted: false,
}

describe('strategy evidence', () => {
  it('waits for physical pit exit, then freezes the first ranked rejoin without mutating earlier state', () => {
    const decisions = [decision]
    expect(settleStrategyDecisions(decisions, [{ ...car, status: 'running', pitPhase: 'exit' }], 90)).toBe(decisions)
    const settled = settleStrategyDecisions(decisions, [{ ...car, status: 'running', pitPhase: 'none', position: 9 }], 100)
    expect(settled[0].outcome).toEqual({ elapsedSeconds: 100, position: 9 })
    expect(decision.outcome).toBeNull()
    expect(settleStrategyDecisions(settled, [{ ...car, position: 4 }], 110)).toBe(settled)
  })

  it('marks an interrupted stop without inventing a rejoin', () => {
    expect(settleStrategyDecisions([decision], [{ ...car, status: 'retired' }], 100)[0]).toMatchObject({ interrupted: true, outcome: null })
  })

  it('round-trips evidence through the actual checkpoint and accepts older snapshots', () => {
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('log', { ...snapshot, strategyDecisions: [decision] }, 1000), 'log', config, 1000)
    expect(restored?.strategyDecisions).toEqual([decision])
    expect(parseRaceCheckpoint(serializeRaceCheckpoint('old', snapshot, 1000), 'old', config, 1000)?.strategyDecisions).toBeUndefined()
  })

  it.each([
    { projectedRejoinPosition: 999 }, { estimatedLossSeconds: -1 }, { reason: '__proto__' },
    { outcome: { elapsedSeconds: 70, position: 4 } }, { driverId: 'unknown' }, { elapsedSeconds: 101 },
  ])('discards corrupt evidence independently of the race: %j', (invalid) => {
    const strategyDecisions = [{ ...decision, ...invalid }]
    expect(parseStrategyDecisions(strategyDecisions, snapshot)).toEqual([])
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('bad', { ...snapshot, strategyDecisions } as typeof snapshot, 1000), 'bad', config, 1000)
    expect(restored).not.toBeNull()
    expect(restored?.strategyDecisions).toEqual([])
  })
})
