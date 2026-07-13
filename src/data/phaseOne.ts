import type { RaceConfig } from '../types'
import { initialDrivers, initialTeams } from './grid2026'
import { defaultTrack } from './tracks'

// Personal learning demo data. If this project is ever published or distributed,
// replace real F1 team, logo, and driver references with licensed or generic data.
export const phaseOneConfig: RaceConfig = {
  track: defaultTrack,
  teams: initialTeams,
  drivers: initialDrivers,
  seed: 'phase-2-default',
}
