import { Flag, Trophy, X } from 'lucide-react'
import { useMemo } from 'react'
import type { RaceSnapshot } from '../types'
import {
  buildRaceClassification,
  fastestLapFromClassification,
} from '../simulation/classification'

type RaceClassificationPanelProps = {
  onClose: () => void
  snapshot: RaceSnapshot
}

const formatLapTime = (seconds: number | null) => {
  if (seconds === null) {
    return '--.---'
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remainder}`
}

const changeLabel = (change: number) =>
  change > 0 ? `+${change}` : change < 0 ? `${change}` : '0'

export function RaceClassificationPanel({
  onClose,
  snapshot,
}: RaceClassificationPanelProps) {
  const classification = useMemo(
    () => buildRaceClassification(snapshot),
    [snapshot],
  )
  const fastestLap = useMemo(
    () => fastestLapFromClassification(classification),
    [classification],
  )
  const isFinal = snapshot.sessionStatus === 'finished'

  return (
    <section className="hud classification-panel" aria-label="race classification">
      <header>
        <span>
          <Trophy aria-hidden="true" size={14} />
          Classification
        </span>
        <strong className={isFinal ? 'flag-clear' : 'flag-yellow'}>
          {isFinal ? 'Final' : 'Provisional'}
        </strong>
        <button
          aria-label="hide classification"
          onClick={onClose}
          title="Hide classification"
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      <div className="classification-summary">
        <span>Distance</span>
        <strong>{snapshot.leaderLap}/{snapshot.raceLaps} laps</strong>
        <span>Fastest lap</span>
        <strong title={fastestLap ? `Lap ${fastestLap.bestLapLap}` : undefined}>
          {fastestLap
            ? `${fastestLap.code} ${formatLapTime(fastestLap.bestLapTimeSeconds)}`
            : '--'}
        </strong>
      </div>
      <ol>
        {classification.map((entry) => (
          <li className={entry.statusLabel === 'DNF' ? 'result-dnf' : undefined} key={entry.driverId}>
            <span className="result-position" style={{ backgroundColor: entry.teamColor }}>
              {entry.position}
            </span>
            <div className="result-driver">
              <strong>{entry.code}</strong>
              <span>G{entry.gridPosition} / {entry.pitStops} stop{entry.pitStops === 1 ? '' : 's'} / {entry.compoundsUsed.join(' ')} / {entry.trackLimitWarnings} TL</span>
            </div>
            <span className={`result-change ${entry.positionChange === 0 ? 'result-neutral' : entry.positionChange > 0 ? 'result-up' : 'result-down'}`}>
              {changeLabel(entry.positionChange)}
            </span>
            <div className="result-time">
              <strong>{entry.gapLabel}</strong>
              <span>{entry.penaltyLabel ?? entry.statusLabel}</span>
            </div>
          </li>
        ))}
      </ol>
      <footer>
        <Flag aria-hidden="true" size={13} />
        <span>Grid change / pit stops / compound history / penalties</span>
      </footer>
    </section>
  )
}
