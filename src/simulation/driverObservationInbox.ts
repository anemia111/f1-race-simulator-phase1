import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from '../series/seriesIds'
import {
  DRIVER_OBSERVATION_SCALAR_BOUNDS,
  type DriverObservation,
  type DriverObservationId,
} from './driverAgentContract'
import { hashChance } from './random'

export const DRIVER_OBSERVATION_INBOX_SCHEMA_VERSION = 1 as const
export const DRIVER_OBSERVATION_TICK_SECONDS = 0.5

/**
 * Bounded simulator policy. These values describe the driver's perception
 * substrate; they are not circuit, tyre, or vehicle calibration inputs.
 * Race-control and team instructions remain immediate and exact.
 */
export const DRIVER_OBSERVATION_INBOX_POLICY = Object.freeze({
  maximumPendingObservations: 64,
  maximumRetainedObservations: 96,
  retentionTicks: 240,
  latencyTicksByScope: Object.freeze({
    'f1-system': 1,
    'race-control': 0,
    'self': 2,
    'sf-system': 1,
    'team': 0,
    'track': 1,
    'traffic': 2,
  }),
  scalarNoiseRadiusBySignal: Object.freeze({
    'f1-system/energy-store': 0.002,
    'self/lap-progress': 0.0004,
    'self/lateral-offset-m': 0.04,
    'track/reference-line-offset-m': 0.04,
    'track/track-half-width-m': 0,
    'traffic/gap-seconds': 0.025,
    'traffic/lateral-separation-m': 0.05,
  }),
})

export type DriverObservationInboxState = {
  readonly schemaVersion: typeof DRIVER_OBSERVATION_INBOX_SCHEMA_VERSION
  readonly driverId: string
  readonly seriesId: ExecutableSeriesId
  readonly vehicleEraId: RuntimeVehicleEraId
  readonly pending: readonly DriverObservation[]
  readonly retained: readonly DriverObservation[]
}

export type AdvanceDriverObservationInboxResult = {
  readonly state: DriverObservationInboxState
  /** Observations that became causally available during this advancement. */
  readonly delivered: readonly DriverObservation[]
  /** The bounded retained inbox after expiry and delivery. */
  readonly available: readonly DriverObservation[]
}

const stableCompare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value)
  const expected = new Set(keys)
  return actual.length === expected.size && actual.every((key) => expected.has(key))
}

const isTick = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

const observationStateValues = Object.freeze({
  'f1-system/electrical-overtake': Object.freeze([
    'disabled',
    'available',
    'active',
  ]),
  'race-control/flag-state': Object.freeze([
    'clear',
    'yellow',
    'double-yellow',
    'vsc',
    'sc',
    'red',
  ]),
  'sf-system/ots': Object.freeze(['disabled', 'available', 'active']),
} satisfies Readonly<Record<string, readonly string[]>>)

const allowedUnavailableReasons = new Set([
  'not-observed',
  'sensor-unavailable',
  'source-unavailable',
])
const allowedProvenanceSources = new Set([
  'physics-sensor',
  'race-control',
  'strategy',
  'team',
  'category-system',
])

/** Converts simulation time to the canonical bounded-perception cadence. */
export function driverObservationTickAt(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('Driver observation time must be finite and non-negative')
  }
  return Math.floor(
    (elapsedSeconds + 1e-12) / DRIVER_OBSERVATION_TICK_SECONDS,
  )
}

function scalarUncertaintyIsValid(
  value: unknown,
  reading: number,
  minimum: number,
  maximum: number,
) {
  if (!isRecord(value)) return false
  if (value.kind === 'exact') return hasExactKeys(value, ['kind'])
  return (
    hasExactKeys(value, ['kind', 'minimum', 'maximum']) &&
    value.kind === 'bounded-interval' &&
    typeof value.minimum === 'number' &&
    Number.isFinite(value.minimum) &&
    typeof value.maximum === 'number' &&
    Number.isFinite(value.maximum) &&
    value.minimum >= minimum &&
    value.minimum <= reading &&
    value.maximum >= reading &&
    value.maximum <= maximum
  )
}

function categoricalUncertaintyIsValid(value: unknown) {
  if (!isRecord(value)) return false
  if (value.kind === 'exact') return hasExactKeys(value, ['kind'])
  return (
    hasExactKeys(value, ['kind', 'confidence']) &&
    value.kind === 'confidence' &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  )
}

function unavailableReadingIsValid(value: Record<string, unknown>) {
  return (
    hasExactKeys(value, ['kind', 'reason']) &&
    value.kind === 'unavailable' &&
    allowedUnavailableReasons.has(String(value.reason))
  )
}

