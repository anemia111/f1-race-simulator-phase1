import { useEffect, useState, type CSSProperties } from 'react'
import type { RaceSnapshot } from '../types'
import { updateQualifyingCards, type QualifyingCard } from '../domain/qualifyingBroadcast'

const lapTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
const delta = (seconds: number) => `${seconds >= 0 ? '+' : '−'}${Math.abs(seconds).toFixed(3)}`

export function QualifyingTimingCards({ snapshot, segment, advanceCount, onFocusDriver }: {
  snapshot: RaceSnapshot
  segment: string
  advanceCount: number | null
  onFocusDriver: (driverId: string) => void
}) {
  const [cards, setCards] = useState<QualifyingCard[]>([])
  useEffect(() => {
    const refresh = () => setCards(previous => updateQualifyingCards(previous, snapshot, segment, advanceCount, performance.now()))
    refresh()
    const timer = window.setInterval(refresh, 100)
    return () => window.clearInterval(timer)
  }, [snapshot, segment, advanceCount])

  return <section className="qualifying-timing-cards" aria-label="予選ライブ計測・ゴール順">
    {Array.from({ length: 3 }, (_, slot) => {
      const card = cards[slot]
      if (!card) return <div className="quali-card quali-card-empty" key={`empty-${slot}`}>
        <span>{segment || 'INTERVAL'} / LIVE TIMING</span><strong>アタック待ち</strong><small>次の計測ラップを表示</small>
      </div>
      const { car, reference, result } = card
      const invalid = result && !result.isValid
      return <button className={`quali-card${result ? ' quali-card-finished' : ''}`}
        key={car.driverId} onClick={() => onFocusDriver(car.driverId)} type="button"
        aria-label={`${car.driverName} ${result ? '計測完了' : '計測中'}`}
        style={{ '--quali-team-color': car.teamColor } as CSSProperties}>
        <div className="quali-card-header"><b>{card.position ?? '–'}</b><strong>{car.code}</strong>
          <span>{car.driverName}</span><i className={`broadcast-tire tire-${car.runtimeSystems.kind === 'f1' ? car.runtimeSystems.tires.tire : 'M'}`}>
            {car.runtimeSystems.kind === 'f1' ? car.runtimeSystems.tires.tire : 'CTRL'}</i></div>
        <div className="quali-card-body">
          <div className="quali-card-primary"><strong className={invalid ? 'quali-invalid' : result && card.deltaSeconds !== null ? card.deltaSeconds <= 0 ? 'quali-ahead' : 'quali-behind' : ''}>
            {invalid ? 'DELETED' : result ? card.deltaSeconds === null ? lapTime(card.clockSeconds) : delta(card.deltaSeconds) : card.clockSeconds.toFixed(1)}</strong>
            <small>{result ? `${lapTime(card.clockSeconds)}${invalid ? ' / 無効' : ' / FINISH'}` : 'LAP CLOCK'}</small></div>
          <div className="quali-card-reference"><strong>{reference ? lapTime(reference.lap.lapTimeSeconds) : 'NO TIME'}</strong>
            <span>{reference ? `${reference.code} / ${reference.kind === 'cutoff' ? `P${reference.position} BORDER` : reference.kind === 'personal' ? 'PERSONAL BEST' : 'TOP'}` : '基準タイム待ち'}</span>
            <b className={card.deltaSeconds === null ? '' : card.deltaSeconds <= 0 ? 'quali-ahead' : 'quali-behind'}>
              {card.deltaSeconds === null ? '—' : delta(card.deltaSeconds)}
              <small>{result ? ' FINAL' : card.split ? ` S${card.split}` : ''}</small></b></div>
        </div>
        <div className="quali-card-sectors">{[0, 1, 2].map(index => <span key={index} className={`quali-sector-${invalid ? 'pending' : card.colors[index] ?? 'pending'}`}>
          <b>S{index + 1}</b><span>{card.sectors[index] == null ? '—' : card.sectors[index]!.toFixed(3)}</span>
        </span>)}</div>
      </button>
    })}
  </section>
}
