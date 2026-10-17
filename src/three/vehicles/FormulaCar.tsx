import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as T from 'three'
import type { CarSnapshot } from '../../types'
import { roadPose, pitOffset } from '../tracks/suzukaSurface'
import {
  VisualFrameBuffer,
  qualitySettings,
  type Quality,
} from '../core/visualFrame'
import { bakeGeometry } from './bakeGeometry'
import { recordCinematicMotion } from '../optimization/motionProbe'

const carbon = new T.MeshStandardMaterial({
  color: '#151a1c',
  roughness: 0.42,
  metalness: 0.22,
  side: T.DoubleSide,
})
const rubber = new T.MeshStandardMaterial({ color: '#151615', roughness: 0.94 })
const alloy = new T.MeshStandardMaterial({
  color: '#40464b',
  roughness: 0.3,
  metalness: 0.85,
})
const disc = new T.MeshStandardMaterial({
  color: '#383732',
  roughness: 0.85,
  metalness: 0.2,
})
const rotation = new T.Matrix4()
const helmetGeometry = new T.SphereGeometry(1, 16, 12),
  lightGeometry = new T.BoxGeometry(0.09, 0.08, 0.03)
const helmetMaterials = [
  new T.MeshStandardMaterial({ color: '#ededeb', roughness: 0.3 }),
  new T.MeshStandardMaterial({ color: '#f2dc31', roughness: 0.3 }),
]
const rainMaterials = [
  new T.MeshStandardMaterial({ color: '#a21413', emissive: '#300200' }),
  new T.MeshStandardMaterial({
    color: '#d52018',
    emissive: '#e32c15',
    emissiveIntensity: 2,
  }),
]
const geometryCache = new WeakMap<
  T.Object3D,
  Record<string, T.BufferGeometry>
>()
function assetGeometry(scene: T.Group, nodes: Record<string, T.Object3D>) {
  const existing = geometryCache.get(scene)
  if (existing) return existing
  scene.updateMatrixWorld(true)
  const result = Object.fromEntries(
    Object.entries(nodes)
      .filter(([, n]) => n instanceof T.Mesh)
      .map(([name, n]) => {
        return [name, bakeGeometry((n as T.Mesh).geometry, n.matrixWorld)]
      }),
  )
  geometryCache.set(scene, result)
  return result
}

