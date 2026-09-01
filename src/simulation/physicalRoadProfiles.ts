import type { TrackDefinition } from '../types'
import {
  measuredRoadProfiles,
  type MeasuredRoadProfile,
  type MeasuredRoadProfileField,
} from '../data/measuredRoadProfiles'
import type {
  PhysicalTrackFieldProvenance,
  PhysicalTrackSourceDate,
} from './physicalTrack'

type SourcedRoadValue = Readonly<{
  provenance: PhysicalTrackFieldProvenance
  value: number
}>

export type SourcedPhysicalRoadInputs = Readonly<{
  bankingDegrees: SourcedRoadValue | null
  elevationMeters: SourcedRoadValue | null
  gradeFraction: SourcedRoadValue | null
  usableWidthMeters: SourcedRoadValue | null
}>

type OfficialCornerRoadInput = Readonly<{
  bankingPercent: number
  counterBanking?: boolean
  cornerNumber: number
  lengthMeters: number
  widthEntryMeters: number
  widthExitMeters: number
}>

const MADRING_TECHNICAL_SOURCE = Object.freeze({
  sourceDate: {
    precision: 'unavailable',
    value: null,
  } as const satisfies PhysicalTrackSourceDate,
  sourceLabel:
    'MADRING official circuit technical information — corner length, width, banking and elevation/grade notes',
  sourceUrl: 'https://www.madring.com/en/circuit',
})

/**
 * Official MADRING values published per corner. Decimal commas are transcribed
 * as decimal points. Banking is published as road slope percent, not degrees;
 * the resolver converts it with atan(slope), retaining counter-banking signs.
 */
export const MADRING_OFFICIAL_CORNER_ROAD_INPUTS = Object.freeze([
  { bankingPercent: 3, cornerNumber: 1, lengthMeters: 16.92, widthEntryMeters: 15, widthExitMeters: 15 },
  { bankingPercent: 1, cornerNumber: 2, lengthMeters: 20.99, widthEntryMeters: 12.5, widthExitMeters: 12.5 },
  { bankingPercent: 3, counterBanking: true, cornerNumber: 3, lengthMeters: 139.73, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 2, cornerNumber: 4, lengthMeters: 432.55, widthEntryMeters: 12, widthExitMeters: 13 },
  { bankingPercent: 3, cornerNumber: 5, lengthMeters: 22.95, widthEntryMeters: 12, widthExitMeters: 13 },
  { bankingPercent: 3, cornerNumber: 6, lengthMeters: 31.53, widthEntryMeters: 12.09, widthExitMeters: 11.02 },
  { bankingPercent: 3, cornerNumber: 7, lengthMeters: 17.28, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 5, cornerNumber: 8, lengthMeters: 72.79, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 7, cornerNumber: 9, lengthMeters: 21.42, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 2, cornerNumber: 10, lengthMeters: 92.94, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 2, counterBanking: true, cornerNumber: 11, lengthMeters: 94.5, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 24, cornerNumber: 12, lengthMeters: 547.82, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 4, cornerNumber: 13, lengthMeters: 45.41, widthEntryMeters: 17, widthExitMeters: 12.1 },
  { bankingPercent: 3, counterBanking: true, cornerNumber: 14, lengthMeters: 76.06, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 3, cornerNumber: 15, lengthMeters: 209.7, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 2, counterBanking: true, cornerNumber: 16, lengthMeters: 40.54, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 4, cornerNumber: 17, lengthMeters: 14.69, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 2, cornerNumber: 18, lengthMeters: 95.34, widthEntryMeters: 25, widthExitMeters: 25 },
  { bankingPercent: 1, cornerNumber: 19, lengthMeters: 169.79, widthEntryMeters: 12, widthExitMeters: 11.1 },
  { bankingPercent: 2, cornerNumber: 20, lengthMeters: 32.4, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 1, counterBanking: true, cornerNumber: 21, lengthMeters: 11.16, widthEntryMeters: 12, widthExitMeters: 12 },
  { bankingPercent: 1, counterBanking: true, cornerNumber: 22, lengthMeters: 119.14, widthEntryMeters: 12, widthExitMeters: 14.88 },
] as const satisfies readonly OfficialCornerRoadInput[])

const ZANDVOORT_BANKING_SOURCE = Object.freeze({
  sourceDate: { precision: 'day', value: '2026-08-20' } as const,
  sourceLabel:
    'Formula 1 / Pirelli 2026 Dutch Grand Prix preview — Turns 3 and 14 at 19 and 18 degrees respectively; section boundaries derived from official corner markers',
  sourceUrl:
    'https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2026-dutch-grand-prix.7rXg1scAXG5IMsHc9k74g4',
})

