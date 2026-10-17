import * as T from 'three'
import { roadPose, widthAt } from '../tracks/suzukaSurface'

export type TreePlacement = {
  position: T.Vector3
  scale: number
  yaw: number
  species: number
  tint: T.Color
}
const roadSamples = Array.from({ length: 512 }, (_, i) => ({
  p: i / 512,
  position: roadPose(i / 512).position,
}))

/** Generic planted/woodland analogues, not measured tree locations or species. */
export function vegetationLayout(count: number): TreePlacement[] {
  const trees: TreePlacement[] = []
  let seed = 6019
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 4294967296
  }
  for (
    let attempt = 0;
    trees.length < count && attempt < count * 20;
    attempt++
  ) {
    const p = 0.09 + random() * 0.83,
      side = random() > 0.5 ? 1 : -1
    const position = roadPose(
      p,
      side * (widthAt(p) / 2 + 38 + random() * 105),
    ).position
    let closest = roadSamples[0],
      d2 = Infinity
    for (const sample of roadSamples) {
      const d =
        (position.x - sample.position.x) ** 2 +
        (position.z - sample.position.z) ** 2
      if (d < d2) {
        d2 = d
        closest = sample
      }
    }
    // Exclude all road branches, including the other arm of the figure eight.
    if (d2 < (widthAt(closest.p) / 2 + 22) ** 2) continue
    position.y = closest.position.y - 1.2 - Math.min(6, Math.sqrt(d2) * 0.006)
    trees.push({
      position,
      scale: (9 + random() * 8) / 14,
      yaw: random() * Math.PI * 2,
      species: trees.length % 3,
      tint: new T.Color().setHSL(
        0.22 + random() * 0.04,
        0.12 + random() * 0.08,
        0.7 + random() * 0.15,
      ),
    })
  }
  return trees
}

export function vegetationTier(
  distance: number,
  rank: number,
  quality: 'high' | 'medium' | 'low',
) {
  const nearBudget = quality === 'high' ? 6 : quality === 'medium' ? 4 : 2
  const midBudget = quality === 'high' ? 24 : quality === 'medium' ? 16 : 8
  if (distance < 75 && rank < nearBudget) return 'near'
  if (distance < 180 && rank < midBudget) return 'mid'
  return 'far'
}
