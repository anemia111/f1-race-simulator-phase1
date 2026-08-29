import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import type { Driver, DriverDecisionPath, F1EnergyIntent } from '../types'
import { activeAeroModeFor } from './activeAero'
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
  type DriverCategoryExperience,
  type DriverDecisionRecord,
  type DriverObservation,
  type DriverIdentityModel,
  type F1_2026_DrivingPolicy,
  type SF_2026_DrivingPolicy,
  type SeriesDrivingPolicy,
} from './driverAgentContract'
import {
  f1ElectricalOvertakeIntentFor,
  f1EnergyIntentFor,
  f1ErsModeIntentFor,
  type F1EnergyIntentOptions,
  type F1ErsModeIntentOptions,
} from './driverEnergyIntent'
import {
  sfOtsUseRequestedFor,
  type SfOtsUseRequestOptions,
} from './driverOtsIntent'

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
  experience?: DriverCategoryExperience
  observations?: readonly DriverObservation[]
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

const latestObservation = (
  observations: readonly DriverObservation[],
  scope: DriverObservation['scope'],
  signalId: string,
  subjectId?: string,
) =>
  observations
    .filter(
      (observation) =>
        observation.scope === scope &&
        observation.signalId === signalId &&
        (subjectId === undefined ||
          (observation.scope === 'traffic' &&
            observation.subjectId === subjectId)),
    )
    .sort(
      (left, right) =>
        right.observedAtTick - left.observedAtTick ||
        (left.observationId < right.observationId ? -1 : 1),
    )[0]

const scalarObservationValue = (
  observations: readonly DriverObservation[],
  scope: DriverObservation['scope'],
  signalId: string,
  subjectId?: string,
) => {
  const observation = latestObservation(
    observations,
    scope,
    signalId,
    subjectId,
  )
  return observation?.reading.kind === 'scalar'
    ? observation.reading.value
    : undefined
}

function latestCausalObservations(
  observations: readonly DriverObservation[],
): readonly DriverObservation[] {
  const latestBySignal = new Map<string, DriverObservation>()
  for (const observation of observations) {
    const key = `${observation.scope}/${observation.signalId}/${
      observation.scope === 'traffic' ? observation.subjectId : ''
    }`
    const previous = latestBySignal.get(key)
    if (
      previous === undefined ||
      observation.observedAtTick > previous.observedAtTick ||
      (observation.observedAtTick === previous.observedAtTick &&
        observation.observationId > previous.observationId)
    ) {
      latestBySignal.set(key, observation)
    }
  }
  return [...latestBySignal.values()].sort((left, right) =>
    left.observationId < right.observationId ? -1 : 1,
  )
}

/**
 * Converts the retained causal inbox into the small context consumed by the
 * reviewed low-level controller. Safety and legality remain downstream; this
 * layer only changes what the driver can perceive and request.
 */
