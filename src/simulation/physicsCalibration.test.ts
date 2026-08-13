import { describe, expect, it } from 'vitest'
import { f1PaceCalibration2026 } from '../data/paceCalibration'
import {
  buildPhysicsValidationReport,
  compareLapTimes,
  F1_PHYSICS_VALIDATION_SPLIT,
  f1QualifyingLapObservations,
  f1QualifyingSpeedObservations,
  PHYSICS_CALIBRATION_PARAMETERS,
  rankCategoryPace,
  REQUIRED_VALIDATION_DOMAINS,
  summarizePaceCalibrationEvidence,
  validatePhysicsCalibrationCandidates,
  type LapTimeObservation,
} from './physicsCalibration'

const observation = (
  trackId: string,
  split: LapTimeObservation['split'],
  observedLapSeconds: number,
): LapTimeObservation => ({
  eventId: `event-${trackId}`,
  observedLapSeconds,
  series: 'f1-custom',
  sourceUrls: ['https://example.com/official-result'],
  split,
  trackId,
})

describe('physics calibration policy', () => {
  it('classifies only global or category physical parameters', () => {
    expect(PHYSICS_CALIBRATION_PARAMETERS.length).toBeGreaterThan(10)
    expect(
      PHYSICS_CALIBRATION_PARAMETERS.every(
        (parameter) =>
          parameter.scope === 'global' || parameter.scope === 'category',
      ),
    ).toBe(true)
    expect(JSON.stringify(PHYSICS_CALIBRATION_PARAMETERS)).not.toMatch(
      /trackId|paceScale|baseLapTime|lapTimeMultiplier/,
    )
    const keys = PHYSICS_CALIBRATION_PARAMETERS.map(
      (parameter) => parameter.key,
    )
    expect(keys).toEqual(
      expect.arrayContaining(['otherSessionBaseKg', 'qualifyingBaseKg']),
    )
    expect(keys).not.toContain('minimumMassKg')
  })

  it('accepts bounded physical candidates without changing them', () => {
    const candidates = validatePhysicsCalibrationCandidates([
      {
        categoryId: 'f1-custom',
        parameterKey: 'dragAreaScale',
        scope: 'category',
        value: 1.02,
      },
      {
        parameterKey: 'DRIVER_TRANSIENT_EFFICIENCY',
        scope: 'global',
        value: 0.97,
      },
    ])

    expect(candidates).toEqual([
      {
        categoryId: 'f1-custom',
        parameterKey: 'dragAreaScale',
        scope: 'category',
        value: 1.02,
      },
      {
        parameterKey: 'DRIVER_TRANSIENT_EFFICIENCY',
        scope: 'global',
        value: 0.97,
      },
    ])
  })

  it('rejects fixed, track-specific, duplicate and unphysical candidates', () => {
    expect(() =>
      validatePhysicsCalibrationCandidates([
        {
          categoryId: 'f1-custom',
          parameterKey: 'otherSessionBaseKg',
          scope: 'category',
          value: 724,
        },
      ]),
    ).toThrow(/fixed physical input/)
    expect(() =>
      validatePhysicsCalibrationCandidates([
        {
          categoryId: 'f1-custom',
          parameterKey: 'dragAreaScale',
          scope: 'category',
          trackId: 'monza-approx',
          value: 1,
        },
      ]),
    ).toThrow(/prohibited trackId/)
    expect(() =>
      validatePhysicsCalibrationCandidates([
        {
          categoryId: 'monza-approx',
          parameterKey: 'dragAreaScale',
          scope: 'category',
          value: 1,
        },
      ]),
    ).toThrow(/invalid category dimension/)
    expect(() =>
      validatePhysicsCalibrationCandidates([
        {
          categoryId: 'f1-custom',
          parameterKey: 'dragAreaScale',
          scope: 'category',
          value: 1,
        },
        {
          categoryId: 'f1-custom',
          parameterKey: 'dragAreaScale',
          scope: 'category',
          value: 1.1,
        },
      ]),
    ).toThrow(/Duplicate/)
    expect(() =>
      validatePhysicsCalibrationCandidates([
        {
          categoryId: 'f1-custom',
          parameterKey: 'tyreLoadSensitivity',
          scope: 'category',
          value: 4,
        },
      ]),
    ).toThrow(/physical bounds/)
  })
})

