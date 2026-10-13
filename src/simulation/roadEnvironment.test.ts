import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { initialTeams } from '../data/grid2026'
import { peakDownforceN, simulatePhysicalLap } from './physicalLap'
import { airDensityKgM3, roadGradeForceN, trackAtmosphereAt } from './roadEnvironment'
import { integrateVehicleLongitudinalStep } from './vehicleDynamics'
import { GRAVITY_MPS2, aerodynamicDownforceN } from './tyreForces'

const monza = tracks.find(track => track.id === 'monza-approx')!
const suzuka = tracks.find(track => track.id === 'suzuka-approx')!
// Keep the Monza geometry while explicitly removing its registered profile.
// All native courses now have elevation data, so none is a missing-data fixture.
const unsurveyed = { ...monza, id: 'test-unsurveyed-road-environment' }

describe('road altitude and gradient force coupling', () => {
  it('resolves profile altitude before circuit altitude and labels missing data', () => {
    const measured = trackAtmosphereAt({ ...suzuka, altitudeMeters: 2500 }, 0.25)
    expect(measured.source).toBe('source-labelled-profile')
    expect(measured.altitudeMeters).toBeLessThan(200)
    expect(trackAtmosphereAt({ ...monza, altitudeMeters: 2200 }, 0)).toEqual(trackAtmosphereAt(monza, 0))
    expect(trackAtmosphereAt({ ...unsurveyed, altitudeMeters: 2200 }, 0).source).toBe('track-altitude')
    expect(trackAtmosphereAt({ ...unsurveyed, altitudeMeters: undefined }, 0)).toMatchObject({ source: 'sim-default', altitudeMeters: 100 })
  })

  it('matches standard sea-level density and decreases density with altitude and heat', () => {
    expect(airDensityKgM3({ altitudeMeters: 0, temperatureC: 15 })).toBeCloseTo(1.225, 3)
    const sea = airDensityKgM3({ altitudeMeters: 0, temperatureC: 25 })
    const high = airDensityKgM3({ altitudeMeters: 2200, temperatureC: 25 })
    expect(high / sea).toBeGreaterThan(0.75)
    expect(high / sea).toBeLessThan(0.8)
    expect(airDensityKgM3({ altitudeMeters: 0, temperatureC: 40 })).toBeLessThan(sea)
    expect(airDensityKgM3({ altitudeMeters: Number.NaN, temperatureC: Number.NaN })).toBe(airDensityKgM3({}))
  })

  const common = {
    activeAeroMode: 'corner' as const, brakePercent: 0, clutchEngagementFraction: 1,
    currentSpeedKph: 180, deltaSeconds: 0, ersPowerKw: 0, fuelLoadKg: 30,
    gripMultiplier: 1, team: initialTeams[0], throttlePercent: 0, turboSpoolFraction: 0,
  }

  it('retains an 8% grade and applies uphill/downhill gravity once in live integration', () => {
    const at = (grade: number) => integrateVehicleLongitudinalStep({
      ...common, airDensityKgM3: 1.225, dynamics: { roadGradeFraction: grade, straightness: 1 },
    })
    const level = at(0)
    const uphill = at(0.08)
    const downhill = at(-0.08)
    const expectedAcceleration = GRAVITY_MPS2 * Math.sin(Math.atan(0.08))
    expect(level.accelerationMps2 - uphill.accelerationMps2).toBeCloseTo(expectedAcceleration, 8)
    expect(downhill.accelerationMps2 - level.accelerationMps2).toBeCloseTo(expectedAcceleration, 8)
    expect(roadGradeForceN(1000, 0.08)).toBeCloseTo(782.0334, 2)
    expect(roadGradeForceN(1000, Number.NaN)).toBe(0)
  })

  it('uses density in both live aerodynamic drag and downforce', () => {
    const rhoSea = airDensityKgM3({ altitudeMeters: 0 })
    const rhoHigh = airDensityKgM3({ altitudeMeters: 2200 })
    const stepAt = (density: number) => integrateVehicleLongitudinalStep({
      ...common, airDensityKgM3: density, dynamics: { roadGradeFraction: 0, straightness: 1 },
    })
    const sea = stepAt(rhoSea)
    const high = stepAt(rhoHigh)
    expect(high.dragForceN / sea.dragForceN).toBeCloseTo(rhoHigh / rhoSea, 8)
    const downforce = (density: number) => aerodynamicDownforceN({ airDensityKgM3: density, liftAreaM2: 4, speedMps: 50 })
    expect(downforce(rhoHigh) / downforce(rhoSea)).toBeCloseTo(rhoHigh / rhoSea, 8)
    expect(high.accelerationMps2).toBeGreaterThan(sea.accelerationMps2)
  })

  it('uses point elevation and signed grades in the reference model too', () => {
    const result = simulatePhysicalLap(suzuka, { deploymentEnergyBudgetMj: null, activeAeroZones: false })
    expect(result.points.some(point => point.gradeForceN > 0)).toBe(true)
    expect(result.points.some(point => point.gradeForceN < 0)).toBe(true)
    expect(new Set(result.points.map(point => point.airDensityKgM3.toFixed(6))).size).toBeGreaterThan(1)
    expect(result.points.every(point => Number.isFinite(point.referenceSpeedMps) && point.referenceSpeedMps >= 0)).toBe(true)
    expect(peakDownforceN(result, { airDensityKgM3: 1.3 }) / peakDownforceN(result, { airDensityKgM3: 1 }))
      .toBeCloseTo(1.3, 8)
    const explicit = simulatePhysicalLap(suzuka, { airDensityKgM3: 1.1, deploymentEnergyBudgetMj: null })
    expect(explicit.points.every(point => point.airDensityKgM3 === 1.1)).toBe(true)
  })

  it('propagates circuit altitude into an otherwise identical reference lap', () => {
    const lap = (altitudeMeters: number) => simulatePhysicalLap({ ...unsurveyed, altitudeMeters }, {
      deploymentEnergyBudgetMj: null, activeAeroZones: false,
    })
    const sea = lap(0)
    const high = lap(2200)
    expect(high.maximumSpeedKph).toBeGreaterThan(sea.maximumSpeedKph)
    expect(high.points[0].airDensityKgM3).toBeLessThan(sea.points[0].airDensityKgM3)
    expect(high.lapTimeSeconds).not.toBe(sea.lapTimeSeconds)
  })
})
