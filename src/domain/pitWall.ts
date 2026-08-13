/**
 * Pure derivations behind the PIT WALL panel.
 *
 * The panel is a race-engineering screen, so every value it shows must come
 * from state the simulator already owns. Nothing here invents telemetry: when
 * a value is not modelled for the active category, these helpers return an
 * explicit unavailable marker rather than a plausible-looking number.
 */
import {
  isPracticeStage,
  isQualifyingStage,
  isRaceDistanceSession,
} from '../simulation/sessionRules'
import {
  tireDisplayForLapRecord,
  type LapTireDisplay,
} from '../simulation/classification'
import type { SeriesId } from '../series/types'
import type {
  CarComponents,
  CarSnapshot,
  LapRecord,
  RaceEvent,
  RaceEventKind,
  TireCompound,
  WeekendStage,
} from '../types'

/** Rendered wherever the simulator holds no measured value. */
export const PIT_WALL_UNAVAILABLE = '--'
/** Rendered where a system does not exist in the active category at all. */
export const PIT_WALL_NOT_APPLICABLE = 'N/A'

export type PitWallTabId =
  | 'overview'
  | 'lap-log'
  | 'strategy'
  | 'systems'
  | 'weather'
  | 'race-control'

export const pitWallTabs: Array<{ id: PitWallTabId; label: string }> = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'lap-log', label: 'LAP LOG' },
  { id: 'strategy', label: 'STRATEGY' },
  { id: 'systems', label: 'CAR SYSTEMS' },
  { id: 'weather', label: 'WEATHER & TRACK' },
  { id: 'race-control', label: 'RACE CONTROL' },
]

/**
 * Provenance tags reuse the dashboard's existing vocabulary so one chip means
 * the same thing on the pit wall as it does in the data ledger.
 */
export type PitWallSource =
  | 'LIVE'
  | 'HIST'
  | 'SIM'
  | 'OBS'
  | 'OFF'
  | 'CAL'
  | 'FIA'
  /** Japanese Automobile Federation source-backed SUPER FORMULA rule. */
  | 'JAF'
  /** Verified event special regulation or official notice. */
  | 'EVENT'
  | 'UNAVAILABLE'

/**
 * A field only carries an observed tag when an OpenF1 sample actually backs it
 * for this car; otherwise it stays `SIM`, which is what the race engine is.
 */
export function pitWallObservedSource(
  isObserved: boolean,
  openF1Mode: 'LIVE' | 'HIST' | 'SIM',
): PitWallSource {
  if (!isObserved || openF1Mode === 'SIM') {
    return 'SIM'
  }

  return openF1Mode
}

// --- component condition ---------------------------------------------------

/**
 * Condition bands for the pit wall gauges. `componentPacePenaltySeconds` only
 * starts charging lap time below 45% (power unit) and 35% (gearbox), so WATCH
 * is set above the first penalty and CRITICAL where one is already accruing.
 * These are the single source for every condition colour and label.
 */
export const componentConditionThresholds = {
  critical: 40,
  watch: 60,
} as const

export type ComponentConditionState = 'good' | 'watch' | 'critical'

export const componentConditionLabels: Record<ComponentConditionState, string> =
  {
    critical: 'CRITICAL',
    good: 'GOOD',
    watch: 'WATCH',
  }

export function componentConditionState(
  conditionPercent: number,
): ComponentConditionState {
  if (conditionPercent < componentConditionThresholds.critical) {
    return 'critical'
  }

  return conditionPercent < componentConditionThresholds.watch
    ? 'watch'
    : 'good'
}

/** Short enough to stay readable beside a gauge in a dense column. */
export const componentDisplayLabels: Record<keyof CarComponents, string> = {
  controlElectronics: 'Control elec.',
  energyStore: 'Energy Store',
  exhaust: 'Exhaust',
  gearbox: 'Gearbox',
  ice: 'ICE',
  mguK: 'MGU-K',
  turbo: 'Turbo',
}

// --- session mode ----------------------------------------------------------

export type PitWallSessionMode = 'race' | 'practice' | 'qualifying'

export type PitWallSession = {
  mode: PitWallSessionMode
  /** Shown in the header so the screen states which session it is reading. */
  label: string
  /**
   * True only for a race-distance session. Race strategy, the rejoin
   * projection, the grid slot, and the lap-of-total counter are meaningless in
   * a timed session, so they are reported as not applicable rather than
   * computed from a race distance the session will never run.
   */
  runsRaceDistance: boolean
  /** Explains, in a tooltip, why a race-only read-out is not applicable. */
  raceOnlyReason: string
}

