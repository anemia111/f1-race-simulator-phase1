import {
  BarChart3,
  Badge,
  Camera,
  Check,
  CircleGauge,
  ClipboardList,
  Map as MapIcon,
  KeyRound,
  Pause,
  Play,
  Radar,
  Rotate3D,
  Settings2,
  StepForward,
  Table2,
  Trophy,
  X,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  BroadcastDashboard,
  type BroadcastDataDetail,
} from './components/BroadcastDashboard'
import { RaceClassificationPanel } from './components/RaceClassificationPanel'
import { RaceInsightsPanel } from './components/RaceInsightsPanel'
import { SetupPanel } from './components/SetupPanel'
import { initialDrivers, initialTeams } from './data/grid2026'
import { fiaEventPackFor } from './data/fiaEventPacks2026'
import { sourceRegistry } from './data/sourceRegistry'
import { defaultTrack, tracks } from './data/tracks'
import { auditTrackCalendar } from './data/trackAudit'
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
} from './domain/sectorTiming'
import { useOpenF1Data } from './hooks/useOpenF1Data'
import { useOpenF1SeasonStandings } from './hooks/useOpenF1SeasonStandings'
import { useRaceSimulation } from './hooks/useRaceSimulation'
import {
  LEGACY_SEASON_STORAGE_KEY,
  LEGACY_WEEKEND_STORAGE_KEY,
  SEASON_STORAGE_KEY,
  WEEKEND_STORAGE_KEY,
  parsePersistedSeason,
  parsePersistedWeekend,
  type PersistedWeekend,
} from './persistence'
import {
  applyQualifyingGrid,
  runKnockoutQualifying,
  runPracticeSession,
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
  isPracticeStage,
  isRaceDistanceSession,
  type PracticeSessionName,
  sessionDurationSecondsFor,
} from './simulation/sessionRules'
import { FIA_2026_REGULATION_PROFILE } from './simulation/regulations'
import { weatherTrackStateFor } from './simulation/weather'
import { isDryCompound, tireDeltaSeconds } from './simulation/tires'
import { buildTimedSessionPlan } from './simulation/timedSessionPlan'
import type { OpenF1Bundle, OpenF1CarData, OpenF1Lap } from './services/openF1'
import { buildOpenF1LiveRaceState } from './services/openF1Derived'
import { buildOpenF1TrackProgress } from './services/openF1Location'
import {
  buildOpenF1TrackCalibration,
  calibrateFieldFromOpenF1,
} from './services/openF1Performance'
import { buildSynchronizedCarData } from './services/openF1Sync'
import { buildOpenF1TimelineFrame } from './services/openF1Timeline'
import { buildWeekendTirePlan } from './simulation/weekendTires'
import {
  applySeasonGarageToWeekend,
  recordSeasonRound,
  updateSeasonGarageFromCars,
  updateSeasonGarageReplacement,
  type SeasonState,
} from './simulation/season'
import {
  applyGridPenalties,
  applyWeekendGrid,
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
  RaceConfig,
  RaceSnapshot,
  SectorTimingStatus,
  SpeedMultiplier,
  Team,
  TireCompound,
  WeekendContext,
  WeekendStage,
} from './types'
import { clampDriverAbility } from './simulation/driverAbility'

const cameraModes: Array<{
  mode: CameraMode
  label: string
  title: string
  Icon: typeof MapIcon
}> = [
  { mode: 'overview', label: 'Map', title: 'Overview camera', Icon: MapIcon },
  { mode: 'chase', label: 'Chase', title: 'Chase selected car', Icon: Camera },
  { mode: 'orbit', label: 'Orbit', title: 'Free orbit camera', Icon: Rotate3D },
]

const RaceScene = lazy(() =>
  import('./three/RaceScene').then((module) => ({ default: module.RaceScene })),
)

const speedOptions: SpeedMultiplier[] = [1, 5, 20, 60]
const dataModeOptions: DataMode[] = ['SIM', 'HIST', 'LIVE']
const emptyOpenF1CarDataByCode = new Map<string, OpenF1CarData>()
const trackCalendarAudit = auditTrackCalendar(tracks)
const microSectorCount = 8
const totalMicroSectorCount = microSectorCount * 3
const weekendStageLabels: Record<WeekendStage, string> = {
  fp1: 'FP1',
  fp2: 'FP2',
  fp3: 'FP3',
  sprintQualifying: 'SQ',
  qualifying: 'Quali',
  race: 'Race',
  sprint: 'Sprint',
}

/**
 * Restores the in-progress local weekend (selected round, stage, seed, and
 * accumulated session effects). Anything malformed or referencing unknown
 * tracks is discarded so a stale save can never break startup.
 */
function loadPersistedWeekend(): PersistedWeekend | null {
  return parsePersistedWeekend(
    window.localStorage.getItem(WEEKEND_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_WEEKEND_STORAGE_KEY),
    tracks,
    initialDrivers,
  )
}

const persistedWeekend = loadPersistedWeekend()

