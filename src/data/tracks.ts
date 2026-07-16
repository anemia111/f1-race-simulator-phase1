import type {
  AeroActivationZone,
  OvertakeControlLine,
  TrackDefinition,
} from '../types'
import { realTrackLayouts } from './realTrackLayouts'
import { tireNominationForTrack } from './tireNominations2026'
import { calendar2026ByTrackId } from './calendar2026'
import { sourceRegistry } from './sourceRegistry'
import {
  officialTrackOperations2026,
  type OfficialTrackAnchor,
  type OfficialTrackOperations,
} from './officialTrackOperations2026'

const trackPool: Array<Omit<TrackDefinition, 'lengthKm' | 'lengthSource'>> = [
  {
    id: 'suzuka-approx',
    name: 'Suzuka Approx',
    location: 'Japan',
    kind: 'permanent',
    feature: 'Figure-eight inspired flow with fast direction changes',
    isSprintWeekend: false,
    rainProbability: 0.28,
    width: 5.2,
    baseLapTime: 91,
    sectorMarks: [0, 0.34, 0.68],
    centerline: [
      [-24, 0.2, -4],
      [-18, 0.4, 8],
      [-8, 0.7, 11],
      [2, 0.3, 5],
      [-5, 0.1, -3],
      [-15, -0.2, -7],
      [-9, 0.1, -14],
      [4, 0.5, -13],
      [17, 1.2, -8],
      [23, 1.1, 2],
      [15, 0.6, 10],
      [4, 0.3, 14],
      [-7, 0.2, 8],
      [-16, 0.1, 0],
    ],
  },
  {
    id: 'monaco-approx',
    name: 'Monte Carlo Approx',
    location: 'Monaco',
    kind: 'street',
    feature: 'Tight street layout, tunnel feel, large elevation change',
    isSprintWeekend: false,
    rainProbability: 0.18,
    width: 4.4,
    baseLapTime: 78,
    sectorMarks: [0, 0.31, 0.64],
    centerline: [
      [-18, 0, -10],
      [-9, 2.1, -14],
      [1, 4.2, -12],
      [8, 4.4, -5],
      [5, 2.2, 2],
      [15, 1.3, 5],
      [22, 0.4, 2],
      [17, -0.8, -6],
      [6, -1.2, -8],
      [2, -0.6, -1],
      [8, 0.2, 8],
      [0, 0.7, 13],
      [-13, 0.3, 9],
      [-22, -0.1, 1],
    ],
  },
  {
    id: 'spa-approx',
    name: 'Spa Approx',
    location: 'Belgium',
    kind: 'permanent',
    feature: 'Long lap with a steep climb and weather sensitivity',
    isSprintWeekend: false,
    rainProbability: 0.36,
    width: 5.8,
    baseLapTime: 108,
    sectorMarks: [0, 0.37, 0.7],
    centerline: [
      [-25, 0, -8],
      [-16, -1.2, -14],
      [-7, 1.8, -12],
      [1, 5.2, -5],
      [12, 5.8, 4],
      [24, 4.2, 7],
      [20, 3.1, 16],
      [8, 2.6, 18],
      [-5, 1.4, 13],
      [-19, 0.2, 16],
      [-26, -0.8, 7],
      [-15, -1.5, 1],
      [-4, -1.0, 4],
      [5, 0.4, -2],
      [-7, 0.2, -7],
    ],
  },
  {
    id: 'monza-approx',
    name: 'Monza Approx',
    location: 'Italy',
    kind: 'permanent',
    feature: 'High-speed straights and heavy braking chicanes',
    isSprintWeekend: false,
    rainProbability: 0.16,
    width: 5.7,
    baseLapTime: 80,
    sectorMarks: [0, 0.36, 0.69],
    centerline: [
      [-23, 0, -6],
      [-5, 0.1, -14],
      [16, 0.1, -12],
      [23, 0, -4],
      [19, -0.1, 4],
      [6, 0.1, 7],
      [18, 0.2, 13],
      [6, 0.1, 17],
      [-15, 0, 13],
      [-24, -0.1, 5],
    ],
  },
  {
    id: 'albert-park-approx',
    name: 'Albert Park Approx',
    location: 'Australia',
    kind: 'street',
    feature: 'Fast parkland street loop with flowing lake-side bends',
    isSprintWeekend: false,
    rainProbability: 0.2,
    width: 5.4,
    baseLapTime: 82,
    sectorMarks: [0, 0.35, 0.67],
    centerline: [
      [-22, 0, -8],
      [-7, 0.1, -13],
      [12, 0.1, -11],
      [24, 0, -4],
      [20, 0.1, 5],
      [8, 0.2, 8],
      [20, 0.1, 14],
      [4, 0.1, 18],
      [-14, 0.2, 14],
      [-24, 0.1, 5],
      [-18, 0, -2],
    ],
  },
  {
    id: 'silverstone-approx',
    name: 'Silverstone Approx',
    location: 'United Kingdom',
    kind: 'permanent',
    feature: 'High-speed aero circuit with sweeping corner chains',
    isSprintWeekend: true,
    rainProbability: 0.32,
    width: 5.8,
    baseLapTime: 90,
    sectorMarks: [0, 0.33, 0.66],
    centerline: [
      [-25, 0, -7],
      [-8, 0.1, -15],
      [12, 0.2, -13],
      [25, 0.1, -5],
      [20, 0.2, 7],
      [7, 0.3, 10],
      [18, 0.2, 17],
      [2, 0.1, 20],
      [-17, 0.2, 14],
      [-26, 0.1, 3],
      [-14, 0, -2],
    ],
  },
  {
    id: 'cota-approx',
    name: 'COTA Approx',
    location: 'United States',
    kind: 'permanent',
    feature: 'Big elevation turn one, esses, and long back straight',
    isSprintWeekend: false,
    rainProbability: 0.18,
    width: 5.7,
    baseLapTime: 98,
    sectorMarks: [0, 0.34, 0.69],
    centerline: [
      [-24, 0, -10],
      [-17, 3.8, -3],
      [-7, 2.5, 5],
      [2, 1.8, -2],
      [11, 1.0, 6],
      [25, 0.3, 5],
      [22, 0.1, -8],
      [5, 0.1, -15],
      [-12, 0.2, -13],
      [-22, 0.4, -5],
      [-9, 0.2, 2],
    ],
  },
  {
    id: 'interlagos-approx',
    name: 'Interlagos Approx',
    location: 'Brazil',
    kind: 'permanent',
    feature: 'Counter-clockwise bowl with elevation and a long uphill finish',
    isSprintWeekend: false,
    rainProbability: 0.38,
    width: 5.2,
    baseLapTime: 74,
    sectorMarks: [0, 0.32, 0.63],
    centerline: [
      [-20, 1.4, -5],
      [-9, 0.2, -13],
      [8, -0.6, -12],
      [20, -0.8, -3],
      [16, -1.0, 8],
      [3, -0.9, 12],
      [-7, -0.4, 7],
      [-17, 0.3, 12],
      [-24, 1.1, 5],
      [-13, 1.8, 0],
    ],
  },
  {
    id: 'singapore-approx',
    name: 'Singapore Approx',
    location: 'Singapore',
    kind: 'street',
    feature: 'Night street rhythm with repeated braking and short straights',
    isSprintWeekend: true,
    rainProbability: 0.44,
    width: 4.8,
    baseLapTime: 100,
    sectorMarks: [0, 0.35, 0.7],
    centerline: [
      [-23, 0, -10],
      [-5, 0, -13],
      [17, 0, -9],
      [23, 0, -1],
      [12, 0, 4],
      [23, 0, 11],
      [8, 0, 16],
      [-8, 0, 12],
      [-2, 0, 4],
      [-17, 0, 7],
      [-25, 0, 0],
    ],
  },
  {
    id: 'baku-approx',
    name: 'Baku Approx',
    location: 'Azerbaijan',
    kind: 'street',
    feature: 'Huge main straight with a tight old-city sector',
    isSprintWeekend: false,
    rainProbability: 0.12,
    width: 4.9,
    baseLapTime: 104,
    sectorMarks: [0, 0.38, 0.72],
    centerline: [
      [-26, 0, -8],
      [-3, 0, -14],
      [25, 0, -13],
      [24, 0.1, -3],
      [10, 0.2, 0],
      [3, 0.5, 7],
      [9, 0.8, 13],
      [-3, 0.8, 16],
      [-12, 0.4, 8],
      [-24, 0.1, 6],
      [-15, 0, -1],
    ],
  },
  {
    id: 'zandvoort-approx',
    name: 'Zandvoort Approx',
    location: 'Netherlands',
    kind: 'permanent',
    feature: 'Compact dune circuit with banked corners and rolling elevation',
    isSprintWeekend: true,
    rainProbability: 0.34,
    width: 5.0,
    baseLapTime: 72,
    sectorMarks: [0, 0.33, 0.66],
    centerline: [
      [-18, 0.4, -8],
      [-5, 1.1, -14],
      [12, 0.9, -10],
      [21, 0.2, -1],
      [16, -0.2, 9],
      [3, 0.2, 14],
      [-9, 1.2, 10],
      [-22, 1.4, 3],
      [-20, 0.8, -3],
    ],
  },
  {
    id: 'yas-marina-approx',
    name: 'Yas Marina Approx',
    location: 'Abu Dhabi',
    kind: 'permanent',
    feature: 'Twilight venue with long straights and technical final sector',
    isSprintWeekend: false,
    rainProbability: 0.04,
    width: 5.5,
    baseLapTime: 88,
    sectorMarks: [0, 0.36, 0.69],
    centerline: [
      [-22, 0, -8],
      [-6, 0, -13],
      [17, 0, -12],
      [25, 0, -3],
      [16, 0, 2],
      [24, 0, 10],
      [7, 0, 16],
      [-8, 0, 11],
      [-1, 0, 4],
      [-17, 0, 5],
      [-25, 0, -2],
    ],
  },
  {
    id: 'shanghai-approx',
    name: 'Shanghai Approx',
    location: 'China',
    kind: 'permanent',
    feature: 'Snail-shaped opening complex and long acceleration zones',
    isSprintWeekend: true,
    rainProbability: 0.22,
    width: 5.6,
    baseLapTime: 94,
    sectorMarks: [0, 0.35, 0.68],
    centerline: [
      [-22, 0, -9],
      [-10, 0.1, -14],
      [2, 0.2, -10],
      [5, 0.2, -1],
      [-2, 0.2, 4],
      [-12, 0.1, 2],
      [-7, 0, 11],
      [12, 0, 14],
      [25, 0, 8],
      [21, 0, -2],
      [4, 0, -7],
      [-13, 0, -4],
    ],
  },
  {
    id: 'miami-approx',
    name: 'Miami Approx',
    location: 'United States',
    kind: 'hybrid',
    feature: 'Stadium campus layout with a long straight and tight final sector',
    isSprintWeekend: true,
    rainProbability: 0.3,
    width: 5.2,
    baseLapTime: 91,
    sectorMarks: [0, 0.34, 0.7],
    centerline: [
      [-23, 0, -8],
      [-8, 0, -13],
      [11, 0, -12],
      [24, 0, -5],
      [19, 0.1, 5],
      [5, 0.1, 9],
      [13, 0, 15],
      [-5, 0, 17],
      [-17, 0, 9],
      [-9, 0, 2],
      [-24, 0, 0],
    ],
  },
  {
    id: 'montreal-approx',
    name: 'Montreal Approx',
    location: 'Canada',
    kind: 'hybrid',
    feature: 'Stop-start island circuit with chicanes and wall-lined exits',
    isSprintWeekend: true,
    rainProbability: 0.3,
    width: 5.1,
    baseLapTime: 76,
    sectorMarks: [0, 0.33, 0.67],
    centerline: [
      [-24, 0, -7],
      [-8, 0, -12],
      [9, 0, -10],
      [22, 0, -3],
      [14, 0, 4],
      [23, 0, 12],
      [6, 0, 15],
      [-11, 0, 10],
      [-22, 0, 3],
      [-15, 0, -3],
    ],
  },
  {
    id: 'barcelona-approx',
    name: 'Barcelona Approx',
    location: 'Spain',
    kind: 'permanent',
    feature: 'Balanced technical benchmark with long loaded corners',
    isSprintWeekend: false,
    rainProbability: 0.14,
    width: 5.5,
    baseLapTime: 86,
    sectorMarks: [0, 0.33, 0.66],
    centerline: [
      [-24, 0, -8],
      [-6, 0.1, -14],
      [15, 0.2, -11],
      [25, 0.1, -2],
      [17, 0.3, 8],
      [3, 0.4, 12],
      [12, 0.2, 17],
      [-8, 0.1, 16],
      [-22, 0, 6],
      [-15, 0, -1],
    ],
  },
  {
    id: 'red-bull-ring-approx',
    name: 'Red Bull Ring Approx',
    location: 'Austria',
    kind: 'permanent',
    feature: 'Short alpine lap with steep climbs and heavy braking zones',
    isSprintWeekend: false,
    rainProbability: 0.27,
    width: 5.4,
    baseLapTime: 68,
    sectorMarks: [0, 0.32, 0.66],
    centerline: [
      [-22, 0, -6],
      [-8, 2.2, -13],
      [13, 3.0, -10],
      [24, 2.4, 0],
      [15, 1.0, 8],
      [4, 0.2, 13],
      [-12, -0.2, 10],
      [-24, 0.1, 3],
      [-15, 0.4, -2],
    ],
  },
  {
    id: 'hungaroring-approx',
    name: 'Hungaroring Approx',
    location: 'Hungary',
    kind: 'permanent',
    feature: 'Twisty technical lap with few long straights',
    isSprintWeekend: false,
    rainProbability: 0.2,
    width: 5.0,
    baseLapTime: 82,
    sectorMarks: [0, 0.34, 0.67],
    centerline: [
      [-22, 0.2, -7],
      [-10, 0.5, -13],
      [5, 0.8, -11],
      [18, 0.7, -3],
      [10, 0.4, 5],
      [21, 0.3, 11],
      [5, 0.2, 16],
      [-7, 0.4, 9],
      [-18, 0.3, 13],
      [-25, 0.1, 4],
      [-14, 0.1, -1],
    ],
  },
  {
    id: 'madrid-approx',
    name: 'MADRING',
    location: 'Spain',
    kind: 'hybrid',
    feature: 'Hybrid Madrid layout with the 24% banked La Monumental and an 837 m straight',
    isSprintWeekend: false,
    rainProbability: 0.12,
    width: 5.0,
    baseLapTime: 94.4,
    sectorMarks: [0, 0.34, 0.69],
    centerline: [
      [-24, 0, -9],
      [-5, 0.1, -14],
      [15, 0.2, -11],
      [25, 0.2, -1],
      [18, 0.1, 7],
      [4, 0.1, 6],
      [14, 0, 15],
      [-4, 0, 17],
      [-20, 0, 9],
      [-10, 0, 2],
      [-25, 0, -1],
    ],
  },
  {
    id: 'mexico-city-approx',
    name: 'Mexico City Approx',
    location: 'Mexico',
    kind: 'permanent',
    feature: 'High-altitude circuit with stadium section and long main straight',
    isSprintWeekend: false,
    rainProbability: 0.18,
    width: 5.5,
    baseLapTime: 78,
    sectorMarks: [0, 0.34, 0.68],
    centerline: [
      [-25, 0, -8],
      [-5, 0, -13],
      [20, 0, -12],
      [25, 0, -3],
      [11, 0, 2],
      [18, 0, 9],
      [5, 0, 14],
      [-8, 0, 10],
      [-2, 0, 4],
      [-18, 0, 5],
      [-24, 0, -2],
    ],
  },
  {
    id: 'las-vegas-approx',
    name: 'Las Vegas Approx',
    location: 'United States',
    kind: 'street',
    feature: 'Night street layout with a very long flat-out strip',
    isSprintWeekend: false,
    rainProbability: 0.06,
    width: 5.3,
    baseLapTime: 96,
    sectorMarks: [0, 0.38, 0.73],
    centerline: [
      [-26, 0, -8],
      [-2, 0, -13],
      [26, 0, -12],
      [25, 0, -3],
      [6, 0, 0],
      [24, 0, 8],
      [5, 0, 15],
      [-16, 0, 12],
      [-24, 0, 4],
      [-12, 0, -2],
    ],
  },
  {
    id: 'lusail-approx',
    name: 'Lusail Approx',
    location: 'Qatar',
    kind: 'permanent',
    feature: 'Night desert circuit with medium-speed sweepers',
    isSprintWeekend: false,
    rainProbability: 0.05,
    width: 5.6,
    baseLapTime: 89,
    sectorMarks: [0, 0.33, 0.67],
    centerline: [
      [-22, 0, -8],
      [-8, 0.1, -14],
      [10, 0.1, -12],
      [22, 0, -5],
      [17, 0, 6],
      [7, 0, 12],
      [17, 0, 17],
      [0, 0, 18],
      [-15, 0.1, 12],
      [-24, 0, 3],
      [-12, 0, -2],
    ],
  },
  {
    id: 'bahrain-approx',
    name: 'Bahrain International Approx',
    location: 'Bahrain',
    kind: 'permanent',
    feature: 'Desert circuit with traction zones and wide runoff',
    isSprintWeekend: false,
    rainProbability: 0.03,
    width: 5.7,
    baseLapTime: 92,
    sectorMarks: [0, 0.34, 0.68],
    centerline: [
      [-24, 0, -8],
      [-8, 0.4, -15],
      [10, 0.6, -12],
      [23, 0.2, -3],
      [13, -0.1, 5],
      [22, 0.2, 12],
      [5, 0.6, 16],
      [-12, 0.4, 9],
      [-6, 0.2, 2],
      [-22, 0.1, 3],
      [-15, 0, -3],
    ],
  },
  {
    id: 'jeddah-approx',
    name: 'Jeddah Corniche Approx',
    location: 'Saudi Arabia',
    kind: 'street',
    feature: 'Ultra-fast night street course with sweeping walls',
    isSprintWeekend: false,
    rainProbability: 0.02,
    width: 5.0,
    baseLapTime: 91,
    sectorMarks: [0, 0.36, 0.72],
    centerline: [
      [-26, 0, -9],
      [-6, 0, -15],
      [16, 0, -13],
      [26, 0, -5],
      [18, 0, 2],
      [25, 0, 9],
      [10, 0, 16],
      [-8, 0, 14],
      [-21, 0, 6],
      [-14, 0, 0],
      [-24, 0, -3],
    ],
  },
]

