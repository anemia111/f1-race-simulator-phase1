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
import {
  activeRaceSessionFor,
  restoreRaceCheckpoint,
  saveRaceCheckpoint,
  type ActiveRaceSession,
} from './raceSession'

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
  const sessionKey = resetKey ?? config.seed
  const activeSessionRef = useRef<ActiveRaceSession>({
    config,
    key: sessionKey,
  })
  activeSessionRef.current = activeRaceSessionFor(
    activeSessionRef.current,
    sessionKey,
    config,
  )
  const activeConfig = activeSessionRef.current.config
  const [initialState] = useState(() => {
    const restored = restoreRaceCheckpoint(
      window.localStorage,
      sessionKey,
      activeConfig,
    )

    return {
      recovered: restored !== null,
      snapshot: restored ?? createInitialRace(activeConfig),
    }
  })
  const [snapshot, setSnapshot] = useState<RaceSnapshot>(initialState.snapshot)
  const [snapshotSessionKey, setSnapshotSessionKey] = useState(sessionKey)
  const [checkpointRecovered, setCheckpointRecovered] = useState(
    initialState.recovered,
  )
  const [checkpointSaveStatus, setCheckpointSaveStatus] = useState<
    'pending' | 'saved' | 'failed'
  >('pending')
  const [workerSupported, setWorkerSupported] = useState(
    () => typeof Worker !== 'undefined',
  )
  const [engineError, setEngineError] = useState<string | null>(null)
  const snapshotRef = useRef(snapshot)
  const controlRef = useRef({ isPaused, speed })
  const workerRef = useRef<Worker | null>(null)
  const lastFallbackPublishRef = useRef(0)
  const lastCheckpointAttemptAtRef = useRef(0)
  const finishedCheckpointAttemptedRef = useRef(
    initialState.recovered && initialState.snapshot.sessionStatus === 'finished',
  )
  const currentSessionKeyRef = useRef(sessionKey)
  const manualPitRequestsRef = useRef(new Map<string, TireCompound>())
  const manualPaceModesRef = useRef(new Map<string, RacePaceMode>())
  controlRef.current = { isPaused, speed }

  useEffect(() => {
    if (currentSessionKeyRef.current === sessionKey) {
      return
    }

    currentSessionKeyRef.current = sessionKey
    const restored = restoreRaceCheckpoint(
      window.localStorage,
      sessionKey,
      activeConfig,
    )
    const nextSnapshot = restored ?? createInitialRace(activeConfig)

    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    setSnapshotSessionKey(sessionKey)
    setCheckpointRecovered(restored !== null)
    setCheckpointSaveStatus('pending')
    setEngineError(null)
    lastCheckpointAttemptAtRef.current = 0
    finishedCheckpointAttemptedRef.current =
      restored?.sessionStatus === 'finished'
    manualPitRequestsRef.current.clear()
    manualPaceModesRef.current.clear()
  }, [activeConfig, sessionKey])

  useEffect(() => {
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
        if (currentSessionKeyRef.current !== sessionKey) {
          return
        }

        const message = event.data

        if (message.type === 'error') {
          setEngineError(message.message)
          setWorkerSupported(false)
          return
        }

        snapshotRef.current = message.snapshot
        setSnapshot(message.snapshot)
        setSnapshotSessionKey(sessionKey)
      }
      worker.onerror = (event) => {
        event.preventDefault()
        setEngineError(event.message || 'Race worker failed to start')
        setWorkerSupported(false)
      }
      const initialize: RaceWorkerInboundMessage = {
        type: 'initialize',
        config: activeConfig,
        isPaused: controlRef.current.isPaused,
        snapshot: snapshotRef.current,
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
  }, [activeConfig, sessionKey, workerSupported])

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

      try {
        const nextSnapshot = advanceRace(
          snapshotRef.current,
          (RACE_WORKER_TICK_MS / 1000) * speed,
          activeConfig,
          manualPitRequestsRef.current,
          manualPaceModesRef.current,
        )
        snapshotRef.current = nextSnapshot
        const now = performance.now()

        if (
          now - lastFallbackPublishRef.current >=
            raceWorkerPublishMsFor(speed) ||
          nextSnapshot.sessionStatus === 'finished'
        ) {
          lastFallbackPublishRef.current = now
          setSnapshot(nextSnapshot)
          setSnapshotSessionKey(sessionKey)
        }
      } catch (error) {
        setEngineError(
          error instanceof Error
            ? `Main-thread race engine stopped: ${error.message}`
            : 'Main-thread race engine stopped',
        )
        window.clearInterval(intervalId)
      }
    }, RACE_WORKER_TICK_MS)

    return () => window.clearInterval(intervalId)
  }, [activeConfig, isPaused, sessionKey, speed, workerSupported])

  useEffect(() => {
    if (
      snapshotSessionKey !== sessionKey ||
      snapshot.elapsedSeconds <= 0
    ) {
      return
    }

    const now = Date.now()
    const firstFinishedCheckpoint =
      snapshot.sessionStatus === 'finished' &&
      !finishedCheckpointAttemptedRef.current

    if (
      !firstFinishedCheckpoint &&
      now - lastCheckpointAttemptAtRef.current < 5_000
    ) {
      return
    }

    lastCheckpointAttemptAtRef.current = now

    if (snapshot.sessionStatus === 'finished') {
      finishedCheckpointAttemptedRef.current = true
    }

    setCheckpointSaveStatus(
      saveRaceCheckpoint(window.localStorage, sessionKey, snapshot, now)
        ? 'saved'
        : 'failed',
    )
  }, [sessionKey, snapshot, snapshotSessionKey])

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
    checkpointRecovered,
    checkpointSaveStatus,
    engineError,
    engineMode: workerSupported ? ('worker' as const) : ('main' as const),
    requestPitStop,
    setDriverPaceMode,
    snapshot,
  }
}
