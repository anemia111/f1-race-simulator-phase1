import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace, advanceRace } from './race'
import type { RaceConfig } from '../types'
import { createDefaultFreeModeConfiguration, buildFreeModeRaceConfig } from '../freeMode/freeModeRegistry'
import { parseFreeModeConfiguration } from '../freeMode/freeModeValidation'
import { driverPool2026, seriesPackageById } from '../series/seriesRegistry'
import { serializeRaceCheckpoint, parseRaceCheckpoint } from '../hooks/raceSession'

const context = { driverPool: driverPool2026, seriesById: seriesPackageById }
const config: RaceConfig = {
  seed: 'dry-rolling-start', raceStartMode: 'rolling', freeMode: true,
  track: { ...tracks[0], rainProbability: 0 }, teams: initialTeams,
  drivers: initialDrivers.slice(0, 3), weekendStage: 'race',
  sessionRaceLapsOverride: 10,
}

describe('explicit dry rolling start', () => {
  it('keeps a moving field, skips grid/lights and excludes formation from racing laps', () => {
    const initial = createInitialRace(config)
    expect(initial.formationBehindSafetyCar).toBe(false)
    expect(initial.startLightSequenceSeconds).toBe(0)
    let before = initial
    const formationEnd = initial.formationLapDurationSeconds * initial.formationLapsPlanned
    while (before.elapsedSeconds < formationEnd - 0.051) {
      before = advanceRace(before, Math.min(1, formationEnd - 0.05 - before.elapsedSeconds), config)
    }
    expect(before.startProcedure).toBe('formation')
    expect(before.cars.every((car) => car.speedKph >= 75)).toBe(true)
    const green = advanceRace(before, 0.1, config)
    expect(green.startProcedure).toBe('racing')
    expect(green.events.some((event) => /five red lights|starting-grid slots/.test(event.message))).toBe(false)
    expect(green.eventMessage).toContain('ROLLING START')
    expect(green.cars.every((car) => car.speedKph > 0)).toBe(true)
    expect(Math.floor(Math.max(...green.cars.map((car) => car.totalDistance)))).toBe(1)
    expect(green.raceLaps).toBe(10)
    const running = advanceRace(green, 1, config)
    expect(running.cars.every((car) => car.totalDistance > green.cars.find((old) => old.driverId === car.driverId)!.totalDistance)).toBe(true)
    const saved = serializeRaceCheckpoint('rolling', running, 1000)!
    expect(parseRaceCheckpoint(saved, 'rolling', config, 1000)?.cars).toEqual(running.cars)
  })

  it('preserves old Free Mode saves and retains the selected start through parsing', () => {
    const old = createDefaultFreeModeConfiguration(seriesPackageById, 'start-persistence')
    expect(buildFreeModeRaceConfig(old, context).raceStartMode).toBe('standing')
    const rolling = { ...old, raceStartMode: 'rolling' as const }
    expect(parseFreeModeConfiguration(rolling, context)?.raceStartMode).toBe('rolling')
    expect(buildFreeModeRaceConfig(rolling, context).raceStartMode).toBe('rolling')
    expect(parseFreeModeConfiguration({ ...old, raceStartMode: 'invalid' }, context)).toBeNull()
    const standing = createInitialRace({ ...config, raceStartMode: undefined })
    expect(standing.startLightSequenceSeconds).toBeGreaterThan(0)
  })
})