/**
 * The pit wall is available in every session, but a practice or qualifying
 * session has no race distance, no grid, and no stint plan. This is the single
 * place that decides which read-outs those sessions may show.
 */
export function pitWallSessionFor(stage: WeekendStage): PitWallSession {
  const label = isPracticeStage(stage)
    ? 'PRACTICE'
    : isQualifyingStage(stage)
      ? 'QUALIFYING'
      : 'RACE'

  return {
    label,
    mode: isRaceDistanceSession(stage)
      ? 'race'
      : isQualifyingStage(stage)
        ? 'qualifying'
        : 'practice',
    raceOnlyReason: `This is a ${label.toLowerCase()} session, so it has no race distance to plan a stop against`,
    runsRaceDistance: isRaceDistanceSession(stage),
  }
}

// --- category capabilities -------------------------------------------------

export type PitWallCapabilities = {
  /** 2026 hybrid Energy Store, ERS modes, and deployment/recovery power. */
  hybridErs: boolean
  /** 2026 driver-adjustable front/rear bodywork. */
  activeAero: boolean
  /** SUPER FORMULA push-to-pass allocation. */
  ots: boolean
  /** Name of the category's overtake aid, used for the aero/zone read-out. */
  overtakeLabel: string
  /**
   * Name for `CarSnapshot.overtakeStatus`. In 2026 F1 that field is the
   * electrical Overtake, which is a separate system from active aero, so it
   * must not repeat the `ACTIVE AERO` label next to the aero mode row.
   */
  overtakeStatusLabel: string
}

/**
 * F1-only systems must not be printed with fabricated values for SUPER
 * FORMULA. The overtake system already differs per category in the
 * series registry, so the capability set is derived from it rather than from a
 * second hand-maintained list.
 */
export function pitWallCapabilitiesFor(options: {
  seriesId: SeriesId
  overtakeSystem: 'active-aero' | 'ots'
  /** Prefer the live runtime branch when one is available. */
  runtimeSystems?: CarSnapshot['runtimeSystems']
}): PitWallCapabilities {
  const { overtakeSystem, runtimeSystems, seriesId } = options

  if (runtimeSystems) {
    return pitWallCapabilitiesForRuntime(runtimeSystems)
  }

  return {
    activeAero: overtakeSystem === 'active-aero',
    hybridErs: seriesId === 'f1-custom',
    ots: overtakeSystem === 'ots',
    overtakeLabel:
      overtakeSystem === 'active-aero'
        ? 'ACTIVE AERO'
        : 'OTS',
    overtakeStatusLabel:
      overtakeSystem === 'active-aero'
        ? 'Overtake'
        : 'OTS',
  }
}

/**
 * Live category truth is authoritative over registry metadata. In particular,
 * a SUPER FORMULA base rule with no verified event OTS pack must not be
 * presented as an enabled allocation merely because the category supports OTS
 * in principle.
 */
export function pitWallCapabilitiesForRuntime(
  runtimeSystems: CarSnapshot['runtimeSystems'],
): PitWallCapabilities {
  if (runtimeSystems.kind === 'f1') {
    return {
      activeAero: true,
      hybridErs: true,
      ots: false,
      overtakeLabel: 'ACTIVE AERO',
      overtakeStatusLabel: 'Overtake',
    }
  }

  return {
    activeAero: false,
    hybridErs: false,
    ots: runtimeSystems.ots.availability === 'verified-event-rule',
    overtakeLabel: 'OTS',
    overtakeStatusLabel: 'OTS',
  }
}

// --- running order intervals ----------------------------------------------

export type PitWallIntervals = {
  aheadCode: string | null
  behindCode: string | null
  intervalAheadSeconds: number | null
  intervalBehindSeconds: number | null
}

/**
 * The car behind's own `gapToAhead` is the interval to the selected car, so no
 * second gap model is needed here.
 */
