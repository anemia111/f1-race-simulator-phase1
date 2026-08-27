import type {
  CategoryRaceFormat,
  CarSnapshot,
  F1RechargeSessionType,
  FiaPuEventInput,
  FiaPuRechargeRule,
  RechargeLimit,
  RechargeRuleDefinition,
  TimedRunPhase,
  TrackDefinition,
  WeekendStage,
  WeatherState,
} from '../types'
import { raceLapsFor } from './raceEvents'
import { isDryCompound } from './tires'

export const FIA_2026_REGULATION_PROFILE = {
  asOf: '2026-08-05',
  sporting: {
    approvedAt: '2026-08-03',
    issue: '08',
    label: 'FIA 2026 F1 Sporting Regulations Issue 08',
    publishedAt: '2026-08-05',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_08_-_2026-08-05_7.pdf',
  },
  technical: {
    approvedAt: '2026-08-03',
    issue: '20',
    label: 'FIA 2026 F1 Technical Regulations Issue 20',
    publishedAt: '2026-08-05',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf',
  },
  operational: {
    approvedAt: '2026-08-03',
    issue: '10',
    label: 'FIA 2026 F1 Operational Regulations Issue 10',
    publishedAt: '2026-08-05',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_10_-_2026-08-05.pdf',
  },
  drivingStandards: {
    issue: '01',
    label: '2026 Formula 1 Driving Standards Guidelines v01',
    url: 'https://www.fia.com/sites/default/files/2026_f1_driving_standards_guidelines.pdf',
  },
  penaltyGuidelines: {
    issue: '01',
    label: '2026 Formula 1 Penalty Guidelines v01',
    url: 'https://www.fia.com/sites/default/files/2026_f1_penalty_guidelines.pdf',
  },
  energyRefinement: {
    date: '2026-04-20',
    label: 'FIA 2026 energy-management refinements',
    url: 'https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders',
  },
  heatHazard: {
    declarationThresholdHeatIndexC: 31,
    declaredSessionMassIncreaseKg: 5,
    otherSessionMassIncreaseKg: 2,
    article: 'B1.5.10 / C4.6',
  },
  activeAero: {
    fullActivationAllowedInLowGrip: false,
    partialActivationAllowedInLowGrip: true,
    article: 'B7.1.1-B7.1.2',
  },
  overtake: {
    allowedInLowGrip: false,
    article: 'B7.2.2',
  },
  energy: {
    maxErsPowerKw: 350,
    usableStateOfChargeWindowMj: 4,
    publicRechargeLimitMj: 8.5,
    /** Simulator reference policy when an event PU document is unavailable. */
    referenceAttackRechargePolicyMj: 7,
    normalCompetitionReducedLimitMj: 7,
    qualifyingMinimumLimitMj: 4,
    /** C5.2.9 additional electrical deployment available to Overtake per lap. */
    overtakeAdditionalEnergyPerLapMj: 0.5,
    standingStartDeploymentMinKph: 50,
    normalCurveTransitionKph: 340,
    raceSprintPowerLimitedTransitionKph: 310,
    standardDeploymentCutoffKph: 345,
    overtakeDeploymentCutoffKph: 355,
    article: 'C5.2.7-C5.2.12',
  },
  lowGripPowerCurve: {
    availability: 'unavailable',
    public: false,
    document: 'FIA-F1-DOC-111',
    permittedPowerCurve: null,
    note: 'Competition-specific low-grip ERS curves are not included in the public regulation PDF.',
  },
  tires: {
    drySpecificationsPerEvent: 3,
    intermediateSpecificationsPerEvent: 1,
    wetSpecificationsPerEvent: 1,
    article: 'B6.1-B6.3',
  },
} as const

export type LowGripDecisionInput = {
  averageSurfaceWaterMm: number
  mayReturnToNormal?: boolean
  previous: boolean
  trackGrip: number
  weather: WeatherState
}

/**
 * The FIA declaration is discretionary (B1.5.12), so these thresholds are a
 * deterministic Race Director model rather than claimed FIA trigger values.
 * Hysteresis prevents Normal/Low Grip messages oscillating on a drying track.
 */
