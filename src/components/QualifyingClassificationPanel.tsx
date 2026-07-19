import { Flag, Timer, X } from 'lucide-react'
import { Fragment, useMemo, type CSSProperties } from 'react'
import type { QualifyingSegmentName } from '../simulation/qualifying'
import type { RaceSnapshot, WeekendStage } from '../types'

type ClassificationSegment = {
  advanceCount: number | null
  durationSeconds: number
  name: QualifyingSegmentName
}

type QualifyingClassificationPanelProps = {
  onClose: () => void
  segments: readonly ClassificationSegment[]
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
  segments: configuredSegments,
  snapshot,
  stage,
}: QualifyingClassificationPanelProps) {
  const segments =
    configuredSegments.length > 0
      ? configuredSegments
      : [
          {
            advanceCount: null,
            durationSeconds: 18 * 60,
            name: 'Q1' as const,
          },
        ]
  const participantCounts = segments.map((_, index) => {
    if (index === 0) return snapshot.cars.length

    return segments[index - 1].advanceCount ?? snapshot.cars.length
  })
  const finalParticipantCount =
    participantCounts[participantCounts.length - 1] ?? snapshot.cars.length
  const activeParticipants = useMemo(
    () => new Set(snapshot.timedParticipantDriverIds),
    [snapshot.timedParticipantDriverIds],
  )
  const activeSegment = snapshot.timedSegmentLabel ?? 'INTERVAL'
  const currentSegmentIndex = segments.findIndex(
    (segment) => segment.name === snapshot.timedSegmentLabel,
  )
  const isFinal = snapshot.sessionStatus === 'finished'
  const referenceSegment = isFinal
    ? segments[segments.length - 1].name
    : currentSegmentIndex >= 0
      ? segments[currentSegmentIndex].name
      : (segments.findLast((segment) =>
          snapshot.cars.some((car) =>
            Object.prototype.hasOwnProperty.call(
              car.timedSegmentBestSeconds,
              segment.name,
            ),
          ),
        )?.name ?? segments[0].name)
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
      if (index < finalParticipantCount) {
        return segments[segments.length - 1].name
      }

      for (
        let segmentIndex = segments.length - 2;
        segmentIndex >= 0;
        segmentIndex -= 1
      ) {
        if (index < participantCounts[segmentIndex]) {
          return `OUT ${segments[segmentIndex].name}`
        }
      }

      return `OUT ${segments[0].name}`
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
            : Math.max(
                0,
                Math.ceil(car.pitUntilSeconds - snapshot.elapsedSeconds),
              )

        return releaseLabel && releaseIn !== null
          ? `${releaseLabel} ${releaseIn}s`
          : 'PIT'
      }
      return activeSegment
    }

    if (currentSegmentIndex < 0) {
      return segments[0].name
    }

    for (
      let segmentIndex = 0;
      segmentIndex < currentSegmentIndex;
      segmentIndex += 1
    ) {
      const advanceCount = segments[segmentIndex].advanceCount

      if (advanceCount !== null && index >= advanceCount) {
        return `OUT ${segments[segmentIndex].name}`
      }
    }

    return segments[Math.min(currentSegmentIndex + 1, segments.length - 1)]
      .name
  }

  const gridStyle = {
    '--qualifying-segment-count': segments.length,
  } as CSSProperties

  return (
    <section
      aria-label="qualifying classification"
      className="hud classification-panel qualifying-classification-panel"
      style={gridStyle}
    >
      <header>
        <span>
          <Timer aria-hidden="true" size={14} />
          {stage === 'qualifying2' ? 'Qualifying 2' : 'Qualifying'} classification
        </span>
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
        <strong>
          {segments
            .map(
              (segment) =>
                `${segment.name} ${Math.round(segment.durationSeconds / 60)}m`,
            )
            .join(' / ')}
        </strong>
        <span>Field</span>
        <strong>{participantCounts.join(' -> ')}</strong>
        <span>Eliminated</span>
        <strong>
          {segments.length === 1
            ? 'Single classification'
            : segments
                .slice(0, -1)
                .map((segment, index) => {
                  const nextCount =
                    segment.advanceCount ?? participantCounts[index]

                  return `${segment.name} ${participantCounts[index] - nextCount}`
                })
                .join(' / ')}
        </strong>
        <span>{isFinal ? 'Pole' : `Best ${referenceSegment}`}</span>
        <strong>
          {fastestReference
            ? `${fastestReference.car.code} ${formatLapTime(fastestReference.time)}`
            : '--'}
        </strong>
      </div>
      <div className="qualifying-table-head" aria-hidden="true">
        <span>POS</span>
        <span>DRIVER</span>
        {segments.map((segment) => (
          <span key={segment.name}>{segment.name}</span>
        ))}
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
                    typeof car.timedSegmentBestSeconds[segment.name] ===
                    'number'
                      ? 'qualifying-time'
                      : 'qualifying-time qualifying-time-pending'
                  }
                  key={segment.name}
                >
                  {formatLapTime(car.timedSegmentBestSeconds[segment.name])}
                </strong>
              ))}
              <b className="qualifying-status">
                {statusFor(index, car.driverId)}
              </b>
            </li>
            {segments.slice(0, -1).map((segment, segmentIndex) =>
              segment.advanceCount !== null &&
              index + 1 === segment.advanceCount ? (
                <li
                  className="qualifying-cut-marker"
                  key={`${segment.name}-cut`}
                >
                  <span>
                    {segments[segmentIndex + 1].name} CUT - TOP{' '}
                    {segment.advanceCount}
                  </span>
                </li>
              ) : null,
            )}
          </Fragment>
        ))}
      </ol>
      <footer>
        <Flag aria-hidden="true" size={13} />
        <span>
          {stage === 'sprintQualifying' ? 'Sprint ' : ''}classification: exact
          tie uses the earlier lap
        </span>
      </footer>
    </section>
  )
}
