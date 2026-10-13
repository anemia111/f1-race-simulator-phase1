import { describe, expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'
import type { MotorsportClass, MotorsportRaceConfig } from './types'

function classCars(config: MotorsportRaceConfig, state: ReturnType<typeof createMotorsportRace>, classId: MotorsportClass) {
  const ids=new Set(config.entries.filter(e=>e.classId===classId).map(e=>e.id))
  return state.cars.filter(c=>ids.has(c.entryId)).sort((a,b)=>b.distanceM-a.distanceM)
}
describe('500 m between mixed-class start groups',()=>{
  it.each(['rolling','standing'] as const)('separates GT500 tail and GT300 pole at a %s start',start=>{
    const config={...createMotorsportConfig('super-gt'),start}
    const state=createMotorsportRace(config)
    const upper=classCars(config,state,'gt500'),lower=classCars(config,state,'gt300')
    expect(upper.at(-1)!.distanceM-lower[0].distanceM).toBe(500)
    expect(upper[0].distanceM).toBe(0)
    for(const group of [upper,lower])for(let i=1;i<group.length;i++)expect(group[i-1].distanceM-group[i].distanceM).toBe(9)
    expect(lower[0].lateralM).toBe(-1.5)
    // Formation and the skip equivalent keep the original actual road positions.
    const formed=advanceMotorsportRace({...state,formationSeconds:config.course.lengthM/(80/3.6)-0.1},1,config)
    expect(formed.phase).toBe('racing')
    expect(formed.cars.map(c=>c.distanceM)).toEqual(state.cars.map(c=>c.distanceM))
    const restored=parseMotorsportSave(serializeMotorsportSave(config,{...state,phase:'racing'}))!
    expect(restored.state.cars.map(c=>c.distanceM)).toEqual(state.cars.map(c=>c.distanceM))
  })
  it('separates Hypercar, LMP2 and LMGT3 groups, including a missing middle class',()=>{
    const config=createMotorsportConfig('wec','wec:3')
    const state=createMotorsportRace(config)
    const hyper=classCars(config,state,'hypercar'),lmp=classCars(config,state,'lmp2'),gt=classCars(config,state,'lmgt3')
    expect(hyper.at(-1)!.distanceM-lmp[0].distanceM).toBe(500)
    expect(lmp.at(-1)!.distanceM-gt[0].distanceM).toBe(500)
    const without={...config,entries:config.entries.filter(e=>e.classId!=='lmp2')},short=createMotorsportRace(without)
    expect(classCars(without,short,'hypercar').at(-1)!.distanceM-classCars(without,short,'lmgt3')[0].distanceM).toBe(500)
  })
  it('groups an interleaved manual grid by class while preserving each class order and configuration',()=>{
    const config=createMotorsportConfig('super-gt')
    const upper=config.entries.filter(e=>e.classId==='gt500').slice(0,2),lower=config.entries.filter(e=>e.classId==='gt300').slice(0,2)
    config.entries=[lower[1],upper[1],lower[0],upper[0]]
    const before=structuredClone(config),state=createMotorsportRace(config)
    expect(classCars(config,state,'gt500').map(c=>c.entryId)).toEqual([upper[1].id,upper[0].id])
    expect(classCars(config,state,'gt300').map(c=>c.entryId)).toEqual([lower[1].id,lower[0].id])
    expect(classCars(config,state,'gt300')[0].distanceM).toBe(-509)
    expect(config).toEqual(before)
  })
  it.each(['kyojo','indycar'] as const)('keeps the %s single-class grid spacing',category=>{
    const config=createMotorsportConfig(category),state=createMotorsportRace(config)
    expect(state.cars.map(c=>c.distanceM)).toEqual(config.entries.map((_,i)=>i===0?0:-i*9))
  })
  it.each(['practice','qualifying'] as const)('keeps mixed-class %s cars on independent pit exits',sessionKind=>{
    const config=createMotorsportConfig('super-gt');config.sessionKind=sessionKind
    config.format={kind:'time',seconds:900,basis:'SIM test'}
    const state=createMotorsportRace(config)
    expect(state.phase).toBe('racing')
    expect(state.cars.every(c=>c.status==='pit-exit' && c.distanceM>=0 && c.distanceM<config.course.lengthM)).toBe(true)
    expect(state.events[0].message).not.toContain('500 m')
  })
})
