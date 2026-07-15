import type {
  ActiveFlagPhase,
  Driver,
  RacePaceMode,
  Team,
  TrackDefinition,
  WeatherState,
  WeekendStage,
} from '../types'
import {
  driverOverallAbility,
  driverPerformanceAbility,
} from './driverAbility'
import { trackDynamicsAt, type TrackDynamicPoint } from './trackDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

type TrackLoadProfile = {
  accelerationShare: number
  brakingShare: number
  corneringShare: number
}

export function performanceLapGainSeconds(options: {
  driver: Driver
  team: Team
  track: TrackDefinition
}) {
  const { driver, team, track } = options
  const profile = loadProfileFor(track)
  const racePace = driverPerformanceAbility(driver, 'racePace')
  const cornering = driverPerformanceAbility(driver, 'cornering')
  const braking = driverPerformanceAbility(driver, 'braking')
  const driverGain =
    racePace * (0.95 + profile.accelerationShare * 0.55) +
    cornering * (0.45 + profile.corneringShare * 0.75) +
    braking * (0.25 + profile.brakingShare * 0.45) +
    driverOverallAbility(driver) * 0.28
  const carGain =
    team.cornering * (0.92 + profile.corneringShare * 1.7) +
    team.straightLine * (0.72 + profile.accelerationShare * 1.16) +
    team.reliability * 0.32

  return driverGain + carGain
}

export function vehicleSpeedPerformanceMultiplier(options: {
  driver: Driver
  dynamics: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  team: Team
}) {
  const { driver, dynamics, team } = options
  const racePace = driverPerformanceAbility(driver, 'racePace')
  const cornering = driverPerformanceAbility(driver, 'cornering')

  return (
    1 +
    dynamics.straightness * (team.straightLine - 0.82) * 0.16 +
    dynamics.curvature * (team.cornering - 0.82) * 0.12 +
    dynamics.straightness * (racePace - 0.82) * 0.025 +
    dynamics.curvature * (cornering - 0.82) * 0.05
  )
}

const profileCache = new WeakMap<TrackDefinition, TrackLoadProfile>()

function loadProfileFor(track: TrackDefinition): TrackLoadProfile {
  const cached = profileCache.get(track)

  if (cached) {
    return cached
  }

  const samples = Array.from({ length: 48 }, (_, index) =>
    trackDynamicsAt(track, index / 48),
  )
  const corneringShare =
    samples.reduce((total, point) => total + point.curvature, 0) /
    samples.length
  const brakingShare =
    samples.reduce((total, point, index) => {
      const next = samples[(index + 1) % samples.length]
      return total + Math.max(0, point.referenceSpeedKph - next.referenceSpeedKph) / 190
    }, 0) / samples.length
  const accelerationShare = clamp(
    1 - corneringShare * 0.58 + brakingShare * 0.34,
    0.38,
    0.9,
  )
  const profile = {
    accelerationShare,
    brakingShare: clamp(brakingShare, 0.08, 0.55),
    corneringShare: clamp(corneringShare, 0.08, 0.72),
  }

  profileCache.set(track, profile)
  return profile
}

export function baseFuelBurnKgPerLap(track: TrackDefinition) {
  const profile = loadProfileFor(track)

  return clamp(
    track.lengthKm * 0.245 +
      track.baseLapTime * 0.0025 +
      profile.accelerationShare * 0.18,
    1.28,
    2.18,
  )
}

export function fuelBurnKgPerLap(options: {
  phase: ActiveFlagPhase | null
  paceMode: RacePaceMode
  track: TrackDefinition
  weather: WeatherState
}) {
  const { phase, paceMode, track, weather } = options
  const paceFactor: Record<RacePaceMode, number> = {
    defend: 1.025,
    push: 1.055,
    save: 0.9,
    standard: 1,
  }
  const controlFactor =
    phase?.flag === 'sc'
      ? 0.62
      : phase?.flag === 'vsc'
        ? 0.7
        : phase?.flag === 'yellow'
          ? 0.9
          : 1
  const weatherFactor = weather === 'heavy-rain' ? 0.86 : weather === 'light-rain' ? 0.94 : 1

  return baseFuelBurnKgPerLap(track) * paceFactor[paceMode] * controlFactor * weatherFactor
}

export function initialFuelLoadKg(options: {
  raceLaps: number
  stage: WeekendStage
  track: TrackDefinition
}) {
  const { raceLaps, stage, track } = options
  const burn = baseFuelBurnKgPerLap(track)

  if (stage === 'race' || stage === 'sprint') {
    return clamp(burn * (raceLaps + 1.35), 35, 110)
  }

  if (stage === 'qualifying' || stage === 'sprintQualifying') {
    return clamp(burn * 4.2, 5.5, 10.5)
  }

  return clamp(burn * 9.5, 12, 24)
}

export type FuelMassEffects = {
  brakeLoadMultiplier: number
  cornerSpeedMultiplier: number
  lapTimeDeltaSeconds: number
  longitudinalSpeedMultiplier: number
  tireLoadMultiplier: number
}

/**
 * Resolves fuel mass through acceleration, braking and corner load instead of
 * converting every kilogram into one universal lap-time constant.
 */
export function fuelMassEffects(options: {
  fuelLoadKg: number
  localDynamics?: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  track: TrackDefinition
}): FuelMassEffects {
  const { fuelLoadKg, localDynamics, track } = options
  const profile = loadProfileFor(track)
  const fuelRatio = clamp(fuelLoadKg / 110, 0, 1)
  const accelerationCost =
    fuelLoadKg * (0.0105 * profile.accelerationShare)
  const brakingCost = fuelLoadKg * (0.007 * profile.brakingShare)
  const corneringCost = fuelLoadKg * (0.0125 * profile.corneringShare)
  const curvature = localDynamics?.curvature ?? profile.corneringShare
  const straightness = localDynamics?.straightness ?? profile.accelerationShare

  return {
    brakeLoadMultiplier: 1 + fuelRatio * (0.08 + profile.brakingShare * 0.1),
    cornerSpeedMultiplier:
      1 - fuelRatio * (0.008 + curvature * 0.026),
    lapTimeDeltaSeconds: accelerationCost + brakingCost + corneringCost,
    longitudinalSpeedMultiplier:
      1 - fuelRatio * (0.004 + straightness * 0.012),
    tireLoadMultiplier:
      1 + fuelRatio * (0.08 + curvature * 0.13),
  }
}
