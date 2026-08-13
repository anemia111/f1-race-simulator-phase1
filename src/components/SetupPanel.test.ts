import { describe, expect, it } from 'vitest'
import { createSuperFormulaControlTireInventory } from '../simulation/superFormulaControlTires2026'
import { timedSessionTireSummaryFor } from './SetupPanel'

describe('timed session tyre summaries', () => {
  it('keeps the F1 Pirelli compound visible', () => {
    expect(
      timedSessionTireSummaryFor({
        compound: 'S',
        kind: 'f1-pirelli-session-tire',
      }),
    ).toBe('S')
  })

  it('shows an SF control surface without inventing an F1 compound', () => {
    const inventory = createSuperFormulaControlTireInventory()

    expect(
      timedSessionTireSummaryFor({
        kind: 'super-formula-control-session-tire',
        physicalModel: {
          availability: 'unavailable',
          simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
          sourceInput: inventory.specification.physicalCoefficients,
          value: null,
        },
        surface: 'wet',
      }),
    ).toBe('WET CONTROL / PHYSICAL MODEL UNAVAILABLE')
  })
})
