import { describe, expect, it } from 'vitest'
import {
  createSuperFormulaControlTireInventory,
  useSuperFormulaControlTireSets,
  validateSuperFormulaControlTireInventory,
} from './superFormulaControlTires2026'

describe('2026 SUPER FORMULA control-tyre inventory', () => {
  it('derives only the published dry and wet maximums from the operational rule package', () => {
    const inventory = createSuperFormulaControlTireInventory()

    expect(Object.keys(inventory.sets).sort()).toEqual(['dry', 'wet'])
    expect(inventory.sets.dry).toMatchObject({
      allocatedSets: 6,
      maximumSets: 6,
      maximumSetsRule: {
        availability: 'verified',
        provenance: {
          article: 'Article 23.2',
          sourceId: 'jaf-sf-2026-unified-regulations',
        },
        value: 6,
      },
      remainingSets: 6,
      surface: 'dry',
      usedSets: 0,
    })
    expect(inventory.sets.wet).toMatchObject({
      allocatedSets: 6,
      maximumSets: 6,
      maximumSetsRule: {
        availability: 'verified',
        provenance: {
          article: 'Article 23.4',
          sourceId: 'jaf-sf-2026-unified-regulations',
        },
        value: 6,
      },
      remainingSets: 6,
      surface: 'wet',
      usedSets: 0,
    })
  })

  it('keeps unverified set subdivisions and physical coefficients unavailable', () => {
    const inventory = createSuperFormulaControlTireInventory()

    for (const input of Object.values(inventory.specification)) {
      expect(input).toMatchObject({
        availability: 'unavailable',
        provenance: {
          sourceId: 'jaf-sf-2026-unified-regulations',
        },
        value: null,
      })
    }
    expect(inventory).not.toHaveProperty('compound')
    expect(validateSuperFormulaControlTireInventory(inventory)).toEqual({
      issues: [],
      valid: true,
    })
  })

  it('returns a new source-bound inventory when a physical set is used', () => {
    const initial = createSuperFormulaControlTireInventory({
      allocatedSets: { dry: 4, wet: 2 },
      usedSets: { dry: 1 },
    })
    const next = useSuperFormulaControlTireSets({
      inventory: initial,
      setCount: 2,
      surface: 'dry',
    })

    expect(initial.sets.dry).toMatchObject({
      remainingSets: 3,
      usedSets: 1,
    })
    expect(next.sets.dry).toMatchObject({
      maximumSets: 6,
      remainingSets: 1,
      usedSets: 3,
    })
    expect(next.sets.wet).toBe(initial.sets.wet)
    expect(next.specification).toBe(initial.specification)
    expect(validateSuperFormulaControlTireInventory(next).valid).toBe(true)
  })

  it('fails closed for allocations beyond the official maximum and malformed persisted values', () => {
    expect(() =>
      createSuperFormulaControlTireInventory({
        allocatedSets: { dry: 7 },
      }),
    ).toThrow(/published maximum of 6/)

    const valid = createSuperFormulaControlTireInventory()
    const malformed = {
      ...valid,
      sets: {
        ...valid.sets,
        dry: {
          ...valid.sets.dry,
          maximumSets: 7,
          remainingSets: 7,
        },
      },
      specification: {
        ...valid.specification,
        physicalCoefficients: {
          ...valid.specification.physicalCoefficients,
          value: 1,
        },
      },
    }
    const validation = validateSuperFormulaControlTireInventory(malformed)

    expect(validation).toMatchObject({ valid: false })
    if (validation.valid) {
      throw new Error('Expected malformed control-tyre inventory to fail validation.')
    }
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'maximum-sets-not-authoritative',
        'remaining-sets-mismatch',
        'unavailable-input-present',
      ]),
    )
  })
})
