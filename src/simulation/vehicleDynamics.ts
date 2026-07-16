import type {
  ActiveAeroMode,
  ActiveFlagPhase,
  CarSetup,
  Driver,
  RacePaceMode,
  Team,
  TrackDefinition,
  WeatherState,
  WeekendStage,
} from '../types'
import {
  DRIVER_ABILITY_INTERNAL_MAX,
  driverSkillBlend,
} from './driverAbility'
import { trackDynamicsAt, type TrackDynamicPoint } from './trackDynamics'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const MACHINE_PACE_REFERENCE = 0.86
export const MACHINE_PACE_SPREAD_FACTOR = 1.35
export const MACHINE_SEGMENT_RESPONSE = 0.135
export const DRIVER_SEGMENT_RESPONSE = 0.075
export const MACHINE_INTERNAL_PERFORMANCE_SCALE = 1.06

/**
 * Expands the effect of a machine rating without mutating the factual CSV
 * value. A rating at the reference remains unchanged while strengths and
 * weaknesses have a clear influence on the physical pace model.
 */
export function machinePaceRating(value: number): number {
  return clamp(
    MACHINE_PACE_REFERENCE +
      (value - MACHINE_PACE_REFERENCE) * MACHINE_PACE_SPREAD_FACTOR,
    0.45,
    1.05,
  )
}

export type TrackLoadProfile = {
  accelerationShare: number
  brakingShare: number
  corneringShare: number
  highSpeedShare: number
  lowSpeedShare: number
  mediumSpeedShare: number
  straightShare: number
}

export type LongitudinalStepInput = {
  activeAeroMode: ActiveAeroMode
  airDensityKgM3: number
  brakePercent: number
  currentSpeedKph: number
  deltaSeconds: number
  dynamics: Pick<TrackDynamicPoint, 'gradient' | 'straightness'>
  drivePowerScale?: number
  ersPowerKw: number
  fuelLoadKg: number
  gearEfficiency?: number
  gripMultiplier: number
  headwindMps?: number
  regenerativeResistancePowerKw?: number
  setup?: CarSetup
  team: Team
  throttlePercent: number
  towDragReduction?: number
}

const profileCache = new WeakMap<TrackDefinition, TrackLoadProfile>()

export function trackLoadProfileFor(track: TrackDefinition): TrackLoadProfile {
  const cached = profileCache.get(track)

  if (cached) {
    return cached
  }

  const samples = Array.from({ length: 96 }, (_, index) =>
    trackDynamicsAt(track, index / 96),
  )
  const count = samples.length
  const shareOf = (predicate: (point: TrackDynamicPoint) => boolean) =>
    samples.filter(predicate).length / count
  const corneringShare =
    samples.reduce((total, point) => total + point.curvature, 0) / count
  const brakingShare =
    samples.reduce((total, point) => total + point.brakingSeverity, 0) / count
  const profile = {
    accelerationShare: clamp(
      samples.reduce(
        (total, point) => total + (point.fullThrottle ? 1 : point.straightness),
        0,
      ) / count,
      0.3,
      0.92,
    ),
    brakingShare: clamp(brakingShare, 0.05, 0.55),
    corneringShare: clamp(corneringShare, 0.08, 0.78),
    highSpeedShare: shareOf((point) => point.cornerClass === 'high'),
    lowSpeedShare: shareOf((point) => point.cornerClass === 'low'),
    mediumSpeedShare: shareOf((point) => point.cornerClass === 'medium'),
    straightShare: shareOf((point) => point.cornerClass === 'straight'),
  }

  profileCache.set(track, profile)
  return profile
}

