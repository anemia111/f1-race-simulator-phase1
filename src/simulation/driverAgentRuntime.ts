import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import {
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  type DriverCategoryExperience,
  type DriverDecisionRecord,
  type DriverObservation,
  type SeriesDrivingPolicy,
} from './driverAgentContract'

export const DRIVER_AGENT_RUNTIME_SCHEMA_VERSION = 1 as const
export const DRIVER_AGENT_MAXIMUM_RETAINED_DECISIONS = 1

export type DriverAgentRuntimeState = {
  readonly schemaVersion: typeof DRIVER_AGENT_RUNTIME_SCHEMA_VERSION
  readonly driverId: string
  readonly seriesId: ExecutableSeriesId
  readonly vehicleEraId: RuntimeVehicleEraId
  readonly experience: DriverCategoryExperience
  readonly recentDecisions: readonly DriverDecisionRecord[]
}

const unavailableModel = <Kind extends 'grip' | 'f1-energy' | 'sf-ots'>(
  kind: Kind,
) => ({
  availability: 'unavailable' as const,
  evidenceObservationIds: [],
  kind,
  modelId: null,
  reason: 'No validated category estimator is configured.',
  revision: 0 as const,
})

export function createDriverAgentRuntimeState(options: {
  driverId: string
  policy: SeriesDrivingPolicy
}): DriverAgentRuntimeState {
  const common = {
    confidence: 0,
    driverId: options.driverId,
    learnedGripModel: unavailableModel('grip'),
    mileageKm: 0,
  }
  const experience: DriverCategoryExperience =
    options.policy.kind === 'f1-2026-driving-policy'
      ? {
          ...common,
          learnedEnergyModel: unavailableModel('f1-energy'),
          seriesId: F1_2026_DRIVING_POLICY.seriesId,
          vehicleEraId: F1_2026_DRIVING_POLICY.vehicleEraId,
        }
      : {
          ...common,
          learnedOtsModel: unavailableModel('sf-ots'),
          seriesId: SF_2026_DRIVING_POLICY.seriesId,
          vehicleEraId: SF_2026_DRIVING_POLICY.vehicleEraId,
        }

  return {
    driverId: options.driverId,
    experience,
    recentDecisions: [],
    schemaVersion: DRIVER_AGENT_RUNTIME_SCHEMA_VERSION,
    seriesId: options.policy.seriesId,
    vehicleEraId: options.policy.vehicleEraId,
  }
}

/** Retains a replayable bounded decision tail and category mileage. */
export function advanceDriverAgentRuntimeState(options: {
  mileageKm: number
  observations: readonly DriverObservation[]
  record: DriverDecisionRecord
  state: DriverAgentRuntimeState
}): DriverAgentRuntimeState {
  const { record, state } = options
  if (
    record.driverId !== state.driverId ||
    record.seriesId !== state.seriesId ||
    record.vehicleEraId !== state.vehicleEraId
  ) {
    throw new Error('Driver decision record crosses runtime identity')
  }
  if (!Number.isFinite(options.mileageKm) || options.mileageKm < 0) {
    throw new Error('Driver category mileage must be finite and non-negative')
  }
  const availableObservationIds = new Set(
    options.observations.map(({ observationId }) => observationId),
  )
  if (
    record.observationIds.some(
      (observationId) => !availableObservationIds.has(observationId),
    )
  ) {
    throw new Error('Driver decision record references an unavailable observation')
  }

  const mileageKm = Math.max(state.experience.mileageKm, options.mileageKm)
  // Confidence is deliberately slow and bounded. It affects perception
  // weighting only; it never mutates the driver's base skills or car output.
  const confidence = Math.min(1, 1 - Math.exp(-mileageKm / 300))
  const experience = {
    ...state.experience,
    confidence,
    mileageKm,
  } as DriverCategoryExperience
  const withoutDuplicate = state.recentDecisions.filter(
    ({ decisionId }) => decisionId !== record.decisionId,
  )
  const recentDecisions = [...withoutDuplicate, structuredClone(record)].slice(
    -DRIVER_AGENT_MAXIMUM_RETAINED_DECISIONS,
  )

  return {
    ...state,
    experience,
    recentDecisions,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value)
  const expected = new Set(keys)
  return actual.length === expected.size && actual.every((key) => expected.has(key))
}

