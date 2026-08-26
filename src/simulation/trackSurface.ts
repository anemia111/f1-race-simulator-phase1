import type { TrackSurfaceProfile } from '../types'
import { initialSurfaceWaterMmForRain } from './trackWater'

/**
 * Local, deterministic road-surface state.
 *
 * This module deliberately separates the compact physical surface substrate
 * from the legacy three-sector compatibility adapter. Old checkpoints can be
 * materialised once from that adapter without claiming that either lane was
 * measured from OpenF1 location samples; live updates remain canonical.
 */

export const TRACK_SURFACE_STATE_VERSION = 1 as const
export const TRACK_SURFACE_LANES = ['racing-line', 'off-line'] as const
export const DEFAULT_TRACK_SURFACE_CELL_COUNT = 72

export type TrackSurfaceLane = (typeof TRACK_SURFACE_LANES)[number]

export type TrackSurfaceDefaults = {
  /** A bounded model input, never an official circuit-friction claim. */
  baseFriction: number
  /** Relative drainage response; 1 is the neutral simulator policy. */
  drainageCoefficient: number
  /** Relative evaporation response; 1 is the neutral simulator policy. */
  evaporationCoefficient: number
  /** Dimensionless roughness proxy. No per-circuit value is inferred here. */
  roughness: number
  source: 'simulator-policy'
  sourceLabel: string
}

export type TrackSurfaceState = {
  /** Static, source-labelled friction input resolved per cell/lane. */
  baseFriction: Float64Array
  bondedRubber: Float64Array
  cellCount: number
  defaults: TrackSurfaceDefaults
  dryness: Float64Array
  laneCount: 2
  marbles: Float64Array
  /** Provenance for the static base-friction array, if one was supplied. */
  profile: TrackSurfaceProfile | null
  /** Stable marks used only by the legacy sector adapter. */
  sectorMarks: readonly [number, number, number]
  surfaceTemperatureC: Float64Array
  version: typeof TRACK_SURFACE_STATE_VERSION
  waterFilmMm: Float64Array
}

export type TrackSurfaceStateSnapshot = {
  baseFriction: number[]
  bondedRubber: number[]
  cellCount: number
  defaults: TrackSurfaceDefaults
  dryness: number[]
  laneCount: 2
  marbles: number[]
  profile: TrackSurfaceProfile | null
  sectorMarks: [number, number, number]
  surfaceTemperatureC: number[]
  version: typeof TRACK_SURFACE_STATE_VERSION
  waterFilmMm: number[]
}

export type LegacyTrackSurfaceSectors = {
  dryingLineBySector: readonly [number, number, number]
  rubberLevelBySector: readonly [number, number, number]
  sectorMarks?: readonly number[]
  surfaceWaterMmBySector: readonly [number, number, number]
}

export type ResolvedTrackSurface = {
  baseGripMultiplier: number
  bondedRubber: number
  cellIndex: number
  dryness: number
  lane: TrackSurfaceLane
  marbles: number
  surfaceTemperatureC: number
  waterFilmMm: number
}

/**
 * Forward vehicle travel over the modelled road during one public update.
 * `distanceLaps` is a fraction of lap length, not a render-space distance.
 * A zero-distance traversal intentionally performs no tyre work.
 */
export type TrackSurfaceTraversal = {
  distanceLaps: number
  lane: TrackSurfaceLane
  startProgress: number
}

/**
 * Water inventory audit for one complete update.
 *
 * Every value is a sum of film depths over equal model cell/lane slots. The
 * unit is therefore mm-cell-lane: it is proportional to inventory but is not
 * kg, litres, or a claim about physical road width. Drainage, tyre spray,
 * evaporation, and overflow removal are external sinks from this substrate.
 */
export type TrackSurfaceWaterFlux = {
  afterFilmDepthSumMm: number
  beforeFilmDepthSumMm: number
  drainageFilmDepthSumMm: number
  evaporationFilmDepthSumMm: number
  overflowRemovedFilmDepthSumMm: number
  rainfallFilmDepthSumMm: number
  tyreSprayDisplacementFilmDepthSumMm: number
}

/**
 * Bonded-plus-loose rubber audit in dimensionless coverage-cell-lane units.
 * Marble migration is an internal lane transfer and is consequently absent
 * from the stock identity. `removedCoverageSum` is deliberately neutral about
 * a physical removal route because runoff geometry is unavailable.
 */
export type TrackSurfaceRubberFlux = {
  afterCoverageSum: number
  beforeCoverageSum: number
  marbleMigrationCoverageSum: number
  removedCoverageSum: number
  tyreDepositCoverageSum: number
  washedCoverageSum: number
}

export type TrackSurfaceEvolutionFlux = {
  rubber: TrackSurfaceRubberFlux
  water: TrackSurfaceWaterFlux
}

export type TrackSurfaceEvolutionResult = {
  flux: TrackSurfaceEvolutionFlux
  state: TrackSurfaceState
}

const TRACK_SURFACE_MAX_DELTA_SECONDS = 30
const TRACK_SURFACE_EVOLUTION_SLICE_SECONDS = 0.05
const TRACK_SURFACE_LOOSE_RUBBER_SHARE = 0.24
// Numerical safety bounds for the public pure API, not circuit or weather
// calibration claims. Both remain far beyond any value the race runtime can
// produce during the bounded public update.
const TRACK_SURFACE_MAX_RAINFALL_MM_H = 3_600
const TRACK_SURFACE_MAX_TRAVERSAL_DISTANCE_LAPS = 100

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

