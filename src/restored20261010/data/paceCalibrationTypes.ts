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
    /**
     * Events carrying an observed straight-line speed reference. It trails
     * `eventCount` because a circuit only gets one once its sessions have
     * produced car telemetry or FIA speed-trap records.
     */
    speedReferenceCount?: number
  }>
  generator: string
  sourcePolicy: string
}
