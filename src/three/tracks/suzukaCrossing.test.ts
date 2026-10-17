import { describe, expect, it } from 'vitest'
import * as T from 'three'
import { roadPose, shoulderExtentAt, barrierOffsetAt, suzukaCrossing, terrainGeometry, widthAt } from './suzukaSurface'

describe('Suzuka lower crossing clearance', () => {
  it('keeps the rendered terrain triangles below the whole lower carriageway and approaches', () => {
    const geometry = terrainGeometry()
    const material = new T.MeshBasicMaterial({ side: T.DoubleSide })
    const terrain = new T.Mesh(geometry, material)
    const ray = new T.Raycaster()
    terrain.updateMatrixWorld()
    for (let i = 0; i <= 40; i++) {
      const progress = suzukaCrossing.lower - .015 + i * .03 / 40
      for (const lane of [-1, -.5, 0, .5, 1]) {
        const p = roadPose(progress, lane * widthAt(progress) / 2).position
        ray.set(p.clone().add(new T.Vector3(0, 100, 0)), new T.Vector3(0, -1, 0))
        const ground = ray.intersectObject(terrain)[0]
        expect(ground, `terrain at lower station ${progress}`).toBeDefined()
        expect(ground.point.y, `lower station ${progress}, lane ${lane}`).toBeLessThan(p.y - .3)
      }
    }
    // Local refinement, rather than increasing resolution over the whole site.
    expect(geometry.attributes.position.count).toBeLessThan(35000)
    geometry.dispose(); material.dispose()
  })
  it('keeps grass within the estimated bridge deck and preserves distant shoulders', () => {
    expect(shoulderExtentAt(suzukaCrossing.upper)).toBeLessThanOrEqual(7)
    expect(barrierOffsetAt(suzukaCrossing.upper, false)).toBeLessThan(7)
    expect(barrierOffsetAt(.2, false)).toBe(widthAt(.2) / 2 + 15)
    expect(shoulderExtentAt(.2)).toBe(widthAt(.2) / 2 + 8)
    const lower = roadPose(suzukaCrossing.lower).position
    const upper = roadPose(suzukaCrossing.upper).position
    expect(upper.y - 1.3 - lower.y).toBeGreaterThan(3)
  })
})
