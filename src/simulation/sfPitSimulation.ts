import type {TrackDefinition} from '../types'
import {resolveSuperFormulaOperational} from './superFormulaOperational'
/** Explicit SIM path estimate. No F1 transit calibration or refuelling rule. */
export function sfPitSimulation(track:TrackDefinition,paceSeconds:number) {
  const pit=track.pitLane
  const pathFraction=pit?((pit.exitProgress-pit.entryProgress+1)%1):0.15
  const pathM=Math.max(100,track.lengthKm*1000*pathFraction)
  const operational=resolveSuperFormulaOperational().pitLane
  const transit=pathM/((operational.speedLimitKph??60)/3.6)
  const service=7 // SIM tyre crew allowance, not a published SF timing.
  return {duration:transit+service,loss:Math.max(0,transit-pathFraction*paceSeconds)+service}
}
