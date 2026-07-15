import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  AeroActivationZone,
  CarSnapshot,
  ErsMode,
  OvertakeEligibility,
  OvertakeStatus,
  TrackDefinition,
} from '../types'
import { FIA_2026_REGULATION_PROFILE } from './regulations'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const OVERTAKE_ACTIVATION_LENGTH = 0.12
const MAX_MGU_K_POWER_KW =
  FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw

export type ErsDeploymentCurve =
  | 'standard'
  | 'specified-sector'
  | 'low-grip-estimate'

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
  lowGripConditions: boolean
}): OvertakeEligibility | null {
  const {
    car,
    nextTotalDistance,
    phase,
    previousTotalDistance,
    raceControlEnabled,
    track,
    lowGripConditions,
  } = options

  if (
    car.status !== 'running' ||
    phase ||
    !raceControlEnabled ||
    lowGripConditions
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
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  track: TrackDefinition
}): ActiveAeroMode {
  const { car, lowGripConditions, phase, track } = options
  const zone = activeAeroZoneAt(track, car.progress)

  if (!zone || car.status !== 'running' || phase?.flag === 'red') {
    return 'corner'
  }

  if (lowGripConditions) {
    return zone.lowGripMode === 'partial' ? 'partial-straight' : 'corner'
  }

  return phase ? 'corner' : 'straight'
}

export function overtakeStatusFor(options: {
  batteryPercent: number
  car: CarSnapshot
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  raceControlEnabled?: boolean
  raceLap: number
  overtakeEnergyRemainingMj?: number
  sessionType?: 'race-distance' | 'limited-time'
  track: TrackDefinition
}): OvertakeStatus {
  const {
    batteryPercent,
    car,
    lowGripConditions,
    phase,
    raceControlEnabled = true,
    raceLap,
    overtakeEnergyRemainingMj = 0.5,
    sessionType = 'race-distance',
    track,
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
    !lowGripConditions &&
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

function standardDeploymentLimitKw(speedKph: number) {
  if (speedKph >= 345) {
    return 0
  }

  const formula =
    speedKph < 340 ? 1800 - 5 * speedKph : 6900 - 20 * speedKph

  return clamp(formula, 0, MAX_MGU_K_POWER_KW)
}

function overtakeDeploymentLimitKw(speedKph: number) {
  if (speedKph >= 355) {
    return 0
  }

  return clamp(7100 - 20 * speedKph, 0, MAX_MGU_K_POWER_KW)
}

function specifiedSectorDeploymentLimitKw(speedKph: number) {
  return speedKph < 310
    ? Math.min(250, MAX_MGU_K_POWER_KW)
    : standardDeploymentLimitKw(speedKph)
}

/**
 * Public FIA Technical Regulations C5.2.7-C5.2.8 power curves. Low-grip
 * values live in non-public FIA-F1-DOC-111, so the simulator uses a clearly
 * identified conservative estimate instead of presenting invented FIA data.
 */
export function ersDeploymentPowerKw(options: {
  curve?: ErsDeploymentCurve
  ersMode: ErsMode
  overtakeStatus: OvertakeStatus
  speedKph: number
}) {
  const {
    curve = 'standard',
    ersMode,
    overtakeStatus,
    speedKph: rawSpeedKph,
  } = options

  if (ersMode !== 'deploy') {
    return 0
  }

  const speedKph = Math.max(0, rawSpeedKph)

  if (curve === 'specified-sector') {
    return Math.round(specifiedSectorDeploymentLimitKw(speedKph))
  }

  if (curve === 'low-grip-estimate') {
    return Math.round(
      Math.min(250, standardDeploymentLimitKw(speedKph)),
    )
  }

  return Math.round(
    overtakeStatus === 'active'
      ? overtakeDeploymentLimitKw(speedKph)
      : standardDeploymentLimitKw(speedKph),
  )
}
