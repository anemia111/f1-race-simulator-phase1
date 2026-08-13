import { Activity, BarChart3, Flag, Gauge, Route, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePitStrategyOutlook } from '../hooks/usePitStrategyOutlook'
import { formatLapTime } from '../domain/timingFormat'
import {
  completedSeasonEventCount,
  rankSeasonEntries,
  superFormulaNextEventEligibility,
  type SeasonState,
} from '../simulation/season'
import { weakestComponent } from '../simulation/components'
import { tireDisplayForLapRecord } from '../simulation/classification'
import { tireConditionFor } from '../simulation/tires'
import { driverAbilityValue } from '../simulation/driverAbility'
import type {
  CarSnapshot,
  Driver,
  RacePaceMode,
  RaceSnapshot,
  TireCompound,
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
  onRequestPitStop: (driverId: string, compound: TireCompound) => void
  onSetDriverPaceMode: (driverId: string, mode: RacePaceMode) => void
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
  const f1Runtime =
    car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
  const f1Tires = f1Runtime?.tires ?? null
  const superFormulaRuntime =
    car.runtimeSystems.kind === 'super-formula'
      ? car.runtimeSystems
      : null
  const superFormulaArticle5Eligibility = useMemo(
    () =>
      superFormulaRuntime !== null && season.seriesId === 'super-formula'
        ? superFormulaNextEventEligibility(season, car.driverId)
        : null,
    [car.driverId, season, superFormulaRuntime],
  )
  const [requestedCompound, setRequestedCompound] = useState<TireCompound>(
    () => f1Tires?.tire ?? 'M',
  )
  const qualifyingClassificationStatus =
    car.qualifyingClassificationStatus ?? 'classified'
  const qualifyingClassificationLabel =
    qualifyingClassificationStatus === 'no-time'
      ? car.stewardsGrantedStart
        ? 'PERMITTED'
        : 'NO TIME'
      : qualifyingClassificationStatus === 'deleted'
        ? car.stewardsGrantedStart
          ? 'PERMITTED'
          : 'DELETED'
        : 'CLASSIFIED'
  const tireManagement = driverAbilityValue(driver, 'tireManagement')
  const tireCondition = useMemo(
    () =>
      f1Tires
        ? tireConditionFor(
            f1Tires.tire,
            f1Tires.tireAgeLaps,
            tireManagement,
            f1Tires.tireTemperatureC,
            f1Tires.tireWearPercent,
            track.tireNomination,
          )
        : null,
    [f1Tires, tireManagement, track.tireNomination],
  )
  const strategy = usePitStrategyOutlook({ car, driver, snapshot, track })
  const f1StrategyView =
    f1Runtime !== null && strategy !== null
      ? { strategy, tires: f1Runtime.tires }
      : null
  const weakestComponentEntry = useMemo(
    () => (f1Runtime ? weakestComponent(f1Runtime.components) : null),
    [f1Runtime],
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
        {f1Runtime && strategy !== null ? (
          <>
            <span>Timing</span><strong className={timingIsOpenF1 ? 'flag-clear' : 'flag-yellow'}>{timingIsOpenF1 ? 'OpenF1' : 'SIM record'}</strong>
            <span>Telemetry</span><strong className={telemetryIsOpenF1 ? 'flag-clear' : 'flag-yellow'}>{telemetryIsOpenF1 ? 'OpenF1' : 'SIM model'}</strong>
            <span>Race engine</span><strong>SIM</strong>
            <span>OpenF1 layer</span><strong>{openF1Mode}</strong>
          </>
        ) : (
          <>
            <span>Timing</span><strong>SIM record</strong>
            <span>Telemetry</span><strong>SIM model</strong>
            <span>Race engine</span><strong>SIM</strong>
            <span>Category rules</span><strong>JAF source package</strong>
          </>
        )}
        <span>Layout</span><strong className={track.layoutSource?.detail === 'real' ? 'flag-clear' : 'flag-yellow'}>{track.layoutSource?.detail === 'real' ? 'Real' : 'Fallback'}</strong>
      </div>

      <section className="insight-section">
        <h2><Gauge aria-hidden="true" size={13} /> Tyres & surface</h2>
        {f1Runtime && tireCondition ? (
          <div className="insight-grid">
            <span>Compound</span><strong>{f1Runtime.tires.tire} / {f1Runtime.tires.tireAgeLaps} laps</strong>
            <span>Life</span><strong>{tireCondition.lifeRemainingPercent}% / {tireCondition.wearState}</strong>
            <span>Temperature</span><strong>{Math.round(f1Runtime.tires.tireTemperatureC)}C / {tireCondition.operatingState}</strong>
            <span>Life / brakes</span><strong>{tireCondition.lifeRemainingPercent}% / {Math.round(car.brakeTemperatureC)}C</strong>
            <span>Surface</span><strong>{compactWeather(snapshot.weather)} / {Math.round(snapshot.trackGrip * 100)}% grip</strong>
          </div>
        ) : superFormulaRuntime ? (
          <div className="insight-grid">
            <span>Control tyres</span><strong>dry {superFormulaRuntime.controlTires.sets.dry.maximumSets} / wet {superFormulaRuntime.controlTires.sets.wet.maximumSets} maximum sets</strong>
            <span>Fitted control tyre</span><strong>{superFormulaRuntime.liveTires.activeSurface.toUpperCase()} / {superFormulaRuntime.liveTires.lapsOnCurrentSet} laps</strong>
            <span>Dry inventory</span><strong>{superFormulaRuntime.controlTires.sets.dry.remainingSets} remaining / {superFormulaRuntime.controlTires.sets.dry.usedSets} used</strong>
            <span>Wet inventory</span><strong>{superFormulaRuntime.controlTires.sets.wet.remainingSets} remaining / {superFormulaRuntime.controlTires.sets.wet.usedSets} used</strong>
            <span>Physical tyre model</span><strong>UNAVAILABLE / no verified coefficients</strong>
            <span>Surface</span><strong>{compactWeather(snapshot.weather)} / {Math.round(snapshot.trackGrip * 100)}% grip</strong>
          </div>
        ) : null}
      </section>

      <section className="insight-section">
        <h2><Flag aria-hidden="true" size={13} /> Championship</h2>
        <div className="insight-grid">
          <span>Rounds</span><strong>{completedSeasonEventCount(season.completedRounds)}</strong>
          <span>{car.code}</span><strong>{championship.selectedPoints} pts</strong>
          <span>Leader</span><strong>{championship.leaderLabel}</strong>
          <span>Team</span><strong>{season.teamPoints[car.teamId] ?? 0} pts</strong>
        </div>
      </section>

      <section className="insight-section">
        <h2><Route aria-hidden="true" size={13} /> Strategy outlook</h2>
        {f1StrategyView !== null ? (
          <>
            <div className="insight-grid">
              <span>Call</span><strong className={`strategy-${f1StrategyView.strategy.outlook.urgency}`}>{f1StrategyView.strategy.outlook.urgency.toUpperCase()} / {f1StrategyView.strategy.outlook.reason}</strong>
              <span>Next stop</span><strong>Lap {f1StrategyView.strategy.outlook.estimatedStopLap}</strong>
              <span>Next tyre</span><strong>{f1StrategyView.strategy.outlook.compound}</strong>
              <span>Gap ahead</span><strong>{car.gapToAheadLabel}</strong>
              <span>Rejoin</span><strong>P{f1StrategyView.strategy.projectedRejoinPosition} / {f1StrategyView.strategy.pitLaneLossSeconds.toFixed(1)}s</strong>
              <span>Stop now delta</span><strong className={f1StrategyView.strategy.outlook.expectedNetGainSeconds >= 0 ? 'flag-clear' : 'flag-yellow'}>{f1StrategyView.strategy.outlook.expectedNetGainSeconds >= 0 ? '+' : ''}{f1StrategyView.strategy.outlook.expectedNetGainSeconds.toFixed(1)}s / {f1StrategyView.strategy.outlook.confidence}</strong>
              <span>Effective loss</span><strong>{f1StrategyView.strategy.outlook.estimatedPitLossSeconds.toFixed(1)}s</strong>
              <span>Pit lane / exit</span><strong className={snapshot.pitLaneOpen && snapshot.pitExitOpen ? 'flag-clear' : 'flag-red'}>{snapshot.pitLaneOpen ? (snapshot.pitExitOpen ? 'OPEN' : 'EXIT RED') : 'CLOSED'}</strong>
            </div>
            <div className="manual-strategy">
              <select
                aria-label="requested pit compound"
                onChange={(event) => setRequestedCompound(event.target.value as TireCompound)}
                value={requestedCompound}
              >
                {(['S', 'M', 'H', 'I', 'W'] as const).map((compound) => (
                  <option disabled={(f1StrategyView.tires.tireSetsRemaining[compound] ?? 0) <= 0} key={compound} value={compound}>
                    {compound} ({f1StrategyView.tires.tireSetsRemaining[compound] ?? 0})
                  </option>
                ))}
              </select>
              <button
                disabled={car.status !== 'running' || (f1StrategyView.tires.tireSetsRemaining[requestedCompound] ?? 0) <= 0}
                onClick={() => onRequestPitStop(car.driverId, requestedCompound)}
                title="Request a pit stop at the next safe lap crossing"
                type="button"
              >
                Box {requestedCompound}
              </button>
            </div>
          </>
        ) : f1Runtime ? (
          <p>F1 strategy model is unavailable for this runtime state.</p>
        ) : superFormulaRuntime ? (
          <div className="insight-grid">
            <span>Pit lane / exit</span><strong className={snapshot.pitLaneOpen && snapshot.pitExitOpen ? 'flag-clear' : 'flag-red'}>{snapshot.pitLaneOpen ? (snapshot.pitExitOpen ? 'OPEN' : 'EXIT RED') : 'CLOSED'}</strong>
            <span>Refuelling</span><strong>{superFormulaRuntime.refuelling.permittedByRegulation ? 'PERMITTED BY BASE RULE' : 'UNAVAILABLE'}</strong>
            <span>Safety gate</span><strong>{superFormulaRuntime.refuelling.safetyGate.status.toUpperCase()}</strong>
            <span>Fuel transfer rate</span><strong>UNAVAILABLE</strong>
            <span>Service duration</span><strong>UNAVAILABLE</strong>
            <span>Fitted control tyre</span><strong>{superFormulaRuntime.liveTires.activeSurface.toUpperCase()} / {superFormulaRuntime.liveTires.lapsOnCurrentSet} laps</strong>
            <span>Tyre-change command</span><strong>UNAVAILABLE — no verified event selection rule</strong>
          </div>
        ) : null}
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
        {f1Runtime ? (
          <div className="insight-grid">
            <span>Active aero</span><strong>{f1Runtime.activeAeroMode}</strong>
            <span>Overtake</span><strong>{car.overtakeStatus}</strong>
            <span>Battery</span><strong>{Math.round(f1Runtime.ersBatteryPercent)}% / {f1Runtime.ersMode}</strong>
            <span>MGU-K output</span><strong>{f1Runtime.ersPowerKw} kW / SIM model</strong>
            <span>Detection result</span><strong>{f1Runtime.overtakeEligibility ? `${f1Runtime.overtakeEligibility.eligible ? 'IN GAP' : 'OUT OF GAP'} ${f1Runtime.overtakeEligibility.detectedGapSeconds.toFixed(3)}s / Z${f1Runtime.overtakeEligibility.controlLineIndex + 1}` : 'NO SAMPLE'}</strong>
            <span>Overtake energy</span><strong>{f1Runtime.overtakeEnergyRemainingMj.toFixed(2)} MJ / 0.50</strong>
            <span>Harvested</span><strong>{f1Runtime.energyHarvestedThisLapMj.toFixed(2)} MJ / lap</strong>
            <span>Deployed</span><strong>{f1Runtime.energyDeployedThisLapMj.toFixed(2)} MJ / lap</strong>
            <span>Super clipping</span><strong className={f1Runtime.superClippingIntensity >= 0.63 ? 'flag-yellow' : undefined}>{f1Runtime.superClippingIntensity < 0.04 ? 'OFF' : `${Math.round(f1Runtime.superClippingIntensity * 100)}% / ${f1Runtime.superClippingDurationSeconds.toFixed(1)}s`}</strong>
            <span>Clip recovery</span><strong>{Math.round(f1Runtime.superClippingRegenPowerKw)} kW / {f1Runtime.superClippingRecoveredThisLapMj.toFixed(2)} MJ</strong>
            <span>VSC delta</span><strong className={car.vscDeltaSeconds < 0 ? 'flag-red' : 'flag-clear'}>{car.vscDeltaSeconds >= 0 ? '+' : ''}{car.vscDeltaSeconds.toFixed(2)}s</strong>
            <span>Weakest component</span><strong>{weakestComponentEntry ? `${weakestComponentEntry[0]} ${Math.round(weakestComponentEntry[1].conditionPercent)}%` : '-'}</strong>
            <span>Battle state</span><strong>{car.battlePhase}</strong>
          </div>
        ) : superFormulaRuntime ? (
          <div className="insight-grid">
            <span>Engine allocation</span><strong>{superFormulaRuntime.engineLedger.engine.used}/{superFormulaRuntime.engineLedger.engine.maximumPerEntrantPerSeason} per entrant / season</strong>
            <span>Gearbox</span><strong>UNAVAILABLE — {superFormulaRuntime.gearbox.reason}</strong>
            <span>OTS</span><strong>{superFormulaRuntime.ots.availability === 'verified-event-rule' ? `EVENT RULE / ${superFormulaRuntime.ots.allocationSeconds}s allocation` : `UNAVAILABLE — ${superFormulaRuntime.ots.reason}`}</strong>
            <span>Refuelling</span><strong>{superFormulaRuntime.refuelling.permittedByRegulation ? `PERMITTED / ${superFormulaRuntime.refuelling.safetyGate.status.toUpperCase()}` : 'UNAVAILABLE'}</strong>
            <span>Fuel flow / service time</span><strong>UNAVAILABLE</strong>
            <span>Control tyre coefficients</span><strong>UNAVAILABLE</strong>
            <span>VSC delta</span><strong className={car.vscDeltaSeconds < 0 ? 'flag-red' : 'flag-clear'}>{car.vscDeltaSeconds >= 0 ? '+' : ''}{car.vscDeltaSeconds.toFixed(2)}s</strong>
            <span>Battle state</span><strong>{car.battlePhase}</strong>
          </div>
        ) : null}
      </section>

      <section className="insight-section insight-lap-section">
        <h2><Activity aria-hidden="true" size={13} /> Completed lap history</h2>
        {recentLaps.length === 0 ? (
          <p>Awaiting the first completed lap.</p>
        ) : (
          <ol className="lap-history">
            {recentLaps.map((lap) => {
              const tireDisplay = tireDisplayForLapRecord(lap)

              return (
                <li key={lap.lap}>
                  <span>L{lap.lap}</span>
                  <strong>{formatLapTime(lap.lapTimeSeconds)}</strong>
                  <span>{lap.sectors.map((sector) => sector.toFixed(3)).join(' / ')}</span>
                  <span>
                    {tireDisplay.label}
                    {tireDisplay.kind === 'super-formula-control-tire'
                      ? ' / MODEL --'
                      : ''}
                    {lap.pitStop ? ' PIT' : ''}
                  </span>
                </li>
              )
            })}
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
          {f1Runtime ? (
            <><span>Active aero</span><strong>{track.aeroActivationZones?.length ?? 0} / {track.aeroActivationZones?.[0]?.source ?? 'unavailable'}</strong></>
          ) : (
            <><span>OTS event rule</span><strong>{superFormulaRuntime?.ots.availability === 'verified-event-rule' ? 'CONFIGURED / activation pending' : 'UNAVAILABLE'}</strong></>
          )}
          <span>Corners</span><strong>{track.corners?.length ?? 0}</strong>
          <span>Pit boxes</span><strong>{track.pitLane?.boxCount ?? 0} / model</strong>
          <span>Safety lines</span><strong>{track.safetyCarLines ? 'Derived' : 'Unavailable'}</strong>
        </div>
      </section>

      <section className="insight-section">
        <h2><Flag aria-hidden="true" size={13} /> Classification & weekend</h2>
        <div className="insight-grid">
          <span>Grid change</span><strong>{car.gridPosition - car.position > 0 ? '+' : ''}{car.gridPosition - car.position}</strong>
          {f1Runtime ? (
            <>
              <span>Penalties</span><strong>{car.penaltyLaps > 0 ? `${car.penaltyLaps}L + ` : ''}{car.penaltySeconds + car.servedPenaltySeconds}s / {car.penaltyPoints} FIA PP / {car.trackLimitWarnings} TL</strong>
            </>
          ) : (
            <>
              <span>Competition penalties</span><strong>{car.penaltyLaps > 0 ? `${car.penaltyLaps}L + ` : ''}{car.penaltySeconds + car.servedPenaltySeconds}s / {car.trackLimitWarnings} TL</strong>
              <span>Article 5 next event</span><strong className={superFormulaArticle5Eligibility?.status === 'next-event-suspension-pending' ? 'flag-red' : 'flag-clear'}>{superFormulaArticle5Eligibility?.status === 'next-event-suspension-pending' ? 'SUSPENSION PENDING / OFFICIAL RECORD' : 'ELIGIBLE / OFFICIAL REGISTER ONLY'}</strong>
            </>
          )}
          <span>Deleted laps</span><strong>{car.deletedLapCount} / {car.impedingWarnings} impeding</strong>
          <span>Q1 classification</span><strong className={qualifyingClassificationStatus !== 'classified' && !car.stewardsGrantedStart ? 'flag-red' : 'flag-clear'}>{qualifyingClassificationLabel}</strong>
          <span>Race events</span><strong>{relevantEvents.length}</strong>
          <span>Weekend</span><strong>{weekendContext.completed.length} complete</strong>
        </div>
        {weekendContext.notes.length > 0 ? <small>{weekendContext.notes.slice(-2).join(' / ')}</small> : null}
      </section>
    </section>
  )
}
