// Timed weekend sessions: practice builds setup confidence, qualifying runs
// pit-release plans and ranks legal flying laps for the race grid.

import type {
  CarSetup,
  Driver,
  RaceConfig,
  Team,
  TimedSessionTire,
  TimedSessionSegmentPlan,
  TireCompound,
  WeatherState,
  WeekendStage,
} from '../types'
import { isF1SeriesRules, type SeriesRules } from '../series/types'
import {
  driverLimitBreakFraction,
  driverPerformanceAbility,
  driverSkillBlend,
} from './driverAbility'
import {
  baselineSetupForTrack,
  practiceSetupRecommendation,
} from './engineering'
import {
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
} from './categoryPhysics'
import { decideDriverBehaviorForPath } from './categoryDriverAgent'
import { DRIVER_TRANSIENT_EFFICIENCY } from './physicalLap'
import { DRIVER_DECISION_WINDOWS_PER_LAP } from './driverDecision'
import { effectiveMachineReliability } from './machinePerformance'
import {
  simulatePhysicalLap,
  trackWidthMeters,
  type PhysicalLapResult,
} from './physicalLap'
import { hashChance } from './random'
import { offlineQualifyingRunAdjudication } from './timedSessionAdjudication'
import {
  buildQualifyingReleaseSchedule,
  type QualifyingReleaseSlot,
} from './qualifyingStrategy'
import { tireTrackGripMultiplier } from './tires'
import { createSuperFormulaControlTireInventory } from './superFormulaControlTires2026'
import { gripForSurfaceWater } from './trackWater'
import {
  airDensityKgM3,
  baseFuelBurnKgPerLap,
  combustionPowerKwFor,
  vehicleDownforceMultiplier,
  vehicleDragAreaM2,
  vehicleTyreGripMultiplierForTeam,
} from './vehicleDynamics'
import {
  practiceDryCompoundFor,
  practiceProgramFor,
} from './practicePrograms'
import {
  FREE_PRACTICE_DURATION_SECONDS,
  QUALIFYING_BREAK_SECONDS,
  QUALIFYING_SEGMENT_DURATIONS_SECONDS,
  SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS,
  type PracticeSessionName,
  type QualifyingSegmentName,
} from './sessionRules'
import {
  simulatedTemperaturesFor,
  trackGripForWeather,
  weatherFor,
  weatherLabelFor,
} from './weather'

export const QUALIFYING_GRID_SPACING = 0.018
export type { PracticeSessionName, QualifyingSegmentName }

export type QualifyingResult = {
  driverId: string
  teamId: string
  code: string
  driverName: string
  teamName: string
  teamColor: string
  position: number
  lapTimeSeconds: number
  deltaSeconds: number
  segment: QualifyingSegmentName
  tire: TimedSessionTire
  sessionDurationSeconds: number
  abortedRunCount: number
  deletedRunCount: number
  runCount: number
  setsUsed: number
  validRunCount: number
  pitExitAtSeconds: number
  outLapTimeSeconds: number
  flyingLapStartedAtSeconds: number
  flyingLapCompletedAtSeconds: number
  inLapTimeSeconds: number
  pitReturnAtSeconds: number
  trafficLossSeconds: number
  qualifyingGroup?: 'A' | 'B'
  weather: WeatherState
  weatherLabel: string
  classificationStatus: 'classified' | 'no-time' | 'deleted'
}

export type QualifyingSegment = {
  name: QualifyingSegmentName
  results: QualifyingResult[]
  eliminatedDriverIds: string[]
  sessionDurationSeconds: number
  suspensionSeconds: number
  tire: TimedSessionTire
  weather: WeatherState
  weatherLabel: string
}

export type KnockoutQualifying = {
  segments: QualifyingSegment[]
  classification: QualifyingResult[]
}

export type PracticeSessionResult = {
  driverId: string
  teamId: string
  code: string
  driverName: string
  teamName: string
  teamColor: string
  position: number
  bestLapTimeSeconds: number
  longRunPaceSeconds: number
  setupScore: number
  setupRecommendation: CarSetup
  setupConfidence: number
  lapsCompleted: number
  runCount: number
  runTires: TimedSessionTire[]
  programs: Array<{
    fuelLoadKg: number
    kind: NonNullable<
      ReturnType<typeof practiceProgramFor>
    >['kind']
    label: string
    shortLabel: string
    targetFlyingLaps: number
    tire: TimedSessionTire
    workItems: readonly string[]
  }>
  firstPitExitAtSeconds: number
  finalPitExitAtSeconds: number
  sessionDurationSeconds: number
  weather: WeatherState
  weatherLabel: string
}

type QualifyingRun = {
  aborted: boolean
  deleted: boolean
  tire: TimedSessionTire
  pitExitAtSeconds: number
  outLapTimeSeconds: number
  flyingLapStartedAtSeconds: number
  flyingLapCompletedAtSeconds: number
  inLapTimeSeconds: number
  isValid: boolean
  pitReturnAtSeconds: number
  lapTimeSeconds: number
  trafficLossSeconds: number
}

const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]))
const timedPhysicalLapCache = new WeakMap<
  RaceConfig,
  Map<string, PhysicalLapResult>
>()

type TimedPhysicalLapOptions = {
  config: RaceConfig
  fuelLoadKg: number
  setup: CarSetup
  team: Team
  tire: TimedSessionTire
  trackGrip: number
  weather: WeatherState
  weekendStage: WeekendStage
}

const finiteKey = (value: number) =>
  Number.isFinite(value) ? value.toFixed(5) : 'invalid'

/**
 * Returns the only SF timed-session tyre state that can be represented from
 * the bundled source: dry/wet control surface plus an explicitly unavailable
 * physical model. No coefficient is introduced into the lap calculation.
 */
export function superFormulaControlSessionTireForWeather(
  weather: WeatherState,
): Extract<TimedSessionTire, { kind: 'super-formula-control-session-tire' }> {
  const inventory = createSuperFormulaControlTireInventory()

  return {
    kind: 'super-formula-control-session-tire',
    physicalModel: {
      availability: 'unavailable',
      simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
      sourceInput: inventory.specification.physicalCoefficients,
      value: null,
    },
    surface: weather === 'clear' ? 'dry' : 'wet',
  }
}

function sessionTireCacheKey(tire: TimedSessionTire) {
  return tire.kind === 'f1-pirelli-session-tire'
    ? `f1-pirelli:${tire.compound}`
    : `super-formula-control:${tire.surface}:${tire.physicalModel.availability}`
}

