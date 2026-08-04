import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import {
  STARTING_GRID_BOX_PITCH_M,
  STARTING_GRID_REQUIRED_SEPARATION_M,
  startingGridDistance,
  startingGridRowGap,
  startingGridSlotGap,
  startingGridStagger,
} from './startingGrid'

const ALBERT_PARK_LAP_M = 5278

describe('starting grid', () => {
  it('spaces the boxes by a distance rather than a fraction of the lap', () => {
    // The previous constant was 0.00105 of a lap on every circuit, which made
    // the grid stretch and shrink with the layout: 7.35 m at Spa, 5.54 m at
    // Albert Park, 3.50 m at Monaco. A painted grid does no such thing. The
    // test that stood here asserted the fraction and a field depth chosen so
    // that map labels would not overlap, which is a rendering concern holding
    // a physical dimension in place.
    for (const track of tracks) {
      const lapLengthM = track.lengthKm * 1000
      const slotM = startingGridSlotGap(lapLengthM) * lapLengthM

      expect(slotM).toBeCloseTo(STARTING_GRID_BOX_PITCH_M, 6)
    }
  })

  it('opens the race outside the separation the occupancy model demands', () => {
    // This is what the fraction broke. Below 6.45 m the solver treats two cars
    // in line as overlapping and holds the rear one still, so a field that
    // started inside the requirement left the line in stutters and holes
    // instead of together. Every circuit shorter than about 6.14 km did.
    expect(STARTING_GRID_REQUIRED_SEPARATION_M).toBeCloseTo(6.45, 6)

    for (const track of tracks) {
      const lapLengthM = track.lengthKm * 1000
      const separationM =
        (startingGridDistance(0, lapLengthM) -
          startingGridDistance(1, lapLengthM)) *
        lapLengthM

      expect(separationM).toBeGreaterThan(STARTING_GRID_REQUIRED_SEPARATION_M)
    }
  })

  it('stages each odd position one box ahead of the paired even position', () => {
    for (let gridIndex = 0; gridIndex < 22; gridIndex += 2) {
      const oddPosition = startingGridDistance(gridIndex, ALBERT_PARK_LAP_M)
      const evenPosition = startingGridDistance(
        gridIndex + 1,
        ALBERT_PARK_LAP_M,
      )

      expect(oddPosition - evenPosition).toBeCloseTo(
        startingGridStagger(ALBERT_PARK_LAP_M),
      )
    }
  })

  it('keeps each two-car row behind the previous row', () => {
    for (let gridIndex = 0; gridIndex < 20; gridIndex += 2) {
      const currentOdd = startingGridDistance(gridIndex, ALBERT_PARK_LAP_M)
      const nextOdd = startingGridDistance(gridIndex + 2, ALBERT_PARK_LAP_M)
      const currentEven = startingGridDistance(gridIndex + 1, ALBERT_PARK_LAP_M)

      expect(currentOdd - nextOdd).toBeCloseTo(
        startingGridRowGap(ALBERT_PARK_LAP_M),
      )
      expect(currentEven).toBeGreaterThan(nextOdd)
    }
  })
})
