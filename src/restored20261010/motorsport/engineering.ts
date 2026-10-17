import type {CarSetup} from '../types'
import {defaultCarSetup,normalizeCarSetup} from '../simulation/engineering'
import {drivingSignature,signaturePedalControl} from '../simulation/drivingSignature'
import {behaviorDriverFor} from './driverBehavior'
import {pitWork,motorsportStandings,requestForStrategy} from './race'
import type {MotorsportDriver,MotorsportMachine,MotorsportRaceConfig,MotorsportRaceState} from './types'
import type {EngineerSession} from '../domain/raceEngineer'
const machines=new WeakMap<MotorsportMachine,WeakMap<MotorsportDriver,MotorsportMachine>>()
export function engineeringMachine(machine:MotorsportMachine,driver:MotorsportDriver) {
  if(!driver.setup||machine.classId==='kyojo')return machine
  let byDriver=machines.get(machine);if(!byDriver){byDriver=new WeakMap();machines.set(machine,byDriver)}
  const old=byDriver.get(driver);if(old)return old
  const wing=normalizeCarSetup(driver.setup).rearWing-defaultCarSetup.rearWing
  const adjusted={...machine,dragAreaM2:{basis:'simulation' as const,source:'SIM setup adjustment of base drag area',value:machine.dragAreaM2.value*(1+wing*0.02)},liftAreaM2:{basis:'simulation' as const,source:'SIM setup adjustment of base lift area',value:machine.liftAreaM2.value*(1+wing*0.025)}}
  byDriver.set(driver,adjusted);return adjusted
}
/** Neutral aero fields: extra-category wing coefficients are already in machine. */
export function extraControlSetup(setup:CarSetup|undefined):CarSetup|undefined {
  return setup?{...normalizeCarSetup(setup),frontWing:5.5,rearWing:5.5,rideHeightMm:28,coolingPercent:50}:undefined
}
export const extraSignature=(driver:MotorsportDriver,lateralUse:number,life:number)=>signaturePedalControl(drivingSignature(behaviorDriverFor(driver)),lateralUse,life)
export function motorsportEngineerSession(config:MotorsportRaceConfig,state:MotorsportRaceState):EngineerSession {
  const standings=motorsportStandings(state,config),leader=standings[0]?.car
  const measured=leader?.lastLapSeconds??config.course.lengthM/55
  return {key:`${config.seed}:${config.eventId}:${config.sessionKind}`,seconds:state.raceSeconds,lengthM:config.course.lengthM,remainingLaps:config.format.kind==='laps'?Math.max(0,config.format.laps-(leader?.laps??0)):Math.max(0,(config.format.seconds-state.raceSeconds)/measured),practice:config.sessionKind==='practice',race:!config.sessionKind||config.sessionKind==='race',flag:state.flag,weather:config.weather,grip:config.weather==='wet'?0.75:1,decisionNotes:state.cars.filter(c=>c.strategyReason).slice(0,8).map(c=>`${config.entries.find(e=>e.id===c.entryId)?.team??c.entryId}: ${c.strategyReason}`),
    cars:standings.map(({entry,car,classPosition})=>{
      const person=entry.drivers[car.driverIndex],required=requestForStrategy(config,entry,car),work=pitWork(config,car,entry,required??{entryId:entry.id,fuelFraction:config.championship==='kyojo'?0:1,changeTyres:true,nextDriverIndex:null})
      const transit=config.course.pitLengthM.value/(config.course.pitSpeedKph.value/3.6)-config.course.pitLengthM.value/(measured>0?config.course.lengthM/measured:50)
      return {id:entry.id,name:`#${entry.number} ${person.name}`,color:entry.color,team:entry.team,classId:entry.classId,driver:behaviorDriverFor(person),distance:car.distanceM/config.course.lengthM,position:classPosition,running:['running','pit-entry','pit-service','pit-exit'].includes(car.status),inPit:car.status.startsWith('pit-'),pitStops:car.pits,eligiblePracticeLaps:(car.lapHistory??[]).filter(l=>!l.pit&&l.driverIndex===car.driverIndex).slice(-8).map(l=>l.lap-1),lapTimes:(car.lapHistory??[]).filter(l=>!l.pit).slice(-4).map(l=>l.seconds),bestLap:car.bestLapSeconds,lastLap:car.lastLapSeconds,samples:car.telemetryHistory??[],tyreLife:car.tyreLife,fuelLaps:car.fuelKg/Math.max(0.001,entry.machine.fuelKgPerKm.value*config.course.lengthM/1000),pitLoss:Math.max(2,transit)+work.total,pitAllowed:state.flag!=='red'&&(config.championship!=='kyojo'||config.applicationMode==='free'),setup:person.setup??defaultCarSetup,setupLocked:config.sessionKind!=='practice',setupKeys:(entry.classId==='kyojo'?['brakeBiasPercent','differentialPercent']:['rearWing','brakeBiasPercent','differentialPercent']) as (keyof CarSetup)[],plan:car.engineeringPlan,
        ...(required?{mandatoryReason:'燃料・エネルギー・タイヤ・交代条件による停止が必要'}:{})}
    })}
}
