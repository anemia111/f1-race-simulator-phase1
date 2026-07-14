import type {
  OpenF1Driver,
  OpenF1StandingsSnapshot,
} from '../services/openF1'

type StandingSeed = {
  dateEnd: string
  meetingKey: number
  sessionKey: number
  drivers: ReadonlyArray<
    readonly [driverNumber: number, points: number, position?: number]
  >
  teams: ReadonlyArray<readonly [teamName: string, points: number]>
}

const drivers: OpenF1Driver[] = [
  { driver_number: 1, full_name: 'Lando Norris', name_acronym: 'NOR', team_colour: 'FF8700', team_name: 'McLaren' },
  { driver_number: 3, full_name: 'Max Verstappen', name_acronym: 'VER', team_colour: '3671C6', team_name: 'Red Bull Racing' },
  { driver_number: 5, full_name: 'Gabriel Bortoleto', name_acronym: 'BOR', team_colour: 'C8CCD0', team_name: 'Audi' },
  { driver_number: 6, full_name: 'Isack Hadjar', name_acronym: 'HAD', team_colour: '3671C6', team_name: 'Red Bull Racing' },
  { driver_number: 10, full_name: 'Pierre Gasly', name_acronym: 'GAS', team_colour: '2293D1', team_name: 'Alpine' },
  { driver_number: 11, full_name: 'Sergio Perez', name_acronym: 'PER', team_colour: 'D7B56D', team_name: 'Cadillac' },
  { driver_number: 12, full_name: 'Kimi Antonelli', name_acronym: 'ANT', team_colour: '27F4D2', team_name: 'Mercedes' },
  { driver_number: 14, full_name: 'Fernando Alonso', name_acronym: 'ALO', team_colour: '229971', team_name: 'Aston Martin' },
  { driver_number: 16, full_name: 'Charles Leclerc', name_acronym: 'LEC', team_colour: 'DC0000', team_name: 'Ferrari' },
  { driver_number: 18, full_name: 'Lance Stroll', name_acronym: 'STR', team_colour: '229971', team_name: 'Aston Martin' },
  { driver_number: 23, full_name: 'Alexander Albon', name_acronym: 'ALB', team_colour: '64C4FF', team_name: 'Williams' },
  { driver_number: 27, full_name: 'Nico Hulkenberg', name_acronym: 'HUL', team_colour: 'C8CCD0', team_name: 'Audi' },
  { driver_number: 30, full_name: 'Liam Lawson', name_acronym: 'LAW', team_colour: '6692FF', team_name: 'Racing Bulls' },
  { driver_number: 31, full_name: 'Esteban Ocon', name_acronym: 'OCO', team_colour: 'B6BABD', team_name: 'Haas F1 Team' },
  { driver_number: 41, full_name: 'Arvid Lindblad', name_acronym: 'LIN', team_colour: '6692FF', team_name: 'Racing Bulls' },
  { driver_number: 43, full_name: 'Franco Colapinto', name_acronym: 'COL', team_colour: '2293D1', team_name: 'Alpine' },
  { driver_number: 44, full_name: 'Lewis Hamilton', name_acronym: 'HAM', team_colour: 'DC0000', team_name: 'Ferrari' },
  { driver_number: 55, full_name: 'Carlos Sainz', name_acronym: 'SAI', team_colour: '64C4FF', team_name: 'Williams' },
  { driver_number: 63, full_name: 'George Russell', name_acronym: 'RUS', team_colour: '27F4D2', team_name: 'Mercedes' },
  { driver_number: 77, full_name: 'Valtteri Bottas', name_acronym: 'BOT', team_colour: 'D7B56D', team_name: 'Cadillac' },
  { driver_number: 81, full_name: 'Oscar Piastri', name_acronym: 'PIA', team_colour: 'FF8700', team_name: 'McLaren' },
  { driver_number: 87, full_name: 'Oliver Bearman', name_acronym: 'BEA', team_colour: 'B6BABD', team_name: 'Haas F1 Team' },
]

