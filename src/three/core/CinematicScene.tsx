import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import { Suspense, useMemo, useRef } from 'react'
import * as T from 'three'
import type { RaceConfig, RaceSnapshot } from '../../types'
import {
  VisualFrameBuffer,
  qualitySettings,
  type CinematicCamera,
  type Quality,
} from './visualFrame'
import { SuzukaTrack } from '../tracks/SuzukaTrack'
import { SuzukaScenery } from '../scenery/SuzukaScenery'
import { FormulaCar } from '../vehicles/FormulaCar'
import { CinematicCameraRig } from '../cameras/CinematicCameraRig'
import { FrameMetrics, type RenderMetrics } from '../optimization/FrameMetrics'
import { roadPose } from '../tracks/suzukaSurface'

function Sun({
  snapshot,
  selected,
  quality,
  buffer,
  paused,
}: {
  snapshot: RaceSnapshot
  selected: string
  quality: Quality
  buffer: VisualFrameBuffer
  paused: boolean
}) {
  const light = useRef<T.DirectionalLight>(null)
  const target = useMemo(() => new T.Object3D(), [])
  useFrame(() => {
    const car = buffer.sample(selected, performance.now(), paused) ??
      snapshot.cars.find((c) => c.driverId === selected) ?? snapshot.cars[0]
    if (!car || !light.current) return
    const p = roadPose(car.progress).position
    light.current.position.copy(p).add(new T.Vector3(-100, 160, 90))
    target.position.copy(p)
    target.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        castShadow
        intensity={snapshot.weather === 'clear' ? 3.1 : 1.1}
        color="#fff1db"
        shadow-mapSize={[
          qualitySettings[quality].shadow,
          qualitySettings[quality].shadow,
        ]}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={85}
        shadow-camera-bottom={-85}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.00015}
        shadow-normalBias={0.04}
      />
    </>
  )
}

export function CinematicScene({
  config,
  snapshot,
  selected,
  paused,
  quality,
  mode,
  onSelect,
  onMetrics,
}: {
  config: RaceConfig
  snapshot: RaceSnapshot
  selected: string
  paused: boolean
  quality: Quality
  mode: CinematicCamera
  onSelect: (id: string) => void
  onMetrics: (m: RenderMetrics) => void
}) {
  const buffer = useMemo(() => {
    void config.seed
    return new VisualFrameBuffer()
  }, [config.seed])
  buffer.push(snapshot, performance.now())
  const car =
    snapshot.cars.find((c) => c.driverId === selected) ?? snapshot.cars[0]
  if (!car) return null
  return (
    <Canvas
      shadows
      dpr={qualitySettings[quality].dpr}
      camera={{ fov: 48, near: 0.08, far: 6000, position: [0, 80, 0] }}
      gl={{
        antialias: quality === 'high',
        powerPreference: 'high-performance',
        toneMapping: T.ACESFilmicToneMapping,
        toneMappingExposure: 0.82,
      }}
    >
      <color attach="background" args={['#9cbbcd']} />
      <fog
        attach="fog"
        args={['#b3c5cc', 700, snapshot.weather === 'clear' ? 3200 : 1500]}
      />
      <hemisphereLight args={['#cfdfed', '#636344', 1.15]} />
      <Sun snapshot={snapshot} selected={selected} quality={quality} buffer={buffer} paused={paused} />
      <Suspense fallback={null}>
        <Environment
          files={import.meta.env.BASE_URL + 'cinematic/daylight.hdr'}
          environmentIntensity={snapshot.weather === 'clear' ? 0.65 : 0.4}
        />
        <Sky
          distance={450000}
          sunPosition={[-100, 160, 90]}
          turbidity={snapshot.weather === 'clear' ? 3 : 12}
          rayleigh={1.6}
        />
        <SuzukaTrack wet={snapshot.weather !== 'clear'} />
        <SuzukaScenery quality={quality} />
        {snapshot.cars.map((c) => (
          <FormulaCar
            key={c.driverId}
            car={c}
            buffer={buffer}
            paused={paused}
            quality={quality}
            selected={c.driverId === selected}
            wet={snapshot.weather !== 'clear'}
            onSelect={() => onSelect(c.driverId)}
          />
        ))}
      </Suspense>
      <CinematicCameraRig
        mode={mode}
        car={car}
        buffer={buffer}
        paused={paused}
      />
      <FrameMetrics onMetrics={onMetrics} />
    </Canvas>
  )
}
