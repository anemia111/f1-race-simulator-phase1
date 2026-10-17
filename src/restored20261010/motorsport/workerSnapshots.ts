import type { TelemetryPoint } from '../simulation/telemetryHistory'
import type { MotorsportRaceState } from './types'

export type TelemetryUpdate = { entryId: string; replace: boolean; samples: TelemetryPoint[] | null }
export type MotorsportSnapshotMessage = { type: 'snapshot'; generation: number; state: MotorsportRaceState; telemetryUpdates: TelemetryUpdate[] }

/** Worker owns the complete state; only newly recorded samples cross the wire. */
export function createSnapshotEncoder() {
  const sent = new Map<string, TelemetryPoint[] | undefined>()
  return (state: MotorsportRaceState, generation: number): MotorsportSnapshotMessage => {
    const telemetryUpdates: TelemetryUpdate[]=[]
    const cars=state.cars.map(car=>{
      const history=car.telemetryHistory, previous=sent.get(car.entryId)
      if(history!==previous){
        const last=previous?.at(-1),index=last ? history?.lastIndexOf(last) ?? -1 : -1
        telemetryUpdates.push({entryId:car.entryId,replace:index<0,samples:history === undefined ? null : index<0 ? history : history.slice(index+1)})
        sent.set(car.entryId,history)
      }
      const {telemetryHistory: _history,...motion}=car
      return motion
    })
    return {type:'snapshot',generation,state:{...state,cars},telemetryUpdates}
  }
}

export function restoreSnapshotTelemetry(previous: MotorsportRaceState, message: MotorsportSnapshotMessage): MotorsportRaceState {
  const histories=new Map(previous.cars.map(car=>[car.entryId,car.telemetryHistory]))
  for(const update of message.telemetryUpdates){
    if(update.samples === null){histories.delete(update.entryId);continue}
    let samples=update.replace ? update.samples : (histories.get(update.entryId) ?? []).concat(update.samples)
    const last=samples.at(-1)
    if(last && samples[0].lap<last.lap-2)samples=samples.filter(p=>p.lap>=last.lap-2)
    if(samples.length>1536)samples=samples.slice(-1536)
    histories.set(update.entryId,samples)
  }
  return {...message.state,cars:message.state.cars.map(car=>{
    const telemetryHistory=histories.get(car.entryId)
    return telemetryHistory === undefined ? car : {...car,telemetryHistory}
  })}
}
