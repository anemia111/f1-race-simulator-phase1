import { describe, expect, it, vi } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { catalogPoolDriverById } from '../series/expansionCatalog'
import { freeDrivers } from '../motorsport/freeMode'
import { createMotorsportConfig } from '../motorsport/packages'
import { advanceMotorsportRace, createMotorsportRace } from '../motorsport/race'
import { behaviorDriverFor } from '../motorsport/driverBehavior'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import { driverTyreEnvelopeUtilisation } from './driverAbility'
import { driverBehaviorTraits } from './driverDecision'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import * as dynamics from './vehicleDynamics'
import type { DriverSkillProfile, RaceConfig } from '../types'

describe('Nakayama 120 and shared category execution',()=>{
  it('retains 120 in the cross-category pool, vehicle selection and named driving traits',()=>{
    const pool=catalogPoolDriverById.get('yuki_nakayama')!
    expect(pool.overall).toBe(120)
    expect(Object.values(pool.ratings).every(v=>v===1.2)).toBe(true)
    const selected=freeDrivers.find(d=>d.id==='yuki_nakayama')!
    expect([selected.overall,selected.racePace,selected.qualifyingPace,selected.consistency,selected.tyreManagement]).toEqual([120,1.2,1.2,1.2,1.2])
    expect(driverBehaviorTraits(behaviorDriverFor(selected)).tyreLimitUtilisation).toBeCloseTo(1.2)
  })
  it.each(['f1-custom','super-formula'] as const)('%s passes increasing ability through 120 into the actual tyre force calculation',id=>{
    const series=seriesPackageById.get(id)!
    const reference=seriesPackageById.get('f1-custom')!.drivers.find(d=>d.id==='yuki_nakayama')!
    const spy=vi.spyOn(dynamics,'integrateVehicleLongitudinalStep')
    try {
      const results=[1,1.1,1.2].map(rating=>{
        const driver={...reference,teamId:series.teams[0].id,skills:Object.fromEntries(Object.keys(reference.skills).map(key=>[key,rating])) as DriverSkillProfile}
        const config:RaceConfig={drivers:[driver],teams:series.teams,track:series.tracks[0],seriesId:id,seed:'shared-120',weekendStage:'qualifying',sessionDurationSeconds:900}
        const car={...createInitialRace(config).cars[0],status:'running' as const,pitPhase:'none' as const,timedRunPhase:'attack-lap' as const,speedKph:150,progress:0.3,totalDistance:2.3,clutchEngagementFraction:1}
        calculateCarTelemetry({car,driver,team:series.teams[0],track:config.track,seriesId:id,deltaSeconds:0.1,elapsedSeconds:200,phase:null,lowGripConditions:false,raceLap:2,trackGrip:1,weather:'clear',weekendStage:'qualifying'})
        return spy.mock.calls.at(-1)![0].gripMultiplier
      })
      expect(results[1]).toBeGreaterThan(results[0])
      expect(results[2]).toBeGreaterThan(results[1])
      expect(results[2]/results[0]).toBeCloseTo(1/driverTyreEnvelopeUtilisation(1),5)
    } finally {spy.mockRestore()}
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s restores untouched old Nakayama ratings to 120 and preserves manual edits',category=>{
    const reference=freeDrivers.find(d=>d.id==='yuki_nakayama')!
    const config=createMotorsportConfig(category)
    config.entries=[{...config.entries[0],drivers:[{...reference,overall:110,racePace:1.1,qualifyingPace:1.1,consistency:1.1,tyreManagement:1.1}]}]
    const restored=parseMotorsportSave(serializeMotorsportSave(config,createMotorsportRace(config)))!
    expect(restored.config.entries[0].drivers[0].overall).toBe(120)
    expect(restored.config.entries[0].drivers[0].racePace).toBe(1.2)
    config.entries[0].drivers[0].racePace=1.03
    const edited=parseMotorsportSave(serializeMotorsportSave(config,createMotorsportRace(config)))!
    expect(edited.config.entries[0].drivers[0].racePace).toBe(1.03)
  })
  it.each((['kyojo','super-gt','wec','indycar'] as const).flatMap(category=>(['practice','qualifying','race'] as const).map(sessionKind=>({category,sessionKind}))))('$category $sessionKind uses ability in force capacity, with identical hardware',({category,sessionKind})=>{
    const reference=freeDrivers.find(d=>d.id==='yuki_nakayama')!
    const spy=vi.spyOn(dynamics,'integrateVehicleLongitudinalStep')
    try {
      const inputs=[1,1.1,1.2].map(rating=>{
        const config=createMotorsportConfig(category)
        config.entries=[{...config.entries[0],drivers:[{...reference,racePace:rating,qualifyingPace:rating}]}]
        config.sessionKind=sessionKind
        if(sessionKind!=='race')config.format={kind:'time',seconds:900,basis:'SIM test'}
        const state={...createMotorsportRace(config),phase:'racing' as const}
        state.cars[0]={...state.cars[0],status:'running',distanceM:config.course.lengthM*0.3,speedMps:35,tyreTemperatureC:90}
        advanceMotorsportRace(state,1,config)
        return spy.mock.calls.at(-1)![0]
      })
      expect(inputs[1].gripMultiplier).toBeGreaterThan(inputs[0].gripMultiplier)
      expect(inputs[2].gripMultiplier).toBeGreaterThan(inputs[1].gripMultiplier)
      expect(inputs[2].gripMultiplier/inputs[0].gripMultiplier).toBeCloseTo(1/driverTyreEnvelopeUtilisation(1),5)
      expect(inputs[2].baseVehicleMassKg).toBe(inputs[0].baseVehicleMassKg)
      expect(inputs[2].combustionPowerKw).toBe(inputs[0].combustionPowerKw)
    } finally {spy.mockRestore()}
  })
})