function machineCornerScore(team: Team, dynamics: TrackDynamicPoint) {
  const machine = team.machine

  switch (dynamics.cornerClass) {
    case 'low':
      return (
        machinePaceRating(machine.lowSpeedCornerPerformance) * 0.38 +
        machinePaceRating(machine.mechanicalGrip) * 0.25 +
        machinePaceRating(machine.traction) * 0.22 +
        machinePaceRating(machine.rideCompliance) * 0.15
      )
    case 'medium':
      return (
        machinePaceRating(machine.mediumSpeedCornerPerformance) * 0.4 +
        machinePaceRating(machine.downforceGeneration) * 0.25 +
        machinePaceRating(machine.mechanicalGrip) * 0.2 +
        machinePaceRating(machine.aerodynamicEfficiency) * 0.15
      )
    case 'high':
      return (
        machinePaceRating(machine.highSpeedCornerPerformance) * 0.42 +
        machinePaceRating(machine.downforceGeneration) * 0.3 +
        machinePaceRating(machine.aerodynamicEfficiency) * 0.18 +
        machinePaceRating(machine.rideCompliance) * 0.1
      )
    default:
      return (
        machinePaceRating(machine.straightLineEfficiency) * 0.35 +
        machinePaceRating(machine.dragEfficiency) * 0.3 +
        machinePaceRating(machine.puOutput) * 0.25 +
        machinePaceRating(machine.activeAeroEfficiency) * 0.1
      )
  }
}

export function machineSegmentCapability(options: {
  dynamics: TrackDynamicPoint
  session?: 'qualifying' | 'race'
  team: Team
  weather?: WeatherState
}) {
  const { dynamics, session = 'race', team, weather = 'clear' } = options
  const machine = team.machine
  const cornerScore = machineCornerScore(team, dynamics)
  const brakingScore =
    machinePaceRating(machine.brakingPerformance) * 0.55 +
    machinePaceRating(machine.brakingStability) * 0.45
  const wetScore =
    weather === 'heavy-rain'
      ? machinePaceRating(machine.wetPerformance)
      : weather === 'light-rain'
        ? machinePaceRating(machine.intermediatePerformance)
        : MACHINE_PACE_REFERENCE
  const localScore =
    cornerScore * (1 - dynamics.brakingSeverity * 0.3) +
    brakingScore * dynamics.brakingSeverity * 0.3
  const weatherAdjusted = localScore * 0.86 + wetScore * 0.14
  const sessionPace =
    machinePaceRating(
      session === 'qualifying' ? machine.qualifyingPace : machine.racePace,
    )
  const sessionAdjusted = weatherAdjusted * 0.94 + sessionPace * 0.06

  // Each axis decides where a car gains or loses time. The source data keeps
  // the lower field competitive while the response preserves visible car gaps.
  return clamp(
    (1 +
      (sessionAdjusted - MACHINE_PACE_REFERENCE) *
        MACHINE_SEGMENT_RESPONSE) *
      (1 + (MACHINE_INTERNAL_PERFORMANCE_SCALE - 1) * 0.18),
    0.96,
    1.035,
  )
}

export function driverSegmentExecution(options: {
  driver: Driver
  dynamics: TrackDynamicPoint
  pressure?: number
  session?: 'qualifying' | 'race'
  weather?: WeatherState
}) {
  const {
    driver,
    dynamics,
    pressure = 0.45,
    session = 'race',
    weather = 'clear',
  } = options
  const cornerSkill =
    dynamics.cornerClass === 'low'
      ? driver.skills.lowSpeedCornerSkill
      : dynamics.cornerClass === 'medium'
        ? driver.skills.mediumSpeedCornerSkill
        : dynamics.cornerClass === 'high'
          ? driver.skills.highSpeedCornerSkill
          : driver.skills.throttleControl
  const wetSkill =
    weather === 'heavy-rain'
      ? driver.skills.wetSkill
      : weather === 'light-rain'
        ? driver.skills.intermediateSkill
        : 0.9
  const sessionPace =
    session === 'qualifying'
      ? driver.skills.qualifyingPace
      : driver.skills.racePace
  const skill = clamp(
    sessionPace * 0.24 +
      cornerSkill * 0.22 +
      driver.skills.precision * 0.12 +
      driver.skills.brakingSkill * dynamics.brakingSeverity * 0.14 +
      driver.skills.tractionControl * (1 - dynamics.straightness) * 0.1 +
      wetSkill * 0.1 +
      driver.skills.pressureHandling * pressure * 0.08,
    0,
    DRIVER_ABILITY_INTERNAL_MAX,
  )

  // Drivers cannot create grip or power beyond the machine limit. Their
  // skills determine how closely and consistently they approach it.
  return clamp(1 - (1 - skill) * DRIVER_SEGMENT_RESPONSE, 0.94, 1.04)
}

