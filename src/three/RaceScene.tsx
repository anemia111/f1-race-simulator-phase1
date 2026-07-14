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

function pitLaneProgress(track: TrackDefinition, slot: number) {
  const lane = track.pitLane
  const boxCount = lane?.boxCount ?? 12
  const boxStart = lane?.boxStartProgress ?? 0.012

  return (boxStart + (slot % boxCount) * 0.009) % 1
}

function pitLaneOffset(track: TrackDefinition) {
  return -(track.width / 2 + 2.35)
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
        <boxGeometry args={[0.72, 0.08, 1.18]} />
        <meshStandardMaterial color="#16191c" roughness={0.7} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, boxes.length]} ref={markerRef}>
        <boxGeometry args={[0.66, 0.05, 0.9]} />
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

  return side * Math.min(0.74, track.width * 0.26)
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

  // The race loop owns this state so the visual offset corresponds to the
  // same attack/defence condition that affects the live classification.
  return clamp(
    racingLineOffset(track, car) + car.trackLateralOffset,
    -track.width * 0.38,
    track.width * 0.38,
  )
}

function displayPoseForCar(
  curve: THREE.CatmullRomCurve3,
  car: CarSnapshot,
  laneOffset: number,
  track: TrackDefinition,
  pitSlot: number,
  elapsedSeconds: number,
) {
  const trackPose = poseOnTrack(curve, car.progress, laneOffset)
  const pitPose = poseOnTrack(curve, pitLaneProgress(track, pitSlot), pitLaneOffset(track))
  const movingPitPose =
    car.pitLaneProgress === null
      ? pitPose
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
    track.pitLane?.boxStartProgress ?? 0.075,
    pitLaneOffset(track) - 0.5,
  )
  const pitBoxes = useMemo(
    () =>
      Array.from({ length: track.pitLane?.boxCount ?? 12 }, (_, index) => ({
        index,
        pose: poseOnTrack(
          curve,
          pitLaneProgress(track, index),
          pitLaneOffset(track) - 0.72,
        ),
      })),
    [curve, track],
  )

  return (
    <group>
      <Line points={points} color="#111419" lineWidth={5} />
      <Line points={points} color="#4bd8ff" lineWidth={1.2} />
      <InstancedPitBoxes boxes={pitBoxes} />
      <SpriteLabel
        color="#4bd8ff"
        fontSize={0.48}
        position={labelPose.position.setY(0.45)}
        text="PIT"
      />
      <SpriteLabel
        color="#f4c430"
        fontSize={0.32}
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
          const pose = poseOnTrack(curve, progress, track.width / 2 + 0.42)

          return pose.position.setY(0.14)
        })
        const labelPose = poseOnTrack(
          curve,
          zone.start + span * 0.5,
          track.width / 2 + 0.95,
        )

        return { ...zone, labelPose, points }
      }),
    [curve, track],
  )

  return (
    <group>
      {zones.map((zone) => (
        <group key={`${zone.label}-${zone.start}`}>
          <Line points={zone.points} color="#46d880" lineWidth={2.8} />
          <SpriteLabel
            color="#46d880"
            fontSize={0.3}
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
            <boxGeometry args={[0.08, 0.025, track.width * 0.92]} />
            <meshBasicMaterial color={marker.color} />
          </mesh>
          <SpriteLabel
            color={marker.color}
            fontSize={0.27}
            position={[0, 0.38, track.width * 0.55]}
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
        <boxGeometry args={[0.84, 0.018, 1.42]} />
        <meshBasicMaterial opacity={0.34} transparent vertexColors />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, slots.length]} ref={lineRef}>
        <boxGeometry args={[0.9, 0.02, 0.08]} />
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
    () => edgePoints(curve, config.track.width + 4.2, 1, 144),
    [curve, config.track.width],
  )
  const barrierRight = useMemo(
    () => edgePoints(curve, config.track.width + 4.2, -1, 144),
    [curve, config.track.width],
  )
  const kerbs = useMemo(
    () =>
      Array.from({ length: 56 }, (_, index) => {
        const side = index % 2 === 0 ? 1 : -1
        const progress = (index / 56 + (side === 1 ? 0.012 : 0.022)) % 1
        const pose = poseOnTrack(curve, progress, (config.track.width / 2 + 0.16) * side)

        return { index, pose, side }
      }),
    [curve, config.track.width],
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

function TrackSurface({
  config,
  curve,
  edgeLeft,
  edgeRight,
  roadGeometry,
}: Pick<
  SceneContentsProps,
  'config' | 'curve' | 'edgeLeft' | 'edgeRight' | 'roadGeometry'
>) {
  return (
    <group>
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial color="#252528" roughness={0.72} metalness={0.08} />
      </mesh>
      <Line points={edgeLeft} color="#f2f5f0" lineWidth={1.5} />
      <Line points={edgeRight} color="#c9272e" lineWidth={1.5} />
      <ActiveAeroZoneLines curve={curve} track={config.track} />
      <RaceControlLines curve={curve} track={config.track} />
      <PitLane curve={curve} track={config.track} />
      <StartingGridSlots curve={curve} track={config.track} />
      <TrackFurniture config={config} curve={curve} />
      {config.track.sectorMarks.map((mark, index) => {
        const pose = poseOnTrack(curve, mark)

        return (
          <group key={mark} position={pose.position} rotation={[0, 0, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.45, 1.58, 48]} />
              <meshBasicMaterial
                color={index === 0 ? '#f4c430' : index === 1 ? '#4bd8ff' : '#ff73b8'}
                transparent
                opacity={0.6}
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
  index,
  isSelected,
  onSelectDriver,
  showDetails,
  snapshotElapsedSeconds,
  track,
}: {
  car: CarSnapshot
  curve: THREE.CatmullRomCurve3
  index: number
  isSelected: boolean
  onSelectDriver: (driverId: string) => void
  showDetails: boolean
  snapshotElapsedSeconds: number
  track: TrackDefinition
}) {
  const groupRef = useRef<THREE.Group>(null)
  const markerColor =
    car.status === 'retired' ||
    car.status === 'disqualified' ||
    car.status === 'dns'
      ? '#5a5f63'
      : car.status === 'pit'
        ? '#4bd8ff'
        : car.teamColor
  const showLabel =
    isSelected ||
    (snapshotElapsedSeconds > 8 && car.position <= 6) ||
    car.status !== 'running' ||
    car.timedRunPhase === 'attack-lap'
  const warningLightOn =
    car.warningLightsUntilSeconds !== null &&
    snapshotElapsedSeconds < car.warningLightsUntilSeconds &&
    Math.floor(snapshotElapsedSeconds * 8) % 2 === 0

  useFrame(() => {
    const laneOffset = displayLaneOffset(track, car, snapshotElapsedSeconds)
    const pose = displayPoseForCar(
      curve,
      car,
      laneOffset,
      track,
      index,
      snapshotElapsedSeconds,
    )
    const group = groupRef.current

    if (!group) {
      return
    }

    group.position.lerp(pose.position.setY(0.38), 0.2)
    group.lookAt(group.position.clone().add(pose.tangent))
  })

  return (
    <group ref={groupRef}>
      <group
        scale={0.76}
        onClick={(event) => {
          event.stopPropagation()
          onSelectDriver(car.driverId)
        }}
      >
        <mesh position={[0, -0.1, 0.04]} receiveShadow>
          <boxGeometry args={[0.92, 0.055, 1.76]} />
          <meshStandardMaterial color="#080a0c" roughness={0.64} metalness={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.015, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.225, 0.88, 4, 10]} />
          <meshStandardMaterial color={markerColor} roughness={0.38} metalness={0.24} />
        </mesh>
        <mesh castShadow position={[0, 0.015, -0.73]}>
          <boxGeometry args={[0.2, 0.13, 0.76]} />
          <meshStandardMaterial color={markerColor} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.005, -1.12]}>
          <boxGeometry args={[0.12, 0.085, 0.28]} />
          <meshStandardMaterial color="#eef1f2" roughness={0.44} metalness={0.12} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            castShadow
            key={`sidepod-${side}`}
            position={[side * 0.34, 0.005, 0.16]}
            rotation={[0, side * -0.08, 0]}
          >
            <boxGeometry args={[0.3, 0.18, 0.7]} />
            <meshStandardMaterial color={markerColor} roughness={0.43} metalness={0.2} />
          </mesh>
        ))}
        <mesh position={[0, 0.13, 0.02]}>
          <capsuleGeometry args={[0.17, 0.22, 3, 8]} />
          <meshStandardMaterial color="#101418" roughness={0.3} metalness={0.18} />
        </mesh>
        <mesh position={[0, 0.13, 0.43]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.48, 8]} />
          <meshStandardMaterial color={markerColor} roughness={0.4} metalness={0.2} />
        </mesh>

        <mesh position={[0, 0.015, -1.27]}>
          <boxGeometry args={[1.36, 0.055, 0.16]} />
          <meshStandardMaterial
            color={car.activeAeroMode !== 'corner' ? '#46d880' : '#e8ecef'}
            roughness={0.42}
          />
        </mesh>
        <mesh position={[0, 0.075, -1.15]}>
          <boxGeometry args={[1.16, 0.035, 0.1]} />
          <meshStandardMaterial color="#111419" roughness={0.48} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`front-endplate-${side}`} position={[side * 0.68, 0.07, -1.22]}>
            <boxGeometry args={[0.04, 0.16, 0.3]} />
            <meshStandardMaterial color="#0b0e11" roughness={0.5} />
          </mesh>
        ))}

        <mesh position={[0, 0.25, 0.94]}>
          <boxGeometry args={[1.06, 0.095, 0.16]} />
          <meshStandardMaterial
            color={car.activeAeroMode !== 'corner' ? '#46d880' : '#111419'}
            roughness={0.36}
          />
        </mesh>
        <mesh position={[0, 0.1, 0.89]}>
          <boxGeometry args={[0.82, 0.05, 0.12]} />
          <meshStandardMaterial color="#080a0c" roughness={0.52} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`rear-endplate-${side}`} position={[side * 0.52, 0.17, 0.94]}>
            <boxGeometry args={[0.045, 0.32, 0.24]} />
            <meshStandardMaterial color={markerColor} roughness={0.42} metalness={0.16} />
          </mesh>
        ))}

        {[
          [-0.53, -0.49],
          [0.53, -0.49],
          [-0.53, 0.58],
          [0.53, 0.58],
        ].map(([x, z]) => (
          <mesh castShadow key={`wheel-${x}-${z}`} position={[x, -0.035, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.185, 0.185, 0.17, 14]} />
            <meshStandardMaterial color="#030405" roughness={0.72} metalness={0.08} />
          </mesh>
        ))}

        {showDetails ? (
          <>
            <mesh position={[0, 0.19, -0.03]}>
              <sphereGeometry args={[0.115, 12, 8]} />
              <meshStandardMaterial color="#f2d14d" roughness={0.35} metalness={0.16} />
            </mesh>
            <mesh position={[0, 0.31, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.205, 0.032, 8, 18, Math.PI * 1.55]} />
              <meshStandardMaterial color="#d7dce0" roughness={0.32} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.235, -0.21]} rotation={[-0.18, 0, 0]}>
              <boxGeometry args={[0.045, 0.24, 0.045]} />
              <meshStandardMaterial color="#d7dce0" roughness={0.32} metalness={0.3} />
            </mesh>
            {[-1, 1].map((side) => (
              <group key={`mirror-${side}`}>
                <mesh position={[side * 0.34, 0.2, -0.2]} rotation={[0, side * 0.2, 0]}>
                  <boxGeometry args={[0.13, 0.065, 0.08]} />
                  <meshStandardMaterial color={markerColor} roughness={0.38} metalness={0.2} />
                </mesh>
                <mesh position={[side * 0.265, 0.15, -0.15]} rotation={[0, 0, side * 0.5]}>
                  <boxGeometry args={[0.025, 0.16, 0.025]} />
                  <meshStandardMaterial color="#15191c" roughness={0.46} metalness={0.22} />
                </mesh>
              </group>
            ))}
          </>
        ) : null}
        <mesh position={[0, 0.13, 1.045]}>
          <boxGeometry args={[0.18, 0.095, 0.055]} />
          <meshStandardMaterial
            color={warningLightOn ? '#ff1f32' : '#2c080c'}
            emissive={warningLightOn ? '#ff1f32' : '#000000'}
            emissiveIntensity={warningLightOn ? 3.2 : 0}
          />
        </mesh>
      </group>
      {isSelected ? (
        <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.78, 0.9, 40]} />
          <meshBasicMaterial color="#f4c430" transparent opacity={0.86} />
        </mesh>
      ) : null}
      {showLabel ? (
        <SpriteLabel
          color="#ffffff"
          fontSize={0.7}
          position={[0, 1.12, 0]}
          text={car.code}
        />
      ) : null}
    </group>
  )
}

