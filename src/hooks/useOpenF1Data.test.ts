import { describe, expect, it } from 'vitest'
import { parseCachedOpenF1Bundle } from './useOpenF1Data'

const arrayFields = [
  'carData',
  'championshipDrivers',
  'championshipTeams',
  'drivers',
  'endpointStatuses',
  'intervals',
  'laps',
  'location',
  'miniSectorDrivers',
  'miniSectorLaps',
  'overtakes',
  'pit',
  'positions',
  'raceControl',
  'sessionResult',
  'sessions',
  'startingGrid',
  'stints',
  'teamRadio',
  'weather',
]

function cachedBundle(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    bundle: {
      ...Object.fromEntries(arrayFields.map((field) => [field, []])),
      authMode: 'public',
      meeting: null,
      miniSectorSession: null,
      raceSession: null,
      requestedStage: 'race',
      selectedSession: null,
      summary: {
        bestLap: null,
        fastestPitStop: null,
        latestRaceControl: null,
        latestWeather: null,
        maxSpeed: null,
        miniSectorSamples: 0,
        telemetrySamples: 0,
      },
      year: 2026,
      ...overrides,
    },
    fetchedAt: 123,
  })
}

describe('OpenF1 session cache validation', () => {
  it('restores a structurally complete cached bundle', () => {
    expect(parseCachedOpenF1Bundle(cachedBundle())?.bundle.year).toBe(2026)
  })

  it('rejects stale schemas and non-finite cache metadata', () => {
    expect(parseCachedOpenF1Bundle(cachedBundle({ laps: null }))).toBeNull()
    expect(parseCachedOpenF1Bundle(cachedBundle({ laps: [null] }))).toBeNull()
    expect(
      parseCachedOpenF1Bundle(cachedBundle({ requestedStage: 'invalid-stage' })),
    ).toBeNull()
    expect(
      parseCachedOpenF1Bundle(cachedBundle({ summary: { telemetrySamples: 10 } })),
    ).toBeNull()
    expect(
      parseCachedOpenF1Bundle(
        cachedBundle().replace('"fetchedAt":123', '"fetchedAt":1e309'),
      ),
    ).toBeNull()
    expect(parseCachedOpenF1Bundle('{broken')).toBeNull()
  })
})
