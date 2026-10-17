import type {
  DriverSkillProfile,
  DriverStyleProfile,
} from '../types'
import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import {
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_INTERNAL_MIN,
} from './driverAbility'

export type DriverObservationId = string
export type DriverDecisionId = string
export type DriverCandidateId = string

export type DriverIdentityModel = {
  readonly skills: Readonly<DriverSkillProfile>
  readonly style: Readonly<DriverStyleProfile>
  /** Identity memory holds references, never category skill modifiers. */
  readonly memory: {
    readonly observationIds: readonly DriverObservationId[]
    readonly decisionIds: readonly DriverDecisionId[]
  }
}

export type LearnedDriverModelReference<
  Kind extends 'grip' | 'f1-energy' | 'sf-ots',
> =
  | {
      readonly availability: 'unavailable'
      readonly kind: Kind
      readonly modelId: null
      readonly revision: 0
      readonly evidenceObservationIds: readonly DriverObservationId[]
      readonly reason: string
    }
  | {
      readonly availability: 'available'
      readonly kind: Kind
      readonly modelId: string
      readonly revision: number
      readonly evidenceObservationIds: readonly DriverObservationId[]
    }

type DriverCategoryExperienceBase<
  Series extends ExecutableSeriesId,
  Era extends RuntimeVehicleEraId,
> = {
  readonly driverId: string
  readonly seriesId: Series
  readonly vehicleEraId: Era
  readonly mileageKm: number
  readonly confidence: number
  readonly learnedGripModel: LearnedDriverModelReference<'grip'>
}

export type F1DriverCategoryExperience = DriverCategoryExperienceBase<
  'f1-custom',
  'f1-2026-current'
> & {
  readonly learnedEnergyModel?: LearnedDriverModelReference<'f1-energy'>
  readonly learnedOtsModel?: never
}

export type SFDriverCategoryExperience = DriverCategoryExperienceBase<
  'super-formula',
  'sf-2026'
> & {
  readonly learnedEnergyModel?: never
  readonly learnedOtsModel?: LearnedDriverModelReference<'sf-ots'>
}

export type DriverCategoryExperience =
  | F1DriverCategoryExperience
  | SFDriverCategoryExperience

export type F1_2026_DrivingPolicy = {
  readonly kind: 'f1-2026-driving-policy'
  readonly seriesId: 'f1-custom'
  readonly vehicleEraId: 'f1-2026-current'
  readonly capabilities: {
    readonly straightMode: 'requestable'
    readonly cornerMode: 'requestable'
    readonly energyStore: 'requestable'
    readonly electricalOvertake: 'requestable'
    readonly drs?: never
    readonly ots?: never
    readonly otsAttack?: never
    readonly otsDefend?: never
  }
}

export type SF_2026_DrivingPolicy = {
  readonly kind: 'sf-2026-driving-policy'
  readonly seriesId: 'super-formula'
  readonly vehicleEraId: 'sf-2026'
  readonly capabilities: {
    readonly otsAttack: 'requestable'
    readonly otsDefend: 'requestable'
    readonly activeAero?: never
    readonly straightMode?: never
    readonly cornerMode?: never
    readonly energyStore?: never
    readonly ersHarvest?: never
    readonly stateOfCharge?: never
    readonly electricalOvertake?: never
    readonly drs?: never
  }
}

export type SeriesDrivingPolicy =
  | F1_2026_DrivingPolicy
  | SF_2026_DrivingPolicy

export const F1_2026_DRIVING_POLICY = {
  kind: 'f1-2026-driving-policy',
  seriesId: 'f1-custom',
  vehicleEraId: 'f1-2026-current',
  capabilities: {
    straightMode: 'requestable',
    cornerMode: 'requestable',
    energyStore: 'requestable',
    electricalOvertake: 'requestable',
  },
} as const satisfies F1_2026_DrivingPolicy

export const SF_2026_DRIVING_POLICY = {
  kind: 'sf-2026-driving-policy',
  seriesId: 'super-formula',
  vehicleEraId: 'sf-2026',
  capabilities: {
    otsAttack: 'requestable',
    otsDefend: 'requestable',
  },
} as const satisfies SF_2026_DrivingPolicy

export function seriesDrivingPolicyFor(
  seriesId: ExecutableSeriesId,
  vehicleEraId: RuntimeVehicleEraId,
): SeriesDrivingPolicy {
  if (seriesId === 'f1-custom' && vehicleEraId === 'f1-2026-current') {
    return F1_2026_DRIVING_POLICY
  }
  if (seriesId === 'super-formula' && vehicleEraId === 'sf-2026') {
    return SF_2026_DRIVING_POLICY
  }
  throw new Error(`Unsupported driver policy ${seriesId}/${vehicleEraId}`)
}

export type DriverObservationProvenance = {
  readonly source:
    | 'physics-sensor'
    | 'race-control'
    | 'strategy'
    | 'team'
    | 'category-system'
  readonly sourceId: string
}

export type DriverObservationUnavailableReason =
  | 'not-observed'
  | 'sensor-unavailable'
  | 'source-unavailable'

export type DriverObservationExactUncertainty = {
  readonly kind: 'exact'
}

export type DriverObservationBoundedIntervalUncertainty = {
  readonly kind: 'bounded-interval'
  readonly minimum: number
  readonly maximum: number
}

export type DriverObservationConfidenceUncertainty = {
  readonly kind: 'confidence'
  readonly confidence: number
}

export type DriverScalarObservationReading = {
  readonly kind: 'scalar'
  readonly value: number
  readonly uncertainty:
    | DriverObservationExactUncertainty
    | DriverObservationBoundedIntervalUncertainty
}

export type DriverBooleanObservationReading = {
  readonly kind: 'boolean'
  readonly value: boolean
  readonly uncertainty:
    | DriverObservationExactUncertainty
    | DriverObservationConfidenceUncertainty
}

export type DriverStateObservationReading<State extends string> = {
  readonly kind: 'state'
  readonly value: State
  readonly uncertainty:
    | DriverObservationExactUncertainty
    | DriverObservationConfidenceUncertainty
}

export type DriverUnavailableObservationReading = {
  readonly kind: 'unavailable'
  readonly reason: DriverObservationUnavailableReason
}

