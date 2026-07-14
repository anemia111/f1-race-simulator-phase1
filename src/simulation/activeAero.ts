import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  AeroActivationZone,
  CarSnapshot,
  ErsMode,
  OvertakeEligibility,
  OvertakeStatus,
  TrackDefinition,
  WeatherState,
} from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const OVERTAKE_ACTIVATION_LENGTH = 0.12
const STANDARD_TAPER_START_KPH = 290
const STANDARD_TAPER_END_KPH = 355
const OVERTAKE_TAPER_START_KPH = 337
const OVERTAKE_TAPER_END_KPH = 370
const MAX_MGU_K_POWER_KW = 350
const MAX_OVERTAKE_POWER_DELTA_KW = 150

function progressIsInZone(progress: number, start: number, end: number) {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
}

function firstCrossingAfter(totalDistance: number, progress: number) {
  const lap = Math.floor(totalDistance)
  const thisLap = lap + progress

  return thisLap > totalDistance + 1e-9 ? thisLap : thisLap + 1
}

function activationLapForDetection(
  detectionDistance: number,
  detectionProgress: number,
  activationProgress: number,
) {
  return (
    Math.floor(detectionDistance) +
    (activationProgress + 1e-9 < detectionProgress ? 1 : 0)
  )
}

function activationLapAtProgress(
  totalDistance: number,
  activationProgress: number,
) {
  const progress = ((totalDistance % 1) + 1) % 1
  const end = (activationProgress + OVERTAKE_ACTIVATION_LENGTH) % 1
  const wraps = end < activationProgress

  return Math.floor(totalDistance) - (wraps && progress <= end ? 1 : 0)
}

/**
 * Samples the time gap only when a car crosses an FIA detection line. The
 * result is deliberately latched: closing up after the line cannot make the
 * car eligible, and dropping back before activation cannot remove eligibility.
 */
export function updateOvertakeEligibilityAfterTravel(options: {
  car: CarSnapshot
  nextTotalDistance: number
  phase: ActiveFlagPhase | null
  previousTotalDistance: number
  raceControlEnabled: boolean
  track: TrackDefinition
  trackGrip: number
}): OvertakeEligibility | null {
  const {
    car,
    nextTotalDistance,
    phase,
    previousTotalDistance,
    raceControlEnabled,
    track,
    trackGrip,
  } = options

  if (
    car.status !== 'running' ||
    phase ||
    !raceControlEnabled ||
    trackGrip < 0.86
  ) {
    return null
  }

  const crossed = (track.overtakeControlLines ?? [])
    .map((line, controlLineIndex) => ({
      controlLineIndex,
      crossingDistance: firstCrossingAfter(
        previousTotalDistance,
        line.detectionProgress,
      ),
      line,
    }))
    .filter(
      ({ crossingDistance }) => crossingDistance <= nextTotalDistance + 1e-9,
    )
    .sort((left, right) => left.crossingDistance - right.crossingDistance)
    .at(-1)

  if (!crossed) {
    return car.overtakeEligibility
  }

  const detectedGapSeconds = Math.max(0, car.gapToAhead)

  return {
    activationLap: activationLapForDetection(
      crossed.crossingDistance,
      crossed.line.detectionProgress,
      crossed.line.activationProgress,
    ),
    controlLineIndex: crossed.controlLineIndex,
    detectedGapSeconds,
    eligible:
      car.position > 1 &&
      detectedGapSeconds > 0 &&
      detectedGapSeconds <= crossed.line.detectionGapSeconds,
  }
}

export function activeAeroZoneAt(
  track: TrackDefinition,
  progress: number,
): AeroActivationZone | null {
  return (
    track.aeroActivationZones?.find((zone) =>
      progressIsInZone(progress, zone.start, zone.end),
    ) ?? null
  )
}

export function activeAeroModeFor(options: {
  car: CarSnapshot
  phase: ActiveFlagPhase | null
  track: TrackDefinition
  trackGrip: number
  weather: WeatherState
}): ActiveAeroMode {
  const { car, phase, track, trackGrip, weather } = options
  const zone = activeAeroZoneAt(track, car.progress)

  if (!zone || car.status !== 'running' || phase?.flag === 'red') {
    return 'corner'
  }

  const lowGrip = trackGrip < 0.88 || weather !== 'clear'

  if (lowGrip) {
    return zone.lowGripMode === 'partial' ? 'partial-straight' : 'corner'
  }

  return phase ? 'corner' : 'straight'
}

