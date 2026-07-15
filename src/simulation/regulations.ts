import type {
  CarSnapshot,
  TrackDefinition,
  WeekendStage,
  WeatherState,
} from '../types'
import { raceLapsFor } from './raceEvents'
import { isDryCompound } from './tires'

export const FIA_2026_REGULATION_PROFILE = {
  asOf: '2026-07-15',
  sporting: {
    issue: '07',
    label: 'FIA 2026 F1 Sporting Regulations Issue 07',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_07_-_2026-06-25.pdf',
  },
  technical: {
    issue: '19',
    label: 'FIA 2026 F1 Technical Regulations Issue 19',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_19_-_2026-06-25.pdf',
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
    keyAccelerationPowerKw: 350,
    otherLapPowerKw: 250,
    maximumBoostIncreaseKw: 150,
    usableStateOfChargeWindowMj: 4,
    publicRechargeLimitMj: 8.5,
    qualifyingRechargeLimitMj: 7,
    normalCompetitionReducedLimitMj: 7,
    qualifyingMinimumLimitMj: 5,
    standingStartDeploymentMinKph: 50,
    standardDeploymentCutoffKph: 345,
    overtakeDeploymentCutoffKph: 355,
    article: 'C5.2.7-C5.2.12',
  },
  lowGripPowerCurve: {
    public: false,
    document: 'FIA-F1-DOC-111',
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
) {
  return stage === 'sprint' ? sprintLapsFor(track) : raceLapsFor(track)
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