function learnedModelIsValid(
  value: unknown,
  kind: 'grip' | 'f1-energy' | 'sf-ots',
): boolean {
  if (!isRecord(value) || value.kind !== kind) return false
  const available = value.availability === 'available'
  if (
    !exactKeys(
      value,
      available
        ? [
            'availability',
            'kind',
            'modelId',
            'revision',
            'evidenceObservationIds',
          ]
        : [
            'availability',
            'kind',
            'modelId',
            'revision',
            'evidenceObservationIds',
            'reason',
          ],
    ) ||
    !Array.isArray(value.evidenceObservationIds) ||
    !value.evidenceObservationIds.every(
      (observationId) =>
        typeof observationId === 'string' && observationId.length > 0,
    )
  ) {
    return false
  }
  return available
    ? typeof value.modelId === 'string' &&
        value.modelId.length > 0 &&
        Number.isSafeInteger(value.revision) &&
        (value.revision as number) > 0
    : value.availability === 'unavailable' &&
        value.modelId === null &&
        value.revision === 0 &&
        typeof value.reason === 'string' &&
        value.reason.length > 0
}

/** Strict checkpoint boundary for the bounded operational agent state. */
export function parseDriverAgentRuntimeState(
  value: unknown,
  options: {
    currentTick: number
    driverId: string
    policy: SeriesDrivingPolicy
  },
): DriverAgentRuntimeState | null {
  if (
    !Number.isSafeInteger(options.currentTick) ||
    options.currentTick < 0 ||
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'driverId',
      'seriesId',
      'vehicleEraId',
      'experience',
      'recentDecisions',
    ]) ||
    value.schemaVersion !== DRIVER_AGENT_RUNTIME_SCHEMA_VERSION ||
    value.driverId !== options.driverId ||
    value.seriesId !== options.policy.seriesId ||
    value.vehicleEraId !== options.policy.vehicleEraId ||
    !isRecord(value.experience) ||
    !Array.isArray(value.recentDecisions) ||
    value.recentDecisions.length > DRIVER_AGENT_MAXIMUM_RETAINED_DECISIONS
  ) {
    return null
  }
  const experience = value.experience
  const f1 = options.policy.kind === 'f1-2026-driving-policy'
  if (
    !exactKeys(
      experience,
      f1
        ? [
            'confidence',
            'driverId',
            'learnedEnergyModel',
            'learnedGripModel',
            'mileageKm',
            'seriesId',
            'vehicleEraId',
          ]
        : [
            'confidence',
            'driverId',
            'learnedGripModel',
            'learnedOtsModel',
            'mileageKm',
            'seriesId',
            'vehicleEraId',
          ],
    ) ||
    experience.driverId !== options.driverId ||
    experience.seriesId !== options.policy.seriesId ||
    experience.vehicleEraId !== options.policy.vehicleEraId ||
    typeof experience.mileageKm !== 'number' ||
    !Number.isFinite(experience.mileageKm) ||
    experience.mileageKm < 0 ||
    typeof experience.confidence !== 'number' ||
    !Number.isFinite(experience.confidence) ||
    experience.confidence < 0 ||
    experience.confidence > 1 ||
    !learnedModelIsValid(experience.learnedGripModel, 'grip') ||
    !learnedModelIsValid(
      f1 ? experience.learnedEnergyModel : experience.learnedOtsModel,
      f1 ? 'f1-energy' : 'sf-ots',
    )
  ) {
    return null
  }
  for (const candidate of value.recentDecisions) {
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, [
        'candidates',
        'constraints',
        'decisionId',
        'decisionTime',
        'driverId',
        'observationIds',
        'policyKind',
        'reason',
        'seed',
        'selectedCandidateId',
        'seriesId',
        'utilities',
        'vehicleEraId',
      ]) ||
      candidate.driverId !== options.driverId ||
      candidate.seriesId !== options.policy.seriesId ||
      candidate.vehicleEraId !== options.policy.vehicleEraId ||
      typeof candidate.decisionId !== 'string' ||
      candidate.decisionId.length === 0 ||
      candidate.policyKind !== options.policy.kind ||
      typeof candidate.seed !== 'string' ||
      candidate.seed.length === 0 ||
      typeof candidate.selectedCandidateId !== 'string' ||
      candidate.selectedCandidateId.length === 0 ||
      !isRecord(candidate.decisionTime) ||
      !exactKeys(candidate.decisionTime, ['elapsedSeconds', 'tick']) ||
      !Number.isSafeInteger(candidate.decisionTime.tick) ||
      (candidate.decisionTime.tick as number) < 0 ||
      (candidate.decisionTime.tick as number) > options.currentTick ||
      typeof candidate.decisionTime.elapsedSeconds !== 'number' ||
      !Number.isFinite(candidate.decisionTime.elapsedSeconds) ||
      candidate.decisionTime.elapsedSeconds < 0 ||
      !Array.isArray(candidate.observationIds) ||
      !candidate.observationIds.every(
        (observationId) =>
          typeof observationId === 'string' && observationId.length > 0,
      ) ||
      new Set(candidate.observationIds).size !==
        candidate.observationIds.length ||
      !Array.isArray(candidate.candidates) ||
      !Array.isArray(candidate.utilities) ||
      !Array.isArray(candidate.constraints)
    ) {
      return null
    }
  }

  return structuredClone(value) as DriverAgentRuntimeState
}
