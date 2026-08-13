import type { TrackDefinition } from '../types'

/**
 * Metric-track contract for force-model work that follows Phase 6.
 *
 * Existing `TrackDefinition.centerline` points are scene/layout coordinates.
 * This resolver only turns their horizontal x/z shape into a metric planar
 * stationing using the declared lap length. It intentionally does not treat
 * render Y as elevation, nor `TrackDefinition.width` as carriageway width.
 * Those inputs remain explicitly unavailable until a source-labelled physical
 * survey is supplied.
 */

export const PHYSICAL_TRACK_VERSION = 1 as const
/** Prevent malformed imported layouts from allocating unbounded station state. */
export const MAX_PHYSICAL_TRACK_STATIONS = 16_384

export const PHYSICAL_TRACK_FIELDS = [
  'lapLengthMeters',
  'arcLengthMeters',
  'planarCenterlineMeters',
  'planarTangent',
  'planarNormal',
  'signedHorizontalCurvaturePerMeter',
  'elevationMeters',
  'grade',
  'verticalCurvaturePerMeter',
  'bankingDegrees',
  'usableWidthMeters',
] as const

export type PhysicalTrackField = (typeof PHYSICAL_TRACK_FIELDS)[number]

export type PhysicalTrackMetricSource =
  | 'official'
  | 'observed'
  | 'derived'
  | 'legacy-fallback'
  | 'unavailable'

export type PhysicalTrackConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unavailable'

export type PhysicalTrackSourceDate = {
  /** Year-only metadata is not silently promoted to a calendar date. */
  precision: 'day' | 'year' | 'unavailable'
  value: string | null
}

export type PhysicalTrackMetricMethod =
  | 'declared-lap-length'
  | 'planar-layout-normalised-to-declared-length'
  | 'planar-centred-difference'
  | 'three-point-planar-curvature'
  | 'intentionally-unavailable'

/** Source and transformation metadata for exactly one physical-track field. */
export type PhysicalTrackFieldProvenance = {
  confidence: PhysicalTrackConfidence
  method: PhysicalTrackMetricMethod
  source: PhysicalTrackMetricSource
  sourceDate: PhysicalTrackSourceDate
  sourceLabel: string
  sourceUrl: string | null
}

export type PhysicalTrackFieldProvenanceMap = Readonly<
  Record<PhysicalTrackField, PhysicalTrackFieldProvenance>
>

export type PhysicalTrackPlanarVector = {
  x: number
  z: number
}

/**
 * A metric station on a closed horizontal centreline.
 *
 * `sMeters` is measured from the first supplied point (the existing control
 * line convention), while `segmentLengthMeters` runs to the next station and
 * wraps from the last station back to the first.
 */
export type PhysicalTrackStation = {
  index: number
  planarNormal: PhysicalTrackPlanarVector
  planarPositionMeters: PhysicalTrackPlanarVector
  planarTangent: PhysicalTrackPlanarVector
  progress: number
  segmentLengthMeters: number
  signedHorizontalCurvaturePerMeter: number
  sMeters: number
}

export type PhysicalTrack = {
  closedLoop: {
    closureSegmentMeters: number
    isClosed: true
    pointCount: number
  }
  fieldProvenance: PhysicalTrackFieldProvenanceMap
  lapLengthMeters: number
  stations: readonly PhysicalTrackStation[]
  trackId: string
  version: typeof PHYSICAL_TRACK_VERSION
}

export type PhysicalTrackValidation =
  | {
      closureSegmentRawUnits: number
      pointCount: number
      rawPlanarPerimeter: number
      status: 'valid'
    }
  | {
      code:
        | 'degenerate-closing-segment'
        | 'degenerate-planar-segment'
        | 'invalid-declared-lap-length'
        | 'non-finite-planar-coordinate'
        | 'too-many-centerline-points'
        | 'undefined-planar-tangent'
        | 'insufficient-centerline-points'
      message: string
      pointIndex: number | null
      status: 'invalid'
    }

/**
 * A resolution never invents a usable physical fallback. Consumers must
 * branch on `status` before reading stations, so invalid source geometry is
 * not converted into a hidden neutral track.
 */
export type PhysicalTrackResolution =
  | {
      status: 'available'
      track: PhysicalTrack
      validation: Extract<PhysicalTrackValidation, { status: 'valid' }>
    }
  | {
      fieldProvenance: PhysicalTrackFieldProvenanceMap
      status: 'unavailable'
      track: null
      validation: Extract<PhysicalTrackValidation, { status: 'invalid' }>
    }

type PlanarPoint = PhysicalTrackPlanarVector