function OpenF1CarOverlay({
  curve,
  mode,
  overlay,
  track,
}: {
  curve: THREE.CatmullRomCurve3
  mode: string
  overlay: OpenF1TrackProgress
  track: TrackDefinition
}) {
  const groupsRef = useRef(new Map<number, THREE.Group>())
  const playbackStartRef = useRef<number | null>(null)
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
          ref={(node) => {
            if (node) {
              groupsRef.current.set(car.driverNumber, node)
            } else {
              groupsRef.current.delete(car.driverNumber)
            }
          }}
        >
          <mesh>
            <boxGeometry args={[0.68, 0.24, 1.34]} />
            <meshBasicMaterial
              color={car.teamColor}
              opacity={0.44}
              transparent
              wireframe
            />
          </mesh>
          <SpriteLabel
            color={car.teamColor}
            fontSize={0.5}
            position={[0, 0.78, 0]}
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
  selectedIndex,
  snapshotElapsedSeconds,
  track,
}: {
  cameraMode: CameraMode
  curve: THREE.CatmullRomCurve3
  selectedCar: CarSnapshot
  selectedIndex: number
  snapshotElapsedSeconds: number
  track: TrackDefinition
}) {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const targetRef = useRef(new THREE.Vector3(0, 0, 0))

  useFrame(() => {
    const pose = displayPoseForCar(
      curve,
      selectedCar,
      0,
      track,
      selectedIndex,
      snapshotElapsedSeconds,
    )
    const target = pose.position.clone().setY(0.5)

    if (cameraMode === 'overview') {
      camera.position.lerp(new THREE.Vector3(0, 34, 31), 0.06)
      targetRef.current.lerp(new THREE.Vector3(0, 0, 0), 0.08)
      camera.lookAt(targetRef.current)
    }

    if (cameraMode === 'chase') {
      const chasePosition = target
        .clone()
        .add(pose.tangent.clone().multiplyScalar(-12))
        .add(new THREE.Vector3(0, 7.2, 0))

      camera.position.lerp(chasePosition, 0.28)
      targetRef.current.lerp(target, 0.4)
      camera.lookAt(targetRef.current)
    }

    if (cameraMode === 'orbit' && controlsRef.current) {
      controlsRef.current.target.lerp(target, 0.1)
      controlsRef.current.update()
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
  snapshot,
}: SceneContentsProps) {
  const selectedCar =
    snapshot.cars.find((car) => car.driverId === selectedDriverId) ?? snapshot.cars[0]
  const selectedIndex = Math.max(
    0,
    snapshot.cars.findIndex((car) => car.driverId === selectedCar.driverId),
  )

  return (
    <>
      <color attach="background" args={['#141512']} />
      <fog attach="fog" args={['#141512', 38, 92]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        intensity={2.4}
        position={[16, 27, 14]}
      />
      <hemisphereLight args={['#d9f4ff', '#2a1f16', 1.0]} />
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[88, 0.05, 68]} />
        <meshStandardMaterial color="#23301f" roughness={0.95} />
      </mesh>
      <TrackSurface
        config={config}
        curve={curve}
        edgeLeft={edgeLeft}
        edgeRight={edgeRight}
        roadGeometry={roadGeometry}
      />
      {snapshot.cars.map((car, index) =>
        // Retired cars stay on track (grayed out) until marshals clear them.
        car.hiddenFromTrack ? null : (
          <CarMarker
            car={car}
            curve={curve}
            index={index}
            isSelected={car.driverId === selectedDriverId}
            key={car.driverId}
            onSelectDriver={onSelectDriver}
            showDetails={
              car.driverId === selectedDriverId ||
              (cameraMode === 'orbit' && car.position <= 6)
            }
            snapshotElapsedSeconds={snapshot.elapsedSeconds}
            track={config.track}
          />
        ),
      )}
      {openF1Overlay && openF1Overlay.cars.length > 0 ? (
        <OpenF1CarOverlay
          curve={curve}
          mode={openF1OverlayMode}
          overlay={openF1Overlay}
          track={config.track}
        />
      ) : null}
      <CameraRig
        cameraMode={cameraMode}
        curve={curve}
        selectedCar={selectedCar}
        selectedIndex={selectedIndex}
        snapshotElapsedSeconds={snapshot.elapsedSeconds}
        track={config.track}
      />
    </>
  )
}

export function RaceScene(props: RaceSceneProps) {
  const curve = useMemo(() => createTrackCurve(props.config.track), [props.config.track])
  const roadGeometry = useMemo(
    () => createTrackRibbonGeometry(curve, props.config.track.width),
    [curve, props.config.track.width],
  )
  const edgeLeft = useMemo(
    () => edgePoints(curve, props.config.track.width, 1),
    [curve, props.config.track.width],
  )
  const edgeRight = useMemo(
    () => edgePoints(curve, props.config.track.width, -1),
    [curve, props.config.track.width],
  )

  return (
    <Canvas
      camera={{ fov: 48, near: 0.1, far: 220, position: [0, 34, 31] }}
      className="race-canvas"
      dpr={[1, 1.35]}
      gl={{
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
