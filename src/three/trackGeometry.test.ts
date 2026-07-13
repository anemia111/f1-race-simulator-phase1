import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { poseOnTrack } from './trackGeometry'

describe('track geometry poses', () => {
  it('preserves a unit normal while applying the requested lateral offset', () => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-10, 0, -5),
        new THREE.Vector3(10, 0, -5),
        new THREE.Vector3(10, 0, 5),
        new THREE.Vector3(-10, 0, 5),
      ],
      true,
    )
    const center = poseOnTrack(curve, 0.2, 0)
    const offset = poseOnTrack(curve, 0.2, 3.5)

    expect(offset.normal.length()).toBeCloseTo(1, 8)
    expect(offset.position.distanceTo(center.position)).toBeCloseTo(3.5, 6)
    expect(Math.abs(offset.normal.dot(offset.tangent))).toBeLessThan(1e-8)
  })
})
