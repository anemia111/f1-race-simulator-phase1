import type { CarSnapshot, RaceSnapshot } from '../types'

export type RaceClassificationEntry = {
  bestLapLap: number | null
  bestLapTimeSeconds: number | null
  code: string
  compoundsUsed: CarSnapshot['compoundsUsed']
  driverId: string
  gapLabel: string
  gridPosition: number
  penaltyLabel: string | null
  pitStops: number
  position: number
  positionChange: number
  statusLabel: 'FIN' | 'DNF' | 'PIT' | 'RUN' | 'DSQ' | 'DNS'
  teamColor: string
  tire: CarSnapshot['tire']
  trackLimitWarnings: number
}

const formatGap = (seconds: number) => `+${seconds.toFixed(3)}`

/** Classified lap count: completed laps net of any lap penalties. */
const classifiedLaps = (car: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>) =>
  car.lap - car.penaltyLaps

/**
 * "+N lap(s)" when a finisher ends short of the reference car's classified
 * laps; null when both finished the same distance and a time gap applies. A
 * lapped car takes the flag seconds behind the winner, so its raw crossing-time
 * difference must never be shown as the result gap.
 */
export function lapDeficitLabel(
  reference: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>,
  car: Pick<CarSnapshot, 'lap' | 'penaltyLaps'>,
): string | null {
  const deficit = classifiedLaps(reference) - classifiedLaps(car)

  return deficit > 0 ? `+${deficit} lap${deficit === 1 ? '' : 's'}` : null
}

export function buildRaceClassification(
  snapshot: Pick<RaceSnapshot, 'cars' | 'sessionStatus'>,
): RaceClassificationEntry[] {
  const winner = snapshot.cars.find((car) => car.position === 1) ?? null

  return snapshot.cars.map((car) => {
    const servedPenalty = car.servedPenaltySeconds
    const pendingPenalty = car.penaltySeconds
    // A penalty still unserved when the car takes the flag is added to its
    // race time, so the final board reports it as applied, not pending.
    const penaltyLabel =
      pendingPenalty > 0
        ? car.status === 'finished'
          ? `+${pendingPenalty.toFixed(0)}s applied`
          : `+${pendingPenalty.toFixed(0)}s pending`
        : servedPenalty > 0
          ? `${servedPenalty.toFixed(0)}s served`
          : null
    const statusLabel =
      car.status === 'disqualified'
        ? 'DSQ'
        : car.status === 'dns'
          ? 'DNS'
          : car.status === 'retired'
        ? 'DNF'
        : car.status === 'finished'
          ? 'FIN'
          : car.status === 'pit'
            ? 'PIT'
            : 'RUN'
    const lappedGap =
      car.status === 'finished' && winner !== null && winner.status === 'finished'
        ? lapDeficitLabel(winner, car)
        : null
    const gapLabel =
      car.status === 'disqualified'
        ? 'DSQ'
        : car.status === 'dns'
          ? 'DNS'
          : car.status === 'retired'
        ? car.retiredReason ? `DNF ${car.retiredReason}` : 'DNF'
        : car.position === 1
          ? snapshot.sessionStatus === 'finished'
            ? 'Winner'
            : 'Leader'
          : lappedGap ?? formatGap(car.gapToLeader)

    return {
      bestLapLap: car.bestLapLap,
      bestLapTimeSeconds: car.bestLapTimeSeconds,
      code: car.code,
      compoundsUsed: car.compoundsUsed,
      driverId: car.driverId,
      gapLabel,
      gridPosition: car.gridPosition,
      penaltyLabel,
      pitStops: car.pitStops,
      position: car.position,
      positionChange: car.gridPosition - car.position,
      statusLabel,
      teamColor: car.teamColor,
      tire: car.tire,
      trackLimitWarnings: car.trackLimitWarnings,
    }
  })
}

export function fastestLapFromClassification(entries: RaceClassificationEntry[]) {
  return entries
    .filter(
      (entry) =>
        entry.statusLabel !== 'DSQ' &&
        entry.statusLabel !== 'DNS' &&
        entry.bestLapTimeSeconds !== null,
    )
    .sort(
      (left, right) =>
        (left.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) -
        (right.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY),
    )[0] ?? null
}
