export type TrackWaterState = {
  dryingLineBySector: [number, number, number]
  surfaceWaterMmBySector: [number, number, number]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function initialSurfaceWaterMmForRain(rainIntensityMmH: number) {
  if (rainIntensityMmH <= 0) {
    return 0
  }

  return clamp(rainIntensityMmH * 0.28, 0.05, 4.5)
}

export function createTrackWaterState(
  rainIntensityMmH = 0,
): TrackWaterState {
  const initialWaterMm = initialSurfaceWaterMmForRain(rainIntensityMmH)
  const initialDryingLine = clamp(
    1 - initialWaterMm / 3.5 - rainIntensityMmH / 18,
    0,
    1,
  )

  return {
    dryingLineBySector: [
      initialDryingLine,
      initialDryingLine,
      initialDryingLine,
    ],
    surfaceWaterMmBySector: [initialWaterMm, initialWaterMm, initialWaterMm],
  }
}

export function gripForSurfaceWater(
  baseGrip: number,
  waterMm: number,
  dryingLine: number,
) {
  const waterLoss = Math.min(0.38, waterMm * 0.075)
  const lineRecovery = waterLoss * dryingLine * 0.72

  return clamp(baseGrip - waterLoss + lineRecovery, 0.52, 1.03)
}
