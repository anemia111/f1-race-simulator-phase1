import { Activity, BarChart3, Flag, Gauge, Route, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { strategyOutlookFor } from '../simulation/strategy'
import { rankSeasonEntries, type SeasonState } from '../simulation/season'
import { tireConditionFor } from '../simulation/tires'
import type {
  CarSnapshot,
  Driver,
  RacePaceMode,
  RaceSnapshot,
  TrackDefinition,
  WeekendContext,
} from '../types'

type RaceInsightsPanelProps = {
  car: CarSnapshot
  openF1Mode: 'LIVE' | 'HIST' | 'SIM'
  driver: Driver
  onClose: () => void
  snapshot: RaceSnapshot
  telemetryIsOpenF1: boolean
  timingIsOpenF1: boolean
  track: TrackDefinition
  weekendContext: WeekendContext
  season: SeasonState
  onRequestPitStop: (driverId: string, compound: CarSnapshot['tire']) => void
  onSetDriverPaceMode: (driverId: string, mode: RacePaceMode) => void
}

const formatLapTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remaining}`
}

const compactWeather = (weather: RaceSnapshot['weather']) =>
  weather === 'heavy-rain' ? 'Heavy rain' : weather === 'light-rain' ? 'Light rain' : 'Dry'

export function RaceInsightsPanel({
  car,
  openF1Mode,
  driver,
  onClose,
  snapshot,
  telemetryIsOpenF1,
  timingIsOpenF1,
  track,
  weekendContext,
  season,
  onRequestPitStop,
  onSetDriverPaceMode,
}: RaceInsightsPanelProps) {
  const [requestedCompound, setRequestedCompound] = useState<CarSnapshot['tire']>(car.tire)
  const tireCondition = useMemo(
    () =>
      tireConditionFor(
        car.tire,
        car.tireAgeLaps,
        driver.tireManagement,
        car.tireTemperatureC,
        car.tireWearPercent,
        track.tireNomination,
      ),
    [car.tire, car.tireAgeLaps, car.tireTemperatureC, car.tireWearPercent, driver.tireManagement, track.tireNomination],
  )
  const pitForecast = useMemo(() => {
    const lossSeconds = track.observedCalibration?.pitLaneTransitSeconds ??
      16 +
        (80 - (track.pitLane?.speedLimitKph ?? 80)) * 0.1 +
        (track.kind === 'street' ? 2.5 : 0)
    const projectedDistance = car.totalDistance - lossSeconds / track.baseLapTime
    const projectedPosition =
      1 +
      snapshot.cars.filter(
        (candidate) =>
          candidate.driverId !== car.driverId &&
          candidate.status === 'running' &&
          candidate.totalDistance > projectedDistance,
      ).length

    return { lossSeconds, projectedPosition }
  }, [car.driverId, car.totalDistance, snapshot.cars, track.baseLapTime, track.kind, track.observedCalibration?.pitLaneTransitSeconds, track.pitLane?.speedLimitKph])
  const strategy = useMemo(
    () =>
      strategyOutlookFor({
        car,
        driver,
        lap: snapshot.leaderLap,
        raceLaps: snapshot.raceLaps,
        seed: `${track.id}:${snapshot.weekend.stage}`,
        trackGrip: snapshot.trackGrip,
        underSafetyCar: snapshot.flag === 'sc' || snapshot.flag === 'vsc',
        weather: snapshot.weather,
        tireNomination: track.tireNomination,
        pitLaneLossSeconds: pitForecast.lossSeconds,
        gapToAheadSeconds: car.gapToAhead,
        projectedRejoinPositionLoss: pitForecast.projectedPosition - car.position,
        teammateInPit: snapshot.cars.some(
          (candidate) =>
            candidate.driverId !== car.driverId &&
            candidate.teamId === car.teamId &&
            candidate.pitPhase !== 'none',
        ),
      }),
    [car, driver, pitForecast.lossSeconds, pitForecast.projectedPosition, snapshot.cars, snapshot.flag, snapshot.leaderLap, snapshot.raceLaps, snapshot.trackGrip, snapshot.weather, snapshot.weekend.stage, track.id, track.tireNomination],
  )
  const weakestComponentEntry = useMemo(
    () =>
      Object.entries(car.components).sort(
        (left, right) => left[1].conditionPercent - right[1].conditionPercent,
      )[0],
    [car.components],
  )
  const recentLaps = useMemo(() => car.lapHistory.slice(-8).reverse(), [car.lapHistory])
  const relevantEvents = useMemo(
    () => snapshot.events.filter((event) => event.message.includes(car.code)),
    [car.code, snapshot.events],
  )
  const fastestSectors = useMemo(() => {
    if (car.lapHistory.length === 0) {
      return null
    }

    return [0, 1, 2].map((sector) =>
      Math.min(...car.lapHistory.map((lap) => lap.sectors[sector])),
    )
  }, [car.lapHistory])
  const lapTrend = useMemo(() => {
    const fastest = Math.min(
      ...recentLaps.map((lap) => lap.lapTimeSeconds),
    )
    const slowest = Math.max(
      ...recentLaps.map((lap) => lap.lapTimeSeconds),
    )
    const spread = Math.max(0.1, slowest - fastest)

    return recentLaps
      .slice()
      .reverse()
      .map((lap) => ({
        ...lap,
        width: 18 + ((lap.lapTimeSeconds - fastest) / spread) * 82,
      }))
  }, [recentLaps])
  const championship = useMemo(() => {
    const selectedPoints = season.driverPoints[car.driverId] ?? 0
    const leader = rankSeasonEntries(season.driverPoints, season.driverResults)[0]
    const leaderCar = leader
      ? snapshot.cars.find((candidate) => candidate.driverId === leader[0])
      : null

    return {
      leaderLabel: leader ? `${leaderCar?.code ?? leader[0]} ${leader[1]} pts` : '--',
      selectedPoints,
    }
  }, [car.driverId, season.driverPoints, season.driverResults, snapshot.cars])

  return (
    <section className="hud insights-panel" aria-label="race analysis">
      <header>
        <span>
          <BarChart3 aria-hidden="true" size={14} />
          Race analysis
        </span>
        <strong>{car.code} P{car.position}</strong>
        <button aria-label="hide race analysis" onClick={onClose} title="Hide race analysis" type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </header>

      <div className="insight-source-grid">
        <span>Timing</span><strong className={timingIsOpenF1 ? 'flag-clear' : 'flag-yellow'}>{timingIsOpenF1 ? 'OpenF1' : 'SIM record'}</strong>
        <span>Telemetry</span><strong className={telemetryIsOpenF1 ? 'flag-clear' : 'flag-yellow'}>{telemetryIsOpenF1 ? 'OpenF1' : 'SIM model'}</strong>
        <span>Race engine</span><strong>SIM</strong>
        <span>OpenF1 layer</span><strong>{openF1Mode}</strong>
        <span>Layout</span><strong className={track.layoutSource?.detail === 'real' ? 'flag-clear' : 'flag-yellow'}>{track.layoutSource?.detail === 'real' ? 'Real' : 'Fallback'}</strong>
      </div>

      <section className="insight-section">
        <h2><Gauge aria-hidden="true" size={13} /> Tyres & surface</h2>
        <div className="insight-grid">
          <span>Compound</span><strong>{car.tire} / {car.tireAgeLaps} laps</strong>
          <span>Life</span><strong>{tireCondition.lifeRemainingPercent}% / {tireCondition.wearState}</strong>
          <span>Temperature</span><strong>{Math.round(car.tireTemperatureC)}C / {tireCondition.operatingState}</strong>
          <span>Wear / brakes</span><strong>{Math.round(car.tireWearPercent)}% / {Math.round(car.brakeTemperatureC)}C</strong>
          <span>Surface</span><strong>{compactWeather(snapshot.weather)} / {Math.round(snapshot.trackGrip * 100)}% grip</strong>
        </div>
      </section>

      <section className="insight-section">
        <h2><Flag aria-hidden="true" size={13} /> Championship</h2>
        <div className="insight-grid">
          <span>Rounds</span><strong>{season.completedRounds.length}</strong>
          <span>{car.code}</span><strong>{championship.selectedPoints} pts</strong>
          <span>Leader</span><strong>{championship.leaderLabel}</strong>
          <span>Team</span><strong>{season.teamPoints[car.teamId] ?? 0} pts</strong>
        </div>
      </section>

      <section className="insight-section">
        <h2><Route aria-hidden="true" size={13} /> Strategy outlook</h2>
        <div className="insight-grid">
          <span>Call</span><strong className={`strategy-${strategy.urgency}`}>{strategy.urgency.toUpperCase()} / {strategy.reason}</strong>
          <span>Next stop</span><strong>Lap {strategy.estimatedStopLap}</strong>
          <span>Next tyre</span><strong>{strategy.compound}</strong>
          <span>Gap ahead</span><strong>{car.gapToAheadLabel}</strong>
          <span>Rejoin</span><strong>P{pitForecast.projectedPosition} / {pitForecast.lossSeconds.toFixed(1)}s</strong>
          <span>Stop now delta</span><strong className={strategy.expectedNetGainSeconds >= 0 ? 'flag-clear' : 'flag-yellow'}>{strategy.expectedNetGainSeconds >= 0 ? '+' : ''}{strategy.expectedNetGainSeconds.toFixed(1)}s / {strategy.confidence}</strong>
          <span>Effective loss</span><strong>{strategy.estimatedPitLossSeconds.toFixed(1)}s</strong>
          <span>Pit lane</span><strong className={snapshot.pitLaneOpen ? 'flag-clear' : 'flag-red'}>{snapshot.pitLaneOpen ? 'OPEN' : 'CLOSED'}</strong>
        </div>
        <div className="manual-strategy">
          <select
            aria-label="requested pit compound"
            onChange={(event) => setRequestedCompound(event.target.value as CarSnapshot['tire'])}
            value={requestedCompound}
          >
            {(['S', 'M', 'H', 'I', 'W'] as const).map((compound) => (
              <option disabled={(car.tireSetsRemaining[compound] ?? 0) <= 0} key={compound} value={compound}>
                {compound} ({car.tireSetsRemaining[compound] ?? 0})
              </option>
            ))}
          </select>
          <button
            disabled={car.status !== 'running' || (car.tireSetsRemaining[requestedCompound] ?? 0) <= 0}
            onClick={() => onRequestPitStop(car.driverId, requestedCompound)}
            title="Request a pit stop at the next safe lap crossing"
            type="button"
          >
            Box {requestedCompound}
          </button>
        </div>
        <div className="pace-mode-row" aria-label="driver pace mode">
          {(['push', 'standard', 'save', 'defend'] as const).map((mode) => (
            <button
              aria-pressed={car.racePaceMode === mode}
              key={mode}
              onClick={() => onSetDriverPaceMode(car.driverId, mode)}
              title={`Set ${mode} pace mode`}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section className="insight-section">
        <h2><Gauge aria-hidden="true" size={13} /> Car systems</h2>
        <div className="insight-grid">
          <span>Active aero</span><strong>{car.activeAeroMode}</strong>
          <span>Overtake</span><strong>{car.overtakeStatus}</strong>
          <span>Battery</span><strong>{Math.round(car.ersBatteryPercent)}% / {car.ersMode}</strong>
          <span>Overtake energy</span><strong>{car.overtakeEnergyRemainingMj.toFixed(2)} MJ / 0.50</strong>
          <span>Harvested</span><strong>{car.energyHarvestedThisLapMj.toFixed(2)} MJ / 7.00</strong>
          <span>VSC delta</span><strong className={car.vscDeltaSeconds < 0 ? 'flag-red' : 'flag-clear'}>{car.vscDeltaSeconds >= 0 ? '+' : ''}{car.vscDeltaSeconds.toFixed(2)}s</strong>
          <span>Weakest component</span><strong>{weakestComponentEntry ? `${weakestComponentEntry[0]} ${Math.round(weakestComponentEntry[1].conditionPercent)}%` : '-'}</strong>
          <span>Battle state</span><strong>{car.battlePhase}</strong>
        </div>
      </section>

      <section className="insight-section insight-lap-section">
        <h2><Activity aria-hidden="true" size={13} /> Completed lap history</h2>
        {recentLaps.length === 0 ? (
          <p>Awaiting the first completed lap.</p>
        ) : (
          <ol className="lap-history">
            {recentLaps.map((lap) => (
              <li key={lap.lap}>
                <span>L{lap.lap}</span>
                <strong>{formatLapTime(lap.lapTimeSeconds)}</strong>
                <span>{lap.sectors.map((sector) => sector.toFixed(3)).join(' / ')}</span>
                <span>{lap.tire}{lap.tireAgeLaps}{lap.pitStop ? ' PIT' : ''}</span>
              </li>
            ))}
          </ol>
        )}
        {fastestSectors ? (
          <small>PB sectors: {fastestSectors.map((sector) => sector.toFixed(3)).join(' / ')}</small>
        ) : null}
        {lapTrend.length > 1 ? (
          <ol className="lap-trend" aria-label="lap time comparison">
            {lapTrend.map((lap) => (
              <li key={lap.lap}>
                <span>L{lap.lap}</span>
                <span className="lap-trend-track"><span style={{ width: `${lap.width}%` }} /></span>
                <strong>#{lap.position}</strong>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="insight-section">
        <h2><Route aria-hidden="true" size={13} /> Track profile</h2>
        <div className="insight-grid">
          <span>Active aero</span><strong>{track.aeroActivationZones?.length ?? 0} / {track.aeroActivationZones?.[0]?.source ?? 'unavailable'}</strong>
          <span>Corners</span><strong>{track.corners?.length ?? 0}</strong>
          <span>Pit boxes</span><strong>{track.pitLane?.boxCount ?? 0} / model</strong>
          <span>Safety lines</span><strong>{track.safetyCarLines ? 'Derived' : 'Unavailable'}</strong>
        </div>
      </section>

      <section className="insight-section">
        <h2><Flag aria-hidden="true" size={13} /> Classification & weekend</h2>
        <div className="insight-grid">
          <span>Grid change</span><strong>{car.gridPosition - car.position > 0 ? '+' : ''}{car.gridPosition - car.position}</strong>
          <span>Penalties</span><strong>{car.penaltySeconds + car.servedPenaltySeconds}s / {car.trackLimitWarnings} TL</strong>
          <span>Deleted laps</span><strong>{car.deletedLapCount} / {car.impedingWarnings} impeding</strong>
          <span>107% status</span><strong className={car.outside107Percent && !car.stewardsGrantedStart ? 'flag-red' : 'flag-clear'}>{car.outside107Percent ? (car.stewardsGrantedStart ? 'EXEMPT' : 'OUT') : 'CLEAR'}</strong>
          <span>Race events</span><strong>{relevantEvents.length}</strong>
          <span>Weekend</span><strong>{weekendContext.completed.length} complete</strong>
        </div>
        {weekendContext.notes.length > 0 ? <small>{weekendContext.notes.slice(-2).join(' / ')}</small> : null}
      </section>
    </section>
  )
}
