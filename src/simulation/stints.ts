import type { CarStatus, LapRecord, TireCompound } from '../types'

export type TireStint = {
  compound: TireCompound
  /** First racing lap covered by this stint. */
  fromLap: number
  /** Last racing lap covered (completed, or in progress for the live stint). */
  toLap: number
  /** Lap count including the in-progress lap for the live stint. */
  laps: number
  /** True for the stint the car is currently out on. */
  inProgress: boolean
}

/**
 * Rebuild the tyre stint history from completed lap records plus the live car
 * state. A stint ends at a compound change or at a pit-stop lap, so a
 * same-compound stop still splits into two stints. The new tyre goes on during
 * the lap after the record marked `pitStop`, matching how the records are
 * written at the timing line. Timed-session laps (which carry a `segment`) are
 * ignored so a weekend rolling from qualifying into the race starts clean.
 */
export function tireStintsFor(car: {
  lapHistory: LapRecord[]
  tire: TireCompound
  status: CarStatus
}): TireStint[] {
  const stints: TireStint[] = []
  let open: TireStint | null = null
  let lastRecordPitted = false

  for (const record of car.lapHistory) {
    if (record.segment !== undefined) continue
    if (open === null || lastRecordPitted || record.tire !== open.compound) {
      open = {
        compound: record.tire,
        fromLap: record.lap,
        toLap: record.lap,
        laps: 1,
        inProgress: false,
      }
      stints.push(open)
    } else {
      open.toLap = record.lap
      open.laps += 1
    }
    lastRecordPitted = record.pitStop
  }

  // The lap currently being driven is not in the history yet; extend the open
  // stint (or open a fresh one straight after a stop) for cars still out.
  if (car.status === 'running' || car.status === 'pit') {
    const lapInProgress = (open?.toLap ?? 0) + 1
    if (open === null || lastRecordPitted || car.tire !== open.compound) {
      stints.push({
        compound: car.tire,
        fromLap: lapInProgress,
        toLap: lapInProgress,
        laps: 1,
        inProgress: true,
      })
    } else {
      open.toLap = lapInProgress
      open.laps += 1
      open.inProgress = true
    }
  }

  return stints
}
