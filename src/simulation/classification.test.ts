import { describe, expect, it } from 'vitest'
import type { RaceSnapshot } from '../types'
import {
  buildRaceClassification,
  fastestLapFromClassification,
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
    finishedAtSeconds: index < 2 ? 5000 + index * 1.2 : null,
    gapToLeader: index * 1.2,
    gridPosition: index + 1,
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
      penaltyLabel: '+5s pending',
      positionChange: 0,
    })
    expect(entries[2].gapLabel).toBe('DNF mechanical')
    expect(entries[2].statusLabel).toBe('DNF')
  })

  it('selects the best completed lap only from finishers', () => {
    const entries = buildRaceClassification(snapshotFixture())
    const fastestLap = fastestLapFromClassification(entries)

    expect(fastestLap?.code).toBe(entries[1].code)
    expect(fastestLap?.bestLapLap).toBe(27)
  })
})
