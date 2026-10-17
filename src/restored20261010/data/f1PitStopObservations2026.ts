/**
 * Observed stationary times for 2026 race pit stops.
 *
 * These are `stop_duration` from the OpenF1 `pit` endpoint: the time the car
 * is stopped in its box. They are not lane duration and not loss versus
 * staying out, both of which are larger and measure different things.
 *
 * Derived by pooling every finite `stop_duration` between 0 and 60 s from the
 * six 2026 race sessions whose pit data the pace-calibration pipeline has
 * already fetched. The per-session rows below let the pooled figures be
 * rechecked against their sources.
 *
 * WHAT THE UPPER TAIL IS
 *
 * The p90 of the pooled sample is 7.8 s and single sessions reach 16 to 27 s.
 * Those are not slow pit work. A five- or ten-second penalty is served with
 * the car stationary in its box, and the pit endpoint records the whole stop,
 * so served penalties, red-flag stops and terminal retirements all land in
 * this distribution. The simulation models penalties separately, so fitting a
 * routine stop to this tail would count them twice.
 *
 * Only the lower half of the distribution is therefore used for calibration:
 * the minimum, the tenth percentile and the median. Penalties can only make a
 * stop longer, so an uncontaminated sample would sit at or below these
 * figures, and matching them keeps the model on the slow side rather than
 * flattering it.
 */
export type PitStopStationaryObservation = {
  /** OpenF1 session key of the race. */
  sessionKey: number
  sampleCount: number
  minimumSeconds: number
  p10Seconds: number
  medianSeconds: number
  /** Recorded for completeness; contaminated by served penalties. */
  p90Seconds: number
}

export const F1_PIT_STOP_STATIONARY_OBSERVATIONS_2026: readonly PitStopStationaryObservation[] =
  [
    { sessionKey: 11234, sampleCount: 20, minimumSeconds: 2.2, p10Seconds: 2.3, medianSeconds: 3.25, p90Seconds: 16.9 },
    { sessionKey: 11245, sampleCount: 18, minimumSeconds: 2.4, p10Seconds: 2.5, medianSeconds: 3.15, p90Seconds: 16.1 },
    { sessionKey: 11253, sampleCount: 20, minimumSeconds: 2.0, p10Seconds: 2.4, medianSeconds: 2.9, p90Seconds: 4.3 },
    { sessionKey: 11280, sampleCount: 19, minimumSeconds: 2.2, p10Seconds: 2.4, medianSeconds: 3.1, p90Seconds: 4.6 },
    { sessionKey: 11307, sampleCount: 43, minimumSeconds: 2.1, p10Seconds: 2.4, medianSeconds: 3.0, p90Seconds: 4.5 },
    { sessionKey: 11334, sampleCount: 28, minimumSeconds: 2.3, p10Seconds: 2.5, medianSeconds: 3.55, p90Seconds: 10.8 },
  ] as const

/** Pooled across the sessions above. */
export const F1_PIT_STOP_STATIONARY_POOLED_2026 = {
  sampleCount: 148,
  minimumSeconds: 2.0,
  p10Seconds: 2.4,
  p25Seconds: 2.6,
  medianSeconds: 3.2,
  p75Seconds: 4.2,
  /** Contaminated by served penalties; not a calibration target. */
  p90Seconds: 7.8,
} as const

/**
 * The same stops, split by team through the OpenF1 `drivers` endpoint.
 *
 * WHY THE CALIBRATION STATISTIC IS THE LOWER QUARTILE
 *
 * A team's median is contaminated by the penalties described above, and
 * unevenly so: a team that collected two penalties in fourteen stops has its
 * median dragged upwards by something its pit crew did not do. Roughly an
 * eighth of all stops are affected, so the lower quartile sits well clear of
 * them while still describing a normal stop rather than a single lucky one.
 *
 * That distinction matters for the headline number. Team medians span 1.80 s
 * here, which is the 1.5 to 2 s figure the audit quoted, but the quartiles
 * span 1.10 s. The difference is penalties, not pit work, and 1.10 s is what a
 * crew model should reproduce.
 *
 * Sample sizes are 8 to 18 stops per team, which is small. These are ranking
 * evidence with a scale attached, not precise per-team times.
 */
export type PitCrewStationaryObservation = {
  /** OpenF1 `team_name`, matched verbatim against the grid data. */
  team: string
  sampleCount: number
  minimumSeconds: number
  /** The calibration statistic. */
  p25Seconds: number
  /** Recorded for completeness; contaminated by served penalties. */
  medianSeconds: number
}

export const F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026: readonly PitCrewStationaryObservation[] =
  [
    { team: 'Ferrari', sampleCount: 14, minimumSeconds: 2.0, p25Seconds: 2.3, medianSeconds: 2.5 },
    { team: 'Mercedes', sampleCount: 12, minimumSeconds: 2.2, p25Seconds: 2.4, medianSeconds: 2.6 },
    { team: 'McLaren', sampleCount: 8, minimumSeconds: 2.2, p25Seconds: 2.5, medianSeconds: 2.8 },
    { team: 'Racing Bulls', sampleCount: 11, minimumSeconds: 2.4, p25Seconds: 2.5, medianSeconds: 2.9 },
    { team: 'Audi', sampleCount: 11, minimumSeconds: 2.1, p25Seconds: 2.6, medianSeconds: 3.1 },
    { team: 'Red Bull Racing', sampleCount: 16, minimumSeconds: 2.3, p25Seconds: 2.7, medianSeconds: 2.95 },
    { team: 'Williams', sampleCount: 18, minimumSeconds: 2.1, p25Seconds: 2.7, medianSeconds: 3.25 },
    { team: 'Aston Martin', sampleCount: 15, minimumSeconds: 2.4, p25Seconds: 2.8, medianSeconds: 3.2 },
    { team: 'Alpine', sampleCount: 12, minimumSeconds: 2.6, p25Seconds: 2.9, medianSeconds: 2.95 },
    { team: 'Cadillac', sampleCount: 17, minimumSeconds: 2.9, p25Seconds: 3.3, medianSeconds: 4.2 },
    { team: 'Haas F1 Team', sampleCount: 14, minimumSeconds: 3.3, p25Seconds: 3.4, medianSeconds: 4.3 },
  ] as const

export const F1_PIT_STOP_OBSERVATION_SOURCE = {
  label: 'OpenF1 pit and drivers endpoints, 2026 race sessions',
  url: 'https://api.openf1.org/v1/pit',
  teamMappingUrl: 'https://api.openf1.org/v1/drivers',
} as const
