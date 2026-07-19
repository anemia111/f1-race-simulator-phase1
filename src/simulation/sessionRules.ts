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
export type StandardQualifyingStage = Extract<
  WeekendStage,
  'qualifying' | 'qualifying2'
>
export type QualifyingStage = Extract<
  WeekendStage,
  'qualifying' | 'qualifying2' | 'sprintQualifying'
>
export type FeatureRaceStage = Extract<WeekendStage, 'race' | 'race2'>
export type RaceDistanceStage = Extract<WeekendStage, 'race' | 'race2' | 'sprint'>

export function isPracticeStage(stage: WeekendStage): stage is PracticeSessionName {
  return stage === 'fp1' || stage === 'fp2' || stage === 'fp3'
}

export function isStandardQualifyingStage(
  stage: WeekendStage,
): stage is StandardQualifyingStage {
  return stage === 'qualifying' || stage === 'qualifying2'
}

export function isQualifyingStage(stage: WeekendStage): stage is QualifyingStage {
  return isStandardQualifyingStage(stage) || stage === 'sprintQualifying'
}

export function isFeatureRaceStage(stage: WeekendStage): stage is FeatureRaceStage {
  return stage === 'race' || stage === 'race2'
}

export function isTimedLapSession(stage: WeekendStage) {
  return isPracticeStage(stage) || isQualifyingStage(stage)
}

export function isRaceDistanceSession(stage: WeekendStage): stage is RaceDistanceStage {
  return isFeatureRaceStage(stage) || stage === 'sprint'
}

/** Maps event-specific duplicate sessions onto the shared physics rule set. */
export function simulationStageFor(stage: WeekendStage): WeekendStage {
  if (stage === 'qualifying2') return 'qualifying'
  if (stage === 'race2') return 'race'
  return stage
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
    case 'qualifying2':
      return 'Qualifying 2'
    case 'sprintQualifying':
      return 'Sprint Qualifying'
    case 'sprint':
      return 'Sprint'
    case 'race':
      return 'Race'
    case 'race2':
      return 'Race 2'
  }
}

export function sessionDurationSecondsFor(stage: WeekendStage) {
  if (isPracticeStage(stage)) {
    return FREE_PRACTICE_DURATION_SECONDS
  }

  if (isStandardQualifyingStage(stage)) {
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

  if (isStandardQualifyingStage(stage)) {
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
