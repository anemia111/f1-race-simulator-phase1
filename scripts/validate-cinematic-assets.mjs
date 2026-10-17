import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { validateBytes } from 'gltf-validator'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { Box3, Vector3, Matrix4 } from 'three'

const manifest = JSON.parse(
  (await readFile('public/cinematic/sources.json', 'utf8')).replace(
    /^\uFEFF/,
    '',
  ),
)
const checked = []
for (const entry of manifest.assets) {
  const bytes = await readFile(`public/cinematic/${entry.file}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== entry.sha256 || bytes.length !== entry.bytes)
    throw new Error(`Asset integrity mismatch: ${entry.file}`)
  checked.push({ file: entry.file, bytes: bytes.length, sha256: hash })
}
const glb = new Uint8Array(
  await readFile('public/cinematic/formula-2026-original.glb'),
)
const validation = await validateBytes(glb, {
  uri: 'formula-2026-original.glb',
})
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.readBinary(glb)
const meshes = doc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
  .map((n) => n.getName())
for (const name of [
  'paint',
  'carbon',
  'wing',
  'frontFlap',
  'tire',
  'rim',
  'low',
])
  if (!meshes.includes(name)) throw new Error(`Missing car geometry: ${name}`)
const report = {
  checked,
  transferBytes: checked.reduce((sum, a) => sum + a.bytes, 0),
  decodedMeshes: meshes,
  issues: validation.issues,
  caveat:
    'Validator does not inspect EXT_meshopt_compression internals; decoding is checked separately with MeshoptDecoder.',
}
const qBytes = new Uint8Array(
  await readFile('public/cinematic/qvist-2026-near.glb'),
)
const qValidation = await validateBytes(qBytes, { uri: 'qvist-2026-near.glb' })
const qDoc = await io.readBinary(qBytes)
const qNodes = qDoc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
for (const suffix of ['', '_medium', '_low'])
  for (const name of [
    'paint',
    'carbon',
    'front',
    'rear',
    'wheel0',
    'wheel1',
    'wheel2',
    'wheel3',
  ]) {
    if (!qNodes.some((n) => n.getName() === name + suffix))
      throw new Error(`Missing licensed car LOD geometry: ${name + suffix}`)
  }
report.licensedCar = {
  issues: qValidation.issues,
  nodes: qNodes.map((n) => n.getName()),
  triangles: Object.fromEntries(
    ['', '_medium', '_low'].map((suffix) => [
      suffix || 'high',
      qNodes
        .filter((n) =>
          suffix ? n.getName().endsWith(suffix) : !n.getName().includes('_'),
        )
        .reduce(
          (sum, n) =>
            sum +
            n
              .getMesh()
              .listPrimitives()
              .reduce((t, p) => t + p.getIndices().getCount() / 3, 0),
          0,
        ),
    ]),
  ),
}
const bounds = new Box3()
for (const n of qNodes.filter((n) => !n.getName().includes('_'))) {
  const name = n.getName(),
    offset = new Vector3()
  if (name.startsWith('wheel')) {
    const i = Number(name.at(-1))
    offset.set(i % 2 ? 0.79 : -0.79, 0.345, i < 2 ? 1.68 : -1.72)
  }
  if (name === 'front') offset.set(0, 0.27, 2.45)
  if (name === 'rear') offset.set(0, 0.77, -2.15)
  const matrix = new Matrix4().fromArray(n.getWorldMatrix())
  for (const p of n.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION'),
      min = a.getMinNormalized([]),
      max = a.getMaxNormalized([])
    for (let bits = 0; bits < 8; bits++)
      bounds.expandByPoint(
        new Vector3(...min.map((v, j) => (bits & (1 << j) ? max[j] : v)))
          .applyMatrix4(matrix)
          .add(offset),
      )
  }
}
report.licensedCar.metricBounds = {
  min: bounds.min.toArray(),
  max: bounds.max.toArray(),
  size: bounds.getSize(new Vector3()).toArray(),
  axleSpacingM: 3.4,
}
if (Math.abs(report.licensedCar.metricBounds.size[0] - 1.9) > 0.01)
  throw new Error('Metric car width drift after compression')
const vegetationBytes = new Uint8Array(
  await readFile('public/cinematic/vegetation.glb'),
)
const vegetationValidation = await validateBytes(vegetationBytes, {
  uri: 'vegetation.glb',
})
const vegetationDoc = await io.readBinary(vegetationBytes)
const vegetationNodes = vegetationDoc
  .getRoot()
  .listNodes()
  .filter((n) => n.getMesh())
for (const species of ['ash', 'oak', 'pine'])
  for (const kind of ['bark', 'leaf'])
    for (const level of ['near', 'mid']) {
      const name = `${species}_${kind}_${level}`
      const node = vegetationNodes.find((n) => n.getName() === name)
      if (!node) throw new Error(`Missing vegetation node: ${name}`)
      const p = node.getMesh().listPrimitives()[0]
      if (!p.getAttribute('TEXCOORD_0') || !p.getAttribute('NORMAL'))
        throw new Error(`Incomplete vegetation surface: ${name}`)
    }
report.vegetation = {
  issues: vegetationValidation.issues,
  decodedNodes: vegetationNodes.map((n) => n.getName()),
  triangles: Object.fromEntries(
    vegetationNodes.map((n) => [
      n.getName(),
      n
        .getMesh()
        .listPrimitives()
        .reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0),
    ]),
  ),
  farRuntimeTrianglesPerTree: 2,
}
await writeFile(
  process.env.CINEMATIC_ASSET_REPORT ??
    '../../outputs/cinematic-assets-validation.json',
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report, null, 2))
if (
  validation.issues.numErrors ||
  qValidation.issues.numErrors ||
  vegetationValidation.issues.numErrors
)
  throw new Error('glTF validation errors')