type ScalarOrUnavailableReading =
  | DriverScalarObservationReading
  | DriverUnavailableObservationReading

type BooleanOrUnavailableReading =
  | DriverBooleanObservationReading
  | DriverUnavailableObservationReading

type StateOrUnavailableReading<State extends string> =
  | DriverStateObservationReading<State>
  | DriverUnavailableObservationReading

export type DriverRaceControlFlagState =
  | 'clear'
  | 'yellow'
  | 'double-yellow'
  | 'vsc'
  | 'sc'
  | 'red'

export type DriverElectricalOvertakeState =
  | 'disabled'
  | 'available'
  | 'active'

export type DriverSfOtsState =
  | 'disabled'
  | 'available'
  | 'active'

type ObservationEnvelope<
  Series extends ExecutableSeriesId,
  Era extends RuntimeVehicleEraId,
  Scope extends string,
  Signal extends string,
  Reading,
> = {
  readonly observationId: DriverObservationId
  readonly driverId: string
  readonly seriesId: Series
  readonly vehicleEraId: Era
  readonly scope: Scope
  readonly signalId: Signal
  readonly subjectId?: never
  readonly observedAtTick: number
  readonly availableAtTick: number
  readonly provenance: DriverObservationProvenance
  /** A bounded perception, never a writable physical outcome. */
  readonly reading: Reading
}

type TrafficObservationEnvelope<
  Series extends ExecutableSeriesId,
  Era extends RuntimeVehicleEraId,
  Signal extends string,
  Reading,
> = Omit<
  ObservationEnvelope<Series, Era, 'traffic', Signal, Reading>,
  'subjectId'
> & {
  readonly subjectId: string
}

type CommonDriverObservation<
  Series extends ExecutableSeriesId,
  Era extends RuntimeVehicleEraId,
> =
  | ObservationEnvelope<
      Series,
      Era,
      'self',
      'lap-progress' | 'lateral-offset-m',
      ScalarOrUnavailableReading
    >
  | ObservationEnvelope<
      Series,
      Era,
      'track',
      'reference-line-offset-m' | 'track-half-width-m',
      ScalarOrUnavailableReading
    >
  | TrafficObservationEnvelope<
      Series,
      Era,
      'gap-seconds' | 'lateral-separation-m',
      ScalarOrUnavailableReading
    >
  | ObservationEnvelope<
      Series,
      Era,
      'race-control',
      'flag-state',
      StateOrUnavailableReading<DriverRaceControlFlagState>
    >
  | ObservationEnvelope<
      Series,
      Era,
      'team',
      'pit-instruction',
      BooleanOrUnavailableReading
    >

export type F1DriverObservation =
  | CommonDriverObservation<'f1-custom', 'f1-2026-current'>
  | ObservationEnvelope<
      'f1-custom',
      'f1-2026-current',
      'f1-system',
      'straight-mode' | 'corner-mode',
      BooleanOrUnavailableReading
    >
  | ObservationEnvelope<
      'f1-custom',
      'f1-2026-current',
      'f1-system',
      'energy-store',
      ScalarOrUnavailableReading
    >
  | ObservationEnvelope<
      'f1-custom',
      'f1-2026-current',
      'f1-system',
      'electrical-overtake',
      StateOrUnavailableReading<DriverElectricalOvertakeState>
    >

export type SFDriverObservation =
  | CommonDriverObservation<'super-formula', 'sf-2026'>
  | ObservationEnvelope<
      'super-formula',
      'sf-2026',
      'sf-system',
      'ots',
      StateOrUnavailableReading<DriverSfOtsState>
    >

export type DriverObservation = F1DriverObservation | SFDriverObservation

export type DriverObservationFor<P extends SeriesDrivingPolicy> =
  P extends F1_2026_DrivingPolicy
    ? F1DriverObservation
    : SFDriverObservation

export type DriverCategoryExperienceFor<P extends SeriesDrivingPolicy> =
  P extends F1_2026_DrivingPolicy
    ? F1DriverCategoryExperience
    : SFDriverCategoryExperience

export type DriverIntentionRequest = {
  readonly channel: 'intention'
  readonly requestId: string
  readonly intention:
    | 'comply-race-control'
    | 'follow-reference-line'
    | 'attack'
    | 'defend'
    | 'yield'
    | 'avoid-hazard'
    | 'prepare-pit-entry'
}

export type DriverGoalRequest = {
  readonly channel: 'goal'
  readonly requestId: string
  readonly goal: 'maintain-plan' | 'respond-to-observation' | 'traffic-relation'
  readonly observationId?: DriverObservationId
  readonly subjectId?: string
}

export type DriverControlRequest = {
  readonly channel: 'control'
  readonly requestId: string
  readonly throttle: 'increase' | 'hold' | 'decrease'
  readonly brake: 'increase' | 'hold' | 'decrease'
  readonly steering: 'left' | 'hold' | 'right'
}

export type DriverTacticRequestFor<P extends SeriesDrivingPolicy> = {
  readonly channel: 'tactic'
  readonly requestId: string
  readonly action: 'request' | 'hold' | 'release'
  readonly subjectId?: string
  readonly tactic: P extends F1_2026_DrivingPolicy
    ?
        | 'traffic'
        | 'straight-mode'
        | 'corner-mode'
        | 'energy'
        | 'electrical-overtake'
    : 'traffic' | 'ots-attack' | 'ots-defend'
}

export type DriverPitRequest = {
  readonly channel: 'pit'
  readonly requestId: string
  readonly action: 'request-entry' | 'cancel-entry' | 'stay-out'
}

export type DriverFiaRequest = {
  readonly channel: 'fia'
  readonly requestId: string
  readonly action:
    | 'acknowledge-instruction'
    | 'report-hazard'
    | 'request-review'
  readonly observationId: DriverObservationId
}

export type DriverAgentRequestFor<P extends SeriesDrivingPolicy> =
  | DriverIntentionRequest
  | DriverGoalRequest
  | DriverControlRequest
  | DriverTacticRequestFor<P>
  | DriverPitRequest
  | DriverFiaRequest

export type DriverDecisionTime = {
  readonly tick: number
  readonly elapsedSeconds: number
}

export type DriverAgentTickInput<
  P extends SeriesDrivingPolicy = SeriesDrivingPolicy,
