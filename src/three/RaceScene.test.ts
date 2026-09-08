import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { trackWidthMeters } from '../simulation/physicalLap'
import { startingGridDistance } from '../simulation/startingGrid'
import { displayLaneOffset, presentationLateralOffset } from './RaceScene'

const trackById = (id: string) => tracks.find((track) => track.id === id)!

describe('RaceScene lateral presentation', () => {
  it('keeps stationary cars in the same columns when the start lights go out', () => {
    for (const track of tracks) {
      for (let gridIndex = 0; gridIndex < 40; gridIndex += 1) {
        const car = {
          gridPosition: gridIndex + 1,
          totalDistance: startingGridDistance(gridIndex, track.lengthKm * 1000),
          status: 'running' as const,
          timedRunPhase: null,
          lateralOffsetM: gridIndex % 2 === 0 ? -1.35 : 1.35,
          trackLateralOffset: 0,
        }

        expect(displayLaneOffset(track, car, true)).toBe(
          displayLaneOffset(track, car, false),
        )
      }
    }
  })

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
