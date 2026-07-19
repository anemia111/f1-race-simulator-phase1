import { useEffect, useState } from 'react'
import { fetchOpenF1Bundle, type OpenF1Bundle } from '../services/openF1'
import type { WeekendStage } from '../types'

type OpenF1DataState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: OpenF1Bundle | null; error: null }
  | { status: 'ready'; data: OpenF1Bundle; error: null }
  | { status: 'error'; data: OpenF1Bundle | null; error: string }

export type CachedBundle = { bundle: OpenF1Bundle; fetchedAt: number }

const bundleCache = new Map<string, CachedBundle>()
const OPENF1_LIVE_REFRESH_MS = 45_000
const OPENF1_IDLE_REFRESH_MS = 600_000
const OPENF1_LIVE_WINDOW_MARGIN_MS = 45 * 60_000
const OPENF1_RETRY_MS = 30_000
const weekendStages = new Set<WeekendStage>([
  'fp1',
  'fp2',
  'fp3',
  'sprintQualifying',
  'sprint',
  'qualifying',
  'race',
])

function storageKey(cacheKey: string) {
  return `f1-sim-openf1:${cacheKey}`
}

const requiredBundleArrays: Array<keyof OpenF1Bundle> = [
  'carData',
  'championshipDrivers',
  'championshipTeams',
  'drivers',
  'endpointStatuses',
  'intervals',
  'laps',
  'location',
  'miniSectorDrivers',
  'miniSectorLaps',
  'overtakes',
  'pit',
  'positions',
  'raceControl',
  'sessionResult',
  'sessions',
  'startingGrid',
  'stints',
  'teamRadio',
  'weather',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseCachedOpenF1Bundle(raw: string | null): CachedBundle | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      !isRecord(parsed) ||
      typeof parsed.fetchedAt !== 'number' ||
      !Number.isFinite(parsed.fetchedAt) ||
      parsed.fetchedAt < 0 ||
      !isRecord(parsed.bundle)
    ) {
      return null
    }

    const bundle = parsed.bundle
    const nullableObjects = [
      bundle.meeting,
      bundle.miniSectorSession,
      bundle.raceSession,
      bundle.selectedSession,
    ]
    const summary = bundle.summary
    const validSummary =
      isRecord(summary) &&
      typeof summary.miniSectorSamples === 'number' &&
      Number.isFinite(summary.miniSectorSamples) &&
      summary.miniSectorSamples >= 0 &&
      typeof summary.telemetrySamples === 'number' &&
      Number.isFinite(summary.telemetrySamples) &&
      summary.telemetrySamples >= 0 &&
      [
        summary.bestLap,
        summary.fastestPitStop,
        summary.latestRaceControl,
        summary.latestWeather,
        summary.maxSpeed,
      ].every((value) => value === null || isRecord(value))
    const validEnvelope =
      (bundle.authMode === 'public' || bundle.authMode === 'bearer') &&
      typeof bundle.year === 'number' &&
      Number.isSafeInteger(bundle.year) &&
      bundle.year >= 2023 &&
      bundle.year <= 2100 &&
      typeof bundle.requestedStage === 'string' &&
      weekendStages.has(bundle.requestedStage as WeekendStage) &&
      validSummary &&
      nullableObjects.every((value) => value === null || isRecord(value)) &&
      requiredBundleArrays.every(
        (key) =>
          Array.isArray(bundle[key]) && bundle[key].every((row) => isRecord(row)),
      )

    return validEnvelope
      ? { bundle: bundle as unknown as OpenF1Bundle, fetchedAt: parsed.fetchedAt }
      : null
  } catch {
    return null
  }
}

function restoreBundle(cacheKey: string): CachedBundle | null {
  try {
    return parseCachedOpenF1Bundle(
      window.sessionStorage.getItem(storageKey(cacheKey)),
    )
  } catch {
    return null
  }
}

function persistBundle(cacheKey: string, cached: CachedBundle) {
  try {
    window.sessionStorage.setItem(storageKey(cacheKey), JSON.stringify(cached))
  } catch {
    // Session storage is a convenience cache only.
  }
}

/**
 * Completed weekends do not produce new samples, so polling them every 45
 * seconds only burns the public API rate limit. Poll fast solely around a
 * session window (with margin for delays); otherwise refresh rarely.
 */
function refreshDelayFor(bundle: OpenF1Bundle | null | undefined) {
  if (!bundle?.meeting || bundle.sessions.length === 0) {
    return OPENF1_IDLE_REFRESH_MS
  }

  const now = Date.now()
  const nearLiveSession = bundle.sessions.some((session) => {
    const start = new Date(session.date_start).getTime() - OPENF1_LIVE_WINDOW_MARGIN_MS
    const end = new Date(session.date_end).getTime() + OPENF1_LIVE_WINDOW_MARGIN_MS

    return now >= start && now <= end
  })

  return nearLiveSession ? OPENF1_LIVE_REFRESH_MS : OPENF1_IDLE_REFRESH_MS
}

export function useOpenF1Data(
  trackId: string,
  stage: WeekendStage,
  year = 2026,
  accessToken: string | null = null,
  enabled = true,
): OpenF1DataState {
  const [state, setState] = useState<OpenF1DataState>({
    status: 'idle',
    data: null,
    error: null,
  })

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null })
      return
    }

    const cacheKey = `${year}:${trackId}:${stage}:${accessToken ? 'auth' : 'public'}`
    const cached = bundleCache.get(cacheKey) ?? restoreBundle(cacheKey)

    if (cached) {
      bundleCache.set(cacheKey, cached)
    }

    if (cached) {
      setState({ status: 'ready', data: cached.bundle, error: null })
    }

    const controller = new AbortController()
    let timeoutId: number | null = null
    let disposed = false

    const scheduleNext = (bundle: OpenF1Bundle | null, retry = false) => {
      if (disposed) {
        return
      }

      timeoutId = window.setTimeout(
        () => load(true),
        retry ? OPENF1_RETRY_MS : refreshDelayFor(bundle),
      )
    }

    const load = (isRefresh = false) => {
      if (!isRefresh) {
        setState((current) =>
          current.data
            ? { status: 'loading', data: current.data, error: null }
            : { status: 'loading', data: null, error: null },
        )
      }

      fetchOpenF1Bundle(trackId, {
        accessToken,
        signal: controller.signal,
        stage,
        year,
      })
        .then((bundle) => {
          const cachedBundle = { bundle, fetchedAt: Date.now() }
          bundleCache.set(cacheKey, cachedBundle)
          persistBundle(cacheKey, cachedBundle)
          setState({ status: 'ready', data: bundle, error: null })
          scheduleNext(bundle)
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return
          }

          setState((current) => {
            scheduleNext(current.data, true)

            return {
              status: 'error',
              data: current.data,
              error: error instanceof Error ? error.message : 'OpenF1 request failed',
            }
          })
        })
    }

    if (!cached || Date.now() - cached.fetchedAt > refreshDelayFor(cached.bundle)) {
      load()
    } else {
      scheduleNext(cached.bundle)
    }

    return () => {
      disposed = true
      controller.abort()

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [accessToken, enabled, stage, trackId, year])

  return state
}
