import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { RaceConfig } from '../types'
import { advanceRace, createInitialRace } from './race'
import { trackDynamicsAt } from './trackDynamics'

describe('live timed-session passing courtesy', () => {
  it.each((['fp2', 'qualifying', 'sprintQualifying'] as const).flatMap(stage =>
    (['in-lap', 'out-lap'] as const).flatMap(phase =>
      [0, -3, 3].map(offset => ({stage, phase, offset})))))(
    '$stage passes a $phase train starting at lateral offset $offset', ({stage, phase, offset}) => {
      const track = { ...tracks.find(track => track.id === 'monza-approx')!, rainProbability: 0 }
      const config: RaceConfig = { drivers: initialDrivers.slice(0, 3), teams: initialTeams, track, seed: 'timed-passing-train', weekendStage: stage, sessionDurationSeconds: 900 }
      let state = createInitialRace(config)
      const progress = Array.from({ length: 800 }, (_, index) => 0.1 + index / 1000).find(progress => {
        const dynamics = trackDynamicsAt(track, progress)
        return dynamics.straightness > 0.9 && dynamics.brakingSeverity < 0.1 && dynamics.referenceSpeedKph > 230
      })!
      const preparingId = config.drivers[0].id
      state = { ...state, elapsedSeconds: 200, cars: state.cars.map((car, index) => {
        const distance = 2 + progress - index * 70 / (track.lengthKm * 1000)
        return { ...car, status: 'running', pitPhase: 'none', pitUntilSeconds: null, hiddenFromTrack: false, offTrackSinceSeconds: null, incidentTrackState: 'clear', totalDistance: distance, progress: distance % 1, processedLap: 2, speedKph: index === 0 ? 160 : 280, gear: 6, lateralOffsetM: offset, lateralVelocityMps: 0, timedRunPhase: index === 0 ? phase : 'attack-lap', timedRunStartedAtSeconds: 190, lapStartedAtSeconds: index === 0 ? null : 190, practiceProgram: null }
      }) }
      let movedAside = false
      let minimumSpeed = Infinity
      for (let tick = 0; tick < 400; tick++) {
        state = advanceRace(state, 0.05, config)
        const preparing = state.cars.find(car => car.driverId === preparingId)!
        movedAside ||= preparing.timedTrafficYield === true && Math.abs(preparing.lateralOffsetM) > 2
        if (preparing.status === 'running') minimumSpeed = Math.min(minimumSpeed, preparing.speedKph)
      }
      const preparing = state.cars.find(car => car.driverId === preparingId)!
      expect(movedAside).toBe(true)
      expect(minimumSpeed).toBeGreaterThan(35)
      for (const flying of state.cars.filter(car => car.driverId !== preparingId)) expect(flying.totalDistance).toBeGreaterThan(preparing.totalDistance)
    }, 30_000,
  )
  it.each(['monaco-approx', 'suzuka-approx', 'hungaroring-approx', 'bahrain-approx'].flatMap(trackId =>
    (['out-lap', 'in-lap'] as const).flatMap(phase => [0, -3, 3].map(offset => ({trackId, phase, offset})))))(
    '$trackId clears a slow $phase car in corners at offset $offset', ({trackId, phase, offset}) => {
      const track = { ...tracks.find(track => track.id === trackId)!, rainProbability: 0 }
      const config: RaceConfig = { drivers: initialDrivers.slice(0, 3), teams: initialTeams, track, seed: 'corner-passing', weekendStage: 'qualifying', sessionDurationSeconds: 900 }
      let state = createInitialRace(config)
      const progress = Array.from({ length: 500 }, (_, index) => 0.15 + index / 1000).find(progress => {
        const dynamics = trackDynamicsAt(track, progress)
        return dynamics.straightness < 0.6 && dynamics.referenceSpeedKph < 175
      })!
      expect(progress).toBeDefined()
      const preparingId = config.drivers[0].id
      state = { ...state, elapsedSeconds: 200, cars: state.cars.map((car, index) => {
        const distance = 2 + progress - index * 35 / (track.lengthKm * 1000)
        return { ...car, status: 'running', pitPhase: 'none', pitUntilSeconds: null, hiddenFromTrack: false, offTrackSinceSeconds: null, incidentTrackState: 'clear', totalDistance: distance, progress: distance % 1, processedLap: 2, speedKph: index === 0 ? 90 : 170, gear: 4, lateralOffsetM: offset, lateralVelocityMps: 0, timedRunPhase: index === 0 ? phase : 'attack-lap', timedRunStartedAtSeconds: 190, lapStartedAtSeconds: index === 0 ? null : 190, practiceProgram: null }
      }) }
      let gaveWayEarly = false
      for (let tick = 0; tick < 400; tick++) {
        state = advanceRace(state, 0.05, config)
        const preparing = state.cars.find(car => car.driverId === preparingId)!
        if (tick < 60 && preparing.timedTrafficYield) gaveWayEarly = true
      }
      expect(gaveWayEarly).toBe(true)
      const preparing = state.cars.find(car => car.driverId === preparingId)!
      for (const flying of state.cars.filter(car => car.driverId !== preparingId)) expect(flying.totalDistance).toBeGreaterThan(preparing.totalDistance)
    }, 30_000,
  )
})
