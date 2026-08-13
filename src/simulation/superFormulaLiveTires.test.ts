import { describe, expect, it } from 'vitest'
import {
  createSuperFormulaLiveTireRuntime,
  fitSuperFormulaLiveControlTire,
  recordSuperFormulaLiveTireLaps,
  validateSuperFormulaLiveTireState,
} from './superFormulaLiveTires'

describe('SUPER FORMULA live control-tyre runtime', () => {
  it('accounts for a neutral dry fitment without introducing an F1 compound or physical model', () => {
    const runtime = createSuperFormulaLiveTireRuntime()

    expect(runtime.controlTires.sets.dry).toMatchObject({
      allocatedSets: 6,
      maximumSets: 6,
      remainingSets: 5,
      usedSets: 1,
    })
    expect(runtime.controlTires.sets.wet).toMatchObject({
      allocatedSets: 6,
      maximumSets: 6,
      remainingSets: 6,
      usedSets: 0,
    })
    expect(runtime.liveTires).toMatchObject({
      activeSurface: 'dry',
      fitment: {
        inventorySetCounted: true,
        selectionProvenance: {
          authority: 'simulator-policy',
          id: 'super-formula-live-control-tyre-v1',
        },
        sequence: 1,
        surface: 'dry',
      },
      kind: 'super-formula-live-control-tire',
      lapsOnCurrentSet: 0,
      physicalModel: {
        availability: 'unavailable',
        simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
        sourceInput: {
          availability: 'unavailable',
          provenance: {
            sourceId: 'jaf-sf-2026-unified-regulations',
          },
        },
        value: null,
      },
    })
    expect(runtime.liveTires).not.toHaveProperty('compound')
    expect(runtime.liveTires).not.toHaveProperty('temperatureC')
    expect(runtime.liveTires).not.toHaveProperty('wearPercent')
    expect(validateSuperFormulaLiveTireState(runtime)).toEqual({
      issues: [],
      valid: true,
    })
  })

  it('changes only dry/wet surface accounting and informational stint laps', () => {
    const initial = createSuperFormulaLiveTireRuntime()
    const withLaps = {
      ...initial,
      liveTires: recordSuperFormulaLiveTireLaps({
        completedLaps: 7,
        state: initial.liveTires,
      }),
    }
    const refitted = fitSuperFormulaLiveControlTire({
      runtime: withLaps,
      surface: 'wet',
    })

    expect(withLaps.liveTires.lapsOnCurrentSet).toBe(7)
    expect(refitted.controlTires.sets.dry).toBe(withLaps.controlTires.sets.dry)
    expect(refitted.controlTires.sets.wet).toMatchObject({
      remainingSets: 5,
      usedSets: 1,
    })
    expect(refitted.liveTires).toMatchObject({
      activeSurface: 'wet',
      fitment: { sequence: 2, surface: 'wet' },
      lapsOnCurrentSet: 0,
    })
    expect(refitted.liveTires.physicalModel.sourceInput).toBe(
      refitted.controlTires.specification.physicalCoefficients,
    )
    expect(validateSuperFormulaLiveTireState(refitted).valid).toBe(true)
  })

  it('rejects persistence values that invent a surface, omit accounting, or add a coefficient', () => {
    const runtime = createSuperFormulaLiveTireRuntime()
    const malformed = {
      ...runtime,
      liveTires: {
        ...runtime.liveTires,
        activeSurface: 'medium',
        fitment: {
          ...runtime.liveTires.fitment,
          inventorySetCounted: false,
          surface: 'medium',
        },
        physicalModel: {
          ...runtime.liveTires.physicalModel,
          value: 0.42,
        },
      },
    }
    const validation = validateSuperFormulaLiveTireState(malformed)

    expect(validation).toMatchObject({ valid: false })
    if (validation.valid) {
      throw new Error('Expected malformed live control-tyre runtime to fail.')
    }
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'invalid-fitment-provenance',
        'invalid-physical-policy',
        'unsupported-surface',
      ]),
    )
  })
})
