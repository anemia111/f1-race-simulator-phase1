import type {
  CategoryRaceFormat,
  Driver,
  DryTireCompound,
  Team,
  TireSetAllocation,
  TrackDefinition,
  WeekendStage,
} from '../types'
import type { DriverAssignment, DriverPoolRecord } from './driverPool'
import type {
  ExecutableSeriesId,
  RuntimeVehicleEraId,
} from './seriesIds'

export type SeriesId = ExecutableSeriesId

export type SeriesSource = {
  label: string
  sourceDate: string
  url: string
}

export type SeriesQualifyingSegmentRule = {
  advanceCount: number | null
  durationSeconds: number
  name: 'Q1' | 'Q2' | 'Q3'
}

/**
 * A small, serialisable reference to the document that owns an operational
 * value.  SUPER FORMULA's base regulation intentionally delegates several
 * race-operation values to event papers, so a source reference alone must
 * never be mistaken for a numeric default.
 */
export type SeriesRuleProvenance = {
  article?: string
  authority:
    | 'binding-base-regulation'
    | 'binding-calendar-notice'
    | 'binding-event-special-regulation'
    | 'official-calendar'
  checksum: string | null
  effectiveFrom: string | null
  publishedAt: string
  sourceId: string
  url: string
}

export type UnavailableSeriesEventOperation = {
  availability: 'unavailable'
  provenance: SeriesRuleProvenance
  reason: string
  value: null
}

export type VerifiedSeriesEventOperation<Value> = {
  availability: 'verified-event-override'
  provenance: SeriesRuleProvenance
  value: Value
}

export type SeriesEventOperation<Value> =
  | UnavailableSeriesEventOperation
  | VerifiedSeriesEventOperation<Value>

export type SuperFormulaRaceDistanceOperation = {
  laps: number
  overallTimeLimitSeconds: number | null
  timeLimitSeconds: number | null
}

/**
 * OTS is identified as a system, but its activation, allocation, boost and
 * cooldown live in an event special regulation or official notice.  The base
 * rule has no simulatable fallback.
 */
export type SuperFormulaOtsEventOperation = {
  activationConditions: string
  allocationSeconds: number
  boostPowerKw: number
  cooldownSeconds: number
}

export type SuperFormulaEventOperations = {
  mandatoryPitStop: SeriesEventOperation<boolean>
  ots: SeriesEventOperation<SuperFormulaOtsEventOperation>
  raceDistance: SeriesEventOperation<SuperFormulaRaceDistanceOperation>
}

export type F1TireRules = {
  dryLabels: Record<DryTireCompound, string>
  qualifyingDryCompound: DryTireCompound
  sprintAllocation: TireSetAllocation | null
  standardAllocation: TireSetAllocation
}

/**
 * This is deliberately not a `TireSetAllocation`: the SUPER FORMULA control
 * tyre rule has one dry and one wet specification, rather than F1's
 * H/M/S/I/W family.  The per-event available sets are separate event input.
 */
export type SuperFormulaControlTireRules = {
  dry: {
    label: 'Yokohama Dry'
    maxSetsPerCarPerRace: number
    provenance: SeriesRuleProvenance
  }
  kind: 'yokohama-control-tyres-2026'
  wet: {
    label: 'Yokohama Wet'
    maxSetsPerCarPerRace: number
    provenance: SeriesRuleProvenance
  }
}

type SharedSeriesRules = {
  championshipTeamScoring: 'all-cars' | 'best-two'
  freePracticeDurationSeconds: number
  points: {
    fastestLap: {
      maximumClassifiedPosition: number
      minimumCompletionRatio: number
      points: number
    } | null
    feature: number[]
    qualifying: number[]
    reduced: {
      feature: [number[], number[], number[]]
      sprint: [number[], number[], number[]]
    } | null
    sprint: number[]
  }
  race: CategoryRaceFormat
  qualifying: {
    breakSeconds: number
    format: 'knockout' | 'single-session' | 'grouped'
      grouping?: 'balanced' | 'car-number-parity'
    segments: SeriesQualifyingSegmentRule[]
  }
  raceLabel: string
  sprintGridReverseCount: number
  supportsOpenF1: boolean
  tireSupplier: 'Pirelli' | 'Yokohama'
  vehicleBaseRating: number | null
  weekendStages: WeekendStage[]
}

/** The unchanged F1 surface, explicitly separated from the SF surface. */
export type F1SeriesRules = SharedSeriesRules & {
  featureRaceMandatoryPitStop: boolean
  featureRaceTwoDryCompounds: boolean
  overtakeActivation: 'first-detection' | 'after-one-lap' | 'immediate'
  overtakeSystem: 'active-aero'
  raceDistanceRatio: number
  tireSupplier: 'Pirelli'
  tires: F1TireRules
}

/**
 * Binding JAF base rules plus fail-closed event-operation placeholders.
 * `eventOperations` only gains a usable value from a provenance-bearing
 * calendar/event override; it never carries a historic generic SF profile.
 */
export type SuperFormulaSeriesRules = SharedSeriesRules & {
  eventOperations: SuperFormulaEventOperations
  overtakeSystem: 'ots'
  tireSupplier: 'Yokohama'
  tires: SuperFormulaControlTireRules
}

export type SeriesRules = F1SeriesRules | SuperFormulaSeriesRules

export function isF1SeriesRules(
  rules: SeriesRules,
): rules is F1SeriesRules {
  return rules.overtakeSystem === 'active-aero'
}

export function isSuperFormulaSeriesRules(
  rules: SeriesRules,
): rules is SuperFormulaSeriesRules {
  return rules.overtakeSystem === 'ots'
}

export type SeriesCalendarEvent = {
  cancelled?: boolean
  /**
   * F1-compatible event fields.  SUPER FORMULA never uses these generic
   * values: its event operations live under `eventOperations` below.
   */
  featurePoints?: number[]
  featureRaceMandatoryPitStop?: boolean
  /**
   * Partial because an event may only publish one operation.  The resolver
   * combines it with the explicitly unavailable series-level default.
   */
  eventOperations?: Partial<SuperFormulaEventOperations>
  gridSourceTrackId?: string
  id: string
  qualifying?: SeriesRules['qualifying']
  raceCount: number
  raceLaps?: number
  raceOverallTimeLimitSeconds?: number
  raceTimeLimitSeconds?: number
  round: number
  sprint?: boolean
  trackId: string
  weekendStages?: WeekendStage[]
}

export type SeriesPackage = {
  calendar: SeriesCalendarEvent[]
  carCount: number
  drivers: Driver[]
  id: SeriesId
  label: string
  rules: SeriesRules
  shortLabel: string
  sources: SeriesSource[]
  teamCount: number
  teams: Team[]
  tracks: TrackDefinition[]
  vehicleEraId: RuntimeVehicleEraId
}

export type { DriverPoolRecord }
export type DriverAssignmentRecord = DriverAssignment
