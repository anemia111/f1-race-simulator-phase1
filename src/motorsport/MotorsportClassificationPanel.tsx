import { Flag, Trophy, X } from 'lucide-react'
import { motorsportStandings } from './race'
import type { MotorsportRaceConfig, MotorsportRaceState } from './types'

const lapTime = (seconds: number | null) => seconds === null ? '--.---' : `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`

export function MotorsportClassificationPanel({ config, state, classFilter, onClassFilter, onSelect, onClose }: {
  config: MotorsportRaceConfig; state: MotorsportRaceState; classFilter: string
  onClassFilter: (value: string) => void; onSelect: (id: string) => void; onClose: () => void
}) {
  const standings = motorsportStandings(state, config)
  const classes = [...new Set(config.entries.map(entry => entry.classId))]
  const visible = standings.filter(row => classFilter === 'all' || row.entry.classId === classFilter)
  const best = standings.filter(row => row.car.bestLapSeconds !== null).sort((a, b) => a.car.bestLapSeconds! - b.car.bestLapSeconds!)[0]
  return <section className="hud classification-panel" role="dialog" aria-label="classification">
    <header><span><Trophy size={14} />Classification</span><strong className={state.phase === 'finished' ? 'flag-clear' : 'flag-yellow'}>{state.phase === 'finished' ? 'Final' : 'Provisional'}</strong><button aria-label="Close panel" title="Hide classification" onClick={onClose} type="button"><X size={14} /></button></header>
    <div className="classification-summary"><span>Distance</span><strong>{config.format.kind === 'laps' ? `${Math.min(standings[0].car.laps, config.format.laps)}/${config.format.laps} laps` : `${Math.floor(state.raceSeconds / 60)} / ${Math.floor(config.format.seconds / 60)} min`}</strong><span>Fastest lap</span><strong>{best ? `#${best.entry.number} ${lapTime(best.car.bestLapSeconds)}` : '--'}</strong></div>
    <label className="field-block"><span>Class</span><select aria-label="Motorsport class filter" value={classFilter} onChange={event => onClassFilter(event.target.value)}><option value="all">All classes</option>{classes.map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
    <ol>{visible.map(({ car, entry, overallPosition, classPosition }) => {
      const grid = config.entries.findIndex(item => item.id === entry.id) + 1
      const position = classFilter === 'all' ? overallPosition : classPosition
      const delta = grid - overallPosition
      const leader = (classFilter === 'all' ? standings : visible)[0].car
      const lapGap = Math.floor(Math.max(0, leader.distanceM - car.distanceM) / config.course.lengthM)
      const gap = position === 1 ? 'LEADER' : car.finishTime !== null && leader.finishTime !== null ? `+${Math.max(0,car.finishTime+car.penaltySeconds-leader.finishTime-leader.penaltySeconds).toFixed(1)}` : lapGap ? `+${lapGap}L` : `+${(Math.max(0,leader.distanceM-car.distanceM)/Math.max(1,car.speedMps)).toFixed(1)}`
      return <li key={entry.id} className={car.status === 'retired' ? 'result-dnf' : undefined} onClick={() => onSelect(entry.id)}>
        <span className="result-position" style={{ backgroundColor: entry.color }}>{position}</span>
        <div className="result-driver"><strong>#{entry.number} {entry.drivers[car.driverIndex].name}</strong><span>G{grid} / {entry.classId.toUpperCase()} P{classPosition} / {car.pits} stops / {car.tyreSets.map(set => set.compound).join(' ')}</span></div>
        <span className={`result-change ${delta === 0 ? 'result-neutral' : delta > 0 ? 'result-up' : 'result-down'}`}>{delta > 0 ? '+' : ''}{delta}</span>
        <div className="result-time"><strong>{gap}</strong><span>{lapTime(car.bestLapSeconds)} / {car.penaltySeconds ? `+${car.penaltySeconds.toFixed(1)}s / ` : ''}{car.status.toUpperCase()}</span></div>
      </li>
    })}</ol>
    <footer><Flag size={13} /><span>Grid change / class position / pit stops / tyre history / penalties · SIM</span></footer>
  </section>
}
