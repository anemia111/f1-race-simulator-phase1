import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as T from 'three'
import { bakeGeometry } from '../vehicles/bakeGeometry'
import { qualitySettings, type Quality } from '../core/visualFrame'
import { vegetationLayout, vegetationTier } from './vegetationLayout'

const names = ['ash', 'oak', 'pine'] as const
const levels = ['near', 'mid', 'far'] as const
const geometryCache = new WeakMap<
  T.Object3D,
  Record<string, T.BufferGeometry>
>()
const object = new T.Object3D()

export function SuzukaVegetation({ quality }: { quality: Quality }) {
  const asset = useGLTF(
    import.meta.env.BASE_URL + 'cinematic/vegetation.glb',
    false,
    true,
  )
  const textures = useTexture(
    names.map((n) => import.meta.env.BASE_URL + `cinematic/leaf-${n}.png`),
  )
  const impostors = useTexture(
    names.map(
      (n) => import.meta.env.BASE_URL + `cinematic/tree-${n}-impostor.png`,
    ),
  )
  const billboard = useMemo(
    () => new T.PlaneGeometry(20, 20).translate(0, 7, 0),
    [],
  )
  useEffect(() => () => billboard.dispose(), [billboard])
  const geometries = useMemo(() => {
    const cached = geometryCache.get(asset.scene)
    if (cached) return cached
    asset.scene.updateMatrixWorld(true)
    const result: Record<string, T.BufferGeometry> = {}
    asset.scene.traverse((n) => {
      if (n instanceof T.Mesh)
        result[n.name] = bakeGeometry(n.geometry, n.matrixWorld)
    })
    geometryCache.set(asset.scene, result)
    return result
  }, [asset])
  const materials = useMemo(() => {
    const bark = new T.MeshStandardMaterial({ color: '#5d5140', roughness: 1 })
    const leaves = textures.map((t) => {
      t.colorSpace = T.SRGBColorSpace
      return new T.MeshStandardMaterial({
        map: t,
        alphaTest: 0.45,
        side: T.DoubleSide,
        roughness: 1,
        metalness: 0,
      })
    })
    const far = impostors.map((t) => {
      t.colorSpace = T.SRGBColorSpace
      return new T.MeshBasicMaterial({
        map: t,
        alphaTest: 0.4,
        side: T.DoubleSide,
        fog: true,
        color: '#dadfd5',
      })
    })
    return { bark, leaves, far }
  }, [textures, impostors])
  useEffect(
    () => () => {
      materials.bark.dispose()
      materials.leaves.forEach((m) => m.dispose())
      materials.far.forEach((m) => m.dispose())
    },
    [materials],
  )
  const trees = useMemo(
    () => vegetationLayout(qualitySettings[quality].trees),
    [quality],
  )
  const meshes = useRef<Record<string, T.InstancedMesh | null>>({})
  const elapsed = useRef(Infinity)
  useFrame(({ camera }, dt) => {
    elapsed.current += dt
    if (elapsed.current < 0.25) return
    elapsed.current = 0
    const visible = trees
      .map((t) => ({ t, d: t.position.distanceTo(camera.position) }))
      .filter((v) => v.d < 1250)
      .sort((a, b) => a.d - b.d)
    const indices: Record<string, number> = {}
    for (const [rank, { t, d }] of visible.entries()) {
      const tier = vegetationTier(d, rank, quality),
        prefix = `${names[t.species]}_${tier}`
      const index = indices[prefix] ?? 0
      object.position.copy(t.position)
      object.scale.setScalar(t.scale)
      object.rotation.set(
        0,
        tier === 'far'
          ? Math.atan2(
              camera.position.x - t.position.x,
              camera.position.z - t.position.z,
            )
          : t.yaw,
        0,
      )
      object.updateMatrix()
      for (const kind of tier === 'far' ? ['sprite'] : ['bark', 'leaf']) {
        const mesh = meshes.current[`${prefix}_${kind}`]
        mesh?.setMatrixAt(index, object.matrix)
        if (kind !== 'bark') mesh?.setColorAt(index, t.tint)
      }
      indices[prefix] = index + 1
    }
    for (const [key, mesh] of Object.entries(meshes.current))
      if (mesh) {
        mesh.count = indices[key.replace(/_(bark|leaf|sprite)$/, '')] ?? 0
        mesh.visible = mesh.count > 0
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingSphere()
      }
  })
  return (
    <group>
      {names.flatMap((name, species) =>
        levels.flatMap((level) =>
          (level === 'far' ? ['sprite'] : ['bark', 'leaf']).map((kind) => (
            <instancedMesh
              key={`${name}_${level}_${kind}`}
              ref={(m) => {
                meshes.current[`${name}_${level}_${kind}`] = m
              }}
              args={[
                kind === 'sprite'
                  ? billboard
                  : geometries[`${name}_${kind}_${level}`],
                kind === 'sprite'
                  ? materials.far[species]
                  : kind === 'leaf'
                    ? materials.leaves[species]
                    : materials.bark,
                trees.length,
              ]}
              castShadow={level === 'near' && quality === 'high'}
              receiveShadow={level === 'near'}
              dispose={null}
            />
          )),
        ),
      )}
    </group>
  )
}
