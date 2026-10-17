type MotionCar = {
  driverId: string; totalDistance: number; progress: number; lateralOffsetM: number
  pitLaneProgress: number | null; speedKph: number; status: string; pitPhase: string
  courseMotion?: { pitBlend: number }
}
type MotionFrame = { elapsedSeconds: number; cars: readonly MotionCar[] }
type Sample = Pick<MotionCar, 'totalDistance' | 'progress' | 'lateralOffsetM' | 'pitLaneProgress' | 'speedKph'> & {
  elapsedSeconds: number; pitBlend: number | null
}
type StoredCar = MotionCar & { pitBlend: number | null }

/** Receipt-time playback of observations only. Shared by markers and cameras. */
export class ReceivedMotionBuffer {
  private current: MotionFrame | null = null
  private frames: { seconds: number; at: number; cars: Map<string, StoredCar> }[] = []
  private gaps: number[] = []
  private renderAt = -Infinity
  private paused = false
  private lastSamples = new Map<string, Sample>()
  push(frame: MotionFrame, now: number) {
    if (frame === this.current) return
    const delta = frame.elapsedSeconds - (this.current?.elapsedSeconds ?? frame.elapsedSeconds)
    this.current = frame
    if (delta === 0 && this.frames.length) return
    const last = this.frames.at(-1)
    if (delta < 0 || this.paused || (last && now <= last.at)) {
      this.frames = []; this.gaps = []; this.renderAt = -Infinity; this.lastSamples.clear()
    } else if (last) this.gaps = [...this.gaps.slice(-7), now - last.at]
    // Keep motion fields only, never copies of tyre grids or telemetry histories.
    this.frames.push({ seconds: frame.elapsedSeconds, at: now, cars: new Map(frame.cars.map(car => [car.driverId, {
      driverId: car.driverId, totalDistance: car.totalDistance, progress: car.progress,
      lateralOffsetM: car.lateralOffsetM, pitLaneProgress: car.pitLaneProgress, speedKph: car.speedKph,
      status: car.status, pitPhase: car.pitPhase, pitBlend: car.courseMotion?.pitBlend ?? null,
    }])) })
    this.frames = this.frames.slice(-24)
    this.paused = false
  }
  sample(id: string, now: number, paused: boolean): Sample | null {
    const car = this.current?.cars.find(car => car.driverId === id)
    if (!car || !this.current) return null
    const latest: Sample = { totalDistance: car.totalDistance, progress: car.progress,
      lateralOffsetM: car.lateralOffsetM, pitLaneProgress: car.pitLaneProgress, speedKph: car.speedKph,
      elapsedSeconds: this.current.elapsedSeconds, pitBlend: car.courseMotion?.pitBlend ?? null }
    if (paused) { this.paused = true; return this.lastSamples.get(id) ?? latest }
    if (this.frames.length < 2) return latest
    const delay = Math.min(1500, Math.max(200, ...this.gaps))
    this.renderAt = Math.max(this.renderAt, now - delay)
    let left = this.frames[0], right = left
    for (const frame of this.frames) {
      if (frame.at <= this.renderAt) left = frame
      right = frame
      if (frame.at >= this.renderAt) break
    }
    const before = left.cars.get(id), after = right.cars.get(id)
    if (!before || !after || before.status !== car.status || after.status !== car.status ||
      before.pitPhase !== car.pitPhase || after.pitPhase !== car.pitPhase ||
      after.totalDistance < before.totalDistance || Math.abs(car.totalDistance - before.totalDistance) > 0.6) return latest
    const alpha = Math.max(0, Math.min(1, (this.renderAt - left.at) / Math.max(1, right.at - left.at)))
    const mix = (a: number, b: number) => a + (b - a) * alpha
    const distance = mix(before.totalDistance, after.totalDistance)
    const sample: Sample = { totalDistance: distance, progress: ((distance % 1) + 1) % 1,
      lateralOffsetM: mix(before.lateralOffsetM, after.lateralOffsetM), speedKph: mix(before.speedKph, after.speedKph),
      pitLaneProgress: before.pitLaneProgress === null || after.pitLaneProgress === null ? after.pitLaneProgress : mix(before.pitLaneProgress, after.pitLaneProgress),
      elapsedSeconds: mix(left.seconds, right.seconds),
      pitBlend: before.pitBlend === null || after.pitBlend === null ? after.pitBlend : mix(before.pitBlend, after.pitBlend),
    }
    this.lastSamples.set(id, sample)
    return sample
  }
}
