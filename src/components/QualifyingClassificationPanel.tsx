import { Flag, Timer, X } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { qualifyingCutSizes } from '../simulation/qualifying'
import type { RaceSnapshot, WeekendStage } from '../types'

type QualifyingClassificationPanelProps = {
  onClose: () => void
  snapshot: RaceSnapshot
  stage: WeekendStage
}

const formatLapTime = (seconds: number | null | undefined) => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return '--:--.---'
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remainder}`
}

const releaseStrategyLabels = {
  'bank-lap': 'BANK',
  'traffic-gap': 'GAP',
  'track-evolution': 'EVO',
  'weather-priority': 'RAIN',
} as const

export function QualifyingClassificationPanel({
  onClose,
  snapshot,
  stage,
}: QualifyingClassificationPanelProps) {
  const segments = stage === 'sprintQualifying'
    ? (['SQ1', 'SQ2', 'SQ3'] as const)
    : (['Q1', 'Q2', 'Q3'] as const)
  const durations = stage === 'sprintQualifying'
    ? ([12, 10, 8] as const)
    : ([18, 15, 13] as const)
  const { q2Size, q3Size } = qualifyingCutSizes(snapshot.cars.length)
  const q1Eliminated = snapshot.cars.length - q2Size
  const q2Eliminated = q2Size - q3Size
  const activeParticipants = useMemo(
    () => new Set(snapshot.timedParticipantDriverIds),
    [snapshot.timedParticipantDriverIds],
  )
  const activeSegment = snapshot.timedSegmentLabel ?? 'INTERVAL'
  const currentSegmentIndex = segments.findIndex(
    (segment) => segment === snapshot.timedSegmentLabel,
  )
  const isFinal = snapshot.sessionStatus === 'finished'
  const referenceSegment = isFinal
    ? segments[2]
    : currentSegmentIndex >= 0
      ? segments[currentSegmentIndex]
      : segments.findLast((segment) =>
          snapshot.cars.some((car) =>
            Object.prototype.hasOwnProperty.call(
              car.timedSegmentBestSeconds,
              segment,
            ),
          ),
        ) ?? segments[0]
  const fastestReference = snapshot.cars
    .map((car) => ({
      car,
      time: car.timedSegmentBestSeconds[referenceSegment],
    }))
    .filter(
      (entry): entry is { car: (typeof snapshot.cars)[number]; time: number } =>
        typeof entry.time === 'number',
    )
    .sort((left, right) => left.time - right.time)[0]

  const statusFor = (index: number, driverId: string) => {
    const car = snapshot.cars[index]

    if (car.status === 'disqualified') return 'DSQ'
    if (car.qualifyingClassificationStatus === 'no-time') {
      return car.stewardsGrantedStart ? 'PERMIT' : 'NO TIME'
    }
    if (car.qualifyingClassificationStatus === 'deleted') {
      return car.stewardsGrantedStart ? 'PERMIT' : 'DELETED'
    }
    if (car.status === 'dns') return 'DNS'
    if (isFinal) {
      if (index < q3Size) return segments[2]
      if (index < q2Size) return `OUT ${segments[1]}`
      return `OUT ${segments[0]}`
    }
    if (activeParticipants.has(driverId)) {
      if (car.timedRunPhase === 'attack-lap') return 'FLYING'
      if (car.timedRunPhase === 'out-lap') return 'OUT LAP'
      if (car.timedRunPhase === 'in-lap') return 'IN LAP'
      if (car.status === 'pit') {
        const releaseLabel = car.timedReleaseStrategy
          ? releaseStrategyLabels[car.timedReleaseStrategy]
          : null
        const releaseIn =
          car.pitUntilSeconds === null
            ? null
            : Math.max(0, Math.ceil(car.pitUntilSeconds - snapshot.elapsedSeconds))

        return releaseLabel && releaseIn !== null
          ? `${releaseLabel} ${releaseIn}s`
          : 'PIT'
      }
      return activeSegment
    }
    if (currentSegmentIndex <= 0) return index < q2Size ? 'Q2' : 'DROP'
    if (currentSegmentIndex === 1 && index < q2Size) {
      return index < q3Size ? 'Q3' : 'DROP'
    }
    return index < q3Size ? segments[2] : 'OUT'
  }

  return (
    <section
      aria-label="qualifying classification"
      className="hud classification-panel qualifying-classification-panel"
    >
      <header>
        <span><Timer aria-hidden="true" size={14} />Qualifying classification</span>
        <strong className={isFinal ? 'flag-clear' : 'flag-yellow'}>
          {isFinal ? 'Final' : activeSegment}
        </strong>
        <button
          aria-label="hide qualifying classification"
          onClick={onClose}
          title="Hide qualifying classification"
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      <div className="classification-summary">
        <span>Format</span>
        <strong>{segments[0]} {durations[0]} / {segments[1]} {durations[1]} / {segments[2]} {durations[2]} min</strong>
        <span>Field</span>
        <strong>{snapshot.cars.length} → {q2Size} → {q3Size}</strong>
        <span>Eliminated</span>
        <strong>{segments[0]} {q1Eliminated} / {segments[1]} {q2Eliminated}</strong>
        <span>{isFinal ? 'Pole' : `Best ${referenceSegment}`}</span>
        <strong>
          {fastestReference
            ? `${fastestReference.car.code} ${formatLapTime(fastestReference.time)}`
            : '--'}
        </strong>
      </div>
      <div className="qualifying-table-head" aria-hidden="true">
        <span>POS</span><span>DRIVER</span>
        {segments.map((segment) => <span key={segment}>{segment}</span>)}
        <span>STATUS</span>
      </div>
      <ol>
        {snapshot.cars.map((car, index) => (
          <Fragment key={car.driverId}>
            <li className="qualifying-result-row">
              <span
                className="result-position"
                style={{ backgroundColor: car.teamColor }}
              >
                {index + 1}
              </span>
              <div className="result-driver">
                <strong>{car.code}</strong>
                <span>{car.driverName}</span>
              </div>
              {segments.map((segment) => (
                <strong
                  className={
                    typeof car.timedSegmentBestSeconds[segment] === 'number'
                      ? 'qualifying-time'
                      : 'qualifying-time qualifying-time-pending'
                  }
                  key={segment}
                >
                  {formatLapTime(car.timedSegmentBestSeconds[segment])}
                </strong>
              ))}
              <b className="qualifying-status">
                {statusFor(index, car.driverId)}
              </b>
            </li>
            {index + 1 === q3Size ? (
              <li className="qualifying-cut-marker"><span>{segments[2]} CUT - TOP {q3Size}</span></li>
            ) : null}
            {index + 1 === q2Size ? (
              <li className="qualifying-cut-marker"><span>{segments[1]} CUT - TOP {q2Size}</span></li>
            ) : null}
          </Fragment>
        ))}
      </ol>
      <footer>
        <Flag aria-hidden="true" size={13} />
        <span>FIA 2026 B2.4 · exact tie: earlier lap first</span>
      </footer>
    </section>
  )
}
