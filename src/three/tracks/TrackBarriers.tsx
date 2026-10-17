import { useEffect, useMemo, useRef } from 'react'
import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { roadPose, widthAt } from './suzukaSurface'

function postGeometry(main: boolean) {
  if (!main) return new T.BoxGeometry(0.07, 3.8, 0.07).translate(0, 1.9, 0)
  const upright = new T.BoxGeometry(0.11, 3.7, 0.11).translate(0, 1.85, 0)
  const length = Math.hypot(0.65, 0.55)
  const head = new T.BoxGeometry(0.11, length, 0.11)
    .rotateZ(-Math.atan2(0.65, 0.55))
    .translate(0.325, 3.975, 0)
  const result = mergeGeometries([upright, head])!
  upright.dispose()
  head.dispose()
  return result
}
function railGeometry() {
  // Original generic two-wave steel profile, not a measured Suzuka section.
  const profile = new T.Shape()
  const ys = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  const xs = ys.map((_, i) => (i % 2 === 0 ? -0.055 : 0.055))
  profile.moveTo(xs[0], ys[0])
  ys.slice(1).forEach((y, i) => profile.lineTo(xs[i + 1], y))
  for (let i = ys.length - 1; i >= 0; i--) profile.lineTo(xs[i] + 0.018, ys[i])
  profile.closePath()
  return new T.ExtrudeGeometry(profile, {
    depth: 7.3,
    bevelEnabled: false,
    steps: 1,
  }).translate(0, 0.25, -3.65)
}
function fenceGeometry(main: boolean) {
  const points = main
    ? [
        [0, 0.85],
        [0, 3.7],
        [0.65, 4.25],
      ]
    : [
        [0, 0.8],
        [0, 3.8],
      ]
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  points.forEach(([x, y], row) => {
    positions.push(x, y, -3.65, x, y, 3.65)
    uv.push(0, y / 3.8, 1, y / 3.8)
    if (row) {
      const a = (row - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Main-straight black overhanging posts are photo-referenced; positions and sizes are estimated. */
export function TrackBarriers() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#666c6b'
    ctx.lineWidth = 1
    for (let i = 0; i < 256; i += 16) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 256)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(256, i)
      ctx.stroke()
    }
    const t = new T.CanvasTexture(canvas)
    t.colorSpace = T.SRGBColorSpace
    t.wrapS = t.wrapT = T.RepeatWrapping
    t.repeat.set(10, 4)
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <group>
      <BarrierSection main texture={texture} />
      <BarrierSection main={false} texture={texture} />
    </group>
  )
}
function BarrierSection({
  main,
  texture,
}: {
  main: boolean
  texture: T.Texture
}) {
  const rails = useRef<T.InstancedMesh>(null),
    posts = useRef<T.InstancedMesh>(null),
    fence = useRef<T.InstancedMesh>(null)
  const placements = useMemo(
    () =>
      Array.from({ length: 1600 }, (_, i) => ({
        p: Math.floor(i / 2) / 800,
        side: i % 2 === 0 ? 1 : -1,
      })).filter((v) => (v.p < 0.05 || v.p > 0.96) === main),
    [main],
  )
  const geometry = useMemo(
    () => ({
      rail: main
        ? new T.BoxGeometry(0.3, 1.1, 7.3).translate(0, 0.55, 0)
        : railGeometry(),
      post: postGeometry(main),
      fence: fenceGeometry(main),
    }),
    [main],
  )
  useEffect(
    () => () => Object.values(geometry).forEach((g) => g.dispose()),
    [geometry],
  )
  useEffect(() => {
    const object = new T.Object3D()
    placements.forEach(({ p, side }, i) => {
      const pose = roadPose(p, side * (widthAt(p) / 2 + (main ? 5 : 15)))
      object.position.copy(pose.position)
      object.rotation.set(
        0,
        Math.atan2(pose.tangent.x, pose.tangent.z) + (side < 0 ? Math.PI : 0),
        0,
      )
      object.updateMatrix()
      for (const ref of [rails, posts, fence])
        ref.current?.setMatrixAt(i, object.matrix)
    })
    for (const ref of [rails, posts, fence])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true
        ref.current.computeBoundingSphere()
      }
  }, [placements, main])
  return (
    <group>
      <instancedMesh
        ref={rails}
        args={[geometry.rail, undefined, placements.length]}
        receiveShadow
      >
        <meshStandardMaterial
          color={main ? '#d3d1c7' : '#969e9e'}
          roughness={main ? 0.88 : 0.44}
          metalness={main ? 0 : 0.8}
          side={T.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh
        ref={posts}
        args={[geometry.post, undefined, placements.length]}
      >
        <meshStandardMaterial
          color={main ? '#252a2c' : '#737b7b'}
          metalness={0.65}
          roughness={0.55}
          side={T.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh
        ref={fence}
        args={[geometry.fence, undefined, placements.length]}
      >
        <meshStandardMaterial
          map={texture}
          transparent
          opacity={0.75}
          depthWrite={false}
          forceSinglePass
          side={T.DoubleSide}
          roughness={0.8}
        />
      </instancedMesh>
    </group>
  )
}
