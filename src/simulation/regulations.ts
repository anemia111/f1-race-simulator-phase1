import type {
  CategoryRaceFormat,
  CarSnapshot,
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
    qualifyingRechargeLimitMj: 7,
    normalCompetitionReducedLimitMj: 7,
    qualifyingMinimumLimitMj: 4,
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

export function maxRechargePerLapMjFor(options: {
  behindSafetyCar?: boolean
  eventLimitMj?: number | null
  lowGripConditions?: boolean
  stage: WeekendStage
}) {
  if (options.behindSafetyCar && options.lowGripConditions) {
    return Number.POSITIVE_INFINITY
  }

  const isQualifying =
    options.stage === 'qualifying' || options.stage === 'sprintQualifying'
  const eventLimit = options.eventLimitMj

  if (eventLimit === undefined || eventLimit === null) {
    return isQualifying
      ? FIA_2026_REGULATION_PROFILE.energy.qualifyingRechargeLimitMj
      : FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj
  }

  const minimum = isQualifying
    ? FIA_2026_REGULATION_PROFILE.energy.qualifyingMinimumLimitMj
    : FIA_2026_REGULATION_PROFILE.energy.normalCompetitionReducedLimitMj

  return Math.min(
    FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj,
    Math.max(minimum, eventLimit),
  )
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
  car: Pick<CarSnapshot, 'compoundsUsed'>,
) {
  const usedWetWeatherTire = car.compoundsUsed.some(
    (compound) => !isDryCompound(compound),
  )

  if (usedWetWeatherTire) {
    return true
  }

  return new Set(car.compoundsUsed.filter(isDryCompound)).size >= 2
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
