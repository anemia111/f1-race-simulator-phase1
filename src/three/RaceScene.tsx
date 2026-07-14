import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type {
  CameraMode,
  CarSnapshot,
  RaceConfig,
  RaceSnapshot,
  TrackDefinition,
} from '../types'
import { racingLineAt } from '../simulation/trackDynamics'
import {
  pitBoxProgress,
  pitBoxSlotForTeam,
} from '../simulation/pitLane'
import {
  progressAtTime,
  type OpenF1TrackProgress,
} from '../services/openF1Location'
import {
  createTrackCurve,
  createTrackRibbonGeometry,
  edgePoints,
  poseOnTrack,
} from './trackGeometry'

type RaceSceneProps = {
  cameraMode: CameraMode
  config: RaceConfig
  onSelectDriver: (driverId: string) => void
  /** Factual OpenF1 car-progress overlay; null when off or unavailable. */
  openF1Overlay: OpenF1TrackProgress | null
  /** Truthful source tag for the overlay ('LIVE' or 'HIST'). */
  openF1OverlayMode: string
  selectedDriverId: string
  /** Hides simulator markers when a synchronized observed frame is active. */
  showSimulationCars?: boolean
  snapshot: RaceSnapshot
}

type SceneContentsProps = RaceSceneProps & {
  curve: THREE.CatmullRomCurve3
  edgeLeft: THREE.Vector3[]
  edgeRight: THREE.Vector3[]
  roadGeometry: THREE.BufferGeometry
}

const PIT_ENTRY_VISUAL_SECONDS = 3.2
const STARTING_GRID_SLOT_GAP = 0.0022
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Broadcast maps show a timing trace, not a scale model of the asphalt. */
function presentationTrackWidth(track: TrackDefinition) {
  return clamp(track.width * 0.27, 0.58, 0.92)
}

function SpriteLabel({
  color,
  fontSize,
  outlineColor = '#050505',
  position,
  text,
}: {
  color: string
  fontSize: number
  outlineColor?: string
  position: THREE.Vector3 | [number, number, number]
  text: string
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 512
    canvas.height = 128

    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.font = '800 72px Arial, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.lineJoin = 'round'
      context.lineWidth = 14
      context.strokeStyle = outlineColor
      context.strokeText(text, canvas.width / 2, canvas.height / 2)
      context.fillStyle = color
      context.fillText(text, canvas.width / 2, canvas.height / 2)
    }

    const canvasTexture = new THREE.CanvasTexture(canvas)
    canvasTexture.colorSpace = THREE.SRGBColorSpace
    canvasTexture.minFilter = THREE.LinearFilter

    return canvasTexture
  }, [color, outlineColor, text])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite
      position={position}
      scale={[Math.max(fontSize * 2.2, text.length * fontSize * 0.72), fontSize, 1]}
    >
      <spriteMaterial depthWrite={false} map={texture} transparent />
    </sprite>
  )
}

function pitLaneOffset(track: TrackDefinition) {
  return -(presentationTrackWidth(track) / 2 + 0.62)
}

type PosedInstance = {
  index: number
  pose: ReturnType<typeof poseOnTrack>
}

function InstancedPitBoxes({ boxes }: { boxes: PosedInstance[] }) {
  const baseRef = useRef<THREE.InstancedMesh>(null)
  const markerRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const base = baseRef.current
    const marker = markerRef.current

    if (!base || !marker) {
      return
    }

    const object = new THREE.Object3D()
    const cyan = new THREE.Color('#4bd8ff')
    const gold = new THREE.Color('#f4c430')

    boxes.forEach(({ index, pose }, instanceIndex) => {
      const rotationY = Math.atan2(pose.tangent.x, pose.tangent.z)
      object.position.copy(pose.position).setY(0.12)
      object.rotation.set(0, rotationY, 0)
      object.updateMatrix()
      base.setMatrixAt(instanceIndex, object.matrix)

      object.position.setY(0.2)
      object.updateMatrix()
      marker.setMatrixAt(instanceIndex, object.matrix)
      marker.setColorAt(instanceIndex, index % 2 === 0 ? cyan : gold)
    })
    base.instanceMatrix.needsUpdate = true
    marker.instanceMatrix.needsUpdate = true

    if (marker.instanceColor) {
      marker.instanceColor.needsUpdate = true
    }
  }, [boxes])

  return (
    <group>
      <instancedMesh args={[undefined, undefined, boxes.length]} ref={baseRef}>
        <boxGeometry args={[0.28, 0.035, 0.54]} />
        <meshBasicMaterial color="#16191c" />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, boxes.length]} ref={markerRef}>
        <boxGeometry args={[0.23, 0.018, 0.4]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>
    </group>
  )
}

