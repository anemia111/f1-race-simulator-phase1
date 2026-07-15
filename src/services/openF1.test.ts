import { describe, expect, it } from 'vitest'
import {
  normalizeOpenF1Endpoint,
  openF1StageForSession,
  selectOpenF1Session,
  type OpenF1Overtake,
  type OpenF1RaceControl,
  type OpenF1Session,
  type OpenF1SessionResult,
  type OpenF1Stint,
} from './openF1'

const session = (session_name: string, session_type: string): OpenF1Session => ({
  circuit_key: 1,
  circuit_short_name: 'Test',
  country_code: 'TST',
  country_name: 'Test',
  date_end: '2026-01-01T02:00:00Z',
  date_start: '2026-01-01T01:00:00Z',
  is_cancelled: false,
  location: 'Test',
  meeting_key: 1,
  session_key: session_name.length,
  session_name,
  session_type,
  year: 2026,
})

describe('OpenF1 session selection', () => {
  const sessions = [
    session('Practice 1', 'Practice'),
    session('Sprint Qualifying', 'Qualifying'),
    session('Sprint', 'Race'),
    session('Qualifying', 'Qualifying'),
    session('Race', 'Race'),
  ]

  it('maps sprint and standard sessions without confusing their names', () => {
    expect(openF1StageForSession(sessions[1])).toBe('sprintQualifying')
    expect(selectOpenF1Session(sessions, 'sprint')).toBe(sessions[2])
    expect(selectOpenF1Session(sessions, 'qualifying')).toBe(sessions[3])
    expect(selectOpenF1Session(sessions, 'race')).toBe(sessions[4])
  })
})

describe('OpenF1 schema normalization', () => {
  it('preserves Q1/Q2/Q3 result arrays and nullable phases', () => {
    const [result] = normalizeOpenF1Endpoint<OpenF1SessionResult>(
      'session_result',
      [
        {
          driver_number: 4,
          duration: [81.1, 80.7, null],
          gap_to_leader: [0.2, 0.1, null],
          position: 4,
        },
      ],
    )

    expect(result.duration).toEqual([81.1, 80.7, null])
    expect(result.gap_to_leader).toEqual([0.2, 0.1, null])
  })

  it('uses the current overtake driver fields', () => {
    const [overtake] = normalizeOpenF1Endpoint<OpenF1Overtake>('overtakes', [
      {
        date: '2026-01-01T00:00:00Z',
        overtaken_driver_number: 81,
        overtaking_driver_number: 4,
        position: 2,
      },
    ])

    expect(overtake.overtaking_driver_number).toBe(4)
    expect(overtake.overtaken_driver_number).toBe(81)
  })

  it('normalizes qualifying_phase from race control', () => {
    const [message] = normalizeOpenF1Endpoint<OpenF1RaceControl>(
      'race_control',
      [{ message: 'LAP TIME DELETED', qualifying_phase: 2 }],
    )

    expect(message.qualifying_phase).toBe(2)
  })

  it('drops impossible stint ranges at the API boundary', () => {
    const stints = normalizeOpenF1Endpoint<OpenF1Stint>('stints', [
      {
        compound: 'MEDIUM',
        driver_number: 4,
        lap_end: 18,
        lap_start: 1,
        stint_number: 1,
        tyre_age_at_start: 2,
      },
      {
        compound: 'HARD',
        driver_number: 81,
        lap_end: Number.MAX_SAFE_INTEGER,
        lap_start: 1,
        stint_number: 1,
        tyre_age_at_start: 0,
      },
    ])

    expect(stints).toHaveLength(1)
    expect(stints[0]).toMatchObject({
      driver_number: 4,
      lap_end: 18,
      lap_start: 1,
      tyre_age_at_start: 2,
    })
  })
})
