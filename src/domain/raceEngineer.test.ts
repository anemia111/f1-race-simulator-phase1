import {expect,it} from 'vitest'
import {phaseOneConfig} from '../data/phaseOne'
import {seriesPackageById} from '../series/seriesRegistry'
import {createInitialRace,advanceRace} from '../simulation/race'
import {defaultCarSetup} from '../simulation/engineering'
import {drivingSignature,signaturePedalControl} from '../simulation/drivingSignature'
import {advancePedals} from '../simulation/pedalControl'
import {createMotorsportConfig} from '../motorsport/packages'
import {advanceMotorsportRace,createMotorsportRace} from '../motorsport/race'
import {engineeringMachine,motorsportEngineerSession} from '../motorsport/engineering'
import {behaviorDriverFor} from '../motorsport/driverBehavior'
import {parseMotorsportSave,serializeMotorsportSave} from '../motorsport/persistence'
import {parseRaceCheckpoint,serializeRaceCheckpoint} from '../hooks/raceSession'
import {applyFormulaEngineeringPlan,applyMotorsportEngineeringPlan} from './engineeringCommands'
import {formulaEngineerSession} from './engineerAdapters'
import {makeEngineeringPlan,practiceConfounds,practiceMeasurement,settleEngineeringPlan,strategyScenarios,validEngineeringPlan,watchMoments,type EngineerCar,type EngineerSession} from './raceEngineer'

const car=(id='a',overrides:Partial<EngineerCar>={}):EngineerCar=>({id,name:id,color:'#fff',team:id,classId:'f1',driver:phaseOneConfig.drivers[0],distance:5.5,position:1,running:true,inPit:false,pitStops:0,lapTimes:[90,90,90],bestLap:90,lastLap:91,samples:[],tyreLife:.7,fuelLaps:20,pitLoss:22,pitAllowed:true,setup:{...defaultCarSetup},setupLocked:false,...overrides})
const session=(cars:EngineerCar[],overrides:Partial<EngineerSession>={}):EngineerSession=>({key:'test',seconds:500,lengthM:5000,remainingLaps:20,practice:false,race:true,flag:'clear',weather:'clear',grip:1,cars,...overrides})
const lap=(index:number)=>Array.from({length:101},(_,i)=>({lap:index,progress:i*.0099,seconds:index*100+i*.99,speedKph:200+i,throttlePercent:90,brakePercent:0,gear:6,rpm:9000,fuelKg:50-i*.01,tyreLifePercent:95-i*.02,lateralG:2,driveSlipPercent:5}))

