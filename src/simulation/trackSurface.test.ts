import { describe, expect, it } from 'vitest'
import {
  advanceTrackSurface,
  advanceTrackSurfaceCell,
  applyLegacyTrackSurfaceSectorsToState,
  createInitialTrackSurfaceState,
  createTrackSurfaceState,
  createTrackSurfaceStateFromLegacySectors,
  deserializeTrackSurfaceState,
  trackSurfaceSectorSummary,
  serializeTrackSurfaceState,
  trackSurfaceAt,
  trackSurfaceBaseGripMultiplierAt,
  trackSurfaceCellForProgress,
  trackSurfaceLaneForLateralOffset,
} from './trackSurface'
import type { TrackSurfaceEvolutionFlux } from './trackSurface'

function expectWaterFluxToClose(
  flux: TrackSurfaceEvolutionFlux['water'],
  precision = 10,
) {
  expect(flux.afterFilmDepthSumMm).toBeCloseTo(
    flux.beforeFilmDepthSumMm +
      flux.rainfallFilmDepthSumMm -
      flux.drainageFilmDepthSumMm -
      flux.tyreSprayDisplacementFilmDepthSumMm -
      flux.evaporationFilmDepthSumMm -
      flux.overflowRemovedFilmDepthSumMm,
    precision,
  )
}

function expectRubberFluxToClose(
  flux: TrackSurfaceEvolutionFlux['rubber'],
  precision = 10,
) {
  expect(flux.afterCoverageSum).toBeCloseTo(
    flux.beforeCoverageSum +
      flux.tyreDepositCoverageSum -
      flux.washedCoverageSum -
      flux.removedCoverageSum,
    precision,
  )
}

