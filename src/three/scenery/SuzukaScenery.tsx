import { useMemo } from 'react'
import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { roadPose } from '../tracks/suzukaSurface'
import { type Quality } from '../core/visualFrame'
import { SuzukaVegetation } from './SuzukaVegetation'

const concrete = new T.MeshStandardMaterial({
  color: '#c1beb1',
  roughness: 0.93,
})
const steel = new T.MeshStandardMaterial({
  color: '#a8ada9',
  roughness: 0.42,
  metalness: 0.65,
})
const glass = new T.MeshStandardMaterial({
  color: '#203d47',
  roughness: 0.2,
  metalness: 0.65,
})
const dark = new T.MeshStandardMaterial({ color: '#383c3b', roughness: 0.8 })

function mergedBoxes(specs: number[][]) {
  const gs = specs.map(([x, y, z, w, h, d]) =>
    new T.BoxGeometry(w, h, d).translate(x, y, z),
  )
  const g = mergeGeometries(gs)!
  gs.forEach((v) => v.dispose())
  return g
}

/** Placement is relative to real track topology; facility dimensions remain estimates. */
export function SuzukaScenery({ quality }: { quality: Quality }) {
  const frame = useMemo(() => roadPose(0.995), [])
  const buildings = useMemo(() => {
    const garage: number[][] = [],
      windows: number[][] = [],
      roof: number[][] = [],
      seats: number[][] = [],
      supports: number[][] = []
    for (let i = 0; i < 40; i++) {
      garage.push([-35, 3, (i - 20) * 6, 18, 6, 5.8])
      windows.push([-25.9, 2.3, (i - 20) * 6, 0.05, 4.3, 4.9])
      windows.push([-25.8, 8.5, (i - 20) * 6, 0.05, 2.2, 5.8])
      garage.push([-35, 8.2, (i - 20) * 6, 18, 4.2, 5.9])
      // Recessed openings and continuous floor bands, inferred from the licensed
      // main-straight photograph. These are authored details, not measured CAD.
      garage.push([-25.7, 2.8, (i - 20) * 6 - 2.8, 0.3, 5.6, 0.25])
    }
    garage.push([-25.5, 6, -3, 0.7, 0.5, 240])
    garage.push([-25.5, 10.15, -3, 0.7, 0.5, 240])
    roof.push([-25, 5.65, -3, 2.3, 0.18, 240])
    for (let i = 0; i < 160; i++) {
      supports.push([-25.65, 8.5, (i - 80) * 1.5, 0.09, 2.2, 0.07])
    }
    roof.push([-33, 10.8, 0, 23, 0.45, 248])
    for (let row = 0; row < 20; row++) {
      garage.push([38 + row * 0.75, 0.45 + row * 0.44, 0, 0.8, 0.6, 265])
      for (let block = 0; block < 12; block++)
        seats.push([
          38 + row * 0.75,
          0.86 + row * 0.44,
          (block - 5.5) * 21,
          0.6,
          0.12,
          19,
        ])
    }
    roof.push([46, 15.5, 0, 36, 0.35, 280])
    for (let i = 0; i < 15; i++) {
      supports.push([60, 7.5, (i - 7) * 19, 0.22, 15, 0.25])
      supports.push([45, 15.15, (i - 7) * 19, 30, 0.22, 0.22])
      supports.push([60, 13.7, (i - 7) * 19, 0.35, 2.6, 0.35])
    }
    for (const x of [37.6, 53.3]) {
      supports.push([x, x < 40 ? 1.4 : 10.2, 0, 0.06, 0.06, 265])
      for (let i = 0; i < 90; i++)
        supports.push([x, x < 40 ? 1 : 9.8, (i - 45) * 3, 0.06, 0.8, 0.06])
    }
    garage.push([-35, 15, -145, 18, 11, 20])
    windows.push([-25.9, 16, -145, 0.05, 7, 18])
    roof.push([-35, 21, -145, 23, 0.5, 24])
    return {
      solid: mergedBoxes(garage),
      windows: mergedBoxes(windows),
      roof: mergedBoxes(roof),
      seats: mergedBoxes(seats),
      supports: mergedBoxes(supports),
    }
  }, [])
  return (
    <group>
      <group
        position={frame.position}
        rotation={[0, Math.atan2(frame.tangent.x, frame.tangent.z), 0]}
      >
        <mesh
          geometry={buildings.solid}
          material={concrete}
          castShadow
          receiveShadow
        />
        <mesh geometry={buildings.windows} material={glass} />
        <mesh geometry={buildings.roof} material={steel} castShadow />
        <mesh geometry={buildings.supports} material={steel} castShadow />
        <mesh geometry={buildings.seats}>
          <meshStandardMaterial color="#667c82" roughness={0.85} />
        </mesh>
        <FerrisWheel />
      </group>
      <SuzukaVegetation quality={quality} />
      <Boards />
      <CrossingBridge />
    </group>
  )
}