// OpenF1 championship snapshots after each completed 2026 race. Bundling the
// compact tables keeps the factual prior available offline without leaking a
// later round into an earlier weekend. Online API data still replaces these.
const snapshots: StandingSeed[] = [
  {
    dateEnd: '2026-03-08T06:00:00+00:00', meetingKey: 1279, sessionKey: 11234,
    drivers: [[63, 25], [12, 18], [16, 15], [44, 12], [1, 10], [3, 8], [87, 6], [41, 4], [5, 2], [10, 1], [31, 0], [23, 0], [30, 0], [43, 0], [55, 0], [11, 0], [18, 0, 17], [6, 0, 17], [81, 0, 18], [27, 0, 19], [14, 0, 20], [77, 0, 21]],
    teams: [['Mercedes', 43], ['Ferrari', 27], ['McLaren', 10], ['Red Bull Racing', 8], ['Haas F1 Team', 6], ['Racing Bulls', 4], ['Audi', 2], ['Alpine', 1], ['Williams', 0], ['Cadillac', 0], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-03-15T09:00:00+00:00', meetingKey: 1280, sessionKey: 11245,
    drivers: [[63, 51], [12, 47], [16, 34], [44, 33], [87, 17], [1, 15], [10, 9], [3, 8], [30, 8], [41, 4], [6, 4], [81, 3], [55, 2], [5, 2], [43, 1], [31, 0], [27, 0], [23, 0], [77, 0], [11, 0], [14, 0], [18, 0]],
    teams: [['Mercedes', 98], ['Ferrari', 67], ['McLaren', 18], ['Haas F1 Team', 17], ['Red Bull Racing', 12], ['Racing Bulls', 12], ['Alpine', 10], ['Audi', 2], ['Williams', 2], ['Cadillac', 0], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-03-29T07:00:00+00:00', meetingKey: 1281, sessionKey: 11253,
    drivers: [[12, 72], [63, 63], [16, 49], [44, 41], [1, 25], [81, 21], [87, 17], [10, 15], [3, 12], [30, 10], [41, 4], [6, 4], [5, 2], [55, 2], [31, 1], [43, 1], [27, 0], [23, 0], [77, 0], [11, 0], [14, 0], [18, 0]],
    teams: [['Mercedes', 135], ['Ferrari', 90], ['McLaren', 46], ['Haas F1 Team', 18], ['Alpine', 16], ['Red Bull Racing', 16], ['Racing Bulls', 14], ['Audi', 2], ['Williams', 2], ['Cadillac', 0], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-05-03T19:00:00+00:00', meetingKey: 1284, sessionKey: 11280,
    drivers: [[12, 100], [63, 80], [16, 59], [1, 51], [44, 51], [81, 43], [3, 26], [87, 17], [10, 16], [30, 10], [43, 7], [41, 4], [6, 4], [55, 4], [5, 2], [31, 1], [23, 1], [27, 0], [77, 0], [11, 0], [14, 0], [18, 0]],
    teams: [['Mercedes', 180], ['Ferrari', 110], ['McLaren', 94], ['Red Bull Racing', 30], ['Alpine', 23], ['Haas F1 Team', 18], ['Racing Bulls', 14], ['Williams', 5], ['Audi', 2], ['Cadillac', 0], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-05-24T22:00:00+00:00', meetingKey: 1285, sessionKey: 11291,
    drivers: [[12, 131], [63, 88], [16, 75], [44, 72], [1, 58], [81, 48], [3, 43], [10, 20], [87, 18], [30, 16], [43, 15], [6, 14], [55, 6], [41, 5], [5, 2], [31, 1], [23, 1], [27, 0], [77, 0], [11, 0], [18, 0], [14, 0]],
    teams: [['Mercedes', 219], ['Ferrari', 147], ['McLaren', 106], ['Red Bull Racing', 57], ['Alpine', 35], ['Racing Bulls', 21], ['Haas F1 Team', 19], ['Williams', 7], ['Audi', 2], ['Cadillac', 0], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-06-07T15:00:00+00:00', meetingKey: 1286, sessionKey: 11299,
    drivers: [[12, 156], [44, 90], [63, 88], [16, 75], [81, 58], [1, 58], [3, 43], [10, 35], [6, 26], [30, 24], [87, 18], [43, 15], [41, 11], [55, 6], [23, 5], [31, 3], [5, 2], [14, 1], [27, 0], [77, 0], [11, 0], [18, 0]],
    teams: [['Mercedes', 244], ['Ferrari', 165], ['McLaren', 116], ['Red Bull Racing', 69], ['Alpine', 50], ['Racing Bulls', 35], ['Haas F1 Team', 21], ['Williams', 11], ['Audi', 2], ['Cadillac', 1], ['Aston Martin', 0]],
  },
  {
    dateEnd: '2026-06-14T15:00:00+00:00', meetingKey: 1287, sessionKey: 11307,
    drivers: [[12, 156], [44, 115], [63, 106], [16, 75], [1, 73], [81, 68], [3, 55], [10, 41], [6, 34], [30, 28], [87, 18], [43, 16], [41, 13], [55, 6], [23, 5], [31, 3], [5, 2], [14, 1], [27, 0], [77, 0], [11, 0], [18, 0]],
    teams: [['Mercedes', 262], ['Ferrari', 190], ['McLaren', 141], ['Red Bull Racing', 89], ['Alpine', 57], ['Racing Bulls', 41], ['Haas F1 Team', 21], ['Williams', 11], ['Audi', 2], ['Aston Martin', 1], ['Cadillac', 0]],
  },
  {
    dateEnd: '2026-06-28T15:00:00+00:00', meetingKey: 1288, sessionKey: 11315,
    drivers: [[12, 171], [63, 131], [44, 125], [81, 80], [1, 79], [16, 79], [3, 73], [6, 42], [10, 41], [30, 30], [87, 18], [43, 16], [41, 14], [55, 6], [23, 5], [31, 3], [5, 2], [14, 1], [27, 0], [77, 0], [11, 0], [18, 0]],
    teams: [['Mercedes', 302], ['Ferrari', 204], ['McLaren', 159], ['Red Bull Racing', 115], ['Alpine', 57], ['Racing Bulls', 44], ['Haas F1 Team', 21], ['Williams', 11], ['Audi', 2], ['Aston Martin', 1], ['Cadillac', 0]],
  },
  {
    dateEnd: '2026-07-05T16:00:00+00:00', meetingKey: 1289, sessionKey: 11326,
    drivers: [[12, 179], [63, 154], [44, 147], [16, 108], [1, 97], [81, 82], [3, 76], [6, 52], [10, 42], [30, 39], [41, 20], [87, 18], [43, 18], [5, 6], [55, 6], [23, 5], [31, 3], [14, 1], [27, 0], [77, 0], [11, 0], [18, 0]],
    teams: [['Mercedes', 333], ['Ferrari', 255], ['McLaren', 179], ['Red Bull Racing', 128], ['Alpine', 60], ['Racing Bulls', 59], ['Haas F1 Team', 21], ['Williams', 11], ['Audi', 6], ['Aston Martin', 1], ['Cadillac', 0]],
  },
]

function expandSnapshot(seed: StandingSeed): OpenF1StandingsSnapshot {
  return {
    asOfDate: seed.dateEnd,
    championshipDrivers: seed.drivers.map(([driverNumber, points, position], index) => ({
      driver_number: driverNumber,
      points_current: points,
      points_start: points,
      position_current: position ?? index + 1,
      position_start: position ?? index + 1,
    })),
    championshipTeams: seed.teams.map(([teamName, points], index) => ({
      points_current: points,
      points_start: points,
      position_current: index + 1,
      position_start: index + 1,
      team_name: teamName,
    })),
    drivers,
    raceSession: null,
    snapshotMeetingKey: seed.meetingKey,
    snapshotSessionKey: seed.sessionKey,
    snapshotSource: 'bundled',
    sourceYear: 2026,
  }
}

export function bundledOpenF1StandingsFor(
  asOfIso?: string | null,
  nowMs = Date.now(),
): OpenF1StandingsSnapshot | null {
  const requestedCutoff = asOfIso ? new Date(asOfIso).getTime() : Number.NaN
  const cutoff = Number.isFinite(requestedCutoff)
    ? Math.min(nowMs, requestedCutoff)
    : nowMs
  const seed = snapshots.findLast(
    (candidate) => new Date(candidate.dateEnd).getTime() <= cutoff,
  )

  return seed ? expandSnapshot(seed) : null
}
