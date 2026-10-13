import {describe,it,expect} from 'vitest'
import {wakeDownforceMultiplier,wakeDragReduction} from './wakeModel'
describe('shared observed-gap wake physics',()=>{
 it('keeps the original F1/SF coefficients while bounding tow and aero loss',()=>{
  const gap=.8,curve=.6,straight=.9,sensitivity=.061
  expect(wakeDragReduction({gapSeconds:gap,straightness:straight,curvature:curve},sensitivity)).toBeCloseTo((1-(gap-.08)/1.72)*straight*sensitivity,12)
  expect(wakeDownforceMultiplier({gapSeconds:gap,straightness:straight,curvature:curve},.9)).toBeCloseTo(1-(1-gap/2.5)**1.35*curve*.115*.9,12)
  expect(wakeDragReduction({gapSeconds:.1,straightness:1,curvature:0},100)).toBeLessThanOrEqual(.07)
 })
 it('requires a real nearby car and aerodynamic alignment',()=>{
  const nearby={gapSeconds:.8,straightness:1,curvature:.6}
  expect(wakeDragReduction({...nearby,lateralSeparationM:4},.06)).toBe(0)
  expect(wakeDownforceMultiplier({...nearby,lateralSeparationM:4},1)).toBe(1)
  for(const gapSeconds of [NaN,Infinity,0,-1,3]) {
   expect(wakeDragReduction({...nearby,gapSeconds},.06)).toBe(0)
   expect(wakeDownforceMultiplier({...nearby,gapSeconds},1)).toBe(1)
  }
 })
})
