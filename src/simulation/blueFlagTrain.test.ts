import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSnapshot, RaceConfig } from '../types'
import { advanceRace, blueFlagTrainApproachesFor, createInitialRace } from './race'
import { decideDriverBehavior } from './driverDecision'

const config: RaceConfig = {
  drivers: initialDrivers, teams: initialTeams, track: tracks[0], seed: 'blue-train',
}
const field = createInitialRace(config).cars
function car(index: number, distance: number, position: number): CarSnapshot {
  return { ...field[index], totalDistance: distance, progress: distance % 1,
    position, status: 'running', pitPhase: 'none', offTrackSinceSeconds: null,
    incidentTrackState: 'clear', lateralOffsetM: 0 }
}

describe('compact lapped train courtesy', () => {
  it('lets the leader physically clear three backmarkers in one continuous run', () => {
    const raceConfig = { ...config, drivers: initialDrivers.slice(0, 4),
      track: { ...tracks.find((track) => track.id === 'monza-approx')!, rainProbability: 0 },
      weekendStage: 'race' as const }
    let state = createInitialRace(raceConfig)
    state = advanceRace(state, state.formationLapDurationSeconds * state.formationLapsPlanned, raceConfig)
    state = advanceRace(state, 8, raceConfig)
    state = advanceRace(state, state.startLightSequenceSeconds!, raceConfig)
    state = { ...state, raceStartedAtSeconds: state.elapsedSeconds - 100,
      cars: state.cars.map((entry, index) => {
        const distance = index === 0 ? 8.9 : 7.908 + (index - 1) * 0.003
        return { ...entry, totalDistance: distance, progress: distance % 1,
          lap: Math.floor(distance), processedLap: Math.floor(distance),
          position: index + 1, speedKph: index === 0 ? 260 : 180,
          lateralOffsetM: 0, trackLateralOffset: 0, lateralVelocityMps: 0,
          desiredLateralOffsetM: 0, clutchEngagementFraction: 1, turboSpoolFraction: 1,
          blueFlag: false, processedBattleSegment: 99999 }
      }) }
    const leaderId = state.cars[0].driverId
    let minimumLeaderSpeed = Infinity
    for (let tick = 0; tick < 300; tick++) {
      const previous = state.cars.find((entry) => entry.driverId === leaderId)!
      state = advanceRace(state, 0.05, raceConfig)
      const leader = state.cars.find((entry) => entry.driverId === leaderId)!
      minimumLeaderSpeed = Math.min(minimumLeaderSpeed, leader.speedKph)
      expect((leader.totalDistance - previous.totalDistance) * raceConfig.track.lengthKm * 1000)
        .toBeLessThan(7)
    }
    const leader = state.cars.find((entry) => entry.driverId === leaderId)!
    expect(minimumLeaderSpeed).toBeGreaterThan(60)
    for (const backmarker of state.cars.filter((entry) => entry.driverId !== leaderId)) {
      expect(leader.totalDistance - backmarker.totalDistance).toBeGreaterThan(1)
    }
  }, 30_000)
  it('prepares every car for the actual lapping car, across the timing line', () => {
    const leader = car(0, 8.99, 1)
    const train = [car(1, 8, 18), car(2, 8.007, 19), car(3, 8.014, 20)]
    const approaches = blueFlagTrainApproachesFor([leader, ...train], 90)
    expect(train.map((entry) => approaches.get(entry.driverId)?.driverId))
      .toEqual(train.map(() => leader.driverId))
    expect(approaches.has(leader.driverId)).toBe(false)
    expect([...blueFlagTrainApproachesFor([...train].reverse().concat(leader), 90).keys()].sort())
      .toEqual([...approaches.keys()].sort())
  })

  it('does not bridge a gap, recruit a rival, or yield to an off-track or pitting car', () => {
    const leader = car(0, 8.99, 2)
    const tail = car(1, 8, 18)
    const detached = car(2, 8.02, 19)
    expect(blueFlagTrainApproachesFor([leader, tail, detached], 90).has(detached.driverId)).toBe(false)
    const rival = car(2, 9.007, 1)
    expect(blueFlagTrainApproachesFor([leader, tail, rival], 90).get(rival.driverId)).toBeUndefined()
    expect(blueFlagTrainApproachesFor([{ ...leader, pitPhase: 'lane' }, tail], 90).size).toBe(0)
    expect(blueFlagTrainApproachesFor([{ ...leader, offTrackSinceSeconds: 10 }, tail], 90).size).toBe(0)
  })

  it('makes a whole train clear the same side with full physical separation', () => {
    for (const side of [-1, 1] as const) {
      for (const [index, driver] of initialDrivers.entries()) {
        const decision = decideDriverBehavior({
          seed: `train-${index}`, driver, lap: 8, trackProgress: 0.1,
          flagState: 'clear', currentLateralOffsetM: 0,
          physicalReferenceLineOffsetM: 0, trackHalfWidthM: 6,
          yield: { active: true, approachingId: 'leader', approachingLateralOffsetM: 0,
            requiredSeparationM: 2.25, preferredSide: side },
          attack: { active: true, intensity: 1, opponentId: 'backmarker', opponentLateralOffsetM: 0 },
        })
        expect(decision.intent).toBe('blue-flag-yield')
        expect(decision.desiredLateralOffsetM * side).toBeGreaterThan(2.25)
      }
    }
  })

  it('keeps controlled-flag and emergency decisions ahead of courtesy', () => {
    const context = { seed: 'train-priority', driver: initialDrivers[0], lap: 8,
      trackProgress: 0.1, currentLateralOffsetM: 0, physicalReferenceLineOffsetM: 0,
      trackHalfWidthM: 6, yield: { active: true, approachingLateralOffsetM: 0, requiredSeparationM: 2.25 } }
    expect(decideDriverBehavior({ ...context, flagState: 'yellow' }).intent).toBe('controlled-flag')
    expect(decideDriverBehavior({ ...context, emergency: { active: true, severity: 1, obstacleLateralOffsetM: 0 } }).intent)
      .toBe('emergency-avoidance')
  })
})
