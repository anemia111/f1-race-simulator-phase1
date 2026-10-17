const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function initialSurfaceWaterMmForRain(rainIntensityMmH: number) {
  if (rainIntensityMmH <= 0) {
    return 0
  }

  return clamp(rainIntensityMmH * 0.28, 0.05, 4.5)
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
