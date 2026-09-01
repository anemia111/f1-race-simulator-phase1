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
  miniSectorSummary,
  UNMEASURED_SECTOR_TIME,
} from '../../domain/timingFormat'
import { MiniSectorStrip } from '../MiniSectorStrip'
import { PitWallGroup, PitWallMetric, PitWallSourceTag } from './PitWallShared'
import type { PitWallTabProps } from './types'
import type { SectorTimingStatus } from '../../types'

const paceModeLabels: Record<string, string> = {
  defend: 'DEFEND',
  push: 'PUSH',
  save: 'SAVE',
  standard: 'STANDARD',
}

/**
 * Printed beside every split. The tower can lean on colour alone because it is
 * read at a glance; the pit wall is read for decisions, so the word is shown.
 */
const sectorStatusLabels: Record<SectorTimingStatus, string> = {
  'overall-best': 'SESSION BEST',
  pending: 'NO TIME',
  'personal-best': 'PERSONAL BEST',
  slower: 'SLOWER',
}

const formatInterval = (label: string | null, code: string | null) => {
  if (label === null) {
    return PIT_WALL_UNAVAILABLE
  }

  return `${code ? `${code} ` : ''}${label}`
}

export function PitWallOverview({
  car,
  openF1Mode,
  session,
  snapshot,
  telemetryIsOpenF1,
  timing,
  timingIsOpenF1,
  tireCondition,
  tireLabels,
}: PitWallTabProps) {
  const f1Runtime =
    car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
  const superFormulaRuntime =
    car.runtimeSystems.kind === 'super-formula'
      ? car.runtimeSystems
      : null
  const timingSource = f1Runtime
    ? pitWallObservedSource(timingIsOpenF1, openF1Mode)
    : 'SIM'
  const telemetrySource = f1Runtime
    ? pitWallObservedSource(telemetryIsOpenF1, openF1Mode)
    : 'SIM'
  const intervals = useMemo(
    () => pitWallIntervals(snapshot.cars, car.driverId),
    [car.driverId, snapshot.cars],
  )
  // All three splits come from one lap, resolved once by the timing tower. The
  // pit wall only labels which lap that is.
  const splitsTitle =
    timing.lapNumber === null
      ? 'No measured split yet'
      : timing.isCurrentLap
        ? `Current lap ${timing.lapNumber} splits`
        : `Completed lap ${timing.lapNumber} splits`
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
            intervals.intervalAheadLabel,
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
            intervals.intervalBehindLabel,
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
      </PitWallGroup>

      <PitWallGroup title="Sectors and mini sectors" wide>
        <div className="pit-wall-sector-board" title={splitsTitle}>
          {[0, 1, 2].map((index) => {
            const measured = timing.sectors[index]
            const status = timing.sectorStatuses[index]
            const states = timing.miniSectors[index] ?? []

            return (
              <div className="pit-wall-sector" key={`sector-${index}`}>
                <span className="pit-wall-sector-head">
                  <span>S{index + 1}</span>
                  <strong
                    className={`pit-wall-value sector-value sector-status-${status}`}
                  >
                    {measured === null
                      ? UNMEASURED_SECTOR_TIME
                      : formatSectorTime(measured)}
                  </strong>
                  <PitWallSourceTag
                    source={measured === null ? 'UNAVAILABLE' : timingSource}
                  />
                </span>
                <MiniSectorStrip sectorIndex={index} states={states} />
                {/* Colour is never the only carrier: both words are printed. */}
                <span className="pit-wall-sector-legend">
                  <b>{sectorStatusLabels[status]}</b>
                  <em>{miniSectorSummary(states)}</em>
                </span>
              </div>
            )
          })}
        </div>
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
        {f1Runtime && tireCondition ? (
          <>
            <PitWallMetric
              label="Compound"
              source="SIM"
              title={tireLabels[f1Runtime.tires.tire]}
              value={f1Runtime.tires.tire}
            />
            <PitWallMetric
              label="Stint age"
              source="SIM"
              value={`${f1Runtime.tires.tireAgeLaps} laps`}
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
              value={`${Math.round(f1Runtime.tires.tireTemperatureC)}C ${tireCondition.operatingState.toUpperCase()}`}
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
                f1Runtime.tires.compoundsUsed.length > 0
                  ? f1Runtime.tires.compoundsUsed.join(' > ')
                  : PIT_WALL_UNAVAILABLE
              }
            />
          </>
        ) : superFormulaRuntime ? (
          <>
            <PitWallMetric
              label="Control tyre allocation"
              source="JAF"
              title="Published dry and wet set maxima"
              value={`dry ${superFormulaRuntime.controlTires.sets.dry.maximumSets} / wet ${superFormulaRuntime.controlTires.sets.wet.maximumSets}`}
            />
            <PitWallMetric
              label="Fitted control tyre"
              source="SIM"
              title={superFormulaRuntime.liveTires.fitment.selectionProvenance.rationale}
              value={`${superFormulaRuntime.liveTires.activeSurface.toUpperCase()} / ${superFormulaRuntime.liveTires.lapsOnCurrentSet} laps`}
            />
            <PitWallMetric
              label="Dry sets"
              source="JAF"
              value={`${superFormulaRuntime.controlTires.sets.dry.remainingSets} remaining / ${superFormulaRuntime.controlTires.sets.dry.usedSets} used`}
            />
            <PitWallMetric
              label="Wet sets"
              source="JAF"
              value={`${superFormulaRuntime.controlTires.sets.wet.remainingSets} remaining / ${superFormulaRuntime.controlTires.sets.wet.usedSets} used`}
            />
            <PitWallMetric
              label="Physical tyre state"
              source="UNAVAILABLE"
              title="No verified physical tyre coefficients are available; dry/wet control surface is recorded separately"
              value={PIT_WALL_UNAVAILABLE}
            />
            <PitWallMetric
              label="Stops"
              source="SIM"
              value={String(car.pitStops)}
            />
          </>
        ) : null}
      </PitWallGroup>

      <PitWallGroup title="Systems">
        {f1Runtime ? (
          <>
            <PitWallMetric
              label="ERS / battery"
              source="SIM"
              title="Simulated Energy Store state of charge"
              value={`${Math.round(f1Runtime.ersBatteryPercent)}% / ${f1Runtime.ersMode.toUpperCase()}`}
            />
            <PitWallMetric
              label="Active aero"
              source="SIM"
              title="2026 driver-adjustable bodywork state"
              value={f1Runtime.activeAeroMode.toUpperCase()}
            />
            <PitWallMetric
              label="Overtake"
              source="SIM"
              value={car.overtakeStatus.toUpperCase()}
            />
          </>
        ) : superFormulaRuntime ? (
          <>
            <PitWallMetric
              label="Engine allocation"
              source="JAF"
              value={`${superFormulaRuntime.engineLedger.engine.used}/${superFormulaRuntime.engineLedger.engine.maximumPerEntrantPerSeason} per entrant`}
            />
            <PitWallMetric
              label="OTS"
              source={
                superFormulaRuntime.ots.availability === 'verified-event-rule'
                  ? 'EVENT'
                  : 'UNAVAILABLE'
              }
              title={
                superFormulaRuntime.ots.availability === 'verified-event-rule'
                  ? `${superFormulaRuntime.ots.activationConditions}; runtime condition evaluation pending`
                  : superFormulaRuntime.ots.reason
              }
              value={
                superFormulaRuntime.ots.availability === 'verified-event-rule'
                  ? `CONFIGURED / ${superFormulaRuntime.ots.allocationSeconds}s`
                  : PIT_WALL_UNAVAILABLE
              }
            />
            <PitWallMetric
              label="Refuelling safety"
              source="JAF"
              value={
                superFormulaRuntime.refuelling.permittedByRegulation
                  ? superFormulaRuntime.refuelling.safetyGate.status.toUpperCase()
                  : PIT_WALL_UNAVAILABLE
              }
            />
          </>
        ) : null}
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
