import { describe, expect, it } from 'vitest'
import { advanceSfOts, createSfOtsSimulation } from './sfOtsRuntime'
import { followingDemand } from './following'
import { recordTelemetry } from './telemetryHistory'
import { liveTimedLapAdjudication } from './timedSessionAdjudication'
import { createInitialRace, advanceRace } from './race'
import { phaseOneConfig } from '../data/phaseOne'
import { seriesPackageById } from '../series/seriesRegistry'
import { categoryPhysicsFor } from './categoryPhysics'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

describe('requested operational fixes', () => {
  it('activates SF OTS in the force solver and spends its actual runtime budget',()=>{
    const series=seriesPackageById.get('super-formula')!, track=series.tracks[0]
    const config={...phaseOneConfig,drivers:series.drivers,teams:series.teams,track,seriesId:'super-formula' as const,sessionRaceLapsOverride:25,overtakeSystem:'ots' as const,weekendStage:'race' as const}
    const snapshot=createInitialRace(config), driver=series.drivers[0], team=series.teams.find(team=>team.id===driver.teamId)!
    const progress=Array.from({length:1000},(_,index)=>index/1000).sort((a,b)=>trackDynamicsAt(track,b).straightness-trackDynamicsAt(track,a).straightness)[0]
    const car={...snapshot.cars.find(car=>car.driverId===driver.id)!,progress,speedKph:250,battlePhase:'attacking' as const,gapToAhead:0.8,racePaceMode:'push' as const}
    const result=calculateCarTelemetry({car,driver,team,track,categoryPhysics:categoryPhysicsFor('super-formula'),deltaSeconds:1,elapsedSeconds:120,phase:null,lowGripConditions:false,raceControlOvertakeEnabled:true,overtakeSystem:'ots',seriesId:'super-formula',sessionType:'race-distance',raceLap:2,trackGrip:1,weather:'clear'})
    expect(result.overtakeStatus).toBe('active')
    expect(result.runtimeSystems.kind).toBe('super-formula')
    if(result.runtimeSystems.kind==='super-formula') expect(result.runtimeSystems.otsSimulation?.remainingSeconds).toBe(199)
  })
  it('maintains matched-speed following pace and still brakes for closure', () => {
    expect(followingDemand({speedKph:200,aheadSpeedKph:200,distanceM:30,lateralSeparationM:0})).toEqual({decelerationMps2:0,throttleScale:1})
    expect(followingDemand({speedKph:250,aheadSpeedKph:100,distanceM:20,lateralSeparationM:0}).decelerationMps2).toBeGreaterThan(0)
  })
  it('requires a physical hazard instead of a seeded lap-end yellow', () => {
    for(let lap=1;lap<=500;lap++) expect(liveTimedLapAdjudication({seed:'yellow',driverId:'driver',segmentKey:'Q1',completedTimedLap:lap}).causedYellow).toBe(false)
    expect(liveTimedLapAdjudication({seed:'yellow',driverId:'driver',segmentKey:'Q1',completedTimedLap:1,obstructed:true}).causedYellow).toBe(true)
  })
  it('debits OTS seconds, starts cooldown on release, and respects neutralisation', () => {
    const initial=createSfOtsSimulation('sf-suzuka')!
    const active=advanceSfOts(initial,true,true,120,5)
    expect(active.remainingSeconds).toBe(195)
    expect(active.active).toBe(true)
    const stopped=advanceSfOts(active,false,true,125,1)
    expect(stopped.cooldownUntilSeconds).toBe(225)
    expect(advanceSfOts(stopped,true,true,224,1).active).toBe(false)
    expect(advanceSfOts(stopped,true,true,225,1).remainingSeconds).toBe(194)
    expect(advanceSfOts(active,true,false,126,1).remainingSeconds).toBe(195)
    expect(createSfOtsSimulation('sf-sugo')?.cooldownSeconds).toBe(110)
    expect(createSfOtsSimulation('sf-fuji')?.cooldownSeconds).toBe(120)
    expect(createSfOtsSimulation('unknown')).toBeUndefined()
  })
  it('bounds spatial telemetry, preserves pedal samples, and never fills missing bins', () => {
    let history: Parameters<typeof recordTelemetry>[0]
    for(let lap=0;lap<5;lap++) for(let bin=0;bin<256;bin++) history=recordTelemetry(history,{lap,progress:bin/256,seconds:lap*100+bin,speedKph:200,throttlePercent:80,brakePercent:0,gear:6,rpm:10000})
    expect(history).toHaveLength(768)
    expect(history![0].lap).toBe(2)
    expect(history!.at(-1)?.throttlePercent).toBe(80)
    const edge={lap:0,progress:0.99999999,seconds:100,speedKph:200,throttlePercent:80,brakePercent:0,gear:6,rpm:10000}
    expect(recordTelemetry(undefined,edge)[0].progress).toBeLessThan(1)
    expect(recordTelemetry(undefined,{...edge,lap:-1})).toEqual([])
  })
  it('serializes simultaneous race pit-exit releases', () => {
    const config={...phaseOneConfig,weekendStage:'race' as const}
    const base=createInitialRace(config)
    const snapshot={...base,startProcedure:'racing' as const,elapsedSeconds:100,raceStartedAtSeconds:0,cars:base.cars.slice(0,2).map(car=>({...car,status:'pit' as const,pitPhase:'lane' as const,pitUntilSeconds:100,pitLaneProgress:0.1}))}
    const next=advanceRace(snapshot,0.05,config)
    expect(next.cars.filter(car=>car.status==='running')).toHaveLength(1)
    expect(next.cars.filter(car=>car.status==='pit')).toHaveLength(1)
  })
  it('cannot complete an overtake from the pit exit blend lane',()=>{
    const config={...phaseOneConfig,weekendStage:'race' as const}, base=createInitialRace(config)
    const cars=base.cars.slice(0,2).map((car,index)=>({...car,totalDistance:2.3-index*0.0005,progress:0.3-index*0.0005,lap:2,processedLap:2,speedKph:index?300:150,lateralOffsetM:index?3:0,trackLateralOffset:index?3:0,pitPhase:index?'exit' as const:'none' as const,pitExitUntilSeconds:index?104:null}))
    const next=advanceRace({...base,cars,startProcedure:'racing',elapsedSeconds:100,raceStartedAtSeconds:0},0.1,config)
    expect(next.cars.find(car=>car.driverId===cars[1].driverId)!.totalDistance).toBeLessThan(next.cars.find(car=>car.driverId===cars[0].driverId)!.totalDistance)
  })
})
