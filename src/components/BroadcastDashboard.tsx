import {
  Activity,
  Database,
  Flag,
  Gauge,
  Map as MapIcon,
  MonitorDot,
  Pause,
  Play,
  Radio,
  Route,
  Settings2,
  StepForward,
  Timer,
  Trophy,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  cleanEnvironmentValue,
  type EnvironmentReadout,
} from '../domain/environmentReadout'
import {
  START_LIGHT_COUNT,
  startSignalStateFor,
} from '../domain/startSignal'
import type {
  CameraMode,
  CarSnapshot,
  RaceSnapshot,
  SectorTimingStatus,
  SpeedMultiplier,
  TrackDefinition,
  WeekendStage,
} from '../types'
import type { SeriesId } from '../series/types'
import type { ApplicationMode } from '../freeMode/types'

type DataMode = 'SIM' | 'HIST' | 'LIVE'
type MiniSectorState = 'dim' | 'yellow' | 'green' | 'purple' | 'pit' | 'stopped'
type DashboardView = 'map' | 'data'

const practiceProgramLabels: Record<
  NonNullable<CarSnapshot['practiceProgram']>,
  { label: string; short: string }
> = {
  'aero-correlation': { label: 'Aero correlation', short: 'AERO' },
  'compound-comparison': { label: 'Compound comparison', short: 'TYRE' },
  'qualifying-preparation': {
    label: 'Qualifying preparation',
    short: 'QUALI',
  },
  'qualifying-simulation': {
    label: 'Qualifying simulation',
    short: 'QUALI',
  },
  'race-simulation': { label: 'Race simulation', short: 'LONG' },
  'setup-baseline': { label: 'Setup baseline', short: 'BASE' },
  'setup-verification': { label: 'Setup verification', short: 'SETUP' },
  'start-pit-practice': { label: 'Start and pit practice', short: 'PROC' },
  'systems-check': { label: 'Systems check', short: 'CHECK' },
}

