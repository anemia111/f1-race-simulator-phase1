import { it, expect } from 'vitest'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace, skipFormationLap, advanceRace } from '../simulation/race'
import { serializeRaceCheckpoint, parseRaceCheckpoint } from './raceSession'

it.each(['f1-custom', 'super-formula'] as const)('%s restores running snapshots through power transitions, line crossings and pit entry', seriesId => {
  const series = seriesPackageById.get(seriesId)!
  const config = {
    seriesId, drivers: series.drivers.slice(0, 3), teams: series.teams,
    track: { ...tracks[0], rainProbability: 0 }, seed: 'sc-release-lap-timing',
    weekendStage: 'race' as const, freeMode: true, sessionRaceLapsOverride: 10,
    overtakeSystem: seriesId === 'super-formula' ? 'ots' as const : 'active-aero' as const,
  }
  let state = skipFormationLap({ ...createInitialRace(config), formationBehindSafetyCar: true, formationLapsPlanned: 2, startLightSequenceSeconds: 0 }, config)
  let mixedPower = false, pitEntry = false
  for (let i = 0; i < 240; i++) {
    state = advanceRace(state, 0.5, config)
    for (const car of state.cars) {
      if (car.runtimeSystems.kind !== 'f1') continue
      const runtime = car.runtimeSystems
      mixedPower ||= runtime.energyStore.chargeDcPowerKw > 1e-6 && runtime.energyStore.dischargeDcPowerKw > 1e-6
      if (car.status === 'pit' && runtime.energyStore.operatingMode === 'inactive') {
        pitEntry = true
        expect(runtime.superClippingIntensity).toBe(0)
        expect(runtime.superClippingRegenPowerKw).toBe(0)
        expect(runtime.superClippingStartedAtSeconds).toBeNull()
      }
    }
    const restored = parseRaceCheckpoint(serializeRaceCheckpoint('running', state, 1000), 'running', config, 1000)
    expect(restored, `Checkpoint at ${state.elapsedSeconds}s`).not.toBeNull()
    expect(restored!.cars.map(c => [c.driverId, c.totalDistance, c.fuelLoadKg, c.status, c.bestLapTimeSeconds])).toEqual(state.cars.map(c => [c.driverId, c.totalDistance, c.fuelLoadKg, c.status, c.bestLapTimeSeconds]))
  }
  if (seriesId === 'f1-custom') {
    expect(mixedPower).toBe(true)
    expect(pitEntry).toBe(true)
    const car = state.cars.find(c => c.runtimeSystems.kind === 'f1')!
    if (car.runtimeSystems.kind === 'f1') {
      const runtime = car.runtimeSystems
      const corrupted = { ...state, cars: state.cars.map(c => c.driverId === car.driverId ? { ...car, runtimeSystems: { ...runtime, energyStore: { ...runtime.energyStore, chargeDcPowerKw: 10_000 } } } : c) }
      expect(parseRaceCheckpoint(serializeRaceCheckpoint('running', corrupted, 1000), 'running', config, 1000)).toBeNull()
    }
  }
}, 30_000)
