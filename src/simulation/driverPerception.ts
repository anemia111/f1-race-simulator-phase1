import type { DriverDecisionContext } from './driverDecision'
import {
  DRIVER_OBSERVATION_SCALAR_BOUNDS,
  validateSeriesDrivingPolicy,
  type DriverBooleanObservationReading,
  type DriverDecisionTime,
  type DriverObservation,
  type DriverObservationFor,
  type DriverRaceControlFlagState,
  type DriverScalarObservationReading,
  type DriverStateObservationReading,
  type F1DriverObservation,
  type F1_2026_DrivingPolicy,
  type SFDriverObservation,
  type SF_2026_DrivingPolicy,
  type SeriesDrivingPolicy,
} from './driverAgentContract'

export type ImmediateDriverPerceptionInput<
  Policy extends SeriesDrivingPolicy = SeriesDrivingPolicy,
> = Policy extends SeriesDrivingPolicy
  ? {
      readonly context: DriverDecisionContext
      readonly decisionTime: DriverDecisionTime
      readonly policy: Policy
    }
  : never

const RACE_CONTROL_FLAG_STATES = new Set<DriverRaceControlFlagState>([
  'clear',
  'yellow',
  'double-yellow',
  'vsc',
  'sc',
  'red',
])

const stableCompare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0

function requirePlainDataObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} must be a plain object`)
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new Error(`${label} must use string property keys`)
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label} must use enumerable data properties`)
    }
  }

  return value as Record<string, unknown>
}

function requireOwnValue(
  value: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    throw new Error(`${label} is missing required field ${key}`)
  }
  return value[key]
}

function optionalOwnValue(
  value: Record<string, unknown>,
  key: string,
): unknown {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? value[key]
    : undefined
}

function requireDecisionTime(
  value: Record<string, unknown>,
): DriverDecisionTime {
  const tick = requireOwnValue(
    value,
    'tick',
    'Driver perception decision time',
  )
  const elapsedSeconds = requireOwnValue(
    value,
    'elapsedSeconds',
    'Driver perception decision time',
  )
  if (!Number.isSafeInteger(tick) || (tick as number) < 0) {
    throw new Error('Driver perception tick must be a non-negative safe integer')
  }
  if (
    !Number.isFinite(elapsedSeconds) ||
    (elapsedSeconds as number) < 0
  ) {
    throw new Error(
      'Driver perception elapsed time must be finite and non-negative',
    )
  }

  return {
    elapsedSeconds: elapsedSeconds as number,
    tick: tick as number,
  }
}

function requireCanonicalPolicy(policy: SeriesDrivingPolicy): void {
  validateSeriesDrivingPolicy(policy)
}

/**
 * Immediate scalar readings are exact, so saturation would silently fabricate
 * a sensor value. Reject an out-of-domain context instead of clamping it.
 */
function exactScalarReading(
  key: keyof typeof DRIVER_OBSERVATION_SCALAR_BOUNDS,
  value: number,
): DriverScalarObservationReading {
  const [minimum, maximum] = DRIVER_OBSERVATION_SCALAR_BOUNDS[key]

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `Driver perception ${key} must be finite and between ${minimum} and ${maximum}`,
    )
  }

  return {
    kind: 'scalar',
    value,
    uncertainty: { kind: 'exact' },
  }
}

function exactFlagReading(
  value: DriverRaceControlFlagState,
): DriverStateObservationReading<DriverRaceControlFlagState> {
  if (!RACE_CONTROL_FLAG_STATES.has(value)) {
    throw new Error(`Unsupported driver perception flag state ${String(value)}`)
  }

  return {
    kind: 'state',
    value,
    uncertainty: { kind: 'exact' },
  }
}

function exactPitInstructionReading(
  requested: boolean,
): DriverBooleanObservationReading {
  if (typeof requested !== 'boolean') {
    throw new Error('Driver perception pit instruction must be boolean')
  }

  return {
    kind: 'boolean',
    value: requested,
    uncertainty: { kind: 'exact' },
  }
}

function observationIdFor(options: {
  readonly driverId: string
  readonly scope: string
  readonly seriesId: string
  readonly signalId: string
  readonly tick: number
  readonly vehicleEraId: string
}): string {
  return [
    'driver-observation-v1',
    options.seriesId,
    options.vehicleEraId,
    options.driverId,
    `tick:${options.tick}`,
    options.scope,
    options.signalId,
  ]
    .map(encodeURIComponent)
    .join('/')
}

export function projectImmediateDriverPerception(
  input: ImmediateDriverPerceptionInput<F1_2026_DrivingPolicy>,
): readonly F1DriverObservation[]
export function projectImmediateDriverPerception(
  input: ImmediateDriverPerceptionInput<SF_2026_DrivingPolicy>,
): readonly SFDriverObservation[]
export function projectImmediateDriverPerception<
  Policy extends SeriesDrivingPolicy,
>(
  input: ImmediateDriverPerceptionInput<Policy>,
): readonly DriverObservationFor<Policy>[]
/**
 * Projects only exact values already present in the immutable decision context.
 * It does not inspect category systems, traffic-policy cues, runtime truth, RNG,
 * wall-clock time, or mutable global state.
 */
