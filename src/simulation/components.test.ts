import { describe, expect, it } from 'vitest'
import { initialTeams } from '../data/grid2026'
import {
  advanceComponentWear,
  createCarComponents,
  normalizeCarComponents,
  replaceCarComponent,
} from './components'

describe('power-unit and gearbox lifecycle', () => {
  it('uses the 2026 allocation and migrates missing exhaust state', () => {
    const components = createCarComponents()

    expect(components.ice.allocationLimit).toBe(4)
    expect(components.energyStore.allocationLimit).toBe(3)
    expect(components.gearbox.allocationLimit).toBeNull()
    expect(normalizeCarComponents({ ice: components.ice }).exhaust).toEqual(
      components.exhaust,
    )
  })

  it('adds the first over-allocation grid drop and accumulates wear', () => {
    let components = createCarComponents()

    for (let replacement = 0; replacement < 4; replacement += 1) {
      const result = replaceCarComponent(components, 'ice')
      components = result.components

      if (replacement === 3) {
        expect(result.gridPenalty).toBe(10)
      }
    }

    const worn = advanceComponentWear({
      components,
      deltaLaps: 50,
      engineStress: 1.1,
      team: initialTeams[0],
    })

    expect(worn.ice.conditionPercent).toBeLessThan(100)
    expect(worn.turbo.conditionPercent).toBeLessThan(worn.ice.conditionPercent)
  })

  it('repairs malformed saved component values and retains regulation limits', () => {
    const normalized = normalizeCarComponents({
      ice: {
        allocationLimit: 999,
        allocationUsed: Number.POSITIVE_INFINITY,
        conditionPercent: -500,
      },
      gearbox: {
        allocationLimit: 7,
        allocationUsed: 1e200,
        conditionPercent: Number.NaN,
      },
    })

    expect(normalized.ice).toEqual({
      allocationLimit: 4,
      allocationUsed: 1,
      conditionPercent: 0,
    })
    expect(normalized.gearbox).toEqual({
      allocationLimit: null,
      allocationUsed: 99,
      conditionPercent: 100,
    })
    expect(componentValuesAreFinite(normalized)).toBe(true)
  })
})

function componentValuesAreFinite(
  components: ReturnType<typeof createCarComponents>,
) {
  return Object.values(components).every(
    (component) =>
      Number.isFinite(component.conditionPercent) &&
      Number.isFinite(component.allocationUsed),
  )
}
