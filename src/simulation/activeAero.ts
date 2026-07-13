import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  AeroActivationZone,
  CarSnapshot,
  OvertakeStatus,
  TrackDefinition,
  WeatherState,
} from '../types'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function progressIsInZone(progress: number, start: number, end: number) {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
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
  const nearestLine = controlLines.find((line) =>
    progressIsInZone(
      car.progress,
      line.activationProgress,
      (line.activationProgress + 0.12) % 1,
    ),
  )
  const detectionGap = nearestLine?.detectionGapSeconds ?? 1
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
    return nearestLine ? 'active' : 'available'
  }

  const eligible =
    raceLap >= 1 &&
    car.gapToAhead > 0 &&
    car.gapToAhead <= detectionGap

  if (!eligible) {
    return 'disabled'
  }

  return nearestLine ? 'active' : 'available'
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

export function overtakePowerGainKph(status: OvertakeStatus, batteryPercent: number) {
  if (status !== 'active') {
    return 0
  }

  return clamp(10 + (batteryPercent - 24) * 0.12, 10, 18)
}
