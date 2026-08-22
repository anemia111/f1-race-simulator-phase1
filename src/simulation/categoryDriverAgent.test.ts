import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { DriverDecisionPath } from '../types'
import {
  DEFAULT_DRIVER_DECISION_PATH,
  baseDriverIdentityModel,
  decideDriverBehaviorForPath,
  evaluateCategoryDriverAgent,
  resolveCategoryDrivingPolicy,
  resolveDriverDecisionPath,
} from './categoryDriverAgent'
import {
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  type DriverAgentTickInput,
  type DriverObservation,
} from './driverAgentContract'
import {
  decideDriverBehavior,
  type DriverDecisionContext,
  type DriverDecisionIntent,
} from './driverDecision'

const baseDriver = initialDrivers[0]

function contextFor(
  overrides: Partial<DriverDecisionContext> = {},
): DriverDecisionContext {
  return {
    currentLateralOffsetM: 0.2,
    driver: baseDriver,
    flagState: 'clear',
    lap: 7,
    physicalReferenceLineOffsetM: -0.45,
    seed: 'category-driver-agent-test',
    trackHalfWidthM: 6.5,
    trackProgress: 0.42,
    ...overrides,
  }
}

const intentCases: ReadonlyArray<{
  context: DriverDecisionContext
  intent: DriverDecisionIntent
}> = [
  {
    context: contextFor({ flagState: 'vsc' }),
    intent: 'controlled-flag',
  },
  {
    context: contextFor({
      pit: { pitLaneLateralOffsetM: 4.5, requested: true },
    }),
    intent: 'pit-entry',
  },
  {
    context: contextFor({
      emergency: {
        active: true,
        obstacleId: 'stopped-car',
        obstacleLateralOffsetM: 0.1,
        severity: 0.8,
      },
    }),
    intent: 'emergency-avoidance',
  },
  {
    context: contextFor({
      yield: {
        active: true,
        approachingId: 'lapping-car',
        approachingLateralOffsetM: -0.4,
        requiredSeparationM: 2.6,
      },
    }),
    intent: 'blue-flag-yield',
  },
  {
    context: contextFor({
      attack: {
        active: true,
        intensity: 0.75,
        opponentId: 'car-ahead',
        opponentLateralOffsetM: -0.2,
      },
    }),
    intent: 'attack',
  },
  {
    context: contextFor({
      defend: {
        active: true,
        intensity: 0.7,
        opponentId: 'car-behind',
        opponentLateralOffsetM: 0.35,
      },
    }),
    intent: 'defend',
  },
  {
    context: contextFor({
      dirtyAir: {
        active: true,
        intensity: 0.65,
        opponentId: 'wake-car',
        opponentLateralOffsetM: 0.15,
      },
    }),
    intent: 'dirty-air-avoidance',
  },
  {
    context: contextFor({
      tow: {
        active: true,
        intensity: 0.8,
        opponentId: 'tow-car',
        opponentLateralOffsetM: -0.1,
      },
    }),
    intent: 'tow-alignment',
  },
  {
    context: contextFor(),
    intent: 'physical-reference-line',
  },
]

type CategoryCase =
  | {
      seriesId: 'f1-custom'
      vehicleEraId: 'f1-2026-current'
    }
  | {
      seriesId: 'super-formula'
      vehicleEraId: 'sf-2026'
    }

const categoryCases = [
  {
    seriesId: 'f1-custom',
    vehicleEraId: 'f1-2026-current',
  },
  {
    seriesId: 'super-formula',
    vehicleEraId: 'sf-2026',
  },
] as const satisfies readonly CategoryCase[]

type F1AgentInput = DriverAgentTickInput<typeof F1_2026_DRIVING_POLICY>
type SfAgentInput = DriverAgentTickInput<typeof SF_2026_DRIVING_POLICY>

const unavailableGripModel = {
  availability: 'unavailable',
  evidenceObservationIds: [],
  kind: 'grip',
  modelId: null,
  reason: 'No learned category model is available in Phase 7.0.',
  revision: 0,
} as const

