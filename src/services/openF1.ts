const OPENF1_BASE_URL = 'https://api.openf1.org/v1'
const OPENF1_REQUEST_GAP_MS = 380
const OPENF1_YEAR = 2026
const OPENF1_REQUEST_TIMEOUT_MS = 15_000

import type { WeekendStage } from '../types'

export type OpenF1Meeting = {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_code: string
  country_name: string
  circuit_key: number
  circuit_short_name: string
  circuit_type: string
  circuit_info_url: string | null
  circuit_image: string | null
  date_start: string
  date_end: string
  year: number
  is_cancelled: boolean
}

export type OpenF1Session = {
  session_key: number
  session_type: string
  session_name: string
  date_start: string
  date_end: string
  meeting_key: number
  circuit_key: number
  circuit_short_name: string
  country_code: string
  country_name: string
  location: string
  year: number
  is_cancelled: boolean
}

export type OpenF1Driver = {
  driver_number: number
  full_name: string
  name_acronym: string
  team_colour: string
  team_name: string
}

export type OpenF1StartingGrid = {
  position: number
  driver_number: number
  lap_duration: number | null
}

export type OpenF1SessionResult = {
  position: number
  driver_number: number
  number_of_laps: number
  points?: number
  dnf: boolean
  dns: boolean
  dsq: boolean
  /** Q1/Q2/Q3 values are returned as a three-item array in qualifying. */
  duration: number | Array<number | null> | null
  /** Q1/Q2/Q3 gaps are returned as a three-item array in qualifying. */
  gap_to_leader: number | string | Array<number | string | null> | null
}

export type OpenF1Lap = {
  date_start?: string | null
  driver_number: number
  is_pit_out_lap?: boolean
  lap_number: number
  lap_duration: number | null
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  i1_speed: number | null
  i2_speed: number | null
  st_speed: number | null
  segments_sector_1: number[] | null
  segments_sector_2: number[] | null
  segments_sector_3: number[] | null
}

export type OpenF1Weather = {
  air_temperature: number
  date: string
  humidity: number
  pressure: number
  rainfall: number
  track_temperature: number
  wind_direction: number
  wind_speed: number
}

export type OpenF1Pit = {
  date?: string
  driver_number: number
  lap_number: number
  lane_duration: number | null
  stop_duration: number | null
}

export type OpenF1Stint = {
  driver_number: number
  stint_number: number
  lap_start: number
  lap_end: number
  compound: string | null
  tyre_age_at_start: number
}

export type OpenF1RaceControl = {
  category: string
  date: string
  driver_number: number | null
  flag: string | null
  lap_number: number | null
  message: string
  qualifying_phase: number | null
  scope: string | null
  sector: number | null
}

export type OpenF1Position = {
  date: string
  driver_number: number
  position: number
}

export type OpenF1Interval = {
  date: string
  driver_number: number
  gap_to_leader: number | string | null
  interval: number | string | null
}

export type OpenF1Overtake = {
  date: string
  overtaken_driver_number: number
  overtaking_driver_number: number
  position: number
}

export type OpenF1TeamRadio = {
  date: string
  driver_number: number
  recording_url: string
}

export type OpenF1CarData = {
  date: string
  driver_number: number
  brake: number
  /** Raw OpenF1 legacy DRS channel; not the 2026 Overtake state. */
  drs: number | null
  n_gear: number
  rpm: number
  speed: number
  throttle: number
}

export type OpenF1Location = {
  date: string
  driver_number: number
  x: number
  y: number
  z: number
}

export type OpenF1ChampionshipDriver = {
  driver_number: number
  points_current: number
  points_start: number
  position_current: number
  position_start: number
}

export type OpenF1ChampionshipTeam = {
  team_name: string
  points_current: number
  points_start: number
  position_current: number
  position_start: number
}

export type OpenF1EndpointStatus = {
  endpoint: string
  count: number
  ok: boolean
  message: string | null
  statusCode: number | null
}

export type OpenF1Summary = {
  bestLap: OpenF1Lap | null
  fastestPitStop: OpenF1Pit | null
  latestRaceControl: OpenF1RaceControl | null
  latestWeather: OpenF1Weather | null
  maxSpeed: OpenF1CarData | null
  miniSectorSamples: number
  telemetrySamples: number
}

