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
  RaceSnapshot,
  TireCompound,
  TrackDefinition,
} from '../../types'

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
