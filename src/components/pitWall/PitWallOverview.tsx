import { useMemo } from 'react'
import {
  PIT_WALL_NOT_APPLICABLE,
  PIT_WALL_UNAVAILABLE,
  pitWallIntervals,
  pitWallObservedSource,
} from '../../domain/pitWall'
import {
  formatLapTime,
  formatSectorTime,
  UNMEASURED_SECTOR_TIME,
} from '../../domain/timingFormat'
import { PitWallGroup, PitWallMetric } from './PitWallShared'
import type { PitWallTabProps } from './types'

const paceModeLabels: Record<string, string> = {
  defend: 'DEFEND',
  push: 'PUSH',
  save: 'SAVE',
  standard: 'STANDARD',
}

const formatInterval = (seconds: number | null, code: string | null) => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return PIT_WALL_UNAVAILABLE
  }

  return `${code ? `${code} ` : ''}+${seconds.toFixed(3)}`
}

export function PitWallOverview({
  capabilities,
  car,
  openF1Mode,
  session,
  snapshot,
  telemetryIsOpenF1,
  timingIsOpenF1,
  tireCondition,
  tireLabels,
}: PitWallTabProps) {
  const timingSource = pitWallObservedSource(timingIsOpenF1, openF1Mode)
  const telemetrySource = pitWallObservedSource(telemetryIsOpenF1, openF1Mode)
  const intervals = useMemo(
    () => pitWallIntervals(snapshot.cars, car.driverId),
    [car.driverId, snapshot.cars],
  )
  // All three splits must come from one lap. Once the current lap has its
  // first measured sector the row switches to it whole, so S1 of this lap is
  // never shown beside S3 of the previous one.
  const sectorSource = useMemo(() => {
    const lastCompletedLap = car.lapHistory[car.lapHistory.length - 1] ?? null
    const current = car.currentLapSectorTimes

    if (current.some((value) => value !== null)) {
      return { times: current, title: `Current lap ${car.lap} splits` }
    }

    return lastCompletedLap
      ? {
          times: lastCompletedLap.sectors,
          title: `Completed lap ${lastCompletedLap.lap} splits`,
        }
      : {
          times: [null, null, null] as const,
          title: 'No measured split yet',
        }
  }, [car.currentLapSectorTimes, car.lap, car.lapHistory])
  const unservedPenalties = car.penalties.filter((penalty) => !penalty.served)
  const pendingPenaltyLabel =
    car.penaltySeconds > 0 || car.penaltyLaps > 0 || unservedPenalties.length > 0
      ? [
          car.penaltyLaps > 0 ? `${car.penaltyLaps}L` : null,
          car.penaltySeconds > 0 ? `+${car.penaltySeconds}s` : null,
          unservedPenalties.length > 0
            ? `${unservedPenalties.length} unserved`
            : null,
        ]
          .filter(Boolean)
          .join(' / ')
      : 'NONE'

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="Running order">
        <PitWallMetric
          label="Position"
          source={timingSource}
          value={`P${car.position}`}
        />
        <PitWallMetric
          label="Gap to leader"
          source={timingSource}
          value={car.position === 1 ? 'LEADER' : car.gapToLeaderLabel}
        />
        <PitWallMetric
          label="Interval ahead"
          source={timingSource}
          title={
            intervals.aheadCode
              ? `Measured interval to ${intervals.aheadCode}`
              : 'No car ahead on the road'
          }
          value={formatInterval(
            intervals.intervalAheadSeconds,
            intervals.aheadCode,
          )}
        />
        <PitWallMetric
          label="Interval behind"
          source={timingSource}
          title={
            intervals.behindCode
              ? `Measured interval to ${intervals.behindCode}`
              : 'No car behind on the road'
          }
          value={formatInterval(
            intervals.intervalBehindSeconds,
            intervals.behindCode,
          )}
        />
        <PitWallMetric
          label="Lap"
          source={timingSource}
          title={
            session.runsRaceDistance
              ? undefined
              : `Laps completed in this ${session.label.toLowerCase()} session`
          }
          value={
            session.runsRaceDistance
              ? `${car.lap} / ${snapshot.raceLaps}`
              : String(car.lap)
          }
        />
        <PitWallMetric
          label="Grid"
          source={session.runsRaceDistance ? 'SIM' : 'UNAVAILABLE'}
          title={
            session.runsRaceDistance
              ? undefined
              : 'A grid slot only exists once qualifying has set it for the race'
          }
          value={
            session.runsRaceDistance
              ? `P${car.gridPosition}`
              : PIT_WALL_NOT_APPLICABLE
          }
        />
      </PitWallGroup>

      <PitWallGroup title="Lap timing">
        <PitWallMetric
          label="Last lap"
          source={timingSource}
          value={formatLapTime(car.lastLapTimeSeconds)}
        />
        <PitWallMetric
          label="Best lap"
          source={timingSource}
          title={
            car.bestLapLap === null
              ? 'No completed lap yet'
              : `Set on lap ${car.bestLapLap}`
          }
          value={formatLapTime(car.bestLapTimeSeconds)}
        />
        {[0, 1, 2].map((index) => {
          const measured = sectorSource.times[index]

          return (
            <PitWallMetric
              key={`sector-${index}`}
              label={`Sector ${index + 1}`}
              source={measured === null ? 'UNAVAILABLE' : timingSource}
              title={sectorSource.title}
              value={
                measured === null
                  ? UNMEASURED_SECTOR_TIME
                  : formatSectorTime(measured)
              }
            />
          )
        })}
      </PitWallGroup>

      <PitWallGroup title="Car state">
        <PitWallMetric
          label="Speed"
          source={telemetrySource}
          value={`${Math.round(car.speedKph)} km/h`}
        />
        <PitWallMetric
          label="Gear"
          source={telemetrySource}
          value={car.gear > 0 ? String(car.gear) : 'N'}
        />
        <PitWallMetric
          label="RPM"
          source={telemetrySource}
          value={Math.round(car.rpm).toLocaleString('en-GB')}
        />
        <PitWallMetric
          label="Throttle"
          source={telemetrySource}
          value={`${Math.round(car.throttlePercent)}%`}
        />
        <PitWallMetric
          label="Brake"
          source={telemetrySource}
          value={`${Math.round(car.brakePercent)}%`}
        />
        <PitWallMetric
          label="Pace mode"
          source="SIM"
          value={paceModeLabels[car.racePaceMode] ?? car.racePaceMode}
        />
      </PitWallGroup>

      <PitWallGroup title="Tyres">
        <PitWallMetric
          label="Compound"
          source="SIM"
          title={tireLabels[car.tire]}
          value={car.tire}
        />
        <PitWallMetric
          label="Stint age"
          source="SIM"
          value={`${car.tireAgeLaps} laps`}
        />
        <PitWallMetric
          label="Life remaining"
          source="SIM"
          tone={
            tireCondition.wearState === 'critical'
              ? 'critical'
              : tireCondition.wearState === 'used'
                ? 'watch'
                : 'good'
          }
          value={`${tireCondition.lifeRemainingPercent}% ${tireCondition.wearState.toUpperCase()}`}
        />
        <PitWallMetric
          label="Tyre temp"
          source="SIM"
          value={`${Math.round(car.tireTemperatureC)}C ${tireCondition.operatingState.toUpperCase()}`}
        />
        <PitWallMetric
          label="Stops"
          source="SIM"
          value={String(car.pitStops)}
        />
        <PitWallMetric
          label="Compounds used"
          source="SIM"
          value={
            car.compoundsUsed.length > 0
              ? car.compoundsUsed.join(' > ')
              : PIT_WALL_UNAVAILABLE
          }
        />
      </PitWallGroup>

      <PitWallGroup title="Systems">
        <PitWallMetric
          label="ERS / battery"
          source={capabilities.hybridErs ? 'SIM' : 'UNAVAILABLE'}
          title={
            capabilities.hybridErs
              ? 'Simulated Energy Store state of charge'
              : 'This category has no hybrid Energy Store'
          }
          value={
            capabilities.hybridErs
              ? `${Math.round(car.ersBatteryPercent)}% / ${car.ersMode.toUpperCase()}`
              : PIT_WALL_NOT_APPLICABLE
          }
        />
        <PitWallMetric
          label="Active aero"
          source={capabilities.activeAero ? 'SIM' : 'UNAVAILABLE'}
          title={
            capabilities.activeAero
              ? '2026 driver-adjustable bodywork state'
              : 'This category has no driver-adjustable active aero'
          }
          value={
            capabilities.activeAero
              ? car.activeAeroMode.toUpperCase()
              : PIT_WALL_NOT_APPLICABLE
          }
        />
        <PitWallMetric
          label={capabilities.overtakeStatusLabel}
          source="SIM"
          value={
            capabilities.ots
              ? `${Math.ceil(car.otsRemainingSeconds ?? 0)}s remaining`
              : car.overtakeStatus.toUpperCase()
          }
        />
        <PitWallMetric
          label="Status"
          source="SIM"
          tone={car.status === 'running' ? 'good' : 'watch'}
          value={car.status.toUpperCase()}
        />
        <PitWallMetric
          label="Pending penalties"
          source="SIM"
          tone={pendingPenaltyLabel === 'NONE' ? 'good' : 'critical'}
          value={pendingPenaltyLabel}
        />
        <PitWallMetric
          label="Blue flag"
          source="SIM"
          tone={car.blueFlag ? 'watch' : 'good'}
          value={car.blueFlag ? 'SHOWN' : 'CLEAR'}
        />
      </PitWallGroup>
    </div>
  )
}
