import { describe, expect, it } from 'vitest'
import { sectorPresentationSpans } from './sectorPresentation'

describe('registered timing sections', () => {
  it('does not manufacture timing locations for unavailable maps', () => {
    expect(sectorPresentationSpans([])).toEqual([])
  })
  it('draws exactly one complete lap for registered three, four and five section maps', () => {
    for (const marks of [[0, .286, .620], [0, .23, .51, .78], [0, .14, .4, .65, .9], [.7, .9, .2]]) {
      const spans = sectorPresentationSpans(marks)
      expect(spans.reduce((sum, section) => sum + section.span, 0)).toBeCloseTo(1, 12)
      expect(spans.every(section => section.span > 0 && section.span < 1)).toBe(true)
    }
    expect(sectorPresentationSpans([.7, .9, .2])[2].span).toBeCloseTo(.5, 12)
  })
})
