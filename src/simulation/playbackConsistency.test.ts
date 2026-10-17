import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { advanceRace, createInitialRace } from './race'
import type { RaceSnapshot } from '../types'

describe('worker playback batching uses the same physical ticks', () => {
  it('produces the identical two-car Suzuka state after 3 simulated seconds at 1/5/20/60x', () => {
    const config = { drivers: initialDrivers.slice(0, 2), teams: initialTeams,
      seed: 'physics-playback-consistency', track: tracks.find(track => track.id === 'suzuka-approx')!, weekendStage: 'race' as const }
    const initial = createInitialRace(config)
    const racing = { ...initial, formationLapsCompleted: 1, formationLapsPlanned: 0,
      raceStartedAtSeconds: 0, startProcedure: 'racing' as const, startProcedureRemainingSeconds: 0,
      cars: initial.cars.map((car, index) => ({ ...car, speedKph: 180, status: 'running' as const,
        progress: 0.1 - index * 0.004, totalDistance: 1.1 - index * 0.004 })) }
    const run = (speed: number) => {
      let snapshot: RaceSnapshot = racing
      for (let frame = 0; frame < 60 / speed; frame++) snapshot = advanceRace(snapshot, 0.05 * speed, config)
      return snapshot
    }
    const reference = run(1)
    expect(reference.elapsedSeconds).toBeCloseTo(3, 10)
    for (const car of reference.cars) {
      expect(Number.isFinite(car.physicsTelemetry?.driveForceN)).toBe(true)
      expect(car.totalDistance).toBeGreaterThan(racing.cars.find(previous => previous.driverId === car.driverId)!.totalDistance)
    }
    for (const speed of [5, 20, 60]) expect(run(speed)).toEqual(reference)
  })
})
