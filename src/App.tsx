import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  BroadcastDashboard,
  type BroadcastDataDetail,
} from './components/BroadcastDashboard'
import { RaceClassificationPanel } from './components/RaceClassificationPanel'
import { QualifyingClassificationPanel } from './components/QualifyingClassificationPanel'
import { RaceInsightsPanel } from './components/RaceInsightsPanel'
import { PitWallPanel } from './components/PitWallPanel'
import { SetupPanel } from './components/SetupPanel'
import { FreeModeBuilder } from './components/FreeModeBuilder'
import { fiaEventPackFor } from './data/fiaEventPacks2026'
import {
  SERIES_CONFIGURATION_STORAGE_KEY,
  parsePersistedSeriesConfiguration,
  serializeSeriesConfiguration,
  type SeriesConfigurationSnapshot,
} from './data/seriesConfiguration'
import {
  classifyObservedDataMode,
  dataModeUsesObservedEnvironment,
  dataModeUsesObservedTiming,
  resolveRequestedDataMode,
  type DataMode,
} from './domain/dataMode'
import {
  bestSectorTime,
  classifySectorTime,
  isCurrentLapEligibleForBest,
  latestTimingLapForSegment,
} from './domain/sectorTiming'
import { useOpenF1Data } from './hooks/useOpenF1Data'
import { useOpenF1SeasonStandings } from './hooks/useOpenF1SeasonStandings'
import { useRaceSimulation } from './hooks/useRaceSimulation'
import {
  DRIVER_RATINGS_STORAGE_KEY,
  LEGACY_DRIVER_RATINGS_STORAGE_KEY,
  LEGACY_SEASON_STORAGE_KEY,
  LEGACY_WEEKEND_STORAGE_KEY,
  OLDER_WEEKEND_STORAGE_KEY,
  SEASON_STORAGE_KEY,
  WEEKEND_STORAGE_KEY,
  parsePersistedSeason,
  parsePersistedDriverRatings,
  parsePersistedWeekend,
  readFirstAvailableStorageValue,
  serializeDriverRatings,
  type PersistedWeekend,
} from './persistence'
import {
  applyQualifyingGrid,
  reversedSprintGrid,
  runPracticeSession,
  runSeriesQualifying,
  runSprintShootoutQualifying,
  type QualifyingResult,
} from './simulation/qualifying'
import {
  applyPracticeSetup,
  buildPracticeSetupSummary,
} from './simulation/practiceSetup'
import { replaceCarComponent } from './simulation/components'
import {
  compactSessionDurationLabel,
  isFeatureRaceStage,
  isPracticeStage,
  isQualifyingStage,
  isRaceDistanceSession,
  isStandardQualifyingStage,
  simulationStageFor,
  type PracticeSessionName,
  sessionDurationSecondsFor,
} from './simulation/sessionRules'
import { FIA_2026_REGULATION_PROFILE } from './simulation/regulations'
import {
  simulatedHumidityPercentFor,
  simulatedTemperaturesFor,
  weatherTrackStateFor,
} from './simulation/weather'
import {
  isDryCompound,
  tireConditionFor,
  tireDeltaSeconds,
} from './simulation/tires'
import { buildTimedSessionPlan } from './simulation/timedSessionPlan'
import type { OpenF1Bundle, OpenF1CarData, OpenF1Lap } from './services/openF1'
import { buildOpenF1LiveRaceState } from './services/openF1Derived'
import { buildOpenF1TrackProgress } from './services/openF1Location'
import {
  buildOpenF1TrackCalibration,
  calibrateFieldFromOpenF1,
  mergeObservedTrackCalibration,
} from './services/openF1Performance'
import { buildSynchronizedCarData } from './services/openF1Sync'
import { buildOpenF1TimelineFrame } from './services/openF1Timeline'
import { buildWeekendTirePlan } from './simulation/weekendTires'
import {
  applySeasonGarageToWeekend,
  recordSeasonRound,
  recordQualifyingPoints,
  seasonSessionId,
  updateSeasonGarageFromCars,
  updateSeasonGarageReplacement,
  type SeasonState,
} from './simulation/season'
import {
  applyGridPenalties,
  applyWeekendGrid,
  completedQualifyingClassification,
  completePracticeSession,
  completeQualifyingSession,
  completeRaceSession,
  createWeekendContext,
} from './simulation/weekend'
import type {
  CameraMode,
  CarSetup,
  CarComponents,
  CarSnapshot,
  Driver,
  DriverTunableStat,
  GridSource,
  MachineTunableStat,
  RaceConfig,
  RaceSnapshot,
  SectorTimingStatus,
  SpeedMultiplier,
  Team,
  TireCompound,
  WeekendContext,
  WeekendStage,
} from './types'
import {
  clampDriverAbility,
  driverAbilityValue,
  driverConfiguredOverallAbilityPoints,
} from './simulation/driverAbility'
import { normalizeSimulationSeed } from './simulation/random'
import {
  buildFreeModeRuntime,
  createDefaultFreeModeConfiguration,
  freeModeStageFor,
} from './freeMode/freeModeRegistry'
import {
  FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY,
  loadFreeModeStoredState,
  saveFreeModeStoredState,
} from './freeMode/freeModePersistence'
import type {
  ApplicationMode,
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModeRuntime,
  FreeModeStoredState,
} from './freeMode/types'
import {
  defaultSeriesPackage,
  driverAssignments2026,
  driverPool2026,
  seriesPackageById,
  seriesPackages,
} from './series/seriesRegistry'
import type { SeriesId, SeriesPackage } from './series/types'

const RaceScene = lazy(() =>
  import('./three/RaceScene').then((module) => ({ default: module.RaceScene })),
)
const SeriesDataManager = lazy(() =>
  import('./components/SeriesDataManager').then((module) => ({
    default: module.SeriesDataManager,
  })),
)

const SERIES_STORAGE_KEY = 'race-sim-selected-series-v1'
const emptyOpenF1CarDataByCode = new Map<string, OpenF1CarData>()
const microSectorCount = 8
const totalMicroSectorCount = microSectorCount * 3
const weekendStageLabels: Record<WeekendStage, string> = {
  fp1: 'FP1',
  fp2: 'FP2',
  fp3: 'FP3',
  sprintQualifying: 'SQ',
  qualifying: 'Quali',
  qualifying2: 'Quali 2',
  race: 'Race',
  race2: 'Race 2',
  sprint: 'Sprint',
}

/**
 * Restores the in-progress local weekend (selected round, stage, seed, and
 * accumulated session effects). Anything malformed or referencing unknown
 * tracks is discarded so a stale save can never break startup.
 */
const isSeriesId = (value: string | null): value is SeriesId =>
  seriesPackages.some((series) => series.id === value)

function loadSelectedSeriesId(): SeriesId {
  try {
    const selected = window.localStorage.getItem(SERIES_STORAGE_KEY)

    if (isSeriesId(selected)) {
      return selected
    }

    const weekendRaw = window.localStorage.getItem(WEEKEND_STORAGE_KEY)
    if (weekendRaw) {
      const weekend = JSON.parse(weekendRaw) as { seriesId?: string }
      const storedSeriesId = weekend.seriesId ?? null
      if (isSeriesId(storedSeriesId)) {
        return storedSeriesId
      }
    }
  } catch {
    // A blocked storage API should never prevent the simulator from starting.
  }

  return defaultSeriesPackage.id
}

const initialSeriesId = loadSelectedSeriesId()
const initialSeriesPackage =
  seriesPackageById.get(initialSeriesId) ?? defaultSeriesPackage
const initialTrack = initialSeriesPackage.tracks[0]

function loadPersistedWeekend(
  series: SeriesPackage,
): PersistedWeekend | null {
  return parsePersistedWeekend(
    readFirstAvailableStorageValue(
      [
        WEEKEND_STORAGE_KEY,
        LEGACY_WEEKEND_STORAGE_KEY,
        OLDER_WEEKEND_STORAGE_KEY,
      ],
      (key) => window.localStorage.getItem(key),
    ),
    series.tracks,
    series.drivers,
    series.id,
    series.rules.tires.standardAllocation,
  )
}

const persistedWeekend = loadPersistedWeekend(initialSeriesPackage)
const initialCalendarEvent =
  initialSeriesPackage.calendar.find(
    (event) => event.id === persistedWeekend?.eventId,
  ) ??
  initialSeriesPackage.calendar.find(
    (event) => event.trackId === (persistedWeekend?.trackId ?? initialTrack.id),
  ) ??
  initialSeriesPackage.calendar.find((event) => !event.cancelled) ??
  initialSeriesPackage.calendar[0]

const scopedStorageKey = (base: string, seriesId: SeriesId) =>
  `${base}:${seriesId}`

function loadPersistedSeason(seriesId: SeriesId): SeasonState {
  return parsePersistedSeason(
    readFirstAvailableStorageValue(
      seriesId === 'f1-custom'
        ? [
            scopedStorageKey(SEASON_STORAGE_KEY, seriesId),
            SEASON_STORAGE_KEY,
            LEGACY_SEASON_STORAGE_KEY,
          ]
        : [scopedStorageKey(SEASON_STORAGE_KEY, seriesId)],
      (key) => window.localStorage.getItem(key),
    ),
  )
}

type TimingRow = {
  aeroOvertakeLabel: string
  batteryPercent: number
  brakePercent: number
  car: CarSnapshot
  displayGapToLeaderLabel: string
  displayIntervalLabel: string
  displayPosition: number
  driverOverallAbility: number
  gear: number
  lapTimeSeconds: number | null
  lapDataLabel: string
  microSectors: MiniSectorState[][]
  microSectorTimes: Array<number | null> | null
  microSectorDisplayIsCurrent: boolean
  performancePaceDeltaSeconds: number | null
  performanceSource: 'openf1-calibrated' | 'simulation'
  rpm: number
  sectorLapNumber: number | null
  source: 'openf1' | 'simulation'
  sectors: [number | null, number | null, number | null]
  sectorStatuses: [SectorTimingStatus, SectorTimingStatus, SectorTimingStatus]
  speedKph: number
  telemetrySource: 'openf1' | 'simulation' | 'unavailable'
  throttlePercent: number
  tireModelSource: 'openf1-calibrated' | 'pirelli' | 'simulation'
  tireLifePercent: number
  tirePaceDeltaSeconds: number
  tireTemperatureC: number
}

type MiniSectorState =
  | 'dim'
  | 'yellow'
  | 'green'
  | 'purple'
  | 'pit'
  | 'stopped'

type TimingRowWithoutSectorStatuses = Omit<TimingRow, 'sectorStatuses'>

type PersonalTimingBests = {
  sectors: [number | null, number | null, number | null]
  miniSectors: Array<number | null>
}

const lowerTimingValue = (
  current: number | null,
  candidate: number | null | undefined,
) =>
  typeof candidate === 'number' &&
  Number.isFinite(candidate) &&
  (current === null || candidate < current)
    ? candidate
    : current

const personalTimingBestsForRow = (
  row: TimingRowWithoutSectorStatuses,
  activeSegmentName?: string | null,
): PersonalTimingBests => {
  if (row.source === 'openf1') {
    return {
      sectors: [...row.sectors],
      miniSectors: Array.from(
        { length: totalMicroSectorCount },
        () => null,
      ),
    }
  }

  const sectors: PersonalTimingBests['sectors'] = [null, null, null]
  const miniSectors: PersonalTimingBests['miniSectors'] = Array.from(
    { length: totalMicroSectorCount },
    () => null,
  )

  for (const lap of row.car.lapHistory) {
    if (!lap.isValid) continue
    // In a knockout session only the current segment's laps set the purple
    // references, so Q2/Q3 sectors and mini-sectors start fresh.
    if (activeSegmentName != null && lap.segment !== activeSegmentName) continue

    lap.sectors.forEach((value, index) => {
      sectors[index] = lowerTimingValue(sectors[index], value)
    })
    lap.miniSectors?.forEach((value, index) => {
      miniSectors[index] = lowerTimingValue(miniSectors[index], value)
    })
  }

  if (isCurrentLapEligibleForBest(row.car.timedRunPhase)) {
    row.car.currentLapSectorTimes.forEach((value, index) => {
      sectors[index] = lowerTimingValue(sectors[index], value)
    })
    row.car.currentLapMiniSectorTimes.forEach((value, index) => {
      miniSectors[index] = lowerTimingValue(miniSectors[index], value)
    })
  }

  return { sectors, miniSectors }
}

type OpenF1LapWithSectorTimes = OpenF1Lap & {
  duration_sector_1: number
  duration_sector_2: number
  duration_sector_3: number
  lap_duration: number
}

const copyTeams = (teams: Team[]) =>
  teams.map((team) => ({ ...team, machine: { ...team.machine } }))
const copyDrivers = (drivers: Driver[]) =>
  drivers.map((driver) => ({
    ...driver,
    skills: { ...driver.skills },
    style: { ...driver.style },
  }))

function loadPersistedDrivers(series: SeriesPackage): Driver[] {
  return parsePersistedDriverRatings(
    readFirstAvailableStorageValue(
      series.id === 'f1-custom'
        ? [
            scopedStorageKey(DRIVER_RATINGS_STORAGE_KEY, series.id),
            DRIVER_RATINGS_STORAGE_KEY,
            LEGACY_DRIVER_RATINGS_STORAGE_KEY,
          ]
        : [scopedStorageKey(DRIVER_RATINGS_STORAGE_KEY, series.id)],
      (key) => window.localStorage.getItem(key),
    ),
    series.drivers,
  )
}

function loadSeriesConfiguration(
  series: SeriesPackage,
): SeriesConfigurationSnapshot {
  const configured = parsePersistedSeriesConfiguration(
    readFirstAvailableStorageValue(
      [scopedStorageKey(SERIES_CONFIGURATION_STORAGE_KEY, series.id)],
      (key) => window.localStorage.getItem(key),
    ),
    series,
  )

  if (configured) return configured

  return {
    calendar: JSON.parse(JSON.stringify(series.calendar)) as SeriesPackage['calendar'],
    drivers: loadPersistedDrivers(series),
    migrationHistory: [],
    rules: JSON.parse(JSON.stringify(series.rules)) as SeriesPackage['rules'],
    teams: copyTeams(series.teams),
  }
}

const initialSeriesConfiguration = loadSeriesConfiguration(
  initialSeriesPackage,
)

function configuredSeriesPackagesForFreeMode() {
  return seriesPackages.map((series) => {
    const configuration = loadSeriesConfiguration(series)

    return {
      ...series,
      calendar: configuration.calendar,
      drivers: configuration.drivers,
      rules: configuration.rules,
      teams: configuration.teams,
    }
  })
}

function freeModeContextFor(
  packages: SeriesPackage[],
): FreeModeBuildContext {
  const driverOverridesById = new Map<string, Driver>()

  for (const series of packages) {
    for (const driver of series.drivers) {
      const current = driverOverridesById.get(driver.id)

      if (
        !current ||
        (driver.performanceSource?.overall ?? 0) >
          (current.performanceSource?.overall ?? 0)
      ) {
        driverOverridesById.set(driver.id, driver)
      }
    }
  }

  return {
    driverOverridesById,
    driverPool: driverPool2026,
    seriesById: new Map(packages.map((series) => [series.id, series])),
  }
}

