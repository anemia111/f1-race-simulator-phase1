import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from '../hooks/raceSession'
import type { RaceConfig } from '../types'
import { advanceRace, createInitialRace, skipFormationLap } from './race'
import { repairSafetyCarStartTiming } from './startLapTiming'

function scenario(seriesId: 'f1-custom' | 'super-formula', formationLapsPlanned: number) {
  const series = seriesPackageById.get(seriesId)!
  const config: RaceConfig = {
    seriesId, drivers: series.drivers.slice(0, 3), teams: series.teams,
    track: { ...tracks[0], rainProbability: 0 }, seed: 'sc-release-lap-timing',
    weekendStage: 'race', freeMode: true, sessionRaceLapsOverride: 10,
    overtakeSystem: seriesId === 'super-formula' ? 'ots' : 'active-aero',
  }
  const initial = { ...createInitialRace(config), formationBehindSafetyCar: true, formationLapsPlanned, startLightSequenceSeconds: 0 }
  return { config, green: skipFormationLap(initial, config) }
}

describe('SC release is a start, not a completed lap', () => {
  it.each([['f1-custom', 2], ['f1-custom', 3], ['super-formula', 2], ['super-formula', 3]] as const)('%s / %s formation laps ignores the release crossing and records a full next lap', (series, formationLaps) => {
    const { config, green } = scenario(series, formationLaps)
    expect(green.startProcedure).toBe('racing')
    let state = green
    for (let i = 0; i < 100; i++) state = advanceRace(state, 0.05, config)
    for (const car of state.cars) {
      expect(car.bestLapTimeSeconds).toBeNull()
      expect(car.lastLapTimeSeconds).toBeNull()
      expect(car.lapHistory).toEqual([])
      expect(car.processedLap).toBe(formationLaps + 1)
    }
    for (let i = 0; i < 400 && state.cars.some(car => car.lapHistory.length === 0); i++) state = advanceRace(state, 0.5, config)
    for (const car of state.cars) {
      expect(car.lapHistory[0].lap).toBe(formationLaps + 1)
      expect(car.lapHistory[0].lapTimeSeconds).toBeGreaterThan(30)
      expect(car.bestLapTimeSeconds).toBeGreaterThan(30)
    }
  }, 20_000)
  it('repairs the saved opening record, PB sectors and best lap without resetting progress', () => {
    const { config, green } = scenario('f1-custom', 2)
    let state = green
    for (let i = 0; i < 400 && state.cars.some(car => car.lapHistory.length === 0); i++) state = advanceRace(state, 0.5, config)
    const good = state.cars[1].lapHistory[0]
    const broken = { ...green, cars: green.cars.map((car, i) => i === 1 ? {
      ...car, bestLapTimeSeconds: 1, bestLapLap: 2,
      lapHistory: [{ ...good, lap: 2, lapTimeSeconds: 1, sectors: [0.332, 0.268, 0.4] }, good],
    } : car) }
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('sc-lap-test', broken, 1000), 'sc-lap-test', config, 1000)!
    expect(restored).not.toBeNull()
    expect(restored.cars[1].lapHistory).toEqual([good])
    expect(restored.cars[1].bestLapTimeSeconds).toBe(good.lapTimeSeconds)
    expect(restored.cars[1].bestLapLap).toBe(3)
    expect(restored.cars.map(car => [car.totalDistance, car.fuelLoadKg, car.position, car.pitStops])).toEqual(green.cars.map(car => [car.totalDistance, car.fuelLoadKg, car.position, car.pitStops]))
    expect(repairSafetyCarStartTiming(restored, config.track.lengthKm)).toBe(restored)
    expect(repairSafetyCarStartTiming({ ...broken, formationBehindSafetyCar: false }, config.track.lengthKm).cars[1].bestLapTimeSeconds).toBe(1)
    const olderConvention = { ...green, cars: green.cars.map(car => ({ ...car, lapHistory: [{ ...good, lap: 2 }], bestLapTimeSeconds: good.lapTimeSeconds, bestLapLap: 2 })) }
    expect(repairSafetyCarStartTiming(olderConvention, config.track.lengthKm)).toBe(olderConvention)
  })
  it('repairs an early saved release ledger before any lap is completed', () => {
    const { config, green } = scenario('f1-custom', 3)
    const broken = { ...green, cars: green.cars.map(car => ({ ...car, processedLap: 1 })) }
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('sc-release-test', broken, 1000), 'sc-release-test', config, 1000)!
    expect(restored.cars.every(car => car.processedLap === 4)).toBe(true)
    expect(advanceRace(restored, 0.5, config).cars.every(car => car.bestLapTimeSeconds === null)).toBe(true)
  })
})
