import { useMemo, useState } from 'react'
import {
  filterPitWallRaceControl,
  pitWallRaceControlEntries,
  pitWallRaceControlFilters,
  type PitWallRaceControlFilter,
} from '../../domain/pitWall'
import { PitWallGroup, PitWallMetric } from './PitWallShared'
import type { PitWallTabProps } from './types'

export function PitWallRaceControl({
  car,
  raceControlLog,
  snapshot,
}: PitWallTabProps) {
  const [filter, setFilter] = useState<PitWallRaceControlFilter>('all')
  const entries = useMemo(
    () =>
      pitWallRaceControlEntries({
        events: snapshot.events,
        observedLog: raceControlLog,
        selectedCarCode: car.code,
      }),
    [car.code, raceControlLog, snapshot.events],
  )
  const visible = useMemo(
    () => filterPitWallRaceControl(entries, filter),
    [entries, filter],
  )

  return (
    <div className="pit-wall-race-control">
      <PitWallGroup title="Control status">
        <PitWallMetric
          label="Flag"
          source="SIM"
          tone={snapshot.flag === 'clear' ? 'good' : 'watch'}
          value={snapshot.flagLabel}
        />
        <PitWallMetric
          label="Safety Car"
          source="SIM"
          tone={snapshot.flag === 'sc' ? 'critical' : 'good'}
          value={snapshot.flag === 'sc' ? 'DEPLOYED' : 'NO'}
        />
        <PitWallMetric
          label="Virtual SC"
          source="SIM"
          tone={snapshot.flag === 'vsc' ? 'critical' : 'good'}
          value={snapshot.flag === 'vsc' ? 'DEPLOYED' : 'NO'}
        />
        <PitWallMetric
          label="Red flag"
          source="SIM"
          tone={snapshot.flag === 'red' ? 'critical' : 'good'}
          value={snapshot.flag === 'red' ? 'SHOWN' : 'NO'}
        />
        <PitWallMetric
          label="Pit lane"
          source="SIM"
          tone={snapshot.pitLaneOpen ? 'good' : 'critical'}
          value={snapshot.pitLaneOpen ? 'OPEN' : 'CLOSED'}
        />
        <PitWallMetric
          label="Restart"
          source="SIM"
          value={snapshot.restartProcedure.toUpperCase()}
        />
        <PitWallMetric
          label={`${car.code} track limits`}
          source="SIM"
          tone={car.trackLimitWarnings > 0 ? 'watch' : 'good'}
          value={`${car.trackLimitWarnings} warning${car.trackLimitWarnings === 1 ? '' : 's'}`}
        />
        <PitWallMetric
          label={`${car.code} penalty points`}
          source="SIM"
          tone={car.penaltyPoints > 0 ? 'watch' : 'good'}
          value={String(car.penaltyPoints)}
        />
      </PitWallGroup>

      <div className="pit-wall-message-log">
        <div
          aria-label="Race control message filter"
          className="pit-wall-filter-row"
          role="group"
        >
          {pitWallRaceControlFilters.map((option) => (
            <button
              aria-pressed={filter === option.id}
              key={option.id}
              onClick={() => setFilter(option.id)}
              title={
                option.id === 'selected-car'
                  ? `Only messages naming ${car.code}`
                  : `Show ${option.label.toLowerCase()} messages`
              }
              type="button"
            >
              {option.id === 'selected-car' ? car.code : option.label}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="pit-wall-empty">
            No race control messages match this filter.
          </p>
        ) : (
          <ol aria-label="Race control messages, newest first" tabIndex={0}>
            {visible.map((entry) => (
              <li key={entry.id}>
                <time>{entry.timeLabel}</time>
                <b className={`pit-wall-kind kind-${entry.kind}`}>
                  {entry.kind.replace(/-/gu, ' ').toUpperCase()}
                </b>
                <span>{entry.message}</span>
                <em>{entry.source}</em>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
