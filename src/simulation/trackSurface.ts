import type { TrackSurfaceProfile } from '../types'

/**
 * Local, deterministic road-surface state.
 *
 * This module deliberately separates the compact physical surface substrate
 * from the legacy three-sector compatibility adapter. Callers can materialise
 * or update this typed-array state from that adapter without claiming that
 * either lane was measured from OpenF1 location samples.
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
    // Water and bonded rubber intentionally do not appear here: legacy water
    // and rubber force composition remains the authority in the first adapter
    // slice, so callers cannot accidentally count them twice.
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
 * One bounded local update for future direct cell ownership. It is deliberately
 * independent of circuit-specific fitting and preserves a non-negative water
 * balance under arbitrary input.
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
  const deltaSeconds = clamp(finiteOr(options.deltaSeconds, 0), 0, 30)
  const rainfallMm = Math.max(0, finiteOr(options.rainfallMmH, 0)) *
    (deltaSeconds / 3600)
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
  const dryness = clamp(1 - waterFilmMm / 2.8 - Math.max(0, options.rainfallMmH) / 18, 0, 1)
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
 * Replaces dynamic lane values with the current three-sector compatibility
 * values and returns a fresh canonical state. This is deliberately a direct
 * projection, not a local surface simulation step: callers must run the
 * legacy water/rubber update once, then call this helper once to reflect its
 * result into the canonical two-lane state.
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
  const nextState: TrackSurfaceState = {
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

/** Legacy UI/checkpoint fields reconstructed from the racing-line lane. */
export function legacySectorStateForTrackSurface(state: TrackSurfaceState): {
  dryingLineBySector: [number, number, number]
  rubberLevelBySector: [number, number, number]
  surfaceWaterMmBySector: [number, number, number]
} {
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
