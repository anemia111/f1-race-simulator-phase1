import { describe, expect, it } from 'vitest'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  aerodynamicDownforceN,
  axleLoadsN,
  corneringSpeedLimitMps,
  GRAVITY_MPS2,
  lateralLoadsN,
  maximumLateralAccelerationMps2,
  remainingEllipseForceN,
  tyreFrictionCoefficient,
  tyreGripAt,
} from './tyreForces'

const f1 = categoryPhysicsFor('f1-custom')
const f2 = categoryPhysicsFor('f2')
const f3 = categoryPhysicsFor('f3')
const superFormula = categoryPhysicsFor('super-formula')

const kph = (mps: number) => mps * 3.6
const mps = (speedKph: number) => speedKph / 3.6
/** Race trim: minimum mass plus a representative fuel load. */
const massFor = (physics: typeof f1, fuelKg = 30) =>
  physics.minimumMassKg + fuelKg

describe('aerodynamicDownforceN', () => {
  it('rises with the square of speed', () => {
    const at100 = aerodynamicDownforceN({
      airDensityKgM3: 1.225,
      liftAreaM2: f1.liftAreaM2,
      speedMps: 100,
    })
    const at200 = aerodynamicDownforceN({
      airDensityKgM3: 1.225,
      liftAreaM2: f1.liftAreaM2,
      speedMps: 200,
    })

    expect(at200 / at100).toBeCloseTo(4, 6)
  })

  it('generates more than the car weighs at racing speed', () => {
    const downforceN = aerodynamicDownforceN({
      airDensityKgM3: 1.225,
      liftAreaM2: f1.liftAreaM2,
      speedMps: mps(250),
    })

    expect(downforceN / (massFor(f1) * GRAVITY_MPS2)).toBeGreaterThan(1.5)
  })

  it('is zero at rest and never negative', () => {
    expect(
      aerodynamicDownforceN({
        airDensityKgM3: 1.225,
        liftAreaM2: f1.liftAreaM2,
        speedMps: 0,
      }),
    ).toBe(0)
    expect(
      aerodynamicDownforceN({
        airDensityKgM3: 1.225,
        liftAreaM2: f1.liftAreaM2,
        speedMps: -20,
      }),
    ).toBe(0)
  })
})

describe('tyreFrictionCoefficient', () => {
  it('returns the peak coefficient at the reference load', () => {
    expect(
      tyreFrictionCoefficient({
        physics: f1,
        referenceLoadN: 8000,
        verticalLoadN: 8000,
      }),
    ).toBeCloseTo(f1.peakTyreFrictionCoefficient, 8)
  })

  it('falls as load rises, so a tyre is less efficient the harder it is pressed', () => {
    const light = tyreFrictionCoefficient({
      physics: f1,
      referenceLoadN: 8000,
      verticalLoadN: 8000,
    })
    const heavy = tyreFrictionCoefficient({
      physics: f1,
      referenceLoadN: 8000,
      verticalLoadN: 24000,
    })

    expect(heavy).toBeLessThan(light)
    // Force still grows with load; only the force per newton falls.
    expect(heavy * 24000).toBeGreaterThan(light * 8000)
  })
})

describe('tyreGripAt', () => {
  it('has far more grip at speed than at rest', () => {
    const stationary = tyreGripAt({ massKg: massFor(f1), physics: f1, speedMps: 0 })
    const fast = tyreGripAt({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(250),
    })

    expect(fast.availableAccelerationMps2).toBeGreaterThan(
      stationary.availableAccelerationMps2 * 2,
    )
  })

  it('reports roughly the peak coefficient when there is no downforce', () => {
    const stationary = tyreGripAt({ massKg: massFor(f1), physics: f1, speedMps: 0 })

    expect(stationary.frictionCoefficient).toBeCloseTo(
      f1.peakTyreFrictionCoefficient,
      6,
    )
    expect(stationary.availableAccelerationMps2 / GRAVITY_MPS2).toBeCloseTo(
      f1.peakTyreFrictionCoefficient,
      6,
    )
  })

  it('scales with the surface and compound state it is given', () => {
    const dry = tyreGripAt({ massKg: massFor(f1), physics: f1, speedMps: mps(200) })
    const wet = tyreGripAt({
      gripMultiplier: 0.7,
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(200),
    })

    expect(wet.availableForceN).toBeLessThan(dry.availableForceN)
    expect(wet.availableForceN / dry.availableForceN).toBeCloseTo(0.7, 6)
  })
})

