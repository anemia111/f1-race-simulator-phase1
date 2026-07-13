import type { CarSnapshot, TrackDefinition } from '../types'
import { sectorIndexForProgress } from './raceEvents'

export type TrackWaterState = {
  dryingLineBySector: [number, number, number]
  surfaceWaterMmBySector: [number, number, number]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function createTrackWaterState(): TrackWaterState {
  return {
    dryingLineBySector: [1, 1, 1],
    surfaceWaterMmBySector: [0, 0, 0],
  }
}

export function advanceTrackWater(options: {
  cars: CarSnapshot[]
  deltaSeconds: number
  previous: TrackWaterState
  rainIntensityMmH: number
  track: TrackDefinition
}): TrackWaterState {
  const { cars, deltaSeconds, previous, rainIntensityMmH, track } = options
  const trafficBySector = [0, 0, 0]

  for (const car of cars) {
    if (car.status !== 'running') {
      continue
    }

    const sector = sectorIndexForProgress(car.progress, track.sectorMarks)
    trafficBySector[sector] += 1
  }

  const surfaceWaterMmBySector = previous.surfaceWaterMmBySector.map(
    (water, sector) => {
      const rainfall = (rainIntensityMmH / 3600) * deltaSeconds
      const baseDrainage = track.kind === 'street' ? 0.00022 : 0.00032
      const drainage =
        deltaSeconds * (baseDrainage + water * 0.00028)
      const carDisplacement =
        trafficBySector[sector] *
        deltaSeconds *
        Math.min(0.000035, water * 0.000012)

      return clamp(water + rainfall - drainage - carDisplacement, 0, 6)
    },
  ) as [number, number, number]
  const dryingLineBySector = surfaceWaterMmBySector.map((water, sector) => {
    const targetDryness = clamp(
      1 - water / 2.8 - rainIntensityMmH / 18,
      0,
      1,
    )
    const previousDryness = previous.dryingLineBySector[sector]
    const response =
      targetDryness < previousDryness
        ? deltaSeconds / 150
        : deltaSeconds *
          (1 / 900 + trafficBySector[sector] / 18_000)

    return clamp(
      previousDryness +
        (targetDryness - previousDryness) * clamp(response, 0, 1),
      0,
      1,
    )
  }) as [number, number, number]

  return { dryingLineBySector, surfaceWaterMmBySector }
}

export function gripForSurfaceWater(
  baseGrip: number,
  waterMm: number,
  dryingLine: number,
) {
  const waterLoss = Math.min(0.38, waterMm * 0.075)
  const lineRecovery = waterLoss * dryingLine * 0.72

  return clamp(baseGrip - waterLoss + lineRecovery, 0.52, 1)
}