export function dirtyAirDownforceMultiplier(options: {
  dynamics: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  gapSeconds: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds >= 2.5 || dynamics.curvature < 0.025) {
    return 1
  }

  const proximity = 1 - clamp(gapSeconds / 2.5, 0, 1)
  const sensitivity =
    1.08 - machinePaceRating(team.machine.dirtyAirTolerance) * 0.22
  const loss = proximity ** 1.35 * dynamics.curvature * 0.115 * sensitivity

  return clamp(1 - loss, 0.88, 1)
}

export function towDragReductionFor(options: {
  dynamics: Pick<TrackDynamicPoint, 'straightness'>
  gapSeconds: number
  team: Team
}) {
  const { dynamics, gapSeconds, team } = options

  if (gapSeconds <= 0 || gapSeconds > 1.8 || dynamics.straightness < 0.72) {
    return 0
  }

  const proximity = 1 - clamp((gapSeconds - 0.08) / 1.72, 0, 1)

  return clamp(
    proximity *
      dynamics.straightness *
      (0.105 + machinePaceRating(team.machine.towSensitivity) * 0.075),
    0,
    0.19,
  )
}

export function airDensityKgM3(options: {
  altitudeMeters?: number
  temperatureC?: number
}) {
  const altitudeMeters = options.altitudeMeters ?? 100
  const temperatureK = (options.temperatureC ?? 25) + 273.15
  const pressurePa =
    101325 * Math.pow(1 - 2.25577e-5 * clamp(altitudeMeters, -100, 3000), 5.25588)

  return pressurePa / (287.05 * temperatureK)
}

function activeAeroDragMultiplier(mode: ActiveAeroMode, team: Team) {
  const efficiency = machinePaceRating(team.machine.activeAeroEfficiency)

  if (mode === 'straight') {
    return clamp(0.88 - (efficiency - 0.84) * 0.2, 0.84, 0.9)
  }

  if (mode === 'partial-straight') {
    return clamp(0.95 - (efficiency - 0.84) * 0.1, 0.92, 0.96)
  }

  return 1
}

export function vehicleDragAreaM2(options: {
  activeAeroMode: ActiveAeroMode
  setup?: CarSetup
  team: Team
  towDragReduction?: number
}) {
  const { activeAeroMode, setup, team, towDragReduction = 0 } = options
  const machine = team.machine
  const baseDragArea =
    1.18 -
    machinePaceRating(machine.dragEfficiency) * 0.1 -
    machinePaceRating(machine.aerodynamicEfficiency) * 0.03 -
    machinePaceRating(machine.straightLineEfficiency) * 0.025

  return clamp(
    baseDragArea *
      setupDragAreaMultiplier(setup) *
      activeAeroDragMultiplier(activeAeroMode, team) *
      (1 - clamp(towDragReduction, 0, 0.2)),
    0.68,
    1.05,
  )
}

/**
 * Converts the existing setup controls into aerodynamic drag. The result is a
 * coefficient multiplier, not a top-speed preset, so terminal velocity still
 * emerges from power, air density, wind, slope, tow, and drag.
 */
export function setupDragAreaMultiplier(setup?: CarSetup) {
  if (!setup) {
    return 1
  }

  return clamp(
    1 +
      (setup.frontWing - 5.5) * 0.02 +
      (setup.rearWing - 5.5) * 0.035 +
      (setup.rideHeightMm - 28) * 0.004 +
      (setup.coolingPercent - 50) * 0.0015,
    0.68,
    1.25,
  )
}

export function combustionPowerKwFor(team: Team) {
  // This fictional 420 km/h category retains F1-style energy deployment but
  // uses a higher combustion output. Aerodynamic drag, not a speed clamp,
  // determines whether a car can approach the category's headline speed.
  return 575 + machinePaceRating(team.machine.puOutput) * 78
}

