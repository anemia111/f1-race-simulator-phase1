import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { TrackDefinition } from '../types'
import { gripWithTrackRubber } from './trackEvolution'
import {
  advanceTrackSurface,
  createTrackSurfaceState,
  serializeTrackSurfaceState,
  trackSurfaceAt,
  type TrackSurfaceEvolutionFlux,
  type TrackSurfaceEvolutionResult,
  type TrackSurfaceLane,
  type TrackSurfaceState,
  type TrackSurfaceTraversal,
} from './trackSurface'
import { gripForSurfaceWater } from './trackWater'

const MATRIX_TRACK_IDS = [
  'monaco-approx',
  'monza-approx',
  'singapore-approx',
  'spa-approx',
  'suzuka-approx',
  'zandvoort-approx',
] as const

const MATRIX_TRACKS = MATRIX_TRACK_IDS.map((trackId) => {
  const track = tracks.find((candidate) => candidate.id === trackId)

  if (!track) {
    throw new Error(`Missing track-surface acceptance track: ${trackId}`)
  }

  return track
})

const CELL_COUNT = 24
const LINE_TRAVERSALS: TrackSurfaceTraversal[] = [
  { distanceLaps: 0.06, lane: 'racing-line', startProgress: 0.97 },
  { distanceLaps: 0.045, lane: 'racing-line', startProgress: 0.14 },
  { distanceLaps: 0.05, lane: 'racing-line', startProgress: 0.42 },
  { distanceLaps: 0.04, lane: 'racing-line', startProgress: 0.71 },
]

type DynamicSeed = {
  bondedRubber: number
  dryness: number
  marbles: number
  surfaceTemperatureC: number
  waterFilmMm: number
}

type EvolutionOptions = Omit<
  Parameters<typeof advanceTrackSurface>[0],
  'previous'
>

function sum(values: ArrayLike<number>) {
  return Array.from(values).reduce((total, value) => total + value, 0)
}

function laneSum(values: ArrayLike<number>, lane: TrackSurfaceLane) {
  const laneIndex = lane === 'off-line' ? 1 : 0
  let total = 0

  for (let index = laneIndex; index < values.length; index += 2) {
    total += values[index]
  }

  return total
}

function createSeededState(track: TrackDefinition, seed: DynamicSeed) {
  const state = createTrackSurfaceState({
    cellCount: CELL_COUNT,
    initialSurfaceTemperatureC: seed.surfaceTemperatureC,
    profile: track.surfaceProfile,
    sectorMarks: track.sectorMarks,
  })

  state.bondedRubber.fill(seed.bondedRubber)
  state.dryness.fill(seed.dryness)
  state.marbles.fill(seed.marbles)
  state.surfaceTemperatureC.fill(seed.surfaceTemperatureC)
  state.waterFilmMm.fill(seed.waterFilmMm)

  return state
}

function expectWaterFluxToClose(flux: TrackSurfaceEvolutionFlux['water']) {
  expect(flux.afterFilmDepthSumMm).toBeCloseTo(
    flux.beforeFilmDepthSumMm +
      flux.rainfallFilmDepthSumMm -
      flux.drainageFilmDepthSumMm -
      flux.tyreSprayDisplacementFilmDepthSumMm -
      flux.evaporationFilmDepthSumMm -
      flux.overflowRemovedFilmDepthSumMm,
    10,
  )
}

function expectRubberFluxToClose(flux: TrackSurfaceEvolutionFlux['rubber']) {
  expect(flux.afterCoverageSum).toBeCloseTo(
    flux.beforeCoverageSum +
      flux.tyreDepositCoverageSum -
      flux.washedCoverageSum -
      flux.removedCoverageSum,
    10,
  )
}

function expectFiniteAndBounded(state: TrackSurfaceState) {
  const bounded = (
    values: ArrayLike<number>,
    minimum: number,
    maximum: number,
  ) => Array.from(values).every(
    (value) => Number.isFinite(value) && value >= minimum && value <= maximum,
  )

  expect(bounded(state.baseFriction, 0.82, 1.05)).toBe(true)
  expect(bounded(state.bondedRubber, 0, 1)).toBe(true)
  expect(bounded(state.dryness, 0, 1)).toBe(true)
  expect(bounded(state.marbles, 0, 1)).toBe(true)
  expect(bounded(state.surfaceTemperatureC, -20, 90)).toBe(true)
  expect(bounded(state.waterFilmMm, 0, 6)).toBe(true)
}

