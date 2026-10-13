import { expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { freeDrivers } from '../motorsport/freeMode'
import { behaviorDriverFor } from '../motorsport/driverBehavior'
import { drivingSignature, signaturePedalControl } from './drivingSignature'
import { advancePedals } from './pedalControl'

it('uses the same maximum ability and strongest execution preset in native and extra categories', () => {
  const formula = seriesPackageById.get('f1-custom')!.drivers.find(driver=>driver.id==='yuki_nakayama')!
  const extra = behaviorDriverFor(freeDrivers.find(driver=>driver.id==='yuki_nakayama')!)
  for(const driver of [formula,extra]) {
    expect(Object.values(driver.skills).every(value=>value===1.2)).toBe(true)
    expect(drivingSignature(driver).label).toBe('最強・全能力120')
    expect(drivingSignature(driver)).toMatchObject({entry:1,rotation:1,exit:1,preservation:1,correction:1.2})
    expect(signaturePedalControl(drivingSignature(driver),1).throttleCeiling).toBe(100)
  }
  expect(drivingSignature(formula)).toEqual(drivingSignature(extra))
})

it('improves loaded-corner throttle pickup while retaining wheelspin and stopping control', () => {
  const driver = seriesPackageById.get('f1-custom')!.drivers.find(driver=>driver.id==='yuki_nakayama')!
  const max = drivingSignature(driver)
  const ordinary = {...max,correction:1}
  const base = { throttle:100,brake:0,previousThrottle:95,previousBrake:0,seconds:0.1,
    feedback:{lateralUse:0.8,driveSlip:0,brakeSlip:0,skill:1.2,brakeSkill:1.2} }
  const strongest = advancePedals({...base,style:signaturePedalControl(max,1)})
  expect(strongest.throttle).toBeGreaterThan(advancePedals({...base,style:signaturePedalControl(ordinary,1)}).throttle)
  expect(advancePedals({...base,style:signaturePedalControl(max,1),feedback:{...base.feedback,driveSlip:0.3}}).throttle).toBeLessThan(strongest.throttle)
  expect(advancePedals({...base,style:signaturePedalControl(max,1),stop:true})).toEqual({throttle:0,brake:100})
})

it('keeps explicit style edits instead of overriding them with the preset', () => {
  const driver = seriesPackageById.get('f1-custom')!.drivers.find(driver=>driver.id==='yuki_nakayama')!
  expect(drivingSignature({...driver,style:{...driver.style,brakingAggression:0.2}}).entry).toBe(0.2)
})

it('retains the existing preference reserve for ordinary control abilities', () => {
  const driver = seriesPackageById.get('f1-custom')!.drivers.find(driver=>driver.id==='yuki_nakayama')!
  const signature = {...drivingSignature(driver),correction:1}
  expect(signaturePedalControl(signature,1).throttleCeiling).toBeCloseTo(95)
  expect(signaturePedalControl({...signature,correction:0.7},1).throttleCeiling).toBeCloseTo(95)
})
