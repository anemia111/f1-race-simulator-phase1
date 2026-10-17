import type { TireNomination, TrackDefinition } from '../types'

const firstRoundsUrl =
  'https://press.pirelli.com/complete-f1-tyre-range-for-the-first-three-grands-prix-of-2026/'
const miamiMontrealUrl =
  'https://press.pirelli.com/the-softest-trio-for-the-challenges-of-miami-and-montreal/'
const monacoBarcelonaUrl =
  'https://press.pirelli.com/the-tyre-compound-selections-for-monte-carlo-and-barcelona/'
const austriaSilverstoneUrl =
  'https://press.pirelli.com/it/tutta-la-gamma-pirelli-per-spielberg-e-silverstone/'
const spaHungaryUrl =
  'https://press.pirelli.com/the-compounds-selected-for-belgium-and-hungary/'

const official: Record<string, TireNomination> = {
  'albert-park-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: firstRoundsUrl },
  'shanghai-approx': { H: 'C2', M: 'C3', S: 'C4', source: 'pirelli', sourceUrl: firstRoundsUrl },
  'suzuka-approx': { H: 'C1', M: 'C2', S: 'C3', source: 'pirelli', sourceUrl: firstRoundsUrl },
  'miami-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: miamiMontrealUrl },
  'montreal-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: miamiMontrealUrl },
  'monaco-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: monacoBarcelonaUrl },
  'barcelona-approx': { H: 'C2', M: 'C3', S: 'C4', source: 'pirelli', sourceUrl: monacoBarcelonaUrl },
  'red-bull-ring-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: austriaSilverstoneUrl },
  'silverstone-approx': { H: 'C1', M: 'C2', S: 'C3', source: 'pirelli', sourceUrl: austriaSilverstoneUrl },
  'spa-approx': { H: 'C2', M: 'C3', S: 'C4', source: 'pirelli', sourceUrl: spaHungaryUrl },
  'hungaroring-approx': { H: 'C3', M: 'C4', S: 'C5', source: 'pirelli', sourceUrl: spaHungaryUrl },
}

const hardTracks = new Set([
  'bahrain-approx',
  'lusail-approx',
])
const softTracks = new Set([
  'baku-approx',
  'jeddah-approx',
  'las-vegas-approx',
  'madrid-approx',
  'mexico-city-approx',
  'monza-approx',
  'singapore-approx',
  'yas-marina-approx',
])

export function tireNominationForTrack(
  track: Pick<TrackDefinition, 'id'>,
): TireNomination {
  const factual = official[track.id]

  if (factual) {
    return factual
  }

  if (hardTracks.has(track.id)) {
    return { H: 'C1', M: 'C2', S: 'C3', source: 'estimated', sourceUrl: null }
  }

  if (softTracks.has(track.id)) {
    return { H: 'C3', M: 'C4', S: 'C5', source: 'estimated', sourceUrl: null }
  }

  return { H: 'C2', M: 'C3', S: 'C4', source: 'estimated', sourceUrl: null }
}