export function nextLowGripCondition({
  averageSurfaceWaterMm,
  mayReturnToNormal = true,
  previous,
  trackGrip,
  weather,
}: LowGripDecisionInput) {
  if (previous) {
    return !(
      mayReturnToNormal &&
      weather === 'clear' &&
      trackGrip >= 0.95 &&
      averageSurfaceWaterMm <= 0.08
    )
  }

  return (
    weather !== 'clear' ||
    trackGrip < 0.92 ||
    averageSurfaceWaterMm >= 0.18
  )
}

export function shouldDeclareRainHazard(options: {
  forecastProbability: number
  previous?: boolean
  weather: WeatherState
}) {
  return (
    options.previous === true ||
    options.forecastProbability > 0.4 ||
    options.weather !== 'clear'
  )
}

function f1RechargeSessionTypeFor(stage: WeekendStage): F1RechargeSessionType {
  if (stage === 'fp1' || stage === 'fp2' || stage === 'fp3') {
    return 'freePractice'
  }
  if (stage === 'sprintQualifying') return 'sprintQualifying'
  if (stage === 'qualifying' || stage === 'qualifying2') return 'qualifying'
  if (stage === 'sprint') return 'sprint'
  return 'race'
}

function isFiniteRechargeLimit(limit: RechargeLimit): limit is Extract<
  RechargeLimit,
  { kind: 'finite' }
> {
  return limit.kind === 'finite'
}

const f1RechargeSessionTypes = new Set<F1RechargeSessionType>([
  'freePractice',
  'sprintQualifying',
  'qualifying',
  'sprint',
  'race',
])

function validateFiaPuEventInput(input: FiaPuEventInput) {
  if (
    input.schemaVersion !== 1 ||
    input.seriesId !== 'f1-custom' ||
    input.eventId.trim().length === 0 ||
    input.trackId.trim().length === 0 ||
    input.source.sourceId.trim().length === 0 ||
    input.source.authority !== 'race-director-instruction' ||
    !Number.isInteger(input.source.documentNumber) ||
    input.source.documentNumber <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(input.source.documentDate) ||
    !Number.isFinite(Date.parse(input.source.publishedAt)) ||
    !/^https:\/\/www\.fia\.com\//u.test(input.source.url) ||
    input.source.enclosure.trim().length === 0 ||
    input.source.validationStatus !== 'verified' ||
    input.recharge.measuredAt !== 'CU-K-HV-DC-bus' ||
    !/^[a-f0-9]{64}$/u.test(input.source.sha256) ||
    input.recharge.rules.length === 0
  ) {
    throw new TypeError('Invalid FIA Power Unit event input provenance')
  }

  const ids = new Set<string>()
  for (const rule of input.recharge.rules) {
    if (rule.id.trim().length === 0 || ids.has(rule.id)) {
      throw new TypeError(`Invalid or duplicate FIA recharge rule id: ${rule.id}`)
    }
    ids.add(rule.id)

    if (rule.sessionTypes.length === 0) {
      throw new TypeError(`FIA recharge rule has no session type: ${rule.id}`)
    }
    if (
      rule.sessionTypes.some(
        (sessionType) => !f1RechargeSessionTypes.has(sessionType),
      ) ||
      (rule.lapKind !== 'any' &&
        rule.lapKind !== 'out-lap-other-than-in-ttcs') ||
      (rule.overtakeAtLapStart !== 'active' &&
        rule.overtakeAtLapStart !== 'inactive' &&
        rule.overtakeAtLapStart !== 'not-applicable') ||
      (rule.lowGrip !== 'any' && rule.lowGrip !== 'required') ||
      (rule.behindSafetyCar !== 'any' &&
        rule.behindSafetyCar !== 'required')
    ) {
      throw new TypeError(`Invalid FIA recharge rule condition: ${rule.id}`)
    }
    if (new Set(rule.sessionTypes).size !== rule.sessionTypes.length) {
      throw new TypeError(`FIA recharge rule repeats a session type: ${rule.id}`)
    }
    if (
      rule.lapKind === 'out-lap-other-than-in-ttcs' &&
      rule.sessionTypes.some(
        (sessionType) => sessionType === 'race' || sessionType === 'sprint',
      )
    ) {
      throw new TypeError(`FIA non-TTCS out-lap rule includes TTCS: ${rule.id}`)
    }
    if (
      rule.limit.kind !== 'finite' &&
      rule.limit.kind !== 'unlimited' &&
      rule.limit.kind !== 'unavailable'
    ) {
      throw new TypeError(`Invalid FIA recharge limit kind: ${rule.id}`)
    }
    if (
      isFiniteRechargeLimit(rule.limit) &&
      (!Number.isFinite(rule.limit.maxCuKBusRechargeMj) ||
        rule.limit.maxCuKBusRechargeMj < 0 ||
        rule.limit.maxCuKBusRechargeMj > 12)
    ) {
      throw new RangeError(`Invalid FIA recharge limit: ${rule.id}`)
    }
    if (
      !isFiniteRechargeLimit(rule.limit) &&
      rule.limit.maxCuKBusRechargeMj !== null
    ) {
      throw new TypeError(`Invalid non-finite FIA recharge limit: ${rule.id}`)
    }
    if (
      rule.baseLimitMj !== undefined &&
      (!Number.isFinite(rule.baseLimitMj) || rule.baseLimitMj < 0)
    ) {
      throw new RangeError(`Invalid FIA base recharge limit: ${rule.id}`)
    }
    if (
      rule.additionalAllowanceMj !== undefined &&
      (!Number.isFinite(rule.additionalAllowanceMj) ||
        rule.additionalAllowanceMj < 0)
    ) {
      throw new RangeError(`Invalid FIA recharge allowance: ${rule.id}`)
    }
    const hasBase = rule.baseLimitMj !== undefined
    const hasAllowance = rule.additionalAllowanceMj !== undefined
    if (
      hasBase !== hasAllowance ||
      (!isFiniteRechargeLimit(rule.limit) && hasBase)
    ) {
      throw new TypeError(`Incomplete FIA recharge decomposition: ${rule.id}`)
    }
    if (
      isFiniteRechargeLimit(rule.limit) &&
      rule.baseLimitMj !== undefined &&
      rule.additionalAllowanceMj !== undefined
    ) {
      const decomposedLimit =
        rule.baseLimitMj + rule.additionalAllowanceMj
      if (Math.abs(decomposedLimit - rule.limit.maxCuKBusRechargeMj) > 1e-9) {
        throw new RangeError(
          `FIA recharge decomposition does not close: ${rule.id}`,
        )
      }
    }
  }
}