function initialFreeModeStoredState(): FreeModeStoredState {
  const context = freeModeContextFor(configuredSeriesPackagesForFreeMode())
  const restored = loadFreeModeStoredState(window.localStorage, context)

  return (
    restored ?? {
      configuration: createDefaultFreeModeConfiguration(
        context.seriesById,
        createAutoScenarioSeed(),
      ),
      qualifyingResult: null,
      version: 1,
    }
  )
}

const weekendStagesFor = (
  series: SeriesPackage,
  track: RaceConfig['track'],
  eventId?: string,
): WeekendStage[] => {
  const matchingEvents = series.calendar.filter(
    (event) => event.trackId === track.id,
  )
  const eventOverride =
    (eventId
      ? series.calendar.find((event) => event.id === eventId)
      : matchingEvents.length === 1
        ? matchingEvents[0]
        : undefined)?.weekendStages

  if (eventOverride) return eventOverride

  return series.id === 'f1-custom' && track.isSprintWeekend
    ? ['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']
    : series.rules.weekendStages
}

const tireAllocationFor = (
  series: SeriesPackage,
  isSprintWeekend: boolean,
) => ({
  ...(isSprintWeekend && series.rules.tires.sprintAllocation
    ? series.rules.tires.sprintAllocation
    : series.rules.tires.standardAllocation),
})

const hashUnit = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

const createAutoScenarioSeed = () => {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 12)

  return `auto-${Date.now().toString(36)}-${randomPart}`
}

const formatLapTime = (seconds: number | null | undefined) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return '--:--.---'
  }

  const minutes = Math.floor(seconds / 60)
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remaining}`
}

const formatTemperature = (value: number) => `${value.toFixed(1)}C`

const formatWind = (speedMetersPerSecond: number, directionDegrees: number) => {
  const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const normalizedDirection = ((directionDegrees % 360) + 360) % 360
  const compass = compassPoints[Math.round(normalizedDirection / 45) % 8]

  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h ${compass}`
}

const measuredMiniSectorStates = (
  car: CarSnapshot,
  displayedTimes: Array<number | null>,
  overallBests: Array<number | null>,
  personalBests: Array<number | null>,
  displayingCurrentLap: boolean,
): MiniSectorState[][] => {
  if (car.status === 'pit' || car.timedRunPhase === 'garage') {
    return Array.from({ length: 3 }, (_, sectorIndex) =>
      Array.from({ length: microSectorCount }, (_, miniSectorIndex) =>
        sectorIndex === 0 && miniSectorIndex === 0
          ? 'pit'
          : sectorIndex === 2 && miniSectorIndex === microSectorCount - 1
            ? 'pit'
            : 'dim',
      ),
    )
  }

  return Array.from({ length: 3 }, (_, sectorIndex) =>
    Array.from({ length: microSectorCount }, (_, miniSectorIndex) => {
      const timingIndex = sectorIndex * microSectorCount + miniSectorIndex
      const value = displayedTimes[timingIndex]

      if (value === null || value === undefined) {
        return 'dim'
      }

      if (
        car.status === 'retired' ||
        car.status === 'disqualified' ||
        car.status === 'dns'
      ) {
        return 'stopped'
      }

      if (
        displayingCurrentLap &&
        !isCurrentLapEligibleForBest(car.timedRunPhase)
      ) {
        return 'yellow'
      }

      const status = classifySectorTime(
        value,
        overallBests[timingIndex],
        personalBests[timingIndex],
      )

      return status === 'overall-best'
        ? 'purple'
        : status === 'personal-best'
          ? 'green'
          : 'yellow'
    }),
  )
}

const openF1MiniSectorState = (
  segment: number | null | undefined,
): MiniSectorState => {
  switch (segment) {
    case 2048:
      return 'yellow'
    case 2049:
      return 'green'
    case 2051:
      return 'purple'
    case 2064:
      return 'pit'
    default:
      return 'dim'
  }
}

const normalizeOpenF1Segments = (
  segments: number[] | null | undefined,
): MiniSectorState[] => {
  const source = segments && segments.length > 0 ? segments : []

  if (source.length === 0) {
    return Array.from({ length: microSectorCount }, () => 'dim' as const)
  }

  const normalized = source.map((segment) => openF1MiniSectorState(segment))

  return normalized.length >= microSectorCount
    ? normalized
    : [
        ...normalized,
        ...Array.from(
          { length: microSectorCount - normalized.length },
          () => 'dim' as const,
        ),
      ]
}

const openF1HasSectorTimes = (lap: OpenF1Lap): lap is OpenF1LapWithSectorTimes =>
  lap.lap_duration !== null &&
  lap.duration_sector_1 !== null &&
  lap.duration_sector_2 !== null &&
  lap.duration_sector_3 !== null

const openF1HasMiniSectors = (lap: OpenF1Lap) =>
  Boolean(
    lap.segments_sector_1?.length ||
      lap.segments_sector_2?.length ||
      lap.segments_sector_3?.length,
  )

const openF1LatestLapsByCode = (
  laps: OpenF1Lap[],
  drivers: OpenF1Bundle['drivers'],
  isUsableLap: (lap: OpenF1Lap) => boolean,
  targetMs = Number.POSITIVE_INFINITY,
): Map<string, OpenF1Lap> => {
  const lapsByCode = new Map<string, OpenF1Lap>()
  const driverCodesByNumber = new Map(
    drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
  )

  for (const lap of laps) {
    const driverCode = driverCodesByNumber.get(lap.driver_number)

    if (
      !driverCode ||
      !isUsableLap(lap) ||
      (lap.date_start && new Date(lap.date_start).getTime() > targetMs)
    ) {
      continue
    }

    const current = lapsByCode.get(driverCode)

    if (!current || lap.lap_number > current.lap_number) {
      lapsByCode.set(driverCode, lap)
    }
  }

  return lapsByCode
}

type OpenF1TimingSource = {
  miniSectorLap?: OpenF1Lap
  miniSectorSource?: 'session' | 'reference'
  sectorLap?: OpenF1Lap
  sectorSource?: 'session' | 'reference'
}

const openF1TimingSourcesByCode = (
  bundle: OpenF1Bundle | null | undefined,
  targetDate?: string | null,
): Map<string, OpenF1TimingSource> => {
  const sourcesByCode = new Map<string, OpenF1TimingSource>()

  if (!bundle) {
    return sourcesByCode
  }
  const parsedTargetMs = targetDate
    ? new Date(targetDate).getTime()
    : Number.POSITIVE_INFINITY
  const targetMs = Number.isFinite(parsedTargetMs)
    ? parsedTargetMs
    : Number.POSITIVE_INFINITY

  const sessionSectorLaps = openF1LatestLapsByCode(
    bundle.laps,
    bundle.drivers,
    openF1HasSectorTimes,
    targetMs,
  )
  const sessionMiniSectorLaps = openF1LatestLapsByCode(
    bundle.laps,
    bundle.drivers,
    openF1HasMiniSectors,
    targetMs,
  )
  const referenceSectorLaps = openF1LatestLapsByCode(
    bundle.miniSectorLaps,
    bundle.miniSectorDrivers,
    openF1HasSectorTimes,
    targetMs,
  )
  const referenceMiniSectorLaps = openF1LatestLapsByCode(
    bundle.miniSectorLaps,
    bundle.miniSectorDrivers,
    openF1HasMiniSectors,
    targetMs,
  )

  for (const [code, sectorLap] of sessionSectorLaps) {
    sourcesByCode.set(code, {
      ...sourcesByCode.get(code),
      sectorLap,
      sectorSource: 'session',
    })
  }

  for (const [code, miniSectorLap] of sessionMiniSectorLaps) {
    sourcesByCode.set(code, {
      ...sourcesByCode.get(code),
      miniSectorLap,
      miniSectorSource: 'session',
    })
  }

  for (const [code, sectorLap] of referenceSectorLaps) {
    if (!sourcesByCode.get(code)?.sectorLap) {
      sourcesByCode.set(code, {
        ...sourcesByCode.get(code),
        sectorLap,
        sectorSource: 'reference',
      })
    }
  }

  for (const [code, miniSectorLap] of referenceMiniSectorLaps) {
    if (!sourcesByCode.get(code)?.miniSectorLap) {
      sourcesByCode.set(code, {
        ...sourcesByCode.get(code),
        miniSectorLap,
        miniSectorSource: 'reference',
      })
    }
  }

  return sourcesByCode
}

const openF1TimingForCar = (
  car: CarSnapshot,
  sourcesByCode: Map<string, OpenF1TimingSource>,
): Omit<
  TimingRow,
  | 'batteryPercent'
  | 'brakePercent'
  | 'car'
  | 'displayGapToLeaderLabel'
  | 'displayIntervalLabel'
  | 'displayPosition'
  | 'driverOverallAbility'
  | 'aeroOvertakeLabel'
  | 'gear'
  | 'performancePaceDeltaSeconds'
  | 'performanceSource'
  | 'rpm'
  | 'sectorStatuses'
  | 'speedKph'
  | 'telemetrySource'
  | 'throttlePercent'
  | 'tireLifePercent'
  | 'tireModelSource'
  | 'tirePaceDeltaSeconds'
  | 'tireTemperatureC'
> | null => {
  const source = sourcesByCode.get(car.code)
  const sectorLap = source?.sectorLap
  const miniSectorLap = source?.miniSectorLap ?? sectorLap

  if (!sectorLap || !openF1HasSectorTimes(sectorLap)) {
    return null
  }

  return {
    lapDataLabel: `OPENF1 ${source?.sectorSource === 'session' ? 'SESSION' : 'REF'} / MINI ${source?.miniSectorSource === 'session' ? 'SESSION' : 'REF'}`,
    lapTimeSeconds: sectorLap.lap_duration,
    microSectors: [
      normalizeOpenF1Segments(miniSectorLap?.segments_sector_1),
      normalizeOpenF1Segments(miniSectorLap?.segments_sector_2),
      normalizeOpenF1Segments(miniSectorLap?.segments_sector_3),
    ],
    microSectorTimes: null,
    microSectorDisplayIsCurrent: false,
    sectorLapNumber: sectorLap.lap_number,
    source: 'openf1',
    sectors: [
      sectorLap.duration_sector_1,
      sectorLap.duration_sector_2,
      sectorLap.duration_sector_3,
    ],
  }
}

const openF1AeroLabel = (drs: number | null | undefined) => {
  if (drs === 10 || drs === 12 || drs === 14) {
    return 'DRS ON'
  }

  if (drs === 8) {
    return 'DRS RDY'
  }

  if (typeof drs === 'number') {
    return 'DRS OFF'
  }

  return '-'
}

const telemetryForCar = (
  car: CarSnapshot,
  openF1CarDataByCode: Map<string, OpenF1CarData>,
) => {
  const openF1Sample = openF1CarDataByCode.get(car.code)
  const hasOpenF1Telemetry =
    openF1Sample !== undefined &&
    openF1Sample.speed > 0 &&
    openF1Sample.rpm > 0
  const telemetrySource: TimingRow['telemetrySource'] = hasOpenF1Telemetry
    ? 'openf1'
    : 'simulation'

  return {
    aeroOvertakeLabel: hasOpenF1Telemetry
      ? openF1AeroLabel(openF1Sample.drs)
      : car.otsRemainingSeconds !== undefined
        ? `OTS ${car.overtakeStatus === 'active' ? 'ON' : car.overtakeStatus === 'available' ? 'RDY' : 'OFF'} ${Math.ceil(car.otsRemainingSeconds)}s`
      : `${car.activeAeroMode === 'straight' ? 'F' : car.activeAeroMode === 'partial-straight' ? 'P' : 'C'}${
          car.overtakeStatus === 'active'
            ? '+OVT'
            : car.overtakeStatus === 'available'
              ? '+RDY'
              : ''
        }`,
    batteryPercent: Math.round(car.ersBatteryPercent),
    brakePercent: hasOpenF1Telemetry ? openF1Sample.brake : Math.round(car.brakePercent),
    gear: hasOpenF1Telemetry ? openF1Sample.n_gear : car.gear,
    rpm: hasOpenF1Telemetry ? openF1Sample.rpm : car.rpm,
    speedKph: hasOpenF1Telemetry ? openF1Sample.speed : car.speedKph,
    telemetrySource,
    throttlePercent: hasOpenF1Telemetry
      ? openF1Sample.throttle
      : Math.round(car.throttlePercent),
    tireTemperatureC: Math.round(car.tireTemperatureC),
  }
}

const intervalLabel = (car: CarSnapshot) => {
  if (car.status === 'retired') {
    return 'OUT'
  }

  if (car.status === 'disqualified') {
    return 'DSQ'
  }

  if (car.status === 'dns') {
    return 'DNS'
  }

  if (car.status === 'pit') {
    return 'PIT'
  }

  if (car.position === 1) {
    return '-'
  }

  return car.gapToAheadLabel
}

const formatOpenF1Date = (isoDate?: string | null) => {
  if (!isoDate) {
    return 'No date'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZoneName: 'short',
  }).format(new Date(isoDate))
}

const openF1LatestSampleDate = (bundle: OpenF1Bundle | null | undefined) => {
  if (!bundle) {
    return null
  }

  const dates = [
    ...bundle.carData.map((sample) => sample.date),
    ...bundle.intervals.map((sample) => sample.date),
    ...bundle.positions.map((sample) => sample.date),
    ...bundle.raceControl.map((sample) => sample.date),
    ...bundle.weather.map((sample) => sample.date),
  ]

  return dates.sort((a, b) => b.localeCompare(a))[0] ?? null
}

const compactDataAge = (isoDate: string | null) => {
  if (!isoDate) {
    return 'No sample'
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 1000))

  if (ageSeconds < 90) {
    return `${ageSeconds}s`
  }

  if (ageSeconds < 3600) {
    return `${Math.round(ageSeconds / 60)}m`
  }

  return `Hist ${Math.round(ageSeconds / 3600)}h`
}

const formatShortDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)

  return remaining === 0
    ? `${minutes}m`
    : `${minutes}:${remaining.toString().padStart(2, '0')}`
}

const openF1CompoundToTire = (compound: string | null | undefined): TireCompound | null => {
  if (!compound) {
    return null
  }

  const normalized = compound.trim().toUpperCase()

  if (normalized.includes('SOFT')) {
    return 'S'
  }

  if (normalized.includes('MEDIUM')) {
    return 'M'
  }

  if (normalized.includes('HARD')) {
    return 'H'
  }

  if (normalized.includes('INTER')) {
    return 'I'
  }

  if (normalized.includes('WET')) {
    return 'W'
  }

  return null
}

const openF1StatusLabel = (bundle: OpenF1Bundle | null | undefined) => {
  if (!bundle?.meeting) {
    return 'Unlinked'
  }

  if (bundle.meeting.is_cancelled || bundle.selectedSession?.is_cancelled) {
    return 'Cancelled'
  }

  if (!bundle.selectedSession) {
    return 'Session unavailable'
  }

  const now = Date.now()
  const startsAt = new Date(bundle.selectedSession.date_start).getTime()
  const endsAt = new Date(bundle.selectedSession.date_end).getTime()

  if (now < startsAt) {
    return 'Scheduled'
  }

  if (now <= endsAt) {
    return 'Live window'
  }

  return 'Historical'
}

