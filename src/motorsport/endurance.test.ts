import { describe, expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace, drivingTimeInWindow } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'

describe('published-distance full-field motorsport acceptance', () => {
  for (const [championship, eventId, count] of [
    ['kyojo', 'kyojo:1:final', 18],
    ['super-gt', 'super-gt:1', 43],
    ['wec', 'wec:1', 35],
    ['wec', 'wec:3', 62],
    ['indycar', 'indycar:1', 25],
    ['indycar', 'indycar:7', 33],
  ] as const) {
    it(`finishes ${eventId} at its published distance with fuel, service and crew state intact`, () => {
      const config = createMotorsportConfig(championship, eventId)
      expect(config.entries).toHaveLength(count)
      let state = createMotorsportRace(config)
      const budget = config.format.kind === 'time' ? config.format.seconds + 1800 : config.format.laps * 600 + 1800
      for (let ticks = 0; state.phase !== 'finished' && ticks < budget * 10; ticks += 1000) state = advanceMotorsportRace(state, 1000, config)
      expect(state.phase).toBe('finished')
      expect(state.cars.every(car => car.status === 'finished')).toBe(true)
      expect(state.cars.every(car => car.fuelKg > 0 && car.bestLapSeconds !== null)).toBe(true)
      expect(state.events.some(event => event.message.includes('CHEQUERED FLAG'))).toBe(true)
      if (eventId === 'indycar:1') {
        for (const car of state.cars) {
          expect(car.tyreSets.filter(set => set.compound === 'primary' && set.completedLaps >= 2).length).toBeGreaterThanOrEqual(1)
          expect(car.tyreSets.filter(set => set.compound === 'alternate' && set.completedLaps >= 2).length).toBeGreaterThanOrEqual(2)
        }
      }
      if (championship === 'wec') {
        expect(state.cars.every(car => car.pits > 0 && car.driverSeconds.every(seconds => seconds > 0))).toBe(true)
        expect(state.cars.every(car => car.virtualEnergyMj === null || car.virtualEnergyMj >= 0)).toBe(true)
      }
      if (eventId === 'wec:3') {
        for (const car of state.cars) for (const stint of car.drivingStints) expect(drivingTimeInWindow(car, stint.driverIndex, stint.end - 21600, stint.end)).toBeLessThanOrEqual(14400.1)
      }
      const restored = parseMotorsportSave(serializeMotorsportSave(config, state))
      expect(restored?.state).toEqual(state)
    }, 1_800_000)
  }
})
