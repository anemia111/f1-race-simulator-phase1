import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace, advanceRace } from './race'
import type { RaceConfig } from '../types'
import { weatherFor } from './weather'
import { seriesPackageById } from '../series/seriesRegistry'

describe('F1 rolling-start ERS', () => {
  it.each(tracks)('releases normal ERS on the first live green ticks at $id', track => {
    const config: RaceConfig = {
      drivers: initialDrivers.slice(0, 3), teams: initialTeams,
      track: { ...track, rainProbability: 0 }, seed: 'dry-rolling-start',
      raceStartMode: 'rolling', freeMode: true, weekendStage: 'race',
      sessionRaceLapsOverride: 10,
    }
    const initial = createInitialRace(config)
    const end = initial.formationLapDurationSeconds * initial.formationLapsPlanned
    let state = advanceRace({ ...initial, elapsedSeconds: end - 0.05 }, 0.1, config)
    expect(state.startProcedure).toBe('racing')
    let deployed = false
    for (let tick = 0; tick < 30; tick += 1) {
      state = advanceRace(state, 0.05, config)
      for (const car of state.cars) {
        if (car.runtimeSystems.kind !== 'f1') continue
        expect(car.runtimeSystems.standingStartMguKReleaseLatched).toBe(true)
        if (car.runtimeSystems.ersPowerKw > 0) {
          deployed = true
          expect(car.runtimeSystems.energyStore.energyRemovedThisLapMJ).toBeGreaterThan(0)
        }
      }
    }
    expect(deployed).toBe(true)
  })
})


describe('wet starting procedures', () => {
  const track = { ...tracks[0], rainProbability: 0.75 }
  const seed = Array.from({ length: 500 }, (_, i) => `wet-start-${i}`)
    .find(candidate => weatherFor(candidate, track, 0) === 'heavy-rain')!
  it('uses reduced, accounted ERS after the wet Australian F1 rolling release', () => {
    const config: RaceConfig = { drivers: initialDrivers.slice(0, 3), teams: initialTeams,
      track, seed, weekendStage: 'race', freeMode: true, sessionRaceLapsOverride: 10 }
    const initial = createInitialRace(config)
    expect(initial.formationBehindSafetyCar).toBe(true)
    expect(initial.lowGripConditions).toBe(true)
    const end = initial.formationLapDurationSeconds * initial.formationLapsPlanned
    let state = advanceRace({ ...initial, elapsedSeconds: end - 0.05 }, 0.1, config)
    let deployed = false
    for (let tick = 0; tick < 40; tick += 1) {
      state = advanceRace(state, 0.05, config)
      expect(state.lowGripConditions).toBe(true)
      for (const car of state.cars) {
        expect(car.overtakeStatus).toBe('disabled')
        if (car.runtimeSystems.kind !== 'f1') continue
        expect(car.runtimeSystems.ersPowerKw).toBeLessThanOrEqual(175)
        if (car.runtimeSystems.ersPowerKw > 0) {
          deployed = true
          expect(car.runtimeSystems.energyStore.energyRemovedThisLapMJ).toBeGreaterThan(0)
          expect(car.runtimeSystems.energyStore.stateOfCharge).toBeLessThan(1)
        }
      }
    }
    expect(deployed).toBe(true)
  })
  it('keeps an SF wet start standing and excludes the F1 safety-car formation rule', () => {
    const sf = seriesPackageById.get('super-formula')!
    const config: RaceConfig = { seriesId: 'super-formula', drivers: sf.drivers.slice(0, 3),
      teams: sf.teams, track, seed, weekendStage: 'race', freeMode: true, sessionRaceLapsOverride: 10 }
    const initial = createInitialRace(config)
    expect(initial.weather).toBe('heavy-rain')
    expect(initial.formationBehindSafetyCar).toBe(false)
    expect(initial.flag).toBe('clear')
    expect(initial.startLightSequenceSeconds).toBeGreaterThan(0)
    const end = initial.formationLapDurationSeconds * initial.formationLapsPlanned
    const grid = advanceRace({ ...initial, elapsedSeconds: end - 0.05 }, 0.1, config)
    expect(grid.startProcedure).toBe('grid')
    expect(grid.raceStartedAtSeconds).toBeNull()
  })
})
