import { describe, expect, it } from 'vitest'
import { dashboardCourse, dashboardFrame } from './dashboardAdapter'
import { createMotorsportConfig } from './packages'
import { createMotorsportRace } from './race'

describe('existing dashboard category presentation', () => {
  it('keeps class positions and gaps independent of the overall leader', () => {
    const config = createMotorsportConfig('super-gt')
    const state = createMotorsportRace(config)
    const gt500 = config.entries.filter(entry => entry.classId === 'gt500')
    const gt300 = config.entries.filter(entry => entry.classId === 'gt300')
    state.phase = 'racing'
    for (const car of state.cars) car.distanceM = 0
    const fast = state.cars.find(car => car.entryId === gt500[0].id)!
    fast.distanceM = 3000; fast.speedMps = 50
    const leader = state.cars.find(car => car.entryId === gt300[0].id)!
    leader.distanceM = 1000; leader.speedMps = 50
    const next = state.cars.find(car => car.entryId === gt300[1].id)!
    next.distanceM = 900; next.speedMps = 50; next.fuelKg = 23.5
    const frame = dashboardFrame(config,state,dashboardCourse(config))
    const row = frame.timingRows.find(row => row.car.driverId === next.entryId)!
    expect(row.categoryDisplay?.classPosition).toBe(2)
    expect(row.displayGapToLeaderLabel).toBe('+2.0')
    expect(row.displayIntervalLabel).toBe('+2.0')
    expect(row.car.fuelLoadKg).toBe(23.5)
    expect(frame.timingRows.find(row => row.car.driverId === leader.entryId)!.displayGapToLeaderLabel).toBe('LEADER')
    expect(row.sectors).toEqual([null,null,null])
    expect(frame.snapshot.cars).toHaveLength(43)
    leader.finishTime = 100; next.finishTime = 110; next.penaltySeconds = 5
    const finished = dashboardFrame(config,state,dashboardCourse(config))
    expect(finished.timingRows.find(row => row.car.driverId === next.entryId)!.displayGapToLeaderLabel).toBe('+15.0')
  })
  it('maps Le Mans crews and all three classes without changing engine state', () => {
    const config = createMotorsportConfig('wec','wec:3')
    const state = createMotorsportRace(config)
    state.cars[0].driverIndex = 1
    const before = structuredClone(state)
    const frame = dashboardFrame(config,state,dashboardCourse(config))
    expect(frame.timingRows).toHaveLength(62)
    expect(frame.timingRows.find(row => row.car.driverId === config.entries[0].id)?.categoryDisplay?.carNumberLabel).toBe(config.entries[0].number)
    expect(new Set(frame.timingRows.map(row => row.categoryDisplay?.classId))).toEqual(new Set(['hypercar','lmp2','lmgt3']))
    expect(frame.snapshot.cars.find(car => car.driverId === state.cars[0].entryId)?.driverName).toBe(config.entries[0].drivers[1].name)
    expect(state).toEqual(before)
  })
  it('maps director flags to the existing display without mutating the race', () => {
    const config = createMotorsportConfig('indycar')
    const state = createMotorsportRace(config)
    const track = dashboardCourse(config)
    expect(dashboardFrame(config,state,track).snapshot.flag).toBe('clear')
    state.flag = 'fcy'
    expect(dashboardFrame(config,state,track).snapshot.flag).toBe('vsc')
    expect(dashboardFrame(config,state,track).snapshot.flagLabel).toBe('FCY')
    expect(track.id).toBe(config.course.id)
    expect(track.lengthKm).toBe(config.course.lengthM/1000)
    expect(track.centerline).toHaveLength(512)
  })
})