export function pitWallIntervals(
  cars: CarSnapshot[],
  driverId: string,
): PitWallIntervals {
  const running = cars
    .filter((car) => car.status !== 'dns' && car.status !== 'retired')
    .slice()
    .sort((left, right) => left.position - right.position)
  const index = running.findIndex((car) => car.driverId === driverId)

  if (index < 0) {
    return {
      aheadCode: null,
      behindCode: null,
      intervalAheadSeconds: null,
      intervalBehindSeconds: null,
    }
  }

  const ahead = index > 0 ? running[index - 1] : null
  const behind = index + 1 < running.length ? running[index + 1] : null

  return {
    aheadCode: ahead?.code ?? null,
    behindCode: behind?.code ?? null,
    intervalAheadSeconds: ahead ? running[index].gapToAhead : null,
    intervalBehindSeconds: behind ? behind.gapToAhead : null,
  }
}

// --- lap log ---------------------------------------------------------------

export type PitWallLapLogRow = {
  invalidReason: string | null
  isPersonalBestLap: boolean
  /** Per sector, true when this lap owns the car's best measured split. */
  isPersonalBestSector: [boolean, boolean, boolean]
  isValid: boolean
  lap: number
  lapTimeSeconds: number
  pitStop: boolean
  position: number
  /** Q1/Q2/Q3 or SQ1-3 for a timed session; absent on a race lap. */
  segment: string | null
  sectors: [number, number, number]
  /** Discriminated F1 Pirelli or SF control-tyre presentation payload. */
  tireDisplay: LapTireDisplay
}

