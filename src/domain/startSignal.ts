import type { RaceSnapshot } from '../types'

export const START_LIGHT_COUNT = 5
export const START_LIGHT_INTERVAL_SECONDS = 1
export const START_LIGHT_BUILD_SECONDS =
  (START_LIGHT_COUNT - 1) * START_LIGHT_INTERVAL_SECONDS
export const START_LIGHT_MINIMUM_HOLD_SECONDS = 0.2
export const START_LIGHT_MAXIMUM_HOLD_SECONDS = 3
/** Compatibility fallback for a checkpoint saved before starter hold existed. */
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
  | 'startLightSequenceSeconds'
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
    const sequenceSeconds =
      snapshot.startLightSequenceSeconds ?? START_LIGHT_SEQUENCE_SECONDS
    const elapsedSequenceSeconds = Math.max(
      0,
      sequenceSeconds - snapshot.startProcedureRemainingSeconds,
    )

    return {
      activeLightCount: Math.min(
        START_LIGHT_COUNT,
        Math.floor(
          elapsedSequenceSeconds / START_LIGHT_INTERVAL_SECONDS,
        ) + 1,
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