function assertTimedSessionTireMatchesCategory(
  config: RaceConfig,
  tire: TimedSessionTire,
) {
  const isSuperFormula = config.seriesId === 'super-formula'
  const matchesCategory = isSuperFormula
    ? tire.kind === 'super-formula-control-session-tire'
    : tire.kind === 'f1-pirelli-session-tire'

  if (!matchesCategory) {
    throw new Error(
      isSuperFormula
        ? 'SUPER FORMULA timed sessions require a dry/wet control-session tyre.'
        : 'F1 timed sessions require a Pirelli session tyre.',
    )
  }
}

function physicalLapCacheKey(options: TimedPhysicalLapOptions) {
  const { config, fuelLoadKg, setup, team, tire, trackGrip, weather } =
    options
  const machine = team.machine

  return [
    config.seriesId ?? 'f1-custom',
    config.track.id,
    options.weekendStage,
    finiteKey(config.fiaNominalTyreMassKg ?? Number.NaN),
    weather,
    sessionTireCacheKey(tire),
    finiteKey(fuelLoadKg),
    finiteKey(trackGrip),
    finiteKey(machine.puOutput),
    finiteKey(machine.dragEfficiency),
    finiteKey(machine.aerodynamicEfficiency),
    finiteKey(machine.straightLineEfficiency),
    finiteKey(machine.activeAeroEfficiency),
    finiteKey(machine.downforceGeneration),
    finiteKey(machine.mechanicalGrip),
    finiteKey(machine.traction),
    finiteKey(setup.frontWing),
    finiteKey(setup.rearWing),
    finiteKey(setup.rideHeightMm),
    finiteKey(setup.coolingPercent),
  ].join(':')
}

function surfaceWaterForWeather(weather: WeatherState) {
  return weather === 'heavy-rain' ? 1.2 : weather === 'light-rain' ? 0.35 : 0
}

/**
 * Builds the common force-derived lap used by simplified timed sessions.
 * `baseLapTime` and observed event pace are deliberately absent: category
 * hardware, team power/aero/grip, setup, carried mass and surface condition
 * are the only inputs that can change the reference lap.
 */
function timedPhysicalLap(options: TimedPhysicalLapOptions) {
  assertTimedSessionTireMatchesCategory(options.config, options.tire)
  let cache = timedPhysicalLapCache.get(options.config)

  if (!cache) {
    cache = new Map()
    timedPhysicalLapCache.set(options.config, cache)
  }

  const key = physicalLapCacheKey(options)
  const cached = cache.get(key)

  if (cached) {
    return cached
  }

  const {
    config,
    fuelLoadKg,
    setup,
    team,
    tire,
    trackGrip,
    weather,
  } = options
  const categoryPhysics = categoryPhysicsFor(config.seriesId)
  const operationalMass = resolveOperationalVehicleMass({
    f1NominalTyreMassKg: config.fiaNominalTyreMassKg ?? null,
    physics: categoryPhysics,
    weekendStage: options.weekendStage,
  })
  const waterMm = surfaceWaterForWeather(weather)
  const trackCondition = {
    dryingLine: weather === 'clear' ? 1 : 0,
    rainIntensityMmH:
      weather === 'heavy-rain' ? 8 : weather === 'light-rain' ? 2 : 0,
    surfaceWaterMm: waterMm,
  }
  const surfaceGrip = gripForSurfaceWater(
    trackGrip,
    waterMm,
    trackCondition.dryingLine,
  )
  const categoryTyreGrip =
    config.seriesId !== 'super-formula' &&
    tire.kind === 'f1-pirelli-session-tire'
      ? tireTrackGripMultiplier(tire.compound, trackCondition)
      : null
  const downforceScale = vehicleDownforceMultiplier({ setup, team })
  const physics = {
    ...categoryPhysics,
    combustionPowerKw: combustionPowerKwFor(team, categoryPhysics),
    liftAreaM2: categoryPhysics.liftAreaM2 * downforceScale,
  }
  const temperatures = simulatedTemperaturesFor(
    `${config.seed}:timed-physical-lap:${weather}`,
    config.track,
    weather,
  )
  const result = simulatePhysicalLap(config.track, {
    airDensityKgM3: airDensityKgM3({
      altitudeMeters: config.track.altitudeMeters,
      temperatureC: temperatures.airTemperatureC,
    }),
    deploymentPowerKw: categoryPhysics.hybridDeploymentPowerLimitKw,
    eventId: config.eventId,
    fiaPuEventInput: config.fiaPuEventInput,
    dragAreaM2: vehicleDragAreaM2({
      // This is the Corner-Mode base area. `simulatePhysicalLap` applies the
      // decomposed front/rear map only inside declared activation zones.
      activeAeroMode: 'corner',
      categoryPhysics,
      setup,
      team,
    }),
    gripMultiplier: vehicleTyreGripMultiplierForTeam(
      team,
      categoryTyreGrip === null
        ? surfaceGrip
        : surfaceGrip * categoryTyreGrip,
    ),
    massKg: operationalMass.operationalMassKg + Math.max(0, fuelLoadKg),
    physics,
    timedRunPhase: 'attack-lap',
    weekendStage: config.weekendStage ?? 'qualifying',
  })

  cache.set(key, result)
  return result
}

export function timedSessionPhysicalLapSeconds(
  options: TimedPhysicalLapOptions,
) {
  return timedPhysicalLap(options).lapTimeSeconds
}

type TimedDriverExecutionOptions = TimedPhysicalLapOptions & {
  driver: Driver
  run: number
  seed: string
}

export function timedSessionRunAssemblyShortfallSeconds(options: {
  consistency: number
  lapTimeSeconds: number
  signedDraw: number
}): number {
  return (
    Math.abs(options.signedDraw) *
    options.lapTimeSeconds *
    (0.004 + (1 - options.consistency) * 0.012)
  )
}

/**
 * Rain-only execution overlay for offline timed sessions. The generic decision
 * windows already own adaptability, braking and throttle control, so wet skill
 * is the sole driver-ability owner here.
 */
export function timedSessionWetExecutionRiskScale(
  driver: Driver,
  weather: WeatherState,
): number {
  const wetSeverity =
    weather === 'heavy-rain' ? 1 : weather === 'light-rain' ? 0.45 : 0
  const wetControl = driverPerformanceAbility(driver, 'wetSkill')

  return 1 + wetSeverity * (0.22 + (1 - wetControl) * 0.9)
}