type TrackStationing = Readonly<{
  cornerProgress: ReadonlyMap<number, number>
  lapLengthMeters: number
}>

const stationingCache = new WeakMap<TrackDefinition, TrackStationing | null>()

const normalisedProgress = (value: number) => {
  const finite = Number.isFinite(value) ? value : 0
  return ((finite % 1) + 1) % 1
}

const forwardProgress = (from: number, to: number) =>
  normalisedProgress(to - from)

const signedProgress = (from: number, to: number) => {
  const forward = forwardProgress(from, to)
  return forward > 0.5 ? forward - 1 : forward
}

type MeasuredFieldName = keyof MeasuredRoadProfile['fields']

const measuredTupleIndex: Readonly<
  Record<MeasuredFieldName, 1 | 2 | 3 | 4>
> = Object.freeze({
  bankingDegrees: 3,
  elevationMeters: 1,
  grade: 2,
  usableWidthMeters: 4,
})

function measuredFieldProvenance(
  field: MeasuredRoadProfileField,
): PhysicalTrackFieldProvenance {
  return Object.freeze({
    confidence: field.confidence,
    method: field.method,
    source: field.source,
    sourceDate: field.sourceDate,
    sourceLabel: field.sourceLabel,
    sourceUrl: field.sourceUrl,
  })
}

function measuredValueAt(
  profile: MeasuredRoadProfile,
  fieldName: MeasuredFieldName,
  progress: number,
): SourcedRoadValue | null {
  const field = profile.fields[fieldName]
  const samples = profile.samples
  if (!field || samples.length < 2) return null

  const scaled = normalisedProgress(progress) * samples.length
  const startIndex = Math.floor(scaled) % samples.length
  const endIndex = (startIndex + 1) % samples.length
  const ratio = scaled - Math.floor(scaled)
  const tupleIndex = measuredTupleIndex[fieldName]
  const startValue = samples[startIndex]?.[tupleIndex] ?? null
  const endValue = samples[endIndex]?.[tupleIndex] ?? null
  if (
    typeof startValue !== 'number' ||
    !Number.isFinite(startValue) ||
    typeof endValue !== 'number' ||
    !Number.isFinite(endValue)
  ) {
    return null
  }

  return Object.freeze({
    provenance: measuredFieldProvenance(field),
    value: startValue + (endValue - startValue) * ratio,
  })
}

function measuredInputsAt(
  trackId: string,
  progress: number,
): SourcedPhysicalRoadInputs | null {
  const profile = measuredRoadProfiles[trackId]
  if (!profile) return null

  return Object.freeze({
    bankingDegrees: measuredValueAt(profile, 'bankingDegrees', progress),
    elevationMeters: measuredValueAt(profile, 'elevationMeters', progress),
    gradeFraction: measuredValueAt(profile, 'grade', progress),
    usableWidthMeters: measuredValueAt(
      profile,
      'usableWidthMeters',
      progress,
    ),
  })
}

function stationingFor(track: TrackDefinition): TrackStationing | null {
  const cached = stationingCache.get(track)
  if (cached !== undefined) return cached

  if (
    track.centerline.length < 3 ||
    !track.corners?.length ||
    !Number.isFinite(track.lengthKm) ||
    track.lengthKm <= 0
  ) {
    stationingCache.set(track, null)
    return null
  }

  const lengths = track.centerline.map((point, index) => {
    const next = track.centerline[(index + 1) % track.centerline.length]
    return Math.hypot(next[0] - point[0], next[2] - point[2])
  })
  const perimeter = lengths.reduce((sum, length) => sum + length, 0)
  if (!Number.isFinite(perimeter) || perimeter <= 0) {
    stationingCache.set(track, null)
    return null
  }

  const stationProgress: number[] = []
  let distance = 0
  for (let index = 0; index < track.centerline.length; index += 1) {
    stationProgress.push(distance / perimeter)
    distance += lengths[index]
  }
  const cornerProgress = new Map<number, number>()
  for (const corner of track.corners) {
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < track.centerline.length; index += 1) {
      const point = track.centerline[index]
      const candidateDistance = Math.hypot(
        point[0] - corner.position[0],
        point[2] - corner.position[2],
      )
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance
        nearestIndex = index
      }
    }
    cornerProgress.set(corner.number, stationProgress[nearestIndex])
  }

  const result = Object.freeze({
    cornerProgress,
    lapLengthMeters: track.lengthKm * 1_000,
  })
  stationingCache.set(track, result)
  return result
}

