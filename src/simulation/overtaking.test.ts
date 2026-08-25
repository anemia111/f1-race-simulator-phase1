import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { CarSnapshot } from '../types'
import type { F1RuntimeTireState } from './runtimeSystems'
import { battleDynamicsFor } from './overtaking'

const f1Car = (tires: Partial<F1RuntimeTireState>): CarSnapshot =>
  ({
    overtakeStatus: 'inactive',
    runtimeSystems: {
      kind: 'f1',
      ersPowerKw: 0,
      tires: {
        tire: 'M',
        tireAgeLaps: 8,
        tireTemperatureC: 96,
        tireWearPercent: 18,
        tireThermalStressPercent: 0,
        tireCarcassTemperatureC: 92,
        tireGrainingPercent: 0,
        tireOverheatingPercent: 0,
        ...tires,
      },
    } as CarSnapshot['runtimeSystems'],
    speedKph: 250,
  }) as unknown as CarSnapshot

const superFormulaCar = (): CarSnapshot =>
  ({
    overtakeStatus: 'inactive',
    runtimeSystems: {
      kind: 'super-formula',
    } as CarSnapshot['runtimeSystems'],
    speedKph: 250,
  }) as unknown as CarSnapshot

describe('overtaking category boundary', () => {
  it('omits direct tyre edges and keeps F1 ERS out of SUPER FORMULA', () => {
    const f1Dynamics = battleDynamicsFor({
      attacker: initialDrivers[0],
      attackerCar: f1Car({ tireAgeLaps: 31, tireWearPercent: 92 }),
      defender: initialDrivers[1],
      defenderCar: f1Car({ tireAgeLaps: 2, tireWearPercent: 4 }),
      gapToAheadSeconds: 0.7,
      lap: 14,
      seed: 'f1-tyre-battle',
      trackGrip: 1,
      weather: 'clear',
    })
    const superFormulaDynamics = battleDynamicsFor({
      attacker: initialDrivers[0],
      attackerCar: superFormulaCar(),
      defender: initialDrivers[1],
      defenderCar: superFormulaCar(),
      gapToAheadSeconds: 0.7,
      lap: 14,
      seed: 'sf-tyre-battle',
      trackGrip: 1,
      weather: 'clear',
    })

    expect(f1Dynamics).not.toHaveProperty('tirePerformanceEdge')
    expect(superFormulaDynamics).not.toHaveProperty('tirePerformanceEdge')
    expect(superFormulaDynamics.ersPowerDeltaKw).toBe(0)
    expect(superFormulaDynamics.electricalPerformanceEdge).toBe(0)
  })
})
