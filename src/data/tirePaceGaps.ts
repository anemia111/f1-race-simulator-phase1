import type { TirePaceGaps } from '../types'

// User-authored isolated fresh-tyre pace targets. Not observed race gaps or
// manufacturer measurements. Imola is selectable through the WEC course pool;
// Barcelona and Madrid remain distinct courses.
export const tirePaceGapsByTrack: Readonly<Record<string, TirePaceGaps>> = {
  'albert-park-approx': { hardToMedium: 0.4, mediumToSoft: 0.5, source: 'user' },
  'shanghai-approx': { hardToMedium: 0.3, mediumToSoft: 0.3, source: 'user' },
  'suzuka-approx': { hardToMedium: 0.55, mediumToSoft: 0.55, source: 'user' },
  'bahrain-approx': { hardToMedium: 0.65, mediumToSoft: 0.65, source: 'user' },
  'jeddah-approx': { hardToMedium: 0.45, mediumToSoft: 0.45, source: 'user' },
  'miami-approx': { hardToMedium: 0.35, mediumToSoft: 0.55, source: 'user' },
  'imola-approx': { hardToMedium: 0.3, mediumToSoft: 0.125, source: 'user' },
  'monaco-approx': { hardToMedium: 0.3, mediumToSoft: 0.125, source: 'user' },
  'barcelona-approx': { hardToMedium: 0.95, mediumToSoft: 0.65, source: 'user' },
  'montreal-approx': { hardToMedium: 0.35, mediumToSoft: 0.125, source: 'user' },
  'red-bull-ring-approx': { hardToMedium: 0.2, mediumToSoft: 0.5, source: 'user' },
  'silverstone-approx': { hardToMedium: 0.45, mediumToSoft: 0.55, source: 'user' },
  'spa-approx': { hardToMedium: 0.95, mediumToSoft: 0.4, source: 'user' },
  'hungaroring-approx': { hardToMedium: 0.3, mediumToSoft: 0.45, source: 'user' },
  'zandvoort-approx': { hardToMedium: 0.4, mediumToSoft: 0.65, source: 'user' },
  'monza-approx': { hardToMedium: 0.2, mediumToSoft: 0.45, source: 'user' },
  'baku-approx': { hardToMedium: 0.45, mediumToSoft: 0.1, source: 'user' },
  'singapore-approx': { hardToMedium: 0.3, mediumToSoft: 0.65, source: 'user' },
  'cota-approx': { hardToMedium: 0.8, mediumToSoft: 0.55, source: 'user' },
  'mexico-city-approx': { hardToMedium: 1.05, mediumToSoft: 0.55, source: 'user' },
  'interlagos-approx': { hardToMedium: 0.45, mediumToSoft: 0.25, source: 'user' },
  'las-vegas-approx': { hardToMedium: 0.25, mediumToSoft: 0.45, source: 'user' },
  'lusail-approx': { hardToMedium: 0.45, mediumToSoft: 0.65, source: 'user' },
  'yas-marina-approx': { hardToMedium: 0.2, mediumToSoft: 0.75, source: 'user' },
}