const calendarTrackIds = [
  'albert-park-approx',
  'shanghai-approx',
  'suzuka-approx',
  'bahrain-approx',
  'jeddah-approx',
  'miami-approx',
  'montreal-approx',
  'monaco-approx',
  'barcelona-approx',
  'red-bull-ring-approx',
  'silverstone-approx',
  'spa-approx',
  'hungaroring-approx',
  'zandvoort-approx',
  'monza-approx',
  'madrid-approx',
  'baku-approx',
  'singapore-approx',
  'cota-approx',
  'mexico-city-approx',
  'interlagos-approx',
  'las-vegas-approx',
  'lusail-approx',
  'yas-marina-approx',
] as const

// Official GP lap counts for the 2026 calendar configurations.
const officialRaceLaps: Partial<Record<(typeof calendarTrackIds)[number], number>> = {
  'albert-park-approx': 58,
  'baku-approx': 51,
  'bahrain-approx': 57,
  'barcelona-approx': 66,
  'cota-approx': 56,
  'hungaroring-approx': 70,
  'interlagos-approx': 71,
  'jeddah-approx': 50,
  'las-vegas-approx': 50,
  'lusail-approx': 57,
  'mexico-city-approx': 71,
  'miami-approx': 57,
  'monaco-approx': 78,
  'monza-approx': 53,
  'montreal-approx': 70,
  'red-bull-ring-approx': 71,
  'shanghai-approx': 56,
  'silverstone-approx': 52,
  'singapore-approx': 62,
  'spa-approx': 44,
  'suzuka-approx': 53,
  'yas-marina-approx': 58,
  'zandvoort-approx': 72,
  'madrid-approx': 57,
}