describe('2026 observation split', () => {
  it('keeps calibration and holdout circuits disjoint', () => {
    const calibration = new Set<string>(
      F1_PHYSICS_VALIDATION_SPLIT.calibration,
    )
    const holdout = new Set<string>(F1_PHYSICS_VALIDATION_SPLIT.holdout)

    expect([...calibration].some((trackId) => holdout.has(trackId))).toBe(
      false,
    )
  })

  it('uses every checked official F1 qualifying result and no estimates', () => {
    const observations = f1QualifyingLapObservations()
    const official = f1PaceCalibration2026.filter(
      (record) => record.qualifying.status === 'official',
    )

    expect(observations).toHaveLength(11)
    expect(observations).toHaveLength(official.length)
    expect(observations.every((sample) => sample.sourceUrls.length > 0)).toBe(
      true,
    )
    expect(
      new Set(observations.map((sample) => sample.trackId)),
    ).toEqual(new Set(official.map((record) => record.trackId)))
  })

  it('reports the actual checked-in evidence without inventing observations', () => {
    expect(summarizePaceCalibrationEvidence(f1PaceCalibration2026)).toEqual({
      compoundMedianRecords: 10,
      courseReferenceRecords: 4,
      estimatedQualifyingRecords: 15,
      estimatedRaceRecords: 16,
      eventRecords: 26,
      f1EventRecords: 26,
      observedFuelGainRecords: 0,
      observedRaceRecords: 10,
      observedTyreDegradationRecords: 10,
      officialQualifyingRecords: 11,
    })
  })
})

describe('physics validation metrics', () => {
  const observations = [
    observation('calibration-a', 'calibration', 100),
    observation('calibration-b', 'calibration', 80),
    observation('holdout-a', 'holdout', 120),
  ]
  const predictions = [
    { predictedLapSeconds: 102, trackId: 'calibration-a' },
    { predictedLapSeconds: 76, trackId: 'calibration-b' },
    { predictedLapSeconds: 126, trackId: 'holdout-a' },
  ]

  it('reports ratio, MAPE and both error extremes', () => {
    const summary = compareLapTimes(observations, predictions)

    expect(summary.sampleCount).toBe(3)
    expect(summary.meanLapRatio).toBeCloseTo(1.006_666_667, 8)
    expect(summary.mapePercent).toBeCloseTo(4, 8)
    expect(summary.meanAbsoluteErrorSeconds).toBe(4)
    expect(summary.smallestAbsoluteError.trackId).toBe('calibration-a')
    expect(summary.worstAbsoluteError.trackId).toBe('holdout-a')
    expect(summary.fastestPrediction.trackId).toBe('calibration-b')
  })

  it('ranks categories on the same circuits by distance over time', () => {
    const ranking = rankCategoryPace([
      {
        categoryId: 'f1-custom',
        lapTimeSeconds: 90,
        trackId: 'one',
        trackLengthKm: 5,
      },
      {
        categoryId: 'f1-custom',
        lapTimeSeconds: 100,
        trackId: 'two',
        trackLengthKm: 6,
      },
      {
        categoryId: 'super-formula',
        lapTimeSeconds: 96,
        trackId: 'one',
        trackLengthKm: 5,
      },
      {
        categoryId: 'super-formula',
        lapTimeSeconds: 108,
        trackId: 'two',
        trackLengthKm: 6,
      },
    ])

    expect(ranking.map((entry) => entry.categoryId)).toEqual([
      'f1-custom',
      'super-formula',
    ])
    expect(ranking.map((entry) => entry.rank)).toEqual([1, 2])
  })

  it('marks every unobserved domain unavailable with a null result', () => {
    const report = buildPhysicsValidationReport({
      evidence: {
        'contact-rate': {
          basis: 'Missing value must not be promoted',
          modelValue: 0.02,
          observedValue: undefined,
          sampleCount: 10,
          unit: 'contacts/start',
        },
        'fuel-mass-sensitivity': {
          basis: 'Model-only mass perturbation',
          modelValue: 1.012,
          observedValue: null,
          sampleCount: 1,
          unit: 'lap ratio',
        },
      },
      observations,
      predictions,
    })

    expect(report.fitPerformed).toBe(false)
    expect(report.trackSpecificMultiplierCount).toBe(0)
    expect(Object.keys(report.evidence)).toEqual([
      ...REQUIRED_VALIDATION_DOMAINS,
    ])

    for (const metric of Object.values(report.evidence)) {
      expect(metric.status).toBe('unavailable')
      expect(metric.value).toBeNull()
      expect(metric.observedValue).toBeNull()
    }

    expect(report.evidence['fuel-mass-sensitivity'].modelValue).toBe(1.012)
    expect(report.evidence['contact-rate'].status).toBe('unavailable')
  })

  it('reports supplied independent evidence without turning it into a fit', () => {
    const report = buildPhysicsValidationReport({
      evidence: {
        'seed-determinism': {
          basis: 'Repeated fixed-seed state hash',
          modelValue: true,
          observedValue: true,
          sampleCount: 20,
          unit: 'boolean',
        },
      },
      observations,
      predictions,
    })

    expect(report.evidence['seed-determinism']).toMatchObject({
      modelValue: true,
      observedValue: true,
      status: 'available',
      value: { modelValue: true, observedValue: true },
    })
    expect(report.fitPerformed).toBe(false)
  })
})