> = P extends SeriesDrivingPolicy
  ? {
      readonly driverId: string
      readonly identity: DriverIdentityModel
      readonly experience: DriverCategoryExperienceFor<P>
      readonly policy: P
      readonly observations: readonly DriverObservationFor<P>[]
      readonly decisionTime: DriverDecisionTime
      readonly seed: string
    }
  : never

export type DriverDecisionCandidate<Request> = {
  readonly candidateId: DriverCandidateId
  readonly requests: readonly Request[]
}

export type DriverCandidateUtility =
  | {
      readonly candidateId: DriverCandidateId
      readonly status: 'evaluated'
      readonly value: number
    }
  | {
      readonly candidateId: DriverCandidateId
      readonly status: 'legacy-not-evaluated'
      readonly value: null
    }

export type DriverDecisionConstraint = {
  readonly constraintId: string
  /** Null applies the constraint to every candidate. */
  readonly candidateId: DriverCandidateId | null
  readonly status: 'satisfied' | 'blocked'
  readonly reasonCode: string
  readonly observationIds: readonly DriverObservationId[]
}

type DriverDecisionRecordForPolicy<P extends SeriesDrivingPolicy> = {
  readonly decisionId: DriverDecisionId
  readonly driverId: string
  readonly seriesId: P['seriesId']
  readonly vehicleEraId: P['vehicleEraId']
  readonly policyKind: P['kind']
  readonly decisionTime: DriverDecisionTime
  readonly observationIds: readonly DriverObservationId[]
  readonly candidates: readonly DriverDecisionCandidate<
    DriverAgentRequestFor<P>
  >[]
  readonly utilities: readonly DriverCandidateUtility[]
  readonly constraints: readonly DriverDecisionConstraint[]
  readonly selectedCandidateId: DriverCandidateId
  readonly reason: {
    readonly code:
      | 'highest-utility-feasible'
      | 'mandatory-constraint'
      | 'deterministic-tie-break'
      | 'deterministic-fallback'
    readonly referenceIds: readonly string[]
  }
  readonly seed: string
}

export type DriverDecisionRecord<
  P extends SeriesDrivingPolicy = SeriesDrivingPolicy,
> = P extends SeriesDrivingPolicy ? DriverDecisionRecordForPolicy<P> : never

export const DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS = [
  'speed', 'speedKph', 'rank', 'position', 'lapTime', 'lapTimeSeconds',
  'grip', 'trackGrip', 'power', 'powerKw', 'damage', 'passOutcome',
  'overtakeOutcome',
] as const

const forbiddenFields = new Set<string>(
  DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS,
)

export const DRIVER_OBSERVATION_SCALAR_BOUNDS = Object.freeze({
  'self/lap-progress': Object.freeze([0, 1] as const),
  'self/lateral-offset-m': Object.freeze([-20, 20] as const),
  'track/reference-line-offset-m': Object.freeze([-20, 20] as const),
  'track/track-half-width-m': Object.freeze([1.5, 20] as const),
  'traffic/gap-seconds': Object.freeze([0, 28] as const),
  'traffic/lateral-separation-m': Object.freeze([-40, 40] as const),
  'f1-system/energy-store': Object.freeze([0, 1] as const),
} satisfies Readonly<Record<string, readonly [number, number]>>)

const DRIVER_OBSERVATION_UNAVAILABLE_REASONS = [
  'not-observed',
  'sensor-unavailable',
  'source-unavailable',
] as const satisfies readonly DriverObservationUnavailableReason[]

const DRIVER_RACE_CONTROL_FLAG_STATES = [
  'clear',
  'yellow',
  'double-yellow',
  'vsc',
  'sc',
  'red',
] as const satisfies readonly DriverRaceControlFlagState[]

const DRIVER_ELECTRICAL_OVERTAKE_STATES = [
  'disabled',
  'available',
  'active',
] as const satisfies readonly DriverElectricalOvertakeState[]

const DRIVER_SF_OTS_STATES = [
  'disabled',
  'available',
  'active',
] as const satisfies readonly DriverSfOtsState[]

const DRIVER_SKILL_BOUNDS = {
  adaptability: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  brakingSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  carBalanceAdaptation: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  confidence: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  consistency: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  defendingSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  dirtyAirManagement: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  ersManagement: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  fuelManagement: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  highSpeedCornerSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  intermediateSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  lowSpeedCornerSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  mediumSpeedCornerSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  mistakeResistance: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  overtakingSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  precision: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  pressureHandling: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  qualifyingPace: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  raceAwareness: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  racePace: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  racecraft: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  rawPace: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  restartSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  startSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  throttleControl: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  tireManagement: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  tireWarmupSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  tractionControl: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  trafficManagement: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
  wetSkill: [DRIVER_ABILITY_INTERNAL_MIN, DRIVER_ABILITY_INTERNAL_MAX],
} as const satisfies Readonly<
  Record<keyof DriverSkillProfile, readonly [number, number]>
>
const DRIVER_STYLE_BOUNDS = {
  brakingAggression: [0, 1],
  cornerShapePreference: [-1, 1],
  frontEndPreference: [-1, 1],
  oversteerTolerance: [0, 1],
  rearStabilityNeed: [-1, 1],
  understeerTolerance: [0, 1],
} as const satisfies Readonly<
  Record<keyof DriverStyleProfile, readonly [number, number]>
>
const stableCompare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0
const sorted = <Value extends string>(values: readonly Value[]) =>
  [...values].sort(stableCompare)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function requireOneOf<const Value extends string>(
  value: unknown,
  label: string,
  allowed: readonly Value[],
): asserts value is Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    throw new Error(`${label} is not supported`)
  }
}

