import { describe, expect, it } from 'vitest'
import { VisualFrameBuffer } from './visualFrame'
import type { RaceSnapshot } from '../../types'
import { roadPose, ribbon, widthAt, elevationAt } from '../tracks/suzukaSurface'

function frame(time: number, distance: number, pitPhase = 'none') {
  return {
    elapsedSeconds: time,
    cars: [
      {
        driverId: 'a',
        totalDistance: distance,
        progress: distance % 1,
        lateralOffsetM: 1,
        speedKph: 200,
        status: 'running',
        pitPhase,
        pitLaneProgress: null,
      },
    ],
  } as RaceSnapshot
}
describe('presentation-only frame buffer', () => {
  it('interpolates across the line without reversing and never mutates either snapshot', () => {
    const buffer = new VisualFrameBuffer({ interpolationDelayMs: 100 }),
      a = frame(1, 0.999),
      b = frame(1.1, 1.001)
    const frozen = JSON.stringify([a, b])
    buffer.push(a, 100)
    buffer.push(b, 200)
    const c = buffer.sample('a', 250, false)!
    expect(c.totalDistance).toBeCloseTo(1)
    expect(c.progress).toBeCloseTo(0)
    expect(JSON.stringify([a, b])).toBe(frozen)
  })
  it('continues moving across slow arrivals without inventing future positions', () => {
    const buffer = new VisualFrameBuffer()
    buffer.push(frame(0, 0), 0)
    buffer.push(frame(0.1, 0.001), 200)
    const samples = [280, 320, 360].map(now => buffer.sample('a', now, false)!.totalDistance)
    expect(samples[1]).toBeGreaterThan(samples[0])
    expect(samples[2]).toBeGreaterThan(samples[1])
    expect(samples[2]).toBeLessThanOrEqual(0.001)
  })
  it('keeps movement monotonic through jitter and never extrapolates beyond received data', () => {
    const buffer = new VisualFrameBuffer()
    const arrivals = [0, 100, 220, 300, 420, 510, 620, 710, 830, 930, 1040, 1140]
    let next = 0, previous = -Infinity, latest = 0
    for (let now = 0; now <= 1000; now += 10) {
      while (next < arrivals.length && arrivals[next] <= now) {
        latest = arrivals[next] / 100000
        buffer.push(frame(arrivals[next] / 1000, latest), arrivals[next])
        next++
      }
      const distance = buffer.sample('a', now, false)!.totalDistance
      if (now > 340) expect(distance).toBeGreaterThan(previous)
      expect(distance).toBeLessThanOrEqual(latest)
      previous = distance
    }
  })
  it('keeps moving when a newly observed arrival gap expands the playback delay', () => {
    const buffer = new VisualFrameBuffer({ interpolationDelayMs: 200 })
    buffer.push(frame(0, 0), 0)
    buffer.push(frame(.1, .001), 100)
    buffer.push(frame(.2, .002), 200)
    const before = buffer.sample('a', 350, false)!.totalDistance
    buffer.push(frame(.3, .003), 500)
    const after = buffer.sample('a', 510, false)!.totalDistance
    expect(after).toBeGreaterThan(before)
    expect(buffer.sample('a', 530, false)!.totalDistance).toBeGreaterThan(after)
    expect(after).toBeLessThanOrEqual(.003)
  })
  it('snaps pause, reset, sparse accelerated frames and pit transitions', () => {
    for (const b of [frame(0, 0.4), frame(31, 0.4), frame(1.1, 0.4, 'lane')]) {
      const buffer = new VisualFrameBuffer()
      buffer.push(frame(1, 0.2), 100)
      buffer.push(b, 200)
      expect(buffer.sample('a', 205, false)).toBe(b.cars[0])
    }
    const buffer = new VisualFrameBuffer()
    buffer.push(frame(1, 0.2), 100)
    const b = frame(1.1, 0.201)
    buffer.push(b, 200)
    expect(buffer.sample('a', 205, true)).toBe(b.cars[0])
    expect(buffer.sample('absent', 205, false)).toBeNull()
  })
})
describe('metric Suzuka rendering contract', () => {
  it('wraps at the line with a normalized orthogonal road frame', () => {
    for (const p of [0, 0.2, 0.4358, 0.8446, 0.9999]) {
      const f = roadPose(p)
      expect(f.tangent.length()).toBeCloseTo(1)
      expect(f.up.y).toBeGreaterThan(0.9)
      expect(f.up.dot(f.tangent)).toBeCloseTo(0)
      expect(roadPose(p + 1).position.distanceTo(f.position)).toBeLessThan(1e-7)
      expect(widthAt(p)).toBeGreaterThanOrEqual(10)
      expect(widthAt(p)).toBeLessThanOrEqual(16)
    }
  })
  it('keeps the two crossing branches at independently sourced DEM heights', () => {
    expect(elevationAt(0.84458) - elevationAt(0.43579)).toBeGreaterThan(4)
    const f = roadPose(0.2),
      side = roadPose(0.2, 3)
    expect(f.position.distanceTo(side.position)).toBeCloseTo(3)
  })
  it('winds the road upwards for visible asphalt and contact shadows', () => {
    const g = ribbon(
      0,
      0.01,
      () => -7,
      () => 7,
      20,
    )
    const normals = g.attributes.normal
    expect(normals.getY(4)).toBeGreaterThan(0.9)
    g.dispose()
  })
})
