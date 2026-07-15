import {
  Activity,
  AlertTriangle,
  CircleGauge,
  CloudRain,
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
  ShieldAlert,
  Thermometer,
  Timer,
  Trophy,
  Users,
  Wind,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  CameraMode,
  CarSnapshot,
  RaceSnapshot,
  SectorTimingStatus,
  SpeedMultiplier,
  TrackDefinition,
  WeekendStage,
} from '../types'

type DataMode = 'SIM' | 'HIST' | 'LIVE'
type MiniSectorState = 'dim' | 'yellow' | 'green' | 'purple' | 'pit' | 'stopped'
type DashboardView =
  | 'timing'
  | 'telemetry'
  | 'track'
  | 'weather'
  | 'tyres'
  | 'messages'
  | 'alerts'
  | 'drivers'
  | 'data'

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
  onSpeedChange: (speed: SpeedMultiplier) => void
  raceControlLog: BroadcastRaceControlEntry[]
  selectedCar: CarSnapshot
  sessionProgressLabel: string
  snapshot: RaceSnapshot
  speed: SpeedMultiplier
  stage: WeekendStage
  timingRows: BroadcastTimingRow[]
  track: TrackDefinition
  trackScene: ReactNode
}

const dashboardViews: Array<{
  Icon: typeof Timer
  id: DashboardView
  label: string
}> = [
  { Icon: Timer, id: 'timing', label: 'Timing' },
  { Icon: Activity, id: 'telemetry', label: 'Telemetry' },
  { Icon: Route, id: 'track', label: 'Track' },
  { Icon: CloudRain, id: 'weather', label: 'Weather' },
  { Icon: CircleGauge, id: 'tyres', label: 'Tyres' },
  { Icon: MessageSquare, id: 'messages', label: 'Messages' },
  { Icon: ShieldAlert, id: 'alerts', label: 'Alerts' },
  { Icon: Users, id: 'drivers', label: 'Drivers' },
  { Icon: Database, id: 'data', label: 'Data' },
]

