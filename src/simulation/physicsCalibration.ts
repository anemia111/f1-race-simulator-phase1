import { f1PaceCalibration2026 } from '../data/paceCalibration'
import type { SeriesId } from '../series/types'
import type { EventPaceCalibration } from '../types'

/**
 * Observation and calibration policy for the force-based model.
 *
 * This module deliberately contains no optimiser and writes no parameters. It
 * compares model outputs with observations after the fact. In particular, a
 * circuit identifier is never accepted as a calibration dimension: the road
 * geometry, banking and measured width may differ by circuit, but the car does
 * not gain a hidden lap-time or pace multiplier when it crosses a border.
 */

export type PhysicsCalibrationParameterClass =
  | 'regulatory-limit'
  | 'published-geometry'
  | 'inferred-physical-property'
  | 'global-model-resolution'
  | 'driver-behaviour'

export type PhysicsCalibrationParameterScope = 'category' | 'global'

export type PhysicsCalibrationParameterDefinition = {
  calibratable: boolean
  classification: PhysicsCalibrationParameterClass
  key: string
  maximum: number
  minimum: number
  scope: PhysicsCalibrationParameterScope
  unit: string
}

/**
 * Allow-list for values that may be examined during physics calibration.
 * Fixed regulatory/published inputs remain in the catalogue so a report can
 * identify them, but `calibratable: false` prevents an optimiser or manual
 * tuning pass from silently moving them.
 */
export const PHYSICS_CALIBRATION_PARAMETERS = [
  {
    calibratable: false,
    classification: 'regulatory-limit',
    key: 'combustionPowerKw',
    maximum: 1_000,
    minimum: 100,
    scope: 'category',
    unit: 'kW',
  },
  {
    calibratable: false,
    classification: 'regulatory-limit',
    key: 'hybridDeploymentPowerLimitKw',
    maximum: 500,
    minimum: 0,
    scope: 'category',
    unit: 'kW',
  },
  {
    calibratable: false,
    classification: 'regulatory-limit',
    key: 'minimumMassKg',
    maximum: 1_000,
    minimum: 500,
    scope: 'category',
    unit: 'kg',
  },
  {
    calibratable: false,
    classification: 'regulatory-limit',
    key: 'gearCount',
    maximum: 10,
    minimum: 4,
    scope: 'category',
    unit: 'count',
  },
  {
    calibratable: false,
    classification: 'regulatory-limit',
    key: 'maximumEngineRpm',
    maximum: 20_000,
    minimum: 6_000,
    scope: 'category',
    unit: 'rpm',
  },
  {
    calibratable: false,
    classification: 'published-geometry',
    key: 'wheelRadiusM',
    maximum: 0.45,
    minimum: 0.25,
    scope: 'category',
    unit: 'm',
  },
  {
    calibratable: false,
    classification: 'published-geometry',
    key: 'wheelbaseM',
    maximum: 4,
    minimum: 2.5,
    scope: 'category',
    unit: 'm',
  },
  {
    calibratable: false,
    classification: 'published-geometry',
    key: 'trackWidthM',
    maximum: 2.2,
    minimum: 1.5,
    scope: 'category',
    unit: 'm',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'dragAreaScale',
    maximum: 1.5,
    minimum: 0.4,
    scope: 'category',
    unit: 'ratio',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'liftAreaM2',
    maximum: 8,
    minimum: 1,
    scope: 'category',
    unit: 'm^2',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'drivetrainEfficiency',
    maximum: 0.99,
    minimum: 0.75,
    scope: 'category',
    unit: 'ratio',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'peakTyreFrictionCoefficient',
    maximum: 2.5,
    minimum: 0.8,
    scope: 'category',
    unit: 'coefficient',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'tyreLoadSensitivity',
    maximum: 0.3,
    minimum: 0,
    scope: 'category',
    unit: 'exponent',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'centreOfGravityHeightM',
    maximum: 0.65,
    minimum: 0.15,
    scope: 'category',
    unit: 'm',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'rollingResistanceCoefficient',
    maximum: 0.03,
    minimum: 0.005,
    scope: 'category',
    unit: 'coefficient',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'maximumBrakeDecelerationMps2',
    maximum: 60,
    minimum: 10,
    scope: 'category',
    unit: 'm/s^2',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'topGearDesignSpeedKph',
    maximum: 450,
    minimum: 220,
    scope: 'category',
    unit: 'km/h',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'gearSpread',
    maximum: 6,
    minimum: 2,
    scope: 'category',
    unit: 'ratio',
  },
  {
    calibratable: true,
    classification: 'inferred-physical-property',
    key: 'peakTorqueRevFraction',
    maximum: 0.9,
    minimum: 0.4,
    scope: 'category',
    unit: 'ratio',
  },
  {
    calibratable: true,
    classification: 'global-model-resolution',
    key: 'RACING_LINE_REALISATION',
    maximum: 1,
    minimum: 0,
    scope: 'global',
    unit: 'ratio',
  },
  {
    calibratable: true,
    classification: 'driver-behaviour',
    key: 'DRIVER_TRANSIENT_EFFICIENCY',
    maximum: 1,
    minimum: 0.8,
    scope: 'global',
    unit: 'ratio',
  },
] as const satisfies readonly PhysicsCalibrationParameterDefinition[]

