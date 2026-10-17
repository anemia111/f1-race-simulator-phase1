import { describe, expect, it } from 'vitest'
import { ReceivedMotionBuffer } from './receivedMotion'

const frame = (seconds: number, distance: number, patch = {}) => ({ elapsedSeconds: seconds,
  cars: [{ driverId: 'car', totalDistance: distance, progress: distance % 1,
    lateralOffsetM: 0, pitLaneProgress: null, speedKph: 200, status: 'running', pitPhase: 'none', ...patch }],
})

describe('shared marker and camera motion playback', () => {
  it('advances on every render between received positions instead of easing to a stop', () => {
    const buffer = new ReceivedMotionBuffer()
    buffer.push(frame(0, 0), 0); buffer.push(frame(.1, .01), 100); buffer.push(frame(.2, .02), 200)
    const distances = [220, 240, 260, 280].map(now => buffer.sample('car', now, false)!.totalDistance)
    expect(distances).toEqual([.002, .004, .006, .008])
    expect(buffer.sample('car', 1000, false)!.totalDistance).toBe(.02)
  })
  it('uses receipt gaps rather than simulation speed and never moves beyond an observation', () => {
    const buffer = new ReceivedMotionBuffer()
    buffer.push(frame(0, 0), 0); buffer.push(frame(10, .1), 500)
    const first = buffer.sample('car', 600, false)!
    const second = buffer.sample('car', 650, false)!
    expect(first.totalDistance).toBeCloseTo(.02)
    expect(second.totalDistance).toBeCloseTo(.03)
    expect(second.totalDistance).toBeLessThanOrEqual(.1)
  })
  it('interpolates across the finish line without a reverse lap', () => {
    const buffer = new ReceivedMotionBuffer()
    buffer.push(frame(0, .99), 0); buffer.push(frame(.1, 1.01), 100)
    const sample = buffer.sample('car', 250, false)!
    expect(sample.totalDistance).toBe(1)
    expect(sample.progress).toBe(0)
  })
  it('freezes the rendered position on pause and resets on a session rewind', () => {
    const buffer = new ReceivedMotionBuffer()
    buffer.push(frame(0, 0), 0); buffer.push(frame(.1, .01), 100)
    const last = buffer.sample('car', 250, false)!
    expect(buffer.sample('car', 900, true)).toEqual(last)
    buffer.push(frame(0, 0), 1000)
    expect(buffer.sample('car', 1010, false)!.totalDistance).toBe(0)
  })
  it('does not interpolate status transitions or mutate simulation data', () => {
    const buffer = new ReceivedMotionBuffer()
    const first = frame(0, .2), next = frame(.1, .21, { status: 'retired' })
    const before = structuredClone(next)
    buffer.push(first, 0); buffer.push(next, 100)
    expect(buffer.sample('car', 250, false)!.totalDistance).toBe(.21)
    expect(next).toEqual(before)
  })
  it('gives the camera and selected car the same position for the same render time', () => {
    const buffer = new ReceivedMotionBuffer()
    buffer.push(frame(0, 0), 0); buffer.push(frame(.1, .01), 100)
    expect(buffer.sample('car', 275, false)).toEqual(buffer.sample('car', 275, false))
  })
})
