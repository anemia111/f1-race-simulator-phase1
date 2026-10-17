import type { TrackDefinition } from '../types'

export const calendar2026SourceUrl =
  'https://www.fia.com/news/2026-fia-sporting-calendars-approved-world-motor-sport-council'

type CalendarEntry = NonNullable<TrackDefinition['calendar2026']>

const entry = (
  calendarSlot: number,
  championshipRound: number | null,
  dateStart: string,
  dateEnd: string,
  status: CalendarEntry['status'] = 'scheduled',
): CalendarEntry => ({
  calendarSlot,
  championshipRound,
  dateStart: `${dateStart}T00:00:00Z`,
  dateEnd: `${dateEnd}T23:59:59Z`,
  status,
  sourceUrl: calendar2026SourceUrl,
})

export const calendar2026ByTrackId: Record<string, CalendarEntry> = {
  'albert-park-approx': entry(1, 1, '2026-03-06', '2026-03-08'),
  'shanghai-approx': entry(2, 2, '2026-03-13', '2026-03-15'),
  'suzuka-approx': entry(3, 3, '2026-03-27', '2026-03-29'),
  'bahrain-approx': entry(4, null, '2026-04-10', '2026-04-12', 'cancelled'),
  'jeddah-approx': entry(5, null, '2026-04-17', '2026-04-19', 'cancelled'),
  'miami-approx': entry(6, 4, '2026-05-01', '2026-05-03'),
  'montreal-approx': entry(7, 5, '2026-05-22', '2026-05-24'),
  'monaco-approx': entry(8, 6, '2026-06-05', '2026-06-07'),
  'barcelona-approx': entry(9, 7, '2026-06-12', '2026-06-14'),
  'red-bull-ring-approx': entry(10, 8, '2026-06-26', '2026-06-28'),
  'silverstone-approx': entry(11, 9, '2026-07-03', '2026-07-05'),
  'spa-approx': entry(12, 10, '2026-07-17', '2026-07-19'),
  'hungaroring-approx': entry(13, 11, '2026-07-24', '2026-07-26'),
  'zandvoort-approx': entry(14, 12, '2026-08-21', '2026-08-23'),
  'monza-approx': entry(15, 13, '2026-09-04', '2026-09-06'),
  'madrid-approx': entry(16, 14, '2026-09-11', '2026-09-13'),
  'baku-approx': entry(17, 15, '2026-09-24', '2026-09-26'),
  'singapore-approx': entry(18, 16, '2026-10-09', '2026-10-11'),
  'cota-approx': entry(19, 17, '2026-10-23', '2026-10-25'),
  'mexico-city-approx': entry(20, 18, '2026-10-30', '2026-11-01'),
  'interlagos-approx': entry(21, 19, '2026-11-06', '2026-11-08'),
  'las-vegas-approx': entry(22, 20, '2026-11-19', '2026-11-21'),
  'lusail-approx': entry(23, 21, '2026-11-27', '2026-11-29'),
  'yas-marina-approx': entry(24, 22, '2026-12-04', '2026-12-06'),
}

