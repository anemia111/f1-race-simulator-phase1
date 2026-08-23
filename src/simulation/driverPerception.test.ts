import { describe, expect, expectTypeOf, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { DriverDecisionContext } from './driverDecision'
import {
  baseDriverIdentityModel,
  evaluateCategoryDriverAgent,
} from './categoryDriverAgent'
import {
  DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS,
  DRIVER_OBSERVATION_SCALAR_BOUNDS,
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  type DriverDecisionTime,
  type F1DriverCategoryExperience,
  type F1DriverObservation,
  type SFDriverCategoryExperience,
  type SFDriverObservation,
} from './driverAgentContract'
import { projectImmediateDriverPerception } from './driverPerception'

const driver = initialDrivers[0]
const decisionTime = {
  elapsedSeconds: 91.25,
  tick: 365,
} as const satisfies DriverDecisionTime

function contextFor(
  overrides: Partial<DriverDecisionContext> = {},
): DriverDecisionContext {
  return {
    currentLateralOffsetM: -1.25,
    driver,
    flagState: 'double-yellow',
    lap: 7,
    physicalReferenceLineOffsetM: 0.45,
    pit: {
      pitLaneLateralOffsetM: 5.4,
      requested: true,
    },
    seed: 'phase7-immediate-perception',
    trackHalfWidthM: 6.25,
    trackProgress: 0.375,
    ...overrides,
  }
}

const unavailableGripModel = {
  availability: 'unavailable',
  evidenceObservationIds: [],
  kind: 'grip',
  modelId: null,
  reason: 'No learned grip model is used by the immediate perception test.',
  revision: 0,
} as const

function f1Experience(context: DriverDecisionContext): F1DriverCategoryExperience {
  return {
    confidence: 0,
    driverId: context.driver.id,
    learnedGripModel: unavailableGripModel,
    mileageKm: 0,
    seriesId: 'f1-custom',
    vehicleEraId: 'f1-2026-current',
  }
}

function sfExperience(context: DriverDecisionContext): SFDriverCategoryExperience {
  return {
    confidence: 0,
    driverId: context.driver.id,
    learnedGripModel: unavailableGripModel,
    mileageKm: 0,
    seriesId: 'super-formula',
    vehicleEraId: 'sf-2026',
  }
}

const codeUnitSorted = (values: readonly string[]) =>
  [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )

function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, entry]) => [key, ...deepKeys(entry)])
}

