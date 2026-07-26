import type {
  CalibrationStatus,
  EventPaceCalibration,
} from '../types'
import f1CalibrationJson from './calibration/f1PaceCalibration2026.json'
import calibrationManifestJson from './calibration/paceCalibrationManifest.json'
import superFormulaCalibrationJson from './calibration/superFormulaPaceCalibration2026.json'
import type { PaceCalibrationManifest } from './paceCalibrationTypes'

const calibrationStatuses = new Set<CalibrationStatus>([
  'official',
  'observed',
  'derived',
  'estimated',
  'unverified',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function assertFiniteSeconds(
  value: unknown,
  label: string,
  nullable = false,
) {
  if (nullable && value === null) {
    return
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 35 ||
    value > 300
  ) {
    throw new Error(`Invalid ${label}: expected 35-300 seconds`)
  }
}

function assertConfidence(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`Invalid ${label}: expected confidence from 0 to 1`)
  }
}

function assertReferenceRange(
  value: unknown,
  reference: unknown,
  label: string,
) {
  if (value === undefined) {
    return
  }

  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof reference !== 'number' ||
    !Number.isFinite(reference)
  ) {
    throw new Error(`Invalid ${label}: expected bounded range`)
  }

  assertFiniteSeconds(value[0], `${label} lower bound`)
  assertFiniteSeconds(value[1], `${label} upper bound`)

  if (
    value[0] >= value[1] ||
    reference < value[0] ||
    reference > value[1]
  ) {
    throw new Error(`Invalid ${label}: reference outside range`)
  }
}

function assertStatus(
  value: unknown,
  label: string,
): asserts value is CalibrationStatus {
  if (
    typeof value !== 'string' ||
    !calibrationStatuses.has(value as CalibrationStatus)
  ) {
    throw new Error(`Invalid ${label}: unknown calibration status`)
  }
}

export function validatePaceCalibrationRecords(
  input: unknown,
  expectedSeries?: EventPaceCalibration['series'],
): EventPaceCalibration[] {
  if (!Array.isArray(input)) {
    throw new Error('Pace calibration must be an array')
  }

  const eventIds = new Set<string>()

  for (const [index, value] of input.entries()) {
    const label = `pace calibration record ${index}`

    if (!isRecord(value)) {
      throw new Error(`Invalid ${label}: expected object`)
    }

    if (value.schemaVersion !== 1 || value.season !== 2026) {
      throw new Error(`Invalid ${label}: unsupported schema or season`)
    }

    if (
      value.series !== 'f1-custom' &&
      value.series !== 'super-formula'
    ) {
      throw new Error(`Invalid ${label}: unsupported series`)
    }

    if (expectedSeries && value.series !== expectedSeries) {
      throw new Error(`Invalid ${label}: series mismatch`)
    }

    if (
      typeof value.eventId !== 'string' ||
      value.eventId.length < 3 ||
      eventIds.has(`${value.series}:${value.eventId}`)
    ) {
      throw new Error(`Invalid ${label}: missing or duplicate eventId`)
    }
    eventIds.add(`${value.series}:${value.eventId}`)

    if (
      typeof value.trackId !== 'string' ||
      typeof value.eventName !== 'string' ||
      typeof value.calibrationVersion !== 'string' ||
      typeof value.eventDate !== 'string' ||
      !Number.isFinite(Date.parse(value.eventDate))
    ) {
      throw new Error(`Invalid ${label}: identity metadata`)
    }

    if (
      typeof value.round !== 'number' ||
      !Number.isSafeInteger(value.round) ||
      value.round < 1
    ) {
      throw new Error(`Invalid ${label}: round`)
    }

    if (
      !isRecord(value.qualifying) ||
      !isRecord(value.race) ||
      !isRecord(value.simulation)
    ) {
      throw new Error(`Invalid ${label}: missing calibration section`)
    }

    assertFiniteSeconds(
      value.qualifying.selectedReferenceSeconds,
      `${label} qualifying reference`,
    )
    assertFiniteSeconds(
      value.qualifying.poleSeconds,
      `${label} qualifying pole`,
      true,
    )
    assertStatus(value.qualifying.status, `${label} qualifying status`)
    assertConfidence(
      value.qualifying.confidence,
      `${label} qualifying confidence`,
    )
    assertReferenceRange(
      value.qualifying.referenceRangeSeconds,
      value.qualifying.selectedReferenceSeconds,
      `${label} qualifying range`,
    )
    assertFiniteSeconds(
      value.race.cleanLapReferenceSeconds,
      `${label} clean race reference`,
      true,
    )
    assertFiniteSeconds(
      value.race.winnerAverageSeconds,
      `${label} winner average`,
      true,
    )
    assertStatus(value.race.status, `${label} race status`)
    assertConfidence(value.race.confidence, `${label} race confidence`)
    assertReferenceRange(
      value.race.referenceRangeSeconds,
      value.race.cleanLapReferenceSeconds,
      `${label} race range`,
    )
    assertFiniteSeconds(
      value.simulation.neutralBaseLapSeconds,
      `${label} neutral base`,
    )
    if (
      value.simulation.liveTimingProgressScale !== undefined &&
      (typeof value.simulation.liveTimingProgressScale !== 'number' ||
        !Number.isFinite(value.simulation.liveTimingProgressScale) ||
        value.simulation.liveTimingProgressScale < 0.7 ||
        value.simulation.liveTimingProgressScale > 1.3)
    ) {
      throw new Error(`Invalid ${label}: live timing progress scale`)
    }

    if (!Array.isArray(value.sources) || value.sources.length === 0) {
      throw new Error(`Invalid ${label}: source list`)
    }

    const sourceIdentities = new Set<string>()

    for (const source of value.sources) {
      if (
        !isRecord(source) ||
        typeof source.provider !== 'string' ||
        typeof source.label !== 'string' ||
        typeof source.url !== 'string' ||
        !/^https:\/\//.test(source.url) ||
        typeof source.retrievedAt !== 'string' ||
        !Number.isFinite(Date.parse(source.retrievedAt))
      ) {
        throw new Error(`Invalid ${label}: source provenance`)
      }

      const sourceIdentity = [
        source.provider,
        source.label,
        source.url,
        source.sessionKey ?? '',
      ].join('\u0000')

      if (sourceIdentities.has(sourceIdentity)) {
        throw new Error(`Invalid ${label}: duplicate source provenance`)
      }
      sourceIdentities.add(sourceIdentity)
    }
  }

  return input as EventPaceCalibration[]
}

