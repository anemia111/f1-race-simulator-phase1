import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { simplify, weld, meshopt, prune } from '@gltf-transform/functions'
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from 'meshoptimizer'
import { Box3, Vector3 } from 'three'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// The pinned generator eagerly creates TextureLoader objects. This offline job
// only exports its mesh buffers; browser images are deliberately never decoded.
globalThis.document = {
  createElementNS: () => ({
    addEventListener() {},
    removeEventListener() {},
    set src(_) {},
  }),
}
const { Tree } = await import('@dgreenheck/ez-tree')
await Promise.all([
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
  MeshoptSimplifier.ready,
])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const species = ['ash', 'oak', 'pine']
const source = 'node_modules/@dgreenheck/ez-tree'
const geometries = new Map()
const midLeaves = new Map()
const sourceCounts = {}
for (const [index, name] of species.entries()) {
  const options = JSON.parse(
    await readFile(`${source}/src/lib/presets/${name}_medium.json`, 'utf8'),
  )
  options.seed = 6019 + index * 17
  options.bark.textured = false
  // Preserve branching character, constrain recursion/card counts for the web.
  options.branch.children =
    name === 'pine' ? { 0: 64, 1: 3, 2: 5 } : { 0: 7, 1: 4, 2: 3 }
  options.leaves.count = name === 'pine' ? 24 : 18
  options.branch.sections = { 0: 10, 1: 6, 2: 4, 3: 3 }
  options.branch.segments = { 0: 8, 1: 5, 2: 3, 3: 3 }
  const tree = new Tree()
  tree.options.copy(options)
  tree.generate()
  const bounds = new Box3().setFromObject(tree)
  const scale = 14 / bounds.getSize(new Vector3()).y
  sourceCounts[name] = {}
  for (const [kind, mesh] of [
    ['bark', tree.branchesMesh],
    ['leaf', tree.leavesMesh],
  ]) {
    const g = mesh.geometry
      .clone()
      .translate(0, -bounds.min.y, 0)
      .scale(scale, scale, scale)
    geometries.set(`${name}_${kind}`, g)
    sourceCounts[name][kind] = g.index.count / 3
  }
  // Simplifying alpha cards retains most UV seams. Generate a sparser card set
  // with larger clusters instead, while keeping the same seeded branches.
  tree.options.leaves.count = name === 'pine' ? 8 : 6
  tree.options.leaves.size *= 1.6
  tree.generate()
  midLeaves.set(
    name,
    tree.leavesMesh.geometry
      .clone()
      .translate(0, -bounds.min.y, 0)
      .scale(scale, scale, scale),
  )
}

function addMesh(doc, scene, buffer, name, g) {
  const primitive = doc.createPrimitive()
  for (const [name, semantic, type] of [
    ['position', 'POSITION', 'VEC3'],
    ['normal', 'NORMAL', 'VEC3'],
    ['uv', 'TEXCOORD_0', 'VEC2'],
  ]) {
    const a = g.getAttribute(name)
    primitive.setAttribute(
      semantic,
      doc
        .createAccessor()
        .setType(type)
        .setArray(new Float32Array(a.array))
        .setBuffer(buffer),
    )
  }
  primitive.setIndices(
    doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint32Array(g.index.array))
      .setBuffer(buffer),
  )
  scene.addChild(
    doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)),
  )
}
const target = new Document(),
  targetScene = target.createScene(),
  targetBuffer = target.createBuffer()
const lodCounts = {}
for (const [level, ratio, error] of [
  ['near', 1, 0],
  ['mid', 0.32, 0.015],
]) {
  const doc = new Document(),
    scene = doc.createScene(),
    buffer = doc.createBuffer()
  for (const [name, g] of geometries)
    addMesh(
      doc,
      scene,
      buffer,
      `${name}_${level}`,
      level === 'mid' && name.endsWith('_leaf')
        ? midLeaves.get(name.split('_')[0])
        : g,
    )
  await doc.transform(
    weld(),
    ...(ratio < 1
      ? [simplify({ simplifier: MeshoptSimplifier, ratio, error })]
      : []),
    prune(),
  )
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue
    const p = node.getMesh().listPrimitives()[0]
    const primitive = target.createPrimitive()
    for (const semantic of p.listSemantics()) {
      const a = p.getAttribute(semantic)
      primitive.setAttribute(
        semantic,
        target
          .createAccessor()
          .setType(a.getType())
          .setArray(a.getArray().slice())
          .setBuffer(targetBuffer),
      )
    }
    primitive.setIndices(
      target
        .createAccessor()
        .setType('SCALAR')
        .setArray(p.getIndices().getArray().slice())
        .setBuffer(targetBuffer),
    )
    targetScene.addChild(
      target
        .createNode(node.getName())
        .setMesh(target.createMesh(node.getName()).addPrimitive(primitive)),
    )
    lodCounts[node.getName()] = p.getIndices().getCount() / 3
  }
}
await target.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
const output = 'public/cinematic/vegetation.glb'
await io.write(output, target)
for (const name of species)
  await copyFile(
    `${source}/src/lib/assets/leaves/${name}_color.png`,
    `public/cinematic/leaf-${name}.png`,
  )
await copyFile(`${source}/LICENSE`, 'public/cinematic/vegetation-license.txt')
await writeFile(
  'public/cinematic/vegetation-preparation.json',
  JSON.stringify(
    {
      generator: '@dgreenheck/ez-tree@1.1.0',
      license: 'MIT',
      author: 'Daniel Greenheck',
      source: 'https://github.com/dgreenheck/ez-tree',
      textureLicenseEvidence:
        'https://github.com/dgreenheck/ez-tree/blob/dcf309bd86bd521083d9c70f01f2de45fdc7c457/src/app/public/textures/LICENSE.md',
      sourceCounts,
      lodCounts,
      heightM: 14,
      changes:
        'Deterministic branching, web geometry budgets, 3 LODs, metric height normalization, Meshopt compression. Runtime uses original alpha leaf textures and PBR materials. Generic botanical analogues; not a surveyed Suzuka species inventory.',
    },
    null,
    2,
  ) + '\n',
)
const manifestPath = 'public/cinematic/sources.json'
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
for (const file of ['vegetation.glb', ...species.map((s) => `leaf-${s}.png`)]) {
  const bytes = await readFile(`public/cinematic/${file}`)
  manifest.assets = manifest.assets.filter((a) => a.file !== file)
  manifest.assets.push({
    file,
    source: 'https://github.com/dgreenheck/ez-tree',
    generator: '@dgreenheck/ez-tree@1.1.0',
    license: 'MIT',
    creator: 'Daniel Greenheck',
    acquiredAt: '2026-10-17',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    confidence:
      'Generic generated vegetation; estimated placement, not measured Suzuka trees',
    changes: file.endsWith('.glb')
      ? 'Metric normalization, geometry budget, LOD simplification and Meshopt compression'
      : 'Original bundled leaf RGBA texture; unmodified',
  })
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(
  JSON.stringify(
    { bytes: (await readFile(output)).length, lodCounts },
    null,
    2,
  ),
)