// Current official racing-layout lengths in kilometres. Layout-coordinate
// provenance is tracked separately from distance provenance.
const circuitLengthKm: Record<(typeof calendarTrackIds)[number], number> = {
  'albert-park-approx': 5.278,
  'bahrain-approx': 5.412,
  'baku-approx': 6.003,
  'barcelona-approx': 4.657,
  'cota-approx': 5.513,
  'hungaroring-approx': 4.381,
  'interlagos-approx': 4.309,
  'jeddah-approx': 6.174,
  'las-vegas-approx': 6.201,
  'lusail-approx': 5.419,
  'madrid-approx': 5.416,
  'mexico-city-approx': 4.304,
  'miami-approx': 5.412,
  'monaco-approx': 3.337,
  'montreal-approx': 4.361,
  'monza-approx': 5.793,
  'red-bull-ring-approx': 4.326,
  'shanghai-approx': 5.451,
  'silverstone-approx': 5.891,
  'singapore-approx': 4.94,
  'spa-approx': 7.004,
  'suzuka-approx': 5.807,
  'yas-marina-approx': 5.281,
  'zandvoort-approx': 4.259,
}

const tracksById = new Map(trackPool.map((track) => [track.id, track]))

const displayTrackName = (name: string) =>
  name
    .replace(/\sApprox$/, '')
    .replace('Bahrain International', 'Bahrain International Circuit')
    .replace('Jeddah Corniche', 'Jeddah Corniche Circuit')
    .replace('Yas Marina', 'Yas Marina Circuit')

