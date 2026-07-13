/// <reference lib="webworker" />

import { advanceRace, createInitialRace } from '../simulation/race'
import type {
  RaceConfig,
  RacePaceMode,
  RaceSnapshot,
  SpeedMultiplier,
  TireCompound,
} from '../types'
import {
  RACE_WORKER_PUBLISH_MS,
  RACE_WORKER_TICK_MS,
  type RaceWorkerInboundMessage,
  type RaceWorkerOutboundMessage,
} from './raceWorkerProtocol'

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let config: RaceConfig | null = null
let snapshot: RaceSnapshot | null = null
let isPaused = true
let speed: SpeedMultiplier = 1
let lastPublishedAt = 0
const manualPitRequests = new Map<string, TireCompound>()
const manualPaceModes = new Map<string, RacePaceMode>()

function publish(message: RaceWorkerOutboundMessage) {
  workerScope.postMessage(message)
}

workerScope.addEventListener('message', (event: MessageEvent<RaceWorkerInboundMessage>) => {
  const message = event.data

  if (message.type === 'initialize') {
    config = message.config
    snapshot = createInitialRace(config)
    isPaused = message.isPaused
    speed = message.speed
    lastPublishedAt = performance.now()
    manualPitRequests.clear()
    manualPaceModes.clear()
    publish({ type: 'ready', snapshot })
    return
  }

  if (message.type === 'control') {
    isPaused = message.isPaused
    speed = message.speed
    return
  }

  if (message.type === 'pit-request') {
    manualPitRequests.set(message.driverId, message.compound)
    return
  }

  manualPaceModes.set(message.driverId, message.mode)
})

setInterval(() => {
  if (!config || !snapshot || isPaused || snapshot.sessionStatus === 'finished') {
    return
  }

  try {
    snapshot = advanceRace(
      snapshot,
      (RACE_WORKER_TICK_MS / 1000) * speed,
      config,
      manualPitRequests,
      manualPaceModes,
    )

    const now = performance.now()

    if (now - lastPublishedAt >= RACE_WORKER_PUBLISH_MS || snapshot.sessionStatus === 'finished') {
      lastPublishedAt = now
      publish({ type: 'snapshot', snapshot })
    }
  } catch (error) {
    publish({
      type: 'error',
      message: error instanceof Error ? error.message : 'Race worker failed',
    })
    isPaused = true
  }
}, RACE_WORKER_TICK_MS)

