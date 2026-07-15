import { describe, expect, it } from 'vitest'
import {
  LIGHTS_OUT_DISPLAY_SECONDS,
  startSignalStateFor,
} from './startSignal'

const signalFor = (
  overrides: Partial<Parameters<typeof startSignalStateFor>[0]> = {},
) =>
  startSignalStateFor({
    elapsedSeconds: 100,
    formationBehindSafetyCar: false,
    raceStartedAtSeconds: null,
    startProcedure: 'formation',
    startProcedureRemainingSeconds: 20,
    ...overrides,
  })

describe('start signal presentation', () => {
  it('shows an unlit gantry while the field settles on the grid', () => {
    expect(signalFor({ startProcedure: 'grid' })).toEqual({
      activeLightCount: 0,
      label: 'GRID SET',
      phase: 'grid',
    })
  })

  it.each([
    [5, 1],
    [4.01, 1],
    [4, 2],
    [3, 3],
    [2, 4],
    [1, 5],
    [0.01, 5],
  ])(
    'maps %s seconds remaining to %s illuminated groups',
    (remainingSeconds, activeLightCount) => {
      expect(
        signalFor({
          startProcedure: 'lights',
          startProcedureRemainingSeconds: remainingSeconds,
        })?.activeLightCount,
      ).toBe(activeLightCount)
    },
  )

  it('shows lights out briefly after the standing start', () => {
    expect(
      signalFor({
        elapsedSeconds: 101,
        raceStartedAtSeconds: 100,
        startProcedure: 'racing',
        startProcedureRemainingSeconds: 0,
      }),
    ).toEqual({
      activeLightCount: 0,
      label: 'LIGHTS OUT',
      phase: 'lights-out',
    })
    expect(
      signalFor({
        elapsedSeconds: 100 + LIGHTS_OUT_DISPLAY_SECONDS + 0.01,
        raceStartedAtSeconds: 100,
        startProcedure: 'racing',
      }),
    ).toBeNull()
  })

  it('never shows standing-start lights for a Safety Car rolling start', () => {
    expect(
      signalFor({
        formationBehindSafetyCar: true,
        startProcedure: 'grid',
      }),
    ).toBeNull()
    expect(
      signalFor({
        formationBehindSafetyCar: true,
        startProcedure: 'racing',
        raceStartedAtSeconds: 100,
      }),
    ).toBeNull()
  })
})
