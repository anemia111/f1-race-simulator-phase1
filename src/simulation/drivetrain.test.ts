import { describe, expect, it } from 'vitest'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  engineRpmFor,
  enginePowerKwAt,
  engineTorqueNm,
  gearRatiosFor,
  mguKTorqueNm,
  normalisedTorqueAt,
  peakTorqueNm,
  powerUnitDriveForceN,
  powerUnitTorqueNm,
  selectGear,
  turboResponseFraction,
} from './drivetrain'

const f1 = categoryPhysicsFor('f1-custom')
const f2 = categoryPhysicsFor('f2')
const f3 = categoryPhysicsFor('f3')

const mps = (speedKph: number) => speedKph / 3.6

describe('gearRatiosFor', () => {
  it('produces one ratio per gear, falling from first to top', () => {
    const ratios = gearRatiosFor(f1)

    expect(ratios).toHaveLength(f1.gearCount)
    for (let index = 1; index < ratios.length; index += 1) {
      expect(ratios[index]).toBeLessThan(ratios[index - 1])
    }
  })

  it('gears top so the limiter arrives at the geared-for speed', () => {
    const rpm = engineRpmFor({
      gear: f1.gearCount,
      physics: f1,
      speedMps: mps(f1.topGearEfficiencyStartKph),
    })

    expect(rpm).toBeCloseTo(f1.maximumEngineRpm, 0)
  })

  it('spans first to top by the configured spread', () => {
    const ratios = gearRatiosFor(f1)

    expect(ratios[0] / ratios[ratios.length - 1]).toBeCloseTo(f1.gearSpread, 6)
  })
})

describe('the torque curve', () => {
  it('peaks at the configured rev fraction', () => {
    const peak = normalisedTorqueAt(f1.peakTorqueRevFraction, f1.peakTorqueRevFraction)

    expect(peak).toBeCloseTo(1, 6)
    expect(normalisedTorqueAt(f1.peakTorqueRevFraction - 0.2, f1.peakTorqueRevFraction)).toBeLessThan(peak)
    expect(normalisedTorqueAt(1, f1.peakTorqueRevFraction)).toBeLessThan(peak)
  })

  it('makes peak power later than peak torque', () => {
    const powerAt = (fraction: number) =>
      enginePowerKwAt({ physics: f1, rpm: fraction * f1.maximumEngineRpm })
    let bestFraction = 0
    let bestPower = 0

    for (let step = 1; step <= 100; step += 1) {
      const fraction = step / 100
      const power = powerAt(fraction)

      if (power > bestPower) {
        bestPower = power
        bestFraction = fraction
      }
    }

    expect(bestFraction).toBeGreaterThan(f1.peakTorqueRevFraction)
  })

  it('reaches exactly the published rated output at its best point', () => {
    for (const physics of [f1, f2, f3]) {
      let bestPowerKw = 0

      for (let step = 1; step <= 200; step += 1) {
        bestPowerKw = Math.max(
          bestPowerKw,
          enginePowerKwAt({
            physics,
            rpm: (step / 200) * physics.maximumEngineRpm,
          }),
        )
      }

      expect(bestPowerKw).toBeCloseTo(physics.combustionPowerKw, 0)
    }
  })

  it('produces no torque past the limiter', () => {
    expect(
      engineTorqueNm({ physics: f1, rpm: f1.maximumEngineRpm + 1 }),
    ).toBe(0)
  })

  it('gives a heavier engine more torque for the same power at lower revs', () => {
    // F2 makes more kW than F1's combustion side but revs to 8 750 rather than
    // 15 000, so its peak torque has to be far higher.
    expect(peakTorqueNm(f2)).toBeGreaterThan(peakTorqueNm(f1))
  })
})

