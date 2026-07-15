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

export function buildRaceClassification(
  snapshot: Pick<RaceSnapshot, 'cars' | 'sessionStatus'>,
): RaceClassificationEntry[] {
  return snapshot.cars.map((car) => {
    const servedPenalty = car.servedPenaltySeconds
    const pendingPenalty = car.penaltySeconds
    const penaltyLabel =
      pendingPenalty > 0
        ? `+${pendingPenalty.toFixed(0)}s pending`
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
          : formatGap(car.gapToLeader)

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