function requireExactKeys(
  value: unknown,
  label: string,
  allowed: readonly string[],
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  const allowedKeys = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains unsupported field ${key}`)
    }
  }
}

function requireExactRequiredKeys(
  value: unknown,
  label: string,
  required: readonly string[],
): asserts value is Record<string, unknown> {
  requireExactKeys(value, label, required)
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`${label} is missing required field ${key}`)
    }
  }
}

function validateBoundedNumericRecord(
  value: unknown,
  label: string,
  bounds: Readonly<Record<string, readonly [number, number]>>,
) {
  const keys = Object.keys(bounds)
  requireExactRequiredKeys(value, label, keys)
  for (const key of keys) {
    const [minimum, maximum] = bounds[key]
    const entry = value[key]
    if (
      !Number.isFinite(entry) ||
      (entry as number) < minimum ||
      (entry as number) > maximum
    ) {
      throw new Error(
        `${label}.${key} must be finite and between ${minimum} and ${maximum}`,
      )
    }
  }
}

function requireTick(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
}

function requireUniqueIds(values: readonly string[], label: string) {
  const ids = new Set<string>()
  for (const value of values) {
    requireString(value, label)
    if (ids.has(value)) throw new Error(`${label} contains duplicate ${value}`)
    ids.add(value)
  }
  return ids
}

function validateUnavailableObservationReading(
  value: Record<string, unknown>,
  label: string,
) {
  requireExactRequiredKeys(value, label, ['kind', 'reason'])
  requireOneOf(
    value.reason,
    `${label} reason`,
    DRIVER_OBSERVATION_UNAVAILABLE_REASONS,
  )
}

function validateExactUncertainty(value: unknown, label: string) {
  requireExactRequiredKeys(value, label, ['kind'])
  if (value.kind !== 'exact') {
    throw new Error(`${label} kind must be exact`)
  }
}

function validateScalarObservationReading(
  value: unknown,
  label: string,
  bounds: readonly [number, number],
) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (value.kind === 'unavailable') {
    validateUnavailableObservationReading(value, label)
    return
  }
  requireExactRequiredKeys(value, label, ['kind', 'value', 'uncertainty'])
  if (value.kind !== 'scalar') {
    throw new Error(`${label} kind must be scalar or unavailable`)
  }
  const [minimum, maximum] = bounds
  if (
    !Number.isFinite(value.value) ||
    (value.value as number) < minimum ||
    (value.value as number) > maximum
  ) {
    throw new Error(
      `${label} value must be finite and between ${minimum} and ${maximum}`,
    )
  }
  if (!isRecord(value.uncertainty)) {
    throw new Error(`${label} uncertainty must be an object`)
  }
  if (value.uncertainty.kind === 'exact') {
    validateExactUncertainty(value.uncertainty, `${label} uncertainty`)
    return
  }
  requireExactRequiredKeys(value.uncertainty, `${label} uncertainty`, [
    'kind',
    'minimum',
    'maximum',
  ])
  if (value.uncertainty.kind !== 'bounded-interval') {
    throw new Error(
      `${label} uncertainty kind must be exact or bounded-interval`,
    )
  }
  const intervalMinimum = value.uncertainty.minimum
  const intervalMaximum = value.uncertainty.maximum
  if (
    !Number.isFinite(intervalMinimum) ||
    !Number.isFinite(intervalMaximum) ||
    (intervalMinimum as number) < minimum ||
    (intervalMaximum as number) > maximum ||
    (intervalMinimum as number) > (value.value as number) ||
    (intervalMaximum as number) < (value.value as number)
  ) {
    throw new Error(
      `${label} bounded interval must be finite, enclose its value, and remain between ${minimum} and ${maximum}`,
    )
  }
}

function validateCategoricalObservationUncertainty(
  value: unknown,
  label: string,
) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (value.kind === 'exact') {
    validateExactUncertainty(value, label)
    return
  }
  requireExactRequiredKeys(value, label, ['kind', 'confidence'])
  if (value.kind !== 'confidence') {
    throw new Error(`${label} kind must be exact or confidence`)
  }
  if (
    !Number.isFinite(value.confidence) ||
    (value.confidence as number) < 0 ||
    (value.confidence as number) > 1
  ) {
    throw new Error(`${label} confidence must be finite and between 0 and 1`)
  }
}

function validateBooleanObservationReading(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (value.kind === 'unavailable') {
    validateUnavailableObservationReading(value, label)
    return
  }
  requireExactRequiredKeys(value, label, ['kind', 'value', 'uncertainty'])
  if (value.kind !== 'boolean' || typeof value.value !== 'boolean') {
    throw new Error(`${label} must contain a boolean value or be unavailable`)
  }
  validateCategoricalObservationUncertainty(
    value.uncertainty,
    `${label} uncertainty`,
  )
}

function validateStateObservationReading<const State extends string>(
  value: unknown,
  label: string,
  allowedStates: readonly State[],
) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (value.kind === 'unavailable') {
    validateUnavailableObservationReading(value, label)
    return
  }
  requireExactRequiredKeys(value, label, ['kind', 'value', 'uncertainty'])
  if (value.kind !== 'state') {
    throw new Error(`${label} kind must be state or unavailable`)
  }
  requireOneOf(value.value, `${label} value`, allowedStates)
  validateCategoricalObservationUncertainty(
    value.uncertainty,
    `${label} uncertainty`,
  )
}

function assertSerializable(
  value: unknown,
  label: string,
  ancestors = new WeakSet<object>(),
) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
    return
  }
  if (typeof value !== 'object') {
    throw new Error(`${label} must contain only JSON values`)
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`${label} must contain only plain JSON objects`)
  }
  if (ancestors.has(value)) throw new Error(`${label} must not contain a cycle`)
  ancestors.add(value)
  const array = Array.isArray(value)
  if (array) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new Error(`${label} must not contain sparse array entries`)
      }
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue
    if (typeof key !== 'string') {
      throw new Error(`${label} must use string property keys`)
    }
    if (array) {
      const index = Number(key)
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        String(index) !== key ||
        index >= value.length
      ) {
        throw new Error(`${label} arrays cannot contain named properties`)
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label} must use enumerable data properties`)
    }
    assertSerializable(descriptor.value, `${label}.${key}`, ancestors)
  }
  ancestors.delete(value)
}

function assertNoOutcomeFields(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(assertNoOutcomeFields)
  } else if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenFields.has(key)) {
        throw new Error(`driver request cannot write outcome field ${key}`)
      }
      assertNoOutcomeFields(entry)
    }
  }
}

