import type { CarSnapshot, RaceSnapshot } from '../../types'

/** Presentation-only interpolation. Never writes to a race snapshot. */
export class VisualFrameBuffer {
  private current: RaceSnapshot | null = null
  private frames: { frame: Pick<RaceSnapshot, 'elapsedSeconds' | 'cars'>; receivedAt: number }[] = []
  private arrivalGaps: number[] = []
  private renderAt = -Infinity
  private sampledAt = -Infinity
  private wasPaused = false
  private readonly delayMs: number
  constructor(options: { interpolationDelayMs?: number } = {}) {
    this.delayMs = options.interpolationDelayMs ?? 300
  }
  latestCar(driverId: string) {
    return this.current?.cars.find(car => car.driverId === driverId) ?? null
  }
  push(frame: RaceSnapshot, now: number) {
    if (frame === this.current) return
    const delta =
      frame.elapsedSeconds -
      (this.current?.elapsedSeconds ?? frame.elapsedSeconds)
    const last = this.frames.at(-1)
    if (delta <= 0 || delta > 10 || this.wasPaused || (last && now <= last.receivedAt)) {
      this.frames = []
      this.arrivalGaps = []
      this.renderAt = -Infinity
      this.sampledAt = -Infinity
    } else if (last) {
      this.arrivalGaps.push(now - last.receivedAt)
      this.arrivalGaps = this.arrivalGaps.slice(-8)
    }
    this.current = frame
    // Do not retain historical terrain/rubber grids or race event logs.
    this.frames.push({ frame: { elapsedSeconds: frame.elapsedSeconds, cars: frame.cars }, receivedAt: now })
    this.frames = this.frames.slice(-24)
    this.wasPaused = false
  }
  sample(driverId: string, now: number, paused: boolean) {
    const car = this.current?.cars.find((c) => c.driverId === driverId)
    if (!car) return null
    if (paused) {
      this.wasPaused = true
      return car
    }
    if (this.frames.length < 2) return car
    // Playback follows receipt time, not simulation time. A worker that takes
    // 200 ms to produce 100 ms of simulation must not finish interpolation in
    // 100 ms and freeze for the remaining 100 ms. Buffer only observed frames.
    const delay = Math.min(1500, Math.max(this.delayMs, ...this.arrivalGaps))
    const target = now - delay
    const step = Math.max(0, now - this.sampledAt)
    // Expanding the jitter buffer must slow playback gently, not hold it still
    // until wall time catches up. All sampled positions remain observations.
    this.renderAt = Number.isFinite(this.renderAt)
      ? this.renderAt + Math.max(step * 0.5, Math.min(step * 1.05, target - this.renderAt))
      : target
    this.sampledAt = now
    let left = this.frames[0]
    let right = left
    for (const frame of this.frames) {
      if (frame.receivedAt <= this.renderAt) left = frame
      right = frame
      if (frame.receivedAt >= this.renderAt) break
    }
    const before = left?.frame.cars.find((c) => c.driverId === driverId)
    const after = right?.frame.cars.find((c) => c.driverId === driverId)
    if (
      !before || !after ||
      before.status !== car.status ||
      before.pitPhase !== car.pitPhase ||
      after.status !== car.status || after.pitPhase !== car.pitPhase ||
      Math.abs(car.totalDistance - before.totalDistance) > 0.025 ||
      Math.abs(after.totalDistance - before.totalDistance) > 0.025
    )
      return car
    const interval = right.receivedAt - left.receivedAt
    const alpha = Math.max(
      0,
      Math.min(1, (this.renderAt - left.receivedAt) / Math.max(1, interval)),
    )
    const distance =
      before.totalDistance + (after.totalDistance - before.totalDistance) * alpha
    return {
      ...car,
      totalDistance: distance,
      progress: ((distance % 1) + 1) % 1,
      lateralOffsetM:
        before.lateralOffsetM +
        (after.lateralOffsetM - before.lateralOffsetM) * alpha,
      speedKph: before.speedKph + (after.speedKph - before.speedKph) * alpha,
      pitLaneProgress:
        after.pitLaneProgress === null || before.pitLaneProgress === null
          ? after.pitLaneProgress
          : before.pitLaneProgress +
            (after.pitLaneProgress - before.pitLaneProgress) * alpha,
    } satisfies CarSnapshot
  }
}

export type CinematicCamera =
  'tv' | 'trackside' | 'chase' | 'onboard' | 'helicopter' | 'free'
export type Quality = 'high' | 'medium' | 'low'
export const qualitySettings = {
  high: { dpr: 1, shadow: 2048, trees: 700, lod0: 45, lod1: 180 },
  medium: { dpr: 0.85, shadow: 1024, trees: 400, lod0: 28, lod1: 120 },
  low: { dpr: 0.67, shadow: 512, trees: 180, lod0: 15, lod1: 80 },
} as const
