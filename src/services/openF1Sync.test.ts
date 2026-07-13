import { describe, expect, it } from 'vitest'
import type { OpenF1Bundle } from './openF1'
import { buildSynchronizedCarData } from './openF1Sync'

function bundleFixture(): OpenF1Bundle {
  return {
    authMode: 'public',
    year: 2026,
    requestedStage: 'race',
    meeting: null,
    sessions: [],
    selectedSession: null,
    raceSession: null,
    miniSectorSession: null,
    drivers: [
      { driver_number: 1, full_name: 'One', name_acronym: 'ONE', team_colour: '', team_name: 'A' },
      { driver_number: 2, full_name: 'Two', name_acronym: 'TWO', team_colour: '', team_name: 'B' },
    ],
    miniSectorDrivers: [],
    startingGrid: [],
    sessionResult: [],
    laps: [],
    miniSectorLaps: [],
    weather: [],
    pit: [],
    stints: [],
    raceControl: [],
    positions: [],
    intervals: [],
    overtakes: [],
    teamRadio: [],
    carData: [
      { date: '2026-01-01T00:00:10.000Z', driver_number: 1, brake: 0, drs: 0, n_gear: 8, rpm: 11000, speed: 310, throttle: 100 },
      { date: '2026-01-01T00:00:09.000Z', driver_number: 2, brake: 0, drs: 0, n_gear: 8, rpm: 10900, speed: 305, throttle: 99 },
    ],
    location: [],
    championshipDrivers: [],
    championshipTeams: [],
    endpointStatuses: [],
    summary: {
      bestLap: null,
      fastestPitStop: null,
      latestRaceControl: null,
      latestWeather: null,
      maxSpeed: null,
      miniSectorSamples: 0,
      telemetrySamples: 2,
    },
  }
}

describe('OpenF1 synchronized telemetry', () => {
  it('keeps samples inside a common time tolerance', () => {
    const result = buildSynchronizedCarData(bundleFixture(), 2_000)

    expect([...result.byCode.keys()]).toEqual(['ONE', 'TWO'])
    expect(result.provenance.kind).toBe('observed')
  })

  it('rejects a stale driver instead of presenting mixed-time telemetry', () => {
    const result = buildSynchronizedCarData(bundleFixture(), 500)

    expect([...result.byCode.keys()]).toEqual(['ONE'])
    expect(result.rejectedStaleSamples).toBe(1)
  })
})
