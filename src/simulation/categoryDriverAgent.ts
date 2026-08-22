import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import type { Driver, DriverDecisionPath } from '../types'
import {
  decideDriverBehavior,
  type DriverDecision,
  type DriverDecisionContext,
  type DriverDecisionIntent,
} from './driverDecision'
import {
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  createDriverDecisionRecord,
  seriesDrivingPolicyFor,
  type DriverAgentRequestFor,
  type DriverAgentTickInput,
  type DriverDecisionRecord,
  type DriverIdentityModel,
  type F1_2026_DrivingPolicy,
  type SF_2026_DrivingPolicy,
  type SeriesDrivingPolicy,
} from './driverAgentContract'

export type { DriverDecisionPath } from '../types'

export const DEFAULT_DRIVER_DECISION_PATH: DriverDecisionPath =
  'category-agent-v1'

/**
 * Keeps omitted, pre-Phase-7 configurations on the reviewed category-agent
 * path. The explicit legacy literal remains available for exact A/B replay.
 */
export function resolveDriverDecisionPath(
  path?: DriverDecisionPath,
): DriverDecisionPath {
  if (path === undefined) return DEFAULT_DRIVER_DECISION_PATH
  if (path === 'category-agent-v1' || path === 'legacy-direct') return path
  throw new Error(`Unsupported driver decision path ${String(path)}`)
}

export type DriverDecisionPathInput = {
  context: DriverDecisionContext
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

export function resolveCategoryDrivingPolicy(
  seriesId: ExecutableSeriesId | undefined,
  vehicleEraId: RuntimeVehicleEraId | undefined,
): SeriesDrivingPolicy {
  const resolvedSeriesId = seriesId ?? 'f1-custom'
  const resolvedVehicleEraId =
    vehicleEraId ??
    (resolvedSeriesId === 'f1-custom'
      ? F1_2026_DRIVING_POLICY.vehicleEraId
      : SF_2026_DRIVING_POLICY.vehicleEraId)

  return seriesDrivingPolicyFor(resolvedSeriesId, resolvedVehicleEraId)
}

/**
 * Behavior-neutral Phase 7 adapter. Category identity is resolved and checked,
 * while the reviewed legacy decision remains the sole source of live controls.
 * No decision record is allocated on this race hot path.
 */
export function decideDriverBehaviorForPath(
  input: DriverDecisionPathInput,
): DriverDecision {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    resolveCategoryDrivingPolicy(input.seriesId, input.vehicleEraId)
  }

  return decideDriverBehavior(input.context)
}

/**
 * Builds the immutable category-neutral identity used by the contract without
 * adding a seat, team, series, vehicle, or displayed-overall modifier.
 */
export function baseDriverIdentityModel(driver: Driver): DriverIdentityModel {
  return {
    memory: {
      decisionIds: [],
      observationIds: [],
    },
    skills: { ...driver.skills },
    style: { ...driver.style },
  }
}

function sameOwnScalarValues(left: object, right: object): boolean {
  const leftKeys = Reflect.ownKeys(left)
  const rightKeys = Reflect.ownKeys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    if (typeof key !== 'string') return false
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key)
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key)
    return (
      leftDescriptor !== undefined &&
      rightDescriptor !== undefined &&
      leftDescriptor.enumerable &&
      rightDescriptor.enumerable &&
      Object.prototype.hasOwnProperty.call(leftDescriptor, 'value') &&
      Object.prototype.hasOwnProperty.call(rightDescriptor, 'value') &&
      leftDescriptor.value === rightDescriptor.value
    )
  })
}

function intentionFor(
  intent: DriverDecisionIntent,
): Extract<
  DriverAgentRequestFor<SeriesDrivingPolicy>,
  { channel: 'intention' }
>['intention'] {
  switch (intent) {
    case 'controlled-flag':
      return 'comply-race-control'
    case 'pit-entry':
      return 'prepare-pit-entry'
    case 'emergency-avoidance':
      return 'avoid-hazard'
    case 'attack':
      return 'attack'
    case 'defend':
      return 'defend'
    case 'blue-flag-yield':
      return 'yield'
    case 'dirty-air-avoidance':
    case 'tow-alignment':
    case 'physical-reference-line':
      return 'follow-reference-line'
  }
}

type CategoryDriverAgentEvaluationInput<
  Policy extends SeriesDrivingPolicy,