function readingIsValid(
  observation: Record<string, unknown>,
  signalKey: string,
) {
  if (!isRecord(observation.reading)) return false
  const reading = observation.reading
  if (reading.kind === 'unavailable') return unavailableReadingIsValid(reading)

  const scalarBounds =
    DRIVER_OBSERVATION_SCALAR_BOUNDS[
      signalKey as keyof typeof DRIVER_OBSERVATION_SCALAR_BOUNDS
    ]
  if (scalarBounds) {
    const [minimum, maximum] = scalarBounds
    return (
      hasExactKeys(reading, ['kind', 'value', 'uncertainty']) &&
      reading.kind === 'scalar' &&
      typeof reading.value === 'number' &&
      Number.isFinite(reading.value) &&
      reading.value >= minimum &&
      reading.value <= maximum &&
      scalarUncertaintyIsValid(
        reading.uncertainty,
        reading.value,
        minimum,
        maximum,
      )
    )
  }
  if (signalKey === 'team/pit-instruction') {
    return (
      hasExactKeys(reading, ['kind', 'value', 'uncertainty']) &&
      reading.kind === 'boolean' &&
      typeof reading.value === 'boolean' &&
      categoricalUncertaintyIsValid(reading.uncertainty)
    )
  }
  if (
    signalKey === 'f1-system/straight-mode' ||
    signalKey === 'f1-system/corner-mode'
  ) {
    return (
      hasExactKeys(reading, ['kind', 'value', 'uncertainty']) &&
      reading.kind === 'boolean' &&
      typeof reading.value === 'boolean' &&
      categoricalUncertaintyIsValid(reading.uncertainty)
    )
  }

  const allowedStates =
    observationStateValues[
      signalKey as keyof typeof observationStateValues
    ]
  return (
    allowedStates !== undefined &&
    hasExactKeys(reading, ['kind', 'value', 'uncertainty']) &&
    reading.kind === 'state' &&
    typeof reading.value === 'string' &&
    allowedStates.includes(reading.value) &&
    categoricalUncertaintyIsValid(reading.uncertainty)
  )
}

function persistedObservationIsValid(
  value: unknown,
  identity: {
    driverId: string
    seriesId: ExecutableSeriesId
    vehicleEraId: RuntimeVehicleEraId
  },
) {
  if (!isRecord(value)) return false
  const traffic = value.scope === 'traffic'
  if (
    !hasExactKeys(value, [
      'observationId',
      'driverId',
      'seriesId',
      'vehicleEraId',
      'scope',
      'signalId',
      ...(traffic ? ['subjectId'] : []),
      'observedAtTick',
      'availableAtTick',
      'provenance',
      'reading',
    ]) ||
    typeof value.observationId !== 'string' ||
    value.observationId.length === 0 ||
    value.driverId !== identity.driverId ||
    value.seriesId !== identity.seriesId ||
    value.vehicleEraId !== identity.vehicleEraId ||
    typeof value.scope !== 'string' ||
    typeof value.signalId !== 'string' ||
    (traffic &&
      (typeof value.subjectId !== 'string' || value.subjectId.length === 0)) ||
    !isTick(value.observedAtTick) ||
    !isTick(value.availableAtTick) ||
    value.observedAtTick > value.availableAtTick ||
    !isRecord(value.provenance) ||
    !hasExactKeys(value.provenance, ['source', 'sourceId']) ||
    !allowedProvenanceSources.has(String(value.provenance.source)) ||
    typeof value.provenance.sourceId !== 'string' ||
    value.provenance.sourceId.length === 0
  ) {
    return false
  }
  const signalKey = `${value.scope}/${value.signalId}`
  if (
    (value.scope === 'f1-system' && identity.seriesId !== 'f1-custom') ||
    (value.scope === 'sf-system' && identity.seriesId !== 'super-formula')
  ) {
    return false
  }
  return readingIsValid(value, signalKey)
}

/** Strict checkpoint/import boundary for the JSON observation state. */
export function parseDriverObservationInboxState(
  value: unknown,
  options: {
    currentTick: number
    driverId: string
    seriesId: ExecutableSeriesId
    vehicleEraId: RuntimeVehicleEraId
  },
): DriverObservationInboxState | null {
  if (
    !isTick(options.currentTick) ||
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'driverId',
      'seriesId',
      'vehicleEraId',
      'pending',
      'retained',
    ]) ||
    value.schemaVersion !== DRIVER_OBSERVATION_INBOX_SCHEMA_VERSION ||
    value.driverId !== options.driverId ||
    value.seriesId !== options.seriesId ||
    value.vehicleEraId !== options.vehicleEraId ||
    !Array.isArray(value.pending) ||
    !Array.isArray(value.retained) ||
    value.pending.length >
      DRIVER_OBSERVATION_INBOX_POLICY.maximumPendingObservations ||
    value.retained.length >
      DRIVER_OBSERVATION_INBOX_POLICY.maximumRetainedObservations ||
    !value.pending.every(
      (observation) =>
        persistedObservationIsValid(observation, options) &&
        (observation as DriverObservation).availableAtTick >
          options.currentTick,
    ) ||
    !value.retained.every(
      (observation) =>
        persistedObservationIsValid(observation, options) &&
        (observation as DriverObservation).availableAtTick <=
          options.currentTick,
    )
  ) {
    return null
  }
  const observations = [...value.pending, ...value.retained] as DriverObservation[]
  if (
    new Set(observations.map(({ observationId }) => observationId)).size !==
    observations.length
  ) {
    return null
  }

  return structuredClone(value) as DriverObservationInboxState
}