function expectAcceptedEvolution(
  previous: TrackSurfaceState,
  options: EvolutionOptions,
): TrackSurfaceEvolutionResult {
  const before = serializeTrackSurfaceState(previous)
  const first = advanceTrackSurface({ ...options, previous })
  const repeated = advanceTrackSurface({ ...options, previous })

  expect(serializeTrackSurfaceState(previous)).toEqual(before)
  expect(serializeTrackSurfaceState(first.state)).toEqual(
    serializeTrackSurfaceState(repeated.state),
  )
  expect(first.flux).toEqual(repeated.flux)
  expect(first.state.baseFriction).toEqual(previous.baseFriction)
  expect(first.state.defaults).toEqual(previous.defaults)
  expect(first.state.profile).toEqual(previous.profile)
  expect(first.state.sectorMarks).toEqual(previous.sectorMarks)
  expect(first.state.cellCount).toBe(previous.cellCount)
  expect(first.state.laneCount).toBe(previous.laneCount)
  expect(first.state.version).toBe(previous.version)
  expectFiniteAndBounded(first.state)
  expectWaterFluxToClose(first.flux.water)
  expectRubberFluxToClose(first.flux.rubber)
  expect(first.flux.water.afterFilmDepthSumMm).toBeCloseTo(
    sum(first.state.waterFilmMm),
    10,
  )
  expect(first.flux.rubber.afterCoverageSum).toBeCloseTo(
    sum(first.state.bondedRubber) + sum(first.state.marbles),
    10,
  )
  expect(
    Object.values(first.flux.water).every(
      (value) => Number.isFinite(value) && value >= 0,
    ),
  ).toBe(true)
  expect(
    Object.values(first.flux.rubber).every(
      (value) => Number.isFinite(value) && value >= 0,
    ),
  ).toBe(true)

  return first
}

function composedGripAt(
  state: TrackSurfaceState,
  lane: TrackSurfaceLane,
  progress: number,
) {
  const surface = trackSurfaceAt(state, { lane, progress })
  const rubberGrip = gripWithTrackRubber(
    surface.baseGripMultiplier,
    surface.bondedRubber,
    surface.waterFilmMm,
  )

  return gripForSurfaceWater(
    rubberGrip,
    surface.waterFilmMm,
    surface.dryness,
  )
}

