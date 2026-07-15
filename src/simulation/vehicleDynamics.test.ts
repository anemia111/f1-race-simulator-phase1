import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { Driver, DriverSkillProfile } from '../types'
import {
  airDensityKgM3,
  integrateVehicleSpeedKph,
  performanceLapGainSeconds,
} from './vehicleDynamics'

function driverAt(value: number): Driver {
  const base = initialDrivers[0]
  const skills = Object.fromEntries(
    Object.keys(base.skills).map((key) => [key, value]),
  ) as DriverSkillProfile

  return { ...base, skills }
}

describe('multi-axis vehicle dynamics', () => {
  it('lets driver skill approach, but never exceed, the machine limit', () => {
    const team = initialTeams.find(
      (candidate) => candidate.id === initialDrivers[0].teamId,
    )!
    const lowerDriver = driverAt(0.7)
    const higherDriver = driverAt(1)

    expect(
      performanceLapGainSeconds({
        driver: higherDriver,
        team,
        track: tracks[0],
      }),
    ).toBeGreaterThan(
      performanceLapGainSeconds({
        driver: lowerDriver,
        team,
        track: tracks[0],
      }),
    )
  })

  it('uses drag-limited acceleration instead of adding a fixed top speed', () => {
    const team = initialTeams[0]
    let speedKph = 300

    for (let step = 0; step < 500; step += 1) {
      speedKph = integrateVehicleSpeedKph({
        activeAeroMode: 'straight',
        airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
        brakePercent: 0,
        currentSpeedKph: speedKph,
        deltaSeconds: 0.1,
        dynamics: { gradient: 0, straightness: 1 },
        ersPowerKw: speedKph < 355 ? 350 : 0,
        fuelLoadKg: 8,
        gripMultiplier: 1,
        team,
        throttlePercent: 100,
        towDragReduction: 0.15,
      })
    }

    expect(speedKph).toBeGreaterThan(400)
    expect(speedKph).toBeLessThan(438)
  })
})
