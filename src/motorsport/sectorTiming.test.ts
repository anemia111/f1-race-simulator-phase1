import { describe, it, expect } from 'vitest'
import { createMotorsportConfig, motorsportCourses } from './packages'
import { createMotorsportRace, advanceMotorsportRace } from './race'
import { advanceSectorTiming, initialSectorTiming, timingMarks } from './sectorTiming'
import { dashboardCourse, dashboardFrame } from './dashboardAdapter'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'

describe('real crossing sector timing for expansion categories', () => {
  it.each(['kyojo', 'super-gt', 'wec', 'indycar'] as const)('%s updates timing in the engine, dashboard and restored state', championship => {
    const base = createMotorsportConfig(championship), config = { ...base, entries: base.entries.slice(0, 1) }
    let state = { ...createMotorsportRace(config), phase: 'racing' as const }
    const track = dashboardCourse(config)
    expect(dashboardFrame(config, state, track).timingRows[0].microSectors.flat().every(value => value === 'dim')).toBe(true)
    for (let i = 0; i < 300 && !state.cars[0].timing?.lastLap; i++) state = advanceMotorsportRace(state, 10, config) as typeof state
    const lap = state.cars[0].timing!.lastLap!
    expect(lap).not.toBeNull()
    expect(lap.sectors).toHaveLength(track.sectorMarks.length)
    expect(lap.miniSectors.every(time => time > 0)).toBe(true)
    expect(lap.sectors.reduce((sum, time) => sum + time, 0)).toBeCloseTo(lap.miniSectors.reduce((sum, time) => sum + time, 0), 8)
    const row = dashboardFrame(config, state, track).timingRows[0]
    expect(row.microSectors.flat().some(value => value !== 'dim')).toBe(true)
    expect(state.cars[0].timing!.bestSectors.every(time => time !== null)).toBe(true)
    const save = parseMotorsportSave(serializeMotorsportSave(config, state))!
    expect(save).not.toBeNull()
    expect(save.state.cars[0].timing).toEqual(state.cars[0].timing)
    expect(advanceMotorsportRace(save.state, 100, save.config)).toEqual(advanceMotorsportRace(state, 100, config))
  })

  it('interpolates exact elapsed time through every mini-sector and the finish line', () => {
    const config = createMotorsportConfig('wec'), car = createMotorsportRace(config).cars[0]
    const marks = timingMarks(config.course), origin = marks[0]
    car.timing = initialSectorTiming(config.course)
    // A saved car already part-way around must wait for the next control line.
    car.distanceM = (origin + 0.4) * config.course.lengthM
    const before = (origin - 0.1) * config.course.lengthM
    advanceSectorTiming(car, before, 0, 50, config.course, true)
    expect(car.timing.startedAt).toBeCloseTo(10, 8)
    const nextBefore = car.distanceM
    car.distanceM = (origin + 1.1) * config.course.lengthM
    advanceSectorTiming(car, nextBefore, 50, 70, config.course, true)
    expect(car.timing.lastLap!.sectors.reduce((a,b)=>a+b,0)).toBeCloseTo(100, 8)
    expect(car.timing.lastLap!.miniSectors.reduce((a,b)=>a+b,0)).toBeCloseTo(100, 8)
    expect(car.timing.lastLap!.valid).toBe(true)
    expect(car.timing.lap).toBe(2)
  })

  it('supports four sectors and does not invent timing for unverified courses', () => {
    const base = createMotorsportConfig('super-gt')
    const course = motorsportCourses('super-gt').find(course => course.id === 'suzuka')!
    const config = { ...base, course }
    expect(timingMarks(course)).toHaveLength(4)
    expect(dashboardFrame(config, createMotorsportRace(config), dashboardCourse(config)).timingRows[0].sectors).toHaveLength(4)
    const unavailable = { ...course, id: 'unverified-test-course' }
    expect(timingMarks(unavailable)).toEqual([])
    expect(dashboardFrame({ ...config, course: unavailable }, createMotorsportRace({ ...config, course: unavailable }), dashboardCourse({ ...config, course: unavailable })).timingRows[0].sectors).toEqual([])
  })

  it('compares purple sectors within each class and rejects malformed saved timing', () => {
    const base = createMotorsportConfig('super-gt')
    const entries = [base.entries[0], ...base.entries.filter(e => e.classId === 'gt300').slice(0,2)]
    const config = { ...base, entries }, state = createMotorsportRace(config)
    state.cars.forEach((car,i)=>{
      car.timing = initialSectorTiming(config.course)
      car.timing.crossings = car.timing.crossings.map((_, j)=> j < 8 ? (i+1)*(j+1) : null)
    })
    const frame = dashboardFrame(config, state, dashboardCourse(config))
    expect(frame.timingRows[0].sectorStatuses[0]).toBe('overall-best')
    expect(frame.timingRows[1].sectorStatuses[0]).toBe('overall-best')
    expect(frame.timingRows[2].sectorStatuses[0]).toBe('personal-best')
    state.cars[0].timing!.crossings[0] = -1
    expect(parseMotorsportSave(serializeMotorsportSave(config,state))).toBeNull()
  })
  it('does not count a pit or neutralised sector lap as a personal best', () => {
    const config = createMotorsportConfig('wec'), initial = createMotorsportRace(config)
    for (const pit of [true, false]) {
      const car = structuredClone(initial.cars[0]), origin = timingMarks(config.course)[0]
      car.timing = initialSectorTiming(config.course)
      car.timing.startedAt = 0
      if (pit) car.status = 'pit-exit'
      car.distanceM = (origin + 1.01) * config.course.lengthM
      advanceSectorTiming(car, origin * config.course.lengthM, 0, 100, config.course, pit)
      expect(car.timing.lastLap?.valid).toBe(false)
      expect(car.timing.bestSectors.every(value => value === null)).toBe(true)
    }
    const red = advanceMotorsportRace({ ...initial, phase: 'racing', flag: 'red' }, 1, config)
    expect(red.cars.every(car => car.timing?.invalid)).toBe(true)
  })
})
