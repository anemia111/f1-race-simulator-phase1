import { describe, expect, it } from 'vitest'
import { vehiclesAreAlongside } from './vehicleGeometry'

describe('physical alongside classification', () => {
  it('requires overlapping longitudinal envelopes and separated body widths', () => {
    expect(vehiclesAreAlongside(4, 2)).toBe(true)
    expect(vehiclesAreAlongside(-4, -2)).toBe(true)
    expect(vehiclesAreAlongside(20, 2)).toBe(false)
    expect(vehiclesAreAlongside(4, 0)).toBe(false)
    expect(vehiclesAreAlongside(5.2, 2)).toBe(false)
    expect(vehiclesAreAlongside(Number.NaN, 2)).toBe(false)
  })
})
