import { phaseOneConfig } from '../data/phaseOne'
import { START_LIGHT_SEQUENCE_SECONDS } from '../domain/startSignal'
import type {
  ActiveFlagPhase,
  CarSnapshot,
  Driver,
  FlagState,
  IncidentTrackState,
  LapTireRun,
  RaceConfig,
  RacePaceMode,
  PenaltyKind,
  RaceEvent,
  RaceSnapshot,
  StewardCase,
  TimedSessionSegmentPlan,
  TireCompound,
  WeatherState,
  WeekendStage,
} from '../types'
import { lapDeficitLabel } from './classification'
import { flagSeverityRank, incidentForLap } from './incidents'
import {
  carCanDefineNeutralisationQueue,
  incidentTrackStateForLocation,
} from './incidentTraffic'
import {
  driverPerformanceAbility,
  driverSkillBlend,
} from './driverAbility'
import {
  type DriverDecision,
  type DriverDecisionContext,
} from './driverDecision'
import { decideDriverBehaviorForPath } from './categoryDriverAgent'
import { effectiveMachineRating } from './machinePerformance'
import { baselineSetupForTrack } from './engineering'
import {
  advanceEnergyStore,
  createInitialEnergyStore,
  INITIAL_ENERGY_STORE_STATE_OF_CHARGE,
  rebaseEnergyStoreAtLapCrossing,
  startNextEnergyLap,
} from './energySystem'
import {
  advanceComponentWear,
  createCarComponents,
  normalizeCarComponents,
  weakestComponent,
} from './components'
import { overtakeForLap } from './overtaking'
import { pitBoxProgressForTeam, pitLaneMotionAt } from './pitLane'
import {
  advanceVscMarshallingSectorTracking,
  distanceRespectingLocalYellowOrder,
  flagLabelFor,
  flagPaceMultiplier,
  flagPhaseForProgress,
  lapHasTrackLimitWarning,
  penaltyFromWarnings,
  phaseThreeTuning,
  sectorFlagStatesFor,
  sectorIndexForProgress,
  vscPaceScaleForDelta,
  wearScaleForControlPhase,
  yellowFlagZoneForIncident,
} from './raceEvents'
import { hashChance } from './random'
import { buildQualifyingReleaseSchedule } from './qualifyingStrategy'
import { automaticRacePaceModeFor } from './racePace'
import { advanceRetiredCarMotion } from './retirementMotion'
import { canRejoinTrack } from './trackRejoin'
import {
  advanceNeutralisationProcedure,
  controlProcedureStatusMessage,
  ensureNeutralisationProcedure,
  SAFETY_CAR_LEADER_TARGET_GAP_SECONDS,
} from './neutralisation'
import {
  compactSessionDurationLabel,
  isPracticeStage,
  isRaceDistanceSession,
  isTimedLapSession,
  sessionDurationSecondsFor,
  weekendStageLabelFor,
} from './sessionRules'
import {
  decidePitStop,
  decideRedFlagTireChange,
  effectivePitLaneLossSecondsForControlPhase,
  overtakeDifficultyForTrack,
  pitLaneLossSecondsForTrack,
  pitStopLossSeconds,
} from './strategy'
import { startingGridDistance } from './startingGrid'
import { f1StandingStartMguKDecision } from './f1StandingStart'
import { calculateCarTelemetry } from './telemetry'
import {
  categoryPhysicsFor,
  resolveOperationalVehicleMass,
} from './categoryPhysics'
import {
  advanceTurboState,
  powerUnitRpmFor,
  selectGear,
} from './drivetrain'
import {
  blueFlagDecision,
  jumpStartDecision,
  penaltyLabel,
  pitLaneSpeedingDecision,
  proceduralPenaltyDeadlineLap,
  stewardCaseDecision,
  unsafeReleaseDecision,
  vscEndingDeltaDecision,
  vscSpeedingDecision,
  yellowFlagDecision,
  type StewardPenaltyDecision,
} from './stewarding'
import {
  activeAeroDisplayModeForState,
  advanceActiveAeroState,
  createInitialActiveAeroState,
  updateOvertakeEligibilityAfterTravel,
} from './activeAero'
import {
  advanceTireDynamicState,
  preferredTireCategoryFor,
  tireWearPercentPerLap,
  type TireTrackCondition,
} from './tires'
import { timedSessionStateAt } from './timedSessionPlan'
import {
  progressForProfileSpeed,
  referenceProfileLapTimeSeconds,
  speedForProfileTravelKph,
  trackDynamicsAt,
} from './trackDynamics'
import { trackWidthMeters } from './physicalLap'
import {
  advanceLateralState,
  lateralBoundsForTrack,
  lateralTrafficContext,
  reserveDesiredLateralOffsets,
  resolveLongitudinalOccupancy,
  type LateralVehicle,
} from './lateralDynamics'
import {
  FORMULA_VEHICLE_HALF_WIDTH_M,
  OVERTAKE_LATERAL_SAFETY_MARGIN_M,
  requiredLateralCentreSeparationM,
  TRACK_EDGE_SAFETY_MARGIN_M,
} from './vehicleGeometry'
import {
  compliesWithGrandPrixTireRule,
  FIA_2026_REGULATION_PROFILE,
  nextLowGripCondition,
  resolveF1RechargeRule,
  sessionDistanceLapsFor,
  shouldDeclareRainHazard,
} from './regulations'
import {
  createTrackWaterState,
} from './trackWater'
import {
  createTrackRubberState,
  gripWithTrackRubber,
  trackEvolutionLevelFor,
} from './trackEvolution'
import {
  advanceTrackSurface,
  createTrackSurfaceStateFromLegacySectors,
  deserializeTrackSurfaceState,
  legacySectorStateForTrackSurface,
  serializeTrackSurfaceState,
  trackSurfaceAt,
  trackSurfaceLaneForLateralOffset,
} from './trackSurface'
import { strictTrackSurfaceStateForTrack } from './trackSurfaceValidation'
import {
  baseFuelBurnKgPerLap,
  combustionPowerKwFor,
  fuelBurnKgPerLap,
  fuelMassEffects,
  initialFuelLoadKg,
  driverFuelUseMultiplier,
} from './vehicleDynamics'
import {
  practiceDryCompoundFor,
  practiceProgramFor,
  type PracticeProgramPlan,
} from './practicePrograms'
import { timedLapLaunchBlend } from './timedLapPreparation'
import { timedSessionYieldDecision } from './timedSessionTraffic'
import {
  createSuperFormulaRuntimeSystems,
  type F1RuntimeSystems,
  type F1RuntimeTireState,
} from './runtimeSystems'
import {
  fitSuperFormulaLiveControlTire,
  recordSuperFormulaLiveTireLaps,
} from './superFormulaLiveTires'
import { resolveSuperFormulaOperational } from './superFormulaOperational'
import {
  legalStartCompoundForConditions,
  weekendTireAllocation,
} from './weekendTires'
import {
  heatHazardMassIncreaseKgFor,
  heatIndexCFor,
  simulatedHumidityPercentFor,
  trackGripForWeather,
  simulatedTemperaturesFor,
  weatherFor,
  weatherForSector,
  weatherForecastFor,
  weatherLabelFor,
  weatherTrackStateFor,
} from './weather'

const EVENT_LOG_LIMIT = 100
const TICKER_EVENT_WINDOW_SECONDS = 12
/** Seconds after retirement before the wreck is cleared from the 3D track. */
const WRECK_CLEAR_SECONDS = 25
/** The worker's largest real-time step is 3 seconds at 60x. */
const MAX_REALTIME_STEP_SECONDS = 3
/** Mini sectors per lap: eight per timing sector, as the tower displays them. */
const PACE_MODE_WINDOWS_PER_LAP = 24
/**
 * Mini sectors a mode must hold before it may change again. Long enough that a
 * driver is not flicking between plans inside one corner, short enough that a
 * move developing on a straight is answered on that straight.
 */
const PACE_MODE_MINIMUM_HOLD_WINDOWS = 8
const PHYSICS_INTEGRATION_STEP_SECONDS = 0.5
const SAFETY_CAR_QUEUE_MIN_GAP_SECONDS = 0.22
/** VSC cars retain their track gaps but cannot overlap while overtaking is banned. */
const VSC_QUEUE_MIN_GAP_SECONDS = 0.4
const GRAND_PRIX_TIME_LIMIT_SECONDS = 2 * 60 * 60
const SPRINT_TIME_LIMIT_SECONDS = 60 * 60
const GRAND_PRIX_OVERALL_WINDOW_SECONDS = 3 * 60 * 60
const SPRINT_OVERALL_WINDOW_SECONDS = 90 * 60
const MINI_SECTORS_PER_SECTOR = 8
const MINI_SECTOR_COUNT = MINI_SECTORS_PER_SECTOR * 3
const FUEL_SAMPLE_RESERVE_KG = 0.8
/**
 * Marshalling sectors a car is given to reach the VSC delta after deployment.
 * One sector covers the deceleration itself; the second absorbs the sector the
 * car was already committed to when the boards came out.
 */
const VSC_DEPLOYMENT_ALLOWANCE_SECTORS = 2
/**
 * How close a lapping car must be before the blue flag is shown. Race Control
 * warns a driver who is about to be lapped, not one whose lap deficit merely
 * says a faster car exists somewhere on the circuit, so the flag waits until
 * the quicker car is genuinely on the gearbox.
 */
const BLUE_FLAG_APPROACH_GAP_SECONDS = 1.5

type F1RuntimePatch = Partial<Omit<F1RuntimeSystems, 'kind' | 'tires'>>
type F1RuntimeTirePatch = Partial<F1RuntimeTireState>
type F1TireModelCar = CarSnapshot & F1RuntimeTireState

function f1RuntimeFor(car: CarSnapshot): F1RuntimeSystems | null {
  return car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
}

function f1TireModelCarFor(car: CarSnapshot): F1TireModelCar | null {
  const runtime = f1RuntimeFor(car)

  return runtime ? { ...car, ...runtime.tires } : null
}

function patchF1Runtime(
  runtime: F1RuntimeSystems,
  patch: F1RuntimePatch = {},
  tirePatch: F1RuntimeTirePatch = {},
): F1RuntimeSystems {
  return {
    ...runtime,
    ...patch,
    tires: {
      ...runtime.tires,
      ...tirePatch,
    },
  }
}

function completeTireLap(runtimeSystems: CarSnapshot['runtimeSystems']): {
  runtimeSystems: CarSnapshot['runtimeSystems']
  tireRun: LapTireRun
} {
  if (runtimeSystems.kind === 'f1') {
    const tires = {
      ...runtimeSystems.tires,
      tireAgeLaps: runtimeSystems.tires.tireAgeLaps + 1,
    }

    return {
      runtimeSystems: {
        ...runtimeSystems,
        tires,
      },
      tireRun: {
        ageLaps: tires.tireAgeLaps,
        compound: tires.tire,
        kind: 'f1-pirelli',
      },
    }
  }

  const liveTires = recordSuperFormulaLiveTireLaps({
    completedLaps: 1,
    state: runtimeSystems.liveTires,
  })

  return {
    runtimeSystems: {
      ...runtimeSystems,
      liveTires,
    },
    tireRun: {
      kind: 'super-formula-control-tire',
      lapsOnCurrentSet: liveTires.lapsOnCurrentSet,
      physicalModelAvailability: liveTires.physicalModel.availability,
      surface: liveTires.activeSurface,
    },
  }
}

/**
 * The JAF base regulation, rather than an F1-flavoured track fallback, owns
 * the SUPER FORMULA pit-lane limit.  An unavailable rule stays unavailable;
 * callers may conservatively hold a car rather than inventing a speed.
 */
function pitLaneSpeedLimitKphFor(
  car: CarSnapshot,
  config: RaceConfig,
): number | null {
  if (car.runtimeSystems.kind === 'super-formula') {
    const pitLane = resolveSuperFormulaOperational().pitLane

    return pitLane.enforcement === 'enabled' ? pitLane.speedLimitKph : null
  }

  return config.track.pitLane?.speedLimitKph ?? 80
}

function simulatedHeadwindMpsAt(
  config: RaceConfig,
  progress: number,
) {
  const points = config.track.centerline

  if (points.length < 2) {
    return 0
  }

  const normalized = ((progress % 1) + 1) % 1
  const index = Math.floor(normalized * points.length) % points.length
  const previous = points[(index - 1 + points.length) % points.length]
  const next = points[(index + 1) % points.length]
  const travelHeading = Math.atan2(next[2] - previous[2], next[0] - previous[0])
  const windFromHeading =
    hashChance(`${config.seed}:wind-dir:${config.track.id}`) * Math.PI * 2
  const windSpeedMps =
    1.4 + hashChance(`${config.seed}:wind:${config.track.id}`) * 5.6

  return windSpeedMps * Math.cos(windFromHeading - travelHeading)
}

export function blueFlagApproachingCarFor(
  car: CarSnapshot,
  cars: CarSnapshot[],
  referenceLapTimeSeconds = 90,
): CarSnapshot | null {
  let closest: CarSnapshot | null = null
  let closestGapSeconds = Number.POSITIVE_INFINITY
  const lapTime = Math.max(40, referenceLapTimeSeconds)

  for (const candidate of cars) {
    if (
      candidate.driverId === car.driverId ||
      candidate.status !== 'running' ||
      candidate.position >= car.position ||
      candidate.offTrackSinceSeconds != null
    ) {
      continue
    }

    const lapLead = candidate.totalDistance - car.totalDistance

    if (lapLead <= 0) {
      continue
    }

    const nextLappingBoundary = Math.ceil(lapLead - 1e-9)
    const trackGapBehind = nextLappingBoundary - lapLead

    // Use physical proximity to the next lapping boundary, not the raw lap
    // deficit, so the flag tracks the car actually closing in.
    if (trackGapBehind <= 1e-6) {
      continue
    }

    const gapSeconds = trackGapBehind * lapTime

    if (
      gapSeconds <= BLUE_FLAG_APPROACH_GAP_SECONDS &&
      gapSeconds < closestGapSeconds
    ) {
      closest = candidate
      closestGapSeconds = gapSeconds
    }
  }

  return closest
}

/**
 * Re-forms the field for a red-flag restart: running cars line up nose to
 * tail behind the leader in classification order, with whole laps of deficit
 * preserved so lapped cars stay lapped. Pit/retired/finished cars are left
 * untouched. `spacingLaps` is the queue gap expressed as a lap fraction.
 */
export function reformFieldForRedRestart(
  cars: CarSnapshot[],
  spacingLaps: number,
): CarSnapshot[] {
  const leader = cars.find((car) => car.status === 'running')

  if (!leader) {
    return cars
  }

  let queueIndex = 0

  return cars.map((car) => {
    if (car.status !== 'running') {
      return car
    }

    const index = queueIndex

    queueIndex += 1

    if (car.driverId === leader.driverId) {
      return car
    }

    const lapsDown = Math.max(
      0,
      Math.floor(leader.totalDistance - car.totalDistance),
    )

    return {
      ...car,
      totalDistance: leader.totalDistance - lapsDown - index * spacingLaps,
    }
  })
}

export function reformFieldForStandingRestart(
  cars: CarSnapshot[],
  lapLengthM: number,
  standingStartMguKGateApplies = true,
): CarSnapshot[] {
  const leader = cars.find((car) => car.status === 'running')

  if (!leader) {
    return cars
  }

  const leaderLap = Math.floor(leader.totalDistance)
  let gridIndex = 0

  return cars.map((car) => {
    if (car.status !== 'running') {
      return car
    }

    const index = gridIndex
    const lapsDown = Math.max(
      0,
      Math.floor(leader.totalDistance - car.totalDistance),
    )
    const totalDistance =
      leaderLap -
      lapsDown +
      startingGridDistance(index, lapLengthM) -
      0.0001
    gridIndex += 1
    const runtimeSystems =
      car.runtimeSystems.kind === 'f1'
        ? {
            ...car.runtimeSystems,
            activeAeroMode: 'corner' as const,
            activeAeroState: createInitialActiveAeroState(),
            overtakeEligibility: null,
            ersPowerKw: 0,
            standingStartMguKReleaseLatched:
              !standingStartMguKGateApplies,
          }
        : car.runtimeSystems

    return {
      ...car,
      totalDistance,
      lap: Math.floor(totalDistance),
      progress: clamp01(totalDistance - Math.floor(totalDistance)),
      speedKph: 0,
      throttlePercent: 0,
      brakePercent: 72,
      rpm: 10_800,
      gear: 1,
      overtakeStatus: 'disabled',
      runtimeSystems,
    }
  })
}
/** Visual-only pit exit blend window after a completed stop. */
const PIT_EXIT_VISUAL_SECONDS = 4
const GRID_SETTLE_SECONDS = 8
const OVERTAKE_EXTRA_ENERGY_MJ =
  FIA_2026_REGULATION_PROFILE.energy.overtakeAdditionalEnergyPerLapMj

function advanceLiveActiveAeroState(options: {
  car: CarSnapshot
  config: RaceConfig
  deltaSeconds: number
  elapsedSeconds: number
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  requestedMode?: F1RuntimeSystems['activeAeroMode']
}): CarSnapshot {
  const {
    car,
    config,
    deltaSeconds,
    elapsedSeconds,
    lowGripConditions,
    phase,
  } = options

  if (car.runtimeSystems.kind !== 'f1') {
    return car
  }

  const requestedMode = options.requestedMode ?? car.runtimeSystems.activeAeroMode

  const activeAeroState =
    (config.seriesId ?? 'f1-custom') === 'f1-custom'
      ? advanceActiveAeroState({
          car,
          deltaSeconds,
          elapsedSeconds,
          lowGripConditions,
          phase,
          previous:
            car.runtimeSystems.activeAeroState ?? createInitialActiveAeroState(),
          requestedMode,
          track: config.track,
        })
      : createInitialActiveAeroState()

  return {
    ...car,
    runtimeSystems: {
      ...car.runtimeSystems,
      activeAeroMode: activeAeroDisplayModeForState(activeAeroState),
      activeAeroState,
    },
  }
}

export function formationLapDurationSecondsFor(config: RaceConfig) {
  const wetFactor =
    weatherFor(config.seed, config.track, 0) === 'clear' ? 1 : 1.12

  return Math.round(
    Math.min(230, Math.max(88, config.track.baseLapTime * 1.48 * wetFactor)),
  )
}

export function formationLapsPlannedFor(config: RaceConfig) {
  const weather = weatherFor(config.seed, config.track, 0)
  const trackGrip = trackGripForWeather(config.seed, config.track, 0)

  if (weather === 'heavy-rain' || trackGrip < 0.7) {
    return hashChance(`${config.seed}:sc-start-extra-lap`) < 0.32 ? 3 : 2
  }

  const abortedStart =
    hashChance(`${config.seed}:aborted-start`) <
    (weather === 'clear' ? 0.025 : 0.06)

  return abortedStart ? 2 : 1
}

export function redRestartProcedureFor(
  config: RaceConfig,
  trackGrip: number,
) {
  if (trackGrip < 0.82 || weatherFor(config.seed, config.track, 0) === 'heavy-rain') {
    return 'rolling' as const
  }

  return 'standing' as const
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function finalTimingLineSplit(options: {
  nextTotalDistance: number
  previousTotalDistance: number
  processedLap: number
}) {
  const frameDistance = Math.max(
    0,
    options.nextTotalDistance - options.previousTotalDistance,
  )
  const firstUnprocessedLap =
    Math.max(
      Math.floor(options.previousTotalDistance),
      Math.floor(options.processedLap),
    ) + 1
  const finalCrossedLap = Math.floor(options.nextTotalDistance)

  if (frameDistance <= 0 || finalCrossedLap < firstUnprocessedLap) {
    return null
  }

  const crossingFraction = clamp01(
    (finalCrossedLap - options.previousTotalDistance) / frameDistance,
  )

  return {
    crossedLapCount: finalCrossedLap - firstUnprocessedLap + 1,
    finalCrossedLap,
    crossingFraction,
    postLineFraction: 1 - crossingFraction,
  }
}

export function postLineEnergyUsageForFinalCrossing(options: {
  deploymentAcceptanceScale: number
  frameOvertakeEnergyUsedMJ: number
  frameSuperclipRecoveredMJ: number
  postLineFraction: number
  rechargeAcceptanceScale: number
}) {
  const postLineFraction = clamp01(options.postLineFraction)

  return {
    overtakeEnergyUsedMJ:
      Math.max(0, options.frameOvertakeEnergyUsedMJ) *
      postLineFraction *
      clamp01(options.deploymentAcceptanceScale),
    superclipRecoveredMJ:
      Math.max(0, options.frameSuperclipRecoveredMJ) *
      postLineFraction *
      clamp01(options.rechargeAcceptanceScale),
  }
}

const progressWithin = (progress: number, start: number, end: number) =>
  start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end

function fieldHasCrossedControlLineTargets(
  cars: CarSnapshot[],
  targets: Record<string, number>,
) {
  const carsByDriver = new Map(cars.map((car) => [car.driverId, car]))

  return Object.entries(targets).every(([driverId, target]) => {
    const car = carsByDriver.get(driverId)

    return !car || car.status !== 'running' || car.totalDistance >= target
  })
}

type DeferredBattleEffect = {
  timeLossSeconds: number
  damageDelta: number
  retires: boolean
  reason: string | null
  opponentId: string | null
  incidentTrackState: Exclude<IncidentTrackState, 'clear'> | null
}

const formatGap = (seconds: number, isLeader = false) => {
  if (isLeader) {
    return 'Leader'
  }

  return `+${seconds.toFixed(1)}s`
}

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]))

function makeEvent(
  id: string,
  kind: RaceEvent['kind'],
  elapsedSeconds: number,
  message: string,
): RaceEvent {
  return {
    id,
    kind,
    elapsedSeconds,
    timeLabel: formatElapsed(elapsedSeconds),
    message,
  }
}

function makePenalty(
  id: string,
  kind: PenaltyKind,
  reason: string,
  issuedAtSeconds: number,
  seconds: number,
  mustServeByLap: number | null = null,
  penaltyPoints = 0,
) {
  return {
    id,
    issuedAtSeconds,
    kind,
    reason,
    seconds,
    penaltyPoints,
    served: false,
    mustServeByLap,
    servedAtSeconds: null,
  }
}

/**
 * The race engine can observe a control or driving variance for either
 * category. In the absence of a sourced SUPER FORMULA event disciplinary
 * pack, it must record that observation without converting it into an FIA/ISC
 * sanction, a legal Article 5 entry, or a simulated sporting penalty.
 */
function superFormulaAutomaticReview(
  id: string,
  car: CarSnapshot,
  elapsedSeconds: number,
  subject: string,
) {
  return makeEvent(
    id,
    'investigation',
    elapsedSeconds,
    `${car.code}: ${subject} recorded by the simulator. No automatic sporting sanction is applied; official event decision required.`,
  )
}

function applyStewardPenalty(
  car: CarSnapshot,
  decision: StewardPenaltyDecision,
  id: string,
  issuedAtSeconds: number,
  raceLaps: number | null = null,
): CarSnapshot {
  if (decision.kind === null || car.runtimeSystems.kind !== 'f1') {
    return car
  }

  const isProcedural =
    decision.kind === 'drive-through' || decision.kind === 'stop-go-10'
  const currentLap = Math.floor(car.totalDistance)
  return {
    ...car,
    penaltySeconds: car.penaltySeconds + decision.seconds,
    penaltyPoints: car.penaltyPoints + decision.penaltyPoints,
    penalties: [
      ...car.penalties,
      makePenalty(
        id,
        decision.kind,
        `${decision.reason} (${decision.article})`,
        issuedAtSeconds,
        decision.seconds,
        isProcedural
          ? proceduralPenaltyDeadlineLap(currentLap, raceLaps)
          : null,
        decision.penaltyPoints,
      ),
    ],
    stewardStatus: 'penalty',
    stewardNote:
      decision.kind === 'drive-through'
        ? 'Drive-through pending'
        : decision.kind === 'stop-go-10'
          ? '10s stop-go pending'
          : `${decision.reason} +${decision.seconds}s`,
  }
}

function addDeferredBattleEffect(
  effects: Map<string, DeferredBattleEffect>,
  driverId: string,
  effect: DeferredBattleEffect,
) {
  const current = effects.get(driverId)

  effects.set(driverId, {
    timeLossSeconds: (current?.timeLossSeconds ?? 0) + effect.timeLossSeconds,
    damageDelta: (current?.damageDelta ?? 0) + effect.damageDelta,
    retires: (current?.retires ?? false) || effect.retires,
    reason: effect.retires ? effect.reason : (current?.reason ?? effect.reason),
    opponentId: effect.opponentId ?? current?.opponentId ?? null,
    incidentTrackState:
      current?.incidentTrackState === 'on-track-stopped' ||
      effect.incidentTrackState === 'on-track-stopped'
        ? 'on-track-stopped'
        : (effect.incidentTrackState ??
          current?.incidentTrackState ??
          null),
  })
}

function timedSessionReleasePlan(
  config: RaceConfig,
  driver: Driver,
  gridIndex: number,
  stage: WeekendStage,
  segment?: TimedSessionSegmentPlan | null,
  runIndex = 0,
) {
  // A grouped session only sends one group out at a time. A driver who is not
  // in this segment's group stays in the garage until their own group runs, so
  // they get no release here rather than falling through to the default below.
  if (segment && !segment.participantDriverIds.includes(driver.id)) {
    return { pitExitAtSeconds: null, strategy: null }
  }

  if (
    segment &&
    (stage === 'qualifying' || stage === 'sprintQualifying')
  ) {
    const slot = buildQualifyingReleaseSchedule({
      config,
      participantDriverIds: segment.participantDriverIds,
      runIndex,
      segment,
      stage,
    }).find((candidate) => candidate.driverId === driver.id)

    if (slot) {
      return {
        pitExitAtSeconds: slot.pitExitAtSeconds,
        strategy: slot.strategy,
      }
    }
  }

  if (segment) {
    const releaseWindow = Math.min(
      78,
      Math.max(24, (segment.endsAtSeconds - segment.startsAtSeconds) * 0.12),
    )

    return {
      pitExitAtSeconds:
        segment.startsAtSeconds +
        18 +
        gridIndex * 0.8 +
        runIndex * 6 +
        hashChance(
          `${config.seed}:segment-release:${segment.name}:${driver.id}:${runIndex}`,
        ) *
          releaseWindow,
      strategy: null,
    }
  }

  if (isPracticeStage(stage)) {
    if (runIndex > 0) {
      return { pitExitAtSeconds: 0, strategy: null }
    }

    return {
      pitExitAtSeconds:
        12 +
        gridIndex * 3.1 +
        hashChance(
          `${config.seed}:practice-release:${stage}:${driver.id}:${runIndex}`,
        ) *
          0.9,
      strategy: null,
    }
  }

  const isQualifyingStyle =
    stage === 'qualifying' || stage === 'sprintQualifying'
  const baseSeconds = isQualifyingStyle ? 38 : 90
  const spreadSeconds =
    stage === 'sprintQualifying' ? 150 : stage === 'qualifying' ? 250 : 980
  const garageSpacingSeconds = isQualifyingStyle ? 4 : 7

  return {
    pitExitAtSeconds:
      baseSeconds +
      gridIndex * garageSpacingSeconds +
      hashChance(`${config.seed}:session-release:${stage}:${driver.id}`) *
        spreadSeconds,
    strategy: null,
  }
}

function timedRunLimit(stage: WeekendStage, segmentLabel: string | null) {
  if (stage === 'fp1' || stage === 'fp2' || stage === 'fp3') {
    return 4
  }

  return segmentLabel === 'Q3' || segmentLabel === 'SQ3' ? 2 : 3
}

/**
 * Timed-session plans carry category-owned tyre declarations.  Only the F1
 * branch may turn that declaration into a Pirelli compound; a SUPER FORMULA
 * dry/wet control surface deliberately has no compatible S/M/H/I/W alias.
 */
function f1CompoundForTimedSegment(
  segment: TimedSessionSegmentPlan | null | undefined,
): TireCompound | null {
  return segment?.tire.kind === 'f1-pirelli-session-tire'
    ? segment.tire.compound
    : null
}

function timedSessionTireLabel(segment: TimedSessionSegmentPlan) {
  return segment.tire.kind === 'f1-pirelli-session-tire'
    ? segment.tire.compound
    : `${segment.tire.surface} control tyre (physical model unavailable)`
}

function timedRunCompound(
  stage: WeekendStage,
  runIndex: number,
  plannedCompound: TireCompound | null,
  weather: WeatherState,
  trackCondition?: TireTrackCondition,
  practiceContext?: {
    driverId: string
    seed: string
  },
): TireCompound {
  const preferred = trackCondition
    ? preferredTireCategoryFor(trackCondition)
    : weather === 'heavy-rain'
      ? 'W'
      : weather === 'light-rain'
        ? 'I'
        : null

  if (preferred === 'W') {
    return 'W'
  }

  if (preferred === 'I') {
    return 'I'
  }

  // Grand Prix qualifying runs are built around the fastest dry compound.
  // Keep the segment plan from accidentally carrying a race/practice tyre
  // into Q1-Q3; Sprint Qualifying retains its prescribed M/M/S plan.
  if (stage === 'qualifying' || stage === 'qualifying2') {
    return 'S'
  }

  if (isPracticeStage(stage) && practiceContext) {
    const plan = practiceProgramFor({
      driverId: practiceContext.driverId,
      runIndex,
      seed: practiceContext.seed,
      stage,
    })

    if (plan) {
      return practiceDryCompoundFor({
        driverId: practiceContext.driverId,
        plan,
        runIndex,
        seed: practiceContext.seed,
        stage,
      })
    }
  }

  if (plannedCompound) {
    return plannedCompound
  }

  const practiceCompounds: Record<'fp1' | 'fp2' | 'fp3', TireCompound[]> = {
    fp1: ['H', 'M', 'M', 'S'],
    fp2: ['M', 'S', 'M', 'S'],
    fp3: ['S', 'S', 'M', 'S'],
  }

  return stage === 'fp1' || stage === 'fp2' || stage === 'fp3'
    ? practiceCompounds[stage][runIndex % practiceCompounds[stage].length]
    : 'S'
}

function shouldUseFreshTimedSet(
  stage: WeekendStage,
  segmentLabel: string | null,
  completedRuns: number,
) {
  if (stage === 'sprintQualifying') {
    return false
  }

  if (stage === 'qualifying') {
    return segmentLabel === 'Q3' || completedRuns % 2 === 0
  }

  return true
}

function timedSessionStartingTire(
  stage: WeekendStage,
  fallback: TireCompound,
  weather: ReturnType<typeof weatherFor>,
  trackCondition: TireTrackCondition,
  practiceContext?: {
    driverId: string
    seed: string
  },
): TireCompound {
  return timedRunCompound(
    stage,
    0,
    fallback,
    weather,
    trackCondition,
    practiceContext,
  )
}

function timedRunPaceFor(options: {
  car: CarSnapshot
  seed: string
  stage: WeekendStage
  track: RaceConfig['track']
}) {
  const { car, seed, stage, track } = options
  const practicePlan = practiceProgramFor({
    driverId: car.driverId,
    runIndex: car.timedRunsCompleted,
    seed,
    stage,
  })

  if (!isTimedLapSession(stage) || car.timedRunStartedAtSeconds === null) {
    return {
      launchBlend: 0,
      paceFactor: 1,
      phase: car.timedRunPhase,
      physicsPhase: car.timedRunPhase,
      practicePlan,
    }
  }

  const isQualifyingStyle =
    stage === 'qualifying' ||
    stage === 'qualifying2' ||
    stage === 'sprintQualifying'
  const attackPaceFactor =
    practicePlan?.paceFactor ?? (isQualifyingStyle ? 0.98 : 1.04)
  const qualifyingEnergy =
    practicePlan === null || practicePlan.energyIntent === 'qualifying'

  if (car.timedRunPhase === 'out-lap') {
    const launchBlend = timedLapLaunchBlend(
      track,
      car.progress,
      car.timedRunPhase,
    )
    const outLapPaceFactor = isQualifyingStyle ? 1.42 : 1.28

    return {
      launchBlend,
      paceFactor:
        outLapPaceFactor +
        (attackPaceFactor - outLapPaceFactor) * launchBlend,
      phase: 'out-lap' as const,
      physicsPhase:
        launchBlend > 0
          ? qualifyingEnergy
            ? ('attack-lap' as const)
            : null
          : ('out-lap' as const),
      practicePlan,
    }
  }

  if (car.timedRunPhase === 'attack-lap') {
    return {
      launchBlend: 1,
      paceFactor: attackPaceFactor,
      phase: 'attack-lap' as const,
      physicsPhase: qualifyingEnergy ? ('attack-lap' as const) : null,
      practicePlan,
    }
  }

  if (car.timedRunPhase === 'in-lap') {
    return {
      launchBlend: 0,
      paceFactor: isQualifyingStyle ? 1.5 : 1.34,
      phase: 'in-lap' as const,
      physicsPhase: 'in-lap' as const,
      practicePlan,
    }
  }

  return {
    launchBlend: 0,
    paceFactor: isQualifyingStyle ? 1.2 : 1.16,
    phase: 'cooldown' as const,
    physicsPhase: 'cooldown' as const,
    practicePlan,
  }
}

function practiceFuelLoadKgFor(
  track: RaceConfig['track'],
  plan: PracticeProgramPlan | null,
) {
  if (!plan) {
    return null
  }

  return Math.min(
    110,
    Math.max(5.5, baseFuelBurnKgPerLap(track) * plan.fuelLaps),
  )
}

function measuredSectorTimesAfterTravel({
  current,
  deltaSeconds,
  frameStartSeconds,
  lapStartedAtSeconds,
  nextTotalDistance,
  previousTotalDistance,
  sectorMarks,
}: {
  current: CarSnapshot['currentLapSectorTimes']
  deltaSeconds: number
  frameStartSeconds: number
  lapStartedAtSeconds: number | null
  nextTotalDistance: number
  previousTotalDistance: number
  sectorMarks: RaceConfig['track']['sectorMarks']
}): CarSnapshot['currentLapSectorTimes'] {
  const measured: CarSnapshot['currentLapSectorTimes'] = [...current]

  if (
    lapStartedAtSeconds === null ||
    nextTotalDistance <= previousTotalDistance
  ) {
    return measured
  }

  const lapBase = Math.floor(previousTotalDistance)
  const frameDistance = nextTotalDistance - previousTotalDistance
  const boundaries = [
    lapBase + (sectorMarks[1] ?? 1 / 3),
    lapBase + (sectorMarks[2] ?? 2 / 3),
  ]

  boundaries.forEach((boundary, sectorIndex) => {
    if (
      measured[sectorIndex] !== null ||
      previousTotalDistance > boundary ||
      nextTotalDistance < boundary
    ) {
      return
    }

    const crossingFraction = Math.min(
      1,
      Math.max(0, (boundary - previousTotalDistance) / frameDistance),
    )
    const crossedAtSeconds =
      frameStartSeconds + deltaSeconds * crossingFraction
    const cumulativeTime = Math.max(
      0.001,
      crossedAtSeconds - lapStartedAtSeconds,
    )

    measured[sectorIndex] =
      sectorIndex === 0
        ? cumulativeTime
        : Math.max(0.001, cumulativeTime - (measured[0] ?? 0))
  })

  return measured
}

function miniSectorBoundaries(sectorMarks: RaceConfig['track']['sectorMarks']) {
  const sectorStarts = [
    sectorMarks[0] ?? 0,
    sectorMarks[1] ?? 1 / 3,
    sectorMarks[2] ?? 2 / 3,
    1,
  ]

  return Array.from({ length: 3 }, (_, sectorIndex) => {
    const start = sectorStarts[sectorIndex]
    const end = sectorStarts[sectorIndex + 1]

    return Array.from(
      { length: MINI_SECTORS_PER_SECTOR },
      (_, miniSectorIndex) =>
        start +
        ((end - start) * (miniSectorIndex + 1)) /
          MINI_SECTORS_PER_SECTOR,
    )
  }).flat()
}

function measuredMiniSectorTimesAfterTravel({
  current,
  deltaSeconds,
  frameStartSeconds,
  lapStartedAtSeconds,
  nextTotalDistance,
  previousTotalDistance,
  sectorMarks,
}: {
  current: CarSnapshot['currentLapMiniSectorTimes']
  deltaSeconds: number
  frameStartSeconds: number
  lapStartedAtSeconds: number | null
  nextTotalDistance: number
  previousTotalDistance: number
  sectorMarks: RaceConfig['track']['sectorMarks']
}): CarSnapshot['currentLapMiniSectorTimes'] {
  const measured = [...current]

  if (
    lapStartedAtSeconds === null ||
    nextTotalDistance <= previousTotalDistance
  ) {
    return measured
  }

  const lapBase = Math.floor(previousTotalDistance)
  const frameDistance = nextTotalDistance - previousTotalDistance
  const boundaries = miniSectorBoundaries(sectorMarks).map(
    (progress) => lapBase + progress,
  )

  boundaries.forEach((boundary, miniSectorIndex) => {
    if (
      measured[miniSectorIndex] !== null ||
      measured[miniSectorIndex] === undefined ||
      previousTotalDistance > boundary ||
      nextTotalDistance < boundary
    ) {
      return
    }

    const crossingFraction = Math.min(
      1,
      Math.max(0, (boundary - previousTotalDistance) / frameDistance),
    )
    const crossedAtSeconds =
      frameStartSeconds + deltaSeconds * crossingFraction
    const cumulativeTime = Math.max(
      0.001,
      crossedAtSeconds - lapStartedAtSeconds,
    )
    const priorTime = measured
      .slice(0, miniSectorIndex)
      .reduce<number>((sum, value) => sum + (value ?? 0), 0)

    measured[miniSectorIndex] = Math.max(0.001, cumulativeTime - priorTime)
  })

  return measured
}