function validateLearnedModelReference(
  value: unknown,
  expectedKind: 'grip' | 'f1-energy' | 'sf-ots',
  label: string,
) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireOneOf(value.availability, `${label} availability`, [
    'available',
    'unavailable',
  ])
  requireExactKeys(
    value,
    label,
    value.availability === 'available'
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
  )
  if (value.kind !== expectedKind) {
    throw new Error(`${label} has the wrong model kind`)
  }
  if (!Array.isArray(value.evidenceObservationIds)) {
    throw new Error(`${label} evidence ids must be an array`)
  }
  requireUniqueIds(value.evidenceObservationIds, `${label} evidence ids`)
  if (value.availability === 'available') {
    requireString(value.modelId, `${label} model id`)
    requireTick(value.revision, `${label} revision`)
  } else {
    if (value.modelId !== null || value.revision !== 0) {
      throw new Error(`${label} unavailable state must use a null model at revision zero`)
    }
    requireString(value.reason, `${label} unavailable reason`)
  }
}

function validatePolicy(value: unknown): 'f1' | 'super-formula' {
  requireExactRequiredKeys(value, 'driver policy', [
    'kind',
    'seriesId',
    'vehicleEraId',
    'capabilities',
  ])
  if (value.kind === 'f1-2026-driving-policy') {
    if (
      value.seriesId !== 'f1-custom' ||
      value.vehicleEraId !== 'f1-2026-current'
    ) {
      throw new Error('F1 driver policy has the wrong series or vehicle era')
    }
    requireExactRequiredKeys(value.capabilities, 'F1 driver capabilities', [
      'cornerMode',
      'electricalOvertake',
      'energyStore',
      'straightMode',
    ])
    for (const capability of Object.values(value.capabilities)) {
      if (capability !== 'requestable') {
        throw new Error('F1 driver capability must be requestable')
      }
    }
    return 'f1'
  }
  if (value.kind === 'sf-2026-driving-policy') {
    if (
      value.seriesId !== 'super-formula' ||
      value.vehicleEraId !== 'sf-2026'
    ) {
      throw new Error(
        'SUPER FORMULA driver policy has the wrong series or vehicle era',
      )
    }
    requireExactRequiredKeys(
      value.capabilities,
      'SUPER FORMULA driver capabilities',
      ['otsAttack', 'otsDefend'],
    )
    for (const capability of Object.values(value.capabilities)) {
      if (capability !== 'requestable') {
        throw new Error('SUPER FORMULA driver capability must be requestable')
      }
    }
    return 'super-formula'
  }
  throw new Error('driver policy kind is not supported')
}

/** Validates a policy before a diagnostic producer reads any of its fields. */
export function validateSeriesDrivingPolicy(
  value: unknown,
): asserts value is SeriesDrivingPolicy {
  assertSerializable(value, 'driver policy')
  validatePolicy(value)
}

function validateCategoryExperience(
  value: unknown,
  category: 'f1' | 'super-formula',
  driverId: string,
) {
  const f1 = category === 'f1'
  requireExactKeys(
    value,
    'driver category experience',
    f1
      ? [
          'driverId',
          'seriesId',
          'vehicleEraId',
          'mileageKm',
          'confidence',
          'learnedGripModel',
          'learnedEnergyModel',
        ]
      : [
          'driverId',
          'seriesId',
          'vehicleEraId',
          'mileageKm',
          'confidence',
          'learnedGripModel',
          'learnedOtsModel',
        ],
  )
  if (
    value.driverId !== driverId ||
    value.seriesId !== (f1 ? 'f1-custom' : 'super-formula') ||
    value.vehicleEraId !== (f1 ? 'f1-2026-current' : 'sf-2026')
  ) {
    throw new Error('driver policy and category experience cross category')
  }
  if (
    !Number.isFinite(value.mileageKm) ||
    (value.mileageKm as number) < 0 ||
    !Number.isFinite(value.confidence) ||
    (value.confidence as number) < 0 ||
    (value.confidence as number) > 1
  ) {
    throw new Error('driver category experience must be finite and bounded')
  }
  validateLearnedModelReference(
    value.learnedGripModel,
    'grip',
    'learned grip model',
  )
  if (f1 && value.learnedEnergyModel !== undefined) {
    validateLearnedModelReference(
      value.learnedEnergyModel,
      'f1-energy',
      'learned energy model',
    )
  }
  if (!f1 && value.learnedOtsModel !== undefined) {
    validateLearnedModelReference(
      value.learnedOtsModel,
      'sf-ots',
      'learned OTS model',
    )
  }
}

function validateDriverRequest(
  value: unknown,
  category: 'f1' | 'super-formula',
): DriverObservationId[] {
  assertNoOutcomeFields(value)
  if (!isRecord(value)) throw new Error('driver request must be an object')
  requireOneOf(value.channel, 'driver request channel', [
    'intention',
    'goal',
    'control',
    'tactic',
    'pit',
    'fia',
  ])
  requireString(value.requestId, 'request id')

  switch (value.channel) {
    case 'intention':
      requireExactKeys(value, 'intention request', [
        'channel',
        'requestId',
        'intention',
      ])
      requireOneOf(value.intention, 'driver intention', [
        'comply-race-control',
        'follow-reference-line',
        'attack',
        'defend',
        'yield',
        'avoid-hazard',
        'prepare-pit-entry',
      ])
      return []
    case 'goal':
      requireExactKeys(value, 'goal request', [
        'channel',
        'requestId',
        'goal',
        'observationId',
        'subjectId',
      ])
      requireOneOf(value.goal, 'driver goal', [
        'maintain-plan',
        'respond-to-observation',
        'traffic-relation',
      ])
      if (value.observationId !== undefined) {
        requireString(value.observationId, 'goal observation id')
      }
      if (value.subjectId !== undefined) {
        requireString(value.subjectId, 'goal subject id')
      }
      return value.observationId ? [value.observationId] : []
    case 'control':
      requireExactKeys(value, 'control request', [
        'channel',
        'requestId',
        'throttle',
        'brake',
        'steering',
      ])
      requireOneOf(value.throttle, 'throttle request', [
        'increase',
        'hold',
        'decrease',
      ])
      requireOneOf(value.brake, 'brake request', [
        'increase',
        'hold',
        'decrease',
      ])
      requireOneOf(value.steering, 'steering request', [
        'left',
        'hold',
        'right',
      ])
      return []
    case 'tactic':
      requireExactKeys(value, 'tactic request', [
        'channel',
        'requestId',
        'action',
        'subjectId',
        'tactic',
      ])
      requireOneOf(value.action, 'tactic action', ['request', 'hold', 'release'])
      if (value.subjectId !== undefined) {
        requireString(value.subjectId, 'tactic subject id')
      }
      requireOneOf(
        value.tactic,
        'driver tactic',
        category === 'f1'
          ? [
              'traffic',
              'straight-mode',
              'corner-mode',
              'energy',
              'electrical-overtake',
            ]
          : ['traffic', 'ots-attack', 'ots-defend'],
      )
      return []
    case 'pit':
      requireExactKeys(value, 'pit request', [
        'channel',
        'requestId',
        'action',
      ])
      requireOneOf(value.action, 'pit action', [
        'request-entry',
        'cancel-entry',
        'stay-out',
      ])
      return []
    case 'fia':
      requireExactKeys(value, 'FIA request', [
        'channel',
        'requestId',
        'action',
        'observationId',
      ])
      requireOneOf(value.action, 'FIA request action', [
        'acknowledge-instruction',
        'report-hazard',
        'request-review',
      ])
      requireString(value.observationId, 'FIA request observation id')
      return [value.observationId]
  }
}