export function FormulaCar({
  car,
  buffer,
  paused,
  quality,
  selected,
  wet,
  onSelect,
}: {
  car: CarSnapshot
  buffer: VisualFrameBuffer
  paused: boolean
  quality: Quality
  selected: boolean
  wet: boolean
  onSelect: () => void
}) {
  const asset = useGLTF(
    import.meta.env.BASE_URL + 'cinematic/formula-2026-original.glb',
    false,
    true,
  )
  const g = useMemo(() => assetGeometry(asset.scene, asset.nodes), [asset])
  const nearAsset = useGLTF(
    import.meta.env.BASE_URL + 'cinematic/qvist-2026-near.glb',
    false,
    true,
  )
  const q = useMemo(
    () => assetGeometry(nearAsset.scene, nearAsset.nodes),
    [nearAsset],
  )
  const root = useRef<T.Group>(null),
    body = useRef<T.Group>(null)
  const wheelDetails = useRef<(T.Group | null)[]>([])
  const nearBody = useRef<T.Group>(null)
  const qRear = useRef<T.Mesh>(null),
    qFront = useRef<T.Mesh>(null)
  const tireMeshes = useRef<(T.Mesh | null)[]>([])
  const wheels = useRef<(T.Group | null)[]>([]),
    steers = useRef<(T.Group | null)[]>([])
  const previous = useRef<{
    distance: number
    speed: number
    position: T.Vector3
  } | null>(null)
  const spin = useRef(0)
  const paint = useMemo(
    () =>
      new T.MeshPhysicalMaterial({
        color: car.teamColor,
        roughness: 0.29,
        metalness: 0.5,
        clearcoat: 0.85,
        clearcoatRoughness: 0.2,
        side: T.DoubleSide,
      }),
    [car.teamColor],
  )
  useEffect(() => () => paint.dispose(), [paint])
  useFrame(({ camera }, dt) => {
    const c = buffer.sample(car.driverId, performance.now(), paused)
    if (!c || !root.current) return
    if (selected) recordCinematicMotion(c, buffer.latestCar(car.driverId) ?? car)
    const inPit =
      c.status === 'pit' || c.pitPhase === 'lane' || c.pitPhase === 'entry'
    const p = inPit ? (c.pitLaneProgress ?? c.progress) : c.progress
    const offset = inPit ? pitOffset(p) : c.lateralOffsetM
    const pose = roadPose(p, offset)
    root.current.position.copy(pose.position).addScaledVector(pose.up, 0.015)
    rotation.makeBasis(pose.side.clone().negate(), pose.up, pose.tangent)
    root.current.quaternion.setFromRotationMatrix(rotation)
    const distance = c.totalDistance * 5807
    const delta = previous.current ? distance - previous.current.distance : 0
    if (!paused && Math.abs(delta) < 30 && previous.current) {
      const moved = pose.position.distanceTo(previous.current.position)
      if (moved < 30) spin.current += moved / 0.345
    }
    const look = roadPose(p + 0.0007).tangent
    const curvature = pose.tangent.clone().cross(look).y / (0.0007 * 5807)
    const steering = T.MathUtils.clamp(Math.atan(3.4 * curvature), -0.42, 0.42)
    steers.current.forEach((w, i) => {
      if (w) w.rotation.y = i < 2 ? steering : 0
    })
    wheels.current.forEach((w) => {
      if (w) w.rotation.x = spin.current
    })
    const acceleration =
      previous.current && !paused
        ? (c.speedKph - previous.current.speed) / 3.6 / Math.max(0.008, dt)
        : 0
    if (body.current) {
      body.current.rotation.x = T.MathUtils.damp(
        body.current.rotation.x,
        T.MathUtils.clamp(-acceleration * 0.0015, -0.018, 0.018),
        8,
        dt,
      )
      body.current.rotation.z = T.MathUtils.damp(
        body.current.rotation.z,
        T.MathUtils.clamp(
          -curvature * (c.speedKph / 3.6) ** 2 * 0.0006,
          -0.028,
          0.028,
        ),
        8,
        dt,
      )
    }
    const aero =
      c.runtimeSystems.kind === 'f1' ? c.runtimeSystems.activeAeroState : null
    const d = camera.position.distanceTo(root.current.position),
      settings = qualitySettings[quality]
    const near = selected || d < Math.min(14, settings.lod0)
    const suffix = near ? '' : d < settings.lod1 ? '_medium' : '_low'
    if (nearBody.current) {
      nearBody.current.visible = true
      nearBody.current.children.forEach((m) => {
        if (m instanceof T.Mesh) m.geometry = q[m.name + suffix]
      })
    }
    if (qRear.current)
      qRear.current.rotation.x = T.MathUtils.damp(
        qRear.current.rotation.x,
        -(aero?.rearStraightFraction ?? 0) * 0.32,
        9,
        dt,
      )
    if (qFront.current)
      qFront.current.rotation.x = T.MathUtils.damp(
        qFront.current.rotation.x,
        -(aero?.frontStraightFraction ?? 0) * 0.2,
        9,
        dt,
      )
    tireMeshes.current.forEach((m, i) => {
      if (m) m.geometry = q[`wheel${i}${suffix}`]
    })
    wheelDetails.current.forEach((group) => {
      if (group) group.visible = d < settings.lod0
    })
    if (body.current) body.current.visible = true
    root.current.visible = !c.hiddenFromTrack
    previous.current = {
      distance,
      speed: c.speedKph,
      position: pose.position.clone(),
    }
  })
  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      dispose={null}
    >
      <group ref={body}>
        <group ref={nearBody}>
          <mesh
            name="paint"
            geometry={q.paint}
            material={paint}
            castShadow={quality !== 'low'}
          />
          <mesh
            name="carbon"
            geometry={q.carbon}
            material={carbon}
            castShadow={selected}
          />
          <mesh
            name="rear"
            ref={qRear}
            geometry={q.rear}
            material={carbon}
            position={[0, 0.77, -2.15]}
          />
          <mesh
            name="front"
            ref={qFront}
            geometry={q.front}
            material={carbon}
            position={[0, 0.27, 2.45]}
          />
        </group>
        <mesh
          position={[0, 0.73, -0.06]}
          scale={[0.16, 0.18, 0.19]}
          geometry={helmetGeometry}
          material={helmetMaterials[selected ? 1 : 0]}
        />
        <mesh
          position={[0, 0.15, -2.37]}
          geometry={lightGeometry}
          material={rainMaterials[wet ? 1 : 0]}
        />
      </group>
      {[-1, 1].flatMap((s, j) =>
        [1.68, -1.72].map((z, k) => {
          const i = k * 2 + j
          return (
            <group
              key={i}
              position={[s * 0.79, 0.345, z]}
              ref={(v) => {
                steers.current[i] = v
              }}
            >
              <group
                ref={(v) => {
                  wheels.current[i] = v
                }}
              >
                <mesh
                  ref={(m) => {
                    tireMeshes.current[i] = m
                  }}
                  geometry={g.tire}
                  material={rubber}
                  castShadow={selected}
                />
                <mesh geometry={g.rim} material={alloy} />
                <group
                  ref={(v) => {
                    wheelDetails.current[i] = v
                  }}
                >
                  <mesh geometry={g.brake} material={disc} />
                  <mesh
                    geometry={g.spokes}
                    material={alloy}
                    position={[s * 0.17, 0, 0]}
                  />
                </group>
              </group>
            </group>
          )
        }),
      )}
    </group>
  )
}
