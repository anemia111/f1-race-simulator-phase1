import { describe, expect, it } from 'vitest'
import { advanceRaceTyre, initialRaceTyre, raceTyreGrip, validRaceTyre, type RaceTyreCategory } from './raceTyres'
import { createMotorsportConfig } from '../motorsport/packages'
import { advanceMotorsportRace, createMotorsportRace } from '../motorsport/race'
import { serializeMotorsportSave, parseMotorsportSave } from '../motorsport/persistence'
import { createSuperFormulaLiveTireRuntime, fitSuperFormulaLiveControlTire } from './superFormulaLiveTires'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace, skipFormationLap, advanceRace } from './race'
import { targetSpeedMps } from '../motorsport/coursePhysics'
import { superFormulaSimulatedTyreFor } from './superFormulaLiveTires'

const input: Parameters<typeof advanceRaceTyre>[1] = { category: 'super-formula', compound: 'primary', seconds: 1, distanceM: 50, speedMps: 50, demand: 0.8, massRatio: 1, management: 0.8, pace: 'standard', trackC: 32, wet: false }
function stint(category: RaceTyreCategory, km: number, patch: Partial<typeof input> = {}) {
  let state = initialRaceTyre(90)
  for (let i = 0; i < km * 20; i++) state = advanceRaceTyre(state, { ...input, category, ...patch })
  return state
}
describe('category tyre work, temperature and driven lap time', () => {
  it('keeps planned corner speed continuous at a cached grip-bin boundary', () => {
    const config=createMotorsportConfig('super-gt'), machine=config.entries[0].machine
    const conditions={massKg:machine.massKg.value+machine.driverMassKg.value+20,gripScale:1}
    for(let i=0;i<512;i++) {
      const distance=i/512*config.course.lengthM
      const fresh=targetSpeedMps(config.course,machine,distance,conditions)
      const tinyWear=targetSpeedMps(config.course,machine,distance,{...conditions,gripScale:0.999999})
      expect(Math.abs(fresh-tinyWear)).toBeLessThan(0.001)
      expect(targetSpeedMps(config.course,machine,distance,{...conditions,gripScale:0.95})).toBeLessThanOrEqual(tinyWear+1e-7)
    }
    const sf=createSuperFormulaLiveTireRuntime(), legacy={...sf.liveTires,lapsOnCurrentSet:20}
    delete legacy.simulatedPerformance
    expect(superFormulaSimulatedTyreFor(legacy,5.8).life).toBeLessThan(0.7)
  })
  it('allows documented endurance distances instead of imposing F1 tyre life', () => {
    for (const category of ['hypercar', 'lmgt3', 'lmp2'] as const) {
      const long = stint(category, 600)
      expect(long.life).toBeGreaterThan(0.28)
      expect(raceTyreGrip(long, category, 'primary')).toBeGreaterThan(0.94)
    }
    expect(stint('super-formula', 200).life).toBeLessThan(stint('hypercar', 200).life)
  })
  it('gives alternates fresh grip, shorter life and greater late-stint drop-off without adding oval alternates', () => {
    const fresh = initialRaceTyre(90)
    expect(raceTyreGrip(fresh,'indycar','alternate')).toBeGreaterThan(raceTyreGrip(fresh,'indycar','primary'))
    const primary = stint('indycar',180), alternate = stint('indycar',180,{compound:'alternate'})
    expect(alternate.life).toBeLessThan(primary.life)
    expect(raceTyreGrip(alternate,'indycar','alternate')).toBeLessThan(raceTyreGrip(primary,'indycar','primary'))
    expect(raceTyreGrip(fresh,'indycar','alternate',true)).toBe(raceTyreGrip(fresh,'indycar','primary',true))
  })
  it('preserves permanent wear while cold/hot losses recover; loads, management and saving matter', () => {
    const base = stint('gt500',70)
    expect(stint('gt500',70,{pace:'push',massRatio:1.1,management:0.5}).life).toBeLessThan(base.life)
    expect(stint('gt500',70,{pace:'save',massRatio:0.9,management:1}).life).toBeGreaterThan(base.life)
    const worn = {...initialRaceTyre(140,0.4), damage:0.3}, cooled = advanceRaceTyre(worn,{...input,seconds:300,distanceM:0,demand:0,speedMps:0,trackC:90})
    expect(cooled.life).toBe(worn.life);expect(cooled.damage).toBe(worn.damage)
    expect(raceTyreGrip(cooled,'super-formula','primary')).toBeGreaterThan(raceTyreGrip(worn,'super-formula','primary'))
    expect(stint('gt300',40,{compound:'wet',wet:false}).life).toBeLessThan(stint('gt300',40,{compound:'wet',wet:true}).life)
  })
  it.each(['kyojo','gt500','gt300','hypercar','lmgt3','lmp2','indycar'] as const)('%s used tyres cost actual crossing time with identical fuel and driver', classId => {
    const category = classId==='kyojo'?'kyojo':classId==='indycar'?'indycar':classId==='gt500'||classId==='gt300'?'super-gt':'wec'
    const base=createMotorsportConfig(category,classId==='lmp2'?'wec:3':undefined), config={...base,entries:[base.entries.find(entry=>entry.classId===classId)!],format:{kind:'laps' as const,laps:5,basis:'Controlled tyre test'}}
    const lap = (life: number) => {
      let state={...createMotorsportRace(config),phase:'racing' as const}
      state.cars[0]={...state.cars[0],speedMps:40,tyreLife:life,tyreTemperatureC:90,tyreState:initialRaceTyre(90,life)}
      for(let tick=0;tick<10000 && state.cars[0].laps<2;tick++) {
        state={...state,cars:state.cars.map(car=>({...car,fuelKg:20}))}
        state=advanceMotorsportRace(state,1,config) as typeof state
      }
      expect(state.cars[0].laps).toBe(2)
      return state.cars[0].lastLapSeconds!
    }
    expect(lap(0.4)).toBeGreaterThan(lap(1)+0.02)
  })
  it('restores exact tyre state and future trajectory, rejects corruption and retains legacy wear', () => {
    const config=createMotorsportConfig('wec');config.entries=config.entries.slice(0,1)
    const initial={...createMotorsportRace(config),phase:'racing' as const}
    const state=advanceMotorsportRace(initial,1000,config), save=parseMotorsportSave(serializeMotorsportSave(config,state))!
    expect(save.state.cars[0].tyreState).toEqual(state.cars[0].tyreState)
    expect(advanceMotorsportRace(save.state,100,save.config)).toEqual(advanceMotorsportRace(state,100,config))
    const legacy=structuredClone(state);delete legacy.cars[0].tyreState;legacy.cars[0].tyreLife=0.4
    expect(parseMotorsportSave(serializeMotorsportSave(config,legacy))).not.toBeNull()
    expect(advanceMotorsportRace(legacy,1,config).cars[0].tyreLife).toBeLessThan(0.4)
    const corrupt=structuredClone(state);corrupt.cars[0].tyreState!.coreC=Number.NaN
    expect(parseMotorsportSave(serializeMotorsportSave(config,corrupt))).toBeNull()
    expect(validRaceTyre({...initialRaceTyre(),graining:2})).toBe(false)
    const sf=createSuperFormulaLiveTireRuntime(), used={...sf,liveTires:{...sf.liveTires,simulatedPerformance:initialRaceTyre(120,0.3)}}
    expect(fitSuperFormulaLiveControlTire({runtime:used,surface:'dry'}).liveTires.simulatedPerformance?.life).toBe(1)
  })
  it.each(['f1-custom','super-formula'] as const)('%s wear changes actual lap time at equal fuel without borrowing another category model', seriesId => {
    const series=seriesPackageById.get(seriesId)!
    const config={seriesId,drivers:series.drivers.slice(0,1),teams:series.teams,track:{...series.tracks[0],rainProbability:0},seed:'tyre-actual-lap',weekendStage:'race' as const,freeMode:true,sessionRaceLapsOverride:10,overtakeSystem:seriesId==='super-formula'?'ots' as const:'active-aero' as const}
    const lap=(life:number)=>{
      let state=skipFormationLap({...createInitialRace(config),formationBehindSafetyCar:true,formationLapsPlanned:1,startLightSequenceSeconds:0},config)
      // Satisfy the dry compound obligation before this controlled stint so
      // strategy cannot replace both test tyres and erase the wear difference.
      state={...state,cars:state.cars.map(car=>({...car,runtimeSystems:car.runtimeSystems.kind==='f1'?{...car.runtimeSystems,tires:{...car.runtimeSystems.tires,compoundsUsed:['M','S'],tireWearPercent:(1-life)*100,tireTemperatureC:90,tireCarcassTemperatureC:90}}:car.runtimeSystems.kind==='super-formula'?{...car.runtimeSystems,liveTires:{...car.runtimeSystems.liveTires,simulatedPerformance:initialRaceTyre(90,life)}}:car.runtimeSystems}))}
      for(let i=0;i<800 && state.cars[0].lapHistory.filter(lap=>lap.isValid&&!lap.pitStop).length<2;i++) {
        state={...state,cars:state.cars.map(car=>({...car,fuelLoadKg:20}))}
        state=advanceRace(state,0.5,config)
      }
      const laps=state.cars[0].lapHistory.filter(lap=>lap.isValid&&!lap.pitStop)
      expect(laps.length).toBeGreaterThanOrEqual(2)
      expect(state.cars[0].pitStops).toBe(0)
      return laps.at(-1)!.lapTimeSeconds
    }
    expect(lap(0.4)).toBeGreaterThan(lap(1)+0.02)
  },30000)
})
