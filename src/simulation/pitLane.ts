import type { Team, TrackDefinition } from '../types'

export const DEFAULT_PIT_BOX_START_PROGRESS = 0.976
export const DEFAULT_PIT_BOX_SPACING_PROGRESS = 0.0017

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