export type OpenF1Bundle = {
  authMode: 'public' | 'bearer'
  year: number
  requestedStage: WeekendStage
  meeting: OpenF1Meeting | null
  sessions: OpenF1Session[]
  /** Session whose timing/telemetry data populates this bundle. */
  selectedSession: OpenF1Session | null
  /** Grand Prix race session retained for meeting-level metadata/standings. */
  raceSession: OpenF1Session | null
  miniSectorSession: OpenF1Session | null
  drivers: OpenF1Driver[]
  miniSectorDrivers: OpenF1Driver[]
  startingGrid: OpenF1StartingGrid[]
  sessionResult: OpenF1SessionResult[]
  laps: OpenF1Lap[]
  miniSectorLaps: OpenF1Lap[]
  weather: OpenF1Weather[]
  pit: OpenF1Pit[]
  stints: OpenF1Stint[]
  raceControl: OpenF1RaceControl[]
  positions: OpenF1Position[]
  intervals: OpenF1Interval[]
  overtakes: OpenF1Overtake[]
  teamRadio: OpenF1TeamRadio[]
  carData: OpenF1CarData[]
  location: OpenF1Location[]
  championshipDrivers: OpenF1ChampionshipDriver[]
  championshipTeams: OpenF1ChampionshipTeam[]
  endpointStatuses: OpenF1EndpointStatus[]
  summary: OpenF1Summary
}

export type OpenF1BundleRequest = {
  accessToken?: string | null
  signal?: AbortSignal
  stage: WeekendStage
  year?: number
}

export type OpenF1StandingsSnapshot = {
  drivers: OpenF1Driver[]
  championshipDrivers: OpenF1ChampionshipDriver[]
  championshipTeams: OpenF1ChampionshipTeam[]
  raceSession: OpenF1Session | null
  sourceYear: number
  /** Upper bound used to prevent future-round standings leaking backwards. */
  asOfDate?: string | null
  snapshotMeetingKey?: number | null
  snapshotSessionKey?: number | null
  snapshotSource?: 'api' | 'bundled'
}

const trackMatchers: Record<string, string[]> = {
  'albert-park-approx': ['melbourne'],
  'baku-approx': ['baku'],
  'bahrain-approx': ['sakhir', 'bahrain'],
  'barcelona-approx': ['catalunya', 'barcelona'],
  'cota-approx': ['austin'],
  'hungaroring-approx': ['hungaroring', 'budapest'],
  'interlagos-approx': ['interlagos', 'sao paulo'],
  'jeddah-approx': ['jeddah'],
  'las-vegas-approx': ['las vegas'],
  'lusail-approx': ['lusail'],
  'madrid-approx': ['madrid', 'madring'],
  'mexico-city-approx': ['mexico city'],
  'miami-approx': ['miami'],
  'monaco-approx': ['monaco', 'monte carlo'],
  'monza-approx': ['monza'],
  'montreal-approx': ['montreal'],
  'red-bull-ring-approx': ['spielberg'],
  'shanghai-approx': ['shanghai'],
  'silverstone-approx': ['silverstone'],
  'singapore-approx': ['singapore', 'marina bay'],
  'spa-approx': ['spa-francorchamps'],
  'suzuka-approx': ['suzuka'],
  'yas-marina-approx': ['yas marina', 'yas island'],
  'zandvoort-approx': ['zandvoort'],
}

const emptySummary: OpenF1Summary = {
  bestLap: null,
  fastestPitStop: null,
  latestRaceControl: null,
  latestWeather: null,
  maxSpeed: null,
  miniSectorSamples: 0,
  telemetrySamples: 0,
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// The OpenF1 API treats naive timestamps as UTC and currently rejects
// explicit "+00:00" suffixes (HTTP 404) and the ">=" operator (HTTP 500), so
// date filters must use bare timestamps with ">" / "<".
function compactDate(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, '')
}

function recentWindowStart(
  session: OpenF1Session,
  minutes: number,
  anchorIso?: string | null,
) {
  const now = new Date()
  const start = new Date(session.date_start)
  const end = new Date(session.date_end)
  const fallback = now >= start && now <= end ? now : end
  const anchor = anchorIso ? new Date(anchorIso) : fallback
  const candidate = new Date(anchor.getTime() - minutes * 60_000)

  return compactDate(candidate > start ? candidate : start)
}

/**
 * Completed sessions often stop publishing samples minutes before the
 * scheduled session end, so windows anchored at `date_end` come back empty.
 * The chequered-flag race-control message marks where data actually ends.
 */