export type PhysicsCalibrationCandidate = {
  categoryId?: SeriesId
  parameterKey: string
  scope: PhysicsCalibrationParameterScope
  value: number
}

const prohibitedCalibrationKeys = new Set([
  'baseLapTime',
  'courseId',
  'eventId',
  'lapTimeMultiplier',
  'paceScale',
  'trackId',
])
const allowedCategoryIds = new Set<SeriesId>([
  'f1-custom',
  'f2',
  'f3',
  'super-formula',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Validate a proposed parameter set without fitting or applying it. */
export function validatePhysicsCalibrationCandidates(
  input: readonly unknown[],
): PhysicsCalibrationCandidate[] {
  const definitions = new Map<string, PhysicsCalibrationParameterDefinition>(
    PHYSICS_CALIBRATION_PARAMETERS.map((definition) => [
      definition.key,
      definition,
    ]),
  )
  const identities = new Set<string>()

  return input.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error(`Physics calibration candidate ${index} is not an object`)
    }

    for (const key of prohibitedCalibrationKeys) {
      if (key in candidate) {
        throw new Error(
          `Physics calibration candidate ${index} contains prohibited ${key}`,
        )
      }
    }

    const parameterKey = candidate.parameterKey

    if (typeof parameterKey !== 'string') {
      throw new Error(
        `Physics calibration candidate ${index} has an unknown parameter`,
      )
    }

    const definition = definitions.get(parameterKey)

    if (!definition) {
      throw new Error(
        `Physics calibration candidate ${index} has an unknown parameter`,
      )
    }

    if (!definition.calibratable) {
      throw new Error(`${parameterKey} is a fixed physical input`)
    }

    if (candidate.scope !== definition.scope) {
      throw new Error(`${parameterKey} has the wrong calibration scope`)
    }

    const rawCategoryId = candidate.categoryId
    const categoryId =
      typeof rawCategoryId === 'string' &&
      allowedCategoryIds.has(rawCategoryId as SeriesId)
        ? (rawCategoryId as SeriesId)
        : undefined

    if (
      (definition.scope === 'category' &&
        categoryId === undefined) ||
      (definition.scope === 'global' && rawCategoryId !== undefined)
    ) {
      throw new Error(`${parameterKey} has an invalid category dimension`)
    }

    if (
      typeof candidate.value !== 'number' ||
      !Number.isFinite(candidate.value) ||
      candidate.value < definition.minimum ||
      candidate.value > definition.maximum
    ) {
      throw new Error(`${parameterKey} is outside its physical bounds`)
    }

    const identity = `${parameterKey}:${categoryId ?? 'global'}`

    if (identities.has(identity)) {
      throw new Error(`Duplicate physics calibration candidate ${identity}`)
    }

    identities.add(identity)

    return {
      ...(categoryId === undefined ? {} : { categoryId }),
      parameterKey,
      scope: definition.scope,
      value: candidate.value,
    }
  })
}

/**
 * Only completed, official 2026 F1 qualifying observations enter this split.
 * The holdout was fixed before comparing the new model and must not be moved
 * in response to its errors.
 */
