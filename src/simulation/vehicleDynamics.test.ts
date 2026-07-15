import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { Driver, DriverSkillProfile } from '../types'
import {
  MACHINE_PACE_REFERENCE,
  MACHINE_PACE_SPREAD_FACTOR,
  MACHINE_SEGMENT_RESPONSE,
  airDensityKgM3,
  integrateVehicleSpeedKph,
  machinePaceRating,
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
  it('widens machine effects without changing the source rating', () => {
    expect(MACHINE_PACE_REFERENCE).toBe(0.86)
    expect(MACHINE_PACE_SPREAD_FACTOR).toBe(1.35)
    expect(MACHINE_SEGMENT_RESPONSE).toBe(0.135)
    expect(machinePaceRating(0.86)).toBeCloseTo(0.86, 10)
    expect(machinePaceRating(0.96)).toBeCloseTo(0.995, 10)
    expect(machinePaceRating(0.62)).toBeCloseTo(0.536, 10)
  })

  it('keeps the full configured driver scale monotonic against one machine', () => {
    const team = initialTeams.find(
      (candidate) => candidate.id === initialDrivers[0].teamId,
    )!
    const lowerDriver = driverAt(0.7)
    const higherDriver = driverAt(1)
    const exceptionalDriver = driverAt(1.5)
    const higherGain = performanceLapGainSeconds({
      driver: higherDriver,
      team,
      track: tracks[0],
    })

    expect(higherGain).toBeGreaterThan(
      performanceLapGainSeconds({
        driver: lowerDriver,
        team,
        track: tracks[0],
      }),
    )
    expect(
      performanceLapGainSeconds({
        driver: exceptionalDriver,
        team,
        track: tracks[0],
      }),
    ).toBeGreaterThan(higherGain)
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

  it('compares all 15 CSV machines with one identical reference driver', () => {
    const referenceDriver = driverAt(1)
    const monza = tracks.find((track) => track.id === 'monza-approx')!
    const monaco = tracks.find((track) => track.id === 'monaco-approx')!
    const resultFor = (track: (typeof tracks)[number]) =>
      initialTeams
        .map((team) => ({
          gain: performanceLapGainSeconds({
            driver: referenceDriver,
            team,
            track,
          }),
          teamId: team.id,
        }))
        .sort((left, right) => right.gain - left.gain)

    const monzaResults = resultFor(monza)
    const monacoResults = resultFor(monaco)

    expect(monzaResults).toHaveLength(15)
    expect(
      new Set(monzaResults.map((result) => result.gain.toFixed(5))).size,
    ).toBeGreaterThan(10)
    expect(monzaResults.map((result) => result.teamId)).not.toEqual(
      monacoResults.map((result) => result.teamId),
    )
    const monzaFieldSpreadSeconds =
      monzaResults[0].gain - monzaResults.at(-1)!.gain

    expect(monzaFieldSpreadSeconds).toBeGreaterThan(4)
    expect(monzaFieldSpreadSeconds).toBeLessThan(7)
  })

  it('produces team-relative terminal speeds from CSV power and drag axes', () => {
    const terminalSpeeds = initialTeams.map((team) => {
      let speedKph = 300

      for (let tick = 0; tick < 500; tick += 1) {
        speedKph = integrateVehicleSpeedKph({
          activeAeroMode: 'straight',
          airDensityKgM3: airDensityKgM3({
            altitudeMeters: 650,
            temperatureC: 28,
          }),
          brakePercent: 0,
          currentSpeedKph: speedKph,
          deltaSeconds: 0.1,
          dynamics: { gradient: 0, straightness: 1 },
          ersPowerKw: speedKph < 355 ? 350 : 0,
          fuelLoadKg: 8,
          gripMultiplier: 1,
          team,
          throttlePercent: 100,
          towDragReduction: 0.08,
        })
      }

      return speedKph
    })

    expect(new Set(terminalSpeeds.map((speed) => speed.toFixed(2))).size).toBe(
      initialTeams.length,
    )
    const terminalSpeedSpreadKph =
      Math.max(...terminalSpeeds) - Math.min(...terminalSpeeds)

    expect(terminalSpeedSpreadKph).toBeGreaterThan(11)
    expect(terminalSpeedSpreadKph).toBeLessThan(35)
  })

  it('compares all 30 CSV drivers in one identical machine without sorting by OVR', () => {
    const referenceTeam = initialTeams.find((team) => team.id === 'mclaren')!
    const track = tracks[0]
    const dry = initialDrivers
      .map((driver) => ({
        code: driver.code,
        gain: performanceLapGainSeconds({
          driver,
          session: 'race',
          team: referenceTeam,
          track,
          weather: 'clear',
        }),
      }))
      .sort((left, right) => right.gain - left.gain)
    const wet = initialDrivers
      .map((driver) => ({
        code: driver.code,
        gain: performanceLapGainSeconds({
          driver,
          session: 'race',
          team: referenceTeam,
          track,
          weather: 'heavy-rain',
        }),
      }))
      .sort((left, right) => right.gain - left.gain)

    expect(dry).toHaveLength(30)
    expect(new Set(dry.map((result) => result.gain.toFixed(5))).size).toBeGreaterThan(
      20,
    )
    expect(dry.map((result) => result.code)).not.toEqual(
      wet.map((result) => result.code),
    )
  })
})
