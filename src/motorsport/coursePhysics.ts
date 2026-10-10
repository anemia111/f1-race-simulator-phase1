import { airDensityKgM3 } from '../simulation/roadEnvironment'
import { elevationProfileFor, elevationAt } from '../data/courseElevation'
import { remainingEllipseForceN } from '../simulation/tyreForces'
import type { MotorsportCourse, MotorsportMachine } from './types'

export const MOTORSPORT_STEP_SECONDS = 0.1
const SAMPLE_COUNT = 512
export type CourseStation = { x: number; y: number; nx: number; ny: number; radiusM: number; bankingRadians: number; grade: number; elevationM: number; airDensityKgM3: number }
const stationCache = new WeakMap<MotorsportCourse, CourseStation[]>()
const envelopeCache = new WeakMap<MotorsportCourse, WeakMap<MotorsportMachine, Map<string, number[]>>>()
export const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function courseStations(course: MotorsportCourse): CourseStation[] {
  const cached = stationCache.get(course)
  if (cached) return cached
  const points = course.points
  const elevation=elevationProfileFor(course.id,points,course.lengthM)
  const lengths = points.map((point, i) => Math.hypot(point[0] - points[(i + 1) % points.length][0], point[1] - points[(i + 1) % points.length][1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!(total > 0) || !Number.isFinite(total) || !(course.lengthM > 0)) throw new Error('Course requires finite connected geometry and positive official distance')
  const sampled: [number, number][] = []
  let edge = 0, edgeStart = 0
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    const distance = total * index / SAMPLE_COUNT
    while (edge < lengths.length - 1 && edgeStart + lengths[edge] < distance) edgeStart += lengths[edge++]
    const ratio = (distance - edgeStart) / Math.max(lengths[edge], 1e-9)
    const next = points[(edge + 1) % points.length]
    sampled.push([points[edge][0] + (next[0] - points[edge][0]) * ratio, points[edge][1] + (next[1] - points[edge][1]) * ratio])
  }
  const scaleToMetres = course.lengthM / total
  // An oval is a continuous broad-radius turn. Short-range three-point fits
  // amplify sparse OSM chord joins into fictitious 30m hairpins. Fit over a
  // wider physical arc for ovals; road/street hairpins retain the local fit.
  const curvatureSpan = course.kind === 'short-oval' ? 24 : course.kind === 'speedway' ? 12 : 3
  const stations = sampled.map(([x, y], index) => {
    const before = sampled[modulo(index - curvatureSpan, SAMPLE_COUNT)], after = sampled[(index + curvatureSpan) % SAMPLE_COUNT]
    const a = Math.hypot(x - before[0], y - before[1]) * scaleToMetres
    const b = Math.hypot(x - after[0], y - after[1]) * scaleToMetres
    const c = Math.hypot(after[0] - before[0], after[1] - before[1]) * scaleToMetres
    const twiceArea = Math.abs((x - before[0]) * (after[1] - before[1]) - (y - before[1]) * (after[0] - before[0])) * scaleToMetres ** 2
    const radiusM = twiceArea < 0.01 ? 100_000 : clamp(a * b * c / (2 * twiceArea), 8, 100_000)
    const dx = after[0] - before[0], dy = after[1] - before[1], norm = Math.max(0.001, Math.hypot(dx, dy))
    const road=elevation?elevationAt(elevation,index/SAMPLE_COUNT):{grade:0,elevationM:0}
    return { ...road, airDensityKgM3: airDensityKgM3({ altitudeMeters: elevation ? road.elevationM : 100, temperatureC: 25 }), x, y, nx: -dy / norm / scaleToMetres, ny: dx / norm / scaleToMetres, radiusM,
      bankingRadians: radiusM < 1000 ? course.bankingDegrees.value * Math.PI / 180 : 0 }
  })
  stationCache.set(course, stations)
  return stations
}

/** Point-mass tyre/aero force balance, with banking and a backward braking pass. */
export type DrivingConditions = { massKg: number; gripScale: number; liftScale?: number; dragScale?: number; airDensityKgM3?: number }

/** Shared grip budget: braking/traction and cornering cannot each use 100%. */
export function tyreForceBudget(machine: MotorsportMachine, station: CourseStation, speed: number, conditions: DrivingConditions) {
  const { massKg: mass, gripScale, liftScale = 1 } = conditions
  const gravity = 9.80665
  const load = mass * gravity * Math.cos(station.bankingRadians) + 0.5 * (conditions.airDensityKgM3 ?? station.airDensityKgM3) * machine.liftAreaM2.value * liftScale * speed ** 2
  const available = machine.tyreMu.value * gripScale * load
  const lateral = Math.max(0, mass * speed ** 2 / station.radiusM - mass * gravity * Math.sin(station.bankingRadians))
  return { available, lateral, longitudinal: remainingEllipseForceN({availableForceN: available, usedForceN: lateral}) }
}

export function stationAt(course: MotorsportCourse, distanceM: number) {
  return courseStations(course)[Math.floor(modulo(distanceM, course.lengthM) / course.lengthM * SAMPLE_COUNT)]
}

export function speedEnvelope(course: MotorsportCourse, machine: MotorsportMachine, conditions?: DrivingConditions): number[] {
  let byMachine = envelopeCache.get(course)
  if (!byMachine) { byMachine = new WeakMap(); envelopeCache.set(course, byMachine) }
  let variants = byMachine.get(machine)
  if (!variants) { variants = new Map(); byMachine.set(machine, variants) }
  // Conservative finite bins bound cache size and avoid a 512-station solve
  // for every 100ms tick. Forces themselves use the unquantized current state.
  const mass = conditions ? Math.ceil(conditions.massKg / 10) * 10 : machine.massKg.value + machine.driverMassKg.value + machine.fuelCapacityKg.value * 0.5
  const grip = conditions ? Math.max(0.2, Math.floor(conditions.gripScale * 20 + 1e-8) / 20) : 1
  const liftScale = Math.floor((conditions?.liftScale ?? 1) * 10 + 1e-8) / 10
  const dragScale = Math.ceil((conditions?.dragScale ?? 1) * 20 - 1e-8) / 20
  const key = `${mass}:${grip}:${liftScale}:${dragScale}:${conditions?.airDensityKgM3 ?? "profile"}`
  const cached = variants.get(key)
  if (cached) return cached
  const mu = machine.tyreMu.value * grip
  const maximumPower = machine.powerKw.value + (machine.classId === 'indycar' ? machine.hybridPowerKw.value + (course.kind === 'road' || course.kind === 'street' ? 44.74 : 0) : 0)
  const speeds = courseStations(course).map(({ radiusM, bankingRadians: angle, airDensityKgM3 }) => {
    const density = conditions?.airDensityKgM3 ?? airDensityKgM3
    const terminal = Math.cbrt(maximumPower * 1000 * 0.94 / (0.5 * density * machine.dragAreaM2.value * dragScale))
    const bankGrip = (mu * Math.cos(angle) + Math.sin(angle)) / Math.max(0.1, Math.cos(angle) - mu * Math.sin(angle))
    const denominator = 1 - bankGrip * radiusM * 0.5 * density * machine.liftAreaM2.value * liftScale / mass
    const corner = denominator <= 0 ? terminal : Math.sqrt(bankGrip * 9.80665 * radiusM / denominator)
    return Math.max(8, Math.min(terminal, corner))
  })
  const ds = course.lengthM / SAMPLE_COUNT
  // Two closed-loop passes carry the braking constraint across the start line.
  for (let index = SAMPLE_COUNT * 2 - 1; index >= 0; index--) {
    const current = index % SAMPLE_COUNT, next = (current + 1) % SAMPLE_COUNT
    // Reserve 5% lateral headroom for a drivable line. The same combined
    // force law is used here and during integration, including bank support.
    speeds[current] *= index >= SAMPLE_COUNT ? 0.975 : 1
    const forces = tyreForceBudget(machine, courseStations(course)[current], speeds[current], { massKg: mass, gripScale: grip, liftScale, airDensityKgM3: conditions?.airDensityKgM3 })
    const deceleration = Math.max(0.5, Math.min(35, forces.longitudinal / mass + 9.80665 * courseStations(course)[current].grade))
    speeds[current] = Math.min(speeds[current], Math.sqrt(speeds[next] ** 2 + 2 * deceleration * ds))
  }
  if (variants.size >= 64) variants.delete(variants.keys().next().value!)
  variants.set(key, speeds)
  return speeds
}
export function coursePosition(course: MotorsportCourse, distanceM: number, lateralM = 0): [number, number] {
  const stations = courseStations(course)
  const exact = modulo(distanceM, course.lengthM) / course.lengthM * SAMPLE_COUNT
  const index = Math.floor(exact), fraction = exact - index
  const a = stations[index], b = stations[(index + 1) % SAMPLE_COUNT]
  return [a.x + (b.x - a.x) * fraction + a.nx * lateralM, a.y + (b.y - a.y) * fraction + a.ny * lateralM]
}
export function targetSpeedMps(course: MotorsportCourse, machine: MotorsportMachine, distanceM: number, conditions?: DrivingConditions): number {
  const envelope = speedEnvelope(course, machine, conditions)
  const exact = modulo(distanceM, course.lengthM) / course.lengthM * SAMPLE_COUNT
  const index = Math.floor(exact), fraction = exact - index
  const lower = envelope[index] + (envelope[(index + 1) % SAMPLE_COUNT] - envelope[index]) * fraction
  if (!conditions) return lower
  // Cached grip bins must not turn the first trace of wear into an abrupt
  // five-percent planning loss. Interpolate adjacent solved envelopes while
  // the instantaneous force ellipse continues to use exact tyre grip.
  const grip = Math.max(0.2, conditions.gripScale), lo = Math.floor(grip * 20 + 1e-8) / 20
  const weight = (grip - lo) * 20
  if (weight <= 1e-8) return lower
  const upper = speedEnvelope(course, machine, { ...conditions, gripScale: lo + 0.05 })
  const high = upper[index] + (upper[(index + 1) % SAMPLE_COUNT] - upper[index]) * fraction
  return lower + (high - lower) * weight
}
