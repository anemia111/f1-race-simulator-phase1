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
import { createSeasonState } from './simulation/season'
import { createWeekendContext } from './simulation/weekend'

export const WEEKEND_STORAGE_KEY = 'f1-sim-weekend-v2'
export const LEGACY_WEEKEND_STORAGE_KEY = 'f1-sim-weekend-v1'
export const SEASON_STORAGE_KEY = 'f1-sim-season-v3'
export const LEGACY_SEASON_STORAGE_KEY = 'f1-sim-season-v2'
export const DRIVER_RATINGS_STORAGE_KEY = 'f1-sim-driver-ratings-v1'

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
  version: 1
  ratingsByDriver: Record<
    string,
    Partial<Record<DriverTunableStat, number>>
  >
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export function parsePersistedDriverRatings(
  raw: string | null,
  baseDrivers: Driver[],
): Driver[] {
  if (!raw) {
    return baseDrivers.map((driver) => ({ ...driver }))
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.ratingsByDriver)
    ) {
      return baseDrivers.map((driver) => ({ ...driver }))
    }

    const ratingsByDriver = parsed.ratingsByDriver

    return baseDrivers.map((driver) => {
      const candidate = ratingsByDriver[driver.id]

      if (!isRecord(candidate)) {
        return { ...driver }
      }

      const ratings = Object.fromEntries(
        DRIVER_ABILITY_STATS.flatMap((stat) => {
          const value = candidate[stat]

          return typeof value === 'number' && Number.isFinite(value)
            ? [[stat, clampDriverAbility(value)]]
            : []
        }),
      ) as Partial<Record<DriverTunableStat, number>>

      return { ...driver, ...ratings }
    })
  } catch {
    return baseDrivers.map((driver) => ({ ...driver }))
  }
}

export function serializeDriverRatings(
  drivers: Driver[],
): PersistedDriverRatings {
  return {
    version: 1,
    ratingsByDriver: Object.fromEntries(
      drivers.map((driver) => [
        driver.id,
        Object.fromEntries(
          DRIVER_ABILITY_STATS.flatMap((stat) =>
            Object.prototype.hasOwnProperty.call(driver, stat)
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
    heatCycles: Math.max(0, finiteNumber(value.heatCycles, 0)),
    laps: Math.max(0, finiteNumber(value.laps, 0)),
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
      base.setupByDriver[id] = {
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
      }
    }

    base.setupBonusByDriver[id] = finiteNumber(
      source.setupBonusByDriver?.[id],
      0,
    )
    base.setupConfidenceByDriver[id] = finiteNumber(
      source.setupConfidenceByDriver?.[id],
      0,
    )
    base.parcFermeLockedByDriver[id] =
      typeof source.parcFermeLockedByDriver?.[id] === 'boolean'
        ? source.parcFermeLockedByDriver[id]
        : false
    base.gridPenaltyByDriver[id] = Math.max(
      0,
      finiteNumber(source.gridPenaltyByDriver?.[id], 0),
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
        Math.floor(
          finiteNumber(
            source.tireSetsByDriver?.[id]?.[compound],
            base.tireSetsByDriver[id][compound] ?? 0,
          ),
        ),
      )
    }

    const storedSets = source.tireSetInventoryByDriver?.[id]
    if (Array.isArray(storedSets)) {
      const normalizedSets = storedSets
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
      ? source.notes.filter((note): note is string => typeof note === 'string').slice(-30)
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
      seed: parsed.seed,
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

    const completedRounds = Array.isArray(parsed.completedRounds)
      ? parsed.completedRounds.filter(
          (round): round is string => typeof round === 'string',
        )
      : []

    if (!isRecord(parsed.driverPoints) || !isRecord(parsed.teamPoints)) {
      return createSeasonState()
    }

    const garage = createSeasonState().garage

    if (isRecord(parsed.garage)) {
      if (isRecord(parsed.garage.componentsByDriver)) {
        for (const [driverId, components] of Object.entries(
          parsed.garage.componentsByDriver,
        )) {
          garage.componentsByDriver[driverId] = normalizeCarComponents(
            isRecord(components) ? components : null,
          )
        }
      }

      if (isRecord(parsed.garage.pendingGridPenaltyByDriver)) {
        for (const [driverId, penalty] of Object.entries(
          parsed.garage.pendingGridPenaltyByDriver,
        )) {
          garage.pendingGridPenaltyByDriver[driverId] = Math.max(
            0,
            Math.floor(finiteNumber(penalty, 0)),
          )
        }
      }
    }

    return {
      completedRounds,
      driverPoints: parsed.driverPoints as Record<string, number>,
      teamPoints: parsed.teamPoints as Record<string, number>,
      driverResults: isRecord(parsed.driverResults)
        ? (parsed.driverResults as Record<string, number[]>)
        : {},
      teamResults: isRecord(parsed.teamResults)
        ? (parsed.teamResults as Record<string, number[]>)
        : {},
      garage,
    }
  } catch {
    return createSeasonState()
  }
}
