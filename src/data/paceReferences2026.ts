import type {
  CalibrationStatus,
  EventPaceCalibration,
  TrackDefinition,
} from '../types'
import {
  f1PaceCalibration2026,
  paceCalibrationFor,
  superFormulaPaceCalibration2026,
} from './paceCalibration'

type PaceReference = NonNullable<TrackDefinition['paceReference2026']>

function legacyBasisFor(
  status: CalibrationStatus,
): PaceReference['qualifyingBasis'] {
  switch (status) {
    case 'official':
      return 'official-result'
    case 'observed':
      return 'observed'
    case 'derived':
      return 'derived'
    case 'estimated':
    case 'unverified':
      return 'estimate'
  }
}

function sourceFor(calibration: EventPaceCalibration) {
  return (
    calibration.sources.find((source) => source.provider !== 'OpenF1') ??
    calibration.sources[0]
  )
}

export function paceReferenceFromCalibration(
  calibration: EventPaceCalibration,
): PaceReference {
  const source = sourceFor(calibration)
  const winnerAverage =
    calibration.race.winnerAverageSeconds ??
    calibration.race.greenLapMedianSeconds ??
    calibration.race.cleanLapReferenceSeconds ??
    calibration.qualifying.selectedReferenceSeconds +
      calibration.simulation.expectedGreenRaceDeltaSeconds
  const qualifyingRange =
    calibration.qualifying.referenceRangeSeconds

  return {
    qualifyingBasis: legacyBasisFor(calibration.qualifying.status),
    qualifyingSeconds: calibration.qualifying.selectedReferenceSeconds,
    ...(qualifyingRange
      ? { qualifyingRangeSeconds: qualifyingRange }
      : {}),
    raceAverageBasis:
      calibration.race.winnerAverageSeconds !== null &&
      calibration.race.status !== 'estimated'
        ? 'official-result'
        : legacyBasisFor(calibration.race.status),
    raceAverageSeconds: winnerAverage,
    ...(calibration.race.referenceRangeSeconds
      ? {
          raceAverageRangeSeconds:
            calibration.race.referenceRangeSeconds,
        }
      : {}),
    series: calibration.series,
    sourceLabel: source.label,
    sourceUrl: source.url,
    note: calibration.notes[0],
    calibration,
  }
}

export const f1PaceReferences2026: Record<string, PaceReference> =
  Object.fromEntries(
    f1PaceCalibration2026.map((calibration) => [
      calibration.trackId,
      paceReferenceFromCalibration(calibration),
    ]),
  )

export const superFormulaPaceReferences2026: Record<
  string,
  PaceReference
> = Object.fromEntries(
  superFormulaPaceCalibration2026.map((calibration) => [
    calibration.trackId,
    paceReferenceFromCalibration(calibration),
  ]),
)

export function paceReference2026For(
  series: PaceReference['series'],
  trackId: string,
) {
  const calibration = paceCalibrationFor(series, trackId)
  return calibration
    ? paceReferenceFromCalibration(calibration)
    : undefined
}

/**
 * Runtime consumes an offline, event-specific neutral baseline produced by
 * the fixed-seed calibration script. Missing data keeps the circuit's checked
 * fallback instead of applying a category-wide multiplier.
 */
export function simulationBaseLapTimeForPaceReference(
  reference: PaceReference | undefined,
  fallbackSeconds: number,
) {
  const calibrated =
    reference?.calibration.simulation.neutralBaseLapSeconds

  return calibrated !== undefined &&
    Number.isFinite(calibrated) &&
    calibrated >= 35 &&
    calibrated <= 300
    ? Number(calibrated.toFixed(3))
    : fallbackSeconds
}
