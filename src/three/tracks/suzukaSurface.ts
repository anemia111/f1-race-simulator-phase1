import * as THREE from 'three'
import { realTrackLayouts } from '../../data/realTrackLayouts'
import { measuredRoadProfiles } from '../../data/measuredRoadProfiles'

const layout = realTrackLayouts['suzuka-approx']!
const planar = new THREE.CatmullRomCurve3(
  layout.centerline.map((p) => new THREE.Vector3(...p)),
  true,
  'catmullrom',
  0.48,
)
planar.arcLengthDivisions = 4096
const scale = 5807 / planar.getLength()
const profile = measuredRoadProfiles['suzuka-approx']!
export const wrap = (p: number) => ((p % 1) + 1) % 1

/** DEM-derived height, not a surveyed road deck. No fabricated banking. */
export function elevationAt(p: number) {
  const i = wrap(p) * profile.samples.length
  const a = profile.samples[Math.floor(i)]
  const b = profile.samples[(Math.floor(i) + 1) % profile.samples.length]
  return THREE.MathUtils.lerp(a[1], b[1], i % 1) - 38.133
}
export function widthAt(p: number) {
  // Within official 10–16m range; local allocation is explicitly estimated.
  return p < 0.07 || p > 0.95 ? 14 : p > 0.65 && p < 0.8 ? 12 : 11
}
export function roadPose(p: number, lateral = 0) {
  const u = wrap(p)
  const position = planar.getPointAt(u).multiplyScalar(scale)
  position.y = elevationAt(u)
  const tangent = planar.getTangentAt(u).normalize()
  const forward = planar.getPointAt(wrap(u + 0.0002)).multiplyScalar(scale)
  forward.y = elevationAt(u + 0.0002)
  tangent.copy(forward.sub(position)).normalize()
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
  const up = side.clone().cross(tangent).normalize()
  position.addScaledVector(side, lateral)
  return { position, tangent, side, up }
}

/** Derived pit-route visualization; timing remains the engine's authoritative state. */
export function pitOffset(p: number) {
  const u = wrap(p)
  if (u > 0.94) return -20 * THREE.MathUtils.smoothstep(u, 0.94, 0.965)
  return -20 * (1 - THREE.MathUtils.smoothstep(u, 0.025, 0.055))
}

export const cornerStations = layout.corners.map((c) => {
  const target = new THREE.Vector3(...c.position)
  let best = 0,
    error = Infinity
  for (let i = 0; i < 4096; i++) {
    const d = planar.getPointAt(i / 4096).distanceToSquared(target)
    if (d < error) {
      error = d
      best = i / 4096
    }
  }
  return { number: c.number, progress: best }
})

export function ribbon(
  start: number,
  end: number,
  left: (p: number) => number,
  right: (p: number) => number,
  steps: number,
  height = 0,
) {
  const pos: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  for (let i = 0; i <= steps; i++) {
    const p = start + ((end - start) * i) / steps
    const frame = roadPose(p)
    for (const lateral of [left(wrap(p)), right(wrap(p))]) {
      const v = frame.position
        .clone()
        .addScaledVector(frame.side, lateral)
        .addScaledVector(frame.up, height)
      pos.push(v.x, v.y, v.z)
      uv.push((p * 5807) / 6, lateral / 6)
    }
    if (i < steps) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function terrainGeometry() {
  const g = new THREE.PlaneGeometry(3400, 3000, 100, 90)
  g.rotateX(-Math.PI / 2)
  const samples = Array.from(
    { length: 512 },
    (_, i) => roadPose(i / 512).position,
  )
  const a = g.attributes.position
  for (let i = 0; i < a.count; i++) {
    let distance = Infinity,
      height = -5
    for (const p of samples) {
      const d = (a.getX(i) - p.x) ** 2 + (a.getZ(i) - p.z) ** 2
      if (d < distance) {
        distance = d
        height = p.y
      }
    }
    // Interpolated surroundings are artistic infill, not a DEM terrain survey.
    a.setY(i, height - 1.2 - Math.min(6, Math.sqrt(distance) * 0.006))
    g.attributes.uv.setXY(i, a.getX(i) / 6, a.getZ(i) / 6)
  }
  g.computeVertexNormals()
  return g
}
