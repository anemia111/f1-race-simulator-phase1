import type {
  OpenF1Bundle,
  OpenF1RaceControl,
  OpenF1Weather,
} from './openF1'

export type OpenF1TimelineFrame = {
  endMs: number
  raceControl: OpenF1RaceControl | null
  startMs: number
  targetDate: string | null
  targetMs: number
  weather: OpenF1Weather | null
}

function validMs(date: string | null | undefined) {
  const value = date ? new Date(date).getTime() : Number.NaN
  return Number.isFinite(value) ? value : null
}

function latestAtOrBefore<T extends { date: string }>(
  values: T[],
  targetMs: number,
) {
  return values.reduce<T | null>((latest, value) => {
    const timestamp = validMs(value.date)

    if (timestamp === null || timestamp > targetMs) {
      return latest
    }

    return !latest || value.date > latest.date ? value : latest
  }, null)
}

export function openF1TimelineRange(
  bundle: OpenF1Bundle | null | undefined,
) {
  if (!bundle) {
    return { startMs: 0, endMs: 0 }
  }

  const dynamicDates = [
    ...bundle.carData.map((sample) => sample.date),
    ...bundle.location.map((sample) => sample.date),
    ...bundle.positions.map((sample) => sample.date),
    ...bundle.intervals.map((sample) => sample.date),
  ]
    .map(validMs)
    .filter((value): value is number => value !== null)
  const fallbackDates = [
    ...bundle.weather.map((sample) => sample.date),
    ...bundle.raceControl.map((sample) => sample.date),
  ]
    .map(validMs)
    .filter((value): value is number => value !== null)
  const dates = dynamicDates.length > 0 ? dynamicDates : fallbackDates

  return dates.length === 0
    ? { startMs: 0, endMs: 0 }
    : { startMs: Math.min(...dates), endMs: Math.max(...dates) }
}

export function buildOpenF1TimelineFrame(
  bundle: OpenF1Bundle | null | undefined,
  ratio = 1,
): OpenF1TimelineFrame {
  const { startMs, endMs } = openF1TimelineRange(bundle)

  if (!bundle || endMs <= 0) {
    return {
      endMs: 0,
      raceControl: null,
      startMs: 0,
      targetDate: null,
      targetMs: 0,
      weather: null,
    }
  }

  const normalizedRatio = Math.min(1, Math.max(0, ratio))
  const targetMs = startMs + (endMs - startMs) * normalizedRatio

  return {
    endMs,
    raceControl: latestAtOrBefore(bundle.raceControl, targetMs),
    startMs,
    targetDate: new Date(targetMs).toISOString(),
    targetMs,
    weather: latestAtOrBefore(bundle.weather, targetMs),
  }
}