type LayoutInputDetails = {
  confidence: Exclude<PhysicalTrackConfidence, 'unavailable'>
  source: Exclude<PhysicalTrackMetricSource, 'unavailable'>
  sourceDate: PhysicalTrackSourceDate
  sourceLabel: string
  sourceUrl: string | null
}

const EPSILON = 1e-9

const confidenceRank: Record<PhysicalTrackConfidence, number> = {
  high: 3,
  low: 1,
  medium: 2,
  unavailable: 0,
}

function unavailableSourceDate(): PhysicalTrackSourceDate {
  return { precision: 'unavailable', value: null }
}

function sourceDateForLayout(track: TrackDefinition): PhysicalTrackSourceDate {
  const year = track.layoutSource?.year

  return typeof year === 'number' && Number.isInteger(year) && year > 0
    ? { precision: 'year', value: String(year) }
    : unavailableSourceDate()
}

function layoutInputDetailsFor(track: TrackDefinition): LayoutInputDetails {
  const layout = track.layoutSource

  if (!layout || layout.detail === 'fallback' || layout.provider === 'fallback') {
    return {
      confidence: 'low',
      source: 'legacy-fallback',
      sourceDate: unavailableSourceDate(),
      sourceLabel: layout
        ? `LEGACY FALLBACK — ${layout.label}`
        : 'LEGACY FALLBACK — render/layout centreline has no verified physical survey',
      sourceUrl: null,
    }
  }

  if (layout.provider === 'official') {
    return {
      confidence: 'medium',
      source: 'official',
      sourceDate: sourceDateForLayout(track),
      sourceLabel: layout.label,
      sourceUrl: layout.url,
    }
  }

  if (layout.provider === 'openf1') {
    return {
      confidence: 'medium',
      source: 'observed',
      sourceDate: sourceDateForLayout(track),
      sourceLabel: layout.label,
      sourceUrl: layout.url,
    }
  }

  return {
    confidence: 'low',
    source: 'derived',
    sourceDate: sourceDateForLayout(track),
    sourceLabel: layout.label,
    sourceUrl: layout.url,
  }
}

function declaredLengthProvenanceFor(
  track: TrackDefinition,
): PhysicalTrackFieldProvenance {
  if (track.lengthSource === 'official') {
    return {
      confidence: 'high',
      method: 'declared-lap-length',
      source: 'official',
      // TrackDefinition carries the authority flag but not the publication
      // date/URL for this field, so do not manufacture either value.
      sourceDate: unavailableSourceDate(),
      sourceLabel: 'Declared circuit lap length (authoritative source date unavailable)',
      sourceUrl: null,
    }
  }

  return {
    confidence: 'low',
    method: 'declared-lap-length',
    source: 'legacy-fallback',
    sourceDate: unavailableSourceDate(),
    sourceLabel: 'LEGACY FALLBACK — estimated declared circuit lap length',
    sourceUrl: null,
  }
}

function lowerConfidence(
  left: PhysicalTrackConfidence,
  right: PhysicalTrackConfidence,
) {
  return confidenceRank[left] <= confidenceRank[right] ? left : right
}

function layoutDerivedProvenanceFor(
  track: TrackDefinition,
  method: Exclude<PhysicalTrackMetricMethod, 'declared-lap-length' | 'intentionally-unavailable'>,
): PhysicalTrackFieldProvenance {
  const layout = layoutInputDetailsFor(track)
  const declaredLength = declaredLengthProvenanceFor(track)

  return {
    confidence: lowerConfidence(layout.confidence, declaredLength.confidence),
    method,
    source: layout.source,
    sourceDate: layout.sourceDate,
    sourceLabel: `${layout.sourceLabel}; metric scale uses the declared lap length`,
    sourceUrl: layout.sourceUrl,
  }
}

function unavailableProvenanceFor(
  field: Extract<
    PhysicalTrackField,
    | 'bankingDegrees'
    | 'elevationMeters'
    | 'grade'
    | 'usableWidthMeters'
    | 'verticalCurvaturePerMeter'
  >,
): PhysicalTrackFieldProvenance {
  const labelByField: Record<typeof field, string> = {
    bankingDegrees:
      'UNAVAILABLE — banking/camber is not present in TrackDefinition',
    elevationMeters:
      'UNAVAILABLE — render Y is not treated as physical elevation',
    grade:
      'UNAVAILABLE — grade requires a source-labelled metric elevation profile',
    usableWidthMeters:
      'UNAVAILABLE — TrackDefinition.width is a render width, not a physical carriageway width',
    verticalCurvaturePerMeter:
      'UNAVAILABLE — vertical curvature requires a source-labelled metric elevation profile',
  }

  return {
    confidence: 'unavailable',
    method: 'intentionally-unavailable',
    source: 'unavailable',
    sourceDate: unavailableSourceDate(),
    sourceLabel: labelByField[field],
    sourceUrl: null,
  }
}