> = Policy extends SeriesDrivingPolicy
  ? {
      agentInput: DriverAgentTickInput<Policy>
      context: DriverDecisionContext
      path?: DriverDecisionPath
      seriesId: Policy['seriesId']
      vehicleEraId: Policy['vehicleEraId']
    }
  : never

export type CategoryDriverAgentEvaluation<
  Policy extends SeriesDrivingPolicy,
> = {
  decision: DriverDecision
  record: DriverDecisionRecord<Policy>
}

/**
 * Opt-in diagnostic path. Unlike the live adapter, this allocates, validates,
 * and canonicalises a replay record. The legacy policy does not expose
 * alternative-candidate utilities, so the record marks its single observed
 * candidate as explicitly not evaluated instead of inventing a score.
 */
export function evaluateCategoryDriverAgent(
  input: CategoryDriverAgentEvaluationInput<F1_2026_DrivingPolicy>,
): CategoryDriverAgentEvaluation<F1_2026_DrivingPolicy>
export function evaluateCategoryDriverAgent(
  input: CategoryDriverAgentEvaluationInput<SF_2026_DrivingPolicy>,
): CategoryDriverAgentEvaluation<SF_2026_DrivingPolicy>
export function evaluateCategoryDriverAgent<
  Policy extends SeriesDrivingPolicy,
>(
  input: CategoryDriverAgentEvaluationInput<Policy>,
): CategoryDriverAgentEvaluation<Policy> {
  const policy = resolveCategoryDrivingPolicy(
    input.seriesId,
    input.vehicleEraId,
  )

  if (
    input.agentInput.policy.kind !== policy.kind ||
    input.agentInput.policy.seriesId !== policy.seriesId ||
    input.agentInput.policy.vehicleEraId !== policy.vehicleEraId
  ) {
    throw new Error('Driver agent input does not match the resolved policy')
  }
  if (
    input.agentInput.driverId !== input.context.driver.id ||
    input.agentInput.seed !== input.context.seed
  ) {
    throw new Error('Driver agent replay identity does not match its context')
  }
  const contextIdentity = baseDriverIdentityModel(input.context.driver)
  if (
    !sameOwnScalarValues(
      input.agentInput.identity.skills,
      contextIdentity.skills,
    ) ||
    !sameOwnScalarValues(input.agentInput.identity.style, contextIdentity.style)
  ) {
    throw new Error('Driver agent replay ratings do not match its context')
  }

  const decision = decideDriverBehaviorForPath(input)
  const candidateId = `legacy-intent:${decision.intent}`
  const decisionId = [
    'driver-decision-v1',
    policy.seriesId,
    input.agentInput.driverId,
    `tick:${input.agentInput.decisionTime.tick}`,
    `window:${decision.absoluteDecisionWindow}`,
    decision.intent,
  ].join(':')
  const request = {
    channel: 'intention' as const,
    intention: intentionFor(decision.intent),
    requestId: `${decisionId}:intention`,
  } as DriverAgentRequestFor<Policy>
  const rawRecord = {
    candidates: [
      {
        candidateId,
        requests: [request],
      },
    ],
    constraints: [],
    decisionId,
    decisionTime: input.agentInput.decisionTime,
    driverId: input.agentInput.driverId,
    observationIds: input.agentInput.observations.map(
      ({ observationId }) => observationId,
    ),
    policyKind: input.agentInput.policy.kind,
    reason: {
      code: 'deterministic-fallback' as const,
      referenceIds: [candidateId],
    },
    seed: input.agentInput.seed,
    selectedCandidateId: candidateId,
    seriesId: input.agentInput.policy.seriesId,
    utilities: [
      {
        candidateId,
        status: 'legacy-not-evaluated' as const,
        value: null,
      },
    ],
    vehicleEraId: input.agentInput.policy.vehicleEraId,
  } as unknown as DriverDecisionRecord<Policy>
  const record = (
    input.agentInput.policy.kind === 'f1-2026-driving-policy'
      ? createDriverDecisionRecord(
          rawRecord as DriverDecisionRecord<F1_2026_DrivingPolicy>,
          input.agentInput as DriverAgentTickInput<F1_2026_DrivingPolicy>,
        )
      : createDriverDecisionRecord(
          rawRecord as DriverDecisionRecord<SF_2026_DrivingPolicy>,
          input.agentInput as DriverAgentTickInput<SF_2026_DrivingPolicy>,
        )
  ) as DriverDecisionRecord<Policy>

  return { decision, record }
}