function racingLineOffset(
  track: TrackDefinition,
  car: CarSnapshot,
) {
  return car.status === 'pit' ? 0 : racingLineAt(track, car.progress).offset
}

function startingGridSlotOffset(track: TrackDefinition, position: number) {
  const side = position % 2 === 1 ? -1 : 1

  return side * presentationTrackWidth(track) * 0.28
}

function shouldUseStartingGridSlot(car: CarSnapshot, elapsedSeconds: number) {
  return (
    car.status === 'running' &&
    car.timedRunPhase === null &&
    elapsedSeconds < 7 &&
    car.totalDistance >= 1 - STARTING_GRID_SLOT_GAP * 24 &&
    car.totalDistance <= 1.035
  )
}

function displayLaneOffset(
  track: TrackDefinition,
  car: CarSnapshot,
  elapsedSeconds: number,
) {
  if (shouldUseStartingGridSlot(car, elapsedSeconds)) {
    return startingGridSlotOffset(track, car.position)
  }

  const battleOffset =
    car.battlePhase === 'attacking' ||
    car.battlePhase === 'defending' ||
    car.battlePhase === 'side-by-side'
      ? car.trackLateralOffset
      : 0
  const presentationScale = presentationTrackWidth(track) / track.width

  // Cars use one racing line until the race engine explicitly enters a
  // passing battle. The scale changes presentation only, never simulation.
  return clamp(
    (racingLineOffset(track, car) + battleOffset) * presentationScale,
    -presentationTrackWidth(track) * 0.42,
    presentationTrackWidth(track) * 0.42,
  )
}

function displayPoseForCar(
  curve: THREE.CatmullRomCurve3,
  car: CarSnapshot,
  laneOffset: number,
  track: TrackDefinition,
  pitSlot: number,
  garageBayIndex: number,
  elapsedSeconds: number,
) {
  const trackPose = poseOnTrack(curve, car.progress, laneOffset)
  const garagePose = poseOnTrack(
    curve,
    pitBoxProgress(track, pitSlot),
    pitLaneOffset(track) - 0.56,
  )
  garagePose.position.add(
    garagePose.tangent
      .clone()
      .multiplyScalar(garageBayIndex === 0 ? -0.46 : 0.46),
  )
  const movingPitPose =
    car.pitLaneProgress === null || car.pitPhase === 'box'
      ? garagePose
      : poseOnTrack(curve, car.pitLaneProgress, pitLaneOffset(track))

  if (car.status === 'pit') {
    if (car.pitStartedAtSeconds === null) {
      return movingPitPose
    }

    const transition = Math.min(
      1,
      Math.max(0, (elapsedSeconds - car.pitStartedAtSeconds) / PIT_ENTRY_VISUAL_SECONDS),
    )

    return {
      position: trackPose.position.clone().lerp(movingPitPose.position, transition),
      tangent: trackPose.tangent.clone().lerp(movingPitPose.tangent, transition).normalize(),
      normal: trackPose.normal.clone().lerp(movingPitPose.normal, transition).normalize(),
    }
  }

  if (
    car.pitExitUntilSeconds !== null &&
    elapsedSeconds < car.pitExitUntilSeconds
  ) {
    const remaining =
      (car.pitExitUntilSeconds - elapsedSeconds) / PIT_ENTRY_VISUAL_SECONDS
    const transition = Math.min(1, Math.max(0, remaining))

    return {
      position: movingPitPose.position.clone().lerp(trackPose.position, 1 - transition),
      tangent: movingPitPose.tangent.clone().lerp(trackPose.tangent, 1 - transition).normalize(),
      normal: movingPitPose.normal.clone().lerp(trackPose.normal, 1 - transition).normalize(),
    }
  }

  return trackPose
}

