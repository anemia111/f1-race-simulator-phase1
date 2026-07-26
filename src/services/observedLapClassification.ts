import type { ObservedLapClass, TireCompound } from '../types'
import type {
  OpenF1Interval,
  OpenF1Lap,
  OpenF1RaceControl,
  OpenF1Stint,
  OpenF1Weather,
} from './openF1'

export type { ObservedLapClass } from '../types'

export type ObservedLapClassificationSource = {
  laps: OpenF1Lap[]
  pit: Array<{
    date?: string
    driver_number: number
    lap_number: number
    lane_duration: number | null
    stop_duration: number | null
  }>
  stints: OpenF1Stint[]
  raceControl: OpenF1RaceControl[]
  weather: OpenF1Weather[]
  intervals: OpenF1Interval[]
}

export type ClassifiedObservedLap = {
  lap: OpenF1Lap
  classification: ObservedLapClass
  reasons: string[]
  compound: TireCompound | null
  stintNumber: number | null
  tireAgeLaps: number | null
  intervalToAheadSeconds: number | null
  rainfall: number | null
}

type TimedWindow = {
  endMs: number
  kind: 'safety-car' | 'virtual-safety-car' | 'red' | 'yellow' | 'restart'
  startMs: number
}

const MAX_VALID_LAP_SECONDS = 300
const MIN_VALID_LAP_SECONDS = 35

function numericMedian(values: number[]) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function observedMedian(values: number[]) {
  return numericMedian(values)
}

export function observedPercentile(values: number[], quantile: number) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const bounded = Math.min(1, Math.max(0, quantile))
  const index = (sorted.length - 1) * bounded
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return sorted[lower]
  }

  return (
    sorted[lower] +
    (sorted[upper] - sorted[lower]) * (index - lower)
  )
}

function timestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compoundFor(value: string | null): TireCompound | null {
  const normalized = value?.toUpperCase() ?? ''

  if (normalized.includes('SOFT')) return 'S'
  if (normalized.includes('MEDIUM')) return 'M'
  if (normalized.includes('HARD')) return 'H'
  if (normalized.includes('INTER')) return 'I'
  if (normalized.includes('WET')) return 'W'
  return null
}

function finiteDuration(lap: OpenF1Lap) {
  return lap.lap_duration !== null &&
    Number.isFinite(lap.lap_duration) &&
    lap.lap_duration >= MIN_VALID_LAP_SECONDS &&
    lap.lap_duration <= MAX_VALID_LAP_SECONDS
    ? lap.lap_duration
    : null
}

function intervalSeconds(value: number | string | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }

  if (typeof value !== 'string' || /lap/i.test(value)) {
    return null
  }

  const parsed = Number.parseFloat(value.replace(/^\+/, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

type TimedEntry<T> = {
  atMs: number
  value: T
}

function timedEntries<T>(
  values: T[],
  valueDate: (value: T) => string | null | undefined,
) {
  return values
    .flatMap<TimedEntry<T>>((value) => {
      const atMs = timestamp(valueDate(value))
      return atMs === null ? [] : [{ atMs, value }]
    })
    .sort((left, right) => left.atMs - right.atMs)
}

function closestTimedValue<T>(
  values: TimedEntry<T>[],
  atMs: number | null,
  maximumDistanceMs: number,
) {
  if (atMs === null || values.length === 0) {
    return null
  }

  let lower = 0
  let upper = values.length

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)

    if (values[middle].atMs < atMs) {
      lower = middle + 1
    } else {
      upper = middle
    }
  }

  const candidates = [values[lower - 1], values[lower]].filter(
    (entry): entry is TimedEntry<T> => entry !== undefined,
  )
  const closest = candidates.sort(
    (left, right) =>
      Math.abs(left.atMs - atMs) - Math.abs(right.atMs - atMs),
  )[0]

  return closest &&
    Math.abs(closest.atMs - atMs) <= maximumDistanceMs
    ? closest.value
    : null
}