export function chequeredFlagDate(raceControl: OpenF1RaceControl[]) {
  return (
    raceControl
      .filter((message) =>
        `${message.flag ?? ''} ${message.message}`.toUpperCase().includes('CHEQUERED'),
      )
      .map((message) => message.date)
      .sort()
      .pop() ?? null
  )
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function makeUrl(endpoint: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${OPENF1_BASE_URL}/${endpoint}`)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteNumberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const numberArrayOrNull = (value: unknown) =>
  Array.isArray(value)
    ? value.map(finiteNumberOrNull)
    : null

const gapValue = (
  value: unknown,
): number | string | Array<number | string | null> | null => {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'number' || typeof item === 'string' ? item : null,
    )
  }

  return null
}

/**
 * OpenF1 evolves independently from this client. Normalize the fields with
 * known schema drift before they reach the simulation instead of trusting a
 * compile-time cast of network JSON.
 */
export function normalizeOpenF1Endpoint<T>(endpoint: string, body: unknown): T[] {
  if (!Array.isArray(body)) {
    return []
  }

  const rows = body.filter(isRecord)

  if (endpoint === 'session_result') {
    return rows
      .filter(
        (row) =>
          finiteNumberOrNull(row.driver_number) !== null &&
          finiteNumberOrNull(row.position) !== null,
      )
      .map((row) => ({
        ...row,
        duration: Array.isArray(row.duration)
          ? numberArrayOrNull(row.duration)
          : finiteNumberOrNull(row.duration),
        gap_to_leader: gapValue(row.gap_to_leader),
      })) as T[]
  }

  if (endpoint === 'overtakes') {
    return rows
      .filter(
        (row) =>
          finiteNumberOrNull(row.overtaking_driver_number) !== null &&
          finiteNumberOrNull(row.overtaken_driver_number) !== null,
      )
      .map((row) => ({
        ...row,
        overtaken_driver_number: finiteNumberOrNull(
          row.overtaken_driver_number,
        ),
        overtaking_driver_number: finiteNumberOrNull(
          row.overtaking_driver_number,
        ),
      })) as T[]
  }

  if (endpoint === 'race_control') {
    return rows.map((row) => ({
      ...row,
      qualifying_phase: finiteNumberOrNull(row.qualifying_phase),
    })) as T[]
  }

  if (endpoint === 'car_data') {
    return rows.map((row) => ({
      ...row,
      drs: finiteNumberOrNull(row.drs),
    })) as T[]
  }

  if (endpoint === 'pit') {
    return rows.map((row) => ({
      ...row,
      lane_duration:
        finiteNumberOrNull(row.lane_duration) ??
        finiteNumberOrNull(row.pit_duration),
      stop_duration: finiteNumberOrNull(row.stop_duration),
    })) as T[]
  }

  return rows as T[]
}

async function fetchWithTimeout(
  url: string,
  options: { accessToken?: string | null; signal?: AbortSignal },
) {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(options.signal?.reason)
  const timeout = globalThis.setTimeout(
    () => controller.abort(new DOMException('OpenF1 request timed out', 'TimeoutError')),
    OPENF1_REQUEST_TIMEOUT_MS,
  )

  options.signal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    return await fetch(url, {
      headers: {
        accept: 'application/json',
        ...(options.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : {}),
      },
      signal: controller.signal,
    })
  } finally {
    globalThis.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}

const OPENF1_RATE_LIMIT_RETRY_MS = 2_000
const OPENF1_RATE_LIMIT_BACKOFF_CAP_MS = 15_000
const OPENF1_RATE_LIMIT_MAX_RETRIES = 2

let throttleQueue: Promise<void> = Promise.resolve()
let lastRequestAt = 0
let rateLimitedUntil = 0

/**
 * One request slot shared across every client, so concurrent fetch flows
 * (selected meeting + season standings) cannot stack their per-client gaps
 * and exceed the public API rate limit. A 429 pauses the whole queue, not
 * just the request that saw it.
 */
function nextRequestSlot(signal?: AbortSignal) {
  const slot = throttleQueue.then(async () => {
    const waitMs = Math.max(
      lastRequestAt + OPENF1_REQUEST_GAP_MS - Date.now(),
      rateLimitedUntil - Date.now(),
    )

    if (waitMs > 0) {
      await sleep(waitMs, signal)
    }

    lastRequestAt = Date.now()
  })

  // Keep the queue alive when a waiter aborts; only that caller fails.
  throttleQueue = slot.catch(() => {})

  return slot
}

function applyRateLimitBackoff(response: Response, attempt: number) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  const backoffMs = Math.min(
    retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : OPENF1_RATE_LIMIT_RETRY_MS * (attempt + 1),
    OPENF1_RATE_LIMIT_BACKOFF_CAP_MS,
  )

  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + backoffMs)
}

function makeOpenF1Client(options: {
  accessToken?: string | null
  signal?: AbortSignal
} = {}) {
  const { accessToken, signal } = options

  return async function fetchEndpoint<T>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ data: T[]; status: OpenF1EndpointStatus }> {
    try {
      for (let attempt = 0; ; attempt += 1) {
        await nextRequestSlot(signal)

        const response = await fetchWithTimeout(makeUrl(endpoint, params), {
          accessToken,
          signal,
        })
        const body = await response.json().catch(() => null)

        if (response.status === 429 && attempt < OPENF1_RATE_LIMIT_MAX_RETRIES) {
          applyRateLimitBackoff(response, attempt)
          continue
        }

        if (!response.ok) {
          const message =
            typeof body?.detail === 'string'
              ? body.detail
              : `HTTP ${response.status}`

          return {
            data: [],
            status: {
              endpoint,
              count: 0,
              ok: message === 'No results found.',
              message,
              statusCode: response.status,
            },
          }
        }

        const data = normalizeOpenF1Endpoint<T>(endpoint, body)

        return {
          data,
          status: {
            endpoint,
            count: data.length,
            ok: true,
            message: null,
            statusCode: response.status,
          },
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }

      return {
        data: [],
        status: {
          endpoint,
          count: 0,
          ok: false,
          message: error instanceof Error ? error.message : 'Request failed',
          statusCode: null,
        },
      }
    }
  }
}

function matchMeeting(trackId: string, meetings: OpenF1Meeting[]) {
  const matchers = trackMatchers[trackId] ?? [trackId.replace('-approx', '')]

  return (
    meetings.find((meeting) => {
      const haystack = normalizeText(
        `${meeting.circuit_short_name} ${meeting.location} ${meeting.meeting_name}`,
      )

      return matchers.some((matcher) => haystack.includes(normalizeText(matcher)))
    }) ?? null
  )
}

export function openF1StageForSession(
  session: Pick<OpenF1Session, 'session_name' | 'session_type'>,
): WeekendStage {
  const name = normalizeText(`${session.session_type} ${session.session_name}`)

  if (name.includes('sprint shootout') || name.includes('sprint qualifying')) {
    return 'sprintQualifying'
  }

  if (name.includes('qualifying')) {
    return 'qualifying'
  }

  if (name.includes('sprint')) {
    return 'sprint'
  }

  if (name.includes('race')) {
    return 'race'
  }

  if (name.includes('practice 3') || name.includes('free practice 3')) {
    return 'fp3'
  }

  if (name.includes('practice 2') || name.includes('free practice 2')) {
    return 'fp2'
  }

  return 'fp1'
}

export function selectOpenF1Session(
  sessions: OpenF1Session[],
  stage: WeekendStage,
) {
  return (
    sessions
      .filter((session) => !session.is_cancelled)
      .find((session) => openF1StageForSession(session) === stage) ?? null
  )
}

function isRaceTimingSession(session: OpenF1Session) {
  const stage = openF1StageForSession(session)
  return stage === 'race' || stage === 'sprint'
}

function miniSectorSessionScore(session: OpenF1Session) {
  const name = `${session.session_type} ${session.session_name}`.toLowerCase()

  if (name.includes('qualifying')) {
    return 4
  }

  if (name.includes('sprint shootout') || name.includes('sprint qualifying')) {
    return 3
  }

  if (name.includes('practice')) {
    return 2
  }

  return 1
}

function selectMiniSectorSession(sessions: OpenF1Session[]) {
  const now = new Date()

  return (
    sessions
      .filter(
        (session) =>
          !session.is_cancelled &&
          session.session_type.toLowerCase() !== 'race' &&
          new Date(session.date_start) <= now,
      )
      .sort((a, b) => {
        const scoreDelta = miniSectorSessionScore(b) - miniSectorSessionScore(a)

        return scoreDelta || b.date_start.localeCompare(a.date_start)
      })[0] ?? null
  )
}

function latestByDate<T extends { date: string }>(items: T[]) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

function summarize(bundle: Omit<OpenF1Bundle, 'summary'>): OpenF1Summary {
  const timingLaps = bundle.laps.length > 0 ? bundle.laps : bundle.miniSectorLaps
  const segmentLaps =
    bundle.miniSectorLaps.length > 0 ? bundle.miniSectorLaps : bundle.laps
  const bestLap =
    timingLaps
      .filter((lap) => lap.lap_duration !== null && lap.lap_duration > 0)
      .sort((a, b) => (a.lap_duration ?? Infinity) - (b.lap_duration ?? Infinity))[0] ??
    null
  const fastestPitStop =
    bundle.pit
      .filter((pit) => pit.stop_duration !== null && pit.stop_duration > 0)
      .sort((a, b) => (a.stop_duration ?? Infinity) - (b.stop_duration ?? Infinity))[0] ??
    null
  const maxSpeed =
    bundle.carData
      .filter((sample) => sample.speed > 0)
      .sort((a, b) => b.speed - a.speed)[0] ?? null
  const miniSectorSamples = segmentLaps.reduce(
    (total, lap) =>
      total +
      (lap.segments_sector_1?.length ?? 0) +
      (lap.segments_sector_2?.length ?? 0) +
      (lap.segments_sector_3?.length ?? 0),
    0,
  )

  return {
    bestLap,
    fastestPitStop,
    latestRaceControl: latestByDate(bundle.raceControl),
    latestWeather: latestByDate(bundle.weather),
    maxSpeed,
    miniSectorSamples,
    telemetrySamples: bundle.carData.length + bundle.location.length,
  }
}

export async function fetchOpenF1Bundle(
  trackId: string,
  request: OpenF1BundleRequest,
): Promise<OpenF1Bundle> {
  const {
    accessToken = null,
    signal,
    stage: requestedStage,
    year = OPENF1_YEAR,
  } = request
  const authMode = accessToken ? 'bearer' : 'public'
  const fetchEndpoint = makeOpenF1Client({ accessToken, signal })
  const endpointStatuses: OpenF1EndpointStatus[] = []
  const meetingsResponse = await fetchEndpoint<OpenF1Meeting>('meetings', { year })
  endpointStatuses.push(meetingsResponse.status)

  const meetings = meetingsResponse.data
    .filter((meeting) => !meeting.meeting_name.toLowerCase().includes('testing'))
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
  const meeting = matchMeeting(trackId, meetings)

  if (!meeting) {
    return {
      authMode,
      year,
      requestedStage,
      meeting: null,
      sessions: [],
      selectedSession: null,
      raceSession: null,
      miniSectorSession: null,
      drivers: [],
      miniSectorDrivers: [],
      startingGrid: [],
      sessionResult: [],
      laps: [],
      miniSectorLaps: [],
      weather: [],
      pit: [],
      stints: [],
      raceControl: [],
      positions: [],
      intervals: [],
      overtakes: [],
      teamRadio: [],
      carData: [],
      location: [],
      championshipDrivers: [],
      championshipTeams: [],
      endpointStatuses,
      summary: emptySummary,
    }
  }

  const sessionsResponse = await fetchEndpoint<OpenF1Session>('sessions', {
    meeting_key: meeting.meeting_key,
  })
  endpointStatuses.push(sessionsResponse.status)

  const sessions = sessionsResponse.data.sort((a, b) =>
    a.date_start.localeCompare(b.date_start),
  )
  const raceSession =
    sessions.find((session) => session.session_name === 'Race') ??
    sessions.find((session) => session.session_type === 'Race') ??
    null
  const selectedSession = selectOpenF1Session(sessions, requestedStage)
  const miniSectorSession =
    selectedSession && !isRaceTimingSession(selectedSession)
      ? selectedSession
      : selectMiniSectorSession(sessions)

  const baseBundle = {
    authMode,
    year,
    requestedStage,
    meeting,
    sessions,
    selectedSession,
    raceSession,
    miniSectorSession,
    drivers: [],
    miniSectorDrivers: [],
    startingGrid: [],
    sessionResult: [],
    laps: [],
    miniSectorLaps: [],
    weather: [],
    pit: [],
    stints: [],
    raceControl: [],
    positions: [],
    intervals: [],
    overtakes: [],
    teamRadio: [],
    carData: [],
    location: [],
    championshipDrivers: [],
    championshipTeams: [],
    endpointStatuses,
  } satisfies Omit<OpenF1Bundle, 'summary'>

  async function load<T>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
  ) {
    const response = await fetchEndpoint<T>(endpoint, params)
    endpointStatuses.push(response.status)
    return response.data
  }

  async function loadMiniSectorData(
    mainDrivers: OpenF1Driver[] = [],
    mainLaps: OpenF1Lap[] = [],
  ) {
    if (
      !miniSectorSession ||
      miniSectorSession.is_cancelled ||
      new Date(miniSectorSession.date_start) > new Date()
    ) {
      return {
        miniSectorDrivers: [],
        miniSectorLaps: [],
      }
    }

    const sessionKey = miniSectorSession.session_key

    if (selectedSession?.session_key === sessionKey) {
      return {
        miniSectorDrivers: mainDrivers,
        miniSectorLaps: mainLaps,
      }
    }

    return {
      miniSectorDrivers: await load<OpenF1Driver>('drivers', {
        session_key: sessionKey,
      }),
      miniSectorLaps: await load<OpenF1Lap>('laps', { session_key: sessionKey }),
    }
  }

  if (!selectedSession || selectedSession.is_cancelled || meeting.is_cancelled) {
    const miniSectorData = await loadMiniSectorData()
    const bundleWithoutSummary = {
      ...baseBundle,
      ...miniSectorData,
    } satisfies Omit<OpenF1Bundle, 'summary'>

    return {
      ...bundleWithoutSummary,
      summary: summarize(bundleWithoutSummary),
    }
  }

  const sessionStart = new Date(selectedSession.date_start)
  const now = new Date()

  if (now < sessionStart) {
    const miniSectorData = await loadMiniSectorData()
    const bundleWithoutSummary = {
      ...baseBundle,
      ...miniSectorData,
    } satisfies Omit<OpenF1Bundle, 'summary'>

    return {
      ...bundleWithoutSummary,
      summary: summarize(bundleWithoutSummary),
    }
  }

  const sessionKey = selectedSession.session_key
  // Race control loads first so completed-session sample windows can anchor
  // to the factual chequered flag instead of the scheduled session end.
  const raceControl = await load<OpenF1RaceControl>('race_control', {
    session_key: sessionKey,
  })
  const sessionIsRunning =
    now >= sessionStart && now <= new Date(selectedSession.date_end)
  const completedAnchor = sessionIsRunning ? null : chequeredFlagDate(raceControl)
  const recentTimingFrom = recentWindowStart(selectedSession, 15, completedAnchor)
  const recentTelemetryFrom = recentWindowStart(selectedSession, 2, completedAnchor)
  // Bound completed-session telemetry shortly after the flag so the request
  // stays a small replay window rather than the whole cool-down feed.
  const telemetryUntil = completedAnchor
    ? compactDate(new Date(new Date(completedAnchor).getTime() + 60_000))
    : undefined

  const raceTimingSession = isRaceTimingSession(selectedSession)
  const championshipSession = requestedStage === 'race'
  const [
    drivers,
    startingGrid,
    sessionResult,
    laps,
    weather,
    pit,
    stints,
    positions,
    intervals,
    overtakes,
    teamRadio,
    carData,
    location,
    championshipDrivers,
    championshipTeams,
  ] = await Promise.all([
    load<OpenF1Driver>('drivers', { session_key: sessionKey }),
    raceTimingSession
      ? load<OpenF1StartingGrid>('starting_grid', { session_key: sessionKey })
      : Promise.resolve([]),
    load<OpenF1SessionResult>('session_result', { session_key: sessionKey }),
    load<OpenF1Lap>('laps', { session_key: sessionKey }),
    load<OpenF1Weather>('weather', { session_key: sessionKey }),
    load<OpenF1Pit>('pit', { session_key: sessionKey }),
    load<OpenF1Stint>('stints', { session_key: sessionKey }),
    load<OpenF1Position>('position', {
      session_key: sessionKey,
      'date>': recentTimingFrom,
    }),
    raceTimingSession
      ? load<OpenF1Interval>('intervals', {
          session_key: sessionKey,
          'date>': recentTimingFrom,
        })
      : Promise.resolve([]),
    raceTimingSession
      ? load<OpenF1Overtake>('overtakes', { session_key: sessionKey })
      : Promise.resolve([]),
    load<OpenF1TeamRadio>('team_radio', { session_key: sessionKey }),
    load<OpenF1CarData>('car_data', {
      session_key: sessionKey,
      'date>': recentTelemetryFrom,
      'date<': telemetryUntil,
    }),
    load<OpenF1Location>('location', {
      session_key: sessionKey,
      'date>': recentTelemetryFrom,
      'date<': telemetryUntil,
    }),
    championshipSession
      ? load<OpenF1ChampionshipDriver>('championship_drivers', {
          session_key: sessionKey,
        })
      : Promise.resolve([]),
    championshipSession
      ? load<OpenF1ChampionshipTeam>('championship_teams', {
          session_key: sessionKey,
        })
      : Promise.resolve([]),
  ])
  const miniSectorData = await loadMiniSectorData(drivers, laps)
  const bundleWithoutSummary = {
    ...baseBundle,
    ...miniSectorData,
    raceControl,
    drivers,
    startingGrid,
    sessionResult,
    laps,
    weather,
    pit,
    stints,
    positions,
    intervals,
    overtakes,
    teamRadio,
    carData,
    location,
    championshipDrivers,
    championshipTeams,
  } satisfies Omit<OpenF1Bundle, 'summary'>

  return {
    ...bundleWithoutSummary,
    summary: summarize(bundleWithoutSummary),
  }
}

/**
 * Fetch the latest completed race in a season solely for field calibration.
 * It remains independent from the currently selected circuit, so switching to
 * a future round does not quietly discard the factual standings signal.
 */
export async function fetchOpenF1SeasonStandings(
  year = OPENF1_YEAR,
  signal?: AbortSignal,
  asOfIso?: string | null,
): Promise<OpenF1StandingsSnapshot> {
  const fetchEndpoint = makeOpenF1Client({ signal })
  const meetings = await fetchEndpoint<OpenF1Meeting>('meetings', { year })
  const requestedCutoff = asOfIso ? new Date(asOfIso).getTime() : Number.NaN
  const now = Number.isFinite(requestedCutoff)
    ? Math.min(Date.now(), requestedCutoff)
    : Date.now()
  const completedMeetings = meetings.data
    .filter(
      (meeting) =>
        !meeting.is_cancelled && new Date(meeting.date_end).getTime() <= now,
    )
    .sort((a, b) => b.date_end.localeCompare(a.date_end))

  for (const meeting of completedMeetings) {
    const sessions = await fetchEndpoint<OpenF1Session>('sessions', {
      meeting_key: meeting.meeting_key,
    })
    const raceSession = sessions.data
      .filter(
        (session) =>
          !session.is_cancelled &&
          new Date(session.date_end).getTime() <= now &&
          (session.session_name === 'Race' || session.session_type === 'Race'),
      )
      .sort((a, b) => b.date_end.localeCompare(a.date_end))[0]

    if (!raceSession) {
      continue
    }

    const sessionKey = raceSession.session_key
    // Keep the public API request cadence deliberate; this path runs in the
    // background and must never contend with the live selected-meeting fetch.
    const drivers = await fetchEndpoint<OpenF1Driver>('drivers', {
      session_key: sessionKey,
    })
    const championshipDrivers = await fetchEndpoint<OpenF1ChampionshipDriver>(
      'championship_drivers',
      { session_key: sessionKey },
    )
    const championshipTeams = await fetchEndpoint<OpenF1ChampionshipTeam>(
      'championship_teams',
      { session_key: sessionKey },
    )

    if (championshipTeams.data.length > 0) {
      return {
        championshipDrivers: championshipDrivers.data,
        championshipTeams: championshipTeams.data,
        drivers: drivers.data,
        raceSession,
        sourceYear: year,
        asOfDate: new Date(now).toISOString(),
        snapshotMeetingKey: meeting.meeting_key,
        snapshotSessionKey: sessionKey,
        snapshotSource: 'api',
      }
    }
  }

  return {
    championshipDrivers: [],
    championshipTeams: [],
    drivers: [],
    raceSession: null,
    sourceYear: year,
    asOfDate: new Date(now).toISOString(),
    snapshotMeetingKey: null,
    snapshotSessionKey: null,
    snapshotSource: 'api',
  }
}