it('compares only the same class and gates extension by fuel, distance and mandatory work',()=>{
  const a=car(),b=car('b',{distance:5.4}),other=car('gt',{classId:'gt300',distance:6})
  const s=session([a,b,other]),choices=strategyScenarios(s,a)
  expect(choices[0]).toMatchObject({position:2,low:2,high:2,loss:22,allowed:true})
  expect(strategyScenarios(s,{...a,fuelLaps:3})[1].allowed).toBe(false)
  expect(strategyScenarios(s,{...a,mandatoryReason:'stint limit'})[2].allowed).toBe(false)
  expect(strategyScenarios({...s,remainingLaps:3},a)[1].allowed).toBe(false)
  expect(strategyScenarios({...s,flag:'sc'},a)[0].loss).toBeLessThan(22)
  expect(makeEngineeringPlan(s,a,choices[1]).dueDistance).toBe(8.5)
})
it('gives worn tyres a measurable extension cost without changing the simulated clock',()=>{
  const a=car('a',{tyreLife:.15}),s=session([a]),choices=strategyScenarios(s,a)
  expect(choices[0].cost+choices[0].uncertainty).toBeLessThan(choices[1].cost)
  expect(s.seconds).toBe(500)
  expect(validEngineeringPlan(makeEngineeringPlan(s,a,choices[0]))).toBe(true)
  expect(validEngineeringPlan({...makeEngineeringPlan(s,a,choices[0]),positionLow:4,positionHigh:1})).toBe(false)
  expect(validEngineeringPlan({...makeEngineeringPlan(s,a,choices[0]),dueDistance:NaN})).toBe(false)
})
it('recognizes closing battles, tyre offsets and multiclass traffic without predicting FP overtakes',()=>{
  const a=car('a',{distance:5.5,lapTimes:[89,89,89],tyreLife:.9}),b=car('b',{distance:5.52,lapTimes:[90,90,90],tyreLife:.6}),gt=car('gt',{classId:'gt',distance:4.55,lapTimes:[110,110,110]})
  const moments=watchMoments(session([a,b,gt]))
  expect(moments.some(m=>m.id==='catch:a'&&m.opponentId==='b')).toBe(true)
  expect(moments.some(m=>m.id==='tyre:a')).toBe(true)
  expect(moments.some(m=>m.id==='traffic:a'&&m.opponentId==='gt')).toBe(true)
  expect(watchMoments(session([a,b,gt],{race:false,practice:true})).some(m=>m.id.startsWith('catch:')||m.id.startsWith('traffic:'))).toBe(false)
  expect(watchMoments(session([car('pb',{lastLap:88,bestLap:88})]))[0].id).toBe('pb:pb')
})
it('requires a full observed lap after setup became stable, keeps aggregates and discloses confounds',()=>{
  const a=car('a',{samples:[...lap(1),...lap(2).slice(0,10)]}),s=session([a],{practice:true,race:false})
  expect(practiceMeasurement(a,s,101)).toBeNull()
  const before=practiceMeasurement(a,s,100)!
  expect(before.lap).toBe(1)
  expect(before.topSpeed).toBe(300)
  expect(before).not.toHaveProperty('samples')
  const after={...before,weather:'wet',fuel:30,tyreLife:60,grip:.7}
  expect(practiceConfounds(before,after)).toHaveLength(5)
  expect(practiceMeasurement({...a,samples:a.samples.filter(p=>p.progress<.4||p.progress>.6)},s,0)).toBeNull()
  expect(practiceMeasurement({...a,eligiblePracticeLaps:[]},s,0)).toBeNull()
  expect(practiceMeasurement({...a,eligiblePracticeWindows:[{start:0,end:99}]},s,0)).toBeNull()
  expect(practiceMeasurement({...a,eligiblePracticeWindows:[{start:100,end:200}]},s,0)?.lap).toBe(1)
})
it('applies style to real pedal travel while preserving traction limits and immediate safety braking',()=>{
  const base=phaseOneConfig.drivers[0],entry=drivingSignature({...base,style:{...base.style,brakingAggression:.9,cornerShapePreference:.8}}),exit=drivingSignature({...base,style:{...base.style,brakingAggression:.2,cornerShapePreference:-.8}})
  expect(entry.entry).toBeGreaterThan(exit.entry)
  const input={throttle:100,brake:0,previousThrottle:0,previousBrake:0,seconds:.1}
  const a=advancePedals({...input,style:signaturePedalControl(entry,0)}),b=advancePedals({...input,style:signaturePedalControl(exit,0)})
  expect(a.throttle).not.toBe(b.throttle)
  const limited=advancePedals({...input,throttle:20,style:signaturePedalControl(exit,1)})
  expect(limited.throttle).toBeLessThanOrEqual(20)
  expect(advancePedals({...input,stop:true,style:signaturePedalControl(entry,1)})).toEqual({throttle:0,brake:100})
  expect(signaturePedalControl(exit,0,.1).throttleRiseScale).toBeLessThan(signaturePedalControl(exit,0,1).throttleRiseScale)
})
it('keeps an unconfigured person’s SIM preferences identical across categories without changing ability',()=>{
  const formula=phaseOneConfig.drivers.find(d=>d.id==='yuki_nakayama')!,person={id:formula.id,name:formula.name,overall:120,racePace:1.2,consistency:1.2,tyreManagement:1.2,ratingSource:null}
  const a=drivingSignature(formula),b=drivingSignature(behaviorDriverFor(person))
  expect(a.basis).toBe('simulated')
  expect([a.entry,a.rotation,a.exit]).toEqual([b.entry,b.rotation,b.exit])
  const edited=drivingSignature({...formula,style:{...formula.style,brakingAggression:.9}})
  expect(edited.entry).toBe(.9)
  expect(edited.basis).toBe('authored')
  expect(formula.performanceSource?.overall).toBe(120)
})
it('records the first physical rejoin and keeps that result as subsequent positions change',()=>{
  const a=car(),s=session([a]),plan=makeEngineeringPlan(s,a,strategyScenarios(s,a)[0])
  expect(settleEngineeringPlan(plan,{pitStops:0,inPit:true,position:3,running:true})).toBe(plan)
  const pit=settleEngineeringPlan(plan,{pitStops:1,inPit:true,position:3,running:true})!
  expect(pit.status).toBe('in-pit')
  const done=settleEngineeringPlan(pit,{pitStops:1,inPit:false,position:4,running:true})!
  expect(done).toMatchObject({status:'complete',actualPosition:4})
  expect(settleEngineeringPlan(done,{pitStops:1,inPit:false,position:2,running:true})).toBe(done)
  expect(settleEngineeringPlan(plan,{pitStops:0,inPit:false,position:3,running:false})?.status).toBe('cancelled')
})
it('changes extra-category aero through SIM coefficients, preserves hardware and omits KYOJO wings',()=>{
  const gt=createMotorsportConfig('super-gt').entries[0],driver={...gt.drivers[0],setup:{...defaultCarSetup,rearWing:10}}
  const adjusted=engineeringMachine(gt.machine,driver)
  expect(adjusted.dragAreaM2.value).toBeGreaterThan(gt.machine.dragAreaM2.value)
  expect(adjusted.liftAreaM2.basis).toBe('simulation')
  expect(adjusted.powerKw).toBe(gt.machine.powerKw)
  expect(engineeringMachine(gt.machine,driver)).toBe(adjusted)
  const kyojo=createMotorsportConfig('kyojo').entries[0]
  expect(engineeringMachine(kyojo.machine,{...kyojo.drivers[0],setup:driver.setup})).toBe(kyojo.machine)
})
it('routes a planned stop into each formula runtime at a real timing crossing and saves the plan',()=>{
  for(const seriesId of ['f1-custom','super-formula'] as const){
    const series=seriesPackageById.get(seriesId)!,config={...phaseOneConfig,seriesId,drivers:series.drivers.slice(0,2),teams:series.teams,track:series.tracks[0],weekendStage:'race' as const,sessionRaceLapsOverride:20}
    const base=createInitialRace(config),snapshot={...base,startProcedure:'racing' as const,raceStartedAtSeconds:0,elapsedSeconds:300,cars:base.cars.map((c,i)=>({...c,position:i+1,totalDistance:2.999999-i*.2,lap:2,processedLap:2,progress:.999999-i*.2,speedKph:250,currentLapStartedAtSeconds:210}))}
    const view=formulaEngineerSession(config,snapshot),chosen=view.cars[0],plan=makeEngineeringPlan(view,chosen,strategyScenarios(view,chosen)[0])
    const accepted=applyFormulaEngineeringPlan(snapshot,config,chosen.id,plan)
    expect(accepted.cars[0].engineeringPlan?.status).toBe('scheduled')
    const next=advanceRace(accepted,.1,config),stopped=next.cars.find(c=>c.driverId===chosen.id)!
    expect(stopped.status,seriesId).toBe('pit')
    expect(stopped.engineeringPlan?.status).toBe('in-pit')
    expect(stopped.runtimeSystems.kind).toBe(seriesId==='super-formula'?'super-formula':'f1')
    if(stopped.runtimeSystems.kind==='super-formula'){
      const runtime=stopped.runtimeSystems,surface=runtime.liveTires.activeSurface,before=runtime.controlTires.sets[surface].remainingSets
      const released=advanceRace({...next,cars:next.cars.map(c=>c===stopped?{...c,pitUntilSeconds:next.elapsedSeconds,pitPhase:'lane' as const}:c)},.1,config).cars.find(c=>c.driverId===chosen.id)!
      expect(released.runtimeSystems.kind).toBe('super-formula')
      if(released.runtimeSystems.kind==='super-formula')expect(released.runtimeSystems.controlTires.sets[surface].remainingSets).toBe(before-1)
      expect(released.fuelLoadKg).toBeLessThanOrEqual(stopped.fuelLoadKg)
    }
    const saved=parseRaceCheckpoint(serializeRaceCheckpoint('engineer',next,1000),'engineer',config,1001)
    expect(saved?.cars.find(c=>c.driverId===chosen.id)?.engineeringPlan?.status).toBe('in-pit')
    expect(applyFormulaEngineeringPlan(snapshot,{...config,weekendStage:'qualifying'},chosen.id,plan)).toBe(snapshot)
  }
})
it('applies and persists a multiclass BOX instruction without resetting the field or accepting illegal category stops',()=>{
  const config=createMotorsportConfig('super-gt'),base=createMotorsportRace(config)
  const state={...base,phase:'racing' as const,raceSeconds:300,cars:base.cars.map(c=>({...c,distanceM:3.5*config.course.lengthM,laps:3}))}
  const view=motorsportEngineerSession(config,state),a=view.cars[0],plan=makeEngineeringPlan(view,a,strategyScenarios(view,a)[0])
  const accepted=applyMotorsportEngineeringPlan(state,config,a.id,plan)
  const next=advanceMotorsportRace(accepted,1,config),actual=next.cars.find(c=>c.entryId===a.id)!
  expect(actual.pitRequest).not.toBeNull()
  expect(next.cars).toHaveLength(state.cars.length)
  expect(parseMotorsportSave(serializeMotorsportSave(config,next))?.state.cars.find(c=>c.entryId===a.id)?.engineeringPlan).toEqual(plan)
  expect(applyMotorsportEngineeringPlan(state,config,a.id,{...plan,positionHigh:999})).toBe(state)
  const k=createMotorsportConfig('kyojo'),ks=createMotorsportRace(k)
  expect(applyMotorsportEngineeringPlan(ks,k,ks.cars[0].entryId,plan)).toBe(ks)
})
it('lets extra-category AI stop for measured tyre economics and keeps mandatory crew work ahead of a manual plan',()=>{
  const original=createMotorsportConfig('super-gt'),config={...original,entries:original.entries.slice(0,2),maximumStintSeconds:600},base=createMotorsportRace(config)
  const history=[1,2,3].map(lap=>({lap,seconds:90,driverIndex:0,compound:'primary',pit:false}))
  const state={...base,phase:'racing' as const,raceSeconds:300,cars:base.cars.map(c=>({...c,distanceM:3.5*config.course.lengthM,laps:3,tyreLife:.3,lapHistory:history}))}
  const next=advanceMotorsportRace(state,1,config)
  expect(next.cars.some(c=>c.strategyReason?.startsWith('AI:')&&c.pitRequest!==null)).toBe(true)
  const ending={...config,format:{kind:'laps' as const,laps:5,basis:'short constraint check'}}
  expect(advanceMotorsportRace(state,1,ending).cars.every(c=>c.pitRequest===null)).toBe(true)
  const due={...state,cars:state.cars.map(c=>({...c,stintSeconds:config.maximumStintSeconds,driverSeconds:c.driverSeconds.map((_,i)=>i===0?300:0)}))}
  const view=motorsportEngineerSession(config,due),a=view.cars[0],plan=makeEngineeringPlan(view,a,strategyScenarios(view,a)[0])
  const accepted=applyMotorsportEngineeringPlan(due,config,a.id,plan)
  const stop=advanceMotorsportRace(accepted,1,config).cars.find(c=>c.entryId===a.id)!
  expect(stop.pitRequest?.nextDriverIndex).toBe(1)
})
it('keeps per-person setups in extra-category saves and rejects out-of-range setup data',()=>{
  const config=createMotorsportConfig('indycar')
  config.entries[0].drivers[0]={...config.entries[0].drivers[0],setup:{...defaultCarSetup,rearWing:9}}
  const state=createMotorsportRace(config)
  expect(parseMotorsportSave(serializeMotorsportSave(config,state))?.config.entries[0].drivers[0].setup?.rearWing).toBe(9)
  config.entries[0].drivers[0].setup!.rearWing=99
  expect(parseMotorsportSave(serializeMotorsportSave(config,state))).toBeNull()
})