function normalisedProgress(value: number) {
  const finite = finiteOr(value, 0)

  return ((finite % 1) + 1) % 1
}

function boundedCellCount(value: number | undefined) {
  const requested = Math.floor(finiteOr(value, DEFAULT_TRACK_SURFACE_CELL_COUNT))

  return clamp(requested, 3, 720)
}

function normaliseSectorMarks(
  values: readonly number[] | undefined,
): [number, number, number] {
  const fallback: [number, number, number] = [0, 1 / 3, 2 / 3]

  if (
    !values ||
    values.length !== 3 ||
    !values.every((value) => Number.isFinite(value))
  ) {
    return fallback
  }

  // Sector marks are persisted alongside the state. Keep already valid values
  // byte-stable through a serialize/deserialize cycle rather than applying a
  // modulo operation that can change an IEEE-754 representation of 1/3.
  if (!values.every((value) => value >= 0 && value < 1)) {
    return fallback
  }

  const marks = [...values]

  if (
    marks[0] > 1e-6 ||
    marks[1] - marks[0] < 1e-5 ||
    marks[2] - marks[1] < 1e-5
  ) {
    return fallback
  }

  return [marks[0], marks[1], marks[2]]
}

function defaultsFor(
  input: Partial<TrackSurfaceDefaults> | undefined,
): TrackSurfaceDefaults {
  return {
    baseFriction: clamp(finiteOr(input?.baseFriction, 1), 0.82, 1.05),
    drainageCoefficient: clamp(
      finiteOr(input?.drainageCoefficient, 1),
      0.2,
      3,
    ),
    evaporationCoefficient: clamp(
      finiteOr(input?.evaporationCoefficient, 1),
      0.2,
      3,
    ),
    roughness: clamp(finiteOr(input?.roughness, 0.5), 0, 1),
    source: 'simulator-policy',
    sourceLabel:
      typeof input?.sourceLabel === 'string' && input.sourceLabel.trim().length > 0
        ? input.sourceLabel
        : 'SIMULATOR POLICY — no circuit-local surface measurement',
  }
}

function laneIndex(lane: TrackSurfaceLane) {
  return lane === 'off-line' ? 1 : 0
}

function flatIndex(cellIndex: number, lane: TrackSurfaceLane) {
  return cellIndex * TRACK_SURFACE_LANES.length + laneIndex(lane)
}

function cloneTrackSurfaceState(state: TrackSurfaceState): TrackSurfaceState {
  return {
    ...state,
    baseFriction: new Float64Array(state.baseFriction),
    bondedRubber: new Float64Array(state.bondedRubber),
    defaults: { ...state.defaults },
    dryness: new Float64Array(state.dryness),
    marbles: new Float64Array(state.marbles),
    profile: cloneTrackSurfaceProfile(state.profile),
    sectorMarks: [...state.sectorMarks] as [number, number, number],
    surfaceTemperatureC: new Float64Array(state.surfaceTemperatureC),
    waterFilmMm: new Float64Array(state.waterFilmMm),
  }
}

function finiteArraySum(values: Float64Array) {
  let total = 0

  for (const value of values) {
    total += finiteOr(value, 0)
  }

  return total
}

function rubberCoverageSum(state: TrackSurfaceState) {
  return finiteArraySum(state.bondedRubber) + finiteArraySum(state.marbles)
}

/**
 * Adds one moving traversal to cell-local exposure arrays. A complete cell
 * crossing contributes one vehicle pass. Moving occupancy seconds are split
 * in proportion to distance inside each cell and sum to `sliceSeconds`.
 */
function addTraversalExposure(options: {
  distanceLaps: number
  lane: TrackSurfaceLane
  movingOccupancySeconds: Float64Array
  passCoverage: Float64Array
  sliceSeconds: number
  startProgress: number
  state: Pick<TrackSurfaceState, 'cellCount'>
}) {
  const {
    lane,
    movingOccupancySeconds,
    passCoverage,
    sliceSeconds,
    state,
  } = options
  const distanceLaps = clamp(
    finiteOr(options.distanceLaps, 0),
    0,
    TRACK_SURFACE_MAX_TRAVERSAL_DISTANCE_LAPS,
  )

  if (distanceLaps <= 0 || sliceSeconds <= 0) return

  const laneAt = lane === 'off-line' ? 'off-line' : 'racing-line'
  const fullLaps = Math.floor(distanceLaps)
  const remainingLaps = distanceLaps - fullLaps

  if (fullLaps > 0) {
    const occupancySecondsPerCell =
      sliceSeconds * (fullLaps / state.cellCount) / distanceLaps

    for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
      const index = flatIndex(cellIndex, laneAt)
      passCoverage[index] += fullLaps
      movingOccupancySeconds[index] += occupancySecondsPerCell
    }
  }

  if (remainingLaps <= 1e-12) return

  let cellPosition = normalisedProgress(options.startProgress) * state.cellCount
  let remainingCells = remainingLaps * state.cellCount

  while (remainingCells > 1e-10) {
    const unwrappedCellIndex = Math.floor(cellPosition + 1e-12)
    const cellIndex = ((unwrappedCellIndex % state.cellCount) + state.cellCount) %
      state.cellCount
    const distanceToBoundary = Math.max(
      1e-12,
      unwrappedCellIndex + 1 - cellPosition,
    )
    const overlapCells = Math.min(remainingCells, distanceToBoundary)
    const index = flatIndex(cellIndex, laneAt)

    passCoverage[index] += overlapCells
    movingOccupancySeconds[index] +=
      sliceSeconds * (overlapCells / state.cellCount) / distanceLaps
    cellPosition += overlapCells
    remainingCells -= overlapCells
  }
}

