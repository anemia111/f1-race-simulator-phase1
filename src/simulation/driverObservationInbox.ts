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
  return structuredClone(observation)
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
