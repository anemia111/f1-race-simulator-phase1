import { describe, expect, it } from 'vitest'
import {
  advanceTrackSurfaceCell,
  createTrackSurfaceState,
  createTrackSurfaceStateFromLegacySectors,
  deserializeTrackSurfaceState,
  legacySectorStateForTrackSurface,
  serializeTrackSurfaceState,
  trackSurfaceAt,
  trackSurfaceBaseGripMultiplierAt,
  trackSurfaceCellForProgress,
  trackSurfaceLaneForLateralOffset,
} from './trackSurface'

describe('local track surface', () => {
  it('starts as a neutral, bounded two-lane typed-array substrate', () => {
    const state = createTrackSurfaceState({ cellCount: 12 })

    expect(state.laneCount).toBe(2)
    expect(state.bondedRubber).toBeInstanceOf(Float64Array)
    expect(state.bondedRubber.length).toBe(24)
    expect(trackSurfaceAt(state, { progress: 0.42 })).toMatchObject({
      baseGripMultiplier: 1,
      bondedRubber: 0,
      dryness: 1,
      lane: 'racing-line',
      marbles: 0,
      waterFilmMm: 0,
    })
    expect(state.defaults.source).toBe('simulator-policy')
  })

  it('wraps progress and keeps lane selection bounded', () => {
    const state = createTrackSurfaceState({ cellCount: 12 })

    expect(trackSurfaceCellForProgress(state, -0.01)).toBe(11)
    expect(trackSurfaceCellForProgress(state, 1.01)).toBe(0)
    expect(trackSurfaceLaneForLateralOffset(1.59)).toBe('racing-line')
    expect(trackSurfaceLaneForLateralOffset(-1.6)).toBe('off-line')
  })

  it('bridges legacy sector values exactly on the racing line', () => {
    const legacy = {
      dryingLineBySector: [0.9, 0.45, 0.1] as [number, number, number],
      rubberLevelBySector: [0.25, 0.6, 0.85] as [number, number, number],
      sectorMarks: [0, 0.34, 0.68],
      surfaceWaterMmBySector: [0.1, 0.8, 2.4] as [number, number, number],
    }
    const state = createTrackSurfaceStateFromLegacySectors(legacy, {
      cellCount: 96,
    })
    const first = trackSurfaceAt(state, { progress: 0.2 })
    const second = trackSurfaceAt(state, { progress: 0.5 })
    const third = trackSurfaceAt(state, { progress: 0.82 })

    expect(first.bondedRubber).toBeCloseTo(0.25, 5)
    expect(first.dryness).toBeCloseTo(0.9, 5)
    expect(first.waterFilmMm).toBeCloseTo(0.1, 5)
    expect(second.bondedRubber).toBeCloseTo(0.6, 5)
    expect(second.dryness).toBeCloseTo(0.45, 5)
    expect(second.waterFilmMm).toBeCloseTo(0.8, 5)
    expect(third.bondedRubber).toBeCloseTo(0.85, 5)
    expect(third.dryness).toBeCloseTo(0.1, 5)
    expect(third.waterFilmMm).toBeCloseTo(2.4, 5)
    expect(legacySectorStateForTrackSurface(state).rubberLevelBySector[1]).toBeCloseTo(0.6, 5)
  })

  it('labels off-line loose rubber without multiplying legacy water or rubber', () => {
    const state = createTrackSurfaceStateFromLegacySectors({
      dryingLineBySector: [1, 1, 1],
      rubberLevelBySector: [1, 1, 1],
      surfaceWaterMmBySector: [0, 0, 0],
    })
    const racing = trackSurfaceAt(state, { progress: 0.2, lane: 'racing-line' })
    const offLine = trackSurfaceAt(state, { progress: 0.2, lane: 'off-line' })

    expect(racing.baseGripMultiplier).toBe(1)
    expect(offLine.marbles).toBeGreaterThan(0)
    expect(offLine.baseGripMultiplier).toBeLessThan(racing.baseGripMultiplier)
    expect(trackSurfaceBaseGripMultiplierAt(state, { progress: 0.2, lateralOffsetM: 2 })).toBe(
      offLine.baseGripMultiplier,
    )
  })

  it('resolves only source-labelled profile sections into the local base grip', () => {
    const state = createTrackSurfaceState({
      cellCount: 100,
      profile: {
        baseFriction: 0.98,
        sections: [
          {
            baseFriction: 0.9,
            endProgress: 0.18,
            source: 'simulator-policy',
            sourceLabel: 'Test-only adverse-camber policy section',
            startProgress: 0.82,
          },
        ],
        source: 'simulator-policy',
        sourceLabel: 'Test-only global surface policy',
      },
    })

    expect(trackSurfaceAt(state, { progress: 0.5 }).baseGripMultiplier).toBeCloseTo(0.98, 8)
    expect(trackSurfaceAt(state, { progress: 0.9 }).baseGripMultiplier).toBeCloseTo(0.9, 8)
    expect(trackSurfaceAt(state, { progress: 0.05 }).baseGripMultiplier).toBeCloseTo(0.9, 8)
    expect(deserializeTrackSurfaceState(serializeTrackSurfaceState(state))?.profile).toEqual(
      state.profile,
    )
  })

  it('fails malformed profile provenance closed to the neutral surface', () => {
    const state = createTrackSurfaceState({
      profile: {
        baseFriction: 0.82,
        source: 'unverified-import',
        sourceLabel: '',
      } as never,
    })

    expect(trackSurfaceAt(state, { progress: 0.4 }).baseGripMultiplier).toBe(1)
  })

  it('keeps water nonnegative and responds monotonically to rain and drainage', () => {
    const dry = advanceTrackSurfaceCell({
      bondedRubber: 0.5,
      deltaSeconds: 60,
      marbles: 0.1,
      rainfallMmH: 0,
      surfaceTemperatureC: 35,
      tyreDisplacementMmPerSecond: 0.002,
      waterFilmMm: 1,
    })
    const rain = advanceTrackSurfaceCell({
      bondedRubber: 0.5,
      deltaSeconds: 60,
      marbles: 0.1,
      rainfallMmH: 24,
      surfaceTemperatureC: 35,
      tyreDisplacementMmPerSecond: 0.002,
      waterFilmMm: 1,
    })

    expect(dry.waterFilmMm).toBeGreaterThanOrEqual(0)
    expect(rain.waterFilmMm).toBeGreaterThan(dry.waterFilmMm)
    expect(rain.dryness).toBeLessThan(dry.dryness)
    expect(Object.values(rain).every(Number.isFinite)).toBe(true)
  })

  it('round-trips only a valid serializable state', () => {
    const state = createTrackSurfaceStateFromLegacySectors({
      dryingLineBySector: [0.8, 0.6, 0.4],
      rubberLevelBySector: [0.2, 0.4, 0.6],
      surfaceWaterMmBySector: [0.1, 0.3, 0.8],
    })
    const restored = deserializeTrackSurfaceState(serializeTrackSurfaceState(state))

    expect(restored).not.toBeNull()
    expect(restored && serializeTrackSurfaceState(restored)).toEqual(
      serializeTrackSurfaceState(state),
    )
    expect(deserializeTrackSurfaceState({ cellCount: 12 })).toBeNull()
  })
})
