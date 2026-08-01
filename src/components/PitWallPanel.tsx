import { ChevronDown, ChevronUp, MonitorDot, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  pitWallBoxCommands,
  pitWallCapabilitiesFor,
  pitWallPaceCommandDisabledReason,
  pitWallSessionFor,
  pitWallTabs,
  type PitWallTabId,
} from '../domain/pitWall'
import { usePitStrategyOutlook } from '../hooks/usePitStrategyOutlook'
import { driverAbilityValue } from '../simulation/driverAbility'
import { tireConditionFor } from '../simulation/tires'
import { PitWallLapLog } from './pitWall/PitWallLapLog'
import { PitWallOverview } from './pitWall/PitWallOverview'
import { PitWallRaceControl } from './pitWall/PitWallRaceControl'
import { PitWallStrategy } from './pitWall/PitWallStrategy'
import { PitWallSystems } from './pitWall/PitWallSystems'
import { PitWallWeather } from './pitWall/PitWallWeather'
import type { PitWallCommandProps, PitWallTabProps } from './pitWall/types'
import type { BroadcastRaceControlEntry } from './BroadcastDashboard'
import type { EnvironmentReadout } from '../domain/environmentReadout'
import type { SeriesId } from '../series/types'
import type {
  CarSnapshot,
  Driver,
  RacePaceMode,
  RaceSnapshot,
  TireCompound,
  TrackDefinition,
  WeekendStage,
} from '../types'

const paceModes: RacePaceMode[] = ['push', 'standard', 'save', 'defend']

type PitWallPanelProps = PitWallCommandProps & {
  car: CarSnapshot
  driver: Driver
  environment: EnvironmentReadout
  onClose: () => void
  /**
   * The panel covers the timing tower, so it carries its own car selector.
   * Without it an engineer would have to close the screen to change car.
   */
  onSelectDriver: (driverId: string) => void
  openF1Mode: 'LIVE' | 'HIST' | 'SIM'
  overtakeSystem: 'active-aero' | 'drs' | 'ots'
  raceControlLog: BroadcastRaceControlEntry[]
  seriesId: SeriesId
  snapshot: RaceSnapshot
  /** Decides which race-only read-outs the panel may show. */
  stage: WeekendStage
  telemetryIsOpenF1: boolean
  timingIsOpenF1: boolean
  tireLabels: Record<TireCompound, string>
  track: TrackDefinition
}

const tabContent: Record<
  PitWallTabId,
  (props: PitWallTabProps) => ReactElement
> = {
  'lap-log': PitWallLapLog,
  overview: PitWallOverview,
  'race-control': PitWallRaceControl,
  strategy: PitWallStrategy,
  systems: PitWallSystems,
  weather: PitWallWeather,
}

/**
 * Race-engineering overlay for the selected car. It renders only state the
 * simulator already holds; the strategy call and tyre condition are taken from
 * the same helpers race analysis uses so both screens agree.
 */
