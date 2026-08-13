import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from '../simulation/race'
import { createSuperFormulaRuntimeSystems } from '../simulation/runtimeSystems'
import { qualifyingRuntimeTireSummaryFor } from './QualifyingClassificationPanel'

describe('qualifying classification tyre summaries', () => {
  it('uses the F1 nested Pirelli tyre state', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'qualifying-classification-tyre-summary',
      teams: initialTeams,
      track: tracks[0],
    })
    const runtimeSystems = snapshot.cars[0].runtimeSystems

    if (runtimeSystems.kind !== 'f1') {
      throw new Error('Expected the default race fixture to use F1 runtime systems.')
    }

    expect(qualifyingRuntimeTireSummaryFor(runtimeSystems)).toBe(
      `${runtimeSystems.tires.tire} / ${runtimeSystems.tires.tireAgeLaps}L`,
    )
  })

  it('keeps SUPER FORMULA on dry/wet control tyres with unavailable physics', () => {
    const runtimeSystems = createSuperFormulaRuntimeSystems({
      entrantId: 'sf-qualifying-summary',
      initialTireSurface: 'wet',
    })

    expect(qualifyingRuntimeTireSummaryFor(runtimeSystems)).toBe(
      'WET CONTROL / 0L / PHYSICAL MODEL UNAVAILABLE',
    )
  })
})