function emptyCurrentLapSectorTimes(): CarSnapshot['currentLapSectorTimes'] {
  return [null, null, null]
}

function emptyCurrentLapMiniSectorTimes(): CarSnapshot['currentLapMiniSectorTimes'] {
  return Array.from({ length: MINI_SECTOR_COUNT }, () => null)
}

function completedMeasuredSectors(
  current: CarSnapshot['currentLapSectorTimes'],
  lapTimeSeconds: number,
  sectorMarks: RaceConfig['track']['sectorMarks'],
): [number, number, number] {
  const weights = [
    Math.max(0.12, (sectorMarks[1] ?? 1 / 3) - (sectorMarks[0] ?? 0)),
    Math.max(
      0.12,
      (sectorMarks[2] ?? 2 / 3) - (sectorMarks[1] ?? 1 / 3),
    ),
    Math.max(0.12, 1 - (sectorMarks[2] ?? 2 / 3)),
  ]
  const totalWeight = weights[0] + weights[1] + weights[2]
  let sectorOne = current[0] ?? (lapTimeSeconds * weights[0]) / totalWeight
  let sectorTwo = current[1] ?? (lapTimeSeconds * weights[1]) / totalWeight
  const maximumFirstTwo = Math.max(0.002, lapTimeSeconds - 0.001)

  if (sectorOne + sectorTwo > maximumFirstTwo) {
    const scale = maximumFirstTwo / (sectorOne + sectorTwo)
    sectorOne *= scale
    sectorTwo *= scale
  }

  return [sectorOne, sectorTwo, lapTimeSeconds - sectorOne - sectorTwo]
}

function completedMeasuredMiniSectors(
  current: CarSnapshot['currentLapMiniSectorTimes'],
  sectors: [number, number, number],
): number[] {
  return sectors.flatMap((sectorTime, sectorIndex) => {
    const start = sectorIndex * MINI_SECTORS_PER_SECTOR
    const measured = current.slice(start, start + MINI_SECTORS_PER_SECTOR)
    const measuredTotal = measured.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
    const missingCount = measured.filter((value) => value === null).length
    const fallback = Math.max(
      0.001,
      (sectorTime - measuredTotal) / Math.max(1, missingCount),
    )

    return measured.map((value) => value ?? fallback)
  })
}

function rankTimedSessionCars(cars: CarSnapshot[], config: RaceConfig) {
  const segmentNames = config.timedSessionPlan?.segments.map(
    (segment) => segment.name,
  )
  const timedEntry = (car: CarSnapshot) => {
    if (!segmentNames?.length) {
      return {
        groupIndex: car.bestLapTimeSeconds === null ? -1 : 0,
        groupLabel: null,
        noTimeCategory: 2,
        previousSetAt: null,
        previousTime: null,
        setAt: null,
        time: car.bestLapTimeSeconds,
      }
    }

    let groupIndex = -1

    for (let index = 0; index < segmentNames.length; index += 1) {
      if (
        Object.prototype.hasOwnProperty.call(
          car.timedSegmentBestSeconds,
          segmentNames[index],
        )
      ) {
        groupIndex = index
      }
    }

    const segmentName = groupIndex >= 0 ? segmentNames[groupIndex] : null
    const attemptStatus = segmentName
      ? car.timedSegmentAttemptStatus?.[segmentName] ??
        (car.timedRunPhase === 'attack-lap' ||
        car.timedRunPhase === 'in-lap' ||
        car.timedRunsCompleted > 0
          ? 'flying-lap'
          : car.status === 'running'
            ? 'left-pits'
            : 'garage')
      : 'garage'
    const previousSegmentName =
      groupIndex > 0 ? segmentNames[groupIndex - 1] : null

    return {
      groupIndex,
      groupLabel: segmentName,
      noTimeCategory:
        attemptStatus === 'flying-lap'
          ? 0
          : attemptStatus === 'left-pits'
            ? 1
            : 2,
      previousSetAt: previousSegmentName
        ? (car.timedSegmentBestSetAtSeconds?.[previousSegmentName] ?? null)
        : null,
      previousTime: previousSegmentName
        ? (car.timedSegmentBestSeconds[previousSegmentName] ?? null)
        : null,
      setAt: segmentName
        ? (car.timedSegmentBestSetAtSeconds?.[segmentName] ?? null)
        : null,
      time: segmentName
        ? (car.timedSegmentBestSeconds[segmentName] ?? null)
        : null,
    }
  }
  const eligible = cars.filter(
    (car) =>
      car.status !== 'retired' &&
      car.status !== 'disqualified' &&
      car.status !== 'dns',
  )
  const rankedEligible = eligible
    .map((car) => ({ car, ...timedEntry(car) }))
    .sort((left, right) => {
      if (right.groupIndex !== left.groupIndex) {
        return right.groupIndex - left.groupIndex
      }

      if (left.time === null && right.time !== null) {
        return 1
      }
      if (left.time !== null && right.time === null) {
        return -1
      }
      if (left.time !== null && right.time !== null && left.time !== right.time) {
        return left.time - right.time
      }

      if (left.time !== null && right.time !== null) {
        if (left.setAt === null && right.setAt !== null) {
          return 1
        }
        if (left.setAt !== null && right.setAt === null) {
          return -1
        }
        if (
          left.setAt !== null &&
          right.setAt !== null &&
          left.setAt !== right.setAt
        ) {
          return left.setAt - right.setAt
        }
      }

      if (
        left.time === null &&
        right.time === null &&
        left.noTimeCategory !== right.noTimeCategory
      ) {
        return left.noTimeCategory - right.noTimeCategory
      }

      if (left.time === null && right.time === null) {
        if (left.previousTime === null && right.previousTime !== null) {
          return 1
        }
        if (left.previousTime !== null && right.previousTime === null) {
          return -1
        }
        if (
          left.previousTime !== null &&
          right.previousTime !== null &&
          left.previousTime !== right.previousTime
        ) {
          return left.previousTime - right.previousTime
        }

        if (left.previousSetAt === null && right.previousSetAt !== null) {
          return 1
        }
        if (left.previousSetAt !== null && right.previousSetAt === null) {
          return -1
        }
        if (
          left.previousSetAt !== null &&
          right.previousSetAt !== null &&
          left.previousSetAt !== right.previousSetAt
        ) {
          return left.previousSetAt - right.previousSetAt
        }
      }

      return left.car.gridPosition - right.car.gridPosition
    })
  const excluded = cars
    .filter(
      (car) =>
        car.status === 'retired' ||
        car.status === 'disqualified' ||
        car.status === 'dns',
    )
    .sort((left, right) => left.gridPosition - right.gridPosition)
  const ordered = [
    ...rankedEligible,
    ...excluded.map((car) => ({
      car,
      groupIndex: -2,
      groupLabel: null,
      noTimeCategory: 2,
      previousSetAt: null,
      previousTime: null,
      setAt: null,
      time: null,
    })),
  ]
  const leaderEntry = rankedEligible[0] ?? null

  return ordered.map((entry, index) => {
    const { car } = entry
    if (
      car.status === 'retired' ||
      car.status === 'disqualified' ||
      car.status === 'dns'
    ) {
      const label =
        car.status === 'disqualified'
          ? 'DSQ'
          : car.status === 'dns'
            ? 'DNS'
            : 'OUT'

      return {
        ...car,
        position: index + 1,
        gapToLeader: 0,
        gapToAhead: 0,
        gapToLeaderLabel: label,
        gapToAheadLabel: label,
      }
    }

    const previous = index > 0 ? ordered[index - 1] : null
    const groupLeader = rankedEligible.find(
      (candidate) => candidate.groupIndex === entry.groupIndex,
    )
    const gapToLeader =
      groupLeader?.time !== null &&
      groupLeader?.time !== undefined &&
      entry.time !== null
        ? Math.max(0, entry.time - groupLeader.time)
        : 0
    const gapToAhead =
      previous?.groupIndex === entry.groupIndex &&
      previous.time !== null &&
      entry.time !== null
        ? Math.max(
            0,
            entry.time - previous.time,
          )
        : 0
    const noTimeLabel = car.status === 'pit' ? 'PIT' : 'NO TIME'
    const isGroupLeader = groupLeader?.car.driverId === car.driverId
    const isOverallLeader = leaderEntry?.car.driverId === car.driverId

    return {
      ...car,
      position: index + 1,
      gapToLeader,
      gapToAhead,
      gapToLeaderLabel:
        entry.time === null
          ? noTimeLabel
          : isOverallLeader
            ? 'Leader'
            : isGroupLeader
              ? (entry.groupLabel ?? '-')
              : `+${gapToLeader.toFixed(3)}`,
      gapToAheadLabel:
        entry.time === null
          ? noTimeLabel
          : isGroupLeader
            ? '-'
            : `+${gapToAhead.toFixed(3)}`,
    }
  })
}

export function rankCars(cars: CarSnapshot[], config: RaceConfig) {
  if (isTimedLapSession(config.weekendStage ?? 'race')) {
    return rankTimedSessionCars(cars, config)
  }

  // Pending time penalties do not move a car on the road. They remain a
  // separate timing-screen item until served or applied at the finish.
  // On-track order is shared by the physics and live timing paths.
  const trackGap = (car: CarSnapshot) => car.totalDistance - car.penaltyLaps
  // Finished cars are classified by real crossing time plus penalties, not
  // by frozen distance (which collapses at the line).
  const finishTime = (car: CarSnapshot) =>
    (car.finishedAtSeconds ?? 0) + car.penaltySeconds
  // Converts a lap-count separation into seconds through arc distance and road
  // speed instead of `baseLapTime`. It reads the same penalty-adjusted distance
  // as the ordering above, so a lap penalty moves the gap and the position
  // together rather than only the position.
  const physicalGapSeconds = (ahead: CarSnapshot, behind: CarSnapshot) => {
    const arcDistanceMeters =
      Math.max(0, trackGap(ahead) - trackGap(behind)) *
      config.track.lengthKm *
      1000
    const representativeSpeedMps = Math.max(
      5,
      (Math.max(0, ahead.speedKph) + Math.max(0, behind.speedKph)) / 7.2,
    )

    return arcDistanceMeters / representativeSpeedMps
  }

  const finished = cars
    .filter((car) => car.status === 'finished')
    .sort((a, b) => {
      const classifiedLapDifference =
        b.lap - b.penaltyLaps - (a.lap - a.penaltyLaps)

      return classifiedLapDifference !== 0
        ? classifiedLapDifference
        : finishTime(a) - finishTime(b)
    })
  const active = cars
    .filter((car) =>
      ['running', 'pit'].includes(car.status),
    )
    .sort((a, b) => trackGap(b) - trackGap(a))
  const retired = cars
    .filter((car) => car.status === 'retired')
    .sort((a, b) => b.totalDistance - a.totalDistance)
  const excluded = cars
    .filter((car) => car.status === 'disqualified' || car.status === 'dns')
    .sort((a, b) => b.totalDistance - a.totalDistance)
  const ordered = [...finished, ...active, ...retired, ...excluded]
  const leader = ordered[0]

  // The live display uses the same physical order while cars are running.
  // Finished cars already include penalties, so the board becomes the final
  // result without changing any on-track battle before the flag.
  const isExcludedStatus = (car: CarSnapshot) =>
    car.status === 'retired' ||
    car.status === 'disqualified' ||
    car.status === 'dns'
  const liveOrdered = [
    ...finished,
    ...active.slice().sort((a, b) => trackGap(b) - trackGap(a)),
    ...retired,
    ...excluded,
  ]
  const liveLeader = liveOrdered[0]
  const liveTimingById = new Map(
    liveOrdered.map((car, index) => {
      if (isExcludedStatus(car)) {
        const label =
          car.status === 'disqualified'
            ? 'DSQ'
            : car.status === 'dns'
              ? 'DNS'
              : 'OUT'

        return [
          car.driverId,
          {
            liveDisplayPosition: index + 1,
            gapToLeaderLabel: label,
            gapToAheadLabel: label,
          },
        ] as const
      }

      const gapToLeaderOnTrack =
        index === 0
          ? 0
          : car.status === 'finished' && liveLeader.status === 'finished'
            ? finishTime(car) - finishTime(liveLeader)
            : physicalGapSeconds(liveLeader, car)
      const liveAhead = index === 0 ? null : liveOrdered[index - 1]
      const gapToAheadOnTrack =
        !liveAhead || liveAhead.status === 'retired'
          ? 0
          : car.status === 'finished' && liveAhead.status === 'finished'
            ? finishTime(car) - finishTime(liveAhead)
            : physicalGapSeconds(liveAhead, car)
      // A finisher short of the reference's classified laps shows the lap
      // deficit, never the raw crossing-time difference at the flag.
      const lappedToLeader =
        car.status === 'finished' && liveLeader.status === 'finished'
          ? lapDeficitLabel(liveLeader, car)
          : null
      const lappedToAhead =
        liveAhead !== null &&
        car.status === 'finished' &&
        liveAhead.status === 'finished'
          ? lapDeficitLabel(liveAhead, car)
          : null

      return [
        car.driverId,
        {
          liveDisplayPosition: index + 1,
          gapToLeaderLabel:
            index === 0
              ? car.status === 'finished'
                ? 'Winner'
                : 'Leader'
              : lappedToLeader ?? formatGap(gapToLeaderOnTrack),
          gapToAheadLabel:
            index === 0
              ? '0.0s'
              : lappedToAhead ?? `+${gapToAheadOnTrack.toFixed(1)}s`,
        },
      ] as const
    }),
  )

  return ordered.map((car, index) => {
    const live = liveTimingById.get(car.driverId)!

    if (isExcludedStatus(car)) {
      return {
        ...car,
        position: index + 1,
        liveDisplayPosition: live.liveDisplayPosition,
        gapToLeader: 0,
        gapToAhead: 0,
        gapToLeaderLabel: live.gapToLeaderLabel,
        gapToAheadLabel: live.gapToAheadLabel,
      }
    }

    // Physics gaps follow the actual car ahead, independent of unserved time
    // penalties.
    const gapToLeader =
      index === 0
        ? 0
        : car.status === 'finished' && leader.status === 'finished'
          ? finishTime(car) - finishTime(leader)
          : physicalGapSeconds(leader, car)
    const ahead = index === 0 ? null : ordered[index - 1]
    const gapToAhead =
      !ahead || ahead.status === 'retired'
        ? 0
        : car.status === 'finished' && ahead.status === 'finished'
          ? finishTime(car) - finishTime(ahead)
          : physicalGapSeconds(ahead, car)

    return {
      ...car,
      position: index + 1,
      liveDisplayPosition: live.liveDisplayPosition,
      gapToLeader,
      gapToAhead,
      gapToLeaderLabel: live.gapToLeaderLabel,
      gapToAheadLabel: live.gapToAheadLabel,
    }
  })
}

export function carDefinesNeutralisationQueueOrder(car: CarSnapshot): boolean {
  if (!carCanDefineNeutralisationQueue(car)) {
    return false
  }

  const recoveringFromIncident =
    car.battleDeltaSecondsRemaining < -0.01 &&
    (car.battlePhase === 'resolved' || car.damage > 0)
  // Any car carrying accident damage is an obstruction to be driven around,
  // never a queue reference. Chaining the field behind a damaged car holds up
  // the whole race for one car's incident, so a car that has been in an
  // accident is always passable.
  const clearlyDisabled = car.damage > 0

  return !recoveringFromIncident && !clearlyDisabled
}

function fallbackTickerMessage(snapshot: RaceSnapshot) {
  const runningCars = snapshot.cars.filter((car) => car.status === 'running')
  const waitingCars = snapshot.cars.filter((car) => car.status === 'pit')
  const isRaceDistance = isRaceDistanceSession(snapshot.weekend.stage)

  if (snapshot.sessionStatus === 'finished') {
    return isRaceDistance
      ? `Race complete. ${snapshot.cars[0].code} wins after ${snapshot.raceLaps} laps.`
      : `${snapshot.weekend.label} complete. Timed session over.`
  }

  if (snapshot.startProcedure !== 'racing') {
    const label =
      snapshot.startProcedure === 'formation'
        ? 'Formation lap'
        : snapshot.startProcedure === 'grid'
          ? 'Grid forming'
          : 'Start lights'

    return `${label}: ${Math.ceil(snapshot.startProcedureRemainingSeconds)}s.`
  }

  if (!isRaceDistance) {
    if (waitingCars.length > 0) {
      return `${snapshot.weekend.label}: ${waitingCars.length} cars still waiting in the pit lane for their run plan.`
    }

    const fastest = snapshot.cars[0]
    return `${snapshot.weekend.label}: pit release phase complete. ${fastest.code} sets the current reference pace.`
  }

  const closestBattle = runningCars
    .filter((car) => car.position > 1 && car.gapToAhead > 0)
    .reduce<CarSnapshot | null>(
      (best, car) => (!best || car.gapToAhead < best.gapToAhead ? car : best),
      null,
    )

  if (closestBattle && closestBattle.gapToAhead < 0.7) {
    return `${closestBattle.code} is inside the Overtake detection gap: ${closestBattle.gapToAheadLabel} to the car ahead.`
  }

  const leader = snapshot.cars[0]
  return `Clean running. ${leader.code} controls the reference pace at ${leader.projectedLapTime.toFixed(1)}s.`
}

const phaseEndMessages: Record<Exclude<FlagState, 'clear'>, string> = {
  yellow: 'Marshalling zone is clear again. Green flag.',
  vsc: 'VSC hazard response complete. Withdrawal procedure begins.',
  sc: 'Safety Car hazard response complete. Withdrawal procedure begins.',
  red: 'Red flag lifted. The session restarts.',
}

const flagDeployMessages: Record<Exclude<FlagState, 'clear'>, (sector: number) => string> = {
  yellow: (sector) => `Local yellow marshalling zone in sector ${sector + 1}.`,
  vsc: () => 'VSC DEPLOYED.',
  sc: () => 'SAFETY CAR DEPLOYED.',
  red: () => 'Red flag - session suspended.',
}

function incidentProgressWithinTimingSector(
  track: RaceConfig['track'],
  sector: number,
  key: string,
) {
  const starts =
    track.sectorMarks.length >= 3
      ? track.sectorMarks.slice(0, 3)
      : [0, 1 / 3, 2 / 3]
  const boundedSector = Math.min(2, Math.max(0, sector))
  const start = starts[boundedSector] ?? boundedSector / 3
  const end = boundedSector === 2 ? 1 : (starts[boundedSector + 1] ?? 1)
  const span = end > start ? end - start : end + 1 - start
  const offset = 0.15 + hashChance(`${key}:incident-progress`) * 0.7

  return (start + span * offset) % 1
}

function stagedFlagPhase(options: {
  durationSeconds: number
  id: string
  incidentProgress?: number
  response: Exclude<FlagState, 'clear'>
  safetyCarUsesPitLane?: boolean
  sector: number
  startSeconds: number
  track: RaceConfig['track']
}) {
  const {
    durationSeconds,
    id,
    incidentProgress: suppliedIncidentProgress,
    response,
    safetyCarUsesPitLane = false,
    sector,
    startSeconds,
    track,
  } = options
  const incidentProgress =
    suppliedIncidentProgress ??
    incidentProgressWithinTimingSector(track, sector, id)
  const incidentSector = sectorIndexForProgress(
    incidentProgress,
    track.sectorMarks,
  )
  const yellowZone = yellowFlagZoneForIncident(track, incidentProgress)
  const hazardClearAtSeconds = startSeconds + durationSeconds

  if (response === 'yellow') {
    return {
      id,
      flag: response,
      sector: incidentSector,
      yellowSeverity: 'single',
      yellowZone,
      safetyCarUsesPitLane: false,
      startSeconds,
      endSeconds: hazardClearAtSeconds,
      startMessage: flagDeployMessages[response](incidentSector),
      endMessage: phaseEndMessages[response],
    } satisfies ActiveFlagPhase
  }

  const reviewDelaySeconds =
    2 + hashChance(`${id}:race-control-review`) * (response === 'sc' ? 3 : 2)
  const activateAtSeconds = startSeconds + reviewDelaySeconds

  return {
    id: `${id}-initial-yellow`,
    flag: 'yellow',
    sector: incidentSector,
    yellowSeverity: 'double',
    yellowZone,
    startSeconds,
    endSeconds: activateAtSeconds,
    startMessage: `DOUBLE YELLOW marshalling zone in sector ${incidentSector + 1}. Race Control is assessing the incident.`,
    endMessage: phaseEndMessages.yellow,
    escalation: {
      activateAtSeconds,
      endMessage: phaseEndMessages[response],
      flag: response,
      hazardClearAtSeconds,
      id,
      safetyCarUsesPitLane:
        response === 'sc' ? safetyCarUsesPitLane : false,
      startMessage: flagDeployMessages[response](incidentSector),
    },
  } satisfies ActiveFlagPhase
}

function proposedFlagSeverity(phase: ActiveFlagPhase | null) {
  return flagSeverityRank(phase?.escalation?.flag ?? phase?.flag ?? null)
}

function initialOvertakeEnableDistance(config: RaceConfig, leaderDistance: number) {
  const detectionProgress =
    config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
  const completedLapsRequired =
    config.overtakeActivation === 'after-one-lap' ? 1 : 0

  return Math.floor(leaderDistance) + completedLapsRequired + detectionProgress
}

function rechargeRuleForLapStart(
  config: RaceConfig,
  stage: WeekendStage,
  options: {
    behindSafetyCar?: boolean
    lowGripConditions?: boolean
    overtakeAtLapStart?: boolean
    timedRunPhase?: CarSnapshot['timedRunPhase']
  } = {},
) {
  return resolveF1RechargeRule({
    behindSafetyCar: options.behindSafetyCar,
    eventId: config.eventId ?? undefined,
    eventInput: config.fiaPuEventInput,
    lowGripConditions: options.lowGripConditions,
    overtakeAtLapStart: options.overtakeAtLapStart,
    stage,
    timedRunPhase: options.timedRunPhase,
    trackId: config.track.id,
  })
}

/**
 * Keep every display and control latch derived from the one authoritative
 * Energy Store ledger when a non-telemetry route starts a fresh energy lap.
 *
 * Formation/grid transitions and red-flag re-formations do not pass through
 * the normal force-step Line handler, so they must not leave a new distance
 * interval paired with the preceding lap's recharge budget or Overtake debit.
 */
function freshEnergyLapRuntimeFields(options: {
  energyStore: F1RuntimeSystems['energyStore']
  behindSafetyCar: boolean
  lowGripConditions: boolean
}): F1RuntimePatch {
  const { energyStore } = options

  return {
    energyStore,
    energyHarvestedThisLapMj: energyStore.rechargedAtCuKBusThisLapMJ,
    energyDeployedThisLapMj: energyStore.deployedAtCuKBusThisLapMJ,
    ersBatteryPercent: Math.round(energyStore.stateOfCharge * 100),
    ersPowerKw: energyStore.actualDeploymentPowerKw,
    overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
    overtakeRechargeAllowanceActiveThisLap: false,
    energyLapStartedInLowGripConditions: options.lowGripConditions,
    energyLapStartedBehindSafetyCar: options.behindSafetyCar,
    superClippingDurationSeconds: 0,
    superClippingIntensity: 0,
    superClippingRecoveredThisLapMj: 0,
    superClippingRegenPowerKw: 0,
    superClippingStartedAtProgress: null,
    superClippingStartedAtSeconds: null,
  }
}

const weekendOrderFor = (config: RaceConfig): WeekendStage[] =>
  config.seriesId === 'f1-custom' && config.track.isSprintWeekend
    ? ['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']
    : ['fp1', 'fp2', 'fp3', 'qualifying', 'race']

export function createInitialRace(config: RaceConfig = phaseOneConfig): RaceSnapshot {
  const teams = byId(config.teams)
  const categoryPhysics = categoryPhysicsFor(config.seriesId)
  const f1WeatherRules = categoryPhysics.id === 'f1-custom'
  const weekendStage = config.weekendStage ?? 'race'
  const isRaceDistance = isRaceDistanceSession(weekendStage)
  const scheduledRaceLaps =
    categoryPhysics.id === 'super-formula' && isRaceDistance
      ? (() => {
          const suppliedLaps = config.sessionRaceLapsOverride

          // JAF's base rules do not publish a category-wide or track-wide
          // race distance. The application supplies this field only for an
          // exact event operation, while Free Mode supplies the user's chosen
          // value. Never fall through to the F1-derived session heuristic.
          if (
            typeof suppliedLaps !== 'number' ||
            !Number.isInteger(suppliedLaps) ||
            suppliedLaps < 1
          ) {
            throw new Error(
              'SUPER FORMULA race distance is unavailable: provide an exact event operation or a user-selected Free Mode lap count.',
            )
          }

          return suppliedLaps
        })()
      : config.sessionRaceLapsOverride ??
        sessionDistanceLapsFor(
          config.track,
          weekendStage,
          config.categoryRaceFormat,
        )
  const weather = weatherFor(config.seed, config.track, 0)
  const currentTemperatures = simulatedTemperaturesFor(
    config.seed,
    config.track,
    weather,
  )
  const currentHumidity = simulatedHumidityPercentFor(config.track, weather)
  const heatIndexC = f1WeatherRules
    ? heatIndexCFor(currentTemperatures.airTemperatureC, currentHumidity)
    : null
  const forecastHeatTemperatures = f1WeatherRules
    ? simulatedTemperaturesFor(config.seed, config.track, 'clear')
    : null
  const forecastHeatIndexC = forecastHeatTemperatures
    ? heatIndexCFor(
        forecastHeatTemperatures.airTemperatureC,
        simulatedHumidityPercentFor(config.track, 'clear'),
      )
    : null
  const heatHazardCompetitionDeclared =
    f1WeatherRules &&
    Math.max(heatIndexC ?? Number.NEGATIVE_INFINITY, forecastHeatIndexC ?? Number.NEGATIVE_INFINITY) >
      31
  const heatHazardDeclared =
    f1WeatherRules && isRaceDistance && heatHazardCompetitionDeclared
  const heatHazardMassIncreaseKg = f1WeatherRules
    ? heatHazardMassIncreaseKgFor({
        competitionDeclared: heatHazardCompetitionDeclared,
        sessionDeclared: heatHazardDeclared,
      })
    : 0
  const trackGrip = trackGripForWeather(config.seed, config.track, 0)
  const initialRainIntensityMmH = weatherTrackStateFor(
    config.seed,
    config.track,
    0,
  ).rainIntensityMmH
  const initialWater = createTrackWaterState(initialRainIntensityMmH)
  const initialRubber = createTrackRubberState()
  // Establish the serialized two-lane surface once. Its three-sector values
  // below are compatibility projections for established session rules and UI.
  const carriedTrackSurface = config.weekendContext?.trackSurfaceCarry
  const restoredTrackSurface =
    carriedTrackSurface?.trackId === config.track.id
      ? strictTrackSurfaceStateForTrack(
          carriedTrackSurface.state,
          config.track,
        )
      : null
  const initialTrackSurface =
    restoredTrackSurface ??
    createTrackSurfaceStateFromLegacySectors(
      {
        dryingLineBySector: initialWater.dryingLineBySector,
        rubberLevelBySector: initialRubber.rubberLevelBySector,
        sectorMarks: config.track.sectorMarks,
        surfaceWaterMmBySector: initialWater.surfaceWaterMmBySector,
      },
      {
        initialSurfaceTemperatureC: currentTemperatures.trackTemperatureC,
        profile: config.track.surfaceProfile,
      },
    )
  const initialSurfaceSectors = legacySectorStateForTrackSurface(
    initialTrackSurface,
  )
  const averageInitialSurfaceWaterMm =
    initialSurfaceSectors.surfaceWaterMmBySector.reduce(
      (sum, waterMm) => sum + waterMm,
      0,
    ) / initialSurfaceSectors.surfaceWaterMmBySector.length
  const averageInitialDryingLine =
    initialSurfaceSectors.dryingLineBySector.reduce(
      (sum, dryingLine) => sum + dryingLine,
      0,
    ) / initialSurfaceSectors.dryingLineBySector.length
  const initialTireTrackCondition: TireTrackCondition = {
    dryingLine: averageInitialDryingLine,
    rainIntensityMmH: initialRainIntensityMmH,
    surfaceWaterMm: averageInitialSurfaceWaterMm,
  }
  const lowGripConditions = f1WeatherRules
    ? nextLowGripCondition({
        averageSurfaceWaterMm: averageInitialSurfaceWaterMm,
        previous: false,
        trackGrip,
        weather,
      })
    : false
  const rainHazardDeclared = f1WeatherRules
    ? shouldDeclareRainHazard({
        forecastProbability: config.track.rainProbability,
        weather,
      })
    : false
  const formationBehindSafetyCar =
    isRaceDistance &&
    (weather === 'heavy-rain' || trackGrip < 0.7 || lowGripConditions)
  const wetWeatherTyresMandatory =
    f1WeatherRules &&
    formationBehindSafetyCar &&
    (weather === 'heavy-rain' || trackGrip < 0.68)
  const formationLapDurationSeconds = isRaceDistance
    ? formationLapDurationSecondsFor(config)
    : 0
  const formationLapsPlanned = isRaceDistance
    ? formationLapsPlannedFor(config)
    : 0
  const raceLaps = isRaceDistance
    ? Math.max(1, scheduledRaceLaps - Math.max(0, formationLapsPlanned - 1))
    : scheduledRaceLaps
  const weatherForecast = weatherForecastFor(config.seed, config.track, 0)
  const weekendOrder = weekendOrderFor(config)
  const isTimedSession = isTimedLapSession(weekendStage)
  const initialRechargeRule =
    categoryPhysics.id === 'f1-custom'
      ? rechargeRuleForLapStart(config, weekendStage, {
          behindSafetyCar: formationBehindSafetyCar,
          lowGripConditions,
          overtakeAtLapStart: false,
          timedRunPhase: isTimedSession ? 'garage' : null,
        })
      : null
  const initialTimedSegment = config.timedSessionPlan?.segments[0] ?? null
  const startProcedure = isRaceDistance ? 'formation' : 'racing'
  const f1WeekendContext =
    config.weekendContext?.seriesId === 'f1-custom'
      ? config.weekendContext
      : null
  /**
   * SUPER FORMULA carries its own lifecycle state.  In particular, the
   * Article 24 entrant engine ledger and the dry/wet control-set inventory
   * must seed every new session rather than being recreated per race.
   */
  const superFormulaWeekendContext =
    config.weekendContext?.seriesId === 'super-formula'
      ? config.weekendContext
      : null
  const cars = config.drivers.map((driver, gridIndex) => {
    const team = teams.get(driver.teamId)

    if (!team) {
      throw new Error(`Missing team for driver ${driver.id}`)
    }

    const initialPracticePlan = practiceProgramFor({
      driverId: driver.id,
      runIndex: 0,
      seed: config.seed,
      stage: weekendStage,
    })
    const startsFromPitLane =
      isRaceDistance &&
      (config.weekendContext?.pitLaneStartByDriver[driver.id] ?? false)
    const didNotQualify =
      weekendStage === 'race' &&
      config.weekendContext?.qualificationStatusByDriver[driver.id] ===
        'not-qualified'
    const timedReleasePlan = isTimedSession
      ? timedSessionReleasePlan(
          config,
          driver,
          gridIndex,
          weekendStage,
          initialTimedSegment,
        )
      : null
    const pitReleaseAtSeconds = timedReleasePlan?.pitExitAtSeconds ?? null
    const f1Tires: F1RuntimeTireState | null =
      categoryPhysics.id === 'f1-custom'
        ? (() => {
            const plannedStartingTire = isTimedSession
              ? timedSessionStartingTire(
                  weekendStage,
                  f1CompoundForTimedSegment(initialTimedSegment) ?? driver.tire,
                  weather,
                  initialTireTrackCondition,
                  {
                    driverId: driver.id,
                    seed: config.seed,
                  },
                )
              : driver.tire
            const tire = legalStartCompoundForConditions(
              plannedStartingTire,
              weather,
              trackGrip,
              wetWeatherTyresMandatory,
              initialTireTrackCondition,
            )
            const regulationAllocation = weekendTireAllocation(
              config.track.isSprintWeekend,
              config.tireAllocation,
            )
            const tireSetsRemaining = {
              H:
                f1WeekendContext?.tireSetsByDriver[driver.id]?.H ??
                regulationAllocation.H,
              I:
                f1WeekendContext?.tireSetsByDriver[driver.id]?.I ??
                regulationAllocation.I,
              M:
                f1WeekendContext?.tireSetsByDriver[driver.id]?.M ??
                regulationAllocation.M,
              S:
                f1WeekendContext?.tireSetsByDriver[driver.id]?.S ??
                regulationAllocation.S,
              W:
                f1WeekendContext?.tireSetsByDriver[driver.id]?.W ??
                regulationAllocation.W,
            }

            if (
              weekendStage === 'race' &&
              config.featureRaceTwoDryCompounds
            ) {
              const detailedInventory =
                f1WeekendContext?.tireSetInventoryByDriver[driver.id] ?? []

              for (const compound of ['H', 'M', 'S'] as const) {
                if (
                  tireSetsRemaining[compound] === 0 &&
                  detailedInventory.some(
                    (set) =>
                      set.compound === compound && set.status === 'used',
                  )
                ) {
                  tireSetsRemaining[compound] = 1
                }
              }
            }

            const usesStartingSet =
              !isTimedSession ||
              (initialTimedSegment?.participantDriverIds.includes(driver.id) ===
                true &&
                pitReleaseAtSeconds !== null)
            if (usesStartingSet) {
              tireSetsRemaining[tire] = Math.max(
                0,
                tireSetsRemaining[tire] - 1,
              )
            }

            return {
              compoundsUsed: [tire],
              pendingTire: null,
              tire,
              tireAgeLaps: 0,
              tireCarcassTemperatureC: 82,
              tireGrainingPercent: 0,
              tireOverheatingPercent: 0,
              tirePerformanceState: 'optimal',
              tireSetsRemaining,
              tireTemperatureC: 86,
              tireThermalStressPercent: 0,
              tireWearPercent: 0,
            }
          })()
        : null
    const totalDistance = startsFromPitLane
      ? 1 + pitBoxProgressForTeam(config.track, config.teams, driver.teamId)
      : isRaceDistance
        ? startingGridDistance(gridIndex, config.track.lengthKm * 1000)
      : (config.track.pitLane?.exitProgress ?? 0.13)
    const lap = Math.floor(totalDistance)
    const gridLateralOffsetM =
      isRaceDistance && !startsFromPitLane
        ? gridIndex % 2 === 0
          ? -1.35
          : 1.35
        : 0
    const runtimeSystems: CarSnapshot['runtimeSystems'] =
      categoryPhysics.id === 'f1-custom'
        ? {
            kind: 'f1',
            activeAeroMode: 'corner',
            activeAeroState: createInitialActiveAeroState(),
            overtakeEligibility: null,
            overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
            overtakeRechargeAllowanceActiveThisLap: false,
            energyLapStartedInLowGripConditions: lowGripConditions,
            energyLapStartedBehindSafetyCar: formationBehindSafetyCar,
            energyHarvestedThisLapMj: 0,
            energyDeployedThisLapMj: 0,
            ersMode: 'balanced',
            ersPowerKw: 0,
            energyStore: createInitialEnergyStore(
              team,
              INITIAL_ENERGY_STORE_STATE_OF_CHARGE,
              initialRechargeRule!,
            ),
            ersBatteryPercent: INITIAL_ENERGY_STORE_STATE_OF_CHARGE * 100,
            superClippingIntensity: 0,
            superClippingRegenPowerKw: 0,
            superClippingRecoveredThisLapMj: 0,
            superClippingStartedAtSeconds: null,
            superClippingStartedAtProgress: null,
            superClippingDurationSeconds: 0,
            standingStartMguKReleaseLatched:
              !isRaceDistance ||
              startsFromPitLane ||
              formationBehindSafetyCar,
            components: normalizeCarComponents(
              f1WeekendContext?.componentConditionByDriver?.[driver.id] ??
                createCarComponents(),
            ),
            tires: f1Tires!,
          }
        : createSuperFormulaRuntimeSystems({
            entrantId: team.id,
            engineLedger:
              superFormulaWeekendContext?.engineLedgerByEntrant[team.id],
            initialTireSurface:
              initialRainIntensityMmH > 0 || averageInitialSurfaceWaterMm > 0
                ? 'wet'
                : 'dry',
            tireInventory:
              superFormulaWeekendContext?.controlTireInventoryByDriver[
                driver.id
              ],
          })

    const car: CarSnapshot = {
      driverId: driver.id,
      teamId: team.id,
      code: driver.code,
      carNumber: driver.carNumber,
      driverName: driver.name,
      teamName: team.name,
      teamColor: team.color,
      progress: clamp01(totalDistance - lap),
      lap,
      totalDistance,
      lateralOffsetM: gridLateralOffsetM,
      lateralVelocityMps: 0,
      desiredLateralOffsetM: gridLateralOffsetM,
      trackLateralOffset: gridLateralOffsetM,
      battlePhase: 'single-file',
      battleOpponentId: null,
      battlePhaseUntilSeconds: null,
      battleDeltaSecondsRemaining: 0,
      gridPosition: gridIndex + 1,
      projectedLapTime: referenceProfileLapTimeSeconds(
        config.track,
        categoryPhysics,
      ),
      lastLapTimeSeconds: null,
      bestLapTimeSeconds: null,
      bestLapLap: null,
      lapStartedAtSeconds: null,
      passedDoubleYellowThisLap: false,
      currentLapSectorTimes: emptyCurrentLapSectorTimes(),
      currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
      lapHistory: [],
      position: 0,
      gapToLeader: 0,
      gapToAhead: 0,
      gapToLeaderLabel: '',
      gapToAheadLabel: '',
      trackLimitWarnings: 0,
      offTrackSinceSeconds: null,
      rejoinEligibleAtSeconds: null,
      incidentTrackState: 'clear',
      incidentTrackStateSinceSeconds: null,
      speedKph: 0,
      racePaceMode: 'standard',
      racePaceModeDecisionLap: -1,
      racePaceModeChangedLap: -2,
      throttlePercent: 0,
      brakePercent: 0,
      rpm: 0,
      gear: 1,
      turboSpoolFraction: 0,
      clutchEngagementFraction: 0,
      overtakeStatus: 'disabled',
      runtimeSystems,
      fuelLoadKg:
        practiceFuelLoadKgFor(config.track, initialPracticePlan) ??
        initialFuelLoadKg({
          raceLaps,
          stage: weekendStage,
          track: config.track,
        }),
      brakeTemperatureC: 460,
      brakeOverheatSeconds: 0,
      stewardStatus: 'clear',
      stewardNote: null,
      timedRunStartedAtSeconds: null,
      timedRunPhase: isTimedSession ? 'garage' : null,
      timedRunsCompleted: 0,
      practiceProgram: initialPracticePlan?.kind ?? null,
      timedRunLapsCompleted: 0,
      timedRunTargetLaps: initialPracticePlan?.targetFlyingLaps ?? 1,
      timedSegmentBestSeconds:
        initialTimedSegment?.participantDriverIds.includes(driver.id)
          ? { [initialTimedSegment.name]: null }
          : {},
      timedSegmentBestSetAtSeconds:
        initialTimedSegment?.participantDriverIds.includes(driver.id)
          ? { [initialTimedSegment.name]: null }
          : {},
      timedSegmentAttemptStatus:
        initialTimedSegment?.participantDriverIds.includes(driver.id)
          ? { [initialTimedSegment.name]: 'garage' }
          : {},
      timedReleaseStrategy: timedReleasePlan?.strategy ?? null,
      qualifyingClassificationStatus: 'classified',
      deletedLapCount: 0,
      impedingWarnings: 0,
      stewardsGrantedStart: false,
      pitExitQueueSeconds: 0,
      status: didNotQualify
        ? 'dns'
        : // Timed-session cars all start in the garage; a null release means a
          // driver waiting for a later group, not a car already on track.
          isTimedSession
          ? 'pit'
          : pitReleaseAtSeconds === null && !startsFromPitLane
            ? 'running'
            : 'pit',
      processedLap: isRaceDistance ? 1 : lap,
      processedBattleSegment: -1,
      pitStops: 0,
      pitPhase:
        !isTimedSession && pitReleaseAtSeconds === null && !startsFromPitLane
          ? 'none'
          : 'box',
      pitServiceKind: null,
      pitLaneProgress: startsFromPitLane
        ? pitBoxProgressForTeam(config.track, config.teams, driver.teamId)
        : null,
      pitStartedAtSeconds: null,
      pitUntilSeconds: pitReleaseAtSeconds,
      pitExitUntilSeconds: null,
      damage: 0,
      penaltySeconds: 0,
      penaltyPoints: 0,
      penaltyLaps: 0,
      penalties: [],
      servedPenaltySeconds: 0,
      retiredAtSeconds: null,
      retiredReason: null,
      finishedAtSeconds: null,
      hiddenFromTrack: didNotQualify,
      vscDeltaSeconds: 0,
      vscRedSectorCount: 0,
      vscLastMeasuredMiniSector: null,
      hasUnlappedUnderSafetyCar: false,
      blueFlag: false,
      blueFlagSinceSeconds: null,
      timedTrafficYield: false,
      startsFromPitLane,
      lowPowerStartDetected: false,
      warningLightsUntilSeconds: null,
    }

    return car
  })
  const startMessage = isTimedSession
    ? `${weekendStageLabelFor(weekendStage)} green. Cars start in the pit lane and choose their own release windows for ${config.sessionDurationSeconds ? `${Math.round(config.sessionDurationSeconds / 60)}m` : compactSessionDurationLabel(weekendStage)}.`
    : formationBehindSafetyCar
      ? f1WeatherRules
        ? `Formation laps behind the Safety Car. ${wetWeatherTyresMandatory ? 'Wet-weather tyres are compulsory.' : 'Tyre choice remains free.'}`
        : 'Formation laps behind the Safety Car.'
      : `${weekendStage === 'sprint' ? 'Sprint start' : 'Lights out'}! ${raceLaps} laps at ${config.track.name}.`

  const overtakeIsImmediate = config.overtakeActivation === 'immediate'
  const snapshot: RaceSnapshot = {
    elapsedSeconds: 0,
    elapsedLabel: '0:00',
    leaderLap: 1,
    raceLaps,
    sessionStatus: 'racing',
    startProcedure,
    startProcedureRemainingSeconds: isRaceDistance
      ? formationLapDurationSeconds * formationLapsPlanned
      : 0,
    formationLapDurationSeconds,
    formationLapsPlanned,
    formationLapsCompleted: 0,
    formationBehindSafetyCar,
    wetWeatherTyresMandatory,
    raceStartedAtSeconds: null,
    restartProcedure: 'none',
    restartProcedureUntilSeconds: null,
    overtakeEnabled: !isRaceDistance && !lowGripConditions,
    overtakeEnableAtLeaderDistance:
      isRaceDistance && !overtakeIsImmediate
        ? initialOvertakeEnableDistance(config, 1)
        : null,
    overtakeEnableTargetsByDriver: null,
    cars: rankCars(cars, config),
    eventMessage: isRaceDistance
      ? formationBehindSafetyCar
        ? `FORMATION LAP(S) BEHIND SAFETY CAR${wetWeatherTyresMandatory ? ' - WET WEATHER TYRES MUST BE USED' : ''}.`
        : `Formation lap begins. ${formationLapsPlanned > 1 ? 'An additional formation lap is scheduled after an aborted start.' : 'Cars will complete a full circuit before returning to the grid.'}`
      : startMessage,
    flag: formationBehindSafetyCar ? 'sc' : 'clear',
    flagLabel: formationBehindSafetyCar ? 'SC FORMATION' : 'CLEAR',
    flagPhase: null,
    greenLightUntilSeconds: null,
    sectorFlags: formationBehindSafetyCar
      ? ['sc', 'sc', 'sc']
      : ['clear', 'clear', 'clear'],
    restartUntilSeconds: null,
    fuelEffectSeconds: fuelMassEffects({
      fuelLoadKg:
        (cars[0]?.fuelLoadKg ?? 0) + heatHazardMassIncreaseKg,
      track: config.track,
    }).lapTimeDeltaSeconds,
    trackEvolutionLevel: trackEvolutionLevelFor(
      initialSurfaceSectors.rubberLevelBySector,
    ),
    trackSurface: serializeTrackSurfaceState(initialTrackSurface),
    rubberLevelBySector: initialSurfaceSectors.rubberLevelBySector,
    weather,
    weatherLabel: weatherLabelFor(weather),
    weatherForecastLabel: weatherForecast.label,
    heatHazardDeclared: f1WeatherRules ? heatHazardDeclared : null,
    heatIndexC,
    heatHazardMassIncreaseKg: f1WeatherRules ? heatHazardMassIncreaseKg : null,
    rainHazardDeclared: f1WeatherRules ? rainHazardDeclared : null,
    lowGripConditions: f1WeatherRules ? lowGripConditions : null,
    trackGrip,
    surfaceWaterMmBySector: initialSurfaceSectors.surfaceWaterMmBySector,
    dryingLineBySector: initialSurfaceSectors.dryingLineBySector,
    greenFlagLaps: 0,
    raceClockSeconds: 0,
    raceEndedEarly: false,
    checkeredLapTarget: null,
    timeLimitReachedAtSeconds: null,
    timedSegmentId:
      initialTimedSegment?.id ?? initialTimedSegment?.name ?? null,
    timedSegmentLabel: initialTimedSegment?.name ?? null,
    timedSessionSuspended: false,
    timedParticipantDriverIds:
      initialTimedSegment?.participantDriverIds ??
      (isTimedSession ? config.drivers.map((driver) => driver.id) : []),
    timedYellowUntilSeconds: null,
    timedYellowSector: null,
    timedYellowProgress: null,
    pitLaneOpen: true,
    pitExitOpen: true,
    stewardCases: [],
    weekend: {
      stage: weekendStage,
      label: weekendStageLabelFor(weekendStage),
      completed: Array.from(
        new Set([
          ...(config.weekendContext?.completed ?? []),
          ...weekendOrder.slice(0, Math.max(0, weekendOrder.indexOf(weekendStage))),
        ]),
      ),
      source: 'simulation',
    },
    events: [
      ...(heatHazardCompetitionDeclared
        ? [
            makeEvent(
              'heat-hazard-declared',
              'weather',
              0,
              heatHazardDeclared
                ? `HEAT HAZARD declared. Driver Cooling System required; C4.6 mass increase ${heatHazardMassIncreaseKg}kg.`
                : `HEAT HAZARD declared for the Sprint/Race; C4.6 mass increase ${heatHazardMassIncreaseKg}kg applies in this session.`,
            ),
          ]
        : []),
      ...(rainHazardDeclared
        ? [
            makeEvent(
              'rain-hazard-declared',
              'weather',
              0,
              'RAIN HAZARD declared by Race Control.',
            ),
          ]
        : []),
      ...(lowGripConditions
        ? [
            makeEvent(
              'low-grip-declared',
              'flag',
              0,
              'LOW GRIP CONDITIONS. Full Straight Mode and Overtake disabled; partial front-wing activation only in designated zones.',
            ),
          ]
        : []),
      makeEvent(
        isTimedSession ? `${weekendStage}-start` : 'race-formation',
        'info',
        0,
        isRaceDistance
          ? formationBehindSafetyCar
            ? `Formation laps behind Safety Car. ${wetWeatherTyresMandatory ? 'Wet-weather tyres compulsory until Safety Car lights out.' : 'Follow within the Race Director gap.'}`
            : `Formation lap begins. Energy counter reset; ${formationLapDurationSeconds}s target lap.`
          : startMessage,
      ),
    ],
  }

  return snapshot
}

