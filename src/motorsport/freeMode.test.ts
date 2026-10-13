import { describe, expect, it } from 'vitest'
import { driverPool2026 } from '../series/seriesRegistry'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace, motorsportStandings, requestMotorsportPit } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'
import { buildFreeRace, freeCourses, freeDrivers, freeVehicles, matchingQualifying, qualifyingResult, resizeFreeField } from './freeMode'

describe('additional category Free Mode', () => {
  it('exposes all shared people, physical courses and event-only machines without changing source ratings', () => {
    expect(freeDrivers).toHaveLength(driverPool2026.length)
    for (const person of driverPool2026) {
      const driver = freeDrivers.find(driver=>driver.id===person.id)!
      expect(driver.overall).toBe(person.overall)
      expect(driver.racePace).toBe(person.ratings.racePace)
      expect(driver.qualifyingPace).toBe(person.ratings.qualifyingPace)
    }
    expect(freeCourses().some(course=>course.id==='monaco-approx')).toBe(true)
    expect(freeCourses().some(course=>course.id==='le-mans')).toBe(true)
    expect(freeVehicles('wec').some(entry=>entry.classId==='lmp2')).toBe(true)
  })
  it('runs deterministic shuffled grids, class-local equal cars and 100 independent cars', () => {
    const draft = createMotorsportConfig('super-gt')
    const original = structuredClone(draft)
    draft.entries = resizeFreeField(draft.entries,100)
    expect(new Set(draft.entries.map(entry=>entry.id)).size).toBe(100)
    const first = buildFreeRace(draft,'random',true,null)
    expect(first.eventId).toBe(`free:${draft.championship}:${draft.course.id}`)
    expect(buildFreeRace(draft,'random',true,null)).toEqual(first)
    for (const classId of ['gt500','gt300']) {
      const machines = first.entries.filter(entry=>entry.classId===classId).map(entry=>entry.machine)
      expect(machines.every(machine=>JSON.stringify(machine)===JSON.stringify(machines[0]))).toBe(true)
    }
    expect(draft.entries.slice(0,original.entries.length)).toEqual(original.entries)
    expect(()=>resizeFreeField(draft.entries,101)).toThrow()
    draft.entries[1].number = draft.entries[0].number
    draft.entries[1].classId = draft.entries[0].classId
    draft.entries[1].machine = draft.entries[0].machine
    expect(()=>buildFreeRace(draft,'manual',false,null)).toThrow('numbers')
  })
  it('classifies qualifying by actual timed laps, excludes the pit out lap, and rejects stale grids', () => {
    const config = createMotorsportConfig('kyojo')
    config.entries = config.entries.slice(0,2)
    config.sessionKind = 'qualifying'; config.applicationMode = 'free'
    config.format = {kind:'time',seconds:360,basis:'SIM test'}
    let state = createMotorsportRace(config)
    expect(state.phase).toBe('racing')
    expect(state.cars.every(car=>car.status==='pit-exit')).toBe(true)
    state = advanceMotorsportRace(state,6000,config)
    expect(state.phase).toBe('finished')
    expect(state.cars.every(car=>car.bestLapSeconds!==null)).toBe(true)
    expect(state.cars.every(car=>car.lapHistory![0].pit)).toBe(true)
    const standings = motorsportStandings(state,config)
    expect(standings[0].car.bestLapSeconds!).toBeLessThanOrEqual(standings[1].car.bestLapSeconds!)
    const result = qualifyingResult(config,state)!
    expect(matchingQualifying(config,result)).toBe(true)
    expect(buildFreeRace({...config,entries:[...config.entries].reverse()},'qualifying-result',false,result).entries.map(entry=>entry.id)).toEqual(result.entryIds)
    const changed = structuredClone(config); changed.entries[0].drivers=[freeDrivers[0]]
    expect(()=>buildFreeRace(changed,'qualifying-result',false,result)).toThrow('same track')
    const saved = parseMotorsportSave(serializeMotorsportSave(config,state))!
    expect(saved.state.cars[0].lapHistory).toEqual(state.cars[0].lapHistory)
    expect(saved.config.applicationMode).toBe('free')
  })
  it('applies pace instructions to fuel and tyres and allows custom Free Mode crews without changing championship rules', () => {
    const config = createMotorsportConfig('kyojo')
    config.entries = config.entries.slice(0,1)
    config.entries[0].drivers = freeDrivers.slice(0,2)
    const state = createMotorsportRace(config); state.phase='racing'
    const request = {entryId:config.entries[0].id,fuelFraction:1,changeTyres:true,nextDriverIndex:1}
    expect(()=>requestMotorsportPit(state,request,config)).toThrow('KYOJO')
    const free = buildFreeRace(config,'manual',false,null)
    expect(requestMotorsportPit(state,request,free).cars[0].pitRequest).toEqual(request)
    const saving = structuredClone(state); saving.cars[0].paceMode='save'
    const pushing = structuredClone(state); pushing.cars[0].paceMode='push'
    const save = advanceMotorsportRace(saving,600,free).cars[0]
    const push = advanceMotorsportRace(pushing,600,free).cars[0]
    expect(save.fuelKg).toBeGreaterThan(push.fuelKg)
    expect(save.tyreLife).toBeGreaterThan(push.tyreLife)
    expect(save.distanceM).toBeLessThan(push.distanceM)
  })
})