function fieldProvenanceFor(track: TrackDefinition): PhysicalTrackFieldProvenanceMap {
  return Object.freeze({
    arcLengthMeters: layoutDerivedProvenanceFor(
      track,
      'planar-layout-normalised-to-declared-length',
    ),
    bankingDegrees: unavailableProvenanceFor('bankingDegrees'),
    elevationMeters: unavailableProvenanceFor('elevationMeters'),
    grade: unavailableProvenanceFor('grade'),
    lapLengthMeters: declaredLengthProvenanceFor(track),
    planarCenterlineMeters: layoutDerivedProvenanceFor(
      track,
      'planar-layout-normalised-to-declared-length',
    ),
    planarNormal: layoutDerivedProvenanceFor(
      track,
      'planar-centred-difference',
    ),
    planarTangent: layoutDerivedProvenanceFor(
      track,
      'planar-centred-difference',
    ),
    signedHorizontalCurvaturePerMeter: layoutDerivedProvenanceFor(
      track,
      'three-point-planar-curvature',
    ),
    usableWidthMeters: unavailableProvenanceFor('usableWidthMeters'),
    verticalCurvaturePerMeter: unavailableProvenanceFor(
      'verticalCurvaturePerMeter',
    ),
  })
}

function unavailableFieldProvenanceFor(
  validation: Extract<PhysicalTrackValidation, { status: 'invalid' }>,
): PhysicalTrackFieldProvenanceMap {
  const provenance = (): PhysicalTrackFieldProvenance => ({
    confidence: 'unavailable',
    method: 'intentionally-unavailable',
    source: 'unavailable',
    sourceDate: unavailableSourceDate(),
    sourceLabel: `UNAVAILABLE — ${validation.message}`,
    sourceUrl: null,
  })

  return Object.freeze({
    arcLengthMeters: provenance(),
    bankingDegrees: provenance(),
    elevationMeters: provenance(),
    grade: provenance(),
    lapLengthMeters: provenance(),
    planarCenterlineMeters: provenance(),
    planarNormal: provenance(),
    planarTangent: provenance(),
    signedHorizontalCurvaturePerMeter: provenance(),
    usableWidthMeters: provenance(),
    verticalCurvaturePerMeter: provenance(),
  })
}

function invalidValidation(
  code: Extract<PhysicalTrackValidation, { status: 'invalid' }>['code'],
  message: string,
  pointIndex: number | null = null,
): Extract<PhysicalTrackValidation, { status: 'invalid' }> {
  return { code, message, pointIndex, status: 'invalid' }
}

function planarPointsFor(
  centerline: TrackDefinition['centerline'],
): PlanarPoint[] | null {
  const points: PlanarPoint[] = []

  for (const point of centerline) {
    if (
      !Array.isArray(point) ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[2])
    ) {
      return null
    }

    // Do not inspect point[1]: it belongs to the render layout and is not an
    // elevation measurement. A future surveyed profile gets its own field.
    points.push({ x: point[0], z: point[2] })
  }

  return points
}

function vectorLength(vector: PlanarPoint) {
  return Math.hypot(vector.x, vector.z)
}

function segmentLengthsFor(points: readonly PlanarPoint[]) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]

    return Math.hypot(next.x - point.x, next.z - point.z)
  })
}

function normalisedProgress(value: number) {
  const finite = Number.isFinite(value) ? value : 0

  return ((finite % 1) + 1) % 1
}

/**
 * Resolves a source-labelled planar metric track without changing any live
 * race or vehicle force consumer. Invalid geometry returns `unavailable`.
 */