function PitLane({
  curve,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  track: TrackDefinition
}) {
  const points = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => {
        const entry = track.pitLane?.entryProgress ?? 0.965
        const exit = track.pitLane?.exitProgress ?? 0.13
        const progress = entry + (index / 29) * ((exit + 1 - entry) % 1)
        const pose = poseOnTrack(curve, progress % 1, pitLaneOffset(track))

        return pose.position.setY(0.1)
      }),
    [curve, track],
  )
  const labelPose = poseOnTrack(
    curve,
    track.pitLane?.boxStartProgress ?? 0.976,
    pitLaneOffset(track) - 0.5,
  )
  const pitBoxes = useMemo(
    () =>
      Array.from({ length: track.pitLane?.boxCount ?? 12 }, (_, index) => ({
        index,
        pose: poseOnTrack(
          curve,
          pitBoxProgress(track, index),
          pitLaneOffset(track) - 0.72,
        ),
      })),
    [curve, track],
  )
  const pitRoadGeometry = useMemo(() => {
    const pitCurve = new THREE.CatmullRomCurve3(
      points.map((point) => point.clone()),
      false,
      'catmullrom',
      0.48,
    )

    return createTrackRibbonGeometry(pitCurve, 0.44, 64)
  }, [points])

  useEffect(() => () => pitRoadGeometry.dispose(), [pitRoadGeometry])

  return (
    <group>
      <mesh geometry={pitRoadGeometry}>
        <meshBasicMaterial color="#171d24" transparent opacity={0.94} />
      </mesh>
      <Line points={points} color="#8794a3" lineWidth={1.1} />
      <InstancedPitBoxes boxes={pitBoxes} />
      <SpriteLabel
        color="#4bd8ff"
        fontSize={0.46}
        position={labelPose.position.setY(0.45)}
        text="PIT"
      />
      <SpriteLabel
        color="#f4c430"
        fontSize={0.34}
        position={labelPose.position.clone().setY(0.86).add(new THREE.Vector3(0, 0, 0.62))}
        text={`${track.pitLane?.speedLimitKph ?? 80} KPH`}
      />
    </group>
  )
}

function ActiveAeroZoneLines({
  curve,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  track: TrackDefinition
}) {
  const zones = useMemo(
    () =>
      (track.aeroActivationZones ?? []).map((zone) => {
        const steps = 18
        const span = Math.max(0.01, zone.end - zone.start)
        const points = Array.from({ length: steps + 1 }, (_, index) => {
          const progress = (zone.start + (index / steps) * span) % 1
          const pose = poseOnTrack(
            curve,
            progress,
            presentationTrackWidth(track) / 2 + 0.16,
          )

          return pose.position.setY(0.14)
        })
        const labelPose = poseOnTrack(
          curve,
          zone.start + span * 0.5,
          presentationTrackWidth(track) / 2 + 0.58,
        )

        return { ...zone, labelPose, points }
      }),
    [curve, track],
  )

  return (
    <group>
      {zones.map((zone) => (
        <group key={`${zone.label}-${zone.start}`}>
          <Line points={zone.points} color="#43e76f" lineWidth={1.8} />
          <SpriteLabel
            color="#46d880"
            fontSize={0.42}
            position={zone.labelPose.position.setY(0.48)}
            text={zone.label}
          />
        </group>
      ))}
    </group>
  )
}

function RaceControlLines({
  curve,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  track: TrackDefinition
}) {
  const markers = useMemo(() => {
    const overtake = (track.overtakeControlLines ?? []).flatMap((line, index) => [
      {
        color: '#f4c430',
        label: `OD${index + 1}`,
        progress: line.detectionProgress,
      },
      {
        color: '#46d880',
        label: `OA${index + 1}`,
        progress: line.activationProgress,
      },
    ])
    const sc = track.safetyCarLines
      ? [
          { color: '#f2f5f0', label: 'SC1', progress: track.safetyCarLines.line1Progress },
          { color: '#f2f5f0', label: 'SC2', progress: track.safetyCarLines.line2Progress },
        ]
      : []

    return [...overtake, ...sc].map((marker) => ({
      ...marker,
      pose: poseOnTrack(curve, marker.progress, 0),
    }))
  }, [curve, track.overtakeControlLines, track.safetyCarLines])

  return (
    <group>
      {markers.map((marker) => (
        <group
          key={`${marker.label}-${marker.progress}`}
          position={marker.pose.position.setY(0.11)}
          rotation={[0, Math.atan2(marker.pose.tangent.x, marker.pose.tangent.z), 0]}
        >
          <mesh>
            <boxGeometry
              args={[0.05, 0.018, presentationTrackWidth(track) * 0.95]}
            />
            <meshBasicMaterial color={marker.color} />
          </mesh>
          <SpriteLabel
            color={marker.color}
            fontSize={0.34}
            position={[0, 0.3, presentationTrackWidth(track) * 0.72]}
            text={marker.label}
          />
        </group>
      ))}
    </group>
  )
}

