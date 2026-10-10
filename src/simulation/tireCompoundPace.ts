import type { TireCompound, TrackDefinition } from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import { simulatePhysicalLap } from './physicalLap'
import { freshTireOffsetSeconds, isDryCompound } from './tires'

const cache = new WeakMap<TrackDefinition, Record<'H' | 'M' | 'S', number>>()

export const compoundReferenceLapOptions = {
  activeAeroZones: false,
  deploymentEnergyBudgetMj: null,
  physics: categoryPhysicsFor('f1-custom'),
} as const

/**
 * Fit a grip coefficient to each user-authored isolated-lap target, once per
 * immutable track object. Live racing only consumes the resulting force
 * envelope: no lap times, positions or following gaps are overwritten.
 * Tow, dirty air, ERS, fuel, management and weather retain their own effects.
 */
export function freshCompoundGripFor(track: TrackDefinition, compound: TireCompound): number {
  if (!track.tirePaceGaps || !isDryCompound(compound)) return 1
  let fitted = cache.get(track)
  if (!fitted) {
    const lapAt = (gripMultiplier: number) => simulatePhysicalLap(track, {
      ...compoundReferenceLapOptions, gripMultiplier,
    }).lapTimeSeconds
    const mediumLap = lapAt(1)
    const fit = (dry: 'H' | 'S') => {
      const target = mediumLap + freshTireOffsetSeconds(dry, track.tireNomination, track.tirePaceGaps)
      let lower = 0.9
      let upper = 1.08
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const grip = (lower + upper) / 2
        if (lapAt(grip) > target) lower = grip
        else upper = grip
      }
      return (lower + upper) / 2
    }
    fitted = { H: fit('H'), M: 1, S: fit('S') }
    cache.set(track, fitted)
  }
  return fitted[compound as 'H' | 'M' | 'S']
}
