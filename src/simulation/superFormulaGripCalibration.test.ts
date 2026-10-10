import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { categoryPhysicsFor } from './categoryPhysics'
import { superFormulaPhysicsForTrack } from './superFormulaGripCalibration'
import { simulatePhysicalLap } from './physicalLap'
import { runSeriesQualifying } from './qualifying'
import { advanceRace, createInitialRace } from './race'
import { buildTimedSessionPlan } from './timedSessionPlan'
import type { RaceConfig } from '../types'
const sf = seriesPackageById.get('super-formula')!
describe('SF physical qualifying calibration', () => {
  it.each(sf.tracks)('$id fits the reference through contact forces and keeps driver execution', track => {
    const physics = superFormulaPhysicsForTrack(track)
    const lap = simulatePhysicalLap(track, { physics, massKg: 676,
      airTemperatureC: 25, deploymentPowerKw: 0, activeAeroZones: false })
    expect(Math.abs(lap.lapTimeSeconds - track.paceReference2026!.qualifyingSeconds)).toBeLessThan(0.005)
    const qualifying = runSeriesQualifying({ drivers: sf.drivers, teams: sf.teams,
      seed: 'sf-pace-check', seriesId: sf.id, track: { ...track, rainProbability: 0 },
      weekendStage: 'qualifying' }, sf.rules)
    expect(Math.abs(qualifying.classification[0].lapTimeSeconds - track.paceReference2026!.qualifyingSeconds)).toBeLessThan(2)
    expect(physics.combustionPowerKw).toBe(405)
    expect(physics.hybridDeploymentPowerLimitKw).toBe(0)
    expect(superFormulaPhysicsForTrack(track)).toBe(physics)
  })
  it('does not borrow an F1 target for a foreign course', () => {
    const f1 = seriesPackageById.get('f1-custom')!
    expect(superFormulaPhysicsForTrack(f1.tracks[0])).toBe(categoryPhysicsFor('super-formula'))
  })
  it.each(sf.tracks)('$id carries the calibrated forces into a live qualifying lap', track => {
    const drivers = sf.drivers.slice(0, 1)
    const request = { drivers, teams: sf.teams, seed: `live-sf:${track.id}`,
      seriesId: sf.id, track: { ...track, rainProbability: 0 }, weekendStage: 'qualifying' as const }
    const qualifying = runSeriesQualifying(request, sf.rules)
    const config: RaceConfig = { ...request, categoryRaceFormat: sf.rules.race,
      overtakeSystem: sf.rules.overtakeSystem, tireSupplier: sf.rules.tireSupplier,
      timedSessionPlan: buildTimedSessionPlan(qualifying, sf.rules.qualifying.breakSeconds, sf.rules.qualifying.format) }
    let snapshot = createInitialRace(config)
    for (let elapsed = 0; elapsed < 900; elapsed += 3) {
      snapshot = advanceRace(snapshot, 3, config)
      if (snapshot.cars[0].lapHistory.some(lap => lap.isValid && lap.segment === 'Q1')) break
    }
    const laps = snapshot.cars[0].lapHistory.filter(lap => lap.isValid && lap.segment === 'Q1')
    expect(laps.length).toBeGreaterThan(0)
    const best = Math.min(...laps.map(lap => lap.lapTimeSeconds))
    console.info(`SF live ${track.id}: ${best.toFixed(3)}s / reference ${track.paceReference2026!.qualifyingSeconds}s`)
    // The live pedal/braking controller and quasi-steady solver do not trace
    // identical corner transients. Guard both implausible gains and the former
    // 8-16% pace deficit; do not force the crossing clock to the reference.
    expect(best / track.paceReference2026!.qualifyingSeconds).toBeGreaterThan(0.94)
    expect(best / track.paceReference2026!.qualifyingSeconds).toBeLessThan(1.04)
    expect(snapshot.cars[0].runtimeSystems.kind).toBe('super-formula')
  }, 120_000)
})
