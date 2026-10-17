import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { advanceRace, createInitialRace } from './race'
import { profileDistanceKmBetween } from './trackDynamics'

describe('force-integrated distance reaches the live race position', () => {
  it('uses integrated distance and preserves terminal speed in unconstrained running', () => {
    const config = { drivers: initialDrivers.slice(0, 2), teams: initialTeams,
      track: { ...tracks.find(track => track.id === 'suzuka-approx')!, rainProbability: 0 },
      seed: 'force-distance-live', weekendStage: 'race' as const }
    const initial = createInitialRace(config)
    const previous = { ...initial, formationLapsPlanned: 0, formationLapsCompleted: 1,
      raceStartedAtSeconds: 0, startProcedure: 'racing' as const, startProcedureRemainingSeconds: 0,
      cars: initial.cars.map((car, index) => ({ ...car, status: index ? 'retired' as const : 'running' as const,
        speedKph: index ? 0 : 180, progress: 0.1, totalDistance: 1.1 })) }
    const next = advanceRace(previous, 0.05, config)
    const car = next.cars.find(car => car.driverId === previous.cars[0].driverId)!
    const force = car.physicsTelemetry!
    const actualDistanceM = profileDistanceKmBetween(config.track, 1.1, car.totalDistance) * 1000
    expect(force.forceApplied).toBe(true)
    expect(actualDistanceM).toBeCloseTo(force.forceDistanceM, 7)
    expect(force.resolvedDistanceM).toBeCloseTo(force.forceDistanceM, 7)
    expect(car.speedKph).toBeCloseTo(force.forceEndSpeedKph, 1)
  })
})