describe('remainingEllipseForceN', () => {
  it('leaves the full budget when nothing is used', () => {
    expect(
      remainingEllipseForceN({ availableForceN: 1000, usedForceN: 0 }),
    ).toBeCloseTo(1000, 6)
  })

  it('leaves nothing when the budget is already spent', () => {
    expect(
      remainingEllipseForceN({ availableForceN: 1000, usedForceN: 1000 }),
    ).toBeCloseTo(0, 6)
  })

  it('follows the circle, not a straight line', () => {
    // Half the grip spent longitudinally still leaves 86 %, not 50 %.
    expect(
      remainingEllipseForceN({ availableForceN: 1000, usedForceN: 500 }),
    ).toBeCloseTo(Math.sqrt(0.75) * 1000, 6)
  })
})

describe('load transfer', () => {
  it('moves load to the front under braking and to the rear under power', () => {
    const total = 20000
    const braking = axleLoadsN({
      longitudinalAccelerationMps2: -40,
      massKg: massFor(f1),
      physics: f1,
      totalVerticalLoadN: total,
    })
    const accelerating = axleLoadsN({
      longitudinalAccelerationMps2: 12,
      massKg: massFor(f1),
      physics: f1,
      totalVerticalLoadN: total,
    })

    expect(braking.frontN).toBeGreaterThan(accelerating.frontN)
    expect(accelerating.rearN).toBeGreaterThan(braking.rearN)
    expect(braking.frontN + braking.rearN).toBeCloseTo(total, 6)
  })

  it('moves load to the outside tyres in a corner', () => {
    const { innerN, outerN } = lateralLoadsN({
      lateralAccelerationMps2: 30,
      massKg: massFor(f1),
      physics: f1,
      totalVerticalLoadN: 20000,
    })

    expect(outerN).toBeGreaterThan(innerN)
    expect(innerN + outerN).toBeCloseTo(20000, 6)
  })

  it('costs grip overall, because the loaded side gains less than the light side loses', () => {
    const balanced = maximumLateralAccelerationMps2({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(200),
    })
    const withoutLoadSensitivity = tyreGripAt({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(200),
    }).availableAccelerationMps2

    expect(balanced).toBeLessThan(withoutLoadSensitivity)
  })
})

