import { describe, expect, it } from 'vitest'
import { createMotorsportConfig, motorsportChampionships, motorsportEntries, motorsportEvents } from './packages'
import { advanceMotorsportRace, createMotorsportRace, motorsportStandings, requestMotorsportPit, setMotorsportFlag } from './race'
import { coursePosition, speedEnvelope, MOTORSPORT_STEP_SECONDS } from './coursePhysics'
import type { MotorsportRaceState } from './types'

function racing(championship: 'kyojo' | 'super-gt' | 'wec' | 'indycar') {
  const config = createMotorsportConfig(championship)
  const state = advanceMotorsportRace(createMotorsportRace(config), Math.ceil(config.course.lengthM / (80 / 3.6) / MOTORSPORT_STEP_SECONDS), config)
  return { config, state }
}

describe('car and crew motorsport race runtime', () => {
  it('runs every scheduled event with closed course geometry and the correct oval vehicle configuration', () => {
    for (const championship of motorsportChampionships) for (const event of motorsportEvents(championship.id)) {
      const config = createMotorsportConfig(championship.id, event.id)
      expect(config.course.points.length).toBeGreaterThan(30)
      expect(config.entries.length).toBeGreaterThan(0)
      expect(advanceMotorsportRace(createMotorsportRace(config), 10, config).tick).toBe(10)
      if (event.courseId === 'wwtr') expect(config.entries[0].machine.id).toContain('short-oval')
      if (event.courseId === 'indianapolis-500') expect(config.format).toMatchObject({ kind: 'laps', laps: 200 })
    }
  })
  it('fields complete mixed-class grids with independent car IDs and authored driver abilities', () => {
    const gt = motorsportEntries('super-gt')
    expect(gt).toHaveLength(43)
    expect(gt.filter(car => car.classId === 'gt500')).toHaveLength(14)
    expect(new Set(gt.map(car => car.id)).size).toBe(43)
    expect(motorsportEntries('wec')).toHaveLength(35)
    const kyojo = createMotorsportConfig('kyojo', 'kyojo:1:sprint')
    expect(kyojo.entries).toHaveLength(18)
    expect(kyojo.entries.find(car => car.number === '39')?.drivers[0].overall).toBe(77)
    expect(kyojo.entries.every(car => car.machine.hybridPowerKw.value === 0)).toBe(true)
  })
  it('excludes rolling formation, conserves the initial grid and integrates actual force-based travel', () => {
    const { config, state } = racing('kyojo')
    expect(state.phase).toBe('racing')
    expect(state.raceSeconds).toBe(0)
    expect(state.cars.every(car => car.laps === 0 && car.distanceM <= 0)).toBe(true)
    const next = advanceMotorsportRace(state, 10, config)
    expect(next.raceSeconds).toBe(1)
    for (const car of next.cars) {
      const old = state.cars.find(before => before.entryId === car.entryId)!
      expect(car.distanceM - old.distanceM).toBeGreaterThan(10)
      expect(car.distanceM - old.distanceM).toBeLessThan(45)
      expect(car.fuelKg).toBeLessThan(old.fuelKg)
      expect(car.hybridEnergyMj).toBe(0)
    }
    expect(advanceMotorsportRace(state, 10, config)).toEqual(next)
    expect(advanceMotorsportRace(advanceMotorsportRace(state, 4, config), 6, config)).toEqual(next)
    expect(coursePosition(config.course, 100)).toEqual(coursePosition(config.course, 100 + config.course.lengthM))
  })
  it('waits for the leading line crossing after expiry and applies a chequered flag chronologically', () => {
    const base = racing('wec')
    const config = { ...base.config, entries: base.config.entries.slice(0, 2), format: { kind: 'time' as const, seconds: 1, basis: 'test clock' } }
    const state = { ...base.state, raceSeconds: 2, cars: base.state.cars.slice(0, 2).map((car, index) => ({
      ...car, laps: index === 0 ? 1 : 2, distanceM: index === 0 ? config.course.lengthM * 2 - 0.1 : config.course.lengthM * 3 - 1,
      speedMps: 25, lateralM: index === 0 ? 2.5 : -2.5,
    })) }
    const finished = advanceMotorsportRace(state, 1, config)
    expect(finished.winnerId).toBe(state.cars[1].entryId)
    // The backmarker crossed earlier in this tick, before the winner: it
    // must cross again, even when it appears first in the source entry list.
    expect(finished.cars[0].status).toBe('running')
    expect(finished.cars[1].status).toBe('finished')
  })
  it('counts driving time during cautions but excludes pit work and red suspensions', () => {
    const { config, state } = racing('wec')
    const yellow = advanceMotorsportRace(setMotorsportFlag(state, 'fcy'), 10, config)
    expect(yellow.cars[0].driverSeconds[0]).toBeCloseTo(1, 8)
    const red = advanceMotorsportRace(setMotorsportFlag(yellow, 'red'), 20, config)
    expect(red.raceSeconds).toBe(3)
    expect(red.cars[0].driverSeconds).toEqual(yellow.cars[0].driverSeconds)
    expect(red.cars[0].distanceM).toBe(yellow.cars[0].distanceM)
  })
  it('finishes a short mixed-class race and accepts a finish-line crossing in the pit lane', () => {
    const original = createMotorsportConfig('super-gt')
    const config = { ...original, format: { kind: 'laps' as const, laps: 1, basis: 'Short SIM check' } }
    let state = createMotorsportRace(config)
    for (let tick = 0; tick < 20000 && state.phase !== 'finished'; tick += 1000) state = advanceMotorsportRace(state, 1000, config)
    expect(state.phase).toBe('finished')
    expect(state.cars.every(car => car.status === 'finished')).toBe(true)
    const single = { ...config, entries: config.entries.slice(0, 1) }
    let pitting = createMotorsportRace(single)
    pitting = { ...pitting, phase: 'racing', raceSeconds: 100, cars: [{ ...pitting.cars[0], status: 'pit-exit', distanceM: single.course.lengthM - 0.1, pitPathM: 450, speedMps: 60 / 3.6 }] }
    pitting = advanceMotorsportRace(pitting, 1, single)
    expect(pitting.phase).toBe('finished')
    expect(pitting.winnerId).toBe(single.entries[0].id)
  }, 30000)

  it('performs a real pit transit, sequential WEC fuel/tyre work and crew change', () => {
    const base = racing('wec')
    const config = { ...base.config, entries: base.config.entries.slice(0, 1) }
    const original = base.state.cars[0]
    let state: MotorsportRaceState = { ...base.state, cars: [{ ...original, distanceM: config.course.lengthM * config.course.pitEntry.value - 1,
      fuelKg: 10, virtualEnergyMj: 100, speedMps: 30, lateralM: 0 }] }
    state = requestMotorsportPit(state, { entryId: original.entryId, fuelFraction: 1, changeTyres: true, nextDriverIndex: 1 }, config)
    state = advanceMotorsportRace(state, 5, config)
    expect(state.cars[0].status).toBe('pit-entry')
    state = advanceMotorsportRace(state, 2000, config)
    expect(state.cars[0].pits).toBe(1)
    expect(state.cars[0].driverIndex).toBe(1)
    expect(state.cars[0].fuelAddedKg).toBeGreaterThan(40)
    expect(state.events.some(event => event.message.includes('Driver change'))).toBe(true)
    expect(state.cars[0].distanceM).toBeGreaterThan(config.course.lengthM)
    expect(state.cars[0].driverSeconds[0] + state.cars[0].driverSeconds[1]).toBeLessThan(state.raceSeconds - 30)
  })
  it('keeps official/source physics distinct from SIM assumptions and allows >40 cars', () => {
    const { config, state } = racing('super-gt')
    const next = advanceMotorsportRace(state, 50, config)
    expect(next.cars).toHaveLength(43)
    expect(new Set(motorsportStandings(next, config).filter(row => row.classPosition === 1).map(row => row.entry.classId))).toEqual(new Set(['gt500', 'gt300']))
    const car = config.entries[0]
    expect(car.machine.dragAreaM2.basis).toBe('simulation')
    expect(car.machine.massKg.source).toMatch(/http/)
    expect(speedEnvelope(config.course, car.machine).every(speed => Number.isFinite(speed) && speed > 0)).toBe(true)
  })
  it('refuels progressively and resumes identically halfway through servicing', () => {
    const base = racing('wec'), config = { ...base.config, entries: base.config.entries.slice(0, 1) }
    const car = base.state.cars[0]
    let state: MotorsportRaceState = { ...base.state, cars: [{ ...car, fuelKg: 10, virtualEnergyMj: 100,
      status: 'pit-service', pitServiceRemaining: 60,
      pitRequest: { entryId: car.entryId, fuelFraction: 1, changeTyres: true, nextDriverIndex: null },
      stopWork: { fuelSeconds: 40, tyreSeconds: 20, driverSeconds: 0, totalSeconds: 60, fuelAddedKg: 50, energyAddedMj: 800 } }] }
    state = advanceMotorsportRace(state, 20, config)
    expect(state.cars[0].fuelKg).toBeCloseTo(10, 9)
    state = advanceMotorsportRace(state, 190, config)
    expect(state.cars[0].fuelKg).toBeCloseTo(35, 6)
    expect(state.cars[0].virtualEnergyMj).toBeCloseTo(500, 6)
    const restored = JSON.parse(JSON.stringify(state)) as MotorsportRaceState
    expect(advanceMotorsportRace(restored, 100, config)).toEqual(advanceMotorsportRace(state, 100, config))
  })
  it('prepares a slower-class train for the same faster car and prohibits passing under FCY', () => {
    const base = racing('super-gt')
    const entries = [base.config.entries[0], ...base.config.entries.filter(entry => entry.classId === 'gt300').slice(0, 3)]
    const config = { ...base.config, entries }
    const state: MotorsportRaceState = { ...base.state, cars: entries.map((entry, index) => ({
      ...base.state.cars.find(car => car.entryId === entry.id)!, distanceM: 100 + index * 15, speedMps: index ? 25 : 40,
    })) }
    expect(advanceMotorsportRace(state, 1, config).cars.slice(1).every(car => car.blueFlag)).toBe(true)
    const cautioned = advanceMotorsportRace(setMotorsportFlag(state, 'fcy'), 200, config)
    expect(cautioned.cars.every(car => !car.blueFlag)).toBe(true)
    expect(cautioned.cars.map(car => car.distanceM)).toEqual(cautioned.cars.map(car => car.distanceM).toSorted((a, b) => a - b))
  })
})
