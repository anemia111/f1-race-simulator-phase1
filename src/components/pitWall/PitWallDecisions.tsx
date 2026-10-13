import { decisionReasonLabels } from '../../simulation/decisionLog'
import { PitWallGroup, PitWallMetric, PitWallSourceTag } from './PitWallShared'
import type { PitWallTabProps } from './types'

export function PitWallDecisions({ car, snapshot }: PitWallTabProps) {
  const decisions = (snapshot.strategyDecisions ?? []).filter((d) => d.driverId === car.driverId).slice().reverse()
  return <div className="pit-wall-decision-log">
    <PitWallGroup title="Decision evidence">
      <PitWallMetric label="Recorded pit calls" value={decisions.length} source="SIM" />
      <p className="pit-wall-note">Recorded at the engine's pit call. Rejoin is the first position after pit exit; it does not measure the strategy's net gain. Earlier calls in restored sessions may be unavailable.</p>
    </PitWallGroup>
    {decisions.length === 0 && <p className="pit-wall-empty">No recorded pit calls for this car in this session.</p>}
    {decisions.map((d) => <article className="pit-wall-decision" key={d.id}>
      <h3>LAP {d.lap} · {decisionReasonLabels[d.reason]} <PitWallSourceTag source="SIM" /></h3>
      <p>P{d.positionBefore} → BOX {d.compound}{d.doubleStackRisk ? ' · DOUBLE-STACK RISK' : ''}</p>
      <dl>
        <div><dt>Predicted rejoin</dt><dd>P{d.projectedRejoinPosition}</dd></div>
        <div><dt>Estimated pit loss</dt><dd>{d.estimatedLossSeconds.toFixed(1)}s</dd></div>
        <div><dt>Actual rejoin</dt><dd>{d.outcome ? `P${d.outcome.position}` : d.interrupted ? 'Not completed' : 'Pending pit exit'}</dd></div>
        <div><dt>Call to exit</dt><dd>{d.outcome ? `${(d.outcome.elapsedSeconds - d.elapsedSeconds).toFixed(1)}s` : '--'}</dd></div>
      </dl>
    </article>)}
  </div>
}