const fallbackTrackWidth = (track: Pick<TrackDefinition, 'id' | 'kind'>) => {
  if (track.id === 'monaco-approx') {
    return 2.2
  }

  if (track.kind === 'street') {
    return 2.45
  }

  if (track.kind === 'hybrid') {
    return 2.65
  }

  return 2.85
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const wrapProgress = (value: number) => ((value % 1) + 1) % 1

const pointDistance = (
  a: TrackDefinition['centerline'][number],
  b: TrackDefinition['centerline'][number],
) => Math.hypot(b[0] - a[0], b[2] - a[2])

const straightnessAt = (centerline: TrackDefinition['centerline'], index: number) => {
  const length = centerline.length
  const pointAt = (offset: number) => centerline[(index + offset + length) % length]
  const previous = pointAt(-2)
  const center = pointAt(0)
  const next = pointAt(2)
  const inVector = { x: center[0] - previous[0], z: center[2] - previous[2] }
  const outVector = { x: next[0] - center[0], z: next[2] - center[2] }
  const inLength = Math.hypot(inVector.x, inVector.z) || 1
  const outLength = Math.hypot(outVector.x, outVector.z) || 1
  const dot =
    (inVector.x * outVector.x + inVector.z * outVector.z) / (inLength * outLength)
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)))

  return clamp01(1 - angle / 1.15)
}