function eventRechargeRuleMatches(
  rule: FiaPuRechargeRule,
  options: {
    behindSafetyCar: boolean
    isNonRaceOutLap: boolean
    lowGripConditions: boolean
    overtakeAtLapStart: boolean
    sessionType: F1RechargeSessionType
  },
) {
  return (
    rule.sessionTypes.includes(options.sessionType) &&
    (rule.lapKind === 'any' || options.isNonRaceOutLap) &&
    (rule.overtakeAtLapStart === 'not-applicable' ||
      (rule.overtakeAtLapStart === 'active') === options.overtakeAtLapStart) &&
    (rule.lowGrip === 'any' || options.lowGripConditions) &&
    (rule.behindSafetyCar === 'any' || options.behindSafetyCar)
  )
}

function rechargeRuleSpecificity(rule: FiaPuRechargeRule) {
  return (
    (rule.lapKind === 'out-lap-other-than-in-ttcs' ? 8 : 0) +
    (rule.overtakeAtLapStart === 'not-applicable' ? 0 : 4) +
    (rule.lowGrip === 'required' ? 2 : 0) +
    (rule.behindSafetyCar === 'required' ? 1 : 0)
  )
}

export function resolveF1RechargeRule(options: {
  allowUnverifiedSessionDefault?: boolean
  behindSafetyCar?: boolean
  eventId?: string
  eventInput?: FiaPuEventInput | null
  lowGripConditions?: boolean
  overtakeAtLapStart?: boolean
  stage: WeekendStage
  timedRunPhase?: TimedRunPhase | null
  trackId?: string
}): RechargeRuleDefinition {
  const behindSafetyCar = options.behindSafetyCar === true
  const lowGripConditions = options.lowGripConditions === true
  const eventInput = options.eventInput ?? null
  if (eventInput) {
    validateFiaPuEventInput(eventInput)
    if (options.eventId === undefined) {
      throw new TypeError(
        `FIA Power Unit input requires its event identity: ${eventInput.eventId}`,
      )
    }
    if (options.eventId !== undefined && eventInput.eventId !== options.eventId) {
      throw new TypeError(
        `FIA Power Unit input event mismatch: ${eventInput.eventId} != ${options.eventId}`,
      )
    }
    if (options.trackId !== undefined && eventInput.trackId !== options.trackId) {
      throw new TypeError(
        `FIA Power Unit input track mismatch: ${eventInput.trackId} != ${options.trackId}`,
      )
    }
  }

  if (behindSafetyCar && lowGripConditions) {
    return {
      additionalAllowanceMJ: 0,
      baseLimitMJ: null,
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      resolution: 'technical-low-grip-safety-car',
      ruleId: 'fia-c5.2.10-low-grip-safety-car',
      sourceId: 'fia-f1-2026-technical-c20',
    }
  }

  const sessionType = f1RechargeSessionTypeFor(options.stage)
  const isNonRaceOutLap =
    options.timedRunPhase === 'out-lap' &&
    sessionType !== 'race' &&
    sessionType !== 'sprint'

  if (eventInput) {
    const matches = eventInput.recharge.rules
      .filter((rule) =>
        eventRechargeRuleMatches(rule, {
          behindSafetyCar,
          isNonRaceOutLap,
          lowGripConditions,
          overtakeAtLapStart: options.overtakeAtLapStart === true,
          sessionType,
        }),
      )
      .sort(
        (left, right) =>
          rechargeRuleSpecificity(right) - rechargeRuleSpecificity(left),
      )
    const best = matches[0]
    if (
      !best ||
      (matches[1] &&
        rechargeRuleSpecificity(matches[1]) === rechargeRuleSpecificity(best))
    ) {
      return {
        additionalAllowanceMJ: 0,
        baseLimitMJ: null,
        limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
        measuredAt: 'CU-K-HV-DC-bus',
        resolution: 'event-context-unavailable',
        ruleId: 'event-context-unavailable',
        sourceId: eventInput.source.sourceId,
      }
    }

    return {
      additionalAllowanceMJ: best.additionalAllowanceMj ?? 0,
      baseLimitMJ:
        best.baseLimitMj ??
        (isFiniteRechargeLimit(best.limit)
          ? best.limit.maxCuKBusRechargeMj
          : null),
      limit: best.limit,
      measuredAt: eventInput.recharge.measuredAt,
      resolution: 'verified-event',
      ruleId: best.id,
      sourceId: eventInput.source.sourceId,
    }
  }

  const hasTechnicalDefault =
    (sessionType === 'race' || sessionType === 'sprint') &&
    options.overtakeAtLapStart !== true
  const maximumRechargeMj =
    FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj

  if (options.allowUnverifiedSessionDefault) {
    return {
      additionalAllowanceMJ: 0,
      baseLimitMJ: maximumRechargeMj,
      limit: { kind: 'finite', maxCuKBusRechargeMj: maximumRechargeMj },
      measuredAt: 'CU-K-HV-DC-bus',
      resolution: 'technical-default',
      ruleId: 'sim-free-mode-default',
      sourceId: 'fia-f1-2026-technical-c20',
    }
  }

  if (!hasTechnicalDefault) {
    return {
      additionalAllowanceMJ: 0,
      baseLimitMJ: null,
      limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      resolution: 'event-context-unavailable',
      ruleId: 'fia-event-context-unavailable',
      sourceId: 'fia-f1-2026-technical-c20',
    }
  }

  return {
    additionalAllowanceMJ: 0,
    baseLimitMJ: maximumRechargeMj,
    limit: { kind: 'finite', maxCuKBusRechargeMj: maximumRechargeMj },
    measuredAt: 'CU-K-HV-DC-bus',
    resolution: 'technical-default',
    ruleId: 'fia-c5.2.10-default',
    sourceId: 'fia-f1-2026-technical-c20',
  }
}

