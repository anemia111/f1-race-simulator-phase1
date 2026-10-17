import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt, dedup, prune } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import { formulaGeometry } from '../src/three/vehicles/formulaGeometry.ts'
import { writeFile } from 'node:fs/promises'

// GLTFExporter browser FileReader contract, backed only by Blob in this build tool.
globalThis.FileReader = class {
  result = null
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onloadend?.()
  }
}
const scene = new THREE.Group()
for (const [name, geometry] of Object.entries(formulaGeometry)) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: '#eeeeee' }),
  )
  mesh.name = name
  scene.add(mesh)
}
const binary = await new GLTFExporter().parseAsync(scene, { binary: true })
await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
const doc = await io.readBinary(new Uint8Array(binary))
await doc.transform(
  dedup(),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
const path = 'public/cinematic/formula-2026-original.glb'
await io.write(path, doc)
await writeFile(
  'public/cinematic/car-license.txt',
  'Original sectional bodywork authored for this project. CC0-1.0. A category reconstruction, not a licensed team car or team CAD. No third-party logos.\n',
)
console.log(`Wrote ${path}`)
