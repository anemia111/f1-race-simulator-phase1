/// <reference lib="webworker" />

import {
  advanceRace,
  createInitialRace,
  skipFormationLap,
} from '../simulation/race'
import type {
  RaceConfig,
  RacePaceMode,
  RaceSnapshot,
  SpeedMultiplier,
  TireCompound,
} from '../types'
import {
  RACE_WORKER_TICK_MS,
  raceWorkerPublishMsFor,
  type RaceWorkerInboundMessage,
  type RaceWorkerOutboundMessage,
} from './raceWorkerProtocol'
import { PhysicsWorkQueue } from './physicsWorkQueue'

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let config: RaceConfig | null = null
let snapshot: RaceSnapshot | null = null
let isPaused = true
let speed: SpeedMultiplier = 1
let lastPublishedAt = 0
let lastRequestedAt = performance.now()
const workQueue = new PhysicsWorkQueue()
const manualPitRequests = new Map<string, TireCompound>()
const manualPaceModes = new Map<string, RacePaceMode>()

function publish(message: RaceWorkerOutboundMessage) {
  workerScope.postMessage(message)
}

workerScope.addEventListener('message', (event: MessageEvent<RaceWorkerInboundMessage>) => {
  const message = event.data

  if (message.type === 'initialize') {
    config = message.config
    snapshot = message.snapshot ?? createInitialRace(config)
    isPaused = message.isPaused
    speed = message.speed
    lastPublishedAt = performance.now()
    lastRequestedAt = lastPublishedAt
    workQueue.clear()
    manualPitRequests.clear()
    manualPaceModes.clear()
    publish({ type: 'ready', snapshot })
    return
  }

  if (message.type === 'control') {
    if (isPaused !== message.isPaused || speed !== message.speed) {
      workQueue.clear()
      lastRequestedAt = performance.now()
    }
    isPaused = message.isPaused
    speed = message.speed
    return
  }

  if (message.type === 'skip-formation') {
    if (config && snapshot) {
      snapshot = skipFormationLap(snapshot, config)
      publish({ type: 'snapshot', snapshot })
    }
    return
  }

  if (message.type === 'pit-request') {
    manualPitRequests.set(message.driverId, message.compound)
    return
  }

  manualPaceModes.set(message.driverId, message.mode)
})

function pump() {
  if (!config || !snapshot || isPaused || snapshot.sessionStatus === 'finished') {
    workQueue.clear()
    lastRequestedAt = performance.now()
    setTimeout(pump, RACE_WORKER_TICK_MS)
    return
  }

  try {
    const requestedFrames = Math.floor((performance.now() - lastRequestedAt) / RACE_WORKER_TICK_MS)
    if (requestedFrames > 0) {
      workQueue.request(speed, requestedFrames)
      lastRequestedAt += requestedFrames * RACE_WORKER_TICK_MS
    }
    workQueue.run(() => {
      snapshot = advanceRace(snapshot!, RACE_WORKER_TICK_MS / 1000, config!, manualPitRequests, manualPaceModes)
      return snapshot.sessionStatus !== 'finished'
    }, () => performance.now(), speed > 1 ? 16 : 8)

    const now = performance.now()

    if (
      now - lastPublishedAt >= raceWorkerPublishMsFor(speed) ||
      (snapshot as RaceSnapshot).sessionStatus === 'finished'
    ) {
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
  setTimeout(pump, workQueue.hasPending ? 0 : Math.max(1, RACE_WORKER_TICK_MS - (performance.now() - lastRequestedAt)))
}
setTimeout(pump, RACE_WORKER_TICK_MS)