/**
 * Converts low-frequency braking, throttle and line choices into time lost
 * relative to the force-derived lap. It does not read displayed overall
 * ratings or special-driver thresholds.
 *
 * A rating on the published scale can at best execute the reference lap
 * perfectly, so the loss floors at zero. A rating past the scale floors below
 * it, but only by the share of `DRIVER_TRANSIENT_EFFICIENCY` its excess buys:
 * the reference concedes 3 % of the friction limit to transients it cannot
 * model, and this is a claim on part of that, not a free lap-time bonus. At
 * 120 the excess is 0.2, worth 0.2 x 3.09 % of the lap.
 */
export function timedSessionDriverExecutionLossSeconds(
  options: TimedDriverExecutionOptions,
) {
  const plan = timedPhysicalLap(options)
  const trackHalfWidthM = trackWidthMeters(options.config.track) / 2
  const wetRiskScale = timedSessionWetExecutionRiskScale(
    options.driver,
    options.weather,
  )
  const windowTimeSeconds =
    plan.lapTimeSeconds / DRIVER_DECISION_WINDOWS_PER_LAP
  let lossSeconds = 0

  for (
    let window = 0;
    window < DRIVER_DECISION_WINDOWS_PER_LAP;
    window += 1
  ) {
    const progress =
      (window + 0.5) / DRIVER_DECISION_WINDOWS_PER_LAP
    const point =
      plan.points[
        Math.min(
          plan.points.length - 1,
          Math.floor(progress * plan.points.length),
        )
      ]
    const decision = decideDriverBehaviorForPath({
      context: {
        currentLateralOffsetM: 0,
        driver: options.driver,
        lap: options.run,
        physicalReferenceLineOffsetM: point?.referenceLineOffsetM ?? 0,
        seed: options.seed,
        trackHalfWidthM,
        trackProgress: progress,
      },
      path: options.config.driverDecisionPath,
      seriesId: options.config.seriesId,
      vehicleEraId: options.config.vehicleEraId,
    })
    const cornerDemand = Number.isFinite(point?.effectiveCornerRadiusM)
      ? Math.min(1, 180 / Math.max(18, point!.effectiveCornerRadiusM))
      : 0
    const brakingLoss =
      Math.abs(decision.brakeOnsetDeltaSeconds) *
      (0.18 + cornerDemand * 0.32) +
      Math.max(0, 1 - decision.brakePressureScale) *
        windowTimeSeconds *
        (0.006 + cornerDemand * 0.012)
    const throttleLoss =
      Math.max(0, decision.throttleTimingDeltaSeconds) *
        (0.16 + cornerDemand * 0.24) +
      Math.max(0, 1 - decision.throttleOpeningScale) *
        windowTimeSeconds *
        0.016
    const lineLoss =
      (Math.abs(decision.lineErrorM) / Math.max(1, trackHalfWidthM)) *
      windowTimeSeconds *
      (0.006 + cornerDemand * 0.022)
    const controlLoss =
      Math.abs(decision.controlError) * windowTimeSeconds * 0.014
    const errorLoss = decision.errorTriggered
      ? windowTimeSeconds * (0.018 + Math.abs(decision.controlError) * 0.04)
      : 0
    lossSeconds +=
      (brakingLoss + throttleLoss + lineLoss + controlLoss + errorLoss) *
      wetRiskScale
  }

  const limitBreak = driverLimitBreakFraction(options.driver)
  const recoverableSeconds =
    limitBreak > 0
      ? plan.lapTimeSeconds *
        limitBreak *
        (1 / DRIVER_TRANSIENT_EFFICIENCY - 1)
      : 0

  // The 12 windows above own local brake, throttle, line and control execution.
  // This separate draw owns only the non-negative whole-run assembly shortfall:
  // it is sampled once per run, folded by magnitude, and cannot improve the
  // physical reference. Above-100 limit-break recovery remains the only path
  // that can make the total adjustment negative.
  const signedAssemblyDraw =
    hashChance(
      `${options.seed}:lap-execution:${options.driver.id}:${options.run}`,
    ) *
      2 -
    1
  const consistency = driverSkillBlend(options.driver, {
    consistency: 0.46,
    precision: 0.28,
    pressureHandling: 0.26,
  })
  const runAssemblyShortfallSeconds =
    timedSessionRunAssemblyShortfallSeconds({
      consistency,
      lapTimeSeconds: plan.lapTimeSeconds,
      signedDraw: signedAssemblyDraw,
    })

  return Math.max(
    -recoverableSeconds,
    lossSeconds + runAssemblyShortfallSeconds - recoverableSeconds,
  )
}

export function qualifyingCutSizes(driverCount: number) {
  const q2Size =
    driverCount > 20
      ? driverCount - Math.ceil((driverCount - 10) / 2)
      : Math.min(15, driverCount)
  const q3Size = Math.min(10, q2Size)

  return { q2Size, q3Size }
}

function durationForSegment(
  segment: QualifyingSegmentName,
  rules?: SeriesRules,
) {
  const configuredDuration = rules?.qualifying.segments.find(
    (candidate) => candidate.name === segment,
  )?.durationSeconds

  if (configuredDuration !== undefined) {
    return configuredDuration
  }

  return segment.startsWith('SQ')
    ? SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS[
        segment as keyof typeof SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS
      ]
    : QUALIFYING_SEGMENT_DURATIONS_SECONDS[
        segment as keyof typeof QUALIFYING_SEGMENT_DURATIONS_SECONDS
      ]
}

function compoundForQualifyingSegment(
  segment: QualifyingSegmentName,
  weather: WeatherState,
  configuredDryCompound?: RaceConfig['qualifyingDryCompound'],
): TireCompound {
  if (weather === 'heavy-rain') {
    return 'W'
  }

  if (weather === 'light-rain') {
    return 'I'
  }

  if (segment === 'SQ1' || segment === 'SQ2') {
    return 'M'
  }

  return configuredDryCompound ?? 'S'
}

function sessionTireForQualifyingSegment(
  config: RaceConfig,
  segment: QualifyingSegmentName,
  weather: WeatherState,
): TimedSessionTire {
  if (config.seriesId === 'super-formula') {
    return superFormulaControlSessionTireForWeather(weather)
  }

  return {
    compound: compoundForQualifyingSegment(
      segment,
      weather,
      config.qualifyingDryCompound,
    ),
    kind: 'f1-pirelli-session-tire',
  }
}