function requireTick(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
}

function requireIdentity(
  state: DriverObservationInboxState,
  observation: DriverObservation,
): void {
  if (
    observation.driverId !== state.driverId ||
    observation.seriesId !== state.seriesId ||
    observation.vehicleEraId !== state.vehicleEraId
  ) {
    throw new Error('Driver observation crosses inbox identity or category')
  }
}

function observationCompare(
  left: DriverObservation,
  right: DriverObservation,
): number {
  return (
    left.availableAtTick - right.availableAtTick ||
    left.observedAtTick - right.observedAtTick ||
    stableCompare(left.observationId, right.observationId)
  )
}

function retainedCompare(
  left: DriverObservation,
  right: DriverObservation,
): number {
  return (
    left.observedAtTick - right.observedAtTick ||
    left.availableAtTick - right.availableAtTick ||
    stableCompare(left.observationId, right.observationId)
  )
}

function cloneObservation(observation: DriverObservation): DriverObservation {
  const reading =
    observation.reading.kind === 'unavailable'
      ? { ...observation.reading }
      : {
          ...observation.reading,
          uncertainty: { ...observation.reading.uncertainty },
        }

  return {
    ...observation,
    provenance: { ...observation.provenance },
    reading,
  } as DriverObservation
}

function boundedScalarReading(
  observation: DriverObservation,
  seed: string,
): DriverObservation['reading'] {
  if (observation.reading.kind !== 'scalar') return observation.reading

  const signalKey = `${observation.scope}/${observation.signalId}`
  const scalarSignalKey =
    signalKey as keyof typeof DRIVER_OBSERVATION_SCALAR_BOUNDS
  const bounds = DRIVER_OBSERVATION_SCALAR_BOUNDS[scalarSignalKey]
  const radius =
    DRIVER_OBSERVATION_INBOX_POLICY.scalarNoiseRadiusBySignal[
      signalKey as keyof typeof DRIVER_OBSERVATION_INBOX_POLICY.scalarNoiseRadiusBySignal
    ] ?? 0

  if (bounds === undefined) {
    throw new Error(`Unsupported scalar driver observation ${signalKey}`)
  }
  if (radius === 0) {
    return { ...observation.reading }
  }

  const [domainMinimum, domainMaximum] = bounds
  const noise =
    (hashChance(
      `${seed}:driver-observation-noise:${observation.observationId}`,
    ) *
      2 -
      1) *
    radius
  const value = Math.min(
    domainMaximum,
    Math.max(domainMinimum, observation.reading.value + noise),
  )
  const priorMinimum =
    observation.reading.uncertainty.kind === 'bounded-interval'
      ? observation.reading.uncertainty.minimum
      : observation.reading.value
  const priorMaximum =
    observation.reading.uncertainty.kind === 'bounded-interval'
      ? observation.reading.uncertainty.maximum
      : observation.reading.value

  return {
    kind: 'scalar',
    value,
    uncertainty: {
      kind: 'bounded-interval',
      minimum: Math.max(domainMinimum, Math.min(priorMinimum, value - radius)),
      maximum: Math.min(domainMaximum, Math.max(priorMaximum, value + radius)),
    },
  }
}

function perceivedObservation(
  observation: DriverObservation,
  seed: string,
): DriverObservation {
  const latency =
    DRIVER_OBSERVATION_INBOX_POLICY.latencyTicksByScope[observation.scope]
  const availableAtTick = Math.max(
    observation.availableAtTick,
    observation.observedAtTick + latency,
  )
  const reading = boundedScalarReading(observation, seed)

  return {
    ...cloneObservation(observation),
    availableAtTick,
    reading,
  } as DriverObservation
}

