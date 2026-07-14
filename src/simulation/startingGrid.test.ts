import { describe, expect, it } from 'vitest'
import {
  STARTING_GRID_ROW_GAP,
  STARTING_GRID_STAGGER,
  startingGridDistance,
} from './startingGrid'

describe('starting grid', () => {
  it('stages each odd position slightly ahead of the paired even position', () => {
    for (let gridIndex = 0; gridIndex < 22; gridIndex += 2) {
      const oddPosition = startingGridDistance(gridIndex)
      const evenPosition = startingGridDistance(gridIndex + 1)

      expect(oddPosition - evenPosition).toBeCloseTo(STARTING_GRID_STAGGER)
    }
  })

  it('keeps each two-car row behind the previous row', () => {
    for (let gridIndex = 0; gridIndex < 20; gridIndex += 2) {
      const currentOdd = startingGridDistance(gridIndex)
      const nextOdd = startingGridDistance(gridIndex + 2)
      const currentEven = startingGridDistance(gridIndex + 1)

      expect(currentOdd - nextOdd).toBeCloseTo(STARTING_GRID_ROW_GAP)
      expect(currentEven).toBeGreaterThan(nextOdd)
    }
  })
})
