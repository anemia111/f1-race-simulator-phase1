/** Bound each worker task by wall time while every simulation step stays 50 ms.
 * Debt is bounded: an overloaded PC slows playback instead of accumulating an
 * ever-growing catch-up queue that delays snapshots and pause commands. */
export class PhysicsWorkQueue {
  private pending = 0
  get hasPending() { return this.pending > 0 }
  clear() { this.pending = 0 }
  request(speed: number, wallFrames = 1) {
    this.pending = Math.min(this.pending + speed * wallFrames, speed * 2)
  }
  run(step: () => boolean, now: () => number, budgetMs = 8) {
    const started = now()
    let count = 0
    while (this.pending > 0) {
      this.pending--
      count++
      if (!step()) { this.clear(); break }
      if (now() - started >= budgetMs) break
    }
    return count
  }
}
