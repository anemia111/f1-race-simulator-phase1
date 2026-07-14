import { describe, expect, it } from 'vitest'
import type { OpenF1Bundle, OpenF1Lap } from './openF1'
import { buildOpenF1TrackCalibration } from './openF1Performance'

function lap(
  lapNumber: number,
  tireAge: number,
  baseSeconds: number,
  degradationSeconds: number,
): OpenF1Lap {
  const lapDuration =
    baseSeconds + tireAge * degradationSeconds - lapNumber * 0.04

  return {
    driver_number: 1,
    duration_sector_1: lapDuration * 0.31,
    duration_sector_2: lapDuration * 0.37,
    duration_sector_3: lapDuration * 0.32,
    i1_speed: 280,
    i2_speed: 292,
    is_pit_out_lap: false,
    lap_duration: lapDuration,
    lap_number: lapNumber,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    st_speed: 318,
  }
}

function tireCalibrationBundle(): OpenF1Bundle {
  const mediumLaps = Array.from({ length: 8 }, (_, index) =>
    lap(index + 1, index + 4, 90, 0.1),
  )
  const softLaps = Array.from({ length: 8 }, (_, index) =>
    lap(index + 9, index + 1, 89.3, 0.16),
  )

  return {
    authMode: 'public',
    carData: [],
    championshipDrivers: [],
    championshipTeams: [],
    drivers: [],
    endpointStatuses: [],
    intervals: [],
    laps: [...mediumLaps, ...softLaps],
    location: [],
    meeting: null,
    miniSectorDrivers: [],
    miniSectorLaps: [],
    miniSectorSession: null,
    overtakes: [],
    pit: [],
    positions: [],
    raceControl: [],
    raceSession: null,
    requestedStage: 'race',
    selectedSession: {
      circuit_key: 10,
      circuit_short_name: 'Melbourne',
      country_code: 'AUS',
      country_name: 'Australia',
      date_end: '2026-03-08T06:00:00Z',
      date_start: '2026-03-08T04:00:00Z',
      is_cancelled: false,
      location: 'Melbourne',
      meeting_key: 1234,
      session_name: 'Race',
      session_type: 'Race',
      session_key: 11234,
      year: 2026,
    },
    sessionResult: [],
    sessions: [],
    startingGrid: [],
    stints: [
      {
        compound: 'MEDIUM',
        driver_number: 1,
        lap_end: 8,
        lap_start: 1,
        stint_number: 1,
        tyre_age_at_start: 4,
      },
      {
        compound: 'SOFT',
        driver_number: 1,
        lap_end: 16,
        lap_start: 9,
        stint_number: 2,
        tyre_age_at_start: 1,
      },
    ],
    summary: {
      bestLap: null,
      fastestPitStop: null,
      latestRaceControl: null,
      latestWeather: null,
      maxSpeed: null,
      miniSectorSamples: 0,
      telemetrySamples: 0,
    },
    teamRadio: [],
    weather: [],
    year: 2026,
  }
}

describe('OpenF1 tire calibration', () => {
  it('uses actual tyre age and robust stint slopes', () => {
    const calibration = buildOpenF1TrackCalibration(tireCalibrationBundle())

    expect(calibration.tireSampleCountByCompound).toMatchObject({ M: 8, S: 8 })
    expect(calibration.tireDegradationByCompound.M).toBeCloseTo(0.1, 3)
    expect(calibration.tireDegradationByCompound.S).toBeCloseTo(0.16, 3)
  })

  it('derives fresh compound pace relative to the observed medium', () => {
    const calibration = buildOpenF1TrackCalibration(tireCalibrationBundle())

    expect(calibration.tirePaceOffsetByCompound.M).toBe(0)
    expect(calibration.tirePaceOffsetByCompound.S).toBeLessThan(-0.5)
  })
})