/** A split is only comparable once it has actually been measured. */
function measured(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Per-lap log with the car's own purple laps and splits marked.
 *
 * A deleted lap can never own a personal best, which matches how the timing
 * screen scopes its own bests, and rows are returned newest first so the last
 * lap is readable without scrolling a long race.
 */
export function pitWallLapLog(laps: LapRecord[]): PitWallLapLogRow[] {
  const valid = laps.filter((lap) => lap.isValid)
  const bestLapTime = valid.reduce<number | null>(
    (best, lap) =>
      measured(lap.lapTimeSeconds) && (best === null || lap.lapTimeSeconds < best)
        ? lap.lapTimeSeconds
        : best,
    null,
  )
  const bestSectors = [0, 1, 2].map((index) =>
    valid.reduce<number | null>((best, lap) => {
      const split = lap.sectors[index]

      return measured(split) && (best === null || split < best) ? split : best
    }, null),
  )

  return laps
    .slice()
    .sort((left, right) => right.lap - left.lap)
    .map((lap) => ({
      invalidReason: lap.invalidReason,
      isPersonalBestLap:
        lap.isValid && bestLapTime !== null && lap.lapTimeSeconds === bestLapTime,
      isPersonalBestSector: [0, 1, 2].map(
        (index) =>
          lap.isValid &&
          bestSectors[index] !== null &&
          lap.sectors[index] === bestSectors[index],
      ) as [boolean, boolean, boolean],
      isValid: lap.isValid,
      lap: lap.lap,
      lapTimeSeconds: lap.lapTimeSeconds,
      pitStop: lap.pitStop,
      position: lap.position,
      sectors: lap.sectors,
      segment: lap.segment ?? null,
      tireDisplay: tireDisplayForLapRecord(lap),
    }))
}

// --- manual commands -------------------------------------------------------

export const pitWallBoxCompounds: TireCompound[] = ['S', 'M', 'H', 'I', 'W']

export type PitWallBoxCommand = {
  compound: TireCompound
  disabled: boolean
  /** Always populated when disabled, so the button can explain itself. */
  disabledReason: string | null
  setsRemaining: number
}

/**
 * A box call is only valid for a car that is actually circulating and only for
 * a compound the car still has a set of.
 */
export function pitWallBoxCommands(
  car: Pick<CarSnapshot, 'runtimeSystems' | 'status'>,
): PitWallBoxCommand[] {
  // A SUPER FORMULA control-tyre operation has no sourced selection command
  // yet. Returning no F1 compound calls is safer than presenting disabled
  // S/M/H/I/W controls as if they were meaningful to that category.
  if (car.runtimeSystems.kind !== 'f1') {
    return []
  }

  const carIsRunning = car.status === 'running'
  const tireSetsRemaining = car.runtimeSystems.tires.tireSetsRemaining

  return pitWallBoxCompounds.map((compound) => {
    const setsRemaining = tireSetsRemaining[compound] ?? 0
    const disabledReason = !carIsRunning
      ? `The car is not running (${car.status}), so no box call can be sent`
      : setsRemaining <= 0
        ? `No ${compound} sets remain in this car's allocation`
        : null

    return {
      compound,
      disabled: disabledReason !== null,
      disabledReason,
      setsRemaining,
    }
  })
}

export function pitWallPaceCommandDisabledReason(
  car: Pick<CarSnapshot, 'status'>,
) {
  return car.status === 'running' || car.status === 'pit'
    ? null
    : `The car is not circulating (${car.status}), so no pace instruction can be sent`
}

// --- race control ----------------------------------------------------------

export type PitWallRaceControlFilter =
  | 'all'
  | 'flags'
  | 'penalties'
  | 'selected-car'

export const pitWallRaceControlFilters: Array<{
  id: PitWallRaceControlFilter
  label: string
}> = [
  { id: 'all', label: 'ALL' },
  { id: 'flags', label: 'FLAGS' },
  { id: 'penalties', label: 'PENALTIES' },
  { id: 'selected-car', label: 'SELECTED CAR' },
]

export type PitWallRaceControlEntry = {
  id: string
  kind: RaceEventKind
  /** True when the entry names the selected car's code. */
  mentionsSelectedCar: boolean
  message: string
  source: 'SIM' | 'OPENF1'
  timeLabel: string
}

const flagKinds = new Set<RaceEventKind>(['flag'])
const penaltyKinds = new Set<RaceEventKind>([
  'penalty',
  'investigation',
  'track-limit',
])

/**
 * OpenF1 race-control rows arrive as free text with no kind, so they are the
 * only entries that need pattern matching. Simulation events carry their own
 * `kind` and are never re-derived from their message.
 */
export function raceControlKindFromMessage(message: string): RaceEventKind {
  const text = message.toUpperCase()

  if (/\bTRACK LIMITS?\b/u.test(text)) return 'track-limit'
  if (/\b(?:PENALTY|PENALISED|PENALIZED|DRIVE THROUGH|STOP\/GO)\b/u.test(text)) {
    return 'penalty'
  }
  if (/\b(?:UNDER INVESTIGATION|INVESTIGATION|NOTED)\b/u.test(text)) {
    return 'investigation'
  }
  if (
    /\b(?:FLAG|SAFETY CAR|VSC|VIRTUAL SAFETY CAR|SC DEPLOYED|CLEAR|YELLOW|RED|GREEN|CHEQUERED|PIT LANE (?:CLOSED|OPEN)|RESTART)\b/u.test(
      text,
    )
  ) {
    return 'flag'
  }
  if (/\b(?:INCIDENT|COLLISION|CONTACT)\b/u.test(text)) return 'incident'
  if (/\b(?:PIT|BOX)\b/u.test(text)) return 'pit'
  if (/\b(?:RAIN|WEATHER|DRY|WET)\b/u.test(text)) return 'weather'

  return 'info'
}

/** Word-boundary match so `NOR` never matches inside another word. */
function mentionsCode(message: string, code: string) {
  if (code.length === 0) {
    return false
  }

  return new RegExp(`(?:^|[^A-Z0-9])${code}(?:[^A-Z0-9]|$)`, 'u').test(
    message.toUpperCase(),
  )
}

export function pitWallRaceControlEntries(options: {
  events: RaceEvent[]
  observedLog?: Array<{
    id: string
    message: string
    source: string
    timeLabel: string
  }>
  selectedCarCode: string
}): PitWallRaceControlEntry[] {
  const { events, observedLog, selectedCarCode } = options
  const observed = (observedLog ?? []).filter(
    (entry) => entry.source === 'OPENF1',
  )

  if (observed.length > 0) {
    return observed.map((entry) => ({
      id: entry.id,
      kind: raceControlKindFromMessage(entry.message),
      mentionsSelectedCar: mentionsCode(entry.message, selectedCarCode),
      message: entry.message,
      source: 'OPENF1' as const,
      timeLabel: entry.timeLabel,
    }))
  }

  return events.map((event) => ({
    id: event.id,
    kind: event.kind,
    mentionsSelectedCar: mentionsCode(event.message, selectedCarCode),
    message: event.message,
    source: 'SIM' as const,
    timeLabel: event.timeLabel,
  }))
}

export function filterPitWallRaceControl(
  entries: PitWallRaceControlEntry[],
  filter: PitWallRaceControlFilter,
) {
  if (filter === 'flags') {
    return entries.filter((entry) => flagKinds.has(entry.kind))
  }

  if (filter === 'penalties') {
    return entries.filter((entry) => penaltyKinds.has(entry.kind))
  }

  if (filter === 'selected-car') {
    return entries.filter((entry) => entry.mentionsSelectedCar)
  }

  return entries
}
