import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import type { CarSnapshot } from '../types'
import type { F1RuntimeTireState } from './runtimeSystems'
import { battleDynamicsFor, overtakeForLap, physicalBattleIncidentForLap } from './overtaking'

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
    status: 'running',
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
  it('never converts a random clean-pass outcome into a live time concession',()=>{
    let legacyPasses=0
    for(let seed=0;seed<200;seed++) {
      const context={attacker:initialDrivers[0],defender:initialDrivers[1],attackerCar:f1Car({}),defenderCar:f1Car({}),gapToAheadSeconds:.25,lap:4,seed:`physical-clean-${seed}`,trackGrip:1,weather:'clear' as const,isOpeningLap:false,inRestartWindow:false,lateralSeparationM:0,longitudinalSeparationM:20}
      if(overtakeForLap(context)?.kind==='pass')legacyPasses++
      expect(physicalBattleIncidentForLap(context)).toBeNull()
      expect(physicalBattleIncidentForLap({...context,longitudinalSeparationM:undefined})).toBeNull()
    }
    expect(legacyPasses).toBeGreaterThan(0)
  })
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

  it('allows a normal-race attack from a close 1.2-second gap', () => {
    const outcomes = Array.from({ length: 200 }, (_, index) =>
      overtakeForLap({
        attacker: initialDrivers[0],
        attackerCar: f1Car({}),
        defender: initialDrivers[1],
        defenderCar: f1Car({}),
        gapToAheadSeconds: 1.2,
        inRestartWindow: false,
        isOpeningLap: false,
        lap: 8,
        seed: `normal-race-attack-window-${index}`,
        trackGrip: 1,
        weather: 'clear',
      }),
    )

    expect(
      outcomes.filter((outcome) => outcome?.kind === 'pass').length,
    ).toBeGreaterThan(20)
    expect(
      overtakeForLap({
        attacker: initialDrivers[0],
        attackerCar: f1Car({}),
        defender: initialDrivers[1],
        defenderCar: f1Car({}),
        gapToAheadSeconds: 1.3,
        inRestartWindow: false,
        isOpeningLap: false,
        lap: 8,
        seed: 'outside-normal-race-attack-window',
        trackGrip: 1,
        weather: 'clear',
      }),
    ).toBeNull()
  })
})