export const F1_PHYSICS_VALIDATION_SPLIT = {
  calibration: [
    'albert-park-approx',
    'suzuka-approx',
    'miami-approx',
    'barcelona-approx',
    'red-bull-ring-approx',
  ],
  holdout: [
    'shanghai-approx',
    'montreal-approx',
    'monaco-approx',
    'silverstone-approx',
    'spa-approx',
    'hungaroring-approx',
  ],
} as const

export type PhysicsValidationSplit = keyof typeof F1_PHYSICS_VALIDATION_SPLIT

export type LapTimeObservation = {
  eventId: string
  observedLapSeconds: number
  series: EventPaceCalibration['series']
  sourceUrls: string[]
  split: PhysicsValidationSplit
  trackId: string
}

/** Return the checked-in observations without estimated future-event targets. */
export function f1QualifyingLapObservations(
  records: readonly EventPaceCalibration[] = f1PaceCalibration2026,
): LapTimeObservation[] {
  const splitByTrack = new Map<string, PhysicsValidationSplit>()

  for (const split of ['calibration', 'holdout'] as const) {
    for (const trackId of F1_PHYSICS_VALIDATION_SPLIT[split]) {
      if (splitByTrack.has(trackId)) {
        throw new Error(`Physics validation split overlaps at ${trackId}`)
      }

      splitByTrack.set(trackId, split)
    }
  }

  const selected = records.filter(
    (record) =>
      record.series === 'f1-custom' && splitByTrack.has(record.trackId),
  )

  for (const trackId of splitByTrack.keys()) {
    const matches = selected.filter((record) => record.trackId === trackId)

    if (matches.length !== 1) {
      throw new Error(
        `Expected one official F1 qualifying observation for ${trackId}`,
      )
    }

    if (matches[0].qualifying.status !== 'official') {
      throw new Error(`${trackId} is not an official qualifying observation`)
    }
  }

  return selected
    .map((record) => ({
      eventId: record.eventId,
      observedLapSeconds: record.qualifying.selectedReferenceSeconds,
      series: record.series,
      sourceUrls: record.sources.map((source) => source.url),
      split: splitByTrack.get(record.trackId)!,
      trackId: record.trackId,
    }))
    .sort((left, right) => left.trackId.localeCompare(right.trackId))
}

export type SpeedObservation = {
  eventId: string
  /** Median of the individual cars' own peaks; robust to one stray sample. */
  observedDriverPeakMedianKph: number
  /** Maximum over the classified field's car telemetry for the session. */
  observedFieldPeakKph: number
  sourceUrls: string[]
  telemetrySampleCount: number
  trackId: string
}

/**
 * Observed qualifying straight-line peaks, for circuits that carry one.
 *
 * Qualifying rather than race, because it is the cleanest drag observable:
 * low fuel, attack setup, and effectively no tow. The FIA speed trap is
 * deliberately not used — it reads one fixed point on one straight, so it is
 * not a lap-wide peak and comparing a simulated peak against it understates
 * the model. Coverage is partial by design: a circuit whose sessions have not
 * run has no reference, and is absent rather than estimated.
 */
export function f1QualifyingSpeedObservations(
  records: readonly EventPaceCalibration[] = f1PaceCalibration2026,
): SpeedObservation[] {
  return records
    .filter(
      (record): record is EventPaceCalibration &
        Required<Pick<EventPaceCalibration, 'speed'>> =>
        record.series === 'f1-custom' &&
        record.speed !== undefined &&
        typeof record.speed.qualifyingFieldPeakKph === 'number' &&
        typeof record.speed.qualifyingDriverPeakMedianKph === 'number',
    )
    .map((record) => ({
      eventId: record.eventId,
      observedDriverPeakMedianKph: record.speed.qualifyingDriverPeakMedianKph!,
      observedFieldPeakKph: record.speed.qualifyingFieldPeakKph!,
      sourceUrls: record.sources.map((source) => source.url),
      telemetrySampleCount: record.speed.telemetrySampleCount,
      trackId: record.trackId,
    }))
    .sort((left, right) => left.trackId.localeCompare(right.trackId))
}

export type PaceCalibrationEvidenceSummary = {
  compoundMedianRecords: number
  eventRecords: number
  f1EventRecords: number
  officialQualifyingRecords: number
  observedFuelGainRecords: number
  observedRaceRecords: number
  observedTyreDegradationRecords: number
  estimatedQualifyingRecords: number
  estimatedRaceRecords: number
  courseReferenceRecords: number
}