function progressIsInSection(
  progress: number,
  startProgress: number,
  endProgress: number,
) {
  const progressAt = normalisedProgress(progress)
  const start = normalisedProgress(startProgress)
  const end = normalisedProgress(endProgress)

  if (Math.abs(start - end) < 1e-8) return false

  return start < end
    ? progressAt >= start && progressAt < end
    : progressAt >= start || progressAt < end
}

function hasSurfaceProvenance(
  value:
    | Pick<TrackSurfaceProfile, 'source' | 'sourceLabel'>
    | null
    | undefined,
) {
  return (
    value !== null &&
    value !== undefined &&
    (value.source === 'official' ||
      value.source === 'observed' ||
      value.source === 'simulator-policy') &&
    typeof value.sourceLabel === 'string' &&
    value.sourceLabel.trim().length > 0
  )
}

function normaliseSourceUrl(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

function normaliseTrackSurfaceProfile(
  profile: TrackSurfaceProfile | undefined,
): TrackSurfaceProfile | null {
  if (!profile || !hasSurfaceProvenance(profile)) return null

  const sections = Array.isArray(profile.sections)
    ? profile.sections.flatMap((section) => {
        if (
          !hasSurfaceProvenance(section) ||
          !Number.isFinite(section.startProgress) ||
          !Number.isFinite(section.endProgress) ||
          section.startProgress < 0 ||
          section.startProgress >= 1 ||
          section.endProgress < 0 ||
          section.endProgress >= 1
        ) {
          return []
        }

        return [{
          baseFriction: clamp(finiteOr(section.baseFriction, 1), 0.82, 1.05),
          endProgress: section.endProgress,
          source: section.source,
          sourceLabel: section.sourceLabel.trim(),
          sourceUrl: normaliseSourceUrl(section.sourceUrl),
          startProgress: section.startProgress,
        }]
      })
    : []

  return {
    baseFriction: clamp(finiteOr(profile.baseFriction, 1), 0.82, 1.05),
    ...(sections.length > 0 ? { sections } : {}),
    source: profile.source,
    sourceLabel: profile.sourceLabel.trim(),
    sourceUrl: normaliseSourceUrl(profile.sourceUrl),
  }
}

function cloneTrackSurfaceProfile(
  profile: TrackSurfaceProfile | null,
): TrackSurfaceProfile | null {
  return profile
    ? {
        ...profile,
        ...(profile.sections
          ? {
              sections: profile.sections.map((section) => ({ ...section })),
            }
          : {}),
      }
    : null
}

function profileBaseFrictionAt(
  profile: TrackSurfaceProfile | null,
  progress: number,
) {
  if (!profile) return 1

  const base = clamp(finiteOr(profile.baseFriction, 1), 0.82, 1.05)

  if (!profile?.sections) return base

  const section = profile.sections.find(
    (candidate) =>
      hasSurfaceProvenance(candidate) &&
      progressIsInSection(
        progress,
        candidate.startProgress,
        candidate.endProgress,
      ),
  )

  return clamp(finiteOr(section?.baseFriction, base), 0.82, 1.05)
}

function sectorIndexForProgress(
  progress: number,
  sectorMarks: readonly [number, number, number],
) {
  const normalised = normalisedProgress(progress)

  if (normalised >= sectorMarks[2] || normalised < sectorMarks[0]) {
    return 2
  }

  return normalised >= sectorMarks[1] ? 1 : 0
}

function finiteArray(
  values: unknown,
  expectedLength: number,
  minimum: number,
  maximum: number,
) {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    return null
  }

  const resolved = values.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null
    }

    return clamp(value, minimum, maximum)
  })

  return resolved.every((value) => value !== null) ? resolved as number[] : null
}

