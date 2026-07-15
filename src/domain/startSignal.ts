import type { RaceSnapshot } from '../types'

export const START_LIGHT_COUNT = 5
export const START_LIGHT_SEQUENCE_SECONDS = 5
export const LIGHTS_OUT_DISPLAY_SECONDS = 1.8

export type StartSignalState = {
  activeLightCount: number
  label: 'GRID SET' | 'START SEQUENCE' | 'LIGHTS OUT'
  phase: 'grid' | 'lights' | 'lights-out'
}

type StartSignalSnapshot = Pick<
  RaceSnapshot,
  | 'elapsedSeconds'
  | 'formationBehindSafetyCar'
  | 'raceStartedAtSeconds'
  | 'startProcedure'
  | 'startProcedureRemainingSeconds'
>

export function startSignalStateFor(
  snapshot: StartSignalSnapshot,
): StartSignalState | null {
  if (snapshot.formationBehindSafetyCar) {
    return null
  }

  if (snapshot.startProcedure === 'grid') {
    return {
      activeLightCount: 0,
      label: 'GRID SET',
      phase: 'grid',
    }
  }

  if (snapshot.startProcedure === 'lights') {
    const elapsedSequenceSeconds = Math.max(
      0,
      START_LIGHT_SEQUENCE_SECONDS -
        snapshot.startProcedureRemainingSeconds,
    )

    return {
      activeLightCount: Math.min(
        START_LIGHT_COUNT,
        Math.floor(elapsedSequenceSeconds) + 1,
      ),
      label: 'START SEQUENCE',
      phase: 'lights',
    }
  }

  const secondsSinceStart =
    snapshot.raceStartedAtSeconds === null
      ? Number.POSITIVE_INFINITY
      : snapshot.elapsedSeconds - snapshot.raceStartedAtSeconds

  if (
    snapshot.startProcedure === 'racing' &&
    secondsSinceStart >= 0 &&
    secondsSinceStart < LIGHTS_OUT_DISPLAY_SECONDS
  ) {
    return {
      activeLightCount: 0,
      label: 'LIGHTS OUT',
      phase: 'lights-out',
    }
  }

  return null
}
