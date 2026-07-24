import { describe, expect, it } from 'vitest'
import type { LapRecord, TireCompound } from '../types'
import { tireStintsFor } from './stints'

const lap = (
  lapNumber: number,
  tire: TireCompound,
  options: { pitStop?: boolean; segment?: string } = {},
): LapRecord => ({
  lap: lapNumber,
  lapTimeSeconds: 90,
  sectors: [30, 30, 30],
  tire,
  tireAgeLaps: 1,
  weather: 'clear',
  trackGrip: 1,
  position: 1,
  pitStop: options.pitStop ?? false,
  isValid: true,
  invalidReason: null,
  ...(options.segment === undefined ? {} : { segment: options.segment }),
})

describe('tireStintsFor', () => {
  it('groups consecutive laps on the same compound into one stint', () => {
    const stints = tireStintsFor({
      lapHistory: [lap(1, 'M'), lap(2, 'M'), lap(3, 'M')],
      tire: 'M',
      status: 'running',
    })

    expect(stints).toHaveLength(1)
    expect(stints[0]).toMatchObject({
      compound: 'M',
      fromLap: 1,
      toLap: 4,
      laps: 4,
      inProgress: true,
    })
  })

  it('starts a new stint on the lap after a pit-stop record', () => {
    const stints = tireStintsFor({
      lapHistory: [
        lap(1, 'M'),
        lap(2, 'M', { pitStop: true }),
        lap(3, 'H'),
        lap(4, 'H'),
      ],
      tire: 'H',
      status: 'running',
    })

    expect(stints).toHaveLength(2)
    expect(stints[0]).toMatchObject({ compound: 'M', fromLap: 1, toLap: 2, laps: 2 })
    expect(stints[1]).toMatchObject({ compound: 'H', fromLap: 3, toLap: 5, inProgress: true })
  })

  it('splits a same-compound stop into two stints', () => {
    const stints = tireStintsFor({
      lapHistory: [
        lap(1, 'S'),
        lap(2, 'S', { pitStop: true }),
        lap(3, 'S'),
      ],
      tire: 'S',
      status: 'running',
    })

    expect(stints).toHaveLength(2)
    expect(stints[0]).toMatchObject({ compound: 'S', fromLap: 1, toLap: 2 })
    expect(stints[1]).toMatchObject({ compound: 'S', fromLap: 3, toLap: 4 })
  })

  it('opens a fresh live stint when the car has just left the pits', () => {
    const stints = tireStintsFor({
      lapHistory: [lap(1, 'M'), lap(2, 'M', { pitStop: true })],
      tire: 'H',
      status: 'pit',
    })

    expect(stints).toHaveLength(2)
    expect(stints[1]).toMatchObject({
      compound: 'H',
      fromLap: 3,
      toLap: 3,
      laps: 1,
      inProgress: true,
    })
  })

  it('does not extend a stint for finished or retired cars', () => {
    const history = [lap(1, 'M'), lap(2, 'M')]

    for (const status of ['finished', 'retired', 'disqualified'] as const) {
      const stints = tireStintsFor({ lapHistory: history, tire: 'M', status })

      expect(stints).toHaveLength(1)
      expect(stints[0]).toMatchObject({ toLap: 2, laps: 2, inProgress: false })
    }
  })

  it('ignores timed-session laps carried into the weekend history', () => {
    const stints = tireStintsFor({
      lapHistory: [
        lap(1, 'S', { segment: 'Q1' }),
        lap(2, 'S', { segment: 'Q3' }),
        lap(1, 'M'),
      ],
      tire: 'M',
      status: 'running',
    })

    expect(stints).toHaveLength(1)
    expect(stints[0]).toMatchObject({ compound: 'M', fromLap: 1, toLap: 2 })
  })

  it('shows only the live out-lap stint before any lap is completed', () => {
    const stints = tireStintsFor({ lapHistory: [], tire: 'S', status: 'running' })

    expect(stints).toEqual([
      { compound: 'S', fromLap: 1, toLap: 1, laps: 1, inProgress: true },
    ])
  })

  it('returns nothing for a car that never started', () => {
    expect(tireStintsFor({ lapHistory: [], tire: 'M', status: 'dns' })).toEqual([])
  })
})
