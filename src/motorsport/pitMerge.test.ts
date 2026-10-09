import { describe, expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace } from './race'

describe('pit exit joining clearance', () => {
  it.each(['super-gt', 'wec', 'indycar'] as const)('%s waits before joining occupied track, then releases when clear', category => {
    const base = createMotorsportConfig(category), config = { ...base, entries: base.entries.slice(0, 2) }
    const initial = { ...createMotorsportRace(config), phase: 'racing' as const }
    const end = config.course.pitLengthM.value, length = config.course.lengthM
    const arc = ((config.course.pitExit.value - config.course.pitEntry.value + 1) % 1) * length
    const merge = config.course.pitExit.value * length
    initial.cars[0] = { ...initial.cars[0], status: 'pit-exit', pitPathM: end - 0.5, distanceM: merge - 0.5 / end * arc, speedMps: config.course.pitSpeedKph.value / 3.6 }
    initial.cars[1] = { ...initial.cars[1], distanceM: merge, speedMps: 0 }
    const blocked = advanceMotorsportRace(initial, 1, config)
    expect(blocked.cars[0].status).toBe('pit-exit')
    expect(blocked.cars[0].pitPathM).toBeLessThan(end)
    expect(blocked.flag).toBe('green')
    const clear = { ...blocked, cars: [blocked.cars[0], { ...blocked.cars[1], distanceM: merge + 100 }] }
    const released = advanceMotorsportRace(clear, 30, config)
    expect(released.cars[0].status).toBe('running')
    expect(initial.cars[0].pitPathM).toBe(end - 0.5)
  })

  it('anticipates a fast approaching car across the lap boundary', () => {
    const base = createMotorsportConfig('wec'), config = { ...base, entries: base.entries.slice(0, 2), course: { ...base.course, pitExit: { ...base.course.pitExit, value: 0.001 } } }
    const state = { ...createMotorsportRace(config), phase: 'racing' as const }, end = config.course.pitLengthM.value
    const merge = config.course.lengthM * 1.001
    state.cars[0] = { ...state.cars[0], status: 'pit-exit', pitPathM: end - 0.5, distanceM: merge - 1, speedMps: 20 }
    state.cars[1] = { ...state.cars[1], distanceM: merge - 30, speedMps: 60 }
    expect(advanceMotorsportRace(state, 1, config).cars[0].status).toBe('pit-exit')
  })

  it('excludes a pit lap from race best times after the car has rejoined', () => {
    const base = createMotorsportConfig('wec'), config = { ...base, entries: base.entries.slice(0, 1) }
    const state = { ...createMotorsportRace(config), phase: 'racing' as const, raceSeconds: 100 }
    state.cars[0] = { ...state.cars[0], laps: 1, distanceM: config.course.lengthM * 2 - 0.1, speedMps: 30, lapInvalid: true, bestLapSeconds: 110 }
    const crossing = advanceMotorsportRace(state, 1, config).cars[0]
    expect(crossing.laps).toBe(2)
    expect(crossing.lastLapSeconds).toBeLessThan(110)
    expect(crossing.bestLapSeconds).toBe(110)
    expect(crossing.lapHistory?.at(-1)?.pit).toBe(true)
    expect(crossing.lapInvalid).toBe(false)
  })
})
