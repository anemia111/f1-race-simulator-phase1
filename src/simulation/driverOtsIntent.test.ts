import { describe, expect, it } from 'vitest'
import type { DriverDecisionPath } from '../types'
import { sfOtsUseRequestedForPath } from './categoryDriverAgent'
import {
  sfOtsUseRequestedFor,
  type SfOtsUseRequestOptions,
} from './driverOtsIntent'

function otsOptions(
  overrides: Partial<SfOtsUseRequestOptions> = {},
): SfOtsUseRequestOptions {
  return {
    battlePhase: 'single-file',
    brakePercent: 3,
    gapToAheadSeconds: 1.1,
    isFinalLap: false,
    paceMode: 'standard',
    straightness: 0.72,
    throttlePercent: 88,
    ...overrides,
  }
}

describe('SUPER FORMULA OTS use-intent category ownership seam', () => {
  const parityCases = [
    { expected: true, label: 'inclusive thresholds and close gap', overrides: {} },
    {
      expected: true,
      label: 'attacking battle phase',
      overrides: { gapToAheadSeconds: 3, battlePhase: 'attacking' },
    },
    {
      expected: true,
      label: 'defending battle phase',
      overrides: { gapToAheadSeconds: 3, battlePhase: 'defending' },
    },
    {
      expected: true,
      label: 'push pace',
      overrides: { gapToAheadSeconds: 3, paceMode: 'push' },
    },
    {
      expected: true,
      label: 'final lap',
      overrides: { gapToAheadSeconds: 3, isFinalLap: true },
    },
    {
      expected: false,
      label: 'non-positive gap boundary',
      overrides: { gapToAheadSeconds: 0 },
    },
    {
      expected: false,
      label: 'strict gap boundary',
      overrides: { gapToAheadSeconds: 2.2 },
    },
    {
      expected: false,
      label: 'braking above threshold',
      overrides: { brakePercent: 4 },
    },
    {
      expected: false,
      label: 'throttle below threshold',
      overrides: { throttlePercent: 87 },
    },
    {
      expected: false,
      label: 'straightness below threshold',
      overrides: { straightness: 0.71 },
    },
  ] as const satisfies ReadonlyArray<{
    expected: boolean
    label: string
    overrides: Partial<SfOtsUseRequestOptions>
  }>

  for (const testCase of parityCases) {
    it(`preserves the exact ${testCase.label} result on every path`, () => {
      const options = otsOptions(testCase.overrides)
      const before = structuredClone(options)
      const direct = sfOtsUseRequestedFor(options)
      const legacy = sfOtsUseRequestedForPath({
        options,
        path: 'legacy-direct',
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      })
      const category = sfOtsUseRequestedForPath({
        options,
        path: 'category-agent-v1',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })
      const defaulted = sfOtsUseRequestedForPath({
        options,
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })

      expect(direct).toBe(testCase.expected)
      expect(legacy).toBe(direct)
      expect(category).toBe(direct)
      expect(defaulted).toBe(category)
      expect(options).toEqual(before)
    })
  }

  it('rejects F1 and invalid routes before reading SF OTS options', () => {
    let optionsRead = false
    const f1Input = {
      get options(): SfOtsUseRequestOptions {
        optionsRead = true
        throw new Error('F1 path read SF OTS options')
      },
      path: 'category-agent-v1' as const,
      seriesId: 'f1-custom' as const,
      vehicleEraId: 'f1-2026-current' as const,
    }

    expect(() => sfOtsUseRequestedForPath(f1Input)).toThrow(
      /SF OTS use intent requires a SUPER FORMULA OTS policy/,
    )
    expect(optionsRead).toBe(false)
    expect(() =>
      sfOtsUseRequestedForPath({
        options: otsOptions(),
        path: 'category-agent-v1',
        seriesId: 'super-formula',
        vehicleEraId: 'f1-2026-current',
      }),
    ).toThrow(/Unsupported driver policy super-formula\/f1-2026-current/)
    expect(() =>
      sfOtsUseRequestedForPath({
        options: otsOptions(),
        path: 'future-sf-ots-agent' as DriverDecisionPath,
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(/Unsupported driver decision path future-sf-ots-agent/)
  })
})
