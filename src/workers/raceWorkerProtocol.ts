import type {
  RaceConfig,
  RacePaceMode,
  RaceSnapshot,
  SpeedMultiplier,
  TireCompound,
} from '../types'

export const RACE_WORKER_TICK_MS = 50
export const RACE_WORKER_PUBLISH_MS = 100

export function raceWorkerPublishMsFor(speed: SpeedMultiplier): number {
  if (speed >= 60) return 500
  if (speed >= 20) return 250
  if (speed >= 5) return 150
  return RACE_WORKER_PUBLISH_MS
}

export type RaceWorkerInboundMessage =
  | {
      type: 'initialize'
      config: RaceConfig
      isPaused: boolean
      snapshot: RaceSnapshot
      speed: SpeedMultiplier
    }
  | { type: 'control'; isPaused: boolean; speed: SpeedMultiplier }
  | { type: 'pit-request'; driverId: string; compound: TireCompound }
  | { type: 'pace-mode'; driverId: string; mode: RacePaceMode }

export type RaceWorkerOutboundMessage =
  | { type: 'ready'; snapshot: RaceSnapshot }
  | { type: 'snapshot'; snapshot: RaceSnapshot }
  | { type: 'error'; message: string }
