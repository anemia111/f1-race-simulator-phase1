import type {
  CalibrationStatus,
  EventPaceCalibration,
  PaceCalibrationSource,
} from '../types'

export type {
  CalibrationStatus,
  EventPaceCalibration,
  PaceCalibrationSource,
}

export type PaceCalibrationManifest = {
  schemaVersion: number
  calibrationVersion: string
  generatedAt: string
  season: number
  eventCount: number
  series: Array<{
    id: EventPaceCalibration['series']
    eventCount: number
    latestObservedEventDate: string | null
  }>
  generator: string
  sourcePolicy: string
}