export function createTrackSurfaceState(options: {
  cellCount?: number
  defaults?: Partial<TrackSurfaceDefaults>
  initialSurfaceTemperatureC?: number
  profile?: TrackSurfaceProfile
  sectorMarks?: readonly number[]
} = {}): TrackSurfaceState {
  const cellCount = boundedCellCount(options.cellCount)
  const length = cellCount * TRACK_SURFACE_LANES.length
  const profile = normaliseTrackSurfaceProfile(options.profile)
  const surfaceTemperatureC = clamp(
    finiteOr(options.initialSurfaceTemperatureC, 30),
    -20,
    90,
  )

  const state: TrackSurfaceState = {
    baseFriction: new Float64Array(length),
    // Float64 keeps the legacy sector values byte-stable while the old
    // checkpoint schema remains the migration authority. These are still SoA
    // typed arrays; a later persisted local-surface schema can choose a more
    // compact representation without perturbing current races.
    bondedRubber: new Float64Array(length),
    cellCount,
    defaults: defaultsFor(options.defaults),
    dryness: new Float64Array(length).fill(1),
    laneCount: TRACK_SURFACE_LANES.length,
    marbles: new Float64Array(length),
    profile,
    sectorMarks: normaliseSectorMarks(options.sectorMarks),
    surfaceTemperatureC: new Float64Array(length).fill(surfaceTemperatureC),
    version: TRACK_SURFACE_STATE_VERSION,
    waterFilmMm: new Float64Array(length),
  }

  for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
    const baseFriction = profileBaseFrictionAt(
      profile,
      (cellIndex + 0.5) / state.cellCount,
    )
    state.baseFriction[flatIndex(cellIndex, 'racing-line')] = baseFriction
    state.baseFriction[flatIndex(cellIndex, 'off-line')] = baseFriction
  }

  return state
}

/** Fresh-session initializer for the canonical two-lane surface. */
export function createInitialTrackSurfaceState(options: {
  cellCount?: number
  defaults?: Partial<TrackSurfaceDefaults>
  initialRainIntensityMmH: number
  initialSurfaceTemperatureC?: number
  profile?: TrackSurfaceProfile
  sectorMarks?: readonly number[]
}): TrackSurfaceState {
  const waterFilmMm = initialSurfaceWaterMmForRain(
    options.initialRainIntensityMmH,
  )
  const dryness = clamp(
    1 - waterFilmMm / 3.5 - options.initialRainIntensityMmH / 18,
    0,
    1,
  )
  const state = createTrackSurfaceState({
    cellCount: options.cellCount,
    defaults: options.defaults,
    initialSurfaceTemperatureC: options.initialSurfaceTemperatureC,
    profile: options.profile,
    sectorMarks: options.sectorMarks,
  })

  for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
    const racingIndex = flatIndex(cellIndex, 'racing-line')
    const offLineIndex = flatIndex(cellIndex, 'off-line')
    state.dryness[racingIndex] = dryness
    state.waterFilmMm[racingIndex] = waterFilmMm
    state.dryness[offLineIndex] = clamp(dryness * 0.82, 0, 1)
    state.waterFilmMm[offLineIndex] = clamp(
      waterFilmMm + (1 - dryness) * 0.14,
      0,
      6,
    )
  }

  return state
}

export function serializeTrackSurfaceState(
  state: TrackSurfaceState,
): TrackSurfaceStateSnapshot {
  return {
    baseFriction: Array.from(state.baseFriction),
    bondedRubber: Array.from(state.bondedRubber),
    cellCount: state.cellCount,
    defaults: { ...state.defaults },
    dryness: Array.from(state.dryness),
    laneCount: TRACK_SURFACE_LANES.length,
    marbles: Array.from(state.marbles),
    profile: cloneTrackSurfaceProfile(state.profile),
    sectorMarks: [...state.sectorMarks] as [number, number, number],
    surfaceTemperatureC: Array.from(state.surfaceTemperatureC),
    version: TRACK_SURFACE_STATE_VERSION,
    waterFilmMm: Array.from(state.waterFilmMm),
  }
}

/**
 * Structural reader for local callers. It rejects invalid shape/non-finite
 * values and normalizes bounded policy inputs; checkpoint restoration adds a
 * stricter raw-JSON authority check before calling this helper.
 */
export function deserializeTrackSurfaceState(
  value: unknown,
): TrackSurfaceState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const snapshot = value as Partial<TrackSurfaceStateSnapshot>
  const cellCount = boundedCellCount(snapshot.cellCount)
  const expectedLength = cellCount * TRACK_SURFACE_LANES.length

  if (
    snapshot.version !== TRACK_SURFACE_STATE_VERSION ||
    snapshot.cellCount !== cellCount ||
    snapshot.laneCount !== TRACK_SURFACE_LANES.length
  ) {
    return null
  }

  const baseFriction = finiteArray(snapshot.baseFriction, expectedLength, 0.82, 1.05)
  const bondedRubber = finiteArray(snapshot.bondedRubber, expectedLength, 0, 1)
  const marbles = finiteArray(snapshot.marbles, expectedLength, 0, 1)
  const waterFilmMm = finiteArray(snapshot.waterFilmMm, expectedLength, 0, 6)
  const dryness = finiteArray(snapshot.dryness, expectedLength, 0, 1)
  const surfaceTemperatureC = finiteArray(
    snapshot.surfaceTemperatureC,
    expectedLength,
    -20,
    90,
  )
  const profile =
    snapshot.profile === null
      ? null
      : normaliseTrackSurfaceProfile(snapshot.profile)

  if (
    !baseFriction ||
    !bondedRubber ||
    !marbles ||
    !waterFilmMm ||
    !dryness ||
    !surfaceTemperatureC ||
    snapshot.profile === undefined ||
    (snapshot.profile !== null && !profile)
  ) {
    return null
  }

  const state = createTrackSurfaceState({
    cellCount,
    defaults: snapshot.defaults,
    profile: profile ?? undefined,
    sectorMarks: snapshot.sectorMarks,
  })
  state.baseFriction.set(baseFriction)
  state.bondedRubber.set(bondedRubber)
  state.marbles.set(marbles)
  state.waterFilmMm.set(waterFilmMm)
  state.dryness.set(dryness)
  state.surfaceTemperatureC.set(surfaceTemperatureC)

  return state
}

