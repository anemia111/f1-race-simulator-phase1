import { describe, it, expect } from 'vitest'
import { createMotorsportConfig, motorsportCourses } from './packages'
import { createMotorsportRace, advanceMotorsportRace, setMotorsportFlag } from './race'
import type { MotorsportRaceState } from './types'

function queued(championship: 'super-gt' | 'wec') {
 const base=createMotorsportConfig(championship)
 const fastClass=championship==='wec'?'hypercar':'gt500'
 const slowClass=championship==='wec'?'lmgt3':'gt300'
 const entries=[base.entries.find(e=>e.classId===fastClass)!,...base.entries.filter(e=>e.classId===slowClass).slice(0,3)]
 const config={...base,entries,course:{...base.course,lengthM:4000,points:[[0,0],[1500,0],[1500,500],[0,500]] as [number,number][]}}
 const initial=createMotorsportRace(config)
 const state={...initial,phase:'racing' as const,cars:initial.cars.map((car,i)=>({...car,distanceM:200+i*9,speedMps:30,lateralM:0}))}
 return {config,state}
}
describe('traffic after matching the speed of a slower class',()=>{
 it.each(['super-gt','wec'] as const)('%s clears slower traffic on every real scheduled course',championship=>{
   for(const course of motorsportCourses(championship)) {
     const base=queued(championship),config={...base.config,course}
     let state: MotorsportRaceState={...base.state,cars:base.state.cars.map(car=>({...car,tyreTemperatureC:90}))}
     let passed=false
     for(let i=0;i<180 && !passed;i++){
       state=advanceMotorsportRace(state,10,config)
       passed=state.cars[0].distanceM>Math.max(...state.cars.slice(1).map(car=>car.distanceM))
     }
     expect(passed,course.id).toBe(true)
   }
 })
 it.each(['super-gt','wec'] as const)('%s escapes a slow train even when the current speed difference is zero',championship=>{
 const {config,state}=queued(championship)
 const next=advanceMotorsportRace(state,1,config)
 expect(next.cars[0].lateralM).toBeLessThan(0)
 const passed=advanceMotorsportRace(state,600,config)
 expect(passed.cars[0].distanceM).toBeGreaterThan(Math.max(...passed.cars.slice(1).map(c=>c.distanceM)))
 })
 it.each(['yellow','fcy','sc'] as const)('does not solve a train by overtaking under %s',flag=>{
 const {config,state}=queued('wec')
 const next=advanceMotorsportRace(setMotorsportFlag(state,flag),200,config)
 expect(next.cars.map(c=>c.distanceM)).toEqual(next.cars.map(c=>c.distanceM).toSorted((a,b)=>a-b))
 })
 it('does not launch a passing attempt just because identical cars are accelerating together',()=>{
 const base=queued('super-gt')
 const config={...base.config,entries:base.config.entries.map(entry=>({...entry,classId:base.config.entries[0].classId,machine:base.config.entries[0].machine}))}
 const state={...base.state,cars:base.state.cars.map(car=>({...car,fuelKg:base.state.cars[0].fuelKg}))}
 const next=advanceMotorsportRace(state,1,config)
 expect(next.cars.every(car=>car.driverIntent!=='attack' && car.battle===undefined)).toBe(true)
 expect(next.cars.map(car=>car.entryId)).toEqual(state.cars.map(car=>car.entryId))
 })
})