function sessionTireForPracticeProgram(
  config: RaceConfig,
  weather: WeatherState,
  options: Parameters<typeof practiceDryCompoundFor>[0],
): TimedSessionTire {
  if (config.seriesId === 'super-formula') {
    return superFormulaControlSessionTireForWeather(weather)
  }

  const compound =
    weather === 'heavy-rain'
      ? ('W' as const)
      : weather === 'light-rain'
        ? ('I' as const)
        : practiceDryCompoundFor(options)

  return {
    compound,
    kind: 'f1-pirelli-session-tire',
  }
}

function qualifyingRunLapTime(
  seed: string,
  segment: QualifyingSegmentName,
  driver: Driver,
  team: Team,
  config: RaceConfig,
  weather: WeatherState,
  trackGrip: number,
  tire: TimedSessionTire,
  run: number,
): number {
  const setup =
    config.weekendContext?.setupByDriver?.[driver.id] ??
    baselineSetupForTrack(config.track)
  const fuelLoadKg = Math.max(4, baseFuelBurnKgPerLap(config.track) * 2)
  const physicalOptions = {
    config,
    fuelLoadKg,
    setup,
    team,
    tire,
    trackGrip,
    weather,
    weekendStage: segment.startsWith('SQ')
      ? ('sprintQualifying' as const)
      : ('qualifying' as const),
  }
  const physicalLapTimeSeconds = timedSessionPhysicalLapSeconds(
    physicalOptions,
  )
  const executionLossSeconds = timedSessionDriverExecutionLossSeconds({
    ...physicalOptions,
    driver,
    run,
    seed: `${seed}:qualifying:${segment}:${driver.id}:${run}`,
  })

  return Math.max(20, physicalLapTimeSeconds + executionLossSeconds)
}

function qualifyingRunsForDriver(
  seed: string,
  segment: QualifyingSegmentName,
  driver: Driver,
  team: Team,
  config: RaceConfig,
  weather: WeatherState,
  trackGrip: number,
  releaseSlots: QualifyingReleaseSlot[],
  sessionDurationSeconds: number,
): QualifyingRun[] {
  const tire = sessionTireForQualifyingSegment(config, segment, weather)
  const maxRuns = segment === 'Q3' || segment === 'SQ3' ? 2 : 3

  return Array.from({ length: maxRuns }, (_, run) => {
    const rawLapTimeSeconds = qualifyingRunLapTime(
      seed,
      segment,
      driver,
      team,
      config,
      weather,
      trackGrip,
      tire,
      run,
    )
    const runKey = `${seed}:run-lap:${segment}:${driver.id}:${run}`
    const trafficLossSeconds = 0
    const { aborted, deleted } = offlineQualifyingRunAdjudication(runKey)
    const lapTimeSeconds = rawLapTimeSeconds + trafficLossSeconds
    // Preparation laps are operationally slower than the same car's physical
    // flying lap. Their schedule is anchored to that lap, never to an observed
    // event target.
    const outLapTimeSeconds =
      rawLapTimeSeconds + Math.max(20, rawLapTimeSeconds * 0.4)
    const inLapTimeSeconds =
      rawLapTimeSeconds + Math.max(25, rawLapTimeSeconds * 0.5)
    const releaseSlot = releaseSlots[run]
    const latestPitExit = Math.max(0, sessionDurationSeconds - outLapTimeSeconds - 1)
    const pitExitAtSeconds = Math.min(
      latestPitExit,
      releaseSlot?.pitExitAtSeconds ??
        24 + run * (sessionDurationSeconds / maxRuns),
    )
    const flyingLapStartedAtSeconds = pitExitAtSeconds + outLapTimeSeconds
    const flyingLapCompletedAtSeconds = flyingLapStartedAtSeconds + lapTimeSeconds
    const pitReturnAtSeconds = flyingLapCompletedAtSeconds + inLapTimeSeconds
    const isValid =
      !aborted && !deleted && flyingLapStartedAtSeconds < sessionDurationSeconds

    return {
      aborted,
      deleted,
      tire,
      pitExitAtSeconds,
      outLapTimeSeconds,
      flyingLapStartedAtSeconds,
      flyingLapCompletedAtSeconds,
      inLapTimeSeconds,
      isValid,
      pitReturnAtSeconds,
      lapTimeSeconds,
      trafficLossSeconds,
    }
  })
}

type ScheduledDriverRuns = {
  driver: Driver
  team: Team
  runs: QualifyingRun[]
}

function progressDuringRun(run: QualifyingRun, atSeconds: number) {
  if (atSeconds < run.pitExitAtSeconds || atSeconds > run.pitReturnAtSeconds) {
    return null
  }

  if (atSeconds < run.flyingLapStartedAtSeconds) {
    return {
      phase: 'out' as const,
      progress: (atSeconds - run.pitExitAtSeconds) / run.outLapTimeSeconds,
    }
  }

  if (atSeconds <= run.flyingLapCompletedAtSeconds) {
    return {
      phase: 'attack' as const,
      progress:
        (atSeconds - run.flyingLapStartedAtSeconds) / run.lapTimeSeconds,
    }
  }

  return {
    phase: 'in' as const,
    progress:
      (atSeconds - run.flyingLapCompletedAtSeconds) / run.inLapTimeSeconds,
  }
}

function withCausalTraffic(
  run: QualifyingRun,
  driverId: string,
  schedule: ScheduledDriverRuns[],
  sessionDurationSeconds: number,
  isStreetTrack: boolean,
): QualifyingRun {
  const sampleTime =
    run.flyingLapStartedAtSeconds + run.lapTimeSeconds * 0.52
  const ownProgress = 0.52
  const threshold = isStreetTrack ? 0.062 : 0.048
  let closestBlocker = Number.POSITIVE_INFINITY

  for (const entry of schedule) {
    if (entry.driver.id === driverId) {
      continue
    }

    for (const otherRun of entry.runs) {
      const other = progressDuringRun(otherRun, sampleTime)

      if (!other || other.phase === 'attack') {
        continue
      }

      const direct = Math.abs(other.progress - ownProgress)
      const circularDistance = Math.min(direct, 1 - direct)
      closestBlocker = Math.min(closestBlocker, circularDistance)
    }
  }

  if (closestBlocker >= threshold) {
    return run
  }

  const trafficLossSeconds = Math.min(
    2.4,
    0.28 + (1 - closestBlocker / threshold) * (isStreetTrack ? 1.72 : 1.25),
  )
  const lapTimeSeconds = run.lapTimeSeconds + trafficLossSeconds
  const flyingLapCompletedAtSeconds =
    run.flyingLapCompletedAtSeconds + trafficLossSeconds
  const pitReturnAtSeconds = run.pitReturnAtSeconds + trafficLossSeconds

  return {
    ...run,
    flyingLapCompletedAtSeconds,
    isValid: run.isValid && run.flyingLapStartedAtSeconds < sessionDurationSeconds,
    lapTimeSeconds,
    pitReturnAtSeconds,
    trafficLossSeconds,
  }
}

