import type {
  Driver,
  DriverTunableStat,
  GridSource,
  TireCompound,
  TireSet,
  TrackDefinition,
  WeekendContext,
  WeekendStage,
} from './types'
import { normalizeCarComponents } from './simulation/components'
import {
  DRIVER_ABILITY_STATS,
  clampDriverAbility,
  driverAbilityValue,
} from './simulation/driverAbility'
import type { SeasonState } from './simulation/season'
import {
  canonicalSeasonSessionId,
  createSeasonState,
} from './simulation/season'
import { createWeekendContext } from './simulation/weekend'
import { normalizeCarSetup } from './simulation/engineering'
import { normalizeSimulationSeed } from './simulation/random'

export const WEEKEND_STORAGE_KEY = 'f1-sim-weekend-v2'
export const LEGACY_WEEKEND_STORAGE_KEY = 'f1-sim-weekend-v1'
export const SEASON_STORAGE_KEY = 'f1-sim-season-v3'
export const LEGACY_SEASON_STORAGE_KEY = 'f1-sim-season-v2'
export const DRIVER_RATINGS_STORAGE_KEY =
  'f1-sim-driver-ratings-v3-grouped-baseline'

const weekendStages: WeekendStage[] = [
  'fp1',
  'fp2',
  'fp3',
  'sprintQualifying',
  'sprint',
  'qualifying',
  'race',
]
const gridSources: GridSource[] = ['brief', 'qualifying', 'openf1']
const compounds: TireCompound[] = ['S', 'M', 'H', 'I', 'W']

export type PersistedWeekend = {
  version: 2
  trackId: string
  stage: WeekendStage
  seed: string
  gridSource: GridSource
  weekendContext: WeekendContext
}

export type PersistedDriverRatings = {
  version: 3
  ratingsByDriver: Record<
    string,
    Partial<Record<DriverTunableStat, number>>
  >
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const MAX_PERSISTED_ENTRIES = 100
const MAX_PERSISTED_POINTS = 10_000
const MAX_PERSISTED_RESULT_POSITION = 100
const MAX_PERSISTED_RESULTS_PER_ENTRY = 100
const MAX_PERSISTED_COMPLETED_ROUNDS = 64
const MAX_PERSISTED_TIRE_SETS_PER_DRIVER = 40

const isSafeStorageKey = (value: string) =>
  /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) &&
  value !== '__proto__' &&
  value !== 'constructor' &&
  value !== 'prototype'

export function readFirstAvailableStorageValue(
  keys: string[],
  getItem: (key: string) => string | null,
): string | null {
  try {
    for (const key of keys) {
      const value = getItem(key)

      if (value !== null) {
        return value
      }
    }
  } catch {
    return null
  }

  return null
}

function normalizePointsRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_PERSISTED_ENTRIES)
      .flatMap(([id, points]) =>
        isSafeStorageKey(id) &&
        typeof points === 'number' &&
        Number.isFinite(points) &&
        points >= 0 &&
        points <= MAX_PERSISTED_POINTS
          ? [[id, points] as const]
          : [],
      ),
  )
}

function normalizeResultsRecord(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_PERSISTED_ENTRIES)
      .flatMap(([id, results]) => {
        if (!isSafeStorageKey(id) || !Array.isArray(results)) {
          return []
        }

        const normalized = results
          .filter(
            (result): result is number =>
              typeof result === 'number' &&
              Number.isInteger(result) &&
              result >= 1 &&
              result <= MAX_PERSISTED_RESULT_POSITION,
          )
          .slice(-MAX_PERSISTED_RESULTS_PER_ENTRY)

        return [[id, normalized] as const]
      }),
  )
}

function normalizeCompletedRounds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .filter(
          (round): round is string =>
            typeof round === 'string' && isSafeStorageKey(round),
        )
        .map(canonicalSeasonSessionId),
    ),
  ).slice(-MAX_PERSISTED_COMPLETED_ROUNDS)
}

export function parsePersistedDriverRatings(
  raw: string | null,
  baseDrivers: Driver[],
): Driver[] {
  if (!raw) {
    return baseDrivers.map((driver) => ({
      ...driver,
      skills: { ...driver.skills },
      style: { ...driver.style },
    }))
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      !isRecord(parsed) ||
      (parsed.version !== 1 &&
        parsed.version !== 2 &&
        parsed.version !== 3) ||
      !isRecord(parsed.ratingsByDriver)
    ) {
      return baseDrivers.map((driver) => ({
        ...driver,
        skills: { ...driver.skills },
        style: { ...driver.style },
      }))
    }

    const ratingsByDriver = parsed.ratingsByDriver

    return baseDrivers.map((driver) => {
      const candidate = ratingsByDriver[driver.id]

      if (!isRecord(candidate)) {
        return {
          ...driver,
          skills: { ...driver.skills },
          style: { ...driver.style },
        }
      }

      const ratings = Object.fromEntries(
        DRIVER_ABILITY_STATS.flatMap((stat) => {
          const value = candidate[stat]

          return typeof value === 'number' && Number.isFinite(value)
            ? [[stat, clampDriverAbility(value)]]
            : []
        }),
      ) as Partial<Record<DriverTunableStat, number>>

      return {
        ...driver,
        skills: { ...driver.skills, ...ratings },
        style: { ...driver.style },
      }
    })
  } catch {
    return baseDrivers.map((driver) => ({
      ...driver,
      skills: { ...driver.skills },
      style: { ...driver.style },
    }))
  }
}