describe('mguKTorqueNm', () => {
  it('holds flat torque below base speed and constant power above it', () => {
    const low = mguKTorqueNm({ deploymentPowerKw: 350, physics: f1, rpm: 2000 })
    const base = mguKTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: f1.maximumEngineRpm * 0.35,
    })
    const high = mguKTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: f1.maximumEngineRpm,
    })

    expect(low).toBeCloseTo(base, 6)
    expect(high).toBeLessThan(base)
  })

  it('is nothing without deployment', () => {
    expect(
      mguKTorqueNm({ deploymentPowerKw: 0, physics: f1, rpm: 9000 }),
    ).toBe(0)
  })

  it('adds more torque low down than dividing its power by engine speed would', () => {
    const rpm = 3000
    const angularSpeed = (rpm * 2 * Math.PI) / 60
    const constantPowerTorque = (350 * 1000) / angularSpeed
    const modelled = mguKTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm,
    })

    expect(modelled).toBeLessThan(constantPowerTorque)
    expect(modelled).toBeGreaterThan(0)
  })
})

describe('turboResponseFraction', () => {
  it('builds from nothing toward full torque', () => {
    const immediate = turboResponseFraction({
      physics: f1,
      rpm: 6000,
      secondsSinceThrottleOpened: 0,
    })
    const settled = turboResponseFraction({
      physics: f1,
      rpm: 6000,
      secondsSinceThrottleOpened: 3,
    })

    expect(immediate).toBeCloseTo(0, 6)
    expect(settled).toBeGreaterThan(0.99)
  })

  it('spools faster at high revs', () => {
    const low = turboResponseFraction({
      physics: f1,
      rpm: 4000,
      secondsSinceThrottleOpened: 0.2,
    })
    const high = turboResponseFraction({
      physics: f1,
      rpm: 13000,
      secondsSinceThrottleOpened: 0.2,
    })

    expect(high).toBeGreaterThan(low)
  })
})

describe('the power unit as a whole', () => {
  it('adds electrical torque to combustion torque at the crankshaft', () => {
    const combustionOnly = powerUnitTorqueNm({ physics: f1, rpm: 9000 })
    const deploying = powerUnitTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: 9000,
    })

    expect(deploying).toBeGreaterThan(combustionOnly)
  })

  it('covers the turbo gap with electrical torque', () => {
    const laggingCombustion = powerUnitTorqueNm({
      physics: f1,
      rpm: 5000,
      secondsSinceThrottleOpened: 0.05,
    })
    const laggingWithDeployment = powerUnitTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: 5000,
      secondsSinceThrottleOpened: 0.05,
    })

    expect(laggingWithDeployment).toBeGreaterThan(laggingCombustion * 2)
  })

  it('selects a higher gear as speed rises and never exceeds the limiter', () => {
    let previousGear = 0

    for (const speedKph of [60, 120, 180, 240, 300, 340]) {
      const selection = selectGear({ physics: f1, speedMps: mps(speedKph) })

      expect(selection.gear).toBeGreaterThanOrEqual(previousGear)
      expect(selection.rpm).toBeLessThanOrEqual(f1.maximumEngineRpm)
      expect(selection.gear).toBeGreaterThanOrEqual(1)
      expect(selection.gear).toBeLessThanOrEqual(f1.gearCount)
      previousGear = selection.gear
    }
  })

  it('reports the revs the force was computed from', () => {
    const selection = selectGear({ physics: f1, speedMps: mps(200) })
    const rpm = engineRpmFor({
      gear: selection.gear,
      physics: f1,
      speedMps: mps(200),
    })

    expect(selection.rpm).toBeCloseTo(rpm, 6)
  })

  it('falls away with speed, unlike a constant-power assumption', () => {
    const at100 = powerUnitDriveForceN({
      physics: f1,
      speedMps: mps(100),
      throttleFraction: 1,
    })
    const at300 = powerUnitDriveForceN({
      physics: f1,
      speedMps: mps(300),
      throttleFraction: 1,
    })

    expect(at100).toBeGreaterThan(at300)
  })

  it('scales with throttle', () => {
    const full = powerUnitDriveForceN({
      physics: f1,
      speedMps: mps(150),
      throttleFraction: 1,
    })
    const half = powerUnitDriveForceN({
      physics: f1,
      speedMps: mps(150),
      throttleFraction: 0.5,
    })

    expect(half).toBeCloseTo(full / 2, 6)
    expect(
      powerUnitDriveForceN({
        physics: f1,
        speedMps: mps(150),
        throttleFraction: 0,
      }),
    ).toBe(0)
  })
})
