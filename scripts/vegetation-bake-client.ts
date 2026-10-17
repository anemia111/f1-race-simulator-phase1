import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
const renderer = new T.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
})
renderer.setSize(512, 512)
renderer.setClearColor(0, 0)
renderer.outputColorSpace = T.SRGBColorSpace
document.body.style.margin = '0'
document.body.appendChild(renderer.domElement)
const scene = new T.Scene()
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const asset = await loader.loadAsync('/cinematic/vegetation.glb')
scene.add(asset.scene)
const tex = new T.TextureLoader()
const maps = await Promise.all(
  ['ash', 'oak', 'pine'].map((n) => tex.loadAsync(`/cinematic/leaf-${n}.png`)),
)
maps.forEach((t) => (t.colorSpace = T.SRGBColorSpace))
// Neutral diffuse bake: no directional/time-specific shadow frozen into the sprite.
scene.add(new T.HemisphereLight('#ffffff', '#9b9b9b', 2.5))
const camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 150)
camera.position.set(25, 9, 25)
camera.lookAt(0, 7, 0)
const w = window as typeof window & {
  bakeVegetation?: (name: string) => {
    width: number
    height: number
    image: string
  }
  vegetationReady?: boolean
}
w.bakeVegetation = (name) => {
  asset.scene.traverse((n) => {
    if (!(n instanceof T.Mesh)) return
    n.visible = n.name.startsWith(name + '_') && n.name.endsWith('_near')
    n.material = n.name.includes('_leaf_')
      ? new T.MeshStandardMaterial({
          map: maps[['ash', 'oak', 'pine'].indexOf(name)],
          alphaTest: 0.4,
          side: T.DoubleSide,
          roughness: 1,
        })
      : new T.MeshStandardMaterial({ color: '#5d5140', roughness: 1 })
  })
  renderer.render(scene, camera)
  return {
    width: 20,
    height: 20,
    image: renderer.domElement.toDataURL('image/png'),
  }
}
w.vegetationReady = true