export function serializeDriverRatings(
  drivers: Driver[],
): PersistedDriverRatings {
  return {
    version: 3,
    ratingsByDriver: Object.fromEntries(
      drivers.map((driver) => [
        driver.id,
        Object.fromEntries(
          DRIVER_ABILITY_STATS.flatMap((stat) =>
            Object.prototype.hasOwnProperty.call(driver.skills, stat)
              ? [[stat, driverAbilityValue(driver, stat)]]
              : [],
          ),
        ),
      ]),
    ),
  }
}

const isWeekendStage = (value: unknown): value is WeekendStage =>
  typeof value === 'string' && weekendStages.includes(value as WeekendStage)

function normalizeTireSet(value: unknown): TireSet | null {
  if (!isRecord(value)) {
    return null
  }

  const compound = value.compound
  const status = value.status

  if (
    typeof value.id !== 'string' ||
    !isSafeStorageKey(value.id) ||
    typeof compound !== 'string' ||
    !compounds.includes(compound as TireCompound) ||
    (status !== 'available' && status !== 'used' && status !== 'returned')
  ) {
    return null
  }

  const family =
    value.family === 'C1' ||
    value.family === 'C2' ||
    value.family === 'C3' ||
    value.family === 'C4' ||
    value.family === 'C5'
      ? value.family
      : null

  return {
    id: value.id,
    compound: compound as TireCompound,
    family,
    heatCycles: Math.min(20, Math.max(0, finiteNumber(value.heatCycles, 0))),
    laps: Math.min(1_000, Math.max(0, finiteNumber(value.laps, 0))),
    status,
  }
}

function normalizeWeekendContext(
  value: unknown,
  drivers: Driver[],
  track: TrackDefinition,
): WeekendContext {
  const base = createWeekendContext(
    drivers,
    track.isSprintWeekend,
    track,
  )

  if (!isRecord(value)) {
    return base
  }

  const validDriverIds = new Set(drivers.map((driver) => driver.id))
  const source = value as Partial<WeekendContext>
  const completed = Array.isArray(source.completed)
    ? Array.from(new Set(source.completed.filter(isWeekendStage)))
    : []
  const normalizeGrid = (candidate: unknown) => {
    if (!Array.isArray(candidate)) {
      return undefined
    }

    const ids = Array.from(
      new Set(
        candidate.filter(
          (driverId): driverId is string =>
            typeof driverId === 'string' && validDriverIds.has(driverId),
        ),
      ),
    )

    return ids.length === drivers.length ? ids : undefined
  }
  const gridByStage: WeekendContext['gridByStage'] = {}
  const sprintGrid = normalizeGrid(source.gridByStage?.sprint)
  const raceGrid = normalizeGrid(source.gridByStage?.race)

  if (sprintGrid) {
    gridByStage.sprint = sprintGrid
  }
  if (raceGrid) {
    gridByStage.race = raceGrid
  }

  for (const driver of drivers) {
    const id = driver.id
    const setupCandidate = source.setupByDriver?.[id]

    if (isRecord(setupCandidate)) {
      const setup = base.setupByDriver[id]
      base.setupByDriver[id] = normalizeCarSetup({
        brakeBiasPercent: finiteNumber(
          setupCandidate.brakeBiasPercent,
          setup.brakeBiasPercent,
        ),
        coolingPercent: finiteNumber(
          setupCandidate.coolingPercent,
          setup.coolingPercent,
        ),
        differentialPercent: finiteNumber(
          setupCandidate.differentialPercent,
          setup.differentialPercent,
        ),
        frontWing: finiteNumber(setupCandidate.frontWing, setup.frontWing),
        rearWing: finiteNumber(setupCandidate.rearWing, setup.rearWing),
        rideHeightMm: finiteNumber(
          setupCandidate.rideHeightMm,
          setup.rideHeightMm,
        ),
      })
    }

    base.setupBonusByDriver[id] = Math.min(
      0.35,
      Math.max(0, finiteNumber(source.setupBonusByDriver?.[id], 0)),
    )
    base.setupConfidenceByDriver[id] = Math.min(
      1,
      Math.max(0, finiteNumber(source.setupConfidenceByDriver?.[id], 0)),
    )
    base.parcFermeLockedByDriver[id] =
      typeof source.parcFermeLockedByDriver?.[id] === 'boolean'
        ? source.parcFermeLockedByDriver[id]
        : false
    base.gridPenaltyByDriver[id] = Math.min(
      drivers.length,
      Math.max(0, finiteNumber(source.gridPenaltyByDriver?.[id], 0)),
    )
    base.pitLaneStartByDriver[id] =
      typeof source.pitLaneStartByDriver?.[id] === 'boolean'
        ? source.pitLaneStartByDriver[id]
        : false
    const qualificationStatus = source.qualificationStatusByDriver?.[id]
    base.qualificationStatusByDriver[id] =
      qualificationStatus === 'exempt' ||
      qualificationStatus === 'not-qualified'
        ? qualificationStatus
        : 'qualified'
    base.componentConditionByDriver[id] = normalizeCarComponents(
      source.componentConditionByDriver?.[id],
    )

    for (const compound of compounds) {
      base.tireSetsByDriver[id][compound] = Math.max(
        0,
        Math.min(
          base.tireSetsByDriver[id][compound] ?? 0,
          Math.floor(
            finiteNumber(
              source.tireSetsByDriver?.[id]?.[compound],
              base.tireSetsByDriver[id][compound] ?? 0,
            ),
          ),
        ),
      )
    }

    const storedSets = source.tireSetInventoryByDriver?.[id]
    if (Array.isArray(storedSets)) {
      const normalizedSets = storedSets
        .slice(0, MAX_PERSISTED_TIRE_SETS_PER_DRIVER)
        .map(normalizeTireSet)
        .filter((set): set is TireSet => set !== null)

      if (normalizedSets.length > 0) {
        base.tireSetInventoryByDriver[id] = normalizedSets
      }
    }
  }

  return {
    ...base,
    completed,
    gridByStage,
    notes: Array.isArray(source.notes)
      ? source.notes
          .filter((note): note is string => typeof note === 'string')
          .slice(-30)
          .map((note) => note.slice(0, 240))
      : [],
  }
}

