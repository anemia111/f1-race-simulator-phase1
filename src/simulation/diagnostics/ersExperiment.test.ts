import {describe,expect,it} from 'vitest'
import {runErsExperiment} from './ersExperiment'
describe('controlled live-plant ERS experiment',()=>{
  it('increases speed, distance and 400m arrival performance when actual deployment increases',()=>{
    for(const throttlePercent of [60,100]) {
      const cases=runErsExperiment({throttlePercent})
      for(let i=1;i<cases.length;i++) {
        expect(cases[i].finalSpeedKph).toBeGreaterThan(cases[i-1].finalSpeedKph)
        expect(cases[i].distanceM).toBeGreaterThan(cases[i-1].distanceM)
        expect(cases[i].arrival400mSeconds).not.toBeNull()
        expect(cases[i].arrival400mSeconds!).toBeLessThan(cases[i-1].arrival400mSeconds!)
      }
    }
  })
  it('keeps each recorded DC sample within every live cap and closes energy accounting',()=>{
    for(const c of runErsExperiment())for(const sample of c.samples) {
      const s=sample.limits!
      expect(s.actualDcKw).toBeLessThanOrEqual(Math.min(s.requestedDcKw,s.regulatoryDcLimitKw,s.hardwareDcLimitKw,s.socDcLimitKw,s.thermalDcLimitKw,s.availableEnergyDcLimitKw)+1e-8)
      expect(s.mechanicalKw).toBeLessThanOrEqual(s.actualDcKw+1e-8)
      expect(sample.mguKTorqueNm).toBeLessThanOrEqual(500)
      expect(sample.mguKMechanicalPowerKw).toBeLessThanOrEqual(sample.mechanicalKw+1e-8)
      expect(Math.abs(sample.storeBalanceErrorMJ)).toBeLessThan(1e-10)
      expect(Math.abs(sample.conversionChainErrorMJ)).toBeLessThan(1e-10)
    }
  })
  it('is deterministic and converges under a halved physical tick',()=>{
    const a=runErsExperiment({durationSeconds:2})
    expect(runErsExperiment({durationSeconds:2})).toEqual(a)
    const b=runErsExperiment({durationSeconds:2,deltaSeconds:.025})
    a.forEach((c,i)=>{expect(Math.abs(c.finalSpeedKph-b[i].finalSpeedKph)).toBeLessThan(.3);expect(Math.abs(c.distanceM-b[i].distanceM)).toBeLessThan(.1)})
  })
})