const runDistance = (
  centerline: TrackDefinition['centerline'],
  startIndex: number,
  endIndex: number,
) => {
  let distance = 0

  for (let index = startIndex; index < endIndex; index += 1) {
    distance += pointDistance(centerline[index], centerline[(index + 1) % centerline.length])
  }

  return distance
}

const deriveAeroActivationZones = (
  centerline: TrackDefinition['centerline'],
  kind: TrackDefinition['kind'],
): AeroActivationZone[] => {
  const threshold = kind === 'street' ? 0.82 : 0.78
  const minimumSpan = kind === 'street' ? 0.035 : 0.045
  const targetCount = kind === 'street' ? 2 : 3
  const runs: Array<{ startIndex: number; endIndex: number; distance: number }> = []
  let startIndex: number | null = null

  for (let index = 0; index < centerline.length; index += 1) {
    const isStraight = straightnessAt(centerline, index) >= threshold

    if (isStraight && startIndex === null) {
      startIndex = index
    }

    if ((!isStraight || index === centerline.length - 1) && startIndex !== null) {
      const endIndex = isStraight ? index + 1 : index
      const span = (endIndex - startIndex) / centerline.length

      if (span >= minimumSpan) {
        runs.push({
          startIndex,
          endIndex,
          distance: runDistance(centerline, startIndex, endIndex),
        })
      }

      startIndex = null
    }
  }

  const selectedRuns = runs
    .sort((a, b) => b.distance - a.distance)
    .slice(0, targetCount)
    .sort((a, b) => a.startIndex - b.startIndex)

  const usableRuns =
    selectedRuns.length > 0
      ? selectedRuns
      : centerline
          .slice(0, -1)
          .map((_, startIndex) => ({
            startIndex,
            endIndex: startIndex + 1,
            distance: pointDistance(
              centerline[startIndex],
              centerline[startIndex + 1],
            ),
          }))
          .sort((a, b) => b.distance - a.distance)
          .slice(0, targetCount)
          .sort((a, b) => a.startIndex - b.startIndex)

  return usableRuns
    .map((run, index) => ({
      end: Number(clamp01(run.endIndex / centerline.length).toFixed(3)),
      label: `SM A${index + 1}`,
      lowGripMode: 'partial' as const,
      source: 'derived' as const,
      start: Number(clamp01(run.startIndex / centerline.length).toFixed(3)),
    }))
}