export function overtakeStatusFor(options: {
  batteryPercent: number
  car: CarSnapshot
  phase: ActiveFlagPhase | null
  raceControlEnabled?: boolean
  raceLap: number
  overtakeEnergyRemainingMj?: number
  sessionType?: 'race-distance' | 'limited-time'
  track: TrackDefinition
  trackGrip: number
}): OvertakeStatus {
  const {
    batteryPercent,
    car,
    phase,
    raceControlEnabled = true,
    raceLap,
    overtakeEnergyRemainingMj = 0.5,
    sessionType = 'race-distance',
    track,
    trackGrip,
  } = options
  const controlLines = track.overtakeControlLines ?? []
  const activeLineIndex = controlLines.findIndex((line) =>
    progressIsInZone(
      car.progress,
      line.activationProgress,
      (line.activationProgress + OVERTAKE_ACTIVATION_LENGTH) % 1,
    ),
  )
  const activeLine = controlLines[activeLineIndex]
  const systemEnabled =
    car.status === 'running' &&
    !phase &&
    raceControlEnabled &&
    trackGrip >= 0.86 &&
    batteryPercent > 24 &&
    overtakeEnergyRemainingMj > 0.01

  if (!systemEnabled) {
    return 'disabled'
  }

  // In limited-time sessions Overtake is activated whenever enabled. The
  // driver deployment is represented on the straights to avoid full-lap use.
  if (sessionType === 'limited-time') {
    return activeLine ? 'active' : 'available'
  }

  const eligibility = car.overtakeEligibility

  if (raceLap < 1 || !eligibility?.eligible) {
    return 'disabled'
  }

  if (activeLine) {
    const activationLap = activationLapAtProgress(
      car.totalDistance,
      activeLine.activationProgress,
    )

    return eligibility.controlLineIndex === activeLineIndex &&
      eligibility.activationLap === activationLap
      ? 'active'
      : 'disabled'
  }

  const eligibleLine = controlLines[eligibility.controlLineIndex]
  const activationDistance = eligibleLine
    ? eligibility.activationLap + eligibleLine.activationProgress
    : Number.NEGATIVE_INFINITY

  return car.totalDistance < activationDistance ? 'available' : 'disabled'
}

export function activeAeroSpeedGainKph(mode: ActiveAeroMode) {
  if (mode === 'straight') {
    return 16
  }

  if (mode === 'partial-straight') {
    return 7
  }

  return 0
}

/**
 * Lightweight estimate of the FIA circuit-specific ERS-K power curves. The
 * published 290/355 and 337/370 km/h breakpoints and 350 kW ceiling are used,
 * while the exact event curve remains marked as simulated in the UI.
 */
export function ersDeploymentPowerKw(options: {
  ersMode: ErsMode
  overtakeStatus: OvertakeStatus
  speedKph: number
  straightness: number
}) {
  const { ersMode, overtakeStatus, speedKph, straightness } = options

  if (ersMode !== 'deploy') {
    return 0
  }

  const accelerationZonePeakKw = straightness >= 0.58 ? 350 : 250
  const standardSpeedFactor = clamp(
    (STANDARD_TAPER_END_KPH - speedKph) /
      (STANDARD_TAPER_END_KPH - STANDARD_TAPER_START_KPH),
    0,
    1,
  )
  const standardPowerKw = accelerationZonePeakKw * standardSpeedFactor

  if (overtakeStatus !== 'active') {
    return Math.round(standardPowerKw)
  }

  const overtakeSpeedFactor = clamp(
    (OVERTAKE_TAPER_END_KPH - speedKph) /
      (OVERTAKE_TAPER_END_KPH - OVERTAKE_TAPER_START_KPH),
    0,
    1,
  )
  const boostPowerKw = MAX_OVERTAKE_POWER_DELTA_KW * overtakeSpeedFactor

  return Math.round(
    Math.min(MAX_MGU_K_POWER_KW, standardPowerKw + boostPowerKw),
  )
}