function StartingGridSlots({
  curve,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  track: TrackDefinition
}) {
  const slots = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => {
        const position = index + 1
        const progress = (1 - index * STARTING_GRID_SLOT_GAP + 1) % 1
        const pose = poseOnTrack(
          curve,
          progress,
          startingGridSlotOffset(track, position),
        )

        return { index, pose, position }
      }),
    [curve, track],
  )
  const slotRef = useRef<THREE.InstancedMesh>(null)
  const lineRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const slotMesh = slotRef.current
    const lineMesh = lineRef.current

    if (!slotMesh || !lineMesh) {
      return
    }

    const object = new THREE.Object3D()
    const white = new THREE.Color('#f2f5f0')
    const gray = new THREE.Color('#d5dde2')

    slots.forEach(({ index, pose }, instanceIndex) => {
      const rotationY = Math.atan2(pose.tangent.x, pose.tangent.z)
      object.position.copy(pose.position).setY(0.075)
      object.rotation.set(0, rotationY, 0)
      object.updateMatrix()
      slotMesh.setMatrixAt(instanceIndex, object.matrix)
      slotMesh.setColorAt(instanceIndex, index % 2 === 0 ? white : gray)

      object.position
        .copy(pose.position)
        .add(pose.tangent.clone().multiplyScalar(-0.78))
        .setY(0.093)
      object.updateMatrix()
      lineMesh.setMatrixAt(instanceIndex, object.matrix)
    })
    slotMesh.instanceMatrix.needsUpdate = true
    lineMesh.instanceMatrix.needsUpdate = true

    if (slotMesh.instanceColor) {
      slotMesh.instanceColor.needsUpdate = true
    }
  }, [slots])

  return (
    <group>
      <instancedMesh args={[undefined, undefined, slots.length]} ref={slotRef}>
        <boxGeometry args={[0.26, 0.012, 0.48]} />
        <meshBasicMaterial opacity={0.34} transparent vertexColors />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, slots.length]} ref={lineRef}>
        <boxGeometry args={[0.3, 0.014, 0.04]} />
        <meshBasicMaterial color="#f2f5f0" opacity={0.58} transparent />
      </instancedMesh>
    </group>
  )
}

type KerbInstance = {
  index: number
  pose: ReturnType<typeof poseOnTrack>
  side: number
}

function InstancedKerbs({ kerbs }: { kerbs: KerbInstance[] }) {
  const kerbRef = useRef<THREE.InstancedMesh>(null)
  const runoffRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const kerbMesh = kerbRef.current
    const runoffMesh = runoffRef.current

    if (!kerbMesh || !runoffMesh) {
      return
    }

    const object = new THREE.Object3D()
    const red = new THREE.Color('#c9272e')
    const white = new THREE.Color('#f2f5f0')

    kerbs.forEach(({ index, pose, side }, instanceIndex) => {
      const rotationY = Math.atan2(pose.tangent.x, pose.tangent.z)
      object.position.copy(pose.position).setY(0.09)
      object.rotation.set(0, rotationY, 0)
      object.scale.set(1, 1, 1)
      object.updateMatrix()
      kerbMesh.setMatrixAt(instanceIndex, object.matrix)
      kerbMesh.setColorAt(instanceIndex, index % 4 < 2 ? white : red)

      object.position
        .copy(pose.position)
        .add(pose.normal.clone().multiplyScalar(side * 0.38))
        .setY(0.06)
      object.updateMatrix()
      runoffMesh.setMatrixAt(instanceIndex, object.matrix)
    })
    kerbMesh.instanceMatrix.needsUpdate = true
    runoffMesh.instanceMatrix.needsUpdate = true

    if (kerbMesh.instanceColor) {
      kerbMesh.instanceColor.needsUpdate = true
    }
  }, [kerbs])

  return (
    <group>
      <instancedMesh args={[undefined, undefined, kerbs.length]} ref={kerbRef}>
        <boxGeometry args={[0.34, 0.05, 0.82]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, kerbs.length]} ref={runoffRef}>
        <boxGeometry args={[0.18, 0.02, 0.9]} />
        <meshBasicMaterial color="#7a8e64" opacity={0.58} transparent />
      </instancedMesh>
    </group>
  )
}

function InstancedMarshalPosts({ posts }: { posts: [number, number, number][] }) {
  const poleRef = useRef<THREE.InstancedMesh>(null)
  const signRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const poleMesh = poleRef.current
    const signMesh = signRef.current

    if (!poleMesh || !signMesh) {
      return
    }

    const object = new THREE.Object3D()
    const gold = new THREE.Color('#f4c430')
    const cyan = new THREE.Color('#4bd8ff')

    posts.forEach((post, index) => {
      object.position.set(post[0], 0.28, post[2])
      object.rotation.set(0, 0, 0)
      object.updateMatrix()
      poleMesh.setMatrixAt(index, object.matrix)

      object.position.setY(0.62)
      object.updateMatrix()
      signMesh.setMatrixAt(index, object.matrix)
      signMesh.setColorAt(index, index % 3 === 0 ? gold : cyan)
    })
    poleMesh.instanceMatrix.needsUpdate = true
    signMesh.instanceMatrix.needsUpdate = true

    if (signMesh.instanceColor) {
      signMesh.instanceColor.needsUpdate = true
    }
  }, [posts])

  return (
    <group>
      <instancedMesh args={[undefined, undefined, posts.length]} ref={poleRef}>
        <cylinderGeometry args={[0.06, 0.06, 0.55, 8]} />
        <meshStandardMaterial color="#dde4e8" roughness={0.5} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, posts.length]} ref={signRef}>
        <boxGeometry args={[0.3, 0.2, 0.08]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>
    </group>
  )
}