const progressWithin = (progress: number, start: number, end: number) =>
  start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end

const forwardProgress = (from: number, to: number) =>
  wrapProgress(to - from)

const anchorProgress = (
  centerline: TrackDefinition['centerline'],
  corners: NonNullable<TrackDefinition['corners']>,
  lengthKm: number,
  anchor: OfficialTrackAnchor,
) => {
  const corner = corners.find(({ number }) => number === anchor.turn)

  if (!corner) {
    return null
  }

  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  centerline.forEach((point, index) => {
    const distance = pointDistance(point, corner.position)

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })

  const referenceOffsetMeters =
    anchor.reference === 'entry' ? -15 : anchor.reference === 'exit' ? 15 : 0

  return wrapProgress(
    nearestIndex / centerline.length +
      (referenceOffsetMeters + anchor.offsetMeters) / (lengthKm * 1000),
  )
}

const officialZoneEnd = (
  start: number,
  derivedZones: AeroActivationZone[],
) => {
  const containing = derivedZones.find((zone) =>
    progressWithin(start, zone.start, zone.end),
  )

  if (containing && forwardProgress(start, containing.end) >= 0.012) {
    return containing.end
  }

  const next = derivedZones
    .map((zone) => ({ distance: forwardProgress(start, zone.start), zone }))
    .filter(({ distance }) => distance <= 0.16)
    .sort((left, right) => left.distance - right.distance)[0]?.zone

  return next?.end ?? Number(wrapProgress(start + 0.08).toFixed(3))
}