function provenance(options: {
  confidence: 'high' | 'medium' | 'low'
  field: 'bankingDegrees' | 'elevationMeters' | 'grade' | 'usableWidthMeters'
  source: typeof MADRING_TECHNICAL_SOURCE | typeof ZANDVOORT_BANKING_SOURCE
  sourceKind?: 'derived' | 'official'
}): PhysicalTrackFieldProvenance {
  const methodByField = {
    bankingDegrees: 'corner-marker-mapped-profile',
    elevationMeters: 'official-gradient-section',
    grade: 'official-gradient-section',
    usableWidthMeters: 'corner-marker-mapped-profile',
  } as const

  return Object.freeze({
    confidence: options.confidence,
    method: methodByField[options.field],
    source: options.sourceKind ?? 'derived',
    sourceDate: options.source.sourceDate,
    sourceLabel: options.source.sourceLabel,
    sourceUrl: options.source.sourceUrl,
  })
}

function sourcedValue(
  value: number,
  field: 'bankingDegrees' | 'elevationMeters' | 'grade' | 'usableWidthMeters',
  source: typeof MADRING_TECHNICAL_SOURCE | typeof ZANDVOORT_BANKING_SOURCE,
  confidence: 'high' | 'medium' | 'low' = 'medium',
): SourcedRoadValue {
  return Object.freeze({ value, provenance: provenance({ confidence, field, source }) })
}

function madridInputsAt(
  progress: number,
  stationing: TrackStationing,
): SourcedPhysicalRoadInputs {
  const lapProgress = normalisedProgress(progress)
  const activeCorners = MADRING_OFFICIAL_CORNER_ROAD_INPUTS.flatMap((corner) => {
    const centre = stationing.cornerProgress.get(corner.cornerNumber)
    if (centre === undefined) return []
    const distanceFromCentreM =
      signedProgress(centre, lapProgress) * stationing.lapLengthMeters
    const halfLengthM = corner.lengthMeters / 2
    if (Math.abs(distanceFromCentreM) > halfLengthM) return []
    return [{ corner, distanceFromCentreM, halfLengthM }]
  }).sort(
    (left, right) =>
      Math.abs(left.distanceFromCentreM) / left.halfLengthM -
      Math.abs(right.distanceFromCentreM) / right.halfLengthM,
  )
  const active = activeCorners[0]
  const turnOneProgress = stationing.cornerProgress.get(1)
  const onMainStraight =
    turnOneProgress !== undefined &&
    forwardProgress(lapProgress, turnOneProgress) * stationing.lapLengthMeters <=
      589
  const widthMeters = active
    ? active.corner.widthEntryMeters +
      ((active.distanceFromCentreM + active.halfLengthM) /
        (2 * active.halfLengthM)) *
        (active.corner.widthExitMeters - active.corner.widthEntryMeters)
    : onMainStraight
      ? 15
      : 12
  const bankingDegrees = active
    ? Math.atan(
        (active.corner.bankingPercent / 100) *
          ('counterBanking' in active.corner &&
          active.corner.counterBanking
            ? -1
            : 1),
      ) *
      (180 / Math.PI)
    : null

  const turnTwoProgress = stationing.cornerProgress.get(2)
  const turnSevenProgress = stationing.cornerProgress.get(7)
  const turnEightProgress = stationing.cornerProgress.get(8)
  const uphillLengthM = 10 / 0.08
  const uphillStart =
    turnSevenProgress === undefined
      ? null
      : normalisedProgress(
          turnSevenProgress - uphillLengthM / stationing.lapLengthMeters,
        )
  let gradeFraction: number | null = null
  let elevationMeters: number | null = null

  if (
    turnSevenProgress !== undefined &&
    uphillStart !== null &&
    forwardProgress(uphillStart, lapProgress) * stationing.lapLengthMeters <=
      uphillLengthM
  ) {
    const travelledM =
      forwardProgress(uphillStart, lapProgress) * stationing.lapLengthMeters
    gradeFraction = 0.08
    elevationMeters = 687 + travelledM * gradeFraction
  } else if (
    turnSevenProgress !== undefined &&
    turnEightProgress !== undefined &&
    forwardProgress(turnSevenProgress, lapProgress) <=
      forwardProgress(turnSevenProgress, turnEightProgress)
  ) {
    const travelledM =
      forwardProgress(turnSevenProgress, lapProgress) *
      stationing.lapLengthMeters
    gradeFraction = -0.05
    elevationMeters = 697 + travelledM * gradeFraction
  } else if (
    turnTwoProgress !== undefined &&
    Math.abs(signedProgress(turnTwoProgress, lapProgress)) < 1e-9
  ) {
    elevationMeters = 671
  } else if (
    turnSevenProgress !== undefined &&
    Math.abs(signedProgress(turnSevenProgress, lapProgress)) < 1e-9
  ) {
    elevationMeters = 697
  }

  return Object.freeze({
    bankingDegrees:
      bankingDegrees === null
        ? null
        : sourcedValue(
            bankingDegrees,
            'bankingDegrees',
            MADRING_TECHNICAL_SOURCE,
          ),
    elevationMeters:
      elevationMeters === null
        ? null
        : sourcedValue(
            elevationMeters,
            'elevationMeters',
            MADRING_TECHNICAL_SOURCE,
            'low',
          ),
    gradeFraction:
      gradeFraction === null
        ? null
        : sourcedValue(
            gradeFraction,
            'grade',
            MADRING_TECHNICAL_SOURCE,
          ),
    usableWidthMeters: sourcedValue(
      widthMeters,
      'usableWidthMeters',
      MADRING_TECHNICAL_SOURCE,
    ),
  })
}

