import type { TrackDefinition } from '../types'
import { sourceRegistry } from './sourceRegistry'

type PaceReference = NonNullable<TrackDefinition['paceReference2026']>
type ReferenceInput = Omit<
  PaceReference,
  'series' | 'sourceLabel' | 'sourceUrl'
>

const f1 = (input: ReferenceInput): PaceReference => ({
  ...input,
  series: 'f1-custom',
  sourceLabel: sourceRegistry.f1Results2026.label,
  sourceUrl: sourceRegistry.f1Results2026.url,
})

const superFormula = (input: ReferenceInput): PaceReference => ({
  ...input,
  series: 'super-formula',
  sourceLabel: sourceRegistry.superFormula2026.label,
  sourceUrl: sourceRegistry.superFormula2026.url,
})

/**
 * Completed-event values use official results. Future-round values are
 * explicit estimates supplied for the 2026 simulator baseline. Race averages
 * include pit stops and neutralisations, so they are validation targets for a
 * complete scenario rather than targets for every green-flag lap.
 */
export const f1PaceReferences2026: Record<string, PaceReference> = {
  'albert-park-approx': f1({
    qualifyingBasis: 'official-result',
    qualifyingSeconds: 78.518,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 85.979,
  }),
  'shanghai-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 90,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 99.922,
  }),
  'suzuka-approx': f1({
    qualifyingBasis: 'official-result',
    qualifyingSeconds: 88.778,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 99.687,
  }),
  'miami-approx': f1({
    qualifyingBasis: 'official-result',
    qualifyingSeconds: 87.798,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 98.233,
  }),
  'montreal-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 70.5,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 77.879,
  }),
  'monaco-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 69.5,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 110.401,
    note: 'Race average is dominated by strategy and low-speed running.',
  }),
  'barcelona-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 71.5,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 84.062,
  }),
  'red-bull-ring-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 63.5,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 73.211,
  }),
  'silverstone-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 83.5,
    raceAverageBasis: 'official-result',
    raceAverageSeconds: 100.603,
    note: 'Race average includes changing weather and race development.',
  }),
  'spa-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 100.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 115.511,
  }),
  'hungaroring-approx': f1({
    qualifyingBasis: 'official-result',
    qualifyingSeconds: 74,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 84.5,
  }),
  'zandvoort-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 69,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 79,
  }),
  'monza-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 78,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 87,
  }),
  'madrid-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 92,
    qualifyingRangeSeconds: [90, 94],
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 103.5,
    raceAverageRangeSeconds: [101, 106],
    note: 'New circuit: both values carry high uncertainty.',
  }),
  'baku-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 100,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 112,
  }),
  'singapore-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 88.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 103,
  }),
  'cota-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 92,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 103,
  }),
  'mexico-city-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 75.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 85.5,
  }),
  'interlagos-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 68.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 78,
  }),
  'las-vegas-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 91.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 101.5,
  }),
  'lusail-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 79.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 89.5,
  }),
  'yas-marina-approx': f1({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 81.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 91.5,
  }),
}

export const superFormulaPaceReferences2026: Record<string, PaceReference> = {
  'motegi-sf': superFormula({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 90.9,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 99.25,
  }),
  'suzuka-approx': superFormula({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 95.9,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 104.5,
  }),
  'fuji-sf': superFormula({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 82.75,
    qualifyingRangeSeconds: [82, 84],
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 93,
    raceAverageRangeSeconds: [91.5, 95],
  }),
  'sugo-sf': superFormula({
    qualifyingBasis: 'estimate',
    qualifyingSeconds: 64.5,
    raceAverageBasis: 'estimate',
    raceAverageSeconds: 72.5,
  }),
}

export function paceReference2026For(
  series: PaceReference['series'],
  trackId: string,
) {
  return series === 'f1-custom'
    ? f1PaceReferences2026[trackId]
    : superFormulaPaceReferences2026[trackId]
}

/**
 * The qualifying engine applies machine, driver, setup, evolution, and
 * stochastic execution after this neutral baseline. These offsets convert a
 * representative pole target into that neutral baseline; they do not clamp a
 * generated lap to the published time.
 */
export function simulationBaseLapTimeForPaceReference(
  reference: PaceReference | undefined,
  fallbackSeconds: number,
) {
  if (!reference) {
    return fallbackSeconds
  }

  const seconds =
    reference.series === 'f1-custom'
      ? reference.qualifyingSeconds * 1.046
      : reference.qualifyingSeconds + 0.25
  const calibratedSeconds = Number(seconds.toFixed(3))

  // Estimated values are not precise enough to justify tiny changes that can
  // move a sampled straight across a profile threshold. Preserve an existing
  // F1 baseline when the estimate differs by less than half a second.
  if (
    reference.series === 'f1-custom' &&
    reference.qualifyingBasis === 'estimate' &&
    Math.abs(calibratedSeconds - fallbackSeconds) < 0.5
  ) {
    return fallbackSeconds
  }

  return calibratedSeconds
}