function runQualifyingSegment(
  config: RaceConfig,
  teams: Map<string, Team>,
  participants: Driver[],
  segment: QualifyingSegmentName,
  elapsedSeconds: number,
  sessionDurationSeconds = durationForSegment(segment),
): QualifyingResult[] {
  const weatherSeed = `${config.seed}:qualifying`
  const weather = weatherFor(weatherSeed, config.track, elapsedSeconds)
  const trackGrip = trackGripForWeather(weatherSeed, config.track, elapsedSeconds)
  const maxRuns = segment === 'Q3' || segment === 'SQ3' ? 2 : 3
  const stage = segment.startsWith('SQ')
    ? ('sprintQualifying' as const)
    : ('qualifying' as const)
  const segmentPlan: TimedSessionSegmentPlan = {
    declaredWet: weather !== 'clear',
    endsAtSeconds: sessionDurationSeconds,
    name: segment,
    participantDriverIds: participants.map((driver) => driver.id),
    startsAtSeconds: 0,
    suspensionEndsAtSeconds: null,
    suspensionStartsAtSeconds: null,
    tire: sessionTireForQualifyingSegment(config, segment, weather),
  }
  const releaseSlotsByDriver = new Map<string, QualifyingReleaseSlot[]>()

  for (let runIndex = 0; runIndex < maxRuns; runIndex += 1) {
    for (const slot of buildQualifyingReleaseSchedule({
      config,
      participantDriverIds: segmentPlan.participantDriverIds,
      runIndex,
      segment: segmentPlan,
      stage,
    })) {
      const driverSlots = releaseSlotsByDriver.get(slot.driverId) ?? []

      driverSlots[runIndex] = slot
      releaseSlotsByDriver.set(slot.driverId, driverSlots)
    }
  }
  const schedule = participants.map<ScheduledDriverRuns>((driver) => {
    const team = teams.get(driver.teamId)

    if (!team) {
      throw new Error(`Missing team for qualifying driver ${driver.id}`)
    }

    return {
      driver,
      team,
      runs: qualifyingRunsForDriver(
        config.seed,
        segment,
        driver,
        team,
        config,
        weather,
        trackGrip,
        releaseSlotsByDriver.get(driver.id) ?? [],
        sessionDurationSeconds,
      ),
    }
  })
  // Play out every scheduled run with its traffic first, so each driver has a
  // provisional lap — what they would read on the timing screen before deciding
  // whether another run is worth a fresh set of tyres.
  const played = schedule.map(({ driver, team, runs: scheduledRuns }) => {
    const runs = scheduledRuns.map((run) =>
      withCausalTraffic(
        run,
        driver.id,
        schedule,
        sessionDurationSeconds,
        config.track.kind === 'street',
      ),
    )

    return { driver, team, runs, firstValidIndex: runs.findIndex((run) => run.isValid) }
  })

  // Provisional order by that first valid lap drives the run-count strategy.
  const provisionalRank = new Map(
    played
      .filter((entry) => entry.firstValidIndex >= 0)
      .sort(
        (a, b) =>
          a.runs[a.firstValidIndex].lapTimeSeconds -
          b.runs[b.firstValidIndex].lapTimeSeconds,
      )
      .map((entry, index) => [entry.driver.id, index + 1]),
  )
  // How many cars survive this segment. Q3/SQ3 send everyone to the grid, so
  // there is no cushion to sit on and every driver keeps improving.
  const isFinalSegment = segment === 'Q3' || segment === 'SQ3'
  const advanceCount =
    segment === 'Q1' || segment === 'SQ1'
      ? qualifyingCutSizes(participants.length).q2Size
      : segment === 'Q2' || segment === 'SQ2'
        ? Math.min(10, participants.length)
        : participants.length
  const safeRankThreshold =
    advanceCount - Math.max(3, Math.round(advanceCount * 0.35))

  const classified = played.map(({ driver, team, runs: playedRuns, firstValidIndex }) => {
    // A driver already comfortably through banks the set and stays in the garage
    // rather than running again; one on the bubble keeps going, and a driver
    // still without a lap always keeps running.
    const provisional = provisionalRank.get(driver.id)
    const comfortablyThrough =
      !isFinalSegment &&
      firstValidIndex >= 0 &&
      provisional !== undefined &&
      provisional <= safeRankThreshold &&
      hashChance(`${config.seed}:qualifying-relax:${segment}:${driver.id}`) < 0.7
    const runs = comfortablyThrough
      ? playedRuns.slice(0, firstValidIndex + 1)
      : playedRuns
    const validRuns = runs.filter((run) => run.isValid)
    const abortedRunCount = runs.filter((run) => run.aborted).length
    const deletedRunCount = runs.filter((run) => run.deleted).length
    const setsUsed = segment.startsWith('SQ')
      ? 1
      : Math.max(1, Math.ceil(runs.length / 2))
    const fallbackRun = playedRuns[0]!
    const bestRun =
      validRuns.slice().sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)[0] ??
      ({
        ...fallbackRun,
        isValid: false,
      } satisfies QualifyingRun)

    return {
      driver,
      team,
      abortedRunCount,
      deletedRunCount,
      runCount: runs.length,
      setsUsed,
      validRunCount: validRuns.length,
      ...bestRun,
    }
  })

  const priorOrder = new Map(
    participants.map((driver, index) => [driver.id, index]),
  )
  classified.sort((a, b) => {
    if ((a.validRunCount > 0) !== (b.validRunCount > 0)) {
      return a.validRunCount > 0 ? -1 : 1
    }

    if (a.validRunCount > 0 && b.validRunCount > 0) {
      return a.lapTimeSeconds === b.lapTimeSeconds
        ? a.flyingLapCompletedAtSeconds - b.flyingLapCompletedAtSeconds
        : a.lapTimeSeconds - b.lapTimeSeconds
    }

    return (priorOrder.get(a.driver.id) ?? 0) - (priorOrder.get(b.driver.id) ?? 0)
  })

  const poleTime =
    classified.find((entry) => entry.validRunCount > 0)?.lapTimeSeconds ?? 0

  return classified.map(({
    driver,
    lapTimeSeconds,
    team,
    abortedRunCount,
    deletedRunCount,
    runCount,
    setsUsed,
    validRunCount,
    ...run
  }, index) => ({
    driverId: driver.id,
    teamId: team.id,
    code: driver.code,
    driverName: driver.name,
    teamName: team.name,
    teamColor: team.color,
    position: index + 1,
    lapTimeSeconds,
    deltaSeconds: lapTimeSeconds - poleTime,
    segment,
    sessionDurationSeconds,
    abortedRunCount,
    deletedRunCount,
    runCount,
    setsUsed,
    validRunCount,
    ...run,
    weather,
    weatherLabel: weatherLabelFor(weather),
    classificationStatus:
      validRunCount === 0
        ? deletedRunCount > 0
          ? 'deleted'
          : 'no-time'
        : 'classified',
  }))
}

