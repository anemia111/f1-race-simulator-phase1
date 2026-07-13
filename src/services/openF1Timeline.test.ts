import { describe, expect, it } from 'vitest'
import { buildOpenF1TimelineFrame, openF1TimelineRange } from './openF1Timeline'

describe('OpenF1 synchronized history timeline', () => {
  const bundle = {
    carData: [
      { date: '2026-01-01T00:00:10Z' },
      { date: '2026-01-01T00:00:20Z' },
    ],
    intervals: [],
    location: [],
    positions: [],
    raceControl: [
      { date: '2026-01-01T00:00:09Z', message: 'GREEN' },
      { date: '2026-01-01T00:00:19Z', message: 'YELLOW' },
    ],
    weather: [
      { date: '2026-01-01T00:00:08Z', rainfall: 0 },
      { date: '2026-01-01T00:00:18Z', rainfall: 1 },
    ],
  }

  it('uses dynamic samples for the selectable range', () => {
    const range = openF1TimelineRange(bundle as never)
    expect(range.endMs - range.startMs).toBe(10_000)
  })

  it('selects weather and control at or before one target instant', () => {
    const frame = buildOpenF1TimelineFrame(bundle as never, 0.5)
    expect(frame.raceControl?.message).toBe('GREEN')
    expect(frame.weather?.rainfall).toBe(0)
    expect(frame.targetMs).toBe(new Date('2026-01-01T00:00:15Z').getTime())
  })
})