const officialAeroActivationZones = (
  centerline: TrackDefinition['centerline'],
  corners: TrackDefinition['corners'],
  operations: OfficialTrackOperations,
  derivedZones: AeroActivationZone[],
): AeroActivationZone[] | null => {
  if (!corners) {
    return null
  }

  const zones = operations.straightMode.flatMap((zone, index) => {
    const start = anchorProgress(
      centerline,
      corners,
      operations.centerlineLengthKm,
      zone.normal,
    )

    if (start === null) {
      return []
    }

    const lowGripStart = zone.lowGrip
      ? anchorProgress(
          centerline,
          corners,
          operations.centerlineLengthKm,
          zone.lowGrip,
        )
      : null

    return [
      {
        end: officialZoneEnd(start, derivedZones),
        label: `SM A${index + 1}`,
        ...(lowGripStart === null ? {} : { lowGripStart }),
        lowGripMode: lowGripStart === null ? ('disabled' as const) : ('partial' as const),
        source: 'official' as const,
        start: Number(start.toFixed(6)),
      },
    ]
  })

  return zones.length === operations.straightMode.length ? zones : null
}

const officialOvertakeControlLines = (
  centerline: TrackDefinition['centerline'],
  corners: TrackDefinition['corners'],
  operations: OfficialTrackOperations,
): OvertakeControlLine[] | null => {
  if (!corners || !operations.overtake) {
    return operations.overtake ? null : []
  }

  const activationProgress = anchorProgress(
    centerline,
    corners,
    operations.centerlineLengthKm,
    operations.overtake.activation,
  )
  const detectionProgress = anchorProgress(
    centerline,
    corners,
    operations.centerlineLengthKm,
    operations.overtake.detection,
  )

  if (activationProgress === null || detectionProgress === null) {
    return null
  }

  return [
    {
      activationProgress: Number(activationProgress.toFixed(6)),
      detectionGapSeconds: 1,
      detectionProgress: Number(detectionProgress.toFixed(6)),
      source: 'official',
    },
  ]
}

const officialSectorMarks = (operations: OfficialTrackOperations) => [
  0,
  Number(
    (operations.sectorLengthsKm[0] / operations.centerlineLengthKm).toFixed(6),
  ),
  Number(
    (
      (operations.sectorLengthsKm[0] + operations.sectorLengthsKm[1]) /
      operations.centerlineLengthKm
    ).toFixed(6),
  ),
]

