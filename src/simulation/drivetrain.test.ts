import { describe, expect, it } from 'vitest'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  advanceClutchState,
  advanceTurboState,
  engineRpmFor,
  enginePowerKwAt,
  engineTorqueNm,
  gearRatiosFor,
  mguKTorqueNm,
  normalisedTorqueAt,
  peakTorqueNm,
  powerUnitDriveForceN,
  powerUnitForceInGear,
  powerUnitTorqueNm,
  selectGear,
  turboResponseFraction,
} from './drivetrain'
import { remainingEllipseForceN, tyreGripAt } from './tyreForces'

const f1 = categoryPhysicsFor('f1-custom')
const superFormula = categoryPhysicsFor('super-formula')

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
      speedMps: mps(f1.topGearDesignSpeedKph),
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
    for (const physics of [f1, superFormula]) {
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

  it('gives a lower-revving engine more torque for similar power', () => {
    // The SF NRE makes similar combustion power to F1 but revs to 10 500
    // rather than 15 000, so its peak torque has to be higher.
    expect(peakTorqueNm(superFormula)).toBeGreaterThan(peakTorqueNm(f1))
  })
})

describe('mguKTorqueNm', () => {
  it('holds flat torque below base speed and constant power above it', () => {
    const low = mguKTorqueNm({ deploymentPowerKw: 350, physics: f1, rpm: 2000 })
    const anotherLow = mguKTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: 4000,
    })
    const high = mguKTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm: f1.maximumEngineRpm,
    })

    expect(low).toBeCloseTo(anotherLow, 6)
    expect(high).toBeLessThan(anotherLow)
  })

  it('is nothing without deployment', () => {
    expect(
      mguKTorqueNm({ deploymentPowerKw: 0, physics: f1, rpm: 9000 }),
    ).toBe(0)
  })

  it('caps low-speed torque below the divergent P / omega result', () => {
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

  it('keeps spool state between ticks and both builds and decays', () => {
    const first = advanceTurboState({
      deltaSeconds: 0.1,
      physics: f1,
      previousState: { spoolFraction: 0 },
      rpm: 7000,
      throttleFraction: 1,
    })
    const second = advanceTurboState({
      deltaSeconds: 0.1,
      physics: f1,
      previousState: first,
      rpm: 7000,
      throttleFraction: 1,
    })
    const lifted = advanceTurboState({
      deltaSeconds: 0.2,
      physics: f1,
      previousState: second,
      rpm: 7000,
      throttleFraction: 0,
    })

    expect(first.spoolFraction).toBeGreaterThan(0)
    expect(second.spoolFraction).toBeGreaterThan(first.spoolFraction)
    expect(lifted.spoolFraction).toBeLessThan(second.spoolFraction)
    expect(Number.isFinite(lifted.spoolFraction)).toBe(true)
  })
})

