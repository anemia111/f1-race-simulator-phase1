import {expect,it} from 'vitest'
import {createInitialRace,advanceRace} from './race'
import {seriesPackageById} from '../series/seriesRegistry'
import {createMotorsportConfig} from '../motorsport/packages'
import {createMotorsportRace,advanceMotorsportRace} from '../motorsport/race'
import {parseMotorsportSave,serializeMotorsportSave} from '../motorsport/persistence'

it.each(['f1-custom','super-formula'] as const)('%s records extended live force channels with category-owned energy only',id=>{
  const series=seriesPackageById.get(id)!
  const config={drivers:series.drivers.slice(0,1),teams:series.teams,track:series.tracks[0],seriesId:id,seed:'telemetry',weekendStage:'race' as const,sessionRaceLapsOverride:10}
  const initial=createInitialRace(config)
  const car={...initial.cars[0],speedKph:150,progress:0.3,totalDistance:2.3,lap:2,processedLap:2,status:'running' as const,pitPhase:'none' as const}
  const state=advanceRace({...initial,cars:[car],startProcedure:'racing',elapsedSeconds:100,raceStartedAtSeconds:0},0.1,config)
  const sample=state.cars[0].telemetryHistory!.at(-1)!
  expect(sample.fuelKg).toBeCloseTo(state.cars[0].fuelLoadKg,2)
  expect(sample.tyreFLTemperatureC).toBeDefined()
  expect(sample.longitudinalG).toBeDefined()
  if(id==='super-formula')expect(sample.energyPercent).toBeUndefined()
  else expect(sample.energyPercent).toBeDefined()
})
it.each(['kyojo','super-gt','wec','indycar'] as const)('%s preserves actual temperatures, fuel and hybrid availability in saves',category=>{
  const config=createMotorsportConfig(category);config.entries=config.entries.slice(0,1)
  const initial=createMotorsportRace(config)
  initial.cars[0].speedMps=40
  const state=advanceMotorsportRace({...initial,phase:'racing'},1,config)
  const car=state.cars[0],sample=car.telemetryHistory!.at(-1)!
  expect(sample.fuelKg).toBeCloseTo(car.fuelKg,1)
  expect(sample.tyreLifePercent).toBeCloseTo(car.tyreLife*100,1)
  expect(sample.tyreFLTemperatureC).toBeCloseTo(car.handlingState!.wheels[0].surfaceC,1)
  if(config.entries[0].machine.hybridCapacityMj.value===0)expect(sample.energyPercent).toBeUndefined()
  else expect(sample.energyPercent).toBeDefined()
  expect(parseMotorsportSave(serializeMotorsportSave(config,state))?.state.cars[0].telemetryHistory).toEqual(car.telemetryHistory)
})