function validateDriverDecisionRecordRuntime(
  record: DriverDecisionRecord,
  input: DriverAgentTickInput,
): void {
  assertSerializable(input, 'driver agent input')
  assertSerializable(record, 'driver decision record')
  requireExactKeys(input, 'driver agent input', [
    'driverId',
    'identity',
    'experience',
    'policy',
    'observations',
    'decisionTime',
    'seed',
  ])
  requireExactKeys(record, 'driver decision record', [
    'decisionId',
    'driverId',
    'seriesId',
    'vehicleEraId',
    'policyKind',
    'decisionTime',
    'observationIds',
    'candidates',
    'utilities',
    'constraints',
    'selectedCandidateId',
    'reason',
    'seed',
  ])
  requireString(input.driverId, 'driver id')
  requireString(input.seed, 'driver decision seed')
  requireExactKeys(input.identity, 'driver identity', [
    'skills',
    'style',
    'memory',
  ])
  validateBoundedNumericRecord(
    input.identity.skills,
    'driver identity skills',
    DRIVER_SKILL_BOUNDS,
  )
  validateBoundedNumericRecord(
    input.identity.style,
    'driver identity style',
    DRIVER_STYLE_BOUNDS,
  )
  requireExactKeys(input.identity.memory, 'driver identity memory', [
    'observationIds',
    'decisionIds',
  ])
  if (
    !Array.isArray(input.identity.memory.observationIds) ||
    !Array.isArray(input.identity.memory.decisionIds)
  ) {
    throw new Error('driver identity memory ids must be arrays')
  }
  requireUniqueIds(
    input.identity.memory.observationIds,
    'driver identity observation ids',
  )
  requireUniqueIds(
    input.identity.memory.decisionIds,
    'driver identity decision ids',
  )
  requireExactKeys(input.decisionTime, 'driver decision time', [
    'tick',
    'elapsedSeconds',
  ])
  requireTick(input.decisionTime.tick, 'driver decision tick')
  if (
    !Number.isFinite(input.decisionTime.elapsedSeconds) ||
    input.decisionTime.elapsedSeconds < 0
  ) {
    throw new Error('driver decision elapsed time must be finite and non-negative')
  }

  const category = validatePolicy(input.policy)
  const f1 = category === 'f1'
  validateCategoryExperience(input.experience, category, input.driverId)
  if (!Array.isArray(input.observations)) {
    throw new Error('driver observations must be an array')
  }

  const inputObservationIds = new Set<string>()
  for (const observation of input.observations as readonly DriverObservation[]) {
    if (!isRecord(observation)) {
      throw new Error('driver observation must be an object')
    }
    const observationKeys = [
      'observationId',
      'driverId',
      'seriesId',
      'vehicleEraId',
      'scope',
      'signalId',
      'observedAtTick',
      'availableAtTick',
      'provenance',
      'reading',
      ...(observation.scope === 'traffic' ? ['subjectId'] : []),
    ]
    requireExactRequiredKeys(
      observation,
      'driver observation',
      observationKeys,
    )
    requireString(observation.observationId, 'observation id')
    requireString(observation.signalId, 'observation signal id')
    if (observation.scope === 'traffic') {
      requireString(observation.subjectId, 'observation subject id')
    }
    requireExactRequiredKeys(observation.provenance, 'observation provenance', [
      'source',
      'sourceId',
    ])
    requireOneOf(observation.provenance.source, 'observation source', [
      'physics-sensor',
      'race-control',
      'strategy',
      'team',
      'category-system',
    ])
    requireString(observation.provenance.sourceId, 'observation source id')
    requireTick(observation.observedAtTick, 'observation tick')
    requireTick(observation.availableAtTick, 'observation availability tick')
    if (
      observation.observedAtTick > observation.availableAtTick ||
      observation.availableAtTick > input.decisionTime.tick
    ) {
      throw new Error('driver observation comes from a future tick')
    }
    if (
      observation.driverId !== input.driverId ||
      observation.seriesId !== input.policy.seriesId ||
      observation.vehicleEraId !== input.policy.vehicleEraId
    ) {
      throw new Error('driver observation crosses category')
    }
    switch (observation.scope) {
      case 'self':
        requireOneOf(observation.signalId, 'self observation signal', [
          'lap-progress',
          'lateral-offset-m',
        ])
        validateScalarObservationReading(
          observation.reading,
          'self observation reading',
          DRIVER_OBSERVATION_SCALAR_BOUNDS[
            `self/${observation.signalId}` as
              | 'self/lap-progress'
              | 'self/lateral-offset-m'
          ],
        )
        break
      case 'track':
        requireOneOf(observation.signalId, 'track observation signal', [
          'reference-line-offset-m',
          'track-half-width-m',
        ])
        validateScalarObservationReading(
          observation.reading,
          'track observation reading',
          DRIVER_OBSERVATION_SCALAR_BOUNDS[
            `track/${observation.signalId}` as
              | 'track/reference-line-offset-m'
              | 'track/track-half-width-m'
          ],
        )
        break
      case 'traffic':
        requireOneOf(observation.signalId, 'traffic observation signal', [
          'gap-seconds',
          'lateral-separation-m',
        ])
        validateScalarObservationReading(
          observation.reading,
          'traffic observation reading',
          DRIVER_OBSERVATION_SCALAR_BOUNDS[
            `traffic/${observation.signalId}` as
              | 'traffic/gap-seconds'
              | 'traffic/lateral-separation-m'
          ],
        )
        break
      case 'race-control':
        if (observation.signalId !== 'flag-state') {
          throw new Error('race-control observation signal is not supported')
        }
        validateStateObservationReading(
          observation.reading,
          'race-control observation reading',
          DRIVER_RACE_CONTROL_FLAG_STATES,
        )
        break
      case 'team':
        if (observation.signalId !== 'pit-instruction') {
          throw new Error('team observation signal is not supported')
        }
        validateBooleanObservationReading(
          observation.reading,
          'team observation reading',
        )
        break
      case 'f1-system':
        if (!f1) {
          throw new Error('driver observation crosses category')
        }
        if (
          observation.signalId === 'straight-mode' ||
          observation.signalId === 'corner-mode'
        ) {
          validateBooleanObservationReading(
            observation.reading,
            'F1 system observation reading',
          )
        } else if (observation.signalId === 'energy-store') {
          validateScalarObservationReading(
            observation.reading,
            'F1 system observation reading',
            DRIVER_OBSERVATION_SCALAR_BOUNDS['f1-system/energy-store'],
          )
        } else if (observation.signalId === 'electrical-overtake') {
          validateStateObservationReading(
            observation.reading,
            'F1 system observation reading',
            DRIVER_ELECTRICAL_OVERTAKE_STATES,
          )
        } else {
          throw new Error('F1 system observation signal is not supported')
        }
        break
      case 'sf-system':
        if (f1) {
          throw new Error('driver observation crosses category')
        }
        if (observation.signalId !== 'ots') {
          throw new Error('SUPER FORMULA system observation signal is not supported')
        }
        validateStateObservationReading(
          observation.reading,
          'SUPER FORMULA system observation reading',
          DRIVER_SF_OTS_STATES,
        )
        break
      default:
        throw new Error('driver observation scope is not supported')
    }
    if (inputObservationIds.has(observation.observationId)) {
      throw new Error(`duplicate observation ${observation.observationId}`)
    }
    inputObservationIds.add(observation.observationId)
  }

  requireExactKeys(record.decisionTime, 'record decision time', [
    'tick',
    'elapsedSeconds',
  ])
  requireExactKeys(record.reason, 'driver decision reason', [
    'code',
    'referenceIds',
  ])
  if (
    !Array.isArray(record.observationIds) ||
    !Array.isArray(record.candidates) ||
    !Array.isArray(record.utilities) ||
    !Array.isArray(record.constraints) ||
    !Array.isArray(record.reason.referenceIds)
  ) {
    throw new Error('driver decision record collections must be arrays')
  }
  requireOneOf(record.reason.code, 'driver decision reason code', [
    'highest-utility-feasible',
    'mandatory-constraint',
    'deterministic-tie-break',
    'deterministic-fallback',
  ])
  requireString(record.selectedCandidateId, 'selected candidate id')
  if (
    record.driverId !== input.driverId ||
    record.seriesId !== input.policy.seriesId ||
    record.vehicleEraId !== input.policy.vehicleEraId ||
    record.policyKind !== input.policy.kind ||
    record.seed !== input.seed ||
    record.decisionTime.tick !== input.decisionTime.tick ||
    record.decisionTime.elapsedSeconds !== input.decisionTime.elapsedSeconds
  ) {
    throw new Error('driver decision record does not match replay input')
  }
  requireString(record.decisionId, 'decision id')
  const recordObservationIds = requireUniqueIds(
    record.observationIds,
    'decision observation ids',
  )
  for (const id of recordObservationIds)
    if (!inputObservationIds.has(id)) throw new Error(`unknown observation ${id}`)

  if (record.candidates.length === 0) {
    throw new Error('driver decision requires at least one candidate')
  }
  const candidateIds = new Set<string>()
  const requestIds = new Set<string>()
  for (const candidate of record.candidates) {
    requireExactKeys(candidate, 'driver candidate', [
      'candidateId',
      'requests',
    ])
    requireString(candidate.candidateId, 'candidate id')
    if (candidateIds.has(candidate.candidateId)) {
      throw new Error(`duplicate candidate ${candidate.candidateId}`)
    }
    candidateIds.add(candidate.candidateId)
    if (!Array.isArray(candidate.requests)) {
      throw new Error(`candidate ${candidate.candidateId} requests must be an array`)
    }
    if (candidate.requests.length === 0) {
      throw new Error(`candidate ${candidate.candidateId} has no request`)
    }
    const channels = new Set<string>()
    for (const request of candidate.requests) {
      const referencedObservationIds = validateDriverRequest(request, category)
      if (requestIds.has(request.requestId) || channels.has(request.channel)) {
        throw new Error('driver request id or channel is duplicated')
      }
      requestIds.add(request.requestId)
      channels.add(request.channel)
      for (const id of referencedObservationIds)
        if (!recordObservationIds.has(id))
          throw new Error(`driver request references unknown observation ${id}`)
    }
  }
  if (!candidateIds.has(record.selectedCandidateId)) {
    throw new Error('selected driver candidate does not exist')
  }

  const utilityIds = new Set<string>()
  for (const utility of record.utilities) {
    requireExactKeys(utility, 'driver utility', [
      'candidateId',
      'status',
      'value',
    ])
    requireString(utility.candidateId, 'utility candidate id')
    if (!candidateIds.has(utility.candidateId) || utilityIds.has(utility.candidateId)) {
      throw new Error('driver utility has an unknown or duplicate candidate')
    }
    utilityIds.add(utility.candidateId)
    requireOneOf(utility.status, 'driver utility status', [
      'evaluated',
      'legacy-not-evaluated',
    ])
    if (utility.status === 'evaluated') {
      if (!Number.isFinite(utility.value)) {
        throw new Error('evaluated driver utility must be finite')
      }
    } else if (utility.value !== null) {
      throw new Error('legacy driver utility must use a null value')
    }
  }
  if (utilityIds.size !== candidateIds.size) {
    throw new Error('every driver candidate requires one utility record')
  }

  const constraintIds = new Set<string>()
  for (const constraint of record.constraints) {
    requireExactKeys(constraint, 'driver constraint', [
      'constraintId',
      'candidateId',
      'status',
      'reasonCode',
      'observationIds',
    ])
    requireString(constraint.constraintId, 'constraint id')
    if (constraintIds.has(constraint.constraintId)) {
      throw new Error(`duplicate constraint ${constraint.constraintId}`)
    }
    constraintIds.add(constraint.constraintId)
    requireString(constraint.reasonCode, 'constraint reason')
    requireOneOf(constraint.status, 'constraint status', [
      'satisfied',
      'blocked',
    ])
    if (constraint.candidateId !== null) {
      requireString(constraint.candidateId, 'constraint candidate id')
    }
    if (!Array.isArray(constraint.observationIds)) {
      throw new Error('constraint observation ids must be an array')
    }
    requireUniqueIds(
      constraint.observationIds,
      'constraint observation ids',
    )
    if (
      (constraint.candidateId !== null && !candidateIds.has(constraint.candidateId))
    ) {
      throw new Error('driver constraint has an unknown candidate')
    }
    for (const id of constraint.observationIds) {
      if (!recordObservationIds.has(id)) {
        throw new Error(`constraint references unknown observation ${id}`)
      }
    }
    if (
      constraint.status === 'blocked' &&
      (constraint.candidateId === null ||
        constraint.candidateId === record.selectedCandidateId)
    ) {
      throw new Error('selected candidate violates a blocked constraint')
    }
  }

  const reasonIds = requireUniqueIds(record.reason.referenceIds, 'reason ids')
  const knownReasonIds = new Set([
    ...candidateIds,
    ...requestIds,
    ...constraintIds,
    ...recordObservationIds,
  ])
  for (const id of reasonIds) {
    if (!knownReasonIds.has(id)) {
      throw new Error(`driver decision reason references unknown id ${id}`)
    }
  }
}

