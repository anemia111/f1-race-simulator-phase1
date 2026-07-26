import { describe, expect, it } from 'vitest'
import type {
  OpenF1Interval,
  OpenF1Lap,
  OpenF1RaceControl,
  OpenF1Weather,
} from './openF1'
import {
  classifyObservedLaps,
  observedLapClassCounts,
} from './observedLapClassification'

const baseMs = Date.parse('2026-03-08T03:00:00.000Z')
const atMinute = (minute: number, seconds = 0) =>
  new Date(baseMs + minute * 60_000 + seconds * 1_000).toISOString()

function lap(
  lapNumber: number,
  duration: number | null = 50,
  overrides: Partial<OpenF1Lap> = {},
): OpenF1Lap {
  const sector = duration === null ? null : duration / 3

  return {
    date_start: atMinute(lapNumber),
    driver_number: 1,
    is_pit_out_lap: false,
    lap_number: lapNumber,
    lap_duration: duration,
    duration_sector_1: sector,
    duration_sector_2: sector,
    duration_sector_3: sector,
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    ...overrides,
  }
}

function weather(minute: number, rainfall = 0): OpenF1Weather {
  return {
    air_temperature: 24,
    date: atMinute(minute, 25),
    humidity: 50,
    pressure: 1010,
    rainfall,
    track_temperature: 34,
    wind_direction: 180,
    wind_speed: 2,
  }
}

function interval(
  minute: number,
  value: number,
): OpenF1Interval {
  return {
    date: atMinute(minute, 50),
    driver_number: 1,
    gap_to_leader: value,
    interval: value,
  }
}

function control(
  minute: number,
  seconds: number,
  message: string,
  flag: string | null = null,
): OpenF1RaceControl {
  return {
    category: flag ? 'Flag' : 'SafetyCar',
    date: atMinute(minute, seconds),
    driver_number: null,
    flag,
    lap_number: minute,
    message,
    qualifying_phase: null,
    scope: 'Track',
    sector: null,
  }
}

describe('observed lap classification', () => {
  it('separates pits, neutralisations, local yellow, wet, traffic, and clear laps', () => {
    const laps = [
      lap(1),
      lap(2),
      lap(3, 62),
      lap(4, 65, { is_pit_out_lap: true }),
      lap(5, 50),
      lap(6, 50),
      lap(7, 50),
      lap(8, 50),
      lap(9, 50),
      lap(10, null),
      lap(11, 54),
    ]
    const classified = classifyObservedLaps(
      {
        laps,
        pit: [
          {
            date: atMinute(3, 45),
            driver_number: 1,
            lap_number: 3,
            lane_duration: 22,
            stop_duration: 2.3,
          },
        ],
        stints: [
          {
            compound: 'MEDIUM',
            driver_number: 1,
            lap_end: 11,
            lap_start: 1,
            stint_number: 1,
            tyre_age_at_start: 0,
          },
        ],
        raceControl: [
          control(5, 10, 'SAFETY CAR DEPLOYED'),
          control(5, 55, 'GREEN FLAG', 'GREEN'),
          control(6, 10, 'VIRTUAL SAFETY CAR DEPLOYED'),
          control(6, 55, 'GREEN FLAG', 'GREEN'),
          control(7, 10, 'YELLOW IN TRACK SECTOR 4', 'YELLOW'),
          control(7, 50, 'CLEAR IN TRACK SECTOR 4', 'CLEAR'),
        ],
        weather: Array.from({ length: 11 }, (_, index) =>
          weather(index + 1, index + 1 === 8 ? 1 : 0),
        ),
        intervals: Array.from({ length: 11 }, (_, index) =>
          interval(index + 1, index + 1 === 2 ? 0.5 : 3),
        ),
      },
      'race',
    )
    const byLap = new Map(
      classified.map((sample) => [
        sample.lap.lap_number,
        sample.classification,
      ]),
    )

    expect(byLap.get(1)).toBe('race-traffic')
    expect(byLap.get(2)).toBe('race-traffic')
    expect(byLap.get(3)).toBe('pit-lap')
    expect(byLap.get(4)).toBe('out-lap')
    expect(byLap.get(5)).toBe('safety-car')
    expect(byLap.get(6)).toBe('virtual-safety-car')
    expect(byLap.get(7)).toBe('yellow')
    expect(byLap.get(8)).toBe('wet')
    expect(byLap.get(9)).toBe('race-clear')
    expect(byLap.get(10)).toBe('invalid')
    expect(byLap.get(11)).toBe('race-management')
    expect(observedLapClassCounts(classified)).toMatchObject({
      'race-clear': 1,
      'race-management': 1,
      'race-traffic': 2,
      'safety-car': 1,
      'virtual-safety-car': 1,
      yellow: 1,
      wet: 1,
    })
  })

  it('uses valid near-personal-best laps as qualifying pushes', () => {
    const classified = classifyObservedLaps(
      {
        laps: [
          lap(1, 100, { is_pit_out_lap: true }),
          lap(2, 70),
          lap(3, 71),
          lap(4, 75),
        ],
        pit: [],
        stints: [],
        raceControl: [],
        weather: [],
        intervals: [],
      },
      'qualifying',
    )

    expect(
      classified.map((sample) => sample.classification),
    ).toEqual([
      'out-lap',
      'qualifying-push',
      'qualifying-push',
      'unknown',
    ])
  })

  it('infers in and out laps from adjacent stint boundaries when pit timing is missing', () => {
    const classified = classifyObservedLaps(
      {
        laps: [lap(3, 58), lap(4, 61)],
        pit: [],
        stints: [
          {
            compound: 'MEDIUM',
            driver_number: 1,
            lap_end: 3,
            lap_start: 1,
            stint_number: 1,
            tyre_age_at_start: 0,
          },
          {
            compound: 'HARD',
            driver_number: 1,
            lap_end: 10,
            lap_start: 4,
            stint_number: 2,
            tyre_age_at_start: 0,
          },
        ],
        raceControl: [],
        weather: [],
        intervals: [],
      },
      'race',
    )

    expect(
      classified.map((sample) => sample.classification),
    ).toEqual(['in-lap', 'out-lap'])
  })

  it('rejects sector totals that disagree with the recorded lap', () => {
    const classified = classifyObservedLaps(
      {
        laps: [
          lap(1, 70, {
            duration_sector_1: 10,
            duration_sector_2: 10,
            duration_sector_3: 10,
          }),
        ],
        pit: [],
        stints: [],
        raceControl: [],
        weather: [],
        intervals: [],
      },
      'qualifying',
    )

    expect(classified[0].classification).toBe('invalid')
    expect(classified[0].reasons).toContain('sector-total-mismatch')
  })
})