function sameObservation(
  left: DriverObservation,
  right: DriverObservation,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function latestBounded(
  observations: readonly DriverObservation[],
  limit: number,
): DriverObservation[] {
  const sorted = [...observations].sort(retainedCompare)
  return sorted.slice(Math.max(0, sorted.length - limit))
}

export function createDriverObservationInbox(options: {
  readonly driverId: string
  readonly seriesId: ExecutableSeriesId
  readonly vehicleEraId: RuntimeVehicleEraId
}): DriverObservationInboxState {
  if (options.driverId.length === 0) {
    throw new Error('Driver observation inbox requires a driver id')
  }

  return {
    driverId: options.driverId,
    pending: [],
    retained: [],
    schemaVersion: DRIVER_OBSERVATION_INBOX_SCHEMA_VERSION,
    seriesId: options.seriesId,
    vehicleEraId: options.vehicleEraId,
  }
}

/**
 * Enqueues new readings, applies deterministic perception latency/noise, then
 * delivers only readings whose availability tick has arrived. The operation
 * is pure, input-order independent, idempotent for identical observations,
 * and bounded for checkpoint use.
 */
export function advanceDriverObservationInbox(options: {
  readonly state: DriverObservationInboxState
  readonly observations?: readonly DriverObservation[]
  readonly currentTick: number
  readonly seed: string
}): AdvanceDriverObservationInboxResult {
  requireTick(options.currentTick, 'Driver observation inbox current tick')
  if (options.seed.length === 0) {
    throw new Error('Driver observation inbox requires a deterministic seed')
  }

  const state = options.state
  if (
    state.schemaVersion !== DRIVER_OBSERVATION_INBOX_SCHEMA_VERSION ||
    state.driverId.length === 0
  ) {
    throw new Error('Driver observation inbox state is invalid')
  }
  const byId = new Map<DriverObservationId, DriverObservation>()
  for (const existing of [...state.pending, ...state.retained]) {
    requireIdentity(state, existing)
    requireTick(existing.observedAtTick, 'Stored driver observation tick')
    requireTick(
      existing.availableAtTick,
      'Stored driver observation availability tick',
    )
    if (existing.observedAtTick > existing.availableAtTick) {
      throw new Error('Stored driver observation violates causality')
    }
    const duplicate = byId.get(existing.observationId)
    if (duplicate !== undefined && !sameObservation(duplicate, existing)) {
      throw new Error('Driver observation inbox contains a conflicting id')
    }
    byId.set(existing.observationId, existing)
  }

  const pending = state.pending.map(cloneObservation)
  for (const source of options.observations ?? []) {
    requireIdentity(state, source)
    requireTick(source.observedAtTick, 'Driver observation tick')
    requireTick(source.availableAtTick, 'Driver observation availability tick')
    if (
      source.observedAtTick > source.availableAtTick ||
      source.observedAtTick > options.currentTick
    ) {
      throw new Error('Driver observation is not causally observable')
    }

    const perceived = perceivedObservation(source, options.seed)
    const existing = byId.get(perceived.observationId)
    if (existing !== undefined) {
      if (!sameObservation(existing, perceived)) {
        throw new Error('Driver observation id was reused with different data')
      }
      continue
    }
    byId.set(perceived.observationId, perceived)
    pending.push(perceived)
  }

  pending.sort(observationCompare)
  const delivered = pending.filter(
    ({ availableAtTick }) => availableAtTick <= options.currentTick,
  )
  const stillPending = pending
    .filter(({ availableAtTick }) => availableAtTick > options.currentTick)
    .slice(0, DRIVER_OBSERVATION_INBOX_POLICY.maximumPendingObservations)
  const retainedFloor = Math.max(
    0,
    options.currentTick - DRIVER_OBSERVATION_INBOX_POLICY.retentionTicks,
  )
  const available = latestBounded(
    [...state.retained, ...delivered].filter(
      ({ availableAtTick }) => availableAtTick >= retainedFloor,
    ),
    DRIVER_OBSERVATION_INBOX_POLICY.maximumRetainedObservations,
  )

  return {
    available,
    delivered,
    state: {
      ...state,
      pending: stillPending,
      retained: available,
    },
  }
}

/** Returns the newest retained reading for a signal, without future access. */
export function latestDriverObservation(options: {
  readonly state: DriverObservationInboxState
  readonly currentTick: number
  readonly scope: DriverObservation['scope']
  readonly signalId: string
  readonly subjectId?: string
}): DriverObservation | null {
  requireTick(options.currentTick, 'Driver observation read tick')

  return (
    [...options.state.retained]
      .filter(
        (observation) =>
          observation.availableAtTick <= options.currentTick &&
          observation.scope === options.scope &&
          observation.signalId === options.signalId &&
          (options.subjectId === undefined ||
            ('subjectId' in observation &&
              observation.subjectId === options.subjectId)),
      )
      .sort(retainedCompare)
      .at(-1) ?? null
  )
}