export function skipFormationLap(
  snapshot: RaceSnapshot,
  config: RaceConfig = phaseOneConfig,
): RaceSnapshot {
  if (
    snapshot.startProcedure !== 'formation' ||
    !isRaceDistanceSession(config.weekendStage ?? 'race')
  ) {
    return snapshot
  }

  const gridStartsAt =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned
  const secondsToGrid = Math.max(
    0.001,
    gridStartsAt - snapshot.elapsedSeconds,
  )
  let skippedSnapshot = snapshot
  let remainingSeconds = secondsToGrid

  while (
    remainingSeconds > 0 &&
    skippedSnapshot.sessionStatus !== 'finished' &&
    skippedSnapshot.startProcedure === 'formation'
  ) {
    const stepSeconds = Math.min(
      MAX_REALTIME_STEP_SECONDS,
      remainingSeconds,
    )
    skippedSnapshot = advanceRace(skippedSnapshot, stepSeconds, config)
    remainingSeconds -= stepSeconds
  }

  return skippedSnapshot
}

export function advanceRace(
  snapshot: RaceSnapshot,
  deltaSeconds: number,
  config: RaceConfig = phaseOneConfig,
  manualPitRequests?: Map<string, TireCompound>,
  manualPaceModes?: Map<string, RacePaceMode>,
): RaceSnapshot {
  if (snapshot.sessionStatus === 'finished') {
    return snapshot
  }

  const requestedWeekendStage =
    config.weekendStage ?? snapshot.weekend.stage

  if (
    deltaSeconds > PHYSICS_INTEGRATION_STEP_SECONDS &&
    deltaSeconds <= MAX_REALTIME_STEP_SECONDS
  ) {
    const integrationSteps = Math.ceil(
      deltaSeconds / PHYSICS_INTEGRATION_STEP_SECONDS,
    )
    const integrationStepSeconds = deltaSeconds / integrationSteps
    let integratedSnapshot = snapshot

    for (
      let step = 0;
      step < integrationSteps &&
      integratedSnapshot.sessionStatus !== 'finished';
      step += 1
    ) {
      integratedSnapshot = advanceRace(
        integratedSnapshot,
        integrationStepSeconds,
        config,
        manualPitRequests,
        manualPaceModes,
      )
    }

    return integratedSnapshot
  }

  const teams = byId(config.teams)
  const drivers = byId(config.drivers)
  const elapsedSeconds = snapshot.elapsedSeconds + deltaSeconds
  const raceLaps = snapshot.raceLaps
  const baseLapTime = config.track.baseLapTime
  const categoryPhysics = categoryPhysicsFor(config.seriesId)
  const f1WeatherRules = categoryPhysics.id === 'f1-custom'
  const newEvents: RaceEvent[] = []
  const weather = weatherFor(config.seed, config.track, elapsedSeconds)
  const trackGrip = trackGripForWeather(config.seed, config.track, elapsedSeconds)
  const weatherForecast = weatherForecastFor(config.seed, config.track, elapsedSeconds)
  const simulatedTemperatures = simulatedTemperaturesFor(
    config.seed,
    config.track,
    weather,
  )
  const airTemperatureC = simulatedTemperatures.airTemperatureC
  const trackTemperatureC =
    config.track.observedCalibration?.trackTemperatureC ??
    simulatedTemperatures.trackTemperatureC
  const rainIntensityMmH = weatherTrackStateFor(
    config.seed,
    config.track,
    elapsedSeconds,
  ).rainIntensityMmH
  const previousTrackSurface = deserializeTrackSurfaceState(
    snapshot.trackSurface,
  )

  if (!previousTrackSurface) {
    throw new Error('Race snapshot has an invalid canonical track surface.')
  }

  const trackSurfaceTraversals = snapshot.cars.flatMap((car) => {
    if (
      car.status !== 'running' ||
      car.pitPhase !== 'none' ||
      (car.offTrackSinceSeconds ?? null) !== null ||
      !Number.isFinite(car.speedKph) ||
      car.speedKph <= 0
    ) {
      return []
    }

    return [{
      distanceLaps:
        (Math.max(0, car.speedKph) * (Math.max(0, deltaSeconds) / 3600)) /
        config.track.lengthKm,
      lane: trackSurfaceLaneForLateralOffset(car.lateralOffsetM),
      startProgress: car.progress,
    }]
  })
  // The local two-lane substrate is the only dynamic authority. Timed
  // sessions retain their incoming rubber/marbles for group fairness, while
  // water, drying maturity, and temperature continue to respond to weather.
  const trackSurface = advanceTrackSurface({
    ambientTemperatureC: airTemperatureC,
    deltaSeconds,
    previous: previousTrackSurface,
    rainfallMmH: rainIntensityMmH,
    rubberEvolutionEnabled: !isTimedLapSession(requestedWeekendStage),
    targetSurfaceTemperatureC: trackTemperatureC,
    traversals: trackSurfaceTraversals,
  }).state
  const trackSurfaceSectors = legacySectorStateForTrackSurface(trackSurface)
  const serializedTrackSurface = serializeTrackSurfaceState(trackSurface)
  const weekendStage = requestedWeekendStage
  const isRaceDistance = isRaceDistanceSession(weekendStage)
  const heatIndexC = f1WeatherRules
    ? heatIndexCFor(
        airTemperatureC,
        simulatedHumidityPercentFor(config.track, weather),
      )
    : null
  const forecastHeatTemperatures = f1WeatherRules
    ? simulatedTemperaturesFor(config.seed, config.track, 'clear')
    : null
  const heatHazardCompetitionDeclared =
    f1WeatherRules &&
    ((snapshot.heatHazardMassIncreaseKg ?? 0) > 0 ||
      Math.max(
        heatIndexC ?? Number.NEGATIVE_INFINITY,
        forecastHeatTemperatures
          ? heatIndexCFor(
              forecastHeatTemperatures.airTemperatureC,
              simulatedHumidityPercentFor(config.track, 'clear'),
            )
          : Number.NEGATIVE_INFINITY,
      ) > 31)
  const heatHazardDeclared =
    f1WeatherRules &&
    ((snapshot.heatHazardDeclared ?? false) ||
      (isRaceDistance && heatHazardCompetitionDeclared))
  const heatHazardMassIncreaseKg = f1WeatherRules
    ? heatHazardMassIncreaseKgFor({
        competitionDeclared: heatHazardCompetitionDeclared,
        sessionDeclared: heatHazardDeclared,
      })
    : 0
  const operationalVehicleMass = resolveOperationalVehicleMass({
    f1NominalTyreMassKg: config.fiaNominalTyreMassKg ?? null,
    heatHazardAddedMassKg: heatHazardMassIncreaseKg,
    physics: categoryPhysics,
    weekendStage,
  })
  const isTimedSession = isTimedLapSession(weekendStage)
  const timedSessionDurationSeconds =
    config.timedSessionPlan?.totalDurationSeconds ??
    config.sessionDurationSeconds ??
    sessionDurationSecondsFor(weekendStage)
  const timedSessionState = timedSessionStateAt(
    config.timedSessionPlan,
    elapsedSeconds,
  )
  const averageSurfaceWaterMm =
    trackSurfaceSectors.surfaceWaterMmBySector.reduce(
      (sum, value) => sum + value,
      0,
    ) / trackSurfaceSectors.surfaceWaterMmBySector.length
  const isQualifyingPeriod =
    weekendStage === 'qualifying' || weekendStage === 'sprintQualifying'
  const mayReturnToNormal =
    !isQualifyingPeriod ||
    (timedSessionState.segment !== null &&
      timedSessionState.segment.endsAtSeconds - elapsedSeconds > 5 * 60)
  const lowGripConditions = f1WeatherRules
    ? nextLowGripCondition({
        averageSurfaceWaterMm,
        mayReturnToNormal,
        previous: snapshot.lowGripConditions === true,
        trackGrip,
        weather,
      })
    : false
  const rainHazardDeclared = f1WeatherRules
    ? shouldDeclareRainHazard({
        forecastProbability: config.track.rainProbability,
        previous: snapshot.rainHazardDeclared === true,
        weather,
      })
    : false
  const timedSegmentLabel = timedSessionState.segment?.name ?? null
  const timedSegmentId = timedSessionState.segment
    ? timedSessionState.segment.id ?? timedSessionState.segment.name
    : null
  const timedSegmentChanged =
    config.timedSessionPlan !== undefined &&
    timedSegmentId !== snapshot.timedSegmentId
  const timedSuspensionChanged =
    config.timedSessionPlan !== undefined &&
    timedSessionState.suspended !== snapshot.timedSessionSuspended
  let timedParticipantDriverIds = snapshot.timedParticipantDriverIds
  let timedYellowUntilSeconds = snapshot.timedYellowUntilSeconds
  let timedYellowSector = snapshot.timedYellowSector
  let timedYellowProgress =
    snapshot.timedYellowProgress ??
    (snapshot.timedYellowSector === null
      ? null
      : incidentProgressWithinTimingSector(
          config.track,
          snapshot.timedYellowSector,
          `legacy-timed-yellow-${snapshot.timedYellowSector}`,
        ))

  if (
    f1WeatherRules &&
    heatHazardDeclared &&
    !snapshot.heatHazardDeclared
  ) {
    newEvents.push(
      makeEvent(
        `heat-hazard-${Math.floor(elapsedSeconds)}`,
        'weather',
        elapsedSeconds,
        `HEAT HAZARD declared. Driver Cooling System required; C4.6 mass increase ${heatHazardMassIncreaseKg}kg.`,
      ),
    )
  }

  if (
    f1WeatherRules &&
    rainHazardDeclared &&
    !snapshot.rainHazardDeclared
  ) {
    newEvents.push(
      makeEvent(
        `rain-hazard-${Math.floor(elapsedSeconds)}`,
        'weather',
        elapsedSeconds,
        'RAIN HAZARD declared by Race Control.',
      ),
    )
  }

  if (f1WeatherRules && lowGripConditions !== snapshot.lowGripConditions) {
    newEvents.push(
      makeEvent(
        `grip-condition-${lowGripConditions ? 'low' : 'normal'}-${Math.floor(elapsedSeconds)}`,
        'flag',
        elapsedSeconds,
        lowGripConditions
          ? 'LOW GRIP CONDITIONS. Full Straight Mode and Overtake disabled; partial front-wing activation only in designated zones.'
          : 'NORMAL GRIP CONDITIONS. Standard active-aero zones restored.',
      ),
    )
  }

  if (
    timedYellowUntilSeconds !== null &&
    elapsedSeconds >= timedYellowUntilSeconds
  ) {
    timedYellowUntilSeconds = null
    timedYellowSector = null
    timedYellowProgress = null
    newEvents.push(
      makeEvent(
        `timed-yellow-clear-${Math.floor(elapsedSeconds)}`,
        'flag',
        elapsedSeconds,
        'Track clear. Timed-session yellow withdrawn.',
      ),
    )
  }

  if (isRaceDistance && snapshot.startProcedure !== 'racing') {
    const totalFormationSeconds =
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned
    const gridStartsAt = totalFormationSeconds
    const lightsStartAt = gridStartsAt + GRID_SETTLE_SECONDS
    const raceStartsAt = snapshot.formationBehindSafetyCar
      ? gridStartsAt
      : lightsStartAt + START_LIGHT_SEQUENCE_SECONDS
    const nextProcedure =
      elapsedSeconds < gridStartsAt
        ? 'formation'
        : snapshot.formationBehindSafetyCar
          ? 'racing'
        : elapsedSeconds < lightsStartAt
          ? 'grid'
          : elapsedSeconds < raceStartsAt
            ? 'lights'
            : 'racing'
    const phaseEndsAt =
      nextProcedure === 'formation'
        ? Math.min(
            gridStartsAt,
            (Math.floor(
              elapsedSeconds /
                Math.max(1, snapshot.formationLapDurationSeconds),
            ) +
              1) *
              snapshot.formationLapDurationSeconds,
          )
        : nextProcedure === 'grid'
          ? lightsStartAt
          : nextProcedure === 'lights'
            ? raceStartsAt
            : elapsedSeconds
    const completedFormationLaps = Math.min(
      snapshot.formationLapsPlanned,
      Math.floor(
        elapsedSeconds / Math.max(1, snapshot.formationLapDurationSeconds),
      ),
    )
    const phaseMessage =
      nextProcedure === 'formation'
        ? snapshot.formationBehindSafetyCar
          ? `Formation lap ${Math.min(snapshot.formationLapsPlanned, completedFormationLaps + 1)}/${snapshot.formationLapsPlanned} behind Safety Car. ${snapshot.wetWeatherTyresMandatory ? 'Wet tyres compulsory.' : 'Maximum gap controlled by Race Director.'}`
          : `Formation lap ${Math.min(snapshot.formationLapsPlanned, completedFormationLaps + 1)}/${snapshot.formationLapsPlanned}. Cars are warming tires and brakes.`
        : nextProcedure === 'grid'
          ? 'Cars return to their starting-grid slots.'
          : nextProcedure === 'lights'
            ? 'Start procedure: five red lights.'
            : snapshot.formationBehindSafetyCar
              ? `ROLLING START. Safety Car in; green flag at the Line.`
              : `Lights out! ${raceLaps} laps at ${config.track.name}.`

    if (nextProcedure !== snapshot.startProcedure) {
      newEvents.push(
        makeEvent(`start-${nextProcedure}`, 'info', elapsedSeconds, phaseMessage),
      )
    }

    if (
      completedFormationLaps > snapshot.formationLapsCompleted &&
      completedFormationLaps < snapshot.formationLapsPlanned
    ) {
      newEvents.push(
        makeEvent(
          `additional-formation-${completedFormationLaps}`,
          'flag',
          elapsedSeconds,
          snapshot.formationBehindSafetyCar
            ? `Safety Car remains out for formation lap ${completedFormationLaps + 1}; race distance reduced to ${raceLaps} laps.`
            : `Aborted start. Extra formation lap ${completedFormationLaps + 1}; race distance reduced to ${raceLaps} laps.`,
        ),
      )
    }

    const lightsOut = nextProcedure === 'racing' && snapshot.startProcedure === 'lights'
    const raceStartTriggered = nextProcedure === 'racing'
    const raceStartRechargeRule =
      categoryPhysics.id === 'f1-custom' && raceStartTriggered
        ? rechargeRuleForLapStart(config, weekendStage, {
            behindSafetyCar: snapshot.formationBehindSafetyCar,
            lowGripConditions,
            overtakeAtLapStart: false,
            timedRunPhase: null,
          })
        : null
    const cars = snapshot.cars.map((car, index) => {
      const driver = drivers.get(car.driverId)
      const startAbility = driver
        ? driverPerformanceAbility(driver, 'startSkill')
        : 0.8
      const raceAwareness = driver
        ? driverPerformanceAbility(driver, 'raceAwareness')
        : 0.8
      const launchSkill = driver
        ? driverSkillBlend(driver, {
            startSkill: 0.58,
            tractionControl: 0.27,
            pressureHandling: 0.15,
          })
        : startAbility
      const team = teams.get(car.teamId)
      const f1Runtime = f1RuntimeFor(car)
      const raceStartEnergyRuntimeFields =
        f1Runtime && raceStartRechargeRule !== null && team !== undefined
          ? freshEnergyLapRuntimeFields({
              energyStore: createInitialEnergyStore(
                team,
                f1Runtime.energyStore.stateOfCharge,
                raceStartRechargeRule,
              ),
              behindSafetyCar: snapshot.formationBehindSafetyCar,
              lowGripConditions,
            })
          : {}
      const machineLaunch = team
        ? (effectiveMachineRating(team.machine.traction) * 0.52 +
            effectiveMachineRating(team.machine.mechanicalGrip) * 0.3 +
            effectiveMachineRating(
              team.machine.electricalDeploymentEfficiency,
            ) *
              0.18)
        : 0.82
      const launchExecution = clamp01(
        launchSkill * 0.72 +
          machineLaunch * 0.28 +
          (hashChance(`${config.seed}:launch-execution:${car.driverId}`) - 0.5) *
            0.045,
      )
      const jumpStart =
        lightsOut &&
        !car.startsFromPitLane &&
        driver !== undefined &&
        hashChance(`${config.seed}:jump-start:${driver.id}`) <
          0.004 + Math.max(0, 1 - (startAbility * 0.55 + raceAwareness * 0.45)) * 0.014
      const jumpMovementMeters = jumpStart
        ? 0.03 +
          hashChance(`${config.seed}:jump-start-distance:${driver?.id ?? car.driverId}`) *
            4.2
        : 0
      const jumpDecision = jumpStart && f1Runtime
        ? jumpStartDecision(jumpMovementMeters)
        : null
      const weakestCondition = Math.min(
        f1Runtime?.components.ice.conditionPercent ?? 100,
        f1Runtime?.components.mguK.conditionPercent ?? 100,
        f1Runtime?.components.energyStore.conditionPercent ?? 100,
      )
      const lowPowerStart =
        lightsOut &&
        f1Runtime !== null &&
        !car.startsFromPitLane &&
        driver !== undefined &&
        hashChance(`${config.seed}:low-power-start:${driver.id}`) <
          0.004 + Math.max(0, 70 - weakestCondition) * 0.0005
      const standingStartMguKReleaseLatched = f1Runtime
        ? car.startsFromPitLane || snapshot.formationBehindSafetyCar
          ? true
          : raceStartTriggered
            ? false
            : f1Runtime.standingStartMguKReleaseLatched
        : null
      const lightsRpm = powerUnitRpmFor({
        clutchEngagementFraction: 0,
        gear: 1,
        physics: categoryPhysics,
        speedMps: 0,
      })
      const stagedTurboSpoolFraction =
        nextProcedure === 'lights'
          ? advanceTurboState({
              deltaSeconds,
              physics: categoryPhysics,
              previousState: {
                spoolFraction: car.turboSpoolFraction ?? 0,
              },
              rpm: lightsRpm,
              throttleFraction: 0.36,
            }).spoolFraction
          : car.turboSpoolFraction ?? 0

      if (jumpStart) {
        newEvents.push(
          f1Runtime && jumpDecision
            ? makeEvent(
                `jump-start-${car.driverId}`,
                'penalty',
                elapsedSeconds,
                `${car.code} receives ${penaltyLabel(jumpDecision)} for a false start (${jumpMovementMeters.toFixed(2)}m, ${jumpDecision.article}).`,
              )
            : superFormulaAutomaticReview(
                `jump-start-${car.driverId}`,
                car,
                elapsedSeconds,
                `false-start movement (${jumpMovementMeters.toFixed(2)}m)`,
              ),
        )
      }

      if (lowPowerStart) {
        newEvents.push(
          makeEvent(
            `low-power-start-${car.driverId}`,
            'info',
            elapsedSeconds,
            `${car.code}: low-power start detected; warning lights flashing.`,
          ),
        )
      }

      if (car.startsFromPitLane) {
        return {
          ...car,
          status: 'pit' as const,
          pitPhase: 'box' as const,
          pitLaneProgress: pitBoxProgressForTeam(
            config.track,
            config.teams,
            car.teamId,
          ),
          pitUntilSeconds: lightsOut
            ? elapsedSeconds + Math.max(6, baseLapTime * 0.14)
            : null,
          speedKph: 0,
          throttlePercent: 0,
          brakePercent: nextProcedure === 'lights' ? 54 : 18,
          rpm: nextProcedure === 'lights' ? Math.round(lightsRpm) : 0,
          gear: 1,
          turboSpoolFraction: stagedTurboSpoolFraction,
          clutchEngagementFraction: 0,
          overtakeStatus: 'disabled' as const,
          runtimeSystems: f1Runtime
            ? patchF1Runtime(f1Runtime, {
                activeAeroMode: 'corner' as const,
                activeAeroState: createInitialActiveAeroState(),
                overtakeEligibility: null,
                ersMode: 'harvest' as const,
                ersPowerKw: 0,
                overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
                energyHarvestedThisLapMj: 0,
                energyDeployedThisLapMj: 0,
                superClippingIntensity: 0,
                superClippingRegenPowerKw: 0,
                superClippingRecoveredThisLapMj: 0,
                superClippingStartedAtSeconds: null,
                superClippingStartedAtProgress: null,
                superClippingDurationSeconds: 0,
                ...raceStartEnergyRuntimeFields,
              })
            : car.runtimeSystems,
          lapStartedAtSeconds: null,
          passedDoubleYellowThisLap: false,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
        }
      }

      const formationProgress = Math.min(
        snapshot.formationLapsPlanned,
        elapsedSeconds / Math.max(1, snapshot.formationLapDurationSeconds),
      )
      const formationDistance =
        startingGridDistance(index, config.track.lengthKm * 1000) +
        formationProgress
      const stagedDistance =
        nextProcedure === 'formation'
          ? formationDistance
          : snapshot.formationBehindSafetyCar && nextProcedure === 'racing'
            ? formationDistance
          : startingGridDistance(index, config.track.lengthKm * 1000)
      const stagedLap = Math.floor(stagedDistance)
      return {
        ...car,
        totalDistance: stagedDistance,
        lap: stagedLap,
        progress: clamp01(stagedDistance - stagedLap),
        brakePercent:
          nextProcedure === 'lights'
            ? 72
            : nextProcedure === 'formation'
              ? 18
              : snapshot.formationBehindSafetyCar
                ? 8
                : 20,
        rpm:
          nextProcedure === 'lights' || lightsOut
            ? Math.round(lightsRpm)
            : nextProcedure === 'formation'
              ? 6200
              : snapshot.formationBehindSafetyCar
                ? 9200
                : 0,
        gear:
          nextProcedure === 'lights' || lightsOut ? 1 : car.gear,
        speedKph:
          nextProcedure === 'formation'
            ? Math.round(
                Math.min(
                  190,
                  Math.max(
                    75,
                    (config.track.lengthKm /
                      Math.max(1, snapshot.formationLapDurationSeconds)) *
                      3600,
                  ),
                ),
              )
            : snapshot.formationBehindSafetyCar && nextProcedure === 'racing'
              ? 145
            : lightsOut
              ? 0
              : 0,
        throttlePercent:
          nextProcedure === 'lights'
            ? 36
            : nextProcedure === 'formation'
              ? 42
              : snapshot.formationBehindSafetyCar
                ? 58
                : lightsOut
                  ? Math.round(52 + launchExecution * 24)
                  : 0,
        turboSpoolFraction: stagedTurboSpoolFraction,
        clutchEngagementFraction:
          nextProcedure === 'lights' || lightsOut
            ? 0
            : car.clutchEngagementFraction,
        brakeTemperatureC: Math.min(
          820,
          car.brakeTemperatureC +
            (nextProcedure === 'formation' ? deltaSeconds * 1.4 : 0),
        ),
        runtimeSystems: f1Runtime
          ? patchF1Runtime(
              f1Runtime,
              {
                ersMode:
                  nextProcedure === 'lights'
                    ? ('balanced' as const)
                    : ('harvest' as const),
                overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
                energyHarvestedThisLapMj: 0,
                energyDeployedThisLapMj: 0,
                superClippingIntensity: 0,
                superClippingRegenPowerKw: 0,
                superClippingRecoveredThisLapMj: 0,
                superClippingStartedAtSeconds: null,
                superClippingStartedAtProgress: null,
                superClippingDurationSeconds: 0,
                ...raceStartEnergyRuntimeFields,
                standingStartMguKReleaseLatched:
                  standingStartMguKReleaseLatched ??
                  f1Runtime.standingStartMguKReleaseLatched,
              },
              {
                tireTemperatureC: Math.min(
                  104,
                  f1Runtime.tires.tireTemperatureC + deltaSeconds * 0.35,
                ),
                tireCarcassTemperatureC: Math.min(
                  96,
                  f1Runtime.tires.tireCarcassTemperatureC + deltaSeconds * 0.16,
                ),
                tireGrainingPercent: Math.max(
                  0,
                  f1Runtime.tires.tireGrainingPercent - deltaSeconds * 0.08,
                ),
                tireOverheatingPercent: Math.max(
                  0,
                  f1Runtime.tires.tireOverheatingPercent - deltaSeconds * 0.12,
                ),
              },
            )
          : car.runtimeSystems,
        penaltySeconds:
          car.penaltySeconds + (jumpDecision?.seconds ?? 0),
        penalties: jumpStart && jumpDecision
          ? [
              ...car.penalties,
              makePenalty(
                `false-start-${driver.id}`,
                jumpDecision!.kind!,
                `${jumpDecision!.reason} (${jumpDecision!.article})`,
                elapsedSeconds,
                jumpDecision!.seconds,
                jumpDecision!.kind === 'drive-through' ||
                  jumpDecision!.kind === 'stop-go-10'
                  ? Math.floor(car.totalDistance) + 2
                  : null,
              ),
            ]
          : car.penalties,
        stewardStatus: jumpStart
          ? jumpDecision
            ? ('penalty' as const)
            : ('noted' as const)
          : car.stewardStatus,
        stewardNote: jumpStart
          ? jumpDecision
            ? jumpDecision.kind === 'drive-through'
            ? 'False start: drive-through pending'
            : jumpDecision!.kind === 'stop-go-10'
              ? 'False start: 10s stop-go pending'
              : `False start +${jumpDecision!.seconds}s`
            : 'False-start movement recorded; official review required'
          : car.stewardNote,
        lapStartedAtSeconds: raceStartTriggered
          ? elapsedSeconds
          : car.lapStartedAtSeconds,
        currentLapSectorTimes: raceStartTriggered
          ? emptyCurrentLapSectorTimes()
          : car.currentLapSectorTimes,
        currentLapMiniSectorTimes: raceStartTriggered
          ? emptyCurrentLapMiniSectorTimes()
          : car.currentLapMiniSectorTimes,
        lowPowerStartDetected: lowPowerStart,
        warningLightsUntilSeconds: lowPowerStart
          ? elapsedSeconds + 4
          : car.warningLightsUntilSeconds,
      }
    })

    const carsWithActiveAeroState = cars.map((car) =>
      advanceLiveActiveAeroState({
        car,
        config,
        deltaSeconds,
        elapsedSeconds,
        lowGripConditions,
        phase: null,
        requestedMode: 'corner',
      }),
    )
    const nextSnapshot: RaceSnapshot = {
      ...snapshot,
      cars: rankCars(carsWithActiveAeroState, config),
      elapsedSeconds,
      elapsedLabel: formatElapsed(elapsedSeconds),
      eventMessage: phaseMessage,
      events: [...newEvents.slice().reverse(), ...snapshot.events].slice(
        0,
        EVENT_LOG_LIMIT,
      ),
      startProcedure: nextProcedure,
      startProcedureRemainingSeconds: Math.max(0, phaseEndsAt - elapsedSeconds),
      formationLapsCompleted: completedFormationLaps,
      wetWeatherTyresMandatory:
        nextProcedure === 'racing'
          ? false
          : snapshot.wetWeatherTyresMandatory,
      raceStartedAtSeconds: raceStartTriggered
        ? elapsedSeconds
        : snapshot.raceStartedAtSeconds,
      overtakeEnabled:
        raceStartTriggered &&
        config.overtakeActivation === 'immediate' &&
        !lowGripConditions,
      overtakeEnableAtLeaderDistance:
        raceStartTriggered && config.overtakeActivation === 'immediate'
          ? null
          : raceStartTriggered && snapshot.formationBehindSafetyCar
            ? initialOvertakeEnableDistance(
                config,
                Math.floor(cars[0]?.totalDistance ?? 1) + 1,
              )
          : snapshot.overtakeEnableAtLeaderDistance,
      flag:
        snapshot.formationBehindSafetyCar && nextProcedure === 'formation'
          ? 'sc'
          : 'clear',
      flagLabel:
        snapshot.formationBehindSafetyCar && nextProcedure === 'formation'
          ? 'SC FORMATION'
          : 'CLEAR',
      sectorFlags:
        snapshot.formationBehindSafetyCar && nextProcedure === 'formation'
          ? ['sc', 'sc', 'sc']
          : ['clear', 'clear', 'clear'],
      surfaceWaterMmBySector: trackSurfaceSectors.surfaceWaterMmBySector,
      dryingLineBySector: trackSurfaceSectors.dryingLineBySector,
      rubberLevelBySector: trackSurfaceSectors.rubberLevelBySector,
      trackEvolutionLevel: trackEvolutionLevelFor(
        trackSurfaceSectors.rubberLevelBySector,
      ),
      trackSurface: serializedTrackSurface,
      weather,
      weatherLabel: weatherLabelFor(weather),
      weatherForecastLabel: weatherForecast.label,
      rainHazardDeclared: f1WeatherRules ? rainHazardDeclared : null,
      lowGripConditions: f1WeatherRules ? lowGripConditions : null,
      trackGrip,
    }

    return nextSnapshot
  }

  if (weather !== snapshot.weather) {
    newEvents.push(
      makeEvent(
        `weather-${Math.floor(elapsedSeconds / 10)}-${weather}`,
        'weather',
        elapsedSeconds,
        weather === 'clear'
          ? `Weather update: rain has cleared, track grip ${Math.round(trackGrip * 100)}%.`
          : `Weather update: ${weatherLabelFor(weather).toLowerCase()}, track grip ${Math.round(trackGrip * 100)}%.`,
      ),
    )
  } else if (Math.abs(trackGrip - snapshot.trackGrip) > 0.12) {
    newEvents.push(
      makeEvent(
        `grip-${Math.floor(elapsedSeconds / 10)}-${Math.round(trackGrip * 100)}`,
        'weather',
        elapsedSeconds,
        `Track grip now ${Math.round(trackGrip * 100)}%.`,
      ),
    )
  }

  // --- Flag phase lifecycle -------------------------------------------------
  let phase = snapshot.flagPhase
  let restartUntilSeconds = snapshot.restartUntilSeconds
  let restartProcedure = snapshot.restartProcedure
  let restartProcedureUntilSeconds = snapshot.restartProcedureUntilSeconds
  let overtakeEnabled = snapshot.overtakeEnabled
  let overtakeEnableAtLeaderDistance = snapshot.overtakeEnableAtLeaderDistance
  let overtakeEnableTargetsByDriver =
    snapshot.overtakeEnableTargetsByDriver
  let greenLightUntilSeconds = snapshot.greenLightUntilSeconds ?? null
  let redFlagRestart = false
  const safetyCarPenaltyLapDriverIds = new Set<string>()
  const vscPenaltiesByDriver = new Map<
    string,
    { decision: StewardPenaltyDecision; id: string }
  >()

  if (
    greenLightUntilSeconds !== null &&
    elapsedSeconds >= greenLightUntilSeconds
  ) {
    greenLightUntilSeconds = null
  }

  if (lowGripConditions) {
    overtakeEnabled = false
    overtakeEnableAtLeaderDistance = null
    overtakeEnableTargetsByDriver = null
  } else if (snapshot.lowGripConditions && isRaceDistance) {
    const detectionProgress =
      config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
    const leaderDistance = snapshot.cars[0]?.totalDistance ?? 1
    overtakeEnableAtLeaderDistance =
      Math.floor(leaderDistance) + 1 + detectionProgress
  }

  if (
    phase?.flag === 'yellow' &&
    phase.escalation &&
    elapsedSeconds >= phase.escalation.activateAtSeconds
  ) {
    const escalation = phase.escalation
    phase = ensureNeutralisationProcedure(
      {
        id: escalation.id,
        flag: escalation.flag,
        sector: phase.sector,
        safetyCarUsesPitLane: escalation.safetyCarUsesPitLane,
        startSeconds: escalation.activateAtSeconds,
        endSeconds: escalation.hazardClearAtSeconds,
        startMessage: escalation.startMessage,
        endMessage: escalation.endMessage,
      },
      snapshot.cars,
      config.track,
    )
    const detectionProgress =
      config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
    const leaderDistance = snapshot.cars[0]?.totalDistance ?? 1
    greenLightUntilSeconds = null
    overtakeEnabled = false
    overtakeEnableAtLeaderDistance =
      Math.floor(leaderDistance) + 1 + detectionProgress
    overtakeEnableTargetsByDriver = null
    newEvents.push(
      makeEvent(
        escalation.id,
        'flag',
        escalation.activateAtSeconds,
        escalation.startMessage,
      ),
    )
  }

  if (phase && (phase.flag === 'sc' || phase.flag === 'vsc')) {
    const neutralisation = advanceNeutralisationProcedure({
      cars: snapshot.cars,
      elapsedSeconds,
      finishingLap:
        isRaceDistance &&
        snapshot.leaderLap >=
          (snapshot.checkeredLapTarget ?? snapshot.raceLaps),
      lowVisibility:
        weather === 'heavy-rain' &&
        (rainIntensityMmH >= 16 || averageSurfaceWaterMm >= 2.4),
      overtakingPermitted:
        weather !== 'heavy-rain' && averageSurfaceWaterMm < 2.4,
      phase,
      seed: config.seed,
      track: config.track,
    })

    for (const event of neutralisation.events) {
      const reviewedSuperFormulaCar = neutralisation.penaltyLapDriverIds
        .filter((driverId) => event.id.endsWith(`-${driverId}`))
        .map((driverId) =>
          snapshot.cars.find(
            (car) =>
              car.driverId === driverId &&
              car.runtimeSystems.kind === 'super-formula',
          ),
        )
        .find((car): car is CarSnapshot => car !== undefined)

      // The neutralisation helper models the F1 penalty-lap procedure.  SF
      // may retain the control observation, but must not surface that helper's
      // automatic sporting penalty text or classification consequence.
      newEvents.push(
        reviewedSuperFormulaCar
          ? superFormulaAutomaticReview(
              event.id,
              reviewedSuperFormulaCar,
              event.atSeconds,
              'Safety Car overtaking observation',
            )
          : makeEvent(
              event.id,
              event.id.startsWith('sc-unauthorized-overtake')
                ? 'penalty'
                : 'flag',
              event.atSeconds,
              event.message,
            ),
      )
    }

    for (const driverId of neutralisation.penaltyLapDriverIds) {
      const car = snapshot.cars.find((candidate) => candidate.driverId === driverId)
      if (car?.runtimeSystems.kind === 'f1') {
        safetyCarPenaltyLapDriverIds.add(driverId)
      }
    }

    phase = neutralisation.phase

    if (neutralisation.completedFlag !== null) {
      restartUntilSeconds =
        elapsedSeconds + phaseThreeTuning.restartWindowSeconds
      greenLightUntilSeconds = neutralisation.greenLightUntilSeconds
      overtakeEnabled = false

      if (neutralisation.completedFlag === 'sc') {
        overtakeEnableAtLeaderDistance = null
        overtakeEnableTargetsByDriver =
          neutralisation.restartTargetsByDriver
      } else {
        for (const car of snapshot.cars) {
          if (car.status !== 'running' || car.runtimeSystems.kind !== 'f1') {
            continue
          }

          const redSectorCount = car.vscRedSectorCount ?? 0
          const redSectorDecision = vscSpeedingDecision(redSectorCount)
          const decision =
            redSectorDecision.kind !== null
              ? redSectorDecision
              : car.vscDeltaSeconds < -0.01
                ? vscEndingDeltaDecision(Math.abs(car.vscDeltaSeconds))
                : null

          if (!decision || decision.kind === null) {
            continue
          }

          const decisionId =
            redSectorDecision.kind !== null
              ? `vsc-red-sectors-${car.driverId}-${Math.floor(elapsedSeconds)}`
              : `vsc-ending-delta-${car.driverId}-${Math.floor(elapsedSeconds)}`
          vscPenaltiesByDriver.set(car.driverId, {
            decision,
            id: decisionId,
          })
          newEvents.push(
            makeEvent(
              decisionId,
              'penalty',
              elapsedSeconds,
              redSectorDecision.kind !== null
                ? `${car.code} records ${redSectorCount} red VSC marshalling sectors and receives ${penaltyLabel(decision)} (${decision.article}).`
                : `${car.code} is ${Math.abs(car.vscDeltaSeconds).toFixed(2)}s below the minimum delta when the VSC ends and receives ${penaltyLabel(decision)} (${decision.article}).`,
            ),
          )
        }
        const detectionProgress =
          config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
        const leaderDistance = snapshot.cars[0]?.totalDistance ?? 1
        overtakeEnableAtLeaderDistance =
          Math.floor(leaderDistance) + 1 + detectionProgress
        overtakeEnableTargetsByDriver = null
        const greenEventIndex = newEvents.findIndex((event) =>
          event.id.startsWith('vsc-green-'),
        )
        if (greenEventIndex >= 0) {
          newEvents.push(...newEvents.splice(greenEventIndex, 1))
        }
      }
    }
  }

  if (
    phase &&
    (phase.flag === 'yellow' || phase.flag === 'red') &&
    elapsedSeconds >= phase.endSeconds
  ) {
    newEvents.push(
      makeEvent(`flag-end-${phase.id}`, 'flag', elapsedSeconds, phase.endMessage),
    )
    if (phase.flag !== 'yellow' && phase.flag !== 'red') {
      restartUntilSeconds = elapsedSeconds + phaseThreeTuning.restartWindowSeconds
    }
    redFlagRestart = phase.flag === 'red'
    if (redFlagRestart) {
      restartProcedure = redRestartProcedureFor(config, trackGrip)
      restartProcedureUntilSeconds =
        elapsedSeconds +
        (restartProcedure === 'standing'
          ? GRID_SETTLE_SECONDS + START_LIGHT_SEQUENCE_SECONDS
          : Math.max(35, baseLapTime * 1.18))
    }
    if (phase.flag !== 'yellow') {
      overtakeEnabled = false
      const detectionProgress =
        config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
      const leaderDistance = snapshot.cars[0]?.totalDistance ?? 1
      overtakeEnableAtLeaderDistance =
        Math.floor(leaderDistance) + 1 + detectionProgress
      overtakeEnableTargetsByDriver = null
    }
    phase = null
  }

  if (
    restartProcedure !== 'none' &&
    restartProcedureUntilSeconds !== null &&
    elapsedSeconds >= restartProcedureUntilSeconds
  ) {
    const completedProcedure = restartProcedure
    restartProcedure = 'none'
    restartProcedureUntilSeconds = null
    restartUntilSeconds = elapsedSeconds + phaseThreeTuning.restartWindowSeconds
    overtakeEnabled = false
    const detectionProgress =
      config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
    overtakeEnableAtLeaderDistance =
      Math.floor(snapshot.cars[0]?.totalDistance ?? 1) + 1 + detectionProgress
    overtakeEnableTargetsByDriver = null
    newEvents.push(
      makeEvent(
        `red-${completedProcedure}-restart-complete-${Math.floor(elapsedSeconds)}`,
        'flag',
        elapsedSeconds,
        completedProcedure === 'standing'
          ? 'STANDING START. Lights out for the red-flag resumption.'
          : 'ROLLING START. Green flag at the control line.',
      ),
    )
  }

  if (restartUntilSeconds !== null && elapsedSeconds >= restartUntilSeconds) {
    restartUntilSeconds = null
  }
  const leaderHasReachedOvertakeEnableLine =
    overtakeEnableAtLeaderDistance !== null &&
    (snapshot.cars[0]?.totalDistance ?? 0) >= overtakeEnableAtLeaderDistance
  const fieldHasReachedOvertakeEnableLine =
    overtakeEnableTargetsByDriver !== null &&
    fieldHasCrossedControlLineTargets(
      snapshot.cars,
      overtakeEnableTargetsByDriver,
    )

  if (
    !phase &&
    restartProcedure === 'none' &&
    !overtakeEnabled &&
    !lowGripConditions &&
    (!isRaceDistance ||
      leaderHasReachedOvertakeEnableLine ||
      fieldHasReachedOvertakeEnableLine)
  ) {
    overtakeEnabled = true
    overtakeEnableAtLeaderDistance = null
    overtakeEnableTargetsByDriver = null
    newEvents.push(
      makeEvent(
        `overtake-enabled-${Math.floor(elapsedSeconds)}`,
        'info',
        elapsedSeconds,
        'OVERTAKE ENABLED. Detection and activation lines are live.',
      ),
    )
  }
  const pitEntrySector = sectorIndexForProgress(
    config.track.pitLane?.entryProgress ?? 0.965,
    config.track.sectorMarks,
  )
  const incidentBlocksPitEntry =
    phase?.flag === 'sc' &&
    phase.sector === pitEntrySector &&
    elapsedSeconds - phase.startSeconds < 12
  const pitLaneOpen =
    phase?.flag !== 'red' &&
    restartProcedure === 'none' &&
    !incidentBlocksPitEntry &&
    !timedSessionState.suspended
  const pitExitOpen =
    pitLaneOpen &&
    !(
      phase?.flag === 'sc' &&
      phase.neutralisation?.kind === 'safety-car' &&
      phase.neutralisation.pitExitClosed
    )

  if (pitLaneOpen !== snapshot.pitLaneOpen) {
    newEvents.push(
      makeEvent(
        `pit-lane-${pitLaneOpen ? 'open' : 'closed'}-${Math.floor(elapsedSeconds)}`,
        'pit',
        elapsedSeconds,
        `Pit lane ${pitLaneOpen ? 'open' : 'closed'} by Race Control.`,
      ),
    )
  }

  if (pitExitOpen !== (snapshot.pitExitOpen ?? true)) {
    newEvents.push(
      makeEvent(
        `pit-exit-${pitExitOpen ? 'open' : 'closed'}-${Math.floor(elapsedSeconds)}`,
        'pit',
        elapsedSeconds,
        `Pit exit ${pitExitOpen ? 'open' : 'closed'} by Race Control.`,
      ),
    )
  }

  const inRestartWindow = restartUntilSeconds !== null
  const riskMultiplier = inRestartWindow ? phaseThreeTuning.restartRiskMultiplier : 1

  // Strongest flag proposed by this frame's incidents. Held in an object so
  // assignments from inside the map callback survive closure narrowing.
  const frame: { proposedPhase: ActiveFlagPhase | null } = { proposedPhase: null }

  // How many cars had already finished before this frame (for finish order).
  let finishedCount = snapshot.cars.filter((car) => car.status === 'finished').length
  const finishLapTarget = snapshot.checkeredLapTarget ?? raceLaps

  // Classification-order traversal so SC queue spacing can look at the car
  // ahead's already-advanced distance.
  let aheadTotal: number | null = null
  const deferredBattleEffects = new Map<string, DeferredBattleEffect>()
  const deferredTimedGridPenalties = new Map<string, number>()
  const teamsPittingThisFrame = new Set<string>()
  let timedPitExitAvailableAt = elapsedSeconds
  const timedPitExitGapSeconds = isPracticeStage(weekendStage) ? 2.4 : 1.35
  let stewardCases = [...(snapshot.stewardCases ?? [])]

  // During a red-flag suspension the field gathers for the restart, so the
  // resume re-forms a nose-to-tail queue in classification order.
  let frameCars = snapshot.cars

  if (vscPenaltiesByDriver.size > 0) {
    frameCars = frameCars.map((car) => {
      const penalty = vscPenaltiesByDriver.get(car.driverId)

      return penalty
        ? applyStewardPenalty(
            car,
            penalty.decision,
            penalty.id,
            elapsedSeconds,
            raceLaps,
          )
        : car
    })
  }

  if (
    isTimedSession &&
    config.timedSessionPlan &&
    (timedSegmentChanged || timedSuspensionChanged)
  ) {
    const segment = timedSessionState.segment
    const segmentDisplayLabel =
      segment?.displayLabel ?? segment?.name ?? 'Timed session'

    if (timedSegmentChanged) {
      newEvents.push(
        makeEvent(
          segment
            ? `timed-segment-${segment.id ?? segment.name}`
            : `timed-break-${snapshot.timedSegmentId ?? 'session'}`,
          'info',
          elapsedSeconds,
          segment
            ? `${segmentDisplayLabel} begins. ${segment.participantDriverIds.length} cars may leave the pit lane on ${timedSessionTireLabel(segment)}.`
            : `${snapshot.timedSegmentLabel ?? 'Timed segment'} is complete. Cars return to the garages for the session interval.`,
        ),
      )
    }

    if (timedSuspensionChanged) {
      newEvents.push(
        makeEvent(
          `timed-${timedSessionState.suspended ? 'red' : 'resume'}-${segment?.id ?? segment?.name ?? 'session'}`,
          'flag',
          elapsedSeconds,
          timedSessionState.suspended
            ? `Red flag in ${segmentDisplayLabel}. The session clock is suspended and cars return to the pits.`
            : `${segmentDisplayLabel} resumes. Pit exit is open for eligible cars.`,
        ),
      )
    }

    const segmentIndex = segment
      ? config.timedSessionPlan.segments.findIndex(
          (candidate) =>
            (candidate.id ?? candidate.name) ===
            (segment.id ?? segment.name),
        )
      : -1
    const previousSegmentName =
      segmentIndex > 0
        ? config.timedSessionPlan.segments[segmentIndex - 1]?.name ?? null
        : null
    if (!segment) {
      timedParticipantDriverIds = []
    } else if (!timedSegmentChanged) {
      timedParticipantDriverIds = snapshot.timedParticipantDriverIds
    } else if (segmentIndex <= 0 || segment.selectFromPrevious === false) {
      timedParticipantDriverIds = segment.participantDriverIds
    } else {
      const eligibleCars = snapshot.cars.filter(
        (car) =>
          car.status !== 'retired' &&
          car.status !== 'disqualified' &&
          car.status !== 'dns' &&
          previousSegmentName !== null &&
          typeof car.timedSegmentBestSeconds[previousSegmentName] === 'number',
      )

      if (segment.promotionGroups && segment.promotionGroups.length > 0) {
        const promotedIds = new Set(
          segment.promotionGroups.flatMap((group) => {
            const groupIds = new Set(group.participantDriverIds)

            return eligibleCars
              .filter((car) => groupIds.has(car.driverId))
              .slice(0, group.advanceCount)
              .map((car) => car.driverId)
          }),
        )

        timedParticipantDriverIds = eligibleCars
          .filter((car) => promotedIds.has(car.driverId))
          .map((car) => car.driverId)
      } else {
        timedParticipantDriverIds = eligibleCars
          .slice(0, segment.participantDriverIds.length)
          .map((car) => car.driverId)
      }
    }
    const participantIds = new Set(timedParticipantDriverIds)
    const justEndedSegment = !segment
      ? config.timedSessionPlan.segments.findLast(
          (candidate) => candidate.endsAtSeconds <= elapsedSeconds,
        ) ?? null
      : null
    const releaseScheduleSegment = segment
      ? {
          ...segment,
          participantDriverIds: timedParticipantDriverIds,
          ...(timedSuspensionChanged &&
          !timedSessionState.suspended &&
          !timedSegmentChanged
            ? {
                startsAtSeconds: elapsedSeconds,
                suspensionEndsAtSeconds: null,
                suspensionStartsAtSeconds: null,
              }
            : {}),
        }
      : null
    frameCars = snapshot.cars.map((car, index) => {
      if (
        car.status === 'retired' ||
        car.status === 'disqualified' ||
        car.status === 'dns'
      ) {
        return car
      }

      const pitBox = pitBoxProgressForTeam(
        config.track,
        config.teams,
        car.teamId,
      )
      const isEligible = segment ? participantIds.has(car.driverId) : false
      const mayCompleteChequeredLap =
        !segment &&
        !timedSessionState.suspended &&
        justEndedSegment !== null &&
        car.timedRunPhase === 'attack-lap' &&
        car.lapStartedAtSeconds !== null &&
        car.lapStartedAtSeconds < justEndedSegment.endsAtSeconds

      if (mayCompleteChequeredLap) {
        return car
      }

      if (!segment || timedSessionState.suspended || !isEligible) {
        return {
          ...car,
          status: 'pit' as const,
          speedKph: 0,
          throttlePercent: 0,
          brakePercent: 0,
          rpm: 0,
          gear: 1,
          overtakeStatus: 'disabled' as const,
          runtimeSystems:
            car.runtimeSystems.kind === 'f1'
              ? patchF1Runtime(car.runtimeSystems, {
                  activeAeroMode: 'corner' as const,
                  activeAeroState: createInitialActiveAeroState(),
                  overtakeEligibility: null,
                  ersMode: 'harvest' as const,
                  ersPowerKw: 0,
                }, { pendingTire: null })
              : car.runtimeSystems,
          pitPhase: 'box' as const,
          pitLaneProgress: pitBox,
          pitStartedAtSeconds: null,
          pitUntilSeconds: null,
          pitExitUntilSeconds: null,
          lapStartedAtSeconds: null,
          passedDoubleYellowThisLap: false,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
          timedRunStartedAtSeconds: null,
          timedRunPhase: 'garage' as const,
          timedReleaseStrategy: null,
        }
      }

      const driver = drivers.get(car.driverId)

      if (!driver) {
        return car
      }

      const startsNewSegment = timedSegmentChanged
      const completedRuns = startsNewSegment ? 0 : car.timedRunsCompleted
      const f1Runtime = f1RuntimeFor(car)
      const f1Compound = f1Runtime
        ? startsNewSegment
          ? timedRunCompound(
              weekendStage,
              completedRuns,
              f1CompoundForTimedSegment(segment),
              weather,
              {
                dryingLine:
                  trackSurfaceSectors.dryingLineBySector.reduce(
                    (sum, value) => sum + value,
                    0,
                  ) / trackSurfaceSectors.dryingLineBySector.length,
                rainIntensityMmH,
                surfaceWaterMm:
                  trackSurfaceSectors.surfaceWaterMmBySector.reduce(
                    (sum, value) => sum + value,
                    0,
                  ) / trackSurfaceSectors.surfaceWaterMmBySector.length,
              },
              {
                driverId: driver.id,
                seed: config.seed,
              },
            )
          : f1Runtime.tires.tire
        : null
      const plannedRelease = timedSessionReleasePlan(
        config,
        driver,
        index,
        weekendStage,
        releaseScheduleSegment,
        completedRuns,
      )
      const releaseAtSeconds = Math.max(
        // A null release keeps the car parked: the infinity makes canStart
        // FlyingLap false below, so pitUntilSeconds stays null.
        plannedRelease.pitExitAtSeconds ?? Number.POSITIVE_INFINITY,
        elapsedSeconds + 2,
      )
      const estimatedOutLapSeconds =
        config.track.baseLapTime * (segment.declaredWet ? 1.9 : 1.6)
      const canStartFlyingLap =
        releaseAtSeconds + estimatedOutLapSeconds < segment.endsAtSeconds
      const f1TireSetsRemaining =
        f1Runtime && f1Compound
          ? startsNewSegment && canStartFlyingLap
            ? {
                ...f1Runtime.tires.tireSetsRemaining,
                [f1Compound]: Math.max(
                  0,
                  (f1Runtime.tires.tireSetsRemaining[f1Compound] ?? 0) - 1,
                ),
              }
            : f1Runtime.tires.tireSetsRemaining
          : null
      const runtimeSystems = f1Runtime
        ? patchF1Runtime(
            f1Runtime,
            {
              activeAeroMode: 'corner' as const,
              activeAeroState: createInitialActiveAeroState(),
              overtakeEligibility: null,
              ersMode: 'harvest' as const,
              ersPowerKw: 0,
            },
            {
              compoundsUsed: f1Runtime.tires.compoundsUsed.includes(f1Compound!)
                ? f1Runtime.tires.compoundsUsed
                : [...f1Runtime.tires.compoundsUsed, f1Compound!],
              pendingTire: null,
              tire: f1Compound!,
              tireAgeLaps: startsNewSegment
                ? 0
                : f1Runtime.tires.tireAgeLaps,
              tireSetsRemaining: f1TireSetsRemaining!,
              tireThermalStressPercent: startsNewSegment
                ? 0
                : f1Runtime.tires.tireThermalStressPercent,
              tireWearPercent: startsNewSegment
                ? 0
                : f1Runtime.tires.tireWearPercent,
            },
          )
        : (() => {
            const sfRuntime = car.runtimeSystems
            if (sfRuntime.kind !== 'super-formula') {
              return sfRuntime
            }

            if (!startsNewSegment || !canStartFlyingLap) {
              return sfRuntime
            }

            const fitted = fitSuperFormulaLiveControlTire({
              runtime: {
                controlTires: sfRuntime.controlTires,
                liveTires: sfRuntime.liveTires,
              },
              surface:
                segment.declaredWet ||
                rainIntensityMmH > 0 ||
                averageSurfaceWaterMm > 0
                  ? 'wet'
                  : 'dry',
            })

            return {
              ...sfRuntime,
              ...fitted,
            }
          })()

      return {
        ...car,
        status: 'pit' as const,
        speedKph: 0,
        throttlePercent: 0,
        brakePercent: 0,
        rpm: 0,
        gear: 1,
        // Each knockout segment starts from a clean timing sheet: the headline
        // best lap resets so Q2/Q3 no longer display a lap carried over from Q1.
        bestLapTimeSeconds: startsNewSegment ? null : car.bestLapTimeSeconds,
        bestLapLap: startsNewSegment ? null : car.bestLapLap,
        overtakeStatus: 'disabled' as const,
        runtimeSystems,
        pitPhase: 'box' as const,
        pitLaneProgress: pitBox,
        pitStartedAtSeconds: null,
        pitUntilSeconds: canStartFlyingLap ? releaseAtSeconds : null,
        pitExitUntilSeconds: null,
        lapStartedAtSeconds: null,
        passedDoubleYellowThisLap: false,
        currentLapSectorTimes: emptyCurrentLapSectorTimes(),
        currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
        timedRunStartedAtSeconds: null,
        timedRunPhase: 'garage' as const,
        timedRunsCompleted: completedRuns,
        practiceProgram: null,
        timedRunLapsCompleted: 0,
        timedRunTargetLaps: 1,
        timedReleaseStrategy: canStartFlyingLap
          ? plannedRelease.strategy
          : null,
        timedSegmentBestSeconds: startsNewSegment
          ? {
              ...car.timedSegmentBestSeconds,
              [segment.name]: null,
            }
          : car.timedSegmentBestSeconds,
        timedSegmentBestSetAtSeconds: startsNewSegment
          ? {
              ...car.timedSegmentBestSetAtSeconds,
              [segment.name]: null,
            }
          : car.timedSegmentBestSetAtSeconds,
        timedSegmentAttemptStatus: startsNewSegment
          ? {
              ...car.timedSegmentAttemptStatus,
              [segment.name]: 'garage' as const,
            }
          : car.timedSegmentAttemptStatus,
        qualifyingClassificationStatus: startsNewSegment
          ? 'classified' as const
          : car.qualifyingClassificationStatus,
        processedLap: Math.floor(car.totalDistance),
      }
    })
  }

  if (redFlagRestart) {
    const redFlagTrackCondition: TireTrackCondition = {
      dryingLine:
        trackSurfaceSectors.dryingLineBySector.reduce(
          (sum, value) => sum + value,
          0,
        ) / trackSurfaceSectors.dryingLineBySector.length,
      rainIntensityMmH,
      surfaceWaterMm:
        trackSurfaceSectors.surfaceWaterMmBySector.reduce(
          (sum, value) => sum + value,
          0,
        ) / trackSurfaceSectors.surfaceWaterMmBySector.length,
    }
    const strategicallyPreparedCars = snapshot.cars.map((car) => {
      const driver = drivers.get(car.driverId)

      if (
        !driver ||
        car.status !== 'running' ||
        car.runtimeSystems.kind !== 'f1'
      ) {
        return car
      }
      const f1Runtime = car.runtimeSystems
      const f1TireCar = f1TireModelCarFor(car)

      if (!f1TireCar) {
        return car
      }

      const decision = decideRedFlagTireChange({
        availableCompounds: f1Runtime.tires.tireSetsRemaining,
        car: f1TireCar,
        driver,
        lap: Math.floor(car.totalDistance),
        mandatoryTwoDryCompounds:
          categoryPhysics.id === 'f1-custom' &&
          weekendStage === 'race' &&
          (config.featureRaceTwoDryCompounds ?? true),
        raceLaps,
        seed: config.seed,
        tireNomination: config.track.tireNomination,
        trackCondition: redFlagTrackCondition,
        trackGrip,
        weather,
      })

      if (!decision) {
        return car
      }

      newEvents.push(
        makeEvent(
          `red-flag-tire-${car.driverId}-${Math.floor(elapsedSeconds)}`,
          'pit',
          elapsedSeconds,
          `${car.code} fits ${decision.compound} tyres during the suspension (${decision.reason}).`,
        ),
      )

      return {
        ...car,
        runtimeSystems: patchF1Runtime(f1Runtime, {}, {
          compoundsUsed: f1Runtime.tires.compoundsUsed.includes(
            decision.compound,
          )
            ? f1Runtime.tires.compoundsUsed
            : [...f1Runtime.tires.compoundsUsed, decision.compound],
          tire: decision.compound,
          tireAgeLaps: 0,
          tireCarcassTemperatureC: 78,
          tireGrainingPercent: 0,
          tireOverheatingPercent: 0,
          tirePerformanceState: 'optimal' as const,
          tireSetsRemaining: {
            ...f1Runtime.tires.tireSetsRemaining,
            [decision.compound]: Math.max(
              0,
              (f1Runtime.tires.tireSetsRemaining[decision.compound] ?? 0) -
                1,
            ),
          },
          tireTemperatureC: 82,
          tireThermalStressPercent: 0,
          tireWearPercent: 0,
        }),
      }
    })
    const reformedCars =
      restartProcedure === 'standing'
        ? reformFieldForStandingRestart(
            strategicallyPreparedCars,
            config.track.lengthKm * 1000,
            categoryPhysics.id === 'f1-custom',
          )
        : reformFieldForRedRestart(
            strategicallyPreparedCars,
            SAFETY_CAR_QUEUE_MIN_GAP_SECONDS / baseLapTime,
          )
    const preReformCarsByDriver = new Map(
      strategicallyPreparedCars.map((car) => [car.driverId, car]),
    )
    const restartBehindSafetyCar = restartProcedure === 'rolling'
    const restartRechargeRule =
      categoryPhysics.id === 'f1-custom'
        ? rechargeRuleForLapStart(config, weekendStage, {
            behindSafetyCar: restartBehindSafetyCar,
            lowGripConditions,
            overtakeAtLapStart: false,
            timedRunPhase: null,
          })
        : null
    frameCars = reformedCars.map((car) => {
      const beforeReform = preReformCarsByDriver.get(car.driverId)
      const crossedTimingLineDuringReform =
        beforeReform !== undefined &&
        car.status === 'running' &&
        Math.floor(car.totalDistance) > Math.floor(beforeReform.totalDistance)

      if (!crossedTimingLineDuringReform) {
        return car
      }

      const team = teams.get(car.teamId)

      const f1Runtime = f1RuntimeFor(car)

      if (!team || !f1Runtime || !restartRechargeRule) {
        return car
      }

      // Re-forming the queue is a route change rather than a telemetry step.
      // If that route carries a car through the Line, establish the same fresh
      // ledger/latches that the normal Line handler would have established.
      return {
        ...car,
        processedLap: Math.max(car.processedLap, Math.floor(car.totalDistance)),
        runtimeSystems: {
          ...f1Runtime,
          ...freshEnergyLapRuntimeFields({
            energyStore: startNextEnergyLap(
              f1Runtime.energyStore,
              restartRechargeRule,
            ),
            behindSafetyCar: restartBehindSafetyCar,
            lowGripConditions,
          }),
        },
      }
    })
    newEvents.push(
      makeEvent(
        `red-restart-${Math.floor(elapsedSeconds)}`,
        'flag',
        elapsedSeconds,
        restartProcedure === 'standing'
          ? 'STANDING START announced. Field returns to the grid in classification order.'
          : 'ROLLING START announced. Field forms behind the Safety Car.',
      ),
    )
  }

  const restartProcedureActive =
    restartProcedure !== 'none' &&
    restartProcedureUntilSeconds !== null &&
    elapsedSeconds < restartProcedureUntilSeconds
  const restartControlPhase: ActiveFlagPhase | null = restartProcedureActive
    ? {
        endMessage: '',
        endSeconds: restartProcedureUntilSeconds!,
        flag: restartProcedure === 'standing' ? 'red' : 'sc',
        id: `restart-${restartProcedure}`,
        sector: 0,
        startMessage: '',
        startSeconds: snapshot.elapsedSeconds,
      }
    : null

  if (safetyCarPenaltyLapDriverIds.size > 0) {
    frameCars = frameCars.map((car) => {
      if (!safetyCarPenaltyLapDriverIds.has(car.driverId)) {
        return car
      }

      const penaltyId = `sc-unauthorized-overtake-${phase?.id ?? 'sc'}-${car.driverId}`
      return {
        ...car,
        penaltyLaps: car.penaltyLaps + 1,
        penalties: [
          ...car.penalties,
          makePenalty(
            penaltyId,
            'penalty-lap',
            'Overtaking the Safety Car without eligibility',
            elapsedSeconds,
            0,
          ),
        ],
        stewardStatus: 'penalty' as const,
        stewardNote: 'One penalty lap - unauthorised SC overtake',
      }
    })
  }

  const pendingStewardDriverIds = new Set(
    stewardCases
      .filter(({ resolveAtSeconds }) => elapsedSeconds < resolveAtSeconds)
      .map(({ driverId }) => driverId),
  )
  frameCars = frameCars.map((car) =>
    pendingStewardDriverIds.has(car.driverId)
      ? {
          ...car,
          stewardStatus: 'investigating' as const,
          stewardNote: car.stewardNote ?? 'Incident under investigation',
        }
      : car,
  )

  const dueStewardCases = stewardCases.filter(
    (stewardCase) => elapsedSeconds >= stewardCase.resolveAtSeconds,
  )

  for (const stewardCase of dueStewardCases) {
    const decisionId = `decision-${stewardCase.id}`
    const investigatedCar = frameCars.find(
      (car) => car.driverId === stewardCase.driverId,
    )

    if (!investigatedCar) {
      continue
    }

    if (investigatedCar.runtimeSystems.kind !== 'f1') {
      newEvents.push(
        superFormulaAutomaticReview(
          decisionId,
          investigatedCar,
          elapsedSeconds,
          'incident review',
        ),
      )
      frameCars = frameCars.map((car) =>
        car.driverId === stewardCase.driverId
          ? {
              ...car,
              stewardStatus: 'noted' as const,
              stewardNote: 'Incident recorded; official event decision required',
            }
          : car,
      )
      continue
    }

    // `StewardCase` is an FIA/ISC automatic-decision input.  It can only be
    // evaluated for F1.  In particular, do not even run the F1 decision
    // ladder for an SF case restored from an older snapshot: Article 5 must
    // come from an explicit official adjudication, not a simulated incident.
    const decision = stewardCaseDecision(stewardCase)

    newEvents.push(
      makeEvent(
        decisionId,
        decision.kind === null ? 'info' : 'penalty',
        elapsedSeconds,
        decision.kind === null
          ? `Stewards: no further action for ${investigatedCar.code}. ${decision.reason}.`
          : `${investigatedCar.code} receives ${penaltyLabel(decision)} for ${decision.reason.toLowerCase()} (${decision.article})${decision.penaltyPoints > 0 ? `, ${decision.penaltyPoints} FIA penalty point${decision.penaltyPoints === 1 ? '' : 's'}` : ''}.`,
      ),
    )

    frameCars = frameCars.map((car) => {
      if (car.driverId !== stewardCase.driverId) {
        return car
      }

      if (decision.kind === null) {
        return {
          ...car,
          stewardStatus: car.penaltySeconds > 0 ? 'penalty' : 'clear',
          stewardNote:
            car.penaltySeconds > 0 ? car.stewardNote : 'No further action',
        }
      }

      return applyStewardPenalty(
        car,
        decision,
        decisionId,
        elapsedSeconds,
        raceLaps,
      )
    })
  }

  const resolvedStewardCaseIds = new Set(dueStewardCases.map(({ id }) => id))
  stewardCases = stewardCases.filter(
    ({ id }) => !resolvedStewardCaseIds.has(id),
  )

  const timedYellowControlPhase: ActiveFlagPhase | null =
    timedYellowUntilSeconds !== null &&
    timedYellowSector !== null &&
    timedYellowProgress !== null
      ? {
          endMessage: 'Double yellow withdrawn.',
          endSeconds: timedYellowUntilSeconds,
          flag: 'yellow',
          id: `timed-double-yellow-${timedYellowSector}`,
          sector: timedYellowSector,
          yellowSeverity: 'double',
          yellowZone: yellowFlagZoneForIncident(
            config.track,
            timedYellowProgress,
          ),
          startMessage: `Double yellow marshalling zone in sector ${timedYellowSector + 1}.`,
          startSeconds: Math.max(0, timedYellowUntilSeconds - 12),
        }
      : null

  // Driver intent is decided from one immutable physical field before any car
  // advances. This keeps decisions seed-deterministic and independent of array
  // traversal order, including when the nearest traffic is a lapped car.
  const lapLengthM = config.track.lengthKm * 1000
  const frameCarById = new Map(
    frameCars.map((car) => [car.driverId, car] as const),
  )
  const lateralVehicles: LateralVehicle[] = frameCars
    .filter(
      (car) =>
        !car.hiddenFromTrack &&
        car.status !== 'finished' &&
        car.status !== 'disqualified' &&
        car.status !== 'dns' &&
        car.status !== 'pit',
    )
    .map((car) => ({
      driverId: car.driverId,
      lateralOffsetM: car.lateralOffsetM,
      totalDistanceM: car.totalDistance * lapLengthM,
    }))
  const driverDecisionById = new Map<string, DriverDecision>()
  const physicalAheadById = new Map<string, CarSnapshot>()
  const physicalGapSecondsById = new Map<string, number>()
  const lateralBounds = lateralBoundsForTrack(config.track)
  const trackHalfWidthM = trackWidthMeters(config.track) / 2

  for (const car of frameCars) {
    if (car.status !== 'running') {
      continue
    }

    const driver = drivers.get(car.driverId)

    if (!driver) {
      continue
    }

    const subject = lateralVehicles.find(
      (candidate) => candidate.driverId === car.driverId,
    )

    if (!subject) {
      continue
    }

    const nearby = lateralTrafficContext({
      lapLengthM,
      maxLongitudinalDistanceM: 140,
      subject,
      vehicles: lateralVehicles,
    })
    const nearestAhead = nearby.find(
      (candidate) => candidate.signedLongitudinalDistanceM > 0,
    )
    const nearestBehind = nearby.find(
      (candidate) => candidate.signedLongitudinalDistanceM < 0,
    )
    const aheadCar = nearestAhead
      ? frameCarById.get(nearestAhead.driverId)
      : undefined
    const behindCar = nearestBehind
      ? frameCarById.get(nearestBehind.driverId)
      : undefined
    const representativeSpeedMps = Math.max(5, car.speedKph / 3.6)
    const gapAheadSeconds = nearestAhead
      ? nearestAhead.signedLongitudinalDistanceM / representativeSpeedMps
      : Number.POSITIVE_INFINITY
    const gapBehindSeconds = nearestBehind
      ? Math.abs(nearestBehind.signedLongitudinalDistanceM) /
        Math.max(5, (behindCar?.speedKph ?? car.speedKph) / 3.6)
      : Number.POSITIVE_INFINITY
    const carSector = sectorIndexForProgress(
      car.progress,
      config.track.sectorMarks,
    )
    const controlPhase = phase ?? restartControlPhase ?? timedYellowControlPhase
    const localControlPhase = flagPhaseForProgress(
      controlPhase,
      car.progress,
      carSector,
    )
    const dynamics = trackDynamicsAt(
      config.track,
      car.progress,
      categoryPhysics,
    )
    const emergencyVehicle = nearby.find((candidate) => {
      const trafficCar = frameCarById.get(candidate.driverId)

      return (
        candidate.signedLongitudinalDistanceM >= 0 &&
        candidate.signedLongitudinalDistanceM < 55 &&
        trafficCar !== undefined &&
        (trafficCar.status === 'retired' ||
          (trafficCar.incidentTrackState ?? 'clear') !== 'clear')
      )
    })
    // A pass has to be paid for with pace. Without this a car that is merely
    // in the tow commits to a move, gets ahead on the slipstream alone, and is
    // taken straight back on the next straight by the car it just passed: the
    // event log fills with overtakes while the order barely moves. Measured at
    // Monaco, 160 passes across 76 pairs, 2.1 per pair and up to seven between
    // the same two cars.
    //
    // The case can be a faster recent lap, fresher rubber, or Overtake in
    // hand. Before either car has a lap on the board there is nothing to
    // compare, so the opening laps are left alone.
    const attackerLastLap = car.lastLapTimeSeconds
    const defenderLastLap = aheadCar?.lastLapTimeSeconds ?? null
    const attackerF1Tires = f1RuntimeFor(car)?.tires ?? null
    const defenderF1Tires = aheadCar
      ? f1RuntimeFor(aheadCar)?.tires ?? null
      : null
    const hasPaceCase =
      attackerLastLap === null ||
      defenderLastLap === null ||
      attackerLastLap < defenderLastLap ||
      (attackerF1Tires !== null &&
        defenderF1Tires !== null &&
        attackerF1Tires.tireAgeLaps + 4 <
          defenderF1Tires.tireAgeLaps) ||
      car.overtakeStatus === 'active'
    const attackIntensity = Number.isFinite(gapAheadSeconds)
      ? clamp01(1 - gapAheadSeconds / 1.8)
      : 0
    const defendIntensity = Number.isFinite(gapBehindSeconds)
      ? clamp01(1 - gapBehindSeconds / 1.6)
      : 0
    const decisionContext: DriverDecisionContext = {
      seed: config.seed,
      driver,
      lap: Math.max(0, Math.floor(car.totalDistance)),
      trackProgress: car.progress,
      flagState:
        localControlPhase?.flag === 'yellow' &&
        localControlPhase.yellowSeverity === 'double'
          ? 'double-yellow'
          : (localControlPhase?.flag ?? 'clear'),
      currentLateralOffsetM: car.lateralOffsetM,
      physicalReferenceLineOffsetM: dynamics.referenceLineOffsetM,
      trackHalfWidthM,
      edgeClearanceM:
        FORMULA_VEHICLE_HALF_WIDTH_M + TRACK_EDGE_SAFETY_MARGIN_M,
      pit: {
        requested:
          car.pitPhase !== 'none' ||
          Boolean(manualPitRequests?.has(car.driverId)),
        pitLaneLateralOffsetM: lateralBounds.maxOffsetM,
      },
      emergency: emergencyVehicle
        ? {
            active: true,
            obstacleId: emergencyVehicle.driverId,
            obstacleLateralOffsetM: emergencyVehicle.lateralOffsetM,
            severity: clamp01(
              1 - emergencyVehicle.signedLongitudinalDistanceM / 55,
            ),
          }
        : undefined,
      attack:
        aheadCar?.status === 'running'
          ? {
              active: attackIntensity > 0 && hasPaceCase,
              opponentId: aheadCar.driverId,
              opponentLateralOffsetM: nearestAhead!.lateralOffsetM,
              intensity: attackIntensity,
            }
          : undefined,
      defend:
        behindCar?.status === 'running'
          ? {
              active: defendIntensity > 0,
              opponentId: behindCar.driverId,
              opponentLateralOffsetM: nearestBehind!.lateralOffsetM,
              intensity: defendIntensity,
            }
          : undefined,
      dirtyAir:
        aheadCar?.status === 'running'
          ? {
              active:
                gapAheadSeconds < 2.5 && dynamics.curvature >= 0.025,
              opponentId: aheadCar.driverId,
              opponentLateralOffsetM: nearestAhead!.lateralOffsetM,
              intensity: clamp01(1 - gapAheadSeconds / 2.5),
            }
          : undefined,
      tow:
        aheadCar?.status === 'running'
          ? {
              active:
                gapAheadSeconds < 1.8 && dynamics.straightness >= 0.72,
              opponentId: aheadCar.driverId,
              opponentLateralOffsetM: nearestAhead!.lateralOffsetM,
              intensity: clamp01(1 - gapAheadSeconds / 1.8),
            }
          : undefined,
      // The blue flag from the previous tick. Without this the lapped car only
      // lifts, holds the racing line, and the occupancy model then refuses the
      // leader the road for as long as the two stay nose to tail.
      yield:
        car.blueFlag && behindCar?.status === 'running'
          ? {
              active: true,
              approachingId: behindCar.driverId,
              approachingLateralOffsetM: nearestBehind!.lateralOffsetM,
              requiredSeparationM: requiredLateralCentreSeparationM(
                undefined,
                undefined,
              ),
            }
          : undefined,
    }
    const decision = decideDriverBehaviorForPath({
      context: decisionContext,
      path: config.driverDecisionPath,
      seriesId: config.seriesId,
      vehicleEraId: config.vehicleEraId,
    })

    driverDecisionById.set(car.driverId, decision)

    if (aheadCar?.status === 'running' && nearestAhead) {
      physicalAheadById.set(car.driverId, aheadCar)
      physicalGapSecondsById.set(car.driverId, gapAheadSeconds)
    }
  }

  const reservationPriority = (decision: DriverDecision) => {
    switch (decision.role) {
      case 'emergency':
        return 100
      case 'pit':
        return 90
      case 'controlled-flag':
        return 80
      // A yielding car must win its reservation against the driver it is
      // letting past, or it never reaches the offset that clears the road.
      case 'yield':
        return 75
      case 'defend':
        return 70
      case 'attack':
        return 65
      case 'dirty-air':
        return 55
      case 'tow':
        return 50
      case 'reference':
        return 40
    }
  }
  const reservedLateralOffsets = reserveDesiredLateralOffsets({
    lapLengthM,
    track: config.track,
    requests: lateralVehicles.flatMap((vehicle) => {
      const decision = driverDecisionById.get(vehicle.driverId)

      return decision
        ? [
            {
              ...vehicle,
              desiredLateralOffsetM: decision.desiredLateralOffsetM,
              priority: reservationPriority(decision),
            },
          ]
        : []
    }),
  })
  const lateralStateById = new Map(
    frameCars.flatMap((car) => {
      const decision = driverDecisionById.get(car.driverId)

      return decision
        ? [
            [
              car.driverId,
              advanceLateralState({
                deltaSeconds,
                desiredLateralOffsetM:
                  reservedLateralOffsets.get(car.driverId) ??
                  decision.desiredLateralOffsetM,
                state: car,
                track: config.track,
              }),
            ] as const,
          ]
        : []
    }),
  )

  const cars = frameCars.map((car, index) => {
    const driver = drivers.get(car.driverId)
    const team = teams.get(car.teamId)

    if (!driver || !team) {
      return car
    }

    const driverDecision = driverDecisionById.get(car.driverId)
    const lateralState = lateralStateById.get(car.driverId) ?? {
      desiredLateralOffsetM: car.desiredLateralOffsetM,
      lateralOffsetM: car.lateralOffsetM,
      lateralVelocityMps: car.lateralVelocityMps,
    }
    const requestedPaceMode = manualPaceModes?.get(car.driverId)

    // --- Non-running states -------------------------------------------------
    if (car.status === 'retired') {
      manualPitRequests?.delete(car.driverId)
      const retiredCar = advanceRetiredCarMotion(car, {
        deltaSeconds,
        elapsedSeconds,
        trackLengthKm: config.track.lengthKm,
      })

      if (
        !retiredCar.hiddenFromTrack &&
        retiredCar.retiredAtSeconds !== null &&
        elapsedSeconds >=
          retiredCar.retiredAtSeconds + WRECK_CLEAR_SECONDS
      ) {
        return {
          ...retiredCar,
          hiddenFromTrack: true,
          incidentTrackState: 'clear' as const,
          incidentTrackStateSinceSeconds: null,
          speedKph: 0,
        }
      }
      return retiredCar
    }

    if (
      car.status === 'finished' ||
      car.status === 'disqualified' ||
      car.status === 'dns'
    ) {
      manualPitRequests?.delete(car.driverId)
      return car
    }

    if (car.status === 'pit') {
      const f1Runtime = f1RuntimeFor(car)
      const pitEnergyRuntimeFields = (
        speedKph: number,
        throttlePercent: number,
        brakePercent: number,
      ): F1RuntimePatch => {
        if (!f1Runtime) {
          return {}
        }

        const energyStore = advanceEnergyStore({
          allowLiftCoastRecovery: false,
          ambientTemperatureC: airTemperatureC,
          brakePercent,
          deltaSeconds,
          deploymentDcPowerLimitKw: 0,
          deploymentRequest: 0,
          driverErsManagement: driverPerformanceAbility(
            driver,
            'ersManagement',
          ),
          driverWetSkill: driverPerformanceAbility(driver, 'wetSkill'),
          gripMultiplier: trackGrip,
          rechargeRule: f1Runtime.energyStore.rechargeRule,
          speedKph,
          state: f1Runtime.energyStore,
          surfaceWaterMm:
            trackSurfaceSectors.surfaceWaterMmBySector.reduce(
              (sum, water) => sum + water,
              0,
            ) / trackSurfaceSectors.surfaceWaterMmBySector.length,
          team,
          throttlePercent,
          tire: f1Runtime.tires.tire,
          vehicleMassKg:
            operationalVehicleMass.operationalMassKg + car.fuelLoadKg,
        }).state

        return {
          energyStore,
          energyHarvestedThisLapMj:
            energyStore.rechargedAtCuKBusThisLapMJ,
          energyDeployedThisLapMj: energyStore.deployedAtCuKBusThisLapMJ,
          ersBatteryPercent: Math.round(energyStore.stateOfCharge * 100),
          ersPowerKw: energyStore.actualDeploymentPowerKw,
        }
      }

      if (
        car.pitUntilSeconds !== null &&
        elapsedSeconds >= car.pitUntilSeconds &&
        !pitExitOpen
      ) {
        const pitExitProgress = config.track.pitLane?.exitProgress ?? 0.13

        return {
          ...car,
          runtimeSystems: f1Runtime
            ? patchF1Runtime(f1Runtime, pitEnergyRuntimeFields(0, 0, 100))
            : car.runtimeSystems,
          brakePercent: 100,
          gear: 0,
          pitExitQueueSeconds:
            car.pitExitQueueSeconds + Math.max(0, deltaSeconds),
          pitLaneProgress: (pitExitProgress - 0.004 + 1) % 1,
          pitPhase: 'lane' as const,
          pitUntilSeconds: elapsedSeconds + 0.5,
          rpm: 0,
          speedKph: 0,
          throttlePercent: 0,
        }
      }

      if (car.pitUntilSeconds !== null && elapsedSeconds >= car.pitUntilSeconds) {
        if (isTimedSession) {
          const releaseAtSeconds = Math.max(
            car.pitUntilSeconds,
            timedPitExitAvailableAt,
          )

          if (releaseAtSeconds > elapsedSeconds + 0.001) {
            timedPitExitAvailableAt =
              releaseAtSeconds + timedPitExitGapSeconds
            const queueSeconds = releaseAtSeconds - elapsedSeconds

            if (queueSeconds > car.pitExitQueueSeconds + 0.1) {
              newEvents.push(
                makeEvent(
                  `pit-exit-queue-${car.driverId}-${Math.floor(elapsedSeconds)}`,
                  'pit',
                  elapsedSeconds,
                  `${car.code} held ${queueSeconds.toFixed(1)}s in the pit-exit queue.`,
                ),
              )
            }

            return {
              ...car,
              pitExitQueueSeconds: queueSeconds,
              pitUntilSeconds: releaseAtSeconds,
            }
          }

          timedPitExitAvailableAt =
            elapsedSeconds + timedPitExitGapSeconds
        }

        const practicePlan = practiceProgramFor({
          driverId: car.driverId,
          runIndex: car.timedRunsCompleted,
          seed: config.seed,
          stage: weekendStage,
        })
        const servesProceduralPenalty =
          car.pitServiceKind === 'drive-through' ||
          car.pitServiceKind === 'stop-go'
        const repairsDamage = car.pitServiceKind === 'repair-stop'
        const f1Tires = f1Runtime?.tires ?? null
        const newF1Tire = f1Tires?.pendingTire ?? f1Tires?.tire ?? null
        const f1CompoundsUsed =
          f1Tires && newF1Tire
            ? f1Tires.compoundsUsed.includes(newF1Tire)
              ? f1Tires.compoundsUsed
              : [...f1Tires.compoundsUsed, newF1Tire]
            : null
        const superFormulaRuntime =
          car.runtimeSystems.kind === 'super-formula'
            ? car.runtimeSystems
            : null
        const superFormulaTires =
          superFormulaRuntime && car.pitServiceKind === 'tire-stop'
            ? fitSuperFormulaLiveControlTire({
                runtime: {
                  controlTires: superFormulaRuntime.controlTires,
                  liveTires: superFormulaRuntime.liveTires,
                },
                surface:
                  rainIntensityMmH > 0 || averageSurfaceWaterMm > 0
                    ? 'wet'
                    : 'dry',
              })
            : null
        const pitExitProgress = config.track.pitLane?.exitProgress ?? 0.13
        const currentLap = Math.floor(car.totalDistance)
        const sameLapExitDistance = currentLap + pitExitProgress
        const totalDistance =
          sameLapExitDistance >= car.totalDistance
            ? sameLapExitDistance
            : sameLapExitDistance + 1
        const lap = Math.floor(totalDistance)
        const crossedTimingLineOnRelease = lap > currentLap
        const startsNewEnergyLap = isTimedSession || crossedTimingLineOnRelease
        const pitReleaseSpeedKph = pitLaneSpeedLimitKphFor(car, config) ?? 0
        const pitEnergy = f1Runtime
          ? pitEnergyRuntimeFields(pitReleaseSpeedKph, 18, 0)
          : null
        const preparedStateOfCharge =
          practicePlan?.energyIntent === 'qualifying'
            ? 1
            : practicePlan?.energyIntent === 'balanced'
              ? 0.88
              : practicePlan
                ? 0.78
                : null
        const pitReleaseBehindSafetyCar = phase?.flag === 'sc'
        const pitReleaseRechargeRule = f1Runtime
          ? startsNewEnergyLap
            ? rechargeRuleForLapStart(config, weekendStage, {
                behindSafetyCar: pitReleaseBehindSafetyCar,
                lowGripConditions,
                overtakeAtLapStart: false,
                timedRunPhase: isTimedSession ? 'out-lap' : car.timedRunPhase,
              })
            : f1Runtime.energyStore.rechargeRule
          : null
        const pitEnergyStore = pitEnergy?.energyStore
        const preparedEnergyStore =
          f1Runtime && pitEnergyStore && pitReleaseRechargeRule
            ? isTimedSession
              ? createInitialEnergyStore(
                  team,
                  preparedStateOfCharge ?? pitEnergyStore.stateOfCharge,
                  pitReleaseRechargeRule,
                )
              : crossedTimingLineOnRelease
                ? startNextEnergyLap(
                    pitEnergyStore,
                    pitReleaseRechargeRule,
                  )
                : pitEnergyStore
            : null
        const releasedRuntimeSystems =
          f1Runtime && f1Tires && newF1Tire && f1CompoundsUsed
            ? patchF1Runtime(
                f1Runtime,
                preparedEnergyStore
                  ? {
                      ...(pitEnergy ?? {}),
                      energyStore: preparedEnergyStore,
                      energyHarvestedThisLapMj:
                        preparedEnergyStore.rechargedAtCuKBusThisLapMJ,
                      energyDeployedThisLapMj:
                        preparedEnergyStore.deployedAtCuKBusThisLapMJ,
                      ersBatteryPercent: Math.round(
                        preparedEnergyStore.stateOfCharge * 100,
                      ),
                      overtakeEnergyRemainingMj: startsNewEnergyLap
                        ? OVERTAKE_EXTRA_ENERGY_MJ
                        : f1Runtime.overtakeEnergyRemainingMj,
                      overtakeRechargeAllowanceActiveThisLap: startsNewEnergyLap
                        ? false
                        : f1Runtime.overtakeRechargeAllowanceActiveThisLap,
                      energyLapStartedInLowGripConditions: startsNewEnergyLap
                        ? lowGripConditions
                        : f1Runtime.energyLapStartedInLowGripConditions,
                      energyLapStartedBehindSafetyCar: startsNewEnergyLap
                        ? pitReleaseBehindSafetyCar
                        : f1Runtime.energyLapStartedBehindSafetyCar,
                      superClippingDurationSeconds: startsNewEnergyLap
                        ? 0
                        : f1Runtime.superClippingDurationSeconds,
                      superClippingIntensity: startsNewEnergyLap
                        ? 0
                        : f1Runtime.superClippingIntensity,
                      superClippingRecoveredThisLapMj: startsNewEnergyLap
                        ? 0
                        : f1Runtime.superClippingRecoveredThisLapMj,
                      superClippingRegenPowerKw: startsNewEnergyLap
                        ? 0
                        : f1Runtime.superClippingRegenPowerKw,
                      superClippingStartedAtProgress: startsNewEnergyLap
                        ? null
                        : f1Runtime.superClippingStartedAtProgress,
                      superClippingStartedAtSeconds: startsNewEnergyLap
                        ? null
                        : f1Runtime.superClippingStartedAtSeconds,
                      activeAeroMode: 'corner' as const,
                      activeAeroState: createInitialActiveAeroState(),
                      overtakeEligibility: null,
                      ersMode: 'harvest' as const,
                      ersPowerKw: 0,
                    }
                  : {},
                {
                  compoundsUsed: f1CompoundsUsed,
                  pendingTire: null,
                  tire: newF1Tire,
                  tireAgeLaps: servesProceduralPenalty
                    ? f1Tires.tireAgeLaps
                    : 0,
                  tireTemperatureC: Math.max(
                    62,
                    f1Tires.tireTemperatureC - 5,
                  ),
                  tireCarcassTemperatureC: servesProceduralPenalty
                    ? Math.max(60, f1Tires.tireCarcassTemperatureC - 3)
                    : 78,
                  tireGrainingPercent: servesProceduralPenalty
                    ? f1Tires.tireGrainingPercent
                    : 0,
                  tireOverheatingPercent: servesProceduralPenalty
                    ? f1Tires.tireOverheatingPercent
                    : 0,
                  tirePerformanceState: servesProceduralPenalty
                    ? f1Tires.tirePerformanceState
                    : 'optimal',
                  tireWearPercent: servesProceduralPenalty
                    ? f1Tires.tireWearPercent
                    : 0,
                  tireThermalStressPercent: servesProceduralPenalty
                    ? f1Tires.tireThermalStressPercent
                    : 0,
                },
              )
            : superFormulaRuntime && superFormulaTires
              ? {
                  ...superFormulaRuntime,
                  ...superFormulaTires,
                }
              : car.runtimeSystems

        return {
          ...car,
          runtimeSystems: releasedRuntimeSystems,
          processedLap: crossedTimingLineOnRelease
            ? Math.max(car.processedLap, lap)
            : car.processedLap,
          status: 'running' as const,
          totalDistance,
          lap,
          progress: clamp01(totalDistance - lap),
          pitServiceKind: null,
          pitExitQueueSeconds: 0,
          pitStartedAtSeconds: null,
          pitUntilSeconds: null,
          pitExitUntilSeconds: elapsedSeconds + PIT_EXIT_VISUAL_SECONDS,
          pitPhase: 'exit' as const,
          pitLaneProgress: pitExitProgress,
          incidentTrackState: 'clear' as const,
          incidentTrackStateSinceSeconds: null,
          offTrackSinceSeconds: null,
          rejoinEligibleAtSeconds: null,
          timedRunStartedAtSeconds: isTimedLapSession(weekendStage)
            ? elapsedSeconds
            : car.timedRunStartedAtSeconds,
          timedRunPhase: isTimedLapSession(weekendStage)
            ? 'out-lap'
            : car.timedRunPhase,
          practiceProgram: practicePlan?.kind ?? null,
          timedRunLapsCompleted: 0,
          timedRunTargetLaps: practicePlan?.targetFlyingLaps ?? 1,
          timedSegmentAttemptStatus:
            isTimedSession && timedSessionState.segment
              ? {
                  ...car.timedSegmentAttemptStatus,
                  [timedSessionState.segment.name]: 'left-pits' as const,
                }
              : car.timedSegmentAttemptStatus,
          // A race out-lap is a scored lap that started at the timing line, and
          // the pit-lane exit run belongs to it. Restarting the clock and the
          // sector accumulators here cut that part out, which made the out-lap
          // the quickest lap of the run with an impossibly short first sector.
          // A timed session keeps null: nothing is timed until the car crosses
          // the line again, so its accumulators do start empty.
          lapStartedAtSeconds: isTimedSession
            ? null
            : car.lapStartedAtSeconds,
          passedDoubleYellowThisLap: isTimedSession
            ? false
            : car.passedDoubleYellowThisLap,
          currentLapSectorTimes: isTimedSession
            ? emptyCurrentLapSectorTimes()
            : car.currentLapSectorTimes,
          currentLapMiniSectorTimes: isTimedSession
            ? emptyCurrentLapMiniSectorTimes()
            : car.currentLapMiniSectorTimes,
          fuelLoadKg:
            practiceFuelLoadKgFor(config.track, practicePlan) ??
            car.fuelLoadKg,
          damage: repairsDamage ? 0 : car.damage,
          overtakeStatus: 'disabled' as const,
          racePaceMode: practicePlan?.paceMode ?? car.racePaceMode,
          speedKph: pitReleaseSpeedKph,
          throttlePercent: 18,
          brakePercent: 0,
          rpm: 5200,
          gear: 1,
          brakeTemperatureC: Math.max(380, car.brakeTemperatureC - 120),
        }
      }

      const pitSpeedLimit = pitLaneSpeedLimitKphFor(car, config) ?? 0
      const pitEntry = config.track.pitLane?.entryProgress ?? 0.965
      const pitExit = config.track.pitLane?.exitProgress ?? 0.13
      const pitBox = pitBoxProgressForTeam(
        config.track,
        config.teams,
        car.teamId,
      )
      const pitDuration = Math.max(
        1,
        (car.pitUntilSeconds ?? elapsedSeconds + 1) -
          (car.pitStartedAtSeconds ?? elapsedSeconds),
      )
      const pitFraction = clamp01(
        (elapsedSeconds - (car.pitStartedAtSeconds ?? elapsedSeconds)) /
          pitDuration,
      )
      const pitMotion =
        car.pitStartedAtSeconds === null
          ? { phase: 'box' as const, progress: pitBox }
          : pitLaneMotionAt(pitFraction, pitEntry, pitBox, pitExit)
      const pitRuntimeSystems = f1Runtime
        ? patchF1Runtime(
            f1Runtime,
            {
              ...pitEnergyRuntimeFields(
                pitMotion.phase === 'box' ? 0 : pitSpeedLimit,
                pitMotion.phase === 'box' ? 0 : 12,
                0,
              ),
              activeAeroMode: 'corner' as const,
              activeAeroState: createInitialActiveAeroState(),
              overtakeEligibility: null,
              ersMode: 'harvest' as const,
              ersPowerKw: 0,
            },
            {
              tireTemperatureC: Math.max(
                58,
                f1Runtime.tires.tireTemperatureC - deltaSeconds * 0.7,
              ),
              tireCarcassTemperatureC: Math.max(
                55,
                f1Runtime.tires.tireCarcassTemperatureC - deltaSeconds * 0.18,
              ),
              tireGrainingPercent: Math.max(
                0,
                f1Runtime.tires.tireGrainingPercent - deltaSeconds * 0.04,
              ),
              tireOverheatingPercent: Math.max(
                0,
                f1Runtime.tires.tireOverheatingPercent - deltaSeconds * 0.22,
              ),
            },
          )
        : car.runtimeSystems

      return {
        ...car,
        runtimeSystems: pitRuntimeSystems,
        pitPhase: pitMotion.phase,
        pitLaneProgress: pitMotion.progress,
        speedKph: pitMotion.phase === 'box' ? 0 : pitSpeedLimit,
        throttlePercent: 12,
        brakePercent: 0,
        rpm: 4600,
        gear: 1,
        overtakeStatus: 'disabled' as const,
        brakeTemperatureC: Math.max(260, car.brakeTemperatureC - deltaSeconds * 4),
        brakeOverheatSeconds: Math.max(
          0,
          car.brakeOverheatSeconds - deltaSeconds * 3,
        ),
      }
    }

    // --- Running: advance along the track ------------------------------------
    const carSector = sectorIndexForProgress(car.progress, config.track.sectorMarks)
    const localWeather = weatherForSector(
      config.seed,
      config.track,
      elapsedSeconds,
      carSector,
    )
    // Surface water is the single live wet-grip authority. Rainfall drives
    // that state; it is not also multiplied into tyre force as a second
    // weather-derived grip loss.
    const localSurface = trackSurfaceAt(trackSurface, {
      lateralOffsetM: car.lateralOffsetM,
      progress: car.progress,
    })
    const localTrackGrip = gripWithTrackRubber(
      localSurface.baseGripMultiplier,
      localSurface.bondedRubber,
      localSurface.waterFilmMm,
    )
    const localTireTrackCondition: TireTrackCondition = {
      dryingLine: localSurface.dryness,
      rainIntensityMmH,
      surfaceWaterMm: localSurface.waterFilmMm,
    }
    const controlPhase = phase ?? restartControlPhase ?? timedYellowControlPhase
    const localControlPhase = flagPhaseForProgress(
      controlPhase,
      car.progress,
      carSector,
    )
    const offTrackSinceSeconds = car.offTrackSinceSeconds ?? null
    const rejoiningThisFrame =
      offTrackSinceSeconds !== null &&
      canRejoinTrack(
        car,
        frameCars,
        elapsedSeconds,
        baseLapTime,
      )
    const waitingForSafeRejoin =
      offTrackSinceSeconds !== null && !rejoiningThisFrame

    if (rejoiningThisFrame) {
      newEvents.push(
        makeEvent(
          `safe-rejoin-${car.driverId}-${Math.floor(offTrackSinceSeconds ?? elapsedSeconds)}`,
          'info',
          elapsedSeconds,
          `${car.code} rejoins after waiting for a safe gap in traffic.`,
        ),
      )
    }
    const timedTrafficYield = isTimedSession
      ? timedSessionYieldDecision({
          car,
          cars: frameCars,
          stage: weekendStage,
          track: config.track,
        })
      : null
    const timedRun = timedRunPaceFor({
      car,
      seed: config.seed,
      stage: weekendStage,
      track: config.track,
    })
    const timedPaceMode = isTimedSession
      ? car.timedRunPhase === 'attack-lap'
        ? (timedRun.practicePlan?.paceMode ?? ('push' as const))
        : car.timedRunPhase === 'out-lap' && timedRun.launchBlend > 0
          ? (timedRun.practicePlan?.paceMode ?? ('push' as const))
        : car.timedRunPhase === 'out-lap' ||
            car.timedRunPhase === 'in-lap' ||
            car.timedRunPhase === 'cooldown'
          ? ('save' as const)
          : ('standard' as const)
      : null
    // Evaluated once per mini sector rather than once per lap. A battle is
    // decided inside a lap, so a decision cadence of one lap meant the mode on
    // the pit wall described a situation that had already passed.
    const automaticPaceDecisionLap = Math.max(
      0,
      Math.floor(car.totalDistance * PACE_MODE_WINDOWS_PER_LAP) -
        PACE_MODE_WINDOWS_PER_LAP,
    )
    const remainingRaceDistanceLaps = Math.max(
      0,
      raceLaps - car.totalDistance,
    )
    const fuelUseMultiplier = driverFuelUseMultiplier(driver)
    const standardFuelToFinishKg =
      remainingRaceDistanceLaps *
      fuelBurnKgPerLap({
        paceMode: 'standard',
        phase: localControlPhase,
        team,
        track: config.track,
        weather: localWeather,
      }) * fuelUseMultiplier
    const fuelMarginKg =
      car.fuelLoadKg - standardFuelToFinishKg - FUEL_SAMPLE_RESERVE_KG
    const shouldEvaluateAutomaticPace =
      !isRaceDistance ||
      localControlPhase !== null ||
      car.racePaceModeDecisionLap !== automaticPaceDecisionLap
    const f1TireCar = f1TireModelCarFor(car)
    const proposedAutomaticRacePaceMode = shouldEvaluateAutomaticPace
      ? f1TireCar
        ? automaticRacePaceModeFor({
          car: f1TireCar,
          fuelMarginKg,
          gapBehindSeconds: frameCars[index + 1]?.gapToAhead ?? null,
          isRaceDistance,
          phaseActive: localControlPhase !== null,
          pursuitSkill:
            driverPerformanceAbility(driver, 'overtakingSkill') * 0.32 +
            driverPerformanceAbility(driver, 'ersManagement') * 0.4 +
            driverPerformanceAbility(driver, 'raceAwareness') * 0.28,
          raceLaps,
          seed: config.seed,
          })
        : car.racePaceMode
      : car.racePaceMode
    const urgentPaceConservation =
      (f1TireCar !== null &&
        (f1TireCar.tireWearPercent >= 88 ||
          f1TireCar.tireOverheatingPercent >= 68)) ||
      car.damage >= 0.45
    const automaticRacePaceMode =
      localControlPhase === null &&
      proposedAutomaticRacePaceMode !== car.racePaceMode &&
      automaticPaceDecisionLap - car.racePaceModeChangedLap <
        PACE_MODE_MINIMUM_HOLD_WINDOWS &&
      !urgentPaceConservation
        ? car.racePaceMode
        : proposedAutomaticRacePaceMode
    const racePaceMode =
      requestedPaceMode ?? timedPaceMode ?? automaticRacePaceMode
    const racePaceModeDecisionLap =
      requestedPaceMode !== undefined || timedPaceMode !== null
        ? car.racePaceModeDecisionLap
        : shouldEvaluateAutomaticPace && localControlPhase === null
          ? automaticPaceDecisionLap
          : car.racePaceModeDecisionLap
    const racePaceModeChangedLap =
      requestedPaceMode === undefined &&
      timedPaceMode === null &&
      localControlPhase === null &&
      racePaceMode !== car.racePaceMode
        ? automaticPaceDecisionLap
        : car.racePaceModeChangedLap
    const paceManagedCar =
      racePaceMode === car.racePaceMode &&
      racePaceModeDecisionLap === car.racePaceModeDecisionLap &&
      racePaceModeChangedLap === car.racePaceModeChangedLap
        ? car
        : {
            ...car,
            racePaceMode,
            racePaceModeDecisionLap,
            racePaceModeChangedLap,
          }
    const safetyCarProcedure =
      phase?.flag === 'sc' &&
      phase.neutralisation?.kind === 'safety-car'
        ? phase.neutralisation
        : null
    const activelyUnlapping =
      safetyCarProcedure?.stage === 'unlapping' &&
      safetyCarProcedure.eligibleLappedDriverIds.includes(car.driverId) &&
      !safetyCarProcedure.unlappingRejoinedDriverIds.includes(car.driverId)
    const paceMultiplier = flagPaceMultiplier(localControlPhase, carSector, {
      carProgress: car.progress,
      isLeader: car.position === 1,
      gapToAheadSeconds: car.gapToAhead,
    })
    const localFlagPaceScale =
      localControlPhase?.flag === 'yellow'
        ? paceMultiplier
        : localControlPhase?.flag === 'vsc'
          ? vscPaceScaleForDelta(
              car.vscDeltaSeconds,
              driverSkillBlend(driver, {
                consistency: 0.5,
                raceAwareness: 0.3,
                pressureHandling: 0.2,
              }),
              hashChance(
                `${config.seed}:${driver.id}:vsc:${Math.floor(car.totalDistance * MINI_SECTOR_COUNT)}`,
              ) * 2 - 1,
            )
          : localControlPhase?.flag === 'sc'
            ? activelyUnlapping
              ? phaseThreeTuning.scCatchUpPace
              : paceMultiplier
          : 1
    const lapTime = referenceProfileLapTimeSeconds(
      config.track,
      categoryPhysics,
    )
    const baselineEffectiveLapTime = Math.max(
      40,
      lapTime * timedRun.paceFactor,
    )
    const restartLineTarget =
      overtakeEnableTargetsByDriver?.[car.driverId]
    const hasCrossedRestartLine =
      restartLineTarget === undefined ||
      car.totalDistance >= restartLineTarget
    const raceControlOvertakeAvailable =
      (!isRaceDistance ||
        (overtakeEnabled && restartProcedure === 'none')) &&
      hasCrossedRestartLine
    const legacyStandingStartWindow =
      !snapshot.formationBehindSafetyCar &&
      ((snapshot.raceStartedAtSeconds !== null &&
        elapsedSeconds - snapshot.raceStartedAtSeconds < 12) ||
        restartUntilSeconds !== null)
    const f1Runtime = f1RuntimeFor(car)
    const standingStartMguKReleaseLatched = f1Runtime
      ? f1Runtime.standingStartMguKReleaseLatched ??
        (!legacyStandingStartWindow || car.speedKph >= 50)
      : null
    const standingStartMguKDecision = f1Runtime
      ? f1StandingStartMguKDecision({
          releaseLatched: standingStartMguKReleaseLatched ?? true,
          // The public rule permits an SECU safety intervention, but the measured
          // trigger is unavailable. A seeded low-power start is only simulator
          // mechanical behavior and cannot invent that official intervention.
          secuSafetyExceptionActive: false,
          speedKph: car.speedKph,
          standingStartActive:
            !snapshot.formationBehindSafetyCar &&
            !standingStartMguKReleaseLatched,
        })
      : null
    const standingStartMguKRestricted =
      standingStartMguKDecision !== null &&
      !standingStartMguKDecision.positiveTorqueAllowed
    const standingStartLaunchActive =
      !snapshot.formationBehindSafetyCar &&
      snapshot.raceStartedAtSeconds !== null &&
      elapsedSeconds - snapshot.raceStartedAtSeconds < 4.5 &&
      (car.progress >= 0.88 || car.progress <= 0.1)
    const blueFlagApproachingCar =
      isRaceDistance &&
      !localControlPhase &&
      hasCrossedRestartLine &&
      !waitingForSafeRejoin
        ? blueFlagApproachingCarFor(
            car,
            snapshot.cars,
            referenceProfileLapTimeSeconds(config.track, categoryPhysics),
          )
        : null
    const blueFlag = blueFlagApproachingCar !== null
    const blueFlagSinceSeconds = blueFlag
      ? (car.blueFlagSinceSeconds ?? elapsedSeconds)
      : null
    const ignoresBlueFlag =
      blueFlag &&
      hashChance(
        `${config.seed}:blue-flag-compliance:${driver.id}:${Math.floor(blueFlagSinceSeconds ?? elapsedSeconds)}`,
      ) <
        0.012 +
          Math.max(
            0,
            1 - driverPerformanceAbility(driver, 'raceAwareness'),
          ) *
            0.11
    const physicalAhead = physicalAheadById.get(car.driverId)
    const physicalGapSeconds = physicalGapSecondsById.get(car.driverId)
    const telemetryCar = {
      ...paceManagedCar,
      gapToAhead: physicalGapSeconds ?? Number.POSITIVE_INFINITY,
    }
    const telemetry = calculateCarTelemetry({
      car: telemetryCar,
      aheadLateralOffsetM: physicalAhead?.lateralOffsetM,
      categoryPhysics,
      deltaSeconds,
      driver,
      driverDecision,
      driverDecisionPath: config.driverDecisionPath,
      elapsedSeconds,
      phase: localControlPhase,
      localFlagPaceScale,
      lowGripConditions,
      isFinalLap:
        isRaceDistance && Math.floor(car.totalDistance) >= raceLaps - 1,
      raceControlOvertakeEnabled: raceControlOvertakeAvailable,
      overtakeSystem: config.overtakeSystem,
      seriesId: config.seriesId,
      operationalVehicleMass,
      raceLap: Math.max(1, Math.min(raceLaps, Math.floor(car.totalDistance))),
      sessionType: isRaceDistance ? 'race-distance' : 'limited-time',
      timedRunPhase: timedRun.physicsPhase,
      timedTrafficYield:
        (timedTrafficYield?.shouldYield ?? false) ||
        (blueFlag && !ignoresBlueFlag),
      standingStartLaunchActive,
      standingStartMguKRestricted,
      track: config.track,
      trackCondition: localTireTrackCondition,
      team,
      surfaceWaterMm: localTireTrackCondition.surfaceWaterMm,
      setup:
        config.weekendContext?.setupByDriver?.[driver.id] ??
        baselineSetupForTrack(config.track),
      headwindMps: simulatedHeadwindMpsAt(config, car.progress),
      trackGrip: localTrackGrip,
      airTemperatureC,
      trackTemperatureC,
      weather: localWeather,
      vehicleEraId: config.vehicleEraId,
      weekendStage,
      regulatoryMassIncreaseKg: heatHazardMassIncreaseKg,
    })
    let displayTelemetry = telemetry

    if (waitingForSafeRejoin) {
      const stationaryEnergyStore = f1Runtime?.energyStore ?? null
      const cornerSafeAeroState = createInitialActiveAeroState()

      displayTelemetry = {
        ...displayTelemetry,
        brakePercent: 0,
        frictionServiceBrakePowerKw: 0,
        gear: 0,
        overtakeStatus: 'disabled',
        rpm: 0,
        runtimeSystems:
          stationaryEnergyStore &&
          displayTelemetry.runtimeSystems.kind === 'f1'
            ? patchF1Runtime(displayTelemetry.runtimeSystems, {
                activeAeroMode: 'corner' as const,
                activeAeroState: cornerSafeAeroState,
                energyStore: {
                  ...stationaryEnergyStore,
                  chargeDcPowerKw: 0,
                  dischargeDcPowerKw: 0,
                  storedChargePowerKw: 0,
                  storedDischargePowerKw: 0,
                  requestedDeploymentDcPowerKw: 0,
                  actualDeploymentDcPowerKw: 0,
                  actualDeploymentPowerKw: 0,
                  actualRecoveryPowerKw: 0,
                  frictionBrakePowerKw: 0,
                  motorMechanicalPowerKw: 0,
                  batteryLossPowerKw: 0,
                  deploymentRequest: 0,
                  inverterLossPowerKw: 0,
                  motorLossPowerKw: 0,
                  operatingMode: 'inactive' as const,
                  recoveryTorqueNm: 0,
                  requestedBrakePowerKw: 0,
                  requestedRecoveryPowerKw: 0,
                },
                energyDeployedThisLapMj:
                  stationaryEnergyStore.deployedAtCuKBusThisLapMJ,
                energyHarvestedThisLapMj:
                  stationaryEnergyStore.rechargedAtCuKBusThisLapMJ,
                ersBatteryPercent: Math.round(
                  stationaryEnergyStore.stateOfCharge * 100,
                ),
                ersMode: 'harvest' as const,
                ersPowerKw: 0,
                superClippingDurationSeconds: 0,
                superClippingIntensity: 0,
                superClippingRecoveredThisLapMj:
                  f1Runtime?.superClippingRecoveredThisLapMj ?? 0,
                superClippingRegenPowerKw: 0,
                superClippingStartedAtProgress: null,
                superClippingStartedAtSeconds: null,
              }, {
                tireTemperatureC: Math.max(
                  trackTemperatureC,
                  displayTelemetry.runtimeSystems.tires.tireTemperatureC -
                    deltaSeconds * 0.35,
                ),
              })
            : displayTelemetry.runtimeSystems,
        speedKph: 0,
        tireTemperatureC:
          stationaryEnergyStore &&
          displayTelemetry.runtimeSystems.kind === 'f1'
            ? Math.max(
                trackTemperatureC,
                displayTelemetry.runtimeSystems.tires.tireTemperatureC -
                  deltaSeconds * 0.35,
              )
            : null,
        throttlePercent: 0,
      }
    } else if (rejoiningThisFrame) {
      const cornerSafeAeroState = createInitialActiveAeroState()
      displayTelemetry = {
        ...displayTelemetry,
        overtakeStatus: 'disabled',
        runtimeSystems:
          displayTelemetry.runtimeSystems.kind === 'f1'
            ? patchF1Runtime(displayTelemetry.runtimeSystems, {
                activeAeroMode: 'corner' as const,
                activeAeroState: cornerSafeAeroState,
              })
            : displayTelemetry.runtimeSystems,
        speedKph: Math.min(displayTelemetry.speedKph, 140),
        throttlePercent: Math.min(displayTelemetry.throttlePercent, 45),
      }
    }
    const modeBrakeMultiplier: Record<RacePaceMode, number> = {
      defend: 1.08,
      push: 1.16,
      save: 0.78,
      standard: 1,
    }
    const effectiveLapTime = baselineEffectiveLapTime
    const battleDeltaStep = waitingForSafeRejoin
      ? 0
      : Math.sign(car.battleDeltaSecondsRemaining) *
        Math.min(
          Math.abs(car.battleDeltaSecondsRemaining),
          deltaSeconds * 0.5,
        )
    const battleDeltaSecondsRemaining =
      car.battleDeltaSecondsRemaining - battleDeltaStep
    let totalDistance =
      waitingForSafeRejoin
        ? car.totalDistance
        : car.totalDistance +
          progressForProfileSpeed(
            config.track,
            car.progress,
            displayTelemetry.speedKph,
            deltaSeconds,
          )
    const pitEntryProgress = config.track.pitLane?.entryProgress ?? 0.965
    const pitExitProgress = config.track.pitLane?.exitProgress ?? 0.13
    const projectedProgress =
      totalDistance - Math.floor(totalDistance)
    const scPitLaneTransit =
      safetyCarProcedure?.pitLaneRouteRequired === true &&
      progressWithin(projectedProgress, pitEntryProgress, pitExitProgress)

    if (scPitLaneTransit) {
      const scPitLaneSpeedLimitKph = pitLaneSpeedLimitKphFor(car, config) ?? 0

      totalDistance = Math.min(
        totalDistance,
        car.totalDistance +
          progressForProfileSpeed(
            config.track,
            car.progress,
            scPitLaneSpeedLimitKph,
            deltaSeconds,
          ),
      )
    }
    if (
      car.position === 1 &&
      safetyCarProcedure &&
      safetyCarProcedure.stage !== 'in-this-lap' &&
      safetyCarProcedure.stage !== 'pit-entry'
    ) {
      const safetyCarGapLaps = Math.max(
        0.0015,
        SAFETY_CAR_LEADER_TARGET_GAP_SECONDS /
          Math.max(55, car.projectedLapTime),
      )
      const safetyCarCeiling =
        safetyCarProcedure.safetyCarDistance - safetyCarGapLaps

      if (safetyCarCeiling >= car.totalDistance) {
        totalDistance = Math.min(totalDistance, safetyCarCeiling)
      }
    }
    const mayUnlap = activelyUnlapping

    if (mayUnlap && safetyCarProcedure) {
      const orderIndex =
        safetyCarProcedure.unlappingOrderDriverIds.indexOf(car.driverId)
      const precedingDriverId =
        orderIndex > 0
          ? safetyCarProcedure.unlappingOrderDriverIds[orderIndex - 1]
          : null
      const precedingCar = precedingDriverId
        ? snapshot.cars.find(
            (candidate) => candidate.driverId === precedingDriverId,
          )
        : null

      if (precedingCar) {
        const precedingProjectedDistance =
          precedingCar.totalDistance +
          progressForProfileSpeed(
            config.track,
            precedingCar.progress,
            Math.max(precedingCar.speedKph, displayTelemetry.speedKph),
            deltaSeconds,
          )
        totalDistance = Math.min(
          totalDistance,
          precedingProjectedDistance - 0.002,
        )
      }
    }

    const carBehind = snapshot.cars[index + 1]
    const attacking =
      car.position > 1 &&
      car.gapToAhead > 0 &&
      car.gapToAhead < 0.72 &&
      !localControlPhase &&
      hasCrossedRestartLine &&
      !blueFlag
    const defending =
      carBehind?.status === 'running' &&
      carBehind.gapToAhead > 0 &&
      carBehind.gapToAhead < 0.72 &&
      !localControlPhase &&
      hasCrossedRestartLine &&
      !blueFlag
    const sideBySide = attacking && car.gapToAhead < 0.34
    const hasCommittedBattleWindow =
      car.battlePhaseUntilSeconds !== null &&
      car.battlePhaseUntilSeconds > elapsedSeconds &&
      (car.battlePhase === 'attacking' ||
        car.battlePhase === 'defending' ||
        car.battlePhase === 'side-by-side')
    const activeBattlePhase =
      localControlPhase ||
      !hasCrossedRestartLine ||
      waitingForSafeRejoin ||
      rejoiningThisFrame
        ? ('single-file' as const)
        : hasCommittedBattleWindow
          ? car.battlePhase
          : sideBySide
            ? ('side-by-side' as const)
            : attacking
              ? ('attacking' as const)
              : defending
                ? ('defending' as const)
                : car.gapToAhead > 0 && car.gapToAhead < 1.45
                  ? ('following' as const)
                  : ('single-file' as const)
    const battleOpponentId =
      activeBattlePhase === 'attacking' || activeBattlePhase === 'side-by-side'
        ? (hasCommittedBattleWindow ? car.battleOpponentId : null) ??
          snapshot.cars[index - 1]?.driverId ??
          null
        : activeBattlePhase === 'defending'
          ? (hasCommittedBattleWindow ? car.battleOpponentId : null) ??
            carBehind?.driverId ??
            null
          : activeBattlePhase === 'single-file'
            ? null
            : car.battleOpponentId
    const battlePhaseUntilSeconds =
      car.battlePhaseUntilSeconds !== null &&
      car.battlePhaseUntilSeconds > elapsedSeconds
        ? car.battlePhaseUntilSeconds
        : null
    const f1Tires = f1Runtime?.tires ?? null
    const wearPercentPerLap = f1Tires
      ? tireWearPercentPerLap(
          f1Tires.tire,
          driverPerformanceAbility(driver, 'tireManagement'),
          config.track.tireNomination,
          undefined,
        )
      : null
    const wearScale = wearScaleForControlPhase(localControlPhase)
    const tireLapFraction =
      waitingForSafeRejoin
        ? 0
        : Math.max(0, totalDistance - car.totalDistance) * wearScale.tire
    const localDynamics = trackDynamicsAt(
      config.track,
      car.progress,
      categoryPhysics,
    )
    const fuelEffects = fuelMassEffects({
      fuelLoadKg: car.fuelLoadKg,
      localDynamics,
      track: config.track,
    })
    const tireState =
      f1Tires && wearPercentPerLap !== null
        ? advanceTireDynamicState({
            baseWearPercentPerLap: wearPercentPerLap,
            brakePercent: displayTelemetry.brakePercent,
            compound: f1Tires.tire,
            current: {
              carcassTemperatureC: f1Tires.tireCarcassTemperatureC,
              grainingPercent: f1Tires.tireGrainingPercent,
              overheatingPercent: f1Tires.tireOverheatingPercent,
              performanceState: f1Tires.tirePerformanceState,
              surfaceTemperatureC: f1Tires.tireTemperatureC,
              thermalStressPercent: f1Tires.tireThermalStressPercent,
              wearPercent: f1Tires.tireWearPercent,
            },
            curvature: localDynamics.curvature,
            deltaLaps: tireLapFraction,
            deltaSeconds,
            dryingLine: localTireTrackCondition.dryingLine,
            fuelLoadMultiplier: fuelEffects.tireLoadMultiplier,
            nomination: config.track.tireNomination,
            paceMode: racePaceMode,
            rainIntensityMmH: localTireTrackCondition.rainIntensityMmH,
            surfaceTemperatureC: displayTelemetry.tireTemperatureC ??
              f1Tires.tireTemperatureC,
            surfaceWaterMm: localTireTrackCondition.surfaceWaterMm,
            throttlePercent: displayTelemetry.throttlePercent,
            trackTemperatureC,
            weather: localWeather,
          })
        : null
    const displayF1Runtime =
      displayTelemetry.runtimeSystems.kind === 'f1'
        ? displayTelemetry.runtimeSystems
        : null
    const meanBrakeSpeedMps =
      (Math.max(0, car.speedKph) + Math.max(0, displayTelemetry.speedKph)) /
      7.2
    const nominalMaximumServiceBrakePowerKw =
      ((operationalVehicleMass.operationalMassKg + car.fuelLoadKg) *
        categoryPhysics.maximumBrakeDecelerationMps2 *
        meanBrakeSpeedMps) /
      1000
    const frictionBrakeUtilization =
      nominalMaximumServiceBrakePowerKw > 1
        ? Math.min(
            1,
            Math.max(
              0,
              displayTelemetry.frictionServiceBrakePowerKw /
                nominalMaximumServiceBrakePowerKw,
            ),
          )
        : 0
    const brakeTemperatureTargetC = Math.min(
      1180,
      335 +
        frictionBrakeUtilization *
          100 *
          9.3 *
          modeBrakeMultiplier[racePaceMode] +
        displayTelemetry.speedKph * 0.28,
    )
    const brakeTemperatureResponse =
      brakeTemperatureTargetC > car.brakeTemperatureC ? 0.34 : 0.055
    const brakeTemperatureC = Math.max(
      260,
      Math.min(
        1150,
        car.brakeTemperatureC +
          (brakeTemperatureTargetC - car.brakeTemperatureC) *
            (1 - Math.exp(-brakeTemperatureResponse * deltaSeconds)),
      ),
    )
    const brakeOverheatSeconds =
      brakeTemperatureC >= 1100 && displayTelemetry.brakePercent <= 25
        ? Math.min(180, car.brakeOverheatSeconds + deltaSeconds)
        : Math.max(0, car.brakeOverheatSeconds - deltaSeconds * 2.5)
    if (blueFlag) {
      if (!car.blueFlag) {
        newEvents.push(
          makeEvent(
            `blue-flag-${car.driverId}-${Math.floor(elapsedSeconds)}`,
            'flag',
            elapsedSeconds,
            `BLUE FLAG for ${car.code}: allow ${blueFlagApproachingCar.code} to pass.`,
          ),
        )
      }
    }

    if (localControlPhase?.flag === 'yellow' && aheadTotal !== null) {
      totalDistance = distanceRespectingLocalYellowOrder({
        aheadProjectedDistance: aheadTotal,
        currentDistance: car.totalDistance,
        projectedDistance: totalDistance,
        referenceSpeedKph: Math.max(5, displayTelemetry.speedKph),
        trackLengthMeters: config.track.lengthKm * 1000,
      })
    }

    // No overtaking in the SC/VSC queue: hold a minimum spacing behind the
    // car ahead (ignoring cars in the pit lane or already finished).
    if (
      controlPhase &&
      (controlPhase.flag === 'sc' || controlPhase.flag === 'vsc') &&
      aheadTotal !== null &&
      !mayUnlap
    ) {
      const minimumGapSeconds =
        controlPhase.flag === 'sc'
          ? SAFETY_CAR_QUEUE_MIN_GAP_SECONDS
          : VSC_QUEUE_MIN_GAP_SECONDS
      const spacing =
        (minimumGapSeconds * Math.max(5, displayTelemetry.speedKph / 3.6)) /
        Math.max(1, config.track.lengthKm * 1000)
      totalDistance = Math.min(
        totalDistance,
        Math.max(car.totalDistance, aheadTotal - spacing),
      )
    }

    const actualTravelSpeedKph = speedForProfileTravelKph(
      config.track,
      car.totalDistance,
      totalDistance,
      deltaSeconds,
    )
    // Queue, pit and incident constraints can shorten the distance after the
    // force step. Reconcile the displayed driveline at that actual road speed
    // with the same PU model, without advancing turbo or clutch state twice.
    const reconciledCombustionPowerKw =
      combustionPowerKwFor(team, categoryPhysics) +
        (config.overtakeSystem === 'ots' &&
        displayTelemetry.overtakeStatus === 'active'
          ? (categoryPhysics.overtakeBoostPowerKw ?? 0)
          : 0)
    const powerUnitExplicitlyStopped =
      localControlPhase?.flag === 'red' || car.pitPhase === 'box'
    const actualTravelPowerUnit =
      !powerUnitExplicitlyStopped
        ? selectGear({
            clutchEngagementFraction:
              displayTelemetry.clutchEngagementFraction,
            combustionPowerKw: reconciledCombustionPowerKw,
            deploymentPowerKw: displayF1Runtime?.ersPowerKw ?? 0,
            physics: categoryPhysics,
            speedMps: actualTravelSpeedKph / 3.6,
            transmissionEfficiency: categoryPhysics.drivetrainEfficiency,
            turboSpoolFraction: displayTelemetry.turboSpoolFraction,
          })
        : null
    const actualTravelGear = actualTravelPowerUnit?.gear ?? 0
    const actualTravelRpm = actualTravelPowerUnit?.rpm ?? 0
    const overtakeEligibility =
      f1Runtime !== null && isRaceDistance
      ? updateOvertakeEligibilityAfterTravel({
          car,
          nextTotalDistance: totalDistance,
          phase: localControlPhase,
          previousTotalDistance: car.totalDistance,
          raceControlEnabled: raceControlOvertakeAvailable,
          track: config.track,
          lowGripConditions,
        })
      : null
    const distanceDelta = Math.max(0, totalDistance - car.totalDistance)
    const fuelLoadKg = Math.max(
      FUEL_SAMPLE_RESERVE_KG,
      car.fuelLoadKg -
        distanceDelta *
          fuelBurnKgPerLap({
            paceMode: racePaceMode,
            phase: localControlPhase,
            team,
            track: config.track,
            weather: localWeather,
          }) * fuelUseMultiplier,
    )
    const components = f1Runtime
      ? advanceComponentWear({
          components: f1Runtime.components,
          deltaLaps: distanceDelta * wearScale.component,
          engineStress:
            displayTelemetry.throttlePercent / 100 +
            (displayF1Runtime?.ersMode === 'deploy' ? 0.24 : 0),
          team,
        })
      : null
    const referenceSpeed = trackDynamicsAt(
      config.track,
      car.progress,
      categoryPhysics,
    ).referenceSpeedKph
    const allowedVscSpeed = Math.max(
      35,
      referenceSpeed * phaseThreeTuning.vscMinimumTimePace,
    )
    // Race Control judges the delta from the sector after deployment: braking
    // from racing speed to the delta covers most of a marshalling sector, and
    // that unavoidable deficit is not speeding. A car that keeps racing is
    // still judged from the allowance onwards, so the ladder still bites.
    const vscJudgedFromMiniSector =
      phase?.flag === 'vsc'
        ? (car.vscJudgedFromMiniSector ??
          Math.floor(car.totalDistance * MINI_SECTOR_COUNT) +
            VSC_DEPLOYMENT_ALLOWANCE_SECTORS)
        : null
    const vscDeltaJudged =
      vscJudgedFromMiniSector !== null &&
      Math.floor(totalDistance * MINI_SECTOR_COUNT) >= vscJudgedFromMiniSector
    const vscDeltaSeconds = vscDeltaJudged
      ? Math.max(
          -2,
          Math.min(
            5,
            car.vscDeltaSeconds +
              ((allowedVscSpeed - displayTelemetry.speedKph) /
                allowedVscSpeed) *
                deltaSeconds,
          ),
        )
      : 0
    const vscSectorTracking =
      phase?.flag === 'vsc'
        ? advanceVscMarshallingSectorTracking({
            lastMeasuredSector: car.vscLastMeasuredMiniSector ?? null,
            nextDeltaSeconds: vscDeltaSeconds,
            nextTotalDistance: totalDistance,
            previousDeltaSeconds: car.vscDeltaSeconds,
            previousTotalDistance: car.totalDistance,
            redSectorCount: car.vscRedSectorCount ?? 0,
            sectorsPerLap: MINI_SECTOR_COUNT,
          })
        : { lastMeasuredSector: null, redSectorCount: 0 }
    const hasUnlappedUnderSafetyCar =
      phase?.flag === 'sc' &&
      (car.hasUnlappedUnderSafetyCar ||
        Boolean(
          safetyCarProcedure?.unlappingRejoinedDriverIds.includes(
            car.driverId,
          ),
        ))

    const currentLapSectorTimes = measuredSectorTimesAfterTravel({
      current: car.currentLapSectorTimes,
      deltaSeconds,
      frameStartSeconds: snapshot.elapsedSeconds,
      lapStartedAtSeconds: car.lapStartedAtSeconds,
      nextTotalDistance: totalDistance,
      previousTotalDistance: car.totalDistance,
      sectorMarks: config.track.sectorMarks,
    })
    const currentLapMiniSectorTimes = measuredMiniSectorTimesAfterTravel({
      current: car.currentLapMiniSectorTimes,
      deltaSeconds,
      frameStartSeconds: snapshot.elapsedSeconds,
      lapStartedAtSeconds: car.lapStartedAtSeconds,
      nextTotalDistance: totalDistance,
      previousTotalDistance: car.totalDistance,
      sectorMarks: config.track.sectorMarks,
    })
    const previousIncidentTrackState = car.incidentTrackState ?? 'clear'
    const recoveredFromIncident =
      previousIncidentTrackState === 'on-track-stopped' &&
      battleDeltaSecondsRemaining >= -0.01 &&
      displayTelemetry.speedKph >= 55 &&
      displayTelemetry.throttlePercent >= 15
    const incidentTrackState: IncidentTrackState =
      rejoiningThisFrame || recoveredFromIncident
        ? 'clear'
        : previousIncidentTrackState
    const runtimeSystemsAfterTravel = displayF1Runtime
      ? patchF1Runtime(
          displayF1Runtime,
          {
            standingStartMguKReleaseLatched:
              standingStartMguKDecision?.releaseLatched ??
              displayF1Runtime.standingStartMguKReleaseLatched,
            overtakeEligibility,
            components: components ?? displayF1Runtime.components,
          },
          tireState
            ? {
                tireTemperatureC: tireState.surfaceTemperatureC,
                tireCarcassTemperatureC: tireState.carcassTemperatureC,
                tireGrainingPercent: tireState.grainingPercent,
                tireOverheatingPercent: tireState.overheatingPercent,
                tirePerformanceState: tireState.performanceState,
                tireWearPercent: tireState.wearPercent,
                tireThermalStressPercent: tireState.thermalStressPercent,
              }
            : {},
        )
      : displayTelemetry.runtimeSystems
    // Surface temperature is a force-step input, not persisted car state.
    // Keeping it out of this spread ensures all F1 tyre state remains under
    // `runtimeSystems.tires` and SF snapshots never inherit an alias.
    const {
      frictionServiceBrakePowerKw: _frictionServiceBrakePowerKw,
      tireTemperatureC: _calculatedTireTemperatureC,
      ...snapshotTelemetry
    } = displayTelemetry
    let next: CarSnapshot = {
      ...car,
      totalDistance,
      passedDoubleYellowThisLap:
        car.passedDoubleYellowThisLap ||
        Boolean(
          isTimedSession &&
            car.lapStartedAtSeconds !== null &&
            localControlPhase?.flag === 'yellow' &&
            localControlPhase.yellowSeverity === 'double',
        ),
      currentLapSectorTimes,
      currentLapMiniSectorTimes,
      desiredLateralOffsetM: lateralState.desiredLateralOffsetM,
      lateralOffsetM: lateralState.lateralOffsetM,
      lateralVelocityMps: lateralState.lateralVelocityMps,
      trackLateralOffset: lateralState.lateralOffsetM,
      offTrackSinceSeconds: waitingForSafeRejoin
        ? offTrackSinceSeconds
        : null,
      rejoinEligibleAtSeconds: waitingForSafeRejoin
        ? (car.rejoinEligibleAtSeconds ?? offTrackSinceSeconds)
        : null,
      incidentTrackState,
      incidentTrackStateSinceSeconds:
        incidentTrackState === 'clear'
          ? null
          : (car.incidentTrackStateSinceSeconds ??
            offTrackSinceSeconds ??
            elapsedSeconds),
      battlePhase: activeBattlePhase,
      battleOpponentId,
      battlePhaseUntilSeconds,
      battleDeltaSecondsRemaining,
      ...snapshotTelemetry,
      runtimeSystems: runtimeSystemsAfterTravel,
      speedKph: Number(actualTravelSpeedKph.toFixed(2)),
      gear: actualTravelGear,
      rpm: actualTravelRpm,
      throttlePercent: scPitLaneTransit
        ? Math.min(displayTelemetry.throttlePercent, 38)
        : displayTelemetry.throttlePercent,
      timedRunPhase: timedRun.phase,
      racePaceMode,
      racePaceModeDecisionLap,
      racePaceModeChangedLap,
      fuelLoadKg,
      brakeTemperatureC,
      brakeOverheatSeconds,
      stewardNote:
        waitingForSafeRejoin && car.stewardStatus === 'clear'
          ? 'Waiting for a safe rejoin'
          : rejoiningThisFrame &&
              car.stewardNote === 'Waiting for a safe rejoin'
            ? null
            : car.stewardNote,
      blueFlag,
      blueFlagSinceSeconds,
      timedTrafficYield: timedTrafficYield?.shouldYield ?? false,
      warningLightsUntilSeconds:
        car.warningLightsUntilSeconds !== null &&
        elapsedSeconds >= car.warningLightsUntilSeconds
          ? null
          : car.warningLightsUntilSeconds,
      hasUnlappedUnderSafetyCar,
      pitPhase:
        scPitLaneTransit
          ? 'lane'
          : car.pitExitUntilSeconds !== null &&
        elapsedSeconds < car.pitExitUntilSeconds
          ? 'exit'
          : 'none',
      pitLaneProgress:
        scPitLaneTransit
          ? totalDistance - Math.floor(totalDistance)
          : car.pitExitUntilSeconds !== null &&
        elapsedSeconds < car.pitExitUntilSeconds
          ? (car.pitLaneProgress ?? config.track.pitLane?.exitProgress ?? 0.13)
          : null,
      pitStartedAtSeconds: scPitLaneTransit
        ? (car.pitStartedAtSeconds ?? elapsedSeconds)
        : car.pitPhase === 'lane' && car.pitServiceKind === null
          ? null
          : car.pitStartedAtSeconds,
      vscDeltaSeconds,
      vscRedSectorCount: vscSectorTracking.redSectorCount,
      vscLastMeasuredMiniSector: vscSectorTracking.lastMeasuredSector,
      vscJudgedFromMiniSector,
    }

    const blueFlagIgnoredForSeconds =
      blueFlagSinceSeconds === null
        ? 0
        : elapsedSeconds - blueFlagSinceSeconds
    if (
      next.runtimeSystems.kind === 'f1' &&
      ignoresBlueFlag &&
      blueFlagIgnoredForSeconds >= 5 &&
      !next.penalties.some((penalty) =>
        penalty.reason.startsWith('Failing to respect blue flags'),
      )
    ) {
      const decision = blueFlagDecision(blueFlagIgnoredForSeconds)
      const decisionId = `blue-flag-penalty-${driver.id}-${Math.floor(blueFlagSinceSeconds!)}`
      newEvents.push(
        makeEvent(
          decisionId,
          'penalty',
          elapsedSeconds,
          `${driver.code} receives ${penaltyLabel(decision)} for failing to respect blue flags (${decision.article}).`,
        ),
      )
      next = applyStewardPenalty(
        next,
        decision,
        decisionId,
        elapsedSeconds,
        raceLaps,
      )
    }

    // Evaluate close racing at most once per twelfth of a lap. This keeps the
    // model cheap while allowing moves to happen where cars meet, instead of
    // only when the attacker crosses the timing line.
    const battleSegment = Math.floor(next.totalDistance * 12)

    if (isRaceDistance && battleSegment > car.processedBattleSegment) {
      next = { ...next, processedBattleSegment: battleSegment }

      if (localControlPhase?.flag === 'yellow' && next.runtimeSystems.kind === 'f1') {
        const complianceId = `yellow-compliance-${localControlPhase.id}-${driver.id}`
        const alreadyReviewed =
          snapshot.events.some(({ id }) => id === complianceId) ||
          newEvents.some(({ id }) => id === complianceId)
        const failsToSlow =
          !alreadyReviewed &&
          hashChance(
            `${config.seed}:${complianceId}:${battleSegment}`,
          ) <
            0.0006 +
              Math.max(
                0,
                1 - driverPerformanceAbility(driver, 'raceAwareness'),
              ) *
                0.012

        if (failsToSlow) {
          const decision = yellowFlagDecision(
            localControlPhase.yellowSeverity === 'double',
          )
          newEvents.push(
            makeEvent(
              complianceId,
              'penalty',
              elapsedSeconds,
              `${driver.code} receives ${penaltyLabel(decision)} for failing to slow for ${localControlPhase.yellowSeverity === 'double' ? 'double yellow' : 'yellow'} flags in sector ${localControlPhase.sector + 1} (${decision.article}).`,
            ),
          )
          next = applyStewardPenalty(
            next,
            decision,
            complianceId,
            elapsedSeconds,
            raceLaps,
          )
        }
      }

      if (
        !localControlPhase &&
        !frame.proposedPhase &&
        hasCrossedRestartLine
      ) {
        const defenderCar = physicalAheadById.get(car.driverId) ?? null
        const defender = defenderCar ? drivers.get(defenderCar.driverId) : null

        if (defenderCar && defender) {
          const battleLap = Math.max(1, Math.floor(next.totalDistance))
          const battle = overtakeForLap({
            seed: config.seed,
            attacker: driver,
            defender,
            attackerCar: next,
            defenderCar,
            lap: battleSegment,
            gapToAheadSeconds:
              physicalGapSecondsById.get(car.driverId) ?? car.gapToAhead,
            lateralSeparationM: Math.abs(
              next.lateralOffsetM - defenderCar.lateralOffsetM,
            ),
            longitudinalSeparationM:
              (physicalGapSecondsById.get(car.driverId) ?? car.gapToAhead) *
              Math.max(5, car.speedKph / 3.6),
            attemptedOvertake: driverDecision?.attemptedOvertake,
            decisionContactRisk: driverDecision?.contactRisk,
            isOpeningLap: battleLap <= 2,
            inRestartWindow,
            weather: localWeather,
            trackGrip: localTrackGrip,
            track: config.track,
            trackProgress: next.totalDistance - Math.floor(next.totalDistance),
            sector: carSector,
            evaluationsPerLap: 12,
          })

          if (battle) {
            // A successful roll is an attempt, not an instantaneous pass. The
            // pass message is emitted only after physical distance order
            // actually crosses below. Contact/defence remain immediate events.
            if (battle.kind !== 'pass') {
              newEvents.push(
                makeEvent(
                  `battle-${driver.id}-${defender.id}-${battleSegment}`,
                  battle.kind === 'contact' || battle.kind === 'crash'
                    ? 'contact'
                    : 'overtake',
                  elapsedSeconds,
                  battle.message,
                ),
              )
            }

            if (battle.stewardReview) {
              const review = battle.stewardReview
              const investigatedDriver = drivers.get(
                review.investigatedDriverId,
              )
              const otherDriver = drivers.get(review.otherDriverId)
              const caseId = `investigation-contact-${review.investigatedDriverId}-${review.otherDriverId}-${battleSegment}`

              if (next.runtimeSystems.kind === 'f1') {
                const stewardCase: StewardCase = {
                  id: caseId,
                  openedAtSeconds: elapsedSeconds,
                  resolveAtSeconds: elapsedSeconds + 22,
                  driverId: review.investigatedDriverId,
                  otherDriverId: review.otherDriverId,
                  offence: review.offence,
                  article: 'ISC App. L Ch. IV 2(d)',
                  responsibilityShare: review.responsibilityShare,
                  consequence: review.consequence,
                }

                if (!stewardCases.some(({ id }) => id === caseId)) {
                  stewardCases.push(stewardCase)
                }
                newEvents.push(
                  makeEvent(
                    caseId,
                    'investigation',
                    elapsedSeconds,
                    `INCIDENT NOTED: stewards investigating ${investigatedDriver?.code ?? driver.code} and ${otherDriver?.code ?? defender.code} after contact in sector ${battle.sector + 1}.`,
                  ),
                )

                if (review.investigatedDriverId === driver.id) {
                  next = {
                    ...next,
                    stewardStatus: 'investigating',
                    stewardNote: `Contact with ${defender.code} under review`,
                  }
                }
              } else {
                // The public SF material does not provide a simulator-owned
                // incident penalty ladder.  Preserve the observation without
                // fabricating an FIA/ISC case or an Article 5 point entry.
                newEvents.push(
                  superFormulaAutomaticReview(
                    caseId,
                    next,
                    elapsedSeconds,
                    `contact involving ${investigatedDriver?.code ?? driver.code} and ${otherDriver?.code ?? defender.code} in sector ${battle.sector + 1}`,
                  ),
                )

                if (review.investigatedDriverId === driver.id) {
                  next = {
                    ...next,
                    stewardStatus: 'noted',
                    stewardNote:
                      'Contact recorded; official event decision required',
                  }
                }
              }
            }

            if (battle.kind === 'pass' || battle.kind === 'defended') {
              next = {
                ...next,
                battlePhase:
                  battle.kind === 'pass' ? 'side-by-side' : 'attacking',
                battleOpponentId: defender.id,
                battlePhaseUntilSeconds: elapsedSeconds + 1.6,
              }
            }

            if (
              (battle.kind === 'contact' || battle.kind === 'crash') &&
              (battle.attackerTimeLossSeconds > 0 ||
                battle.attackerDamageDelta > 0)
            ) {
              const battleIncidentTrackState =
                battle.kind === 'crash' && battle.stoppingLocation
                  ? incidentTrackStateForLocation(battle.stoppingLocation)
                  : null
              next = {
                ...next,
                battleDeltaSecondsRemaining:
                  next.battleDeltaSecondsRemaining -
                  battle.attackerTimeLossSeconds,
                battlePhase: 'resolved',
                battleOpponentId: defender.id,
                battlePhaseUntilSeconds: elapsedSeconds + 1.6,
                damage: Math.min(1, next.damage + battle.attackerDamageDelta),
                incidentTrackState:
                  battleIncidentTrackState ?? next.incidentTrackState,
                incidentTrackStateSinceSeconds: battleIncidentTrackState
                  ? elapsedSeconds
                  : next.incidentTrackStateSinceSeconds,
                offTrackSinceSeconds:
                  battleIncidentTrackState === 'off-track-stopped'
                    ? elapsedSeconds
                    : next.offTrackSinceSeconds,
                rejoinEligibleAtSeconds:
                  battleIncidentTrackState === 'off-track-stopped'
                    ? elapsedSeconds +
                      Math.max(1.2, battle.attackerTimeLossSeconds)
                    : next.rejoinEligibleAtSeconds,
              }
            }

            if (
              battle.defenderTimeLossSeconds > 0 ||
              battle.defenderDamageDelta > 0 ||
              battle.defenderRetires
            ) {
              addDeferredBattleEffect(deferredBattleEffects, defenderCar.driverId, {
                timeLossSeconds: battle.defenderTimeLossSeconds,
                damageDelta: battle.defenderDamageDelta,
                retires: battle.defenderRetires,
                reason: battle.defenderRetires ? 'contact' : null,
                opponentId: driver.id,
                incidentTrackState:
                  battle.kind === 'crash' && battle.stoppingLocation
                    ? incidentTrackStateForLocation(battle.stoppingLocation)
                    : null,
              })
            }

            if (battle.flagResponse) {
              const candidate = stagedFlagPhase({
                durationSeconds: battle.flagDurationSeconds,
                id: `battle-phase-${driver.id}-${defender.id}-${battleSegment}`,
                response: battle.flagResponse,
                safetyCarUsesPitLane: battle.safetyCarUsesPitLane,
                sector: battle.sector,
                startSeconds: elapsedSeconds,
                incidentProgress: next.progress,
                track: config.track,
              })

              if (
                proposedFlagSeverity(candidate) >
                proposedFlagSeverity(frame.proposedPhase)
              ) {
                frame.proposedPhase = candidate
              }
            }

            if (battle.attackerRetires) {
              next = {
                ...next,
                status: 'retired',
                overtakeStatus: 'disabled',
                runtimeSystems:
                  next.runtimeSystems.kind === 'f1'
                    ? {
                        ...next.runtimeSystems,
                        activeAeroMode: 'corner' as const,
                        activeAeroState: createInitialActiveAeroState(),
                        overtakeEligibility: null,
                        ersPowerKw: 0,
                      }
                    : next.runtimeSystems,
                blueFlag: false,
                pitPhase: 'none',
                pitLaneProgress: null,
                retiredAtSeconds: elapsedSeconds,
                retiredReason: 'contact',
                incidentTrackState: battle.stoppingLocation
                  ? incidentTrackStateForLocation(battle.stoppingLocation)
                  : 'on-track-stopped',
                incidentTrackStateSinceSeconds: elapsedSeconds,
              }
            }
          }
        }
      }
    }

    const newLap = Math.floor(next.totalDistance)
    // Only process laps this car has never crossed before. Keeping a monotonic
    // processed-lap marker also prevents a deterministic incident from being
    // rolled more than once after an unusual session-state transition.
    const startLap = Math.max(Math.floor(car.totalDistance), car.processedLap)
    const finalLineSplit = finalTimingLineSplit({
      nextTotalDistance: next.totalDistance,
      previousTotalDistance: car.totalDistance,
      processedLap: car.processedLap,
    })
    const frameStartF1Runtime = f1RuntimeFor(car)
    const frameIntegratedF1Runtime = f1RuntimeFor(next)
    const frameIntegratedEnergyStore = frameIntegratedF1Runtime?.energyStore ?? null
    const frameIntegratedSuperclipRecoveredMJ =
      frameIntegratedF1Runtime?.superClippingRecoveredThisLapMj ?? 0
    const frameIntegratedSuperclipPowerKw =
      frameIntegratedF1Runtime?.superClippingRegenPowerKw ?? 0
    const frameOvertakeEnergyUsedMJ =
      frameStartF1Runtime && frameIntegratedF1Runtime
        ? Math.max(
            0,
            frameStartF1Runtime.overtakeEnergyRemainingMj -
              frameIntegratedF1Runtime.overtakeEnergyRemainingMj,
          )
        : 0

    // --- Lap-crossing decisions ----------------------------------------------
    for (let lap = startLap + 1; lap <= newLap && next.status === 'running'; lap += 1) {
      const nextF1Runtime = f1RuntimeFor(next)
      const f1EnergyRuntimeAvailable =
        nextF1Runtime !== null &&
        frameStartF1Runtime !== null &&
        frameIntegratedEnergyStore !== null
      const overtakeRechargeAllowanceActiveThisLap =
        f1EnergyRuntimeAvailable &&
        config.overtakeSystem !== 'ots' &&
        next.overtakeStatus === 'active'
      const nextLapTimedRunPhase =
        isTimedSession && next.timedRunPhase === 'out-lap'
          ? 'attack-lap'
          : next.timedRunPhase
      const nextLapRechargeRule = f1EnergyRuntimeAvailable
        ? rechargeRuleForLapStart(config, weekendStage, {
            behindSafetyCar: localControlPhase?.flag === 'sc',
            lowGripConditions,
            overtakeAtLapStart: overtakeRechargeAllowanceActiveThisLap,
            timedRunPhase: nextLapTimedRunPhase,
          })
        : null
      const frameDistance = Math.max(
        0.000001,
        next.totalDistance - car.totalDistance,
      )
      const crossingFraction = Math.min(
        1,
        Math.max(0, (lap - car.totalDistance) / frameDistance),
      )
      const isFinalCrossingInFrame = lap === newLap
      const postLineFraction = isFinalCrossingInFrame
        ? (finalLineSplit?.postLineFraction ?? 0)
        : 0
      const rebasedEnergy =
        f1EnergyRuntimeAvailable &&
        nextLapRechargeRule !== null &&
        isFinalCrossingInFrame
        ? rebaseEnergyStoreAtLapCrossing({
            frameStartState: frameStartF1Runtime.energyStore,
            integratedState: frameIntegratedEnergyStore,
            postLineFraction,
            rechargeRule: nextLapRechargeRule,
          })
        : null
      const nextLapEnergyStore =
        f1EnergyRuntimeAvailable && nextF1Runtime && nextLapRechargeRule
          ? rebasedEnergy?.state ??
            startNextEnergyLap(
              nextF1Runtime.energyStore,
              nextLapRechargeRule,
            )
          : null
      const postLineUsage =
        f1EnergyRuntimeAvailable && nextLapEnergyStore
          ? postLineEnergyUsageForFinalCrossing({
              deploymentAcceptanceScale:
                rebasedEnergy?.deploymentAcceptanceScale ?? 1,
              frameOvertakeEnergyUsedMJ,
              frameSuperclipRecoveredMJ: Math.max(
                0,
                frameIntegratedSuperclipRecoveredMJ -
                  (frameStartF1Runtime?.superClippingRecoveredThisLapMj ?? 0),
              ),
              postLineFraction,
              rechargeAcceptanceScale:
                rebasedEnergy?.rechargeAcceptanceScale ?? 1,
            })
          : null
      next = {
        ...next,
        processedLap: lap,
        runtimeSystems:
          nextF1Runtime && nextLapEnergyStore && postLineUsage
            ? {
                ...nextF1Runtime,
                overtakeEnergyRemainingMj: Math.max(
                  0,
                  OVERTAKE_EXTRA_ENERGY_MJ -
                    postLineUsage.overtakeEnergyUsedMJ,
                ),
                overtakeRechargeAllowanceActiveThisLap,
                energyLapStartedInLowGripConditions: lowGripConditions,
                energyLapStartedBehindSafetyCar:
                  localControlPhase?.flag === 'sc',
                energyStore: nextLapEnergyStore,
                energyHarvestedThisLapMj:
                  nextLapEnergyStore.rechargedAtCuKBusThisLapMJ,
                energyDeployedThisLapMj:
                  nextLapEnergyStore.deployedAtCuKBusThisLapMJ,
                ersBatteryPercent: Math.round(
                  nextLapEnergyStore.stateOfCharge * 100,
                ),
                ersPowerKw: nextLapEnergyStore.actualDeploymentPowerKw,
                superClippingRecoveredThisLapMj:
                  postLineUsage.superclipRecoveredMJ,
                superClippingRegenPowerKw: rebasedEnergy
                  ? frameIntegratedSuperclipPowerKw *
                    rebasedEnergy.rechargeAcceptanceScale
                  : 0,
              }
            : next.runtimeSystems,
      }
      const crossedAtSeconds =
        snapshot.elapsedSeconds + deltaSeconds * crossingFraction

      if (isTimedSession) {
        const timedAttackCompleted =
          next.lapStartedAtSeconds !== null &&
          (car.timedRunPhase === 'attack-lap' ||
            (car.timedRunPhase === 'out-lap' &&
              next.timedRunPhase === 'in-lap'))
        const timedInLapCompleted =
          next.timedRunsCompleted > 0 &&
          (car.timedRunPhase === 'in-lap' ||
            car.timedRunPhase === 'cooldown')

        if (timedAttackCompleted) {
          const completedTimedLap = next.lapHistory.length + 1
          const practiceStintLap =
            (next.timedRunLapsCompleted ?? 0) + 1
          const practiceTargetLaps =
            next.timedRunTargetLaps ??
            timedRun.practicePlan?.targetFlyingLaps ??
            1
          const practiceRunContinues =
            isPracticeStage(weekendStage) &&
            practiceStintLap < practiceTargetLaps &&
            (timedSessionDurationSeconds === null ||
              crossedAtSeconds < timedSessionDurationSeconds)
          const completedRun =
            next.timedRunsCompleted + (practiceRunContinues ? 0 : 1)
          const segmentKey =
            timedSessionState.segment?.name ??
            config.timedSessionPlan?.segments.findLast((segment) =>
              Object.prototype.hasOwnProperty.call(
                next.timedSegmentBestSeconds,
                segment.name,
              ),
            )?.name ??
            snapshot.timedSegmentLabel ??
            weekendStageLabelFor(weekendStage)
          const rawLapTime = Math.max(
            1,
            crossedAtSeconds - next.lapStartedAtSeconds!,
          )
          // Impeding needs a car genuinely in the way, not merely somewhere on
          // the same stretch of track. Cars stream back to the pits while
          // others attack, so a wide window reports most of the field.
          const obstructingCar = snapshot.cars
            .filter((candidate) => {
              const distanceAhead = candidate.totalDistance - car.totalDistance

              return (
                candidate.driverId !== car.driverId &&
                candidate.status === 'running' &&
                distanceAhead > 0 &&
                distanceAhead < 0.012 &&
                candidate.timedRunPhase !== 'attack-lap'
              )
            })
            .sort(
              (left, right) =>
                left.totalDistance - right.totalDistance,
            )[0]
          // The automatic impeding-to-grid-drop ladder is FIA/ISC behaviour.
          // A SUPER FORMULA observation cannot be converted into that
          // sanction without an official event decision.
          const closestSlowerCar =
            next.runtimeSystems.kind === 'f1' &&
            obstructingCar !== undefined &&
            hashChance(
              `${config.seed}:impeding-penalty:${segmentKey}:${driver.id}:${completedTimedLap}`,
            ) < 0.18
              ? obstructingCar
              : undefined
          const causedYellow =
            hashChance(
              `${config.seed}:timed-yellow:${segmentKey}:${driver.id}:${completedTimedLap}`,
            ) <
            0.01 +
              Math.max(
                0,
                1 - driverPerformanceAbility(driver, 'raceAwareness'),
              ) *
                0.012
          const passedDoubleYellow = next.passedDoubleYellowThisLap
          const trackLimitDeleted =
            hashChance(
              `${config.seed}:timed-track-limit:${segmentKey}:${driver.id}:${completedTimedLap}`,
            ) <
            0.018 +
              Math.max(
                0,
                1 - driverPerformanceAbility(driver, 'raceAwareness'),
              ) *
                0.09
          const invalidReason = causedYellow
            ? 'Caused double yellow'
            : passedDoubleYellow
              ? `Double yellow S${(timedYellowSector ?? 0) + 1}`
              : trackLimitDeleted
                ? `Track limits T${
                    config.track.corners?.[
                      Math.floor(
                        hashChance(
                          `${config.seed}:deleted-corner:${segmentKey}:${driver.id}:${completedTimedLap}`,
                        ) * (config.track.corners?.length ?? 1),
                      )
                    ]?.number ?? 1
                  }`
                : null
          const recordedLapTime = rawLapTime
          const lapIsValid = invalidReason === null
          const isPersonalBest =
            lapIsValid &&
            (next.bestLapTimeSeconds === null ||
              recordedLapTime < next.bestLapTimeSeconds)
          const previousSegmentBest =
            next.timedSegmentBestSeconds[segmentKey]
          const isSegmentBest =
            lapIsValid &&
            (previousSegmentBest === null ||
              previousSegmentBest === undefined ||
              recordedLapTime < previousSegmentBest)

          if (causedYellow) {
            timedYellowUntilSeconds = crossedAtSeconds + 12
            const generatedSector = Math.floor(
              hashChance(
                `${config.seed}:timed-yellow-sector:${segmentKey}:${driver.id}:${completedTimedLap}`,
              ) * 3,
            )
            timedYellowProgress = incidentProgressWithinTimingSector(
              config.track,
              generatedSector,
              `${config.seed}:timed-yellow:${segmentKey}:${driver.id}:${completedTimedLap}`,
            )
            timedYellowSector = sectorIndexForProgress(
              timedYellowProgress,
              config.track.sectorMarks,
            )
            newEvents.push(
              makeEvent(
                `timed-yellow-${driver.id}-${segmentKey}-${completedTimedLap}`,
                'flag',
                crossedAtSeconds,
                `DOUBLE YELLOW marshalling zone in sector ${timedYellowSector + 1}; ${driver.code} is off line.`,
              ),
            )
          }

          if (invalidReason) {
            newEvents.push(
              makeEvent(
                `lap-deleted-${driver.id}-${segmentKey}-${completedTimedLap}`,
                'track-limit',
                crossedAtSeconds,
                `${driver.code} lap time deleted in ${segmentKey}: ${invalidReason}.`,
              ),
            )
          }

          if (closestSlowerCar) {
            deferredTimedGridPenalties.set(
              closestSlowerCar.driverId,
              Math.max(
                3,
                deferredTimedGridPenalties.get(closestSlowerCar.driverId) ?? 0,
              ),
            )
            newEvents.push(
              makeEvent(
                `impeding-${closestSlowerCar.driverId}-${driver.id}-${segmentKey}-${completedTimedLap}`,
                'investigation',
                crossedAtSeconds,
                `${closestSlowerCar.code} investigated for impeding ${driver.code} in ${segmentKey}.`,
              ),
            )
          }

          const completedSectors = completedMeasuredSectors(
            next.currentLapSectorTimes,
            recordedLapTime,
            config.track.sectorMarks,
          )
          const completedTireLap = completeTireLap(next.runtimeSystems)

          next = {
            ...next,
            runtimeSystems: completedTireLap.runtimeSystems,
            lastLapTimeSeconds: recordedLapTime,
            bestLapTimeSeconds: isPersonalBest
              ? recordedLapTime
              : next.bestLapTimeSeconds,
            bestLapLap: isPersonalBest ? completedTimedLap : next.bestLapLap,
            lapStartedAtSeconds: crossedAtSeconds,
            passedDoubleYellowThisLap: false,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
            lapHistory: [
              ...next.lapHistory,
              {
                lap: completedTimedLap,
                lapTimeSeconds: recordedLapTime,
                sectors: completedSectors,
                miniSectors: completedMeasuredMiniSectors(
                  next.currentLapMiniSectorTimes,
                  completedSectors,
                ),
                tireRun: completedTireLap.tireRun,
                weather: localWeather,
                trackGrip: localTrackGrip,
                position: next.position,
                pitStop: false,
                isValid: lapIsValid,
                invalidReason,
                segment: segmentKey,
              },
            ],
            timedRunsCompleted: completedRun,
            timedRunLapsCompleted: practiceStintLap,
            timedRunPhase: practiceRunContinues
              ? 'attack-lap'
              : 'in-lap',
            deletedLapCount:
              next.deletedLapCount + (lapIsValid ? 0 : 1),
            timedSegmentBestSeconds: {
              ...next.timedSegmentBestSeconds,
              [segmentKey]: isSegmentBest
                ? recordedLapTime
                : previousSegmentBest,
            },
            timedSegmentBestSetAtSeconds: {
              ...next.timedSegmentBestSetAtSeconds,
              [segmentKey]: isSegmentBest
                ? crossedAtSeconds
                : (next.timedSegmentBestSetAtSeconds?.[segmentKey] ?? null),
            },
            timedSegmentAttemptStatus: {
              ...next.timedSegmentAttemptStatus,
              [segmentKey]: 'flying-lap',
            },
          }
        } else if (timedInLapCompleted) {
          const activeSegment = timedSessionState.segment
          const participantIds = new Set(
            activeSegment
              ? timedParticipantDriverIds
              :
              config.drivers.map((candidate) => candidate.id),
          )
          const runLimit = timedRunLimit(
            weekendStage,
            activeSegment?.name ?? null,
          )
          const nextRunIndex = next.timedRunsCompleted
          const activeWindowEndsAt =
            activeSegment?.suspensionStartsAtSeconds !== null &&
            activeSegment?.suspensionStartsAtSeconds !== undefined &&
            crossedAtSeconds < activeSegment.suspensionStartsAtSeconds
              ? activeSegment.suspensionStartsAtSeconds
              : activeSegment?.endsAtSeconds ??
                timedSessionDurationSeconds ??
                crossedAtSeconds
          const releasePlan = timedSessionReleasePlan(
            config,
            driver,
            index,
            weekendStage,
            activeSegment
              ? {
                  ...activeSegment,
                  participantDriverIds: [...participantIds],
                }
              : null,
            nextRunIndex,
          )
          const nextPracticePlan = practiceProgramFor({
            driverId: driver.id,
            runIndex: nextRunIndex,
            seed: config.seed,
            stage: weekendStage,
          })
          const releaseAtSeconds = Math.max(
            crossedAtSeconds +
              (nextPracticePlan?.garageTurnaroundSeconds ?? 28),
            // Null release (a non-participant) yields no further run below.
            releasePlan.pitExitAtSeconds ?? Number.POSITIVE_INFINITY,
          )
          const estimatedOutLapSeconds =
            baseLapTime *
            (activeSegment?.declaredWet || localWeather !== 'clear'
              ? 1.9
              : 1.6)
          const estimatedAttackSeconds =
            nextPracticePlan === null
              ? baseLapTime
              : baseLapTime *
                nextPracticePlan.paceFactor *
                nextPracticePlan.targetFlyingLaps
          const estimatedInLapSeconds =
            baseLapTime *
            (activeSegment?.declaredWet || localWeather !== 'clear'
              ? 1.95
              : 1.5)
          const estimatedRequiredSeconds =
            nextPracticePlan === null
              ? estimatedOutLapSeconds
              : estimatedOutLapSeconds +
                estimatedAttackSeconds +
                estimatedInLapSeconds
          const hasTimeForAnotherRun =
            (activeSegment !== null || !config.timedSessionPlan) &&
            participantIds.has(driver.id) &&
            nextRunIndex < runLimit &&
            releaseAtSeconds + estimatedRequiredSeconds <
              activeWindowEndsAt +
                (nextPracticePlan === null ? 0 : baseLapTime * 0.35)
          const nextF1Runtime = f1RuntimeFor(next)
          const plannedF1Compound = nextF1Runtime
            ? timedRunCompound(
                weekendStage,
                nextRunIndex,
                f1CompoundForTimedSegment(activeSegment),
                localWeather,
                localTireTrackCondition,
                {
                  driverId: driver.id,
                  seed: config.seed,
                },
              )
            : null
          const useFreshF1Set =
            nextF1Runtime && plannedF1Compound
              ? hasTimeForAnotherRun &&
                shouldUseFreshTimedSet(
                  weekendStage,
                  activeSegment?.name ?? null,
                  next.timedRunsCompleted,
                ) &&
                (nextF1Runtime.tires.tireSetsRemaining[plannedF1Compound] ??
                  0) > 0
              : false
          const nextF1Compound =
            nextF1Runtime && plannedF1Compound
              ? useFreshF1Set
                ? plannedF1Compound
                : nextF1Runtime.tires.tire
              : null
          const pitBox = pitBoxProgressForTeam(
            config.track,
            config.teams,
            car.teamId,
          )

          next = {
            ...next,
            status: 'pit',
            speedKph: 0,
            throttlePercent: 0,
            brakePercent: 0,
            rpm: 0,
            gear: 1,
            overtakeStatus: 'disabled',
            runtimeSystems:
              nextF1Runtime && nextF1Compound
                ? patchF1Runtime(nextF1Runtime, {
                    activeAeroMode: 'corner' as const,
                    activeAeroState: createInitialActiveAeroState(),
                    overtakeEligibility: null,
                    ersMode: 'harvest' as const,
                    ersPowerKw: 0,
                  }, {
                    pendingTire: hasTimeForAnotherRun
                      ? nextF1Compound
                      : null,
                    tireSetsRemaining: useFreshF1Set
                      ? {
                          ...nextF1Runtime.tires.tireSetsRemaining,
                          [nextF1Compound]: Math.max(
                            0,
                            (nextF1Runtime.tires.tireSetsRemaining[
                              nextF1Compound
                            ] ?? 0) - 1,
                          ),
                        }
                      : nextF1Runtime.tires.tireSetsRemaining,
                  })
                : next.runtimeSystems,
            pitPhase: 'box',
            pitLaneProgress: pitBox,
            pitStartedAtSeconds: null,
            pitUntilSeconds: hasTimeForAnotherRun ? releaseAtSeconds : null,
            pitExitUntilSeconds: null,
            lapStartedAtSeconds: null,
            passedDoubleYellowThisLap: false,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
            timedRunStartedAtSeconds: null,
            timedRunPhase: 'garage',
            practiceProgram: nextPracticePlan?.kind ?? null,
            timedRunLapsCompleted: 0,
            timedRunTargetLaps:
              nextPracticePlan?.targetFlyingLaps ?? 1,
            timedReleaseStrategy: hasTimeForAnotherRun
              ? releasePlan.strategy
              : null,
          }
          break
        } else if (next.lapStartedAtSeconds === null) {
          const segmentKey =
            timedSessionState.segment?.name ??
            config.timedSessionPlan?.segments.findLast((segment) =>
              Object.prototype.hasOwnProperty.call(
                next.timedSegmentBestSeconds,
                segment.name,
              ),
            )?.name ??
            snapshot.timedSegmentLabel ??
            weekendStageLabelFor(weekendStage)

          next = {
            ...next,
            lapStartedAtSeconds: crossedAtSeconds,
            passedDoubleYellowThisLap: false,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
            timedRunPhase: 'attack-lap',
            timedSegmentAttemptStatus: {
              ...next.timedSegmentAttemptStatus,
              [segmentKey]: 'flying-lap',
            },
          }
        }
      }

      // Cars begin race-distance sessions just before the control line, so a
      // crossing at total distance 2 completes lap 1. Keep actual completed
      // laps separate from the current pace estimate for timing and results.
      if (isRaceDistance) {
        const completedLap = Math.max(1, lap - 1)
        const recordedLapTime =
          next.lapStartedAtSeconds === null
            ? effectiveLapTime
            : Math.max(1, crossedAtSeconds - next.lapStartedAtSeconds)
        const isPersonalBest =
          next.bestLapTimeSeconds === null ||
          recordedLapTime < next.bestLapTimeSeconds
        const completedSectors = completedMeasuredSectors(
          next.currentLapSectorTimes,
          recordedLapTime,
          config.track.sectorMarks,
        )
        const completedTireLap = completeTireLap(next.runtimeSystems)

        next = {
          ...next,
          runtimeSystems: completedTireLap.runtimeSystems,
          lastLapTimeSeconds: recordedLapTime,
          bestLapTimeSeconds: isPersonalBest
            ? recordedLapTime
            : next.bestLapTimeSeconds,
          bestLapLap: isPersonalBest ? completedLap : next.bestLapLap,
          lapStartedAtSeconds: crossedAtSeconds,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          currentLapMiniSectorTimes: emptyCurrentLapMiniSectorTimes(),
          lapHistory: [
            ...next.lapHistory,
            {
              lap: completedLap,
              lapTimeSeconds: recordedLapTime,
              sectors: completedSectors,
              miniSectors: completedMeasuredMiniSectors(
                next.currentLapMiniSectorTimes,
                completedSectors,
              ),
              tireRun: completedTireLap.tireRun,
              weather: localWeather,
              trackGrip: localTrackGrip,
              position: next.position,
              pitStop: false,
              isValid: true,
              invalidReason: null,
            },
          ],
        }
      }

      // Checkered flag?
      if (
        isRaceDistance &&
        (lap >= finishLapTarget + 1 || finishedCount > 0)
      ) {
        // Interpolate the actual line-crossing time inside this frame so
        // classification gaps between finishers stay in real seconds.
        const finishedAtSeconds = next.lapStartedAtSeconds ?? elapsedSeconds
        const f1TireCar = f1TireModelCarFor(next)

        const tireRuleViolation =
          f1TireCar !== null &&
          weekendStage === 'race' &&
          (config.featureRaceTwoDryCompounds ?? true) &&
          !compliesWithGrandPrixTireRule(f1TireCar)
        const mandatoryPitStopViolation =
          next.runtimeSystems.kind === 'f1' &&
          weekendStage === 'race' &&
          (config.featureRaceMandatoryPitStop ?? false) &&
          next.pitStops === 0

        if (tireRuleViolation || mandatoryPitStopViolation) {
          next = {
            ...next,
            status: 'disqualified',
            finishedAtSeconds,
            stewardStatus: 'penalty',
            stewardNote: tireRuleViolation
              ? 'Mandatory dry-tyre rule'
              : 'Mandatory pit stop',
          }
          newEvents.push(
            makeEvent(
              `tire-rule-dsq-${driver.id}`,
              'penalty',
              elapsedSeconds,
              tireRuleViolation
                ? `${driver.code} is disqualified for failing to use two dry tyre specifications.`
                : `${driver.code} is disqualified for missing the mandatory pit stop.`,
            ),
          )
          break
        }

        next = { ...next, status: 'finished', finishedAtSeconds }
        finishedCount += 1
        if (finishedCount === 1) {
          newEvents.push(
            makeEvent(
              `finish-${driver.id}`,
              'finish',
              elapsedSeconds,
              `Checkered flag - ${driver.code} wins the race!`,
            ),
          )
        } else if (finishedCount <= 3) {
          newEvents.push(
            makeEvent(
              `finish-${driver.id}`,
              'finish',
              elapsedSeconds,
              `${driver.code} finishes P${finishedCount}.`,
            ),
          )
        }
        break
      }

      // Incidents only roll under green (restart laps are riskier).
      if (isRaceDistance && !controlPhase) {
        const incident = incidentForLap(
          config.seed,
          driver,
          team,
          lap,
          riskMultiplier,
          {
            pressure: Math.max(0, 1 - car.gapToAhead / 3),
            tireWearPercent: f1TireModelCarFor(car)?.tireWearPercent ?? 0,
            weather: snapshot.weather,
          },
        )

        if (incident) {
          newEvents.push(
            makeEvent(
              `incident-${driver.id}-${lap}`,
              incident.classification,
              elapsedSeconds,
              incident.message,
            ),
          )

          if (incident.flagResponse) {
            const candidate = stagedFlagPhase({
              durationSeconds: incident.flagDurationSeconds,
              id: `phase-${driver.id}-${lap}`,
              response: incident.flagResponse,
              safetyCarUsesPitLane: incident.safetyCarUsesPitLane,
              sector: incident.sector,
              startSeconds: elapsedSeconds,
              track: config.track,
            })

            // No active phase here (incidents only roll under green), so the
            // candidate only competes with other incidents from this frame.
            if (
              proposedFlagSeverity(candidate) >
              proposedFlagSeverity(frame.proposedPhase)
            ) {
              frame.proposedPhase = candidate
            }
          }

          if (incident.retirement) {
            next = {
              ...next,
              status: 'retired',
              overtakeStatus: 'disabled',
              runtimeSystems:
                next.runtimeSystems.kind === 'f1'
                  ? patchF1Runtime(next.runtimeSystems, {
                      activeAeroMode: 'corner' as const,
                      activeAeroState: createInitialActiveAeroState(),
                      overtakeEligibility: null,
                      ersPowerKw: 0,
                    })
                  : next.runtimeSystems,
              blueFlag: false,
              pitPhase: 'none',
              pitLaneProgress: null,
              retiredAtSeconds: elapsedSeconds,
              retiredReason: incident.kind,
              incidentTrackState: incident.stoppingLocation
                ? incidentTrackStateForLocation(incident.stoppingLocation)
                : 'on-track-stopped',
              incidentTrackStateSinceSeconds: elapsedSeconds,
            }
            break
          }

          next = {
            ...next,
            battleDeltaSecondsRemaining:
              incident.kind === 'minor-error'
                ? next.battleDeltaSecondsRemaining
                : next.battleDeltaSecondsRemaining - incident.timeLossSeconds,
            battleOpponentId: null,
            battlePhase: 'resolved',
            battlePhaseUntilSeconds:
              elapsedSeconds + Math.max(1.2, incident.timeLossSeconds * 1.8),
            damage: Math.min(1, next.damage + incident.damageDelta),
            offTrackSinceSeconds:
              incident.kind === 'minor-error'
                ? elapsedSeconds
                : next.offTrackSinceSeconds,
            rejoinEligibleAtSeconds:
              incident.kind === 'minor-error'
                ? elapsedSeconds +
                  Math.max(0.8, incident.timeLossSeconds * 4)
                : next.rejoinEligibleAtSeconds,
            stewardNote:
              incident.kind === 'minor-error' &&
              next.stewardStatus === 'clear'
                ? 'Waiting for a safe rejoin'
                : next.stewardNote,
          }
        }
      }

      const f1ComponentRuntime = f1RuntimeFor(next)
      const weakestComponentState = f1ComponentRuntime
        ? weakestComponent(f1ComponentRuntime.components)
        : null
      const weakestName = weakestComponentState?.[0] ?? null
      const weakest = weakestComponentState?.[1] ?? null

      if (
        next.damage >= 0.65 &&
        !snapshot.events.some(
          (event) => event.id === `black-orange-${driver.id}`,
        )
      ) {
        newEvents.push(
          makeEvent(
            `black-orange-${driver.id}`,
            'flag',
            elapsedSeconds,
            `BLACK AND ORANGE FLAG for ${driver.code}: damaged car must return to the pits.`,
          ),
        )
        next = {
          ...next,
          stewardStatus: 'noted',
          stewardNote: 'Black/orange flag - repair required',
        }
      }

      if (
        isRaceDistance &&
        weakest !== null &&
        weakestName !== null &&
        weakest.conditionPercent < 14 &&
        hashChance(`${config.seed}:component:${driver.id}:${weakestName}:${lap}`) <
          (14 - weakest.conditionPercent) * 0.018
      ) {
        const componentFailureLocation =
          hashChance(
            `${config.seed}:component-location:${driver.id}:${weakestName}:${lap}`,
          ) < 0.18
            ? ('on-track' as const)
            : ('off-track' as const)
        newEvents.push(
          makeEvent(
            `component-failure-${driver.id}-${lap}`,
            'incident',
            elapsedSeconds,
            `${driver.code} retires with a ${weakestName} failure ${componentFailureLocation === 'on-track' ? 'on the circuit' : 'off the racing surface'}.`,
          ),
        )
        next = {
          ...next,
          status: 'retired',
          overtakeStatus: 'disabled',
          runtimeSystems:
            next.runtimeSystems.kind === 'f1'
              ? patchF1Runtime(next.runtimeSystems, {
                  activeAeroMode: 'corner' as const,
                  activeAeroState: createInitialActiveAeroState(),
                  overtakeEligibility: null,
                  ersPowerKw: 0,
                })
              : next.runtimeSystems,
          blueFlag: false,
          pitPhase: 'none',
          pitLaneProgress: null,
          retiredAtSeconds: elapsedSeconds,
          retiredReason: `${weakestName} failure`,
          incidentTrackState: incidentTrackStateForLocation(
            componentFailureLocation,
          ),
          incidentTrackStateSinceSeconds: elapsedSeconds,
        }
        break
      }

      // Track limits.
      if (
        isRaceDistance &&
        lapHasTrackLimitWarning(
          config.seed,
          driver.id,
          driverPerformanceAbility(driver, 'raceAwareness'),
          lap,
          {
            pressure: Math.max(0, 1 - next.gapToAhead / 2.5),
            tireWearPercent: f1TireModelCarFor(next)?.tireWearPercent ?? 0,
            trackGrip: localTrackGrip,
            weather: localWeather,
          },
        )
      ) {
        if (next.runtimeSystems.kind !== 'f1') {
          newEvents.push(
            superFormulaAutomaticReview(
              `track-limit-review-${driver.id}-${lap}`,
              next,
              elapsedSeconds,
              'track-limit observation',
            ),
          )
          next = {
            ...next,
            trackLimitWarnings: next.trackLimitWarnings + 1,
            stewardStatus: 'noted',
            stewardNote: 'Track-limit observation recorded; official event decision required',
          }
          return next
        }
        const warnings = next.trackLimitWarnings + 1
        const trackLimitPenaltyTarget = penaltyFromWarnings(warnings)
        const trackLimitPenaltyIssued = next.penalties
          .filter((penalty) => penalty.reason.startsWith('Track limits'))
          .reduce((sum, penalty) => sum + penalty.seconds, 0)
        const penaltyDelta = Math.max(
          0,
          trackLimitPenaltyTarget - trackLimitPenaltyIssued,
        )
        const escalated = penaltyDelta > 0

        newEvents.push(
          makeEvent(
            `track-limit-${driver.id}-${lap}`,
            escalated ? 'penalty' : 'track-limit',
            elapsedSeconds,
            escalated
              ? `${driver.code} gets a +${penaltyDelta}s time penalty for track limits (${warnings} warnings).`
              : `Track limits: strike ${warnings} for ${driver.code}.`,
          ),
        )

        if (warnings === 3) {
          newEvents.push(
            makeEvent(
              `investigation-track-${driver.id}-${lap}`,
              'investigation',
              elapsedSeconds,
              `BLACK AND WHITE FLAG for ${driver.code}: final warning for repeated track limits.`,
            ),
          )
        }

        next = {
          ...next,
          trackLimitWarnings: warnings,
          penaltySeconds: next.penaltySeconds + penaltyDelta,
          penalties: escalated
            ? [
                ...next.penalties,
                makePenalty(
                  `track-limit-penalty-${driver.id}-${lap}`,
                  penaltyDelta >= 10 ? 'time-10' : 'time-5',
                  `Track limits (${warnings} warnings)`,
                  elapsedSeconds,
                  penaltyDelta,
                ),
              ]
            : next.penalties,
          stewardStatus: escalated ? 'penalty' : warnings >= 3 ? 'noted' : next.stewardStatus,
          stewardNote: escalated
            ? `Track limits: +${penaltyDelta}s`
            : warnings >= 3
              ? `Track limits warning ${warnings}`
              : next.stewardNote,
        }

        const retainedAdvantageSeconds = Math.max(
          0,
          next.battleDeltaSecondsRemaining,
        )
        const excursionDetail = hashChance(
          `${config.seed}:track-excursion:${driver.id}:${lap}`,
        )
        // Running wide is common; actually leaving the circuit and having to
        // wait for a safe gap is not. Only a small share of track-limit
        // infringements escalates that far, or the race reads as a crash-fest.
        const wentFullyOffTrack = excursionDetail > 0.985
        const gainedLastingAdvantage =
          !wentFullyOffTrack && retainedAdvantageSeconds > 0.15

        if (wentFullyOffTrack) {
          newEvents.push(
            makeEvent(
              `off-track-${driver.id}-${lap}`,
              'incident',
              elapsedSeconds,
              `${driver.code} leaves the track and waits for a safe gap before rejoining.`,
            ),
          )
          next = {
            ...next,
            battleDeltaSecondsRemaining: Math.min(
              0,
              next.battleDeltaSecondsRemaining,
            ),
            battleOpponentId: null,
            battlePhase: 'resolved',
            battlePhaseUntilSeconds: elapsedSeconds + 1.5,
            offTrackSinceSeconds: elapsedSeconds,
            rejoinEligibleAtSeconds:
              elapsedSeconds + 1 + Math.max(0, 0.82 - localTrackGrip) * 4,
            stewardNote:
              next.stewardStatus === 'clear'
                ? 'Waiting for a safe rejoin'
                : next.stewardNote,
          }
        }

        // This F1 decision path is sourced to the FIA/ISC ladder below.  SF
        // records the preceding track-limit observation and waits for an
        // official event decision instead of creating an automatic case.
        if (gainedLastingAdvantage && next.runtimeSystems.kind === 'f1') {
          const caseId = `investigation-excursion-${driver.id}-${lap}`
          const consequence =
            retainedAdvantageSeconds > 1.5
              ? ('major' as const)
              : retainedAdvantageSeconds > 0.75
                ? ('significant' as const)
                : ('minor' as const)
          stewardCases.push({
            id: caseId,
            openedAtSeconds: elapsedSeconds,
            resolveAtSeconds: elapsedSeconds + 18,
            driverId: driver.id,
            otherDriverId: null,
            offence: 'leaving-track-advantage',
            article: 'B1.9.6 / ISC App. L Ch. IV 2(c)',
            responsibilityShare: 1,
            consequence,
            advantageSeconds: retainedAdvantageSeconds,
          })
          newEvents.push(
            makeEvent(
              caseId,
              'investigation',
              elapsedSeconds,
              `INCIDENT NOTED: ${driver.code} investigated for leaving the track and retaining an advantage.`,
            ),
          )
          next = {
            ...next,
            stewardStatus: 'investigating',
            stewardNote: 'Off-track advantage under review',
          }
        }
      }

      // Pit strategy.
      const pitF1Runtime = f1RuntimeFor(next)
      const requestedCompound = pitF1Runtime
        ? manualPitRequests?.get(driver.id)
        : undefined
      const manualCompoundAvailable =
        requestedCompound !== undefined &&
        pitF1Runtime !== null &&
        (pitF1Runtime.tires.tireSetsRemaining[requestedCompound] ?? 0) > 0

      if (requestedCompound && !manualCompoundAvailable) {
        manualPitRequests?.delete(driver.id)
        newEvents.push(
          makeEvent(
            `manual-pit-refused-${driver.id}-${lap}`,
            'info',
            elapsedSeconds,
            `${driver.code} pit request cancelled: no ${requestedCompound} set available.`,
          ),
        )
      }
      const modeledPitLaneLossSeconds = pitLaneLossSecondsForTrack(config.track)
      const pitControlPhase =
        localControlPhase?.flag === 'sc'
          ? ('safety-car' as const)
          : localControlPhase?.flag === 'vsc'
            ? ('vsc' as const)
            : ('green' as const)
      const vscResumeAtSeconds =
        localControlPhase?.neutralisation?.kind === 'vsc'
          ? localControlPhase.neutralisation.resumeAtSeconds
          : null
      const neutralisationSecondsRemaining =
        vscResumeAtSeconds === null
          ? null
          : Math.max(0, vscResumeAtSeconds - elapsedSeconds)
      const strategicPitLaneLossSeconds =
        effectivePitLaneLossSecondsForControlPhase({
          controlPhase: pitControlPhase,
          neutralisationSecondsRemaining,
          pitLaneLossSeconds: modeledPitLaneLossSeconds,
        })
      const estimatedStopLoss = pitStopLossSeconds(
        config.seed,
        driver.id,
        team,
        next.pitStops + 1,
        next.damage > 0,
        strategicPitLaneLossSeconds,
      )
      const projectedRejoinDistance =
        next.totalDistance - estimatedStopLoss / baseLapTime
      const projectedRejoinPosition =
        1 +
        snapshot.cars.filter(
          (candidate) =>
            candidate.driverId !== next.driverId &&
            candidate.status === 'running' &&
            candidate.totalDistance > projectedRejoinDistance,
        ).length
      const teammateInPit = snapshot.cars.some(
        (candidate) =>
          candidate.teamId === next.teamId &&
          candidate.driverId !== next.driverId &&
          candidate.status === 'pit',
      ) || teamsPittingThisFrame.has(next.teamId)
      const pitLaneOccupancy =
        snapshot.cars.filter((candidate) => candidate.status === 'pit').length +
        teamsPittingThisFrame.size
      let proceduralPenalty = next.penalties.find(
        (penalty) =>
          !penalty.served &&
          (penalty.kind === 'drive-through' || penalty.kind === 'stop-go-10'),
      )

      if (
        proceduralPenalty?.mustServeByLap !== null &&
        proceduralPenalty?.mustServeByLap !== undefined &&
        (controlPhase?.flag === 'sc' || controlPhase?.flag === 'vsc')
      ) {
        const extendedPenalty = {
          ...proceduralPenalty,
          mustServeByLap: proceduralPenalty.mustServeByLap + 1,
        }
        proceduralPenalty = extendedPenalty
        next = {
          ...next,
          penalties: next.penalties.map((penalty) =>
            penalty.id === extendedPenalty.id ? extendedPenalty : penalty,
          ),
        }
      }

      if (
        proceduralPenalty?.mustServeByLap !== null &&
        proceduralPenalty?.mustServeByLap !== undefined &&
        lap > proceduralPenalty.mustServeByLap
      ) {
        next = {
          ...next,
          status: 'disqualified',
          stewardStatus: 'penalty',
          stewardNote: 'Procedural penalty not served',
        }
        newEvents.push(
          makeEvent(
            `penalty-deadline-${driver.id}-${lap}`,
            'penalty',
            elapsedSeconds,
            `${driver.code} is disqualified for failing to serve ${proceduralPenalty.kind === 'drive-through' ? 'a drive-through' : 'a stop-and-go'} penalty in time.`,
          ),
        )
        break
      }

      const decision =
        !pitF1Runtime || !isRaceDistance || lap <= 2 || !pitLaneOpen
          ? null
          : proceduralPenalty && !controlPhase
            ? {
                compound: pitF1Runtime.tires.tire,
                reason: 'penalty-service' as const,
              }
            : manualCompoundAvailable
            ? { compound: requestedCompound!, reason: 'manual' as const }
            : decidePitStop({
              seed: config.seed,
              driver,
              car: f1TireModelCarFor(next)!,
              lap,
              raceLaps,
              controlPhase: pitControlPhase,
              neutralisationSecondsRemaining,
              neutralisationElapsedSeconds:
                localControlPhase === null || localControlPhase === undefined
                  ? null
                  : elapsedSeconds - localControlPhase.startSeconds,
              neutralisedLapSeconds: baseLapTime * 1.45,
              fieldSize: snapshot.cars.filter(
                (candidate) =>
                  candidate.status !== 'dns' &&
                  candidate.status !== 'disqualified',
              ).length,
              pitEntrySecondsAway: 0,
              overtakeDifficulty: overtakeDifficultyForTrack(config.track),
              weather: localWeather,
              trackGrip: localTrackGrip,
              forecast: weatherForecast,
              gapToAheadSeconds: next.gapToAhead,
              // The overcut plays on a car that has already committed to its
              // stop: it has stopped more times than this one has.
              carAheadHasPitted:
                (snapshot.cars[index - 1]?.pitStops ?? 0) > next.pitStops,
              gapBehindSeconds: snapshot.cars[index + 1]?.gapToAhead ?? null,
              position: next.position,
              availableCompounds: pitF1Runtime.tires.tireSetsRemaining,
              pitLaneOpen,
              projectedRejoinPosition,
              teammateInPit,
              pitLaneOccupancy,
              tireNomination: config.track.tireNomination,
              mandatoryPitStop:
                weekendStage === 'race' &&
                (config.featureRaceMandatoryPitStop ?? false),
              mandatoryTwoDryCompounds:
                weekendStage === 'race' &&
                (config.featureRaceTwoDryCompounds ?? true),
              observedCalibration: config.track.observedCalibration,
              trackCondition: localTireTrackCondition,
            })

      if (decision && pitF1Runtime) {
        teamsPittingThisFrame.add(next.teamId)

        if (decision.reason === 'manual') {
          manualPitRequests?.delete(driver.id)
        }
        const servesProceduralPenalty = decision.reason === 'penalty-service'
        // B5.12 permits a VSC pit stop for tyres, but not a repair service.
        // Persist the service kind because the VSC may end before pit exit.
        const repairsDamage =
          !servesProceduralPenalty &&
          pitControlPhase !== 'vsc' &&
          next.damage > 0
        const penaltiesToServe = servesProceduralPenalty
          ? proceduralPenalty
            ? [proceduralPenalty]
            : []
          : next.penalties.filter(
              (penalty) =>
                !penalty.served &&
                (penalty.kind === 'time-5' || penalty.kind === 'time-10'),
            )
        const servedPenalty = penaltiesToServe.reduce(
          (total, penalty) => total + penalty.seconds,
          0,
        )
        const servedPenaltyIds = new Set(
          penaltiesToServe.map((penalty) => penalty.id),
        )
        const baseLoss = servesProceduralPenalty
          ? modeledPitLaneLossSeconds +
            (proceduralPenalty?.kind === 'stop-go-10' ? 10 : 0)
          : pitStopLossSeconds(
              config.seed,
              driver.id,
              team,
              next.pitStops + 1,
              repairsDamage,
              modeledPitLaneLossSeconds,
            )
        const doubleStackRisk = !servesProceduralPenalty && teammateInPit
        const pitExitGapSeconds = snapshot.cars
          .filter(
            (candidate) =>
              candidate.driverId !== next.driverId &&
              candidate.status === 'running',
          )
          .reduce(
            (closest, candidate) =>
              Math.min(
                closest,
                Math.abs(candidate.totalDistance - projectedRejoinDistance) *
                  baseLapTime,
            ),
            Number.POSITIVE_INFINITY,
          )
        const releaseConflict = pitExitGapSeconds < 0.42
        const unsafeReleaseChance =
          0.008 +
          (1 - clamp01(team.pitCrewSpeed)) * 0.04 +
          (doubleStackRisk ? 0.015 : 0)
        const unsafeRelease =
          releaseConflict &&
          hashChance(`${config.seed}:unsafe-release-error:${driver.id}:${lap}`) <
            unsafeReleaseChance
        const safeReleaseHoldSeconds =
          releaseConflict && !unsafeRelease && !servesProceduralPenalty
            ? Math.min(
                1.8,
                Math.max(0.25, (0.5 - pitExitGapSeconds) * 3.5),
              )
            : 0
        const loss =
          baseLoss +
          (servesProceduralPenalty ? 0 : servedPenalty) +
          safeReleaseHoldSeconds
        const speedViolation =
          hashChance(`${config.seed}:pit-speed:${driver.id}:${lap}`) <
          0.003 +
            Math.max(
              0,
              1 - driverPerformanceAbility(driver, 'raceAwareness'),
            ) *
              0.018
        const pitSpeedSeverity = hashChance(
          `${config.seed}:pit-speed-severity:${driver.id}:${lap}`,
        )
        const pitOverspeedKph = !speedViolation
          ? 0
          : pitSpeedSeverity < 0.86
            ? 0.3 + pitSpeedSeverity / 0.86 * 5.5
            : pitSpeedSeverity < 0.985
              ? 6 + (pitSpeedSeverity - 0.86) / 0.125 * 9
              : 15.1 + (pitSpeedSeverity - 0.985) / 0.015 * 9.9

        newEvents.push(
          makeEvent(
            `pit-${driver.id}-${lap}`,
            'pit',
            elapsedSeconds,
            servesProceduralPenalty
              ? `${driver.code} serves ${proceduralPenalty?.kind === 'stop-go-10' ? 'a 10-second stop-and-go' : 'a drive-through'} penalty (${loss.toFixed(1)}s pit-lane loss).`
              : `${driver.code} pits for ${decision.compound} tires (${loss.toFixed(1)}s, ${decision.reason}${servedPenalty > 0 ? `, +${servedPenalty}s served` : ''}).`,
          ),
        )

        if (doubleStackRisk) {
          newEvents.push(
            makeEvent(
              `double-stack-${driver.id}-${lap}`,
              'pit',
              elapsedSeconds,
              `${driver.code} joins a double-stack queue at ${team.name}.`,
            ),
          )
        }

        if (safeReleaseHoldSeconds > 0) {
          newEvents.push(
            makeEvent(
              `safe-release-hold-${driver.id}-${lap}`,
              'pit',
              elapsedSeconds,
              `${driver.code} is held for ${safeReleaseHoldSeconds.toFixed(1)}s to clear pit-lane traffic.`,
            ),
          )
        }

        if (unsafeRelease && !servesProceduralPenalty) {
          const releaseDecision = unsafeReleaseDecision({
            gapSeconds: pitExitGapSeconds,
          })
          newEvents.push(
            makeEvent(
              `unsafe-release-${driver.id}-${lap}`,
              'penalty',
              elapsedSeconds,
              `${driver.code} receives ${penaltyLabel(releaseDecision)} for an unsafe release (${releaseDecision.article}).`,
            ),
          )
          next = applyStewardPenalty(
            next,
            releaseDecision,
            `unsafe-release-${driver.id}-${lap}`,
            elapsedSeconds,
            raceLaps,
          )
        }

        if (speedViolation) {
          const speedDecision = pitLaneSpeedingDecision(pitOverspeedKph)
          newEvents.push(
            makeEvent(
              `pit-speed-${driver.id}-${lap}`,
              'penalty',
              elapsedSeconds,
              `${driver.code} receives ${penaltyLabel(speedDecision)} for pit-lane speeding (+${pitOverspeedKph.toFixed(1)} km/h, ${speedDecision.article}).`,
            ),
          )
          next = applyStewardPenalty(
            next,
            speedDecision,
            `pit-speed-${driver.id}-${lap}`,
            elapsedSeconds,
            raceLaps,
          )
        }

        next = {
          ...next,
          status: 'pit',
          pitStops: next.pitStops + (servesProceduralPenalty ? 0 : 1),
          pitPhase: 'entry',
          pitServiceKind: servesProceduralPenalty
            ? proceduralPenalty?.kind === 'stop-go-10'
              ? 'stop-go'
              : 'drive-through'
            : repairsDamage
              ? 'repair-stop'
              : 'tire-stop',
          pitLaneProgress: config.track.pitLane?.entryProgress ?? 0.965,
          pitStartedAtSeconds: elapsedSeconds,
          pitUntilSeconds:
            elapsedSeconds + loss + (doubleStackRisk ? 2.2 : 0),
          pitExitUntilSeconds: null,
          runtimeSystems: patchF1Runtime(pitF1Runtime, {}, {
            pendingTire: servesProceduralPenalty ? null : decision.compound,
            tireSetsRemaining: servesProceduralPenalty
              ? pitF1Runtime.tires.tireSetsRemaining
              : {
                  ...pitF1Runtime.tires.tireSetsRemaining,
                  [decision.compound]: Math.max(
                    0,
                    (pitF1Runtime.tires.tireSetsRemaining[
                      decision.compound
                    ] ?? 0) - 1,
                  ),
                },
          }),
          servedPenaltySeconds: next.servedPenaltySeconds + servedPenalty,
          penaltySeconds: Math.max(0, next.penaltySeconds - servedPenalty),
          penalties: next.penalties.map((penalty) =>
            servedPenaltyIds.has(penalty.id)
              ? { ...penalty, served: true, servedAtSeconds: elapsedSeconds }
              : penalty,
          ),
          lapHistory:
            servesProceduralPenalty || next.lapHistory.length === 0
              ? next.lapHistory
              : [
                  ...next.lapHistory.slice(0, -1),
                  { ...next.lapHistory.at(-1)!, pitStop: true },
                ],
        }
      }
    }

    const lap = Math.floor(next.totalDistance)
    next = {
      ...next,
      lap,
      progress: clamp01(next.totalDistance - lap),
      projectedLapTime: effectiveLapTime,
    }

    // A car recovering from an obvious incident is a passable obstruction
    // under yellow/neutralisation rules. Keep the last unaffected car as the
    // queue reference so the entire field is not chained behind the stopped car.
    if (carDefinesNeutralisationQueueOrder(next)) {
      aheadTotal = next.totalDistance
    }

    return next
  })

  // Longitudinal candidates are reconciled only after every car has produced
  // an immutable candidate. Same-lane cars cannot pass through one another;
  // once both ends of a tick have lateral clearance, the physical speed
  // difference is free to complete the pass.
  const occupancyCandidates = cars.flatMap((car) => {
    const previous = frameCarById.get(car.driverId)

    return previous &&
      previous.status === 'running' &&
      car.status === 'running' &&
      previous.offTrackSinceSeconds === null &&
      car.offTrackSinceSeconds === null &&
      car.pitPhase === 'none'
      ? [
          {
            driverId: car.driverId,
            totalDistanceM: previous.totalDistance * lapLengthM,
            candidateTotalDistanceM: car.totalDistance * lapLengthM,
            lateralOffsetM: previous.lateralOffsetM,
            candidateLateralOffsetM: car.lateralOffsetM,
            // A driver who has conceded is not defending the road, so the
            // occupancy rule stops holding the faster car behind while it
            // waits for a measured gap that neither of them has a reason to
            // open. A blue flag is race control telling a lapped car to move;
            // the timed-session yield is practice and qualifying etiquette,
            // where nobody is racing in the first place.
            concedesRoad:
              car.blueFlag === true || car.timedTrafficYield === true,
            priority: 1000 - previous.position,
          },
        ]
      : []
  })
  // How much room a driver wants alongside before committing, by circuit.
  //
  // The bodywork clearance is the same everywhere; the margin on top of it is
  // not. Between barriers a driver leaves room they would use at a circuit
  // with run-off, and that is the difference between passing at Monaco and
  // passing at Monza. `overtakeDifficultyForTrack` already scores it from
  // street layout, activation zones and the retained simulator-policy road
  // width. Until now it only priced a pit-stop rejoin: nothing about the
  // circuit reached the racing, so Monaco produced as many passes as Monza.
  //
  // At the hardest end this asks for about 2.4 m between centres against 1.95 m
  // at the easiest. A wider spread reads better against real pass counts but
  // the file-past under local yellow stops holding its order, so it is capped
  // here rather than tuned further; see the note below.
  //
  // This gates whether a car may complete a move. It does not move anybody:
  // routing the same score through attack commitment changed where drivers
  // placed the car, and followers began gaining places on each other while
  // filing past an accident under local yellow.
  const circuitDifficulty = overtakeDifficultyForTrack(config.track)
  const resolvedLongitudinalM = resolveLongitudinalOccupancy({
    candidates: occupancyCandidates,
    lapLengthM,
    margins: {
      lateralSafetyMarginM:
        OVERTAKE_LATERAL_SAFETY_MARGIN_M +
        clamp01((circuitDifficulty - 0.25) / 0.65) * 0.65,
    },
  })
  const occupancyResolvedCars = cars.map((car) => {
    const previous = frameCarById.get(car.driverId)
    const resolvedDistanceM = resolvedLongitudinalM.get(car.driverId)

    if (
      !previous ||
      resolvedDistanceM === undefined ||
      resolvedDistanceM >= car.totalDistance * lapLengthM - 1e-6
    ) {
      return car
    }

    const totalDistance = resolvedDistanceM / lapLengthM
    // Road speed is arc distance over time, not a lap-fraction difference
    // scaled by lap length. Centerline points are not evenly spaced, so the two
    // only agree where they happen to be uniform. Baku is the worst case: its
    // closing segment is 6.1 m against a 39 m typical, so a lap fraction is
    // worth a sixth of its usual distance immediately before the timing line
    // and its full value immediately after. Differencing across the line that
    // way reported a car at 829 km/h.
    const speedKph = speedForProfileTravelKph(
      config.track,
      previous.totalDistance,
      totalDistance,
      deltaSeconds,
    )
    const team = teams.get(car.teamId)
    const powerUnit = team
      ? selectGear({
          clutchEngagementFraction: car.clutchEngagementFraction,
          combustionPowerKw:
            combustionPowerKwFor(team, categoryPhysics) +
              (config.overtakeSystem === 'ots' &&
              car.overtakeStatus === 'active'
                ? (categoryPhysics.overtakeBoostPowerKw ?? 0)
                : 0),
          deploymentPowerKw:
            car.runtimeSystems.kind === 'f1'
              ? car.runtimeSystems.ersPowerKw
              : 0,
          physics: categoryPhysics,
          speedMps: speedKph / 3.6,
          transmissionEfficiency: categoryPhysics.drivetrainEfficiency,
          turboSpoolFraction: car.turboSpoolFraction,
        })
      : null

    return {
      ...car,
      totalDistance,
      lap: Math.floor(totalDistance),
      progress: clamp01(totalDistance - Math.floor(totalDistance)),
      speedKph: Number(speedKph.toFixed(2)),
      gear: powerUnit?.gear ?? car.gear,
      rpm: powerUnit?.rpm ?? car.rpm,
    }
  })

  const carsWithBattleEffects = occupancyResolvedCars.map((car) => {
    const effect = deferredBattleEffects.get(car.driverId)

    if (
      !effect ||
      car.status === 'finished' ||
      car.status === 'retired' ||
      car.status === 'disqualified' ||
      car.status === 'dns'
    ) {
      return car
    }

    const totalDistance = car.totalDistance
    const lap = Math.floor(totalDistance)
    const damage = Math.min(1, car.damage + effect.damageDelta)

    if (effect.retires) {
      return {
        ...car,
        status: 'retired' as const,
        totalDistance,
        lap,
        progress: clamp01(totalDistance - lap),
        damage,
        battleDeltaSecondsRemaining: 0,
        battlePhase: 'resolved' as const,
        battleOpponentId: effect.opponentId,
        battlePhaseUntilSeconds: elapsedSeconds + 1.5,
        pitStartedAtSeconds: null,
        pitUntilSeconds: null,
        pitExitUntilSeconds: null,
        pitPhase: 'none' as const,
        pitLaneProgress: null,
        overtakeStatus: 'disabled' as const,
        runtimeSystems:
          car.runtimeSystems.kind === 'f1'
            ? {
                ...car.runtimeSystems,
                activeAeroMode: 'corner' as const,
                activeAeroState: createInitialActiveAeroState(),
                overtakeEligibility: null,
                ersPowerKw: 0,
              }
            : car.runtimeSystems,
        blueFlag: false,
        retiredAtSeconds: elapsedSeconds,
        retiredReason: effect.reason,
        incidentTrackState:
          effect.incidentTrackState ?? 'on-track-stopped',
        incidentTrackStateSinceSeconds: elapsedSeconds,
      }
    }

    return {
      ...car,
      totalDistance,
      lap,
      progress: clamp01(totalDistance - lap),
      damage,
      battleDeltaSecondsRemaining:
        car.battleDeltaSecondsRemaining - effect.timeLossSeconds,
        battlePhase:
          effect.damageDelta > 0
            ? ('resolved' as const)
            : ('defending' as const),
      battleOpponentId: effect.opponentId,
      battlePhaseUntilSeconds: elapsedSeconds + 1.6,
      incidentTrackState:
        effect.incidentTrackState ?? car.incidentTrackState,
      incidentTrackStateSinceSeconds: effect.incidentTrackState
        ? elapsedSeconds
        : car.incidentTrackStateSinceSeconds,
      offTrackSinceSeconds:
        effect.incidentTrackState === 'off-track-stopped'
          ? elapsedSeconds
          : car.offTrackSinceSeconds,
      rejoinEligibleAtSeconds:
        effect.incidentTrackState === 'off-track-stopped'
          ? elapsedSeconds + Math.max(1.2, effect.timeLossSeconds)
          : car.rejoinEligibleAtSeconds,
    }
  })
  const carsWithTimedPenalties = carsWithBattleEffects.map((car) => {
    const gridDrop = deferredTimedGridPenalties.get(car.driverId)

    // Keep the final application fail-closed as well. This protects an SF
    // session if a future timed-session observation accidentally reaches this
    // local queue.
    if (!gridDrop || car.runtimeSystems.kind !== 'f1') {
      return car
    }

    const penaltyId = `impeding-grid-drop-${car.driverId}-${Math.floor(elapsedSeconds)}`
    newEvents.push(
      makeEvent(
        penaltyId,
        'penalty',
        elapsedSeconds,
        `${car.code} receives a ${gridDrop}-place grid drop for impeding.`,
      ),
    )

    return {
      ...car,
      impedingWarnings: car.impedingWarnings + 1,
      penalties: [
        ...car.penalties,
        makePenalty(
          penaltyId,
          'grid-drop',
          'Impeding in qualifying',
          elapsedSeconds,
          gridDrop,
        ),
      ],
      stewardStatus: 'penalty' as const,
      stewardNote: `Impeding: ${gridDrop}-place grid drop`,
    }
  })

  if (isRaceDistance && phase == null) {
    const stoppedCar = carsWithTimedPenalties.find(
      (car) =>
        !car.hiddenFromTrack &&
        (car.status === 'running' || car.status === 'retired') &&
        car.incidentTrackState !== undefined &&
        car.incidentTrackState !== 'clear',
    )

    if (stoppedCar) {
      const response =
        stoppedCar.incidentTrackState === 'on-track-stopped' ? 'sc' : 'vsc'
      const candidate = stagedFlagPhase({
        durationSeconds: response === 'sc' ? 70 : 45,
        id: `stopped-car-${stoppedCar.driverId}-${Math.floor(stoppedCar.incidentTrackStateSinceSeconds ?? elapsedSeconds)}`,
        incidentProgress: stoppedCar.progress,
        response,
        sector: sectorIndexForProgress(
          stoppedCar.progress,
          config.track.sectorMarks,
        ),
        startSeconds: elapsedSeconds,
        track: config.track,
      })

      if (
        proposedFlagSeverity(candidate) >
        proposedFlagSeverity(frame.proposedPhase)
      ) {
        frame.proposedPhase = candidate
      }
    }
  }

  // Activate the strongest incident flag from this frame.
  if (frame.proposedPhase) {
    phase = ensureNeutralisationProcedure(
      frame.proposedPhase,
      carsWithTimedPenalties,
      config.track,
    )
    greenLightUntilSeconds = null
    if (phase.flag !== 'yellow') {
      const detectionProgress =
        config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
      const leaderDistance = carsWithTimedPenalties[0]?.totalDistance ?? 1
      overtakeEnabled = false
      overtakeEnableAtLeaderDistance =
        Math.floor(leaderDistance) + 1 + detectionProgress
      overtakeEnableTargetsByDriver = null
    }
    newEvents.push(
      makeEvent(phase.id, 'flag', elapsedSeconds, phase.startMessage),
    )
  }

  const rankedCars = rankCars(carsWithTimedPenalties, config)

  if (isRaceDistance && phase === null && frame.proposedPhase === null) {
    const previousById = new Map(
      snapshot.cars.map((car) => [car.driverId, car] as const),
    )
    const currentById = new Map(
      rankedCars.map((car) => [car.driverId, car] as const),
    )

    for (const attacker of rankedCars) {
      const previousAttacker = previousById.get(attacker.driverId)

      if (
        !previousAttacker ||
        previousAttacker.status !== 'running' ||
        attacker.status !== 'running'
      ) {
        continue
      }

      for (const previousDefender of snapshot.cars) {
        if (
          previousDefender.driverId === attacker.driverId ||
          previousDefender.status !== 'running' ||
          previousAttacker.totalDistance > previousDefender.totalDistance
        ) {
          continue
        }

        const defender = currentById.get(previousDefender.driverId)

        if (
          !defender ||
          defender.status !== 'running' ||
          attacker.totalDistance <= defender.totalDistance
        ) {
          continue
        }

        const lateralSeparationM = Math.abs(
          attacker.lateralOffsetM - defender.lateralOffsetM,
        )
        const assistance =
          attacker.overtakeStatus === 'active'
            ? ' with Overtake'
            : lateralSeparationM < 1.1
              ? ' after using the tow'
              : ''
        newEvents.push(
          makeEvent(
            `pass-crossing-${attacker.driverId}-${defender.driverId}-${Math.floor(elapsedSeconds * 10)}`,
            'overtake',
            elapsedSeconds,
            `${attacker.code} passes ${defender.code}${assistance}.`,
          ),
        )
      }
    }
  }
  const leader = rankedCars[0]
  const leaderLap = Math.max(1, Math.min(Math.floor(leader.totalDistance), raceLaps))
  const racingElapsedSeconds = Math.max(
    0,
    elapsedSeconds - (snapshot.raceStartedAtSeconds ?? elapsedSeconds),
  )
  const sessionTimeLimitSeconds =
    config.sessionRaceTimeLimitSecondsOverride ??
    (weekendStage === 'sprint'
      ? (config.categoryRaceFormat?.sprintTimeLimitSeconds ??
        SPRINT_TIME_LIMIT_SECONDS)
      : (config.categoryRaceFormat?.featureTimeLimitSeconds ??
        GRAND_PRIX_TIME_LIMIT_SECONDS))
  const overallWindowSeconds =
    config.sessionOverallTimeLimitSecondsOverride ??
    (weekendStage === 'sprint'
      ? (config.categoryRaceFormat?.sprintOverallTimeLimitSeconds ??
        SPRINT_OVERALL_WINDOW_SECONDS)
      : (config.categoryRaceFormat?.featureOverallTimeLimitSeconds ??
        GRAND_PRIX_OVERALL_WINDOW_SECONDS))
  const raceClockSeconds =
    snapshot.raceClockSeconds +
    (isRaceDistance &&
    snapshot.startProcedure === 'racing' &&
    phase?.flag !== 'red' &&
    !restartProcedureActive
      ? deltaSeconds
      : 0)
  const timeLimitExpired =
    isRaceDistance &&
    (raceClockSeconds >= sessionTimeLimitSeconds ||
      racingElapsedSeconds >= overallWindowSeconds)
  let raceEndedEarly = snapshot.raceEndedEarly
  let checkeredLapTarget = snapshot.checkeredLapTarget
  let timeLimitReachedAtSeconds = snapshot.timeLimitReachedAtSeconds
  const raceDistanceDone = rankedCars.every((car) =>
    ['finished', 'retired', 'disqualified', 'dns'].includes(car.status),
  )

  if (timeLimitExpired && !raceDistanceDone && checkeredLapTarget === null) {
    checkeredLapTarget = Math.min(raceLaps, leaderLap + 1)
    timeLimitReachedAtSeconds = elapsedSeconds
    raceEndedEarly = checkeredLapTarget < raceLaps
    newEvents.push(
      makeEvent(
        `time-limit-${weekendStage}`,
        'finish',
        elapsedSeconds,
        `${weekendStage === 'sprint' ? 'Sprint' : 'Race'} time limit reached; chequered flag scheduled at the end of lap ${checkeredLapTarget}.`,
      ),
    )
  }
  const chequeredAttackInProgress =
    !isRaceDistance &&
    timedSessionDurationSeconds !== null &&
    elapsedSeconds >= timedSessionDurationSeconds &&
    rankedCars.some(
      (car) =>
        car.status === 'running' &&
        car.timedRunPhase === 'attack-lap' &&
        car.lapStartedAtSeconds !== null &&
        car.lapStartedAtSeconds < timedSessionDurationSeconds,
    ) &&
    elapsedSeconds < timedSessionDurationSeconds + baseLapTime * 1.7
  const timedSessionDone =
    !isRaceDistance &&
    timedSessionDurationSeconds !== null &&
    elapsedSeconds >= timedSessionDurationSeconds &&
    !chequeredAttackInProgress
  const allDone = isRaceDistance ? raceDistanceDone : timedSessionDone
  let classifiedCars = rankedCars

  // The Q1 no-time permission/DNS decision is an F1 qualifying rule. SUPER
  // FORMULA classifications remain records of the timed session until an
  // official event decision is supplied.
  if (
    categoryPhysics.id === 'f1-custom' &&
    timedSessionDone &&
    weekendStage === 'qualifying'
  ) {
    classifiedCars = rankCars(
      rankedCars.map((car) => {
        const q1Time = car.timedSegmentBestSeconds.Q1
        const hasQ1Time = typeof q1Time === 'number'
        const qualifyingClassificationStatus = !hasQ1Time
          ? car.deletedLapCount > 0
            ? ('deleted' as const)
            : ('no-time' as const)
          : ('classified' as const)
        const requiresStewardPermission =
          qualifyingClassificationStatus !== 'classified'
        const driver = drivers.get(car.driverId)
        const team = teams.get(car.teamId)
        const completedPractice =
          config.weekendContext?.completed.some(
            (stage) => stage === 'fp1' || stage === 'fp2' || stage === 'fp3',
          ) ?? false
        const setupConfidence = Math.min(
          1,
          Math.max(
            0,
            config.weekendContext?.setupConfidenceByDriver[car.driverId] ?? 0,
          ),
        )
        const generalPerformanceEvidence = driver
          ? Math.min(
              1,
              driverPerformanceAbility(driver, 'qualifyingPace') / 1.5,
            )
          : 0
        const machineEvidence = team
          ? Math.min(1, effectiveMachineRating(team.machine.qualifyingPace) / 1.5)
          : 0
        const evidenceScore =
          (completedPractice ? 0.18 : 0) +
          setupConfidence * 0.42 +
          generalPerformanceEvidence * 0.25 +
          machineEvidence * 0.15 -
          0.08
        const evidenceThreshold =
          0.37 +
          hashChance(
            `${config.seed}:qualifying-permission:${qualifyingClassificationStatus}:${car.driverId}`,
          ) *
            0.2
        const stewardsGrantedStart =
          requiresStewardPermission && evidenceScore >= evidenceThreshold

        if (requiresStewardPermission) {
          const reason =
            qualifyingClassificationStatus === 'deleted'
              ? 'without a Q1 time after all laps were deleted'
              : 'without setting a Q1 time'

          newEvents.push(
            makeEvent(
              `qualifying-permission-${car.driverId}`,
              stewardsGrantedStart ? 'info' : 'penalty',
              elapsedSeconds,
              stewardsGrantedStart
                ? `${car.code} finished ${reason} but receives permission to start on practice and general-performance evidence.`
                : `${car.code} finished ${reason} and has not qualified for the race.`,
            ),
          )
        }

        return {
          ...car,
          qualifyingClassificationStatus,
          stewardsGrantedStart,
          status:
            requiresStewardPermission && !stewardsGrantedStart
              ? ('dns' as const)
              : car.status,
          stewardStatus:
            requiresStewardPermission && !stewardsGrantedStart
              ? ('penalty' as const)
              : car.stewardStatus,
          stewardNote: requiresStewardPermission
            ? stewardsGrantedStart
              ? 'Permission to start granted'
              : qualifyingClassificationStatus === 'deleted'
                ? 'All Q1 laps deleted'
                : 'No Q1 time'
            : car.stewardNote,
        }
      }),
      config,
    )
  }
  const greenFlagLaps =
    snapshot.greenFlagLaps +
    (isRaceDistance && !phase && !restartProcedureActive
      ? Math.max(0, leaderLap - snapshot.leaderLap)
      : 0)
  const postRacePenaltySummary =
    isRaceDistance && allDone
      ? rankedCars
          .filter((car) => car.status === 'finished' && car.penaltySeconds > 0)
          .slice(0, 4)
          .map((car) => `${car.code} +${car.penaltySeconds}s`)
      : []

  if (allDone) {
    newEvents.push(
      makeEvent(
        isRaceDistance ? 'race-complete' : `${weekendStage}-complete`,
        'finish',
        elapsedSeconds,
        isRaceDistance
          ? 'Race complete.'
          : `${weekendStageLabelFor(weekendStage)} complete. Timed session over.`,
      ),
    )

    if (postRacePenaltySummary.length > 0) {
      newEvents.push(
        makeEvent(
          'post-race-penalties',
          'penalty',
          elapsedSeconds,
          `Post-race penalties applied: ${postRacePenaltySummary.join(', ')}.`,
        ),
      )
    }
  }

  const dedupedNew = newEvents.filter(
    (event) => !snapshot.events.some((existing) => existing.id === event.id),
  )
  const events = [...dedupedNew.reverse(), ...snapshot.events].slice(0, EVENT_LOG_LIMIT)

  const nextFlag: FlagState = timedSessionState.suspended
    ? 'red'
    : restartProcedureActive
      ? restartProcedure === 'standing'
        ? 'red'
        : 'sc'
      : (phase?.flag ?? 'clear')
  const activeTimedDoubleYellowSector =
    timedYellowUntilSeconds !== null && timedYellowUntilSeconds > elapsedSeconds
      ? timedYellowSector
      : null
  const sectorFlags = sectorFlagStatesFor(
    nextFlag,
    phase?.flag === 'yellow' && phase.yellowSeverity !== 'double'
      ? phase.sector
      : null,
    activeTimedDoubleYellowSector ??
      (phase?.flag === 'yellow' && phase.yellowSeverity === 'double'
        ? phase.sector
        : null),
  )

  const nextSnapshot: RaceSnapshot = {
    elapsedSeconds,
    elapsedLabel: formatElapsed(elapsedSeconds),
    leaderLap,
    raceLaps,
    sessionStatus: allDone ? 'finished' : 'racing',
    startProcedure: snapshot.startProcedure,
    startProcedureRemainingSeconds: snapshot.startProcedureRemainingSeconds,
    formationLapDurationSeconds: snapshot.formationLapDurationSeconds,
    formationLapsPlanned: snapshot.formationLapsPlanned,
    formationLapsCompleted: snapshot.formationLapsCompleted,
    formationBehindSafetyCar: snapshot.formationBehindSafetyCar,
    wetWeatherTyresMandatory: snapshot.wetWeatherTyresMandatory,
    raceStartedAtSeconds: snapshot.raceStartedAtSeconds,
    restartProcedure,
    restartProcedureUntilSeconds,
    overtakeEnabled,
    overtakeEnableAtLeaderDistance,
    overtakeEnableTargetsByDriver,
    cars: classifiedCars,
    eventMessage: '',
    flag: nextFlag,
    flagLabel: timedSessionState.suspended
      ? 'RED FLAG'
      : restartProcedureActive
        ? restartProcedure === 'standing'
          ? 'SS'
          : 'RS'
        : phase
          ? flagLabelFor(phase)
          : greenLightUntilSeconds !== null
            ? 'GREEN'
            : 'CLEAR',
    flagPhase: phase,
    greenLightUntilSeconds,
    sectorFlags,
    restartUntilSeconds,
    fuelEffectSeconds: fuelMassEffects({
      fuelLoadKg: leader.fuelLoadKg + heatHazardMassIncreaseKg,
      track: config.track,
    }).lapTimeDeltaSeconds,
    trackEvolutionLevel: trackEvolutionLevelFor(
      trackSurfaceSectors.rubberLevelBySector,
    ),
    trackSurface: serializedTrackSurface,
    rubberLevelBySector: trackSurfaceSectors.rubberLevelBySector,
    weather,
    weatherLabel: weatherLabelFor(weather),
    weatherForecastLabel: weatherForecast.label,
    heatHazardDeclared: f1WeatherRules ? heatHazardDeclared : null,
    heatIndexC,
    heatHazardMassIncreaseKg: f1WeatherRules ? heatHazardMassIncreaseKg : null,
    rainHazardDeclared: f1WeatherRules ? rainHazardDeclared : null,
    lowGripConditions: f1WeatherRules ? lowGripConditions : null,
    trackGrip,
    surfaceWaterMmBySector: trackSurfaceSectors.surfaceWaterMmBySector,
    dryingLineBySector: trackSurfaceSectors.dryingLineBySector,
    greenFlagLaps,
    raceClockSeconds,
    raceEndedEarly,
    checkeredLapTarget,
    timeLimitReachedAtSeconds,
    timedSegmentId,
    timedSegmentLabel,
    timedSessionSuspended: timedSessionState.suspended,
    timedParticipantDriverIds,
    timedYellowUntilSeconds,
    timedYellowSector,
    timedYellowProgress,
    pitLaneOpen,
    pitExitOpen,
    stewardCases,
    weekend: snapshot.weekend,
    events,
  }

  // Ticker priority: fresh event > active flag phase > fallback commentary.
  const latestEvent = events[0]
  const eventMessage =
    latestEvent &&
    elapsedSeconds - latestEvent.elapsedSeconds < TICKER_EVENT_WINDOW_SECONDS
      ? latestEvent.message
      : timedSessionState.suspended
        ? `${timedSegmentLabel ?? 'Timed session'} suspended under red flag.`
        : restartProcedureActive
          ? restartProcedure === 'standing'
            ? 'Standing-start resumption: cars are on the grid.'
            : 'Rolling-start resumption: field follows the Safety Car.'
        : phase
          ? controlProcedureStatusMessage(phase)
          : fallbackTickerMessage(nextSnapshot)

  return {
    ...nextSnapshot,
    eventMessage,
  }
}