function agentInputFor(
  category: CategoryCase,
  context: DriverDecisionContext,
  observationSuffixes: readonly string[] = [],
): DriverAgentTickInput {
  const canonicalSuffixes = [...observationSuffixes].sort()
  const observations = observationSuffixes.map((suffix) => ({
    availableAtTick: 420,
    driverId: context.driver.id,
    observationId: `observation:${context.driver.id}:${suffix}`,
    observedAtTick: 400 + canonicalSuffixes.indexOf(suffix),
    provenance: {
      source: 'physics-sensor' as const,
      sourceId: `test-sensor:${suffix}`,
    },
    scope: 'self' as const,
    seriesId: category.seriesId,
    signalId: `test-signal:${suffix}`,
    uncertainty: 'direct' as const,
    vehicleEraId: category.vehicleEraId,
  })) as DriverObservation[]
  const common = {
    decisionTime: {
      elapsedSeconds: 42,
      tick: 420,
    },
    driverId: context.driver.id,
    identity: baseDriverIdentityModel(context.driver),
    observations,
    seed: context.seed,
  }

  return category.seriesId === 'f1-custom'
    ? {
        ...common,
        experience: {
          confidence: 0,
          driverId: context.driver.id,
          learnedGripModel: unavailableGripModel,
          mileageKm: 0,
          seriesId: 'f1-custom',
          vehicleEraId: 'f1-2026-current',
        },
        observations: observations as Extract<
          DriverAgentTickInput,
          { policy: { seriesId: 'f1-custom' } }
        >['observations'],
        policy: F1_2026_DRIVING_POLICY,
      }
    : {
        ...common,
        experience: {
          confidence: 0,
          driverId: context.driver.id,
          learnedGripModel: unavailableGripModel,
          mileageKm: 0,
          seriesId: 'super-formula',
          vehicleEraId: 'sf-2026',
        },
        observations: observations as Extract<
          DriverAgentTickInput,
          { policy: { seriesId: 'super-formula' } }
        >['observations'],
        policy: SF_2026_DRIVING_POLICY,
      }
}

function evaluateForCategory(
  category: CategoryCase,
  context: DriverDecisionContext,
  observationSuffixes: readonly string[] = [],
) {
  const agentInput = agentInputFor(category, context, observationSuffixes)
  return category.seriesId === 'f1-custom'
    ? evaluateCategoryDriverAgent({
        agentInput: agentInput as F1AgentInput,
        context,
        seriesId: category.seriesId,
        vehicleEraId: category.vehicleEraId,
      })
    : evaluateCategoryDriverAgent({
        agentInput: agentInput as SfAgentInput,
        context,
        seriesId: category.seriesId,
        vehicleEraId: category.vehicleEraId,
      })
}

