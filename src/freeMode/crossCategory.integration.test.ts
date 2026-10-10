import { describe, expect, it } from 'vitest'
import { driverPool2026, seriesPackages, seriesPackageById } from '../series/seriesRegistry'
import { expandedDriverSkills } from '../data/driverProfiles'
import { buildFreeModeRaceConfig, freeModeTrackOptions } from './freeModeRegistry'
import { freeCourses, freeDrivers, buildFreeRace } from '../motorsport/freeMode'
import { createMotorsportConfig, motorsportChampionships } from '../motorsport/packages'
import { advanceMotorsportRace, createMotorsportRace } from '../motorsport/race'
import { behaviorDriverFor } from '../motorsport/driverBehavior'
import { advanceRace, createInitialRace } from '../simulation/race'
import { decideDriverBehavior } from '../simulation/driverDecision'
import { airDensityKgM3 } from '../simulation/roadEnvironment'
import { courseStations, tyreForceBudget, speedEnvelope } from '../motorsport/coursePhysics'

const seriesById = new Map(seriesPackages.map(series => [series.id, series]))
const context = { seriesById, driverPool: driverPool2026 }
const tracks = freeModeTrackOptions(seriesById)

describe('six-category course and driver interchange', () => {
  it('retains every authored person and decision skill through the category adapter', () => {
    for (const person of driverPool2026) {
      const imported = freeDrivers.find(driver => driver.id === person.id)!
      expect(imported.overall, person.id).toBe(person.overall)
      const driver = behaviorDriverFor(imported)
      expect(driver.skills, person.id).toEqual(expandedDriverSkills(person.ratings))
      const decisionContext = { driver, seed: 'cross-category-thought', lap: 3,
        trackProgress: 0.2, currentLateralOffsetM: 0, trackHalfWidthM: 6,
        physicalReferenceLineOffsetM: 0 }
      expect(decideDriverBehavior(decisionContext)).toEqual(decideDriverBehavior(decisionContext))
    }
    expect(freeDrivers.find(driver => driver.id === 'yuki_nakayama')?.overall).toBe(110)
  })

  it.each(['f1-custom', 'super-formula'] as const)('%s runs every shared physical course with an imported driver', categoryId => {
    const series = seriesPackageById.get(categoryId)!
    const person = driverPool2026.find(person => person.provenance.some(source => source.sourceSeriesId === 'indycar'))!
    for (const track of tracks) {
      const config = buildFreeModeRaceConfig({ version: 1, categoryId,
        entrants: [{ id: 'cross-driver', driverId: person.id, carNumber: 1, sourceTeamId: series.teams[0].id }],
        equalCars: false, gridMode: 'manual', practiceDurationMinutes: 5, raceLaps: 2,
        seed: 'cross-category-road', sessionKind: 'race', trackId: track.id, weatherMode: 'clear' }, context)
      const initial = createInitialRace(config)
      const racing = { ...initial, startProcedure: 'racing' as const, raceStartedAtSeconds: 0,
        formationLapsPlanned: 0, startProcedureRemainingSeconds: 0,
        cars: initial.cars.map(car => ({ ...car, speedKph: 180, throttlePercent: 100,
          totalDistance: 1.2, progress: 0.2, lap: 1 })) }
      const state = advanceRace(racing, 0.25, config)
      expect(state.cars[0].driverId, track.id).toBe(person.id)
      expect(Number.isFinite(state.cars[0].speedKph), track.id).toBe(true)
      expect(state.cars[0].totalDistance, track.id).toBeGreaterThan(1.2)
      expect(state.cars[0].runtimeSystems.kind).toBe(categoryId === 'f1-custom' ? 'f1' : 'super-formula')
    }
  })

  it.each(motorsportChampionships)('$id runs every shared course without replacing its machine or driver', championship => {
    const person = freeDrivers.find(driver => driver.id === 'yuki_nakayama')!
    for (const course of freeCourses()) {
      const draft = createMotorsportConfig(championship.id)
      draft.course = course; draft.entries = draft.entries.slice(0, 1)
      draft.entries[0].drivers = [person]
      const config = buildFreeRace(draft, 'manual', false, null)
      const initial = createMotorsportRace(config)
      initial.phase = 'racing'
      initial.cars[0] = { ...initial.cars[0], status: 'running', distanceM: course.lengthM * 0.2,
        speedMps: 30, throttlePercent: 100, tyreTemperatureC: 90 }
      const state = advanceMotorsportRace(initial, 10, config)
      expect(Number.isFinite(state.cars[0].speedMps), course.id).toBe(true)
      expect(state.cars[0].distanceM, course.id).toBeGreaterThan(initial.cars[0].distanceM)
      expect(state.cars[0].driverIntent, course.id).toBeDefined()
      expect(config.entries[0].classId).toBe(draft.entries[0].classId)
      expect(config.entries[0].drivers[0].overall).toBe(110)
    }
  })

  it('uses local density in the contact load and the planned speed envelope', () => {
    const config = createMotorsportConfig('indycar')
    const station = { ...courseStations(config.course)[0], radiusM: 100000, bankingRadians: 0 }
    const machine = config.entries[0].machine
    const conditions = { massKg: 900, gripScale: 1 }
    const sea = airDensityKgM3({ altitudeMeters: 0 }), high = airDensityKgM3({ altitudeMeters: 2200 })
    const at = (density: number) => tyreForceBudget(machine, station, 60, { ...conditions, airDensityKgM3: density })
    const gravityLoad = machine.tyreMu.value * conditions.massKg * 9.80665
    expect((at(high).available - gravityLoad) / (at(sea).available - gravityLoad)).toBeCloseTo(high / sea, 8)
    expect(speedEnvelope(config.course, machine, { ...conditions, airDensityKgM3: high }))
      .not.toEqual(speedEnvelope(config.course, machine, { ...conditions, airDensityKgM3: sea }))
  })
})

