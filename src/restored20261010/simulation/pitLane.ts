import type { CarSnapshot, PitPhase, Team, TrackDefinition } from '../types'

export const DEFAULT_PIT_BOX_START_PROGRESS = 0.976
export const DEFAULT_PIT_BOX_SPACING_PROGRESS = 0.0017
export const PIT_LANE_ARRIVAL_FRACTION = 0.24
export const PIT_SERVICE_END_FRACTION = 0.72

export function pitBoxProgress(
  track: TrackDefinition,
  slot: number,
  requiredBoxCount = 1,
): number {
  const lane = track.pitLane
  const boxCount = Math.max(lane?.boxCount ?? 12, requiredBoxCount)
  const boxStart =
    lane?.boxStartProgress ?? DEFAULT_PIT_BOX_START_PROGRESS
  const spacing =
    lane?.boxSpacingProgress ?? DEFAULT_PIT_BOX_SPACING_PROGRESS

  return (boxStart + Math.min(Math.max(0, slot), boxCount - 1) * spacing) % 1
}

export function pitBoxSlotForTeam(
  teams: Pick<Team, 'id'>[],
  teamId: string,
): number {
  const index = teams.findIndex((team) => team.id === teamId)

  return index < 0 ? 0 : index
}

export function pitBoxProgressForTeam(
  track: TrackDefinition,
  teams: Pick<Team, 'id'>[],
  teamId: string,
): number {
  return pitBoxProgress(
    track,
    pitBoxSlotForTeam(teams, teamId),
    teams.length,
  )
}

export function wrappedProgressSpan(start: number, end: number): number {
  return (end + 1 - start) % 1
}

export function progressWithinWrapped(
  progress: number,
  start: number,
  end: number,
): boolean {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
}

export function forwardProgressBetween(
  start: number,
  end: number,
  amount: number,
): number {
  const fraction = Math.min(1, Math.max(0, amount))

  return (start + wrappedProgressSpan(start, end) * fraction) % 1
}

/** Exit decoration is retained after the car is already back on the course. */
export function pitEntryDrivingRequested(car: Pick<CarSnapshot, 'status' | 'pitPhase'>) {
  return car.pitPhase !== 'none' && !(car.status === 'running' && car.pitPhase === 'exit')
}

export function pitLaneMotionAt(
  pitFraction: number,
  entryProgress: number,
  boxProgress: number,
  exitProgress: number,
  timing?: { durationSeconds: number; serviceSeconds: number },
): { phase: Extract<PitPhase, 'lane' | 'box' | 'exit'>; progress: number } {
  const fraction = Math.min(1, Math.max(0, pitFraction))

  const serviceFraction = timing ? Math.min(1, Math.max(0, timing.serviceSeconds / Math.max(0.001, timing.durationSeconds))) : null
  const entryShare = wrappedProgressSpan(entryProgress, boxProgress) / Math.max(0.000001, wrappedProgressSpan(entryProgress, exitProgress))
  const arrival = serviceFraction === null ? PIT_LANE_ARRIVAL_FRACTION : (1 - serviceFraction) * Math.min(1, entryShare)
  const serviceEnd = serviceFraction === null ? PIT_SERVICE_END_FRACTION : arrival + serviceFraction

  if (fraction < arrival) {
    return {
      phase: 'lane',
      progress: forwardProgressBetween(
        entryProgress,
        boxProgress,
        fraction / Math.max(0.000001, arrival),
      ),
    }
  }

  if (fraction < serviceEnd) {
    return { phase: 'box', progress: boxProgress }
  }

  return {
    phase: 'exit',
    progress: forwardProgressBetween(
      boxProgress,
      exitProgress,
      (fraction - serviceEnd) /
        Math.max(0.000001, 1 - serviceEnd),
    ),
  }
}
