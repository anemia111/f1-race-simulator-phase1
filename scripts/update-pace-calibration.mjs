import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import {
  classifyObservedLaps,
  observedMedian,
  observedPercentile,
} from '../src/services/observedLapClassification.ts'

const OPENF1_BASE_URL = 'https://api.openf1.org/v1'
const REQUEST_GAP_MS = 750
const REQUEST_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 4
const SCHEMA_VERSION = 1
const CALIBRATION_VERSION = '2026.07.26.1'
const ROOT = resolve(import.meta.dirname, '..')
const OUTPUT_DIRECTORY = resolve(ROOT, 'src', 'data', 'calibration')
const F1_OUTPUT = resolve(OUTPUT_DIRECTORY, 'f1PaceCalibration2026.json')
const SF_OUTPUT = resolve(
  OUTPUT_DIRECTORY,
  'superFormulaPaceCalibration2026.json',
)
const MANIFEST_OUTPUT = resolve(
  OUTPUT_DIRECTORY,
  'paceCalibrationManifest.json',
)
const CACHE_DIRECTORY = resolve(tmpdir(), 'f1-race-simulator-pace-cache')
const OFFLINE = process.argv.includes('--offline')
const now = new Date()
const retrievedAt = now.toISOString()
let lastRequestAt = 0

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const round = (value, digits = 3) =>
  value === null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(digits))

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value))

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function dedupeSources(sources) {
  const sourcesByIdentity = new Map()

  for (const source of sources) {
    const identity = [
      source.provider,
      source.label,
      source.url,
      source.sessionKey ?? '',
    ].join('\u0000')
    const existing = sourcesByIdentity.get(identity)

    if (
      !existing ||
      Date.parse(source.retrievedAt) >= Date.parse(existing.retrievedAt)
    ) {
      sourcesByIdentity.set(identity, source)
    }
  }

  return [...sourcesByIdentity.values()]
}

const F1_RESULTS_URL = 'https://www.formula1.com/en/results/2026/races'
const FIA_EVENT_DOCUMENTS_URL =
  'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072'
const SUPER_FORMULA_RESULTS_URL =
  'https://superformula.net/sf3/race_taxonomy/2026/'
const HISTORICAL_F1_YEARS = [2024, 2025]

const f1TrackForecastMetadata = {
  'albert-park-approx': {
    circuitShortName: 'Melbourne',
    profile: 'balanced',
  },
  'shanghai-approx': {
    circuitShortName: 'Shanghai',
    profile: 'power',
  },
  'suzuka-approx': {
    circuitShortName: 'Suzuka',
    profile: 'high-speed',
  },
  'miami-approx': {
    circuitShortName: 'Miami',
    profile: 'street',
  },
  'montreal-approx': {
    circuitShortName: 'Montreal',
    profile: 'power',
  },
  'monaco-approx': {
    circuitShortName: 'Monte Carlo',
    profile: 'street',
  },
  'barcelona-approx': {
    circuitShortName: 'Catalunya',
    profile: 'balanced',
  },
  'red-bull-ring-approx': {
    circuitShortName: 'Spielberg',
    profile: 'power',
  },
  'silverstone-approx': {
    circuitShortName: 'Silverstone',
    profile: 'high-speed',
  },
  'spa-approx': {
    circuitShortName: 'Spa-Francorchamps',
    profile: 'high-speed',
  },
  'hungaroring-approx': {
    circuitShortName: 'Hungaroring',
    profile: 'balanced',
  },
  'zandvoort-approx': {
    circuitShortName: 'Zandvoort',
    profile: 'balanced',
  },
  'monza-approx': {
    circuitShortName: 'Monza',
    profile: 'high-speed',
  },
  'baku-approx': {
    circuitShortName: 'Baku',
    profile: 'street',
  },
  'singapore-approx': {
    circuitShortName: 'Singapore',
    profile: 'street',
  },
  'cota-approx': {
    circuitShortName: 'Austin',
    profile: 'balanced',
  },
  'mexico-city-approx': {
    circuitShortName: 'Mexico City',
    profile: 'power',
  },
  'interlagos-approx': {
    circuitShortName: 'Interlagos',
    profile: 'balanced',
  },
  'las-vegas-approx': {
    circuitShortName: 'Las Vegas',
    profile: 'street',
  },
  'lusail-approx': {
    circuitShortName: 'Lusail',
    profile: 'high-speed',
  },
  'yas-marina-approx': {
    circuitShortName: 'Yas Marina Circuit',
    profile: 'balanced',
  },
}

