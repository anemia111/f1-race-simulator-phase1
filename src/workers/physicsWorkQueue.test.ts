import { describe, expect, it } from 'vitest'
import { PhysicsWorkQueue } from './physicsWorkQueue'

describe('cooperative fixed-step worker queue', () => {
  it('yields long batches to snapshot delivery and control messages', () => {
    const queue = new PhysicsWorkQueue()
    let clock = 0, steps = 0
    queue.request(60)
    expect(queue.run(() => { clock += 2; steps++; return true }, () => clock)).toBe(4)
    expect(queue.hasPending).toBe(true)
    queue.clear()
    expect(queue.run(() => { steps++; return true }, () => clock)).toBe(0)
    expect(steps).toBe(4)
  })
  it('keeps identical step order across playback multipliers and wall-time slices', () => {
    for (const speed of [1, 5, 20, 60]) {
      const queue = new PhysicsWorkQueue()
      let clock = 0, steps = 0
      const sequence: number[] = []
      for (let frame = 0; frame < 60 / speed; frame++) {
        queue.request(speed)
        while (queue.hasPending) queue.run(() => {
          sequence.push(steps++)
          clock += 3
          return true
        }, () => clock)
      }
      expect(steps).toBe(60)
      expect(sequence).toEqual(Array.from({ length: 60 }, (_, index) => index))
    }
  })
  it('bounds unprocessed debt and cancels a finished session', () => {
    const queue = new PhysicsWorkQueue()
    queue.request(60, 1000)
    expect(queue.run(() => true, () => 0)).toBe(120)
    queue.request(60)
    expect(queue.run(() => false, () => 0)).toBe(1)
    expect(queue.hasPending).toBe(false)
  })
})