function withFinalPositions(results: QualifyingResult[]): QualifyingResult[] {
  const poleTime = results[0]?.lapTimeSeconds ?? 0

  return results.map((result, index) => ({
    ...result,
    position: index + 1,
    deltaSeconds: Math.max(0, result.lapTimeSeconds - poleTime),
  }))
}

function qualifyingSuspensionSeconds(
  config: RaceConfig,
  segment: QualifyingSegmentName,
) {
  const roll = hashChance(`${config.seed}:qualifying:${segment}:red-flag`)

  return roll < 0.1 ? Math.round(150 + roll * 900) : 0
}

function runKnockoutSession(
  config: RaceConfig,
  segments: [QualifyingSegmentName, QualifyingSegmentName, QualifyingSegmentName],
): KnockoutQualifying {
  const teams = byId(config.teams)
  const { q2Size, q3Size } = qualifyingCutSizes(config.drivers.length)
  const first = runQualifyingSegment(config, teams, config.drivers, segments[0], 0)
  const firstSurvivors = first
    .filter((result) => result.validRunCount > 0)
    .slice(0, q2Size)
  const firstSurvivorIds = new Set(
    firstSurvivors.map((result) => result.driverId),
  )
  const firstEliminated = first.filter(
    (result) => !firstSurvivorIds.has(result.driverId),
  )
  const secondDrivers = firstSurvivors
    .map((result) => config.drivers.find((driver) => driver.id === result.driverId))
    .filter((driver): driver is Driver => driver !== undefined)
  const secondElapsed = durationForSegment(segments[0]) + QUALIFYING_BREAK_SECONDS
  const second = runQualifyingSegment(
    config,
    teams,
    secondDrivers,
    segments[1],
    secondElapsed,
  )
  const secondSurvivors = second
    .filter((result) => result.validRunCount > 0)
    .slice(0, q3Size)
  const secondSurvivorIds = new Set(
    secondSurvivors.map((result) => result.driverId),
  )
  const secondEliminated = second.filter(
    (result) => !secondSurvivorIds.has(result.driverId),
  )
  const thirdDrivers = secondSurvivors
    .map((result) => config.drivers.find((driver) => driver.id === result.driverId))
    .filter((driver): driver is Driver => driver !== undefined)
  const thirdElapsed =
    secondElapsed + durationForSegment(segments[1]) + QUALIFYING_BREAK_SECONDS
  const third = runQualifyingSegment(
    config,
    teams,
    thirdDrivers,
    segments[2],
    thirdElapsed,
  )
  const classification = withFinalPositions([
    ...third,
    ...secondEliminated,
    ...firstEliminated,
  ])

  return {
    segments: [
      {
        name: segments[0],
        results: first,
        eliminatedDriverIds: firstEliminated.map((result) => result.driverId),
        sessionDurationSeconds: durationForSegment(segments[0]),
        suspensionSeconds: qualifyingSuspensionSeconds(config, segments[0]),
        tire:
          first[0]?.tire ??
          sessionTireForQualifyingSegment(config, segments[0], 'clear'),
        weather: first[0]?.weather ?? 'clear',
        weatherLabel: first[0]?.weatherLabel ?? 'CLEAR',
      },
      {
        name: segments[1],
        results: second,
        eliminatedDriverIds: secondEliminated.map((result) => result.driverId),
        sessionDurationSeconds: durationForSegment(segments[1]),
        suspensionSeconds: qualifyingSuspensionSeconds(config, segments[1]),
        tire:
          second[0]?.tire ??
          sessionTireForQualifyingSegment(config, segments[1], 'clear'),
        weather: second[0]?.weather ?? 'clear',
        weatherLabel: second[0]?.weatherLabel ?? 'CLEAR',
      },
      {
        name: segments[2],
        results: third,
        eliminatedDriverIds: [],
        sessionDurationSeconds: durationForSegment(segments[2]),
        suspensionSeconds: qualifyingSuspensionSeconds(config, segments[2]),
        tire:
          third[0]?.tire ??
          sessionTireForQualifyingSegment(config, segments[2], 'clear'),
        weather: third[0]?.weather ?? 'clear',
        weatherLabel: third[0]?.weatherLabel ?? 'CLEAR',
      },
    ],
    classification,
  }
}

function qualifyingSegmentSummary(
  config: RaceConfig,
  name: QualifyingSegmentName,
  results: QualifyingResult[],
  eliminatedDriverIds: string[],
  durationSeconds: number,
): QualifyingSegment {
  const weather = results[0]?.weather ?? 'clear'

  return {
    eliminatedDriverIds,
    name,
    results,
    sessionDurationSeconds: durationSeconds,
    suspensionSeconds: qualifyingSuspensionSeconds(config, name),
    tire:
      results[0]?.tire ??
      sessionTireForQualifyingSegment(config, name, weather),
    weather,
    weatherLabel: results[0]?.weatherLabel ?? 'CLEAR',
  }
}

function driversForResults(config: RaceConfig, results: QualifyingResult[]) {
  const drivers = byId(config.drivers)

  return results
    .map((result) => drivers.get(result.driverId))
    .filter((driver): driver is Driver => driver !== undefined)
}

/**
 * Runs the category's configured 2026 qualifying format. F1 uses three-stage
 * knockout qualifying while Super Formula splits
 * the opening session into independent groups before its final segment.
 */
