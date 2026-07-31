import type { ReactNode } from 'react'
import {
  componentConditionLabels,
  componentConditionState,
  type ComponentConditionState,
  type PitWallSource,
} from '../../domain/pitWall'

/**
 * `neutral` is the default read-out tone. The three condition tones reuse the
 * shared component thresholds so a colour never carries meaning on its own:
 * every toned value also prints its state text.
 */
export type PitWallTone = 'neutral' | ComponentConditionState

export function PitWallSourceTag({ source }: { source: PitWallSource }) {
  return (
    <span
      className={`broadcast-source source-${source.toLowerCase()}`}
      title={`Data source: ${source}`}
    >
      {/* The full word does not fit a dense chip; the title carries it. */}
      {source === 'UNAVAILABLE' ? 'N/A' : source}
    </span>
  )
}

/**
 * One label/value pair. The value column is fixed-width and tabular so a
 * continuously updating number never reflows the row.
 */
export function PitWallMetric({
  label,
  source,
  title,
  tone = 'neutral',
  value,
}: {
  label: string
  source?: PitWallSource
  title?: string
  tone?: PitWallTone
  value: ReactNode
}) {
  return (
    <div className="pit-wall-metric" title={title}>
      <span>{label}</span>
      <strong className={`pit-wall-value tone-${tone}`}>{value}</strong>
      {source ? <PitWallSourceTag source={source} /> : null}
    </div>
  )
}

export function PitWallStatusBadge({
  label,
  tone,
}: {
  label: string
  tone: PitWallTone
}) {
  return <b className={`pit-wall-badge tone-${tone}`}>{label}</b>
}

/**
 * Percentage bar for a component condition. The numeric percentage and the
 * GOOD/WATCH/CRITICAL word are always rendered alongside the bar.
 */
export function PitWallConditionGauge({
  label,
  percent,
  source = 'SIM',
}: {
  label: string
  percent: number
  source?: PitWallSource
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const state = componentConditionState(clamped)

  return (
    <div
      className="pit-wall-gauge"
      title={`${label}: ${clamped.toFixed(0)}% condition (${componentConditionLabels[state]})`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="pit-wall-gauge-track">
        <i className={`tone-${state}`} style={{ width: `${clamped}%` }} />
      </span>
      <strong className={`pit-wall-value tone-${state}`}>
        {clamped.toFixed(0)}%
      </strong>
      <PitWallStatusBadge label={componentConditionLabels[state]} tone={state} />
      <PitWallSourceTag source={source} />
    </div>
  )
}

export function PitWallGroup({
  children,
  title,
  wide = false,
}: {
  children: ReactNode
  title: string
  /** Spans two grid columns for read-outs that need a wider label column. */
  wide?: boolean
}) {
  return (
    <section className={wide ? 'pit-wall-group is-wide' : 'pit-wall-group'}>
      <h3>{title}</h3>
      <div className="pit-wall-metric-grid">{children}</div>
    </section>
  )
}
