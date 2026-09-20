import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { advanceRace, createInitialRace } from './race'
import { capRearLongitudinalCandidateM } from './lateralDynamics'
import { followingDemand } from './following'
import type { RaceConfig } from '../types'

const config: RaceConfig = { drivers: initialDrivers, teams: initialTeams,
  track: { ...tracks[0], rainProbability: 0 }, seed: 'simultaneous-grid-launch', weekendStage: 'race' }
function launched() {
  let state = createInitialRace(config)
  state = advanceRace(state, state.formationLapDurationSeconds * state.formationLapsPlanned, config)
  state = advanceRace(state, 8, config)
  return advanceRace(state, state.startLightSequenceSeconds!, config)
}

describe('traffic integrity', () => {
  it('records no lap when collision resolution leaves the car before the line', () => {
    const state = launched()
    const cars = state.cars.slice(0, 2).map((car, index) => ({ ...car,
      totalDistance: index ? 2.9995 : 3.0008, progress: index ? 0.9995 : 0.0008,
      lap: index ? 2 : 3, processedLap: index ? 2 : 3,
      lateralOffsetM: 0, trackLateralOffset: 0, lateralVelocityMps: 0, desiredLateralOffsetM: 0,
      speedKph: index ? 260 : 0, clutchEngagementFraction: 1, turboSpoolFraction: 1,
      incidentTrackState: index ? 'clear' as const : 'on-track-stopped' as const,
      battleDeltaSecondsRemaining: index ? 0 : -100, processedBattleSegment: 9999,
      lapStartedAtSeconds: state.elapsedSeconds - 90,
    }))
    const next = advanceRace({ ...state, cars, raceStartedAtSeconds: state.elapsedSeconds - 100 }, 0.05, config)
    const rear = next.cars.find((car) => car.driverId === cars[1].driverId)!
    expect(rear.totalDistance).toBeLessThan(3)
    expect(rear.processedLap).toBe(2)
    expect(rear.lapHistory).toEqual([])
    expect(rear.lastLapTimeSeconds).toBeNull()
  })

  it('produces the same ten seconds at normal and accelerated playback', () => {
    const start = launched()
    const run = (dt: number) => {
      let state = start
      for (let i = 0; i < Math.round(10 / dt); i++) state = advanceRace(state, dt, config)
      return state
    }
    const normal = run(0.05)
    const fast = run(0.5)
    expect(fast.cars.map((car) => car.driverId)).toEqual(normal.cars.map((car) => car.driverId))
    for (const [index, car] of normal.cars.entries()) {
      expect(fast.cars[index].totalDistance).toBeCloseTo(car.totalDistance, 10)
      expect(fast.cars[index].speedKph).toBe(car.speedKph)
    }
  }, 20_000)

  it('never treats a blue flag as geometric clearance', () => {
    const rear = { driverId: 'rear', totalDistanceM: 100, candidateTotalDistanceM: 110, lateralOffsetM: 0 }
    const front = { driverId: 'front', totalDistanceM: 106, candidateTotalDistanceM: 108,
      lateralOffsetM: 0, concedesRoad: true }
    expect(capRearLongitudinalCandidateM({ rear, front, lapLengthM: 5000 })).toBeLessThan(108)
    expect(capRearLongitudinalCandidateM({ rear: { ...rear, lateralOffsetM: 3 }, front,
      lapLengthM: 5000 })).toBe(110)
  })

  it('brakes before reaching a slower car but allows a separate passing lane', () => {
    const input = { speedKph: 200, aheadSpeedKph: 100, distanceM: 60, lateralSeparationM: 0 }
    expect(followingDemand(input).decelerationMps2).toBeGreaterThan(0)
    expect(followingDemand({ ...input, distanceM: 25 }).decelerationMps2)
      .toBeGreaterThan(followingDemand(input).decelerationMps2)
    expect(followingDemand({ ...input, lateralSeparationM: 3 }))
      .toEqual({ decelerationMps2: 0, throttleScale: 1 })
  })
})
