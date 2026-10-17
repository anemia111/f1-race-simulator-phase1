import * as T from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, simplify, prune, meshopt } from '@gltf-transform/functions'
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from 'meshoptimizer'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const sourcePath = 'node_modules/.cache/cinematic/qvist-source.glb'
const sourceUrl =
  'https://raw.githubusercontent.com/filan214/F1---2026-Car-Details/71fafa72b34bfbed07a01d8bc93b969246e7b4e2/dist/models/qvist-2026-assemblies.glb'
const expected =
  'bff9c92fe22e1c80c855e24e95b09eca62f579640fe63be200aff83769d059d3'
await mkdir('node_modules/.cache/cinematic', { recursive: true })
let bytes
try {
  bytes = await readFile(sourcePath)
} catch {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Source download ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(sourcePath, bytes)
}
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Qvist source hash mismatch')
await Promise.all([
  MeshoptSimplifier.ready,
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const sx = 1.9 / (940.8561401367188 * 2),
  sy = 0.345 / 359.3852262496948
const matrix = new T.Matrix4().set(
  0,
  0,
  sx,
  0,
  0,
  sy,
  0,
  30.77045249938965 * sy,
  -0.001,
  0,
  0,
  1.62501,
  0,
  0,
  0,
  1,
)
const frontPivot = new T.Vector3(0, 0.27, 2.45),
  rearPivot = new T.Vector3(0, 0.77, -2.15)
function splitWing(g, rear, parts) {
  const moving = [],
    fixed = [],
    a = g.getAttribute('position'),
    idx = g.index
  for (let i = 0; i < idx.count; i += 3) {
    const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
    const x = ids.reduce((s, j) => s + a.getX(j), 0) / 3,
      y = ids.reduce((s, j) => s + a.getY(j), 0) / 3,
      z = ids.reduce((s, j) => s + a.getZ(j), 0) / 3
    const flap = rear
      ? y > 0.68 && Math.abs(x) < 0.51
      : y > 0.22 && z > 2.28 && Math.abs(x) < 0.83
    ;(flap ? moving : fixed).push(...ids)
  }
  for (const [indices, name] of [
    [fixed, 'carbon'],
    [moving, rear ? 'rear' : 'front'],
  ]) {
    const part = g.clone()
    part.setIndex(indices)
    if (name !== 'carbon')
      part.translate(
        ...(rear ? rearPivot : frontPivot).clone().negate().toArray(),
      )
    parts[name].push(part)
  }
}
globalThis.FileReader = class {
  result = null
  async readAsArrayBuffer(b) {
    this.result = await b.arrayBuffer()
    this.onloadend?.()
  }
}
const scene = new T.Group(),
  report = {
    sourceUrl,
    sourceSha256: expected,
    parts: {},
    frontPivot: frontPivot.toArray(),
    rearPivot: rearPivot.toArray(),
  }
for (const [suffix, ratio, error] of [
  ['', 0.075, 0.002],
  ['_medium', 0.015, 0.007],
  ['_low', 0.003, 0.02],
]) {
  const doc = await io.readBinary(new Uint8Array(bytes))
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error }),
    prune(),
  )
  const parts = {
    paint: [],
    carbon: [],
    front: [],
    rear: [],
    wheel0: [],
    wheel1: [],
    wheel2: [],
    wheel3: [],
  }
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue
    for (const primitive of node.getMesh().listPrimitives()) {
      const g = new T.BufferGeometry()
      for (const [semantic, name] of [
        ['POSITION', 'position'],
        ['NORMAL', 'normal'],
      ]) {
        const accessor = primitive.getAttribute(semantic),
          array = new Float32Array(accessor.getCount() * 3)
        for (let i = 0; i < accessor.getCount(); i++)
          array.set(accessor.getElement(i, []), i * 3)
        g.setAttribute(name, new T.BufferAttribute(array, 3))
      }
      g.setIndex(Array.from(primitive.getIndices().getArray()))
      g.applyMatrix4(matrix)
      const name = node.getName()
      if (name.endsWith('wheel')) {
        const front = name.startsWith('front'),
          positive = name.includes('left'),
          i = (front ? 0 : 2) + (positive ? 1 : 0)
        g.translate(
          -(positive ? 1 : -1) * 0.79,
          -0.345,
          -(front ? 1.68 : -1.72),
        )
        if (suffix === '_low') {
          g.computeBoundingBox()
          const size = g.boundingBox.getSize(new T.Vector3()),
            center = g.boundingBox.getCenter(new T.Vector3())
          parts[`wheel${i}`].push(
            new T.CylinderGeometry(0.345, 0.345, size.x, 12)
              .rotateZ(Math.PI / 2)
              .translate(center.x, 0, 0),
          )
          g.dispose()
        } else parts[`wheel${i}`].push(g)
      } else if (name === 'front-wing' || name === 'rear-wing') {
        splitWing(g, name === 'rear-wing', parts)
        g.dispose()
      } else
        parts[
          [
            'chassis',
            'left-sidepod',
            'right-sidepod',
            'engine-cover',
            'mirrors',
          ].includes(name)
            ? 'paint'
            : 'carbon'
        ].push(g)
    }
  }
  for (const [name, geometries] of Object.entries(parts)) {
    const geometry = mergeGeometries(geometries),
      mesh = new T.Mesh(
        geometry,
        new T.MeshStandardMaterial({ color: '#888888' }),
      )
    mesh.name = name + suffix
    scene.add(mesh)
    report.parts[name + suffix] = geometry.index.count / 3
  }
}
const binary = await new GLTFExporter().parseAsync(scene, { binary: true })
const output = await io.readBinary(new Uint8Array(binary))
await output.transform(
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
await io.write('public/cinematic/qvist-2026-near.glb', output)
await writeFile(
  'public/cinematic/qvist-preparation.json',
  JSON.stringify(report, null, 2),
)
await writeFile(
  'public/cinematic/qvist-attribution.txt',
  `F1 2026 concept (polygon model) by Qvist_designs. CC BY 4.0.
Original: https://sketchfab.com/3d-models/f1-2026-concept-polygon-model-ea3bde709b1e4dc9b0ec8557d106ed42
License: https://creativecommons.org/licenses/by/4.0/
APEX/filan214 adapted the original into 16 illustrative display assemblies, cut fused surfaces and assigned study finishes. Source revision: 71fafa72b34bfbed07a01d8bc93b969246e7b4e2.
Further changes for this simulator: mesh simplification, metric axis/size normalization, static surface merging, wheel pivots, estimated aero surface separation, Meshopt compression, team palette materials at runtime. Neither original nor derivative represents team CAD, verified manufacturing joints, or final 2026 regulation compliance. No endorsement is implied.
`,
)
console.log(JSON.stringify(report, null, 2))
