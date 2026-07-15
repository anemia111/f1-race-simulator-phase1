import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from './grid2026'
import { bundledOpenF1StandingsFor } from './openF1Standings2026'
import { calibrateFieldFromOpenF1 } from '../services/openF1Performance'

describe('bundled 2026 OpenF1 standings', () => {
  const now = new Date('2026-07-14T12:00:00Z').getTime()

  it('uses the latest completed race before a future weekend', () => {
    const snapshot = bundledOpenF1StandingsFor('2026-07-17T00:00:00Z', now)

    expect(snapshot?.asOfDate).toBe('2026-07-05T16:00:00+00:00')
    expect(snapshot?.snapshotSessionKey).toBe(11326)
    expect(snapshot?.championshipTeams[0]).toMatchObject({
      team_name: 'Mercedes',
      points_current: 333,
      position_current: 1,
    })
    expect(snapshot?.championshipDrivers[0]).toMatchObject({
      driver_number: 12,
      points_current: 179,
      position_current: 1,
    })
  })

  it('does not leak Silverstone results into the Silverstone weekend', () => {
    const snapshot = bundledOpenF1StandingsFor('2026-07-03T00:00:00Z', now)

    expect(snapshot?.asOfDate).toBe('2026-06-28T15:00:00+00:00')
    expect(snapshot?.snapshotSessionKey).toBe(11315)
  })

  it('preserves tied positions from the source standings', () => {
    const snapshot = bundledOpenF1StandingsFor(
      '2026-03-09T00:00:00Z',
      now,
    )!

    expect(
      snapshot.championshipDrivers
        .filter((standing) => standing.position_current === 17)
        .map((standing) => standing.driver_number),
    ).toEqual([18, 6])
  })

  it('returns no future knowledge before the opening race', () => {
    expect(
      bundledOpenF1StandingsFor('2026-03-06T00:00:00Z', now),
    ).toBeNull()
  })

  it('reports season evidence without mutating fixed capability profiles', () => {
    const snapshot = bundledOpenF1StandingsFor('2026-07-17T00:00:00Z', now)!
    const calibration = calibrateFieldFromOpenF1(
      initialTeams,
      initialDrivers,
      snapshot,
    )
    expect(calibration.teams).toEqual(initialTeams)
    expect(calibration.drivers).toEqual(initialDrivers)
    expect(calibration.provenance.provider).toBe('OpenF1')
    expect(calibration.provenance.note).toContain('fixed machine and driver profiles retained')
    expect(calibration.provenance.note).toContain('bundled OpenF1')
  })
})
