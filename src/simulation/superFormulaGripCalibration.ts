import type { TrackDefinition } from '../types'
import { categoryPhysicsFor, type CategoryPhysicsProfile } from './categoryPhysics'
import { simulatePhysicalLap } from './physicalLap'

const cache = new WeakMap<TrackDefinition, CategoryPhysicsProfile>()
/** SIM inverse calibration of the effective dry contact coefficient. This is
 * not a measured Yokohama coefficient: coarse surveyed layout curvature and
 * unknown track friction are not independently identifiable from lap timing.
 * Only SF reference records are eligible; cross-category courses retain the
 * category baseline. The coefficient enters forces, never elapsed time.
 */
export function superFormulaPhysicsForTrack(track: TrackDefinition) {
  const base = categoryPhysicsFor('super-formula')
  const reference = track.paceReference2026
  if (reference?.series !== 'super-formula' || !Number.isFinite(reference.qualifyingSeconds)
    || reference.qualifyingSeconds <= 0) return base
  const cached = cache.get(track)
  if (cached) return cached
  let low = base.peakTyreFrictionCoefficient * 0.85
  let high = base.peakTyreFrictionCoefficient * 1.5
  for (let step = 0; step < 18; step++) {
    const coefficient = (low + high) / 2
    const seconds = simulatePhysicalLap(track, {
      physics: { ...base, peakTyreFrictionCoefficient: coefficient },
      massKg: 676, airTemperatureC: 25, deploymentPowerKw: 0,
      activeAeroZones: false,
    }).lapTimeSeconds
    if (seconds > reference.qualifyingSeconds) low = coefficient
    else high = coefficient
  }
  const physics = { ...base, peakTyreFrictionCoefficient: (low + high) / 2 }
  cache.set(track, physics)
  return physics
}
