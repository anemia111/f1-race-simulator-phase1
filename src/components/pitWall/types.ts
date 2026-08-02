import type {
  PitWallCapabilities,
  PitWallSession,
} from '../../domain/pitWall'
import type { PitStrategyOutlook } from '../../hooks/usePitStrategyOutlook'
import type { TireCondition } from '../../simulation/tires'
import type { BroadcastRaceControlEntry } from '../BroadcastDashboard'
import type { EnvironmentReadout } from '../../domain/environmentReadout'
import type {
  CarSnapshot,
  Driver,
  MiniSectorState,
  RaceSnapshot,
  SectorTimingStatus,
  TireCompound,
  TrackDefinition,
} from '../../types'

/**
 * The selected car's splits exactly as the timing tower resolved them. The pit
 * wall reads this rather than re-deriving it from the snapshot, so an engineer
 * and the timing screen can never disagree about which lap is on display or
 * which segment is purple.
 */
export type PitWallSectorTiming = {
  /** True when the splits belong to the lap in progress. */
  isCurrentLap: boolean
  /** Null until the car has crossed the timing line at least once. */
  lapNumber: number | null
  /** Three sectors of eight measured segments each. */
  miniSectors: MiniSectorState[][]
  sectors: [number | null, number | null, number | null]
  sectorStatuses: [SectorTimingStatus, SectorTimingStatus, SectorTimingStatus]
}

/**
 * Everything a pit-wall tab is allowed to read. Tabs are presentation only:
 * they never fetch, and they never compute simulation state of their own.
 */
export type PitWallTabProps = {
  capabilities: PitWallCapabilities
  car: CarSnapshot
  driver: Driver
  environment: EnvironmentReadout
  openF1Mode: 'LIVE' | 'HIST' | 'SIM'
  raceControlLog: BroadcastRaceControlEntry[]
  /** Decides which race-only read-outs this session is allowed to show. */
  session: PitWallSession
  snapshot: RaceSnapshot
  /** Computed once by the panel so every tab reports the same tyre state. */
  strategy: PitStrategyOutlook
  telemetryIsOpenF1: boolean
  /** Resolved by the timing tower; the pit wall only presents it. */
  timing: PitWallSectorTiming
  timingIsOpenF1: boolean
  tireCondition: TireCondition
  tireLabels: Record<TireCompound, string>
  track: TrackDefinition
}

export type PitWallCommandProps = {
  onRequestPitStop: (driverId: string, compound: TireCompound) => void
  onSetDriverPaceMode: (
    driverId: string,
    mode: CarSnapshot['racePaceMode'],
  ) => void
}