function FerrisWheel() {
  const detail = useMemo(() => {
    const lines: T.BufferGeometry[] = []
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const end = new T.Vector3(Math.cos(a) * 23, Math.sin(a) * 23, 0)
      lines.push(
        new T.CylinderGeometry(0.08, 0.08, 23, 5)
          .rotateZ(-a + Math.PI / 2)
          .translate(end.x / 2, end.y / 2, 0),
      )
    }
    const g = mergeGeometries(lines)!
    lines.forEach((l) => l.dispose())
    return g
  }, [])
  return (
    <group position={[145, 27, 38]} rotation={[0, 0.28, 0]}>
      <mesh material={steel}>
        <torusGeometry args={[23, 0.28, 8, 96]} />
      </mesh>
      <mesh material={steel} position={[0, 0, 0.8]}>
        <torusGeometry args={[23, 0.2, 8, 96]} />
      </mesh>
      <mesh geometry={detail} material={steel} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 7, -12, 0]} rotation={[0, 0, -s * 0.48]}>
          <cylinderGeometry args={[0.55, 0.8, 28, 10]} />
          <meshStandardMaterial
            color="#a12b31"
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      ))}
      {Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2
        return (
          <group key={i} position={[Math.cos(a) * 23, Math.sin(a) * 23 - 1, 0]}>
            <mesh>
              <boxGeometry args={[1.4, 1.7, 1.6]} />
              <meshStandardMaterial color="#a72b31" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.25, 0.82]} material={glass}>
              <planeGeometry args={[1.1, 0.8]} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, -25, 0]} material={concrete}>
        <boxGeometry args={[20, 1, 12]} />
      </mesh>
      <mesh position={[0, 0, 1]}>
        <boxGeometry args={[8, 6, 0.1]} />
        <meshStandardMaterial color="#a72b31" roughness={0.6} />
      </mesh>
    </group>
  )
}

function CrossingBridge() {
  // Crossing identified from the source centerline; deck geometry is an estimate.
  const f = useMemo(() => roadPose(0.84458), [])
  return (
    <group
      position={f.position}
      rotation={[0, Math.atan2(f.tangent.x, f.tangent.z), 0]}
    >
      <mesh
        material={concrete}
        position={[0, -0.7, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[14, 1.2, 28]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          material={concrete}
          position={[0, -3.6, s * 12]}
          castShadow
        >
          <boxGeometry args={[14, 6, 1.2]} />
        </mesh>
      ))}
    </group>
  )
}

function Boards() {
  const items = useMemo(
    () =>
      [0.06, 0.18, 0.3, 0.43, 0.56, 0.67, 0.8, 0.91].map((p) =>
        roadPose(p, 22),
      ),
    [],
  )
  return (
    <group>
      {items.map((f, i) => (
        <group
          key={i}
          position={f.position}
          rotation={[0, Math.atan2(f.tangent.x, f.tangent.z), 0]}
        >
          <mesh position={[0, 1.5, 0]} material={dark}>
            <boxGeometry args={[0.2, 3, 4]} />
          </mesh>
          <mesh position={[0, 3.2, 0]} material={concrete}>
            <boxGeometry args={[0.25, 0.4, 4.2]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