/**
 * Single opt-in contract validator. The race hot path does not call it unless
 * diagnostic decision recording is explicitly enabled. The overloads keep a
 * record and its replay input in the same category at compile time; the
 * implementation repeats that check for untrusted serialized data.
 */
export function validateDriverDecisionRecord(
  record: DriverDecisionRecord<F1_2026_DrivingPolicy>,
  input: DriverAgentTickInput<F1_2026_DrivingPolicy>,
): void
export function validateDriverDecisionRecord(
  record: DriverDecisionRecord<SF_2026_DrivingPolicy>,
  input: DriverAgentTickInput<SF_2026_DrivingPolicy>,
): void
export function validateDriverDecisionRecord(
  record: DriverDecisionRecord,
  input: DriverAgentTickInput,
): void {
  validateDriverDecisionRecordRuntime(record, input)
}

function canonicalizeLearnedModelReference<
  Kind extends 'grip' | 'f1-energy' | 'sf-ots',
>(
  reference: LearnedDriverModelReference<Kind>,
): LearnedDriverModelReference<Kind> {
  return {
    ...reference,
    evidenceObservationIds: sorted(reference.evidenceObservationIds),
  }
}

function canonicalizeCategoryExperience(
  experience: DriverCategoryExperience,
): DriverCategoryExperience {
  const learnedGripModel = canonicalizeLearnedModelReference(
    experience.learnedGripModel,
  )

  if (experience.seriesId === 'f1-custom') {
    return experience.learnedEnergyModel === undefined
      ? { ...experience, learnedGripModel }
      : {
          ...experience,
          learnedEnergyModel: canonicalizeLearnedModelReference(
            experience.learnedEnergyModel,
          ),
          learnedGripModel,
        }
  }

  return experience.learnedOtsModel === undefined
    ? { ...experience, learnedGripModel }
    : {
        ...experience,
        learnedGripModel,
        learnedOtsModel: canonicalizeLearnedModelReference(
          experience.learnedOtsModel,
        ),
      }
}