const f1Events = [
  {
    eventId: 'australian-grand-prix-2026',
    eventName: 'Australian Grand Prix',
    trackId: 'albert-park-approx',
    round: 1,
    eventDate: '2026-03-08',
    qualifyingSessionKey: 11230,
    raceSessionKey: 11234,
    neutralBaseLapSeconds: 82.13,
    estimatedPoleSeconds: 78.518,
    estimatedGreenSeconds: 84.2,
    estimatedWinnerAverageSeconds: 85.979,
  },
  {
    eventId: 'chinese-grand-prix-2026',
    eventName: 'Chinese Grand Prix',
    trackId: 'shanghai-approx',
    round: 2,
    eventDate: '2026-03-15',
    qualifyingSessionKey: 11241,
    raceSessionKey: 11245,
    neutralBaseLapSeconds: 94,
    estimatedPoleSeconds: 90,
    estimatedGreenSeconds: 96.4,
    estimatedWinnerAverageSeconds: 99.922,
  },
  {
    eventId: 'japanese-grand-prix-2026',
    eventName: 'Japanese Grand Prix',
    trackId: 'suzuka-approx',
    round: 3,
    eventDate: '2026-03-29',
    qualifyingSessionKey: 11249,
    raceSessionKey: 11253,
    neutralBaseLapSeconds: 92.862,
    estimatedPoleSeconds: 88.778,
    estimatedGreenSeconds: 95.2,
    estimatedWinnerAverageSeconds: 99.687,
  },
  {
    eventId: 'miami-grand-prix-2026',
    eventName: 'Miami Grand Prix',
    trackId: 'miami-approx',
    round: 4,
    eventDate: '2026-05-03',
    qualifyingSessionKey: 11276,
    raceSessionKey: 11280,
    neutralBaseLapSeconds: 91.837,
    estimatedPoleSeconds: 87.798,
    estimatedGreenSeconds: 94.4,
    estimatedWinnerAverageSeconds: 98.233,
  },
  {
    eventId: 'canadian-grand-prix-2026',
    eventName: 'Canadian Grand Prix',
    trackId: 'montreal-approx',
    round: 5,
    eventDate: '2026-05-24',
    qualifyingSessionKey: 11287,
    raceSessionKey: 11291,
    neutralBaseLapSeconds: 73.743,
    estimatedPoleSeconds: 70.5,
    estimatedGreenSeconds: 75.9,
    estimatedWinnerAverageSeconds: 77.879,
  },
  {
    eventId: 'monaco-grand-prix-2026',
    eventName: 'Monaco Grand Prix',
    trackId: 'monaco-approx',
    round: 6,
    eventDate: '2026-06-07',
    qualifyingSessionKey: 11295,
    raceSessionKey: 11299,
    neutralBaseLapSeconds: 72.697,
    estimatedPoleSeconds: 69.5,
    estimatedGreenSeconds: 76.3,
    estimatedWinnerAverageSeconds: 110.401,
  },
  {
    eventId: 'spanish-grand-prix-2026',
    eventName: 'Spanish Grand Prix',
    trackId: 'barcelona-approx',
    round: 7,
    eventDate: '2026-06-14',
    qualifyingSessionKey: 11303,
    raceSessionKey: 11307,
    neutralBaseLapSeconds: 74.789,
    estimatedPoleSeconds: 71.5,
    estimatedGreenSeconds: 78,
    estimatedWinnerAverageSeconds: 84.062,
  },
  {
    eventId: 'austrian-grand-prix-2026',
    eventName: 'Austrian Grand Prix',
    trackId: 'red-bull-ring-approx',
    round: 8,
    eventDate: '2026-06-28',
    qualifyingSessionKey: 11311,
    raceSessionKey: 11315,
    neutralBaseLapSeconds: 66.421,
    estimatedPoleSeconds: 63.5,
    estimatedGreenSeconds: 69.1,
    estimatedWinnerAverageSeconds: 73.211,
  },
  {
    eventId: 'british-grand-prix-2026',
    eventName: 'British Grand Prix',
    trackId: 'silverstone-approx',
    round: 9,
    eventDate: '2026-07-05',
    qualifyingSessionKey: 11322,
    raceSessionKey: 11326,
    neutralBaseLapSeconds: 87.341,
    estimatedPoleSeconds: 83.5,
    estimatedGreenSeconds: 90.2,
    estimatedWinnerAverageSeconds: 100.603,
  },
  {
    eventId: 'belgian-grand-prix-2026',
    eventName: 'Belgian Grand Prix',
    trackId: 'spa-approx',
    round: 10,
    eventDate: '2026-07-19',
    qualifyingSessionKey: 11330,
    raceSessionKey: 11334,
    neutralBaseLapSeconds: 105.123,
    estimatedPoleSeconds: 100.5,
    estimatedGreenSeconds: 108.5,
    estimatedWinnerAverageSeconds: 115.511,
  },
  {
    eventId: 'hungarian-grand-prix-2026',
    eventName: 'Hungarian Grand Prix',
    trackId: 'hungaroring-approx',
    round: 11,
    eventDate: '2026-07-26',
    qualifyingSessionKey: 11338,
    raceSessionKey: 11342,
    neutralBaseLapSeconds: 77.404,
    estimatedPoleSeconds: 77.207,
    estimatedGreenSeconds: 83.5,
    estimatedWinnerAverageSeconds: 84.5,
  },
  {
    eventId: 'dutch-grand-prix-2026',
    eventName: 'Dutch Grand Prix',
    trackId: 'zandvoort-approx',
    round: 12,
    eventDate: '2026-08-23',
    neutralBaseLapSeconds: 72,
    estimatedPoleSeconds: 69,
    estimatedGreenSeconds: 75.8,
    estimatedWinnerAverageSeconds: 79,
  },
  {
    eventId: 'italian-grand-prix-2026',
    eventName: 'Italian Grand Prix',
    trackId: 'monza-approx',
    round: 13,
    eventDate: '2026-09-06',
    neutralBaseLapSeconds: 81.588,
    estimatedPoleSeconds: 78,
    estimatedGreenSeconds: 84,
    estimatedWinnerAverageSeconds: 87,
  },
  {
    eventId: 'spanish-grand-prix-madring-2026',
    eventName: 'Spanish Grand Prix at MADRING',
    trackId: 'madrid-approx',
    round: 14,
    eventDate: '2026-09-13',
    neutralBaseLapSeconds: 96.232,
    estimatedPoleSeconds: 92,
    estimatedGreenSeconds: 99.5,
    estimatedWinnerAverageSeconds: 103.5,
    qualifyingRangeSeconds: [90, 94],
    raceRangeSeconds: [96.5, 102.5],
  },
  {
    eventId: 'azerbaijan-grand-prix-2026',
    eventName: 'Azerbaijan Grand Prix',
    trackId: 'baku-approx',
    round: 15,
    eventDate: '2026-09-27',
    neutralBaseLapSeconds: 104.6,
    estimatedPoleSeconds: 100,
    estimatedGreenSeconds: 107.5,
    estimatedWinnerAverageSeconds: 112,
  },
  {
    eventId: 'singapore-grand-prix-2026',
    eventName: 'Singapore Grand Prix',
    trackId: 'singapore-approx',
    round: 16,
    eventDate: '2026-10-11',
    neutralBaseLapSeconds: 92.571,
    estimatedPoleSeconds: 88.5,
    estimatedGreenSeconds: 96.5,
    estimatedWinnerAverageSeconds: 103,
  },
  {
    eventId: 'united-states-grand-prix-2026',
    eventName: 'United States Grand Prix',
    trackId: 'cota-approx',
    round: 17,
    eventDate: '2026-10-25',
    neutralBaseLapSeconds: 96.232,
    estimatedPoleSeconds: 92,
    estimatedGreenSeconds: 99,
    estimatedWinnerAverageSeconds: 103,
  },
  {
    eventId: 'mexico-city-grand-prix-2026',
    eventName: 'Mexico City Grand Prix',
    trackId: 'mexico-city-approx',
    round: 18,
    eventDate: '2026-11-01',
    neutralBaseLapSeconds: 78.973,
    estimatedPoleSeconds: 75.5,
    estimatedGreenSeconds: 82,
    estimatedWinnerAverageSeconds: 85.5,
  },
  {
    eventId: 'sao-paulo-grand-prix-2026',
    eventName: 'Sao Paulo Grand Prix',
    trackId: 'interlagos-approx',
    round: 19,
    eventDate: '2026-11-08',
    neutralBaseLapSeconds: 71.651,
    estimatedPoleSeconds: 68.5,
    estimatedGreenSeconds: 75,
    estimatedWinnerAverageSeconds: 78,
  },
  {
    eventId: 'las-vegas-grand-prix-2026',
    eventName: 'Las Vegas Grand Prix',
    trackId: 'las-vegas-approx',
    round: 20,
    eventDate: '2026-11-21',
    neutralBaseLapSeconds: 96,
    estimatedPoleSeconds: 91.5,
    estimatedGreenSeconds: 98,
    estimatedWinnerAverageSeconds: 101.5,
  },
  {
    eventId: 'qatar-grand-prix-2026',
    eventName: 'Qatar Grand Prix',
    trackId: 'lusail-approx',
    round: 21,
    eventDate: '2026-11-29',
    neutralBaseLapSeconds: 83.157,
    estimatedPoleSeconds: 79.5,
    estimatedGreenSeconds: 86,
    estimatedWinnerAverageSeconds: 89.5,
  },
  {
    eventId: 'abu-dhabi-grand-prix-2026',
    eventName: 'Abu Dhabi Grand Prix',
    trackId: 'yas-marina-approx',
    round: 22,
    eventDate: '2026-12-06',
    neutralBaseLapSeconds: 85.249,
    estimatedPoleSeconds: 81.5,
    estimatedGreenSeconds: 88.5,
    estimatedWinnerAverageSeconds: 91.5,
  },
]

