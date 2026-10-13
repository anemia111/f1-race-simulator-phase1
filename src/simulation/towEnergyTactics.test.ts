import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { advanceRace, createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt, profileDistanceMAt, profileProgressAtDistanceM } from './trackDynamics'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'
import { advanceTowEnergyPlan, towEnergyDeployment, validTowEnergyPlan, type TowEnergyPlan } from './towEnergyTactics'

const base = {
  driver: initialDrivers[0], seconds: 20, enabled: true, isFinalLap: false,
  stateOfCharge: 0.4, speedKph: 280, straightness: 1, straightMeters: 1000,
  detectionMeters: 1200, towDragReduction: 0.035, sideBySide: false, rearThreat: false,
  opponent: { id: 'rival', gapSeconds: 0.45, speedKph: 280, braking: false },
}
const saved: TowEnergyPlan = { opponentId: 'rival', phase:'save', startedAt: 10, phaseStartedAt: 10, targetSoc: 0.68 }

describe('tow energy tactics', () => {
  it('banks energy in an aligned tow, retaining the plan through corners', () => {
    expect(advanceTowEnergyPlan(base)?.phase).toBe('save')
    expect(advanceTowEnergyPlan({...base, previous:saved, straightness:0.2, towDragReduction:0, straightMeters:0})).toEqual(saved)
    expect(advanceTowEnergyPlan({...base, towDragReduction:0})).toBeUndefined()
  })
  it('releases the bank on a long opportunity and keeps the burst below its entry threshold', () => {
    const attack = advanceTowEnergyPlan({...base, previous:saved, stateOfCharge:0.75})!
    expect(attack.phase).toBe('attack')
    expect(advanceTowEnergyPlan({...base, previous:attack, seconds:21, stateOfCharge:0.45})).toEqual(attack)
  })
  it('waits until after a nearby detection line if it cannot create a one-second escape first', () => {
    expect(advanceTowEnergyPlan({...base, previous:saved, stateOfCharge:0.75, detectionMeters:600})?.phase).toBe('save')
    expect(advanceTowEnergyPlan({...base, previous:saved, stateOfCharge:0.75, detectionMeters:2000})?.phase).toBe('attack')
  })
  it.each([
    {sideBySide:true}, {isFinalLap:true}, {rearThreat:true},
    {opponent:{...base.opponent,braking:true}},
    {opponent:{...base.opponent,gapSeconds:0.4,speedKph:250}},
  ])('does not waste a clear pass or urgent race situation: %j', override => {
    expect(advanceTowEnergyPlan({...base, previous:saved, ...override})?.phase).toBe('attack')
  })
  it('continues deployment after the pass, stopping beyond the detection gap or at reserve', () => {
    const attack = {...saved,phase:'attack' as const,phaseStartedAt:19}
    const escaped = advanceTowEnergyPlan({...base, previous:attack, opponent:{...base.opponent,gapSeconds:-0.4}})!
    expect(escaped.phase).toBe('escape')
    expect(advanceTowEnergyPlan({...base, previous:escaped, opponent:{...base.opponent,gapSeconds:-1.2}})).toBeUndefined()
    expect(advanceTowEnergyPlan({...base, previous:escaped,stateOfCharge:0.1,opponent:{...base.opponent,gapSeconds:-0.4}})).toBeUndefined()
    expect(advanceTowEnergyPlan({...base, previous:escaped,seconds:31,opponent:{...base.opponent,gapSeconds:-0.4}})).toBeUndefined()
  })
  it('abandons a losing tow, race-control restrictions and weak strategic judgement', () => {
    expect(advanceTowEnergyPlan({...base,enabled:false,previous:saved})).toBeUndefined()
    expect(advanceTowEnergyPlan({...base,opponent:{...base.opponent,gapSeconds:1.5},previous:saved})).toBeUndefined()
    const weak = {...base.driver,skills:Object.fromEntries(Object.keys(base.driver.skills).map(k=>[k,0.5])) as typeof base.driver.skills}
    expect(advanceTowEnergyPlan({...base,driver:weak})).toBeUndefined()
  })
  it('caps deployment only while the real tow maintains pace, never when falling away', () => {
    const request = {plan:saved,towDragReduction:0.03,speedDeficitKph:0,straightness:1,throttlePercent:100,brakePercent:0,enabled:true}
    expect(towEnergyDeployment(request).cap).toBeCloseTo(0.1)
    expect(towEnergyDeployment({...request,towDragReduction:0}).cap).toBe(1)
    expect(towEnergyDeployment({...request,speedDeficitKph:6}).cap).toBe(1)
    expect(towEnergyDeployment({...request,plan:{...saved,phase:'attack'}}).attack).toBe(1)
    expect(towEnergyDeployment({...request,plan:{...saved,phase:'escape'},brakePercent:40}).attack).toBe(0)
  })
  it('persists a bounded plan and accepts older checkpoints without it', () => {
    const config = { drivers:initialDrivers.slice(0,2), teams:initialTeams, track:tracks[0], seed:'tow-checkpoint',freeMode:true }
    const snapshot = createInitialRace(config)
    const now = 1_800_000_000_000
    const plan = {...saved,opponentId:snapshot.cars[1].driverId,startedAt:0,phaseStartedAt:0}
    snapshot.cars[0].towEnergyPlan = plan
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('tow',snapshot,now),'tow',config,now)
    expect(restored?.cars[0].towEnergyPlan).toEqual(plan)
    delete snapshot.cars[0].towEnergyPlan
    expect(parseRaceCheckpoint(serializeRaceCheckpoint('tow',snapshot,now),'tow',config,now)).not.toBeNull()
    expect(validTowEnergyPlan({...plan,phaseStartedAt:50},1)).toBe(false)
    expect(validTowEnergyPlan({...plan,targetSoc:NaN},1)).toBe(false)
  })
  it('creates and retains the tow plan in short live race ticks deterministically', () => {
    const track = tracks.find(t=>t.id==='monza-approx')!
    const config = {drivers:[initialDrivers[0],initialDrivers[2]],teams:initialTeams,track,seed:'live-tow-plan',freeMode:true}
    const initial = createInitialRace(config)
    const progress = track.centerline.findIndex((_,i)=>{
      const d=trackDynamicsAt(track,i/track.centerline.length)
      return d.fullThrottle && d.straightness>0.95 && d.straightLengthAheadMeters>600
    })/track.centerline.length
    const leaderMeters = profileDistanceMAt(track,2+progress)
    const prepared = {...initial,elapsedSeconds:100,startProcedure:'racing' as const,sessionStatus:'racing' as const,
      raceStartedAtSeconds:0,startProcedureRemainingSeconds:0,formationLapsCompleted:initial.formationLapsPlanned,
      cars:initial.cars.map((car,index)=>{
        const distance = profileProgressAtDistanceM(track,leaderMeters-index*35)
        const runtime=car.runtimeSystems
        if(runtime.kind!=='f1') throw Error('F1 expected')
        const current = runtime.energyStore.minimumUsableEnergyMJ + (runtime.energyStore.maximumUsableEnergyMJ-runtime.energyStore.minimumUsableEnergyMJ)*0.3
        return {...car,status:'running' as const,pitPhase:'none' as const,totalDistance:distance,progress:distance%1,lap:3,
          lateralOffsetM:0,desiredLateralOffsetM:0,lateralVelocityMps:0,speedKph:280,throttlePercent:100,brakePercent:0,
          runtimeSystems:{...runtime,energyStore:{...runtime.energyStore,currentEnergyMJ:current,stateOfCharge:0.3,lapStartEnergyMJ:current}}}
      })}
    const next=advanceRace(prepared,0.05,config)
    expect(next).toEqual(advanceRace(prepared,0.05,config))
    const chaser=next.cars.find(c=>c.driverId===prepared.cars[1].driverId)!
    expect(chaser.towEnergyPlan?.phase).toBe('save')
    expect(chaser.towEnergyPlan?.opponentId).toBe(prepared.cars[0].driverId)
  })
  it('saves actual stored energy in live telemetry while physical and race-control gates remain in force', () => {
    const track = tracks.find(t=>t.id==='monza-approx')!
    const driver = initialDrivers[0]
    const team = initialTeams.find(t=>t.id===driver.teamId)!
    const snapshot = createInitialRace({drivers:[driver],teams:initialTeams,track,seed:'tow-power',freeMode:true})
    const progress = track.centerline.findIndex((_,i)=>{
      const d=trackDynamicsAt(track,i/track.centerline.length)
      return d.straightness>0.95 && d.straightLengthAheadMeters>600 && d.fullThrottle
    }) / track.centerline.length
    expect(progress).toBeGreaterThanOrEqual(0)
    const car = {...snapshot.cars[0],progress,totalDistance:2+progress,speedKph:280,throttlePercent:100,brakePercent:0,
      status:'running' as const,pitPhase:'none' as const,gapToAhead:0.6,lateralOffsetM:0,desiredLateralOffsetM:0}
    const options = {car,driver,team,track,deltaSeconds:0.1,elapsedSeconds:20,phase:null,lowGripConditions:false,
      raceLap:3,trackGrip:1,weather:'clear' as const,aheadLateralOffsetM:0,aheadSpeedKph:280}
    const normal = calculateCarTelemetry(options)
    const bank = calculateCarTelemetry({...options,towEnergyPlan:saved})
    const burst = calculateCarTelemetry({...options,towEnergyPlan:{...saved,phase:'attack'}})
    if(normal.runtimeSystems.kind!=='f1'||bank.runtimeSystems.kind!=='f1'||burst.runtimeSystems.kind!=='f1') throw Error('F1 expected')
    expect(bank.runtimeSystems.ersPowerKw).toBeLessThan(normal.runtimeSystems.ersPowerKw)
    expect(bank.runtimeSystems.energyStore.currentEnergyMJ).toBeGreaterThan(normal.runtimeSystems.energyStore.currentEnergyMJ)
    expect(burst.runtimeSystems.ersPowerKw).toBeGreaterThan(bank.runtimeSystems.ersPowerKw)
    expect(Math.abs(bank.runtimeSystems.energyStore.lastStepBalanceErrorMJ)).toBeLessThan(1e-6)
    const restricted=calculateCarTelemetry({...options,towEnergyPlan:{...saved,phase:'attack'},standingStartMguKRestricted:true})
    expect(restricted.runtimeSystems.kind==='f1' && restricted.runtimeSystems.ersPowerKw).toBe(0)
  })
})