export function parsePersistedWeekend(
  raw: string | null,
  tracks: TrackDefinition[],
  drivers: Driver[],
): PersistedWeekend | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return null
    }

    const track = tracks.find((candidate) => candidate.id === parsed.trackId)

    if (
      !track ||
      typeof parsed.seed !== 'string' ||
      !isWeekendStage(parsed.stage) ||
      typeof parsed.gridSource !== 'string' ||
      !gridSources.includes(parsed.gridSource as GridSource)
    ) {
      return null
    }

    return {
      version: 2,
      trackId: track.id,
      stage: parsed.stage,
      seed: normalizeSimulationSeed(parsed.seed),
      gridSource: parsed.gridSource as GridSource,
      weekendContext: normalizeWeekendContext(
        parsed.weekendContext,
        drivers,
        track,
      ),
    }
  } catch {
    return null
  }
}

export function parsePersistedSeason(raw: string | null): SeasonState {
  if (!raw) {
    return createSeasonState()
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      return createSeasonState()
    }

    const completedRounds = normalizeCompletedRounds(parsed.completedRounds)

    if (!isRecord(parsed.driverPoints) || !isRecord(parsed.teamPoints)) {
      return createSeasonState()
    }

    const driverPoints = normalizePointsRecord(parsed.driverPoints)
    const teamPoints = normalizePointsRecord(parsed.teamPoints)
    const driverResults = normalizeResultsRecord(parsed.driverResults)
    const teamResults = normalizeResultsRecord(parsed.teamResults)

    const garage = createSeasonState().garage

    if (isRecord(parsed.garage)) {
      if (isRecord(parsed.garage.componentsByDriver)) {
        for (const [driverId, components] of Object.entries(
          parsed.garage.componentsByDriver,
        ).slice(0, MAX_PERSISTED_ENTRIES)) {
          if (!isSafeStorageKey(driverId)) {
            continue
          }

          garage.componentsByDriver[driverId] = normalizeCarComponents(
            isRecord(components) ? components : null,
          )
        }
      }

      if (isRecord(parsed.garage.pendingGridPenaltyByDriver)) {
        for (const [driverId, penalty] of Object.entries(
          parsed.garage.pendingGridPenaltyByDriver,
        ).slice(0, MAX_PERSISTED_ENTRIES)) {
          if (!isSafeStorageKey(driverId)) {
            continue
          }

          garage.pendingGridPenaltyByDriver[driverId] = Math.max(
            0,
            Math.min(
              MAX_PERSISTED_RESULT_POSITION,
              Math.floor(finiteNumber(penalty, 0)),
            ),
          )
        }
      }
    }

    return {
      completedRounds,
      driverPoints,
      teamPoints,
      driverResults,
      teamResults,
      garage,
    }
  } catch {
    return createSeasonState()
  }
}
