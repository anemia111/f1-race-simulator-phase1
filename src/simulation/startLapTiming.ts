import type { RaceSnapshot } from '../types'

/** Repair the former SC-release partial-lap bug without resetting race progress. */
export function repairSafetyCarStartTiming(snapshot: RaceSnapshot, trackLengthKm: number): RaceSnapshot {
  if (!snapshot.formationBehindSafetyCar || snapshot.raceStartedAtSeconds == null || snapshot.startProcedure !== 'racing') return snapshot
  const releaseLine = snapshot.formationLapsPlanned + 1
  let changed = false
  const cars = snapshot.cars.map(car => {
    // Only the impossible opening records are removed. A generous 600km/h
    // travel bound also protects valid histories from older timing conventions.
    const minimumLapSeconds = trackLengthKm * 3600 / 600
    const lapHistory = car.lapHistory.filter(lap => !(lap.lap < releaseLine && lap.lapTimeSeconds < minimumLapSeconds))
    const processedLap = Math.max(car.processedLap, releaseLine)
    if (lapHistory.length === car.lapHistory.length && processedLap === car.processedLap) return car
    changed = true
    if (lapHistory.length === car.lapHistory.length) return { ...car, processedLap }
    const best = lapHistory.filter(lap => lap.isValid).reduce<(typeof lapHistory)[number] | null>((a, lap) => !a || lap.lapTimeSeconds < a.lapTimeSeconds ? lap : a, null)
    return { ...car, processedLap, lapHistory, bestLapTimeSeconds: best?.lapTimeSeconds ?? null, bestLapLap: best?.lap ?? null, lastLapTimeSeconds: lapHistory.at(-1)?.lapTimeSeconds ?? null }
  })
  return changed ? { ...snapshot, cars } : snapshot
}