function contextFromCausalObservations(
  context: DriverDecisionContext,
  observations: readonly DriverObservation[],
  experience?: DriverCategoryExperience,
): DriverDecisionContext {
  if (observations.length === 0) return context

  const confidence = Math.min(1, Math.max(0, experience?.confidence ?? 0))
  const perceptionWeight = 0.7 + confidence * 0.3
  const blend = (truth: number, observed: number | undefined) =>
    observed === undefined
      ? truth
      : truth * (1 - perceptionWeight) + observed * perceptionWeight
  const observedCurrentOffset = scalarObservationValue(
    observations,
    'self',
    'lateral-offset-m',
  )
  const currentLateralOffsetM = blend(
    context.currentLateralOffsetM,
    observedCurrentOffset,
  )
  const trafficCue = <Cue extends {
    active: boolean
    gapSeconds?: number
    intensity: number
    opponentId: string
    opponentLateralOffsetM: number
  }>(cue: Cue | undefined, maximumGapSeconds: number): Cue | undefined => {
    if (!cue) return cue
    const separation = scalarObservationValue(
      observations,
      'traffic',
      'lateral-separation-m',
      cue.opponentId,
    )
    const observedGap = scalarObservationValue(
      observations,
      'traffic',
      'gap-seconds',
      cue.opponentId,
    )
    const gapSeconds =
      observedGap === undefined
        ? cue.gapSeconds
        : blend(cue.gapSeconds ?? observedGap, observedGap)
    return {
      ...cue,
      active:
        cue.active &&
        (gapSeconds === undefined ||
          gapSeconds <= maximumGapSeconds * 1.1),
      ...(gapSeconds === undefined ? {} : { gapSeconds }),
      intensity:
        gapSeconds === undefined
          ? cue.intensity
          : blend(
              cue.intensity,
              Math.min(
                1,
                Math.max(0, 1 - gapSeconds / maximumGapSeconds),
              ),
            ),
      opponentLateralOffsetM:
        separation === undefined
          ? cue.opponentLateralOffsetM
          : blend(
              cue.opponentLateralOffsetM,
              currentLateralOffsetM + separation,
            ),
    }
  }
  const flag = latestObservation(
    observations,
    'race-control',
    'flag-state',
  )
  const pit = latestObservation(
    observations,
    'team',
    'pit-instruction',
  )
  const observedFlag =
    flag?.scope === 'race-control' &&
    flag.signalId === 'flag-state' &&
    flag.reading.kind === 'state'
      ? flag.reading.value
      : undefined

  return {
    ...context,
    attack: trafficCue(context.attack, 1.8),
    currentLateralOffsetM,
    defend: trafficCue(context.defend, 1.6),
    dirtyAir: trafficCue(context.dirtyAir, 2.5),
    flagState: observedFlag ?? context.flagState,
    physicalReferenceLineOffsetM: blend(
      context.physicalReferenceLineOffsetM,
      scalarObservationValue(
        observations,
        'track',
        'reference-line-offset-m',
      ),
    ),
    pit:
      context.pit && pit?.reading.kind === 'boolean'
        ? { ...context.pit, requested: pit.reading.value }
        : context.pit,
    tow: trafficCue(context.tow, 1.8),
    trackHalfWidthM: blend(
      context.trackHalfWidthM,
      scalarObservationValue(observations, 'track', 'track-half-width-m'),
    ),
    trackProgress: blend(
      context.trackProgress,
      scalarObservationValue(observations, 'self', 'lap-progress'),
    ),
  }
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
    return decideDriverBehavior(
      contextFromCausalObservations(
        input.context,
        input.observations ?? [],
        input.experience,
      ),
    )
  }

  return decideDriverBehavior(input.context)
}

export type F1EnergyIntentPathInput = {
  options: F1EnergyIntentOptions
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

/**
 * Ownership-only Phase 7 adapter for the existing pure F1 energy scheduler.
 * The category path validates the F1 capability boundary; the legacy path is
 * an exact rollback that calls the same scheduler with the same options.
 */
export function f1EnergyIntentForPath(
  input: F1EnergyIntentPathInput,
): F1EnergyIntent {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    const policy = resolveCategoryDrivingPolicy(
      input.seriesId,
      input.vehicleEraId,
    )

    if (
      policy.kind !== 'f1-2026-driving-policy' ||
      policy.capabilities.energyStore !== 'requestable'
    ) {
      throw new Error(
        `F1 energy intent requires an F1 energy-store policy, received ${policy.seriesId}/${policy.vehicleEraId}`,
      )
    }
  }

  return f1EnergyIntentFor(input.options)
}

export type F1ActiveAeroModePathInput = {
  options: Parameters<typeof activeAeroModeFor>[0]
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

/**
 * Ownership-only adapter for the existing pure F1 mode request. The active
 * aero subsystem still owns legality, transitions, failures, and wing state.
 */
export function f1ActiveAeroModeForPath(
  input: F1ActiveAeroModePathInput,
): ReturnType<typeof activeAeroModeFor> {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    const policy = resolveCategoryDrivingPolicy(
      input.seriesId,
      input.vehicleEraId,
    )

    if (
      policy.kind !== 'f1-2026-driving-policy' ||
      policy.capabilities.straightMode !== 'requestable' ||
      policy.capabilities.cornerMode !== 'requestable'
    ) {
      throw new Error(
        `F1 active-aero intent requires an F1 Straight/Corner policy, received ${policy.seriesId}/${policy.vehicleEraId}`,
      )
    }
  }

  return activeAeroModeFor(input.options)
}