export function summarizePaceCalibrationEvidence(
  records: readonly EventPaceCalibration[],
): PaceCalibrationEvidenceSummary {
  const f1Records = records.filter((record) => record.series === 'f1-custom')

  return {
    compoundMedianRecords: f1Records.filter(
      (record) =>
        record.race.status === 'observed' &&
        Object.keys(record.race.compoundMedianSeconds).length > 0,
    ).length,
    courseReferenceRecords: f1Records.filter(
      (record) => record.courseReference === true,
    ).length,
    estimatedQualifyingRecords: f1Records.filter(
      (record) => record.qualifying.status === 'estimated',
    ).length,
    estimatedRaceRecords: f1Records.filter(
      (record) => record.race.status === 'estimated',
    ).length,
    eventRecords: records.length,
    f1EventRecords: f1Records.length,
    observedFuelGainRecords: f1Records.filter(
      (record) =>
        record.race.status === 'observed' &&
        record.race.fuelGainPerLapSeconds !== null,
    ).length,
    observedRaceRecords: f1Records.filter(
      (record) => record.race.status === 'observed',
    ).length,
    observedTyreDegradationRecords: f1Records.filter(
      (record) =>
        record.race.status === 'observed' &&
        record.race.tireDegradationPerLapSeconds !== null,
    ).length,
    officialQualifyingRecords: f1Records.filter(
      (record) => record.qualifying.status === 'official',
    ).length,
  }
}

export type LapTimePrediction = {
  predictedLapSeconds: number
  trackId: string
}

export type LapErrorSample = LapTimeObservation & {
  absoluteErrorSeconds: number
  absolutePercentageError: number
  errorSeconds: number
  lapRatio: number
  predictedLapSeconds: number
}

export type LapErrorExtreme = Pick<
  LapErrorSample,
  | 'absoluteErrorSeconds'
  | 'absolutePercentageError'
  | 'errorSeconds'
  | 'observedLapSeconds'
  | 'predictedLapSeconds'
  | 'trackId'
>

export type LapErrorSummary = {
  fastestPrediction: LapErrorExtreme
  meanAbsoluteErrorSeconds: number
  meanLapRatio: number
  meanPercentageError: number
  mapePercent: number
  sampleCount: number
  samples: LapErrorSample[]
  smallestAbsoluteError: LapErrorExtreme
  worstAbsoluteError: LapErrorExtreme
}

const finitePositive = (value: number) =>
  Number.isFinite(value) && value > 0

const extremeFrom = (sample: LapErrorSample): LapErrorExtreme => ({
  absoluteErrorSeconds: sample.absoluteErrorSeconds,
  absolutePercentageError: sample.absolutePercentageError,
  errorSeconds: sample.errorSeconds,
  observedLapSeconds: sample.observedLapSeconds,
  predictedLapSeconds: sample.predictedLapSeconds,
  trackId: sample.trackId,
})