export function internalPowerScaleAtSpeed(speedKph: number) {
  // Keep the requested field-wide performance uplift in acceleration zones,
  // then blend it out before terminal velocity. This raises the cars without
  // turning the internal scale into a hidden top-speed increase or limiter.
  const highSpeedBlend = clamp((speedKph - 330) / 80, 0, 1)
  return (
    MACHINE_INTERNAL_PERFORMANCE_SCALE -
    (MACHINE_INTERNAL_PERFORMANCE_SCALE - 1) * highSpeedBlend
  )
}

export function topGearPowerTransferEfficiency(speedKph: number, team: Team) {
  const efficientRangeEndKph =
    394 + machinePaceRating(team.machine.straightLineEfficiency) * 24
  const overspeedKph = Math.max(0, speedKph - efficientRangeEndKph)

  return clamp(0.992 - overspeedKph * 0.004, 0.82, 0.992)
}

export function integrateVehicleSpeedKph(input: LongitudinalStepInput) {
  const massKg = 768 + clamp(input.fuelLoadKg, 0, 120)
  const dragAreaM2 = vehicleDragAreaM2({
    activeAeroMode: input.activeAeroMode,
    setup: input.setup,
    team: input.team,
    towDragReduction: input.towDragReduction,
  })
  const rollingForceN = massKg * 9.81 * 0.012
  const gradeForceN =
    massKg * 9.81 * clamp(input.dynamics.gradient * 0.025, -0.035, 0.035)
  const brakeDecelerationMps2 =
    clamp(input.brakePercent / 100, 0, 1) *
    (9.8 + machinePaceRating(input.team.machine.brakingPerformance) * 4.8) *
    clamp(input.gripMultiplier, 0.35, 1.08) *
    (1 + (MACHINE_INTERNAL_PERFORMANCE_SCALE - 1) * 0.3)
  const integrationSteps = Math.min(
    120,
    Math.max(1, Math.ceil(input.deltaSeconds / 0.25)),
  )
  const stepSeconds = input.deltaSeconds / integrationSteps
  let nextMps = Math.max(0, input.currentSpeedKph / 3.6)

  for (let step = 0; step < integrationSteps; step += 1) {
    const speedKph = nextMps * 3.6
    const airSpeedMps = Math.max(0, nextMps + (input.headwindMps ?? 0))
    const dragForceN =
      0.5 * input.airDensityKgM3 * dragAreaM2 * airSpeedMps * airSpeedMps
    const powerKw =
      (combustionPowerKwFor(input.team) * internalPowerScaleAtSpeed(speedKph) +
        Math.max(0, input.ersPowerKw) *
          machinePaceRating(
            input.team.machine.electricalDeploymentEfficiency,
          )) *
      clamp(input.drivePowerScale ?? 1, 0.45, 1) *
      clamp(
        input.gearEfficiency ??
          topGearPowerTransferEfficiency(speedKph, input.team),
        0.82,
        1,
      )
    const requestedDriveForceN =
      (powerKw * 1000 * clamp(input.throttlePercent / 100, 0, 1)) /
      Math.max(18, nextMps)
    const downforceTractionGain =
      1 +
      Math.min(1.5, (nextMps / 75) ** 2) *
        machinePaceRating(input.team.machine.downforceGeneration) *
        0.75
    const tractionLimitN =
      massKg *
      9.81 *
      clamp(input.gripMultiplier, 0.35, 1.15) *
      (1.35 + machinePaceRating(input.team.machine.traction) * 0.42) *
      downforceTractionGain *
      (1 + (MACHINE_INTERNAL_PERFORMANCE_SCALE - 1) * 0.35)
    const driveForceN = Math.min(requestedDriveForceN, tractionLimitN)
    const regenerativeResistanceForceN =
      (Math.max(0, input.regenerativeResistancePowerKw ?? 0) * 1000) /
      Math.max(25, nextMps)
    const accelerationMps2 =
      (driveForceN -
        regenerativeResistanceForceN -
        dragForceN -
        rollingForceN -
        gradeForceN) /
        massKg -
      brakeDecelerationMps2

    nextMps = Math.max(0, nextMps + accelerationMps2 * stepSeconds)
  }

  // Numerical runaway guard only. Normal terminal velocity is the point where
  // drag balances power and remains below this value.
  return clamp(nextMps * 3.6, 0, 438)
}