export function runSeriesQualifying(
  baseConfig: RaceConfig,
  rules: SeriesRules,
): KnockoutQualifying {
  const config: RaceConfig = {
    ...baseConfig,
    seriesId: isF1SeriesRules(rules) ? 'f1-custom' : 'super-formula',
    ...(isF1SeriesRules(rules)
      ? {
          qualifyingDryCompound:
            baseConfig.qualifyingDryCompound ?? rules.tires.qualifyingDryCompound,
        }
      : {}),
  }
  const segmentRules = rules.qualifying.segments

  if (segmentRules.length === 0) {
    return { classification: [], segments: [] }
  }

  const teams = byId(config.teams)
  const segments: QualifyingSegment[] = []
  const eliminatedByRound: QualifyingResult[][] = []
  let participants = config.drivers
  let elapsedSeconds = 0
  let finalResults: QualifyingResult[] = []
  let firstRuleIndex = 0

  if (rules.qualifying.format === 'grouped') {
    const openingRule = segmentRules[0]
    const groups =
      rules.qualifying.grouping === 'car-number-parity'
        ? [
            config.drivers.filter((driver) => driver.carNumber % 2 === 0),
            config.drivers.filter((driver) => driver.carNumber % 2 !== 0),
          ]
        : [
            config.drivers.filter((_, index) => index % 2 === 0),
            config.drivers.filter((_, index) => index % 2 === 1),
          ]
    const groupDurationSeconds = openingRule.durationSeconds / groups.length
    const groupResults = groups.map((group, index) =>
      runQualifyingSegment(
        { ...config, seed: `${config.seed}:group-${index + 1}` },
        teams,
        group,
        openingRule.name,
        elapsedSeconds + groupDurationSeconds * index,
        groupDurationSeconds,
      ).map((result) => ({
        ...result,
        qualifyingGroup: (index === 0 ? 'A' : 'B') as 'A' | 'B',
      })),
    )
    const isStandaloneGroupedSession =
      openingRule.advanceCount === null && segmentRules.length === 1
    const advanceTotal = openingRule.advanceCount ?? config.drivers.length
    const advanceByGroup = groups.map((_, index) =>
      Math.floor(advanceTotal / groups.length) +
      (index < advanceTotal % groups.length ? 1 : 0),
    )
    const advancing = groupResults.flatMap((results, index) =>
      results
        .filter((result) => result.validRunCount > 0)
        .slice(0, advanceByGroup[index]),
    )
    const advancingIds = new Set(advancing.map((result) => result.driverId))
    const combined = withFinalPositions(
      groupResults
        .flat()
        .slice()
        .sort((left, right) => {
          if ((left.validRunCount > 0) !== (right.validRunCount > 0)) {
            return left.validRunCount > 0 ? -1 : 1
          }
          return left.lapTimeSeconds - right.lapTimeSeconds
        }),
    )
    const eliminated = isStandaloneGroupedSession
      ? []
      : combined.filter((result) => !advancingIds.has(result.driverId))

    segments.push(
      qualifyingSegmentSummary(
        config,
        openingRule.name,
        combined,
        eliminated.map((result) => result.driverId),
        openingRule.durationSeconds,
      ),
    )
    if (eliminated.length > 0) eliminatedByRound.push(eliminated)
    participants = driversForResults(config, advancing)
    if (isStandaloneGroupedSession) {
      const firstGroupIndex =
        (groupResults[0][0]?.lapTimeSeconds ?? Number.POSITIVE_INFINITY) <=
        (groupResults[1][0]?.lapTimeSeconds ?? Number.POSITIVE_INFINITY)
          ? 0
          : 1
      const orderedGroups = [
        groupResults[firstGroupIndex],
        groupResults[1 - firstGroupIndex],
      ]
      finalResults = Array.from(
        { length: Math.max(...orderedGroups.map((group) => group.length)) },
        (_, index) => orderedGroups.flatMap((group) => group[index] ?? []),
      ).flat()
    } else {
      finalResults = advancing
    }
    elapsedSeconds =
      openingRule.durationSeconds + rules.qualifying.breakSeconds
    firstRuleIndex = 1
  }

  for (let index = firstRuleIndex; index < segmentRules.length; index += 1) {
    const rule = segmentRules[index]
    const results = runQualifyingSegment(
      config,
      teams,
      participants,
      rule.name,
      elapsedSeconds,
      rule.durationSeconds,
    )
    const isLast = index === segmentRules.length - 1
    const advanceCount = isLast
      ? null
      : Math.min(rule.advanceCount ?? results.length, results.length)
    const advancing =
      advanceCount === null
        ? results
        : results
            .filter((result) => result.validRunCount > 0)
            .slice(0, advanceCount)
    const advancingIds = new Set(
      advancing.map((result) => result.driverId),
    )
    const eliminated =
      advanceCount === null
        ? []
        : results.filter((result) => !advancingIds.has(result.driverId))

    segments.push(
      qualifyingSegmentSummary(
        config,
        rule.name,
        results,
        eliminated.map((result) => result.driverId),
        rule.durationSeconds,
      ),
    )
    if (eliminated.length > 0) {
      eliminatedByRound.push(eliminated)
    }
    finalResults = advancing
    participants = driversForResults(config, advancing)
    elapsedSeconds += rule.durationSeconds + rules.qualifying.breakSeconds
  }

  return {
    classification: withFinalPositions([
      ...finalResults,
      ...eliminatedByRound.reverse().flat(),
    ]),
    segments,
  }
}

export function runKnockoutQualifying(config: RaceConfig): KnockoutQualifying {
  return runKnockoutSession(config, ['Q1', 'Q2', 'Q3'])
}

export function runSprintShootoutQualifying(config: RaceConfig): KnockoutQualifying {
  return runKnockoutSession(config, ['SQ1', 'SQ2', 'SQ3'])
}

export function runQualifying(config: RaceConfig): QualifyingResult[] {
  return runKnockoutQualifying(config).classification
}

export function reversedSprintGrid(
  classification: QualifyingResult[],
  reverseCount: number,
): QualifyingResult[] {
  const count = Math.min(
    Math.max(0, Math.floor(reverseCount)),
    classification.length,
  )
  const ordered = [
    ...classification.slice(0, count).reverse(),
    ...classification.slice(count),
  ]

  return ordered.map((result, index) => ({
    ...result,
    position: index + 1,
  }))
}

