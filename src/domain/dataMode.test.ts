import { describe, expect, it } from 'vitest'
import {
  classifyObservedDataMode,
  dataModeUsesObservedEnvironment,
  dataModeUsesObservedTiming,
  resolveRequestedDataMode,
} from './dataMode'

describe('data mode contract', () => {
  const now = new Date('2026-07-12T12:00:00Z').getTime()

  it('separates live, historical, invalid and missing samples', () => {
    expect(classifyObservedDataMode('2026-07-12T11:59:10Z', now)).toBe('LIVE')
    expect(classifyObservedDataMode('2026-07-11T11:59:10Z', now)).toBe('HIST')
    expect(classifyObservedDataMode('2026-07-12T12:01:00Z', now)).toBe('SIM')
    expect(classifyObservedDataMode(null, now)).toBe('SIM')
  })

  it('never silently treats stale observations as live', () => {
    expect(
      resolveRequestedDataMode({
        detectedMode: 'HIST',
        hasHistoricalData: true,
        requestedMode: 'LIVE',
      }),
    ).toBe('HIST')
    expect(dataModeUsesObservedTiming('HIST')).toBe(true)
    expect(dataModeUsesObservedEnvironment('HIST')).toBe(false)
    expect(dataModeUsesObservedEnvironment('LIVE')).toBe(true)
  })
})

