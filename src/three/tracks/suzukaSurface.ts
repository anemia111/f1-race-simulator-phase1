import * as THREE from 'three'
import { realTrackLayouts } from '../../data/realTrackLayouts'
import { measuredRoadProfiles } from '../../data/measuredRoadProfiles'
import { suzukaCornerVisuals } from './suzukaVisualData'

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
export const suzukaCrossing = { lower: 0.43579, upper: 0.84458 } as const

/** Estimated bridge shoulder; avoid a broad floating grass ribbon over the opening. */
export function shoulderExtentAt(p: number) {
  const distanceM = Math.abs(wrap(p) - suzukaCrossing.upper) * 5807
  return widthAt(p) / 2 + THREE.MathUtils.lerp(1, 8, THREE.MathUtils.smoothstep(distanceM, 14, 32))
}

export function barrierOffsetAt(p: number, main: boolean, side = 0) {
  let normal = widthAt(p) / 2 + (main ? 5 : 15)
  if (!main) for (const zone of runoffZones) {
    const deltaM = (wrap(p - zone.progress + .5) - .5) * 5807
    if (side !== zone.side || deltaM < -zone.beforeM || deltaM > zone.afterM) continue
    const t = (deltaM + zone.beforeM) / (zone.beforeM + zone.afterM)
    normal = Math.max(normal, widthAt(p) / 2 + 3.8 + zone.widthM * Math.sin(Math.PI * t) ** .65)
  }
  const distanceM = Math.abs(wrap(p) - suzukaCrossing.upper) * 5807
  return THREE.MathUtils.lerp(widthAt(p) / 2 + .65, normal,
    THREE.MathUtils.smoothstep(distanceM, 14, 40))
}

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

export function cornerInsideSign(progress: number) {
  return roadPose(progress - .002).tangent.cross(roadPose(progress + .002).tangent).y > 0 ? -1 : 1
}
const runoffZones = suzukaCornerVisuals.flatMap(visual => {
  const station = cornerStations.find(c => c.number === visual.corner)
  return station && visual.runoff ? [{ ...visual.runoff, progress: station.progress, side: -cornerInsideSign(station.progress) }] : []
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
  const crossing = roadPose(suzukaCrossing.lower).position
  // Retain the coarse distant terrain, but refine locally so triangles cannot
  // span from the upper embankment across the lower carriageway.
  const axis = (size: number, segments: number, center: number) => [...new Set([
    ...Array.from({ length: segments + 1 }, (_, i) => -size / 2 + i * size / segments),
    ...Array.from({ length: 81 }, (_, i) => center + (i - 40) * 3)
      .filter(value => value > -size / 2 && value < size / 2),
  ])].sort((a, b) => a - b)
  const xs = axis(3400, 100, crossing.x), zs = axis(3000, 90, crossing.z)
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  for (const z of zs) for (const x of xs) { positions.push(x, 0, z); uvs.push(x / 6, z / 6) }
  for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
    const a = z * xs.length + x, b = a + xs.length
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  const samples = Array.from(
    { length: 512 },
    (_, i) => roadPose(i / 512).position,
  )
  const a = g.attributes.position
  const lowerRoad = Array.from({ length: 121 }, (_, i) =>
    roadPose(suzukaCrossing.lower - .02 + .04 * i / 120).position)
  for (let i = 0; i < a.count; i++) {
    let distance = Infinity,
      height = -5
    const localBlend = 1 - THREE.MathUtils.smoothstep(
      Math.hypot(a.getX(i) - crossing.x, a.getZ(i) - crossing.z), 100, 180)
    let weightedHeight = 0, weights = 0
    for (const p of samples) {
      const d = (a.getX(i) - p.x) ** 2 + (a.getZ(i) - p.z) ** 2
      if (localBlend > 0) {
        const weight = 1 / (d + 144) ** 2
        weightedHeight += p.y * weight
        weights += weight
      }
      if (d < distance) {
        distance = d
        height = p.y
      }
    }
    // Interpolated surroundings are artistic infill, not a DEM terrain survey.
    let ground = height - 1.2 - Math.min(6, Math.sqrt(distance) * 0.006)
    // The nearest branch changes abruptly across the crossing. Blend its
    // surroundings continuously before cutting the lower-road clearance.
    if (weights > 0) ground = THREE.MathUtils.lerp(ground, weightedHeight / weights - 1.2, localBlend)
    let lowerDistance = Infinity, lowerHeight = 0
    for (const p of lowerRoad) {
      const d = (a.getX(i) - p.x) ** 2 + (a.getZ(i) - p.z) ** 2
      if (d < lowerDistance) { lowerDistance = d; lowerHeight = p.y }
    }
    const bankBlend = THREE.MathUtils.smoothstep(Math.sqrt(lowerDistance), 14, 36)
    ground = Math.min(ground, THREE.MathUtils.lerp(lowerHeight - 1.2, ground, bankBlend))
    a.setY(i, ground)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}
