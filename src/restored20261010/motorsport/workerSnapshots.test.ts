import { expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { createMotorsportRace } from './race'
import { createSnapshotEncoder, restoreSnapshotTelemetry } from './workerSnapshots'
import { recordTelemetry, type TelemetryPoint } from '../simulation/telemetryHistory'
import { speedEnvelope, stationAt } from './coursePhysics'

it('shares plans across identical machines and retains distinct physics and temperature inputs',()=>{
  const config=createMotorsportConfig('super-gt'),machine=config.entries[0].machine
  const conditions={massKg:1200,gripScale:0.95,airTemperatureC:25,airDensityKgM3:1.17}
  const plan=speedEnvelope(config.course,machine,conditions)
  expect(speedEnvelope(config.course,structuredClone(machine),conditions)).toBe(plan)
  // Live density changes along the road; the complete plan resolves the local
  // altitude at each station with the shared actual air temperature.
  expect(speedEnvelope(config.course,machine,{...conditions,airDensityKgM3:stationAt(config.course,config.course.lengthM*0.7).airDensityKgM3})).toBe(plan)
  expect(speedEnvelope(config.course,machine,{...conditions,airTemperatureC:40})).not.toBe(plan)
  const changed={...machine,liftAreaM2:{...machine.liftAreaM2,value:machine.liftAreaM2.value*0.8}}
  const weaker=speedEnvelope(config.course,changed,conditions)
  expect(weaker).not.toBe(plan)
  expect(weaker.some((v,i)=>v<plan[i])).toBe(true)
})

it('sends only new telemetry and reconstructs exact maximum-history state after structured cloning',()=>{
  const config=createMotorsportConfig('wec','wec:3'),initial=createMotorsportRace(config)
  let history:TelemetryPoint[]=[]
  for(let lap=0;lap<3;lap++)for(let bin=0;bin<512;bin++)history=recordTelemetry(history,{lap,progress:bin/512,seconds:lap*90+bin/6,speedKph:180,throttlePercent:75,brakePercent:0,gear:4,rpm:7000,driveSlipPercent:5,lateralG:1.1})
  const state={...initial,cars:initial.cars.map(c=>({...c,telemetryHistory:history}))}
  const encode=createSnapshotEncoder()
  const first=structuredClone(encode(state,0))
  let restored=restoreSnapshotTelemetry(initial,first)
  expect(restored).toEqual(state)
  const next={...state,tick:1,cars:state.cars.map(c=>({...c,telemetryHistory:recordTelemetry(c.telemetryHistory,{...history.at(-1)!,lap:3,progress:0,seconds:270})}))}
  const message=structuredClone(encode(next,0))
  expect(message.telemetryUpdates.every(update=>!update.replace && update.samples?.length===1)).toBe(true)
  restored=restoreSnapshotTelemetry(restored,message)
  expect(restored).toEqual(next)
  const fullBytes=JSON.stringify(next).length,deltaBytes=JSON.stringify(message).length
  expect(deltaBytes).toBeLessThan(fullBytes*0.1)
  expect(encode(next,0).telemetryUpdates).toEqual([])
  const cleared={...next,cars:next.cars.map(({telemetryHistory:_history,...c})=>c)}
  expect(restoreSnapshotTelemetry(restored,structuredClone(encode(cleared,0)))).toEqual(cleared)
  const reset=createSnapshotEncoder()
  expect(restoreSnapshotTelemetry(initial,structuredClone(reset(state,1)))).toEqual(state)
})
