import { expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'
import { superFormulaPhysicsForTrack } from './superFormulaGripCalibration'

it('uses and retains SF OTS on a curved section while debiting the actual time budget', () => {
  const series=seriesPackageById.get('super-formula')!, track=series.tracks[0]
  const driver=series.drivers[0],team=series.teams.find(t=>t.id===driver.teamId)!
  const physics=superFormulaPhysicsForTrack(track)
  const initial=createInitialRace({seriesId:'super-formula',drivers:[driver],teams:series.teams,track,
    seed:'ots-corner-location',freeMode:true,sessionRaceLapsOverride:25,weekendStage:'race',overtakeSystem:'ots'})
  const progress=track.centerline.findIndex((_,i)=>{
    const d=trackDynamicsAt(track,i/track.centerline.length,physics)
    return d.straightness<0.72 && d.referenceSpeedKph>150
  })/track.centerline.length
  expect(progress).toBeGreaterThanOrEqual(0)
  const car={...initial.cars[0],status:'running' as const,pitPhase:'none' as const,progress,speedKph:100,
    throttlePercent:100,brakePercent:0,battlePhase:'attacking' as const,gapToAhead:0.8,racePaceMode:'push' as const}
  const options={car,driver,team,track,categoryPhysics:physics,deltaSeconds:0.1,elapsedSeconds:120,phase:null,
    lowGripConditions:false,raceControlOvertakeEnabled:true,overtakeSystem:'ots' as const,seriesId:'super-formula' as const,
    sessionType:'race-distance' as const,raceLap:2,trackGrip:1,weather:'clear' as const}
  const active=calculateCarTelemetry(options)
  expect(active.overtakeStatus).toBe('active')
  if(active.runtimeSystems.kind!=='super-formula')throw Error('SF expected')
  expect(active.runtimeSystems.otsSimulation!.remainingSeconds).toBeCloseTo(199.9)
  const held=calculateCarTelemetry({...options,elapsedSeconds:120.1,
    car:{...car,runtimeSystems:active.runtimeSystems,brakePercent:100,throttlePercent:0}})
  expect(held.overtakeStatus).toBe('active')
  if(held.runtimeSystems.kind!=='super-formula')throw Error('SF expected')
  expect(held.runtimeSystems.otsSimulation!.remainingSeconds).toBeCloseTo(199.8)
  expect(held.runtimeSystems.otsSimulation!.cooldownUntilSeconds).toBe(0)
  for(const state of [
    {...active.runtimeSystems.otsSimulation!,active:false,cooldownUntilSeconds:200},
    {...active.runtimeSystems.otsSimulation!,active:false,remainingSeconds:0},
  ]) {
    const unavailable=calculateCarTelemetry({...options,car:{...car,runtimeSystems:{...active.runtimeSystems,otsSimulation:state}}})
    expect(unavailable.overtakeStatus).not.toBe('active')
    if(unavailable.runtimeSystems.kind!=='super-formula')throw Error('SF expected')
    expect(unavailable.runtimeSystems.otsSimulation!.remainingSeconds).toBe(state.remainingSeconds)
  }
})