export function runPracticeSession(
  config: RaceConfig,
  stage: PracticeSessionName,
): PracticeSessionResult[] {
  const teams = byId(config.teams)
  const stageIndex = stage === 'fp1' ? 0 : stage === 'fp2' ? 1 : 2
  const elapsedSeconds = 12 * 60 + stageIndex * 22 * 60
  const weatherSeed = `${config.seed}:practice:${stage}`
  const weather = weatherFor(weatherSeed, config.track, elapsedSeconds)
  const trackGrip = trackGripForWeather(weatherSeed, config.track, elapsedSeconds)
  const weatherLabel = weatherLabelFor(weather)
  const results = config.drivers.map((driver, index) => {
    const team = teams.get(driver.teamId)

    if (!team) {
      throw new Error(`Missing team for practice driver ${driver.id}`)
    }

    const reliabilityRoll = hashChance(`${config.seed}:practice:${stage}:${driver.id}:laps`)
    const machineReliability = effectiveMachineReliability(
      team.machine.reliability,
    )
    const consistency = driverPerformanceAbility(driver, 'consistency')
    const scheduledPrograms = Array.from({ length: 4 }, (_, runIndex) => {
      const plan = practiceProgramFor({
        driverId: driver.id,
        runIndex,
        seed: config.seed,
        stage,
      })!
      const tire = sessionTireForPracticeProgram(config, weather, {
        driverId: driver.id,
        plan,
        runIndex,
        seed: config.seed,
        stage,
      })

      return {
        fuelLoadKg: Math.min(
          110,
          Math.max(
            5.5,
            baseFuelBurnKgPerLap(config.track) * plan.fuelLaps,
          ),
        ),
        kind: plan.kind,
        label: plan.label,
        shortLabel: plan.shortLabel,
        targetFlyingLaps: plan.targetFlyingLaps,
        tire,
        workItems: plan.workItems,
      }
    })
    const curtailedByReliability =
      reliabilityRoll <
      Math.max(0.015, (1 - machineReliability) * 0.18)
    const runCount = curtailedByReliability ? 3 : 4
    const programs = scheduledPrograms.slice(0, runCount)
    const firstPitExitAtSeconds =
      12 +
      index * 1.4 +
      hashChance(`${config.seed}:practice:${stage}:${driver.id}:out1`) * 42
    const finalPitExitAtSeconds =
      2350 + hashChance(`${config.seed}:practice:${stage}:${driver.id}:out3`) * 520
    const plannedLaps = programs.reduce(
      (total, program) => total + program.targetFlyingLaps + 2,
      0,
    )
    const weatherLostLaps =
      weather === 'heavy-rain'
        ? 3 + Math.floor((1 - reliabilityRoll) * 3)
        : weather === 'light-rain'
          ? 1
          : 0
    const lapsCompleted = Math.max(
      7,
      plannedLaps - weatherLostLaps,
    )
    const sessionSetup =
      config.weekendContext?.setupByDriver?.[driver.id] ??
      baselineSetupForTrack(config.track)
    const bestProgram = programs.reduce(
      (best, candidate) =>
        candidate.fuelLoadKg < best.fuelLoadKg ? candidate : best,
      programs[0]!,
    )
    const longRunProgram =
      programs.find((program) => program.kind === 'race-simulation') ??
      programs.reduce(
        (longest, candidate) =>
          candidate.fuelLoadKg > longest.fuelLoadKg ? candidate : longest,
        programs[0]!,
    )
    const bestPhysicalOptions = {
      config,
      fuelLoadKg: bestProgram.fuelLoadKg,
      setup: sessionSetup,
      team,
      tire: bestProgram.tire,
      trackGrip,
      weather,
      weekendStage: stage,
    }
    const bestLapTimeSeconds =
      timedSessionPhysicalLapSeconds(bestPhysicalOptions) +
      timedSessionDriverExecutionLossSeconds({
        ...bestPhysicalOptions,
        driver,
        run: stageIndex,
        seed: `${config.seed}:practice:${stage}:${driver.id}:best`,
    })
    const longRunPhysicalOptions = {
      config,
      fuelLoadKg: longRunProgram.fuelLoadKg,
      setup: sessionSetup,
      team,
      tire: longRunProgram.tire,
      trackGrip,
      weather,
      weekendStage: stage,
    }
    const longRunPaceSeconds =
      timedSessionPhysicalLapSeconds(longRunPhysicalOptions) +
      timedSessionDriverExecutionLossSeconds({
        ...longRunPhysicalOptions,
        driver,
        run: stageIndex + 10,
        seed: `${config.seed}:practice:${stage}:${driver.id}:long`,
      })
    const setupScore = Math.round(
      Math.max(
        1,
        Math.min(
          100,
          28 +
            lapsCompleted * 1.45 +
            consistency * 13 +
            machineReliability * 14 +
            stageIndex * 5 -
            (weather === 'heavy-rain' ? 8 : weather === 'light-rain' ? 3 : 0) +
            hashChance(`${config.seed}:practice:${stage}:${driver.id}:setup`) * 9,
        ),
      ),
    )
    const setup = practiceSetupRecommendation({
      config,
      driver,
      lapsCompleted,
      setupScore,
      stage,
    })
    const runTires = programs.map((program) => program.tire)

    return {
      driverId: driver.id,
      teamId: team.id,
      code: driver.code,
      driverName: driver.name,
      teamName: team.name,
      teamColor: team.color,
      position: 0,
      bestLapTimeSeconds,
      longRunPaceSeconds,
      setupScore,
      setupRecommendation: setup.recommendation,
      setupConfidence: setup.confidence,
      lapsCompleted,
      runCount,
      runTires,
      programs,
      firstPitExitAtSeconds,
      finalPitExitAtSeconds,
      sessionDurationSeconds: FREE_PRACTICE_DURATION_SECONDS,
      weather,
      weatherLabel,
    }
  })

  results.sort((a, b) =>
    a.bestLapTimeSeconds === b.bestLapTimeSeconds
      ? a.code.localeCompare(b.code)
      : a.bestLapTimeSeconds - b.bestLapTimeSeconds,
  )

  return results.map((result, index) => ({ ...result, position: index + 1 }))
}

export function applyQualifyingGrid(
  drivers: Driver[],
  results: ReadonlyArray<Pick<QualifyingResult, 'driverId' | 'position'>>,
): Driver[] {
  const driversById = byId(drivers)
  const ordered = results
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((result, index) => {
      const driver = driversById.get(result.driverId)

      return driver
        ? {
            ...driver,
            startOffset: index === 0 ? 0 : -index * QUALIFYING_GRID_SPACING,
          }
        : null
    })
    .filter((driver): driver is Driver => driver !== null)

  if (ordered.length === drivers.length) {
    return ordered
  }

  const orderedIds = new Set(ordered.map((driver) => driver.id))
  const missing = drivers
    .filter((driver) => !orderedIds.has(driver.id))
    .map((driver, index) => ({
      ...driver,
      startOffset:
        ordered.length + index === 0
          ? 0
          : -(ordered.length + index) * QUALIFYING_GRID_SPACING,
    }))

  return [...ordered, ...missing]
}
