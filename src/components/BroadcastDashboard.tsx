import {
  Activity,
  AlertTriangle,
  CircleGauge,
  Database,
  Droplets,
  Flag,
  Gauge,
  Map as MapIcon,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Route,
  Settings2,
  StepForward,
  Thermometer,
  Timer,
  Trophy,
  Users,
  Wind,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  START_LIGHT_COUNT,
  startSignalStateFor,
} from '../domain/startSignal'
import type { SeasonStandingRow } from '../simulation/season'
import { tireStintsFor } from '../simulation/stints'
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

type DataMode = 'SIM' | 'HIST' | 'LIVE'
type MiniSectorState = 'dim' | 'yellow' | 'green' | 'purple' | 'pit' | 'stopped'
type DashboardView =
  | 'map'
  | 'telemetry'
  | 'track'
  | 'tyres'
  | 'messages'
  | 'drivers'
  | 'season'
  | 'data'

export type ChampionshipStandings = {
  drivers: SeasonStandingRow[]
  teams: SeasonStandingRow[]
  rounds: number
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

type EnvironmentReadout = {
  airLabel: string
  humidityLabel: string
  pressureLabel: string
  rainLabel: string
  source: string
  trackLabel: string
  windLabel: string
}

type BroadcastDashboardProps = {
  cameraMode: CameraMode
  championshipStandings: ChampionshipStandings
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
  onOpenClassification: () => void
  onOpenInsights: () => void
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
  { Icon: MapIcon, id: 'map', label: 'Map' },
  { Icon: Activity, id: 'telemetry', label: 'Telemetry' },
  { Icon: Route, id: 'track', label: 'Track' },
  { Icon: CircleGauge, id: 'tyres', label: 'Tyres' },
  { Icon: MessageSquare, id: 'messages', label: 'Messages' },
  { Icon: Users, id: 'drivers', label: 'Drivers' },
  { Icon: Trophy, id: 'season', label: 'Season' },
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

const cleanEnvironmentValue = (value: string) =>
  value.replace(/\s+(?:OBS|S)$/, '')

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

const layoutGeometryLabel = (track: TrackDefinition) =>
  track.layoutSource?.provider === 'official'
    ? 'Official vector geometry'
    : track.layoutSource?.provider === 'openf1'
      ? 'Observed geometry'
      : track.layoutSource?.provider === 'openstreetmap'
        ? 'Surveyed map geometry'
        : 'Fallback geometry'

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
  title,
}: {
  labels: Record<CarSnapshot['tire'], string>
  mode: 'live' | 'gap'
  onFocusDriver: (driverId: string) => void
  onModeChange: (mode: 'live' | 'gap') => void
  rows: BroadcastTimingRow[]
  selectedDriverId: string
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
        <span title="Completed pit stops">ST</span><span title="Compounds used">USED</span><span>SPD</span><span>BAT</span>
      </div>
      <ol
        aria-label={`All drivers ${title.toLowerCase()}`}
        className="leaderboard-rows"
        tabIndex={0}
      >
        {rows.map((row) => {
          const status = terminalLabel(row.car)
          const tireLife = clamp(Math.round(row.tireLifePercent), 0, 100)

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
                <span
                  title={`SOC ${row.batteryPercent}% / ${row.car.energyStore.currentEnergyMJ.toFixed(2)} MJ / deploy ${Math.round(row.car.energyStore.actualDeploymentPowerKw)} kW / recover ${Math.round(row.car.energyStore.actualRecoveryPowerKw)} kW`}
                >
                  {row.batteryPercent}%
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function TelemetryView({ rows }: { rows: BroadcastTimingRow[] }) {
  return (
    <div className="center-table telemetry-table">
      <div className="center-table-head">
        <span>DRIVER</span><span>SPD</span><span>THR</span><span>BRK</span><span>GEAR</span>
        <span>RPM</span><span>ERS</span><span>AERO / OVT</span><span>SOURCE</span>
      </div>
      <ol aria-label="All drivers telemetry" tabIndex={0}>
        {rows.map((row) => (
          <li key={row.car.driverId}>
            <div>
              <strong style={{ color: row.car.teamColor }}>{row.car.code}</strong>
              <span>{row.speedKph}</span><span>{row.throttlePercent}%</span><span>{row.brakePercent}%</span>
              <span>{row.gear}</span><span>{row.rpm}</span>
              <span
                title={`${row.car.energyStore.currentEnergyMJ.toFixed(2)} MJ / ${Math.round(row.car.energyStore.actualDeploymentPowerKw)} kW deploy / ${Math.round(row.car.energyStore.actualRecoveryPowerKw)} kW recover / battery ${row.car.energyStore.batteryTemperatureC.toFixed(1)} C`}
              >
                {row.batteryPercent}%
              </span>
              <span
                title={
                  row.telemetrySource === 'simulation' &&
                  row.car.superClippingIntensity >= 0.04
                    ? `Super clipping ${Math.round(row.car.superClippingIntensity * 100)}%, ${Math.round(row.car.superClippingRegenPowerKw)} kW recovery`
                    : row.aeroOvertakeLabel
                }
              >
                {row.telemetrySource === 'simulation' &&
                row.car.superClippingIntensity >= 0.04
                  ? `CLIP ${Math.round(row.car.superClippingIntensity * 100)}`
                  : row.aeroOvertakeLabel}
              </span>
              <SourceTag
                source={
                  row.telemetrySource === 'openf1'
                    ? 'OBS'
                    : row.telemetrySource === 'simulation'
                      ? 'SIM'
                      : 'UNAVAILABLE'
                }
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CenterView({
  championshipStandings,
  dataControl,
  dataDetails,
  environment,
  isRaceStage,
  labels,
  overtakeSystem,
  raceControlLog,
  rows,
  snapshot,
  track,
  useF1TireNomination,
  view,
}: {
  championshipStandings: ChampionshipStandings
  dataControl: ReactNode
  dataDetails: BroadcastDataDetail[]
  environment: EnvironmentReadout
  isRaceStage: boolean
  labels: Record<CarSnapshot['tire'], string>
  overtakeSystem: 'active-aero' | 'drs' | 'ots'
  raceControlLog: BroadcastRaceControlEntry[]
  rows: BroadcastTimingRow[]
  snapshot: RaceSnapshot
  track: TrackDefinition
  useF1TireNomination: boolean
  view: DashboardView
}) {
  if (view === 'telemetry') return <TelemetryView rows={rows} />

  if (view === 'track') {
    const aeroSource = track.aeroActivationZones?.every(
      (zone) => zone.source === 'official',
    )
      ? 'FIA'
      : track.aeroActivationZones?.some((zone) => zone.source === 'openf1')
        ? 'OBS'
        : 'CAL'
    const overtakeSource = track.overtakeControlLines?.every(
      (line) => line.source === 'official',
    )
      ? 'FIA'
      : 'CAL'
    const wetness =
      snapshot.surfaceWaterMmBySector.reduce((sum, value) => sum + value, 0) / 3

    return (
      <div className="detail-grid track-detail-grid">
        <span>Track length</span><strong>{track.lengthKm.toFixed(3)} km</strong><SourceTag source={track.lengthSource === 'official' ? 'FIA' : 'SIM'} />
        <span>Layout</span><strong>{layoutGeometryLabel(track)}</strong><SourceTag source={layoutSourceTag(track)} />
        <span>Corners</span><strong>{track.corners?.length ?? 0}</strong><SourceTag source={track.corners ? layoutSourceTag(track) : 'UNAVAILABLE'} />
        <span>Sector boundaries</span><strong>{track.sectorMarks.slice(1).map((mark) => `${Math.round(mark * 100)}%`).join(' / ')}</strong><SourceTag source={track.sectorMarksSource === 'official' ? 'FIA' : 'CAL'} />
        <span>{overtakeSystem === 'active-aero' ? 'Straight Mode zones' : overtakeSystem === 'drs' ? 'DRS zones' : 'OTS allocation'}</span><strong>{overtakeSystem === 'ots' ? '200 seconds' : track.activeAeroUnavailable ? 'N/A' : track.aeroActivationZones?.length ?? 0}</strong><SourceTag source={overtakeSystem === 'ots' ? 'FIA' : aeroSource} />
        <span>{overtakeSystem === 'ots' ? 'Activation model' : 'Overtake detection lines'}</span><strong>{overtakeSystem === 'ots' ? 'Driver controlled' : track.overtakeControlLines?.length ?? 0}</strong><SourceTag source={overtakeSystem === 'ots' ? 'FIA' : overtakeSource} />
        <span>Pit speed limit</span><strong>{track.pitLane?.speedLimitKph ?? 80} km/h</strong><SourceTag source={track.pitLane?.speedLimitSource === 'official' ? 'FIA' : 'SIM'} />
        <span>Grip</span><strong>{Math.round(snapshot.trackGrip * 100)}%</strong><SourceTag source="SIM" />
        <span><Thermometer size={13} /> Air temperature</span><strong>{cleanEnvironmentValue(environment.airLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span><Thermometer size={13} /> Track temperature</span><strong>{cleanEnvironmentValue(environment.trackLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span><Droplets size={13} /> Rainfall</span><strong>{cleanEnvironmentValue(environment.rainLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span><Wind size={13} /> Wind</span><strong>{cleanEnvironmentValue(environment.windLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span>Humidity</span><strong>{cleanEnvironmentValue(environment.humidityLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span>Heat Index</span><strong>{snapshot.heatIndexC.toFixed(1)}°C</strong><SourceTag source="SIM" />
        <span>Heat Hazard</span><strong>{snapshot.heatHazardDeclared ? `DECLARED / +${snapshot.heatHazardMassIncreaseKg}kg` : snapshot.heatHazardMassIncreaseKg > 0 ? `EVENT / +${snapshot.heatHazardMassIncreaseKg}kg` : 'NOT DECLARED'}</strong><SourceTag source="FIA" />
        <span>Pressure</span><strong>{cleanEnvironmentValue(environment.pressureLabel)}</strong><SourceTag source={environment.source.startsWith('OpenF1') ? 'OBS' : 'SIM'} />
        <span>Surface water</span><strong>{wetness.toFixed(2)} mm</strong><SourceTag source="SIM" />
        <span>Forecast</span><strong>{snapshot.weatherForecastLabel}</strong><SourceTag source="SIM" />
        <span>Rain Hazard</span><strong>{snapshot.rainHazardDeclared ? 'DECLARED' : 'NOT DECLARED'}</strong><SourceTag source="SIM" />
        <span>Grip declaration</span><strong>{snapshot.lowGripConditions ? 'LOW GRIP' : 'NORMAL GRIP'}</strong><SourceTag source="SIM" />
        <span>{overtakeSystem === 'active-aero' ? 'Active aero' : overtakeSystem.toUpperCase()}</span><strong>{snapshot.lowGripConditions ? 'DISABLED' : snapshot.overtakeEnabled ? 'ENABLED' : 'CONTROLLED'}</strong><SourceTag source="FIA" />
        {overtakeSystem === 'active-aero' ? <><span>Low-grip ERS curve</span><strong>{snapshot.lowGripConditions ? 'CONSERVATIVE EST.' : 'PUBLIC C5.2.8'}</strong><SourceTag source={snapshot.lowGripConditions ? 'UNAVAILABLE' : 'FIA'} /></> : null}
      </div>
    )
  }

  if (view === 'tyres') {
    const stintChart =
      isRaceStage &&
      (() => {
        const totalLaps = Math.max(snapshot.raceLaps, 1)

        return (
          <section aria-label="Tyre stint history" className="stint-chart">
            <div className="stint-chart-head">
              <span>DRIVER</span>
              <span>STINTS / LAP {Math.min(snapshot.leaderLap, totalLaps)} OF {totalLaps}</span>
              <span>STOPS</span>
            </div>
            <ol aria-label="Tyre stints by driver" tabIndex={0}>
              {rows.map((row) => {
                const stints = tireStintsFor(row.car)
                const summary = stints
                  .map(
                    (stint) =>
                      `${labels[stint.compound]} laps ${stint.fromLap} to ${stint.toLap}${stint.inProgress ? ' in progress' : ''}`,
                  )
                  .join(', ')

                return (
                  <li key={row.car.driverId}>
                    <strong style={{ color: row.car.teamColor }}>{row.car.code}</strong>
                    <div
                      aria-label={summary === '' ? 'No stint started' : summary}
                      className="stint-bar"
                      role="img"
                    >
                      {stints.map((stint) => (
                        <span
                          className={`tire-${stint.compound}${stint.inProgress ? ' stint-live' : ''}`}
                          key={stint.fromLap}
                          style={{ width: `${(stint.laps / totalLaps) * 100}%` }}
                          title={`${labels[stint.compound]} L${stint.fromLap}-L${stint.toLap} (${stint.laps} ${stint.laps === 1 ? 'lap' : 'laps'})`}
                        >
                          {stint.laps / totalLaps >= 0.08 ? stint.laps : ''}
                        </span>
                      ))}
                    </div>
                    <span className="stint-stops">{row.car.pitStops}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })()

    const tyreTable = (
      <div className="center-table tyre-detail-table">
        <div className="center-table-head"><span>DRIVER</span><span>COMPOUND</span><span>AGE</span><span>LIFE</span><span>PACE DELTA</span><span>TEMP</span><span>SETS</span><span>STOPS</span><span>SOURCE</span></div>
        <ol aria-label="All drivers tyre information" tabIndex={0}>
          {rows.map((row) => (
            <li key={row.car.driverId}><div>
              <strong style={{ color: row.car.teamColor }}>{row.car.code}</strong>
              <span><i className={`broadcast-tire tire-${row.car.tire}`}>{row.car.tire}</i> {useF1TireNomination && (row.car.tire === 'S' || row.car.tire === 'M' || row.car.tire === 'H') ? `${labels[row.car.tire]} (${track.tireNomination?.[row.car.tire] ?? 'nomination pending'})` : labels[row.car.tire]}</span>
              <span>{row.car.tireAgeLaps} L</span><span>{clamp(Math.round(row.tireLifePercent), 0, 100)}%</span>
              <span>{row.tirePaceDeltaSeconds >= 0 ? '+' : ''}{row.tirePaceDeltaSeconds.toFixed(2)}s</span>
              <span>{row.tireTemperatureC} C</span><span>{row.car.tireSetsRemaining[row.car.tire] ?? 0}</span><span>{row.car.pitStops}</span>
              <SourceTag source={row.tireModelSource === 'openf1-calibrated' ? 'CAL' : row.tireModelSource === 'pirelli' ? 'PIR' : 'SIM'} />
            </div></li>
          ))}
        </ol>
      </div>
    )

    return stintChart ? (
      <div className="tyre-detail-stack">
        {stintChart}
        {tyreTable}
      </div>
    ) : (
      tyreTable
    )
  }

  if (view === 'season') {
    const { drivers: driverStandings, teams: teamStandings, rounds } = championshipStandings

    if (driverStandings.length === 0) {
      return (
        <div className="empty-detail">
          <Trophy size={22} />
          <strong>No championship rounds recorded</strong>
          <span>Standings appear after the first classified race or sprint.</span>
        </div>
      )
    }

    return (
      <div className="season-standings">
        <section>
          <h3>DRIVERS / {rounds} ROUND{rounds === 1 ? '' : 'S'} / WINS / PTS</h3>
          <ol aria-label="Driver championship standings" tabIndex={0}>
            {driverStandings.map((row, index) => (
              <li key={row.id}>
                <span>{index + 1}</span>
                <strong style={{ color: row.color }}>{row.label}</strong>
                <small>{row.detail}</small>
                <b title={`${row.wins} win${row.wins === 1 ? '' : 's'}`}>{row.wins}</b>
                <em>{row.points}</em>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>TEAMS / WINS / PTS</h3>
          <ol aria-label="Team championship standings" tabIndex={0}>
            {teamStandings.map((row, index) => (
              <li key={row.id}>
                <span>{index + 1}</span>
                <strong style={{ color: row.color }}>{row.label}</strong>
                <small />
                <b title={`${row.wins} win${row.wins === 1 ? '' : 's'}`}>{row.wins}</b>
                <em>{row.points}</em>
              </li>
            ))}
          </ol>
        </section>
      </div>
    )
  }

  if (view === 'messages') {
    // One race-control feed: outstanding steward business first, then the
    // message log. Alerts used to be a separate destination showing the same
    // session in a second place.
    const alerts = [
      ...rows
        .filter((row) => row.car.stewardStatus !== 'clear' || row.car.damage > 0.02)
        .map((row) => ({ id: row.car.driverId, label: row.car.code, message: row.car.stewardNote ?? `Car damage ${Math.round(row.car.damage * 100)}%` })),
      ...snapshot.events
        .filter((event) => ['accident', 'incident', 'penalty', 'investigation', 'track-limit'].includes(event.kind))
        .slice(0, 6)
        .map((event) => ({
          id: event.id,
          label:
            event.kind === 'accident'
              ? 'ACC'
              : event.kind === 'incident'
                ? 'INC'
                : event.timeLabel,
          message:
            event.kind === 'accident' || event.kind === 'incident'
              ? `${event.timeLabel} ${event.message}`
              : event.message,
        })),
    ].slice(0, 6)

    return (
      <div className="race-feed-view">
        {alerts.length > 0 ? (
          <ol aria-label="Active investigations" className="alert-list">
            {alerts.map((alert) => <li key={alert.id}><AlertTriangle size={13} /><strong>{alert.label}</strong><span>{alert.message}</span></li>)}
          </ol>
        ) : null}
        <ol aria-label="Race control messages" className="detail-message-list">
          {raceControlLog.slice(0, 12).map((event) => (
            <li key={event.id}><time>{event.timeLabel}</time><SourceTag source={event.source === 'OPENF1' ? 'OBS' : 'SIM'} /><span>{event.message}</span></li>
          ))}
        </ol>
      </div>
    )
  }

  if (view === 'drivers') {
    return (
      <div className="center-table driver-detail-table">
        <div className="center-table-head"><span>NO / DRIVER</span><span>OVR</span><span>TEAM</span><span>GRID</span><span>POS</span><span>CHANGE</span><span>CAR DELTA</span><span>MODE</span><span>STATUS</span></div>
        <ol aria-label="All driver information" tabIndex={0}>{rows.map((row) => (
          <li key={row.car.driverId}><div>
            <strong style={{ color: row.car.teamColor }}>#{row.car.carNumber} {row.car.code}</strong><b>{row.driverOverallAbility || '--'}</b><span>{row.car.teamName}</span>
            <span>{row.car.gridPosition}</span><span>{row.displayPosition}</span><span>{row.car.gridPosition - row.displayPosition >= 0 ? '+' : ''}{row.car.gridPosition - row.displayPosition}</span>
            <span title={row.performanceSource === 'openf1-calibrated' ? 'OpenF1 clean-lap calibration' : 'Configured model'}>{row.performancePaceDeltaSeconds === null ? '--' : `+${row.performancePaceDeltaSeconds.toFixed(3)}s`}</span><span>{row.car.racePaceMode}</span><span>{terminalLabel(row.car) ?? 'RUN'}</span>
          </div></li>
        ))}</ol>
      </div>
    )
  }

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
  cameraMode,
  championshipStandings,
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
  onOpenClassification,
  onOpenInsights,
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
                setActiveView(id)
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
            title={isQualifyingStage ? 'Qualifying Leaderboard' : 'Race Leaderboard'}
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
              eyebrow={
                activeView === 'telemetry' ||
                activeView === 'tyres' ||
                activeView === 'drivers'
                  ? `ALL ${timingRows.length}`
                  : undefined
              }
              title={dashboardViews.find((item) => item.id === activeView)?.label ?? 'Timing'}
            />
            {showLiveTiming ? (
              <CenterView
                championshipStandings={championshipStandings}
                dataControl={dataControl}
                dataDetails={dataDetails}
                environment={environment}
                isRaceStage={isRaceStage}
                labels={tireLabels}
                overtakeSystem={overtakeSystem}
                raceControlLog={raceControlLog}
                rows={timingRows}
                snapshot={snapshot}
                track={track}
                useF1TireNomination={seriesId === 'f1-custom'}
                view={activeView}
              />
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
          <button onClick={onOpenInsights} title="Selected driver analysis" type="button"><Activity size={14}/>{selectedCar.code}</button>
          <button onClick={onOpenClassification} title="Classification" type="button"><Trophy size={14}/></button>
        </div>
        <div className="footer-data-modes"><span title={engineLabel}>{engineLabel}</span>{(['SIM', 'HIST', 'LIVE'] as DataMode[]).map((mode) => <button aria-pressed={dataMode === mode} disabled={!dataModeAvailability[mode]} key={mode} onClick={() => onDataModeChange(mode)} type="button">{mode}</button>)}</div>
        <div className="footer-best"><span>BEST LAP</span><strong>{formatLapTime(fastestRow?.car.bestLapTimeSeconds)}</strong><b>{fastestRow?.car.code ?? '-'}</b></div>
      </footer>
    </div>
  )
}
