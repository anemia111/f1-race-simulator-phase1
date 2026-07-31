import { describe, expect, it } from 'vitest'
import {
  formatLapTime,
  formatSectorTime,
  formatSignedSeconds,
  UNMEASURED_LAP_TIME,
  UNMEASURED_SECTOR_TIME,
} from './timingFormat'

describe('formatLapTime', () => {
  it('formats a measured lap', () => {
    expect(formatLapTime(83.4567)).toBe('1:23.457')
    expect(formatLapTime(59.9)).toBe('0:59.900')
    expect(formatLapTime(120)).toBe('2:00.000')
  })

  it('marks unmeasured laps rather than printing a zero', () => {
    expect(formatLapTime(null)).toBe(UNMEASURED_LAP_TIME)
    expect(formatLapTime(undefined)).toBe(UNMEASURED_LAP_TIME)
    expect(formatLapTime(Number.NaN)).toBe(UNMEASURED_LAP_TIME)
    expect(formatLapTime(Number.POSITIVE_INFINITY)).toBe(UNMEASURED_LAP_TIME)
  })
})

describe('formatSectorTime', () => {
  it('formats measured and unmeasured splits', () => {
    expect(formatSectorTime(28.1234)).toBe('28.123')
    expect(formatSectorTime(null)).toBe(UNMEASURED_SECTOR_TIME)
    expect(formatSectorTime(Number.NaN)).toBe(UNMEASURED_SECTOR_TIME)
  })
})

describe('formatSignedSeconds', () => {
  it('always shows the sign of a delta', () => {
    expect(formatSignedSeconds(1.24)).toBe('+1.2s')
    expect(formatSignedSeconds(-1.24)).toBe('-1.2s')
    expect(formatSignedSeconds(0)).toBe('+0.0s')
  })

  it('reports an unavailable delta', () => {
    expect(formatSignedSeconds(null)).toBe('--')
  })
})