export type F1ErsModeIntentPathInput = {
  options: F1ErsModeIntentOptions
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

/** Ownership-only adapter for the existing pure baseline ERS-mode request. */
export function f1ErsModeIntentForPath(
  input: F1ErsModeIntentPathInput,
): ReturnType<typeof f1ErsModeIntentFor> {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    const policy = resolveCategoryDrivingPolicy(
      input.seriesId,
      input.vehicleEraId,
    )

    if (
      policy.kind !== 'f1-2026-driving-policy' ||
      policy.capabilities.energyStore !== 'requestable'
    ) {
      throw new Error(
        `F1 ERS-mode intent requires an F1 energy-store policy, received ${policy.seriesId}/${policy.vehicleEraId}`,
      )
    }
  }

  return f1ErsModeIntentFor(input.options)
}

export type F1ElectricalOvertakeIntentPathInput = {
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

/**
 * Ownership-only adapter for the implicit always-use-when-permitted F1
 * compatibility request. The downstream arbiter retains every outcome gate.
 */
export function f1ElectricalOvertakeIntentForPath(
  input: F1ElectricalOvertakeIntentPathInput,
): ReturnType<typeof f1ElectricalOvertakeIntentFor> {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    const policy = resolveCategoryDrivingPolicy(
      input.seriesId,
      input.vehicleEraId,
    )

    if (
      policy.kind !== 'f1-2026-driving-policy' ||
      policy.capabilities.electricalOvertake !== 'requestable'
    ) {
      throw new Error(
        `F1 Electrical Overtake intent requires an F1 Electrical Overtake policy, received ${policy.seriesId}/${policy.vehicleEraId}`,
      )
    }
  }

  return f1ElectricalOvertakeIntentFor()
}

export type SfOtsUseRequestPathInput = {
  options: SfOtsUseRequestOptions
  path?: DriverDecisionPath
  seriesId?: ExecutableSeriesId
  vehicleEraId?: RuntimeVehicleEraId
}

/**
 * Ownership-only adapter for the existing composite SF OTS use predicate.
 * Event availability, eligibility, status, and power remain downstream.
 */