function controlWindows(events: OpenF1RaceControl[]) {
  const sorted = events
    .map((event) => ({ event, atMs: timestamp(event.date) }))
    .filter(
      (entry): entry is { event: OpenF1RaceControl; atMs: number } =>
        entry.atMs !== null,
    )
    .sort((left, right) => left.atMs - right.atMs)
  const windows: TimedWindow[] = []
  let neutralisation:
    | { kind: TimedWindow['kind']; startMs: number }
    | null = null
  let redFlagEndedAt: number | null = null
  const activeYellows = new Map<
    string,
    { kind: TimedWindow['kind']; startMs: number }
  >()
  const lastEventMs = sorted.at(-1)?.atMs ?? 0

  const closeNeutralisation = (endMs: number) => {
    if (neutralisation && endMs > neutralisation.startMs) {
      windows.push({ ...neutralisation, endMs })

      if (neutralisation.kind === 'red') {
        redFlagEndedAt = endMs
      }
    }

    neutralisation = null
  }

  for (const { event, atMs } of sorted) {
    const message = event.message.toUpperCase()
    const flag = event.flag?.toUpperCase() ?? ''
    const yellowKey = `${event.scope ?? 'Track'}:${event.sector ?? 'all'}`
    const isVirtualSafetyCar =
      message.includes('VIRTUAL SAFETY CAR') ||
      /\bVSC\b/.test(message)
    const isSafetyCarDeployment =
      !isVirtualSafetyCar &&
      message.includes('SAFETY CAR') &&
      (message.includes('DEPLOYED') || message.includes('PERIOD'))
    const isGreen =
      flag === 'GREEN' ||
      message.includes('GREEN FLAG') ||
      message.includes('TRACK CLEAR')

    if (flag === 'RED' || message.includes('RED FLAG')) {
      closeNeutralisation(atMs)
      neutralisation = { kind: 'red', startMs: atMs }
      continue
    }

    if (
      isVirtualSafetyCar &&
      (message.includes('DEPLOYED') || message.includes('PERIOD'))
    ) {
      closeNeutralisation(atMs)
      neutralisation = { kind: 'virtual-safety-car', startMs: atMs }
      continue
    }

    if (isSafetyCarDeployment) {
      closeNeutralisation(atMs)
      neutralisation = { kind: 'safety-car', startMs: atMs }
      continue
    }

    if (isGreen && neutralisation) {
      closeNeutralisation(atMs)
    }

    if (redFlagEndedAt !== null && atMs === redFlagEndedAt) {
      windows.push({
        endMs: atMs + 120_000,
        kind: 'restart',
        startMs: atMs,
      })
      redFlagEndedAt = null
    }

    if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') {
      const current = activeYellows.get(yellowKey)

      if (!current) {
        activeYellows.set(yellowKey, { kind: 'yellow', startMs: atMs })
      }
      continue
    }

    if (flag === 'CLEAR') {
      const active = activeYellows.get(yellowKey)

      if (active) {
        windows.push({ ...active, endMs: atMs })
        activeYellows.delete(yellowKey)
      } else if (event.scope === 'Track') {
        for (const [key, yellow] of activeYellows) {
          windows.push({ ...yellow, endMs: atMs })
          activeYellows.delete(key)
        }
      }
    }
  }

  if (neutralisation) {
    windows.push({
      ...neutralisation,
      endMs: lastEventMs + 180_000,
    })
  }

  for (const yellow of activeYellows.values()) {
    windows.push({ ...yellow, endMs: lastEventMs + 120_000 })
  }

  return windows
}

function windowForLap(
  windows: TimedWindow[],
  startMs: number | null,
  endMs: number | null,
) {
  if (startMs === null || endMs === null) {
    return null
  }

  return (
    windows.find(
      (window) => window.startMs <= endMs && window.endMs >= startMs,
    ) ?? null
  )
}

