import {
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
 */
export function PitWallStrategy({
  car,
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

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="Recommendation">
        <PitWallMetric
          label="Call"
          source="SIM"
          tone={urgencyTone[outlook.urgency]}
          value={outlook.urgency.toUpperCase()}
        />
        <PitWallMetric label="Reason" source="SIM" value={outlook.reason} />
        <PitWallMetric
          label="Target stop"
          source="SIM"
          value={`Lap ${outlook.estimatedStopLap}`}
        />
        <PitWallMetric
          label="Next tyre"
          source="SIM"
          title={tireLabels[outlook.compound]}
          value={outlook.compound}
        />
        <PitWallMetric
          label="Confidence"
          source="SIM"
          tone={
            outlook.confidence === 'high'
              ? 'good'
              : outlook.confidence === 'medium'
                ? 'watch'
                : 'critical'
          }
          value={outlook.confidence.toUpperCase()}
        />
        <PitWallMetric
          label="Laps remaining"
          source="SIM"
          value={String(lapsRemaining)}
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
          source="SIM"
          title="Projected position if the car boxes on this lap"
          value={`P${strategy.projectedRejoinPosition}`}
        />
        <PitWallMetric
          label="Rejoin change"
          source="SIM"
          tone={
            strategy.projectedRejoinPositionChange > 0 ? 'watch' : 'good'
          }
          value={
            strategy.projectedRejoinPositionChange === 0
              ? 'HOLD'
              : `${strategy.projectedRejoinPositionChange > 0 ? 'LOSE' : 'GAIN'} ${Math.abs(strategy.projectedRejoinPositionChange)}`
          }
        />
        <PitWallMetric
          label="Expected delta"
          source="SIM"
          tone={outlook.expectedNetGainSeconds >= 0 ? 'good' : 'watch'}
          value={formatSignedSeconds(outlook.expectedNetGainSeconds)}
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
