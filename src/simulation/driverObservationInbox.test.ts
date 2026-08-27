import { describe, expect, it } from 'vitest'
import type { DriverObservation } from './driverAgentContract'
import {
  DRIVER_OBSERVATION_INBOX_POLICY,
  advanceDriverObservationInbox,
  createDriverObservationInbox,
  driverObservationTickAt,
  latestDriverObservation,
  parseDriverObservationInboxState,
} from './driverObservationInbox'

const driverId = 'driver-inbox-test'

function scalarObservation(options: {
  id: string
  scope?: 'self' | 'track' | 'traffic'
  signalId?:
    | 'lap-progress'
    | 'lateral-offset-m'
    | 'reference-line-offset-m'
    | 'gap-seconds'
  tick: number
  value: number
  subjectId?: string
}): DriverObservation {
  const scope = options.scope ?? 'self'
  const signalId = options.signalId ?? 'lap-progress'
  const common = {
    availableAtTick: options.tick,
    driverId,
    observationId: options.id,
    observedAtTick: options.tick,
    provenance: {
      source: 'physics-sensor' as const,
      sourceId: `test/${scope}/${signalId}`,
    },
    reading: {
      kind: 'scalar' as const,
      uncertainty: { kind: 'exact' as const },
      value: options.value,
    },
    scope,
    seriesId: 'f1-custom' as const,
    signalId,
    vehicleEraId: 'f1-2026-current' as const,
  }

  return (scope === 'traffic'
    ? { ...common, subjectId: options.subjectId ?? 'opponent' }
    : common) as DriverObservation
}

function flagObservation(tick: number): DriverObservation {
  return {
    availableAtTick: tick,
    driverId,
    observationId: `flag:${tick}`,
    observedAtTick: tick,
    provenance: {
      source: 'race-control',
      sourceId: 'test/race-control/flag-state',
    },
    reading: {
      kind: 'state',
      uncertainty: { kind: 'exact' },
      value: 'double-yellow',
    },
    scope: 'race-control',
    seriesId: 'f1-custom',
    signalId: 'flag-state',
    vehicleEraId: 'f1-2026-current',
  }
}

const freshInbox = () =>
  createDriverObservationInbox({
    driverId,
    seriesId: 'f1-custom',
    vehicleEraId: 'f1-2026-current',
  })

