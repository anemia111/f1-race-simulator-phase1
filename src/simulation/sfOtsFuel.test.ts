import { expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { advanceRace, createInitialRace } from './race'
import { advanceSfOts, createSfOtsSimulation, sfOtsAdditionalFuelKg } from './sfOtsRuntime'
import { trackDynamicsAt } from './trackDynamics'
import { superFormulaPhysicsForTrack } from './superFormulaGripCalibration'
import { driverFuelUseMultiplier, fuelBurnKgPerLap } from './vehicleDynamics'

it('charges boost fuel only for the consumed OTS time and actual throttle', () => {
  const before = { ...createSfOtsSimulation('fuji-sf')!, remainingSeconds: 0.04 }
  const after = advanceSfOts(before, true, true, 120, 0.1)
  const options = { before, after, baseFuelKgPerSecond: 0.025, combustionPowerKw: 405, throttlePercent: 100 }
  expect(after.remainingSeconds).toBe(0)
  expect(sfOtsAdditionalFuelKg(options)).toBeCloseTo(0.04 * 0.025 * 37 / 405, 12)
  expect(sfOtsAdditionalFuelKg({ ...options, throttlePercent: 50 })).toBeCloseTo(sfOtsAdditionalFuelKg(options) / 2, 12)
  expect(sfOtsAdditionalFuelKg({ ...options, throttlePercent: 0 })).toBe(0)
  expect(sfOtsAdditionalFuelKg({ ...options, after: before })).toBe(0)
})

it('debits additional fuel in a real SF race tick, including the final partial OTS use', () => {
  const series = seriesPackageById.get('super-formula')!
  const track = series.tracks[0], driver = series.drivers[0]
  const team = series.teams.find(candidate => candidate.id === driver.teamId)!
  const physics = superFormulaPhysicsForTrack(track)
  const config = { seriesId: 'super-formula' as const, drivers: [driver], teams: series.teams, track,
    seed: 'ots-fuel', freeMode: true, sessionRaceLapsOverride: 25, weekendStage: 'race' as const, overtakeSystem: 'ots' as const }
  const initial = createInitialRace(config)
  const progress = Array.from({ length: 1000 }, (_, index) => index / 1000)
    .sort((a, b) => trackDynamicsAt(track, b, physics).straightness - trackDynamicsAt(track, a, physics).straightness)[0]
  const car = { ...initial.cars[0], status: 'running' as const, pitPhase: 'none' as const,
    progress, totalDistance: 2 + progress, lap: 2, processedLap: 2, speedKph: 250,
    throttlePercent: 100, brakePercent: 0, racePaceMode: 'push' as const }
  if (car.runtimeSystems.kind !== 'super-formula') throw Error('Expected SF')
  car.runtimeSystems = { ...car.runtimeSystems, otsSimulation: { ...car.runtimeSystems.otsSimulation!, remainingSeconds: 0.04, active: true } }
  const next = advanceRace({ ...initial, cars: [car], startProcedure: 'racing', elapsedSeconds: 120, raceStartedAtSeconds: 0 }, 0.1, config)
  const result = next.cars[0]
  if (result.runtimeSystems.kind !== 'super-formula') throw Error('Expected SF')
  expect(result.runtimeSystems.otsSimulation!.remainingSeconds).toBe(0)
  const baseFuel = fuelBurnKgPerLap({ paceMode: result.racePaceMode, phase: null, team, track, weather: 'clear' }) * driverFuelUseMultiplier(driver)
  const ordinaryBurn = (result.totalDistance - car.totalDistance) * baseFuel
  expect(car.fuelLoadKg - result.fuelLoadKg).toBeGreaterThan(ordinaryBurn)
})
