import type { RaceConfig, RaceSnapshot } from '../types'

export const RACE_CHECKPOINT_STORAGE_KEY = 'f1-sim-race-checkpoint-v1'
export const RACE_CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60_000
const RACE_CHECKPOINT_VERSION = 1
const MAX_CHECKPOINT_LENGTH = 4_500_000

type StorageAdapter = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export type ActiveRaceSession = {
  config: RaceConfig
  key: string
}

type StoredRaceCheckpoint = {
  savedAt: number
  sessionKey: string
  snapshot: RaceSnapshot
  version: typeof RACE_CHECKPOINT_VERSION
}

const carStatuses = new Set([
  'running',
  'pit',
  'retired',
  'finished',
  'disqualified',
  'dns',
])
const sessionStatuses = new Set(['racing', 'finished'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isNullableFiniteNumber = (value: unknown) =>
  value === null || isFiniteNumber(value)

const isFiniteTuple = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => isFiniteNumber(entry))

const isNullableFiniteTuple = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => isNullableFiniteNumber(entry))

function isCompatibleCarSnapshot(
  value: unknown,
  expectedDriverIds: Set<string>,
) {
  if (!isRecord(value) || !expectedDriverIds.has(String(value.driverId))) {
    return false
  }

  return (
    typeof value.code === 'string' &&
    typeof value.status === 'string' &&
    carStatuses.has(value.status) &&
    isFiniteNumber(value.totalDistance) &&
    isFiniteNumber(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 1 &&
    isFiniteNumber(value.lap) &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.speedKph) &&
    isFiniteNumber(value.ersBatteryPercent) &&
    isFiniteNumber(value.fuelLoadKg) &&
    isFiniteNumber(value.tireWearPercent) &&
    typeof value.passedDoubleYellowThisLap === 'boolean' &&
    isNullableFiniteTuple(value.currentLapSectorTimes, 3) &&
    isNullableFiniteTuple(value.currentLapMiniSectorTimes, 24) &&
    Array.isArray(value.lapHistory) &&
    Array.isArray(value.penalties) &&
    isRecord(value.energyStore) &&
    isRecord(value.components) &&
    isRecord(value.tireSetsRemaining)
  )
}

function isCompatibleRaceSnapshot(value: unknown, config: RaceConfig) {
  if (!isRecord(value)) {
    return false
  }

  const expectedDriverIds = new Set(config.drivers.map((driver) => driver.id))
  const cars = value.cars

  if (
    !Array.isArray(cars) ||
    cars.length !== expectedDriverIds.size ||
    !cars.every((car) => isCompatibleCarSnapshot(car, expectedDriverIds)) ||
    new Set(cars.map((car) => String((car as Record<string, unknown>).driverId)))
      .size !== expectedDriverIds.size
  ) {
    return false
  }

  return (
    isFiniteNumber(value.elapsedSeconds) &&
    value.elapsedSeconds >= 0 &&
    typeof value.elapsedLabel === 'string' &&
    isFiniteNumber(value.leaderLap) &&
    isFiniteNumber(value.raceLaps) &&
    Number.isSafeInteger(value.raceLaps) &&
    value.raceLaps > 0 &&
    typeof value.sessionStatus === 'string' &&
    sessionStatuses.has(value.sessionStatus) &&
    typeof value.eventMessage === 'string' &&
    typeof value.flag === 'string' &&
    isFiniteTuple(value.rubberLevelBySector, 3) &&
    isFiniteTuple(value.surfaceWaterMmBySector, 3) &&
    isFiniteTuple(value.dryingLineBySector, 3) &&
    Array.isArray(value.sectorFlags) &&
    value.sectorFlags.length === 3 &&
    Array.isArray(value.events) &&
    Array.isArray(value.stewardCases) &&
    Array.isArray(value.timedParticipantDriverIds) &&
    isNullableFiniteNumber(value.timedYellowProgress) &&
    isRecord(value.weekend)
  )
}

/** Keep external calibration refreshes out of a race that is already running. */
export function activeRaceSessionFor(
  current: ActiveRaceSession,
  nextKey: string,
  nextConfig: RaceConfig,
): ActiveRaceSession {
  return current.key === nextKey
    ? current
    : { config: nextConfig, key: nextKey }
}

export function serializeRaceCheckpoint(
  sessionKey: string,
  snapshot: RaceSnapshot,
  savedAt = Date.now(),
): string | null {
  try {
    const serialized = JSON.stringify({
      savedAt,
      sessionKey,
      snapshot,
      version: RACE_CHECKPOINT_VERSION,
    } satisfies StoredRaceCheckpoint)

    return serialized.length <= MAX_CHECKPOINT_LENGTH ? serialized : null
  } catch {
    return null
  }
}

export function parseRaceCheckpoint(
  raw: string | null,
  sessionKey: string,
  config: RaceConfig,
  now = Date.now(),
): RaceSnapshot | null {
  if (!raw || raw.length > MAX_CHECKPOINT_LENGTH) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      !isRecord(parsed) ||
      parsed.version !== RACE_CHECKPOINT_VERSION ||
      parsed.sessionKey !== sessionKey ||
      !isFiniteNumber(parsed.savedAt) ||
      parsed.savedAt > now + 60_000 ||
      now - parsed.savedAt > RACE_CHECKPOINT_MAX_AGE_MS ||
      !isCompatibleRaceSnapshot(parsed.snapshot, config)
    ) {
      return null
    }

    return parsed.snapshot as RaceSnapshot
  } catch {
    return null
  }
}

export function restoreRaceCheckpoint(
  storage: StorageAdapter,
  sessionKey: string,
  config: RaceConfig,
  now = Date.now(),
) {
  try {
    const restored = parseRaceCheckpoint(
      storage.getItem(RACE_CHECKPOINT_STORAGE_KEY),
      sessionKey,
      config,
      now,
    )

    if (!restored) {
      storage.removeItem(RACE_CHECKPOINT_STORAGE_KEY)
    }

    return restored
  } catch {
    return null
  }
}

export function saveRaceCheckpoint(
  storage: StorageAdapter,
  sessionKey: string,
  snapshot: RaceSnapshot,
  savedAt = Date.now(),
) {
  const serialized = serializeRaceCheckpoint(sessionKey, snapshot, savedAt)

  if (!serialized) {
    return false
  }

  try {
    storage.setItem(RACE_CHECKPOINT_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}
