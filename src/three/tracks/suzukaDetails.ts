import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { cornerStations, cornerInsideSign, roadPose, widthAt, ribbon } from './suzukaSurface'
import { suzukaCornerVisuals } from './suzukaVisualData'

const lengthM = 5807
function raisedKerb(start: number, end: number, side: number, width: number, height: number) {
  const positions: number[] = [], indices: number[] = []
  const profile = [[0, .012], [.12, height], [.82, height], [1, .015]]
  for (let row = 0; row <= 2; row++) {
    const progress = start + (end - start) * row / 2
    const f = roadPose(progress)
    for (const [fraction, y] of profile) {
      const v = f.position.clone().addScaledVector(f.side, side * (widthAt(progress) / 2 + fraction * width)).addScaledVector(f.up, y)
      positions.push(v.x, v.y, v.z)
    }
    if (row < 2) for (let col = 0; col < 3; col++) {
      const a = row * 4 + col
      if (side > 0) indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4)
      else indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

/** A few shared meshes; no per-stripe React nodes or new textures. */
export function buildSuzukaDetails() {
  const red: T.BufferGeometry[] = [], white: T.BufferGeometry[] = []
  const gravel: T.BufferGeometry[] = [], paved: T.BufferGeometry[] = []
  for (const visual of suzukaCornerVisuals) {
    const station = cornerStations.find(c => c.number === visual.corner)
    if (!station) continue
    const inside = cornerInsideSign(station.progress)
    const kerb = visual.kerb
    const bands = [
      ...(kerb ? [{ fromM: -kerb.beforeM, toM: kerb.afterM, widthM: kerb.widthM, heightM: kerb.heightM, stripeM: kerb.stripeM, side: inside }] : []),
      ...(visual.exitKerb ? [{ ...visual.exitKerb, side: -inside }] : []),
    ]
    for (const band of bands) {
      const count = Math.ceil((band.toM - band.fromM) / band.stripeM)
      for (let i = 0; i < count; i++) {
        const start = station.progress + band.fromM / lengthM + i * (band.toM - band.fromM) / lengthM / count
        const end = start + (band.toM - band.fromM) / lengthM / count
        const geometry = raisedKerb(start, end, band.side, band.widthM, band.heightM)
        ;(i % 2 ? white : red).push(geometry)
      }
    }
    const runoff = visual.runoff
    if (runoff) {
      const start = station.progress - runoff.beforeM / lengthM
      const end = station.progress + runoff.afterM / lengthM
      const outer = (p: number) => widthAt(p) / 2 + 1.8 + runoff.widthM * Math.sin(Math.PI * T.MathUtils.clamp((p - start) / (end - start), 0, 1)) ** .65
      const inner = (p: number) => widthAt(p) / 2 + 1.8
      const g = ribbon(start, end,
        p => inside > 0 ? -outer(p) : inner(p),
        p => inside > 0 ? -inner(p) : outer(p), 56, -.025)
      ;(runoff.surface === 'gravel' ? gravel : paved).push(g)
    }
  }
  const merge = (items: T.BufferGeometry[]) => {
    const result = mergeGeometries(items)!
    result.computeBoundingSphere()
    items.forEach(item => item.dispose())
    return result
  }
  return { kerbRed: merge(red), kerbWhite: merge(white), gravel: merge(gravel), paved: merge(paved) }
}