function loadPersistedSeason(): SeasonState {
  return parsePersistedSeason(
    window.localStorage.getItem(SEASON_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SEASON_STORAGE_KEY),
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

const miniSectorAriaLabel = (
  states: MiniSectorState[],
  sectorIndex: number,
) => {
  const counts = states.reduce<Partial<Record<MiniSectorState, number>>>(
    (summary, state) => ({ ...summary, [state]: (summary[state] ?? 0) + 1 }),
    {},
  )
  const labels: Record<MiniSectorState, string> = {
    dim: 'not completed',
    yellow: 'slower',
    green: 'personal best',
    purple: 'overall best',
    pit: 'pit lane',
    stopped: 'stopped',
  }
  const details = (Object.keys(labels) as MiniSectorState[])
    .filter((state) => (counts[state] ?? 0) > 0)
    .map((state) => `${counts[state]} ${labels[state]}`)
    .join(', ')

  return `Sector ${sectorIndex + 1} mini sectors: ${details}`
}

type OpenF1LapWithSectorTimes = OpenF1Lap & {
  duration_sector_1: number
  duration_sector_2: number
  duration_sector_3: number
  lap_duration: number
}

const copyTeams = (teams: Team[]) => teams.map((team) => ({ ...team }))
const copyDrivers = (drivers: Driver[]) => drivers.map((driver) => ({ ...driver }))

const weekendStagesFor = (track: RaceConfig['track']): WeekendStage[] =>
  track.isSprintWeekend
    ? ['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']
    : ['fp1', 'fp2', 'fp3', 'qualifying', 'race']

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

const formatSector = (seconds: number | null | undefined) =>
  typeof seconds === 'number' && Number.isFinite(seconds)
    ? seconds.toFixed(3)
    : '--.---'

const formatTemperature = (value: number) => `${value.toFixed(1)}C`

const formatWind = (speedMetersPerSecond: number, directionDegrees: number) => {
  const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const normalizedDirection = ((directionDegrees % 360) + 360) % 360
  const compass = compassPoints[Math.round(normalizedDirection / 45) % 8]

  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h ${compass}`
}

const compactForecastLabel = (label: string) =>
  label
    .replace('LIGHT RAIN', 'LR')
    .replace('HEAVY RAIN', 'HR')
    .replace('CLEAR', 'CLR')
    .replace(' stable', '')
    .replace(' in ', ' ')
    .replace(/\((\d+%)\)/, '$1')

const shortTeamName = (teamName: string) =>
  teamName
    .replace('Mercedes-AMG', 'Mercedes')
    .replace('Aston Martin', 'Aston')
    .replace('Racing Bulls', 'RB')
    .replace('Stake Kick Sauber', 'Sauber')

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
  | 'aeroOvertakeLabel'
  | 'gear'
  | 'performancePaceDeltaSeconds'
  | 'performanceSource'
  | 'rpm'
  | 'sectorStatuses'
  | 'speedKph'
  | 'telemetrySource'
  | 'throttlePercent'
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

const overtakeControlLabel = (snapshot: RaceSnapshot) => {
  if (snapshot.lowGripConditions) {
    return 'DISABLED / LOW GRIP'
  }

  if (snapshot.overtakeEnabled) {
    return 'ENABLED'
  }

  const targets = snapshot.overtakeEnableTargetsByDriver

  if (targets) {
    const carsByDriver = new Map(
      snapshot.cars.map((car) => [car.driverId, car]),
    )
    const entries = Object.entries(targets)
    const crossed = entries.filter(([driverId, target]) => {
      const car = carsByDriver.get(driverId)

      return !car || car.status !== 'running' || car.totalDistance >= target
    }).length

    return `WAIT FIELD ${crossed}/${entries.length}`
  }

  return snapshot.overtakeEnableAtLeaderDistance === null
    ? 'DISABLED'
    : 'WAIT LEADER'
}

const terminalStatusLabel = (car: CarSnapshot) => {
  if (car.status === 'retired') {
    return 'OUT'
  }

  if (car.status === 'disqualified') {
    return 'DSQ'
  }

  if (car.status === 'dns') {
    return 'DNS'
  }

  return null
}

const stewardChipLabel = (car: CarSnapshot) => {
  const pendingProcedure = car.penalties.find(
    (penalty) =>
      !penalty.served &&
      (penalty.kind === 'drive-through' || penalty.kind === 'stop-go-10'),
  )

  if (pendingProcedure?.kind === 'drive-through') {
    return 'DT'
  }

  if (pendingProcedure?.kind === 'stop-go-10') {
    return 'SG10'
  }

  if (car.stewardStatus === 'penalty') {
    return car.penaltySeconds > 0 ? `+${Math.round(car.penaltySeconds)}s` : 'PEN'
  }

  if (car.stewardStatus === 'investigating') {
    return 'INV'
  }

  return 'NOTE'
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

const formatSeconds = (seconds: number | null | undefined) =>
  typeof seconds === 'number' ? seconds.toFixed(3) : '-'

const formatShortDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)

  return remaining === 0
    ? `${minutes}m`
    : `${minutes}:${remaining.toString().padStart(2, '0')}`
}

const openF1DriverLabel = (
  bundle: OpenF1Bundle | null | undefined,
  driverNumber: number | null | undefined,
) => {
  if (!bundle || driverNumber === null || driverNumber === undefined) {
    return '-'
  }

  const driver = bundle.drivers.find(
    (candidate) => candidate.driver_number === driverNumber,
  )

  return driver ? driver.name_acronym : `#${driverNumber}`
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

const formatOpenF1ResultGap = (
  gap: OpenF1Bundle['sessionResult'][number]['gap_to_leader'],
  position: number,
) => {
  const value = Array.isArray(gap)
    ? gap.slice().reverse().find((candidate) => candidate !== null)
    : gap

  if (typeof value === 'number') {
    return value === 0 && position === 1 ? 'Leader' : `+${value.toFixed(3)}`
  }

  return value ?? (position === 1 ? 'Leader' : '-')
}

const openF1ClockLabel = (date: string) => {
  const clock = date.match(/T(\d{2}:\d{2})/)?.[1]

  return clock ?? '--:--'
}

const simulatedEnvironmentFor = (
  seed: string,
  track: RaceConfig['track'],
  weatherLabel: string,
) => {
  const coolOff = weatherLabel === 'HEAVY RAIN' ? 7 : weatherLabel === 'LIGHT RAIN' ? 4 : 0
  const airTemperature =
    22 + (1 - track.rainProbability) * 8 + hashUnit(`${seed}:air:${track.id}`) * 5 - coolOff
  const trackTemperature =
    airTemperature +
    (weatherLabel === 'CLEAR' ? 15 : weatherLabel === 'LIGHT RAIN' ? 7 : 3)
  const windSpeed = 1.4 + hashUnit(`${seed}:wind:${track.id}`) * 5.6
  const windDirection = Math.round(hashUnit(`${seed}:wind-dir:${track.id}`) * 359)
  const humidity = Math.round(
    Math.min(
      96,
      42 + track.rainProbability * 46 + (weatherLabel === 'CLEAR' ? 0 : 18),
    ),
  )

  return {
    airLabel: `${formatTemperature(airTemperature)} S`,
    humidityLabel: `${humidity}% S`,
    pressureLabel: `${Math.round(1002 + hashUnit(`${seed}:pressure:${track.id}`) * 18)} hPa S`,
    source: 'simulation' as const,
    trackLabel: `${formatTemperature(trackTemperature)} S`,
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
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview')
  const [speed, setSpeed] = useState<SpeedMultiplier>(1)
  const [isPaused, setIsPaused] = useState(false)
  const [isSetupOpen, setIsSetupOpen] = useState(false)
  const [areSectorBoardsOpen, setAreSectorBoardsOpen] = useState(false)
  const [isLiveTimingOpen, setIsLiveTimingOpen] = useState(false)
  const [isClassificationOpen, setIsClassificationOpen] = useState(false)
  const [isInsightsOpen, setIsInsightsOpen] = useState(false)
  const [isOpenF1PanelOpen, setIsOpenF1PanelOpen] = useState(false)
  const [isRaceControlLogOpen, setIsRaceControlLogOpen] = useState(false)
  const [showOpenF1Cars, setShowOpenF1Cars] = useState(true)
  const [requestedDataMode, setRequestedDataMode] = useState<DataMode>('SIM')
  const [openF1AccessToken, setOpenF1AccessToken] = useState<string | null>(null)
  const [openF1TokenDraft, setOpenF1TokenDraft] = useState('')
  const [historicalTimelineRatio, setHistoricalTimelineRatio] = useState(1)
  const [seed, setSeed] = useState(createAutoScenarioSeed)
  const [selectedTrackId, setSelectedTrackId] = useState(
    persistedWeekend?.trackId ?? defaultTrack.id,
  )
  const [selectedWeekendStage, setSelectedWeekendStage] =
    useState<WeekendStage>(() => {
      if (!persistedWeekend) {
        return 'race'
      }

      const persistedTrack =
        tracks.find((candidate) => candidate.id === persistedWeekend.trackId) ??
        defaultTrack

      return weekendStagesFor(persistedTrack).includes(persistedWeekend.stage)
        ? persistedWeekend.stage
        : 'race'
    })
  const [gridSource, setGridSource] = useState<GridSource>(
    persistedWeekend?.gridSource ?? 'qualifying',
  )
  const [teams, setTeams] = useState<Team[]>(() => copyTeams(initialTeams))
  const [drivers, setDrivers] = useState<Driver[]>(() => copyDrivers(initialDrivers))
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeams[0].id)
  const [selectedDriverId, setSelectedDriverId] = useState(initialDrivers[0].id)
  const [season, setSeason] = useState<SeasonState>(loadPersistedSeason)
  const [weekendContext, setWeekendContext] = useState(() =>
    persistedWeekend
      ? persistedWeekend.weekendContext
      : applySeasonGarageToWeekend(
          createWeekendContext(
            initialDrivers,
            defaultTrack.isSprintWeekend,
            defaultTrack,
          ),
          season,
          initialDrivers,
        ),
  )

  // Save/load: the local weekend survives reloads until the track changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        WEEKEND_STORAGE_KEY,
        JSON.stringify({
          version: 2,
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
  }, [gridSource, seed, selectedTrackId, selectedWeekendStage, weekendContext])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SEASON_STORAGE_KEY,
        JSON.stringify({ version: 3, ...season }),
      )
    } catch {
      // Championship persistence is optional when storage is unavailable.
    }
  }, [season])

  const track = useMemo(
    () => tracks.find((candidate) => candidate.id === selectedTrackId) ?? defaultTrack,
    [selectedTrackId],
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
    () =>
      ({
        ...track,
        observedCalibration: trackCalibration,
        ...(fieldCalibration.referenceLapTimeSeconds === null
          ? {}
          : {
            baseLapTime: fieldCalibration.referenceLapTimeSeconds,
            baseLapTimeSource: 'openf1-observed' as const,
          }),
      }),
    [fieldCalibration.referenceLapTimeSeconds, track, trackCalibration],
  )
  const baseConfig: RaceConfig = useMemo(
    () => ({
      drivers: fieldCalibration.drivers,
      seed: seed.trim() || 'free-run',
      teams: fieldCalibration.teams,
      track: calibratedTrack,
      weekendStage: selectedWeekendStage,
      weekendContext,
    }),
    [calibratedTrack, fieldCalibration, seed, selectedWeekendStage, weekendContext],
  )
  const weekendPracticeStages = useMemo<PracticeSessionName[]>(
    () => {
      if (track.isSprintWeekend) {
        return ['fp1']
      }

      if (selectedWeekendStage === 'fp1') {
        return ['fp1']
      }

      if (selectedWeekendStage === 'fp2') {
        return ['fp1', 'fp2']
      }

      return ['fp1', 'fp2', 'fp3']
    },
    [selectedWeekendStage, track.isSprintWeekend],
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
  const standardQualifying = useMemo(
    () => runKnockoutQualifying(preparedBaseConfig),
    [preparedBaseConfig],
  )
  const sprintShootout = useMemo(
    () => runSprintShootoutQualifying(preparedBaseConfig),
    [preparedBaseConfig],
  )
  const weekendTirePlan = useMemo(
    () =>
      buildWeekendTirePlan(
        preparedBaseConfig,
        standardQualifying,
        track.isSprintWeekend ? sprintShootout : null,
      ),
    [preparedBaseConfig, sprintShootout, standardQualifying, track.isSprintWeekend],
  )
  const knockoutQualifying = useMemo(
    () =>
      selectedWeekendStage === 'sprintQualifying'
        ? sprintShootout
        : standardQualifying,
    [selectedWeekendStage, sprintShootout, standardQualifying],
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
  const weekendStages = useMemo(() => weekendStagesFor(track), [track])
  const stageGridResults =
    selectedWeekendStage === 'sprint'
      ? sprintShootout.classification
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
        selectedWeekendStage === 'race' || selectedWeekendStage === 'sprint'
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
        (selectedWeekendStage === 'race' || selectedWeekendStage === 'sprint'
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
          (selectedWeekendStage === 'race' || selectedWeekendStage === 'sprint')
            ? openF1StartingTiresByCode.get(driver.code)
            : null

        if (openF1StartingTire) {
          return { ...driver, tire: openF1StartingTire }
        }

        if (!plan) {
          return driver
        }

        if (selectedWeekendStage === 'race') {
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
        selectedWeekendStage === 'qualifying'
          ? buildTimedSessionPlan(standardQualifying)
          : selectedWeekendStage === 'sprintQualifying'
            ? buildTimedSessionPlan(sprintShootout)
            : undefined

      return {
        ...preparedBaseConfig,
        drivers: raceDrivers,
        timedSessionPlan,
      }
    },
    [
      preparedBaseConfig,
      raceDrivers,
      selectedWeekendStage,
      sprintShootout,
      standardQualifying,
    ],
  )
  const {
    engineError,
    engineMode,
    snapshot,
    requestPitStop,
    setDriverPaceMode,
  } = useRaceSimulation({ config: raceConfig, isPaused, speed })
  const orderedCars = snapshot.cars

  useEffect(() => {
    if (
      snapshot.sessionStatus === 'finished' &&
      (selectedWeekendStage === 'race' || selectedWeekendStage === 'sprint')
    ) {
      setIsClassificationOpen(true)
    }
  }, [selectedWeekendStage, snapshot.sessionStatus])

  useEffect(() => {
    setIsClassificationOpen(false)
    setIsInsightsOpen(false)
    setHistoricalTimelineRatio(1)
  }, [selectedTrackId, selectedWeekendStage])

  // A finished race-distance session counts as weekend progress.
  useEffect(() => {
    if (
      snapshot.sessionStatus !== 'finished' ||
      (selectedWeekendStage !== 'race' && selectedWeekendStage !== 'sprint')
    ) {
      return
    }

    setWeekendContext((current) =>
      completeRaceSession(current, selectedWeekendStage, snapshot.cars),
    )
    setSeason((current) =>
      recordSeasonRound(current, {
        cars: snapshot.cars,
        greenFlagLaps: snapshot.greenFlagLaps,
        roundId: `${selectedTrackId}:${selectedWeekendStage}:${seed}`,
        scheduledLaps: snapshot.raceLaps,
        stage: selectedWeekendStage,
      }),
    )
  }, [
    seed,
    selectedTrackId,
    selectedWeekendStage,
    snapshot.cars,
    snapshot.greenFlagLaps,
    snapshot.raceLaps,
    snapshot.sessionStatus,
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
  const dataMode = resolveRequestedDataMode({
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
              snapshot.weatherLabel,
            ),
            rainLabel: `${weatherTrackState.rainLabel} S`,
          },
    [
      dataMode,
      latestOpenF1Weather,
      raceConfig.seed,
      raceConfig.track,
      snapshot.weatherLabel,
      weatherTrackState.rainLabel,
    ],
  )
  const isRaceProgressSession = isRaceDistanceSession(selectedWeekendStage)
  const selectedSessionDurationSeconds =
    raceConfig.timedSessionPlan?.totalDurationSeconds ??
    sessionDurationSecondsFor(selectedWeekendStage)
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
            ? `${activeTimedSegment.name} ${formatShortDuration(timedSegmentRemainingSeconds)}`
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
  const activePitCars = snapshot.cars.filter((car) => car.status === 'pit').length
  const liveTimingProgressLabel =
    isRaceProgressSession || selectedSessionDurationSeconds === null
      ? `Lap ${snapshot.leaderLap}/${snapshot.raceLaps} | ${snapshot.elapsedLabel}`
      : `${timedPhaseLabel} | ${snapshot.elapsedLabel} / ${formatShortDuration(selectedSessionDurationSeconds)}`
  const displayedWeekend = snapshot.weekend
  const displayedFlag = snapshot.flag
  const displayedFlagLabel = snapshot.flagLabel
  const displayedEventMessage = snapshot.eventMessage
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
            : car.position
        const displayGapToLeaderLabel =
          useObservedTiming
            ? (openF1LiveTiming?.gapToLeaderLabel ?? car.gapToLeaderLabel)
            : car.gapToLeaderLabel
        const displayIntervalLabel =
          useObservedTiming
            ? (openF1LiveTiming?.intervalLabel ?? intervalLabel(car))
            : intervalLabel(car)
        const latestCompletedLap = car.lapHistory.at(-1)
        const tireSampleCount =
          raceConfig.track.observedCalibration?.tireSampleCountByCompound[
            car.tire
          ] ?? 0
        const tireModel = {
          performancePaceDeltaSeconds:
            fieldCalibration.teamPaceDeltaSeconds[car.teamId] ?? null,
          performanceSource: fieldCalibration.source,
          tireModelSource:
            tireSampleCount >= 4
              ? ('openf1-calibrated' as const)
              : isDryCompound(car.tire) &&
                  raceConfig.track.tireNomination?.source === 'pirelli'
                ? ('pirelli' as const)
                : ('simulation' as const),
          tirePaceDeltaSeconds: tireDeltaSeconds(
            car.tire,
            car.tireAgeLaps,
            raceConfig.drivers.find((driver) => driver.id === car.driverId)
              ?.tireManagement ?? 0.8,
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
          ),
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
          lapTimeSeconds: car.lastLapTimeSeconds,
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
        personalTimingBestsForRow(row),
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
  },
    [
      openF1CarDataByCode,
      dataMode,
      openF1LiveState.positionsByCode,
      openF1LiveState.timingByCode,
      openF1TimingSources,
      fieldCalibration,
      raceConfig,
      snapshot.trackGrip,
      snapshot.weather,
      timingCars,
    ],
  )
  const sectorBoards = useMemo(
    () =>
      [0, 1, 2].map((sectorIndex) =>
        timingRows
          .filter(
            ({ car }) =>
              car.status !== 'retired' &&
              car.status !== 'disqualified' &&
              car.status !== 'dns',
          )
          .flatMap((row) => {
            const sectorTime = row.sectors[sectorIndex]

            return sectorTime === null
              ? []
              : [
                  {
                    car: row.car,
                    sectorTime,
                    status: row.sectorStatuses[sectorIndex],
                  },
                ]
          })
          .sort((a, b) => a.sectorTime - b.sectorTime)
          .slice(0, 10),
      ),
    [timingRows],
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
  const openF1TopResults = useMemo(
    () =>
      (openF1Bundle?.sessionResult ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, 5),
    [openF1Bundle],
  )

  const changeTrack = (trackId: string) => {
    const nextTrack = tracks.find((candidate) => candidate.id === trackId) ?? defaultTrack
    const stages = weekendStagesFor(nextTrack)

    const seasonWithCurrentWear = updateSeasonGarageFromCars(
      season,
      snapshot.cars,
    )

    setSeason(seasonWithCurrentWear)
    setSelectedTrackId(trackId)
    setSeed(createAutoScenarioSeed())
    setWeekendContext(
      applySeasonGarageToWeekend(
        createWeekendContext(drivers, nextTrack.isSprintWeekend, nextTrack),
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
      } else if (stage === 'qualifying') {
        next = completeQualifyingSession(
          next,
          'qualifying',
          standardQualifying.classification,
          standardQualifying.segments,
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

  const advanceWeekendStage = () => {
    setSeason((current) => updateSeasonGarageFromCars(current, snapshot.cars))

    if (isPracticeStage(selectedWeekendStage)) {
      setWeekendContext((current) =>
        completePracticeSession(
          current,
          selectedWeekendStage,
          practiceResults,
          snapshot.cars,
        ),
      )
    } else if (selectedWeekendStage === 'qualifying') {
      setWeekendContext((current) =>
        completeQualifyingSession(
          current,
          'qualifying',
          standardQualifying.classification,
          standardQualifying.segments,
          snapshot.cars,
        ),
      )
    } else if (selectedWeekendStage === 'sprintQualifying') {
      setWeekendContext((current) =>
        completeQualifyingSession(
          current,
          'sprintQualifying',
          sprintShootout.classification,
          sprintShootout.segments,
          snapshot.cars,
        ),
      )
    }
    const currentIndex = weekendStages.indexOf(selectedWeekendStage)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % weekendStages.length

    setSeed(createAutoScenarioSeed())
    setSelectedWeekendStage(weekendStages[nextIndex])
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
    stat: 'cornering' | 'straightLine' | 'reliability' | 'pitCrewSpeed',
    value: number,
  ) => {
    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === teamId ? { ...team, [stat]: value } : team,
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
          ? { ...driver, [stat]: clampDriverAbility(value) }
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
    const values = {
      back: { cornering: 0.7, pitCrewSpeed: 0.72, reliability: 0.74, straightLine: 0.72 },
      mid: { cornering: 0.8, pitCrewSpeed: 0.8, reliability: 0.82, straightLine: 0.8 },
      top: { cornering: 0.91, pitCrewSpeed: 0.9, reliability: 0.89, straightLine: 0.9 },
    }[preset]

    setTeams((currentTeams) =>
      currentTeams.map((team) =>
        team.id === selectedTeamId ? { ...team, ...values } : team,
      ),
    )
  }

  const resetGrid = () => {
    setTeams(copyTeams(initialTeams))
    setDrivers(copyDrivers(initialDrivers))
    setSelectedTeamId(initialTeams[0].id)
    setSelectedDriverId(initialDrivers[0].id)
    setSeed(createAutoScenarioSeed())
    setWeekendContext(
      applySeasonGarageToWeekend(
        createWeekendContext(initialDrivers, track.isSprintWeekend, track),
        season,
        initialDrivers,
      ),
    )
  }

  const randomSeed = () => {
    setSeed(createAutoScenarioSeed())
  }
  const effectiveGridLabel =
    gridSource === 'openf1'
      ? 'OpenF1'
      : gridSource === 'qualifying'
        ? selectedWeekendStage === 'sprint'
          ? 'SQ'
          : 'Quali'
        : 'Brief'
  const bestSetupTeam = practiceSetup.teamSummaries[0]
  const trackGeometrySource: BroadcastDataDetail['source'] =
    raceConfig.track.layoutSource?.provider === 'official'
      ? 'OFF'
      : raceConfig.track.layoutSource?.provider === 'openf1'
        ? 'OBS'
        : 'SIM'

  const broadcastDataDetails: BroadcastDataDetail[] = [
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
    {
      label: '2026 rulebook',
      source: 'FIA',
      value: `Sporting Iss ${FIA_2026_REGULATION_PROFILE.sporting.issue} / Technical Iss ${FIA_2026_REGULATION_PROFILE.technical.issue} / ${FIA_2026_REGULATION_PROFILE.asOf}`,
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
      value: engineError ? `Error: ${engineError}` : engineMode.toUpperCase(),
    },
  ]
  const broadcastDataControl = (
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
    </form>
  )
  const legacyLayoutRequested =
    new URLSearchParams(window.location.search).get('layout') === 'legacy'

  if (!legacyLayoutRequested) {
    return (
      <div className="race-shell broadcast-race-shell">
        <BroadcastDashboard
          cameraMode={cameraMode}
          dataControl={broadcastDataControl}
          dataDetails={broadcastDataDetails}
          dataMode={dataMode}
          dataModeAvailability={{
            HIST: latestOpenF1Sample !== null,
            LIVE: detectedDataMode === 'LIVE',
            SIM: true,
          }}
          engineLabel={`ENGINE ${engineMode.toUpperCase()}`}
          environment={environmentReadout}
          eventName={
            track.openF1?.meetingName ??
            fiaEventPack?.eventName ??
            `${track.location} Grand Prix`
          }
          isPaused={isPaused}
          onCameraModeChange={setCameraMode}
          onDataModeChange={setRequestedDataMode}
          onFocusDriver={focusDriver}
          onOpenClassification={() => {
            setIsClassificationOpen(true)
            setIsInsightsOpen(false)
          }}
          onOpenInsights={() => {
            setIsInsightsOpen(true)
            setIsClassificationOpen(false)
          }}
          onOpenSetup={() => setIsSetupOpen(true)}
          onPauseChange={() => setIsPaused((paused) => !paused)}
          onSpeedChange={setSpeed}
          raceControlLog={raceControlLog}
          selectedCar={selectedCar}
          sessionProgressLabel={broadcastSessionProgressLabel}
          snapshot={broadcastSnapshot}
          speed={speed}
          stage={selectedWeekendStage}
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
        />

        <SetupPanel
          componentReplacementDisabled={!isPaused}
          drivers={drivers}
          gridSource={gridSource}
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
          onTrackChange={changeTrack}
          openF1GridAvailable={openF1GridResults.length > 0}
          openF1GridStatus={openF1GridStatus}
          practiceResults={practiceResults}
          practiceSetup={practiceSetup}
          qualifyingResults={qualifyingResults}
          seed={seed}
          selectedDriverId={selectedDriverId}
          selectedTeamId={selectedTeamId}
          selectedTrackId={selectedTrackId}
          selectedWeekendStage={selectedWeekendStage}
          teams={teams}
          tracks={tracks}
          weekendContext={weekendContext}
          weekendTirePlan={weekendTirePlan}
        />

        {isClassificationOpen && isRaceProgressSession ? (
          <RaceClassificationPanel
            onClose={() => setIsClassificationOpen(false)}
            snapshot={snapshot}
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
      </div>
    )
  }

  return (
    <main className="race-shell">
      <Suspense
        fallback={
          <div className="scene-loading" role="status">
            Loading 3D circuit...
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

      <section className="hud hud-session" aria-label="session status">
        <div className="live-row">
          <span className="live-dot sim" aria-hidden="true" />
          <span title={engineError ?? undefined}>ENGINE {engineMode.toUpperCase()}</span>
          <strong>
            {snapshot.sessionStatus === 'finished'
              ? 'Finished'
              : displayedWeekend.label}
          </strong>
          <span className={`data-layer-tag ${dataMode.toLowerCase()}`}>
            OpenF1 {dataMode}
          </span>
          <div className="segmented data-mode-switch" aria-label="data mode">
            {dataModeOptions.map((mode) => (
              <button
                aria-pressed={requestedDataMode === mode}
                className={requestedDataMode === mode ? 'active' : ''}
                disabled={
                  (mode === 'HIST' && latestOpenF1Sample === null) ||
                  (mode === 'LIVE' && detectedDataMode !== 'LIVE')
                }
                key={mode}
                onClick={() => setRequestedDataMode(mode)}
                title={`${mode} data mode`}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="session-grid">
          <span>Race</span>
          <strong>{raceConfig.track.name}</strong>
          <span>Calendar</span>
          <strong
            className={
              raceConfig.track.calendar2026?.status === 'cancelled'
                ? 'flag-red'
                : 'flag-clear'
            }
            title={raceConfig.track.calendar2026?.sourceUrl}
          >
            {raceConfig.track.calendar2026?.status === 'cancelled'
              ? 'CANCELLED'
              : raceConfig.track.calendar2026?.championshipRound
                ? `R${raceConfig.track.calendar2026.championshipRound}`
                : 'EXHIBITION'}
          </strong>
          <span>Weekend</span>
          <strong title={displayedWeekend.source}>
            {displayedWeekend.label}
          </strong>
          <span>Start</span>
          <strong className={snapshot.startProcedure === 'racing' ? 'flag-clear' : 'flag-yellow'}>
            {snapshot.startProcedure === 'racing'
              ? 'RACING'
              : `${snapshot.startProcedure.toUpperCase()} ${Math.ceil(snapshot.startProcedureRemainingSeconds)}s`}
          </strong>
          <span>Formation</span>
          <strong>
            {isRaceProgressSession
              ? `${snapshot.formationLapsCompleted}/${snapshot.formationLapsPlanned}`
              : 'N/A'}
          </strong>
          <span>Restart</span>
          <strong className={snapshot.restartProcedure === 'none' ? undefined : 'flag-yellow'}>
            {snapshot.restartProcedure.toUpperCase()}
          </strong>
          <span>Overtake</span>
          <strong className={snapshot.overtakeEnabled ? 'flag-clear' : 'flag-yellow'}>
            {overtakeControlLabel(snapshot)}
          </strong>
          <span>Timed yellow</span>
          <strong className={snapshot.timedYellowUntilSeconds === null ? undefined : 'flag-yellow'}>
            {snapshot.timedYellowUntilSeconds === null
              ? 'CLEAR'
              : `S${(snapshot.timedYellowSector ?? 0) + 1} / ${Math.max(0, Math.ceil(snapshot.timedYellowUntilSeconds - snapshot.elapsedSeconds))}s`}
          </strong>
          <span>Layout</span>
          <strong
            className={
              raceConfig.track.layoutSource?.detail === 'real'
                ? 'flag-clear'
                : 'flag-yellow'
            }
            title={raceConfig.track.layoutSource?.label}
          >
            {raceConfig.track.layoutSource?.detail === 'real' ? 'Real' : 'Fallback'}
          </strong>
          <span>Track packs</span>
          <strong
            className={
              trackCalendarAudit.errorCount === 0 ? 'flag-clear' : 'flag-red'
            }
            title={`${trackCalendarAudit.warningCount} warnings / ${trackCalendarAudit.errorCount} errors`}
          >
            {trackCalendarAudit.realLayoutCount}/{trackCalendarAudit.trackCount} REAL{' '}
            {trackCalendarAudit.scorePercent}%
          </strong>
          <span>Grid</span>
          <strong>
            {raceConfig.drivers.length} cars / {effectiveGridLabel}
          </strong>
          <span>Setup</span>
          <strong title={bestSetupTeam?.teamName}>
            {bestSetupTeam
              ? `${Math.round(bestSetupTeam.score)} ${bestSetupTeam.teamName.split(' ')[0]}`
              : '-'}
          </strong>
          <span>Weekend done</span>
          <strong title={weekendContext.notes.join(' / ')}>
            {weekendContext.completed.length}/{weekendStages.length}
          </strong>
          <span>{isRaceProgressSession ? 'Lap' : 'Clock'}</span>
          <strong>{sessionProgressLabel}</strong>
          <span>Phase</span>
          <strong
            className={
              snapshot.timedSessionSuspended
                ? 'flag-red'
                : activeTimedSegment
                  ? 'flag-clear'
                  : undefined
            }
          >
            {timedPhaseLabel}
          </strong>
          <span>Format</span>
          <strong
            title={
              isRaceProgressSession
                ? `${raceConfig.track.raceLapsSource === 'official' ? 'Official' : 'Estimated'} race distance`
                : compactSessionDurationLabel(selectedWeekendStage)
            }
          >
            {isRaceProgressSession
              ? `${raceConfig.track.raceLapsSource === 'official' ? 'Official' : 'Est.'} distance`
              : compactSessionDurationLabel(selectedWeekendStage)}
          </strong>
          <span>Pace ref</span>
          <strong
            className={
              raceConfig.track.baseLapTimeSource === 'openf1-observed'
                ? 'flag-clear'
                : 'flag-yellow'
            }
            title={
              raceConfig.track.baseLapTimeSource === 'openf1-observed'
                ? 'OpenF1 observed clean-lap reference'
                : 'Simulator estimated reference lap'
            }
          >
            {formatLapTime(raceConfig.track.baseLapTime)}{' '}
            {raceConfig.track.baseLapTimeSource === 'openf1-observed'
              ? 'OBS'
              : 'EST'}
          </strong>
          <span>Flag</span>
          <strong className={`flag-${displayedFlag}`}>{displayedFlagLabel}</strong>
          <span>Fuel effect</span>
          <strong>+{snapshot.fuelEffectSeconds.toFixed(1)}s</strong>
          <span>Track evo</span>
          <strong>{Math.round(snapshot.trackEvolutionLevel * 100)}%</strong>
          <span>Weather</span>
          <strong>{snapshot.weatherLabel}</strong>
          <span>Rain</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.rainLabel}
          </strong>
          <span>Track temp</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.trackLabel}
          </strong>
          <span>Air</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.airLabel}
          </strong>
          <span>Wind</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.windLabel}
          </strong>
          <span>Humidity</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.humidityLabel}
          </strong>
          <span>Pressure</span>
          <strong title={environmentReadout.source}>
            {environmentReadout.pressureLabel}
          </strong>
          <span>Wetness</span>
          <strong>
            {(snapshot.surfaceWaterMmBySector.reduce((sum, value) => sum + value, 0) / 3).toFixed(2)}mm
          </strong>
          <span>Dry line</span>
          <strong>
            {Math.round(snapshot.dryingLineBySector.reduce((sum, value) => sum + value, 0) / 3 * 100)}%
          </strong>
          <span>Forecast</span>
          <strong title={snapshot.weatherForecastLabel}>
            {compactForecastLabel(snapshot.weatherForecastLabel)}
          </strong>
          <span>Grip</span>
          <strong>{Math.round(snapshot.trackGrip * 100)}%</strong>
          <span>Pit lane</span>
          <strong className={snapshot.pitLaneOpen ? 'flag-clear' : 'flag-red'}>
            {snapshot.pitLaneOpen ? 'OPEN' : 'CLOSED'}
          </strong>
          <span>Pit activity</span>
          <strong title="Routine green-flag stops are staggered when the lane is busy">
            {activePitCars} active
          </strong>
          <span>OpenF1</span>
          <strong>
            {openF1State.status === 'loading'
              ? 'Loading'
              : openF1Bundle?.meeting
                ? `M${openF1Bundle.meeting.meeting_key}`
                : 'No link'}
          </strong>
          <span>Data age</span>
          <strong title="Age of newest OpenF1 timing, telemetry, weather, or race-control sample">
            {openF1DataAge}
          </strong>
          <span>Field data</span>
          <strong title="Team and driver performance source">
            {fieldCalibration.source === 'openf1-calibrated'
              ? `${
                  seasonStandings.data?.snapshotSource === 'bundled'
                    ? 'Snap'
                    : 'Cal'
                } ${seasonStandings.data?.sourceYear ?? ''} ${Math.round(fieldCalibration.confidence * 100)}%`
              : seasonStandings.status === 'loading'
                ? 'Loading'
                : 'Model'}
          </strong>
          <span>API race ctrl</span>
          <strong>
            {openF1LiveState.raceControlMessage
              ? dataMode
              : 'No sample'}
          </strong>
        </div>
        <div className="weekend-flow" aria-label="weekend flow">
          {weekendStages.map((stage) => {
            const isDone = weekendContext.completed.includes(stage)
            const skipsSessions =
              weekendStages.indexOf(stage) > weekendStages.indexOf(selectedWeekendStage) &&
              weekendStages
                .slice(0, weekendStages.indexOf(stage))
                .some((earlier) => !weekendContext.completed.includes(earlier))

            return (
              <button
                aria-pressed={selectedWeekendStage === stage}
                className={isDone ? 'stage-done' : undefined}
                key={stage}
                onClick={() => jumpToWeekendStage(stage)}
                title={`Set weekend stage to ${weekendStageLabels[stage]}${
                  skipsSessions
                    ? ' (locks in skipped sessions first)'
                    : isDone
                      ? ' (completed)'
                      : ''
                }`}
                type="button"
              >
                {weekendStageLabels[stage]}
              </button>
            )
          })}
          <button
            aria-label="advance weekend stage"
            className="weekend-next"
            onClick={advanceWeekendStage}
            title="Advance weekend stage"
            type="button"
          >
            <StepForward aria-hidden="true" size={13} />
          </button>
        </div>
        {isRaceControlLogOpen ? (
          <div className="event-log" aria-label="recent race events">
            <div className="event-log-header">
              <span className="event-log-title">Race control</span>
              <button
                aria-label="hide race control log"
                onClick={() => setIsRaceControlLogOpen(false)}
                title="Hide race control log"
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            </div>
            <ol>
              {raceControlLog.map((event) => (
                <li key={event.id}>
                  <span className="event-time">{event.timeLabel}</span>
                  <span className={`event-source event-source-${event.source.toLowerCase()}`}>
                    {event.source}
                  </span>
                  <span className="event-text">{event.message}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="hud hud-controls" aria-label="camera and playback">
        <div className="segmented" aria-label="camera mode">
          {cameraModes.map(({ mode, label, title, Icon }) => (
            <button
              aria-pressed={cameraMode === mode}
              className="icon-button"
              key={mode}
              onClick={() => setCameraMode(mode)}
              title={title}
              type="button"
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="playback-row">
          <button
            aria-label="toggle OpenF1 data"
            aria-pressed={isOpenF1PanelOpen}
            className="round-button secondary"
            onClick={() => setIsOpenF1PanelOpen((isOpen) => !isOpen)}
            title={isOpenF1PanelOpen ? 'Hide OpenF1 data' : 'Show OpenF1 data'}
            type="button"
          >
            <Badge aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="toggle OpenF1 car overlay"
            aria-pressed={showOpenF1Cars}
            className="round-button secondary"
            disabled={!openF1TrackProgressAvailable}
            onClick={() => setShowOpenF1Cars((isShown) => !isShown)}
            title={
              !openF1TrackProgressAvailable
                ? raceConfig.track.locationProjection
                  ? 'OpenF1 car positions unavailable: no recent location samples'
                  : 'OpenF1 car positions unavailable: no matching telemetry coordinate projection'
                : showOpenF1Cars
                  ? 'Hide factual OpenF1 car positions'
                  : `Show factual OpenF1 car positions (${openF1TrackProgressMode} window replay)`
            }
            type="button"
          >
            <Radar aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="toggle live timing"
            aria-pressed={isLiveTimingOpen}
            className="round-button secondary"
            onClick={() => setIsLiveTimingOpen((isOpen) => !isOpen)}
            title={isLiveTimingOpen ? 'Hide live timing' : 'Show live timing'}
            type="button"
          >
            <CircleGauge aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="toggle sector boards"
            aria-pressed={areSectorBoardsOpen}
            className="round-button secondary"
            onClick={() => setAreSectorBoardsOpen((isOpen) => !isOpen)}
            title={areSectorBoardsOpen ? 'Hide sector boards' : 'Show sector boards'}
            type="button"
          >
            <Table2 aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="toggle race control log"
            aria-pressed={isRaceControlLogOpen}
            className="round-button secondary"
            onClick={() => setIsRaceControlLogOpen((isOpen) => !isOpen)}
            title={
              isRaceControlLogOpen
                ? 'Hide race control log'
                : 'Show race control log'
            }
            type="button"
          >
            <ClipboardList aria-hidden="true" size={18} />
          </button>
          {isRaceProgressSession ? (
            <button
              aria-label="toggle classification"
              aria-pressed={isClassificationOpen}
              className="round-button secondary"
              onClick={() => {
                setIsClassificationOpen((isOpen) => !isOpen)
                setIsOpenF1PanelOpen(false)
                setAreSectorBoardsOpen(false)
              }}
              title={isClassificationOpen ? 'Hide classification' : 'Show classification'}
              type="button"
            >
              <Trophy aria-hidden="true" size={18} />
            </button>
          ) : null}
          {isRaceProgressSession ? (
            <button
              aria-label="toggle race analysis"
              aria-pressed={isInsightsOpen}
              className="round-button secondary"
              onClick={() => {
                setIsInsightsOpen((isOpen) => !isOpen)
                setIsLiveTimingOpen(false)
                setIsOpenF1PanelOpen(false)
                setAreSectorBoardsOpen(false)
                setIsClassificationOpen(false)
              }}
              title={isInsightsOpen ? 'Hide race analysis' : 'Show race analysis'}
              type="button"
            >
              <BarChart3 aria-hidden="true" size={18} />
            </button>
          ) : null}
          <button
            aria-pressed={isSetupOpen}
            aria-label="open setup"
            className="round-button secondary"
            onClick={() => setIsSetupOpen((isOpen) => !isOpen)}
            title="Setup"
            type="button"
          >
            <Settings2 aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={isPaused ? 'resume simulation' : 'pause simulation'}
            className="round-button"
            onClick={() => setIsPaused((paused) => !paused)}
            title={isPaused ? 'Resume' : 'Pause'}
            type="button"
          >
            {isPaused ? (
              <Play aria-hidden="true" size={18} />
            ) : (
              <Pause aria-hidden="true" size={18} />
            )}
          </button>
          <div className="segmented compact" aria-label="simulation speed">
            {speedOptions.map((option) => (
              <button
                aria-pressed={speed === option}
                className="speed-button"
                key={option}
                onClick={() => setSpeed(option)}
                title={`Speed ${option}x`}
                type="button"
              >
                {option}x
              </button>
            ))}
          </div>
        </div>
      </section>

      <SetupPanel
        drivers={drivers}
        isOpen={isSetupOpen}
        onApplyTeamPreset={applyTeamPreset}
        onDriverChange={focusDriver}
        onDriverStatChange={updateDriverStat}
        onCarSetupChange={updateCarSetup}
        onComponentReplace={replaceComponent}
        onPitLaneStartChange={setPitLaneStart}
        componentReplacementDisabled={!isPaused}
        openF1GridAvailable={openF1GridResults.length > 0}
        openF1GridStatus={openF1GridStatus}
        onRandomSeed={randomSeed}
        onResetGrid={resetGrid}
        onGridSourceChange={setGridSource}
        onSeedChange={setSeed}
        onTeamChange={setSelectedTeamId}
        onTeamStatChange={updateTeamStat}
        onToggle={() => setIsSetupOpen((isOpen) => !isOpen)}
        onTrackChange={changeTrack}
        seed={seed}
        selectedDriverId={selectedDriverId}
        selectedTeamId={selectedTeamId}
        selectedTrackId={selectedTrackId}
        gridSource={gridSource}
        knockoutQualifying={knockoutQualifying}
        practiceResults={practiceResults}
        practiceSetup={practiceSetup}
        qualifyingResults={qualifyingResults}
        selectedWeekendStage={selectedWeekendStage}
        teams={teams}
        weekendTirePlan={weekendTirePlan}
        weekendContext={weekendContext}
        tracks={tracks}
      />

      {isOpenF1PanelOpen ? (
      <section className="hud openf1-panel" aria-label="OpenF1 data">
        <header>
          <span>OpenF1 API</span>
          <strong>{openF1StatusLabel(openF1Bundle)}</strong>
          <button
            aria-label="hide OpenF1 data"
            onClick={() => setIsOpenF1PanelOpen(false)}
            title="Hide OpenF1 data"
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </header>
        {openF1State.status === 'loading' ? (
          <div className="openf1-placeholder">
            Collecting meetings, sessions, timing, weather, pit, control and
            telemetry data...
          </div>
        ) : openF1State.status === 'error' ? (
          <div className="openf1-placeholder">{openF1State.error}</div>
        ) : openF1Bundle?.meeting ? (
          <>
            <div className="openf1-meeting">
              {openF1Bundle.meeting.circuit_image ? (
                <img
                  alt={`${openF1Bundle.meeting.circuit_short_name} track map`}
                  src={openF1Bundle.meeting.circuit_image}
                />
              ) : null}
              <div>
                <strong>{openF1Bundle.meeting.meeting_name}</strong>
                <span>
                  {openF1Bundle.meeting.circuit_short_name} |{' '}
                  {openF1Bundle.meeting.country_code}
                </span>
                <small>
                  {formatOpenF1Date(
                    openF1Bundle.selectedSession?.date_start ??
                      openF1Bundle.meeting.date_start,
                  )}
                </small>
              </div>
            </div>
            {requestedDataMode === 'HIST' &&
            openF1Timeline.endMs > openF1Timeline.startMs ? (
              <label className="openf1-timeline">
                <span>HIST timeline</span>
                <input
                  aria-label="OpenF1 historical timeline"
                  max="1000"
                  min="0"
                  onChange={(event) =>
                    setHistoricalTimelineRatio(Number(event.target.value) / 1000)
                  }
                  type="range"
                  value={Math.round(historicalTimelineRatio * 1000)}
                />
                <strong>
                  {openF1Timeline.targetDate
                    ? openF1ClockLabel(openF1Timeline.targetDate)
                    : '-'}
                </strong>
              </label>
            ) : null}
            <div className="openf1-metrics">
              <span>Layout</span>
              <strong
                className={
                  raceConfig.track.layoutSource?.detail === 'real'
                    ? 'flag-clear'
                    : 'flag-yellow'
                }
                title={raceConfig.track.layoutSource?.label}
              >
                {raceConfig.track.layoutSource?.detail === 'real' ? 'Real' : 'Fallback'}
              </strong>
              <span>Track audit</span>
              <strong title={`${trackCalendarAudit.warningCount} warning / ${trackCalendarAudit.errorCount} error`}>
                {trackCalendarAudit.scorePercent}%
              </strong>
              <span>FIA pack</span>
              <strong title={`As of ${fiaEventPack?.asOf ?? '-'}`}>
                {fiaEventPack?.status.toUpperCase() ?? 'NONE'}
              </strong>
              <span>Telemetry</span>
              <strong>{openF1Bundle.summary.telemetrySamples}</strong>
              <span>Sync frame</span>
              <strong
                className={
                  openF1TelemetryFrame.byCode.size > 0 ? 'flag-clear' : undefined
                }
                title={openF1TelemetryFrame.provenance.note ?? undefined}
              >
                {openF1TelemetryFrame.byCode.size} cars
              </strong>
              <span>Frame time</span>
              <strong>
                {openF1TelemetryFrame.targetDate
                  ? openF1ClockLabel(openF1TelemetryFrame.targetDate)
                  : '-'}
              </strong>
              <span>Stale drop</span>
              <strong
                className={
                  openF1TelemetryFrame.rejectedStaleSamples > 0
                    ? 'flag-yellow'
                    : undefined
                }
              >
                {openF1TelemetryFrame.rejectedStaleSamples}
              </strong>
              <span>Field model</span>
              <strong title={fieldCalibration.provenance.note ?? undefined}>
                {fieldCalibration.source === 'openf1-calibrated'
                  ? `${
                      seasonStandings.data?.snapshotSource === 'bundled'
                        ? 'SNAP'
                        : 'CAL'
                    } ${Math.round(fieldCalibration.confidence * 100)}%`
                  : 'SIM'}
              </strong>
              <span>Track model</span>
              <strong title={trackCalibration.provenance.note ?? undefined}>
                {trackCalibration.sampleCount > 0
                  ? `CAL ${trackCalibration.sampleCount}`
                  : 'SIM'}
              </strong>
              <span>Pit transit</span>
              <strong>
                {trackCalibration.pitLaneTransitSeconds === null
                  ? '-'
                  : `${trackCalibration.pitLaneTransitSeconds.toFixed(1)}s`}
              </strong>
              <span>Live pos</span>
              <strong>{openF1LiveState.positionsByCode.size}</strong>
              <span>Track pos</span>
              <strong
                className={openF1TrackProgressAvailable ? 'flag-clear' : undefined}
                title={
                  openF1TrackProgressAvailable
                    ? `Replay of the newest fetched OpenF1 location window. Cars sit on the racing line: OpenF1 lateral placement is not reliable at this scale. ${openF1TrackProgress.rejectedSamples} off-track samples dropped.`
                    : raceConfig.track.locationProjection
                      ? 'No recent OpenF1 location samples for this session'
                      : 'No matching OpenF1 telemetry coordinate projection'
                }
              >
                {openF1TrackProgressAvailable
                  ? `${openF1TrackProgress.cars.length} cars / ${openF1TrackProgressMode}`
                  : 'Unavailable'}
              </strong>
              <span>Intervals</span>
              <strong>{openF1LiveState.timingByCode.size}</strong>
              <span>Datasets</span>
              <strong>
                {openF1LoadedEndpoints}/{openF1RequestedEndpoints}
              </strong>
              <span>Mini S</span>
              <strong>{openF1Bundle.summary.miniSectorSamples}</strong>
              <span>Session</span>
              <strong title={openF1Bundle.selectedSession?.session_name}>
                {openF1Bundle.selectedSession
                  ? `${openF1Bundle.selectedSession.session_name} / ${openF1Bundle.selectedSession.session_key}`
                  : `${weekendStageLabels[openF1Bundle.requestedStage]} unavailable`}
              </strong>
              <span>Access</span>
              <strong
                className={
                  openF1Bundle.authMode === 'bearer' ? 'flag-clear' : undefined
                }
              >
                {openF1Bundle.authMode === 'bearer' ? 'AUTH' : 'PUBLIC'}
              </strong>
              <span>Best lap</span>
              <strong>
                {openF1Bundle.summary.bestLap
                  ? `${openF1DriverLabel(
                      openF1Bundle,
                      openF1Bundle.summary.bestLap.driver_number,
                    )} ${formatLapTime(
                      openF1Bundle.summary.bestLap.lap_duration ?? 0,
                    )}`
                  : '-'}
              </strong>
              <span>Weather</span>
              <strong>
                {latestOpenF1Weather
                  ? `${formatTemperature(latestOpenF1Weather.track_temperature)} track / ${formatTemperature(latestOpenF1Weather.air_temperature)} air`
                  : '-'}
              </strong>
              <span>Wind</span>
              <strong>
                {latestOpenF1Weather
                  ? `${latestOpenF1Weather.wind_speed.toFixed(1)} m/s ${Math.round(
                      latestOpenF1Weather.wind_direction,
                    )}deg`
                  : '-'}
              </strong>
              <span>Humidity</span>
              <strong>
                {latestOpenF1Weather
                  ? `${Math.round(latestOpenF1Weather.humidity)}%`
                  : '-'}
              </strong>
              <span>Pits</span>
              <strong>{openF1Bundle.pit.length}</strong>
              <span>Stints</span>
              <strong>{openF1Bundle.stints.length}</strong>
              <span>Overtakes</span>
              <strong>{openF1Bundle.overtakes.length}</strong>
              <span>Radio</span>
              <strong>{openF1Bundle.teamRadio.length}</strong>
              <span>Fast stop</span>
              <strong>
                {openF1Bundle.summary.fastestPitStop
                  ? `${openF1DriverLabel(
                      openF1Bundle,
                      openF1Bundle.summary.fastestPitStop.driver_number,
                    )} ${formatSeconds(
                      openF1Bundle.summary.fastestPitStop.stop_duration,
                    )}s`
                  : '-'}
              </strong>
              <span>Top speed</span>
              <strong>
                {openF1Bundle.summary.maxSpeed
                  ? `${openF1DriverLabel(
                      openF1Bundle,
                      openF1Bundle.summary.maxSpeed.driver_number,
                    )} ${openF1Bundle.summary.maxSpeed.speed} km/h`
                  : '-'}
              </strong>
            </div>
            <form
              className="openf1-auth"
              onSubmit={(event) => {
                event.preventDefault()
                const token = openF1TokenDraft.trim()
                setOpenF1AccessToken(token || null)
              }}
            >
              <KeyRound aria-hidden="true" size={14} />
              <label>
                <span>Bearer token</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setOpenF1TokenDraft(event.target.value)}
                  placeholder="OpenF1 access token"
                  type="password"
                  value={openF1TokenDraft}
                />
              </label>
              <button
                aria-label="apply OpenF1 access token"
                title="Apply token for this app session"
                type="submit"
              >
                <Check aria-hidden="true" size={14} />
              </button>
              {openF1AccessToken ? (
                <button
                  aria-label="clear OpenF1 access token"
                  onClick={() => {
                    setOpenF1AccessToken(null)
                    setOpenF1TokenDraft('')
                  }}
                  title="Clear access token"
                  type="button"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              ) : null}
            </form>
            <div className="source-ledger" aria-label="data source ledger">
              <a
                href={sourceRegistry.fiaCalendar2026.url}
                rel="noreferrer"
                target="_blank"
              >
                <span>2026 calendar</span>
                <strong>FIA OFFICIAL</strong>
              </a>
              {fiaEventPack ? (
                <a
                  href={fiaEventPack.documents.eventPageUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>Event documents</span>
                  <strong>
                    {fiaEventPack.normalizedOperationalData
                      ? 'FIA NORMALIZED'
                      : fiaEventPack.status === 'pending'
                        ? 'FIA PENDING'
                        : 'FIA LINKED'}
                  </strong>
                </a>
              ) : null}
              {fiaEventPack?.documents.circuitMapUrl ? (
                <a
                  href={fiaEventPack.documents.circuitMapUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>Circuit / pit map</span>
                  <strong>FIA PDF</strong>
                </a>
              ) : null}
              <a
                href={sourceRegistry.fiaSporting2026.url}
                rel="noreferrer"
                target="_blank"
              >
                <span>Sporting rules</span>
                <strong>FIA ISSUE 07</strong>
              </a>
              <a
                href={
                  raceConfig.track.layoutSource?.url ??
                  sourceRegistry.openF1.url
                }
                rel="noreferrer"
                target="_blank"
              >
                <span>Track geometry</span>
                <strong>
                  {raceConfig.track.layoutSource?.detail === 'real'
                    ? raceConfig.track.layoutSource.provider === 'official'
                      ? 'OFFICIAL VECTOR'
                      : 'OPENF1 OBS'
                    : 'FALLBACK'}
                </strong>
              </a>
              {raceConfig.track.tireNomination?.sourceUrl ? (
                <a
                  href={raceConfig.track.tireNomination.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>Tyre nomination</span>
                  <strong>PIRELLI</strong>
                </a>
              ) : (
                <span className="source-ledger-row">
                  <span>Tyre nomination</span>
                  <strong>EST PENDING</strong>
                </span>
              )}
              <span className="source-ledger-row">
                <span>Pit/aero lines</span>
                <strong>DERIVED</strong>
              </span>
            </div>
            {openF1Bundle.summary.latestRaceControl ? (
              <div className="openf1-control">
                <span>{openF1Bundle.summary.latestRaceControl.category}</span>
                <strong>{openF1Bundle.summary.latestRaceControl.message}</strong>
              </div>
            ) : null}
            {openF1TopResults.length > 0 ? (
              <ol className="openf1-results" aria-label="OpenF1 top result">
                {openF1TopResults.map((result) => (
                  <li key={result.driver_number}>
                    <span>{result.position}</span>
                    <strong>
                      {openF1DriverLabel(openF1Bundle, result.driver_number)}
                    </strong>
                    <span>
                      {formatOpenF1ResultGap(
                        result.gap_to_leader,
                        result.position,
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <div className="openf1-placeholder">
            No OpenF1 meeting matched this local track.
          </div>
        )}
      </section>
      ) : null}

      {isLiveTimingOpen ? (
        <section className="hud leaderboard" aria-label="live timing">
          <div className="leaderboard-header">
            <span>
              <CircleGauge aria-hidden="true" size={17} />
              Live Timing
            </span>
            <span className="time-readout">
              {liveTimingProgressLabel}
            </span>
            <button
              aria-label="hide live timing"
              onClick={() => setIsLiveTimingOpen(false)}
              title="Hide live timing"
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
          <div className="timing-table-scroll">
            <div className="timing-header-row" role="row">
              <span>Driver</span>
              <span>Team</span>
              <span>Last lap</span>
              <span>Src</span>
              <span>Speed</span>
              <span>Thr</span>
              <span>Brake</span>
              <span>RPM</span>
              <span>Gear</span>
              <span>Aero/OVT</span>
              <span>Gap</span>
              <span>Interval</span>
              <span>Tyre</span>
              <span>Age</span>
              <span>Temp</span>
              <span>Battery</span>
              <span>Sector 1</span>
              <span>S1 uS</span>
              <span>Sector 2</span>
              <span>S2 uS</span>
              <span>Sector 3</span>
              <span>S3 uS</span>
            </div>
            <ol>
              {timingRows.map(
                ({
                  batteryPercent,
                  brakePercent,
                  car,
                  displayGapToLeaderLabel,
                  displayIntervalLabel,
                  displayPosition,
                  aeroOvertakeLabel,
                  gear,
                  lapDataLabel,
                  lapTimeSeconds,
                  microSectors,
                  rpm,
                  sectors,
                  sectorStatuses,
                  source,
                  speedKph,
                  telemetrySource,
                  throttlePercent,
                  tireTemperatureC,
                }) => (
                  <li
                    className={[
                      car.driverId === selectedCar.driverId ? 'selected' : '',
                      terminalStatusLabel(car) ? 'retired' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={car.driverId}
                  >
                    <button
                      className="timing-row"
                      onClick={() => focusDriver(car.driverId)}
                      title={`Focus ${car.driverName}${car.timedRunPhase ? ` / ${car.timedRunPhase}` : ''} / ${lapDataLabel}${telemetrySource === 'openf1' ? ' / OpenF1 observed telemetry' : ' / simulated telemetry'}${car.stewardNote ? ` / ${car.stewardNote}` : ''}`}
                      type="button"
                    >
                      <span className="driver-cell">
                        <span
                          className="position-badge"
                          style={{ backgroundColor: car.teamColor }}
                        >
                          {displayPosition}
                        </span>
                        <span className="code-stack">
                          <span className="timing-code">{car.code}</span>
                          {car.stewardStatus !== 'clear' ? (
                            <span className={`steward-chip steward-${car.stewardStatus}`}>
                              {stewardChipLabel(car)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="timing-team" title={car.teamName}>
                        {shortTeamName(car.teamName)}
                      </span>
                      <span className="timing-number">
                        {formatLapTime(lapTimeSeconds)}
                      </span>
                      <span
                        className="source-stack"
                        title={`Lap/sector: ${lapDataLabel} / Telemetry: ${
                          telemetrySource === 'openf1'
                            ? 'OpenF1 observed data'
                            : telemetrySource === 'simulation'
                              ? 'simulation estimate'
                              : 'unavailable'
                        }`}
                      >
                        <span className={`source-chip source-mini source-${source}`}>
                          L
                        </span>
                        <span
                          className={`source-chip source-mini source-${telemetrySource}`}
                        >
                          T
                        </span>
                      </span>
                      <span className="timing-number">{speedKph}</span>
                      <span className="timing-number">{throttlePercent}%</span>
                      <span className="timing-number">{brakePercent}%</span>
                      <span className="timing-number">{rpm}</span>
                      <span className="timing-number">{gear}</span>
                      <span
                        className={`drs-chip drs-${aeroOvertakeLabel.includes('OVT') || aeroOvertakeLabel.includes('ON') ? 'on' : aeroOvertakeLabel.includes('RDY') ? 'elig' : 'off'}`}
                        title={`Active aero / Overtake: ${aeroOvertakeLabel}`}
                      >
                        {aeroOvertakeLabel}
                      </span>
                      <span
                        className={`gap ${
                          terminalStatusLabel(car)
                            ? 'status-out'
                            : car.status === 'pit'
                              ? 'status-pit'
                              : ''
                        }`}
                      >
                        {terminalStatusLabel(car)
                          ? terminalStatusLabel(car)
                          : car.status === 'pit'
                            ? 'PIT'
                            : displayGapToLeaderLabel}
                      </span>
                      <span
                        className={`gap interval ${
                          terminalStatusLabel(car)
                            ? 'status-out'
                            : car.status === 'pit'
                              ? 'status-pit'
                              : ''
                        }`}
                      >
                        {terminalStatusLabel(car) || car.status === 'pit'
                          ? intervalLabel(car)
                          : displayIntervalLabel}
                      </span>
                      <span
                        className={`tire tire-${car.tire}`}
                        title={`Tire ${car.tire}${car.tire === 'H' || car.tire === 'M' || car.tire === 'S' ? ` (${track.tireNomination?.[car.tire] ?? 'family unavailable'})` : ''} / lap ${car.tireAgeLaps}`}
                      >
                        {car.tire}
                      </span>
                      <span className="timing-number">{car.tireAgeLaps}</span>
                      <span className="timing-number">{tireTemperatureC}C</span>
                      <span
                        className="battery-cell"
                        title={`Battery ${batteryPercent}% / estimated MGU-K deployment ${car.ersPowerKw} kW / Overtake ${car.overtakeEnergyRemainingMj.toFixed(2)} of 0.50 MJ / harvested ${car.energyHarvestedThisLapMj.toFixed(2)} of 7.00 MJ this lap`}
                      >
                        <span>{batteryPercent}%</span>
                        <span className="battery-meter" aria-hidden="true">
                          <span style={{ width: `${batteryPercent}%` }} />
                        </span>
                      </span>
                      {[0, 1, 2].map((sectorIndex) => (
                        <span className="sector-pair" key={sectorIndex}>
                          <span
                            className={`sector-time sector-status-${sectorStatuses[sectorIndex]}`}
                          >
                            {formatSector(sectors[sectorIndex])}
                          </span>
                          <span
                            className="micro-bars"
                            aria-label={miniSectorAriaLabel(
                              microSectors[sectorIndex],
                              sectorIndex,
                            )}
                            style={{
                              gridTemplateColumns: `repeat(${
                                microSectors[sectorIndex].length
                              }, minmax(2px, 1fr))`,
                            }}
                          >
                            {microSectors[sectorIndex].map((state, microIndex) => (
                              <span
                                aria-hidden="true"
                                className={`micro-bar micro-${state}`}
                                key={`${sectorIndex}-${microIndex}`}
                              />
                            ))}
                          </span>
                        </span>
                      ))}
                    </button>
                  </li>
                ),
              )}
            </ol>
          </div>
        </section>
      ) : null}

      {areSectorBoardsOpen ? (
        <section className="hud sector-boards" aria-label="sector leaders">
          <div className="sector-boards-header">
            <span>Sector Leaders</span>
            <button
              aria-label="hide sector boards"
              onClick={() => setAreSectorBoardsOpen(false)}
            title="Hide sector boards"
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
          </div>
          <div className="sector-board-grid">
            {sectorBoards.map((entries, sectorIndex) => (
              <div className="sector-board" key={sectorIndex}>
                <header>
                  <span>Sector {sectorIndex + 1}</span>
                  <strong>
                    {entries[0] ? formatSector(entries[0].sectorTime) : '--.---'}
                  </strong>
                </header>
                <ol>
                  {entries.map(({ car, sectorTime, status }, index) => (
                    <li
                      className={
                        car.driverId === selectedCar.driverId ? 'selected' : ''
                      }
                      key={car.driverId}
                    >
                      <span>{index + 1}</span>
                      <strong style={{ color: car.teamColor }}>{car.code}</strong>
                      <span className={`sector-status-${status}`}>
                        {formatSector(sectorTime)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isClassificationOpen && isRaceProgressSession ? (
        <RaceClassificationPanel
          onClose={() => setIsClassificationOpen(false)}
          snapshot={snapshot}
        />
      ) : null}

      {isInsightsOpen && isRaceProgressSession && selectedDriver ? (
        <RaceInsightsPanel
          car={selectedCar}
          openF1Mode={dataMode}
          driver={selectedDriver}
          onClose={() => setIsInsightsOpen(false)}
          snapshot={snapshot}
          telemetryIsOpenF1={openF1CarDataByCode.has(selectedCar.code)}
          timingIsOpenF1={openF1TimingSources.has(selectedCar.code)}
          track={track}
          weekendContext={weekendContext}
          season={season}
          onRequestPitStop={requestPitStop}
          onSetDriverPaceMode={setDriverPaceMode}
        />
      ) : null}

      {!isRaceControlLogOpen &&
      !isLiveTimingOpen &&
      !areSectorBoardsOpen &&
      !isClassificationOpen &&
      !isInsightsOpen &&
      !isOpenF1PanelOpen ? (
        <section className="hud event-ticker" aria-label="event ticker">
          <Badge aria-hidden="true" size={15} />
          <span>{displayedEventMessage}</span>
        </section>
      ) : null}
    </main>
  )
}