export function canonicalizeDriverAgentTickInput<
  P extends SeriesDrivingPolicy,
>(input: DriverAgentTickInput<P>): DriverAgentTickInput<P> {
  return {
    ...input,
    experience: canonicalizeCategoryExperience(input.experience),
    identity: {
      ...input.identity,
      memory: {
        ...input.identity.memory,
        decisionIds: sorted(input.identity.memory.decisionIds),
        observationIds: sorted(input.identity.memory.observationIds),
      },
    },
    observations: [...input.observations].sort((left, right) =>
      stableCompare(left.observationId, right.observationId),
    ),
  } as DriverAgentTickInput<P>
}

export function canonicalizeDriverDecisionRecord<
  P extends SeriesDrivingPolicy,
>(record: DriverDecisionRecord<P>): DriverDecisionRecord<P> {
  return {
    ...record,
    observationIds: sorted(record.observationIds),
    candidates: [...record.candidates]
      .map((candidate) => ({
        ...candidate,
        requests: [...candidate.requests].sort((left, right) =>
          stableCompare(left.requestId, right.requestId),
        ),
      }))
      .sort((left, right) => stableCompare(left.candidateId, right.candidateId)),
    utilities: [...record.utilities].sort((left, right) =>
      stableCompare(left.candidateId, right.candidateId),
    ),
    constraints: [...record.constraints]
      .map((constraint) => ({
        ...constraint,
        observationIds: sorted(constraint.observationIds),
      }))
      .sort((left, right) => stableCompare(left.constraintId, right.constraintId)),
    reason: { ...record.reason, referenceIds: sorted(record.reason.referenceIds) },
  } as DriverDecisionRecord<P>
}

export function createDriverDecisionRecord(
  record: DriverDecisionRecord<F1_2026_DrivingPolicy>,
  input: DriverAgentTickInput<F1_2026_DrivingPolicy>,
): DriverDecisionRecord<F1_2026_DrivingPolicy>
export function createDriverDecisionRecord(
  record: DriverDecisionRecord<SF_2026_DrivingPolicy>,
  input: DriverAgentTickInput<SF_2026_DrivingPolicy>,
): DriverDecisionRecord<SF_2026_DrivingPolicy>
export function createDriverDecisionRecord(
  record: DriverDecisionRecord,
  input: DriverAgentTickInput,
): DriverDecisionRecord {
  validateDriverDecisionRecordRuntime(record, input)
  const canonical = canonicalizeDriverDecisionRecord<SeriesDrivingPolicy>(
    record,
  )
  return canonical
}
