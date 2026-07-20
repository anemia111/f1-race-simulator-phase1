import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type {
  Driver,
  DriverSkillProfile,
  MachinePerformanceProfile,
} from '../types'
import {
  DRIVER_SEGMENT_RESPONSE,
  internalPowerScaleAtSpeed,
  MACHINE_INTERNAL_PERFORMANCE_SCALE,
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
  it('compresses machine effects without changing the source rating', () => {
    expect(MACHINE_PACE_REFERENCE).toBe(0.86)
    expect(MACHINE_PACE_SPREAD_FACTOR).toBe(0.7)
    expect(MACHINE_SEGMENT_RESPONSE).toBe(0.135)
    expect(DRIVER_SEGMENT_RESPONSE).toBe(0.075)
    expect(MACHINE_INTERNAL_PERFORMANCE_SCALE).toBe(1.06)
    expect(internalPowerScaleAtSpeed(300)).toBeCloseTo(1.06, 10)
    expect(internalPowerScaleAtSpeed(370)).toBeCloseTo(1.03, 10)
    expect(internalPowerScaleAtSpeed(420)).toBe(1)
    expect(machinePaceRating(0.86)).toBeCloseTo(0.86, 10)
    expect(machinePaceRating(0.96)).toBeCloseTo(0.93, 10)
    expect(machinePaceRating(0.62)).toBeCloseTo(0.692, 10)
    expect(machinePaceRating(0.96) - machinePaceRating(0.62)).toBeLessThan(
      0.96 - 0.62,
    )
  })

  it('narrows every machine axis while preserving team order', () => {
    const keys = Object.keys(
      initialTeams[0].machine,
    ) as Array<keyof MachinePerformanceProfile>

    for (const key of keys) {
      const raw = initialTeams.map((team) => team.machine[key])
      const effective = raw.map(machinePaceRating)
      const rawOrder = raw
        .map((value, index) => ({ index, value }))
        .sort((left, right) => right.value - left.value)
        .map(({ index }) => index)
      const effectiveOrder = effective
        .map((value, index) => ({ index, value }))
        .sort((left, right) => right.value - left.value)
        .map(({ index }) => index)
      const rawSpread = Math.max(...raw) - Math.min(...raw)
      const effectiveSpread = Math.max(...effective) - Math.min(...effective)

      expect(effectiveOrder).toEqual(rawOrder)
      expect(effectiveSpread).toBeCloseTo(
        rawSpread * MACHINE_PACE_SPREAD_FACTOR,
        10,
      )
    }
  })

  it('keeps the configured 0-100 driver scale monotonic against one machine', () => {
    const team = initialTeams.find(
      (candidate) => candidate.id === initialDrivers[0].teamId,
    )!
    const lowerDriver = driverAt(0.7)
    const higherDriver = driverAt(1)
    const outOfRangeDriver = driverAt(1.5)
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
        driver: outOfRangeDriver,
        team,
        track: tracks[0],
      }),
    ).toBe(higherGain)
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

  it('keeps coarse simulation ticks close to fine-grained integration', () => {
    const team = initialTeams[0]
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
      brakePercent: 0,
      dynamics: { gradient: 0, straightness: 1 },
      ersPowerKw: 350,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      towDragReduction: 0,
    }
    const coarse = integrateVehicleSpeedKph({
      ...common,
      currentSpeedKph: 0,
      deltaSeconds: 8,
    })
    let fine = 0

    for (let step = 0; step < 80; step += 1) {
      fine = integrateVehicleSpeedKph({
        ...common,
        currentSpeedKph: fine,
        deltaSeconds: 0.1,
      })
    }

    expect(coarse).toBeGreaterThan(0)
    expect(Math.abs(coarse - fine)).toBeLessThan(3)
  })

  it('turns ERS deployment into acceleration and recovery into resistance', () => {
    const team = initialTeams[0]
    const common = {
      activeAeroMode: 'straight' as const,
      airDensityKgM3: airDensityKgM3({
        altitudeMeters: 0,
        temperatureC: 25,
      }),
      brakePercent: 0,
      currentSpeedKph: 260,
      deltaSeconds: 0.5,
      dynamics: { gradient: 0, straightness: 1 },
      fuelLoadKg: 70,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      towDragReduction: 0,
    }
    const combustionOnly = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 0,
    })
    const deploying = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 350,
    })
    const harvesting = integrateVehicleSpeedKph({
      ...common,
      ersPowerKw: 0,
      regenerativeResistancePowerKw: 180,
    })

    expect(deploying).toBeGreaterThan(combustionOnly)
    expect(harvesting).toBeLessThan(combustionOnly)
  })

  it('compares all 10 CSV machines with one identical reference driver', () => {
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

    expect(monzaResults).toHaveLength(10)
    expect(
      new Set(monzaResults.map((result) => result.gain.toFixed(5))).size,
    ).toBeGreaterThan(7)
    expect(monzaResults.map((result) => result.gain.toFixed(5))).not.toEqual(
      monacoResults.map((result) => result.gain.toFixed(5)),
    )
    const monzaFieldSpreadSeconds =
      monzaResults[0].gain - monzaResults.at(-1)!.gain

    expect(monzaFieldSpreadSeconds).toBeGreaterThan(1.5)
    expect(monzaFieldSpreadSeconds).toBeLessThan(3)
  })

  it('places Alpine ahead of Audi on representative aggregate pace', () => {
    const referenceDriver = driverAt(1)
    const audi = initialTeams.find((team) => team.id === 'audi')!
    const alpine = initialTeams.find((team) => team.id === 'alpine')!
    const representativeTracks = [
      tracks.find((track) => track.id === 'albert-park-approx')!,
      tracks.find((track) => track.id === 'monza-approx')!,
      tracks.find((track) => track.id === 'monaco-approx')!,
    ]
    const aggregateGain = (team: typeof audi) =>
      representativeTracks.reduce(
        (total, track) =>
          total +
          performanceLapGainSeconds({
            driver: referenceDriver,
            team,
            track,
          }),
        0,
      )

    expect(aggregateGain(alpine)).toBeGreaterThan(aggregateGain(audi))
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

    expect(terminalSpeedSpreadKph).toBeGreaterThan(7)
    expect(terminalSpeedSpreadKph).toBeLessThan(15)
  })

  it('compares every CSV driver in one identical machine without sorting by OVR', () => {
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

    expect(dry).toHaveLength(initialDrivers.length)
    // Most of the field should separate rather than tie on identical machinery.
    expect(
      new Set(dry.map((result) => result.gain.toFixed(5))).size,
    ).toBeGreaterThanOrEqual(Math.ceil(initialDrivers.length * 0.7))
    expect(dry.map((result) => result.code)).not.toEqual(
      wet.map((result) => result.code),
    )
    const dryFieldSpreadSeconds = dry[0].gain - dry.at(-1)!.gain

    expect(dryFieldSpreadSeconds).toBeGreaterThan(0.25)
    expect(dryFieldSpreadSeconds).toBeLessThan(0.8)
  })
})
