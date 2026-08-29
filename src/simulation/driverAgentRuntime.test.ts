import { describe, expect, it } from 'vitest'
import {
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  type DriverDecisionRecord,
} from './driverAgentContract'
import {
  advanceDriverAgentRuntimeState,
  createDriverAgentRuntimeState,
  parseDriverAgentRuntimeState,
} from './driverAgentRuntime'

function recordFor(options: {
  decisionId: string
  driverId: string
  tick: number
}): DriverDecisionRecord {
  const candidateId = `${options.decisionId}:candidate`
  return {
    candidates: [
      {
        candidateId,
        requests: [
          {
            channel: 'intention',
            intention: 'follow-reference-line',
            requestId: `${options.decisionId}:intention`,
          },
        ],
      },
    ],
    constraints: [],
    decisionId: options.decisionId,
    decisionTime: { elapsedSeconds: options.tick / 2, tick: options.tick },
    driverId: options.driverId,
    observationIds: [],
    policyKind: 'f1-2026-driving-policy',
    reason: { code: 'deterministic-fallback', referenceIds: [candidateId] },
    seed: 'runtime-state-test',
    selectedCandidateId: candidateId,
    seriesId: 'f1-custom',
    utilities: [
      { candidateId, status: 'legacy-not-evaluated', value: null },
    ],
    vehicleEraId: 'f1-2026-current',
  }
}

describe('driver agent runtime state', () => {
  it('keeps category experience separate and retains one replay record', () => {
    const initial = createDriverAgentRuntimeState({
      driverId: 'driver-a',
      policy: F1_2026_DRIVING_POLICY,
    })
    const first = advanceDriverAgentRuntimeState({
      mileageKm: 50,
      observations: [],
      record: recordFor({ decisionId: 'decision-1', driverId: 'driver-a', tick: 10 }),
      state: initial,
    })
    const second = advanceDriverAgentRuntimeState({
      mileageKm: 75,
      observations: [],
      record: recordFor({ decisionId: 'decision-2', driverId: 'driver-a', tick: 11 }),
      state: first,
    })

    expect(second.experience.mileageKm).toBe(75)
    expect(second.experience.confidence).toBeGreaterThan(0)
    expect(second.experience).not.toHaveProperty('learnedOtsModel')
    expect(second.recentDecisions.map(({ decisionId }) => decisionId)).toEqual([
      'decision-2',
    ])
    expect(
      parseDriverAgentRuntimeState(structuredClone(second), {
        currentTick: 11,
        driverId: 'driver-a',
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toEqual(second)
  })

  it('rejects future and cross-category persisted decisions', () => {
    const state = advanceDriverAgentRuntimeState({
      mileageKm: 1,
      observations: [],
      record: recordFor({ decisionId: 'future', driverId: 'driver-a', tick: 12 }),
      state: createDriverAgentRuntimeState({
        driverId: 'driver-a',
        policy: F1_2026_DRIVING_POLICY,
      }),
    })

    expect(
      parseDriverAgentRuntimeState(state, {
        currentTick: 11,
        driverId: 'driver-a',
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toBeNull()
    expect(
      parseDriverAgentRuntimeState(state, {
        currentTick: 12,
        driverId: 'driver-a',
        policy: SF_2026_DRIVING_POLICY,
      }),
    ).toBeNull()
  })
})