describe('maximumLateralAccelerationMps2', () => {
  it('reaches the cornering loads an F1 car is known to pull', () => {
    const slow = maximumLateralAccelerationMps2({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(80),
    })
    const fast = maximumLateralAccelerationMps2({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(280),
    })

    // A slow corner is close to mechanical grip. It cannot fall below the peak
    // coefficient the tyre is defined with, and 80 km/h still puts about a
    // fifth of the car's weight back on through downforce, so this lands just
    // above it rather than at the 1.5 g a road car would manage.
    expect(slow / GRAVITY_MPS2).toBeGreaterThan(1.6)
    expect(slow / GRAVITY_MPS2).toBeLessThan(2.3)
    // Aerodynamically loaded, into the 4-6 g band.
    expect(fast / GRAVITY_MPS2).toBeGreaterThan(4)
    expect(fast / GRAVITY_MPS2).toBeLessThan(6.5)
  })

  it('reproduces the published feeder-series peak lateral figures', () => {
    // F2 publishes 3.5 g and F3 publishes 2.6 g. Neither number is an input to
    // the model: they fall out of the lift area, tyre coefficient and load
    // sensitivity, so this is what stops those being tuned to anything.
    const f3At250 =
      maximumLateralAccelerationMps2({
        massKg: massFor(f3),
        physics: f3,
        speedMps: mps(250),
      }) / GRAVITY_MPS2
    const f2At300 =
      maximumLateralAccelerationMps2({
        massKg: massFor(f2),
        physics: f2,
        speedMps: mps(300),
      }) / GRAVITY_MPS2

    expect(f3At250).toBeGreaterThan(2.4)
    expect(f3At250).toBeLessThan(2.9)
    expect(f2At300).toBeGreaterThan(3.3)
    expect(f2At300).toBeLessThan(3.9)
  })

  it('orders the categories by downforce at speed', () => {
    const at250 = (physics: typeof f1) =>
      maximumLateralAccelerationMps2({
        massKg: massFor(physics),
        physics,
        speedMps: mps(250),
      })

    expect(at250(f1)).toBeGreaterThan(at250(superFormula))
    expect(at250(superFormula)).toBeGreaterThan(at250(f2))
    expect(at250(f2)).toBeGreaterThan(at250(f3))
  })

  it('gives back lateral grip that is already being spent on braking', () => {
    const free = maximumLateralAccelerationMps2({
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(200),
    })
    const trailBraking = maximumLateralAccelerationMps2({
      longitudinalUseFraction: 0.7,
      massKg: massFor(f1),
      physics: f1,
      speedMps: mps(200),
    })

    expect(trailBraking).toBeLessThan(free)
    expect(trailBraking).toBeGreaterThan(0)
  })
})

describe('corneringSpeedLimitMps', () => {
  it('holds a hairpin to a hairpin speed', () => {
    const speedKph = kph(
      corneringSpeedLimitMps({
        massKg: massFor(f1),
        physics: f1,
        radiusMeters: 25,
      }),
    )

    expect(speedKph).toBeGreaterThan(60)
    expect(speedKph).toBeLessThan(110)
  })

  it('treats a wide radius as flat for an F1 car', () => {
    expect(
      corneringSpeedLimitMps({
        massKg: massFor(f1),
        physics: f1,
        radiusMeters: 800,
      }),
    ).toBe(Number.POSITIVE_INFINITY)
  })

  it('makes a fast corner flat sooner the more downforce the category has', () => {
    const flatRadiusFor = (physics: typeof f1) => {
      for (let radius = 50; radius <= 1200; radius += 10) {
        if (
          corneringSpeedLimitMps({
            massKg: massFor(physics),
            physics,
            radiusMeters: radius,
          }) === Number.POSITIVE_INFINITY
        ) {
          return radius
        }
      }

      return Number.POSITIVE_INFINITY
    }

    expect(flatRadiusFor(f1)).toBeLessThan(flatRadiusFor(superFormula))
    expect(flatRadiusFor(superFormula)).toBeLessThan(flatRadiusFor(f2))
    expect(flatRadiusFor(f2)).toBeLessThan(flatRadiusFor(f3))
  })

  it('rises with radius', () => {
    const tight = corneringSpeedLimitMps({
      massKg: massFor(f1),
      physics: f1,
      radiusMeters: 40,
    })
    const open = corneringSpeedLimitMps({
      massKg: massFor(f1),
      physics: f1,
      radiusMeters: 120,
    })

    expect(open).toBeGreaterThan(tight)
  })

  it('loses corner speed on a wet surface', () => {
    const dry = corneringSpeedLimitMps({
      massKg: massFor(f1),
      physics: f1,
      radiusMeters: 90,
    })
    const wet = corneringSpeedLimitMps({
      gripMultiplier: 0.65,
      massKg: massFor(f1),
      physics: f1,
      radiusMeters: 90,
    })

    expect(wet).toBeLessThan(dry)
  })
})
