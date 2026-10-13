import { expect, it, vi } from 'vitest'
import { createMotorsportConfig } from './packages'
import { createMotorsportRace } from './race'
import { parseMotorsportSave } from './persistence'
import { restoreSnapshotTelemetry, type MotorsportSnapshotMessage } from './workerSnapshots'
import type { MotorsportWorkerCommand } from './worker'
import {motorsportEngineerSession} from './engineering'
import {makeEngineeringPlan,strategyScenarios} from '../domain/raceEngineer'

it('keeps complete telemetry in worker saves and resets delta history with the generation',async()=>{
  const packets: unknown[]=[]
  const scope={onmessage:null as ((event:{data:MotorsportWorkerCommand})=>void)|null,postMessage:(packet:unknown)=>packets.push(structuredClone(packet))}
  vi.stubGlobal('self',scope)
  try {
    await import('./worker')
    const config=createMotorsportConfig('super-gt')
    const initial=createMotorsportRace(config)
    const state={...initial,phase:'racing' as const,cars:initial.cars.map(car=>({...car,telemetryHistory:[{lap:0,progress:0,seconds:0,speedKph:0,throttlePercent:0,brakePercent:0,gear:1,rpm:0}]}))}
    const send=(data:MotorsportWorkerCommand)=>scope.onmessage!({data})
    send({type:'init',generation:7,config,state})
    let restored=restoreSnapshotTelemetry(initial,packets.at(-1) as MotorsportSnapshotMessage)
    expect(restored).toEqual(state)
    send({type:'advance',generation:7,ticks:2})
    restored=restoreSnapshotTelemetry(restored,packets.at(-1) as MotorsportSnapshotMessage)
    const engineering=motorsportEngineerSession(config,restored),selected=engineering.cars[0]
    const plan=makeEngineeringPlan(engineering,selected,strategyScenarios(engineering,selected)[0])
    send({type:'engineering-plan',generation:7,entryId:selected.id,plan})
    restored=restoreSnapshotTelemetry(restored,packets.at(-1) as MotorsportSnapshotMessage)
    expect(restored.cars.find(car=>car.entryId===selected.id)?.engineeringPlan).toEqual(plan)
    send({type:'save',generation:7})
    const saved=packets.at(-1) as {type:string;generation:number;payload:string}
    expect(saved.type).toBe('save')
    expect(saved.generation).toBe(7)
    expect(parseMotorsportSave(saved.payload)?.state).toEqual(restored)
    const count=packets.length
    send({type:'save',generation:6})
    expect(packets).toHaveLength(count)
    send({type:'init',generation:8,config,state})
    const reset=packets.at(-1) as MotorsportSnapshotMessage
    expect(reset.telemetryUpdates.every(update=>update.replace)).toBe(true)
    expect(restoreSnapshotTelemetry(restored,reset)).toEqual(state)
  } finally {vi.unstubAllGlobals()}
})