export function trackSurfaceCellForProgress(
  state: Pick<TrackSurfaceState, 'cellCount'>,
  progress: number,
) {
  return Math.min(
    state.cellCount - 1,
    Math.floor(normalisedProgress(progress) * state.cellCount),
  )
}

/**
 * A lateral coordinate is an internal physical lane, not an observed driving
 * line. Grid slots inside 1.6 m of the centreline remain on the line.
 */
export function trackSurfaceLaneForLateralOffset(
  lateralOffsetM: number,
  offLineThresholdM = 1.6,
): TrackSurfaceLane {
  const threshold = Math.max(0.25, finiteOr(offLineThresholdM, 1.6))

  return Math.abs(finiteOr(lateralOffsetM, 0)) >= threshold
    ? 'off-line'
    : 'racing-line'
}

export function trackSurfaceAt(
  state: TrackSurfaceState,
  options: {
    lane?: TrackSurfaceLane
    lateralOffsetM?: number
    progress: number
  },
): ResolvedTrackSurface {
  const lane =
    options.lane ?? trackSurfaceLaneForLateralOffset(options.lateralOffsetM ?? 0)
  const cellIndex = trackSurfaceCellForProgress(state, options.progress)
  const index = flatIndex(cellIndex, lane)
  const marbles = clamp(state.marbles[index] ?? 0, 0, 1)

  return {
    // Water and bonded rubber intentionally do not appear here. Their
    // dedicated grip composition consumes these canonical fields separately,
    // so callers cannot accidentally count them twice.
    baseGripMultiplier: clamp(
      (state.baseFriction[index] ?? state.defaults.baseFriction) *
        (1 - marbles * 0.04),
      0.82,
      1.05,
    ),
    bondedRubber: clamp(state.bondedRubber[index] ?? 0, 0, 1),
    cellIndex,
    dryness: clamp(state.dryness[index] ?? 0, 0, 1),
    lane,
    marbles,
    surfaceTemperatureC: clamp(state.surfaceTemperatureC[index] ?? 30, -20, 90),
    waterFilmMm: clamp(state.waterFilmMm[index] ?? 0, 0, 6),
  }
}

/** Narrow runtime input; excludes water and bonded-rubber effects by design. */
export function trackSurfaceBaseGripMultiplierAt(
  state: TrackSurfaceState,
  options: {
    lane?: TrackSurfaceLane
    lateralOffsetM?: number
    progress: number
  },
) {
  return trackSurfaceAt(state, options).baseGripMultiplier
}

/**
 * One bounded compatibility probe for an isolated cell. The live race uses
 * the flux-accounted whole-state update below; this helper is deliberately
 * independent of circuit-specific fitting and must not run as a second pass.
 */
export function advanceTrackSurfaceCell(options: {
  ambientTemperatureC?: number
  bondedRubber: number
  deltaSeconds: number
  defaults?: Partial<TrackSurfaceDefaults>
  marbles: number
  rainfallMmH: number
  surfaceTemperatureC: number
  tyreDisplacementMmPerSecond?: number
  waterFilmMm: number
}): Pick<
  ResolvedTrackSurface,
  'bondedRubber' | 'dryness' | 'marbles' | 'surfaceTemperatureC' | 'waterFilmMm'
> {
  const defaults = defaultsFor(options.defaults)
  const deltaSeconds = clamp(
    finiteOr(options.deltaSeconds, 0),
    0,
    TRACK_SURFACE_MAX_DELTA_SECONDS,
  )
  const rainfallMmH = clamp(
    finiteOr(options.rainfallMmH, 0),
    0,
    TRACK_SURFACE_MAX_RAINFALL_MM_H,
  )
  const rainfallMm = rainfallMmH * (deltaSeconds / 3600)
  const previousWaterMm = clamp(finiteOr(options.waterFilmMm, 0), 0, 6)
  const drainageMm =
    deltaSeconds *
    (0.00022 + previousWaterMm * 0.00028) *
    defaults.drainageCoefficient
  const displacementMm =
    deltaSeconds *
    clamp(finiteOr(options.tyreDisplacementMmPerSecond, 0), 0, 0.02)
  const ambientTemperatureC = finiteOr(options.ambientTemperatureC, 25)
  const previousTemperatureC = clamp(
    finiteOr(options.surfaceTemperatureC, ambientTemperatureC),
    -20,
    90,
  )
  const evaporationMm =
    deltaSeconds *
    Math.max(0, previousTemperatureC - ambientTemperatureC) *
    0.00001 *
    defaults.evaporationCoefficient
  const waterFilmMm = clamp(
    previousWaterMm + rainfallMm - drainageMm - displacementMm - evaporationMm,
    0,
    6,
  )
  const dryness = clamp(1 - waterFilmMm / 2.8 - rainfallMmH / 18, 0, 1)
  const surfaceTemperatureC = clamp(
    previousTemperatureC +
      (ambientTemperatureC - previousTemperatureC) *
        clamp(deltaSeconds * 0.015, 0, 1),
    -20,
    90,
  )

  return {
    bondedRubber: clamp(finiteOr(options.bondedRubber, 0), 0, 1),
    dryness,
    marbles: clamp(finiteOr(options.marbles, 0), 0, 1),
    surfaceTemperatureC,
    waterFilmMm,
  }
}