export function sprintLapsFor(track: TrackDefinition) {
  // FIA B2.3.2: least number of complete laps exceeding 100 km.
  return Math.floor(100 / track.lengthKm) + 1
}

export function sessionDistanceLapsFor(
  track: TrackDefinition,
  stage: WeekendStage,
  categoryFormat?: CategoryRaceFormat,
) {
  if (stage === 'sprint') {
    const distanceKm =
      categoryFormat?.sprintDistanceOverridesKm[track.id] ??
      categoryFormat?.sprintDistanceKm

    if (typeof distanceKm === 'number') {
      return Math.floor(distanceKm / track.lengthKm) + 1
    }

    if (typeof categoryFormat?.sprintLapsRatio === 'number') {
      return Math.max(
        1,
        Math.round(raceLapsFor(track) * categoryFormat.sprintLapsRatio),
      )
    }

    return sprintLapsFor(track)
  }

  const distanceKm =
    categoryFormat?.featureDistanceOverridesKm[track.id] ??
    categoryFormat?.featureDistanceKm

  return typeof distanceKm === 'number'
    ? Math.floor(distanceKm / track.lengthKm) + 1
    : raceLapsFor(track)
}

export function compliesWithGrandPrixTireRule(
  car: Pick<CarSnapshot, 'runtimeSystems'>,
) {
  // This is FIA Grand Prix-specific.  A SUPER FORMULA control-tyre runtime
  // has neither Pirelli compound identifiers nor this mandatory-two-dry rule,
  // so it is explicitly outside the check rather than evaluated through a
  // fabricated F1 allocation.
  if (car.runtimeSystems.kind !== 'f1') {
    return true
  }

  const compoundsUsed = car.runtimeSystems.tires.compoundsUsed
  const usedWetWeatherTire = compoundsUsed.some(
    (compound) => !isDryCompound(compound),
  )

  if (usedWetWeatherTire) {
    return true
  }

  return new Set(compoundsUsed.filter(isDryCompound)).size >= 2
}

