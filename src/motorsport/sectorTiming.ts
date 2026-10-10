import { expansionCourseTiming } from '../data/expansionTiming'
import type { MotorsportCar, MotorsportCourse, MotorsportSectorTiming } from './types'

const cache = new WeakMap<MotorsportCourse, number[]>()
const boundaryCache = new WeakMap<MotorsportCourse, number[]>()
export function timingMarks(course: MotorsportCourse): number[] {
  let marks = cache.get(course)
  if (!marks) { marks = expansionCourseTiming(course.id, course.points).sectorMarks; cache.set(course, marks) }
  return marks
}
export function initialSectorTiming(course: MotorsportCourse, fromRaceStart = false): MotorsportSectorTiming {
  const marks = timingMarks(course)
  return { lap: 1, startedAt: fromRaceStart && Math.min(marks[0] ?? 1, 1 - (marks[0] ?? 0)) < 1e-6 ? 0 : null,
    crossings: Array(marks.length * 8).fill(null), invalid: false, lastLap: null,
    bestSectors: Array(marks.length).fill(null), bestMiniSectors: Array(marks.length * 8).fill(null) }
}
export function timingDurations(crossings: (number | null)[], sectorCount: number) {
  const minis = crossings.map((end, i) => end === null || (i > 0 && crossings[i - 1] === null) ? null : end - (i ? crossings[i - 1]! : 0))
  const sectors = Array.from({ length: sectorCount }, (_, i) => {
    const end = crossings[i * 8 + 7], start = i ? crossings[i * 8 - 1] : 0
    return end == null || start == null ? null : end - start
  })
  return { sectors, minis }
}
/** Actual interpolated crossings, independent of rendering and telemetry sampling. */
export function advanceSectorTiming(car: MotorsportCar, beforeDistance: number, startSeconds: number, dt: number, course: MotorsportCourse, green: boolean) {
  const marks = timingMarks(course), count = marks.length
  if (!count) return
  const old = car.timing ?? initialSectorTiming(course)
  let timing = { ...old, crossings: [...old.crossings], invalid: old.invalid || car.status !== 'running' || !green }
  const origin = Math.min(marks[0], 1 - marks[0]) < 1e-6 ? 0 : marks[0], length = course.lengthM, travel = car.distanceM - beforeDistance
  if (travel <= 0) { car.timing = timing; return }
  let boundaries = boundaryCache.get(course)
  if (!boundaries) {
    const relative = marks.map((mark, i) => i === 0 ? 0 : ((mark - origin) % 1 + 1) % 1)
    boundaries = Array.from({ length: count * 8 }, (_, i) => {
      const sector = Math.floor(i / 8), end = sector === count - 1 ? 1 : relative[sector + 1]
      return relative[sector] + (end - relative[sector]) * (i % 8 + 1) / 8
    })
    boundaryCache.set(course, boundaries)
  }
  const first = Math.floor(beforeDistance / length - origin), last = Math.floor(car.distanceM / length - origin)
  for (let round = first; round <= last; round++) {
    let low = 0, high = boundaries.length
    const from = (beforeDistance + 1e-8) / length - round - origin
    while (low < high) {
      const middle = (low + high) >>> 1
      if (boundaries[middle] <= from) low = middle + 1
      else high = middle
    }
    for (let i = low; i < boundaries.length; i++) {
      const boundary = (round + origin + boundaries[i]) * length
      if (boundary > car.distanceM + 1e-8) break
      const crossing = startSeconds + dt * (boundary - beforeDistance) / travel
      if (round >= 0 && timing.startedAt !== null) timing.crossings[i] = crossing - timing.startedAt
      if (i !== count * 8 - 1) continue
      if (round >= 0 && timing.startedAt !== null && timing.crossings.every(value => value !== null)) {
        const values = timingDurations(timing.crossings, count)
        const sectors = values.sectors as number[], miniSectors = values.minis as number[]
        timing.lastLap = { lap: timing.lap, sectors, miniSectors, valid: !timing.invalid }
        if (!timing.invalid) {
          timing.bestSectors = sectors.map((value, index) => Math.min(value, timing.bestSectors[index] ?? Infinity))
          timing.bestMiniSectors = miniSectors.map((value, index) => Math.min(value, timing.bestMiniSectors[index] ?? Infinity))
        }
      }
      // Crossing the initial grid's control line starts lap 1; it is not a lap.
      if (round < 0 && timing.startedAt !== null) continue
      timing = { ...timing, lap: Math.max(1, round + 2), startedAt: crossing,
        crossings: Array(count * 8).fill(null), invalid: car.status !== 'running' || !green }
    }
  }
  car.timing = timing
}

export function validSectorTiming(value: MotorsportSectorTiming, course: MotorsportCourse): boolean {
  const count = timingMarks(course).length
  const times = (items: unknown, size: number, nullable: boolean): boolean => Array.isArray(items) && items.length === size && items.every(v => nullable && v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0)
  return !!value && Number.isSafeInteger(value.lap) && value.lap >= 1 && typeof value.invalid === 'boolean' &&
    (value.startedAt === null || Number.isFinite(value.startedAt) && value.startedAt >= 0) &&
    times(value.crossings, count * 8, true) && times(value.bestSectors, count, true) && times(value.bestMiniSectors, count * 8, true) &&
    (value.lastLap === null || !!value.lastLap && Number.isSafeInteger(value.lastLap.lap) && value.lastLap.lap >= 1 && typeof value.lastLap.valid === 'boolean' && times(value.lastLap.sectors, count, false) && times(value.lastLap.miniSectors, count * 8, false))
}