describe('category driver-agent adapter', () => {
  it('uses the category-agent path by default and retains explicit legacy mode', () => {
    expect(DEFAULT_DRIVER_DECISION_PATH).toBe('category-agent-v1')
    expect(resolveDriverDecisionPath()).toBe('category-agent-v1')
    expect(resolveDriverDecisionPath('legacy-direct')).toBe('legacy-direct')
    expect(() =>
      resolveDriverDecisionPath('future-agent' as DriverDecisionPath),
    ).toThrow(/Unsupported driver decision path future-agent/)
  })

  for (const { seriesId, vehicleEraId } of categoryCases) {
    describe(`${seriesId} parity`, () => {
      for (const testCase of intentCases) {
        it(`preserves the complete ${testCase.intent} decision`, () => {
          const legacy = decideDriverBehavior(testCase.context)
          const adapted = decideDriverBehaviorForPath({
            context: testCase.context,
            path: 'category-agent-v1',
            seriesId,
            vehicleEraId,
          })

          expect(legacy.intent).toBe(testCase.intent)
          expect(adapted).toEqual(legacy)
        })
      }
    })
  }

  it('defaults omitted category identity to the matching F1 policy', () => {
    const context = contextFor({
      attack: {
        active: true,
        intensity: 0.74,
        opponentId: 'default-policy-opponent',
        opponentLateralOffsetM: 0,
      },
    })

    expect(decideDriverBehaviorForPath({ context })).toEqual(
      decideDriverBehavior(context),
    )
  })

  it('rejects cross-series vehicle eras only on the category-agent path', () => {
    const context = contextFor()

    expect(() =>
      decideDriverBehaviorForPath({
        context,
        path: 'category-agent-v1',
        seriesId: 'super-formula',
        vehicleEraId: 'f1-2026-current',
      }),
    ).toThrow(/Unsupported driver policy super-formula\/f1-2026-current/)
    expect(
      decideDriverBehaviorForPath({
        context,
        path: 'legacy-direct',
        seriesId: 'super-formula',
        vehicleEraId: 'f1-2026-current',
      }),
    ).toEqual(decideDriverBehavior(context))
  })

  it('keeps category capabilities isolated behind the policy discriminant', () => {
    const f1 = resolveCategoryDrivingPolicy(
      'f1-custom',
      'f1-2026-current',
    )
    const superFormula = resolveCategoryDrivingPolicy(
      'super-formula',
      'sf-2026',
    )

    expect(f1).toEqual(F1_2026_DRIVING_POLICY)
    expect(f1.capabilities).toEqual({
      cornerMode: 'requestable',
      electricalOvertake: 'requestable',
      energyStore: 'requestable',
      straightMode: 'requestable',
    })
    expect('ots' in f1.capabilities).toBe(false)

    expect(superFormula).toEqual(SF_2026_DRIVING_POLICY)
    expect(superFormula.capabilities).toEqual({
      otsAttack: 'requestable',
      otsDefend: 'requestable',
    })
    expect('energyStore' in superFormula.capabilities).toBe(false)
    expect('straightMode' in superFormula.capabilities).toBe(false)
  })

  it('projects one category-neutral identity base for both policies', () => {
    const f1Identity = baseDriverIdentityModel(baseDriver)
    const superFormulaIdentity = baseDriverIdentityModel(baseDriver)

    expect(f1Identity).toEqual(superFormulaIdentity)
    expect(f1Identity.skills).toEqual(baseDriver.skills)
    expect(f1Identity.style).toEqual(baseDriver.style)
    expect(f1Identity.memory).toEqual({
      decisionIds: [],
      observationIds: [],
    })
    expect(f1Identity).not.toHaveProperty('seriesId')
    expect(f1Identity).not.toHaveProperty('vehicleEraId')
    expect(f1Identity).not.toHaveProperty('teamId')
    expect(f1Identity).not.toHaveProperty('performanceSource')
  })

  it('closes diagnostic evaluation metadata against its category input', () => {
    const context = contextFor()
    const f1Input = agentInputFor(categoryCases[0], context) as F1AgentInput
    const sfInput = agentInputFor(categoryCases[1], context) as SfAgentInput
    const compileOnlyCrossCategoryCalls = () => {
      evaluateCategoryDriverAgent({
        // @ts-expect-error F1 replay input cannot carry SUPER FORMULA metadata.
        agentInput: f1Input,
        context,
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })
      // @ts-expect-error Diagnostic evaluation requires explicit category metadata.
      evaluateCategoryDriverAgent({ agentInput: sfInput, context })
    }

    void compileOnlyCrossCategoryCalls
  })

  it('rejects a diagnostic identity that differs from the decision context', () => {
    const context = contextFor()
    const agentInput = agentInputFor(categoryCases[0], context) as F1AgentInput
    const changedContext = {
      ...context,
      driver: {
        ...context.driver,
        skills: { ...context.driver.skills, rawPace: 0 },
        style: { ...context.driver.style, brakingAggression: 0 },
      },
    }
    let accessorRead = false
    const accessorSkills = { ...agentInput.identity.skills }
    Object.defineProperty(accessorSkills, 'rawPace', {
      enumerable: true,
      get: () => {
        accessorRead = true
        return context.driver.skills.rawPace
      },
    })
    const accessorInput = {
      ...agentInput,
      identity: { ...agentInput.identity, skills: accessorSkills },
    }

    expect(() =>
      evaluateCategoryDriverAgent({
        agentInput,
        context: changedContext,
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      }),
    ).toThrow(/replay ratings do not match its context/)
    expect(() =>
      evaluateCategoryDriverAgent({
        agentInput: accessorInput,
        context,
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      }),
    ).toThrow(/replay ratings do not match its context/)
    expect(accessorRead).toBe(false)
  })

  for (const category of categoryCases) {
    it(`creates a pure deterministic ${category.seriesId} record without changing the decision`, () => {
      const context = contextFor({
        attack: {
          active: true,
          intensity: 0.72,
          opponentId: 'record-opponent',
          opponentLateralOffsetM: -0.25,
        },
      })
      const before = decideDriverBehavior(context)
      const first = evaluateForCategory(category, context, ['zeta', 'alpha'])
      const reordered = evaluateForCategory(category, context, [
        'alpha',
        'zeta',
      ])
      const after = decideDriverBehavior(context)

      expect(first.decision).toEqual(before)
      expect(reordered.decision).toEqual(before)
      expect(after).toEqual(before)
      expect(reordered.record).toEqual(first.record)
      expect(first.record.observationIds).toEqual([
        `observation:${context.driver.id}:alpha`,
        `observation:${context.driver.id}:zeta`,
      ])
      expect(first.record.utilities).toEqual([
        {
          candidateId: 'legacy-intent:attack',
          status: 'legacy-not-evaluated',
          value: null,
        },
      ])
    })
  }

  it('keeps decisions and canonical records invariant to driver traversal order', () => {
    const contexts = [
      contextFor({
        driver: initialDrivers[0],
        seed: 'agent-order-invariance',
        tow: {
          active: true,
          intensity: 0.7,
          opponentId: initialDrivers[1].id,
          opponentLateralOffsetM: -0.2,
        },
      }),
      contextFor({
        defend: {
          active: true,
          intensity: 0.68,
          opponentId: initialDrivers[0].id,
          opponentLateralOffsetM: 0.3,
        },
        driver: initialDrivers[1],
        seed: 'agent-order-invariance',
      }),
    ]
    const category = categoryCases[0]
    const run = (orderedContexts: readonly DriverDecisionContext[]) =>
      orderedContexts
        .map((context) =>
          evaluateForCategory(category, context, ['track', 'traffic']),
        )
        .sort((left, right) =>
          left.record.decisionId.localeCompare(right.record.decisionId),
        )

    expect(run(contexts)).toEqual(run([...contexts].reverse()))
  })
})
