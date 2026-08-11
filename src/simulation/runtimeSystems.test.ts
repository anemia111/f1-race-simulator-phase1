import { describe, expect, it } from 'vitest'
import {
  createSuperFormulaRuntimeSystems,
  isF1RuntimeSystems,
  isSuperFormulaRuntimeSystems,
} from './runtimeSystems'

describe('category runtime systems', () => {
  it('creates an SF runtime without F1 electrical, aero, or component aliases', () => {
    const runtime = createSuperFormulaRuntimeSystems({
      entrantId: 'sf-mugen',
    })

    expect(runtime).toMatchObject({
      controlTires: {
        sets: {
          dry: { maximumSets: 6 },
          wet: { maximumSets: 6 },
        },
      },
      engineLedger: { engine: { maximumPerEntrantPerSeason: 2, used: 1 } },
      kind: 'super-formula',
      ots: {
        allocationSeconds: null,
        availability: 'unavailable',
        boostPowerKw: null,
        cooldownSeconds: null,
      },
      refuelling: {
        safetyGate: { status: 'blocked' },
        transferRateKgPerSecond: { availability: 'unavailable', value: null },
      },
    })
    expect(runtime).not.toHaveProperty('energyStore')
    expect(runtime).not.toHaveProperty('activeAeroState')
    expect(runtime).not.toHaveProperty('components')
    expect(runtime).not.toHaveProperty('ersBatteryPercent')
    expect(runtime).not.toHaveProperty('superClippingIntensity')
    expect(isSuperFormulaRuntimeSystems(runtime)).toBe(true)
    expect(isF1RuntimeSystems(runtime)).toBe(false)
  })
})
