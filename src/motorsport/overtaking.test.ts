import {describe,it,expect} from 'vitest'
import {hasOvertakingOpportunity} from './overtaking'
import {trafficAero,categoryWake} from './vehicleDynamics'
import {createMotorsportConfig,motorsportMachine} from './packages'
import {createMotorsportRace,advanceMotorsportRace} from './race'
import {integrateMotorsportVehicle} from './sharedVehiclePhysics'
import type {MotorsportClass} from './types'

const observation={speedMps:40,opponentSpeedMps:40,freeTargetMps:55,gapM:20,continuing:false,
 powerToMassAdvantage:0,lapping:false,ownBestLap:90,opponentBestLap:90,
 ownTyreLaps:3,opponentTyreLaps:3,opponentBrakePercent:0,opponentThrottlePercent:100}

describe('overtaking without added power',()=>{
 it('does not manufacture an attack when equal cars accelerate together',()=>{
  expect(hasOvertakingOpportunity(observation)).toBe(false)
 })
 it.each([
  {opponentBrakePercent:35}, {opponentThrottlePercent:40},
  {opponentTyreLaps:10}, {ownBestLap:89.5}, {speedMps:41},
 ])('recognises an observed opportunity %j without an engine advantage',change=>{
  expect(hasOvertakingOpportunity({...observation,...change})).toBe(true)
 })
 it('rejects distant dives and insufficient own corner capability',()=>{
  expect(hasOvertakingOpportunity({...observation,gapM:150,opponentBrakePercent:35})).toBe(false)
  expect(hasOvertakingOpportunity({...observation,freeTargetMps:38,opponentBrakePercent:35})).toBe(false)
 })

 it.each(Object.keys(categoryWake) as MotorsportClass[])('%s receives a real drag-force benefit without hybrid deployment',classId=>{
  const machine=motorsportMachine('test',classId)
  const input={activeAeroMode:'corner' as const,airDensityKgM3:1.225,currentSpeedKph:240,
   deltaSeconds:.1,fuelLoadKg:20,gripMultiplier:1,
   dynamics:{straightness:1,roadGradeFraction:0,effectiveCornerRadiusM:100000},
   combustionPowerKw:0,ersPowerKw:0,throttlePercent:0,brakePercent:0}
  const wake=trafficAero(15,0,240/3.6,100000,classId)
  const free=integrateMotorsportVehicle(machine,input)
  const tow=integrateMotorsportVehicle(machine,{...input,towDragReduction:1-wake.dragScale,dirtyAirDownforceMultiplier:wake.liftScale})
  expect(tow.dragForceN).toBeLessThan(free.dragForceN)
  expect(tow.speedKph).toBeGreaterThan(free.speedKph)
  expect(tow.wheelDrivePowerKw).toBe(free.wheelDrivePowerKw)
  expect(trafficAero(15,4,240/3.6,100000,classId)).toEqual({dragScale:1,liftScale:1})
  expect(trafficAero(200,0,240/3.6,100000,classId)).toEqual({dragScale:1,liftScale:1})
  expect(trafficAero(2,0,0,100000,classId)).toEqual({dragScale:1,liftScale:1})
 })
 it('distinguishes body styles and the Indy oval package, with a cornering cost',()=>{
  expect(trafficAero(20,0,60,10000,'gt300').dragScale).toBeLessThan(trafficAero(20,0,60,10000,'hypercar').dragScale)
  expect(trafficAero(20,0,60,10000,'indycar',true).dragScale).toBeLessThan(trafficAero(20,0,60,10000,'indycar',false).dragScale)
  expect(trafficAero(20,0,60,120,'gt500').liftScale).toBeLessThan(trafficAero(20,0,60,120,'kyojo').liftScale)
  expect(trafficAero(20,0,60,120,'gt300').dragScale).toBe(1)
 })
 it.each(['kyojo','super-gt','wec','indycar'] as const)('%s starts a braking move in equal hardware with all extra power disabled',category=>{
  const config=createMotorsportConfig(category)
  const entry=config.entries[0]
  const machine={...entry.machine,hybridPowerKw:{...entry.machine.hybridPowerKw,value:0},hybridCapacityMj:{...entry.machine.hybridCapacityMj,value:0}}
  config.entries=config.entries.slice(0,2).map((e,i)=>({...e,team:`test-${i}`,classId:entry.classId,machine}))
  config.course={...config.course,lengthM:4000,points:[[0,0],[1500,0],[1500,500],[0,500]]}
  const initial=createMotorsportRace(config)
  const state={...initial,phase:'racing' as const,raceSeconds:30,cars:initial.cars.map((car,i)=>({...car,
   distanceM:200+i*20,speedMps:20,lateralM:0,tyreTemperatureC:90,
   fuelKg:initial.cars[0].fuelKg,hybridEnergyMj:0,pushToPassSeconds:0,
   brakePercent:i?35:0,throttlePercent:i?0:100}))}
  const next=advanceMotorsportRace(state,1,config)
  expect(next.cars[0].driverIntent).toBe('attack')
  expect(next.cars[0].battle?.opponentId).toBe(next.cars[1].entryId)
  expect(next.cars[0].hybridPowerKw).toBe(0)
  expect(next.cars[0].pushToPassSeconds).toBe(0)
 })
})