export function sfOtsUseRequestedForPath(
  input: SfOtsUseRequestPathInput,
): boolean {
  if (resolveDriverDecisionPath(input.path) === 'category-agent-v1') {
    const policy = resolveCategoryDrivingPolicy(
      input.seriesId,
      input.vehicleEraId,
    )

    if (
      policy.kind !== 'sf-2026-driving-policy' ||
      policy.capabilities.otsAttack !== 'requestable' ||
      policy.capabilities.otsDefend !== 'requestable'
    ) {
      throw new Error(
        `SF OTS use intent requires a SUPER FORMULA OTS policy, received ${policy.seriesId}/${policy.vehicleEraId}`,
      )
    }
  }

  return sfOtsUseRequestedFor(input.options)
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

function opponentIdForDecision(
  decision: DriverDecision,
  context: DriverDecisionContext,
): string | undefined {
  switch (decision.intent) {
    case 'attack':
      return context.attack?.opponentId
    case 'defend':
      return context.defend?.opponentId
    case 'dirty-air-avoidance':
      return context.dirtyAir?.opponentId
    case 'tow-alignment':
      return context.tow?.opponentId
    case 'blue-flag-yield':
      return context.yield?.approachingId
    case 'emergency-avoidance':
      return context.emergency?.obstacleId
    case 'controlled-flag':
    case 'pit-entry':
    case 'physical-reference-line':
      return undefined
  }
}

function layeredRequestsFor<Policy extends SeriesDrivingPolicy>(options: {
  decision: DriverDecision
  input: DriverAgentTickInput<Policy>
  requestPrefix: string
  context: DriverDecisionContext
}): readonly DriverAgentRequestFor<Policy>[] {
  const { decision, input, requestPrefix } = options
  const subjectId = opponentIdForDecision(decision, options.context)
  const observationFor = (scope: string, signalId: string) =>
    input.observations.find(
      (observation) =>
        observation.scope === scope && observation.signalId === signalId,
    )?.observationId
  const responseObservationId =
    decision.intent === 'controlled-flag'
      ? observationFor('race-control', 'flag-state')
      : decision.intent === 'pit-entry'
        ? observationFor('team', 'pit-instruction')
        : undefined
  const goal =
    responseObservationId !== undefined
      ? 'respond-to-observation'
      : subjectId !== undefined
        ? 'traffic-relation'
        : 'maintain-plan'
  const steeringDelta =
    decision.desiredLateralOffsetM - options.context.currentLateralOffsetM
  const requests: DriverAgentRequestFor<SeriesDrivingPolicy>[] = [
    {
      channel: 'goal',
      goal,
      ...(responseObservationId === undefined
        ? {}
        : { observationId: responseObservationId }),
      requestId: `${requestPrefix}:goal`,
      ...(subjectId === undefined ? {} : { subjectId }),
    },
    {
      channel: 'intention',
      intention: intentionFor(decision.intent),
      requestId: `${requestPrefix}:intention`,
    },
  ]

  if (decision.role === 'attack' || decision.role === 'defend') {
    requests.push({
      action: 'request',
      channel: 'tactic',
      requestId: `${requestPrefix}:category-battle`,
      ...(subjectId === undefined ? {} : { subjectId }),
      tactic:
        input.policy.kind === 'f1-2026-driving-policy'
          ? decision.role === 'attack'
            ? 'electrical-overtake'
            : 'energy'
          : decision.role === 'attack'
            ? 'ots-attack'
            : 'ots-defend',
    })
  } else if (
    decision.role === 'dirty-air' ||
    decision.role === 'tow' ||
    decision.role === 'yield'
  ) {
    requests.push({
      action: 'request',
      channel: 'tactic',
      requestId: `${requestPrefix}:traffic`,
      ...(subjectId === undefined ? {} : { subjectId }),
      tactic: 'traffic',
    })
  } else if (input.policy.kind === 'f1-2026-driving-policy') {
    requests.push({
      action: 'hold',
      channel: 'tactic',
      requestId: `${requestPrefix}:f1-energy`,
      tactic: 'energy',
    })
  }
  requests.push({
    brake:
      decision.brakePressureScale > 1.015
        ? 'increase'
        : decision.brakePressureScale < 0.985
          ? 'decrease'
          : 'hold',
    channel: 'control',
    requestId: `${requestPrefix}:control`,
    steering:
      steeringDelta < -0.08
        ? 'left'
        : steeringDelta > 0.08
          ? 'right'
          : 'hold',
    throttle:
      decision.throttleOpeningScale > 1.015
        ? 'increase'
        : decision.throttleOpeningScale < 0.985
          ? 'decrease'
          : 'hold',
  })
  if (decision.intent === 'pit-entry') {
    requests.push({
      action: 'request-entry',
      channel: 'pit',
      requestId: `${requestPrefix}:pit`,
    })
  }
  if (decision.intent === 'controlled-flag' && responseObservationId) {
    requests.push({
      action: 'acknowledge-instruction',
      channel: 'fia',
      observationId: responseObservationId,
      requestId: `${requestPrefix}:race-control`,
    })
  }

  return requests as readonly DriverAgentRequestFor<Policy>[]
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

  const causalObservations = latestCausalObservations(
    input.agentInput.observations,
  )
  const operationalAgentInput = {
    ...input.agentInput,
    observations: causalObservations,
  } as DriverAgentTickInput<Policy>
  const decision = decideDriverBehaviorForPath({
    context: input.context,
    experience: input.agentInput.experience,
    observations: causalObservations,
    path: input.path,
    seriesId: input.seriesId,
    vehicleEraId: input.vehicleEraId,
  })
  const candidateId = `legacy-intent:${decision.intent}`
  const decisionId = [
    'driver-decision-v1',
    policy.seriesId,
    input.agentInput.driverId,
    `tick:${input.agentInput.decisionTime.tick}`,
    `window:${decision.absoluteDecisionWindow}`,
    decision.intent,
  ].join(':')
  const requests = layeredRequestsFor({
    context: input.context,
    decision,
    input: operationalAgentInput,
    requestPrefix: decisionId,
  })
  const rawRecord = {
    candidates: [
      {
        candidateId,
        requests,
      },
    ],
    constraints: [],
    decisionId,
    decisionTime: input.agentInput.decisionTime,
    driverId: input.agentInput.driverId,
    observationIds: causalObservations.map(
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
