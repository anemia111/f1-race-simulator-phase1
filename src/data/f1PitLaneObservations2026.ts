/**
 * Observed pit-lane transit time per circuit.
 *
 * This is the median of `lane_duration - stop_duration` from the OpenF1 `pit`
 * endpoint: how long a car spends in the pit lane with the stationary time
 * taken out. It is not the loss against staying on track, which is smaller,
 * and the conversion between the two lives in `simulation/strategy`.
 *
 * Six circuits come from 2026 races and eleven from 2025 races, which are the
 * sessions the pace-calibration pipeline has fetched. A pit lane is a fixed
 * piece of tarmac, so a figure a year old still describes it, but a circuit
 * that has resurfaced or moved its entry since would not be caught here.
 *
 * The five F1 circuits with no row - Montreal, Monaco, the Red Bull Ring,
 * Silverstone and Madrid - fall back to the calendar-wide base. Monaco and
 * Silverstone are the unfortunate absences: both are known outliers, so their
 * fallback is the least trustworthy of the set.
 */
export type PitLaneTransitObservation = {
  trackId: string
  sampleCount: number
  medianTransitSeconds: number
  /** OpenF1 race sessions the sample was pooled from. */
  sessionKeys: readonly number[]
}

export const F1_PIT_LANE_TRANSIT_OBSERVATIONS: readonly PitLaneTransitObservation[] =
  [
    { trackId: 'zandvoort-approx', sampleCount: 39, medianTransitSeconds: 15.02, sessionKeys: [9920] },
    { trackId: 'albert-park-approx', sampleCount: 20, medianTransitSeconds: 15.88, sessionKeys: [11234] },
    { trackId: 'baku-approx', sampleCount: 20, medianTransitSeconds: 17.98, sessionKeys: [9904] },
    { trackId: 'las-vegas-approx', sampleCount: 22, medianTransitSeconds: 18.72, sessionKeys: [9858] },
    { trackId: 'hungaroring-approx', sampleCount: 27, medianTransitSeconds: 19.06, sessionKeys: [9928] },
    { trackId: 'yas-marina-approx', sampleCount: 26, medianTransitSeconds: 19.26, sessionKeys: [9839] },
    { trackId: 'barcelona-approx', sampleCount: 43, medianTransitSeconds: 19.69, sessionKeys: [11307] },
    { trackId: 'mexico-city-approx', sampleCount: 25, medianTransitSeconds: 19.86, sessionKeys: [9877] },
    { trackId: 'miami-approx', sampleCount: 19, medianTransitSeconds: 19.98, sessionKeys: [11280] },
    { trackId: 'shanghai-approx', sampleCount: 18, medianTransitSeconds: 20.33, sessionKeys: [11245] },
    { trackId: 'spa-approx', sampleCount: 28, medianTransitSeconds: 20.64, sessionKeys: [11334] },
    { trackId: 'suzuka-approx', sampleCount: 20, medianTransitSeconds: 20.89, sessionKeys: [11253] },
    { trackId: 'interlagos-approx', sampleCount: 36, medianTransitSeconds: 20.89, sessionKeys: [9869] },
    { trackId: 'cota-approx', sampleCount: 21, medianTransitSeconds: 21.37, sessionKeys: [9888] },
    { trackId: 'singapore-approx', sampleCount: 21, medianTransitSeconds: 21.41, sessionKeys: [9896] },
    { trackId: 'monza-approx', sampleCount: 19, medianTransitSeconds: 22.07, sessionKeys: [9912] },
    { trackId: 'lusail-approx', sampleCount: 41, medianTransitSeconds: 25.79, sessionKeys: [9850] },
  ] as const

/**
 * Mean of the medians above.
 *
 * A circuit is only ever positioned against this, never against an absolute
 * time, so the calendar-wide level stays where it was set and only the
 * differences between circuits come from the observations.
 */
export const F1_REFERENCE_PIT_LANE_TRANSIT_SECONDS = 19.93

export const F1_PIT_LANE_OBSERVATION_SOURCE = {
  label: 'OpenF1 pit endpoint, 2025 and 2026 races',
  url: 'https://api.openf1.org/v1/pit',
} as const

const BY_TRACK_ID = new Map(
  F1_PIT_LANE_TRANSIT_OBSERVATIONS.map((observation) => [
    observation.trackId,
    observation,
  ]),
)

/** Observed transit for a circuit, or null when nothing was measured. */
export function observedPitLaneTransitSeconds(trackId: string): number | null {
  return BY_TRACK_ID.get(trackId)?.medianTransitSeconds ?? null
}