export function resolvePhysicalTrack(track: TrackDefinition): PhysicalTrackResolution {
  const lapLengthMeters = track.lengthKm * 1_000

  if (!Number.isFinite(lapLengthMeters) || lapLengthMeters <= 0) {
    const validation = invalidValidation(
      'invalid-declared-lap-length',
      'Declared lap length must be a positive finite value in metres',
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  if (track.centerline.length < 3) {
    const validation = invalidValidation(
      'insufficient-centerline-points',
      'A closed physical track requires at least three centreline stations',
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  if (track.centerline.length > MAX_PHYSICAL_TRACK_STATIONS) {
    const validation = invalidValidation(
      'too-many-centerline-points',
      `Centreline exceeds the ${MAX_PHYSICAL_TRACK_STATIONS}-station physical-track safety bound`,
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  const rawPoints = planarPointsFor(track.centerline)

  if (!rawPoints) {
    const validation = invalidValidation(
      'non-finite-planar-coordinate',
      'Centreline x/z coordinates must be finite before metric stationing',
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  const rawSegmentLengths = segmentLengthsFor(rawPoints)
  const degenerateIndex = rawSegmentLengths.findIndex(
    (length) => !Number.isFinite(length) || length <= EPSILON,
  )

  if (degenerateIndex >= 0) {
    const closesLoop = degenerateIndex === rawSegmentLengths.length - 1
    const validation = invalidValidation(
      closesLoop ? 'degenerate-closing-segment' : 'degenerate-planar-segment',
      closesLoop
        ? 'The final-to-first centreline segment is degenerate; closed-loop stationing is unavailable'
        : 'A centreline segment is degenerate; metric stationing is unavailable',
      degenerateIndex,
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  const rawPlanarPerimeter = rawSegmentLengths.reduce(
    (total, length) => total + length,
    0,
  )

  if (!Number.isFinite(rawPlanarPerimeter) || rawPlanarPerimeter <= EPSILON) {
    const validation = invalidValidation(
      'degenerate-planar-segment',
      'The closed planar perimeter is not a usable finite distance',
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  const metricScale = lapLengthMeters / rawPlanarPerimeter
  const origin = rawPoints[0]
  const positions = rawPoints.map((point) => ({
    x: (point.x - origin.x) * metricScale,
    z: (point.z - origin.z) * metricScale,
  }))
  const segmentLengths = rawSegmentLengths.map((length) => length * metricScale)
  const tangents = positions.map((_point, index) => {
    const previous = positions[(index - 1 + positions.length) % positions.length]
    const next = positions[(index + 1) % positions.length]
    const vector = { x: next.x - previous.x, z: next.z - previous.z }
    const length = vectorLength(vector)

    return length > EPSILON
      ? { x: vector.x / length, z: vector.z / length }
      : null
  })
  const tangentFailureIndex = tangents.findIndex((tangent) => tangent === null)

  if (tangentFailureIndex >= 0) {
    const validation = invalidValidation(
      'undefined-planar-tangent',
      'A centreline station has no planar tangent; physical stationing is unavailable',
      tangentFailureIndex,
    )

    return {
      fieldProvenance: unavailableFieldProvenanceFor(validation),
      status: 'unavailable',
      track: null,
      validation,
    }
  }

  let stationMeters = 0
  const stations = positions.map((position, index): PhysicalTrackStation => {
    const previous = positions[(index - 1 + positions.length) % positions.length]
    const next = positions[(index + 1) % positions.length]
    const incoming = {
      x: position.x - previous.x,
      z: position.z - previous.z,
    }
    const outgoing = { x: next.x - position.x, z: next.z - position.z }
    const chord = { x: next.x - previous.x, z: next.z - previous.z }
    const denominator =
      vectorLength(incoming) * vectorLength(outgoing) * vectorLength(chord)
    const signedDoubleArea = incoming.x * outgoing.z - incoming.z * outgoing.x
    const curvature =
      denominator > EPSILON ? (2 * signedDoubleArea) / denominator : 0
    const tangent = tangents[index]!
    const station: PhysicalTrackStation = Object.freeze({
      index,
      planarNormal: Object.freeze({ x: -tangent.z, z: tangent.x }),
      planarPositionMeters: Object.freeze({ ...position }),
      planarTangent: Object.freeze({ ...tangent }),
      progress: stationMeters / lapLengthMeters,
      segmentLengthMeters: segmentLengths[index],
      signedHorizontalCurvaturePerMeter: curvature,
      sMeters: stationMeters,
    })

    stationMeters += segmentLengths[index]
    return station
  })
  const validation: Extract<PhysicalTrackValidation, { status: 'valid' }> = {
    closureSegmentRawUnits: rawSegmentLengths.at(-1)!,
    pointCount: rawPoints.length,
    rawPlanarPerimeter,
    status: 'valid',
  }
  const physicalTrack: PhysicalTrack = Object.freeze({
    closedLoop: Object.freeze({
      closureSegmentMeters: segmentLengths.at(-1)!,
      isClosed: true,
      pointCount: stations.length,
    }),
    fieldProvenance: fieldProvenanceFor(track),
    lapLengthMeters,
    stations: Object.freeze(stations),
    trackId: track.id,
    version: PHYSICAL_TRACK_VERSION,
  })

  return { status: 'available', track: physicalTrack, validation }
}

/** Returns the station at or immediately before a wrapped lap progress. */
export function physicalTrackStationAt(
  track: PhysicalTrack,
  progress: number,
): PhysicalTrackStation {
  const targetMeters = normalisedProgress(progress) * track.lapLengthMeters
  let lower = 0
  let upper = track.stations.length - 1

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    const station = track.stations[middle]

    if (station.sMeters <= targetMeters) {
      lower = middle + 1
    } else {
      upper = middle - 1
    }
  }

  return track.stations[Math.max(0, upper)]
}