function validateManifest(input: unknown): PaceCalibrationManifest {
  if (
    !isRecord(input) ||
    input.schemaVersion !== 1 ||
    input.season !== 2026 ||
    typeof input.calibrationVersion !== 'string' ||
    typeof input.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    typeof input.eventCount !== 'number' ||
    !Array.isArray(input.series) ||
    typeof input.generator !== 'string' ||
    typeof input.sourcePolicy !== 'string'
  ) {
    throw new Error('Invalid pace calibration manifest')
  }

  return input as PaceCalibrationManifest
}

export const f1PaceCalibration2026 = validatePaceCalibrationRecords(
  f1CalibrationJson,
  'f1-custom',
)

export const superFormulaPaceCalibration2026 =
  validatePaceCalibrationRecords(
    superFormulaCalibrationJson,
    'super-formula',
  )

export const paceCalibrationManifest = validateManifest(
  calibrationManifestJson,
)

export const allPaceCalibration2026 = [
  ...f1PaceCalibration2026,
  ...superFormulaPaceCalibration2026,
]

if (paceCalibrationManifest.eventCount !== allPaceCalibration2026.length) {
  throw new Error(
    'Pace calibration manifest eventCount does not match data files',
  )
}

const statusPriority: Record<CalibrationStatus, number> = {
  official: 5,
  observed: 4,
  derived: 3,
  estimated: 2,
  unverified: 1,
}

function selectionScore(calibration: EventPaceCalibration) {
  return (
    statusPriority[calibration.qualifying.status] * 10 +
    calibration.qualifying.confidence * 4 +
    statusPriority[calibration.race.status] * 2 +
    calibration.race.confidence +
    (calibration.race.cleanLapCount > 0 ? 2 : 0)
  )
}

export function paceCalibrationFor(
  series: EventPaceCalibration['series'],
  trackId: string,
) {
  return selectPaceCalibration(
    allPaceCalibration2026,
    series,
    trackId,
  )
}

export function selectPaceCalibration(
  records: EventPaceCalibration[],
  series: EventPaceCalibration['series'],
  trackId: string,
) {
  return records
    .filter(
      (calibration) =>
        calibration.series === series && calibration.trackId === trackId,
    )
    .sort((left, right) => {
      const scoreDelta = selectionScore(right) - selectionScore(left)

      return scoreDelta !== 0
        ? scoreDelta
        : Date.parse(right.eventDate) - Date.parse(left.eventDate)
    })[0]
}