describe('standing launch', () => {
  it('produces a finite positive raw drive force from 0 km/h', () => {
    const selection = selectGear({ physics: f1, speedMps: 0 })

    expect(selection.gear).toBe(1)
    expect(selection.wheelCoupledRpm).toBe(0)
    expect(selection.rpm).toBeGreaterThanOrEqual(f1.minimumEngineRpm)
    expect(selection.clutchSlipping).toBe(true)
    expect(selection.driveForceN).toBeGreaterThan(0)
    expect(Number.isFinite(selection.driveForceN)).toBe(true)
  })

  it('engages the clutch continuously over elapsed time', () => {
    const first = advanceClutchState({
      deltaSeconds: 0.1,
      physics: f1,
      previousState: { engagementFraction: 0 },
      speedMps: 0,
      throttleFraction: 1,
    })
    const second = advanceClutchState({
      deltaSeconds: 0.2,
      physics: f1,
      previousState: first,
      speedMps: mps(10),
      throttleFraction: 1,
    })

    expect(first.engagementFraction).toBeGreaterThan(0)
    expect(second.engagementFraction).toBeGreaterThan(
      first.engagementFraction,
    )
    expect(second.engagementFraction).toBeLessThanOrEqual(1)
  })

  it('uses a finite launch torque capacity while the clutch slips', () => {
    const lightlyEngaged = selectGear({
      clutchEngagementFraction: 0.2,
      launchTorqueLimitNm: 600,
      physics: f1,
      speedMps: 0,
    })
    const furtherEngaged = selectGear({
      clutchEngagementFraction: 0.6,
      launchTorqueLimitNm: 600,
      physics: f1,
      speedMps: 0,
    })

    expect(lightlyEngaged.driveForceN).toBeGreaterThan(0)
    expect(furtherEngaged.driveForceN).toBeGreaterThan(
      lightlyEngaged.driveForceN,
    )
    expect(Number.isFinite(furtherEngaged.driveForceN)).toBe(true)
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

  it('does not apply turbo lag to electrical torque', () => {
    const rpm = 5000
    const laggingCombustion = powerUnitTorqueNm({
      physics: f1,
      rpm,
      turboSpoolFraction: 0,
    })
    const laggingWholeUnit = powerUnitTorqueNm({
      deploymentPowerKw: 350,
      physics: f1,
      rpm,
      turboSpoolFraction: 0,
    })

    expect(laggingCombustion).toBe(0)
    expect(laggingWholeUnit).toBeCloseTo(
      mguKTorqueNm({ deploymentPowerKw: 350, physics: f1, rpm }),
      6,
    )
  })

  it('adds ICE and MGU-K once at the crankshaft', () => {
    const rpm = 9000
    const combustion = powerUnitTorqueNm({
      deploymentPowerKw: 0,
      physics: f1,
      rpm,
      turboSpoolFraction: 0.7,
    })
    const electrical = mguKTorqueNm({
      deploymentPowerKw: 250,
      physics: f1,
      rpm,
    })
    const combined = powerUnitTorqueNm({
      deploymentPowerKw: 250,
      physics: f1,
      rpm,
      turboSpoolFraction: 0.7,
    })

    expect(combined).toBeCloseTo(combustion + electrical, 10)
  })

  it('routes a physical combustion-power override through the same curve and gearing', () => {
    const baseline = selectGear({
      combustionPowerKw: 400,
      physics: f1,
      speedMps: mps(180),
    })
    const boosted = selectGear({
      combustionPowerKw: 437,
      physics: f1,
      speedMps: mps(180),
    })

    expect(boosted.driveForceN).toBeGreaterThan(baseline.driveForceN)
    expect(boosted.rpm).toBeGreaterThanOrEqual(f1.minimumEngineRpm)
    expect(Number.isFinite(boosted.driveForceN)).toBe(true)
  })

  it('increases raw force in order for 0, 250 and 350 kW deployment', () => {
    const forceAt = (deploymentPowerKw: number) =>
      selectGear({
        deploymentPowerKw,
        physics: f1,
        speedMps: mps(150),
      }).driveForceN
    const withoutDeployment = forceAt(0)
    const at250Kw = forceAt(250)
    const at350Kw = forceAt(350)

    expect(at250Kw).toBeGreaterThan(withoutDeployment)
    expect(at350Kw).toBeGreaterThan(at250Kw)
  })

  it('can select a different optimum gear when deployment is available', () => {
    // This explicit synthetic motor has a lower maximum torque and therefore
    // a higher torque/power crossover speed. It proves selectGear considers
    // the whole unit without changing the baseline F1 motor map to force a
    // shift for the test.
    const syntheticHighBaseSpeedMotor = {
      mguKBaseSpeedRpm: f1.maximumEngineRpm * 0.82,
      physics: f1,
    }
    const speedWithDifferentGear = Array.from(
      { length: 321 },
      (_, index) => index + 60,
    ).find((speedKph) => {
      const combustionGear = selectGear({
        deploymentPowerKw: 0,
        ...syntheticHighBaseSpeedMotor,
        speedMps: mps(speedKph),
      }).gear
      const hybridGear = selectGear({
        deploymentPowerKw: 350,
        ...syntheticHighBaseSpeedMotor,
        speedMps: mps(speedKph),
      }).gear

      return combustionGear !== hybridGear
    })

    expect(speedWithDifferentGear).toBeDefined()
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
    const evaluated = powerUnitForceInGear({
      gear: selection.gear,
      physics: f1,
      speedMps: mps(200),
    })

    expect(selection.rpm).toBeCloseTo(evaluated.rpm, 10)
    expect(selection.driveForceN).toBeCloseTo(evaluated.driveForceN, 10)
  })

  it('keeps RPM and force finite on both sides of every shift', () => {
    let previous = selectGear({ physics: f1, speedMps: mps(40) })
    let shiftCount = 0

    for (let speedKph = 40.25; speedKph <= 390; speedKph += 0.25) {
      const current = selectGear({ physics: f1, speedMps: mps(speedKph) })

      for (const value of [
        previous.rpm,
        previous.driveForceN,
        current.rpm,
        current.driveForceN,
      ]) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }

      if (current.gear !== previous.gear) {
        shiftCount += 1
        expect(current.rpm).toBeLessThanOrEqual(f1.maximumEngineRpm)
        expect(previous.rpm).toBeLessThanOrEqual(f1.maximumEngineRpm)
      }

      previous = current
    }

    expect(shiftCount).toBeGreaterThan(0)
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

  it('leaves the raw power-unit force for the tyre model to limit', () => {
    const speedMps = mps(100)
    const rawDriveForceN = powerUnitDriveForceN({
      deploymentPowerKw: 350,
      physics: f1,
      speedMps,
      throttleFraction: 1,
    })
    const tyreGrip = tyreGripAt({
      massKg: f1.minimumMassKg,
      physics: f1,
      speedMps,
    })
    const remainingLongitudinalForceN = remainingEllipseForceN({
      availableForceN: tyreGrip.availableForceN,
      usedForceN: tyreGrip.availableForceN * 0.8,
    })
    const appliedDriveForceN = Math.min(
      rawDriveForceN,
      remainingLongitudinalForceN,
    )

    expect(rawDriveForceN).toBeGreaterThan(remainingLongitudinalForceN)
    expect(appliedDriveForceN).toBe(remainingLongitudinalForceN)
  })
})