const openF1ClockLabel = (date: string) => {
  const clock = date.match(/T(\d{2}:\d{2})/)?.[1]

  return clock ?? '--:--'
}

const simulatedEnvironmentFor = (
  seed: string,
  track: RaceConfig['track'],
  weather: RaceSnapshot['weather'],
) => {
  const { airTemperatureC, trackTemperatureC } =
    simulatedTemperaturesFor(seed, track, weather)
  const windSpeed = 1.4 + hashUnit(`${seed}:wind:${track.id}`) * 5.6
  const windDirection = Math.round(hashUnit(`${seed}:wind-dir:${track.id}`) * 359)
  const humidity = Math.round(simulatedHumidityPercentFor(track, weather))

  return {
    airLabel: `${formatTemperature(airTemperatureC)} S`,
    humidityLabel: `${humidity}% S`,
    pressureLabel: `${Math.round(1002 + hashUnit(`${seed}:pressure:${track.id}`) * 18)} hPa S`,
    source: 'simulation' as const,
    trackLabel: `${formatTemperature(trackTemperatureC)} S`,
    windLabel: `${formatWind(windSpeed, windDirection)} S`,
  }
}

const openF1EnvironmentFor = (
  weather: NonNullable<OpenF1Bundle['summary']['latestWeather']>,
) => ({
  airLabel: `${formatTemperature(weather.air_temperature)} OBS`,
  humidityLabel: `${Math.round(weather.humidity)}% OBS`,
  pressureLabel: `${Math.round(weather.pressure)} hPa OBS`,
  rainLabel: weather.rainfall > 0 ? 'RAIN OBS' : 'DRY OBS',
  source: `OpenF1 observed ${weather.date}` as const,
  trackLabel: `${formatTemperature(weather.track_temperature)} OBS`,
  windLabel: `${formatWind(weather.wind_speed, weather.wind_direction)} OBS`,
})

const openF1GridResultsFor = (
  bundle: OpenF1Bundle | null | undefined,
  drivers: Driver[],
): Array<Pick<QualifyingResult, 'driverId' | 'position'>> => {
  if (!bundle) {
    return []
  }

  // OpenF1 provides actual grid positions (or, if the grid is unavailable,
  // classified result positions). Do not invent qualifying compounds, lap
  // times or in/out laps just to satisfy a richer simulation result shape.
  const source =
    bundle.startingGrid.length > 0
      ? bundle.startingGrid
          .map((entry) => ({
            driverNumber: entry.driver_number,
            position: entry.position,
          }))
          .sort((a, b) => a.position - b.position)
      : bundle.sessionResult
          .map((entry) => ({
            driverNumber: entry.driver_number,
            position: entry.position,
          }))
          .sort((a, b) => a.position - b.position)

  const openF1DriversByNumber = new Map(
    bundle.drivers.map((driver) => [driver.driver_number, driver]),
  )
  const localDriversByCode = new Map(drivers.map((driver) => [driver.code, driver]))

  return source
    .map<Pick<QualifyingResult, 'driverId' | 'position'> | null>((entry) => {
      const openF1Driver = openF1DriversByNumber.get(entry.driverNumber)
      const localDriver = openF1Driver
        ? localDriversByCode.get(openF1Driver.name_acronym)
        : null

      if (!localDriver) {
        return null
      }

      return {
        driverId: localDriver.id,
        position: entry.position,
      }
    })
    .filter(
      (result): result is Pick<QualifyingResult, 'driverId' | 'position'> =>
        result !== null,
    )
}

