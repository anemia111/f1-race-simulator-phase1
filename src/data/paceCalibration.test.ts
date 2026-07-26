import { describe, expect, it } from 'vitest'
import type { EventPaceCalibration } from '../types'
import {
  allPaceCalibration2026,
  f1PaceCalibration2026,
  paceCalibrationFor,
  paceCalibrationManifest,
  selectPaceCalibration,
  superFormulaPaceCalibration2026,
  validatePaceCalibrationRecords,
} from './paceCalibration'

const clone = <T>(value: T): T => structuredClone(value)

describe('pace calibration data', () => {
  it('matches the checked manifest and validates both series schemas', () => {
    expect(paceCalibrationManifest.eventCount).toBe(
      allPaceCalibration2026.length,
    )
    expect(
      validatePaceCalibrationRecords(
        clone(f1PaceCalibration2026),
        'f1-custom',
      ),
    ).toHaveLength(22)
    expect(
      validatePaceCalibrationRecords(
        clone(superFormulaPaceCalibration2026),
        'super-formula',
      ),
    ).toHaveLength(5)
  })

  it('rejects invalid times, confidence, URLs, and retrieval dates', () => {
    const invalidTime = clone(f1PaceCalibration2026)
    invalidTime[0].qualifying.selectedReferenceSeconds = Number.NaN
    expect(() =>
      validatePaceCalibrationRecords(invalidTime, 'f1-custom'),
    ).toThrow(/qualifying reference/)

    const invalidSource = clone(f1PaceCalibration2026)
    invalidSource[0].sources[0].url = 'http://example.invalid'
    expect(() =>
      validatePaceCalibrationRecords(invalidSource, 'f1-custom'),
    ).toThrow(/source provenance/)

    const invalidConfidence = clone(f1PaceCalibration2026)
    invalidConfidence[0].race.confidence = 1.1
    expect(() =>
      validatePaceCalibrationRecords(invalidConfidence, 'f1-custom'),
    ).toThrow(/race confidence/)

    const invalidDate = clone(f1PaceCalibration2026)
    invalidDate[0].sources[0].retrievedAt = 'not-a-date'
    expect(() =>
      validatePaceCalibrationRecords(invalidDate, 'f1-custom'),
    ).toThrow(/source provenance/)

    const invalidRange = clone(f1PaceCalibration2026)
    invalidRange[0].qualifying.referenceRangeSeconds = [80, 81]
    expect(() =>
      validatePaceCalibrationRecords(invalidRange, 'f1-custom'),
    ).toThrow(/reference outside range/)

    const duplicateSource = clone(f1PaceCalibration2026)
    duplicateSource[0].sources.push(
      clone(duplicateSource[0].sources[0]),
    )
    expect(() =>
      validatePaceCalibrationRecords(duplicateSource, 'f1-custom'),
    ).toThrow(/duplicate source provenance/)
  })

  it('rejects duplicate event identities but permits the same track across series', () => {
    const duplicate = [
      clone(f1PaceCalibration2026[0]),
      clone(f1PaceCalibration2026[0]),
    ]

    expect(() =>
      validatePaceCalibrationRecords(duplicate, 'f1-custom'),
    ).toThrow(/duplicate eventId/)
    expect(paceCalibrationFor('f1-custom', 'suzuka-approx')?.series).toBe(
      'f1-custom',
    )
    expect(
      paceCalibrationFor('super-formula', 'suzuka-approx')?.series,
    ).toBe('super-formula')
  })

  it('prefers an official event over an estimate for the same series and track', () => {
    const official = clone(f1PaceCalibration2026[0])
    const estimate = clone(official)
    estimate.eventId = `${official.eventId}-estimate`
    estimate.qualifying.status = 'estimated'
    estimate.qualifying.confidence = 0.2
    estimate.race.status = 'estimated'
    estimate.race.confidence = 0.2

    expect(
      selectPaceCalibration(
        [estimate, official] as EventPaceCalibration[],
        'f1-custom',
        official.trackId,
      )?.eventId,
    ).toBe(official.eventId)
  })

  it('keeps source state, hashes, and sample confidence reader-auditable', () => {
    const completed = f1PaceCalibration2026.filter(
      (record) => record.race.status === 'observed',
    )

    expect(
      completed.every(
        (record) =>
          record.sources.some(
            (source) =>
              source.provider === 'OpenF1' &&
              source.sessionKey !== undefined &&
              source.documentHash?.startsWith('sha256:'),
          ) &&
          record.race.cleanLapCount > 0 &&
          record.race.confidence > 0.5,
      ),
    ).toBe(true)
  })
})
