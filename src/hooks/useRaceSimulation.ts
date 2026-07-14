import { useCallback, useEffect, useRef, useState } from 'react'
import { phaseOneConfig } from '../data/phaseOne'
import { advanceRace, createInitialRace } from '../simulation/race'
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
} from '../workers/raceWorkerProtocol'

type SimulationOptions = {
  config?: RaceConfig
  isPaused: boolean
  resetKey?: string
  speed: SpeedMultiplier
}

export function useRaceSimulation({
  config = phaseOneConfig,
  isPaused,
  resetKey,
  speed,
}: SimulationOptions) {
  const [snapshot, setSnapshot] = useState<RaceSnapshot>(() =>
    createInitialRace(config),
  )
  const [workerSupported, setWorkerSupported] = useState(
    () => typeof Worker !== 'undefined',
  )
  const [engineError, setEngineError] = useState<string | null>(null)
  const snapshotRef = useRef(snapshot)
  const controlRef = useRef({ isPaused, speed })
  const workerRef = useRef<Worker | null>(null)
  const lastFallbackPublishRef = useRef(0)
  const manualPitRequestsRef = useRef(new Map<string, TireCompound>())
  const manualPaceModesRef = useRef(new Map<string, RacePaceMode>())
  controlRef.current = { isPaused, speed }

  useEffect(() => {
    const nextSnapshot = createInitialRace(config)

    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setEngineError(null)
    manualPitRequestsRef.current.clear()
    manualPaceModesRef.current.clear()

    if (!workerSupported) {
      return
    }

    let worker: Worker | null = null

    try {
      worker = new Worker(new URL('../workers/raceWorker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker
      worker.onmessage = (event: MessageEvent<RaceWorkerOutboundMessage>) => {
        const message = event.data

        if (message.type === 'error') {
          setEngineError(message.message)
          setWorkerSupported(false)
          return
        }

        snapshotRef.current = message.snapshot
        setSnapshot(message.snapshot)
      }
      worker.onerror = (event) => {
        setEngineError(event.message || 'Race worker failed to start')
        setWorkerSupported(false)
      }
      const initialize: RaceWorkerInboundMessage = {
        type: 'initialize',
        config,
        isPaused: controlRef.current.isPaused,
        speed: controlRef.current.speed,
      }
      worker.postMessage(initialize)
    } catch (error) {
      setEngineError(
        error instanceof Error ? error.message : 'Race worker unavailable',
      )
      setWorkerSupported(false)
    }

    return () => {
      worker?.terminate()

      if (workerRef.current === worker) {
        workerRef.current = null
      }
    }
  }, [config, resetKey, workerSupported])

  useEffect(() => {
    const message: RaceWorkerInboundMessage = {
      type: 'control',
      isPaused,
      speed,
    }

    workerRef.current?.postMessage(message)
  }, [isPaused, speed])

  useEffect(() => {
    if (workerSupported) {
      return
    }

    lastFallbackPublishRef.current = performance.now()
    const intervalId = window.setInterval(() => {
      if (isPaused) {
        return
      }

      const nextSnapshot = advanceRace(
        snapshotRef.current,
        (RACE_WORKER_TICK_MS / 1000) * speed,
        config,
        manualPitRequestsRef.current,
        manualPaceModesRef.current,
      )
      snapshotRef.current = nextSnapshot
      const now = performance.now()

      if (
        now - lastFallbackPublishRef.current >= raceWorkerPublishMsFor(speed) ||
        nextSnapshot.sessionStatus === 'finished'
      ) {
        lastFallbackPublishRef.current = now
        setSnapshot(nextSnapshot)
      }
    }, RACE_WORKER_TICK_MS)

    return () => window.clearInterval(intervalId)
  }, [config, isPaused, speed, workerSupported])

  const requestPitStop = useCallback(
    (driverId: string, compound: TireCompound) => {
      const message: RaceWorkerInboundMessage = {
        type: 'pit-request',
        driverId,
        compound,
      }

      if (workerRef.current) {
        workerRef.current.postMessage(message)
      } else {
        manualPitRequestsRef.current.set(driverId, compound)
      }
    },
    [],
  )
  const setDriverPaceMode = useCallback(
    (driverId: string, mode: RacePaceMode) => {
      const message: RaceWorkerInboundMessage = {
        type: 'pace-mode',
        driverId,
        mode,
      }

      if (workerRef.current) {
        workerRef.current.postMessage(message)
      } else {
        manualPaceModesRef.current.set(driverId, mode)
      }
    },
    [],
  )

  return {
    engineError,
    engineMode: workerSupported ? ('worker' as const) : ('main' as const),
    requestPitStop,
    setDriverPaceMode,
    snapshot,
  }
}