function sectorsAreConsistent(lap: OpenF1Lap, duration: number) {
  const sectors = [
    lap.duration_sector_1,
    lap.duration_sector_2,
    lap.duration_sector_3,
  ]

  if (sectors.some((sector) => sector === null || !Number.isFinite(sector))) {
    return true
  }

  const sectorTotal = sectors.reduce<number>(
    (total, sector) => total + (sector ?? 0),
    0,
  )
  return Math.abs(sectorTotal - duration) <= 2
}

function stintForLap(
  stints: OpenF1Stint[],
  driverNumber: number,
  lapNumber: number,
) {
  return (
    stints.find(
      (stint) =>
        stint.driver_number === driverNumber &&
        lapNumber >= stint.lap_start &&
        lapNumber <= stint.lap_end,
    ) ?? null
  )
}

export function classifyObservedLaps(
  source: ObservedLapClassificationSource,
  session: 'qualifying' | 'race',
): ClassifiedObservedLap[] {
  const windows = controlWindows(source.raceControl)
  const weatherByTime = timedEntries(source.weather, (sample) => sample.date)
  const intervalsByDriver = new Map<
    number,
    TimedEntry<OpenF1Interval>[]
  >()

  for (const interval of source.intervals) {
    const driverIntervals = intervalsByDriver.get(interval.driver_number) ?? []
    const atMs = timestamp(interval.date)

    if (atMs !== null) {
      driverIntervals.push({ atMs, value: interval })
      intervalsByDriver.set(interval.driver_number, driverIntervals)
    }
  }

  for (const intervals of intervalsByDriver.values()) {
    intervals.sort((left, right) => left.atMs - right.atMs)
  }

  const pitLapKeys = new Set(
    source.pit.map((pit) => `${pit.driver_number}:${pit.lap_number}`),
  )
  const candidateFastest = new Map<number, number>()

  for (const lap of source.laps) {
    const duration = finiteDuration(lap)

    if (
      duration === null ||
      lap.is_pit_out_lap ||
      pitLapKeys.has(`${lap.driver_number}:${lap.lap_number}`)
    ) {
      continue
    }

    const current = candidateFastest.get(lap.driver_number)
    candidateFastest.set(
      lap.driver_number,
      current === undefined ? duration : Math.min(current, duration),
    )
  }

  return source.laps.map((lap) => {
    const reasons: string[] = []
    const duration = finiteDuration(lap)
    const lapStartMs = timestamp(lap.date_start)
    const lapEndMs =
      lapStartMs !== null && duration !== null
        ? lapStartMs + duration * 1_000
        : lapStartMs
    const midpointMs =
      lapStartMs !== null && lapEndMs !== null
        ? (lapStartMs + lapEndMs) / 2
        : lapStartMs
    const stint = stintForLap(
      source.stints,
      lap.driver_number,
      lap.lap_number,
    )
    const compound = compoundFor(stint?.compound ?? null)
    const weather = closestTimedValue(
      weatherByTime,
      midpointMs,
      300_000,
    )
    const interval = closestTimedValue(
      intervalsByDriver.get(lap.driver_number) ?? [],
      lapEndMs,
      25_000,
    )
    const intervalToAhead = intervalSeconds(interval?.interval ?? null)
    const window = windowForLap(windows, lapStartMs, lapEndMs)
    const pitKey = `${lap.driver_number}:${lap.lap_number}`
    const nextStint = source.stints.find(
      (candidate) =>
        candidate.driver_number === lap.driver_number &&
        candidate.lap_start === lap.lap_number + 1 &&
        candidate.stint_number >
          (stint?.stint_number ?? Number.NEGATIVE_INFINITY),
    )
    const inferredOutLap =
      stint !== null &&
      stint.stint_number > 1 &&
      stint.lap_start === lap.lap_number
    const tireAgeLaps =
      stint === null
        ? null
        : Math.max(
            0,
            stint.tyre_age_at_start + lap.lap_number - stint.lap_start,
          )
    const rainfall = weather?.rainfall ?? null

    let classification: ObservedLapClass

    if (duration === null) {
      classification = 'invalid'
      reasons.push('missing-or-out-of-range-duration')
    } else if (!sectorsAreConsistent(lap, duration)) {
      classification = 'invalid'
      reasons.push('sector-total-mismatch')
    } else if (
      !Number.isSafeInteger(lap.driver_number) ||
      lap.driver_number <= 0 ||
      !Number.isSafeInteger(lap.lap_number) ||
      lap.lap_number < 1
    ) {
      classification = 'invalid'
      reasons.push('invalid-driver-or-lap-number')
    } else if (pitLapKeys.has(pitKey)) {
      classification = 'pit-lap'
      reasons.push('pit-entry-or-stop-record')
    } else if (lap.is_pit_out_lap || inferredOutLap) {
      classification = 'out-lap'
      reasons.push('pit-out-or-new-stint')
    } else if (nextStint) {
      classification = 'in-lap'
      reasons.push('stint-ended-on-lap')
    } else if (window?.kind === 'safety-car') {
      classification = 'safety-car'
      reasons.push('safety-car-window-overlap')
    } else if (window?.kind === 'virtual-safety-car') {
      classification = 'virtual-safety-car'
      reasons.push('vsc-window-overlap')
    } else if (window?.kind === 'red' || window?.kind === 'restart') {
      classification = 'unknown'
      reasons.push(
        window.kind === 'red' ? 'red-flag-window-overlap' : 'red-flag-restart',
      )
    } else if (window?.kind === 'yellow') {
      classification = 'yellow'
      reasons.push('local-or-track-yellow-window-overlap')
    } else if (
      compound === 'I' ||
      compound === 'W' ||
      (rainfall !== null && rainfall > 0.02)
    ) {
      classification = 'wet'
      reasons.push(
        compound === 'I' || compound === 'W'
          ? 'wet-weather-compound'
          : 'rainfall-observed',
      )
    } else if (session === 'qualifying') {
      const fastest = candidateFastest.get(lap.driver_number)
      const pushThreshold =
        fastest === undefined ? duration : fastest + Math.max(1.25, fastest * 0.018)

      if (duration <= pushThreshold) {
        classification = 'qualifying-push'
        reasons.push('valid-near-personal-best')
      } else {
        classification = 'unknown'
        reasons.push('qualifying-slow-lap')
      }
    } else {
      const fastest = candidateFastest.get(lap.driver_number)
      const clearThreshold =
        fastest === undefined ? duration : fastest + Math.max(2.4, fastest * 0.027)
      const managementThreshold =
        fastest === undefined ? duration : fastest + Math.max(5.5, fastest * 0.062)

      if (lap.lap_number <= 2) {
        classification = 'race-traffic'
        reasons.push('opening-lap-congestion')
      } else if (intervalToAhead !== null && intervalToAhead <= 1.35) {
        classification = 'race-traffic'
        reasons.push('close-interval-to-ahead')
      } else if (duration <= clearThreshold) {
        classification = 'race-clear'
        reasons.push('green-lap-inside-driver-clear-window')
      } else if (duration <= managementThreshold) {
        classification = 'race-management'
        reasons.push('green-lap-outside-clear-window')
      } else {
        classification = 'unknown'
        reasons.push('extreme-slow-lap-or-unobserved-incident')
      }
    }

    return {
      lap,
      classification,
      reasons,
      compound,
      stintNumber: stint?.stint_number ?? null,
      tireAgeLaps,
      intervalToAheadSeconds: intervalToAhead,
      rainfall,
    }
  })
}

export function observedLapClassCounts(laps: ClassifiedObservedLap[]) {
  return laps.reduce<Partial<Record<ObservedLapClass, number>>>(
    (counts, lap) => {
      counts[lap.classification] = (counts[lap.classification] ?? 0) + 1
      return counts
    },
    {},
  )
}