/**
 * Advances the canonical cell/lane substrate without consulting render
 * geometry or inferred circuit properties. Public updates are integrated in
 * this surface-evolution policy's bounded 50 ms slices, up to the existing
 * 30 s safety bound, so coarse callers follow one deterministic local sequence.
 *
 * `rubberEvolutionEnabled: false` freezes bonded rubber and marbles together,
 * including wash and migration. This retains the established timed-session
 * fairness policy while water, drying maturity, and temperature keep moving.
 */
export function advanceTrackSurface(options: {
  ambientTemperatureC?: number
  deltaSeconds: number
  previous: TrackSurfaceState
  rainfallMmH: number
  rubberEvolutionEnabled?: boolean
  targetSurfaceTemperatureC?: number
  traversals?: readonly TrackSurfaceTraversal[]
}): TrackSurfaceEvolutionResult {
  const rawDeltaSeconds = Math.max(0, finiteOr(options.deltaSeconds, 0))
  const deltaSeconds = clamp(
    rawDeltaSeconds,
    0,
    TRACK_SURFACE_MAX_DELTA_SECONDS,
  )
  const appliedTravelFraction = rawDeltaSeconds > 0
    ? deltaSeconds / rawDeltaSeconds
    : 0
  const rainfallMmH = clamp(
    finiteOr(options.rainfallMmH, 0),
    0,
    TRACK_SURFACE_MAX_RAINFALL_MM_H,
  )
  const ambientTemperatureC = clamp(
    finiteOr(options.ambientTemperatureC, 25),
    -20,
    90,
  )
  const targetSurfaceTemperatureC = clamp(
    finiteOr(options.targetSurfaceTemperatureC, ambientTemperatureC),
    -20,
    90,
  )
  const rubberEvolutionEnabled = options.rubberEvolutionEnabled !== false
  const state = cloneTrackSurfaceState(options.previous)
  const waterBefore = finiteArraySum(state.waterFilmMm)
  const rubberBefore = rubberCoverageSum(state)
  const flux: TrackSurfaceEvolutionFlux = {
    rubber: {
      afterCoverageSum: rubberBefore,
      beforeCoverageSum: rubberBefore,
      marbleMigrationCoverageSum: 0,
      removedCoverageSum: 0,
      tyreDepositCoverageSum: 0,
      washedCoverageSum: 0,
    },
    water: {
      afterFilmDepthSumMm: waterBefore,
      beforeFilmDepthSumMm: waterBefore,
      drainageFilmDepthSumMm: 0,
      evaporationFilmDepthSumMm: 0,
      overflowRemovedFilmDepthSumMm: 0,
      rainfallFilmDepthSumMm: 0,
      tyreSprayDisplacementFilmDepthSumMm: 0,
    },
  }

  if (deltaSeconds <= 0) {
    return { flux, state }
  }

  const sliceCount = Math.max(
    1,
    Math.ceil(deltaSeconds / TRACK_SURFACE_EVOLUTION_SLICE_SECONDS),
  )
  const sliceSeconds = deltaSeconds / sliceCount
  const traversals = options.traversals ?? []

  for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex += 1) {
    const passCoverage = new Float64Array(state.waterFilmMm.length)
    const movingOccupancySeconds = new Float64Array(state.waterFilmMm.length)
    const sliceProgress = sliceIndex / sliceCount

    for (const traversal of traversals) {
      const totalDistanceLaps =
        clamp(
          finiteOr(traversal.distanceLaps, 0),
          0,
          TRACK_SURFACE_MAX_TRAVERSAL_DISTANCE_LAPS,
        ) * appliedTravelFraction
      const sliceDistanceLaps = totalDistanceLaps / sliceCount

      addTraversalExposure({
        distanceLaps: sliceDistanceLaps,
        lane: traversal.lane,
        movingOccupancySeconds,
        passCoverage,
        sliceSeconds,
        startProgress:
          normalisedProgress(traversal.startProgress) +
          totalDistanceLaps * sliceProgress,
        state,
      })
    }

    const rainfallMm = rainfallMmH * (sliceSeconds / 3600)

    for (let index = 0; index < state.waterFilmMm.length; index += 1) {
      const previousWaterMm = clamp(
        finiteOr(state.waterFilmMm[index], 0),
        0,
        6,
      )
      let availableWaterMm = previousWaterMm + rainfallMm
      const drainageRequestMm =
        sliceSeconds *
        (0.00022 + previousWaterMm * 0.00028) *
        state.defaults.drainageCoefficient
      const drainageMm = Math.min(
        availableWaterMm,
        Math.max(0, drainageRequestMm),
      )
      availableWaterMm -= drainageMm

      // Displaced film leaves the represented cell/lane as tyre spray. The
      // model has no physical width with which to convert this depth to mass.
      const tyreSprayRequestMm =
        movingOccupancySeconds[index] *
        Math.min(0.000035, previousWaterMm * 0.000012)
      const tyreSprayDisplacementMm = Math.min(
        availableWaterMm,
        Math.max(0, tyreSprayRequestMm),
      )
      availableWaterMm -= tyreSprayDisplacementMm

      const previousTemperatureC = clamp(
        finiteOr(state.surfaceTemperatureC[index], targetSurfaceTemperatureC),
        -20,
        90,
      )
      const evaporationRequestMm =
        sliceSeconds *
        Math.max(0, previousTemperatureC - targetSurfaceTemperatureC) *
        0.00001 *
        state.defaults.evaporationCoefficient
      const evaporationMm = Math.min(
        availableWaterMm,
        Math.max(0, evaporationRequestMm),
      )
      availableWaterMm -= evaporationMm

      // Without sourced slope/camber there is no directional cell transfer.
      // Only stock beyond the represented 6 mm film capacity is removed.
      const overflowRemovedMm = Math.max(0, availableWaterMm - 6)
      const waterFilmMm = availableWaterMm - overflowRemovedMm
      const previousDryness = clamp(
        finiteOr(state.dryness[index], 1),
        0,
        1,
      )
      const targetDryness = clamp(
        1 - waterFilmMm / 2.8 - rainfallMmH / 18,
        0,
        1,
      )
      const dryingResponse =
        targetDryness < previousDryness
          ? sliceSeconds / 150
          : sliceSeconds / 900 + movingOccupancySeconds[index] / 18_000

      state.waterFilmMm[index] = waterFilmMm
      state.dryness[index] = clamp(
        previousDryness +
          (targetDryness - previousDryness) * clamp(dryingResponse, 0, 1),
        0,
        1,
      )
      state.surfaceTemperatureC[index] = clamp(
        previousTemperatureC +
          (targetSurfaceTemperatureC - previousTemperatureC) *
            clamp(sliceSeconds * 0.015, 0, 1),
        -20,
        90,
      )

      flux.water.rainfallFilmDepthSumMm += rainfallMm
      flux.water.drainageFilmDepthSumMm += drainageMm
      flux.water.tyreSprayDisplacementFilmDepthSumMm +=
        tyreSprayDisplacementMm
      flux.water.evaporationFilmDepthSumMm += evaporationMm
      flux.water.overflowRemovedFilmDepthSumMm += overflowRemovedMm
    }

    if (!rubberEvolutionEnabled) continue

    for (let index = 0; index < state.bondedRubber.length; index += 1) {
      const previousBondedRubber = clamp(
        finiteOr(state.bondedRubber[index], 0),
        0,
        1,
      )
      const previousMarbles = clamp(
        finiteOr(state.marbles[index], 0),
        0,
        1,
      )
      const waterFilmMm = state.waterFilmMm[index]
      const dryFraction = clamp(
        1 - waterFilmMm / 1.4 - rainfallMmH / 22,
        0,
        1,
      )
      const tyreDepositCoverage =
        passCoverage[index] *
        0.0025 *
        dryFraction *
        (1 - previousBondedRubber * 0.68)
      let bondedRubber =
        previousBondedRubber +
        tyreDepositCoverage * (1 - TRACK_SURFACE_LOOSE_RUBBER_SHARE)
      let marbles =
        previousMarbles +
        tyreDepositCoverage * TRACK_SURFACE_LOOSE_RUBBER_SHARE
      const coverageBeforeWash = bondedRubber + marbles
      const washRequestCoverage =
        rainfallMm * (0.055 + waterFilmMm * 0.025) +
        waterFilmMm * sliceSeconds * 0.00016
      const washedCoverage = Math.min(
        coverageBeforeWash,
        Math.max(0, washRequestCoverage),
      )

      if (coverageBeforeWash > 0 && washedCoverage > 0) {
        const remainingFraction =
          (coverageBeforeWash - washedCoverage) / coverageBeforeWash
        bondedRubber *= remainingFraction
        marbles *= remainingFraction
      }

      const removedCoverage =
        Math.max(0, bondedRubber - 1) + Math.max(0, marbles - 1)
      state.bondedRubber[index] = clamp(bondedRubber, 0, 1)
      state.marbles[index] = clamp(marbles, 0, 1)
      flux.rubber.tyreDepositCoverageSum += tyreDepositCoverage
      flux.rubber.washedCoverageSum += washedCoverage
      flux.rubber.removedCoverageSum += removedCoverage
    }

    for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
      const racingIndex = flatIndex(cellIndex, 'racing-line')
      const offLineIndex = flatIndex(cellIndex, 'off-line')
      const migrationFraction = clamp(
        passCoverage[racingIndex] * TRACK_SURFACE_LOOSE_RUBBER_SHARE,
        0,
        1,
      )
      const migrationRequest = state.marbles[racingIndex] * migrationFraction
      const acceptedMigration = Math.min(
        migrationRequest,
        Math.max(0, 1 - state.marbles[offLineIndex]),
      )
      const removedCoverage = migrationRequest - acceptedMigration

      state.marbles[racingIndex] = clamp(
        state.marbles[racingIndex] - migrationRequest,
        0,
        1,
      )
      state.marbles[offLineIndex] = clamp(
        state.marbles[offLineIndex] + acceptedMigration,
        0,
        1,
      )
      flux.rubber.marbleMigrationCoverageSum += acceptedMigration
      flux.rubber.removedCoverageSum += removedCoverage
    }
  }

  flux.water.afterFilmDepthSumMm = finiteArraySum(state.waterFilmMm)
  flux.rubber.afterCoverageSum = rubberCoverageSum(state)

  return { flux, state }
}

