import type { TrackDefinition } from '../types'
import { sourcedPhysicalRoadInputsAt } from './physicalRoadProfiles'
import { GRAVITY_MPS2 } from './tyreForces'

const finiteOr = (value: number | undefined, fallback: number) =>
  value !== undefined && Number.isFinite(value) ? value : fallback
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function airDensityKgM3(options: { altitudeMeters?: number; temperatureC?: number }) {
  const altitude = clamp(finiteOr(options.altitudeMeters, 100), -100, 3000)
  const temperatureK = clamp(finiteOr(options.temperatureC, 25), -80, 80) + 273.15
  const pressurePa = 101325 * (1 - 2.25577e-5 * altitude) ** 5.25588
  return pressurePa / (287.05 * temperatureK)
}

/** Profile elevation is absolute altitude, not render-centreline Y. */
export function trackAtmosphereAt(track: TrackDefinition, progress: number, temperatureC = 25) {
  const elevation = sourcedPhysicalRoadInputsAt(track, progress)?.elevationMeters?.value
  const hasProfile = elevation != null && Number.isFinite(elevation)
  const hasTrackAltitude = track.altitudeMeters != null && Number.isFinite(track.altitudeMeters)
  const altitudeMeters = hasProfile ? elevation : finiteOr(track.altitudeMeters, 100)
  return {
    altitudeMeters,
    source: hasProfile ? 'source-labelled-profile' as const : hasTrackAltitude ? 'track-altitude' as const : 'sim-default' as const,
    airDensityKgM3: airDensityKgM3({ altitudeMeters, temperatureC }),
  }
}

/** Positive uphill resistance; retain sourced 8% grades instead of clipping to 3.5%. */
export function roadGradeForceN(massKg: number, gradeFraction: number) {
  const grade = clamp(finiteOr(gradeFraction, 0), -0.2, 0.2)
  return Math.max(0, finiteOr(massKg, 0)) * GRAVITY_MPS2 * Math.sin(Math.atan(grade))
}
