import type { WeekendStage } from '../types'

export const FREE_PRACTICE_DURATION_SECONDS = 60 * 60
export const QUALIFYING_SEGMENT_DURATIONS_SECONDS = {
  Q1: 18 * 60,
  Q2: 15 * 60,
  Q3: 13 * 60,
} as const
export const SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS = {
  SQ1: 12 * 60,
  SQ2: 10 * 60,
  SQ3: 8 * 60,
} as const
export const QUALIFYING_BREAK_SECONDS = 7 * 60
export const QUALIFYING_TOTAL_DURATION_SECONDS =
  QUALIFYING_SEGMENT_DURATIONS_SECONDS.Q1 +
  QUALIFYING_BREAK_SECONDS +
  QUALIFYING_SEGMENT_DURATIONS_SECONDS.Q2 +
  QUALIFYING_BREAK_SECONDS +
  QUALIFYING_SEGMENT_DURATIONS_SECONDS.Q3
export const SPRINT_QUALIFYING_TOTAL_DURATION_SECONDS =
  SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS.SQ1 +
  QUALIFYING_BREAK_SECONDS +
  SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS.SQ2 +
  QUALIFYING_BREAK_SECONDS +
  SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS.SQ3
export const SPRINT_DURATION_SECONDS = 60 * 60

export type QualifyingSegmentName =
  | keyof typeof QUALIFYING_SEGMENT_DURATIONS_SECONDS
  | keyof typeof SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS
export type PracticeSessionName = Extract<WeekendStage, 'fp1' | 'fp2' | 'fp3'>

export function isPracticeStage(stage: WeekendStage): stage is PracticeSessionName {
  return stage === 'fp1' || stage === 'fp2' || stage === 'fp3'
}

export function isTimedLapSession(stage: WeekendStage) {
  return isPracticeStage(stage) || stage === 'qualifying' || stage === 'sprintQualifying'
}

export function isRaceDistanceSession(stage: WeekendStage) {
  return stage === 'race' || stage === 'sprint'
}

export function weekendStageLabelFor(stage: WeekendStage) {
  switch (stage) {
    case 'fp1':
      return 'FP1'
    case 'fp2':
      return 'FP2'
    case 'fp3':
      return 'FP3'
    case 'qualifying':
      return 'Qualifying'
    case 'sprintQualifying':
      return 'Sprint Qualifying'
    case 'sprint':
      return 'Sprint'
    case 'race':
      return 'Race'
  }
}

export function sessionDurationSecondsFor(stage: WeekendStage) {
  if (isPracticeStage(stage)) {
    return FREE_PRACTICE_DURATION_SECONDS
  }

  if (stage === 'qualifying') {
    return QUALIFYING_TOTAL_DURATION_SECONDS
  }

  if (stage === 'sprintQualifying') {
    return SPRINT_QUALIFYING_TOTAL_DURATION_SECONDS
  }

  if (stage === 'sprint') {
    return SPRINT_DURATION_SECONDS
  }

  return null
}

export function compactSessionDurationLabel(stage: WeekendStage) {
  if (isPracticeStage(stage)) {
    return '60m setup'
  }

  if (stage === 'qualifying') {
    return 'Q1 18m / Q2 15m / Q3 13m'
  }

  if (stage === 'sprintQualifying') {
    return 'SQ1 12m / SQ2 10m / SQ3 8m'
  }

  if (stage === 'sprint') {
    return 'Sprint distance'
  }

  return 'Race distance'
}