describe('observed straight-line speed references', () => {
  it('reads only circuits that carry a checked-in observation', () => {
    const observations = f1QualifyingSpeedObservations(f1PaceCalibration2026)
    const withSpeed = f1PaceCalibration2026.filter(
      (record) =>
        record.speed !== undefined &&
        typeof record.speed.qualifyingFieldPeakKph === 'number',
    )

    expect(observations.length).toBe(withSpeed.length)
    expect(observations.length).toBeGreaterThan(0)
    // Coverage is partial by design; an unrun event must not be invented.
    expect(observations.length).toBeLessThan(f1PaceCalibration2026.length)
  })

  it('keeps every observation physically ordered and sourced', () => {
    f1QualifyingSpeedObservations(f1PaceCalibration2026).forEach(
      (observation) => {
        // The field maximum is taken over every car, so a median of the cars'
        // own peaks can never exceed it.
        expect(
          observation.observedDriverPeakMedianKph,
          observation.trackId,
        ).toBeLessThanOrEqual(observation.observedFieldPeakKph)
        expect(observation.telemetrySampleCount).toBeGreaterThan(0)
        expect(observation.sourceUrls.length).toBeGreaterThan(0)
        expect(observation.observedFieldPeakKph).toBeGreaterThan(150)
        expect(observation.observedFieldPeakKph).toBeLessThan(400)
      },
    )
  })

  it('does not use the FIA speed trap as a peak', () => {
    // The trap reads one fixed point on one straight. Suzuka 2026 is the
    // standing example: 308 km/h at the trap against a 339 km/h lap peak.
    const suzuka = f1PaceCalibration2026.find(
      (record) => record.trackId === 'suzuka-approx',
    )!
    const observation = f1QualifyingSpeedObservations(f1PaceCalibration2026).find(
      (entry) => entry.trackId === 'suzuka-approx',
    )!

    expect(suzuka.speed?.raceTrapMaxKph).toBeLessThan(
      suzuka.speed!.raceFieldPeakKph!,
    )
    expect(observation.observedFieldPeakKph).toBe(
      suzuka.speed!.qualifyingFieldPeakKph,
    )
  })
})