export function PitWallPanel({
  car,
  driver,
  environment,
  onClose,
  onRequestPitStop,
  onSelectDriver,
  onSetDriverPaceMode,
  openF1Mode,
  overtakeSystem,
  raceControlLog,
  seriesId,
  snapshot,
  stage,
  telemetryIsOpenF1,
  timingIsOpenF1,
  tireLabels,
  track,
}: PitWallPanelProps) {
  const [activeTab, setActiveTab] = useState<PitWallTabId>('overview')
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  const capabilities = useMemo(
    () => pitWallCapabilitiesFor({ overtakeSystem, seriesId }),
    [overtakeSystem, seriesId],
  )
  const session = useMemo(() => pitWallSessionFor(stage), [stage])
  const strategy = usePitStrategyOutlook({ car, driver, snapshot, track })
  const tireCondition = useMemo(
    () =>
      tireConditionFor(
        car.tire,
        car.tireAgeLaps,
        driverAbilityValue(driver, 'tireManagement'),
        car.tireTemperatureC,
        car.tireWearPercent,
        track.tireNomination,
      ),
    [
      car.tire,
      car.tireAgeLaps,
      car.tireTemperatureC,
      car.tireWearPercent,
      driver,
      track.tireNomination,
    ],
  )
  // Ordered by classification so the selector walks the field the same way
  // the timing tower it covers does.
  const runningOrder = useMemo(
    () =>
      snapshot.cars
        .slice()
        .sort((left, right) => left.position - right.position),
    [snapshot.cars],
  )
  const selectedIndex = runningOrder.findIndex(
    (entry) => entry.driverId === car.driverId,
  )
  const carAhead = selectedIndex > 0 ? runningOrder[selectedIndex - 1] : null
  const carBehind =
    selectedIndex >= 0 && selectedIndex + 1 < runningOrder.length
      ? runningOrder[selectedIndex + 1]
      : null
  const boxCommands = useMemo(() => pitWallBoxCommands(car), [car])
  const paceDisabledReason = pitWallPaceCommandDisabledReason(car)
  const ActiveTab = tabContent[activeTab]

  return (
    <section
      aria-label={`Pit wall for ${car.code} car ${car.carNumber}`}
      className="hud pit-wall-panel"
    >
      <header className="pit-wall-header">
        <span className="pit-wall-title">
          <MonitorDot aria-hidden="true" size={14} />
          PIT WALL
        </span>
        <span
          className="pit-wall-identity"
          style={{ borderLeftColor: car.teamColor }}
        >
          <strong>{car.code}</strong>
          <b>#{car.carNumber}</b>
          <em>{car.teamName}</em>
        </span>
        <span aria-label="Select car" className="pit-wall-car-select" role="group">
          <button
            aria-label="Pit wall previous car"
            disabled={carAhead === null}
            onClick={() => carAhead && onSelectDriver(carAhead.driverId)}
            title={
              carAhead
                ? `Read the pit wall for ${carAhead.code} (P${carAhead.position})`
                : 'This car leads the session'
            }
            type="button"
          >
            <ChevronUp aria-hidden="true" size={13} />
          </button>
          <button
            aria-label="Pit wall next car"
            disabled={carBehind === null}
            onClick={() => carBehind && onSelectDriver(carBehind.driverId)}
            title={
              carBehind
                ? `Read the pit wall for ${carBehind.code} (P${carBehind.position})`
                : 'This car is last on the road'
            }
            type="button"
          >
            <ChevronDown aria-hidden="true" size={13} />
          </button>
        </span>
        <span className="pit-wall-standing">
          <strong>P{car.position}</strong>
          <span>
            {session.label} / LAP {car.lap}
            {session.runsRaceDistance ? ` OF ${snapshot.raceLaps}` : ''}
          </span>
        </span>
        <button
          aria-label="Close pit wall"
          onClick={onClose}
          ref={closeButtonRef}
          title="Close pit wall (Escape)"
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </header>

      <div aria-label="Pit wall sections" className="pit-wall-tabs" role="tablist">
        {pitWallTabs.map((tab) => (
          <button
            aria-controls="pit-wall-tabpanel"
            aria-selected={activeTab === tab.id}
            id={`pit-wall-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`pit-wall-tab-${activeTab}`}
        className="pit-wall-body"
        id="pit-wall-tabpanel"
        role="tabpanel"
        tabIndex={0}
      >
        <ActiveTab
          capabilities={capabilities}
          car={car}
          driver={driver}
          environment={environment}
          openF1Mode={openF1Mode}
          raceControlLog={raceControlLog}
          session={session}
          snapshot={snapshot}
          strategy={strategy}
          telemetryIsOpenF1={telemetryIsOpenF1}
          timingIsOpenF1={timingIsOpenF1}
          tireCondition={tireCondition}
          tireLabels={tireLabels}
          track={track}
        />
      </div>

      <footer className="pit-wall-commands">
        <div aria-label="Pit stop instruction" role="group">
          {boxCommands.map((command) => (
            <button
              className="pit-wall-box-command"
              disabled={command.disabled}
              key={command.compound}
              onClick={() => onRequestPitStop(car.driverId, command.compound)}
              title={
                command.disabledReason ??
                `Box ${car.code} for ${tireLabels[command.compound]} at the next safe lap crossing (${command.setsRemaining} set${command.setsRemaining === 1 ? '' : 's'} left)`
              }
              type="button"
            >
              BOX {command.compound}
              <small>{command.setsRemaining}</small>
            </button>
          ))}
        </div>
        <div aria-label="Driver pace instruction" role="group">
          {paceModes.map((mode) => (
            <button
              aria-pressed={car.racePaceMode === mode}
              className="pit-wall-pace-command"
              disabled={paceDisabledReason !== null}
              key={mode}
              onClick={() => onSetDriverPaceMode(car.driverId, mode)}
              title={
                paceDisabledReason ?? `Instruct ${car.code} to run ${mode} pace`
              }
              type="button"
            >
              {mode === 'standard' ? 'STD' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </footer>
    </section>
  )
}