export type BroadcastTimingRow = {
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

export type BroadcastRaceControlEntry = {
  id: string
  message: string
  source: string
  timeLabel: string
}

export type BroadcastDataDetail = {
  label: string
  source: 'OBS' | 'OFF' | 'CAL' | 'SIM' | 'FIA' | 'PIR' | 'UNAVAILABLE'
  value: string
}


type BroadcastDashboardProps = {
  applicationMode: ApplicationMode
  cameraMode: CameraMode
  dataControl: ReactNode
  dataDetails: BroadcastDataDetail[]
  dataMode: DataMode
  dataModeAvailability: Record<DataMode, boolean>
  engineLabel: string
  environment: EnvironmentReadout
  eventName: string
  isPaused: boolean
  onCameraModeChange: (mode: CameraMode) => void
  onDataModeChange: (mode: DataMode) => void
  onFocusDriver: (driverId: string) => void
  onExitFreeMode: () => void
  onOpenFreeMode: () => void
  onOpenClassification: () => void
  onOpenInsights: () => void
  onOpenPitWall: () => void
  onOpenSetup: () => void
  onPauseChange: () => void
  onSeriesChange: (seriesId: SeriesId) => void
  onSkipFormationLap: () => void
  onSpeedChange: (speed: SpeedMultiplier) => void
  onStageChange: (stage: WeekendStage) => void
  raceControlLog: BroadcastRaceControlEntry[]
  raceLabel: string
  selectedCar: CarSnapshot
  sessionPhaseLabel: string
  sessionProgressLabel: string
  snapshot: RaceSnapshot
  speed: SpeedMultiplier
  stage: WeekendStage
  seriesId: SeriesId
  seriesLabel: string
  seriesOptions: Array<{ id: SeriesId; label: string }>
  tireLabels: Record<CarSnapshot['tire'], string>
  overtakeSystem: 'active-aero' | 'drs' | 'ots'
  timingRows: BroadcastTimingRow[]
  track: TrackDefinition
  trackScene: ReactNode
  weekendStages: WeekendStage[]
}

function StartSignal({ snapshot }: { snapshot: RaceSnapshot }) {
  const signal = startSignalStateFor(snapshot)

  if (!signal) {
    return null
  }

  return (
    <section
      aria-atomic="true"
      aria-label={
        signal.phase === 'lights'
          ? `Start signal: ${signal.activeLightCount} of ${START_LIGHT_COUNT} red light groups illuminated`
          : `Start signal: ${signal.label.toLowerCase()}`
      }
      aria-live="assertive"
      className={`start-signal start-signal-${signal.phase}`}
      data-active-lights={signal.activeLightCount}
      role="status"
    >
      <span>{signal.label}</span>
      <div aria-hidden="true" className="start-signal-gantry">
        {Array.from({ length: START_LIGHT_COUNT }, (_, groupIndex) => (
          <i
            className={
              groupIndex < signal.activeLightCount
                ? 'start-light-group is-on'
                : 'start-light-group'
            }
            key={groupIndex}
          >
            {Array.from({ length: 4 }, (_, lampIndex) => (
              <b key={lampIndex} />
            ))}
          </i>
        ))}
      </div>
    </section>
  )
}

const dashboardViews: Array<{
  Icon: typeof Timer
  id: DashboardView
  label: string
}> = [
  { Icon: Database, id: 'data', label: 'Data' },
]

const defaultTireLabels: Record<CarSnapshot['tire'], string> = {
  H: 'Hard',
  I: 'Intermediate',
  M: 'Medium',
  S: 'Soft',
  W: 'Wet',
}

const tireColors: Record<CarSnapshot['tire'], string> = {
  H: '#eef2f5',
  I: '#35d66f',
  M: '#ffd21f',
  S: '#ff344d',
  W: '#36a4ff',
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const formatLapTime = (seconds: number | null | undefined) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return '--:--.---'
  }

  const minutes = Math.floor(seconds / 60)
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remaining}`
}

const formatSectorTime = (seconds: number | null | undefined) =>
  typeof seconds === 'number' && Number.isFinite(seconds)
    ? seconds.toFixed(3)
    : '--.---'

const sectorStatusLabels: Record<SectorTimingStatus, string> = {
  pending: 'Not measured',
  'overall-best': 'Overall best',
  'personal-best': 'Personal best',
  slower: 'Completed sector',
}

const formatClock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = Math.floor(seconds % 60)

  return [hours, minutes, remaining]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':')
}

const compactSource = (source: BroadcastTimingRow['source']) =>
  source === 'openf1' ? 'OBS' : 'SIM'


const terminalLabel = (car: CarSnapshot) => {
  if (car.status === 'retired') return 'OUT'
  if (car.status === 'disqualified') return 'DSQ'
  if (car.status === 'dns') return 'DNS'
  if (car.status === 'pit') return 'PIT'

  return null
}

const latestPitLap = (car: CarSnapshot) =>
  car.lapHistory
    .slice()
    .reverse()
    .find((lap) => lap.pitStop)?.lap ?? null

function PanelHeader({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode
  eyebrow?: string
  title: string
}) {
  return (
    <header className="broadcast-panel-header">
      <div>
        <strong>{title}</strong>
        {eyebrow ? <span>{eyebrow}</span> : null}
      </div>
      {action}
    </header>
  )
}

function SourceTag({ source }: { source: BroadcastDataDetail['source'] }) {
  return <span className={`broadcast-source source-${source.toLowerCase()}`}>{source}</span>
}

const layoutSourceTag = (
  track: TrackDefinition,
): BroadcastDataDetail['source'] =>
  track.layoutSource?.provider === 'official'
    ? 'OFF'
    : track.layoutSource?.provider === 'openf1' ||
        track.layoutSource?.provider === 'openstreetmap'
      ? 'OBS'
      : 'SIM'

const miniSectorStateLabels: Record<MiniSectorState, string> = {
  dim: 'not completed',
  green: 'personal best',
  pit: 'pit lane',
  purple: 'overall best',
  stopped: 'stopped',
  yellow: 'slower',
}
const sectorFlagLabels: Record<
  RaceSnapshot['sectorFlags'][number],
  string
> = {
  clear: 'CLEAR',
  'double-yellow': 'DOUBLE YELLOW',
  red: 'RED',
  sc: 'SC',
  vsc: 'VSC',
  yellow: 'YELLOW',
}

function MiniSectorStrip({
  sectorIndex,
  states,
}: {
  sectorIndex: number
  states: MiniSectorState[]
}) {
  const summary = (Object.keys(miniSectorStateLabels) as MiniSectorState[])
    .map((state) => ({
      count: states.filter((candidate) => candidate === state).length,
      state,
    }))
    .filter(({ count }) => count > 0)
    .map(({ count, state }) => `${count} ${miniSectorStateLabels[state]}`)
    .join(', ')

  return (
    <span
      className="broadcast-mini-sectors"
      aria-label={`Sector ${sectorIndex + 1} mini sectors: ${summary}`}
    >
      {states.map((state, index) => (
        <span aria-hidden="true" className={`mini-${state}`} key={`${state}-${index}`} />
      ))}
    </span>
  )
}

function TireUsage({
  cars,
  labels,
}: {
  cars: CarSnapshot[]
  labels: Record<CarSnapshot['tire'], string>
}) {
  const usage = useMemo(() => {
    const counts = new Map<CarSnapshot['tire'], number>()

    cars.forEach((car) => counts.set(car.tire, (counts.get(car.tire) ?? 0) + 1))

    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])
  }, [cars])
  const total = Math.max(1, cars.length)
  let offset = 0

  return (
    <div className="tyre-usage-content">
      <svg aria-label="tyre compound usage" className="tyre-donut" viewBox="0 0 42 42">
        <circle className="tyre-donut-base" cx="21" cy="21" fill="none" r="15.9" strokeWidth="6" />
        {usage.map(([compound, count]) => {
          const share = (count / total) * 100
          const dashOffset = -offset
          offset += share

          return (
            <circle
              cx="21"
              cy="21"
              fill="none"
              key={compound}
              r="15.9"
              stroke={tireColors[compound]}
              strokeDasharray={`${share} ${100 - share}`}
              strokeDashoffset={dashOffset}
              strokeWidth="6"
              transform="rotate(-90 21 21)"
            />
          )
        })}
      </svg>
      <div className="tyre-usage-legend">
        {usage.map(([compound, count]) => (
          <div key={compound}>
            <span className={`broadcast-tire tire-${compound}`}>{compound}</span>
            <span>{labels[compound]}</span>
            <strong>{count}</strong>
            <small>{Math.round((count / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeftLeaderboard({
  labels,
  mode,
  onFocusDriver,
  onModeChange,
  rows,
  selectedDriverId,
  seriesId,
  showCarNumbers,
  stage,
  title,
}: {
  labels: Record<CarSnapshot['tire'], string>
  mode: 'live' | 'gap'
  onFocusDriver: (driverId: string) => void
  onModeChange: (mode: 'live' | 'gap') => void
  rows: BroadcastTimingRow[]
  selectedDriverId: string
  seriesId: SeriesId
  showCarNumbers: boolean
  stage: WeekendStage
  title: string
}) {
  return (
    <section className="broadcast-panel broadcast-leaderboard">
      <PanelHeader
        action={
          <div className="broadcast-tabs" role="tablist">
            {(['live', 'gap'] as const).map((option) => (
              <button
                aria-selected={mode === option}
                key={option}
                onClick={() => onModeChange(option)}
                role="tab"
                type="button"
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        }
        title={title}
      />
      <div className="leaderboard-column-head" aria-hidden="true">
        <span>POS</span><span>DRIVER</span><span>TYRE</span><span>{mode === 'gap' ? 'GAP' : 'INT'}</span>
        <span>LAST</span><span>BEST</span><span>S1</span><span>S2</span><span>S3</span>
        <span title="Completed pit stops">ST</span><span title="Compounds used">USED</span><span>SPD</span>
        <span>
          {seriesId === 'f1-custom'
            ? 'ERS'
            : seriesId === 'super-formula'
              ? 'OTS'
              : '-'}
        </span>
      </div>
      <ol
        aria-label={`All drivers ${title.toLowerCase()}`}
        className="leaderboard-rows"
        tabIndex={0}
      >
        {rows.map((row) => {
          const status = terminalLabel(row.car)
          const tireLife = clamp(Math.round(row.tireLifePercent), 0, 100)
          const practiceProgram = row.car.practiceProgram
            ? practiceProgramLabels[row.car.practiceProgram]
            : null

          return (
            <li
              className={[
                row.car.driverId === selectedDriverId ? 'selected' : '',
                row.car.blueFlag ? 'blue-flag-active' : '',
              ].filter(Boolean).join(' ') || undefined}
              key={row.car.driverId}
            >
              <button onClick={() => onFocusDriver(row.car.driverId)} type="button">
                <span className="leaderboard-position" style={{ backgroundColor: row.car.teamColor }}>
                  {row.displayPosition}
                </span>
                <span className="leaderboard-driver">
                  <i style={{ backgroundColor: row.car.teamColor }} />
                  <strong>{row.car.code}</strong>
                  {row.car.blueFlag ? (
                    <small className="blue-flag-label" title="Blue flag">
                      <Flag aria-hidden="true" size={7} /> BLUE
                    </small>
                  ) : row.car.penaltySeconds > 0 ? (
                    <small
                      className="penalty-pending-label"
                      title={`Outstanding time penalty: +${row.car.penaltySeconds}s (applied at the finish unless served in the pits)`}
                    >
                      +{row.car.penaltySeconds}s
                    </small>
                  ) : showCarNumbers ? (
                    <small className="leaderboard-car-number">
                      #{row.car.carNumber}
                    </small>
                  ) : practiceProgram &&
                    (stage === 'fp1' || stage === 'fp2' || stage === 'fp3') ? (
                    <small title={practiceProgram.label}>
                      {practiceProgram.short}
                    </small>
                  ) : (
                    <small>{compactSource(row.source)}</small>
                  )}
                </span>
                <span
                  aria-label={`${labels[row.car.tire]} tyre, ${tireLife}% life remaining`}
                  className={`broadcast-tire leaderboard-tire-life tire-${row.car.tire}`}
                  title={`${labels[row.car.tire]} tyre: ${tireLife}% life remaining`}
                >
                  {tireLife}
                </span>
                <span className={status ? 'status-value' : undefined}>
                  {status ?? (mode === 'gap' ? row.displayGapToLeaderLabel : row.displayIntervalLabel)}
                </span>
                <span>{formatLapTime(row.lapTimeSeconds)}</span>
                <span>{formatLapTime(row.car.bestLapTimeSeconds)}</span>
                {row.sectors.map((sector, index) => (
                  <span
                    className={`sector-value sector-status-${row.sectorStatuses[index]}`}
                    key={index}
                    title={`S${index + 1}: ${sectorStatusLabels[row.sectorStatuses[index]]}${row.sectorLapNumber === null ? '' : ` (lap ${row.sectorLapNumber})`}`}
                  >
                    <b>{formatSectorTime(sector)}</b>
                    <MiniSectorStrip
                      sectorIndex={index}
                      states={row.microSectors[index]}
                    />
                  </span>
                ))}
                <span
                  className="leaderboard-stops"
                  title={`${row.car.pitStops} pit stop${row.car.pitStops === 1 ? '' : 's'}${latestPitLap(row.car) === null ? '' : `, last on lap ${latestPitLap(row.car)}`}`}
                >
                  {row.car.pitStops}
                </span>
                <span
                  aria-label={`Compounds used: ${row.car.compoundsUsed.map((compound) => labels[compound]).join(', ') || 'none yet'}`}
                  className="leaderboard-compounds"
                  title={`Tyre sets used: ${row.car.compoundsUsed.map((compound) => labels[compound]).join(' > ') || 'none yet'}`}
                >
                  {row.car.compoundsUsed.map((compound, index) => (
                    <i className={`tire-${compound}`} key={`${compound}-${index}`} />
                  ))}
                </span>
                <span title={`${row.speedKph} km/h`}>{Math.round(row.speedKph)}</span>
                {seriesId === 'f1-custom' ? (
                  <span
                    title={`ERS SOC ${row.batteryPercent}% / ${row.car.energyStore.currentEnergyMJ.toFixed(2)} MJ / deploy ${Math.round(row.car.energyStore.actualDeploymentPowerKw)} kW / recover ${Math.round(row.car.energyStore.actualRecoveryPowerKw)} kW`}
                  >
                    {row.batteryPercent}%
                  </span>
                ) : seriesId === 'super-formula' ? (
                  <span
                    title={`OTS allocation remaining ${Math.ceil(row.car.otsRemainingSeconds ?? 0)} seconds`}
                  >
                    {Math.ceil(row.car.otsRemainingSeconds ?? 0)}s
                  </span>
                ) : (
                  <span title="No hybrid Energy Store in this category">-</span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CenterView({
  dataControl,
  dataDetails,
}: {
  dataControl: ReactNode
  dataDetails: BroadcastDataDetail[]
}) {
  return (
    <div className="data-view">
      <div className="data-detail-grid">
        {dataDetails.map((detail) => (
          <div key={detail.label}><span>{detail.label}</span><strong>{detail.value}</strong><SourceTag source={detail.source} /></div>
        ))}
      </div>
      {dataControl}
    </div>
  )
}

export function BroadcastDashboard({
  applicationMode,
  cameraMode,
  dataControl,
  dataDetails,
  dataMode,
  dataModeAvailability,
  engineLabel,
  environment,
  eventName,
  isPaused,
  onCameraModeChange,
  onDataModeChange,
  onFocusDriver,
  onExitFreeMode,
  onOpenFreeMode,
  onOpenClassification,
  onOpenInsights,
  onOpenPitWall,
  onOpenSetup,
  onPauseChange,
  onSeriesChange,
  onSkipFormationLap,
  onSpeedChange,
  onStageChange,
  raceControlLog,
  raceLabel,
  selectedCar,
  sessionPhaseLabel,
  sessionProgressLabel,
  snapshot,
  speed,
  stage,
  seriesId,
  seriesLabel,
  seriesOptions,
  tireLabels = defaultTireLabels,
  overtakeSystem,
  timingRows,
  track,
  trackScene,
  weekendStages,
}: BroadcastDashboardProps) {
  const [activeView, setActiveView] = useState<DashboardView>('map')
  const [leaderboardMode, setLeaderboardMode] = useState<'live' | 'gap'>('live')
  const [showLiveTiming, setShowLiveTiming] = useState(true)

  useEffect(() => {
    if (dataMode !== 'SIM' && cameraMode !== 'overview') {
      onCameraModeChange('overview')
    }
  }, [cameraMode, dataMode, onCameraModeChange])
  const fastestRow = useMemo(
    () => timingRows
      .filter((row) => row.car.bestLapTimeSeconds !== null)
      .slice()
      .sort((left, right) =>
        (left.car.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) -
        (right.car.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY),
      )[0] ?? null,
    [timingRows],
  )
  const trackTitle = `${eventName.replace(/\s+20\d{2}$/u, '')} 2026`
  const overtakeLabel =
    overtakeSystem === 'active-aero'
      ? 'ACTIVE AERO'
      : overtakeSystem === 'drs'
        ? 'DRS'
        : 'OTS'
  const activeSectorFlagIndex = snapshot.sectorFlags.findIndex(
    (flag) => flag !== 'clear',
  )
  const sectorFlagIsLocal =
    activeSectorFlagIndex >= 0 && new Set(snapshot.sectorFlags).size > 1
  const uniformSectorFlag =
    activeSectorFlagIndex >= 0 && !sectorFlagIsLocal
      ? snapshot.sectorFlags[activeSectorFlagIndex]
      : null
  const activeSectorFlag =
    activeSectorFlagIndex >= 0
      ? snapshot.sectorFlags[activeSectorFlagIndex]
      : null
  const localMarshallingZoneActive = Boolean(
    (snapshot.flagPhase?.flag === 'yellow' && snapshot.flagPhase.yellowZone) ||
      (snapshot.flagPhase === null &&
        snapshot.timedYellowUntilSeconds !== null &&
        snapshot.timedYellowProgress !== null &&
        snapshot.timedYellowProgress !== undefined),
  )
  const controlFlagLabel = sectorFlagIsLocal && activeSectorFlag
    ? `${sectorFlagLabels[activeSectorFlag]}${localMarshallingZoneActive ? ' ZONE' : ''} S${activeSectorFlagIndex + 1}`
    : uniformSectorFlag
      ? sectorFlagLabels[uniformSectorFlag]
      : snapshot.flagLabel
  const controlFlagClass = activeSectorFlag?.includes('yellow')
    ? 'yellow'
    : (activeSectorFlag ?? snapshot.flag)
  const isQualifyingStage =
    stage === 'qualifying' ||
    stage === 'qualifying2' ||
    stage === 'sprintQualifying'
  const isRaceStage =
    stage === 'race' || stage === 'race2' || stage === 'sprint'
  const isPracticeStage =
    stage === 'fp1' || stage === 'fp2' || stage === 'fp3'

  return (
    <div className="broadcast-app">
      <header className="broadcast-topbar">
        <div className="broadcast-brand">
          <Gauge aria-hidden="true" size={29} />
          <div>
            <strong>{trackTitle}</strong>
            <span>{seriesLabel} / {track.name}</span>
          </div>
          <select
            aria-label="Racing series"
            className="broadcast-series-select"
            disabled={applicationMode === 'free'}
            onChange={(event) => onSeriesChange(event.target.value as SeriesId)}
            value={seriesId}
          >
            {seriesOptions.map((series) => (
              <option key={series.id} value={series.id}>{series.label}</option>
            ))}
          </select>
        </div>
        <div className="broadcast-session-core">
          <span className={`broadcast-live-mode mode-${dataMode.toLowerCase()}`}>{dataMode}</span>
          <div className="broadcast-session-switch">
            <select
              aria-label="Weekend session"
              onChange={(event) => onStageChange(event.target.value as WeekendStage)}
              title="Weekend session"
              value={stage}
            >
              {weekendStages.map((weekendStage) => (
                <option key={weekendStage} value={weekendStage}>
                  {weekendStage === 'qualifying'
                    ? 'QUALIFYING'
                    : weekendStage === 'qualifying2'
                      ? 'QUALIFYING 2'
                    : weekendStage === 'sprintQualifying'
                      ? 'SPRINT QUALIFYING'
                      : weekendStage === 'race'
                        ? raceLabel.toUpperCase()
                        : weekendStage === 'race2'
                          ? `${raceLabel.toUpperCase()} 2`
                        : weekendStage.toUpperCase()}
              </option>
            ))}
          </select>
          <div
            aria-label="Application mode"
            className="broadcast-application-mode"
            role="group"
          >
            <button
              aria-pressed={applicationMode === 'championship'}
              onClick={onExitFreeMode}
              type="button"
            >
              CHAMP
            </button>
            <button
              aria-pressed={applicationMode === 'free'}
              onClick={onOpenFreeMode}
              type="button"
            >
              FREE
            </button>
          </div>
          </div>
          <strong className="broadcast-phase-label">{sessionPhaseLabel}</strong>
          <span>{sessionProgressLabel}</span>
          <time>
            {formatClock(
              isRaceStage
                ? snapshot.raceClockSeconds
                : snapshot.elapsedSeconds,
            )}
          </time>
        </div>
        <div className="broadcast-weather-strip">
          <div><span>TRACK TEMP</span><strong>{cleanEnvironmentValue(environment.trackLabel)}</strong></div>
          <div><span>AIR TEMP</span><strong>{cleanEnvironmentValue(environment.airLabel)}</strong></div>
          <div><span>HUMIDITY</span><strong>{cleanEnvironmentValue(environment.humidityLabel)}</strong></div>
          <div><span>WIND</span><strong>{cleanEnvironmentValue(environment.windLabel)}</strong></div>
          <button aria-label="Open setup" onClick={onOpenSetup} title="Setup" type="button"><Settings2 size={17} /></button>
        </div>
      </header>

      <aside className="broadcast-sidebar" aria-label="dashboard navigation">
        <div className="broadcast-mark"><Radio aria-hidden="true" size={21} /></div>
        <nav>
          {dashboardViews.map(({ Icon, id, label }) => (
            <button
              aria-current={activeView === id ? 'page' : undefined}
              key={id}
              onClick={() => {
                setActiveView((current) => (current === id ? 'map' : id))
              }}
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={16} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-settings" onClick={onOpenSetup} title="Settings" type="button"><Wrench size={16} /><span>Settings</span></button>
      </aside>

      <main className="broadcast-workspace">
        <div className="broadcast-left-column">
          <LeftLeaderboard
            labels={tireLabels}
            mode={leaderboardMode}
            onFocusDriver={onFocusDriver}
            onModeChange={setLeaderboardMode}
            rows={timingRows}
            selectedDriverId={selectedCar.driverId}
            seriesId={seriesId}
            showCarNumbers={applicationMode === 'free'}
            stage={stage}
            title={
              isQualifyingStage
                ? 'Qualifying Leaderboard'
                : isPracticeStage
                  ? `${stage.toUpperCase()} Leaderboard`
                  : 'Race Leaderboard'
            }
          />
          <div className="broadcast-left-analytics">
            <section className="broadcast-panel tyre-usage-panel"><PanelHeader title="Tyre Compound Usage" /><TireUsage cars={timingRows.map((row) => row.car)} labels={tireLabels} /></section>
            <section className="broadcast-panel pit-stop-panel"><PanelHeader title="Pit Stops" /><div aria-label="All drivers pit stops" className="pit-stop-list" role="table" tabIndex={0}><div role="row"><span>DRIVER</span><span>STOPS</span><span>LAST</span></div>{timingRows.filter((row) => row.car.pitStops > 0).map((row) => <div key={row.car.driverId} role="row"><strong style={{ color: row.car.teamColor }}>{row.car.code}</strong><span>{row.car.pitStops}</span><span>{latestPitLap(row.car) ?? '-'}</span></div>)}</div></section>
          </div>
        </div>

        <div className="broadcast-center-column">
          {activeView === 'map' ? (
          <section className="broadcast-panel broadcast-track-panel">
            <PanelHeader
              action={<div className="camera-switch">{(['overview', 'chase', 'orbit'] as const).map((mode) => <button aria-pressed={cameraMode === mode} disabled={dataMode !== 'SIM' && mode !== 'overview'} key={mode} onClick={() => onCameraModeChange(mode)} title={`${mode} camera`} type="button">{mode === 'overview' ? <MapIcon size={12} /> : mode === 'chase' ? <Gauge size={12} /> : <Route size={12} />}</button>)}</div>}
              eyebrow={`${track.lengthKm.toFixed(3)} KM / ${overtakeSystem === 'ots' ? 'OTS ENABLED' : track.activeAeroUnavailable ? `${overtakeLabel} N/A` : `${track.aeroActivationZones?.length ?? 0} ${overtakeLabel} ZONES`}`}
              title={`Track Map - ${track.name}`}
            />
            <div className="broadcast-track-stage">
              <div className="map-grid-texture" aria-hidden="true" />
              {trackScene}
              <StartSignal snapshot={snapshot} />
              <div className="track-map-status"><span className={`flag-dot flag-${controlFlagClass}`} />{snapshot.lowGripConditions ? 'LOW GRIP' : controlFlagLabel}<SourceTag source={layoutSourceTag(track)} /></div>
              <div className="track-map-legend">
                {(Object.keys(tireLabels) as CarSnapshot['tire'][]).filter((compound) => !tireLabels[compound].startsWith('Not ')).map((compound) => <span key={compound}><i className={`broadcast-tire tire-${compound}`}>{compound}</i>{tireLabels[compound]}</span>)}
              </div>
            </div>
          </section>
          ) : (
          <section className="broadcast-panel broadcast-live-timing">
            <PanelHeader
              action={<button aria-label={showLiveTiming ? 'Hide live timing' : 'Show live timing'} className="panel-close" onClick={() => setShowLiveTiming((value) => !value)} title={showLiveTiming ? 'Hide live timing' : 'Show live timing'} type="button">{showLiveTiming ? <X size={13} /> : <Timer size={13} />}</button>}
              title={dashboardViews.find((item) => item.id === activeView)?.label ?? 'Timing'}
            />
            {showLiveTiming ? (
              <CenterView dataControl={dataControl} dataDetails={dataDetails} />
            ) : <button className="restore-panel" onClick={() => setShowLiveTiming(true)} type="button"><Timer size={14} /> Restore live timing</button>}
          </section>
          )}
        </div>

      </main>

      <footer className="broadcast-footer">
        <div className="footer-race-control"><Radio size={14}/><strong>RACE CONTROL</strong><time>{raceControlLog[0]?.timeLabel ?? snapshot.elapsedLabel}</time><span>{raceControlLog[0]?.message ?? snapshot.eventMessage}</span></div>
        <div className="footer-controls">
          <button aria-label={isPaused ? 'Resume simulation' : 'Pause simulation'} onClick={onPauseChange} title={isPaused ? 'Resume' : 'Pause'} type="button">{isPaused ? <Play size={14}/> : <Pause size={14}/>}</button>
          {snapshot.startProcedure === 'formation' ? (
            <button
              aria-label="Skip formation lap"
              className="formation-skip-control"
              onClick={onSkipFormationLap}
              title="Skip formation lap and return to the starting grid"
              type="button"
            >
              <StepForward size={14}/><span>SKIP FORMATION</span>
            </button>
          ) : null}
          {([1, 5, 20, 60] as SpeedMultiplier[]).map((option) => <button aria-pressed={speed === option} key={option} onClick={() => onSpeedChange(option)} type="button">{option}x</button>)}
          <button
            className="pit-wall-control"
            onClick={onOpenPitWall}
            title={`Open the pit wall for ${selectedCar.code}`}
            type="button"
          >
            <MonitorDot size={14}/><span>PIT WALL</span>
          </button>
          <button onClick={onOpenInsights} title="Selected driver analysis" type="button"><Activity size={14}/>{selectedCar.code}</button>
          <button onClick={onOpenClassification} title="Classification" type="button"><Trophy size={14}/></button>
        </div>
        <div className="footer-data-modes"><span title={engineLabel}>{engineLabel}</span>{(['SIM', 'HIST', 'LIVE'] as DataMode[]).map((mode) => <button aria-pressed={dataMode === mode} disabled={!dataModeAvailability[mode]} key={mode} onClick={() => onDataModeChange(mode)} type="button">{mode}</button>)}</div>
        <div className="footer-best"><span>BEST LAP</span><strong>{formatLapTime(fastestRow?.car.bestLapTimeSeconds)}</strong><b>{fastestRow?.car.code ?? '-'}</b></div>
      </footer>
    </div>
  )
}
