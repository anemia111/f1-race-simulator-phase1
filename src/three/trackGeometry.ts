import * as THREE from 'three'
import type { TrackDefinition } from '../types'

export function createTrackCurve(track: TrackDefinition) {
  return new THREE.CatmullRomCurve3(
    track.centerline.map((point) => new THREE.Vector3(...point)),
    true,
    'catmullrom',
    0.48,
  )
}

export function poseOnTrack(
  curve: THREE.CatmullRomCurve3,
  progress: number,
  laneOffset = 0,
) {
  const wrappedProgress = ((progress % 1) + 1) % 1
  const position = curve.getPointAt(wrappedProgress)
  const tangent = curve.getTangentAt(wrappedProgress).normalize()
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()

  return {
    position: position.add(normal.clone().multiplyScalar(laneOffset)),
    tangent,
    normal,
  }
}

export function createTrackRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments = 192,
) {
  const vertices: number[] = []
  const indices: number[] = []

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const center = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    const left = center.clone().add(normal.clone().multiplyScalar(width / 2))
    const right = center.clone().add(normal.clone().multiplyScalar(-width / 2))

    vertices.push(left.x, left.y + 0.02, left.z)
    vertices.push(right.x, right.y + 0.02, right.z)
  }

  for (let index = 0; index < segments; index += 1) {
    const a = index * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3

    indices.push(a, c, b, b, c, d)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}

export function edgePoints(
  curve: THREE.CatmullRomCurve3,
  width: number,
  side: -1 | 1,
  segments = 192,
) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const progress = index / segments
    const center = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()

    return center.add(normal.multiplyScalar((width / 2) * side)).setY(0.06)
  })
}
