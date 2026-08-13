import {
  PIT_WALL_NOT_APPLICABLE,
  PIT_WALL_UNAVAILABLE,
  pitWallBoxCompounds,
} from '../../domain/pitWall'
import { formatSignedSeconds } from '../../domain/timingFormat'
import { resolveSuperFormulaOperational } from '../../simulation/superFormulaOperational'
import { PitWallGroup, PitWallMetric } from './PitWallShared'
import type { PitWallTabProps } from './types'

const urgencyTone = {
  box: 'critical',
  extend: 'good',
  window: 'watch',
} as const

/**
 * The base 2026 JAF rules do not supply a race-distance strategy model,
 * mandatory-stop rule, or a physical control-tyre model. Keep those gaps
 * visible rather than feeding the F1/Pirelli planner through the SF panel.
 */
function SuperFormulaPitWallStrategy({
  car,
  snapshot,
}: Pick<PitWallTabProps, 'car' | 'snapshot'>) {
  const runtime = car.runtimeSystems

  if (runtime.kind !== 'super-formula') {
    return null
  }

  const pitSpeedRule = resolveSuperFormulaOperational().pitLane
  const otsConfigured = runtime.ots.availability === 'verified-event-rule'
  const refuellingAvailable = runtime.refuelling.permittedByRegulation

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="SUPER FORMULA operational state">
        <PitWallMetric
          label="Engine allocation"
          source="JAF"
          title="Article 24.2.3 maximum per entrant per season"
          value={`${runtime.engineLedger.engine.used}/${runtime.engineLedger.engine.maximumPerEntrantPerSeason} per entrant`}
        />
        <PitWallMetric
          label="Control tyres"
          source="JAF"
          title="Published dry and wet set maxima; no F1 compound family applies"
          value={`dry ${runtime.controlTires.sets.dry.remainingSets}/${runtime.controlTires.sets.dry.maximumSets} / wet ${runtime.controlTires.sets.wet.remainingSets}/${runtime.controlTires.sets.wet.maximumSets}`}
        />
        <PitWallMetric
          label="OTS"
          source={otsConfigured ? 'EVENT' : 'UNAVAILABLE'}
          title={
            otsConfigured
              ? `${runtime.ots.activationConditions}; event-condition evaluation is still required`
              : runtime.ots.reason
          }
          value={
            otsConfigured
              ? 'EVENT CONFIGURED / EVALUATION REQUIRED'
              : PIT_WALL_UNAVAILABLE
          }
        />
        <PitWallMetric
          label="Refuelling safety"
          source="JAF"
          title={
            refuellingAvailable
              ? `Article 25 safety gate: ${runtime.refuelling.safetyGate.status}`
              : runtime.refuelling.reason
          }
          value={
            refuellingAvailable
              ? runtime.refuelling.safetyGate.status.toUpperCase()
              : PIT_WALL_UNAVAILABLE
          }
        />
      </PitWallGroup>

      <PitWallGroup title="Strategy model">
        <PitWallMetric
          label="Race-distance strategy"
          source="UNAVAILABLE"
          title="No verified event race-distance input is available to create an SF stint plan"
          value={PIT_WALL_UNAVAILABLE}
        />
        <PitWallMetric
          label="Mandatory pit stop"
          source="UNAVAILABLE"
          title="No verified SUPER FORMULA event rule is available; a generic F1 mandatory-stop default is not applied"
          value={PIT_WALL_UNAVAILABLE}
        />
        <PitWallMetric
          label="Control tyre selection"
          source="UNAVAILABLE"
          title="No verified physical control-tyre coefficients or dry/wet subdivision is available"
          value={PIT_WALL_UNAVAILABLE}
        />
        <PitWallMetric
          label="Pit-loss / rejoin model"
          source="UNAVAILABLE"
          title="The F1 pit-loss and rejoin model is not reused for SUPER FORMULA"
          value={PIT_WALL_UNAVAILABLE}
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
          label="Speed limit"
          source={
            pitSpeedRule.availability === 'verified' ? 'JAF' : 'UNAVAILABLE'
          }
          title={
            pitSpeedRule.availability === 'verified'
              ? 'Article 26.9'
              : pitSpeedRule.reason
          }
          value={
            pitSpeedRule.availability === 'verified'
              ? `${pitSpeedRule.speedLimitKph} km/h`
              : PIT_WALL_UNAVAILABLE
          }
        />
        <PitWallMetric
          label="Own pit phase"
          source="SIM"
          value={car.pitPhase.toUpperCase()}
        />
      </PitWallGroup>

      <PitWallGroup title="Refuelling inputs">
        <PitWallMetric
          label="Transfer rate"
          source="UNAVAILABLE"
          title={runtime.refuelling.transferRateKgPerSecond.reason ?? undefined}
          value={PIT_WALL_UNAVAILABLE}
        />
        <PitWallMetric
          label="Service duration"
          source="UNAVAILABLE"
          title={runtime.refuelling.serviceDurationSeconds.reason ?? undefined}
          value={PIT_WALL_UNAVAILABLE}
        />
      </PitWallGroup>
    </div>
  )
}

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
  if (car.runtimeSystems.kind === 'super-formula') {
    return <SuperFormulaPitWallStrategy car={car} snapshot={snapshot} />
  }

  if (strategy === null || tireCondition === null) {
    return (
      <div className="pit-wall-columns">
        <PitWallGroup title="Strategy model">
          <PitWallMetric
            label="F1 strategy input"
            source="UNAVAILABLE"
            title="The F1 strategy model is not available for this session"
            value={PIT_WALL_UNAVAILABLE}
          />
        </PitWallGroup>
      </div>
    )
  }

  const f1Tires = car.runtimeSystems.tires
  const { outlook } = strategy
  const neutralised = snapshot.flag === 'sc' || snapshot.flag === 'vsc'
  const lapsRemaining = Math.max(0, snapshot.raceLaps - car.lap)
  const totalSetsRemaining = pitWallBoxCompounds.reduce(
    (total, compound) => total + (f1Tires.tireSetsRemaining[compound] ?? 0),
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
          const sets = f1Tires.tireSetsRemaining[compound] ?? 0

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
