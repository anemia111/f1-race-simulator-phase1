import type {
  RaceConfig,
  RacePaceMode,
  RaceSnapshot,
  SpeedMultiplier,
  TireCompound,
} from '../types'

export const RACE_WORKER_TICK_MS = 50
export const RACE_WORKER_PUBLISH_MS = 100

export type RaceWorkerInboundMessage =
  | {
      type: 'initialize'
      config: RaceConfig
      isPaused: boolean
      speed: SpeedMultiplier
    }
  | { type: 'control'; isPaused: boolean; speed: SpeedMultiplier }
  | { type: 'pit-request'; driverId: string; compound: TireCompound }
  | { type: 'pace-mode'; driverId: string; mode: RacePaceMode }

export type RaceWorkerOutboundMessage =
  | { type: 'ready'; snapshot: RaceSnapshot }
  | { type: 'snapshot'; snapshot: RaceSnapshot }
  | { type: 'error'; message: string }

