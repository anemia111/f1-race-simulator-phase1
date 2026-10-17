import { expect,it } from 'vitest'
import { cornerTelemetry,selectTelemetryLap,telemetryCsv,telemetryDelta,telemetryMap,telemetrySummary,telemetryValue } from './telemetryAnalysis'
import { decodeTelemetryHistory,encodeTelemetryHistory,handlingTelemetry,recordTelemetry,type TelemetryPoint } from '../simulation/telemetryHistory'
import { initialVehicleHandling } from '../simulation/vehicleHandling'
const point=(progress:number,seconds=progress*100,lap=0):TelemetryPoint=>({lap,progress,seconds,speedKph:200,throttlePercent:100,brakePercent:0,gear:4,rpm:8000})
const lap=(index:number,time=100)=>Array.from({length:101},(_,i)=>point(i*0.0099,i*0.0099*time+index*120,index))

it('chooses separately observed full laps, preserves partial history and explicit selections',()=>{
  const samples=[...lap(0).slice(50),...lap(1),...lap(2).slice(0,10)]
  expect(selectTelemetryLap(samples,'latest')[0].lap).toBe(1)
  expect(selectTelemetryLap(samples,'current')[0].lap).toBe(2)
  expect(selectTelemetryLap(samples,'0')[0].progress).toBeGreaterThan(0.4)
  expect(selectTelemetryLap(samples,'99')).toEqual([])
})
it('aligns actual clocks at common distance and leaves unobserved intervals blank',()=>{
  const a=lap(0,100),b=lap(1,102)
  const delta=telemetryDelta(a,b)
  expect(delta.points.at(-1)?.value).toBeCloseTo(-1.98)
  const missing=b.filter(p=>p.progress<0.4||p.progress>0.6)
  expect(telemetryValue(missing,0.5,'seconds')).toBeUndefined()
  expect(telemetryDelta(a,missing).points.find(p=>p.progress>0.49&&p.progress<0.51)?.value).toBeUndefined()
  expect(telemetryValue(a,-0.01,'speedKph')).toBeUndefined()
  expect(telemetryDelta(a.slice(50),b).origin).toBeCloseTo(0.495)
  expect(telemetryDelta([],b).points).toEqual([])
})
it('weights pedal summaries by observed distance and never treats missing distance as coast',()=>{
  const samples=[point(0),{...point(0.01),throttlePercent:0,brakePercent:50},point(0.03),point(0.8)]
  const summary=telemetrySummary(samples)
  expect(summary.observed).toBeCloseTo(0.03)
  expect(summary.fullPercent).toBeCloseTo(100/3)
  expect(summary.brakePercent).toBeCloseTo(200/3)
  expect(summary.coastPercent).toBe(0)
})
it('reports sampled corner positions, exports raw missing values and safe quoted CSV names',()=>{
  const samples=[{...point(0.48),brakePercent:20},{...point(0.5),speedKph:100,throttlePercent:20},point(0.52)]
  expect(cornerTelemetry(samples,0.5)).toEqual({entry:200,minimum:100,exit:200,brakeAt:0.48,pickupAt:0.52})
  const csv=telemetryCsv([{name:'=Test,"Driver"',samples}],5000)
  expect(csv).toContain('"\'=Test,""Driver"""')
  expect(csv).toContain('2400.00')
  expect(csv).toContain('tyreFLTemperatureC')
  expect(csv).not.toContain('undefined')
})
it('projects the circuit using arc distance rather than point index',()=>{
  const map=telemetryMap([[0,0,0],[10,0,0],[10,0,30]])
  expect(map[1].progress).toBe(0.25)
  expect(map[2].progress).toBe(1)
  expect(telemetryMap([[0,0,0],[0,0,0]])).toEqual([])
})
it('roundtrips all new channels at recording precision and still accepts t1/t2 saves',()=>{
  const handling=initialVehicleHandling()
  handling.longitudinalAcceleration=-24.567
  handling.wheels[0].surfaceC=93.765
  const history=recordTelemetry(undefined,{...point(0),...handlingTelemetry(handling),fuelKg:56.789,energyPercent:50.123,deploymentKw:349.876,recoveryKw:0,tyreLifePercent:90.5})
  const encoded=encodeTelemetryHistory(history)
  expect(encoded.startsWith('t3:')).toBe(true)
  expect(decodeTelemetryHistory(encoded)).toEqual(history)
  expect(history[0].tyreFLTemperatureC).toBe(93.77)
  expect(decodeTelemetryHistory(encodeTelemetryHistory([point(0)]))).toEqual([point(0)])
  const old={...point(0),lateralG:2.5,driveSlipPercent:6}
  expect(encodeTelemetryHistory([old]).startsWith('t2:')).toBe(true)
  expect(decodeTelemetryHistory(encodeTelemetryHistory([old]))).toEqual([old])
  expect(decodeTelemetryHistory(encoded.replace(/^t3:/,'t2:'))).toBeNull()
})
it('compresses maximum extended history without losing channels and bounds imported expansion',()=>{
  const history:TelemetryPoint[]=[]
  for(let i=0;i<1536;i++)history.push({ ...point(Number(((i%512)/512).toFixed(6)),Number((i*0.1).toFixed(2)),Math.floor(i/512)),...handlingTelemetry(initialVehicleHandling()),fuelKg:Number((80-i*0.01).toFixed(2)),energyPercent:75,tyreLifePercent:90,deploymentKw:300,recoveryKw:0 })
  const packed=encodeTelemetryHistory(history)
  expect(packed.startsWith('t3z:')).toBe(true)
  expect(decodeTelemetryHistory(packed)).toEqual(history)
  // A 62-car full history should leave room for the rest of a typical save.
  expect(packed.length*62).toBeLessThan(2_000_000)
  expect(decodeTelemetryHistory(packed.replace(/^t3z:[0-9]+:/,'t3z:999999:'))).toBeNull()
  expect(decodeTelemetryHistory('t3z:100:broken')).toBeNull()
})
