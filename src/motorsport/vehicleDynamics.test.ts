import { describe, expect, it } from 'vitest'
import { createMotorsportConfig, motorsportMachine } from './packages'
import { createMotorsportRace, advanceMotorsportRace } from './race'
import { speedEnvelope, tyreForceBudget, stationAt } from './coursePhysics'
import { drivetrainState, trafficAero, tyreGripScale } from './vehicleDynamics'
import type { MotorsportClass } from './types'

const classes: MotorsportClass[] = ['kyojo','gt500','gt300','hypercar','lmgt3','lmp2','indycar']
describe('category-resolved driving physics', () => {
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s approaches slower traffic without reversing or driving through its rear',category=>{
    const config=createMotorsportConfig(category);config.entries=config.entries.slice(0,2)
    config.course={...config.course,lengthM:4000,points:[[0,0],[1500,0],[1500,500],[0,500]]}
    let state={...createMotorsportRace(config),phase:'racing' as const,flag:'yellow' as const}
    state.cars[0]={...state.cars[0],distanceM:200,speedMps:40,lateralM:0,tyreTemperatureC:90}
    state.cars[1]={...state.cars[1],distanceM:300,speedMps:15,lateralM:0,tyreTemperatureC:90}
    for(let i=0;i<200;i++){
      const old=state
      state=advanceMotorsportRace(state,1,config) as typeof state
      expect(state.cars[0].distanceM).toBeGreaterThanOrEqual(old.cars[0].distanceM)
      expect(state.cars[1].distanceM-state.cars[0].distanceM).toBeGreaterThanOrEqual(5.8)
      expect(state.cars[0].speedMps-old.cars[0].speedMps).toBeGreaterThan(-4)
      expect(Math.abs((state.cars[0].lateralVelocityMps??0)-(old.cars[0].lateralVelocityMps??0))).toBeLessThanOrEqual(0.40001)
    }
  })
  it('brakes towards the pit box before arriving and preserves integrated pit distance',()=>{
    const config=createMotorsportConfig('super-gt');config.entries=config.entries.slice(0,1)
    let state={...createMotorsportRace(config),phase:'racing' as const}
    const box=config.course.pitLengthM.value*.5
    state.cars[0]={...state.cars[0],status:'pit-entry',pitPathM:box-25,speedMps:15,
      pitRequest:{entryId:state.cars[0].entryId,fuelFraction:1,changeTyres:true,nextDriverIndex:null}}
    let slowApproach=false
    for(let i=0;i<200&&state.cars[0].status==='pit-entry';i++){
      const old=state.cars[0];state=advanceMotorsportRace(state,1,config) as typeof state
      const car=state.cars[0]
      expect(car.pitPathM).toBeGreaterThanOrEqual(old.pitPathM)
      expect(car.pitPathM).toBeLessThanOrEqual(box)
      if(car.status==='pit-entry'&&car.speedMps<5)slowApproach=true
    }
    expect(slowApproach).toBe(true)
    expect(state.cars[0].status).toBe('pit-service')
    expect(state.cars[0].speedMps).toBe(0)
  })
  it.each(classes)('%s drives a complete flying lap with progressive pickup and brake release', classId => {
    const category = classId === 'kyojo' ? 'kyojo' : classId === 'indycar' ? 'indycar' : classId === 'gt500' || classId === 'gt300' ? 'super-gt' : 'wec'
    const config = createMotorsportConfig(category, classId === 'lmp2' ? 'wec:3' : undefined)
    config.entries = [config.entries.find(entry => entry.classId === classId)!]
    let state = { ...createMotorsportRace(config), phase: 'racing' as const }
    let partialThrottle = 0, partialBrake = 0, samples = 0
    for (let i = 0; i < 10000 && state.cars[0].distanceM < config.course.lengthM * 2; i++) {
      const before = state.cars[0]
      state = advanceMotorsportRace(state, 1, config) as typeof state
      const car = state.cars[0]
      if (before.distanceM < config.course.lengthM) continue
      expect((car.throttlePercent ?? 0) - (before.throttlePercent ?? 0)).toBeLessThanOrEqual(20.00001)
      expect((before.brakePercent ?? 0) - (car.brakePercent ?? 0)).toBeLessThanOrEqual(26.00001)
      if ((car.throttlePercent ?? 0) > 5 && (car.throttlePercent ?? 0) < 95) partialThrottle++
      if ((car.brakePercent ?? 0) > 3 && (car.brakePercent ?? 0) < 95) partialBrake++
      samples++
    }
    expect(samples).toBeGreaterThan(300)
    expect(partialThrottle).toBeGreaterThan(20)
    expect(partialBrake).toBeGreaterThan(20)
  })
  it.each(classes)('%s reserves a shared tyre budget for steering, traction and braking', classId => {
    const machine=motorsportMachine('test reference',classId)
    const conditions={massKg:machine.massKg.value+machine.driverMassKg.value+30,gripScale:1}
    const straight={x:0,y:0,nx:0,ny:1,radiusM:100000,bankingRadians:0,grade:0,elevationM:0}
    const turn={...straight,radiusM:80}
    const a=tyreForceBudget(machine,straight,25,conditions), b=tyreForceBudget(machine,turn,25,conditions)
    expect(b.longitudinal).toBeLessThan(a.longitudinal)
    expect(b.lateral**2+b.longitudinal**2).toBeCloseTo(b.available**2,3)
    expect(tyreForceBudget(machine,turn,25,{...conditions,gripScale:0.73}).longitudinal).toBeLessThan(b.longitudinal)
  })
  it.each(classes)('%s brakes earlier with less grip and loses corner speed with more fuel', classId => {
    const course=createMotorsportConfig('kyojo').course, machine=motorsportMachine('test reference',classId)
    const mass=machine.massKg.value+machine.driverMassKg.value
    const light=speedEnvelope(course,machine,{massKg:mass+5,gripScale:1})
    const heavy=speedEnvelope(course,machine,{massKg:mass+75,gripScale:1})
    const wet=speedEnvelope(course,machine,{massKg:mass+75,gripScale:0.73})
    expect(heavy.reduce((sum,v,i)=>sum+light[i]-v,0)).toBeGreaterThan(0)
    expect(wet.reduce((sum,v,i)=>sum+heavy[i]-v,0)).toBeGreaterThan(0)
    expect(wet.every(Number.isFinite)).toBe(true)
  })
  it('models cold/hot/worn tyres and the actual fitted wet compound', () => {
    const car=createMotorsportRace(createMotorsportConfig('kyojo')).cars[0]
    car.tyreTemperatureC=90
    const warm=tyreGripScale(car,'dry')
    expect(tyreGripScale({...car,tyreTemperatureC:40},'dry')).toBeLessThan(warm)
    expect(tyreGripScale({...car,tyreTemperatureC:140},'dry')).toBeLessThan(warm)
    expect(tyreGripScale({...car,tyreLife:0.1},'dry')).toBeLessThan(warm)
    expect(tyreGripScale({...car,tyreSets:[{compound:'wet',completedLaps:0}],tyreTemperatureC:70},'wet')).toBeGreaterThan(tyreGripScale(car,'wet'))
  })
  it('gives a tow on straights but removes downforce in the wake, with lateral clearance', () => {
    const wake=trafficAero(20,0,60)
    expect(wake.dragScale).toBeLessThan(1);expect(wake.liftScale).toBeLessThan(1)
    expect(trafficAero(20,4,60)).toEqual({dragScale:1,liftScale:1})
    expect(trafficAero(200,0,60)).toEqual({dragScale:1,liftScale:1})
  })
  it.each(classes)('%s uses fixed gearing, shifts gradually and reports coherent rpm', classId => {
    const machine=motorsportMachine('test reference',classId)
    let state=drivetrainState(machine,15,machine.gears.value)
    for(let i=0;i<10;i++)state=drivetrainState(machine,15,state.gear)
    expect(state.gear).toBeLessThan(machine.gears.value)
    expect(state.rpm).toBeGreaterThan(0)
    const once=drivetrainState(machine,80,1)
    expect(once.gear).toBe(2)
    expect(drivetrainState(machine,15,state.gear)).toEqual(state)
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s integrates target-speed convergence without overshooting or fake brake on coast', category => {
    const config=createMotorsportConfig(category);config.entries=config.entries.slice(0,1)
    const state={...createMotorsportRace(config),phase:'racing' as const}
    const distances=Array.from({length:512},(_,i)=>i*config.course.lengthM/512)
    const distance=distances.find(d=>stationAt(config.course,d).radiusM>50000)!
    state.cars[0]={...state.cars[0],distanceM:distance,speedMps:25,tyreTemperatureC:90}
    const next=advanceMotorsportRace(state,1,config).cars[0]
    expect(next.speedMps).toBeGreaterThan(25)
    expect(next.brakePercent).toBe(0)
    expect(next.throttlePercent).toBeGreaterThan(0)
    expect(advanceMotorsportRace(state,10,config)).toEqual(advanceMotorsportRace(advanceMotorsportRace(state,4,config),6,config))
  })
  it('accelerates progressively from pit service and approaches the pit limit before entry', () => {
    const config=createMotorsportConfig('super-gt');config.entries=config.entries.slice(0,1)
    const state={...createMotorsportRace(config),phase:'racing' as const}
    state.cars[0]={...state.cars[0],status:'pit-exit',pitPathM:config.course.pitLengthM.value*0.5,speedMps:0}
    const exit=advanceMotorsportRace(state,1,config).cars[0]
    expect(exit.speedMps).toBeCloseTo(0.3)
    expect(exit.pitPathM-state.cars[0].pitPathM).toBeCloseTo(0.015)
    const entryDistance=config.course.pitEntry.value*config.course.lengthM-15
    const prepared={...state,cars:[{...state.cars[0],status:'running' as const,pitPathM:0,distanceM:entryDistance,speedMps:40,tyreTemperatureC:90,pitRequest:{entryId:state.cars[0].entryId,fuelFraction:1,changeTyres:true,nextDriverIndex:null}}]}
    const approach=advanceMotorsportRace(prepared,1,config).cars[0]
    expect(approach.speedMps).toBeLessThan(40)
    expect(approach.brakePercent).toBeGreaterThan(0)
  })

})
