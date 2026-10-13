import {expect,it,vi} from 'vitest'
import {phaseOneConfig} from '../data/phaseOne'
import {createInitialRace} from '../simulation/race'
import {formulaEngineerSession} from '../domain/engineerAdapters'
import {makeEngineeringPlan,strategyScenarios} from '../domain/raceEngineer'
import type {RaceWorkerInboundMessage,RaceWorkerOutboundMessage} from './raceWorkerProtocol'

it('accepts formula engineer commands in the worker and publishes cancellation without advancing time',async()=>{
  const packets:RaceWorkerOutboundMessage[]=[]
  let receive:((event:{data:RaceWorkerInboundMessage})=>void)|undefined
  vi.stubGlobal('self',{addEventListener:(_:string,listener:typeof receive)=>{receive=listener},postMessage:(packet:RaceWorkerOutboundMessage)=>packets.push(structuredClone(packet))})
  vi.spyOn(globalThis,'setInterval').mockImplementation(()=>0 as unknown as ReturnType<typeof setInterval>)
  try {
    await import('./raceWorker')
    const config={...phaseOneConfig,weekendStage:'race' as const},initial=createInitialRace(config)
    const snapshot={...initial,elapsedSeconds:300,cars:initial.cars.map(c=>({...c,lap:3,totalDistance:3.5}))}
    receive!({data:{type:'initialize',config,snapshot,isPaused:true,speed:1}})
    const session=formulaEngineerSession(config,snapshot),car=session.cars[0],plan=makeEngineeringPlan(session,car,strategyScenarios(session,car)[1])
    receive!({data:{type:'engineering-plan',driverId:car.id,plan}})
    const accepted=packets.at(-1)
    expect(accepted?.type).toBe('snapshot')
    if(accepted?.type==='snapshot'){
      expect(accepted.snapshot.cars.find(c=>c.driverId===car.id)?.engineeringPlan?.dueDistance).toBe(6.5)
      expect(accepted.snapshot.elapsedSeconds).toBe(300)
    }
    receive!({data:{type:'engineering-plan',driverId:car.id,plan:null}})
    const cancelled=packets.at(-1)
    if(cancelled?.type==='snapshot')expect(cancelled.snapshot.cars.find(c=>c.driverId===car.id)?.engineeringPlan?.status).toBe('cancelled')
    else throw new Error('missing cancellation snapshot')
  }finally{vi.restoreAllMocks();vi.unstubAllGlobals()}
})