/**
 * Compatibility bridge from the previous three-sector snapshot. Racing-line
 * values exactly reproduce the legacy inputs. The off-line lane receives only
 * a labelled, bounded loose-rubber proxy; it is never presented as telemetry.
 */
export function createTrackSurfaceStateFromLegacySectors(
  legacy: LegacyTrackSurfaceSectors,
  options: {
    cellCount?: number
    defaults?: Partial<TrackSurfaceDefaults>
    initialSurfaceTemperatureC?: number
    profile?: TrackSurfaceProfile
  } = {},
): TrackSurfaceState {
  const state = createTrackSurfaceState({
    ...options,
    sectorMarks: legacy.sectorMarks,
  })

  return applyLegacyTrackSurfaceSectorsToState(state, legacy)
}

/**
 * Replaces dynamic lane values with historic three-sector compatibility
 * values and returns a fresh canonical state. This is a one-time migration
 * adapter for legacy checkpoints and focused fixtures, not a live simulation
 * step. The race loop must evolve the canonical state directly.
 *
 * The state's cell topology, source-labelled base-friction profile, defaults,
 * sector marks, and temperatures remain canonical. In particular, a
 * `legacy.sectorMarks` value is ignored here; it is only used when initially
 * creating a state so a persisted state cannot silently change its grid.
 */
