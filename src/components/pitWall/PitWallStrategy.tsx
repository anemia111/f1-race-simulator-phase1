import {
  PIT_WALL_NOT_APPLICABLE,
  PIT_WALL_UNAVAILABLE,
  pitWallBoxCompounds,
} from '../../domain/pitWall'
import { formatSignedSeconds } from '../../domain/timingFormat'
import { PitWallGroup, PitWallMetric } from './PitWallShared'
import type { PitWallTabProps } from './types'

const urgencyTone = {
  box: 'critical',
  extend: 'good',
  window: 'watch',
} as const

/**
 * Read-out for the strategy call. Every number here comes from
 * `usePitStrategyOutlook`, which is the same source race analysis reads, so
 * the two screens can never recommend different stops.
 *
 * A practice or qualifying session has no race distance, so the stint plan and
 * the rejoin projection are reported as not applicable instead of being
 * computed against a distance the session will never run. The pit lane, the
 * transit cost, and the tyre allocation are physical facts that hold in every
 * session, so those groups stay live.
 */
export function PitWallStrategy({
  car,
  session,
  snapshot,
  strategy,
  tireCondition,
  tireLabels,
}: PitWallTabProps) {
  const { outlook } = strategy
  const neutralised = snapshot.flag === 'sc' || snapshot.flag === 'vsc'
  const lapsRemaining = Math.max(0, snapshot.raceLaps - car.lap)
  const totalSetsRemaining = pitWallBoxCompounds.reduce(
    (total, compound) => total + (car.tireSetsRemaining[compound] ?? 0),
    0,
  )
  const plansRaceStint = session.runsRaceDistance
  // One shared shape for every race-only row so a timed session can never
  // print a stint number beside an N/A source chip.
  const raceOnly = (value: string, tone?: 'good' | 'watch' | 'critical') =>
    plansRaceStint
      ? { source: 'SIM' as const, tone, value }
      : {
          source: 'UNAVAILABLE' as const,
          title: session.raceOnlyReason,
          tone: undefined,
          value: PIT_WALL_NOT_APPLICABLE,
        }

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="Recommendation">
        <PitWallMetric
          label="Call"
          {...raceOnly(outlook.urgency.toUpperCase(), urgencyTone[outlook.urgency])}
        />
        <PitWallMetric label="Reason" {...raceOnly(outlook.reason)} />
        <PitWallMetric
          label="Target stop"
          {...raceOnly(`Lap ${outlook.estimatedStopLap}`)}
        />
        <PitWallMetric
          label="Next tyre"
          title={plansRaceStint ? tireLabels[outlook.compound] : undefined}
          {...raceOnly(outlook.compound)}
        />
        <PitWallMetric
          label="Confidence"
          {...raceOnly(
            outlook.confidence.toUpperCase(),
            outlook.confidence === 'high'
              ? 'good'
              : outlook.confidence === 'medium'
                ? 'watch'
                : 'critical',
          )}
        />
        <PitWallMetric
          label="Laps remaining"
          {...raceOnly(String(lapsRemaining))}
        />
      </PitWallGroup>

      <PitWallGroup title="Stop now model">
        <PitWallMetric
          label="Pit lane loss"
          source="SIM"
          title="Modelled pit-lane transit cost for this circuit"
          value={`${strategy.pitLaneLossSeconds.toFixed(1)}s`}
        />
        <PitWallMetric
          label="Effective loss"
          source="SIM"
          title="Transit cost adjusted for the current control phase"
          value={`${outlook.estimatedPitLossSeconds.toFixed(1)}s`}
        />
        <PitWallMetric
          label="Rejoin"
          title={
            plansRaceStint
              ? 'Projected position if the car boxes on this lap'
              : undefined
          }
          {...raceOnly(`P${strategy.projectedRejoinPosition}`)}
        />
        <PitWallMetric
          label="Rejoin change"
          {...raceOnly(
            strategy.projectedRejoinPositionChange === 0
              ? 'HOLD'
              : `${strategy.projectedRejoinPositionChange > 0 ? 'LOSE' : 'GAIN'} ${Math.abs(strategy.projectedRejoinPositionChange)}`,
            strategy.projectedRejoinPositionChange > 0 ? 'watch' : 'good',
          )}
        />
        <PitWallMetric
          label="Expected delta"
          {...raceOnly(
            formatSignedSeconds(outlook.expectedNetGainSeconds),
            outlook.expectedNetGainSeconds >= 0 ? 'good' : 'watch',
          )}
        />
        <PitWallMetric
          label="Gap ahead"
          source="SIM"
          value={car.position === 1 ? PIT_WALL_UNAVAILABLE : car.gapToAheadLabel}
        />
      </PitWallGroup>

      <PitWallGroup title="Pit lane">
        <PitWallMetric
          label="Pit entry"
          source="SIM"
          tone={snapshot.pitLaneOpen ? 'good' : 'critical'}
          value={snapshot.pitLaneOpen ? 'OPEN' : 'CLOSED'}
        />
        <PitWallMetric
          label="Pit exit"
          source="SIM"
          tone={snapshot.pitExitOpen ? 'good' : 'critical'}
          value={snapshot.pitExitOpen ? 'OPEN' : 'HELD'}
        />
        <PitWallMetric
          label="Control phase"
          source="SIM"
          tone={neutralised ? 'watch' : 'good'}
          value={neutralised ? snapshot.flag.toUpperCase() : 'GREEN'}
        />
        <PitWallMetric
          label="Team mate"
          source="SIM"
          tone={strategy.teammateInPit ? 'watch' : 'good'}
          value={
            strategy.teammateInPit
              ? `${strategy.teammateInPitCode ?? 'TEAM MATE'} IN PIT`
              : 'CLEAR'
          }
        />
        <PitWallMetric
          label="Double stack"
          source="SIM"
          title="A stop called while the other team car is being serviced queues behind it"
          tone={strategy.teammateInPit ? 'critical' : 'good'}
          value={strategy.teammateInPit ? 'RISK' : 'CLEAR'}
        />
        <PitWallMetric
          label="Own pit phase"
          source="SIM"
          value={car.pitPhase.toUpperCase()}
        />
      </PitWallGroup>

      <PitWallGroup title="Tyre inventory">
        <PitWallMetric
          label="Sets remaining"
          source="SIM"
          tone={totalSetsRemaining > 0 ? 'good' : 'critical'}
          value={String(totalSetsRemaining)}
        />
        {pitWallBoxCompounds.map((compound) => {
          const sets = car.tireSetsRemaining[compound] ?? 0

          return (
            <PitWallMetric
              key={compound}
              label={tireLabels[compound]}
              source="SIM"
              tone={sets > 0 ? 'good' : 'critical'}
              value={sets > 0 ? `${sets} AVAILABLE` : 'NONE'}
            />
          )
        })}
        <PitWallMetric
          label="Current tyre life"
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
      </PitWallGroup>
    </div>
  )
}