function TrackFurniture({
  config,
  curve,
}: {
  config: RaceConfig
  curve: THREE.CatmullRomCurve3
}) {
  const barrierLeft = useMemo(
    () => edgePoints(curve, presentationTrackWidth(config.track) + 3.2, 1, 144),
    [curve, config.track],
  )
  const barrierRight = useMemo(
    () => edgePoints(curve, presentationTrackWidth(config.track) + 3.2, -1, 144),
    [curve, config.track],
  )
  const kerbs = useMemo(
    () =>
      Array.from({ length: 56 }, (_, index) => {
        const side = index % 2 === 0 ? 1 : -1
        const progress = (index / 56 + (side === 1 ? 0.012 : 0.022)) % 1
        const pose = poseOnTrack(
          curve,
          progress,
          (presentationTrackWidth(config.track) / 2 + 0.12) * side,
        )

        return { index, pose, side }
      }),
    [curve, config.track],
  )
  const marshalPosts = useMemo(
    () => (config.track.marshalPosts ?? []).filter((_, index) => index % 2 === 0),
    [config.track.marshalPosts],
  )

  return (
    <group>
      <Line points={barrierLeft} color="#7a8389" lineWidth={1.2} />
      <Line points={barrierRight} color="#7a8389" lineWidth={1.2} />
      <InstancedKerbs kerbs={kerbs} />
      {(config.track.corners ?? []).map((corner) => (
        <group key={corner.number} position={[corner.position[0], 0.62, corner.position[2]]}>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.32, 12]} />
            <meshStandardMaterial color="#f4c430" roughness={0.55} />
          </mesh>
          <SpriteLabel
            color="#111"
            fontSize={0.34}
            outlineColor="#f4c430"
            position={[0, 0, 0]}
            text={`${corner.number}`}
          />
        </group>
      ))}
      <InstancedMarshalPosts posts={marshalPosts} />
    </group>
  )
}

function SectorPathLines({
  curve,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  track: TrackDefinition
}) {
  const sectors = useMemo(() => {
    const starts = track.sectorMarks.length >= 3
      ? track.sectorMarks.slice(0, 3)
      : [0, 1 / 3, 2 / 3]

    return starts.map((start, index) => {
      const end = index === 2 ? 1 : (starts[index + 1] ?? 1)
      const span = end > start ? end - start : end + 1 - start
      const points = Array.from({ length: 45 }, (_, pointIndex) => {
        const progress = (start + (pointIndex / 44) * span) % 1

        return poseOnTrack(curve, progress, 0).position.setY(0.13)
      })
      const labelProgress = (start + span * 0.5) % 1
      const labelPose = poseOnTrack(
        curve,
        labelProgress,
        presentationTrackWidth(track) / 2 + 0.82,
      )

      return { labelPose, points }
    })
  }, [curve, track])
  const colors = ['#00d8ff', '#ffd21f', '#ff344d']

  return (
    <group>
      {sectors.map((sector, index) => (
        <group key={index}>
          <Line points={sector.points} color={colors[index]} lineWidth={2.1} />
          <SpriteLabel
            color={colors[index]}
            fontSize={0.56}
            position={sector.labelPose.position.setY(0.5)}
            text={`SECTOR ${index + 1}`}
          />
        </group>
      ))}
    </group>
  )
}

