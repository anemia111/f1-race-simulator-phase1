import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { Driver } from '../types'
import { decideDriverBehavior } from './driverDecision'
import { advanceWheelBattle, applyWheelBattleDecision, straightAttackDeployment, validWheelBattle } from './wheelBattle'
import { createMotorsportConfig } from '../motorsport/packages'
import { createMotorsportRace, advanceMotorsportRace } from '../motorsport/race'
import { behaviorDriverFor } from '../motorsport/driverBehavior'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace, advanceRace } from './race'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'
import type { RaceConfig, RaceSnapshot } from '../types'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

const rated = (id: string, value: number): Driver => ({...initialDrivers[0], id,
  skills: Object.fromEntries(Object.keys(initialDrivers[0].skills).map(key=>[key,value])) as Driver['skills']})
const high=rated('high',1),low=rated('low',0.65)
const contest={seconds:10,enabled:true,own:low,opponent:high,gapM:0,lateralSeparationM:2.4,speedDeltaMps:0}
describe('committed overtaking and finite wheel-to-wheel contests',()=>{
  it('allows a normal short overlap, then the disadvantaged driver lifts without merging',()=>{
    const previous=advanceWheelBattle(contest)!
    expect(advanceWheelBattle({...contest,previous,seconds:15.9})!.conceding).toBe(false)
    const ended=advanceWheelBattle({...contest,previous,seconds:16})!
    expect(ended.conceding).toBe(true)
    const decision=decideDriverBehavior({seed:'battle',driver:low,lap:1,trackProgress:0.2,
      currentLateralOffsetM:-2.4,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,
      attack:{active:true,opponentId:'high',opponentLateralOffsetM:0,gapSeconds:0.02,intensity:1}})
    const lift=applyWheelBattleDecision(decision,ended,-2.4)
    expect(lift.intent).toBe('physical-reference-line')
    expect(lift.throttleOpeningScale).toBeLessThanOrEqual(0.72)
    expect(lift.desiredLateralOffsetM).toBe(-2.4)
    expect(advanceWheelBattle({...contest,previous:ended,seconds:17,gapM:10})!.conceding).toBe(true)
    expect(advanceWheelBattle({...contest,previous:ended,seconds:18,gapM:15})).toBeUndefined()
  })
  it.each([0,2,-2])('makes both sides agree on the loser at nose separation %s',gapM=>{
    const a=advanceWheelBattle({...contest,gapM,previous:{opponentId:high.id,startedAt:0,conceding:false}})!
    const b=advanceWheelBattle({...contest,own:high,opponent:low,gapM:-gapM,previous:{opponentId:low.id,startedAt:0,conceding:false}})!
    expect(a.conceding).not.toBe(b.conceding)
    if(gapM===-2)expect(a.conceding).toBe(false)
  })
  it('breaks an equal skill tie symmetrically and resets on flags or lost overlap',()=>{
    const equal=rated('equal',1)
    const a=advanceWheelBattle({...contest,own:equal,seconds:20,previous:{opponentId:high.id,startedAt:0,conceding:false}})!
    const b=advanceWheelBattle({...contest,own:high,opponent:equal,seconds:20,previous:{opponentId:equal.id,startedAt:0,conceding:false}})!
    expect(a.conceding).not.toBe(b.conceding)
    expect(advanceWheelBattle({...contest,previous:a,enabled:false})).toBeUndefined()
    expect(advanceWheelBattle({...contest,gapM:7})).toBeUndefined()
    expect(advanceWheelBattle({...contest,lateralSeparationM:0})).toBeUndefined()
    const flag=decideDriverBehavior({seed:'flag',driver:low,lap:1,trackProgress:0.2,flagState:'yellow',currentLateralOffsetM:0,physicalReferenceLineOffsetM:0,trackHalfWidthM:6})
    expect(applyWheelBattleDecision(flag,{opponentId:'high',startedAt:0,conceding:true})).toBe(flag)
  })
  it('gives a capable close attacker full passing clearance and holds an occupied defensive lane',()=>{
    let highClearance=0,lowClearance=0
    for(let seed=0;seed<40;seed++){
      const context={seed:String(seed),driver:high,lap:1,trackProgress:0.2,currentLateralOffsetM:0,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,
        attack:{active:true,opponentId:'front',opponentLateralOffsetM:0,gapSeconds:0.5,intensity:0.7}}
      highClearance+=Math.abs(decideDriverBehavior(context).desiredLateralOffsetM)
      lowClearance+=Math.abs(decideDriverBehavior({...context,driver:low}).desiredLateralOffsetM)
      const defence=decideDriverBehavior({...context,attack:undefined,currentLateralOffsetM:2.4,
        defend:{active:true,opponentId:'back',opponentLateralOffsetM:0,gapSeconds:0.05,intensity:1}})
      expect(defence.desiredLateralOffsetM).toBeGreaterThan(2.1)
    }
    expect(highClearance).toBeGreaterThan(lowClearance)
  })
  it('requests ERS on a committed straight attack with skill and battery reserves, without deployment under braking or flags',()=>{
    const input={intent:'attack' as const,straightness:1,throttlePercent:100,brakePercent:0,stateOfCharge:0.8,skill:1,enabled:true}
    expect(straightAttackDeployment(input)).toBeGreaterThan(0.9)
    expect(straightAttackDeployment({...input,skill:0.5})).toBeLessThan(straightAttackDeployment(input))
    for(const change of [{enabled:false},{straightness:0.5},{brakePercent:10},{stateOfCharge:0.1},{intent:'physical-reference-line' as const}])
      expect(straightAttackDeployment({...input,...change})).toBe(0)
    expect(validWheelBattle({opponentId:'x',startedAt:NaN,conceding:true},10)).toBe(false)
    expect(validWheelBattle({opponentId:'x',startedAt:11,conceding:true},10)).toBe(false)
  })
  it('pulls out earlier with an active boost rather than waiting in the tow',()=>{
    const context={seed:'boost',driver:high,lap:1,trackProgress:0.2,currentLateralOffsetM:0,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,
      attack:{active:true,opponentId:'front',opponentLateralOffsetM:0,gapSeconds:0.95,intensity:0.48},
      tow:{active:true,opponentId:'front',opponentLateralOffsetM:0,gapSeconds:0.95,intensity:0.5}}
    expect(decideDriverBehavior(context).intent).toBe('tow-alignment')
    const boosted=decideDriverBehavior({...context,attack:{...context.attack,boostActive:true}})
    expect(boosted.intent).toBe('attack')
    expect(Math.abs(boosted.desiredLateralOffsetM)).toBeGreaterThan(2.1)
    expect(decideDriverBehavior({...context,attack:{...context.attack,boostActive:true},flagState:'yellow'}).intent).toBe('controlled-flag')
  })
  it('routes a straight attack into actual F1 electrical deployment with battery accounting',()=>{
    const series=seriesPackageById.get('f1-custom')!,driver=series.drivers[0],team=series.teams.find(t=>t.id===driver.teamId)!
    const track=series.tracks.find(t=>t.id==='monza-approx')!
    const progress=Array.from({length:100},(_,i)=>i/100).filter(p=>trackDynamicsAt(track,p).straightness>0.95)
      .sort((a,b)=>trackDynamicsAt(track,b).straightLengthAheadMeters-trackDynamicsAt(track,a).straightLengthAheadMeters)[0]
    const config:RaceConfig={drivers:[driver],teams:series.teams,track,seed:'attack-energy',weekendStage:'race'}
    const initial=createInitialRace(config),car={...initial.cars[0],progress,totalDistance:2+progress,speedKph:220,gear:6,
      throttlePercent:100,brakePercent:0,clutchEngagementFraction:1,turboSpoolFraction:1}
    const decision=decideDriverBehavior({seed:config.seed,driver,lap:2,trackProgress:progress,currentLateralOffsetM:0,
      physicalReferenceLineOffsetM:0,trackHalfWidthM:6,attack:{active:true,boostActive:true,opponentId:'front',opponentLateralOffsetM:0,gapSeconds:0.4,intensity:1}})
    const result=calculateCarTelemetry({car,driver,team,track,deltaSeconds:0.1,elapsedSeconds:100,phase:null,
      lowGripConditions:false,raceLap:3,sessionType:'race-distance',weekendStage:'race',trackGrip:1,weather:'clear',driverDecision:decision})
    expect(result.runtimeSystems.kind).toBe('f1')
    if(result.runtimeSystems.kind!=='f1' || car.runtimeSystems.kind!=='f1')return
    expect(result.runtimeSystems.ersMode).toBe('deploy')
    expect(result.runtimeSystems.ersPowerKw).toBeGreaterThan(0)
    expect(result.runtimeSystems.energyStore.energyRemovedThisLapMJ).toBeGreaterThan(0)
    expect(result.runtimeSystems.energyStore.stateOfCharge).toBeLessThanOrEqual(car.runtimeSystems.energyStore.stateOfCharge)
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s releases a prolonged straight overlap using live pedals and saves its decision',category=>{
    const config=createMotorsportConfig(category)
    const first=config.entries[0]
    config.entries=config.entries.slice(0,2).map((entry,i)=>({...entry,team:`test-${i}`,classId:first.classId,machine:first.machine,
      drivers:entry.drivers.map(driver=>({...driver,skills:rated(driver.id,i?1:0.65).skills}))}))
    config.course={...config.course,lengthM:4000,points:[[0,0],[1500,0],[1500,500],[0,500]]}
    const initial=createMotorsportRace(config)
    const state={...initial,phase:'racing' as const,raceSeconds:30,cars:initial.cars.map((car,i)=>({...car,
      distanceM:400,speedMps:40,lateralM:i?0:-2.4,throttlePercent:100,brakePercent:0,tyreTemperatureC:90,
      wheelBattle:{opponentId:behaviorDriverFor(config.entries[1-i].drivers[0]).id,startedAt:20,conceding:false}}))}
    const next=advanceMotorsportRace(state,1,config)
    expect(next.cars[0].wheelBattle?.conceding).toBe(true)
    expect(next.cars[1].wheelBattle?.conceding).toBe(false)
    expect(next.cars[0].driverIntent).toBe('physical-reference-line')
    expect(next.cars[0].throttlePercent).toBeLessThan(100)
    expect(parseMotorsportSave(serializeMotorsportSave(config,next))?.state.cars[0].wheelBattle).toEqual(next.cars[0].wheelBattle)
    const settled=advanceMotorsportRace(next,40,config)
    expect(settled.cars[1].distanceM-settled.cars[0].distanceM).toBeGreaterThan(7)
  })
  it.each(['f1-custom','super-formula'] as const)('%s applies the common contest lift in live ticks and retains it in checkpoints',id=>{
    const series=seriesPackageById.get(id)!
    const drivers=series.drivers.slice(0,2).map((driver,i)=>({...driver,skills:rated(driver.id,i?1:0.65).skills}))
    const config:RaceConfig={seriesId:id,drivers,teams:series.teams,track:{...series.tracks[0],rainProbability:0},
      seed:'straight-contest',weekendStage:'race',sessionRaceLapsOverride:20}
    const initial=createInitialRace(config)
    const state:RaceSnapshot={...initial,elapsedSeconds:100,startProcedure:'racing',startProcedureRemainingSeconds:0,raceStartedAtSeconds:0,
      cars:initial.cars.map((car,i)=>({...car,totalDistance:2.3,progress:0.3,processedLap:2,
        speedKph:180,throttlePercent:100,brakePercent:0,gear:5,lateralOffsetM:i?0:-2.4,
        pitPhase:'none',status:'running',pitUntilSeconds:null,clutchEngagementFraction:1,turboSpoolFraction:1,
        wheelBattle:{opponentId:drivers[1-i].id,startedAt:90,conceding:false}}))}
    const next=advanceRace(state,0.05,config)
    const loser=next.cars.find(car=>car.driverId===drivers[0].id)!
    expect(loser.wheelBattle?.conceding).toBe(true)
    expect(loser.throttlePercent).toBeLessThan(100)
    const now=Date.now(),raw=serializeRaceCheckpoint('contest',next,now)!
    expect(parseRaceCheckpoint(raw,'contest',config,now)?.cars.find(car=>car.driverId===loser.driverId)?.wheelBattle).toEqual(loser.wheelBattle)
  })
})
