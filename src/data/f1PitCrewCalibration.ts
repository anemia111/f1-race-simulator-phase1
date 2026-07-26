const DEFAULT_PIT_CREW_SPEED = 0.82

/**
 * Simulation calibration anchored to the official 2025 DHL fastest-stop
 * winners. Winning frequency and best-stop evidence are compressed into a
 * deliberately narrow range; these are not claimed stationary-time averages.
 * Teams absent from the winners table remain near the neutral baseline.
 */
const F1_PIT_CREW_SPEED_BY_TEAM: Readonly<Record<string, number>> = {
  Ferrari: 0.96,
  'Red Bull Racing': 0.94,
  McLaren: 0.91,
  Audi: 0.86,
  'Racing Bulls': 0.84,
  Mercedes: 0.82,
  Alpine: 0.81,
  'Haas F1 Team': 0.79,
  Williams: 0.78,
  'Aston Martin': 0.77,
}

export const F1_PIT_CREW_CALIBRATION_SOURCE = {
  label: 'Formula 1 2025 DHL Fastest Pit Stop Award (derived rating)',
  url: 'https://www.formula1.com/en/results/2025/awards/fastest-pit-stops',
} as const

export function f1PitCrewSpeedForTeam(teamName: string): number {
  return F1_PIT_CREW_SPEED_BY_TEAM[teamName] ?? DEFAULT_PIT_CREW_SPEED
}

export function hasCompleteF1PitCrewCalibration(teamNames: string[]): boolean {
  return teamNames.every((teamName) => teamName in F1_PIT_CREW_SPEED_BY_TEAM)
}