function TrackSurface({
  cameraMode,
  config,
  curve,
  edgeLeft,
  edgeRight,
  roadGeometry,
}: Pick<
  SceneContentsProps,
  'cameraMode' | 'config' | 'curve' | 'edgeLeft' | 'edgeRight' | 'roadGeometry'
>) {
  return (
    <group>
      <mesh geometry={roadGeometry}>
        <meshBasicMaterial color="#222a34" transparent opacity={0.98} />
      </mesh>
      <Line points={edgeLeft} color="#eef4fb" lineWidth={1.15} />
      <Line points={edgeRight} color="#eef4fb" lineWidth={1.15} />
      <SectorPathLines curve={curve} track={config.track} />
      <ActiveAeroZoneLines curve={curve} track={config.track} />
      <RaceControlLines curve={curve} track={config.track} />
      <PitLane curve={curve} track={config.track} />
      <StartingGridSlots curve={curve} track={config.track} />
      {cameraMode === 'overview' ? (
        (config.track.corners ?? []).map((corner) => (
          <SpriteLabel
            color="#dce7f2"
            fontSize={0.82}
            key={corner.number}
            outlineColor="#071019"
            position={[corner.position[0], 0.46, corner.position[2]]}
            text={`${corner.number}`}
          />
        ))
      ) : (
        <TrackFurniture config={config} curve={curve} />
      )}
      {config.track.sectorMarks.map((mark, index) => {
        const pose = poseOnTrack(curve, mark)

        return (
          <group key={mark} position={pose.position} rotation={[0, 0, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.24, 0.31, 32]} />
              <meshBasicMaterial
                color={index === 0 ? '#00d8ff' : index === 1 ? '#ffd21f' : '#ff344d'}
                transparent
                opacity={0.92}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function CarMarker({
  car,
  curve,
  garageBayIndex,
  index,
  isSelected,
  onSelectDriver,
  snapshotElapsedSeconds,
  track,
}: {
  car: CarSnapshot
  curve: THREE.CatmullRomCurve3
  garageBayIndex: number
  index: number
  isSelected: boolean
  onSelectDriver: (driverId: string) => void
  snapshotElapsedSeconds: number
  track: TrackDefinition
}) {
  const groupRef = useRef<THREE.Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const markerColor =
    car.status === 'retired' ||
    car.status === 'disqualified' ||
    car.status === 'dns'
      ? '#5a5f63'
      : car.teamColor
  const markerTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 320
    canvas.height = 112

    if (context) {
      const borderColor =
        isSelected
          ? '#ffffff'
          : car.overtakeStatus === 'active'
            ? '#4cff79'
            : '#071018'
      const statusLabel =
        car.status === 'pit'
          ? 'PIT'
          : car.status === 'retired'
            ? 'OUT'
            : car.status === 'disqualified'
              ? 'DSQ'
              : car.status === 'dns'
                ? 'DNS'
                : ''

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.beginPath()
      context.arc(54, 56, isSelected ? 39 : 35, 0, Math.PI * 2)
      context.fillStyle = markerColor
      context.fill()
      context.lineWidth = isSelected ? 8 : 6
      context.strokeStyle = borderColor
      context.stroke()

      context.font = '900 30px Arial, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = '#ffffff'
      context.fillText(`${car.position}`, 54, 57)

      context.font = '900 44px Arial, sans-serif'
      context.textAlign = 'left'
      context.lineWidth = 9
      context.lineJoin = 'round'
      context.strokeStyle = '#05090e'
      context.strokeText(car.code, 101, statusLabel ? 46 : 57)
      context.fillStyle = '#ffffff'
      context.fillText(car.code, 101, statusLabel ? 46 : 57)

      if (statusLabel) {
        context.font = '800 20px Arial, sans-serif'
        context.fillStyle = statusLabel === 'PIT' ? '#47ddff' : '#aab4bf'
        context.fillText(statusLabel, 102, 82)
      }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter

    return texture
  }, [car.code, car.overtakeStatus, car.position, car.status, isSelected, markerColor])

  useEffect(() => () => markerTexture.dispose(), [markerTexture])

  useFrame(() => {
    const laneOffset = displayLaneOffset(track, car, snapshotElapsedSeconds)
    const pose = displayPoseForCar(
      curve,
      car,
      laneOffset,
      track,
      index,
      garageBayIndex,
      snapshotElapsedSeconds,
    )
    const group = groupRef.current

    if (!group) {
      return
    }

    const target = pose.position.setY(0.54)

    if (group.position.distanceToSquared(target) > 0.0004) {
      group.position.lerp(target, 0.28)
      invalidate()
    } else {
      group.position.copy(target)
    }
  })

  return (
    <group ref={groupRef}>
      <sprite
        onClick={(event) => {
          event.stopPropagation()
          onSelectDriver(car.driverId)
        }}
        renderOrder={isSelected ? 20 : 10}
        scale={isSelected ? [4.15, 1.45, 1] : [3.6, 1.26, 1]}
      >
        <spriteMaterial
          depthTest={false}
          depthWrite={false}
          map={markerTexture}
          transparent
        />
      </sprite>
    </group>
  )
}

function OpenF1CarOverlay({
  curve,
  driverIdByCode,
  mode,
  onSelectDriver,
  overlay,
  selectedDriverId,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  driverIdByCode: Map<string, string>
  mode: string
  onSelectDriver: (driverId: string) => void
  overlay: OpenF1TrackProgress
  selectedDriverId: string
  track: TrackDefinition
}) {
  const groupsRef = useRef(new Map<number, THREE.Group>())
  const playbackStartRef = useRef<number | null>(null)
  const invalidate = useThree((state) => state.invalidate)
  const tagPose = useMemo(
    () => poseOnTrack(curve, 0, track.width / 2 + 1.5),
    [curve, track.width],
  )

  useFrame(() => {
    const now = performance.now()

    if (playbackStartRef.current === null) {
      playbackStartRef.current = now
    }

    // Loop the fetched location window at real-time speed. Placement stays on
    // the centerline: OpenF1 lateral data is not reliable at this map scale.
    const windowLength = Math.max(1_000, overlay.windowEndMs - overlay.windowStartMs)
    const windowTimeMs =
      overlay.targetMs ??
      overlay.windowStartMs + ((now - playbackStartRef.current) % windowLength)

    for (const car of overlay.cars) {
      const group = groupsRef.current.get(car.driverNumber)

      if (!group) {
        continue
      }

      const pose = poseOnTrack(curve, progressAtTime(car, windowTimeMs), 0)

      group.position.copy(pose.position.setY(0.46))
      group.lookAt(group.position.clone().add(pose.tangent))
    }

    invalidate()
  })

  return (
    <group>
      <SpriteLabel
        color="#4bd8ff"
        fontSize={0.42}
        position={tagPose.position.setY(0.72)}
        text={`OpenF1 ${mode}`}
      />
      {overlay.cars.map((car) => (
        <group
          key={car.driverNumber}
          onClick={(event) => {
            event.stopPropagation()
            const driverId = driverIdByCode.get(car.code)
            if (driverId) onSelectDriver(driverId)
          }}
          ref={(node) => {
            if (node) {
              groupsRef.current.set(car.driverNumber, node)
            } else {
              groupsRef.current.delete(car.driverNumber)
            }
          }}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry
              args={[
                driverIdByCode.get(car.code) === selectedDriverId ? 0.36 : 0.27,
                24,
              ]}
            />
            <meshBasicMaterial
              color={car.teamColor}
              transparent
              opacity={
                driverIdByCode.get(car.code) === selectedDriverId ? 1 : 0.78
              }
            />
          </mesh>
          <SpriteLabel
            color={car.teamColor}
            fontSize={0.68}
            position={[0, 0.52, 0]}
            text={car.code}
          />
        </group>
      ))}
    </group>
  )
}

function CameraRig({
  cameraMode,
  curve,
  selectedCar,
  selectedGarageBayIndex,
  selectedPitSlot,
  snapshotElapsedSeconds,
  track,
}: {
  cameraMode: CameraMode
  curve: THREE.CatmullRomCurve3
  selectedCar: CarSnapshot
  selectedGarageBayIndex: number
  selectedPitSlot: number
  snapshotElapsedSeconds: number
  track: TrackDefinition
}) {
  const { camera, invalidate } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const targetRef = useRef(new THREE.Vector3(0, 0, 0))

  useFrame(() => {
    const pose = displayPoseForCar(
      curve,
      selectedCar,
      0,
      track,
      selectedPitSlot,
      selectedGarageBayIndex,
      snapshotElapsedSeconds,
    )
    const target = pose.position.clone().setY(0.5)

    if (cameraMode === 'overview') {
      const overviewPosition = new THREE.Vector3(0, 47, 0.01)
      const overviewTarget = new THREE.Vector3(0, 0, 0)
      camera.position.lerp(overviewPosition, 0.12)
      targetRef.current.lerp(overviewTarget, 0.08)
      camera.lookAt(targetRef.current)

      if (
        camera.position.distanceToSquared(overviewPosition) > 0.0004 ||
        targetRef.current.distanceToSquared(overviewTarget) > 0.0004
      ) {
        invalidate()
      }
    }

    if (cameraMode === 'chase') {
      const chasePosition = target
        .clone()
        .add(pose.tangent.clone().multiplyScalar(-12))
        .add(new THREE.Vector3(0, 7.2, 0))

      camera.position.lerp(chasePosition, 0.28)
      targetRef.current.lerp(target, 0.4)
      camera.lookAt(targetRef.current)

      if (
        camera.position.distanceToSquared(chasePosition) > 0.0004 ||
        targetRef.current.distanceToSquared(target) > 0.0004
      ) {
        invalidate()
      }
    }

    if (cameraMode === 'orbit' && controlsRef.current) {
      controlsRef.current.target.lerp(target, 0.1)
      controlsRef.current.update()
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={cameraMode === 'orbit'}
      enableDamping
      maxDistance={58}
      maxPolarAngle={Math.PI * 0.47}
      minDistance={8}
      onChange={() => invalidate()}
      target={[0, 0, 0]}
    />
  )
}

function SceneContents({
  cameraMode,
  config,
  curve,
  edgeLeft,
  edgeRight,
  onSelectDriver,
  openF1Overlay,
  openF1OverlayMode,
  roadGeometry,
  selectedDriverId,
  showSimulationCars = true,
  snapshot,
}: SceneContentsProps) {
  const selectedCar =
    snapshot.cars.find((car) => car.driverId === selectedDriverId) ?? snapshot.cars[0]
  const pitSlotByTeam = useMemo(
    () =>
      new Map(
        config.teams.map((team) => [
          team.id,
          pitBoxSlotForTeam(config.teams, team.id),
        ]),
      ),
    [config.teams],
  )
  const garageBayByDriver = useMemo(() => {
    const result = new Map<string, number>()

    for (const team of config.teams) {
      config.drivers
        .filter((driver) => driver.teamId === team.id)
        .forEach((driver, index) => result.set(driver.id, index % 2))
    }

    return result
  }, [config.drivers, config.teams])
  const selectedPitSlot = pitSlotByTeam.get(selectedCar.teamId) ?? 0
  const selectedGarageBayIndex =
    garageBayByDriver.get(selectedCar.driverId) ?? 0
  const driverIdByCode = useMemo(
    () => new Map(config.drivers.map((driver) => [driver.code, driver.id])),
    [config.drivers],
  )

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight
        intensity={0.8}
        position={[16, 27, 14]}
      />
      <TrackSurface
        cameraMode={cameraMode}
        config={config}
        curve={curve}
        edgeLeft={edgeLeft}
        edgeRight={edgeRight}
        roadGeometry={roadGeometry}
      />
      {showSimulationCars
        ? snapshot.cars.map((car) =>
        // Retired cars stay on track (grayed out) until marshals clear them.
        car.hiddenFromTrack ? null : (
          <CarMarker
            car={car}
            curve={curve}
            garageBayIndex={garageBayByDriver.get(car.driverId) ?? 0}
            index={pitSlotByTeam.get(car.teamId) ?? 0}
            isSelected={car.driverId === selectedDriverId}
            key={car.driverId}
            onSelectDriver={onSelectDriver}
            snapshotElapsedSeconds={snapshot.elapsedSeconds}
            track={config.track}
          />
        ),
      )
        : null}
      {openF1Overlay && openF1Overlay.cars.length > 0 ? (
        <OpenF1CarOverlay
          curve={curve}
          driverIdByCode={driverIdByCode}
          mode={openF1OverlayMode}
          onSelectDriver={onSelectDriver}
          overlay={openF1Overlay}
          selectedDriverId={selectedDriverId}
          track={config.track}
        />
      ) : null}
      <CameraRig
        cameraMode={cameraMode}
        curve={curve}
        selectedCar={selectedCar}
        selectedGarageBayIndex={selectedGarageBayIndex}
        selectedPitSlot={selectedPitSlot}
        snapshotElapsedSeconds={snapshot.elapsedSeconds}
        track={config.track}
      />
    </>
  )
}

export function RaceScene(props: RaceSceneProps) {
  const curve = useMemo(() => createTrackCurve(props.config.track), [props.config.track])
  const trackWidth = presentationTrackWidth(props.config.track)
  const roadGeometry = useMemo(
    () => createTrackRibbonGeometry(curve, trackWidth),
    [curve, trackWidth],
  )
  const edgeLeft = useMemo(
    () => edgePoints(curve, trackWidth, 1),
    [curve, trackWidth],
  )
  const edgeRight = useMemo(
    () => edgePoints(curve, trackWidth, -1),
    [curve, trackWidth],
  )

  return (
    <Canvas
      camera={{ fov: 48, near: 0.1, far: 220, position: [0, 47, 0.01] }}
      className="race-canvas"
      dpr={[1, 1.35]}
      frameloop="demand"
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      performance={{ min: 0.7 }}
      shadows={false}
    >
      <Suspense fallback={null}>
        <SceneContents
          {...props}
          curve={curve}
          edgeLeft={edgeLeft}
          edgeRight={edgeRight}
          roadGeometry={roadGeometry}
        />
      </Suspense>
    </Canvas>
  )
}