const derivePitLane = (track: Pick<TrackDefinition, 'id'>) => ({
  boxCount: 12,
  boxSpacingProgress: 0.0017,
  boxStartProgress: 0.976,
  entryProgress: 0.94,
  exitProgress: 0.055,
  // FIA B1.6.3 defaults to 80 km/h. Monaco's 2026 event notes set 60 km/h.
  speedLimitKph: track.id === 'monaco-approx' ? 60 : 80,
  geometrySource: 'derived' as const,
  speedLimitSource: 'official' as const,
  sourceUrl:
    track.id === 'monaco-approx'
      ? 'https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_infringement_-_car_44_-_pit_lane_speeding.pdf'
      : sourceRegistry.fiaSporting2026.url,
})

const deriveOvertakeControlLines = (
  zones: AeroActivationZone[],
): OvertakeControlLine[] =>
  zones.map((zone) => ({
    activationProgress: zone.start,
    detectionGapSeconds: 1,
    detectionProgress: Number(((zone.start - 0.028 + 1) % 1).toFixed(3)),
    source: 'derived',
  }))

const deriveSafetyCarLines = (track: { pitLane?: TrackDefinition['pitLane'] }) => ({
  // The first line sits just after pit exit; the second is before pit entry.
  // They are stored per circuit so later real FIA line data can replace them
  // without changing race logic.
  line1Progress: Number((track.pitLane?.exitProgress ?? 0.13).toFixed(3)),
  line2Progress: Number((track.pitLane?.entryProgress ?? 0.965).toFixed(3)),
})

export const tracks: TrackDefinition[] = calendarTrackIds.map((id) => {
  const track = tracksById.get(id)

  if (!track) {
    throw new Error(`Missing calendar track: ${id}`)
  }

  const realLayout = realTrackLayouts[id]
  const centerline = realLayout?.centerline ?? track.centerline

  const pitLane = derivePitLane(track)
  const derivedAeroActivationZones = deriveAeroActivationZones(
    centerline,
    track.kind,
  )
  const officialOperations = officialTrackOperations2026[id]
  const officialAeroZones = officialOperations
    ? officialAeroActivationZones(
        centerline,
        realLayout?.corners,
        officialOperations,
        derivedAeroActivationZones,
      )
    : null
  const aeroActivationZones = officialAeroZones ?? derivedAeroActivationZones
  const officialOvertakeLines = officialOperations
    ? officialOvertakeControlLines(
        centerline,
        realLayout?.corners,
        officialOperations,
      )
    : null

  return {
    ...track,
    activeAeroUnavailable: officialOperations?.straightMode.length === 0,
    calendar2026: calendar2026ByTrackId[id],
    centerline,
    corners: realLayout?.corners,
    aeroActivationZones,
    layoutSource: realLayout
      ? {
          detail: 'real',
          label: `${realLayout.source.circuitName} ${realLayout.source.year}`,
          provider: realLayout.source.kind,
          url: realLayout.source.url,
          year: realLayout.source.year,
        }
      : {
          detail: 'fallback',
          provider: 'fallback',
          label: 'Fallback layout: verified geometry unavailable',
          url: null,
          year: null,
        },
    locationProjection: realLayout?.projection,
    lengthKm: officialOperations?.centerlineLengthKm ?? circuitLengthKm[id],
    lengthSource: 'official',
    baseLapTimeSource: 'estimated',
    marshalPosts: realLayout?.marshalPosts,
    name: displayTrackName(track.name),
    pitLane,
    overtakeControlLines:
      officialOvertakeLines ?? deriveOvertakeControlLines(aeroActivationZones),
    raceLaps: officialRaceLaps[id],
    raceLapsSource: officialRaceLaps[id] === undefined ? 'estimated' : 'official',
    safetyCarLines: deriveSafetyCarLines({ ...track, pitLane }),
    sectorMarks: officialOperations
      ? officialSectorMarks(officialOperations)
      : realLayout?.sectorMarks ?? track.sectorMarks,
    sectorMarksSource: officialOperations
      ? 'official'
      : realLayout?.sectorMarksSource ?? 'fallback',
    tireNomination: tireNominationForTrack(track),
    width: realLayout?.width ?? fallbackTrackWidth(track),
  }
})

export const defaultTrack = tracks[0]