export function vehicleSpeedPerformanceMultiplier(options: {
  driver: Driver
  dynamics: TrackDynamicPoint
  session?: 'qualifying' | 'race'
  team: Team
  weather?: WeatherState
}) {
  return (
    machineSegmentCapability(options) *
    driverSegmentExecution({
      driver: options.driver,
      dynamics: options.dynamics,
      session: options.session,
      weather: options.weather,
    })
  )
}

export function performanceLapGainSeconds(options: {
  driver: Driver
  team: Team
  track: TrackDefinition
  weather?: WeatherState
  session?: 'qualifying' | 'race'
}) {
  const samples = Array.from({ length: 120 }, (_, index) =>
    trackDynamicsAt(options.track, index / 120),
  )
  const baselineSliceSeconds = options.track.baseLapTime / samples.length
  const modeledSeconds = samples.reduce((total, dynamics) => {
    const machine = machineSegmentCapability({
      dynamics,
      session: options.session,
      team: options.team,
      weather: options.weather,
    })
    const driver = driverSegmentExecution({
      driver: options.driver,
      dynamics,
      session: options.session,
      weather: options.weather,
    })

    return total + baselineSliceSeconds / (machine * driver)
  }, 0)

  return options.track.baseLapTime - modeledSeconds
}

export function baseFuelBurnKgPerLap(track: TrackDefinition) {
  const profile = trackLoadProfileFor(track)

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
  team?: Team
  track: TrackDefinition
  weather: WeatherState
}) {
  const { phase, paceMode, team, track, weather } = options
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
  const weatherFactor =
    weather === 'heavy-rain' ? 0.86 : weather === 'light-rain' ? 0.94 : 1
  const efficiencyFactor = team
    ? clamp(
        1.055 - machinePaceRating(team.machine.fuelEfficiency) * 0.065,
        0.985,
        1.015,
      )
    : 1

  return (
    baseFuelBurnKgPerLap(track) *
    paceFactor[paceMode] *
    controlFactor *
    weatherFactor *
    efficiencyFactor
  )
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

export function fuelMassEffects(options: {
  fuelLoadKg: number
  localDynamics?: Pick<TrackDynamicPoint, 'curvature' | 'straightness'>
  track: TrackDefinition
}): FuelMassEffects {
  const { fuelLoadKg, localDynamics, track } = options
  const profile = trackLoadProfileFor(track)
  const fuelRatio = clamp(fuelLoadKg / 110, 0, 1)
  const accelerationMassRatio = (768 + fuelLoadKg) / 768
  const accelerationTimeShare =
    profile.accelerationShare * 0.19 + profile.brakingShare * 0.11
  const curvature = localDynamics?.curvature ?? profile.corneringShare
  const straightness = localDynamics?.straightness ?? profile.accelerationShare

  return {
    brakeLoadMultiplier: 1 + fuelRatio * (0.08 + profile.brakingShare * 0.1),
    cornerSpeedMultiplier: 1 - fuelRatio * (0.008 + curvature * 0.026),
    lapTimeDeltaSeconds:
      track.baseLapTime *
      accelerationTimeShare *
      (accelerationMassRatio - 1) *
      0.58,
    longitudinalSpeedMultiplier: 1 - fuelRatio * (0.004 + straightness * 0.012),
    tireLoadMultiplier: 1 + fuelRatio * (0.08 + curvature * 0.13),
  }
}

export function driverFuelUseMultiplier(driver: Driver) {
  return clamp(
    1.035 -
      driverSkillBlend(driver, {
        fuelManagement: 0.7,
        throttleControl: 0.3,
      }) *
        0.045,
    0.99,
    1.02,
  )
}