export type MguKPowerCurve =
  | 'normal'
  | 'overtake'
  | 'race-sprint-power-limited'

/** Exact permitted MGU-K DC power from FIA C5.2.7-C5.2.8 Issue 20. */
export function permittedMguKDcPowerKwForSpeed(options: {
  curve?: MguKPowerCurve
  speedKph: number
}) {
  const { curve = 'normal', speedKph } = options

  if (!Number.isFinite(speedKph)) {
    return 0
  }

  const speed = Math.max(0, speedKph)
  const {
    maxErsPowerKw,
    normalCurveTransitionKph,
    overtakeDeploymentCutoffKph,
    raceSprintPowerLimitedTransitionKph,
    standardDeploymentCutoffKph,
  } = FIA_2026_REGULATION_PROFILE.energy
  let permittedPowerKw: number

  if (curve === 'overtake') {
    permittedPowerKw =
      speed < overtakeDeploymentCutoffKph ? 7100 - 20 * speed : 0
  } else if (curve === 'race-sprint-power-limited') {
    if (speed < raceSprintPowerLimitedTransitionKph) {
      permittedPowerKw = 250
    } else if (speed < normalCurveTransitionKph) {
      permittedPowerKw = 1800 - 5 * speed
    } else {
      permittedPowerKw =
        speed < standardDeploymentCutoffKph ? 6900 - 20 * speed : 0
    }
  } else if (curve === 'normal') {
    if (speed < normalCurveTransitionKph) {
      permittedPowerKw = 1800 - 5 * speed
    } else {
      permittedPowerKw =
        speed < standardDeploymentCutoffKph ? 6900 - 20 * speed : 0
    }
  } else {
    return 0
  }

  return Math.min(
    maxErsPowerKw,
    Math.max(0, permittedPowerKw),
  )
}

/**
 * Clamps a requested deployment to the Issue 20 DC power curve.
 *
 * `curve` is the explicit regulatory state; callers cannot select Overtake
 * through a second compatibility switch.
 */
export function deploymentPowerLimitKwForSpeed(options: {
  curve?: MguKPowerCurve
  requestedPowerKw: number
  speedKph: number
}) {
  const {
    curve = 'normal',
    requestedPowerKw,
    speedKph,
  } = options

  if (!Number.isFinite(requestedPowerKw) || requestedPowerKw <= 0) {
    return 0
  }

  const regulatoryLimitKw = permittedMguKDcPowerKwForSpeed({
    curve,
    speedKph,
  })

  return Math.min(
    requestedPowerKw,
    FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
    regulatoryLimitKw,
  )
}