const tireLabels: Record<CarSnapshot['tire'], string> = {
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
    : track.layoutSource?.provider === 'openf1'
      ? 'OBS'
      : 'SIM'

const layoutGeometryLabel = (track: TrackDefinition) =>
  track.layoutSource?.provider === 'official'
    ? 'Official vector geometry'
    : track.layoutSource?.provider === 'openf1'
      ? 'Observed geometry'
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

function Sparkline({
  color = '#ffd21f',
  values,
}: {
  color?: string
  values: number[]
}) {
  const normalized = useMemo(() => {
    const finite = values.filter(Number.isFinite)
    const minimum = finite.length > 0 ? Math.min(...finite) : 0
    const maximum = finite.length > 0 ? Math.max(...finite) : 1
    const spread = Math.max(0.001, maximum - minimum)

    return values.map((value, index) => ({
      x: values.length <= 1 ? 0 : (index / (values.length - 1)) * 100,
      y: 30 - ((value - minimum) / spread) * 24,
    }))
  }, [values])

  return (
    <svg aria-hidden="true" className="broadcast-sparkline" preserveAspectRatio="none" viewBox="0 0 100 32">
      <line className="sparkline-grid" x1="0" x2="100" y1="16" y2="16" />
      <polyline
        fill="none"
        points={normalized.map((point) => `${point.x},${point.y}`).join(' ')}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function TireUsage({ cars }: { cars: CarSnapshot[] }) {
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
            <span>{tireLabels[compound]}</span>
            <strong>{count}</strong>
            <small>{Math.round((count / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function GapHistory({ rows }: { rows: BroadcastTimingRow[] }) {
  const series = useMemo(() => {
    const leader = rows[0]?.car

    if (!leader) return []

    const leaderLaps = new Map(
      leader.lapHistory.map((lap) => [lap.lap, lap.lapTimeSeconds]),
    )

    return rows.slice(0, 8).map((row) => {
      const completed = row.car.lapHistory.slice(-12)
      const currentGap = Math.max(0, row.car.gapToLeader)
      const reverseValues = [currentGap]

      for (const lap of completed.slice().reverse()) {
        const leaderTime = leaderLaps.get(lap.lap)
        const previous = reverseValues.at(-1) ?? currentGap
        reverseValues.push(
          Math.max(0, previous - (leaderTime === undefined ? 0 : lap.lapTimeSeconds - leaderTime)),
        )
      }

      const values = reverseValues.reverse()

      return {
        code: row.car.code,
        color: row.car.teamColor,
        values: values.length > 1 ? values : [currentGap, currentGap],
      }
    })
  }, [rows])

  return (
    <div className="gap-history-chart">
      <div className="gap-history-axis"><span>+0s</span><span>+15s</span><span>+30s</span></div>
      <div className="gap-history-lines">
        {series.map((entry) => (
          <div className="gap-history-line" key={entry.code} title={`${entry.code} gap history`}>
            <span style={{ color: entry.color }}>{entry.code}</span>
            <Sparkline color={entry.color} values={entry.values} />
          </div>
        ))}
      </div>
    </div>
  )
}

function LeftLeaderboard({
  mode,
  onFocusDriver,
  onModeChange,
  rows,
  selectedDriverId,
}: {
  mode: 'live' | 'gap'
  onFocusDriver: (driverId: string) => void
  onModeChange: (mode: 'live' | 'gap') => void
  rows: BroadcastTimingRow[]
  selectedDriverId: string
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
        title="Race Leaderboard"
      />
      <div className="leaderboard-column-head" aria-hidden="true">
        <span>POS</span><span>DRIVER</span><span>TYRE</span><span>{mode === 'gap' ? 'GAP' : 'INT'}</span>
        <span>LAST</span><span>BEST</span><span>S1</span><span>S2</span><span>S3</span><span>SPD</span><span>BAT</span>
      </div>
      <ol
        aria-label="All drivers race leaderboard"
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
                  ) : (
                    <small>{compactSource(row.source)}</small>
                  )}
                </span>
                <span
                  aria-label={`${tireLabels[row.car.tire]} tyre, ${tireLife}% life remaining`}
                  className={`broadcast-tire leaderboard-tire-life tire-${row.car.tire}`}
                  title={`${tireLabels[row.car.tire]} tyre: ${tireLife}% life remaining`}
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
                    title={`S${index + 1}: ${sectorStatusLabels[row.sectorStatuses[index]]}`}
                  >
                    {formatSectorTime(sector)}
                  </span>
                ))}
                <span title={`${row.speedKph} km/h`}>{Math.round(row.speedKph)}</span>
                <span title="ERS battery remaining (simulation estimate)">{row.batteryPercent}%</span>
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
              <span>{row.gear}</span><span>{row.rpm}</span><span>{row.batteryPercent}%</span>
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

function TimingDetail({ rows }: { rows: BroadcastTimingRow[] }) {
  return (
    <div
      aria-label="All drivers sector timing"
      className="timing-detail-list"
      role="list"
      tabIndex={0}
    >
      {rows.map((row) => (
        <div
          className={row.car.blueFlag ? 'blue-flag-active' : undefined}
          data-car-status={row.car.status}
          key={row.car.driverId}
          role="listitem"
        >
          <strong style={{ color: row.car.teamColor }}>{row.displayPosition} {row.car.code}</strong>
          {[0, 1, 2].map((sectorIndex) => (
            <span className="timing-detail-sector" key={sectorIndex}>
              <small>S{sectorIndex + 1}</small>
              <b
                className={`sector-status-${row.sectorStatuses[sectorIndex]}`}
                title={sectorStatusLabels[row.sectorStatuses[sectorIndex]]}
              >
                {formatSectorTime(row.sectors[sectorIndex])}
              </b>
              <MiniSectorStrip
                sectorIndex={sectorIndex}
                states={row.microSectors[sectorIndex]}
              />
            </span>
          ))}
          <span className="timing-lap-source">
            <small>{row.sectorLapNumber === null ? 'L--' : `L${row.sectorLapNumber}`}</small>
            <SourceTag source={row.source === 'openf1' ? 'OBS' : 'SIM'} />
          </span>
        </div>
      ))}
    </div>
  )
}

function CenterView({
  dataControl,
  dataDetails,
  environment,
  raceControlLog,
  rows,
  snapshot,
  track,
  view,
}: {
  dataControl: ReactNode
  dataDetails: BroadcastDataDetail[]
  environment: EnvironmentReadout
  raceControlLog: BroadcastRaceControlEntry[]
  rows: BroadcastTimingRow[]
  snapshot: RaceSnapshot
  track: TrackDefinition
  view: DashboardView
}) {
  if (view === 'timing') return <TimingDetail rows={rows} />
  if (view === 'telemetry') return <TelemetryView rows={rows} />

  if (view === 'track') {
    const aeroSource = track.aeroActivationZones?.every(
      (zone) => zone.source === 'official',
    )
      ? 'FIA'
      : track.aeroActivationZones?.some((zone) => zone.source === 'openf1')
        ? 'OBS'
        : 'CAL'

    return (
      <div className="detail-grid track-detail-grid">
        <span>Track length</span><strong>{track.lengthKm.toFixed(3)} km</strong><SourceTag source={track.lengthSource === 'official' ? 'FIA' : 'SIM'} />
        <span>Layout</span><strong>{layoutGeometryLabel(track)}</strong><SourceTag source={layoutSourceTag(track)} />
        <span>Corners</span><strong>{track.corners?.length ?? 0}</strong><SourceTag source={track.corners ? layoutSourceTag(track) : 'UNAVAILABLE'} />
        <span>Sector boundaries</span><strong>{track.sectorMarks.slice(1).map((mark) => `${Math.round(mark * 100)}%`).join(' / ')}</strong><SourceTag source={track.sectorMarksSource === 'official' ? 'FIA' : 'CAL'} />
        <span>Active aero zones</span><strong>{track.aeroActivationZones?.length ?? 0}</strong><SourceTag source={aeroSource} />
        <span>Overtake detection lines</span><strong>{track.overtakeControlLines?.length ?? 0}</strong><SourceTag source="CAL" />
        <span>Pit speed limit</span><strong>{track.pitLane?.speedLimitKph ?? 80} km/h</strong><SourceTag source={track.pitLane?.speedLimitSource === 'official' ? 'FIA' : 'SIM'} />
        <span>Track evolution</span><strong>{Math.round(snapshot.trackEvolutionLevel * 100)}%</strong><SourceTag source="SIM" />
        <span>Grip</span><strong>{Math.round(snapshot.trackGrip * 100)}%</strong><SourceTag source="SIM" />
      </div>
    )
  }

  if (view === 'weather') {
    const wetness = snapshot.surfaceWaterMmBySector.reduce((sum, value) => sum + value, 0) / 3

    return (
      <div className="detail-grid weather-detail-grid">
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
        <span>Active aero</span><strong>{snapshot.lowGripConditions ? 'PARTIAL FRONT ONLY' : 'FULL ZONES'}</strong><SourceTag source="FIA" />
        <span>Overtake</span><strong>{snapshot.lowGripConditions ? 'DISABLED' : snapshot.overtakeEnabled ? 'ENABLED' : 'CONTROLLED'}</strong><SourceTag source="FIA" />
        <span>Low-grip ERS curve</span><strong>{snapshot.lowGripConditions ? 'CONSERVATIVE EST.' : 'PUBLIC C5.2.8'}</strong><SourceTag source={snapshot.lowGripConditions ? 'UNAVAILABLE' : 'FIA'} />
      </div>
    )
  }

  if (view === 'tyres') {
    return (
      <div className="center-table tyre-detail-table">
        <div className="center-table-head"><span>DRIVER</span><span>COMPOUND</span><span>AGE</span><span>LIFE</span><span>PACE DELTA</span><span>TEMP</span><span>SETS</span><span>STOPS</span><span>SOURCE</span></div>
        <ol aria-label="All drivers tyre information" tabIndex={0}>
          {rows.map((row) => (
            <li key={row.car.driverId}><div>
              <strong style={{ color: row.car.teamColor }}>{row.car.code}</strong>
              <span><i className={`broadcast-tire tire-${row.car.tire}`}>{row.car.tire}</i> {row.car.tire === 'S' || row.car.tire === 'M' || row.car.tire === 'H' ? track.tireNomination?.[row.car.tire] ?? tireLabels[row.car.tire] : tireLabels[row.car.tire]}</span>
              <span>{row.car.tireAgeLaps} L</span><span>{clamp(Math.round(row.tireLifePercent), 0, 100)}%</span>
              <span>{row.tirePaceDeltaSeconds >= 0 ? '+' : ''}{row.tirePaceDeltaSeconds.toFixed(2)}s</span>
              <span>{row.tireTemperatureC} C</span><span>{row.car.tireSetsRemaining[row.car.tire] ?? 0}</span><span>{row.car.pitStops}</span>
              <SourceTag source={row.tireModelSource === 'openf1-calibrated' ? 'CAL' : row.tireModelSource === 'pirelli' ? 'PIR' : 'SIM'} />
            </div></li>
          ))}
        </ol>
      </div>
    )
  }

  if (view === 'messages') {
    return (
      <ol className="detail-message-list">
        {raceControlLog.slice(0, 12).map((event) => (
          <li key={event.id}><time>{event.timeLabel}</time><SourceTag source={event.source === 'OPENF1' ? 'OBS' : 'SIM'} /><span>{event.message}</span></li>
        ))}
      </ol>
    )
  }

  if (view === 'alerts') {
    const alerts = [
      ...rows
        .filter((row) => row.car.stewardStatus !== 'clear' || row.car.damage > 0.02)
        .map((row) => ({ id: row.car.driverId, label: row.car.code, message: row.car.stewardNote ?? `Car damage ${Math.round(row.car.damage * 100)}%` })),
      ...snapshot.events
        .filter((event) => ['accident', 'incident', 'penalty', 'investigation', 'track-limit'].includes(event.kind))
        .slice(0, 8)
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
    ]

    return alerts.length > 0 ? (
      <ol className="alert-list">
        {alerts.slice(0, 12).map((alert) => <li key={alert.id}><AlertTriangle size={13} /><strong>{alert.label}</strong><span>{alert.message}</span></li>)}
      </ol>
    ) : <div className="empty-detail"><ShieldAlert size={22} /><strong>No active investigations</strong><span>Race control is monitoring the session.</span></div>
  }

  if (view === 'drivers') {
    return (
      <div className="center-table driver-detail-table">
        <div className="center-table-head"><span>DRIVER</span><span>OVR</span><span>TEAM</span><span>GRID</span><span>POS</span><span>CHANGE</span><span>CAR DELTA</span><span>MODE</span><span>STATUS</span></div>
        <ol aria-label="All driver information" tabIndex={0}>{rows.map((row) => (
          <li key={row.car.driverId}><div>
            <strong style={{ color: row.car.teamColor }}>{row.car.code}</strong><b>{row.driverOverallAbility || '--'}</b><span>{row.car.teamName}</span>
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
  onSpeedChange,
  raceControlLog,
  selectedCar,
  sessionProgressLabel,
  snapshot,
  speed,
  stage,
  timingRows,
  track,
  trackScene,
}: BroadcastDashboardProps) {
  const [activeView, setActiveView] = useState<DashboardView>('timing')
  const [leaderboardMode, setLeaderboardMode] = useState<'live' | 'gap'>('live')
  const [feedMode, setFeedMode] = useState<'control' | 'events'>('control')
  const [showLiveTiming, setShowLiveTiming] = useState(true)
  const [showRaceFeed, setShowRaceFeed] = useState(true)

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
  const trackEvolution = useMemo(
    () => Array.from({ length: 18 }, (_, index) => {
      const progress = index / 17
      const wave = Math.sin(index * 1.6) * 0.018
      return clamp(0.22 + snapshot.trackEvolutionLevel * progress + wave, 0, 1)
    }),
    [snapshot.trackEvolutionLevel],
  )
  const displayedFeed = feedMode === 'control'
    ? raceControlLog
    : snapshot.events.map((event) => ({
        id: event.id,
        message: event.message,
        source: 'SIM',
        timeLabel: event.timeLabel,
      }))
  const trackTitle = `${eventName.replace(/\s+20\d{2}$/u, '')} 2026`
  const averageWater = snapshot.surfaceWaterMmBySector.reduce((sum, value) => sum + value, 0) / 3
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
  const controlFlagLabel = sectorFlagIsLocal && activeSectorFlag
    ? `${sectorFlagLabels[activeSectorFlag]} S${activeSectorFlagIndex + 1}`
    : uniformSectorFlag
      ? sectorFlagLabels[uniformSectorFlag]
      : snapshot.flagLabel
  const controlFlagClass = activeSectorFlag?.includes('yellow')
    ? 'yellow'
    : (activeSectorFlag ?? snapshot.flag)

  return (
    <div className="broadcast-app">
      <header className="broadcast-topbar">
        <div className="broadcast-brand"><Gauge aria-hidden="true" size={29} /><div><strong>{trackTitle}</strong><span>{track.name}</span></div></div>
        <div className="broadcast-session-core">
          <span className={`broadcast-live-mode mode-${dataMode.toLowerCase()}`}>{dataMode}</span>
          <strong>{stage.toUpperCase()}</strong>
          <span>{sessionProgressLabel}</span>
          <time>{formatClock(snapshot.raceClockSeconds)}</time>
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
                if (id === 'timing') setShowLiveTiming(true)
                if (id === 'messages') setShowRaceFeed(true)
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
            mode={leaderboardMode}
            onFocusDriver={onFocusDriver}
            onModeChange={setLeaderboardMode}
            rows={timingRows}
            selectedDriverId={selectedCar.driverId}
          />
          <div className="broadcast-left-analytics">
            <section className="broadcast-panel tyre-usage-panel"><PanelHeader title="Tyre Compound Usage" /><TireUsage cars={timingRows.map((row) => row.car)} /></section>
            <section className="broadcast-panel pit-stop-panel"><PanelHeader title="Pit Stops" /><div aria-label="All drivers pit stops" className="pit-stop-list" role="table" tabIndex={0}><div role="row"><span>DRIVER</span><span>STOPS</span><span>LAST</span></div>{timingRows.filter((row) => row.car.pitStops > 0).map((row) => <div key={row.car.driverId} role="row"><strong style={{ color: row.car.teamColor }}>{row.car.code}</strong><span>{row.car.pitStops}</span><span>{latestPitLap(row.car) ?? '-'}</span></div>)}</div></section>
            <section className="broadcast-panel gap-history-panel"><PanelHeader eyebrow="COMPLETED LAPS" title="Gap To Leader" /><GapHistory rows={timingRows} /></section>
          </div>
        </div>

        <div className="broadcast-center-column">
          <section className="broadcast-panel broadcast-live-timing">
            <PanelHeader
              action={<button aria-label={showLiveTiming ? 'Hide live timing' : 'Show live timing'} className="panel-close" onClick={() => setShowLiveTiming((value) => !value)} title={showLiveTiming ? 'Hide live timing' : 'Show live timing'} type="button">{showLiveTiming ? <X size={13} /> : <Timer size={13} />}</button>}
              eyebrow={activeView === 'timing' ? `ALL ${timingRows.length}` : activeView.toUpperCase()}
              title={dashboardViews.find((item) => item.id === activeView)?.label ?? 'Timing'}
            />
            {showLiveTiming ? (
              <CenterView
                dataControl={dataControl}
                dataDetails={dataDetails}
                environment={environment}
                raceControlLog={raceControlLog}
                rows={timingRows}
                snapshot={snapshot}
                track={track}
                view={activeView}
              />
            ) : <button className="restore-panel" onClick={() => setShowLiveTiming(true)} type="button"><Timer size={14} /> Restore live timing</button>}
          </section>

          <section className="broadcast-panel broadcast-track-panel">
            <PanelHeader
              action={<div className="camera-switch">{(['overview', 'chase', 'orbit'] as const).map((mode) => <button aria-pressed={cameraMode === mode} disabled={dataMode !== 'SIM' && mode !== 'overview'} key={mode} onClick={() => onCameraModeChange(mode)} title={`${mode} camera`} type="button">{mode === 'overview' ? <MapIcon size={12} /> : mode === 'chase' ? <Gauge size={12} /> : <Route size={12} />}</button>)}</div>}
              eyebrow={`${track.lengthKm.toFixed(3)} KM / ${track.aeroActivationZones?.length ?? 0} AERO ZONES`}
              title={`Track Map - ${track.name}`}
            />
            <div className="broadcast-track-stage">
              <div className="map-grid-texture" aria-hidden="true" />
              {trackScene}
              <div className="track-map-status"><span className={`flag-dot flag-${controlFlagClass}`} />{snapshot.lowGripConditions ? 'LOW GRIP' : controlFlagLabel}<SourceTag source={layoutSourceTag(track)} /></div>
              <div className="track-map-legend">
                {(Object.keys(tireLabels) as CarSnapshot['tire'][]).map((compound) => <span key={compound}><i className={`broadcast-tire tire-${compound}`}>{compound}</i>{tireLabels[compound]}</span>)}
              </div>
            </div>
          </section>

        </div>

        <aside className="broadcast-right-column">
          <section className="broadcast-panel race-control-panel">
            <PanelHeader eyebrow={snapshot.lowGripConditions ? 'LOW GRIP / OVERTAKE OFF' : controlFlagLabel === 'CLEAR' ? 'TRACK CLEAR' : controlFlagLabel} title="Race Control" />
            <div className="track-status-grid"><div><span>TRACK STATUS</span><strong className={`flag-${controlFlagClass}`}>{snapshot.lowGripConditions ? `LOW ${Math.round(snapshot.trackGrip * 100)}%` : controlFlagLabel}</strong></div><div><span>ACTIVE AERO</span><strong>{snapshot.lowGripConditions ? 'PARTIAL' : 'FULL ZONES'}</strong></div><div><span>OVERTAKE</span><strong>{snapshot.lowGripConditions ? 'OFF' : snapshot.overtakeEnabled ? 'ON' : 'CONTROL'}</strong></div></div>
            <div
              className="sector-flag-strip"
              aria-label={snapshot.sectorFlags
                .map((flag, index) => `Sector ${index + 1} ${sectorFlagLabels[flag]}`)
                .join(', ')}
            >
              {snapshot.sectorFlags.map((flag, index) => (
                <span className={`sector-flag sector-flag-${flag}`} key={index}>
                  <b>S{index + 1}</b>
                  <strong>{sectorFlagLabels[flag]}</strong>
                </span>
              ))}
            </div>
          </section>
          <section className="broadcast-panel evolution-panel"><PanelHeader eyebrow="SIM MODEL" title="Track Evolution" /><Sparkline values={trackEvolution} /><div className="evolution-axis"><span>LOW</span><span>LAP {snapshot.leaderLap}</span><span>HIGH</span></div></section>
          <section className="broadcast-panel conditions-panel"><PanelHeader title="Current Conditions" /><div className="conditions-grid"><div><Thermometer size={15}/><span>AIR TEMP</span><strong>{cleanEnvironmentValue(environment.airLabel)}</strong></div><div><Gauge size={15}/><span>TRACK TEMP</span><strong>{cleanEnvironmentValue(environment.trackLabel)}</strong></div><div><Droplets size={15}/><span>WATER</span><strong>{averageWater.toFixed(2)} mm</strong></div><div><Wind size={15}/><span>WIND</span><strong>{cleanEnvironmentValue(environment.windLabel)}</strong></div><div><CloudRain size={15}/><span>RAIN</span><strong>{cleanEnvironmentValue(environment.rainLabel)}</strong></div></div></section>
          <section className="broadcast-panel messages-panel">
            <PanelHeader action={<button aria-label={showRaceFeed ? 'Hide messages' : 'Show messages'} className="panel-close" onClick={() => setShowRaceFeed((value) => !value)} title={showRaceFeed ? 'Hide messages' : 'Show messages'} type="button"><X size={13}/></button>} title="Messages" />
            <div className="broadcast-tabs feed-tabs">{(['control', 'events'] as const).map((mode) => <button aria-selected={feedMode === mode} key={mode} onClick={() => setFeedMode(mode)} type="button">{mode === 'control' ? 'RACE CONTROL' : 'EVENTS'}</button>)}</div>
            {showRaceFeed ? <ol className="race-message-list">{displayedFeed.slice(0, 9).map((event) => <li key={event.id}><time>{event.timeLabel}</time><span>{event.message}</span></li>)}</ol> : <button className="restore-panel" onClick={() => setShowRaceFeed(true)} type="button"><MessageSquare size={13}/> Restore messages</button>}
          </section>
          <section className="broadcast-panel fastest-lap-panel"><span>FASTEST LAP</span><strong>{formatLapTime(fastestRow?.car.bestLapTimeSeconds)}</strong><small>{fastestRow ? `${fastestRow.car.driverName} / LAP ${fastestRow.car.bestLapLap ?? '-'}` : 'Awaiting completed lap'}</small></section>
          <section className="broadcast-panel live-gap-panel"><PanelHeader title="Live Gap To Leader" /><ol aria-label="All drivers gaps to leader" tabIndex={0}>{timingRows.slice(1).map((row) => <li key={row.car.driverId}><strong style={{ color: row.car.teamColor }}>{row.displayPosition} {row.car.code}</strong><span><i style={{ backgroundColor: row.car.teamColor, width: `${clamp(100 - row.car.gapToLeader * 2.4, 12, 100)}%` }} /></span><b>{row.displayGapToLeaderLabel}</b></li>)}</ol></section>
        </aside>
      </main>

      <footer className="broadcast-footer">
        <div className="footer-race-control"><Radio size={14}/><strong>RACE CONTROL</strong><time>{raceControlLog[0]?.timeLabel ?? snapshot.elapsedLabel}</time><span>{raceControlLog[0]?.message ?? snapshot.eventMessage}</span></div>
        <div className="footer-controls">
          <button aria-label={isPaused ? 'Resume simulation' : 'Pause simulation'} onClick={onPauseChange} title={isPaused ? 'Resume' : 'Pause'} type="button">{isPaused ? <Play size={14}/> : <Pause size={14}/>}</button>
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
