import { describe, expect, it, vi } from 'vitest'
import * as dynamics from '../simulation/vehicleDynamics'
import { createMotorsportConfig, motorsportMachine } from './packages'
import { integrateMotorsportVehicle, motorsportPhysicsFor, neutralPhysicsTeam } from './sharedVehiclePhysics'
import { advanceMotorsportRace, createMotorsportRace } from './race'
import { parseMotorsportSave, serializeMotorsportSave } from './persistence'
import type { MotorsportClass } from './types'

const classes: MotorsportClass[] = ['kyojo', 'gt500', 'gt300', 'hypercar', 'lmgt3', 'lmp2', 'indycar']
const input = {
  activeAeroMode: 'corner' as const, airDensityKgM3: 1.225, currentSpeedKph: 180,
  deltaSeconds: 0.1, fuelLoadKg: 20, gripMultiplier: 1,
  dynamics: { straightness: 1, roadGradeFraction: 0, effectiveCornerRadiusM: 100000 },
  ersPowerKw: 0, throttlePercent: 100, brakePercent: 0,
}

describe('one shared vehicle solver for every category', () => {
  it.each(classes)('%s launches from rest with finite clutch and power-unit state', classId => {
    const machine = motorsportMachine('SIM reference', classId)
    let speed = 0, clutch: number | undefined, spool: number | undefined
    for (let tick = 0; tick < 30; tick++) {
      const step = integrateMotorsportVehicle(machine, { ...input, currentSpeedKph: speed, clutchEngagementFraction: clutch, turboSpoolFraction: spool })
      speed = step.speedKph; clutch = step.clutchEngagementFraction; spool = step.turboSpoolFraction
      expect(Number.isFinite(speed)).toBe(true)
      expect(clutch).toBeGreaterThanOrEqual(0)
      expect(clutch).toBeLessThanOrEqual(1)
    }
    expect(speed).toBeGreaterThan(10)
  })
  it.each(classes)('%s responds to physical power, air density, slope and brakes', classId => {
    const machine = motorsportMachine('SIM reference', classId)
    const free = integrateMotorsportVehicle(machine, input)
    const uphill = integrateMotorsportVehicle(machine, { ...input, dynamics: { ...input.dynamics, roadGradeFraction: 0.08 } })
    const thinAir = integrateMotorsportVehicle(machine, { ...input, airDensityKgM3: 0.9 })
    const braking = integrateMotorsportVehicle(machine, { ...input, throttlePercent: 0, brakePercent: 100 })
    const powerless = integrateMotorsportVehicle(machine, { ...input, combustionPowerKw: 0 })
    expect(uphill.speedKph).toBeLessThan(free.speedKph)
    expect(thinAir.dragForceN).toBeLessThan(free.dragForceN)
    expect(braking.speedKph).toBeLessThan(input.currentSpeedKph)
    expect(powerless.speedKph).toBeLessThan(free.speedKph)
    expect(free.gear).toBeGreaterThanOrEqual(1)
    expect(free.gear).toBeLessThanOrEqual(machine.gears.value)
    expect(free.rpm).toBeGreaterThan(0)
    expect(motorsportPhysicsFor(machine).referenceDragAreaM2).toBe(machine.dragAreaM2.value)
  })

  it.each(['kyojo', 'super-gt', 'wec', 'indycar'] as const)('%s uses the common solver in FP, qualifying, race and pits', category => {
    const spy = vi.spyOn(dynamics, 'integrateVehicleLongitudinalStep')
    try {
      for (const sessionKind of ['practice', 'qualifying', 'race'] as const) {
        const config = createMotorsportConfig(category)
        config.entries = config.entries.slice(0, 1)
        config.sessionKind = sessionKind
        if (sessionKind !== 'race') config.format = { kind: 'time', seconds: 600, basis: 'SIM test' }
        let state = { ...createMotorsportRace(config), phase: 'racing' as const }
        if (sessionKind === 'race') state.cars[0].speedMps = 30
        spy.mockClear()
        state = advanceMotorsportRace(state, 1, config) as typeof state
        expect(spy).toHaveBeenCalled()
        const used = spy.mock.calls.at(-1)![0]
        expect(used.team).toBe(neutralPhysicsTeam)
        expect(used.categoryPhysics?.id).toBe(config.entries[0].classId)
        expect(used.baseVehicleMassKg).toBe(config.entries[0].machine.massKg.value + config.entries[0].machine.driverMassKg.value)
        expect(state.cars[0].rpm).toBe(spy.mock.results.at(-1)!.value.rpm)
        const restored = parseMotorsportSave(serializeMotorsportSave(config, state))!
        expect(restored.state.cars[0].clutchEngagementFraction).toBe(state.cars[0].clutchEngagementFraction)
        expect(restored.state.cars[0].turboSpoolFraction).toBe(state.cars[0].turboSpoolFraction)
      }
    } finally { spy.mockRestore() }
  })

  it('keeps Hypercar assistance within the combined cap and Indycar assistance additive', () => {
    const hypercar = motorsportMachine('SIM reference', 'hypercar')
    const indycar = motorsportMachine('SIM reference', 'indycar')
    const combined = integrateMotorsportVehicle(hypercar, { ...input, combustionPowerKw: hypercar.powerKw.value - 50, ersPowerKw: 50 })
    expect(combined.wheelDrivePowerKw).toBeLessThanOrEqual(hypercar.powerKw.value * 0.94 + 1e-6)
    const base = integrateMotorsportVehicle(indycar, input)
    const boost = integrateMotorsportVehicle(indycar, { ...input, ersPowerKw: 45 })
    expect(boost.speedKph).toBeGreaterThan(base.speedKph)
  })

  it('offers LMH front assistance only when explicitly supplied; fixed bodywork ignores F1 wing modes', () => {
    const machine = motorsportMachine('SIM reference', 'hypercar')
    const launch = { ...input, currentSpeedKph: 70, combustionPowerKw: 320, ersPowerKw: 200, gripMultiplier: 0.5 }
    expect(integrateMotorsportVehicle(machine, { ...launch, frontAxleDrivePowerKw: 200 }).driveForceN).toBeGreaterThan(integrateMotorsportVehicle(machine, launch).driveForceN)
    expect(integrateMotorsportVehicle(machine, { ...input, activeAeroMode: 'straight' }).dragForceN).toBe(integrateMotorsportVehicle(machine, input).dragForceN)
  })
})