describe('local track surface', () => {
  it('creates a fresh canonical surface directly from initial rain', () => {
    const state = createInitialTrackSurfaceState({
      cellCount: 12,
      initialRainIntensityMmH: 2,
      initialSurfaceTemperatureC: 34,
      sectorMarks: [0, 1 / 3, 2 / 3],
    })
    const racing = trackSurfaceAt(state, {
      lane: 'racing-line',
      progress: 0.2,
    })
    const offLine = trackSurfaceAt(state, {
      lane: 'off-line',
      progress: 0.2,
    })
    const expectedDryness = 1 - 0.56 / 3.5 - 2 / 18

    expect(racing.bondedRubber).toBe(0)
    expect(racing.surfaceTemperatureC).toBe(34)
    expect(racing.waterFilmMm).toBeCloseTo(0.56, 12)
    expect(racing.dryness).toBeCloseTo(expectedDryness, 12)
    expect(offLine.bondedRubber).toBe(0)
    expect(offLine.waterFilmMm).toBeCloseTo(
      0.56 + (1 - expectedDryness) * 0.14,
      12,
    )
    expect(offLine.dryness).toBeCloseTo(expectedDryness * 0.82, 12)
  })

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
    expect(trackSurfaceSectorSummary(state).rubberLevelBySector[1]).toBeCloseTo(0.6, 5)
  })

  it('projects one legacy update into a fresh canonical state without changing its grid', () => {
    const canonical = createTrackSurfaceState({
      cellCount: 96,
      initialSurfaceTemperatureC: 37,
      profile: {
        baseFriction: 0.98,
        source: 'simulator-policy',
        sourceLabel: 'Test-only canonical profile',
      },
      sectorMarks: [0, 1 / 3, 2 / 3],
    })
    canonical.marbles.fill(0.9)
    canonical.surfaceTemperatureC[0] = 41
    const before = serializeTrackSurfaceState(canonical)
    const legacy = {
      dryingLineBySector: [1, 0.5, 0.25] as [number, number, number],
      rubberLevelBySector: [0.25, 0.5, 0.75] as [number, number, number],
      // A later compatibility value cannot change a persisted state grid.
      sectorMarks: [0, 0.5, 0.75],
      surfaceWaterMmBySector: [0.125, 0.5, 1] as [number, number, number],
    }

    const updated = applyLegacyTrackSurfaceSectorsToState(canonical, legacy)
    const restored = deserializeTrackSurfaceState(
      serializeTrackSurfaceState(updated),
    )

    expect(updated).not.toBe(canonical)
    expect(serializeTrackSurfaceState(canonical)).toEqual(before)
    expect(updated.baseFriction).not.toBe(canonical.baseFriction)
    expect(updated.defaults).not.toBe(canonical.defaults)
    expect(updated.profile).not.toBe(canonical.profile)
    expect(updated.sectorMarks).toEqual([0, 1 / 3, 2 / 3])
    expect(updated.surfaceTemperatureC).toEqual(canonical.surfaceTemperatureC)
    expect(trackSurfaceSectorSummary(updated)).toEqual({
      dryingLineBySector: [1, 0.5, 0.25],
      rubberLevelBySector: [0.25, 0.5, 0.75],
      surfaceWaterMmBySector: [0.125, 0.5, 1],
    })
    expect(
      trackSurfaceSectorSummary(serializeTrackSurfaceState(updated)),
    ).toEqual(trackSurfaceSectorSummary(updated))
    expect(trackSurfaceAt(updated, { lane: 'racing-line', progress: 0.5 }))
      .toMatchObject({
        bondedRubber: 0.5,
        dryness: 0.5,
        marbles: 0,
        waterFilmMm: 0.5,
      })
    const offLine = trackSurfaceAt(updated, { lane: 'off-line', progress: 0.5 })
    expect(offLine.bondedRubber).toBeCloseTo(0.5 * 0.58, 12)
    expect(offLine.marbles).toBeCloseTo(0.5 * 0.24, 12)
    expect(offLine.waterFilmMm).toBeCloseTo(0.5 + (1 - 0.5) * 0.14, 12)
    expect(offLine.dryness).toBeCloseTo(0.5 * 0.82, 12)
    expect(restored && serializeTrackSurfaceState(restored)).toEqual(
      serializeTrackSurfaceState(updated),
    )
    expect(restored && trackSurfaceSectorSummary(restored)).toEqual(
      trackSurfaceSectorSummary(updated),
    )
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

  it('advances wrapped traversals deterministically without mutating the input', () => {
    const previous = createTrackSurfaceState({ cellCount: 8 })
    const before = serializeTrackSurfaceState(previous)
    const options = {
      deltaSeconds: 1,
      previous,
      rainfallMmH: 0,
      traversals: [
        {
          distanceLaps: 0.1,
          lane: 'racing-line' as const,
          startProgress: 0.95,
        },
      ],
    }
    const first = advanceTrackSurface(options)
    const repeated = advanceTrackSurface(options)

    expect(serializeTrackSurfaceState(previous)).toEqual(before)
    expect(serializeTrackSurfaceState(first.state)).toEqual(
      serializeTrackSurfaceState(repeated.state),
    )
    expect(first.flux).toEqual(repeated.flux)
    expect(first.state.bondedRubber[0]).toBeGreaterThan(0)
    expect(first.state.bondedRubber[14]).toBeGreaterThan(0)
    expect(first.state.bondedRubber[2]).toBe(0)
    expectWaterFluxToClose(first.flux.water)
    expectRubberFluxToClose(first.flux.rubber)
  })

  it('preserves identical lane evolution without traffic', () => {
    const previous = createTrackSurfaceState({
      cellCount: 6,
      initialSurfaceTemperatureC: 42,
    })
    previous.waterFilmMm.fill(0.5)
    previous.dryness.fill(0.4)

    const { flux, state } = advanceTrackSurface({
      deltaSeconds: 2,
      previous,
      rainfallMmH: 4,
      targetSurfaceTemperatureC: 28,
    })

    for (let cellIndex = 0; cellIndex < state.cellCount; cellIndex += 1) {
      const racingIndex = cellIndex * 2
      const offLineIndex = racingIndex + 1
      expect(state.waterFilmMm[racingIndex]).toBe(
        state.waterFilmMm[offLineIndex],
      )
      expect(state.dryness[racingIndex]).toBe(state.dryness[offLineIndex])
      expect(state.surfaceTemperatureC[racingIndex]).toBe(
        state.surfaceTemperatureC[offLineIndex],
      )
    }
    expect(state.surfaceTemperatureC[0]).toBeLessThan(42)
    expectWaterFluxToClose(flux.water)
    expectRubberFluxToClose(flux.rubber)
  })

  it('uses moving local traffic for tyre spray and drying-line recovery', () => {
    const previous = createTrackSurfaceState({ cellCount: 8 })
    previous.waterFilmMm.fill(1)
    previous.dryness.fill(0)
    const traversals = Array.from({ length: 40 }, () => ({
      distanceLaps: 0.2,
      lane: 'racing-line' as const,
      startProgress: 0.1,
    }))

    const { flux, state } = advanceTrackSurface({
      deltaSeconds: 10,
      previous,
      rainfallMmH: 0,
      rubberEvolutionEnabled: false,
      traversals,
    })
    const crossedRacingIndex = 2
    const pairedOffLineIndex = 3

    expect(flux.water.tyreSprayDisplacementFilmDepthSumMm).toBeGreaterThan(0)
    expect(state.waterFilmMm[crossedRacingIndex]).toBeLessThan(
      state.waterFilmMm[pairedOffLineIndex],
    )
    expect(state.dryness[crossedRacingIndex]).toBeGreaterThan(
      state.dryness[pairedOffLineIndex],
    )
    expectWaterFluxToClose(flux.water)
  })

  it('deposits more tyre rubber on a dry substrate than a wet one', () => {
    const dry = createTrackSurfaceState({ cellCount: 4 })
    const wet = createTrackSurfaceState({ cellCount: 4 })
    wet.waterFilmMm.fill(2)
    wet.dryness.fill(0)
    const traversals = Array.from({ length: 20 }, () => ({
      distanceLaps: 1,
      lane: 'racing-line' as const,
      startProgress: 0,
    }))
    const dryResult = advanceTrackSurface({
      deltaSeconds: 1,
      previous: dry,
      rainfallMmH: 0,
      traversals,
    })
    const wetResult = advanceTrackSurface({
      deltaSeconds: 1,
      previous: wet,
      rainfallMmH: 0,
      traversals,
    })

    expect(dryResult.flux.rubber.tyreDepositCoverageSum).toBeGreaterThan(0)
    expect(dryResult.flux.rubber.tyreDepositCoverageSum).toBeGreaterThan(
      wetResult.flux.rubber.tyreDepositCoverageSum,
    )
    expectRubberFluxToClose(dryResult.flux.rubber)
    expectRubberFluxToClose(wetResult.flux.rubber)
  })

  it('washes bounded bonded and loose rubber under standing water and rain', () => {
    const previous = createTrackSurfaceState({ cellCount: 4 })
    previous.bondedRubber.fill(0.5)
    previous.marbles.fill(0.1)
    previous.waterFilmMm.fill(1)

    const { flux, state } = advanceTrackSurface({
      deltaSeconds: 5,
      previous,
      rainfallMmH: 18,
    })

    expect(flux.rubber.tyreDepositCoverageSum).toBe(0)
    expect(flux.rubber.washedCoverageSum).toBeGreaterThan(0)
    expect(flux.rubber.afterCoverageSum).toBeLessThan(
      flux.rubber.beforeCoverageSum,
    )
    expect(Array.from(state.bondedRubber).every((value) => value >= 0)).toBe(true)
    expect(Array.from(state.marbles).every((value) => value >= 0)).toBe(true)
    expectWaterFluxToClose(flux.water)
    expectRubberFluxToClose(flux.rubber)
  })

  it('migrates marbles internally and freezes every rubber process on request', () => {
    const previous = createTrackSurfaceState()
    previous.marbles[0] = 0.8
    previous.marbles[1] = 0.1
    const traversal = {
      distanceLaps: 1 / 3,
      lane: 'racing-line' as const,
      startProgress: 0,
    }
    const evolved = advanceTrackSurface({
      deltaSeconds: 1,
      previous,
      rainfallMmH: 0,
      traversals: [traversal],
    })
    const frozen = advanceTrackSurface({
      deltaSeconds: 1,
      previous,
      rainfallMmH: 18,
      rubberEvolutionEnabled: false,
      traversals: [traversal],
    })

    expect(evolved.flux.rubber.marbleMigrationCoverageSum).toBeGreaterThan(0)
    expect(evolved.state.marbles[1]).toBeGreaterThan(previous.marbles[1])
    expectRubberFluxToClose(evolved.flux.rubber)
    expect(frozen.state.bondedRubber).toEqual(previous.bondedRubber)
    expect(frozen.state.marbles).toEqual(previous.marbles)
    expect(frozen.flux.rubber.tyreDepositCoverageSum).toBe(0)
    expect(frozen.flux.rubber.washedCoverageSum).toBe(0)
    expect(frozen.flux.rubber.marbleMigrationCoverageSum).toBe(0)
    expect(frozen.flux.rubber.removedCoverageSum).toBe(0)
    expect(frozen.flux.rubber.afterCoverageSum).toBe(
      frozen.flux.rubber.beforeCoverageSum,
    )
  })

  it('accounts for bounded stock removal instead of hiding clamp losses', () => {
    const previous = createTrackSurfaceState({ cellCount: 3 })
    previous.waterFilmMm.fill(6)
    previous.bondedRubber.fill(0.999)
    previous.marbles.fill(0.999)
    const traversals = Array.from({ length: 50 }, () => ({
      distanceLaps: 1,
      lane: 'racing-line' as const,
      startProgress: 0,
    }))
    const result = advanceTrackSurface({
      deltaSeconds: 1,
      previous,
      rainfallMmH: 3600,
      traversals,
    })

    expect(result.flux.water.overflowRemovedFilmDepthSumMm).toBeGreaterThan(0)
    expect(result.flux.rubber.removedCoverageSum).toBeGreaterThan(0)
    expect(Array.from(result.state.waterFilmMm).every(
      (value) => value >= 0 && value <= 6,
    )).toBe(true)
    expect(Array.from(result.state.bondedRubber).every(
      (value) => value >= 0 && value <= 1,
    )).toBe(true)
    expect(Array.from(result.state.marbles).every(
      (value) => value >= 0 && value <= 1,
    )).toBe(true)
    expectWaterFluxToClose(result.flux.water)
    expectRubberFluxToClose(result.flux.rubber)
  })

  it('keeps flux ledgers finite for extreme but finite public inputs', () => {
    const previous = createTrackSurfaceState()
    previous.waterFilmMm.fill(6)
    previous.bondedRubber.fill(0.5)
    previous.marbles.fill(0.5)

    const result = advanceTrackSurface({
      deltaSeconds: Number.MAX_VALUE,
      previous,
      rainfallMmH: Number.MAX_VALUE,
      traversals: [{
        distanceLaps: Number.MAX_VALUE,
        lane: 'racing-line',
        startProgress: Number.MAX_VALUE,
      }],
    })

    expect(Object.values(result.flux.water).every(Number.isFinite)).toBe(true)
    expect(Object.values(result.flux.rubber).every(Number.isFinite)).toBe(true)
    // Hundreds of thousands of bounded 50 ms slot updates accumulate only
    // floating-point summation noise; the relative closure remains <1e-10.
    expectWaterFluxToClose(result.flux.water, 7)
    expectRubberFluxToClose(result.flux.rubber, 7)
  })

  it('matches two 50 ms updates when a coarse frame is internally sliced', () => {
    const previous = createTrackSurfaceState({
      cellCount: 8,
      initialSurfaceTemperatureC: 45,
    })
    previous.waterFilmMm.fill(0.4)
    previous.dryness.fill(0.3)
    const coarse = advanceTrackSurface({
      deltaSeconds: 0.1,
      previous,
      rainfallMmH: 6,
      targetSurfaceTemperatureC: 25,
      traversals: [{
        distanceLaps: 0.02,
        lane: 'racing-line',
        startProgress: 0.2,
      }],
    })
    const first = advanceTrackSurface({
      deltaSeconds: 0.05,
      previous,
      rainfallMmH: 6,
      targetSurfaceTemperatureC: 25,
      traversals: [{
        distanceLaps: 0.01,
        lane: 'racing-line',
        startProgress: 0.2,
      }],
    })
    const second = advanceTrackSurface({
      deltaSeconds: 0.05,
      previous: first.state,
      rainfallMmH: 6,
      targetSurfaceTemperatureC: 25,
      traversals: [{
        distanceLaps: 0.01,
        lane: 'racing-line',
        startProgress: 0.2 + 0.01,
      }],
    })

    expect(serializeTrackSurfaceState(coarse.state)).toEqual(
      serializeTrackSurfaceState(second.state),
    )
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
