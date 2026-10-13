import { pitWallBoxCommands, pitWallPaceCommandDisabledReason } from '../../domain/pitWall'
import { PitWallGroup, PitWallMetric, PitWallSourceTag } from './PitWallShared'
import type { PitWallTabProps } from './types'
import type { RacePaceMode } from '../../types'

const paceModes: RacePaceMode[] = ['push', 'standard', 'save', 'defend']

export function PitWallTeam({ car, snapshot, tireLabels, onRequestPitStop, onSetDriverPaceMode }: PitWallTabProps) {
  const teammates = snapshot.cars.filter((candidate) => candidate.teamId === car.teamId).slice().sort((a, b) => a.position - b.position)
  const inPit = teammates.filter((candidate) => candidate.pitPhase !== 'none')
  return <div className="pit-wall-team">
    <PitWallGroup title={`${car.teamName} · Team operations`}>
      <PitWallMetric label="Team cars" value={teammates.length} source="SIM" />
      <PitWallMetric label="Pit occupancy" value={inPit.length ? inPit.map((c) => c.code).join(' / ') : 'CLEAR'} source="SIM" />
      {inPit.length > 0 && <p className="pit-wall-note">A team car is in the pit lane. Another call may create a double-stack delay.</p>}
    </PitWallGroup>
    {teammates.map((member) => {
      const f1Tires = member.runtimeSystems.kind === 'f1' ? member.runtimeSystems.tires : null
      const boxCommands = f1Tires ? pitWallBoxCommands(member) : []
      const paceReason = pitWallPaceCommandDisabledReason(member)
      return <section className="pit-wall-team-car" key={member.driverId} aria-label={`Team car ${member.code} ${member.carNumber}`}>
        <h3><strong>{member.code} #{member.carNumber}</strong><span>P{member.position} · {member.status.toUpperCase()}</span><PitWallSourceTag source="SIM" /></h3>
        <div className="pit-wall-group">
          <PitWallMetric label="Tyre / age" value={f1Tires ? `${tireLabels[f1Tires.tire]} / ${f1Tires.tireAgeLaps} laps` : 'UNAVAILABLE'} source={f1Tires ? 'SIM' : 'UNAVAILABLE'} />
          <PitWallMetric label="Stops / pit phase" value={`${member.pitStops} / ${member.pitPhase.toUpperCase()}`} source="SIM" />
          <PitWallMetric label="Pace" value={member.racePaceMode.toUpperCase()} source="SIM" />
          {f1Tires?.pendingTire && <PitWallMetric label="Committed tyre" value={tireLabels[f1Tires.pendingTire]} source="SIM" />}
        </div>
        <div className="pit-wall-team-actions" role="group" aria-label={`Box ${member.code}`}>
          {boxCommands.map((command) => <button key={command.compound} type="button" disabled={command.disabled}
            title={command.disabledReason ?? `Box ${member.code} for ${tireLabels[command.compound]} (${command.setsRemaining} sets)`}
            onClick={() => onRequestPitStop(member.driverId, command.compound)}>BOX {command.compound}</button>)}
          {!f1Tires && <span className="pit-wall-empty">Control-tyre box command unavailable</span>}
        </div>
        <div className="pit-wall-team-actions" role="group" aria-label={`Pace ${member.code}`}>
          {paceModes.map((mode) => <button key={mode} type="button" aria-pressed={member.racePaceMode === mode}
            disabled={paceReason !== null} title={paceReason ?? `Set ${member.code} to ${mode}`}
            onClick={() => onSetDriverPaceMode(member.driverId, mode)}>{mode === 'standard' ? 'STD' : mode.toUpperCase()}</button>)}
        </div>
      </section>
    })}
    <p className="pit-wall-note">Commands apply to the named car. The persistent command bar below applies to the selected car, {car.code}.</p>
  </div>
}
