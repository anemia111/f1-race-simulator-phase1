import { describe, expect, it } from 'vitest'
import { vegetationLayout, vegetationTier } from './vegetationLayout'
import { roadPose, widthAt } from '../tracks/suzukaSurface'

describe('vegetation placement safety', () => {
  it('keeps the same population prefix when the quality changes', () => {
    const low = vegetationLayout(180),
      high = vegetationLayout(700)
    expect(low).toHaveLength(180)
    expect(high).toHaveLength(700)
    expect(high.slice(0, 180)).toEqual(low)
  })
  it('keeps every tree clear of both road branches, including the crossover', () => {
    const samples = Array.from({ length: 512 }, (_, i) => ({
      p: i / 512,
      position: roadPose(i / 512).position,
    }))
    for (const tree of vegetationLayout(700)) {
      const nearest = samples.reduce((a, b) => {
        const d = (p: typeof a) =>
          (tree.position.x - p.position.x) ** 2 +
          (tree.position.z - p.position.z) ** 2
        return d(a) < d(b) ? a : b
      })
      expect(
        Math.hypot(
          tree.position.x - nearest.position.x,
          tree.position.z - nearest.position.z,
        ),
      ).toBeGreaterThanOrEqual(widthAt(nearest.p) / 2 + 22)
      expect(Number.isFinite(tree.position.y)).toBe(true)
    }
  })
  it('caps expensive detail for dense 40-car views independently of field size', () => {
    expect(
      Array.from({ length: 700 }, (_, rank) =>
        vegetationTier(10, rank, 'high'),
      ).filter((l) => l === 'near'),
    ).toHaveLength(6)
    expect(
      Array.from({ length: 700 }, (_, rank) =>
        vegetationTier(10, rank, 'low'),
      ).filter((l) => l === 'near'),
    ).toHaveLength(2)
    expect(vegetationTier(600, 0, 'high')).toBe('far')
  })
})
