import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { trackWidthMeters } from '../simulation/physicalLap'
import { presentationLateralOffset } from './RaceScene'

const trackById = (id: string) => tracks.find((track) => track.id === id)!

describe('RaceScene lateral presentation', () => {
  it('maps simulator metres by the retained policy road width', () => {
    const monaco = trackById('monaco-approx')
    const silverstone = trackById('silverstone-approx')
    const monacoQuarterWidth = trackWidthMeters(monaco) / 4
    const silverstoneQuarterWidth = trackWidthMeters(silverstone) / 4

    expect(
      presentationLateralOffset(monaco, monacoQuarterWidth),
    ).toBeCloseTo(presentationLateralOffset(monaco, 100) / 2, 8)
    expect(
      presentationLateralOffset(silverstone, silverstoneQuarterWidth),
    ).toBeCloseTo(presentationLateralOffset(silverstone, 100) / 2, 8)
  })

  it('clamps the road edge and neutralizes non-finite display state', () => {
    const track = trackById('monaco-approx')

    expect(presentationLateralOffset(track, 1_000)).toBe(
      -presentationLateralOffset(track, -1_000),
    )
    expect(presentationLateralOffset(track, Number.POSITIVE_INFINITY)).toBe(0)
    expect(presentationLateralOffset(track, Number.NaN)).toBe(0)
  })
})
