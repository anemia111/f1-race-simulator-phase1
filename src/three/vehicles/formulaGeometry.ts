import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type Station = [z: number, width: number, height: number, centerY: number]
/** Original hand-authored sectional bodywork. Dimensions in metres, +Z forward. */
function shell(stations: Station[], x = 0, rings = 28) {
  const p: number[] = [],
    ix: number[] = []
  for (const [z, w, h, y] of stations) {
    for (let j = 0; j <= rings; j++) {
      const a = (j / rings) * Math.PI * 2
      p.push(x + Math.cos(a) * w, y + Math.sin(a) * h, z)
    }
  }
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j,
        b = a + rings + 1
      ix.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3))
  g.setIndex(ix)
  g.computeVertexNormals()
  return g
}
function tube(points: number[][], r: number, segments = 32) {
  return new T.TubeGeometry(
    new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
    segments,
    r,
    8,
    false,
  )
}
function foil(span: number, chord: number, y: number, z: number, sweep = 0) {
  const pts: number[] = [],
    indices: number[] = []
  for (let i = 0; i <= 20; i++)
    for (let j = 0; j <= 16; j++) {
      const x = (i / 20 - 0.5) * span,
        t = (j / 16) * Math.PI * 2
      const camber = 0.025 * Math.sin((j / 16) * Math.PI)
      pts.push(
        x,
        y + Math.sin(t) * 0.023 + camber,
        z + (Math.cos(t) * chord) / 2 + Math.abs(x) * sweep,
      )
      if (i < 20 && j < 16) {
        const a = i * 17 + j
        indices.push(a, a + 1, a + 17, a + 1, a + 18, a + 17)
      }
    }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pts, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new T.BoxGeometry(w, h, d).translate(x, y, z)
}
function merged(gs: T.BufferGeometry[]) {
  // Drop UVs so hand-built surfaces and standard geometric fittings share a buffer contract.
  const clean = gs.map((g) => {
    g.deleteAttribute('uv')
    return g.toNonIndexed()
  })
  const result = mergeGeometries(clean)!
  clean.forEach((g) => g.dispose())
  gs.forEach((g) => g.dispose())
  result.computeBoundingSphere()
  return result
}
const paint = [
  shell([
    [2.65, 0.045, 0.04, 0.28],
    [2.4, 0.085, 0.065, 0.34],
    [1.9, 0.13, 0.1, 0.42],
    [1.35, 0.2, 0.12, 0.49],
    [0.8, 0.27, 0.16, 0.55],
    [0.45, 0.28, 0.13, 0.59],
  ]),
  shell([
    [-0.28, 0.32, 0.15, 0.63],
    [-0.65, 0.35, 0.24, 0.72],
    [-0.9, 0.26, 0.3, 0.74],
    [-1.3, 0.16, 0.25, 0.7],
    [-1.9, 0.1, 0.15, 0.54],
    [-2.25, 0.08, 0.06, 0.41],
  ]),
]
for (const s of [-1, 1])
  paint.push(
    shell(
      [
        [0.45, 0.025, 0.025, 0.52],
        [0.25, 0.21, 0.16, 0.49],
        [-0.05, 0.27, 0.18, 0.48],
        [-0.5, 0.26, 0.17, 0.45],
        [-1, 0.19, 0.12, 0.35],
        [-1.6, 0.055, 0.05, 0.27],
        [-1.85, 0.02, 0.02, 0.24],
      ],
      s * 0.5,
    ),
  )
const carbon: T.BufferGeometry[] = [
  box(1.48, 0.045, 3.1, 0, 0.12, -0.5),
  box(0.64, 0.06, 0.72, 0, 0.16, -2.1),
  shell([
    [0.5, 0.28, 0.15, 0.55],
    [0.2, 0.3, 0.13, 0.55],
    [-0.25, 0.3, 0.12, 0.55],
  ]),
  foil(1.85, 0.36, 0.2, 2.45, 0.06),
  foil(1.7, 0.2, 0.25, 2.17, 0.08),
]
for (const s of [-1, 1]) {
  carbon.push(
    box(0.035, 0.3, 0.65, s * 0.9, 0.27, 2.39),
    box(0.035, 0.49, 0.6, s * 0.52, 0.7, -2.15),
  )
  carbon.push(
    tube(
      [
        [s * 0.28, 0.72, 0.42],
        [s * 0.35, 0.91, 0.15],
        [s * 0.33, 0.95, -0.2],
        [s * 0.24, 0.89, -0.45],
      ],
      0.032,
    ),
  )
  carbon.push(
    tube(
      [
        [0, 0.62, 0.62],
        [0, 0.95, 0.4],
        [0, 1.01, 0.1],
        [s * 0.33, 0.95, -0.2],
      ],
      0.032,
    ),
  )
  for (const z of [1.68, -1.72])
    for (const y of [0.22, 0.5])
      for (const dz of [-0.35, 0.3])
        carbon.push(
          tube(
            [
              [s * 0.23, y, z + dz],
              [s * 0.79, 0.32, z],
            ],
            0.014,
            4,
          ),
        )
  carbon.push(
    tube(
      [
        [s * 0.27, 0.66, 0.35],
        [s * 0.48, 0.7, 0.45],
      ],
      0.014,
      4,
    ),
  )
  paint.push(
    shell(
      [
        [0.52, 0.01, 0.01, 0.7],
        [0.48, 0.085, 0.035, 0.71],
        [0.34, 0.085, 0.035, 0.71],
        [0.29, 0.01, 0.01, 0.7],
      ],
      s * 0.5,
      12,
    ),
  )
}
carbon.push(
  tube(
    [
      [0, 0.36, -1.7],
      [0, 0.87, -2.0],
    ],
    0.04,
    4,
  ),
)
const wing = merged([foil(1.03, 0.45, 0, 0), foil(1.03, 0.2, 0.09, 0.15)])
const frontFlap = merged([foil(1.65, 0.19, 0, 0, 0.08)])
const tire = new T.CylinderGeometry(0.345, 0.345, 0.31, 40, 1, false).rotateZ(
  Math.PI / 2,
)
const rim = new T.CylinderGeometry(0.228, 0.228, 0.315, 28, 1, false).rotateZ(
  Math.PI / 2,
)
const brake = new T.CylinderGeometry(0.19, 0.19, 0.032, 28).rotateZ(Math.PI / 2)
const spokes: T.BufferGeometry[] = []
for (let i = 0; i < 8; i++)
  spokes.push(box(0.02, 0.035, 0.39, 0, 0, 0).rotateX((i * Math.PI) / 4))
export const formulaGeometry = {
  paint: merged(paint),
  carbon: merged(carbon),
  wing,
  frontFlap,
  tire,
  rim,
  brake,
  spokes: merged(spokes),
  livery: merged([
    shell(
      [
        [2.35, 0.027, 0.005, 0.417],
        [1.9, 0.034, 0.005, 0.525],
        [1.35, 0.043, 0.005, 0.615],
        [0.8, 0.055, 0.005, 0.715],
      ],
      0,
      8,
    ),
    foil(0.65, 0.18, 0.995, -2.12),
  ]),
  low: merged([
    shell(
      [
        [2.65, 0.05, 0.07, 0.3],
        [1, 0.22, 0.15, 0.47],
        [0.2, 0.65, 0.2, 0.45],
        [-1, 0.5, 0.2, 0.45],
        [-2.3, 0.1, 0.07, 0.3],
      ],
      0,
      8,
    ),
    foil(1.85, 0.4, 0.2, 2.4),
    foil(1.05, 0.45, 0.85, -2.1),
  ]),
}
