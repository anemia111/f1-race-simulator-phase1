import type { CarSnapshot, TrackDefinition } from '../types'
import { sectorIndexForProgress } from './raceEvents'

export type TrackRubberState = {
  rubberLevelBySector: [number, number, number]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function createTrackRubberState(initialLevel = 0): TrackRubberState {
  const level = clamp(initialLevel, 0, 1)
  return { rubberLevelBySector: [level, level, level] }
}

export function trackEvolutionLevelFor(rubber: [number, number, number]) {
  return rubber.reduce((total, value) => total + value, 0) / rubber.length
}

export function advanceTrackRubber(options: {
  cars: CarSnapshot[]
  deltaSeconds: number
  previous: TrackRubberState
  rainIntensityMmH: number
  surfaceWaterMmBySector: [number, number, number]
  track: TrackDefinition
}): TrackRubberState {
  const {
    cars,
    deltaSeconds,
    previous,
    rainIntensityMmH,
    surfaceWaterMmBySector,
    track,
  } = options
  const equivalentPasses = [0, 0, 0]

  for (const car of cars) {
    if (car.status !== 'running' || car.pitPhase !== 'none') {
      continue
    }

    const sector = sectorIndexForProgress(car.progress, track.sectorMarks)
    const lapDistance =
      Math.max(0, car.speedKph) * (deltaSeconds / 3600) / track.lengthKm
    equivalentPasses[sector] += lapDistance * 3
  }

  const rainfallMm = (rainIntensityMmH / 3600) * deltaSeconds
  const rubberLevelBySector = previous.rubberLevelBySector.map(
    (rubber, sector) => {
      const water = surfaceWaterMmBySector[sector]
      const dryFraction = clamp(1 - water / 1.4 - rainIntensityMmH / 22, 0, 1)
      const deposition =
        equivalentPasses[sector] * 0.0025 * dryFraction * (1 - rubber * 0.68)
      const rainWash = rainfallMm * (0.055 + water * 0.025)
      const standingWaterWash = water * deltaSeconds * 0.00016

      return clamp(rubber + deposition - rainWash - standingWaterWash, 0, 1)
    },
  ) as [number, number, number]

  return { rubberLevelBySector }
}

export function gripWithTrackRubber(
  baseGrip: number,
  rubberLevel: number,
  waterMm: number,
) {
  const dryGain = clamp(rubberLevel, 0, 1) * 0.026
  const wetRubberLoss = Math.min(0.012, waterMm * rubberLevel * 0.009)

  return clamp(baseGrip + dryGain * clamp(1 - waterMm / 0.8, 0, 1) - wetRubberLoss, 0.5, 1.03)
}

export function trackEvolutionGainSecondsFor(
  rubberLevel: number,
  track: TrackDefinition,
) {
  const circuitFactor = track.kind === 'street' ? 1.16 : track.kind === 'hybrid' ? 1.07 : 1

  return clamp(rubberLevel, 0, 1) * 1.65 * circuitFactor
}

