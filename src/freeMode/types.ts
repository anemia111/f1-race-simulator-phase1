import type { RaceConfig, Team, TrackDefinition } from '../types'
import type {
  DriverPoolRecord,
  SeriesId,
  SeriesPackage,
  SeriesRules,
} from '../series/types'

export type ApplicationMode = 'championship' | 'free'

export type FreeModeSessionKind = 'practice' | 'qualifying' | 'race'

export type FreeModeGridMode =
  | 'manual'
  | 'random'
  | 'qualifying-result'

export type FreeModeWeatherMode =
  | 'random'
  | 'clear'
  | 'light-rain'
  | 'heavy-rain'

export type FreeModeEntrant = {
  id: string
  driverId: string
  sourceTeamId: string
  carNumber: number
}

export type FreeModeConfiguration = {
  version: 1
  categoryId: SeriesId
  trackId: string
  sessionKind: FreeModeSessionKind
  gridMode: FreeModeGridMode
  weatherMode: FreeModeWeatherMode
  raceLaps: number
  practiceDurationMinutes: number
  seed: string
  equalCars: boolean
  entrants: FreeModeEntrant[]
}

export type FreeModeTrackSource = 'F1' | 'SF'

export type FreeModeTrackOption = {
  id: string
  name: string
  location: string
  sources: FreeModeTrackSource[]
  physicalTrack: TrackDefinition
}

export type FreeModeQualifyingResult = {
  version: 1
  categoryId: SeriesId
  trackId: string
  seed: string
  completedAt: string
  orderedDriverIds: string[]
}

export type FreeModePreset = {
  id: string
  name: string
  updatedAt: string
  configuration: FreeModeConfiguration
}

export type FreeModeStoredState = {
  version: 1
  configuration: FreeModeConfiguration
  qualifyingResult: FreeModeQualifyingResult | null
}

export type FreeModeValidationIssue = {
  code: string
  message: string
  field?: keyof FreeModeConfiguration | 'carNumber' | 'driverId' | 'sourceTeamId'
  entrantId?: string
}

export type FreeModeBuildContext = {
  driverPool: DriverPoolRecord[]
  driverOverridesById?: Map<string, RaceConfig['drivers'][number]>
  qualifyingResult?: FreeModeQualifyingResult | null
  seriesById: Map<SeriesId, SeriesPackage>
}

export type FreeModeRuntime = {
  configuration: FreeModeConfiguration
  qualifyingFormatLabel: string
  raceConfig: RaceConfig
  rules: SeriesRules
  sourceTeams: Team[]
  trackSources: FreeModeTrackSource[]
}
