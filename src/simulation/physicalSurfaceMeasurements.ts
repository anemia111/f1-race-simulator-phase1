import type { TrackDefinition, TrackSurfaceProfile } from '../types'

export type QualitativeRoadSurfaceObservation = Readonly<{
  numericCoefficient: null
  observedAt: string
  sourceLabel: string
  sourceUrl: string
  summary: string
}>

export type SourceBackedRoadGripResolution =
  | Readonly<{
      coefficientKind: 'relative-base-grip-multiplier'
      profile: TrackSurfaceProfile
      status: 'available'
      trackId: string
    }>
  | Readonly<{
      coefficientKind: 'relative-base-grip-multiplier'
      numericCoefficient: null
      observations: readonly QualitativeRoadSurfaceObservation[]
      reason: 'numeric-track-surface-coefficient-not-published'
      status: 'unavailable'
      trackId: string
    }>

const PIRELLI_2026_EVENT_SURFACE_SOURCE =
  'https://press.pirelli.com/tyre-compounds-selected-for-zandvoort-monza-and-madrid/'

const QUALITATIVE_OBSERVATIONS: Readonly<
  Record<string, readonly QualitativeRoadSurfaceObservation[]>
> = Object.freeze({
  'madrid-approx': Object.freeze([
    Object.freeze({
      numericCoefficient: null,
      observedAt: '2026-07-28',
      sourceLabel:
        'Pirelli 2026 Zandvoort, Monza and Madrid compound selection',
      sourceUrl: PIRELLI_2026_EVENT_SURFACE_SOURCE,
      summary:
        'Madrid is new asphalt and unknown to the tyre supplier; no numeric friction or relative-grip coefficient is published.',
    }),
  ]),
  'zandvoort-approx': Object.freeze([
    Object.freeze({
      numericCoefficient: null,
      observedAt: '2026-07-28',
      sourceLabel:
        'Pirelli 2026 Zandvoort, Monza and Madrid compound selection',
      sourceUrl: PIRELLI_2026_EVENT_SURFACE_SOURCE,
      summary:
        'Zandvoort is described qualitatively as relatively low grip; no numeric friction or relative-grip coefficient is published.',
    }),
  ]),
})

function hasSourceBackedNumericProfile(
  profile: TrackSurfaceProfile | undefined,
): profile is TrackSurfaceProfile {
  return (
    profile !== undefined &&
    (profile.source === 'official' || profile.source === 'observed') &&
    Number.isFinite(profile.baseFriction) &&
    profile.baseFriction >= 0.82 &&
    profile.baseFriction <= 1.05 &&
    profile.sourceLabel.trim().length > 0 &&
    typeof profile.sourceUrl === 'string' &&
    profile.sourceUrl.trim().length > 0
  )
}

/**
 * Resolves only a numeric, source-backed road-grip multiplier. Qualitative
 * terms such as "low grip" remain evidence, never an invented number. The
 * returned quantity is deliberately distinct from the tyre model's absolute
 * coefficient of friction.
 */
export function resolveSourceBackedRoadGrip(
  track: Pick<TrackDefinition, 'id' | 'surfaceProfile'>,
): SourceBackedRoadGripResolution {
  if (hasSourceBackedNumericProfile(track.surfaceProfile)) {
    return Object.freeze({
      coefficientKind: 'relative-base-grip-multiplier',
      profile: track.surfaceProfile,
      status: 'available',
      trackId: track.id,
    })
  }

  return Object.freeze({
    coefficientKind: 'relative-base-grip-multiplier',
    numericCoefficient: null,
    observations: QUALITATIVE_OBSERVATIONS[track.id] ?? Object.freeze([]),
    reason: 'numeric-track-surface-coefficient-not-published',
    status: 'unavailable',
    trackId: track.id,
  })
}