describe('immediate driver perception', () => {
  it('projects the six immediate exact common readings in stable id order', () => {
    const observations = projectImmediateDriverPerception({
      context: contextFor(),
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const readings = Object.fromEntries(
      observations.map((observation) => [
        `${observation.scope}/${observation.signalId}`,
        observation.reading,
      ]),
    )

    expect(observations).toHaveLength(6)
    expect(observations.map(({ observationId }) => observationId)).toEqual(
      codeUnitSorted(observations.map(({ observationId }) => observationId)),
    )
    expect(
      observations.find(
        ({ scope, signalId }) =>
          scope === 'self' && signalId === 'lap-progress',
      )?.observationId,
    ).toBe(
      `driver-observation-v1/f1-custom/f1-2026-current/${encodeURIComponent(driver.id)}/tick%3A365/self/lap-progress`,
    )
    expect(readings).toEqual({
      'race-control/flag-state': {
        kind: 'state',
        uncertainty: { kind: 'exact' },
        value: 'double-yellow',
      },
      'self/lap-progress': {
        kind: 'scalar',
        uncertainty: { kind: 'exact' },
        value: 0.375,
      },
      'self/lateral-offset-m': {
        kind: 'scalar',
        uncertainty: { kind: 'exact' },
        value: -1.25,
      },
      'team/pit-instruction': {
        kind: 'boolean',
        uncertainty: { kind: 'exact' },
        value: true,
      },
      'track/reference-line-offset-m': {
        kind: 'scalar',
        uncertainty: { kind: 'exact' },
        value: 0.45,
      },
      'track/track-half-width-m': {
        kind: 'scalar',
        uncertainty: { kind: 'exact' },
        value: 6.25,
      },
    })
    expect(
      observations.every(
        (observation) =>
          observation.observedAtTick === decisionTime.tick &&
          observation.availableAtTick === decisionTime.tick &&
          observation.observationId.includes(
            encodeURIComponent(`tick:${decisionTime.tick}`),
          ),
      ),
    ).toBe(true)
  })

  it('defaults missing flag and pit cues to clear and no instruction', () => {
    const observations = projectImmediateDriverPerception({
      context: contextFor({ flagState: undefined, pit: undefined }),
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const flag = observations.find(
      ({ scope }) => scope === 'race-control',
    )!.reading
    const pit = observations.find(({ scope }) => scope === 'team')!.reading

    expect(flag).toMatchObject({ kind: 'state', value: 'clear' })
    expect(pit).toMatchObject({ kind: 'boolean', value: false })
  })

  it('is deterministic, input-order independent, JSON-plain, and non-mutating', () => {
    const context = contextFor({
      attack: {
        active: true,
        intensity: 0.91,
        opponentId: 'opponent-a',
        opponentLateralOffsetM: 1.2,
      },
      defend: {
        active: true,
        intensity: 0.77,
        opponentId: 'opponent-b',
        opponentLateralOffsetM: -0.8,
      },
    })
    const reorderedContext: DriverDecisionContext = {
      defend: context.defend,
      attack: context.attack,
      pit: context.pit,
      flagState: context.flagState,
      trackProgress: context.trackProgress,
      trackHalfWidthM: context.trackHalfWidthM,
      physicalReferenceLineOffsetM: context.physicalReferenceLineOffsetM,
      currentLateralOffsetM: context.currentLateralOffsetM,
      lap: context.lap,
      driver: context.driver,
      seed: context.seed,
    }
    const before = structuredClone({
      context,
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })

    const first = projectImmediateDriverPerception({
      context,
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const second = projectImmediateDriverPerception({
      context: reorderedContext,
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })

    expect(first).toEqual(second)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect({ context, decisionTime, policy: F1_2026_DRIVING_POLICY }).toEqual(
      before,
    )
  })

  it('preserves F1/SF category correlation without projecting system values', () => {
    const context = contextFor()
    const f1 = projectImmediateDriverPerception({
      context,
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const sf = projectImmediateDriverPerception({
      context,
      decisionTime,
      policy: SF_2026_DRIVING_POLICY,
    })

    expectTypeOf(f1).toEqualTypeOf<readonly F1DriverObservation[]>()
    expectTypeOf(sf).toEqualTypeOf<readonly SFDriverObservation[]>()
    expect(
      f1.every(
        ({ seriesId, vehicleEraId }) =>
          seriesId === 'f1-custom' && vehicleEraId === 'f1-2026-current',
      ),
    ).toBe(true)
    expect(
      sf.every(
        ({ seriesId, vehicleEraId }) =>
          seriesId === 'super-formula' && vehicleEraId === 'sf-2026',
      ),
    ).toBe(true)
    expect(
      [...f1, ...sf].every(
        ({ scope }) => scope !== 'f1-system' && scope !== 'sf-system',
      ),
    ).toBe(true)
    expect(new Set(f1.map(({ observationId }) => observationId))).not.toEqual(
      new Set(sf.map(({ observationId }) => observationId)),
    )

    const otherDriver = projectImmediateDriverPerception({
      context: contextFor({ driver: initialDrivers[1] }),
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    expect(
      new Set(otherDriver.map(({ observationId }) => observationId)),
    ).not.toEqual(new Set(f1.map(({ observationId }) => observationId)))
  })

  it('feeds both category projections through the diagnostic evaluator and record validator', () => {
    const context = contextFor()
    const f1Observations = projectImmediateDriverPerception({
      context,
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const sfObservations = projectImmediateDriverPerception({
      context,
      decisionTime,
      policy: SF_2026_DRIVING_POLICY,
    })
    const identity = baseDriverIdentityModel(context.driver)
    const f1 = evaluateCategoryDriverAgent({
      agentInput: {
        decisionTime,
        driverId: context.driver.id,
        experience: f1Experience(context),
        identity,
        observations: f1Observations,
        policy: F1_2026_DRIVING_POLICY,
        seed: context.seed,
      },
      context,
      path: 'category-agent-v1',
      seriesId: 'f1-custom',
      vehicleEraId: 'f1-2026-current',
    })
    const sf = evaluateCategoryDriverAgent({
      agentInput: {
        decisionTime,
        driverId: context.driver.id,
        experience: sfExperience(context),
        identity,
        observations: sfObservations,
        policy: SF_2026_DRIVING_POLICY,
        seed: context.seed,
      },
      context,
      path: 'category-agent-v1',
      seriesId: 'super-formula',
      vehicleEraId: 'sf-2026',
    })

    expect(f1.record.observationIds).toEqual(
      f1Observations.map(({ observationId }) => observationId),
    )
    expect(sf.record.observationIds).toEqual(
      sfObservations.map(({ observationId }) => observationId),
    )
  })

  it('does not expose policy-derived cues, category systems, or outcome fields', () => {
    const observations = projectImmediateDriverPerception({
      context: contextFor({
        attack: {
          active: true,
          intensity: 1,
          opponentId: 'forbidden-opponent',
          opponentLateralOffsetM: 1.4,
        },
        dirtyAir: {
          active: true,
          intensity: 0.8,
          opponentId: 'dirty-air-opponent',
          opponentLateralOffsetM: -0.5,
        },
      }),
      decisionTime,
      policy: F1_2026_DRIVING_POLICY,
    })
    const keys = new Set(deepKeys(observations))
    const serialized = JSON.stringify(observations)

    for (const forbidden of DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS) {
      expect(keys.has(forbidden)).toBe(false)
    }
    for (const forbiddenText of [
      'attack',
      'defend',
      'intensity',
      'runtimeSystems',
      'f1-system',
      'sf-system',
      'forbidden-opponent',
      'dirty-air-opponent',
    ]) {
      expect(serialized).not.toContain(forbiddenText)
    }
  })

  it.each([
    ['lap progress', { trackProgress: 1.001 }],
    ['lateral offset', { currentLateralOffsetM: 20.001 }],
    ['reference line', { physicalReferenceLineOffsetM: -20.001 }],
    ['track half width', { trackHalfWidthM: 1.499 }],
    ['non-finite progress', { trackProgress: Number.NaN }],
  ] as const)('fails closed for out-of-domain %s', (_label, overrides) => {
    expect(() =>
      projectImmediateDriverPerception({
        context: contextFor(overrides),
        decisionTime,
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toThrow(/Driver perception/u)
  })

  it('accepts exact sensor bounds without saturation and rejects invalid timing', () => {
    const observations = projectImmediateDriverPerception({
      context: contextFor({
        currentLateralOffsetM: -20,
        physicalReferenceLineOffsetM: 20,
        trackHalfWidthM: 1.5,
        trackProgress: 0,
      }),
      decisionTime,
      policy: SF_2026_DRIVING_POLICY,
    })

    expect(
      observations
        .filter(({ reading }) => reading.kind === 'scalar')
        .map(({ reading }) => (reading.kind === 'scalar' ? reading.value : null)),
    ).toEqual(expect.arrayContaining([-20, 20, 1.5, 0]))
    expect(() =>
      projectImmediateDriverPerception({
        context: contextFor(),
        decisionTime: { elapsedSeconds: 0, tick: -1 },
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toThrow(/tick/u)
  })

  it('rejects forged policy capabilities before projecting observations', () => {
    expect(() =>
      projectImmediateDriverPerception({
        context: contextFor(),
        decisionTime,
        policy: {
          ...F1_2026_DRIVING_POLICY,
          capabilities: {
            ...F1_2026_DRIVING_POLICY.capabilities,
            otsAttack: 'requestable',
          },
        } as unknown as typeof F1_2026_DRIVING_POLICY,
      }),
    ).toThrow(/unsupported field otsAttack/u)
  })

  it('does not invoke accessors in projection inputs', () => {
    let getterCalls = 0
    const context = contextFor()
    Object.defineProperty(context, 'trackProgress', {
      enumerable: true,
      get() {
        getterCalls += 1
        return 0.5
      },
    })

    expect(() =>
      projectImmediateDriverPerception({
        context,
        decisionTime,
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toThrow(/enumerable data properties/u)
    expect(getterCalls).toBe(0)
  })

  it('does not read inherited accessors for optional context fields', () => {
    let getterCalls = 0
    const context = contextFor()
    delete (context as Partial<DriverDecisionContext>).flagState
    Object.defineProperty(Object.prototype, 'flagState', {
      configurable: true,
      get() {
        getterCalls += 1
        return 'red'
      },
    })

    try {
      const observations = projectImmediateDriverPerception({
        context,
        decisionTime,
        policy: F1_2026_DRIVING_POLICY,
      })
      const flag = observations.find(
        ({ scope }) => scope === 'race-control',
      )?.reading

      expect(flag).toMatchObject({ kind: 'state', value: 'clear' })
      expect(getterCalls).toBe(0)
    } finally {
      delete (Object.prototype as { flagState?: unknown }).flagState
    }
  })

  it('keeps exported scalar domains frozen at runtime', () => {
    const bounds = DRIVER_OBSERVATION_SCALAR_BOUNDS['self/lap-progress']

    expect(Object.isFrozen(DRIVER_OBSERVATION_SCALAR_BOUNDS)).toBe(true)
    expect(Object.isFrozen(bounds)).toBe(true)
    expect(() => {
      ;(bounds as unknown as number[])[1] = 2
    }).toThrow(TypeError)
    expect(bounds).toEqual([0, 1])
    expect(() =>
      projectImmediateDriverPerception({
        context: contextFor({ trackProgress: 1.5 }),
        decisionTime,
        policy: F1_2026_DRIVING_POLICY,
      }),
    ).toThrow(/between 0 and 1/u)
  })
})
