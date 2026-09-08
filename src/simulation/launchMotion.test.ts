import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { RaceConfig, RaceSnapshot } from '../types'
import { advanceRace, createInitialRace } from './race'

const launchConfig: RaceConfig = {
  drivers: initialDrivers,
  teams: initialTeams,
  track: { ...tracks[0], rainProbability: 0 },
  seed: 'simultaneous-grid-launch',
  weekendStage: 'race',
}

function lightsOut(config: RaceConfig): RaceSnapshot {
  let state = createInitialRace(config)
  state = advanceRace(
    state,
    state.formationLapDurationSeconds * state.formationLapsPlanned,
    config,
  )
  state = advanceRace(state, 8, config)
  return advanceRace(state, state.startLightSequenceSeconds ?? 5, config)
}

describe('continuous race launch motion', () => {
  it.each([false, true])('protects a red-flag standing launch after a safety-car start: %s', (formationBehindSafetyCar) => {
    const released = lightsOut(launchConfig)
    const restartAt = released.elapsedSeconds + 100
    let state: RaceSnapshot = {
      ...released,
      elapsedSeconds: restartAt - 0.05,
      formationBehindSafetyCar,
      restartProcedure: 'standing',
      restartProcedureUntilSeconds: restartAt,
    }

    for (let tick = 0; tick < 60; tick += 1) {
      state = advanceRace(state, 0.05, launchConfig)
      expect(state.lastStandingRestartAtSeconds).toBeCloseTo(restartAt, 8)
      expect(state.raceStartedAtSeconds).toBe(released.raceStartedAtSeconds)
      expect(state.restartProcedure).toBe('none')
      expect(state.cars.every((car) => car.battleDeltaSecondsRemaining === 0)).toBe(true)
    }
    expect(Math.min(...state.cars.map((car) => car.speedKph))).toBeGreaterThan(90)
  })

  it('does not reset the standing launch timestamp for a rolling resumption', () => {
    const released = lightsOut(launchConfig)
    const restartAt = released.elapsedSeconds + 100
    const state = advanceRace({
      ...released,
      elapsedSeconds: restartAt - 0.05,
      restartProcedure: 'rolling',
      restartProcedureUntilSeconds: restartAt,
      lastStandingRestartAtSeconds: 10,
    }, 0.05, launchConfig)
    expect(state.restartProcedure).toBe('none')
    expect(state.lastStandingRestartAtSeconds).toBe(10)
    expect(state.raceStartedAtSeconds).toBe(released.raceStartedAtSeconds)
  })

  it('keeps the healthy field rolling through the first ten seconds at the worker tick', () => {
    let state = lightsOut(launchConfig)
    const speedDrops: Array<{ car: string; seconds: number; dropKph: number }> = []
    let minimumSpeedAtThreeSeconds = Number.POSITIVE_INFINITY
    let minimumSpeedAfterFourSeconds = Number.POSITIVE_INFINITY

    expect(state.cars.every((car) => car.speedKph === 0)).toBe(true)
    for (let tick = 1; tick <= 200; tick += 1) {
      const previous = new Map(state.cars.map((car) => [car.driverId, car]))
      state = advanceRace(state, 0.05, launchConfig)

      for (const car of state.cars) {
        const before = previous.get(car.driverId)!
        expect(car.totalDistance).toBeGreaterThanOrEqual(before.totalDistance)
        expect(car.incidentTrackState).toBe('clear')
        if (tick <= 20) {
          // A grid slot crossing the timing line cannot trigger a defended
          // move while the field is still launching from rest.
          expect(car.battleDeltaSecondsRemaining).toBe(0)
        }
        if (tick === 60) {
          minimumSpeedAtThreeSeconds = Math.min(
            minimumSpeedAtThreeSeconds,
            car.speedKph,
          )
        }
        if (tick >= 80) {
          minimumSpeedAfterFourSeconds = Math.min(
            minimumSpeedAfterFourSeconds,
            car.speedKph,
          )
        }
        if (before.speedKph - car.speedKph > 35) {
          speedDrops.push({
            car: car.code,
            seconds: tick * 0.05,
            dropKph: before.speedKph - car.speedKph,
          })
        }
      }
    }

    // These are broad physical guards, not calibrated lap-pace targets: normal
    // opening-corner braking must never park a healthy 190 km/h car in 50 ms.
    expect(minimumSpeedAtThreeSeconds).toBeGreaterThan(90)
    expect(speedDrops).toEqual([])
    expect(minimumSpeedAfterFourSeconds).toBeGreaterThan(80)
  }, 20_000)

  it('applies ordinary battle loss without a tick-dependent exponential speed collapse', () => {
    const released = lightsOut(launchConfig)
    const target = released.cars[0]
    const fixture: RaceSnapshot = {
      ...released,
      raceStartedAtSeconds: released.elapsedSeconds - 20,
      cars: [
        {
          ...target,
          battleDeltaSecondsRemaining: -1.2,
          clutchEngagementFraction: 1,
          gear: 5,
          lap: 2,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          processedBattleSegment: Number.MAX_SAFE_INTEGER,
          processedLap: 2,
          progress: 0,
          speedKph: 200,
          totalDistance: 2,
          turboSpoolFraction: 1,
        },
      ],
    }
    const runOneSecond = (stepSeconds: number) => {
      let state = fixture
      let largestDropKph = 0
      for (let tick = 0; tick < Math.round(1 / stepSeconds); tick += 1) {
        const beforeSpeedKph = state.cars[0].speedKph
        state = advanceRace(state, stepSeconds, launchConfig)
        largestDropKph = Math.max(
          largestDropKph,
          beforeSpeedKph - state.cars[0].speedKph,
        )
      }
      return { car: state.cars[0], largestDropKph }
    }
    const workerTick = runOneSecond(0.05)
    const coarseTick = runOneSecond(0.1)

    for (const result of [workerTick, coarseTick]) {
      expect(result.car.incidentTrackState).toBe('clear')
      expect(result.car.speedKph).toBeGreaterThan(150)
      expect(result.largestDropKph).toBeLessThan(15)
      expect(result.car.battleDeltaSecondsRemaining).toBeCloseTo(-1.08, 8)
    }
    expect(
      Math.abs(workerTick.car.speedKph - coarseTick.car.speedKph),
    ).toBeLessThan(3)
    expect(
      Math.abs(workerTick.car.totalDistance - coarseTick.car.totalDistance) *
        launchConfig.track.lengthKm * 1000,
    ).toBeLessThan(2)
  })
})
