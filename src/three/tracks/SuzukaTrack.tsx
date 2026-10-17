import { TrackBarriers } from './TrackBarriers'
import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as T from 'three'
import { buildSuzukaDetails } from './suzukaDetails'
import {
  ribbon,
  roadPose,
  widthAt,
  terrainGeometry,
  pitOffset,
  shoulderExtentAt,
} from './suzukaSurface'

const base = import.meta.env.BASE_URL + 'cinematic/'
export function SuzukaTrack({ wet }: { wet: boolean }) {
  const loaded = useTexture([
    base + 'asphalt-color.jpg',
    base + 'asphalt-normal.jpg',
    base + 'asphalt-rough.jpg',
    base + 'grass-color.jpg',
    base + 'grass-normal.jpg',
  ])
  const textures = useMemo(
    () =>
      loaded.map((original, i) => {
        // This URL cache is exclusive to Cinematic; share uploaded textures across surfaces.
        const t = original
        t.wrapS = t.wrapT = T.RepeatWrapping
        t.anisotropy = 8
        t.colorSpace = i === 0 || i === 3 ? T.SRGBColorSpace : T.NoColorSpace
        return t
      }),
    [loaded],
  )
  const geometry = useMemo(() => {
    const asphalt = ribbon(
      0,
      1,
      (p) => -widthAt(p) / 2,
      (p) => widthAt(p) / 2,
      2904,
    )
    const shoulders = ribbon(
      0,
      1,
      (p) => -shoulderExtentAt(p),
      (p) => shoulderExtentAt(p),
      1452,
      -0.09,
    )
    const lineL = ribbon(
      0,
      1,
      (p) => -widthAt(p) / 2 + 0.05,
      (p) => -widthAt(p) / 2 + 0.2,
      1452,
      0.015,
    )
    const lineR = ribbon(
      0,
      1,
      (p) => widthAt(p) / 2 - 0.2,
      (p) => widthAt(p) / 2 - 0.05,
      1452,
      0.015,
    )
    const rubber = ribbon(
      0,
      1,
      () => -0.9,
      () => 0.9,
      1452,
      0.018,
    )
    const pit = ribbon(
      0.94,
      1.055,
      (p) => pitOffset(p) - 3,
      (p) => pitOffset(p) + 3,
      260,
      0.025,
    )
    const { kerbRed, kerbWhite, gravel, paved } = buildSuzukaDetails()
    const pitLines = [-1, 1].map(side => ribbon(.94, 1.055,
      p => pitOffset(p) + side * 2.9 - .07,
      p => pitOffset(p) + side * 2.9 + .07, 260, .04))
    const start = roadPose(0)
    return {
      asphalt,
      shoulders,
      lineL,
      lineR,
      rubber,
      pit,
      pitLines,
      kerbRed,
      kerbWhite,
      gravel,
      paved,
      start,
      terrain: terrainGeometry(),
    }
  }, [])
  useEffect(
    () => () => {
      textures.forEach((t) => t.dispose())
    },
    [textures],
  )
  return (
    <group>
      <mesh geometry={geometry.terrain} receiveShadow>
        <meshStandardMaterial
          map={textures[3]}
          normalMap={textures[4]}
          normalScale={new T.Vector2(0.35, 0.35)}
          color="#9a9f77"
          roughness={1}
        />
      </mesh>
      <mesh geometry={geometry.shoulders} receiveShadow>
        <meshStandardMaterial
          map={textures[3]}
          normalMap={textures[4]}
          color="#a9ab87"
          roughness={1}
        />
      </mesh>
      <mesh geometry={geometry.asphalt} receiveShadow>
        <meshStandardMaterial
          map={textures[0]}
          normalMap={textures[1]}
          normalScale={new T.Vector2(0.3, 0.3)}
          roughnessMap={textures[2]}
          roughness={wet ? 0.3 : 0.92}
          metalness={wet ? 0.15 : 0}
          color={wet ? '#626a70' : '#7e8388'}
        />
      </mesh>
      <mesh geometry={geometry.pit} receiveShadow>
        <meshStandardMaterial
          map={textures[0]}
          color="#a9aa9e"
          roughness={0.87}
        />
      </mesh>
      {[geometry.lineL, geometry.lineR, ...geometry.pitLines].map((g, i) => (
        <mesh geometry={g} key={i}>
          <meshStandardMaterial color="#ebe7d8" roughness={0.85} />
        </mesh>
      ))}
      <mesh geometry={geometry.rubber}>
        <meshStandardMaterial
          color="#171b1c"
          transparent
          opacity={0.16}
          depthWrite={false}
          roughness={0.77}
        />
      </mesh>
      <mesh geometry={geometry.kerbRed} receiveShadow>
        <meshStandardMaterial color="#b82820" roughness={0.85} />
      </mesh>
      <mesh geometry={geometry.kerbWhite} receiveShadow>
        <meshStandardMaterial color="#e4dfd6" roughness={0.85} />
      </mesh>
      {[geometry.gravel].map((g, i) => (
        <mesh geometry={g} key={i} receiveShadow>
          <meshStandardMaterial
            color="#b3a68b"
            roughness={1}
            normalMap={textures[1]}
            normalScale={new T.Vector2(0.7, 0.7)}
          />
        </mesh>
      ))}
      <mesh geometry={geometry.paved} receiveShadow>
        <meshStandardMaterial map={textures[0]} normalMap={textures[1]} color="#646c71" roughness={.94} />
      </mesh>
      <group
        position={geometry.start.position}
        rotation={[
          0,
          Math.atan2(geometry.start.tangent.x, geometry.start.tangent.z),
          0,
        ]}
      >
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[14, 0.3]} />
          <meshStandardMaterial color="#ecebe1" />
        </mesh>
        {Array.from({ length: 40 }, (_, i) => (
          <group
            key={i}
            position={[
              i % 2 === 0 ? -1.35 : 1.35,
              0,
              -8 - Math.floor(i / 2) * 8,
            ]}
          >
            <mesh position={[0, 0.04, 0]}>
              <boxGeometry args={[2, 0.012, 0.1]} />
              <meshStandardMaterial color="#e7e4d6" />
            </mesh>
          </group>
        ))}
      </group>
      <TrackBarriers />
    </group>
  )
}