describe.each(MATRIX_TRACKS)('$id canonical surface scenario matrix', (track) => {
  it('green: gains bounded dry rubber without creating water', () => {
    const previous = createSeededState(track, {
      bondedRubber: 0,
      dryness: 1,
      marbles: 0,
      surfaceTemperatureC: 30,
      waterFilmMm: 0,
    })
    const result = expectAcceptedEvolution(previous, {
      deltaSeconds: 2,
      rainfallMmH: 0,
      targetSurfaceTemperatureC: 30,
      traversals: LINE_TRAVERSALS,
    })

    expect(result.flux.rubber.tyreDepositCoverageSum).toBeGreaterThan(0)
    expect(result.flux.rubber.afterCoverageSum).toBeGreaterThan(
      result.flux.rubber.beforeCoverageSum,
    )
    expect(result.flux.water.rainfallFilmDepthSumMm).toBe(0)
    expect(result.flux.water.afterFilmDepthSumMm).toBe(0)
  })

  it('rubbered: keeps the dry-grip advantage with saturating deposition', () => {
    const green = expectAcceptedEvolution(
      createSeededState(track, {
        bondedRubber: 0,
        dryness: 1,
        marbles: 0,
        surfaceTemperatureC: 30,
        waterFilmMm: 0,
      }),
      {
        deltaSeconds: 2,
        rainfallMmH: 0,
        traversals: LINE_TRAVERSALS,
      },
    )
    const rubbered = expectAcceptedEvolution(
      createSeededState(track, {
        bondedRubber: 0.7,
        dryness: 1,
        marbles: 0.05,
        surfaceTemperatureC: 30,
        waterFilmMm: 0,
      }),
      {
        deltaSeconds: 2,
        rainfallMmH: 0,
        traversals: LINE_TRAVERSALS,
      },
    )

    expect(rubbered.flux.rubber.tyreDepositCoverageSum).toBeLessThan(
      green.flux.rubber.tyreDepositCoverageSum,
    )
    expect(composedGripAt(rubbered.state, 'racing-line', 0.98)).toBeGreaterThan(
      composedGripAt(green.state, 'racing-line', 0.98),
    )
  })

  it('light rain: retains less rubber and more water than the dry control', () => {
    const previous = createSeededState(track, {
      bondedRubber: 0.45,
      dryness: 0.8,
      marbles: 0.08,
      surfaceTemperatureC: 32,
      waterFilmMm: 0.25,
    })
    const dry = expectAcceptedEvolution(previous, {
      deltaSeconds: 2,
      rainfallMmH: 0,
      targetSurfaceTemperatureC: 28,
      traversals: LINE_TRAVERSALS,
    })
    const lightRain = expectAcceptedEvolution(previous, {
      deltaSeconds: 2,
      rainfallMmH: 2,
      targetSurfaceTemperatureC: 28,
      traversals: LINE_TRAVERSALS,
    })

    expect(sum(lightRain.state.waterFilmMm)).toBeGreaterThan(
      sum(dry.state.waterFilmMm),
    )
    expect(sum(lightRain.state.dryness)).toBeLessThan(sum(dry.state.dryness))
    expect(lightRain.flux.rubber.tyreDepositCoverageSum).toBeLessThan(
      dry.flux.rubber.tyreDepositCoverageSum,
    )
    expect(lightRain.flux.rubber.afterCoverageSum).toBeLessThan(
      dry.flux.rubber.afterCoverageSum,
    )
  })

  it('heavy rain: orders water, drying maturity, deposition, and wash beyond light rain', () => {
    const previous = createSeededState(track, {
      bondedRubber: 0.45,
      dryness: 0.8,
      marbles: 0.08,
      surfaceTemperatureC: 32,
      waterFilmMm: 0.25,
    })
    const lightRain = expectAcceptedEvolution(previous, {
      deltaSeconds: 2,
      rainfallMmH: 2,
      targetSurfaceTemperatureC: 28,
      traversals: LINE_TRAVERSALS,
    })
    const heavyRain = expectAcceptedEvolution(previous, {
      deltaSeconds: 2,
      rainfallMmH: 10,
      targetSurfaceTemperatureC: 28,
      traversals: LINE_TRAVERSALS,
    })

    expect(sum(heavyRain.state.waterFilmMm)).toBeGreaterThan(
      sum(lightRain.state.waterFilmMm),
    )
    expect(sum(heavyRain.state.dryness)).toBeLessThan(
      sum(lightRain.state.dryness),
    )
    expect(heavyRain.flux.rubber.tyreDepositCoverageSum).toBeLessThan(
      lightRain.flux.rubber.tyreDepositCoverageSum,
    )
    expect(heavyRain.flux.rubber.washedCoverageSum).toBeGreaterThan(
      lightRain.flux.rubber.washedCoverageSum,
    )
    expect(heavyRain.flux.rubber.afterCoverageSum).toBeLessThan(
      lightRain.flux.rubber.afterCoverageSum,
    )
  })

  it('drying: removes water and restores maturity symmetrically without traffic', () => {
    const previous = createSeededState(track, {
      bondedRubber: 0.4,
      dryness: 0.2,
      marbles: 0.08,
      surfaceTemperatureC: 40,
      waterFilmMm: 1.4,
    })
    const result = expectAcceptedEvolution(previous, {
      deltaSeconds: 10,
      rainfallMmH: 0,
      targetSurfaceTemperatureC: 28,
    })

    expect(sum(result.state.waterFilmMm)).toBeLessThan(
      sum(previous.waterFilmMm),
    )
    expect(sum(result.state.dryness)).toBeGreaterThan(sum(previous.dryness))
    expect(result.state.surfaceTemperatureC[0]).toBeLessThan(40)
    expect(result.flux.water.rainfallFilmDepthSumMm).toBe(0)

    for (let cellIndex = 0; cellIndex < result.state.cellCount; cellIndex += 1) {
      const racingIndex = cellIndex * 2
      const offLineIndex = racingIndex + 1

      expect(result.state.bondedRubber[racingIndex]).toBe(
        result.state.bondedRubber[offLineIndex],
      )
      expect(result.state.dryness[racingIndex]).toBe(
        result.state.dryness[offLineIndex],
      )
      expect(result.state.marbles[racingIndex]).toBe(
        result.state.marbles[offLineIndex],
      )
      expect(result.state.waterFilmMm[racingIndex]).toBe(
        result.state.waterFilmMm[offLineIndex],
      )
    }
  })

  it('off-line: routes traffic by lane and moves marbles away from the racing line', () => {
    const previous = createSeededState(track, {
      bondedRubber: 0.3,
      dryness: 0.4,
      marbles: 0.2,
      surfaceTemperatureC: 30,
      waterFilmMm: 0.7,
    })
    const repeatedLineTraffic = Array.from(
      { length: 24 },
      (): TrackSurfaceTraversal => ({
        distanceLaps: 0.08,
        lane: 'racing-line',
        startProgress: 0.97,
      }),
    )
    const repeatedOffLineTraffic = repeatedLineTraffic.map(
      (traversal): TrackSurfaceTraversal => ({
        ...traversal,
        lane: 'off-line',
      }),
    )
    const lineResult = expectAcceptedEvolution(previous, {
      deltaSeconds: 5,
      rainfallMmH: 0,
      traversals: repeatedLineTraffic,
    })
    const offLineResult = expectAcceptedEvolution(previous, {
      deltaSeconds: 5,
      rainfallMmH: 0,
      traversals: repeatedOffLineTraffic,
    })

    expect(lineResult.flux.rubber.marbleMigrationCoverageSum).toBeGreaterThan(0)
    expect(lineResult.flux.water.tyreSprayDisplacementFilmDepthSumMm).toBeGreaterThan(0)
    expect(
      laneSum(lineResult.state.bondedRubber, 'racing-line'),
    ).toBeGreaterThan(laneSum(lineResult.state.bondedRubber, 'off-line'))
    expect(laneSum(lineResult.state.waterFilmMm, 'racing-line')).toBeLessThan(
      laneSum(lineResult.state.waterFilmMm, 'off-line'),
    )
    expect(laneSum(lineResult.state.dryness, 'racing-line')).toBeGreaterThan(
      laneSum(lineResult.state.dryness, 'off-line'),
    )
    expect(laneSum(lineResult.state.marbles, 'off-line')).toBeGreaterThan(
      laneSum(lineResult.state.marbles, 'racing-line'),
    )
    expect(composedGripAt(lineResult.state, 'racing-line', 0.99)).toBeGreaterThan(
      composedGripAt(lineResult.state, 'off-line', 0.99),
    )
    expect(
      laneSum(offLineResult.state.bondedRubber, 'off-line'),
    ).toBeGreaterThan(laneSum(offLineResult.state.bondedRubber, 'racing-line'))
    expect(laneSum(offLineResult.state.waterFilmMm, 'off-line')).toBeLessThan(
      laneSum(offLineResult.state.waterFilmMm, 'racing-line'),
    )
  })
})

