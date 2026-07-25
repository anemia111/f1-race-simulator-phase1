import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { createInitialRace } from './race'
import { advanceRetiredCarMotion } from './retirementMotion'

const retiredCar = (reason: string): CarSnapshot => ({
  ...createInitialRace({
    drivers: initialDrivers,
    seed: `retirement-motion:${reason}`,
    teams: initialTeams,
    track: tracks[0],
  }).cars[0],
  retiredAtSeconds: 100,
  retiredReason: reason,
  speedKph: 320,
  status: 'retired' as const,
  throttlePercent: 100,
})

describe('retired car motion', () => {
  it('decelerates an impact retirement before stopping instead of freezing telemetry', () => {
    const initial = retiredCar('terminal-crash')
    let car: CarSnapshot = initial

    for (let step = 1; step <= 60; step += 1) {
      car = advanceRetiredCarMotion(car, {
        deltaSeconds: 0.05,
        elapsedSeconds: 100 + step * 0.05,
        trackLengthKm: tracks[0].lengthKm,
      })
    }

    expect(car.speedKph).toBe(0)
    expect(car.throttlePercent).toBe(0)
    expect(car.rpm).toBe(0)
    expect(car.energyStore.actualDeploymentPowerKw).toBe(0)
    expect(car.totalDistance).toBeGreaterThan(initial.totalDistance)
    expect(car.totalDistance - initial.totalDistance).toBeLessThan(0.025)
  })

  it('lets a mechanical retirement coast farther than an impact retirement', () => {
    const impact = advanceRetiredCarMotion(retiredCar('contact'), {
      deltaSeconds: 0.5,
      elapsedSeconds: 100.5,
      trackLengthKm: tracks[0].lengthKm,
    })
    const mechanical = advanceRetiredCarMotion(retiredCar('power unit failure'), {
      deltaSeconds: 0.5,
      elapsedSeconds: 100.5,
      trackLengthKm: tracks[0].lengthKm,
    })

    expect(mechanical.speedKph).toBeGreaterThan(impact.speedKph)
    expect(mechanical.brakePercent).toBeLessThan(impact.brakePercent)
  })
})
