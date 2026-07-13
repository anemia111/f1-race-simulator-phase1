import { useEffect, useState } from 'react'
import {
  fetchOpenF1SeasonStandings,
  type OpenF1StandingsSnapshot,
} from '../services/openF1'

type StandingsState = {
  data: OpenF1StandingsSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

type CachedStandings = { data: OpenF1StandingsSnapshot; fetchedAt: number }

const cache = new Map<string, CachedStandings>()
// Championship standings only change when a race finishes, so an hourly
// refresh is plenty and keeps this background flow off the API rate limit.
const refreshMs = 60 * 60_000

export function useOpenF1SeasonStandings(
  year = 2026,
  asOfIso?: string | null,
): StandingsState {
  const cutoffKey = asOfIso ? asOfIso.slice(0, 10) : 'latest'
  const cacheKey = `${year}:${cutoffKey}`
  const [state, setState] = useState<StandingsState>(() => {
    const data = cache.get(cacheKey)?.data ?? null
    return { data, status: data ? 'ready' : 'idle' }
  })

  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      setState((current) => ({ data: current.data, status: 'loading' }))
      fetchOpenF1SeasonStandings(year, controller.signal, asOfIso)
        .then((data) => {
          cache.set(cacheKey, { data, fetchedAt: Date.now() })
          setState({ data, status: 'ready' })
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setState((current) => ({ data: current.data, status: 'error' }))
          }
        })
    }

    const cached = cache.get(cacheKey)

    if (!cached || Date.now() - cached.fetchedAt > refreshMs) {
      load()
    }

    const timer = window.setInterval(load, refreshMs)

    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [asOfIso, cacheKey, year])

  return state
}
