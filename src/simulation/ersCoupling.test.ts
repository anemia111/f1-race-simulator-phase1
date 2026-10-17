import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import { overtakeStatusFor } from './activeAero'
import { categoryPhysicsFor } from './categoryPhysics'
import { integrateVehicleLongitudinalStep } from './vehicleDynamics'
import { mguKTorqueNm } from './drivetrain'

describe('accepted MGU-K mechanical power reaches the contact patch',()=>{
  const physics=categoryPhysicsFor('f1-custom')
  const common={activeAeroMode:'straight' as const,airDensityKgM3:1.225,brakePercent:0,categoryPhysics:physics,combustionPowerKw:0,currentSpeedKph:250,deltaSeconds:0,dynamics:{roadGradeFraction:0,straightness:1},ersPowerKw:200,fuelLoadKg:30,gripMultiplier:1,team:initialTeams[0],turboSpoolFraction:1}
  it('does not multiply already accepted electrical shaft power by the ICE throttle again',()=>{
    const partial=integrateVehicleLongitudinalStep({...common,throttlePercent:60})
    const full=integrateVehicleLongitudinalStep({...common,throttlePercent:100})
    expect(partial.driveForceN).toBeLessThan(partial.tractionLimitN)
    expect(full.wheelDrivePowerKw).toBeCloseTo(200*physics.drivetrainEfficiency,8)
    expect(partial.wheelDrivePowerKw).toBeCloseTo(full.wheelDrivePowerKw,8)
  })
  it('respects the F1 crankshaft-referenced 500 Nm torque limit', () => {
    for (const rpm of [1000, 4000, 5250, 7000, 15000]) {
      expect(mguKTorqueNm({ deploymentPowerKw: 350, physics, rpm })).toBeLessThanOrEqual(500)
    }
    expect(mguKTorqueNm({ deploymentPowerKw: 350, physics, rpm: 5250 })).toBe(500)
    expect(mguKTorqueNm({ deploymentPowerKw: 200, physics, rpm: 15000 })).toBeCloseTo(200000 / (15000 * 2 * Math.PI / 60))
    expect(categoryPhysicsFor('super-formula').hybridDeploymentTorqueLimitNm).toBeUndefined()
  })
  it('does not treat the additional recharge allowance as a dedicated deployment purse', () => {
    const track = tracks.find(candidate => candidate.overtakeControlLines?.length)!
    const progress = track.overtakeControlLines![0].activationProgress + 0.001
    const initial = createInitialRace({ drivers: initialDrivers, teams: initialTeams, track, seed: 'recharge-not-deployment' }).cars[1]
    if (initial.runtimeSystems.kind !== 'f1') throw new Error('Expected F1 runtime')
    const car = { ...initial, status: 'running' as const, progress, totalDistance: 3 + progress,
      runtimeSystems: { ...initial.runtimeSystems, overtakeEligibility: { activationLap: 3, controlLineIndex: 0, detectedGapSeconds: 0.4, eligible: true } } }
    const options = { batteryPercent: 80, car, lowGripConditions: false, phase: null, raceLap: 4, requestedAction: 'request' as const, track }
    expect(overtakeStatusFor({ ...options, overtakeEnergyRemainingMj: 0 })).toBe('active')
    expect(overtakeStatusFor({ ...options, lowGripConditions: true })).toBe('disabled')
    expect(overtakeStatusFor({ ...options, batteryPercent: 0 })).toBe('disabled')
    expect(overtakeStatusFor({ ...options, car: { ...car, runtimeSystems: { ...car.runtimeSystems, overtakeEligibility: null } } })).toBe('disabled')
  })
})