export default function App() {
  const [applicationMode, setApplicationMode] =
    useState<ApplicationMode>('championship')
  const [activeFreeModeRuntime, setActiveFreeModeRuntime] =
    useState<FreeModeRuntime | null>(null)
  const [freeModeStoredState, setFreeModeStoredState] =
    useState<FreeModeStoredState>(initialFreeModeStoredState)
  const [isFreeModeBuilderOpen, setIsFreeModeBuilderOpen] = useState(false)
  const [championshipReturnSeriesId, setChampionshipReturnSeriesId] =
    useState<SeriesId>(initialSeriesId)
  const [selectedSeriesId, setSelectedSeriesId] =
    useState<SeriesId>(initialSeriesId)
  const registrySeriesPackage = useMemo(
    () => seriesPackageById.get(selectedSeriesId) ?? defaultSeriesPackage,
    [selectedSeriesId],
  )
  const [configuredRules, setConfiguredRules] = useState(
    () => initialSeriesConfiguration.rules,
  )
  const [configuredCalendar, setConfiguredCalendar] = useState(
    () => initialSeriesConfiguration.calendar,
  )
  const seriesPackage = useMemo<SeriesPackage>(() => {
    if (applicationMode === 'free' && activeFreeModeRuntime) {
      const stage = freeModeStageFor(
        activeFreeModeRuntime.configuration.sessionKind,
      )
      const freeRules: SeriesPackage['rules'] = {
        ...activeFreeModeRuntime.rules,
        supportsOpenF1: false,
        weekendStages: [stage],
      }

      return {
        ...registrySeriesPackage,
        calendar: [
          {
            id: 'free-session',
            raceCount: 1,
            round: 1,
            trackId: activeFreeModeRuntime.raceConfig.track.id,
            weekendStages: [stage],
          },
        ],
        carCount: activeFreeModeRuntime.raceConfig.drivers.length,
        drivers: activeFreeModeRuntime.raceConfig.drivers,
        label: `FREE · ${registrySeriesPackage.shortLabel}`,
        rules: freeRules,
        shortLabel: `FREE · ${registrySeriesPackage.shortLabel}`,
        teamCount: activeFreeModeRuntime.raceConfig.teams.length,
        teams: activeFreeModeRuntime.raceConfig.teams,
        tracks: [activeFreeModeRuntime.raceConfig.track],
      }
    }

    return {
      ...registrySeriesPackage,
      calendar: configuredCalendar,
      rules: configuredRules,
    }
  }, [
    activeFreeModeRuntime,
    applicationMode,
    configuredCalendar,
    configuredRules,
    registrySeriesPackage,
  ])
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview')
  const [speed, setSpeed] = useState<SpeedMultiplier>(1)
  const [isPaused, setIsPaused] = useState(false)
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false)
  const [isClassificationOpen, setIsClassificationOpen] = useState(false)
  const [isInsightsOpen, setIsInsightsOpen] = useState(false)
  const [isPitWallOpen, setIsPitWallOpen] = useState(false)
  const [showOpenF1Cars, setShowOpenF1Cars] = useState(true)
  const [requestedDataMode, setRequestedDataMode] = useState<DataMode>('SIM')
  const [openF1AccessToken, setOpenF1AccessToken] = useState<string | null>(null)
  const [openF1TokenDraft, setOpenF1TokenDraft] = useState('')
  const [historicalTimelineRatio, setHistoricalTimelineRatio] = useState(1)
  const [seed, setSeed] = useState(
    () => persistedWeekend?.seed ?? createAutoScenarioSeed(),
  )
  const [selectedTrackId, setSelectedTrackId] = useState(
    persistedWeekend?.trackId ?? initialTrack.id,
  )
  const [selectedEventId, setSelectedEventId] = useState(
    initialCalendarEvent.id,
  )
  const [selectedWeekendStage, setSelectedWeekendStage] =
    useState<WeekendStage>(() => {
      if (!persistedWeekend) {
        return 'race'
      }

      const persistedTrack =
        initialSeriesPackage.tracks.find(
          (candidate) => candidate.id === persistedWeekend.trackId,
        ) ?? initialTrack

      return weekendStagesFor(
        initialSeriesPackage,
        persistedTrack,
        initialCalendarEvent.id,
      ).includes(persistedWeekend.stage)
        ? persistedWeekend.stage
        : 'race'
    })
  const [gridSource, setGridSource] = useState<GridSource>(
    persistedWeekend?.gridSource ?? 'qualifying',
  )
  const [teams, setTeams] = useState<Team[]>(() =>
    copyTeams(initialSeriesConfiguration.teams),
  )
  const [drivers, setDrivers] = useState<Driver[]>(() =>
    copyDrivers(initialSeriesConfiguration.drivers),
  )
  const [configurationMigrationHistory, setConfigurationMigrationHistory] =
    useState<string[]>(() => initialSeriesConfiguration.migrationHistory)
  const [selectedTeamId, setSelectedTeamId] = useState(
    initialSeriesPackage.teams[0].id,
  )
  const [selectedDriverId, setSelectedDriverId] = useState(
    initialSeriesPackage.drivers[0].id,
  )
  const [season, setSeason] = useState<SeasonState>(() =>
    loadPersistedSeason(initialSeriesId),
  )
  const [weekendContext, setWeekendContext] = useState(() =>
    persistedWeekend
      ? persistedWeekend.weekendContext
      : applySeasonGarageToWeekend(
          createWeekendContext(
            initialSeriesConfiguration.drivers,
            initialTrack.isSprintWeekend,
            initialTrack,
            tireAllocationFor(
              initialSeriesPackage,
              initialTrack.isSprintWeekend,
            ),
          ),
          season,
          initialSeriesConfiguration.drivers,
      ),
  )
  const freeModeBuildContext = useMemo<FreeModeBuildContext>(() => {
    const packages = seriesPackages.map((registrySeries) => {
      if (
        applicationMode === 'championship' &&
        registrySeries.id === selectedSeriesId
      ) {
        return {
          ...registrySeries,
          calendar: configuredCalendar,
          drivers,
          rules: configuredRules,
          teams,
        }
      }

      const configuration = loadSeriesConfiguration(registrySeries)
      return {
        ...registrySeries,
        calendar: configuration.calendar,
        drivers: configuration.drivers,
        rules: configuration.rules,
        teams: configuration.teams,
      }
    })

    return {
      ...freeModeContextFor(packages),
      qualifyingResult: freeModeStoredState.qualifyingResult,
    }
  }, [
    applicationMode,
    configuredCalendar,
    configuredRules,
    drivers,
    freeModeStoredState.qualifyingResult,
    selectedSeriesId,
    teams,
  ])

  // Save/load: the local weekend survives reloads until the track changes.
  useEffect(() => {
    if (applicationMode !== 'championship') {
      return
    }

    try {
      window.localStorage.setItem(SERIES_STORAGE_KEY, selectedSeriesId)
    } catch {
      // Category selection remains usable when storage is unavailable.
    }
  }, [applicationMode, selectedSeriesId])

  useEffect(() => {
    if (applicationMode !== 'championship') {
      return
    }

    try {
      window.localStorage.setItem(
        WEEKEND_STORAGE_KEY,
        JSON.stringify({
          version: 3,
          seriesId: selectedSeriesId,
          eventId: selectedEventId,
          trackId: selectedTrackId,
          stage: selectedWeekendStage,
          seed,
          gridSource,
          weekendContext,
        } satisfies PersistedWeekend),
      )
    } catch {
      // Storage may be unavailable (private mode, quota); persistence is optional.
    }
  }, [
    applicationMode,
    gridSource,
    seed,
    selectedSeriesId,
    selectedEventId,
    selectedTrackId,
    selectedWeekendStage,
    weekendContext,
  ])

  useEffect(() => {
    if (applicationMode !== 'championship') {
      return
    }

    try {
      window.localStorage.setItem(
        scopedStorageKey(DRIVER_RATINGS_STORAGE_KEY, selectedSeriesId),
        JSON.stringify(serializeDriverRatings(drivers)),
      )
    } catch {
      // Driver tuning remains usable when browser storage is unavailable.
    }
  }, [applicationMode, drivers, selectedSeriesId])

  useEffect(() => {
    if (applicationMode !== 'championship') {
      return
    }

    try {
      window.localStorage.setItem(
        scopedStorageKey(
          SERIES_CONFIGURATION_STORAGE_KEY,
          selectedSeriesId,
        ),
        JSON.stringify(
          serializeSeriesConfiguration(
            selectedSeriesId,
            teams,
            drivers,
            configurationMigrationHistory,
            configuredRules,
            configuredCalendar,
          ),
        ),
      )
    } catch {
      // The simulator remains usable when browser storage is unavailable.
    }
  }, [
    applicationMode,
    configurationMigrationHistory,
    configuredCalendar,
    configuredRules,
    drivers,
    selectedSeriesId,
    teams,
  ])

  useEffect(() => {
    if (applicationMode !== 'championship') {
      return
    }

    try {
      window.localStorage.setItem(
        scopedStorageKey(SEASON_STORAGE_KEY, selectedSeriesId),
        JSON.stringify({ version: 3, ...season }),
      )
    } catch {
      // Championship persistence is optional when storage is unavailable.
    }
  }, [applicationMode, season, selectedSeriesId])

  useEffect(() => {
    saveFreeModeStoredState(window.localStorage, freeModeStoredState)
  }, [freeModeStoredState])

  const track = useMemo(
    () =>
      seriesPackage.tracks.find(
        (candidate) => candidate.id === selectedTrackId,
      ) ?? seriesPackage.tracks[0],
    [selectedTrackId, seriesPackage.tracks],
  )
  const selectedEvent = useMemo(
    () =>
      seriesPackage.calendar.find((event) => event.id === selectedEventId) ??
      seriesPackage.calendar.find((event) => event.trackId === track.id) ??
      seriesPackage.calendar[0],
    [selectedEventId, seriesPackage.calendar, track.id],
  )
  const activeSeriesRules = useMemo(
    () =>
      selectedEvent.qualifying
        ? { ...seriesPackage.rules, qualifying: selectedEvent.qualifying }
        : seriesPackage.rules,
    [selectedEvent.qualifying, seriesPackage.rules],
  )
  const fiaEventPack = useMemo(
    () => fiaEventPackFor(selectedTrackId),
    [selectedTrackId],
  )
  const openF1State = useOpenF1Data(
    selectedTrackId,
    selectedWeekendStage,
    2026,
    openF1AccessToken,
    applicationMode === 'championship' &&
      seriesPackage.rules.supportsOpenF1,
  )
  const openF1Bundle = openF1State.data
  const openF1Timeline = useMemo(
    () =>
      buildOpenF1TimelineFrame(
        openF1Bundle,
        requestedDataMode === 'HIST' ? historicalTimelineRatio : 1,
      ),
    [historicalTimelineRatio, openF1Bundle, requestedDataMode],
  )
  const openF1TimelineTargetDate = openF1Timeline.targetDate
  const seasonStandings = useOpenF1SeasonStandings(
    2026,
    track.calendar2026?.dateStart ?? track.openF1?.dateStart ?? null,
    applicationMode === 'championship' &&
      seriesPackage.rules.supportsOpenF1,
  )
  const fieldCalibration = useMemo(
    () =>
      calibrateFieldFromOpenF1(
        teams,
        drivers,
        seasonStandings.data ?? openF1Bundle,
        openF1Bundle,
      ),
    [drivers, openF1Bundle, seasonStandings.data, teams],
  )
  const trackCalibration = useMemo(
    () => buildOpenF1TrackCalibration(openF1Bundle),
    [openF1Bundle],
  )
  const calibratedTrack = useMemo(
    () => mergeObservedTrackCalibration(track, trackCalibration),
    [track, trackCalibration],
  )
  const baseConfig: RaceConfig = useMemo(
    () => {
      if (applicationMode === 'free' && activeFreeModeRuntime) {
        return {
          ...activeFreeModeRuntime.raceConfig,
          drivers,
          teams,
          track,
          weekendContext,
          weekendStage: simulationStageFor(selectedWeekendStage),
        }
      }

      return {
        drivers: fieldCalibration.drivers,
        featureRaceMandatoryPitStop:
          selectedEvent.featureRaceMandatoryPitStop ??
          seriesPackage.rules.featureRaceMandatoryPitStop,
        featureRaceTwoDryCompounds:
          seriesPackage.rules.featureRaceTwoDryCompounds,
        overtakeActivation: seriesPackage.rules.overtakeActivation,
        overtakeSystem: seriesPackage.rules.overtakeSystem,
        categoryRaceFormat: seriesPackage.rules.race,
        seed: normalizeSimulationSeed(seed),
        seriesId: selectedSeriesId,
        teams: fieldCalibration.teams,
        tireSupplier: seriesPackage.rules.tireSupplier,
        tireAllocation: tireAllocationFor(
          seriesPackage,
          track.isSprintWeekend,
        ),
        qualifyingDryCompound:
          seriesPackage.rules.tires.qualifyingDryCompound,
        sessionOverallTimeLimitSecondsOverride:
          isRaceDistanceSession(selectedWeekendStage)
            ? (selectedEvent.raceOverallTimeLimitSeconds ?? null)
            : null,
        sessionRaceLapsOverride:
          isFeatureRaceStage(selectedWeekendStage)
            ? (selectedEvent.raceLaps ?? null)
            : null,
        sessionRaceTimeLimitSecondsOverride:
          isFeatureRaceStage(selectedWeekendStage)
            ? (selectedEvent.raceTimeLimitSeconds ?? null)
            : null,
        track: calibratedTrack,
        weekendStage: simulationStageFor(selectedWeekendStage),
        weekendContext,
      }
    },
    [
      activeFreeModeRuntime,
      applicationMode,
      calibratedTrack,
      drivers,
      fieldCalibration,
      seed,
      selectedEvent,
      selectedSeriesId,
      selectedWeekendStage,
      seriesPackage,
      teams,
      track,
      weekendContext,
    ],
  )
  const weekendPracticeStages = useMemo<PracticeSessionName[]>(
    () => {
      const available = weekendStagesFor(
        seriesPackage,
        track,
        selectedEventId,
      ).filter(isPracticeStage)
      const selectedIndex = available.indexOf(
        selectedWeekendStage as PracticeSessionName,
      )

      return selectedIndex >= 0
        ? available.slice(0, selectedIndex + 1)
        : available
    },
    [selectedEventId, selectedWeekendStage, seriesPackage, track],
  )
  const practiceSetup = useMemo(
    () => buildPracticeSetupSummary(baseConfig, weekendPracticeStages),
    [baseConfig, weekendPracticeStages],
  )
  const preparedBaseConfig = useMemo(
    () =>
      isPracticeStage(selectedWeekendStage)
        ? baseConfig
        : applyPracticeSetup(baseConfig, practiceSetup),
    [baseConfig, practiceSetup, selectedWeekendStage],
  )
  const qualifyingBaseConfig = useMemo(() => {
    const referenceTrack = selectedEvent.gridSourceTrackId
      ? seriesPackage.tracks.find(
          (candidate) => candidate.id === selectedEvent.gridSourceTrackId,
        )
      : null

    return referenceTrack
      ? { ...preparedBaseConfig, track: referenceTrack }
      : preparedBaseConfig
  }, [preparedBaseConfig, selectedEvent.gridSourceTrackId, seriesPackage.tracks])
  const standardQualifying = useMemo(
    () => runSeriesQualifying(qualifyingBaseConfig, activeSeriesRules),
    [activeSeriesRules, qualifyingBaseConfig],
  )
  const secondaryQualifying = useMemo(
    () =>
      runSeriesQualifying(
        {
          ...qualifyingBaseConfig,
          seed: `${qualifyingBaseConfig.seed}:qualifying2`,
        },
        activeSeriesRules,
      ),
    [activeSeriesRules, qualifyingBaseConfig],
  )
  const sprintShootout = useMemo(
    () => runSprintShootoutQualifying(preparedBaseConfig),
    [preparedBaseConfig],
  )
  const classificationSegments = useMemo(
    () =>
      selectedWeekendStage === 'sprintQualifying'
        ? sprintShootout.segments.map((segment, index, segments) => ({
            advanceCount:
              index < segments.length - 1
                ? segment.results.length - segment.eliminatedDriverIds.length
                : null,
            durationSeconds: segment.sessionDurationSeconds,
            name: segment.name,
          }))
        : activeSeriesRules.qualifying.segments,
    [
      selectedWeekendStage,
      activeSeriesRules.qualifying.segments,
      sprintShootout.segments,
    ],
  )
  const weekendTirePlan = useMemo(
    () =>
      buildWeekendTirePlan(
        preparedBaseConfig,
        standardQualifying,
        weekendStagesFor(seriesPackage, track, selectedEventId).includes(
          'sprintQualifying',
        )
          ? sprintShootout
          : null,
      ),
    [
      preparedBaseConfig,
      selectedEventId,
      seriesPackage,
      sprintShootout,
      standardQualifying,
      track,
    ],
  )
  const knockoutQualifying = useMemo(
    () =>
      selectedWeekendStage === 'sprintQualifying'
        ? sprintShootout
        : selectedWeekendStage === 'qualifying2'
          ? secondaryQualifying
          : standardQualifying,
    [
      secondaryQualifying,
      selectedWeekendStage,
      sprintShootout,
      standardQualifying,
    ],
  )
  const qualifyingResults = knockoutQualifying.classification
  const practiceResults = useMemo(
    () =>
      isPracticeStage(selectedWeekendStage)
        ? practiceSetup.sessionResults[selectedWeekendStage] ??
          runPracticeSession(baseConfig, selectedWeekendStage)
        : [],
    [baseConfig, practiceSetup.sessionResults, selectedWeekendStage],
  )
  const openF1GridResults = useMemo(
    () => openF1GridResultsFor(openF1State.data, drivers),
    [drivers, openF1State.data],
  )
  const openF1TimingSources = useMemo(
    () =>
      openF1TimingSourcesByCode(
        openF1State.data,
        openF1TimelineTargetDate,
      ),
    [openF1State.data, openF1TimelineTargetDate],
  )
  const openF1TelemetryFrame = useMemo(
    () =>
      buildSynchronizedCarData(
        openF1State.data,
        5_000,
        openF1TimelineTargetDate,
      ),
    [openF1State.data, openF1TimelineTargetDate],
  )
  const openF1CarDataByCode = openF1TelemetryFrame.byCode
  const openF1StartingTiresByCode = useMemo(() => {
    const bundle = openF1State.data
    const tiresByCode = new Map<string, TireCompound>()

    if (!bundle) {
      return tiresByCode
    }

    const codesByNumber = new Map(
      bundle.drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
    )

    for (const stint of bundle.stints
      .slice()
      .sort(
        (a, b) =>
          a.stint_number - b.stint_number ||
          a.lap_start - b.lap_start ||
          a.driver_number - b.driver_number,
      )) {
      const code = codesByNumber.get(stint.driver_number)
      const tire = openF1CompoundToTire(stint.compound)

      if (code && tire && !tiresByCode.has(code)) {
        tiresByCode.set(code, tire)
      }
    }

    return tiresByCode
  }, [openF1State.data])
  const openF1LiveState = useMemo(
    () =>
      buildOpenF1LiveRaceState(
        openF1State.data,
        selectedWeekendStage,
        openF1TimelineTargetDate,
      ),
    [openF1State.data, openF1TimelineTargetDate, selectedWeekendStage],
  )
  const openF1TrackProgress = useMemo(
    () =>
      buildOpenF1TrackProgress(
        openF1State.data,
        track,
        requestedDataMode === 'HIST' ? openF1Timeline.targetMs : null,
      ),
    [openF1State.data, openF1Timeline.targetMs, requestedDataMode, track],
  )
  const openF1TrackProgressMode = classifyObservedDataMode(
    openF1TrackProgress.latestSampleDate,
  )
  const openF1TrackProgressAvailable = openF1TrackProgress.cars.length > 0
  const weekendStages = useMemo(
    () => weekendStagesFor(seriesPackage, track, selectedEventId),
    [selectedEventId, seriesPackage, track],
  )
  const stageGridResults =
    selectedWeekendStage === 'sprint'
      ? seriesPackage.rules.sprintGridReverseCount > 0
        ? reversedSprintGrid(
            standardQualifying.classification,
            seriesPackage.rules.sprintGridReverseCount,
          )
        : sprintShootout.classification
      : selectedWeekendStage === 'race2'
        ? secondaryQualifying.classification
        : standardQualifying.classification
  const tirePlansByDriver = useMemo(
    () =>
      new Map(
        weekendTirePlan.driverPlans.map((plan) => [plan.driverId, plan]),
      ),
    [weekendTirePlan],
  )
  const raceDrivers = useMemo(
    () => {
      const persistedGrid =
        isRaceDistanceSession(selectedWeekendStage)
          ? applyWeekendGrid(
              preparedBaseConfig.drivers,
              weekendContext,
              selectedWeekendStage,
            )
          : null
      const fallbackGrid =
        gridSource === 'openf1' && openF1GridResults.length > 0
          ? applyQualifyingGrid(preparedBaseConfig.drivers, openF1GridResults)
          : gridSource === 'qualifying'
            ? applyQualifyingGrid(preparedBaseConfig.drivers, stageGridResults)
            : preparedBaseConfig.drivers
      const ordered =
        persistedGrid ??
        (isRaceDistanceSession(selectedWeekendStage)
          ? applyGridPenalties(
              fallbackGrid,
              weekendContext,
              selectedWeekendStage,
            )
          : fallbackGrid)

      return ordered.map((driver) => {
        const plan = tirePlansByDriver.get(driver.id)
        const openF1StartingTire =
          gridSource === 'openf1' &&
          isRaceDistanceSession(selectedWeekendStage)
            ? openF1StartingTiresByCode.get(driver.code)
            : null

        if (openF1StartingTire) {
          return { ...driver, tire: openF1StartingTire }
        }

        if (!plan) {
          return driver
        }

        if (isFeatureRaceStage(selectedWeekendStage)) {
          return { ...driver, tire: plan.raceStartCompound }
        }

        if (selectedWeekendStage === 'sprint') {
          return { ...driver, tire: plan.sprintStartCompound }
        }

        return driver
      })
    },
    [
      gridSource,
      openF1GridResults,
      openF1StartingTiresByCode,
      preparedBaseConfig.drivers,
      selectedWeekendStage,
      stageGridResults,
      tirePlansByDriver,
      weekendContext,
    ],
  )
  const raceConfig: RaceConfig = useMemo(
    () => {
      const timedSessionPlan =
        isStandardQualifyingStage(selectedWeekendStage)
          ? buildTimedSessionPlan(
              selectedWeekendStage === 'qualifying2'
                ? secondaryQualifying
                : standardQualifying,
              activeSeriesRules.qualifying.breakSeconds,
              activeSeriesRules.qualifying.format,
            )
          : selectedWeekendStage === 'sprintQualifying'
            ? buildTimedSessionPlan(sprintShootout)
            : undefined

      return {
        ...preparedBaseConfig,
        drivers: raceDrivers,
        sessionDurationSeconds: isPracticeStage(selectedWeekendStage)
          ? applicationMode === 'free'
            ? preparedBaseConfig.sessionDurationSeconds
            : seriesPackage.rules.freePracticeDurationSeconds
          : null,
        timedSessionPlan,
      }
    },
    [
      preparedBaseConfig,
      raceDrivers,
      applicationMode,
      selectedWeekendStage,
      activeSeriesRules.qualifying.breakSeconds,
      activeSeriesRules.qualifying.format,
      seriesPackage.rules.freePracticeDurationSeconds,
      secondaryQualifying,
      sprintShootout,
      standardQualifying,
    ],
  )
  const raceSessionKey = useMemo(
    () =>
      JSON.stringify([
        applicationMode,
        normalizeSimulationSeed(seed),
        selectedSeriesId,
        selectedEventId,
        selectedTrackId,
        selectedWeekendStage,
        gridSource,
        applicationMode === 'free'
          ? activeFreeModeRuntime?.configuration
          : null,
      ]),
    [
      activeFreeModeRuntime?.configuration,
      applicationMode,
      gridSource,
      seed,
      selectedEventId,
      selectedSeriesId,
      selectedTrackId,
      selectedWeekendStage,
    ],
  )
  const {
    checkpointRecovered,
    checkpointSaveStatus,
    engineError,
    engineMode,
    snapshot,
    requestPitStop,
    setDriverPaceMode,
    skipFormationLap,
    snapshotIsCurrent,
  } = useRaceSimulation({
    checkpointStorageKey:
      applicationMode === 'free'
        ? FREE_MODE_RACE_CHECKPOINT_STORAGE_KEY
        : undefined,
    config: raceConfig,
    isPaused,
    resetKey: raceSessionKey,
    speed,
  })
  const orderedCars = snapshot.cars

  useEffect(() => {
    if (
      snapshotIsCurrent &&
      snapshot.sessionStatus === 'finished' &&
      (isRaceDistanceSession(selectedWeekendStage) ||
        isQualifyingStage(selectedWeekendStage))
    ) {
      setIsClassificationOpen(true)
    }
  }, [selectedWeekendStage, snapshot.sessionStatus, snapshotIsCurrent])

  useEffect(() => {
    setIsClassificationOpen(false)
    setIsInsightsOpen(false)
    setHistoricalTimelineRatio(1)
  }, [selectedEventId, selectedTrackId, selectedWeekendStage])

  // A finished race-distance session counts as weekend progress.
  useEffect(() => {
    if (
      applicationMode !== 'championship' ||
      !snapshotIsCurrent ||
      snapshot.sessionStatus !== 'finished' ||
      !isRaceDistanceSession(selectedWeekendStage)
    ) {
      return
    }

    setWeekendContext((current) =>
      completeRaceSession(current, selectedWeekendStage, snapshot.cars),
    )
    setSeason((current) =>
      recordSeasonRound(current, {
        cars: snapshot.cars,
        drivers,
        greenFlagLaps: snapshot.greenFlagLaps,
        roundId: seasonSessionId(selectedEventId, selectedWeekendStage),
        scheduledLaps: snapshot.raceLaps,
        stage: selectedWeekendStage,
        pointsTable:
          selectedWeekendStage === 'sprint'
            ? seriesPackage.rules.points.sprint
            : (selectedEvent.featurePoints ??
              seriesPackage.rules.points.feature),
        reducedPointsTables: seriesPackage.rules.points.reduced
          ? selectedWeekendStage === 'sprint'
            ? seriesPackage.rules.points.reduced.sprint
            : seriesPackage.rules.points.reduced.feature
          : null,
        fastestLapRule: seriesPackage.rules.points.fastestLap,
        teamScoring: seriesPackage.rules.championshipTeamScoring,
        teams,
      }),
    )
  }, [
    applicationMode,
    selectedEvent.featurePoints,
    selectedEventId,
    selectedWeekendStage,
    snapshot.cars,
    snapshot.greenFlagLaps,
    snapshot.raceLaps,
    snapshot.sessionStatus,
    snapshotIsCurrent,
    drivers,
    seriesPackage.rules.championshipTeamScoring,
    seriesPackage.rules.points.fastestLap,
    seriesPackage.rules.points.feature,
    seriesPackage.rules.points.reduced,
    seriesPackage.rules.points.sprint,
    teams,
  ])

  useEffect(() => {
    if (
      !snapshotIsCurrent ||
      snapshot.sessionStatus !== 'finished' ||
      !isQualifyingStage(selectedWeekendStage)
    ) {
      return
    }

    const knockout =
      selectedWeekendStage === 'sprintQualifying'
        ? sprintShootout
        : selectedWeekendStage === 'qualifying2'
          ? secondaryQualifying
          : standardQualifying
    const completedClassification = completedQualifyingClassification(
      knockout.classification,
      snapshot.cars,
      true,
    )

    setWeekendContext((current) =>
      completeQualifyingSession(
        current,
        selectedWeekendStage,
        knockout.classification,
        knockout.segments,
        snapshot.cars,
        true,
      ),
    )
    if (applicationMode === 'free' && activeFreeModeRuntime) {
      setFreeModeStoredState((current) => ({
        ...current,
        configuration: activeFreeModeRuntime.configuration,
        qualifyingResult: {
          categoryId: activeFreeModeRuntime.configuration.categoryId,
          completedAt: new Date().toISOString(),
          orderedDriverIds: completedClassification.map(
            (result) => result.driverId,
          ),
          seed: activeFreeModeRuntime.configuration.seed,
          trackId: activeFreeModeRuntime.configuration.trackId,
          version: 1,
        },
      }))
      return
    }

    if (isStandardQualifyingStage(selectedWeekendStage)) {
      setSeason((current) =>
        recordQualifyingPoints(current, {
          classification: completedClassification,
          pointsTable: seriesPackage.rules.points.qualifying,
          roundId: `${selectedEventId}:${selectedWeekendStage}`,
          teamScoring: seriesPackage.rules.championshipTeamScoring,
        }),
      )
    }
  }, [
    activeFreeModeRuntime,
    applicationMode,
    selectedWeekendStage,
    snapshot.cars,
    snapshot.sessionStatus,
    snapshotIsCurrent,
    selectedEventId,
    seriesPackage.rules.championshipTeamScoring,
    seriesPackage.rules.points.qualifying,
    secondaryQualifying,
    sprintShootout,
    standardQualifying,
  ])

  // Once a knockout qualifying session finishes, roll straight into the feature
  // race it just set the grid for. The effect above has already locked the
  // qualifying result into the weekend context, so the race opens on that grid.
  // Only advance when the very next stage is the feature race (race/race2); a
  // weekend that runs a sprint between qualifying and the feature is left for
  // the manual advance so the sprint is never skipped.
  useEffect(() => {
    if (
      applicationMode !== 'championship' ||
      !snapshotIsCurrent ||
      snapshot.sessionStatus !== 'finished' ||
      !isStandardQualifyingStage(selectedWeekendStage)
    ) {
      return
    }

    const stageIndex = weekendStages.indexOf(selectedWeekendStage)
    const nextStage = stageIndex >= 0 ? weekendStages[stageIndex + 1] : undefined

    if (!nextStage || !isFeatureRaceStage(nextStage)) {
      return
    }

    setSeed(createAutoScenarioSeed())
    setSelectedWeekendStage(nextStage)
  }, [
    applicationMode,
    selectedWeekendStage,
    snapshot.sessionStatus,
    snapshotIsCurrent,
    weekendStages,
  ])

  const weatherTrackState = useMemo(
    () =>
      weatherTrackStateFor(
        raceConfig.seed,
        raceConfig.track,
        snapshot.elapsedSeconds,
      ),
    [raceConfig.seed, raceConfig.track, snapshot.elapsedSeconds],
  )
  const latestOpenF1Weather =
    openF1Timeline.weather ?? openF1Bundle?.summary.latestWeather ?? null
  const latestOpenF1Sample = useMemo(
    () => openF1LatestSampleDate(openF1Bundle),
    [openF1Bundle],
  )
  const openF1DataAge = compactDataAge(latestOpenF1Sample)
  const detectedDataMode = classifyObservedDataMode(latestOpenF1Sample)
  const dataMode =
    applicationMode === 'free'
      ? ('SIM' as const)
      : resolveRequestedDataMode({
          detectedMode: detectedDataMode,
          hasHistoricalData: latestOpenF1Sample !== null,
          requestedMode: requestedDataMode,
        })
  const observedTimelineActive =
    dataModeUsesObservedTiming(dataMode) &&
    openF1Timeline.targetMs > 0 &&
    Boolean(openF1Bundle?.selectedSession)
  const observedLeaderLap = useMemo(() => {
    if (!observedTimelineActive || !openF1Bundle) {
      return null
    }

    const eligibleLaps = openF1Bundle.laps.filter((lap) => {
      if (!lap.date_start) return true
      const startedAt = new Date(lap.date_start).getTime()
      return Number.isFinite(startedAt) && startedAt <= openF1Timeline.targetMs
    })

    return eligibleLaps.length > 0
      ? Math.max(...eligibleLaps.map((lap) => lap.lap_number))
      : null
  }, [observedTimelineActive, openF1Bundle, openF1Timeline.targetMs])
  const observedElapsedSeconds = useMemo(() => {
    const sessionStart = openF1Bundle?.selectedSession?.date_start

    if (!observedTimelineActive || !sessionStart) {
      return null
    }

    const startMs = new Date(sessionStart).getTime()
    return Number.isFinite(startMs)
      ? Math.max(0, (openF1Timeline.targetMs - startMs) / 1_000)
      : null
  }, [observedTimelineActive, openF1Bundle?.selectedSession?.date_start, openF1Timeline.targetMs])
  const observedMapActive =
    observedTimelineActive && showOpenF1Cars && openF1TrackProgressAvailable
  const broadcastSnapshot = useMemo<RaceSnapshot>(() => {
    if (!observedTimelineActive) {
      return snapshot
    }

    return {
      ...snapshot,
      elapsedSeconds: observedElapsedSeconds ?? snapshot.elapsedSeconds,
      eventMessage:
        openF1LiveState.raceControlMessage ?? snapshot.eventMessage,
      flag: openF1LiveState.flag ?? snapshot.flag,
      flagLabel: openF1LiveState.flagLabel ?? snapshot.flagLabel,
      leaderLap: observedLeaderLap ?? snapshot.leaderLap,
      sectorFlags: openF1LiveState.sectorFlags ?? snapshot.sectorFlags,
      weekend: openF1LiveState.weekend ?? snapshot.weekend,
    }
  }, [
    observedElapsedSeconds,
    observedLeaderLap,
    observedTimelineActive,
    openF1LiveState.flag,
    openF1LiveState.flagLabel,
    openF1LiveState.raceControlMessage,
    openF1LiveState.sectorFlags,
    openF1LiveState.weekend,
    snapshot,
  ])
  useEffect(() => {
    if (observedTimelineActive && cameraMode !== 'overview') {
      setCameraMode('overview')
    }
  }, [cameraMode, observedTimelineActive])
  const environmentReadout = useMemo(
    () =>
      dataModeUsesObservedEnvironment(dataMode) && latestOpenF1Weather
        ? openF1EnvironmentFor(latestOpenF1Weather)
        : {
            ...simulatedEnvironmentFor(
              raceConfig.seed,
              raceConfig.track,
              snapshot.weather,
            ),
            rainLabel: `${weatherTrackState.rainLabel} S`,
          },
    [
      dataMode,
      latestOpenF1Weather,
      raceConfig.seed,
      raceConfig.track,
      snapshot.weather,
      weatherTrackState.rainLabel,
    ],
  )
  const isRaceProgressSession = isRaceDistanceSession(selectedWeekendStage)
  const isQualifyingSession = isQualifyingStage(selectedWeekendStage)
  const selectedSessionDurationSeconds =
    raceConfig.timedSessionPlan?.totalDurationSeconds ??
    raceConfig.sessionDurationSeconds ??
    sessionDurationSecondsFor(selectedWeekendStage)
  const configuredRaceDistanceKm =
    selectedWeekendStage === 'sprint'
      ? (seriesPackage.rules.race.sprintDistanceOverridesKm[track.id] ??
        seriesPackage.rules.race.sprintDistanceKm)
      : (seriesPackage.rules.race.featureDistanceOverridesKm[track.id] ??
        seriesPackage.rules.race.featureDistanceKm)
  const configuredRaceTimeLimitSeconds =
    isFeatureRaceStage(selectedWeekendStage) &&
    selectedEvent.raceTimeLimitSeconds !== undefined
      ? selectedEvent.raceTimeLimitSeconds
      : selectedWeekendStage === 'sprint'
      ? seriesPackage.rules.race.sprintTimeLimitSeconds
      : seriesPackage.rules.race.featureTimeLimitSeconds
  const categoryRaceFormatLabel = [
    configuredRaceDistanceKm === null
      ? null
      : `${configuredRaceDistanceKm} km+`,
    `${snapshot.raceLaps} laps`,
    configuredRaceTimeLimitSeconds === null
      ? null
      : `${Math.round(configuredRaceTimeLimitSeconds / 60)}m max`,
  ]
    .filter((value): value is string => value !== null)
    .join(' / ')
  const categorySessionFormatLabel = isPracticeStage(selectedWeekendStage)
    ? `${Math.round(seriesPackage.rules.freePracticeDurationSeconds / 60)}m practice`
    : isStandardQualifyingStage(selectedWeekendStage)
      ? activeSeriesRules.qualifying.segments
          .map(
            (segment, index) =>
              activeSeriesRules.qualifying.format === 'grouped' && index === 0
                ? `${segment.name} A/B ${Math.round(segment.durationSeconds / 120)}m each`
                : `${segment.name} ${Math.round(segment.durationSeconds / 60)}m`,
          )
          .join(' / ')
      : isRaceProgressSession
        ? categoryRaceFormatLabel
        : compactSessionDurationLabel(selectedWeekendStage)
  const activeTimedSegment = raceConfig.timedSessionPlan?.segments.find(
    (segment) =>
      snapshot.elapsedSeconds >= segment.startsAtSeconds &&
      snapshot.elapsedSeconds < segment.endsAtSeconds,
  )
  const nextTimedSegment = raceConfig.timedSessionPlan?.segments.find(
    (segment) => segment.startsAtSeconds > snapshot.elapsedSeconds,
  )
  const timedSegmentRemainingSeconds = activeTimedSegment
    ? (() => {
        const suspendedDuration =
          activeTimedSegment.suspensionStartsAtSeconds !== null &&
          activeTimedSegment.suspensionEndsAtSeconds !== null
            ? activeTimedSegment.suspensionEndsAtSeconds -
              activeTimedSegment.suspensionStartsAtSeconds
            : 0
        const officialDuration =
          activeTimedSegment.endsAtSeconds -
          activeTimedSegment.startsAtSeconds -
          suspendedDuration
        const effectiveElapsed =
          activeTimedSegment.suspensionStartsAtSeconds !== null &&
          activeTimedSegment.suspensionEndsAtSeconds !== null
            ? snapshot.elapsedSeconds <
              activeTimedSegment.suspensionStartsAtSeconds
              ? snapshot.elapsedSeconds - activeTimedSegment.startsAtSeconds
              : snapshot.elapsedSeconds <
                  activeTimedSegment.suspensionEndsAtSeconds
                ? activeTimedSegment.suspensionStartsAtSeconds -
                  activeTimedSegment.startsAtSeconds
                : snapshot.elapsedSeconds -
                  activeTimedSegment.startsAtSeconds -
                  suspendedDuration
            : snapshot.elapsedSeconds - activeTimedSegment.startsAtSeconds

        return Math.max(0, officialDuration - effectiveElapsed)
      })()
    : null
  const timedPhaseLabel =
    snapshot.sessionStatus === 'finished'
      ? isRaceProgressSession
        ? 'CHECKERED'
        : 'SESSION END'
      : isRaceProgressSession
        ? snapshot.checkeredLapTarget
          ? `FLAG L${snapshot.checkeredLapTarget}`
          : 'DISTANCE'
        : snapshot.timedSessionSuspended
          ? `${snapshot.timedSegmentLabel ?? 'SESSION'} RED`
          : activeTimedSegment && timedSegmentRemainingSeconds !== null
            ? `${activeTimedSegment.displayLabel ?? activeTimedSegment.name} ${formatShortDuration(timedSegmentRemainingSeconds)}`
            : nextTimedSegment
              ? `INTERVAL ${formatShortDuration(
                  Math.max(
                    0,
                    nextTimedSegment.startsAtSeconds - snapshot.elapsedSeconds,
                  ),
                )}`
              : `${weekendStageLabels[selectedWeekendStage]} RUN`
  const sessionProgressLabel =
    isRaceProgressSession || selectedSessionDurationSeconds === null
      ? `${snapshot.leaderLap} / ${snapshot.raceLaps}`
      : `${snapshot.elapsedLabel} / ${formatShortDuration(selectedSessionDurationSeconds)}`
  const broadcastSessionProgressLabel =
    observedTimelineActive && observedLeaderLap !== null && isRaceProgressSession
      ? `${observedLeaderLap} / ${snapshot.raceLaps}`
      : sessionProgressLabel
  const raceControlLog = useMemo(() => {
    const openF1Entries = (openF1Bundle?.raceControl ?? [])
      .filter(
        (event) =>
          openF1Timeline.targetMs <= 0 ||
          new Date(event.date).getTime() <= openF1Timeline.targetMs,
      )
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map((event) => ({
        id: `openf1-${event.date}-${event.message}`,
        message: event.message,
        source: 'OPENF1',
        timeLabel: openF1ClockLabel(event.date),
      }))

    if (openF1Entries.length > 0) {
      return openF1Entries
    }

    return snapshot.events
      .slice()
      .slice(0, 30)
      .map((event) => ({
        id: event.id,
        message: event.message,
        source: 'SIM',
        timeLabel: event.timeLabel,
      }))
  }, [openF1Bundle, openF1Timeline.targetMs, snapshot.events])

  const selectedCar = useMemo(
    () =>
      orderedCars.find((car) => car.driverId === selectedDriverId) ??
      orderedCars[0],
    [orderedCars, selectedDriverId],
  )
  const selectedDriver = useMemo(
    () =>
      raceConfig.drivers.find((driver) => driver.id === selectedCar.driverId) ??
      raceConfig.drivers[0],
    [raceConfig.drivers, selectedCar.driverId],
  )
  const timingCars = useMemo(() => {
    if (
      !dataModeUsesObservedTiming(dataMode) ||
      openF1LiveState.positionsByCode.size === 0
    ) {
      return orderedCars
    }

    return orderedCars
      .slice()
      .sort((a, b) => {
        const positionA = openF1LiveState.positionsByCode.get(a.code) ?? a.position
        const positionB = openF1LiveState.positionsByCode.get(b.code) ?? b.position

        return positionA - positionB
      })
  }, [dataMode, openF1LiveState.positionsByCode, orderedCars])
  const timingRows = useMemo<TimingRow[]>(() => {
    const averageSurfaceWaterMm =
      snapshot.surfaceWaterMmBySector.reduce((sum, value) => sum + value, 0) /
      snapshot.surfaceWaterMmBySector.length
    const averageDryingLine =
      snapshot.dryingLineBySector.reduce((sum, value) => sum + value, 0) /
      snapshot.dryingLineBySector.length
    const rainIntensityMmH = weatherTrackStateFor(
      raceConfig.seed,
      raceConfig.track,
      snapshot.elapsedSeconds,
    ).rainIntensityMmH
    const rows: TimingRowWithoutSectorStatuses[] = timingCars.map(
      (car) => {
        const useObservedTiming = dataModeUsesObservedTiming(dataMode)
        const openF1Timing = useObservedTiming
          ? openF1TimingForCar(car, openF1TimingSources)
          : null
        const openF1LiveTiming = openF1LiveState.timingByCode.get(car.code)
        const telemetry = telemetryForCar(
          car,
          useObservedTiming
            ? openF1CarDataByCode
            : emptyOpenF1CarDataByCode,
        )
        const displayPosition =
          useObservedTiming
            ? (openF1LiveState.positionsByCode.get(car.code) ?? car.position)
            : (car.liveDisplayPosition ?? car.position)
        const displayGapToLeaderLabel =
          useObservedTiming
            ? (openF1LiveTiming?.gapToLeaderLabel ?? car.gapToLeaderLabel)
            : car.gapToLeaderLabel
        const displayIntervalLabel =
          useObservedTiming
            ? (openF1LiveTiming?.intervalLabel ?? intervalLabel(car))
            : intervalLabel(car)
        const latestCompletedLap = latestTimingLapForSegment(
          car.lapHistory,
          activeTimedSegment?.name ?? null,
        )
        const tireSampleCount =
          raceConfig.track.observedCalibration?.tireSampleCountByCompound[
            car.tire
          ] ?? 0
        const driver = raceConfig.drivers.find(
          (candidate) => candidate.id === car.driverId,
        )
        const tireManagement = driver
          ? driverAbilityValue(driver, 'tireManagement')
          : 0.8
        const tireModel = {
          driverOverallAbility: driver
            ? driverConfiguredOverallAbilityPoints(driver)
            : 0,
          performancePaceDeltaSeconds:
            fieldCalibration.teamPaceDeltaSeconds[car.teamId] ?? null,
          performanceSource: fieldCalibration.source,
          tireModelSource:
            selectedSeriesId === 'f1-custom' && tireSampleCount >= 4
              ? ('openf1-calibrated' as const)
              : selectedSeriesId === 'f1-custom' &&
                  isDryCompound(car.tire) &&
                  raceConfig.track.tireNomination?.source === 'pirelli'
                ? ('pirelli' as const)
                : ('simulation' as const),
          tirePaceDeltaSeconds: tireDeltaSeconds(
            car.tire,
            car.tireAgeLaps,
            tireManagement,
            snapshot.weather,
            snapshot.trackGrip,
            car.tireTemperatureC,
            car.tireWearPercent,
            raceConfig.track.tireNomination,
            {
              degradationPerLapSeconds:
                raceConfig.track.observedCalibration
                  ?.tireDegradationByCompound[car.tire],
              paceOffsetSeconds:
                raceConfig.track.observedCalibration
                  ?.tirePaceOffsetByCompound[car.tire],
              sampleCount: tireSampleCount,
            },
            car.tireThermalStressPercent ?? 0,
            {
              dryingLine: averageDryingLine,
              rainIntensityMmH,
              surfaceWaterMm: averageSurfaceWaterMm,
            },
            {
              carcassTemperatureC: car.tireCarcassTemperatureC,
              grainingPercent: car.tireGrainingPercent,
              overheatingPercent: car.tireOverheatingPercent,
            },
          ),
          tireLifePercent: tireConditionFor(
            car.tire,
            car.tireAgeLaps,
            tireManagement,
            car.tireTemperatureC,
            car.tireWearPercent,
            raceConfig.track.tireNomination,
            car.tireThermalStressPercent ?? 0,
          ).lifeRemainingPercent,
        }
        const hasCurrentLapSector = car.currentLapSectorTimes.some(
          (sectorTime) => sectorTime !== null,
        )
        const hasCurrentLapMiniSector = car.currentLapMiniSectorTimes.some(
          (sectorTime) => sectorTime !== null,
        )
        const hasCurrentLapTiming =
          hasCurrentLapSector || hasCurrentLapMiniSector
        const measuredSectors = hasCurrentLapTiming
          ? ([...car.currentLapSectorTimes] as [
              number | null,
              number | null,
              number | null,
            ])
          : latestCompletedLap
            ? ([...latestCompletedLap.sectors] as [number, number, number])
            : ([null, null, null] as [null, null, null])
        const measuredMiniSectors = hasCurrentLapTiming
          ? [...car.currentLapMiniSectorTimes]
          : latestCompletedLap?.miniSectors
            ? [...latestCompletedLap.miniSectors]
            : Array.from({ length: totalMicroSectorCount }, () => null)
        const sectorLapNumber = hasCurrentLapTiming
          ? (latestCompletedLap?.lap ?? 0) + 1
          : latestCompletedLap?.lap ?? null

        if (openF1Timing) {
          return {
            car,
            displayGapToLeaderLabel,
            displayIntervalLabel,
            displayPosition,
            ...openF1Timing,
            ...telemetry,
            ...tireModel,
          }
        }

        return {
          car,
          displayGapToLeaderLabel,
          displayIntervalLabel,
          displayPosition,
          ...telemetry,
          ...tireModel,
          lapTimeSeconds: latestCompletedLap?.lapTimeSeconds ?? null,
          lapDataLabel: latestCompletedLap
            ? `SIM MEASURED / LAP ${sectorLapNumber}`
            : 'SIM AWAITING TIMING LINE',
          microSectors: Array.from({ length: 3 }, () =>
            Array.from({ length: microSectorCount }, () => 'dim' as const),
          ),
          microSectorTimes: measuredMiniSectors,
          microSectorDisplayIsCurrent: hasCurrentLapTiming,
          sectorLapNumber,
          source: 'simulation',
          sectors: measuredSectors,
        }
      },
    )
    const personalBestsByDriver = new Map(
      rows.map((row) => [
        row.car.driverId,
        personalTimingBestsForRow(row, activeTimedSegment?.name ?? null),
      ]),
    )
    const overallComparisonSource = rows.some(
      (row) => row.source === 'openf1',
    )
      ? 'openf1'
      : 'simulation'
    const comparisonRows = rows.filter(
      (row) => row.source === overallComparisonSource,
    )
    const overallSectorBests = [0, 1, 2].map((sectorIndex) =>
      bestSectorTime(
        comparisonRows.map(
          (row) =>
            personalBestsByDriver.get(row.car.driverId)!.sectors[sectorIndex],
        ),
      ),
    )
    const overallMiniSectorBests = Array.from(
      { length: totalMicroSectorCount },
      (_, miniSectorIndex) =>
        bestSectorTime(
          comparisonRows.map(
            (row) =>
              personalBestsByDriver.get(row.car.driverId)!.miniSectors[
                miniSectorIndex
              ],
          ),
        ),
    )
    const noOverallMiniSectorBests = Array.from(
      { length: totalMicroSectorCount },
      () => null,
    )

    return rows.map((row) => {
      const personalBests = personalBestsByDriver.get(row.car.driverId)!
      const rowUsesOverallComparison =
        row.source === overallComparisonSource

      return {
        ...row,
        microSectors:
          row.source === 'simulation' && row.microSectorTimes
            ? measuredMiniSectorStates(
                row.car,
                row.microSectorTimes,
                rowUsesOverallComparison
                  ? overallMiniSectorBests
                  : noOverallMiniSectorBests,
                personalBests.miniSectors,
                row.microSectorDisplayIsCurrent,
              )
            : row.microSectors,
        sectorStatuses: row.sectors.map((sectorTime, sectorIndex) =>
          row.source === 'simulation' &&
          row.microSectorDisplayIsCurrent &&
          !isCurrentLapEligibleForBest(row.car.timedRunPhase) &&
          sectorTime !== null
            ? 'slower'
            : classifySectorTime(
                sectorTime,
                rowUsesOverallComparison
                  ? overallSectorBests[sectorIndex]
                  : null,
                personalBests.sectors[sectorIndex],
              ),
        ) as [SectorTimingStatus, SectorTimingStatus, SectorTimingStatus],
      }
    })
    .sort((left, right) => left.displayPosition - right.displayPosition)
  },
    [
      openF1CarDataByCode,
      activeTimedSegment?.name,
      dataMode,
      openF1LiveState.positionsByCode,
      openF1LiveState.timingByCode,
      openF1TimingSources,
      fieldCalibration,
      raceConfig,
      selectedSeriesId,
      snapshot.dryingLineBySector,
      snapshot.elapsedSeconds,
      snapshot.surfaceWaterMmBySector,
      snapshot.trackGrip,
      snapshot.weather,
      timingCars,
    ],
  )
  const openF1LoadedEndpoints =
    openF1Bundle?.endpointStatuses.filter((status) => status.count > 0).length ?? 0
  const openF1RequestedEndpoints = openF1Bundle?.endpointStatuses.length ?? 0
  const openF1GridStatus =
    openF1State.status === 'loading'
      ? 'Loading OpenF1 data...'
      : openF1GridResults.length > 0
        ? `OpenF1 ${openF1Bundle?.startingGrid.length ? 'starting grid' : 'result order'} ready`
        : 'No OpenF1 order yet'
  const activateChampionshipSeries = (seriesId: SeriesId) => {
    const nextRegistrySeries =
      seriesPackageById.get(seriesId) ?? defaultSeriesPackage
    const nextConfiguration = loadSeriesConfiguration(nextRegistrySeries)
    const nextSeries: SeriesPackage = {
      ...nextRegistrySeries,
      calendar: nextConfiguration.calendar,
      drivers: nextConfiguration.drivers,
      rules: nextConfiguration.rules,
      teams: nextConfiguration.teams,
    }
    const savedWeekend = loadPersistedWeekend(nextSeries)
    const nextEvent =
      nextSeries.calendar.find((event) => event.id === savedWeekend?.eventId) ??
      nextSeries.calendar.find(
        (event) => event.trackId === savedWeekend?.trackId,
      ) ??
      nextSeries.calendar.find((event) => !event.cancelled) ??
      nextSeries.calendar[0]
    const nextTrack =
      nextSeries.tracks.find((track) => track.id === nextEvent.trackId) ??
      nextSeries.tracks[0]
    const nextDrivers = nextConfiguration.drivers
    const nextSeason = loadPersistedSeason(nextSeries.id)
    const nextStages = weekendStagesFor(nextSeries, nextTrack, nextEvent.id)
    const nextStage =
      savedWeekend && nextStages.includes(savedWeekend.stage)
        ? savedWeekend.stage
        : nextStages.includes('race')
          ? 'race'
          : nextStages.at(-1) ?? 'race'

    setApplicationMode('championship')
    setActiveFreeModeRuntime(null)
    setChampionshipReturnSeriesId(nextSeries.id)
    setIsFreeModeBuilderOpen(false)
    setSelectedSeriesId(nextSeries.id)
    setConfiguredRules(nextConfiguration.rules)
    setConfiguredCalendar(nextConfiguration.calendar)
    setSelectedEventId(nextEvent.id)
    setSelectedTrackId(nextTrack.id)
    setSelectedWeekendStage(nextStage)
    setTeams(copyTeams(nextConfiguration.teams))
    setDrivers(copyDrivers(nextDrivers))
    setConfigurationMigrationHistory(nextConfiguration.migrationHistory)
    setSelectedTeamId(nextSeries.teams[0].id)
    setSelectedDriverId(nextSeries.drivers[0].id)
    setSeason(nextSeason)
    setGridSource(savedWeekend?.gridSource ?? 'qualifying')
    setRequestedDataMode('SIM')
    setSeed(savedWeekend?.seed ?? createAutoScenarioSeed())
    setWeekendContext(
      savedWeekend?.weekendContext ??
        applySeasonGarageToWeekend(
          createWeekendContext(
            nextDrivers,
            nextTrack.isSprintWeekend,
            nextTrack,
            tireAllocationFor(nextSeries, nextTrack.isSprintWeekend),
          ),
          nextSeason,
          nextDrivers,
        ),
    )
  }

  const changeSeries = (seriesId: SeriesId) => {
    if (
      applicationMode === 'championship' &&
      seriesId === selectedSeriesId
    ) {
      return
    }

    activateChampionshipSeries(seriesId)
  }

  const startFreeMode = (configuration: FreeModeConfiguration) => {
    const runtime = buildFreeModeRuntime(configuration, {
      ...freeModeBuildContext,
      qualifyingResult: freeModeStoredState.qualifyingResult,
    })
    const stage = freeModeStageFor(
      configuration.sessionKind,
      configuration.practiceStage,
    )
    const runtimeWeekendContext =
      runtime.raceConfig.weekendContext ??
      createWeekendContext(
        runtime.raceConfig.drivers,
        false,
        runtime.raceConfig.track,
        runtime.raceConfig.tireAllocation,
      )

    if (applicationMode === 'championship') {
      setChampionshipReturnSeriesId(selectedSeriesId)
    }

    setApplicationMode('free')
    setActiveFreeModeRuntime(runtime)
    setSelectedSeriesId(configuration.categoryId)
    setConfiguredRules(runtime.rules)
    setConfiguredCalendar([])
    setSelectedEventId('free-session')
    setSelectedTrackId(runtime.raceConfig.track.id)
    setSelectedWeekendStage(stage)
    setTeams(copyTeams(runtime.raceConfig.teams))
    setDrivers(copyDrivers(runtime.raceConfig.drivers))
    setSelectedTeamId(runtime.raceConfig.teams[0]?.id ?? '')
    setSelectedDriverId(runtime.raceConfig.drivers[0]?.id ?? '')
    setGridSource('brief')
    setRequestedDataMode('SIM')
    setSeed(runtime.raceConfig.seed)
    setWeekendContext(runtimeWeekendContext)
    setIsPaused(false)
    setIsSetupOpen(false)
    setIsDataManagerOpen(false)
    setIsFreeModeBuilderOpen(false)
    setFreeModeStoredState((current) => ({
      ...current,
      configuration,
    }))
  }

  const changeEvent = (eventId: string) => {
    const nextEvent =
      seriesPackage.calendar.find((event) => event.id === eventId) ??
      seriesPackage.calendar[0]
    const nextTrack =
      seriesPackage.tracks.find(
        (candidate) => candidate.id === nextEvent.trackId,
      ) ??
      seriesPackage.tracks[0]
    const stages = weekendStagesFor(seriesPackage, nextTrack, nextEvent.id)

    const seasonWithCurrentWear = updateSeasonGarageFromCars(
      season,
      snapshot.cars,
    )

    setSeason(seasonWithCurrentWear)
    setSelectedEventId(nextEvent.id)
    setSelectedTrackId(nextTrack.id)
    setSeed(createAutoScenarioSeed())
    setWeekendContext(
      applySeasonGarageToWeekend(
        createWeekendContext(
          drivers,
          nextTrack.isSprintWeekend,
          nextTrack,
          tireAllocationFor(seriesPackage, nextTrack.isSprintWeekend),
        ),
        seasonWithCurrentWear,
        drivers,
      ),
    )

    if (!stages.includes(selectedWeekendStage)) {
      setSelectedWeekendStage('race')
    }
  }

  /**
   * Applies the completion effects of every not-yet-completed stage before
   * `target`, using the same deterministic session results the step-by-step
   * advance button would lock in. This keeps weekend progression explicit:
   * jumping ahead never silently skips a session.
   */
  const completeStagesBefore = (context: WeekendContext, target: WeekendStage) => {
    const targetIndex = weekendStages.indexOf(target)
    let next = context

    for (const stage of weekendStages.slice(0, Math.max(0, targetIndex))) {
      if (next.completed.includes(stage)) {
        continue
      }

      if (isPracticeStage(stage)) {
        const results =
          practiceSetup.sessionResults[stage] ?? runPracticeSession(baseConfig, stage)

        next = completePracticeSession(next, stage, results)
      } else if (isStandardQualifyingStage(stage)) {
        const qualifying =
          stage === 'qualifying2' ? secondaryQualifying : standardQualifying
        next = completeQualifyingSession(
          next,
          stage,
          qualifying.classification,
          qualifying.segments,
        )
      } else if (stage === 'sprintQualifying') {
        next = completeQualifyingSession(
          next,
          'sprintQualifying',
          sprintShootout.classification,
          sprintShootout.segments,
        )
      }
    }

    return next
  }

  const jumpToWeekendStage = (stage: WeekendStage) => {
    const targetIndex = weekendStages.indexOf(stage)
    const currentIndex = weekendStages.indexOf(selectedWeekendStage)

    if (targetIndex > currentIndex) {
      setWeekendContext((current) => completeStagesBefore(current, stage))
    }

    if (stage !== selectedWeekendStage) {
      setSeed(createAutoScenarioSeed())
      setSelectedWeekendStage(stage)
    }
  }

  const focusDriver = (driverId: string) => {
    const driver = drivers.find((candidate) => candidate.id === driverId)

    setSelectedDriverId(driverId)

    if (driver) {
      setSelectedTeamId(driver.teamId)
    }
  }

  const updateTeamStat = (
    teamId: string,
    stat: MachineTunableStat | 'pitCrewSpeed',
    value: number,
  ) => {
    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id !== teamId
          ? team
          : stat === 'pitCrewSpeed'
            ? { ...team, pitCrewSpeed: value }
            : {
                ...team,
                machine: { ...team.machine, [stat]: value },
              },
      ),
    )
  }

  const updateDriverStat = (
    driverId: string,
    stat: DriverTunableStat,
    value: number,
  ) => {
    setDrivers((currentDrivers) =>
      currentDrivers.map((driver) =>
        driver.id === driverId
          ? {
              ...driver,
              skills: {
                ...driver.skills,
                [stat]: clampDriverAbility(value),
              },
            }
          : driver,
      ),
    )
  }

  const updateCarSetup = (
    driverId: string,
    key: keyof CarSetup,
    value: number,
  ) => {
    setWeekendContext((current) => {
      if (current.parcFermeLockedByDriver[driverId]) {
        return current
      }

      const setup = current.setupByDriver[driverId]

      if (!setup) {
        return current
      }

      return {
        ...current,
        setupByDriver: {
          ...current.setupByDriver,
          [driverId]: { ...setup, [key]: value },
        },
      }
    })
  }

  const replaceComponent = (
    driverId: string,
    key: keyof CarComponents,
  ) => {
    if (!isPaused) {
      return
    }

    const currentComponents = weekendContext.componentConditionByDriver[driverId]

    if (!currentComponents) {
      return
    }

    const replacement = replaceCarComponent(currentComponents, key)
    const driver = drivers.find((candidate) => candidate.id === driverId)
    const componentLabel = key === 'mguK' ? 'MGU-K' : key
    const note = `${driver?.code ?? driverId}: ${componentLabel} replaced${replacement.gridPenalty > 0 ? ` (+${replacement.gridPenalty} grid)` : ''}`

    setWeekendContext((current) => ({
      ...current,
      componentConditionByDriver: {
        ...current.componentConditionByDriver,
        [driverId]: replacement.components,
      },
      gridPenaltyByDriver: {
        ...current.gridPenaltyByDriver,
        [driverId]:
          (current.gridPenaltyByDriver[driverId] ?? 0) +
          replacement.gridPenalty,
      },
      notes: [...current.notes, note].slice(-30),
    }))
    setSeason((current) =>
      updateSeasonGarageReplacement(
        current,
        driverId,
        replacement.components,
        replacement.gridPenalty,
      ),
    )
  }

  const setPitLaneStart = (driverId: string, enabled: boolean) => {
    if (!isPaused) {
      return
    }

    setWeekendContext((current) => ({
      ...current,
      pitLaneStartByDriver: {
        ...current.pitLaneStartByDriver,
        [driverId]: enabled,
      },
      notes: [
        ...current.notes,
        `${drivers.find((driver) => driver.id === driverId)?.code ?? driverId}: pit-lane start ${enabled ? 'set' : 'cleared'}`,
      ].slice(-30),
    }))
  }

  const applyTeamPreset = (preset: 'top' | 'mid' | 'back') => {
    const target = { back: 0.73, mid: 0.82, top: 0.91 }[preset]

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id !== selectedTeamId
          ? team
          : (() => {
              const entries = Object.entries(team.machine) as Array<
                [MachineTunableStat, number]
              >
              const currentMean =
                entries.reduce((total, [, value]) => total + value, 0) /
                entries.length
              const shift = target - currentMean
              const machine = Object.fromEntries(
                entries.map(([key, value]) => [
                  key,
                  Math.min(1, Math.max(0.55, value + shift)),
                ]),
              ) as Team['machine']

              return {
                ...team,
                machine,
                pitCrewSpeed: Math.min(1, Math.max(0.55, target)),
              }
            })(),
      ),
    )
  }

  const resetGrid = () => {
    const resetDrivers = copyDrivers(registrySeriesPackage.drivers)

    setTeams(copyTeams(registrySeriesPackage.teams))
    setDrivers(resetDrivers)
    setConfiguredRules(
      JSON.parse(
        JSON.stringify(registrySeriesPackage.rules),
      ) as SeriesPackage['rules'],
    )
    setConfiguredCalendar(
      JSON.parse(
        JSON.stringify(registrySeriesPackage.calendar),
      ) as SeriesPackage['calendar'],
    )
    setConfigurationMigrationHistory((history) => [
      ...history,
      `official-baseline-reset:${new Date().toISOString()}`,
    ].slice(-20))
    setSelectedTeamId(registrySeriesPackage.teams[0].id)
    setSelectedDriverId(resetDrivers[0].id)
    setSeed(createAutoScenarioSeed())
    setWeekendContext(
      applySeasonGarageToWeekend(
        createWeekendContext(
          resetDrivers,
          track.isSprintWeekend,
          track,
          tireAllocationFor(registrySeriesPackage, track.isSprintWeekend),
        ),
        season,
        resetDrivers,
      ),
    )
  }

  const applySeriesConfiguration = (
    nextTeams: Team[],
    nextDrivers: Driver[],
    historyEntry?: string,
    importedMigrationHistory?: string[],
    nextRules?: SeriesPackage['rules'],
    nextCalendar?: SeriesPackage['calendar'],
  ) => {
    setTeams(copyTeams(nextTeams))
    setDrivers(copyDrivers(nextDrivers))
    if (nextRules) setConfiguredRules(nextRules)
    if (nextCalendar) setConfiguredCalendar(nextCalendar)
    setSelectedTeamId((current) =>
      nextTeams.some((team) => team.id === current)
        ? current
        : nextTeams[0]?.id ?? '',
    )
    setSelectedDriverId((current) =>
      nextDrivers.some((driver) => driver.id === current)
        ? current
        : nextDrivers[0]?.id ?? '',
    )

    if (importedMigrationHistory) {
      setConfigurationMigrationHistory([
        ...importedMigrationHistory,
        ...(historyEntry
          ? [`${new Date().toISOString()}:${historyEntry}`]
          : []),
      ].slice(-20))
    } else if (
      historyEntry &&
      /import|rollback|equalis|baseline|migration|seat updated|role updated/i.test(
        historyEntry,
      )
    ) {
      setConfigurationMigrationHistory((history) =>
        [
          ...history,
          `${new Date().toISOString()}:${historyEntry}`,
        ].slice(-20),
      )
    }
    setSeed(createAutoScenarioSeed())
  }

  const randomSeed = () => {
    setSeed(createAutoScenarioSeed())
  }
  const trackGeometrySource: BroadcastDataDetail['source'] =
    raceConfig.track.layoutSource?.provider === 'official'
      ? 'OFF'
      : raceConfig.track.layoutSource?.provider === 'openf1' ||
          raceConfig.track.layoutSource?.provider === 'openstreetmap'
        ? 'OBS'
        : 'SIM'
  const paceReference2026 = raceConfig.track.paceReference2026
  const paceCalibration = paceReference2026?.calibration
  const paceSourceTag = (
    status: NonNullable<typeof paceCalibration>['qualifying']['status'],
  ): BroadcastDataDetail['source'] => {
    switch (status) {
      case 'official':
        return 'OFF'
      case 'observed':
        return 'OBS'
      case 'derived':
        return 'CAL'
      case 'estimated':
        return 'SIM'
      case 'unverified':
        return 'UNAVAILABLE'
    }
  }
  const paceStatusLabel = (
    status: NonNullable<typeof paceCalibration>['qualifying']['status'],
  ) => status.toUpperCase()
  const activePaceStatus = paceCalibration
    ? isRaceProgressSession
      ? paceCalibration.race.status
      : paceCalibration.qualifying.status
    : 'estimated'
  const sortedPaceSources = paceCalibration?.sources
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.retrievedAt) - Date.parse(left.retrievedAt),
    )
  const activePaceSource =
    sortedPaceSources?.find((source) => {
      const normalizedLabel = source.label.toLowerCase()
      const sessionLabel = isRaceProgressSession
        ? 'race'
        : 'qualifying'

      if (activePaceStatus === 'estimated') {
        return normalizedLabel.includes(
          `${sessionLabel} historical forecast input`,
        )
      }

      if (source.provider === 'OpenF1') {
        return (
          normalizedLabel.includes(`${sessionLabel} timing`) &&
          !normalizedLabel.includes('historical forecast input')
        )
      }

      return paceCalibration?.series === 'super-formula'
        ? source.provider === 'SUPER FORMULA'
        : source.provider === 'Formula 1'
    }) ?? sortedPaceSources?.[0]
  const paceReferenceDataDetails: BroadcastDataDetail[] = paceReference2026
    ? [
        {
          label: '2026 qualifying reference',
          source: paceSourceTag(
            paceReference2026.calibration.qualifying.status,
          ),
          value: `${formatLapTime(
            paceReference2026.calibration.qualifying
              .selectedReferenceSeconds,
          )} ${paceStatusLabel(
            paceReference2026.calibration.qualifying.status,
          )}`,
        },
        {
          label: 'Neutral model baseline',
          source: 'CAL',
          value: `${formatLapTime(
            paceReference2026.calibration.simulation
              .neutralBaseLapSeconds,
          )} / ${paceReference2026.calibration.simulation.calibrationSeedCount} seeds`,
        },
        {
          label: 'Green race median',
          source:
            paceReference2026.calibration.race
              .cleanLapReferenceSeconds === null
              ? 'UNAVAILABLE'
              : paceSourceTag(
                  paceReference2026.calibration.race.status,
                ),
          value:
            paceReference2026.calibration.race
              .cleanLapReferenceSeconds === null
              ? 'No verified clean-lap sample'
              : `${formatLapTime(
                  paceReference2026.calibration.race
                    .cleanLapReferenceSeconds,
                )} / ${
                  paceReference2026.calibration.race.cleanLapCount
                } laps`,
        },
        {
          label: 'Full-event average',
          source:
            paceReference2026.calibration.race
              .winnerAverageSeconds === null
              ? 'UNAVAILABLE'
              : paceReference2026.raceAverageBasis === 'official-result'
                ? 'OFF'
                : 'SIM',
          value:
            paceReference2026.calibration.race
              .winnerAverageSeconds === null
              ? 'Not available'
              : `${formatLapTime(
                  paceReference2026.calibration.race
                    .winnerAverageSeconds,
                )} winner time / laps`,
        },
        {
          label: 'Calibration confidence',
          source: 'CAL',
          value: `Q ${Math.round(
            paceReference2026.calibration.qualifying.confidence *
              100,
          )}% / R ${Math.round(
            paceReference2026.calibration.race.confidence * 100,
          )}%`,
        },
        {
          label: 'Calibration source',
          source: activePaceSource
            ? paceSourceTag(activePaceStatus)
            : 'UNAVAILABLE',
          value: activePaceSource
            ? `${activePaceSource.provider} / ${activePaceSource.retrievedAt.slice(
                0,
                10,
              )}`
            : 'No source metadata',
        },
        {
          label: 'Calibration version',
          source: 'CAL',
          value:
            paceReference2026.calibration.calibrationVersion,
        },
      ]
    : []

  const baselineBroadcastDataDetails: BroadcastDataDetail[] = [
    {
      label: 'OpenF1 link',
      source: openF1Bundle?.meeting ? 'OBS' : 'UNAVAILABLE',
      value: openF1Bundle?.meeting?.meeting_name ?? 'No matching meeting',
    },
    {
      label: 'Session status',
      source: openF1Bundle?.selectedSession ? 'OBS' : 'SIM',
      value: openF1StatusLabel(openF1Bundle),
    },
    {
      label: 'API endpoints',
      source: openF1LoadedEndpoints > 0 ? 'OBS' : 'UNAVAILABLE',
      value: `${openF1LoadedEndpoints}/${openF1RequestedEndpoints} loaded`,
    },
    {
      label: 'Newest sample',
      source: latestOpenF1Sample ? 'OBS' : 'UNAVAILABLE',
      value: latestOpenF1Sample
        ? `${formatOpenF1Date(latestOpenF1Sample)} / ${openF1DataAge}`
        : 'No sample',
    },
    {
      label: 'Timing rows',
      source: openF1TimingSources.size > 0 ? 'OBS' : 'SIM',
      value: `${openF1TimingSources.size}/${timingRows.length} observed`,
    },
    {
      label: 'Telemetry rows',
      source: openF1CarDataByCode.size > 0 ? 'OBS' : 'SIM',
      value: `${openF1CarDataByCode.size}/${timingRows.length} observed`,
    },
    {
      label: 'Track geometry',
      source: trackGeometrySource,
      value: raceConfig.track.layoutSource?.label ?? 'Fallback layout',
    },
    {
      label: 'Race distance',
      source: raceConfig.track.raceLapsSource === 'official' ? 'FIA' : 'SIM',
      value: `${snapshot.raceLaps} laps`,
    },
    ...paceReferenceDataDetails,
    {
      label: '2026 rulebook',
      source: 'FIA',
      value: `Sporting Iss ${FIA_2026_REGULATION_PROFILE.sporting.issue} / Technical Iss ${FIA_2026_REGULATION_PROFILE.technical.issue} / Penalty v${FIA_2026_REGULATION_PROFILE.penaltyGuidelines.issue} / ${FIA_2026_REGULATION_PROFILE.asOf}`,
    },
    {
      label: 'Heat Hazard',
      source: 'FIA',
      value: `${snapshot.heatIndexC.toFixed(1)}°C HI / ${snapshot.heatHazardDeclared ? 'DECLARED' : 'NOT DECLARED'} / +${snapshot.heatHazardMassIncreaseKg}kg`,
    },
    {
      label: 'Grip declaration',
      source: 'SIM',
      value: snapshot.lowGripConditions
        ? 'LOW / partial front aero / Overtake off'
        : 'NORMAL / full aero zones',
    },
    {
      label: 'ERS limits',
      source: 'FIA',
      value: `${FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw} kW / ${FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj} MJ SOC / ${raceConfig.fiaEventRechargeLimitMj ?? FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj} MJ recharge`,
    },
    {
      label: 'Low-grip ERS curve',
      source: 'UNAVAILABLE',
      value: `${FIA_2026_REGULATION_PROFILE.lowGripPowerCurve.document} non-public / conservative SIM`,
    },
    {
      label: 'Field calibration',
      source: fieldCalibration.source === 'openf1-calibrated' ? 'CAL' : 'SIM',
      value: `${Math.round(fieldCalibration.confidence * 100)}% confidence`,
    },
    {
      label: 'Environment',
      source: environmentReadout.source.startsWith('OpenF1') ? 'OBS' : 'SIM',
      value: environmentReadout.source,
    },
    {
      label: 'FIA event pack',
      source: fiaEventPack ? 'FIA' : 'UNAVAILABLE',
      value: fiaEventPack?.status ?? 'Not linked',
    },
    {
      label: 'Simulation engine',
      source: 'SIM',
      value: engineError
        ? `Error: ${engineError}`
        : `${engineMode.toUpperCase()}${checkpointRecovered ? ' / checkpoint restored' : ''}`,
    },
    {
      label: 'Race checkpoint',
      source: 'SIM',
      value:
        checkpointSaveStatus === 'failed'
          ? 'Save unavailable - race continues'
          : checkpointSaveStatus === 'saved'
            ? 'Saved locally'
            : checkpointRecovered
              ? 'Restored; next save pending'
              : 'First save pending',
    },
  ]
  const f1OnlyDataLabels = new Set([
    'OpenF1 link',
    'Session status',
    'API endpoints',
    'Newest sample',
    'Timing rows',
    'Telemetry rows',
    '2026 rulebook',
    'Heat Hazard',
    'Grip declaration',
    'ERS limits',
    'Low-grip ERS curve',
    'FIA event pack',
  ])
  const broadcastDataDetails =
    applicationMode === 'free' && activeFreeModeRuntime
      ? [
          {
            label: 'Session mode',
            source: 'SIM' as const,
            value: `FREE · ${registrySeriesPackage.shortLabel} · ${activeFreeModeRuntime.configuration.entrants.length} cars`,
          },
          {
            label: 'Qualifying structure',
            source: 'SIM' as const,
            value: activeFreeModeRuntime.qualifyingFormatLabel,
          },
          {
            label: 'Track source',
            source: 'SIM' as const,
            value: `${activeFreeModeRuntime.trackSources.join(' / ')} physical layout · ${raceConfig.track.freeModeProvenance?.pace ?? 'native'} category pace`,
          },
          {
            label: 'Overtake zones',
            source:
              raceConfig.track.freeModeProvenance?.overtakeZones ===
              'simulated'
                ? ('SIM' as const)
                : ('OFF' as const),
            value: `${seriesPackage.rules.overtakeSystem.toUpperCase()} · ${raceConfig.track.freeModeProvenance?.overtakeZones ?? 'native'}`,
          },
          ...baselineBroadcastDataDetails.filter(
            (detail) => !f1OnlyDataLabels.has(detail.label),
          ),
        ]
      : seriesPackage.rules.supportsOpenF1
        ? baselineBroadcastDataDetails
        : [
        ...seriesPackage.sources.map<BroadcastDataDetail>((source) => ({
          label: source.label,
          source: 'OFF',
          value: `Verified ${source.sourceDate}`,
        })),
        {
          label: 'Category format',
          source: 'FIA' as const,
          value: categorySessionFormatLabel,
        },
        {
          label: 'Tire package',
          source: 'OFF' as const,
          value: `${seriesPackage.rules.tireSupplier} / ${Object.entries(
            seriesPackage.rules.tires.standardAllocation,
          )
            .filter(([, count]) => count > 0)
            .map(([compound, count]) => `${compound}${count}`)
            .join(' ')}`,
        },
        {
          label: 'Overtake system',
          source: 'FIA' as const,
          value: seriesPackage.rules.overtakeSystem.toUpperCase(),
        },
        ...baselineBroadcastDataDetails.filter(
          (detail) => !f1OnlyDataLabels.has(detail.label),
        ),
      ]
  const broadcastDataControl =
    applicationMode === 'free' && activeFreeModeRuntime ? (
      <div className="broadcast-data-control">
        <strong>
          FREE · {registrySeriesPackage.shortLabel} · SIM
        </strong>
        <span>
          Independent session. Championship saves and OpenF1 are isolated.
        </span>
        <button onClick={() => setIsFreeModeBuilderOpen(true)} type="button">
          Edit Free Mode session
        </button>
      </div>
    ) : seriesPackage.rules.supportsOpenF1 ? (
    <form
      className="broadcast-data-control"
      onSubmit={(event) => {
        event.preventDefault()
        const token = openF1TokenDraft.trim()
        setOpenF1AccessToken(token || null)
      }}
    >
      <label>
        <span>OpenF1 bearer token</span>
        <input
          autoComplete="off"
          onChange={(event) => setOpenF1TokenDraft(event.target.value)}
          placeholder="Optional access token"
          type="password"
          value={openF1TokenDraft}
        />
      </label>
      <button type="submit">Apply token</button>
      {openF1AccessToken ? (
        <button
          onClick={() => {
            setOpenF1AccessToken(null)
            setOpenF1TokenDraft('')
          }}
          type="button"
        >
          Clear token
        </button>
      ) : null}
      <button
        aria-pressed={showOpenF1Cars}
        disabled={
          !openF1TrackProgressAvailable ||
          !dataModeUsesObservedTiming(dataMode)
        }
        onClick={() => setShowOpenF1Cars((shown) => !shown)}
        type="button"
      >
        {observedMapActive ? 'Hide' : 'Show'} OpenF1 positions
      </button>
      <button onClick={() => setIsDataManagerOpen(true)} type="button">
        Manage series data
      </button>
    </form>
    ) : (
    <div className="broadcast-data-control">
      <strong>{seriesPackage.label}</strong>
      <span>Official registry package. OpenF1 is F1-only.</span>
      <button onClick={() => setIsDataManagerOpen(true)} type="button">
        Manage series data
      </button>
    </div>
  )
  const broadcastTireLabels: Record<TireCompound, string> = {
    ...seriesPackage.rules.tires.dryLabels,
    I: 'Intermediate',
    W: 'Wet',
  }
  return (
    <div className="race-shell broadcast-race-shell">
      <BroadcastDashboard
        applicationMode={applicationMode}
        cameraMode={cameraMode}
        dataControl={broadcastDataControl}
        dataDetails={broadcastDataDetails}
        dataMode={dataMode}
        dataModeAvailability={{
          HIST:
            applicationMode === 'championship' &&
            latestOpenF1Sample !== null,
          LIVE:
            applicationMode === 'championship' &&
            detectedDataMode === 'LIVE',
          SIM: true,
        }}
        engineLabel={`ENGINE ${engineMode.toUpperCase()}${checkpointRecovered ? ' / RESUMED' : ''}${checkpointSaveStatus === 'failed' ? ' / SAVE ERROR' : ''}`}
        environment={environmentReadout}
        eventName={
          applicationMode === 'free'
            ? `${track.name} Free Session`
            : seriesPackage.rules.supportsOpenF1
            ? (track.openF1?.meetingName ??
              fiaEventPack?.eventName ??
              `${track.location} ${seriesPackage.shortLabel}`)
            : `${seriesPackage.shortLabel} ROUND ${selectedEvent.round} / ${track.location}`
        }
        isPaused={isPaused}
        onCameraModeChange={setCameraMode}
        onDataModeChange={setRequestedDataMode}
        onExitFreeMode={() => {
          if (applicationMode === 'free') {
            activateChampionshipSeries(championshipReturnSeriesId)
          }
        }}
        onFocusDriver={focusDriver}
        onOpenFreeMode={() => setIsFreeModeBuilderOpen(true)}
        onOpenClassification={() => {
          setIsClassificationOpen(true)
          setIsInsightsOpen(false)
          setIsPitWallOpen(false)
        }}
        onOpenInsights={() => {
          setIsInsightsOpen(true)
          setIsClassificationOpen(false)
          setIsPitWallOpen(false)
        }}
        onOpenPitWall={() => {
          setIsPitWallOpen(true)
          setIsClassificationOpen(false)
          setIsInsightsOpen(false)
        }}
        onOpenSetup={() =>
          applicationMode === 'free'
            ? setIsFreeModeBuilderOpen(true)
            : setIsSetupOpen(true)
        }
        onPauseChange={() => setIsPaused((paused) => !paused)}
        onSeriesChange={changeSeries}
        onSkipFormationLap={skipFormationLap}
        onSpeedChange={setSpeed}
        onStageChange={jumpToWeekendStage}
        raceControlLog={raceControlLog}
        raceLabel={seriesPackage.rules.raceLabel}
        selectedCar={selectedCar}
        sessionPhaseLabel={
          isRaceProgressSession
            ? selectedWeekendStage.toUpperCase()
            : timedPhaseLabel
        }
        sessionProgressLabel={broadcastSessionProgressLabel}
        snapshot={broadcastSnapshot}
        speed={speed}
        stage={selectedWeekendStage}
        seriesId={selectedSeriesId}
        seriesLabel={seriesPackage.label}
        seriesOptions={seriesPackages.map(({ id, label }) => ({ id, label }))}
        tireLabels={broadcastTireLabels}
        overtakeSystem={seriesPackage.rules.overtakeSystem}
        timingRows={timingRows}
        track={raceConfig.track}
        trackScene={
          <Suspense
            fallback={
              <div className="scene-loading" role="status">
                Loading circuit map...
              </div>
            }
          >
            <RaceScene
              cameraMode={cameraMode}
              config={raceConfig}
              onSelectDriver={focusDriver}
              openF1Overlay={
                observedMapActive
                  ? openF1TrackProgress
                  : null
              }
              openF1OverlayMode={openF1TrackProgressMode}
              selectedDriverId={selectedCar.driverId}
              showSimulationCars={!observedMapActive}
              snapshot={snapshot}
            />
          </Suspense>
        }
        weekendStages={weekendStages}
      />

      {applicationMode === 'championship' ? (
        <SetupPanel
        calendarEvents={seriesPackage.calendar}
        componentReplacementDisabled={!isPaused}
        drivers={drivers}
        gridSource={gridSource}
        gridReferenceLabel={
          selectedEvent.gridSourceTrackId
            ? `${qualifyingBaseConfig.track.name} R${selectedEvent.round} qualifying reference`
            : null
        }
        isOpen={isSetupOpen}
        knockoutQualifying={knockoutQualifying}
        onApplyTeamPreset={applyTeamPreset}
        onCarSetupChange={updateCarSetup}
        onComponentReplace={replaceComponent}
        onDriverChange={focusDriver}
        onDriverStatChange={updateDriverStat}
        onGridSourceChange={setGridSource}
        onPitLaneStartChange={setPitLaneStart}
        onRandomSeed={randomSeed}
        onResetGrid={resetGrid}
        onSeedChange={setSeed}
        onTeamChange={setSelectedTeamId}
        onTeamStatChange={updateTeamStat}
        onToggle={() => setIsSetupOpen((isOpen) => !isOpen)}
        onEventChange={changeEvent}
        openF1GridAvailable={openF1GridResults.length > 0}
        openF1GridStatus={openF1GridStatus}
        practiceResults={practiceResults}
        practiceSetup={practiceSetup}
        qualifyingResults={qualifyingResults}
        seed={seed}
        selectedDriverId={selectedDriverId}
        selectedEventId={selectedEventId}
        selectedTeamId={selectedTeamId}
        selectedTrackId={selectedTrackId}
        selectedWeekendStage={selectedWeekendStage}
        sessionFormatLabel={categorySessionFormatLabel}
        teams={teams}
        tracks={seriesPackage.tracks}
        weekendContext={weekendContext}
        weekendTirePlan={weekendTirePlan}
        />
      ) : null}

      {applicationMode === 'championship' && isDataManagerOpen ? (
        <Suspense fallback={null}>
          <SeriesDataManager
            assignments={driverAssignments2026}
            driverPool={driverPool2026}
            drivers={drivers}
            isOpen={isDataManagerOpen}
            migrationHistory={configurationMigrationHistory}
            onApply={applySeriesConfiguration}
            onClose={() => setIsDataManagerOpen(false)}
            onReset={resetGrid}
            series={seriesPackage}
            teams={teams}
          />
        </Suspense>
      ) : null}

      <FreeModeBuilder
        context={freeModeBuildContext}
        initialConfiguration={freeModeStoredState.configuration}
        isOpen={isFreeModeBuilderOpen}
        onClose={() => setIsFreeModeBuilderOpen(false)}
        onStart={startFreeMode}
        qualifyingResult={freeModeStoredState.qualifyingResult}
      />

      {isClassificationOpen && isRaceProgressSession ? (
        <RaceClassificationPanel
          onClose={() => setIsClassificationOpen(false)}
          snapshot={snapshot}
        />
      ) : null}

      {isClassificationOpen && isQualifyingSession ? (
        <QualifyingClassificationPanel
          onClose={() => setIsClassificationOpen(false)}
          segments={classificationSegments}
          snapshot={snapshot}
          stage={selectedWeekendStage}
        />
      ) : null}

      {isInsightsOpen && isRaceProgressSession && selectedDriver ? (
        <RaceInsightsPanel
          car={selectedCar}
          driver={selectedDriver}
          onClose={() => setIsInsightsOpen(false)}
          onRequestPitStop={requestPitStop}
          onSetDriverPaceMode={setDriverPaceMode}
          openF1Mode={dataMode}
          season={season}
          snapshot={snapshot}
          telemetryIsOpenF1={openF1CarDataByCode.has(selectedCar.code)}
          timingIsOpenF1={openF1TimingSources.has(selectedCar.code)}
          track={track}
          weekendContext={weekendContext}
        />
      ) : null}

      {isPitWallOpen && isRaceProgressSession && selectedDriver ? (
        <PitWallPanel
          car={selectedCar}
          driver={selectedDriver}
          environment={environmentReadout}
          onClose={() => setIsPitWallOpen(false)}
          onRequestPitStop={requestPitStop}
          onSetDriverPaceMode={setDriverPaceMode}
          openF1Mode={dataMode}
          overtakeSystem={seriesPackage.rules.overtakeSystem}
          raceControlLog={raceControlLog}
          seriesId={selectedSeriesId}
          snapshot={snapshot}
          telemetryIsOpenF1={openF1CarDataByCode.has(selectedCar.code)}
          timingIsOpenF1={openF1TimingSources.has(selectedCar.code)}
          tireLabels={broadcastTireLabels}
          track={track}
        />
      ) : null}
    </div>
  )
}
