import type { TrackDefinition } from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function trackEvolutionLevelFor(rubber: [number, number, number]) {
  return rubber.reduce((total, value) => total + value, 0) / rubber.length
}

export function gripWithTrackRubber(
  baseGrip: number,
  rubberLevel: number,
  waterMm: number,
) {
  const dryGain = clamp(rubberLevel, 0, 1) * 0.016
  const wetRubberLoss = Math.min(0.012, waterMm * rubberLevel * 0.009)

  return clamp(baseGrip + dryGain * clamp(1 - waterMm / 0.8, 0, 1) - wetRubberLoss, 0.5, 1.03)
}

export function trackEvolutionGainSecondsFor(
  rubberLevel: number,
  track: TrackDefinition,
) {
  const circuitFactor = track.kind === 'street' ? 1.16 : track.kind === 'hybrid' ? 1.07 : 1

  // Rubber already raises the grip used by the physical speed integrator.
  // Keep only a small controller residual for effects that the compact tire
  // model does not resolve (line cleaning and driver confidence).
  return clamp(rubberLevel, 0, 1) * 0.18 * circuitFactor
}
