import { describe, expect, it } from 'vitest'
import type { RaceSnapshot } from '../types'
import {
  buildRaceClassification,
  fastestLapFromClassification,
  lapDeficitLabel,
} from './classification'
import { createInitialRace } from './race'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'

function snapshotFixture(): RaceSnapshot {
  const snapshot = createInitialRace({
    drivers: initialDrivers,
    seed: 'classification',
    teams: initialTeams,
    track: tracks[0],
  })
  const cars = snapshot.cars.map((car, index) => ({
    ...car,
    bestLapLap: index === 1 ? 27 : 14,
    bestLapTimeSeconds: index === 1 ? 80.1 : 80.4,
    finishedAtSeconds: index < 2 ? 5000 + index * 1.2 : index === 3 ? 5010 : null,
    gapToLeader: index * 1.2,
    gridPosition: index + 1,
    // Car 4 takes the flag seconds after the winner but one lap short.
    lap: index === 3 ? 57 : 58,
    penaltyLaps: 0,
    penaltySeconds: index === 1 ? 5 : 0,
    pitStops: index === 0 ? 1 : 2,
    position: index + 1,
    retiredReason: index === 2 ? 'mechanical' : null,
    status: index === 2 ? ('retired' as const) : ('finished' as const),
  }))

  return { ...snapshot, cars, sessionStatus: 'finished' }
}

describe('race classification', () => {
  it('reports grid change, penalties, compound history and DNF reason', () => {
    const snapshot = snapshotFixture()
    const entries = buildRaceClassification(snapshot)

    expect(entries[0]).toMatchObject({
      gapLabel: 'Winner',
      penaltyLabel: null,
      positionChange: 0,
      statusLabel: 'FIN',
    })
    expect(entries[1]).toMatchObject({
      gapLabel: '+1.200',
      penaltyLabel: '+5s applied',
      positionChange: 0,
    })
    expect(entries[2].gapLabel).toBe('DNF mechanical')
    expect(entries[2].statusLabel).toBe('DNF')
  })

  it('labels a lapped finisher by lap deficit, not crossing-time difference', () => {
    const entries = buildRaceClassification(snapshotFixture())

    expect(entries[3].statusLabel).toBe('FIN')
    expect(entries[3].gapLabel).toBe('+1 lap')
  })

  it('builds lap-deficit labels from classified laps', () => {
    expect(lapDeficitLabel({ lap: 58, penaltyLaps: 0 }, { lap: 58, penaltyLaps: 0 })).toBeNull()
    expect(lapDeficitLabel({ lap: 58, penaltyLaps: 0 }, { lap: 57, penaltyLaps: 0 })).toBe('+1 lap')
    expect(lapDeficitLabel({ lap: 58, penaltyLaps: 0 }, { lap: 55, penaltyLaps: 1 })).toBe('+4 laps')
  })

  it('keeps a valid fastest lap when its driver later retires', () => {
    const entries = buildRaceClassification(snapshotFixture())
    entries[2].bestLapTimeSeconds = 79.9
    entries[2].bestLapLap = 31
    const fastestLap = fastestLapFromClassification(entries)

    expect(fastestLap?.code).toBe(entries[2].code)
    expect(fastestLap?.bestLapLap).toBe(31)
  })
})