function progressIsInsideCornerVoronoi(
  stationing: TrackStationing,
  cornerNumber: number,
  progress: number,
): boolean {
  const current = stationing.cornerProgress.get(cornerNumber)
  const previous = stationing.cornerProgress.get(cornerNumber - 1 || 14)
  const next = stationing.cornerProgress.get(cornerNumber === 14 ? 1 : cornerNumber + 1)
  if (current === undefined || previous === undefined || next === undefined) {
    return false
  }
  const start = normalisedProgress(
    previous + forwardProgress(previous, current) / 2,
  )
  const end = normalisedProgress(current + forwardProgress(current, next) / 2)
  return (
    forwardProgress(start, normalisedProgress(progress)) <=
    forwardProgress(start, end)
  )
}

function zandvoortInputsAt(
  progress: number,
  stationing: TrackStationing,
): SourcedPhysicalRoadInputs {
  const bankingDegrees = progressIsInsideCornerVoronoi(stationing, 3, progress)
    ? 19
    : progressIsInsideCornerVoronoi(stationing, 14, progress)
      ? 18
      : null

  return Object.freeze({
    bankingDegrees:
      bankingDegrees === null
        ? null
        : sourcedValue(
            bankingDegrees,
            'bankingDegrees',
            ZANDVOORT_BANKING_SOURCE,
          ),
    elevationMeters: null,
    gradeFraction: null,
    usableWidthMeters: null,
  })
}

export function sourcedPhysicalRoadInputsAt(
  track: TrackDefinition,
  progress: number,
): SourcedPhysicalRoadInputs | null {
  if (track.id === 'madrid-approx') {
    const stationing = stationingFor(track)
    if (!stationing) return null
    return madridInputsAt(progress, stationing)
  }
  if (track.id === 'zandvoort-approx') {
    const stationing = stationingFor(track)
    if (!stationing) return measuredInputsAt(track.id, progress)
    const official = zandvoortInputsAt(progress, stationing)
    const measured = measuredInputsAt(track.id, progress)
    return Object.freeze({
      bankingDegrees:
        official.bankingDegrees ?? measured?.bankingDegrees ?? null,
      elevationMeters: measured?.elevationMeters ?? null,
      gradeFraction: measured?.gradeFraction ?? null,
      usableWidthMeters: measured?.usableWidthMeters ?? null,
    })
  }
  return measuredInputsAt(track.id, progress)
}

export function sourcedPhysicalRoadFieldProvenance(
  track: TrackDefinition,
  field: 'bankingDegrees' | 'elevationMeters' | 'grade' | 'usableWidthMeters',
): PhysicalTrackFieldProvenance | null {
  if (track.id === 'madrid-approx') {
    return provenance({
      confidence: field === 'elevationMeters' ? 'low' : 'medium',
      field,
      source: MADRING_TECHNICAL_SOURCE,
    })
  }
  if (track.id === 'zandvoort-approx' && field === 'bankingDegrees') {
    const measuredBank = measuredRoadProfiles[track.id]?.fields.bankingDegrees
    if (measuredBank) {
      return Object.freeze({
        confidence: 'low',
        method: 'source-priority-composite',
        source: 'derived',
        sourceDate: { precision: 'unavailable', value: null } as const,
        sourceLabel: `${ZANDVOORT_BANKING_SOURCE.sourceLabel}; official Turns 3/14 take precedence over the source-gated AHN cross-section profile elsewhere`,
        sourceUrl: ZANDVOORT_BANKING_SOURCE.sourceUrl,
      })
    }
    return provenance({
      confidence: 'medium',
      field,
      source: ZANDVOORT_BANKING_SOURCE,
    })
  }
  const measuredField = measuredRoadProfiles[track.id]?.fields[field]
  return measuredField ? measuredFieldProvenance(measuredField) : null
}
