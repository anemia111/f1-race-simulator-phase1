import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import {
  timedLapLaunchBlend,
  timedLapLaunchStartProgress,
} from './timedLapPreparation'

describe('timed-lap final-corner preparation', () => {
  it('creates a usable pre-line launch zone on every F1 circuit', () => {
    const f1 = seriesPackageById.get('f1-custom')!

    expect(f1.tracks.length).toBeGreaterThanOrEqual(22)

    for (const track of f1.tracks) {
      const start = timedLapLaunchStartProgress(track)
      const midpoint = start + (1 - start) * 0.5

      expect(start, track.id).toBeGreaterThanOrEqual(0.82)
      expect(start, track.id).toBeLessThanOrEqual(0.985)
      expect(
        timedLapLaunchBlend(track, Math.max(0, start - 0.001), 'out-lap'),
        track.id,
      ).toBe(0)
      expect(timedLapLaunchBlend(track, midpoint, 'out-lap'), track.id).toBeGreaterThan(
        0,
      )
      expect(timedLapLaunchBlend(track, 0.999, 'out-lap'), track.id).toBeGreaterThan(
        0.9,
      )
      expect(timedLapLaunchBlend(track, 0.999, 'attack-lap'), track.id).toBe(0)
    }
  })
})
