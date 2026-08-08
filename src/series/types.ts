import type {
  CategoryRaceFormat,
  Driver,
  DryTireCompound,
  Team,
  TireSetAllocation,
  TrackDefinition,
  WeekendStage,
} from '../types'
import type { DriverAssignment, DriverPoolRecord } from './driverPool'
import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from './seriesIds'

export type SeriesId = ExecutableSeriesId

export type SeriesSource = {
  label: string
  sourceDate: string
  url: string
}

export type SeriesQualifyingSegmentRule = {
  advanceCount: number | null
  durationSeconds: number
  name: 'Q1' | 'Q2' | 'Q3'
}

export type SeriesRules = {
  championshipTeamScoring: 'all-cars' | 'best-two'
  featureRaceMandatoryPitStop: boolean
  featureRaceTwoDryCompounds: boolean
  freePracticeDurationSeconds: number
  overtakeActivation: 'first-detection' | 'after-one-lap' | 'immediate'
  overtakeSystem: 'active-aero' | 'ots'
  points: {
    fastestLap: {
      maximumClassifiedPosition: number
      minimumCompletionRatio: number
      points: number
    } | null
    feature: number[]
    qualifying: number[]
    reduced: {
      feature: [number[], number[], number[]]
      sprint: [number[], number[], number[]]
    } | null
    sprint: number[]
  }
  race: CategoryRaceFormat
  qualifying: {
    breakSeconds: number
    format: 'knockout' | 'single-session' | 'grouped'
    grouping?: 'balanced' | 'car-number-parity'
    segments: SeriesQualifyingSegmentRule[]
  }
  raceDistanceRatio: number
  raceLabel: string
  sprintGridReverseCount: number
  supportsOpenF1: boolean
  tireSupplier: 'Pirelli' | 'Yokohama'
  tires: {
    dryLabels: Record<DryTireCompound, string>
    qualifyingDryCompound: DryTireCompound
    sprintAllocation: TireSetAllocation | null
    standardAllocation: TireSetAllocation
  }
  vehicleBaseRating: number | null
  weekendStages: WeekendStage[]
}

export type SeriesCalendarEvent = {
  cancelled?: boolean
  featurePoints?: number[]
  featureRaceMandatoryPitStop?: boolean
  gridSourceTrackId?: string
  id: string
  qualifying?: SeriesRules['qualifying']
  raceCount: number
  raceLaps?: number
  raceOverallTimeLimitSeconds?: number
  raceTimeLimitSeconds?: number
  round: number
  sprint?: boolean
  trackId: string
  weekendStages?: WeekendStage[]
}

export type SeriesPackage = {
  calendar: SeriesCalendarEvent[]
  carCount: number
  drivers: Driver[]
  id: SeriesId
  label: string
  rules: SeriesRules
  shortLabel: string
  sources: SeriesSource[]
  teamCount: number
  teams: Team[]
  tracks: TrackDefinition[]
  vehicleEraId: RuntimeVehicleEraId
}

export type { DriverPoolRecord }
export type DriverAssignmentRecord = DriverAssignment
