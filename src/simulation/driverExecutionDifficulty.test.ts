import {describe,it,expect} from 'vitest'
import {initialDrivers} from '../data/grid2026'
import type {Driver} from '../types'
import {advancePedals} from './pedalControl'
import {driverMachineDifficulty,MACHINE_DIFFICULTIES} from './driverMachineDifficulty'
import {decideDriverBehavior,type DriverDecisionContext} from './driverDecision'
import {createMotorsportConfig} from '../motorsport/packages'
import {behaviorDriverFor} from '../motorsport/driverBehavior'
import {createMotorsportRace,validateMotorsportConfig} from '../motorsport/race'
import {serializeMotorsportSave,parseMotorsportSave} from '../motorsport/persistence'

const rated=(value:number):Driver=>({...initialDrivers[0],id:'yuki_nakayama',skills:Object.fromEntries(Object.keys(initialDrivers[0].skills).map(key=>[key,value])) as Driver['skills']})
describe('independent execution skills and machine demands',()=>{
  it('picks up throttle earlier with control skill and lifts earlier when wheels spin',()=>{
    const base={throttle:100,brake:0,previousThrottle:25,previousBrake:0,seconds:0.1}
    const run=(skill:number,driveSlip=0,previousThrottle=25)=>advancePedals({...base,previousThrottle,feedback:{lateralUse:0.8,driveSlip,brakeSlip:0,skill}})
    expect(run(1.2).throttle).toBeGreaterThan(run(1).throttle)
    expect(run(1).throttle).toBeGreaterThan(run(0.67).throttle)
    expect(run(1.2,0.18,90).throttle).toBeLessThan(run(0.67,0.18,90).throttle)
    for(const skill of [0.67,1,1.2])expect(advancePedals({...base,seconds:2,feedback:{lateralUse:0,driveSlip:0,brakeSlip:0,skill}}).throttle).toBe(100)
  })
  it('keeps brake execution independent from throttle skill',()=>{
    const run=(skill:number)=>advancePedals({throttle:100,brake:0,previousThrottle:0,previousBrake:70,seconds:0.1,feedback:{lateralUse:0.7,driveSlip:0,brakeSlip:0,skill,brakeSkill:0.8}})
    expect(run(1.2).brake).toBe(run(0.3).brake)
    expect(run(1.2).throttle).toBe(0)
  })
  it('keeps a capable driver in the tow longer but pulls out when close',()=>{
    const context:DriverDecisionContext={seed:'tow-execution',driver:rated(1.2),lap:3,trackProgress:0.3,currentLateralOffsetM:1.4,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,
      attack:{active:true,opponentId:'front',opponentLateralOffsetM:1.4,gapSeconds:0.7,intensity:1},
      tow:{active:true,opponentId:'front',opponentLateralOffsetM:1.4,gapSeconds:0.7,intensity:0.6}}
    expect(decideDriverBehavior(context).intent).toBe('tow-alignment')
    expect(decideDriverBehavior({...context,driver:rated(0.67)}).intent).toBe('attack')
    expect(decideDriverBehavior({...context,tow:{...context.tow!,gapSeconds:0.35}}).intent).toBe('attack')
    expect(decideDriverBehavior({...context,flagState:'yellow'}).intent).toBe('controlled-flag')
    expect(decideDriverBehavior({...context,currentLateralOffsetM:-1.4}).intent).toBe('attack')
  })
  it('improves physical tow alignment over many seeds without changing wake strength',()=>{
    let high=0,low=0
    for(let seed=0;seed<100;seed++){
      const context:DriverDecisionContext={seed:`tow-${seed}`,driver:rated(1.2),lap:2,trackProgress:0.5,currentLateralOffsetM:0,physicalReferenceLineOffsetM:0,trackHalfWidthM:6,
        tow:{active:true,opponentId:'front',opponentLateralOffsetM:1.8,intensity:0.8}}
      high+=Math.abs(1.8-decideDriverBehavior(context).desiredLateralOffsetM)
      low+=Math.abs(1.8-decideDriverBehavior({...context,driver:rated(0.67)}).desiredLateralOffsetM)
    }
    expect(high).toBeLessThan(low*0.65)
  })
  it('strongly penalises an underqualified F1 driver but leaves an appropriate KYOJO drive alone',()=>{
    const driver=rated(0.67),f1=driverMachineDifficulty(driver,'f1-custom'),sf=driverMachineDifficulty(driver,'super-formula'),kyojo=driverMachineDifficulty(driver,'kyojo')
    expect(f1.gripUtilisation).toBeLessThan(0.8)
    expect(f1.pedalRateScale).toBeLessThan(0.7)
    expect(sf.gripUtilisation).toBeGreaterThan(f1.gripUtilisation)
    expect(kyojo.gripUtilisation).toBe(1)
    expect(kyojo.pedalRateScale).toBe(1)
    for(const category of Object.keys(MACHINE_DIFFICULTIES))expect(driverMachineDifficulty(rated(1.2),category).gripUtilisation).toBe(1)
  })
  it('does not hide a missing control skill behind high pace ratings',()=>{
    const driver=rated(1);driver.skills.throttleControl=0.2
    expect(driverMachineDifficulty(driver,'f1-custom').shortfall).toBeGreaterThan(10)
    expect(driverMachineDifficulty(rated(0.88),'f1-custom').gripUtilisation).toBe(1)
  })
  it.each(['kyojo','super-gt','wec','indycar'] as const)('%s retains a single detailed edit and rejects an incomplete profile',category=>{
    const config=createMotorsportConfig(category),person=config.entries[0].drivers[0]
    const before=behaviorDriverFor(person).skills
    person.skills={...before,throttleControl:0.62}
    expect(behaviorDriverFor({...person}).skills.throttleControl).toBe(0.62)
    const saved=parseMotorsportSave(serializeMotorsportSave(config,createMotorsportRace(config)))!
    expect(saved.config.entries[0].drivers[0].skills).toEqual(person.skills)
    expect(saved.config.entries[0].drivers[0].skills!.brakingSkill).toBe(before.brakingSkill)
    person.skills={throttleControl:0.62} as Driver['skills']
    expect(()=>validateMotorsportConfig(config)).toThrow('Invalid detailed driver skills')
  })
})
