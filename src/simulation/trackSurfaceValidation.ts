import type { TrackDefinition } from '../types'
import {
  TRACK_SURFACE_LANES,
  TRACK_SURFACE_STATE_VERSION,
  createTrackSurfaceState,
  deserializeTrackSurfaceState,
  type TrackSurfaceState,
} from './trackSurface'

const TRACK_SURFACE_SNAPSHOT_KEYS = new Set([
  'baseFriction',
  'bondedRubber',
  'cellCount',
  'defaults',
  'dryness',
  'laneCount',
  'marbles',
  'profile',
  'sectorMarks',
  'surfaceTemperatureC',
  'version',
  'waterFilmMm',
])
const TRACK_SURFACE_DEFAULT_KEYS = new Set([
  'baseFriction',
  'drainageCoefficient',
  'evaporationCoefficient',
  'roughness',
  'source',
  'sourceLabel',
])
const TRACK_SURFACE_PROFILE_KEYS = new Set([
  'baseFriction',
  'source',
  'sourceLabel',
  'sourceUrl',
])
const TRACK_SURFACE_PROFILE_WITH_SECTIONS_KEYS = new Set([
  ...TRACK_SURFACE_PROFILE_KEYS,
  'sections',
])
const TRACK_SURFACE_PROFILE_SECTION_KEYS = new Set([
  'baseFriction',
  'endProgress',
  'source',
  'sourceLabel',
  'sourceUrl',
  'startProgress',
])
const TRACK_SURFACE_PROFILE_SOURCES = new Set([
  'official',
  'observed',
  'simulator-policy',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isFiniteInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number =>
  isFiniteNumber(value) && value >= minimum && value <= maximum

const hasExactKeys = (value: Record<string, unknown>, expected: Set<string>) => {
  const keys = Object.keys(value)

  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

const isExactTrimmedNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.trim() === value

const isExactFiniteArrayInRange = (
  value: unknown,
  expectedLength: number,
  minimum: number,
  maximum: number,
) =>
  Array.isArray(value) &&
  value.length === expectedLength &&
  value.every((entry) => isFiniteInRange(entry, minimum, maximum))

function isStrictTrackSurfaceDefaults(value: unknown) {
  return (
    isRecord(value) &&
    hasExactKeys(value, TRACK_SURFACE_DEFAULT_KEYS) &&
    isFiniteInRange(value.baseFriction, 0.82, 1.05) &&
    isFiniteInRange(value.drainageCoefficient, 0.2, 3) &&
    isFiniteInRange(value.evaporationCoefficient, 0.2, 3) &&
    isFiniteInRange(value.roughness, 0, 1) &&
    value.source === 'simulator-policy' &&
    isExactTrimmedNonEmptyString(value.sourceLabel)
  )
}

function isStrictTrackSurfaceProfileSection(value: unknown) {
  return (
    isRecord(value) &&
    hasExactKeys(value, TRACK_SURFACE_PROFILE_SECTION_KEYS) &&
    isFiniteInRange(value.baseFriction, 0.82, 1.05) &&
    isFiniteInRange(value.startProgress, 0, 1 - Number.EPSILON) &&
    isFiniteInRange(value.endProgress, 0, 1 - Number.EPSILON) &&
    typeof value.source === 'string' &&
    TRACK_SURFACE_PROFILE_SOURCES.has(value.source) &&
    isExactTrimmedNonEmptyString(value.sourceLabel) &&
    (value.sourceUrl === null || isExactTrimmedNonEmptyString(value.sourceUrl))
  )
}

function isStrictTrackSurfaceProfile(value: unknown) {
  if (value === null) {
    return true
  }

  if (!isRecord(value)) {
    return false
  }

  const hasSections = Object.hasOwn(value, 'sections')
  const keys = hasSections
    ? TRACK_SURFACE_PROFILE_WITH_SECTIONS_KEYS
    : TRACK_SURFACE_PROFILE_KEYS

  return (
    hasExactKeys(value, keys) &&
    isFiniteInRange(value.baseFriction, 0.82, 1.05) &&
    typeof value.source === 'string' &&
    TRACK_SURFACE_PROFILE_SOURCES.has(value.source) &&
    isExactTrimmedNonEmptyString(value.sourceLabel) &&
    (value.sourceUrl === null || isExactTrimmedNonEmptyString(value.sourceUrl)) &&
    (!hasSections ||
      (Array.isArray(value.sections) &&
        value.sections.length > 0 &&
        value.sections.every(isStrictTrackSurfaceProfileSection)))
  )
}

function isStrictTrackSurfaceSectorMarks(value: unknown) {
  if (!isExactFiniteArrayInRange(value, 3, 0, 1 - Number.EPSILON)) {
    return false
  }

  const marks = value as [number, number, number]

  return (
    marks[0] <= 1e-6 &&
    marks[1] - marks[0] >= 1e-5 &&
    marks[2] - marks[1] >= 1e-5
  )
}

/**
 * Strict raw-JSON authority check. Unlike the tolerant local deserializer,
 * this rejects values which would need clamping, normalization, or key loss.
 */
export function isStrictTrackSurfaceSnapshot(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, TRACK_SURFACE_SNAPSHOT_KEYS)) {
    return false
  }

  const cellCount = value.cellCount
  if (
    !isFiniteNumber(cellCount) ||
    !Number.isSafeInteger(cellCount) ||
    cellCount < 3 ||
    cellCount > 720 ||
    value.version !== TRACK_SURFACE_STATE_VERSION ||
    value.laneCount !== TRACK_SURFACE_LANES.length ||
    !isStrictTrackSurfaceDefaults(value.defaults) ||
    !isStrictTrackSurfaceProfile(value.profile) ||
    !isStrictTrackSurfaceSectorMarks(value.sectorMarks)
  ) {
    return false
  }

  const expectedLength = cellCount * TRACK_SURFACE_LANES.length

  return (
    isExactFiniteArrayInRange(value.baseFriction, expectedLength, 0.82, 1.05) &&
    isExactFiniteArrayInRange(value.bondedRubber, expectedLength, 0, 1) &&
    isExactFiniteArrayInRange(value.dryness, expectedLength, 0, 1) &&
    isExactFiniteArrayInRange(value.marbles, expectedLength, 0, 1) &&
    isExactFiniteArrayInRange(value.surfaceTemperatureC, expectedLength, -20, 90) &&
    isExactFiniteArrayInRange(value.waterFilmMm, expectedLength, 0, 6)
  )
}

function numberArraysMatch(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
) {
  return (
    left.length === right.length &&
    Array.from(left).every((value, index) => value === right[index])
  )
}

/**
 * Restores one externally supplied surface only when both its dynamic JSON and
 * its immutable road definition exactly match the active track. The returned
 * typed arrays are a fresh deep copy.
 */
export function strictTrackSurfaceStateForTrack(
  value: unknown,
  track: TrackDefinition,
): TrackSurfaceState | null {
  if (!isStrictTrackSurfaceSnapshot(value)) {
    return null
  }

  const trackSurface = deserializeTrackSurfaceState(value)

  if (!trackSurface) {
    return null
  }

  const expected = createTrackSurfaceState({
    profile: track.surfaceProfile,
    sectorMarks: track.sectorMarks,
  })
  const defaultsMatch =
    trackSurface.defaults.baseFriction === expected.defaults.baseFriction &&
    trackSurface.defaults.drainageCoefficient ===
      expected.defaults.drainageCoefficient &&
    trackSurface.defaults.evaporationCoefficient ===
      expected.defaults.evaporationCoefficient &&
    trackSurface.defaults.roughness === expected.defaults.roughness &&
    trackSurface.defaults.source === expected.defaults.source &&
    trackSurface.defaults.sourceLabel === expected.defaults.sourceLabel

  return trackSurface.version === expected.version &&
    trackSurface.cellCount === expected.cellCount &&
    trackSurface.laneCount === expected.laneCount &&
    defaultsMatch &&
    numberArraysMatch(trackSurface.baseFriction, expected.baseFriction) &&
    numberArraysMatch(trackSurface.sectorMarks, expected.sectorMarks) &&
    JSON.stringify(trackSurface.profile) === JSON.stringify(expected.profile)
    ? trackSurface
    : null
}
