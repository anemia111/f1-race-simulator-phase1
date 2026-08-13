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
          dry: { maximumSets: 6, remainingSets: 5, usedSets: 1 },
          wet: { maximumSets: 6 },
        },
      },
      engineLedger: { engine: { maximumPerEntrantPerSeason: 2, used: 1 } },
      kind: 'super-formula',
      liveTires: {
        activeSurface: 'dry',
        kind: 'super-formula-live-control-tire',
        physicalModel: {
          availability: 'unavailable',
          simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
          value: null,
        },
      },
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
      refuellingTask: {
        canExecute: false,
        eventPackStatus: 'missing',
        kind: 'super-formula-refuelling-task',
        numericalTask: {
          availability: 'unavailable',
          fuelMassGainKg: null,
          serviceDurationSeconds: null,
          transferRateKgPerSecond: null,
        },
        status: 'blocked-by-safety',
      },
    })
    expect(runtime).not.toHaveProperty('energyStore')
    expect(runtime).not.toHaveProperty('activeAeroState')
    expect(runtime).not.toHaveProperty('components')
    expect(runtime).not.toHaveProperty('ersBatteryPercent')
    expect(runtime).not.toHaveProperty('superClippingIntensity')
    expect(runtime.liveTires).not.toHaveProperty('compound')
    expect(runtime.liveTires).not.toHaveProperty('wearPercent')
    expect(runtime.refuellingTask.canExecute).toBe(false)
    expect(isSuperFormulaRuntimeSystems(runtime)).toBe(true)
    expect(isF1RuntimeSystems(runtime)).toBe(false)
  })
})