export function compareLapTimes(
  observations: readonly LapTimeObservation[],
  predictions: readonly LapTimePrediction[],
): LapErrorSummary {
  if (observations.length === 0) {
    throw new Error('Lap comparison needs at least one observation')
  }

  const observedTrackIds = new Set<string>()

  for (const observation of observations) {
    if (
      !finitePositive(observation.observedLapSeconds) ||
      observedTrackIds.has(observation.trackId)
    ) {
      throw new Error(
        `Invalid or duplicate observation for ${observation.trackId}`,
      )
    }

    observedTrackIds.add(observation.trackId)
  }

  const predictionsByTrack = new Map<string, number>()

  for (const prediction of predictions) {
    if (
      !finitePositive(prediction.predictedLapSeconds) ||
      predictionsByTrack.has(prediction.trackId)
    ) {
      throw new Error(`Invalid or duplicate prediction for ${prediction.trackId}`)
    }

    predictionsByTrack.set(prediction.trackId, prediction.predictedLapSeconds)
  }

  const samples = observations.map((observation): LapErrorSample => {
    const predictedLapSeconds = predictionsByTrack.get(observation.trackId)

    if (predictedLapSeconds === undefined) {
      throw new Error(`Missing lap prediction for ${observation.trackId}`)
    }

    const errorSeconds = predictedLapSeconds - observation.observedLapSeconds
    const lapRatio = predictedLapSeconds / observation.observedLapSeconds

    return {
      ...observation,
      absoluteErrorSeconds: Math.abs(errorSeconds),
      absolutePercentageError: Math.abs(lapRatio - 1) * 100,
      errorSeconds,
      lapRatio,
      predictedLapSeconds,
    }
  })
  const mean = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0) / values.length
  const byAbsoluteError = [...samples].sort(
    (left, right) => left.absoluteErrorSeconds - right.absoluteErrorSeconds,
  )
  const byPredictedLap = [...samples].sort(
    (left, right) => left.predictedLapSeconds - right.predictedLapSeconds,
  )

  return {
    fastestPrediction: extremeFrom(byPredictedLap[0]),
    meanAbsoluteErrorSeconds: mean(
      samples.map((sample) => sample.absoluteErrorSeconds),
    ),
    meanLapRatio: mean(samples.map((sample) => sample.lapRatio)),
    meanPercentageError: mean(
      samples.map((sample) => (sample.lapRatio - 1) * 100),
    ),
    mapePercent: mean(
      samples.map((sample) => sample.absolutePercentageError),
    ),
    sampleCount: samples.length,
    samples,
    smallestAbsoluteError: extremeFrom(byAbsoluteError[0]),
    worstAbsoluteError: extremeFrom(byAbsoluteError.at(-1)!),
  }
}

export type CategoryLapPrediction = {
  categoryId: string
  lapTimeSeconds: number
  trackId: string
  trackLengthKm: number
}

export type CategoryRankingEntry = {
  categoryId: string
  combinedAverageSpeedKph: number
  rank: number
  sampleCount: number
  totalLapSeconds: number
}

