import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as T from 'three'
import type { CarSnapshot } from '../../types'
import { roadPose, pitOffset } from '../tracks/suzukaSurface'
import { VisualFrameBuffer, type CinematicCamera } from '../core/visualFrame'

export function CinematicCameraRig({
  mode,
  car,
  buffer,
  paused,
}: {
  mode: CinematicCamera
  car: CarSnapshot
  buffer: VisualFrameBuffer
  paused: boolean
}) {
  const camera = useThree((s) => s.camera)
  const reference = roadPose(0.988).position
  useEffect(() => {
    if (mode === 'free') {
      const eye = roadPose(0.005, -22).position.add(new T.Vector3(0, 12, 0))
      camera.position.copy(eye)
      camera.up.set(0, 1, 0)
      camera.lookAt(roadPose(0.988).position)
    }
  }, [mode, camera])
  const previous = useRef(''),
    shot = useRef(-1),
    target = useRef(new T.Vector3()),
    eye = useRef(new T.Vector3())
  useFrame(({ camera }, delta) => {
    if (mode === 'free') return
    const c = buffer.sample(car.driverId, performance.now(), paused) ?? car
    const pit =
      c.status === 'pit' || c.pitPhase === 'lane' || c.pitPhase === 'entry'
    const p = pit ? (c.pitLaneProgress ?? c.progress) : c.progress
    const f = roadPose(p, pit ? pitOffset(p) : c.lateralOffsetM)
    const desiredTarget = f.position.clone().addScaledVector(f.up, 0.65)
    const desiredEye = new T.Vector3()
    let fov = 45
    if (mode === 'onboard') {
      desiredEye
        .copy(f.position)
        .addScaledVector(f.up, 1.18)
        .addScaledVector(f.tangent, 0.12)
      desiredTarget.copy(desiredEye).addScaledVector(f.tangent, 35)
      fov = 73
    } else if (mode === 'chase') {
      desiredEye
        .copy(f.position)
        .addScaledVector(f.tangent, -11)
        .addScaledVector(f.up, 3.2)
      fov = 48
    } else if (mode === 'helicopter') {
      desiredEye
        .copy(f.position)
        .addScaledVector(f.tangent, -55)
        .add(new T.Vector3(70, 105, 25))
      fov = 48
    } else {
      const index = Math.floor(p * 24)
      const fixed = roadPose((index + 0.65) / 24, 18)
      desiredEye
        .copy(fixed.position)
        .add(new T.Vector3(0, mode === 'trackside' ? 2.2 : 9, 0))
      const d = desiredEye.distanceTo(desiredTarget)
      fov =
        mode === 'trackside'
          ? 40
          : T.MathUtils.clamp(
              T.MathUtils.radToDeg(2 * Math.atan(16 / Math.max(1, d))),
              12,
              42,
            )
      if (shot.current !== index) {
        previous.current = ''
        shot.current = index
      }
    }
    if (previous.current !== mode) {
      eye.current.copy(desiredEye)
      target.current.copy(desiredTarget)
      previous.current = mode
    }
    const alpha =
      1 - Math.exp(-delta * (mode === 'onboard' ? 30 : mode === 'tv' ? 12 : 5))
    // Vehicle-relative cameras follow the same interpolated chassis.
    // Global positional damping would lag metres behind at racing speed and enter bodywork.
    if (mode === 'onboard' || mode === 'chase') {
      eye.current.copy(desiredEye)
      target.current.copy(desiredTarget)
    } else {
      eye.current.lerp(desiredEye, alpha)
      target.current.lerp(desiredTarget, alpha)
    }
    // All automated eyes stay above their target road branch. Free camera has its own limits.
    camera.position.copy(eye.current)
    camera.up.copy(mode === 'onboard' ? f.up : new T.Vector3(0, 1, 0))
    camera.lookAt(target.current)
    const perspective = camera as T.PerspectiveCamera
    perspective.fov = T.MathUtils.damp(perspective.fov, fov, 8, delta)
    perspective.updateProjectionMatrix()
  })
  return mode === 'free' ? (
    <OrbitControls
      makeDefault
      target={reference}
      minDistance={4}
      maxDistance={2200}
      maxPolarAngle={Math.PI * 0.47}
      enableDamping
    />
  ) : null
}