describe('track-surface evolution metamorphic acceptance', () => {
  it('does not infer a different policy from track kind or render geometry', () => {
    const results = MATRIX_TRACKS.map((track) =>
      expectAcceptedEvolution(
        createSeededState(track, {
          bondedRubber: 0.35,
          dryness: 0.55,
          marbles: 0.1,
          surfaceTemperatureC: 35,
          waterFilmMm: 0.6,
        }),
        {
          deltaSeconds: 2,
          rainfallMmH: 4,
          targetSurfaceTemperatureC: 27,
          traversals: LINE_TRAVERSALS,
        },
      ),
    )
    const reference = results[0]

    for (const result of results.slice(1)) {
      expect(result.flux).toEqual(reference.flux)
      expect(result.state.bondedRubber).toEqual(reference.state.bondedRubber)
      expect(result.state.dryness).toEqual(reference.state.dryness)
      expect(result.state.marbles).toEqual(reference.state.marbles)
      expect(result.state.surfaceTemperatureC).toEqual(
        reference.state.surfaceTemperatureC,
      )
      expect(result.state.waterFilmMm).toEqual(reference.state.waterFilmMm)
    }
  })

  it('is independent of traversal ordering for the same local exposures', () => {
    const track = MATRIX_TRACKS[0]
    const previous = createSeededState(track, {
      bondedRubber: 0.25,
      dryness: 0.6,
      marbles: 0.1,
      surfaceTemperatureC: 34,
      waterFilmMm: 0.5,
    })
    const traversals: TrackSurfaceTraversal[] = [
      { distanceLaps: 1 / 32, lane: 'racing-line', startProgress: 0 },
      { distanceLaps: 1 / 16, lane: 'off-line', startProgress: 0.25 },
      { distanceLaps: 1 / 64, lane: 'racing-line', startProgress: 0.5 },
      { distanceLaps: 1 / 32, lane: 'off-line', startProgress: 0.75 },
    ]
    const forward = expectAcceptedEvolution(previous, {
      deltaSeconds: 1,
      rainfallMmH: 3,
      traversals,
    })
    const reversed = expectAcceptedEvolution(previous, {
      deltaSeconds: 1,
      rainfallMmH: 3,
      traversals: [...traversals].reverse(),
    })

    expect(serializeTrackSurfaceState(reversed.state)).toEqual(
      serializeTrackSurfaceState(forward.state),
    )
    expect(reversed.flux).toEqual(forward.flux)
  })
})