/** Rank categories only across an identical set of circuits. */
export function rankCategoryPace(
  predictions: readonly CategoryLapPrediction[],
): CategoryRankingEntry[] {
  const byCategory = new Map<string, CategoryLapPrediction[]>()

  for (const prediction of predictions) {
    if (
      prediction.categoryId.length === 0 ||
      !finitePositive(prediction.lapTimeSeconds) ||
      !finitePositive(prediction.trackLengthKm)
    ) {
      throw new Error(`Invalid category prediction for ${prediction.trackId}`)
    }

    const samples = byCategory.get(prediction.categoryId) ?? []

    if (samples.some((sample) => sample.trackId === prediction.trackId)) {
      throw new Error(
        `Duplicate category prediction for ${prediction.categoryId}:${prediction.trackId}`,
      )
    }

    samples.push(prediction)
    byCategory.set(prediction.categoryId, samples)
  }

  if (byCategory.size === 0) {
    return []
  }

  const firstSamples = byCategory.values().next().value!
  const firstTrackSet = new Set(firstSamples.map((sample) => sample.trackId))
  const trackLengthById = new Map(
    firstSamples.map((sample) => [sample.trackId, sample.trackLengthKm]),
  )

  for (const [categoryId, samples] of byCategory) {
    const trackSet = new Set(samples.map((sample) => sample.trackId))

    if (
      trackSet.size !== firstTrackSet.size ||
      [...firstTrackSet].some((trackId) => !trackSet.has(trackId)) ||
      samples.some(
        (sample) =>
          Math.abs(
            sample.trackLengthKm -
              (trackLengthById.get(sample.trackId) ?? Number.NaN),
          ) > 1e-9,
      )
    ) {
      throw new Error(`${categoryId} does not cover the common track set`)
    }
  }

  return [...byCategory]
    .map(([categoryId, samples]) => {
      const totalLapSeconds = samples.reduce(
        (total, sample) => total + sample.lapTimeSeconds,
        0,
      )
      const totalDistanceKm = samples.reduce(
        (total, sample) => total + sample.trackLengthKm,
        0,
      )

      return {
        categoryId,
        combinedAverageSpeedKph: (totalDistanceKm / totalLapSeconds) * 3_600,
        rank: 0,
        sampleCount: samples.length,
        totalLapSeconds,
      }
    })
    .sort(
      (left, right) =>
        right.combinedAverageSpeedKph - left.combinedAverageSpeedKph,
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

export const REQUIRED_VALIDATION_DOMAINS = [
  'maximum-speed',
  'minimum-corner-speed',
  'zero-to-100-acceleration',
  'zero-to-200-acceleration',
  'braking-distance',
  'fuel-mass-sensitivity',
  'wet-pace-sensitivity',
  'deployment-power-sensitivity',
  'state-of-charge',
  'tyre-behaviour',
  'driver-dispersion',
  'overtake-rate',
  'contact-rate',
  'finish-rate',
  'finishing-order',
  'seed-determinism',
  'long-run-stability',
] as const

export type PhysicsValidationDomain =
  (typeof REQUIRED_VALIDATION_DOMAINS)[number]

export type ValidationEvidence = {
  basis: string
  modelValue: unknown
  observedValue: unknown | null
  sampleCount: number
  unit: string
}

export type AvailableValidationMetric = ValidationEvidence & {
  status: 'available'
  value: {
    modelValue: unknown
    observedValue: unknown
  }
}

export type UnavailableValidationMetric = {
  basis: string
  modelValue: unknown | null
  observedValue: null
  reason: string
  sampleCount: number
  status: 'unavailable'
  unit: string
  value: null
}

export type ValidationMetric =
  | AvailableValidationMetric
  | UnavailableValidationMetric

export type PhysicsValidationReport = {
  categoryRanking: CategoryRankingEntry[]
  evidence: Record<PhysicsValidationDomain, ValidationMetric>
  fitPerformed: false
  lap: {
    calibration: LapErrorSummary
    holdout: LapErrorSummary
    overall: LapErrorSummary
  }
  policy: 'read-only-observation-comparison'
  trackSpecificMultiplierCount: 0
}

export function unavailableValidationMetric(
  reason: string,
  modelValue: unknown | null = null,
  basis = 'No checked observational target',
  unit = 'unavailable',
): UnavailableValidationMetric {
  return {
    basis,
    modelValue,
    observedValue: null,
    reason,
    sampleCount: 0,
    status: 'unavailable',
    unit,
    value: null,
  }
}

function validationMetricFor(
  domain: PhysicsValidationDomain,
  evidence: Partial<Record<PhysicsValidationDomain, ValidationEvidence>>,
): ValidationMetric {
  const supplied = evidence[domain]

  if (
    !supplied ||
    supplied.observedValue === null ||
    supplied.observedValue === undefined ||
    supplied.modelValue === null ||
    supplied.modelValue === undefined
  ) {
    return unavailableValidationMetric(
      `No independent observed target is available for ${domain}`,
      supplied?.modelValue ?? null,
      supplied?.basis,
      supplied?.unit,
    )
  }

  if (!Number.isSafeInteger(supplied.sampleCount) || supplied.sampleCount < 1) {
    throw new Error(`${domain} evidence has no samples`)
  }

  return {
    ...supplied,
    status: 'available',
    value: {
      modelValue: supplied.modelValue,
      observedValue: supplied.observedValue,
    },
  }
}

export function buildPhysicsValidationReport(options: {
  categoryPredictions?: readonly CategoryLapPrediction[]
  evidence?: Partial<Record<PhysicsValidationDomain, ValidationEvidence>>
  observations: readonly LapTimeObservation[]
  predictions: readonly LapTimePrediction[]
}): PhysicsValidationReport {
  const calibration = options.observations.filter(
    (observation) => observation.split === 'calibration',
  )
  const holdout = options.observations.filter(
    (observation) => observation.split === 'holdout',
  )

  if (calibration.length === 0 || holdout.length === 0) {
    throw new Error('Physics validation requires calibration and holdout samples')
  }

  const evidence = options.evidence ?? {}

  return {
    categoryRanking: rankCategoryPace(options.categoryPredictions ?? []),
    evidence: Object.fromEntries(
      REQUIRED_VALIDATION_DOMAINS.map((domain) => [
        domain,
        validationMetricFor(domain, evidence),
      ]),
    ) as Record<PhysicsValidationDomain, ValidationMetric>,
    fitPerformed: false,
    lap: {
      calibration: compareLapTimes(calibration, options.predictions),
      holdout: compareLapTimes(holdout, options.predictions),
      overall: compareLapTimes(options.observations, options.predictions),
    },
    policy: 'read-only-observation-comparison',
    trackSpecificMultiplierCount: 0,
  }
}
