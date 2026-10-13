import { expect, it } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import { advanceRace, createInitialRace } from './race'
import { createInitialEnergyStore, fullyChargeEnergyStoreInPit, startNextEnergyLap, energyBalanceErrorMJ } from './energySystem'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'

it.each(['out-lap','in-lap'] as const)('prioritizes actual recovery with no electrical deployment on an %s', timedRunPhase => {
  const config={...phaseOneConfig,drivers:phaseOneConfig.drivers.slice(0,1),weekendStage:'qualifying' as const}
  const state=createInitialRace(config),driver=config.drivers[0],team=config.teams.find(team=>team.id===driver.teamId)!
  const runtime=state.cars[0].runtimeSystems
  if(runtime.kind!=='f1')throw Error('Expected F1')
  const energyStore=createInitialEnergyStore(team,0.09,runtime.energyStore.rechargeRule)
  const index=config.track.centerline.findIndex((_,i)=>trackDynamicsAt(config.track,i/config.track.centerline.length).brakingDistanceAheadMeters>20)
  const car={...state.cars[0],status:'running' as const,pitPhase:'none' as const,progress:index/config.track.centerline.length,
    speedKph:280,throttlePercent:0,brakePercent:100,timedRunPhase,runtimeSystems:{...runtime,energyStore,ersBatteryPercent:9}}
  const result=calculateCarTelemetry({car,driver,team,track:config.track,deltaSeconds:0.1,elapsedSeconds:120,phase:null,
    lowGripConditions:false,raceLap:2,sessionType:'limited-time',trackGrip:1,weather:'clear',weekendStage:'qualifying'})
  if(result.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  expect(result.runtimeSystems.energyStore.currentEnergyMJ).toBeGreaterThan(energyStore.currentEnergyMJ)
  expect(result.runtimeSystems.energyStore.actualRecoveryPowerKw).toBeGreaterThan(0)
  expect(result.runtimeSystems.energyStore.actualDeploymentPowerKw).toBe(0)
  expect(result.runtimeSystems.energyStore.lastStepBalanceErrorMJ).toBeLessThan(1e-8)
})

it.each(['race','fp1','qualifying'] as const)('fully charges in the %s pit box and retains full charge at release', weekendStage => {
  const config={...phaseOneConfig,drivers:phaseOneConfig.drivers.slice(0,1),weekendStage}
  const state=createInitialRace(config),car=state.cars[0],team=config.teams.find(team=>team.id===car.teamId)!
  if(car.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  const old=createInitialEnergyStore(team,0.09,car.runtimeSystems.energyStore.rechargeRule)
  const pitCar={...car,status:'pit' as const,pitPhase:'box' as const,pitStartedAtSeconds:null,pitUntilSeconds:200,
    runtimeSystems:{...car.runtimeSystems,energyStore:old,ersBatteryPercent:9}}
  const next=advanceRace({...state,cars:[pitCar],elapsedSeconds:120,startProcedure:'racing',raceStartedAtSeconds:0},0.1,config)
  const runtime=next.cars[0].runtimeSystems
  if(runtime.kind!=='f1')throw Error('Expected F1')
  expect(runtime.energyStore.stateOfCharge).toBe(1)
  expect(runtime.ersBatteryPercent).toBe(100)
  expect(runtime.energyStore.rechargedAtCuKBusThisLapMJ).toBe(old.rechargedAtCuKBusThisLapMJ)
  expect(runtime.energyStore.energyBalanceErrorMJ).toBeCloseTo(0)
  expect(parseRaceCheckpoint(serializeRaceCheckpoint('pit-charge',next,1000),'pit-charge',config,1000)).not.toBeNull()
  const releaseState=advanceRace({...next,cars:[{...next.cars[0],pitUntilSeconds:120.1}]},0.1,config)
  const released=releaseState.cars[0]
  expect(released.status).toBe('running')
  if(released.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  expect(released.runtimeSystems.energyStore.stateOfCharge).toBe(1)
  const moving=advanceRace(releaseState,0.1,config).cars[0]
  if(moving.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  expect(energyBalanceErrorMJ(moving.runtimeSystems.energyStore)).toBeCloseTo(0,8)
})

it('keeps the lap recharge allowance and conversion ledger when adding external pit charge', () => {
  const config=phaseOneConfig,car=createInitialRace(config).cars[0]
  if(car.runtimeSystems.kind!=='f1')throw Error('Expected F1')
  const team=config.teams.find(team=>team.id===car.teamId)!
  const old=createInitialEnergyStore(team,0.25,car.runtimeSystems.energyStore.rechargeRule)
  const full=fullyChargeEnergyStoreInPit(old)
  expect(full.rechargeRule).toEqual(old.rechargeRule)
  expect(full.storedEnergyThisLapMJ).toBe(old.storedEnergyThisLapMJ)
  expect(full.conversionLossThisLapMJ).toBe(old.conversionLossThisLapMJ)
  expect(full.lapStartEnergyMJ).toBe(old.lapStartEnergyMJ)
  expect(full.pitChargedEnergyThisLapMJ).toBeCloseTo(full.currentEnergyMJ-old.currentEnergyMJ)
  expect(fullyChargeEnergyStoreInPit(full)).toEqual(full)
  expect(energyBalanceErrorMJ(full)).toBeCloseTo(0,8)
  expect(startNextEnergyLap(full).pitChargedEnergyThisLapMJ).toBe(0)
})
