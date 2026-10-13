import { expect, it } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import { createInitialEnergyStore } from './energySystem'
import { simulationRechargeRuleFor, repairUnavailableSimRecharge } from './simulationRechargePolicy'
import { resolveF1RechargeRule } from './regulations'
import { fiaSuzukaPuEventInput2026 } from '../data/fiaPuEventInputs2026'
import { tracks } from '../data/tracks'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'
import { trackDynamicsAt } from './trackDynamics'

it.each(['fp1','fp2','fp3','qualifying','sprintQualifying','race','sprint'] as const)('recovers from 9 percent under braking in ordinary SIM %s', weekendStage => {
  const config={...phaseOneConfig,drivers:phaseOneConfig.drivers.slice(0,1),weekendStage}
  const initial=createInitialRace(config),driver=config.drivers[0],team=config.teams.find(team=>team.id===driver.teamId)!
  const runtime=initial.cars[0].runtimeSystems
  if(runtime.kind!=='f1')throw Error('Expected F1')
  const energyStore=createInitialEnergyStore(team,0.09,runtime.energyStore.rechargeRule)
  const index=config.track.centerline.findIndex((_,i)=>trackDynamicsAt(config.track,i/config.track.centerline.length).brakingDistanceAheadMeters>20)
  const car={...initial.cars[0],progress:index/config.track.centerline.length,status:'running' as const,pitPhase:'none' as const,
    speedKph:280,throttlePercent:0,brakePercent:100,timedRunPhase:'attack-lap' as const,
    runtimeSystems:{...runtime,energyStore,ersBatteryPercent:9}}
  const result=calculateCarTelemetry({car,driver,team,track:config.track,deltaSeconds:0.1,elapsedSeconds:120,
    phase:null,lowGripConditions:false,raceLap:2,sessionType:weekendStage==='race'||weekendStage==='sprint'?'race-distance':'limited-time',trackGrip:1,weather:'clear',weekendStage})
  if(result.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  expect(result.brakePercent).toBeGreaterThan(0)
  expect(result.runtimeSystems.energyStore.actualRecoveryPowerKw).toBeGreaterThan(0)
  expect(result.runtimeSystems.energyStore.currentEnergyMJ).toBeGreaterThan(energyStore.currentEnergyMJ)
  if(weekendStage==='qualifying') {
    const old=createInitialEnergyStore(team,0.09,resolveF1RechargeRule({stage:weekendStage}))
    const repaired=calculateCarTelemetry({car:{...car,runtimeSystems:{...car.runtimeSystems,energyStore:old}},driver,team,
      track:config.track,deltaSeconds:0.1,elapsedSeconds:120,phase:null,lowGripConditions:false,raceLap:2,
      trackGrip:1,weather:'clear',weekendStage,simulationRechargeRule:simulationRechargeRuleFor(config,weekendStage)})
    if(repaired.runtimeSystems.kind!=='f1')throw Error('Expected F1')
    expect(repaired.runtimeSystems.energyStore.currentEnergyMJ).toBeGreaterThan(old.currentEnergyMJ)
  }
})

it('repairs an old unavailable checkpoint without adding charge or clearing lap use', () => {
  const config={...phaseOneConfig,drivers:phaseOneConfig.drivers.slice(0,1),weekendStage:'qualifying' as const}
  const state=createInitialRace(config),car=state.cars[0],team=config.teams.find(team=>team.id===car.teamId)!
  if(car.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  const old=createInitialEnergyStore(team,0.09,resolveF1RechargeRule({stage:'qualifying'}))
  car.runtimeSystems={...car.runtimeSystems,energyStore:old,ersBatteryPercent:9}
  const saved=serializeRaceCheckpoint('charge-fix',state,1000)!
  const restored=parseRaceCheckpoint(saved,'charge-fix',config,1000)!
  expect(restored).not.toBeNull()
  const runtime=restored.cars[0].runtimeSystems
  if(runtime.kind!=='f1')throw Error('Expected F1')
  expect(runtime.energyStore.rechargeRule.ruleId).toBe('sim-session-default')
  expect(runtime.energyStore.currentEnergyMJ).toBe(old.currentEnergyMJ)
  const used={...old,rechargedAtCuKBusThisLapMJ:1.2}
  const repaired=repairUnavailableSimRecharge(used,simulationRechargeRuleFor(config,'qualifying'))
  expect(repaired.rechargeRule.usedMJ).toBe(1.2)
  expect(repaired.rechargeRule.remainingMJ).toBeCloseTo(7.3)
  expect(repaired.currentEnergyMJ).toBe(old.currentEnergyMJ)
})

it('retains supplied-event rules and explicit unknown contexts rather than replacing them with SIM limits', () => {
  const config={...phaseOneConfig,eventId:fiaSuzukaPuEventInput2026.eventId,
    track:tracks.find(track=>track.id==='suzuka-approx')!,fiaPuEventInput:fiaSuzukaPuEventInput2026}
  for(const stage of ['fp1','qualifying','sprintQualifying','race'] as const) {
    expect(simulationRechargeRuleFor(config,stage)).toEqual(resolveF1RechargeRule({stage,
      eventId:config.eventId,eventInput:config.fiaPuEventInput,trackId:config.track.id}))
  }
  const unknown={...config,fiaPuEventInput:{...fiaSuzukaPuEventInput2026,recharge:{...fiaSuzukaPuEventInput2026.recharge,
    rules:fiaSuzukaPuEventInput2026.recharge.rules.filter(rule=>rule.sessionTypes.some(session=>session==='race'))}}}
  expect(simulationRechargeRuleFor(unknown,'qualifying').limit.kind).toBe('unavailable')
})

it('keeps race recharge available when Overtake was active at lap start without event data', () => {
  expect(simulationRechargeRuleFor(phaseOneConfig,'race',{overtakeAtLapStart:true})).toMatchObject({
    ruleId:'sim-session-default',limit:{kind:'finite',maxCuKBusRechargeMj:9}})
})
