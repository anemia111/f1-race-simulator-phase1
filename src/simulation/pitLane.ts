import type { PitPhase, Team, TrackDefinition } from '../types'

export const DEFAULT_PIT_BOX_START_PROGRESS = 0.976
export const DEFAULT_PIT_BOX_SPACING_PROGRESS = 0.0017
export const PIT_LANE_ARRIVAL_FRACTION = 0.24
export const PIT_SERVICE_END_FRACTION = 0.72

export function pitBoxProgress(
  track: TrackDefinition,
  slot: number,
): number {
  const lane = track.pitLane
  const boxCount = lane?.boxCount ?? 12
  const boxStart =
    lane?.boxStartProgress ?? DEFAULT_PIT_BOX_START_PROGRESS
  const spacing =
    lane?.boxSpacingProgress ?? DEFAULT_PIT_BOX_SPACING_PROGRESS

  return (boxStart + (slot % boxCount) * spacing) % 1
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
  return pitBoxProgress(track, pitBoxSlotForTeam(teams, teamId))
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

export function pitLaneMotionAt(
  pitFraction: number,
  entryProgress: number,
  boxProgress: number,
  exitProgress: number,
): { phase: Extract<PitPhase, 'lane' | 'box' | 'exit'>; progress: number } {
  const fraction = Math.min(1, Math.max(0, pitFraction))

  if (fraction < PIT_LANE_ARRIVAL_FRACTION) {
    return {
      phase: 'lane',
      progress: forwardProgressBetween(
        entryProgress,
        boxProgress,
        fraction / PIT_LANE_ARRIVAL_FRACTION,
      ),
    }
  }

  if (fraction < PIT_SERVICE_END_FRACTION) {
    return { phase: 'box', progress: boxProgress }
  }

  return {
    phase: 'exit',
    progress: forwardProgressBetween(
      boxProgress,
      exitProgress,
      (fraction - PIT_SERVICE_END_FRACTION) /
        (1 - PIT_SERVICE_END_FRACTION),
    ),
  }
}
