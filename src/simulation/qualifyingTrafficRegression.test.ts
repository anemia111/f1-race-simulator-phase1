import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { RaceConfig } from '../types'
import { advanceRace, createInitialRace } from './race'

describe('live qualifying traffic regression', () => {
  it.each(['f1-custom', 'super-formula'] as const)('times equal %s cars without a large first-release advantage', seriesId => {
    const sf = seriesPackageById.get(seriesId)!
    const reference = sf.drivers[0]
    const config: RaceConfig = {
      drivers: sf.drivers.slice(0, 6).map(driver => ({ ...driver, tire: 'S', skills: { ...reference.skills } })),
      teams: sf.teams.map(team => ({ ...team, machine: { ...sf.teams[0].machine } })),
      track: { ...(seriesId === 'super-formula' ? sf.tracks.find(track => track.id.includes('fuji'))! : sf.tracks[0]), rainProbability: 0 },
      seriesId: sf.id,
      overtakeSystem: seriesId === 'super-formula' ? 'ots' : 'active-aero',
      seed: 'qualifying-clean-air-regression',
      weekendStage: 'qualifying',
      sessionDurationSeconds: 600,
    }
    if (seriesId === 'f1-custom') config.timedSessionPlan = {
      totalDurationSeconds: 600,
      segments: [{ name: 'Q1', startsAtSeconds: 0, endsAtSeconds: 600, participantDriverIds: config.drivers.map(driver => driver.id), suspensionStartsAtSeconds: null, suspensionEndsAtSeconds: null, tire: { kind: 'f1-pirelli-session-tire', compound: 'S' } }],
    }
    let snapshot = createInitialRace(config)
    const releaseOrder: string[] = []
    const firstLaps = new Map<string, number>()
    for (let elapsed = 0; elapsed < 600; elapsed++) {
      snapshot = advanceRace(snapshot, 1, config)
      for (const car of snapshot.cars) {
        if (car.timedRunPhase === 'out-lap' && !releaseOrder.includes(car.driverId)) releaseOrder.push(car.driverId)
        if (car.lapHistory.length && !firstLaps.has(car.driverId)) {
          firstLaps.set(car.driverId, car.lapHistory[0].lapTimeSeconds)
        }
      }
      if (firstLaps.size === config.drivers.length) break
    }
    expect(firstLaps.size).toBe(config.drivers.length)
    const times = [...firstLaps.values()].sort((a, b) => a - b)
    const first = firstLaps.get(releaseOrder[0])!
    // Individual traffic losses remain possible; the earliest release must
    // not gain a multi-second bonus against the typical equal-car lap.
    expect(times.at(-1)! - times[0]).toBeLessThan(6)
    expect(times[Math.floor(times.length / 2)] - first).toBeLessThan(1.5)
    for (const car of snapshot.cars) {
      const lap = car.lapHistory[0]
      expect(lap.sectors.reduce((sum, sector) => sum + sector, 0)).toBeCloseTo(lap.lapTimeSeconds, 5)
    }
  }, 120_000)
})
