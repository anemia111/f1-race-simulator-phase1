import { expect, it } from 'vitest'
import { createMotorsportConfig } from './packages'
import { advanceMotorsportRace, createMotorsportRace } from './race'

it.each(['super-gt','wec'] as const)('%s short full-field compute measurement',category=>{
  const config=createMotorsportConfig(category,category==='wec'?'wec:3':undefined)
  let state={...createMotorsportRace(config),phase:'racing' as const}
  const cold=performance.now()
  state=advanceMotorsportRace(state,1,config) as typeof state
  const coldMs=performance.now()-cold,warm=performance.now()
  state=advanceMotorsportRace(state,5,config) as typeof state
  const warmMs=performance.now()-warm
  console.info('SHORT_FIELD_COST',JSON.stringify({category,cars:state.cars.length,coldMs,warmFiveTicksMs:warmMs}))
  expect(state.cars.every(car=>Number.isFinite(car.distanceM)&&Number.isFinite(car.speedMps))).toBe(true)
},15000)