export function applyLegacyTrackSurfaceSectorsToState(
  state: TrackSurfaceState,
  legacy: LegacyTrackSurfaceSectors,
): TrackSurfaceState {
  const nextState = cloneTrackSurfaceState(state)

  for (let cellIndex = 0; cellIndex < nextState.cellCount; cellIndex += 1) {
    const progress = (cellIndex + 0.5) / nextState.cellCount
    const sector = sectorIndexForProgress(progress, nextState.sectorMarks)
    const rubber = clamp(finiteOr(legacy.rubberLevelBySector[sector], 0), 0, 1)
    const water = clamp(
      finiteOr(legacy.surfaceWaterMmBySector[sector], 0),
      0,
      6,
    )
    const dryingLine = clamp(
      finiteOr(legacy.dryingLineBySector[sector], 1),
      0,
      1,
    )
    const racingIndex = flatIndex(cellIndex, 'racing-line')
    const offLineIndex = flatIndex(cellIndex, 'off-line')

    nextState.bondedRubber[racingIndex] = rubber
    nextState.marbles[racingIndex] = 0
    nextState.waterFilmMm[racingIndex] = water
    nextState.dryness[racingIndex] = dryingLine
    nextState.bondedRubber[offLineIndex] = rubber * 0.58
    // The loose-rubber proxy is deliberately small and globally bounded. It
    // is an internal lane-policy input until local surface observations exist.
    nextState.marbles[offLineIndex] = rubber * 0.24
    nextState.waterFilmMm[offLineIndex] = clamp(
      water + (1 - dryingLine) * 0.14,
      0,
      6,
    )
    nextState.dryness[offLineIndex] = clamp(dryingLine * 0.82, 0, 1)
  }

  return nextState
}

export type TrackSurfaceSectorSummary = {
  dryingLineBySector: [number, number, number]
  rubberLevelBySector: [number, number, number]
  surfaceWaterMmBySector: [number, number, number]
}

type TrackSurfaceSectorSource = Pick<
  TrackSurfaceState,
  'cellCount' | 'sectorMarks'
> & {
  bondedRubber: ArrayLike<number>
  dryness: ArrayLike<number>
  waterFilmMm: ArrayLike<number>
}

/** Canonical racing-line sector summary for runtime and compatibility views. */
export function trackSurfaceSectorSummary(
  state: TrackSurfaceSectorSource,
): TrackSurfaceSectorSummary {
  const totals = Array.from({ length: 3 }, () => ({
    count: 0,
    dryness: 0,
    rubber: 0,
    water: 0,
  }))

  for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
    const sector = sectorIndexForProgress(
      (cellIndex + 0.5) / state.cellCount,
      state.sectorMarks,
    )
    const index = flatIndex(cellIndex, 'racing-line')
    const total = totals[sector]
    total.count += 1
    total.dryness += state.dryness[index] ?? 0
    total.rubber += state.bondedRubber[index] ?? 0
    total.water += state.waterFilmMm[index] ?? 0
  }

  const valueFor = (sector: number, key: 'dryness' | 'rubber' | 'water') => {
    const total = totals[sector]

    return total.count === 0 ? 0 : total[key] / total.count
  }

  return {
    dryingLineBySector: [
      valueFor(0, 'dryness'),
      valueFor(1, 'dryness'),
      valueFor(2, 'dryness'),
    ],
    rubberLevelBySector: [
      valueFor(0, 'rubber'),
      valueFor(1, 'rubber'),
      valueFor(2, 'rubber'),
    ],
    surfaceWaterMmBySector: [
      valueFor(0, 'water'),
      valueFor(1, 'water'),
      valueFor(2, 'water'),
    ],
  }
}
