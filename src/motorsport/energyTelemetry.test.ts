import { describe, expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace } from './race'
import { targetSpeedMps, stationAt } from './coursePhysics'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'

describe('category energy and telemetry',()=>{
  it('debits and recovers actual hybrid energy without exceeding capacity or power',()=>{
    for(const category of ['wec','indycar'] as const){
      const config=createMotorsportConfig(category)
      const entry=config.entries.find(entry=>entry.machine.hybridPowerKw.value>0)!
      config.entries=[entry]
      const distances=Array.from({length:512},(_,index)=>index/512*config.course.lengthM)
      const straight=distances.filter(distance=>stationAt(config.course,distance).radiusM>10000).sort((a,b)=>targetSpeedMps(config.course,entry.machine,b)-targetSpeedMps(config.course,entry.machine,a))[0]
      const state={...createMotorsportRace(config),phase:'racing' as const}
      state.cars[0]={...state.cars[0],distanceM:straight,speedMps:55,hybridEnergyMj:entry.machine.hybridCapacityMj.value*0.5}
      const running=advanceMotorsportRace(state,1,config)
      const car=running.cars[0]
      expect(car.hybridPowerKw).toBeGreaterThan(0)
      expect(car.hybridPowerKw).toBeLessThanOrEqual(entry.machine.hybridPowerKw.value)
      expect(car.hybridEnergyMj).toBeCloseTo(state.cars[0].hybridEnergyMj+(car.hybridRecoveredMj??0)-car.hybridDeployedMj,10)
      expect(car.telemetryHistory?.length).toBeGreaterThan(0)
      state.cars[0]={...state.cars[0],speedMps:150}
      const braking=advanceMotorsportRace(state,1,config).cars[0]
      expect(braking.regenerationPowerKw).toBeGreaterThan(0)
      expect(braking.hybridEnergyMj).toBeLessThanOrEqual(entry.machine.hybridCapacityMj.value)
      expect(braking.brakePercent).toBeGreaterThan(0)
      expect(parseMotorsportSave(serializeMotorsportSave(config,running))?.state.cars[0].telemetryHistory).toEqual(car.telemetryHistory)
    }
  })
  it('never gives a non-hybrid car electrical recovery or deployment',()=>{
    const config=createMotorsportConfig('kyojo');config.entries=config.entries.slice(0,1)
    const state={...createMotorsportRace(config),phase:'racing' as const}
    state.cars[0].speedMps=100
    const car=advanceMotorsportRace(state,1,config).cars[0]
    expect(car.hybridEnergyMj).toBe(0)
    expect(car.hybridPowerKw).toBe(0)
    expect(car.regenerationPowerKw).toBe(0)
  })
  it('keeps equal-position pit-exit cars in a single queue',()=>{
    const config=createMotorsportConfig('super-gt');config.entries=config.entries.slice(0,2)
    const state={...createMotorsportRace(config),phase:'racing' as const}
    state.cars=state.cars.map(car=>({...car,status:'pit-exit',pitPathM:config.course.pitLengthM.value-1}))
    const next=advanceMotorsportRace(state,1,config)
    expect(next.cars.filter(car=>car.status==='running')).toHaveLength(1)
    expect(next.cars.filter(car=>car.status==='pit-exit')).toHaveLength(1)
  })
})
