import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSnapshot, RaceConfig, RaceSnapshot } from '../types'
import { advanceRace, createInitialRace } from './race'

const scenarios = [
  ['street', 'monaco-approx'],
  ['high-speed', 'monza-approx'],
  ['weather-risk', 'singapore-approx'],
] as const

function runScenario(label: string, trackId: string): RaceSnapshot {
  const track = tracks.find((candidate) => candidate.id === trackId)

  if (!track) {
    throw new Error(`Missing stability-test track: ${trackId}`)
  }

  const config: RaceConfig = {
    drivers: initialDrivers,
    seed: `stability:${label}`,
    teams: initialTeams,
    track,
  }
  let snapshot = createInitialRace(config)

  for (let step = 0; step < 5_000 && snapshot.sessionStatus !== 'finished'; step += 1) {
    snapshot = advanceRace(snapshot, 3, config)
  }

  return snapshot
}

function finiteCarState(car: CarSnapshot) {
  return [
    car.totalDistance,
    car.progress,
    car.speedKph,
    car.fuelLoadKg,
    car.ersBatteryPercent,
    car.tireAgeLaps,
    car.tireWearPercent,
    car.tireTemperatureC,
    car.brakeTemperatureC,
    car.gapToLeader,
    car.gapToAhead,
  ].every(Number.isFinite)
}

describe('multi-circuit race stability', () => {
  it(
    'finishes representative seeded races with bounded, ordered car state',
    () => {
      for (const [label, trackId] of scenarios) {
        const snapshot = runScenario(label, trackId)

        expect(snapshot.sessionStatus, label).toBe('finished')
        expect(snapshot.cars, label).toHaveLength(30)
        expect(snapshot.cars.map((car) => car.position), label).toEqual(
          Array.from({ length: 30 }, (_, index) => index + 1),
        )

        for (const car of snapshot.cars) {
          expect(finiteCarState(car), `${label}:${car.code}`).toBe(true)
          expect(car.progress, `${label}:${car.code}:progress`).toBeGreaterThanOrEqual(0)
          expect(car.progress, `${label}:${car.code}:progress`).toBeLessThanOrEqual(1)
          expect(car.ersBatteryPercent, `${label}:${car.code}:battery`).toBeGreaterThanOrEqual(0)
          expect(car.ersBatteryPercent, `${label}:${car.code}:battery`).toBeLessThanOrEqual(100)
          expect(car.tireWearPercent, `${label}:${car.code}:wear`).toBeGreaterThanOrEqual(0)
          expect(car.tireWearPercent, `${label}:${car.code}:wear`).toBeLessThanOrEqual(100)
          expect(car.fuelLoadKg, `${label}:${car.code}:fuel`).toBeGreaterThanOrEqual(0)
        }
      }
    },
    120_000,
  )
})
