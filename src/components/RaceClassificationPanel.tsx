import { Flag, LineChart, Trophy, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { RaceSnapshot } from '../types'
import {
  buildRaceClassification,
  fastestLapFromClassification,
} from '../simulation/classification'

const LAP_CHART_WIDTH = 340
const LAP_CHART_LABEL_WIDTH = 26
const LAP_CHART_ROW_HEIGHT = 11

/**
 * Position-by-lap story of the race: one polyline per car from its grid slot
 * through every measured lap-line crossing. Teammates share a colour, so the
 * second car of each team runs a dashed line.
 */
function LapChart({ snapshot }: { snapshot: RaceSnapshot }) {
  const chart = useMemo(() => {
    const cars = snapshot.cars.filter((car) => car.status !== 'dns')
    const carCount = Math.max(cars.length, 2)
    const height = 10 + (carCount - 1) * LAP_CHART_ROW_HEIGHT
    const plotWidth = LAP_CHART_WIDTH - LAP_CHART_LABEL_WIDTH - 6
    const totalLaps = Math.max(snapshot.raceLaps, 1)
    const yFor = (position: number) => 5 + (position - 1) * LAP_CHART_ROW_HEIGHT
    const xFor = (lap: number) => 4 + (lap / totalLaps) * plotWidth
    const seenTeams = new Set<string>()

    const series = cars.map((car) => {
      const dashed = seenTeams.has(car.teamName)
      seenTeams.add(car.teamName)
      const raceLaps = car.lapHistory.filter(
        (record) => record.segment === undefined,
      )
      const points = [
        `${xFor(0).toFixed(1)},${yFor(car.gridPosition).toFixed(1)}`,
        ...raceLaps.map(
          (record) =>
            `${xFor(record.lap).toFixed(1)},${yFor(record.position).toFixed(1)}`,
        ),
      ]
      const lastY =
        raceLaps.length > 0
          ? yFor(raceLaps[raceLaps.length - 1].position)
          : yFor(car.gridPosition)

      return {
        code: car.code,
        color: car.teamColor,
        dashed,
        driverId: car.driverId,
        lastX: xFor(raceLaps.length > 0 ? raceLaps[raceLaps.length - 1].lap : 0),
        lastY,
        points: points.join(' '),
      }
    })

    return { height, series }
  }, [snapshot])

  return (
    <figure aria-label="Position by completed lap for every classified car" className="lap-chart">
      <svg
        role="img"
        viewBox={`0 0 ${LAP_CHART_WIDTH} ${chart.height + 10}`}
      >
        {chart.series.map((entry) => (
          <g key={entry.driverId}>
            <polyline
              fill="none"
              points={entry.points}
              stroke={entry.color}
              strokeDasharray={entry.dashed ? '3 2' : undefined}
              strokeLinejoin="round"
              strokeWidth={1.1}
            />
            <text
              fill={entry.color}
              fontSize={6.5}
              x={entry.lastX + 3}
              y={entry.lastY + 2}
            >
              {entry.code}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>Grid to lap {Math.min(snapshot.leaderLap, snapshot.raceLaps)}; dashed line is the second team car</figcaption>
    </figure>
  )
}

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
  const [showLapChart, setShowLapChart] = useState(false)

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
          aria-label={showLapChart ? 'Hide lap chart' : 'Show lap chart'}
          aria-pressed={showLapChart}
          onClick={() => setShowLapChart((value) => !value)}
          title={showLapChart ? 'Hide lap chart' : 'Show lap chart'}
          type="button"
        >
          <LineChart aria-hidden="true" size={14} />
        </button>
        <button
          aria-label="hide classification"
          onClick={onClose}
          title="Hide classification"
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      {showLapChart ? <LapChart snapshot={snapshot} /> : null}
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