describe('driver observation inbox', () => {
  it('uses a stable half-second observation cadence', () => {
    expect(driverObservationTickAt(0)).toBe(0)
    expect(driverObservationTickAt(0.499_999_999)).toBe(0)
    expect(driverObservationTickAt(0.5)).toBe(1)
    expect(driverObservationTickAt(1)).toBe(2)
    expect(() => driverObservationTickAt(-0.1)).toThrow(/non-negative/u)
  })

  it('delivers safety instructions immediately while delaying bounded sensors', () => {
    const result = advanceDriverObservationInbox({
      currentTick: 20,
      observations: [
        scalarObservation({ id: 'progress:20', tick: 20, value: 0.4 }),
        flagObservation(20),
      ],
      seed: 'driver-inbox-seed',
      state: freshInbox(),
    })

    expect(result.delivered.map(({ observationId }) => observationId)).toEqual([
      'flag:20',
    ])
    expect(result.state.pending).toHaveLength(1)

    const afterDelay = advanceDriverObservationInbox({
      currentTick: 22,
      seed: 'driver-inbox-seed',
      state: result.state,
    })
    const progress = afterDelay.delivered[0]

    expect(progress.observationId).toBe('progress:20')
    expect(progress.availableAtTick).toBe(22)
    expect(progress.reading).toMatchObject({
      kind: 'scalar',
      uncertainty: { kind: 'bounded-interval' },
    })
    if (
      progress.reading.kind !== 'scalar' ||
      progress.reading.uncertainty.kind !== 'bounded-interval'
    ) {
      throw new Error('Expected a bounded scalar perception')
    }
    expect(progress.reading.value).toBeGreaterThanOrEqual(0)
    expect(progress.reading.value).toBeLessThanOrEqual(1)
    expect(progress.reading.uncertainty.minimum).toBeLessThanOrEqual(0.4)
    expect(progress.reading.uncertainty.maximum).toBeGreaterThanOrEqual(0.4)
  })

  it('is deterministic, input-order independent, and idempotent', () => {
    const observations = [
      scalarObservation({ id: 'zeta', tick: 10, value: 0.2 }),
      scalarObservation({
        id: 'alpha',
        scope: 'track',
        signalId: 'reference-line-offset-m',
        tick: 10,
        value: -0.5,
      }),
    ]
    const run = (ordered: readonly DriverObservation[]) =>
      advanceDriverObservationInbox({
        currentTick: 12,
        observations: ordered,
        seed: 'stable-inbox',
        state: freshInbox(),
      })

    const first = run(observations)
    const reordered = run([...observations].reverse())
    const repeated = advanceDriverObservationInbox({
      currentTick: 12,
      observations,
      seed: 'stable-inbox',
      state: first.state,
    })

    expect(reordered).toEqual(first)
    expect(repeated.delivered).toEqual([])
    expect(repeated.state).toEqual(first.state)
    expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state)
  })

  it('returns only causally available readings and selects the latest signal', () => {
    const first = advanceDriverObservationInbox({
      currentTick: 7,
      observations: [
        scalarObservation({ id: 'old', tick: 5, value: 0.1 }),
        scalarObservation({ id: 'new', tick: 7, value: 0.2 }),
      ],
      seed: 'causal-inbox',
      state: freshInbox(),
    })

    expect(first.delivered.map(({ observationId }) => observationId)).toEqual([
      'old',
    ])
    expect(
      latestDriverObservation({
        currentTick: 7,
        scope: 'self',
        signalId: 'lap-progress',
        state: first.state,
      })?.observationId,
    ).toBe('old')
    expect(
      latestDriverObservation({
        currentTick: 8,
        scope: 'self',
        signalId: 'lap-progress',
        state: first.state,
      })?.observationId,
    ).toBe('old')

    const second = advanceDriverObservationInbox({
      currentTick: 9,
      seed: 'causal-inbox',
      state: first.state,
    })
    expect(
      latestDriverObservation({
        currentTick: 9,
        scope: 'self',
        signalId: 'lap-progress',
        state: second.state,
      })?.observationId,
    ).toBe('new')
  })

  it('expires old readings and enforces finite pending and retained bounds', () => {
    const many = Array.from({ length: 140 }, (_, index) =>
      scalarObservation({
        id: `observation:${index.toString().padStart(3, '0')}`,
        tick: index,
        value: index / 200,
      }),
    )
    const delivered = advanceDriverObservationInbox({
      currentTick: 200,
      observations: many,
      seed: 'bounded-inbox',
      state: freshInbox(),
    })

    expect(delivered.state.retained).toHaveLength(
      DRIVER_OBSERVATION_INBOX_POLICY.maximumRetainedObservations,
    )
    expect(delivered.state.pending).toHaveLength(0)

    const expired = advanceDriverObservationInbox({
      currentTick:
        200 + DRIVER_OBSERVATION_INBOX_POLICY.retentionTicks + 1,
      seed: 'bounded-inbox',
      state: delivered.state,
    })
    expect(expired.state.retained).toHaveLength(0)
  })

  it('rejects future, cross-category, and conflicting observations', () => {
    const future = scalarObservation({
      id: 'future',
      tick: 11,
      value: 0.2,
    })
    const crossCategory = {
      ...scalarObservation({ id: 'cross', tick: 10, value: 0.2 }),
      seriesId: 'super-formula',
      vehicleEraId: 'sf-2026',
    } as DriverObservation

    expect(() =>
      advanceDriverObservationInbox({
        currentTick: 10,
        observations: [future],
        seed: 'reject-inbox',
        state: freshInbox(),
      }),
    ).toThrow(/not causally observable/u)
    expect(() =>
      advanceDriverObservationInbox({
        currentTick: 10,
        observations: [crossCategory],
        seed: 'reject-inbox',
        state: freshInbox(),
      }),
    ).toThrow(/crosses inbox identity or category/u)

    const first = advanceDriverObservationInbox({
      currentTick: 12,
      observations: [
        scalarObservation({ id: 'same-id', tick: 10, value: 0.2 }),
      ],
      seed: 'reject-inbox',
      state: freshInbox(),
    })
    expect(() =>
      advanceDriverObservationInbox({
        currentTick: 12,
        observations: [
          scalarObservation({ id: 'same-id', tick: 10, value: 0.8 }),
        ],
        seed: 'reject-inbox',
        state: first.state,
      }),
    ).toThrow(/reused with different data/u)
  })

  it('rejects malformed persisted state before delivering it', () => {
    const observation = scalarObservation({
      id: 'stored-invalid',
      tick: 10,
      value: 0.2,
    })

    expect(() =>
      advanceDriverObservationInbox({
        currentTick: 12,
        seed: 'reject-stored-inbox',
        state: {
          ...freshInbox(),
          pending: [
            {
              ...observation,
              availableAtTick: 9,
            },
          ],
        },
      }),
    ).toThrow(/violates causality/u)
  })

  it('strictly parses a causal JSON checkpoint state', () => {
    const state = advanceDriverObservationInbox({
      currentTick: 12,
      observations: [
        scalarObservation({ id: 'pending', tick: 12, value: 0.2 }),
        flagObservation(12),
      ],
      seed: 'parse-inbox',
      state: freshInbox(),
    }).state
    const options = {
      currentTick: 12,
      driverId,
      seriesId: 'f1-custom' as const,
      vehicleEraId: 'f1-2026-current' as const,
    }
    const jsonState = JSON.parse(JSON.stringify(state)) as unknown

    expect(parseDriverObservationInboxState(jsonState, options)).toEqual(state)

    const futureRetained = structuredClone(state)
    futureRetained.retained = [futureRetained.pending[0]]
    futureRetained.pending = []
    expect(
      parseDriverObservationInboxState(futureRetained, options),
    ).toBeNull()

    const crossCategory = structuredClone(state) as {
      retained: Array<{ seriesId: string }>
    }
    crossCategory.retained[0].seriesId = 'super-formula'
    expect(parseDriverObservationInboxState(crossCategory, options)).toBeNull()

    const duplicate = structuredClone(state)
    duplicate.retained = [
      duplicate.retained[0],
      duplicate.retained[0],
    ]
    expect(parseDriverObservationInboxState(duplicate, options)).toBeNull()
  })
})
