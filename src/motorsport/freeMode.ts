import { driverPool2026, seriesPackages } from '../series/seriesRegistry'
import { createSeededRandom } from '../simulation/random'
import { createMotorsportConfig, motorsportChampionships, motorsportCourses, motorsportDriver, motorsportEntries, motorsportEvents, motorsportMachine, simulatedValue } from './packages'
import { validateMotorsportConfig } from './race'
import type { ChampionshipId, MotorsportEntry, MotorsportRaceConfig, MotorsportRaceState } from './types'

export const MOTORSPORT_FREE_SAVE_KEY = 'race-sim-motorsport-free-v1'
export const MOTORSPORT_FREE_PRESET_KEY = 'race-sim-motorsport-free-presets-v1'
export const freeDrivers = driverPool2026.map(driver => motorsportDriver(driver.name))
export function freeCourses() {
  const courses = motorsportChampionships.flatMap(item => motorsportCourses(item.id))
  for (const series of seriesPackages) for (const track of series.tracks) {
    if (courses.some(course => course.id === track.id) || track.centerline.length < 3) continue
    courses.push({ id: track.id, name: track.name, lengthM: track.lengthKm * 1000,
      points: track.centerline.map(point => [point[0], point[2]]), kind: track.kind === 'street' ? 'street' : 'road',
      sourceUrl: track.layoutSource?.url ?? '', geometryBasis: track.layoutSource?.label ?? 'Existing track layout',
      pitEntry: simulatedValue(0.94), pitExit: simulatedValue(0.06), pitLengthM: simulatedValue(450),
      pitSpeedKph: simulatedValue(60), bankingDegrees: simulatedValue(0), widthM: simulatedValue(12) })
  }
  return [...new Map(courses.map(course => [course.id, course])).values()]
}
export function freeVehicles(championship: ChampionshipId): MotorsportEntry[] {
  // Include event-only entries and Le Mans LMP2, keeping all published crews.
  const entries = [...motorsportEntries(championship), ...motorsportEvents(championship).flatMap(event => createMotorsportConfig(championship, event.id).entries)]
  return [...new Map(entries.map(entry => [entry.id, entry])).values()]
}
export function resizeFreeField(entries: MotorsportEntry[], count: number): MotorsportEntry[] {
  if (!Number.isInteger(count) || count < 1 || count > 100 || !entries.length) throw new Error('Cars must be between 1 and 100')
  const result = structuredClone(entries.slice(0, count))
  while (result.length < count) {
    const index = result.length, entry = structuredClone(entries[index % entries.length])
    entry.id = `free:${index}:${entry.id}`
    while (result.some(car => car.id === entry.id)) entry.id += ":copy"
    const numbers = new Set(result.map(car => car.number))
    let number = 1; while (numbers.has(String(number))) number++
    entry.number = String(number)
    result.push(entry)
  }
  return result
}
export type FreeGrid = 'manual' | 'random' | 'qualifying-result'
export type MotorsportQualifyingResult = { championship: ChampionshipId; courseId: string; signature: string; entryIds: string[] }
export function freeFieldSignature(config: MotorsportRaceConfig) {
  return JSON.stringify(config.entries.map(entry => [entry.id, entry.number, entry.classId, entry.machine, entry.drivers]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}
export function qualifyingResult(config: MotorsportRaceConfig, state: MotorsportRaceState): MotorsportQualifyingResult | null {
  if (config.sessionKind !== 'qualifying' || state.phase !== 'finished' || !state.cars.some(car => car.bestLapSeconds !== null)) return null
  const ordered = [...state.cars].sort((a, b) => (a.bestLapSeconds ?? Infinity) - (b.bestLapSeconds ?? Infinity) || a.entryId.localeCompare(b.entryId))
  return { championship: config.championship, courseId: config.course.id, signature: freeFieldSignature(config), entryIds: ordered.map(car => car.entryId) }
}
export function matchingQualifying(config: MotorsportRaceConfig, result: MotorsportQualifyingResult | null) {
  return !!result && result.championship === config.championship && result.courseId === config.course.id && result.signature === freeFieldSignature(config)
}
export function buildFreeRace(draft: MotorsportRaceConfig, grid: FreeGrid, equalCars: boolean, qualifying: MotorsportQualifyingResult | null): MotorsportRaceConfig {
  const config = structuredClone(draft)
  config.applicationMode = 'free'
  config.eventId = `free:${config.championship}:${config.course.id}`
  config.freeSettings = {grid,equalCars}
  validateMotorsportConfig(config)
  if (config.format.kind === 'laps' ? config.format.laps > 1000 : config.format.seconds > 86400) throw new Error('Free Mode supports up to 1000 laps or 24 hours')
  if (config.entries.some(entry=>!/^\d{1,6}$/.test(entry.number))) throw new Error('Car numbers must contain 1–6 digits')
  if (new Set(config.entries.map(entry => `${entry.classId}:${entry.number}`)).size !== config.entries.length) throw new Error('Car numbers must be unique within each class')
  if (!config.seed.trim() || config.seed.length > 128) throw new Error('Seed must contain 1–128 characters')
  // Course-specific Indy aero and engine configurations remain physically valid.
  for (const entry of config.entries) if (entry.classId === 'indycar') entry.machine = motorsportMachine(entry.machine.name, entry.classId, /Honda/i.test(entry.machine.name) ? 'Honda' : 'Chevrolet', config.course.kind)
  if (equalCars) {
    const machines = new Map<string, MotorsportEntry['machine']>()
    for (const entry of config.entries) {
      if (!machines.has(entry.classId)) machines.set(entry.classId, entry.machine)
      entry.machine = structuredClone(machines.get(entry.classId)!)
    }
  }
  if (grid === 'random') {
    const random = createSeededRandom(config.seed)
    for (let index = config.entries.length - 1; index > 0; index--) {
      const next = Math.floor(random() * (index + 1))
      ;[config.entries[index], config.entries[next]] = [config.entries[next], config.entries[index]]
    }
  }
  if (grid === 'qualifying-result') {
    if (!matchingQualifying(config, qualifying)) throw new Error('Complete qualifying with the same track, cars and crews first')
    const positions = new Map(qualifying!.entryIds.map((id, index) => [id, index]))
    config.entries.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!)
  }
  // User-chosen crews and short sessions must not inherit championship minima.
  config.minimumDriverSeconds = null; config.maximumDriverSeconds = null; config.maximumStintSeconds = null
  validateMotorsportConfig(config)
  return config
}