async function fetchJson(endpoint, parameters) {
  const query = new URLSearchParams(
    Object.entries(parameters).map(([key, value]) => [key, String(value)]),
  )
  const url = `${OPENF1_BASE_URL}/${endpoint}?${query}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const waitFor = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt))

    if (waitFor > 0) {
      await sleep(waitFor)
    }

    lastRequestAt = Date.now()

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'f1-race-simulator-calibration/1.0',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (response.status === 404) {
        return []
      }

      if (response.status === 429) {
        const retryAfterSeconds = Number.parseFloat(
          response.headers.get('retry-after') ?? '',
        )
        const retryAfterMs = Number.isFinite(retryAfterSeconds)
          ? Math.max(2_000, retryAfterSeconds * 1_000)
          : 15_000 * attempt
        await sleep(retryAfterMs)
        continue
      }

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }

      const payload = await response.json()
      return Array.isArray(payload) ? payload : []
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`OpenF1 ${endpoint} failed: ${error.message}`)
      }

      await sleep(500 * 2 ** (attempt - 1))
    }
  }

  return []
}

async function sessionBundle(sessionKey, endpoints) {
  const bundle = {}

  for (const endpoint of endpoints) {
    const cachePath = resolve(
      CACHE_DIRECTORY,
      `${sessionKey}-${endpoint}.json`,
    )

    try {
      bundle[endpoint] = JSON.parse(await readFile(cachePath, 'utf8'))
    } catch {
      bundle[endpoint] = await fetchJson(endpoint, {
        session_key: sessionKey,
      })
      await mkdir(CACHE_DIRECTORY, { recursive: true })
      await writeFile(
        cachePath,
        JSON.stringify(bundle[endpoint]),
        'utf8',
      )
    }
  }

  return bundle
}

async function sessionsForYear(year) {
  const cachePath = resolve(
    CACHE_DIRECTORY,
    `sessions-${year}.json`,
  )

  try {
    return JSON.parse(await readFile(cachePath, 'utf8'))
  } catch {
    const sessions = await fetchJson('sessions', { year })
    await mkdir(CACHE_DIRECTORY, { recursive: true })
    await writeFile(cachePath, JSON.stringify(sessions), 'utf8')
    return sessions
  }
}

async function optionalSessionBundle(sessionKey, endpoints, label) {
  try {
    return await sessionBundle(sessionKey, endpoints)
  } catch (error) {
    process.stderr.write(
      `Pace update warning: ${label} was not refreshed (${error.message}).\n`,
    )
    return null
  }
}

function sessionSource(sessionKey, label, payload) {
  return {
    provider: 'OpenF1',
    label,
    url: `${OPENF1_BASE_URL}/session_result?session_key=${sessionKey}`,
    retrievedAt,
    documentHash: `sha256:${hash(payload)}`,
    sessionKey,
  }
}

function officialF1Source(label) {
  return {
    provider: 'Formula 1',
    label,
    url: F1_RESULTS_URL,
    retrievedAt,
  }
}

function lastDuration(result) {
  if (Array.isArray(result.duration)) {
    return [...result.duration]
      .reverse()
      .find((value) => Number.isFinite(value)) ?? null
  }

  return Number.isFinite(result.duration) ? result.duration : null
}

function phaseDuration(result, phaseIndex) {
  if (!Array.isArray(result.duration)) {
    return null
  }

  const value = result.duration[phaseIndex]
  return Number.isFinite(value) ? value : null
}

function pairwiseSlope(samples, maximumRun) {
  if (samples.length < 4) {
    return null
  }

  const slopes = []

  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const run = samples[right].x - samples[left].x

      if (run > 0 && run <= maximumRun) {
        slopes.push((samples[right].y - samples[left].y) / run)
      }
    }
  }

  return observedMedian(slopes)
}

function qualifyingMetrics(bundle, event) {
  const result = bundle.session_result
    .filter((entry) => !entry.dsq && !entry.dns)
    .sort((left, right) => left.position - right.position)
  const classified = classifyObservedLaps(
    {
      laps: bundle.laps,
      pit: bundle.pit,
      stints: [],
      raceControl: bundle.race_control,
      weather: bundle.weather,
      intervals: [],
    },
    'qualifying',
  )
  const pushLaps = classified.filter(
    (lap) => lap.classification === 'qualifying-push',
  )
  const q3Times = result
    .map((entry) => phaseDuration(entry, 2))
    .filter((value) => value !== null)
    .sort((left, right) => left - right)
  const q1Times = result
    .map((entry) => phaseDuration(entry, 0))
    .filter((value) => value !== null)
    .sort((left, right) => left - right)
  const bestByDriver = new Map()

  for (const lap of pushLaps) {
    const duration = lap.lap.lap_duration

    if (duration === null) {
      continue
    }

    bestByDriver.set(
      lap.lap.driver_number,
      Math.min(bestByDriver.get(lap.lap.driver_number) ?? Infinity, duration),
    )
  }

  const theoreticalByDriver = new Map()

  for (const lap of pushLaps) {
    const sectors = [
      lap.lap.duration_sector_1,
      lap.lap.duration_sector_2,
      lap.lap.duration_sector_3,
    ]

    if (sectors.some((sector) => sector === null)) {
      continue
    }

    const current = theoreticalByDriver.get(lap.lap.driver_number) ?? [
      Infinity,
      Infinity,
      Infinity,
    ]
    theoreticalByDriver.set(
      lap.lap.driver_number,
      current.map((value, index) => Math.min(value, sectors[index])),
    )
  }

  const theoreticalBest = Math.min(
    ...[...theoreticalByDriver.values()]
      .map((sectors) => sectors.reduce((total, sector) => total + sector, 0))
      .filter(Number.isFinite),
  )
  const poleSeconds =
    phaseDuration(result.find((entry) => entry.position === 1) ?? {}, 2) ??
    q3Times[0] ??
    lastDuration(result[0] ?? {}) ??
    null
  const top3Median = observedMedian(q3Times.slice(0, 3))
  const top5Median = observedMedian(q3Times.slice(0, 5))
  const selectedReferenceSeconds =
    top3Median ?? poleSeconds ?? event.estimatedPoleSeconds
  const q1Leader = q1Times[0] ?? poleSeconds
  const q1Deltas =
    q1Leader === null ? [] : q1Times.map((time) => time - q1Leader)
  const consideredLaps = classified.filter(
    (lap) =>
      lap.classification !== 'out-lap' &&
      lap.classification !== 'pit-lap',
  )
  const invalidCount = consideredLaps.filter(
    (lap) =>
      lap.classification === 'invalid' ||
      lap.classification === 'unknown',
  ).length

  return {
    poleSeconds: round(poleSeconds),
    top3MedianSeconds: round(top3Median),
    top5MedianSeconds: round(top5Median),
    theoreticalBestSeconds: Number.isFinite(theoreticalBest)
      ? round(theoreticalBest)
      : null,
    selectedReferenceSeconds: round(selectedReferenceSeconds),
    selectedMethod:
      top3Median === null
        ? 'Official pole fallback; fewer than three valid Q3 result times'
        : 'Median of the fastest three official Q3 result times',
    fieldP10DeltaSeconds: round(observedPercentile(q1Deltas, 0.1)),
    fieldMedianDeltaSeconds: round(observedMedian(q1Deltas)),
    fieldP90DeltaSeconds: round(observedPercentile(q1Deltas, 0.9)),
    validLapCount: pushLaps.length,
    deletedOrInvalidRate:
      consideredLaps.length === 0
        ? null
        : round(invalidCount / consideredLaps.length, 4),
    status: poleSeconds === null ? 'estimated' : 'official',
    confidence: round(
      clamp(
        0.7 +
          Math.min(0.18, q3Times.length * 0.025) +
          Math.min(0.08, pushLaps.length / 600),
        0,
        0.98,
      ),
      2,
    ),
  }
}

function groupedDriverMedians(laps) {
  const byDriver = new Map()

  for (const item of laps) {
    const duration = item.lap.lap_duration

    if (duration === null) {
      continue
    }

    byDriver.set(item.lap.driver_number, [
      ...(byDriver.get(item.lap.driver_number) ?? []),
      duration,
    ])
  }

  return new Map(
    [...byDriver].map(([driverNumber, values]) => [
      driverNumber,
      observedMedian(values),
    ]),
  )
}

function raceMetrics(bundle, qualifyingReference) {
  const classified = classifyObservedLaps(
    {
      laps: bundle.laps,
      pit: bundle.pit,
      stints: bundle.stints,
      raceControl: bundle.race_control,
      weather: bundle.weather,
      intervals: bundle.intervals,
    },
    'race',
  )
  const clearLaps = classified.filter(
    (lap) => lap.classification === 'race-clear',
  )
  const trafficLaps = classified.filter(
    (lap) => lap.classification === 'race-traffic',
  )
  const clearDurations = clearLaps
    .map((lap) => lap.lap.lap_duration)
    .filter((duration) => duration !== null)
  const result = bundle.session_result
    .filter((entry) => !entry.dsq && !entry.dns)
    .sort((left, right) => left.position - right.position)
  const top10Drivers = new Set(
    result.slice(0, 10).map((entry) => entry.driver_number),
  )
  const driverMedians = groupedDriverMedians(clearLaps)
  const cleanReference = observedMedian(
    [...driverMedians]
      .filter(([driverNumber]) => top10Drivers.has(driverNumber))
      .map(([, value]) => value)
      .filter((value) => value !== null),
  )
  const maximumLap = Math.max(
    1,
    ...bundle.laps.map((lap) => lap.lap_number),
  )
  const phaseMedian = (minimum, maximum) =>
    observedMedian(
      clearLaps
        .filter(
          (lap) =>
            lap.lap.lap_number / maximumLap >= minimum &&
            lap.lap.lap_number / maximumLap < maximum,
        )
        .map((lap) => lap.lap.lap_duration)
        .filter((duration) => duration !== null),
    )
  const compoundGroups = new Map()
  const stintGroups = new Map()

  for (const lap of clearLaps) {
    if (lap.lap.lap_duration === null) {
      continue
    }

    if (lap.compound) {
      compoundGroups.set(lap.compound, [
        ...(compoundGroups.get(lap.compound) ?? []),
        lap.lap.lap_duration,
      ])
    }

    if (lap.stintNumber !== null) {
      const key = `${lap.compound ?? 'unknown'}:${lap.stintNumber}`
      const current = stintGroups.get(key) ?? {
        compound: lap.compound,
        samples: [],
        stintNumber: lap.stintNumber,
      }
      current.samples.push(lap.lap.lap_duration)
      stintGroups.set(key, current)
    }
  }

  const compoundMedianSeconds = Object.fromEntries(
    [...compoundGroups].map(([compound, values]) => [
      compound,
      round(observedMedian(values)),
    ]),
  )
  const freshTireSamples = new Map()

  for (const lap of clearLaps) {
    if (
      lap.tireAgeLaps === null ||
      lap.tireAgeLaps > 6 ||
      lap.lap.lap_duration === null
    ) {
      continue
    }

    const key = `${lap.lap.driver_number}:${lap.compound ?? 'unknown'}:${lap.tireAgeLaps}`
    freshTireSamples.set(key, [
      ...(freshTireSamples.get(key) ?? []),
      {
        x: lap.lap.lap_number,
        y: lap.lap.lap_duration,
      },
    ])
  }

  const fuelSlopes = [...freshTireSamples.values()]
    .map((samples) => pairwiseSlope(samples, 45))
    .filter((slope) => slope !== null)
  const rawFuelSlope = observedMedian(fuelSlopes)
  const fuelGain =
    rawFuelSlope === null ? null : clamp(-rawFuelSlope, 0, 0.12)
  const tireSlopes = []

  for (const group of stintGroups.values()) {
    const matching = clearLaps
      .filter(
        (lap) =>
          lap.compound === group.compound &&
          lap.stintNumber === group.stintNumber &&
          lap.tireAgeLaps !== null &&
          lap.lap.lap_duration !== null,
      )
      .map((lap) => ({
        x: lap.tireAgeLaps,
        y:
          lap.lap.lap_duration +
          (fuelGain ?? 0) * lap.lap.lap_number,
      }))
    const slope = pairwiseSlope(matching, 10)

    if (slope !== null && slope >= -0.05 && slope <= 0.5) {
      tireSlopes.push(Math.max(0, slope))
    }
  }

  const clearMedianByDriver = groupedDriverMedians(clearLaps)
  const residualFor = (lap) => {
    const duration = lap.lap.lap_duration
    const baseline = clearMedianByDriver.get(lap.lap.driver_number)
    return duration === null || baseline === null || baseline === undefined
      ? null
      : duration - baseline
  }
  const trafficResiduals = trafficLaps
    .map(residualFor)
    .filter((value) => value !== null)
  const clearResiduals = clearLaps
    .map(residualFor)
    .filter((value) => value !== null)
  const pitLaneLoss = observedMedian(
    bundle.pit
      .map((pit) => pit.lane_duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0),
  )
  const classLoss = (classification) =>
    observedMedian(
      classified
        .filter((lap) => lap.classification === classification)
        .map(residualFor)
        .filter((value) => value !== null && value > -2),
    )
  const winner = result.find((entry) => entry.position === 1)
  const winnerDuration =
    winner && Number.isFinite(winner.duration) ? winner.duration : null
  const winnerAverage =
    winnerDuration !== null && winner.number_of_laps > 0
      ? winnerDuration / winner.number_of_laps
      : null
  const medianClear = observedMedian(clearDurations)
  const residualCenter = observedMedian(clearResiduals)
  const residualSigma =
    residualCenter === null
      ? 0.8
      : (observedMedian(
          clearResiduals.map((value) => Math.abs(value - residualCenter)),
        ) ?? 0.54) * 1.4826

  return {
    race: {
      cleanLapReferenceSeconds: round(cleanReference),
      earlyStintMedianSeconds: round(phaseMedian(0, 1 / 3)),
      middleStintMedianSeconds: round(phaseMedian(1 / 3, 2 / 3)),
      lateStintMedianSeconds: round(phaseMedian(2 / 3, 1.01)),
      greenLapP10Seconds: round(observedPercentile(clearDurations, 0.1)),
      greenLapMedianSeconds: round(medianClear),
      greenLapP90Seconds: round(observedPercentile(clearDurations, 0.9)),
      winnerAverageSeconds: round(winnerAverage),
      pitLaneLossSeconds: round(pitLaneLoss),
      inLapLossSeconds: round(classLoss('pit-lap')),
      outLapLossSeconds: round(classLoss('out-lap')),
      clearAirTrafficDeltaSeconds: round(
        (observedMedian(trafficResiduals) ?? 0) -
          (observedMedian(clearResiduals) ?? 0),
      ),
      cleanLapCount: clearLaps.length,
      totalLapCount: classified.length,
      compoundMedianSeconds,
      stintMedianSeconds: [...stintGroups.values()]
        .map((group) => ({
          compound: group.compound,
          medianSeconds: round(observedMedian(group.samples)),
          sampleCount: group.samples.length,
          stintNumber: group.stintNumber,
        }))
        .filter((group) => group.medianSeconds !== null),
      fuelGainPerLapSeconds: round(fuelGain, 4),
      tireDegradationPerLapSeconds: round(
        observedMedian(tireSlopes),
        4,
      ),
      status: clearLaps.length >= 30 ? 'observed' : 'unverified',
      confidence: round(
        clamp(
          0.25 +
            Math.min(0.45, clearLaps.length / 500) +
            Math.min(0.18, driverMedians.size / 80),
          0,
          0.9,
        ),
        2,
      ),
    },
    expectedGreenRaceDeltaSeconds:
      cleanReference === null
        ? 0
        : round(cleanReference - qualifyingReference),
    residualSigmaSeconds: round(clamp(residualSigma, 0.25, 4)),
  }
}

function estimatedRace(event) {
  return {
    cleanLapReferenceSeconds: event.estimatedGreenSeconds,
    earlyStintMedianSeconds: null,
    middleStintMedianSeconds: null,
    lateStintMedianSeconds: null,
    greenLapP10Seconds: null,
    greenLapMedianSeconds: event.estimatedGreenSeconds,
    greenLapP90Seconds: null,
    winnerAverageSeconds: event.estimatedWinnerAverageSeconds,
    ...(event.raceRangeSeconds
      ? { referenceRangeSeconds: event.raceRangeSeconds }
      : {}),
    pitLaneLossSeconds: null,
    inLapLossSeconds: null,
    outLapLossSeconds: null,
    clearAirTrafficDeltaSeconds: null,
    cleanLapCount: 0,
    totalLapCount: 0,
    compoundMedianSeconds: {},
    stintMedianSeconds: [],
    fuelGainPerLapSeconds: null,
    tireDegradationPerLapSeconds: null,
    status: 'estimated',
    confidence: event.trackId === 'madrid-approx' ? 0.18 : 0.35,
  }
}

function estimatedQualifying(event) {
  return {
    poleSeconds: null,
    top3MedianSeconds: null,
    top5MedianSeconds: null,
    theoreticalBestSeconds: null,
    selectedReferenceSeconds: event.estimatedPoleSeconds,
    selectedMethod:
      'Pre-event estimate from recent same-circuit performance and track profile',
    fieldP10DeltaSeconds: null,
    fieldMedianDeltaSeconds: null,
    fieldP90DeltaSeconds: null,
    ...(event.qualifyingRangeSeconds
      ? { referenceRangeSeconds: event.qualifyingRangeSeconds }
      : {}),
    validLapCount: 0,
    deletedOrInvalidRate: null,
    status: 'estimated',
    confidence: event.trackId === 'madrid-approx' ? 0.16 : 0.38,
  }
}

function withPreservedSimulation(generated, previous) {
  const generatedWithLiveTimingScale =
    previous?.simulation.liveTimingPaceScale === undefined
      ? generated
      : {
          ...generated,
          simulation: {
            ...generated.simulation,
            liveTimingPaceScale:
              previous.simulation.liveTimingPaceScale,
          },
        }
  const qualifyingUnchanged =
    previous &&
    Math.abs(
      previous.qualifying.selectedReferenceSeconds -
        generated.qualifying.selectedReferenceSeconds,
    ) < 0.001
  const raceUnchanged =
    previous &&
    previous.race.cleanLapReferenceSeconds ===
      generated.race.cleanLapReferenceSeconds

  if (!qualifyingUnchanged || !raceUnchanged) {
    return generatedWithLiveTimingScale
  }

  return {
    ...generatedWithLiveTimingScale,
    simulation: {
      ...generatedWithLiveTimingScale.simulation,
      ...previous.simulation,
    },
  }
}

async function buildF1Calibration(event, previous) {
  let qualifying =
    previous?.qualifying.status !== 'estimated'
      ? previous.qualifying
      : estimatedQualifying(event)
  let race =
    previous?.race.status === 'observed'
      ? previous.race
      : estimatedRace(event)
  let expectedGreenRaceDeltaSeconds =
    previous?.simulation.expectedGreenRaceDeltaSeconds ??
    event.estimatedGreenSeconds - event.estimatedPoleSeconds
  let residualSigmaSeconds =
    previous?.simulation.residualSigmaSeconds ?? 0.9
  const sources = [
    officialF1Source(`${event.eventName} official championship results index`),
    {
      provider: 'FIA',
      label: `${event.eventName} official event documents index`,
      url: FIA_EVENT_DOCUMENTS_URL,
      retrievedAt,
    },
    ...(previous?.sources ?? []).filter(
      (source) =>
        source.provider === 'OpenF1' &&
        !String(source.label).includes('historical forecast input'),
    ),
  ]
  const notes = []

  if (!OFFLINE && event.qualifyingSessionKey) {
    const qualifyingBundle = await optionalSessionBundle(
      event.qualifyingSessionKey,
      [
        'session_result',
        'laps',
        'pit',
        'race_control',
        'weather',
      ],
      `${event.eventName} qualifying`,
    )

    if (qualifyingBundle?.session_result.length > 0) {
      qualifying = qualifyingMetrics(qualifyingBundle, event)
      sources.push(
        sessionSource(
          event.qualifyingSessionKey,
          `${event.eventName} qualifying timing`,
          qualifyingBundle,
        ),
      )
    }
  }

  if (!OFFLINE && event.raceSessionKey) {
    const raceBundle = await optionalSessionBundle(
      event.raceSessionKey,
      [
        'session_result',
        'laps',
        'pit',
        'stints',
        'race_control',
        'weather',
        'intervals',
      ],
      `${event.eventName} race`,
    )

    if (
      raceBundle?.session_result.length > 0 &&
      raceBundle.laps.length > 0
    ) {
      const observed = raceMetrics(
        raceBundle,
        qualifying.selectedReferenceSeconds,
      )
      race = observed.race
      expectedGreenRaceDeltaSeconds =
        observed.expectedGreenRaceDeltaSeconds
      residualSigmaSeconds = observed.residualSigmaSeconds
      sources.push(
        sessionSource(
          event.raceSessionKey,
          `${event.eventName} race timing and control`,
          raceBundle,
        ),
      )
    }
  }

  if (qualifying.status === 'estimated') {
    notes.push('Qualifying has not been observed; the displayed value is an estimate.')
  }

  if (race.status === 'estimated') {
    notes.push('Race has not been observed; clean pace and event average are estimates.')
  }

  if (event.trackId === 'madrid-approx') {
    notes.push(
      'New MADRING circuit: no completed F1 timing exists, so the estimate retains a wide range and low confidence.',
    )
  }

  if (event.trackId === 'monaco-approx') {
    notes.push(
      'Winner average is retained only for full-event validation; it is not the normal green-lap target.',
    )
  }

  return withPreservedSimulation({
    schemaVersion: SCHEMA_VERSION,
    calibrationVersion: CALIBRATION_VERSION,
    series: 'f1-custom',
    season: 2026,
    eventId: event.eventId,
    eventName: event.eventName,
    trackId: event.trackId,
    round: event.round,
    eventDate: event.eventDate,
    qualifying,
    race,
    simulation: {
      neutralBaseLapSeconds: event.neutralBaseLapSeconds,
      qualifyingOffsetSeconds: round(
        event.neutralBaseLapSeconds -
          qualifying.selectedReferenceSeconds,
      ),
      expectedGreenRaceDeltaSeconds: round(
        expectedGreenRaceDeltaSeconds,
      ),
      raceModelCorrectionSeconds: 0,
      residualSigmaSeconds,
      calibrationSeedCount: 0,
    },
    sources,
    notes,
  }, previous)
}

function matchingSession(sessions, event, sessionName) {
  const metadata = f1TrackForecastMetadata[event.trackId]

  if (!metadata) {
    return null
  }

  return (
    sessions.find(
      (session) =>
        session.circuit_short_name === metadata.circuitShortName &&
        session.session_name === sessionName,
    ) ?? null
  )
}

async function historicalF1Sample(event, year, sessions) {
  const qualifyingSession = matchingSession(
    sessions,
    event,
    'Qualifying',
  )
  const raceSession = matchingSession(sessions, event, 'Race')

  if (!qualifyingSession) {
    return null
  }

  const qualifyingBundle = await optionalSessionBundle(
    qualifyingSession.session_key,
    ['session_result', 'weather'],
    `${year} ${event.eventName} qualifying history`,
  )

  if (!qualifyingBundle?.session_result.length) {
    return null
  }

  const wetQualifying = qualifyingBundle.weather.some(
    (sample) =>
      Number.isFinite(sample.rainfall) && sample.rainfall > 0.02,
  )
  const qualifying = wetQualifying
    ? null
    : qualifyingMetrics(
        {
          ...qualifyingBundle,
          laps: [],
          pit: [],
          race_control: [],
        },
        event,
      )
  let race = null
  const sources = qualifying
    ? [
        sessionSource(
          qualifyingSession.session_key,
          `${year} ${event.eventName} qualifying historical forecast input`,
          qualifyingBundle,
        ),
      ]
    : []

  if (year === 2025 && raceSession) {
    const raceBundle = await optionalSessionBundle(
      raceSession.session_key,
      [
        'session_result',
        'laps',
        'pit',
        'stints',
        'race_control',
        'weather',
        'intervals',
      ],
      `${year} ${event.eventName} race history`,
    )

    if (raceBundle?.session_result.length && raceBundle.laps.length) {
      race = raceMetrics(
        raceBundle,
        qualifying?.selectedReferenceSeconds ??
          event.estimatedPoleSeconds,
      ).race
      sources.push(
        sessionSource(
          raceSession.session_key,
          `${year} ${event.eventName} race historical forecast input`,
          raceBundle,
        ),
      )
    }
  }

  return { qualifying, race, sources, year }
}

async function historicalF1Samples() {
  const samples = new Map()

  for (const year of HISTORICAL_F1_YEARS) {
    let sessions

    try {
      sessions = await sessionsForYear(year)
    } catch (error) {
      process.stderr.write(
        `Pace update warning: ${year} session index unavailable (${error.message}).\n`,
      )
      continue
    }

    for (const event of f1Events) {
      if (!f1TrackForecastMetadata[event.trackId]) {
        continue
      }

      process.stdout.write(
        `Reading ${year} forecast input: ${event.eventName}...\n`,
      )
      const sample = await historicalF1Sample(event, year, sessions)

      if (sample) {
        const eventSamples = samples.get(event.trackId) ?? new Map()
        eventSamples.set(year, sample)
        samples.set(event.trackId, eventSamples)
      }
    }
  }

  return samples
}

function ratioSummary(values) {
  const ratio = observedMedian(values)

  if (ratio === null) {
    return { count: 0, mad: 0.02, ratio: 1 }
  }

  const mad =
    observedMedian(values.map((value) => Math.abs(value - ratio))) ?? 0.02

  return {
    count: values.length,
    mad: clamp(mad, 0.003, 0.08),
    ratio: clamp(ratio, 0.78, 1.22),
  }
}

function evolutionFor(
  calibrations,
  historical,
  currentValue,
  historicalValue,
) {
  const samples = calibrations.flatMap((record) => {
    const previous = historical.get(record.trackId)?.get(2025)
    const current = currentValue(record)
    const old = previous ? historicalValue(previous) : null

    return current !== null &&
      old !== null &&
      Number.isFinite(current) &&
      Number.isFinite(old) &&
      old > 0
      ? [
          {
            profile:
              f1TrackForecastMetadata[record.trackId]?.profile ??
              'balanced',
            ratio: current / old,
          },
        ]
      : []
  })
  const global = ratioSummary(samples.map((sample) => sample.ratio))
  const byProfile = new Map()

  for (const profile of new Set(samples.map((sample) => sample.profile))) {
    const profileSummary = ratioSummary(
      samples
        .filter((sample) => sample.profile === profile)
        .map((sample) => sample.ratio),
    )
    byProfile.set(
      profile,
      profileSummary.count >= 2 ? profileSummary : global,
    )
  }

  return { byProfile, global }
}

function forecastRange(
  predicted,
  summary,
  recent,
  older,
  minimumWidth,
) {
  const historicalChange =
    recent !== null && older !== null && older > 0
      ? Math.abs(recent / older - 1)
      : 0
  const ratioUncertainty = Math.max(
    summary.mad * 1.75,
    historicalChange * 0.35,
    minimumWidth / predicted,
  )
  const width = Math.max(minimumWidth, predicted * ratioUncertainty)

  return [round(predicted - width), round(predicted + width)]
}

function resetSimulationCalibration(record, qualifying, race) {
  const simulation = {
    ...record.simulation,
    calibrationSeedCount: 0,
    expectedGreenRaceDeltaSeconds: round(
      (race.cleanLapReferenceSeconds ??
        qualifying.selectedReferenceSeconds +
          record.simulation.expectedGreenRaceDeltaSeconds) -
        qualifying.selectedReferenceSeconds,
    ),
    qualifyingOffsetSeconds: round(
      record.simulation.neutralBaseLapSeconds -
        qualifying.selectedReferenceSeconds,
    ),
    raceModelCorrectionSeconds: 0,
  }
  delete simulation.validation
  return simulation
}

function applyHistoricalForecasts(calibrations, historical) {
  const qualifyingEvolution = evolutionFor(
    calibrations,
    historical,
    (record) =>
      record.qualifying.status === 'official'
        ? record.qualifying.selectedReferenceSeconds
        : null,
    (sample) =>
      sample.qualifying?.selectedReferenceSeconds ?? null,
  )
  const raceEvolution = evolutionFor(
    calibrations,
    historical,
    (record) =>
      record.race.status === 'observed'
        ? record.race.cleanLapReferenceSeconds
        : null,
    (sample) => sample.race?.cleanLapReferenceSeconds ?? null,
  )

  return calibrations.map((record) => {
    const event = f1Events.find(
      (candidate) => candidate.eventId === record.eventId,
    )
    const history = historical.get(record.trackId)
    const historicalSamples = [...(history?.values() ?? [])].sort(
      (left, right) => right.year - left.year,
    )
    const recentQualifying = historicalSamples.find(
      (sample) => sample.qualifying !== null,
    )
    const olderQualifying = historicalSamples.find(
      (sample) =>
        sample.qualifying !== null &&
        sample.year < (recentQualifying?.year ?? 0),
    )
    const recentRace = historicalSamples.find(
      (sample) =>
        sample.race?.cleanLapReferenceSeconds !== null &&
        sample.race?.cleanLapReferenceSeconds !== undefined,
    )

    if (!event || !history) {
      return record
    }

    const profile =
      f1TrackForecastMetadata[record.trackId]?.profile ?? 'balanced'
    let qualifying = record.qualifying
    let race = record.race
    const addedNotes = []

    if (
      qualifying.status === 'estimated' &&
      recentQualifying?.qualifying
    ) {
      const summary =
        qualifyingEvolution.byProfile.get(profile) ??
        qualifyingEvolution.global
      const predicted = round(
        recentQualifying.qualifying.selectedReferenceSeconds *
          summary.ratio,
      )
      const range = forecastRange(
        predicted,
        summary,
        recentQualifying.qualifying.selectedReferenceSeconds,
        olderQualifying?.qualifying?.selectedReferenceSeconds ??
          null,
        0.55,
      )
      qualifying = {
        ...qualifying,
        selectedReferenceSeconds: predicted,
        selectedMethod: `2025 same-circuit result adjusted by the observed 2026 ${profile} circuit-group median`,
        referenceRangeSeconds: range,
        confidence: round(clamp(0.46 + summary.count * 0.025, 0.46, 0.62), 2),
      }
      addedNotes.push(
        `Qualifying forecast uses the ${recentQualifying.year} same-circuit dry result and ${summary.count} completed 2026 ${profile} comparison events; another dry historical year is used for uncertainty where available.`,
      )
    }

    if (
      race.status === 'estimated' &&
      recentRace?.race?.cleanLapReferenceSeconds !== null &&
      recentRace?.race?.cleanLapReferenceSeconds !== undefined
    ) {
      const summary =
        raceEvolution.byProfile.get(profile) ?? raceEvolution.global
      const predicted = round(
        recentRace.race.cleanLapReferenceSeconds * summary.ratio,
      )
      const range = forecastRange(
        predicted,
        summary,
        recentRace.race.cleanLapReferenceSeconds,
        null,
        1.1,
      )
      const winnerAverage =
        recentRace.race.winnerAverageSeconds === null
          ? record.race.winnerAverageSeconds
          : round(
              recentRace.race.winnerAverageSeconds * summary.ratio,
            )
      race = {
        ...race,
        cleanLapReferenceSeconds: predicted,
        greenLapMedianSeconds: predicted,
        winnerAverageSeconds: winnerAverage,
        referenceRangeSeconds: range,
        confidence: round(clamp(0.4 + summary.count * 0.025, 0.4, 0.56), 2),
      }
      addedNotes.push(
        `Race forecast uses a classified ${recentRace.year} same-circuit clean-lap sample and ${summary.count} completed 2026 ${profile} comparison events.`,
      )
    }

    if (
      qualifying === record.qualifying &&
      race === record.race
    ) {
      return record
    }

    return {
      ...record,
      qualifying,
      race,
      simulation: resetSimulationCalibration(
        record,
        qualifying,
        race,
      ),
      sources: [
        ...record.sources,
        ...historicalSamples.flatMap((sample) => sample.sources).filter(
          (source, index, sources) =>
            sources.findIndex(
              (candidate) =>
                candidate.sessionKey === source.sessionKey &&
                candidate.label === source.label,
            ) === index,
        ),
      ],
      notes: [
        ...record.notes.filter(
          (note) => !note.startsWith('Qualifying forecast uses') &&
            !note.startsWith('Race forecast uses'),
        ),
        ...addedNotes,
      ],
    }
  })
}

function superFormulaCalibration(previousRecords = []) {
  const source = (label, url) => ({
    provider: 'SUPER FORMULA',
    label,
    url,
    retrievedAt,
  })
  const event = ({
    eventId,
    eventName,
    eventDate,
    trackId,
    roundNumber,
    pole,
    selected,
    neutral,
    green,
    winnerAverage,
    confidence,
    sourceUrl,
    extraSources = [],
    notes,
  }) => ({
    schemaVersion: SCHEMA_VERSION,
    calibrationVersion: CALIBRATION_VERSION,
    series: 'super-formula',
    season: 2026,
    eventId,
    eventName,
    trackId,
    round: roundNumber,
    eventDate,
    qualifying: {
      poleSeconds: pole,
      top3MedianSeconds: selected === pole ? null : selected,
      top5MedianSeconds: null,
      theoreticalBestSeconds: null,
      selectedReferenceSeconds: selected,
      selectedMethod:
        selected === pole
          ? 'Official pole fallback; complete per-lap Q3 distribution unavailable'
          : 'Derived top-three reference from official classification',
      fieldP10DeltaSeconds: null,
      fieldMedianDeltaSeconds: null,
      fieldP90DeltaSeconds: null,
      validLapCount: 0,
      deletedOrInvalidRate: null,
      status: 'official',
      confidence,
    },
    race: {
      cleanLapReferenceSeconds: green,
      earlyStintMedianSeconds: null,
      middleStintMedianSeconds: null,
      lateStintMedianSeconds: null,
      greenLapP10Seconds: null,
      greenLapMedianSeconds: green,
      greenLapP90Seconds: null,
      winnerAverageSeconds: winnerAverage,
      pitLaneLossSeconds: null,
      inLapLossSeconds: null,
      outLapLossSeconds: null,
      clearAirTrafficDeltaSeconds: null,
      cleanLapCount: 0,
      totalLapCount: 0,
      compoundMedianSeconds: {},
      stintMedianSeconds: [],
      fuelGainPerLapSeconds: null,
      tireDegradationPerLapSeconds: null,
      status: green === null ? 'unverified' : 'derived',
      confidence: green === null ? 0.2 : confidence - 0.18,
    },
    simulation: {
      neutralBaseLapSeconds: neutral,
      qualifyingOffsetSeconds: round(neutral - selected),
      expectedGreenRaceDeltaSeconds:
        green === null ? 7.5 : round(green - selected),
      raceModelCorrectionSeconds: 0,
      residualSigmaSeconds: 0.72,
      calibrationSeedCount: 0,
    },
    sources: [
      source(`${eventName} official result`, sourceUrl),
      source('SUPER FORMULA 2026 official calendar and results', SUPER_FORMULA_RESULTS_URL),
      ...extraSources.map(({ label, url }) => source(label, url)),
    ],
    notes,
  })

  const generated = [
    event({
      eventId: 'super-formula-motegi-round-2-2026',
      eventName: 'SUPER FORMULA Motegi Round 2',
      eventDate: '2026-04-05',
      trackId: 'motegi-sf',
      roundNumber: 2,
      pole: 90.369,
      selected: 90.369,
      neutral: 91.15,
      green: null,
      winnerAverage: null,
      confidence: 0.66,
      sourceUrl: 'https://superformula.net/sf3/race/24415/',
      notes: [
        'Round 1 was heavily affected by rain, safety cars, and a red flag; the drier Round 2 qualifying result is selected.',
        'No public machine-readable all-lap feed was available, so no race-clear median is asserted as observed.',
      ],
    }),
    event({
      eventId: 'super-formula-autopolis-round-3-2026',
      eventName: 'SUPER FORMULA Autopolis Round 3',
      eventDate: '2026-04-25',
      trackId: 'autopolis-sf',
      roundNumber: 3,
      pole: 85.866,
      selected: 86.139,
      neutral: 86.5,
      green: null,
      winnerAverage: null,
      confidence: 0.82,
      sourceUrl: 'https://superformula.net/sf3/race/24419/',
      extraSources: [
        {
          label: 'Official Autopolis Round 3 replacement procedure',
          url: 'https://superformula.net/sf3/release/27021/',
        },
      ],
      notes: [
        'Official dry Q3 top-three median is retained from Autopolis.',
        'The Autopolis race was cancelled; no race pace is asserted. The official qualifying classification supplied the grid for the replacement Round 3 race at Fuji.',
      ],
    }),
    event({
      eventId: 'super-formula-suzuka-round-5-2026',
      eventName: 'SUPER FORMULA Suzuka Round 5',
      eventDate: '2026-04-26',
      trackId: 'suzuka-approx',
      roundNumber: 5,
      pole: 97.605,
      selected: 97.605,
      neutral: 96.15,
      green: 100.6,
      winnerAverage: round((55 * 60 + 58.747) / 31),
      confidence: 0.72,
      sourceUrl: 'https://superformula.net/sf3/race/24422/',
      notes: [
        'Race winner average includes the opening safety-car period and is not used as the normal green-lap target.',
        'The clean-race reference is derived from official fastest-lap and race classification summaries, not a complete timing feed.',
      ],
    }),
    event({
      eventId: 'super-formula-fuji-round-7-2026',
      eventName: 'SUPER FORMULA Fuji Round 7',
      eventDate: '2026-07-19',
      trackId: 'fuji-sf',
      roundNumber: 7,
      pole: 82.815,
      selected: 82.815,
      neutral: 83,
      green: 85.45,
      winnerAverage: null,
      confidence: 0.7,
      sourceUrl: 'https://superformula.net/sf3/race/24425/',
      notes: [
        'Round 7 is selected over the wet Round 6 qualifying session.',
        'The clean-race reference is a derived event benchmark because complete public all-lap timing was unavailable.',
      ],
    }),
    {
      ...event({
        eventId: 'super-formula-sugo-2026-estimate',
        eventName: 'SUPER FORMULA Sportsland SUGO',
        eventDate: '2026-08-09',
        trackId: 'sugo-sf',
        roundNumber: 8,
        pole: null,
        selected: 64.5,
        neutral: 64.75,
        green: 68.8,
        winnerAverage: 72.5,
        confidence: 0.34,
        sourceUrl: SUPER_FORMULA_RESULTS_URL,
        notes: [
          'Future event estimate based on recent same-circuit results and the 2026 category trend.',
        ],
      }),
      qualifying: {
        ...event({
          eventId: 'placeholder',
          eventName: 'placeholder',
          eventDate: '2026-08-09',
          trackId: 'sugo-sf',
          roundNumber: 8,
          pole: null,
          selected: 64.5,
          neutral: 64.75,
          green: 68.8,
          winnerAverage: 72.5,
          confidence: 0.34,
          sourceUrl: SUPER_FORMULA_RESULTS_URL,
          notes: [],
        }).qualifying,
        status: 'estimated',
        selectedMethod: 'Same-circuit historical estimate with 2026 category trend',
      },
      race: {
        ...event({
          eventId: 'placeholder',
          eventName: 'placeholder',
          eventDate: '2026-08-09',
          trackId: 'sugo-sf',
          roundNumber: 8,
          pole: null,
          selected: 64.5,
          neutral: 64.75,
          green: 68.8,
          winnerAverage: 72.5,
          confidence: 0.34,
          sourceUrl: SUPER_FORMULA_RESULTS_URL,
          notes: [],
        }).race,
        status: 'estimated',
      },
    },
  ]

  return generated.map((record) =>
    withPreservedSimulation(
      record,
      previousRecords.find(
        (previous) => previous.eventId === record.eventId,
      ),
    ),
  )
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function existingCalibration(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const previousF1 = await existingCalibration(F1_OUTPUT)
  const previousSf = await existingCalibration(SF_OUTPUT)
  const previousF1ByEvent = new Map(
    (Array.isArray(previousF1) ? previousF1 : []).map((record) => [
      record.eventId,
      record,
    ]),
  )
  let f1Calibration

  if (OFFLINE) {
    f1Calibration = previousF1

    if (!Array.isArray(f1Calibration)) {
      throw new Error(
        'Offline update requires an existing f1PaceCalibration2026.json',
      )
    }
  } else {
    f1Calibration = []

    for (const event of f1Events) {
      process.stdout.write(
        `Calibrating F1 round ${event.round}: ${event.eventName}...\n`,
      )
      f1Calibration.push(
        await buildF1Calibration(
          event,
          previousF1ByEvent.get(event.eventId),
        ),
      )
    }

    const historical = await historicalF1Samples()
    f1Calibration = applyHistoricalForecasts(
      f1Calibration,
      historical,
    ).map((record) =>
      withPreservedSimulation(
        record,
        previousF1ByEvent.get(record.eventId),
      ),
    )
  }

  f1Calibration = f1Calibration.map((record) => ({
    ...record,
    sources: dedupeSources(record.sources),
  }))
  const sfCalibration = superFormulaCalibration(
    Array.isArray(previousSf) ? previousSf : [],
  ).map((record) => ({
    ...record,
    sources: dedupeSources(record.sources),
  }))
  const all = [...f1Calibration, ...sfCalibration]
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    calibrationVersion: CALIBRATION_VERSION,
    generatedAt: retrievedAt,
    season: 2026,
    eventCount: all.length,
    series: ['f1-custom', 'super-formula'].map((seriesId) => {
      const events = all.filter((event) => event.series === seriesId)
      const observedDates = events
        .filter(
          (event) =>
            event.qualifying.status !== 'estimated' ||
            event.race.status !== 'estimated',
        )
        .map((event) => event.eventDate)
        .sort()

      return {
        id: seriesId,
        eventCount: events.length,
        latestObservedEventDate: observedDates.at(-1) ?? null,
      }
    }),
    generator: 'scripts/update-pace-calibration.mjs',
    sourcePolicy:
      'Official result classifications establish outcomes; OpenF1 timing, control, stint, pit, interval, and weather feeds establish observed lap distributions.',
  }

  await writeJson(F1_OUTPUT, f1Calibration)
  await writeJson(SF_OUTPUT, sfCalibration)
  await writeJson(MANIFEST_OUTPUT, manifest)
  process.stdout.write(
    `Wrote ${f1Calibration.length} F1 and ${sfCalibration.length} SUPER FORMULA event calibrations.\n`,
  )
}

await main()