export function projectImmediateDriverPerception(
  input: ImmediateDriverPerceptionInput<SeriesDrivingPolicy>,
): readonly DriverObservation[] {
  const inputRecord = requirePlainDataObject(input, 'Driver perception input')
  const contextRecord = requirePlainDataObject(
    requireOwnValue(inputRecord, 'context', 'Driver perception input'),
    'Driver perception context',
  )
  const decisionTimeRecord = requirePlainDataObject(
    requireOwnValue(inputRecord, 'decisionTime', 'Driver perception input'),
    'Driver perception decision time',
  )
  const policy = requireOwnValue(
    inputRecord,
    'policy',
    'Driver perception input',
  ) as SeriesDrivingPolicy
  const decisionTime = requireDecisionTime(decisionTimeRecord)
  requireCanonicalPolicy(policy)

  const driver = requirePlainDataObject(
    requireOwnValue(contextRecord, 'driver', 'Driver perception context'),
    'Driver perception driver',
  )
  const driverId = requireOwnValue(
    driver,
    'id',
    'Driver perception driver',
  )
  if (typeof driverId !== 'string' || driverId.length === 0) {
    throw new Error('Driver perception requires a non-empty driver id')
  }
  const pitValue = optionalOwnValue(contextRecord, 'pit')
  const pitRequested =
    pitValue === undefined
      ? false
      : requireOwnValue(
          requirePlainDataObject(pitValue, 'Driver perception pit cue'),
          'requested',
          'Driver perception pit cue',
        )
  if (typeof pitRequested !== 'boolean') {
    throw new Error('Driver perception pit instruction must be boolean')
  }

  const common = {
    availableAtTick: decisionTime.tick,
    driverId,
    observedAtTick: decisionTime.tick,
    seriesId: policy.seriesId,
    vehicleEraId: policy.vehicleEraId,
  } as const
  const identify = (scope: string, signalId: string) =>
    observationIdFor({
      driverId: common.driverId,
      scope,
      seriesId: common.seriesId,
      signalId,
      tick: decisionTime.tick,
      vehicleEraId: common.vehicleEraId,
    })
  const observations = [
    {
      ...common,
      observationId: identify('self', 'lap-progress'),
      provenance: {
        source: 'physics-sensor' as const,
        sourceId: 'driver-decision-context/self/lap-progress',
      },
      reading: exactScalarReading(
        'self/lap-progress',
        requireOwnValue(
          contextRecord,
          'trackProgress',
          'Driver perception context',
        ) as number,
      ),
      scope: 'self' as const,
      signalId: 'lap-progress' as const,
    },
    {
      ...common,
      observationId: identify('self', 'lateral-offset-m'),
      provenance: {
        source: 'physics-sensor' as const,
        sourceId: 'driver-decision-context/self/lateral-offset-m',
      },
      reading: exactScalarReading(
        'self/lateral-offset-m',
        requireOwnValue(
          contextRecord,
          'currentLateralOffsetM',
          'Driver perception context',
        ) as number,
      ),
      scope: 'self' as const,
      signalId: 'lateral-offset-m' as const,
    },
    {
      ...common,
      observationId: identify('track', 'reference-line-offset-m'),
      provenance: {
        source: 'physics-sensor' as const,
        sourceId: 'driver-decision-context/track/reference-line-offset-m',
      },
      reading: exactScalarReading(
        'track/reference-line-offset-m',
        requireOwnValue(
          contextRecord,
          'physicalReferenceLineOffsetM',
          'Driver perception context',
        ) as number,
      ),
      scope: 'track' as const,
      signalId: 'reference-line-offset-m' as const,
    },
    {
      ...common,
      observationId: identify('track', 'track-half-width-m'),
      provenance: {
        source: 'physics-sensor' as const,
        sourceId: 'driver-decision-context/track/track-half-width-m',
      },
      reading: exactScalarReading(
        'track/track-half-width-m',
        requireOwnValue(
          contextRecord,
          'trackHalfWidthM',
          'Driver perception context',
        ) as number,
      ),
      scope: 'track' as const,
      signalId: 'track-half-width-m' as const,
    },
    {
      ...common,
      observationId: identify('race-control', 'flag-state'),
      provenance: {
        source: 'race-control' as const,
        sourceId: 'driver-decision-context/race-control/flag-state',
      },
      reading: exactFlagReading(
        (optionalOwnValue(contextRecord, 'flagState') ??
          'clear') as DriverRaceControlFlagState,
      ),
      scope: 'race-control' as const,
      signalId: 'flag-state' as const,
    },
    {
      ...common,
      observationId: identify('team', 'pit-instruction'),
      provenance: {
        source: 'team' as const,
        sourceId: 'driver-decision-context/team/pit-instruction',
      },
      // `true` means request-entry; `false` means no current instruction.
      reading: exactPitInstructionReading(pitRequested),
      scope: 'team' as const,
      signalId: 'pit-instruction' as const,
    },
  ]

  observations.sort((left, right) =>
    stableCompare(left.observationId, right.observationId),
  )

  // The overload boundary preserves the canonical policy-to-observation
  // correlation after `requireCanonicalPolicy` has checked it at runtime.
  return observations as readonly DriverObservation[]
}
