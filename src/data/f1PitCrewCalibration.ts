import {
  F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026,
  type PitCrewStationaryObservation,
} from './f1PitStopObservations2026'

const DEFAULT_PIT_CREW_SPEED = 0.82

/**
 * Constants this rating is the inverse of.
 *
 * A team's modelled stationary time is
 *
 *   crewBaseSeconds + (1 - pitCrewSpeed) * crewSpreadSeconds + variance
 *
 * and the lower quartile of the exponential variance is
 * -ln(0.75) * stopVarianceScaleSeconds. Inverting that against a team's
 * observed lower quartile is what produces the ratings, so a rating of 1 is a
 * crew whose normal stop is the modelled floor.
 *
 * They are repeated here rather than imported from `pitTuning`, which lives in
 * the simulation and reads this file. A test holds the two in step.
 */
const CREW_BASE_SECONDS = 2
const CREW_SPREAD_SECONDS = 4
const VARIANCE_P25_SECONDS = -Math.log(0.75) * 0.78

/**
 * Pit crew rating, derived from observed stationary times.
 *
 * This used to be read off the DHL fastest-stop award: how often a team won it
 * ranked the grid, and the ratings were then compressed into a deliberately
 * narrow band, because winning frequency says nothing about how many seconds
 * separate first from last. That band was 0.19 wide, which through
 * `crewSpreadSeconds` put the entire grid 0.76 s apart, and this file said in
 * as many words that the numbers were not stationary-time averages.
 *
 * They now are. `F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026` carries a measured
 * lower quartile per team and the rating is the inverse of the model that
 * consumes it. The grid spans 1.10 s, and the order is the measurement's
 * rather than the award's: Red Bull and McLaren are no longer assumed to be at
 * the front of it, and Cadillac appears at all. It was absent from the award
 * table and so took the neutral baseline, which put a crew that is second
 * slowest in the observed data into midfield.
 *
 * The floor of 2.0 s is not arbitrary either. It is the quickest stop in the
 * observed sample, so a rating of 1 describes a crew that matches the best
 * anyone managed rather than an unreachable ideal.
 *
 * Teams with no observation keep the neutral baseline. F2, F3 and Super
 * Formula have no equivalent data and use their own rating paths.
 */
const ratingFor = (observation: PitCrewStationaryObservation) =>
  Math.round(
    (1 -
      (observation.p25Seconds - CREW_BASE_SECONDS - VARIANCE_P25_SECONDS) /
        CREW_SPREAD_SECONDS) *
      1000,
  ) / 1000

const F1_PIT_CREW_SPEED_BY_TEAM: Readonly<Record<string, number>> =
  Object.fromEntries(
    F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026.map((observation) => [
      observation.team,
      ratingFor(observation),
    ]),
  )

export const F1_PIT_CREW_CALIBRATION_SOURCE = {
  label: 'OpenF1 observed stationary times, 2026 races (lower quartile)',
  url: 'https://api.openf1.org/v1/pit',
} as const

export function f1PitCrewSpeedForTeam(teamName: string): number {
  return F1_PIT_CREW_SPEED_BY_TEAM[teamName] ?? DEFAULT_PIT_CREW_SPEED
}

export function hasCompleteF1PitCrewCalibration(teamNames: string[]): boolean {
  return teamNames.every((teamName) => teamName in F1_PIT_CREW_SPEED_BY_TEAM)
}
