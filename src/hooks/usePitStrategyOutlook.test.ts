import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from '../simulation/race'
import { createSuperFormulaRuntimeSystems } from '../simulation/runtimeSystems'
import { pitStrategyOutlookFor } from './usePitStrategyOutlook'

const f1Snapshot = () =>
  createInitialRace({
    drivers: initialDrivers,
    seed: 'pit-strategy-outlook',
    teams: initialTeams,
    track: tracks[0],
  })

describe('pit strategy outlook boundary', () => {
  it('returns the F1 strategy payload for an F1 runtime', () => {
    const snapshot = f1Snapshot()
    const car = snapshot.cars[0]
    const outlook = pitStrategyOutlookFor({
      car,
      driver: initialDrivers[0],
      snapshot,
      track: tracks[0],
    })

    expect(outlook).not.toBeNull()
    expect(outlook?.outlook).toMatchObject({
      compound: expect.any(String),
      estimatedStopLap: expect.any(Number),
      urgency: expect.any(String),
    })
  })

  it('does not run the F1 Pirelli/pit-loss outlook for a SUPER FORMULA runtime', () => {
    const snapshot = f1Snapshot()
    const superFormulaCar = {
      ...snapshot.cars[0],
      runtimeSystems: createSuperFormulaRuntimeSystems({
        entrantId: snapshot.cars[0].teamId,
      }),
    }
    const superFormulaSnapshot = {
      ...snapshot,
      cars: [superFormulaCar, ...snapshot.cars.slice(1)],
    }

    expect(
      pitStrategyOutlookFor({
        car: superFormulaCar,
        driver: initialDrivers[0],
        snapshot: superFormulaSnapshot,
        track: tracks[0],
      }),
    ).toBeNull()
  })
})
