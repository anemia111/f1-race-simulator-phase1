import { useEffect, useState } from 'react'
import { fetchOpenF1Bundle, type OpenF1Bundle } from '../services/openF1'
import type { WeekendStage } from '../types'

type OpenF1DataState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: OpenF1Bundle | null; error: null }
  | { status: 'ready'; data: OpenF1Bundle; error: null }
  | { status: 'error'; data: OpenF1Bundle | null; error: string }

type CachedBundle = { bundle: OpenF1Bundle; fetchedAt: number }

const bundleCache = new Map<string, CachedBundle>()
const OPENF1_LIVE_REFRESH_MS = 45_000
const OPENF1_IDLE_REFRESH_MS = 600_000
const OPENF1_LIVE_WINDOW_MARGIN_MS = 45 * 60_000
const OPENF1_RETRY_MS = 30_000

function storageKey(cacheKey: string) {
  return `f1-sim-openf1:${cacheKey}`
}

function restoreBundle(cacheKey: string): CachedBundle | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(cacheKey))

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<CachedBundle>

    return parsed.bundle && typeof parsed.fetchedAt === 'number'
      ? { bundle: parsed.bundle, fetchedAt: parsed.fetchedAt }
      : null
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
): OpenF1DataState {
  const [state, setState] = useState<OpenF1DataState>({
    status: 'idle',
    data: null,
    error: null,
  })

  useEffect(() => {
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
  }, [accessToken, stage, trackId, year])

  return state
}
