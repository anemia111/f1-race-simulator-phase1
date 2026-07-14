import { phaseOneConfig } from '../data/phaseOne'
import type {
  ActiveFlagPhase,
  CarSnapshot,
  Driver,
  FlagState,
  RaceConfig,
  RacePaceMode,
  PenaltyKind,
  RaceEvent,
  RaceSnapshot,
  Team,
  TimedSessionSegmentPlan,
  TireCompound,
  WeatherState,
  WeekendStage,
} from '../types'
import { flagSeverityRank, incidentForLap } from './incidents'
import { setupPaceDeltaSeconds } from './engineering'
import {
  advanceComponentWear,
  componentPacePenaltySeconds,
  createCarComponents,
  normalizeCarComponents,
  weakestComponent,
} from './components'
import { overtakeForLap } from './overtaking'
import { pitBoxProgressForTeam } from './pitLane'
import {
  dirtyAirDeltaSeconds,
  flagLabelFor,
  flagPaceMultiplier,
  fuelEffectSeconds,
  lapHasTrackLimitWarning,
  penaltyFromWarnings,
  phaseThreeTuning,
  restartGripLossSeconds,
  sectorIndexForProgress,
  trackEvolutionGainSeconds,
  trackEvolutionLevel,
} from './raceEvents'
import { hashChance } from './random'
import {
  compactSessionDurationLabel,
  isRaceDistanceSession,
  isTimedLapSession,
  sessionDurationSecondsFor,
  weekendStageLabelFor,
} from './sessionRules'
import { decidePitStop, pitStopLossSeconds } from './strategy'
import { calculateCarTelemetry } from './telemetry'
import { updateOvertakeEligibilityAfterTravel } from './activeAero'
import { tireDeltaSeconds } from './tires'
import { timedSessionStateAt } from './timedSessionPlan'
import {
  lineDeviationPenaltySeconds,
  progressForProfileSpeed,
  trackDynamicsAt,
} from './trackDynamics'
import {
  compliesWithGrandPrixTireRule,
  sessionDistanceLapsFor,
} from './regulations'
import {
  advanceTrackWater,
  createTrackWaterState,
  gripForSurfaceWater,
} from './trackWater'
import { weekendTireAllocation } from './weekendTires'
import {
  trackGripForSector,
  trackGripForWeather,
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
/** Minimum spacing (seconds) enforced inside the SC/VSC queue. */
const QUEUE_MIN_GAP_SECONDS = 0.4
const GRAND_PRIX_TIME_LIMIT_SECONDS = 2 * 60 * 60
const SPRINT_TIME_LIMIT_SECONDS = 60 * 60
const GRAND_PRIX_OVERALL_WINDOW_SECONDS = 3 * 60 * 60
const SPRINT_OVERALL_WINDOW_SECONDS = 90 * 60

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
      leaderLap - lapsDown + startingGridDistance(index) - 0.0001
    gridIndex += 1

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
      activeAeroMode: 'corner',
      overtakeStatus: 'disabled',
      overtakeEligibility: null,
      ersPowerKw: 0,
    }
  })
}
/** Visual-only pit exit blend window after a completed stop. */
const PIT_EXIT_VISUAL_SECONDS = 4
/** Distance between grid slots before lights out, as a fraction of a lap. */
const STARTING_GRID_SLOT_GAP = 0.0022
const GRID_SETTLE_SECONDS = 8
const START_LIGHTS_SECONDS = 5
const OVERTAKE_EXTRA_ENERGY_MJ = 0.5

export function formationLapDurationSecondsFor(config: RaceConfig) {
  const wetFactor =
    weatherFor(config.seed, config.track, 0) === 'clear' ? 1 : 1.12

  return Math.round(
    Math.min(230, Math.max(88, config.track.baseLapTime * 1.48 * wetFactor)),
  )
}

export function formationLapsPlannedFor(config: RaceConfig) {
  const abortedStart =
    hashChance(`${config.seed}:aborted-start`) <
    (weatherFor(config.seed, config.track, 0) === 'clear' ? 0.025 : 0.06)

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

function progressBetween(start: number, end: number, amount: number) {
  const span = (end + 1 - start) % 1
  return (start + span * clamp01(amount)) % 1
}

function postSafetyCarControlLineTargets(cars: CarSnapshot[]) {
  return Object.fromEntries(
    cars
      .filter((car) => car.status === 'running')
      .map((car) => [car.driverId, Math.floor(car.totalDistance) + 1]),
  )
}

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
) {
  return {
    id,
    issuedAtSeconds,
    kind,
    reason,
    seconds,
    served: false,
    mustServeByLap,
    servedAtSeconds: null,
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
  })
}

function startingGridDistance(gridIndex: number) {
  return 1 - gridIndex * STARTING_GRID_SLOT_GAP
}

function timedSessionPitReleaseSeconds(
  config: RaceConfig,
  driver: Driver,
  gridIndex: number,
  stage: WeekendStage,
  segment?: TimedSessionSegmentPlan | null,
  runIndex = 0,
) {
  if (segment) {
    const releaseWindow = Math.min(
      78,
      Math.max(24, (segment.endsAtSeconds - segment.startsAtSeconds) * 0.12),
    )

    return (
      segment.startsAtSeconds +
      18 +
      gridIndex * 0.8 +
      runIndex * 6 +
      hashChance(
        `${config.seed}:segment-release:${segment.name}:${driver.id}:${runIndex}`,
      ) *
        releaseWindow
    )
  }

  const isQualifyingStyle =
    stage === 'qualifying' || stage === 'sprintQualifying'
  const baseSeconds = isQualifyingStyle ? 38 : 90
  const spreadSeconds =
    stage === 'sprintQualifying' ? 150 : stage === 'qualifying' ? 250 : 980
  const garageSpacingSeconds = isQualifyingStyle ? 4 : 7

  return (
    baseSeconds +
    gridIndex * garageSpacingSeconds +
    hashChance(`${config.seed}:session-release:${stage}:${driver.id}`) *
      spreadSeconds
  )
}

function timedRunLimit(stage: WeekendStage, segmentLabel: string | null) {
  if (stage === 'fp1' || stage === 'fp2' || stage === 'fp3') {
    return 4
  }

  return segmentLabel === 'Q3' || segmentLabel === 'SQ3' ? 2 : 3
}

function timedRunCompound(
  stage: WeekendStage,
  runIndex: number,
  plannedCompound: TireCompound | null,
  weather: WeatherState,
  trackGrip: number,
): TireCompound {
  if (weather === 'heavy-rain' || trackGrip < 0.76) {
    return 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return 'I'
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
  trackGrip: number,
): TireCompound {
  if (weather === 'heavy-rain' || trackGrip < 0.76) {
    return 'W'
  }

  if (weather === 'light-rain' || trackGrip < 0.93) {
    return 'I'
  }

  if (stage === 'qualifying') {
    return 'S'
  }

  if (stage === 'sprintQualifying') {
    return 'M'
  }

  return fallback
}

function timedRunPaceFor(options: {
  car: CarSnapshot
  stage: WeekendStage
}) {
  const { car, stage } = options

  if (!isTimedLapSession(stage) || car.timedRunStartedAtSeconds === null) {
    return { paceFactor: 1, phase: car.timedRunPhase }
  }

  const isQualifyingStyle =
    stage === 'qualifying' || stage === 'sprintQualifying'

  if (car.timedRunPhase === 'out-lap') {
    return { paceFactor: isQualifyingStyle ? 1.42 : 1.28, phase: 'out-lap' as const }
  }

  if (car.timedRunPhase === 'attack-lap') {
    return { paceFactor: isQualifyingStyle ? 0.98 : 1.04, phase: 'attack-lap' as const }
  }

  if (car.timedRunPhase === 'in-lap') {
    return { paceFactor: isQualifyingStyle ? 1.5 : 1.34, phase: 'in-lap' as const }
  }

  return { paceFactor: isQualifyingStyle ? 1.2 : 1.16, phase: 'cooldown' as const }
}

function telemetryForTimedRunPhase<T extends {
  activeAeroMode: CarSnapshot['activeAeroMode']
  ersBatteryPercent: number
  ersMode: CarSnapshot['ersMode']
  ersPowerKw: number
  overtakeStatus: CarSnapshot['overtakeStatus']
  rpm: number
  speedKph: number
  throttlePercent: number
}>(
  telemetry: T,
  phase: CarSnapshot['timedRunPhase'],
): T {
  if (phase !== 'out-lap' && phase !== 'in-lap' && phase !== 'cooldown') {
    return telemetry
  }

  const scale = phase === 'in-lap' ? 0.66 : phase === 'out-lap' ? 0.74 : 0.82

  return {
    ...telemetry,
    activeAeroMode: 'corner',
    ersBatteryPercent: Math.min(100, telemetry.ersBatteryPercent + 2),
    ersMode: 'harvest',
    ersPowerKw: 0,
    overtakeStatus: 'disabled',
    rpm: Math.round(telemetry.rpm * scale),
    speedKph: Math.round(telemetry.speedKph * scale),
    throttlePercent: Math.round(telemetry.throttlePercent * scale),
  }
}

function projectedLapTime(
  driver: Driver,
  team: Team,
  car: CarSnapshot,
  config: RaceConfig,
  elapsedSeconds: number,
  raceLaps: number,
  phase: ActiveFlagPhase | null,
  restartUntilSeconds: number | null,
  weatherOverride?: WeatherState,
  trackGripOverride?: number,
) {
  const skillGain = driver.speed * 3 + driver.consistency * 1.05
  const carGain = team.cornering * 2 + team.straightLine * 1.65 + team.reliability * 0.32
  const weather = weatherOverride ?? weatherFor(config.seed, config.track, elapsedSeconds)
  const trackGrip = trackGripOverride ?? trackGripForWeather(config.seed, config.track, elapsedSeconds)
  const isTimedSession = isTimedLapSession(config.weekendStage ?? 'race')
  const tireDelta = tireDeltaSeconds(
    car.tire,
    car.tireAgeLaps,
    driver.tireManagement,
    weather,
    trackGrip,
    car.tireTemperatureC,
    car.tireWearPercent,
    config.track.tireNomination,
    config.track.observedCalibration?.tireDegradationByCompound[car.tire],
  )
  const evolution = trackEvolutionGainSeconds(elapsedSeconds)
  const fuelEffect =
    fuelEffectSeconds(Math.max(0, car.totalDistance - 1), raceLaps) *
    (isTimedSession ? 0.35 : 1)
  // No wheel-to-wheel racing under a flag, so no dirty-air penalty either.
  const localDynamics = trackDynamicsAt(config.track, car.progress)
  const dirtyAir =
    phase || isTimedSession
      ? 0
      : dirtyAirDeltaSeconds(car.gapToAhead) *
        (0.42 + localDynamics.curvature * 1.18)
  const damageCost = car.damage * phaseThreeTuning.damageLapCostSeconds
  const restartLoss = restartGripLossSeconds(elapsedSeconds, restartUntilSeconds)
  const seedPhase = hashChance(`${config.seed}:${driver.id}`) * Math.PI * 2
  const trafficWave =
    Math.sin(elapsedSeconds * 0.075 + driver.startOffset * 120 + seedPhase) * 0.28

  const setupGain = config.weekendContext?.setupBonusByDriver[driver.id] ?? 0
  const configuredSetup = config.weekendContext?.setupByDriver?.[driver.id]
  const setupPenalty = configuredSetup
    ? setupPaceDeltaSeconds(config.track, configuredSetup)
    : 0
  const componentPenalty = componentPacePenaltySeconds(car.components)
  const modeDelta: Record<RacePaceMode, number> = {
    defend: -0.16,
    push: -0.42,
    save: 0.34,
    standard: 0,
  }

  return (
    config.track.baseLapTime -
    skillGain -
    carGain +
    tireDelta -
    evolution +
    fuelEffect +
    dirtyAir +
    damageCost +
    restartLoss +
    trafficWave -
    setupGain +
    setupPenalty +
    componentPenalty +
    modeDelta[car.racePaceMode]
  )
}

function localTrackPaceDelta(
  config: RaceConfig,
  driver: Driver,
  team: Team,
  progress: number,
): number {
  const points = config.track.centerline
  const length = points.length
  const centerIndex = Math.floor(progress * length) % length
  const pointAt = (offset: number) => points[(centerIndex + offset + length) % length]
  const previous = pointAt(-2)
  const current = pointAt(0)
  const next = pointAt(2)
  const incoming = { x: current[0] - previous[0], z: current[2] - previous[2] }
  const outgoing = { x: next[0] - current[0], z: next[2] - current[2] }
  const incomingLength = Math.hypot(incoming.x, incoming.z) || 1
  const outgoingLength = Math.hypot(outgoing.x, outgoing.z) || 1
  const dot = Math.max(
    -1,
    Math.min(1, (incoming.x * outgoing.x + incoming.z * outgoing.z) / (incomingLength * outgoingLength)),
  )
  const cornerDemand = Math.acos(dot) / Math.PI
  const elevationDemand = Math.min(1, Math.abs(next[1] - previous[1]) / 6)
  const straightDemand = 1 - cornerDemand
  const cornerGain = (team.cornering * 0.72 + driver.consistency * 0.28 - 0.82) * cornerDemand * -1.8
  const straightGain = (team.straightLine - 0.82) * straightDemand * -1.35
  const elevationLoss = elevationDemand * (0.22 - team.reliability * 0.12)

  return cornerGain + straightGain + elevationLoss
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

function emptyCurrentLapSectorTimes(): CarSnapshot['currentLapSectorTimes'] {
  return [null, null, null]
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

function rankTimedSessionCars(cars: CarSnapshot[], config: RaceConfig) {
  const segmentNames = config.timedSessionPlan?.segments.map(
    (segment) => segment.name,
  )
  const timedEntry = (car: CarSnapshot) => {
    if (!segmentNames?.length) {
      return {
        groupIndex: car.bestLapTimeSeconds === null ? -1 : 0,
        groupLabel: null,
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

    return {
      groupIndex,
      groupLabel: groupIndex >= 0 ? segmentNames[groupIndex] : null,
      time:
        groupIndex >= 0
          ? (car.timedSegmentBestSeconds[segmentNames[groupIndex]] ?? null)
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

function rankCars(cars: CarSnapshot[], config: RaceConfig) {
  if (isTimedLapSession(config.weekendStage ?? 'race')) {
    return rankTimedSessionCars(cars, config)
  }

  const lapTime = config.track.baseLapTime
  // Time penalties are folded into the classification so a penalized car's
  // on-screen gap already reflects what it owes. (Real F1 serves penalties
  // at stops or after the race; simplified for now.)
  const classified = (car: CarSnapshot) =>
    car.totalDistance - car.penaltySeconds / lapTime
  // Finished cars are classified by real crossing time plus penalties, not
  // by frozen distance (which collapses at the line).
  const finishTime = (car: CarSnapshot) =>
    (car.finishedAtSeconds ?? 0) + car.penaltySeconds

  const finished = cars
    .filter((car) => car.status === 'finished')
    .sort((a, b) => finishTime(a) - finishTime(b))
  const active = cars
    .filter((car) =>
      ['running', 'pit'].includes(car.status),
    )
    .sort((a, b) => classified(b) - classified(a))
  const retired = cars
    .filter((car) => car.status === 'retired')
    .sort((a, b) => b.totalDistance - a.totalDistance)
  const excluded = cars
    .filter((car) => car.status === 'disqualified' || car.status === 'dns')
    .sort((a, b) => b.totalDistance - a.totalDistance)
  const ordered = [...finished, ...active, ...retired, ...excluded]
  const leader = ordered[0]

  return ordered.map((car, index) => {
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

    const gapToLeader =
      index === 0
        ? 0
        : car.status === 'finished' && leader.status === 'finished'
          ? finishTime(car) - finishTime(leader)
          : (classified(leader) - classified(car)) * lapTime
    const ahead = index === 0 ? null : ordered[index - 1]
    const gapToAhead =
      !ahead || ahead.status === 'retired'
        ? 0
        : car.status === 'finished' && ahead.status === 'finished'
          ? finishTime(car) - finishTime(ahead)
          : (classified(ahead) - classified(car)) * lapTime

    return {
      ...car,
      position: index + 1,
      gapToLeader,
      gapToAhead,
      gapToLeaderLabel:
        index === 0
          ? car.status === 'finished'
            ? 'Winner'
            : 'Leader'
          : formatGap(gapToLeader),
      gapToAheadLabel: index === 0 ? '0.0s' : `+${gapToAhead.toFixed(1)}s`,
    }
  })
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
  yellow: 'Sector is clear again. Green flag.',
  vsc: 'VSC ending. Race pace resumes.',
  sc: 'Safety Car in this lap. Green flag racing resumes.',
  red: 'Red flag lifted. The session restarts.',
}

const flagDeployMessages: Record<Exclude<FlagState, 'clear'>, (sector: number) => string> = {
  yellow: (sector) => `Local yellow in sector ${sector + 1}.`,
  vsc: () => 'Virtual Safety Car deployed.',
  sc: () => 'Safety Car deployed.',
  red: () => 'Red flag - session suspended.',
}

const weekendOrderFor = (config: RaceConfig): WeekendStage[] =>
  config.track.isSprintWeekend
    ? ['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']
    : ['fp1', 'fp2', 'fp3', 'qualifying', 'race']

export function createInitialRace(config: RaceConfig = phaseOneConfig): RaceSnapshot {
  const teams = byId(config.teams)
  const weekendStage = config.weekendStage ?? 'race'
  const isRaceDistance = isRaceDistanceSession(weekendStage)
  const scheduledRaceLaps = sessionDistanceLapsFor(config.track, weekendStage)
  const formationLapDurationSeconds = isRaceDistance
    ? formationLapDurationSecondsFor(config)
    : 0
  const formationLapsPlanned = isRaceDistance
    ? formationLapsPlannedFor(config)
    : 0
  const raceLaps = isRaceDistance
    ? Math.max(1, scheduledRaceLaps - Math.max(0, formationLapsPlanned - 1))
    : scheduledRaceLaps
  const weather = weatherFor(config.seed, config.track, 0)
  const trackGrip = trackGripForWeather(config.seed, config.track, 0)
  const weatherForecast = weatherForecastFor(config.seed, config.track, 0)
  const weekendOrder = weekendOrderFor(config)
  const isTimedSession = isTimedLapSession(weekendStage)
  const initialTimedSegment = config.timedSessionPlan?.segments[0] ?? null
  const startProcedure = isRaceDistance ? 'formation' : 'racing'
  const cars = config.drivers.map((driver, gridIndex) => {
    const team = teams.get(driver.teamId)

    if (!team) {
      throw new Error(`Missing team for driver ${driver.id}`)
    }

    const startsFromPitLane =
      isRaceDistance &&
      (config.weekendContext?.pitLaneStartByDriver[driver.id] ?? false)
    const didNotQualify =
      weekendStage === 'race' &&
      config.weekendContext?.qualificationStatusByDriver[driver.id] ===
        'not-qualified'
    const pitReleaseAtSeconds = isTimedSession
      ? timedSessionPitReleaseSeconds(
          config,
          driver,
          gridIndex,
          weekendStage,
          initialTimedSegment,
        )
      : null
    const startingTire = isTimedSession
      ? timedSessionStartingTire(
          weekendStage,
          initialTimedSegment?.compound ?? driver.tire,
          weather,
          trackGrip,
        )
      : driver.tire
    const regulationAllocation = weekendTireAllocation(config.track.isSprintWeekend)
    const initialTireSets = {
      H: config.weekendContext?.tireSetsByDriver[driver.id]?.H ?? regulationAllocation.H,
      I: config.weekendContext?.tireSetsByDriver[driver.id]?.I ?? regulationAllocation.I,
      M: config.weekendContext?.tireSetsByDriver[driver.id]?.M ?? regulationAllocation.M,
      S: config.weekendContext?.tireSetsByDriver[driver.id]?.S ?? regulationAllocation.S,
      W: config.weekendContext?.tireSetsByDriver[driver.id]?.W ?? regulationAllocation.W,
    }
    initialTireSets[startingTire] = Math.max(0, initialTireSets[startingTire] - 1)
    const totalDistance = startsFromPitLane
      ? 1 + pitBoxProgressForTeam(config.track, config.teams, driver.teamId)
      : isRaceDistance
        ? startingGridDistance(gridIndex)
      : (config.track.pitLane?.exitProgress ?? 0.13)
    const lap = Math.floor(totalDistance)

    const car: CarSnapshot = {
      driverId: driver.id,
      teamId: team.id,
      code: driver.code,
      driverName: driver.name,
      teamName: team.name,
      teamColor: team.color,
      progress: clamp01(totalDistance - lap),
      lap,
      totalDistance,
      trackLateralOffset: 0,
      battlePhase: 'single-file',
      battleOpponentId: null,
      battlePhaseUntilSeconds: null,
      battleDeltaSecondsRemaining: 0,
      gridPosition: gridIndex + 1,
      projectedLapTime: config.track.baseLapTime,
      lastLapTimeSeconds: null,
      bestLapTimeSeconds: null,
      bestLapLap: null,
      lapStartedAtSeconds: null,
      currentLapSectorTimes: emptyCurrentLapSectorTimes(),
      lapHistory: [],
      position: 0,
      gapToLeader: 0,
      gapToAhead: 0,
      gapToLeaderLabel: '',
      gapToAheadLabel: '',
      trackLimitWarnings: 0,
      speedKph: 0,
      racePaceMode: 'standard',
      throttlePercent: 0,
      brakePercent: 0,
      rpm: 0,
      gear: 1,
      activeAeroMode: 'corner',
      overtakeStatus: 'disabled',
      overtakeEligibility: null,
      overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
      energyHarvestedThisLapMj: 0,
      ersMode: 'balanced',
      ersPowerKw: 0,
      ersBatteryPercent: 82,
      tireTemperatureC: 86,
      tireWearPercent: 0,
      brakeTemperatureC: 460,
      brakeOverheatSeconds: 0,
      stewardStatus: 'clear',
      stewardNote: null,
      timedRunStartedAtSeconds: null,
      timedRunPhase: isTimedSession ? 'garage' : null,
      timedRunsCompleted: 0,
      timedSegmentBestSeconds:
        initialTimedSegment?.participantDriverIds.includes(driver.id)
          ? { [initialTimedSegment.name]: null }
          : {},
      deletedLapCount: 0,
      impedingWarnings: 0,
      outside107Percent: false,
      stewardsGrantedStart: false,
      pitExitQueueSeconds: 0,
      status: didNotQualify
        ? 'dns'
        : pitReleaseAtSeconds === null && !startsFromPitLane
          ? 'running'
          : 'pit',
      processedLap: isRaceDistance ? 1 : lap,
      processedBattleSegment: -1,
      tire: startingTire,
      tireAgeLaps: 0,
      pitStops: 0,
      pitPhase:
        pitReleaseAtSeconds === null && !startsFromPitLane ? 'none' : 'box',
      pitServiceKind: null,
      pitLaneProgress: startsFromPitLane
        ? pitBoxProgressForTeam(config.track, config.teams, driver.teamId)
        : null,
      pitStartedAtSeconds: null,
      pitUntilSeconds: pitReleaseAtSeconds,
      pitExitUntilSeconds: null,
      pendingTire: null,
      compoundsUsed: [startingTire],
      tireSetsRemaining: initialTireSets,
      damage: 0,
      penaltySeconds: 0,
      penalties: [],
      servedPenaltySeconds: 0,
      retiredAtSeconds: null,
      retiredReason: null,
      finishedAtSeconds: null,
      hiddenFromTrack: didNotQualify,
      vscDeltaSeconds: 0,
      hasUnlappedUnderSafetyCar: false,
      blueFlag: false,
      startsFromPitLane,
      lowPowerStartDetected: false,
      warningLightsUntilSeconds: null,
      components: normalizeCarComponents(
        config.weekendContext?.componentConditionByDriver?.[driver.id] ??
          createCarComponents(),
      ),
    }

    return car
  })
  const startMessage = isTimedSession
    ? `${weekendStageLabelFor(weekendStage)} green. Cars start in the pit lane and choose their own release windows for ${compactSessionDurationLabel(weekendStage)}.`
    : `${weekendStage === 'sprint' ? 'Sprint start' : 'Lights out'}! ${raceLaps} laps at ${config.track.name}.`

  const initialWater = createTrackWaterState()
  const initialOvertakeDetectionProgress =
    config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
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
    raceStartedAtSeconds: null,
    restartProcedure: 'none',
    restartProcedureUntilSeconds: null,
    overtakeEnabled: !isRaceDistance,
    overtakeEnableAtLeaderDistance: isRaceDistance
      ? 1 + initialOvertakeDetectionProgress
      : null,
    overtakeEnableTargetsByDriver: null,
    cars: rankCars(cars, config),
    eventMessage: isRaceDistance
      ? `Formation lap begins. ${formationLapsPlanned > 1 ? 'An additional formation lap is scheduled after an aborted start.' : 'Cars will complete a full circuit before returning to the grid.'}`
      : startMessage,
    flag: 'clear',
    flagLabel: 'CLEAR',
    flagPhase: null,
    restartUntilSeconds: null,
    fuelEffectSeconds: fuelEffectSeconds(0, raceLaps),
    trackEvolutionLevel: trackEvolutionLevel(0),
    weather,
    weatherLabel: weatherLabelFor(weather),
    weatherForecastLabel: weatherForecast.label,
    trackGrip,
    surfaceWaterMmBySector: initialWater.surfaceWaterMmBySector,
    dryingLineBySector: initialWater.dryingLineBySector,
    greenFlagLaps: 0,
    raceClockSeconds: 0,
    raceEndedEarly: false,
    checkeredLapTarget: null,
    timeLimitReachedAtSeconds: null,
    timedSegmentLabel: initialTimedSegment?.name ?? null,
    timedSessionSuspended: false,
    timedParticipantDriverIds:
      initialTimedSegment?.participantDriverIds ??
      (isTimedSession ? config.drivers.map((driver) => driver.id) : []),
    timedYellowUntilSeconds: null,
    timedYellowSector: null,
    pitLaneOpen: true,
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
      makeEvent(
        isTimedSession ? `${weekendStage}-start` : 'race-formation',
        'info',
        0,
        isRaceDistance
          ? `Formation lap begins. Energy counter reset; ${formationLapDurationSeconds}s target lap.`
          : startMessage,
      ),
    ],
  }

  return snapshot
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

  const teams = byId(config.teams)
  const drivers = byId(config.drivers)
  const elapsedSeconds = snapshot.elapsedSeconds + deltaSeconds
  const raceLaps = snapshot.raceLaps
  const baseLapTime = config.track.baseLapTime
  const newEvents: RaceEvent[] = []
  const weather = weatherFor(config.seed, config.track, elapsedSeconds)
  const trackGrip = trackGripForWeather(config.seed, config.track, elapsedSeconds)
  const weatherForecast = weatherForecastFor(config.seed, config.track, elapsedSeconds)
  const rainIntensityMmH = weatherTrackStateFor(
    config.seed,
    config.track,
    elapsedSeconds,
  ).rainIntensityMmH
  const trackWater = advanceTrackWater({
    cars: snapshot.cars,
    deltaSeconds,
    previous: {
      dryingLineBySector: snapshot.dryingLineBySector,
      surfaceWaterMmBySector: snapshot.surfaceWaterMmBySector,
    },
    rainIntensityMmH,
    track: config.track,
  })
  const weekendStage = config.weekendStage ?? snapshot.weekend.stage
  const isRaceDistance = isRaceDistanceSession(weekendStage)
  const isTimedSession = isTimedLapSession(weekendStage)
  const timedSessionDurationSeconds =
    config.timedSessionPlan?.totalDurationSeconds ??
    sessionDurationSecondsFor(weekendStage)
  const timedSessionState = timedSessionStateAt(
    config.timedSessionPlan,
    elapsedSeconds,
  )
  const timedSegmentLabel = timedSessionState.segment?.name ?? null
  const timedSegmentChanged =
    config.timedSessionPlan !== undefined &&
    timedSegmentLabel !== snapshot.timedSegmentLabel
  const timedSuspensionChanged =
    config.timedSessionPlan !== undefined &&
    timedSessionState.suspended !== snapshot.timedSessionSuspended
  let timedParticipantDriverIds = snapshot.timedParticipantDriverIds
  let timedYellowUntilSeconds = snapshot.timedYellowUntilSeconds
  let timedYellowSector = snapshot.timedYellowSector

  if (
    timedYellowUntilSeconds !== null &&
    elapsedSeconds >= timedYellowUntilSeconds
  ) {
    timedYellowUntilSeconds = null
    timedYellowSector = null
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
    const raceStartsAt = lightsStartAt + START_LIGHTS_SECONDS
    const nextProcedure =
      elapsedSeconds < gridStartsAt
        ? 'formation'
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
        ? `Formation lap ${Math.min(snapshot.formationLapsPlanned, completedFormationLaps + 1)}/${snapshot.formationLapsPlanned}. Cars are warming tires and brakes.`
        : nextProcedure === 'grid'
          ? 'Cars return to their starting-grid slots.'
          : nextProcedure === 'lights'
            ? 'Start procedure: five red lights.'
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
          `Aborted start. Extra formation lap ${completedFormationLaps + 1}; race distance reduced to ${raceLaps} laps.`,
        ),
      )
    }

    const lightsOut = nextProcedure === 'racing' && snapshot.startProcedure === 'lights'
    const cars = snapshot.cars.map((car, index) => {
      const driver = drivers.get(car.driverId)
      const jumpStart =
        lightsOut &&
        !car.startsFromPitLane &&
        driver !== undefined &&
        hashChance(`${config.seed}:jump-start:${driver.id}`) <
          0.006 + (1 - driver.consistency) * 0.012
      const weakestCondition = Math.min(
        car.components.ice.conditionPercent,
        car.components.mguK.conditionPercent,
        car.components.energyStore.conditionPercent,
      )
      const lowPowerStart =
        lightsOut &&
        !car.startsFromPitLane &&
        driver !== undefined &&
        hashChance(`${config.seed}:low-power-start:${driver.id}`) <
          0.004 + Math.max(0, 70 - weakestCondition) * 0.0005

      if (jumpStart) {
        newEvents.push(
          makeEvent(
            `jump-start-${car.driverId}`,
            'penalty',
            elapsedSeconds,
            `${car.code} receives a +5s penalty for a false start.`,
          ),
        )
      }

      if (lowPowerStart) {
        newEvents.push(
          makeEvent(
            `low-power-start-${car.driverId}`,
            'info',
            elapsedSeconds,
            `${car.code}: low-power start detected. Automatic MGU-K deployment active; warning lights flashing.`,
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
          rpm: nextProcedure === 'lights' ? 7200 : 0,
          gear: 1,
          activeAeroMode: 'corner' as const,
          overtakeStatus: 'disabled' as const,
          overtakeEligibility: null,
          ersMode: 'harvest' as const,
          ersPowerKw: 0,
          overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
          energyHarvestedThisLapMj: 0,
          lapStartedAtSeconds: null,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
        }
      }

      const formationProgress = Math.min(
        snapshot.formationLapsPlanned,
        elapsedSeconds / Math.max(1, snapshot.formationLapDurationSeconds),
      )
      const formationDistance = startingGridDistance(index) + formationProgress
      const stagedDistance =
        nextProcedure === 'formation'
          ? formationDistance
          : startingGridDistance(index)
      const stagedLap = Math.floor(stagedDistance)

      return {
        ...car,
        totalDistance: stagedDistance,
        lap: stagedLap,
        progress: clamp01(stagedDistance - stagedLap),
        brakePercent: nextProcedure === 'lights' ? 72 : nextProcedure === 'formation' ? 18 : 20,
        ersMode: nextProcedure === 'lights' ? ('balanced' as const) : ('harvest' as const),
        rpm: nextProcedure === 'lights' ? 10800 : nextProcedure === 'formation' ? 6200 : 0,
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
            : lightsOut
              ? lowPowerStart
                ? 42
                : 58
              : 0,
        throttlePercent: nextProcedure === 'lights' ? 36 : nextProcedure === 'formation' ? 42 : 0,
        tireTemperatureC: Math.min(104, car.tireTemperatureC + deltaSeconds * 0.35),
        brakeTemperatureC: Math.min(
          820,
          car.brakeTemperatureC +
            (nextProcedure === 'formation' ? deltaSeconds * 1.4 : 0),
        ),
        overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
        energyHarvestedThisLapMj: 0,
        penaltySeconds: car.penaltySeconds + (jumpStart ? 5 : 0),
        penalties: jumpStart
          ? [
              ...car.penalties,
              makePenalty(
                `false-start-${driver.id}`,
                'time-5',
                'False start',
                elapsedSeconds,
                5,
              ),
            ]
          : car.penalties,
        stewardStatus: jumpStart ? ('penalty' as const) : car.stewardStatus,
        stewardNote: jumpStart ? 'False start +5s' : car.stewardNote,
        lapStartedAtSeconds: lightsOut ? elapsedSeconds : car.lapStartedAtSeconds,
        currentLapSectorTimes: lightsOut
          ? emptyCurrentLapSectorTimes()
          : car.currentLapSectorTimes,
        lowPowerStartDetected: lowPowerStart,
        warningLightsUntilSeconds: lowPowerStart
          ? elapsedSeconds + 4
          : car.warningLightsUntilSeconds,
        ersBatteryPercent: lowPowerStart
          ? Math.max(5, car.ersBatteryPercent - 3)
          : car.ersBatteryPercent,
      }
    })

    const nextSnapshot: RaceSnapshot = {
      ...snapshot,
      cars: rankCars(cars, config),
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
      raceStartedAtSeconds: lightsOut
        ? elapsedSeconds
        : snapshot.raceStartedAtSeconds,
      surfaceWaterMmBySector: trackWater.surfaceWaterMmBySector,
      dryingLineBySector: trackWater.dryingLineBySector,
      weather,
      weatherLabel: weatherLabelFor(weather),
      weatherForecastLabel: weatherForecast.label,
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
  let redFlagRestart = false

  if (phase && elapsedSeconds >= phase.endSeconds) {
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
          ? GRID_SETTLE_SECONDS + START_LIGHTS_SECONDS
          : Math.max(35, baseLapTime * 1.18))
    }
    if (phase.flag !== 'yellow') {
      overtakeEnabled = false
      if (phase.flag === 'sc') {
        overtakeEnableAtLeaderDistance = null
        overtakeEnableTargetsByDriver =
          postSafetyCarControlLineTargets(snapshot.cars)
      } else {
        const detectionProgress =
          config.track.overtakeControlLines?.[0]?.detectionProgress ?? 0.2
        const leaderDistance = snapshot.cars[0]?.totalDistance ?? 1
        overtakeEnableAtLeaderDistance =
          Math.floor(leaderDistance) + 1 + detectionProgress
        overtakeEnableTargetsByDriver = null
      }
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

  if (
    phase?.flag === 'sc' &&
    phase.lappedCarsMayOvertakeAtSeconds !== null &&
    phase.lappedCarsMayOvertakeAtSeconds !== undefined &&
    snapshot.elapsedSeconds < phase.lappedCarsMayOvertakeAtSeconds &&
    elapsedSeconds >= phase.lappedCarsMayOvertakeAtSeconds
  ) {
    newEvents.push(
      makeEvent(
        `sc-unlap-${phase.id}`,
        'flag',
        elapsedSeconds,
        'LAPPED CARS MAY NOW OVERTAKE. Eligible cars may pass the Safety Car queue.',
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
    (leaderHasReachedOvertakeEnableLine || fieldHasReachedOvertakeEnableLine)
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

  // During a red-flag suspension the field gathers for the restart, so the
  // resume re-forms a nose-to-tail queue in classification order.
  let frameCars = snapshot.cars

  if (
    isTimedSession &&
    config.timedSessionPlan &&
    (timedSegmentChanged || timedSuspensionChanged)
  ) {
    const segment = timedSessionState.segment

    if (timedSegmentChanged) {
      newEvents.push(
        makeEvent(
          segment
            ? `timed-segment-${segment.name}`
            : `timed-break-${snapshot.timedSegmentLabel ?? 'session'}`,
          'info',
          elapsedSeconds,
          segment
            ? `${segment.name} begins. ${segment.participantDriverIds.length} cars may leave the pit lane on ${segment.compound}.`
            : `${snapshot.timedSegmentLabel ?? 'Timed segment'} is complete. Cars return to the garages for the session interval.`,
        ),
      )
    }

    if (timedSuspensionChanged) {
      newEvents.push(
        makeEvent(
          `timed-${timedSessionState.suspended ? 'red' : 'resume'}-${segment?.name ?? 'session'}`,
          'flag',
          elapsedSeconds,
          timedSessionState.suspended
            ? `Red flag in ${segment?.name ?? 'the timed session'}. The session clock is suspended and cars return to the pits.`
            : `${segment?.name ?? 'Timed session'} resumes. Pit exit is open for eligible cars.`,
        ),
      )
    }

    const segmentIndex = segment
      ? config.timedSessionPlan.segments.findIndex(
          (candidate) => candidate.name === segment.name,
        )
      : -1
    timedParticipantDriverIds = segment
      ? timedSegmentChanged && segmentIndex > 0
        ? snapshot.cars
            .filter(
              (car) =>
                car.status !== 'retired' &&
                car.status !== 'disqualified' &&
                car.status !== 'dns',
            )
            .slice(0, segment.participantDriverIds.length)
            .map((car) => car.driverId)
        : timedSegmentChanged
          ? segment.participantDriverIds
          : snapshot.timedParticipantDriverIds
      : []
    const participantIds = new Set(timedParticipantDriverIds)
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
        timedSessionDurationSeconds !== null &&
        car.timedRunPhase === 'attack-lap' &&
        car.lapStartedAtSeconds !== null &&
        car.lapStartedAtSeconds < timedSessionDurationSeconds

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
          activeAeroMode: 'corner' as const,
          overtakeStatus: 'disabled' as const,
          overtakeEligibility: null,
          ersMode: 'harvest' as const,
          ersPowerKw: 0,
          pitPhase: 'box' as const,
          pitLaneProgress: pitBox,
          pitStartedAtSeconds: null,
          pitUntilSeconds: null,
          pitExitUntilSeconds: null,
          pendingTire: null,
          lapStartedAtSeconds: null,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          timedRunStartedAtSeconds: null,
          timedRunPhase: 'garage' as const,
        }
      }

      const driver = drivers.get(car.driverId)

      if (!driver) {
        return car
      }

      const startsNewSegment = timedSegmentChanged
      const completedRuns = startsNewSegment ? 0 : car.timedRunsCompleted
      const compound = startsNewSegment
        ? timedRunCompound(
            weekendStage,
            completedRuns,
            segment.compound,
            weather,
            trackGrip,
          )
        : car.tire
      const plannedRelease = timedSessionPitReleaseSeconds(
        config,
        driver,
        index,
        weekendStage,
        segment,
        completedRuns,
      )
      const releaseAtSeconds = Math.max(
        plannedRelease,
        elapsedSeconds +
          8 +
          hashChance(
            `${config.seed}:timed-resume:${segment.name}:${car.driverId}:${completedRuns}`,
          ) *
            28,
      )
      const tireSetsRemaining = startsNewSegment
        ? {
            ...car.tireSetsRemaining,
            [compound]: Math.max(
              0,
              (car.tireSetsRemaining[compound] ?? 0) - 1,
            ),
          }
        : car.tireSetsRemaining

      return {
        ...car,
        status: 'pit' as const,
        speedKph: 0,
        throttlePercent: 0,
        brakePercent: 0,
        rpm: 0,
        gear: 1,
        tire: compound,
        tireAgeLaps: startsNewSegment ? 0 : car.tireAgeLaps,
        tireWearPercent: startsNewSegment ? 0 : car.tireWearPercent,
        tireSetsRemaining,
        compoundsUsed: car.compoundsUsed.includes(compound)
          ? car.compoundsUsed
          : [...car.compoundsUsed, compound],
        activeAeroMode: 'corner' as const,
        overtakeStatus: 'disabled' as const,
        overtakeEligibility: null,
        ersMode: 'harvest' as const,
        ersPowerKw: 0,
        pitPhase: 'box' as const,
        pitLaneProgress: pitBox,
        pitStartedAtSeconds: null,
        pitUntilSeconds: releaseAtSeconds,
        pitExitUntilSeconds: null,
        pendingTire: null,
        lapStartedAtSeconds: null,
        currentLapSectorTimes: emptyCurrentLapSectorTimes(),
        timedRunStartedAtSeconds: null,
        timedRunPhase: 'garage' as const,
        timedRunsCompleted: completedRuns,
        timedSegmentBestSeconds: startsNewSegment
          ? {
              ...car.timedSegmentBestSeconds,
              [segment.name]: null,
            }
          : car.timedSegmentBestSeconds,
        processedLap: Math.floor(car.totalDistance),
      }
    })
  }

  if (redFlagRestart) {
    frameCars =
      restartProcedure === 'standing'
        ? reformFieldForStandingRestart(snapshot.cars)
        : reformFieldForRedRestart(
            snapshot.cars,
            QUEUE_MIN_GAP_SECONDS / baseLapTime,
          )
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

  frameCars = frameCars.map((car) => {
    const investigation = snapshot.events.find(
      (event) =>
        event.id.startsWith(`investigation-contact-${car.driverId}-`) &&
        elapsedSeconds - event.elapsedSeconds >= 22 &&
        !snapshot.events.some(
          (existing) => existing.id === `decision-${event.id}`,
        ),
    )

    if (!investigation) {
      return car
    }

    const decisionRoll = hashChance(
      `${config.seed}:steward-decision:${investigation.id}`,
    )
    const penaltyKind: PenaltyKind | null =
      decisionRoll < 0.45
        ? null
        : decisionRoll < 0.75
          ? 'time-5'
          : decisionRoll < 0.9
            ? 'time-10'
            : decisionRoll < 0.97
              ? 'drive-through'
              : 'stop-go-10'
    const penaltySeconds =
      penaltyKind === 'time-5'
        ? 5
        : penaltyKind === 'time-10'
          ? 10
          : penaltyKind === 'drive-through'
            ? 20
            : penaltyKind === 'stop-go-10'
              ? 30
              : 0
    const penaltyLabel =
      penaltyKind === 'drive-through'
        ? 'a drive-through penalty'
        : penaltyKind === 'stop-go-10'
          ? 'a 10-second stop-and-go penalty'
          : `a +${penaltySeconds}s penalty`
    const decisionId = `decision-${investigation.id}`

    newEvents.push(
      makeEvent(
        decisionId,
        penaltySeconds > 0 ? 'penalty' : 'info',
        elapsedSeconds,
        penaltySeconds > 0
          ? `${car.code} receives ${penaltyLabel} for causing a collision.`
          : `Stewards: no further action for ${car.code} after the contact review.`,
      ),
    )

    if (penaltySeconds === 0) {
      return {
        ...car,
        stewardStatus: car.penaltySeconds > 0 ? 'penalty' : 'clear',
        stewardNote:
          car.penaltySeconds > 0 ? car.stewardNote : 'No further action',
      }
    }

    return {
      ...car,
      penaltySeconds: car.penaltySeconds + penaltySeconds,
      penalties: [
        ...car.penalties,
        makePenalty(
          decisionId,
          penaltyKind!,
          'Causing a collision',
          elapsedSeconds,
          penaltySeconds,
          penaltyKind === 'drive-through' || penaltyKind === 'stop-go-10'
            ? Math.floor(car.totalDistance) + 3
            : null,
        ),
      ],
      stewardStatus: 'penalty',
      stewardNote:
        penaltyKind === 'drive-through'
          ? 'Drive-through pending'
          : penaltyKind === 'stop-go-10'
            ? '10s stop-go pending'
            : `Causing a collision +${penaltySeconds}s`,
    }
  })

  const cars = frameCars.map((car, index) => {
    const driver = drivers.get(car.driverId)
    const team = teams.get(car.teamId)

    if (!driver || !team) {
      return car
    }

    const requestedPaceMode = manualPaceModes?.get(car.driverId)

    // --- Non-running states -------------------------------------------------
    if (car.status === 'retired') {
      if (
        !car.hiddenFromTrack &&
        car.retiredAtSeconds !== null &&
        elapsedSeconds >= car.retiredAtSeconds + WRECK_CLEAR_SECONDS
      ) {
        return { ...car, hiddenFromTrack: true }
      }
      return car
    }

    if (
      car.status === 'finished' ||
      car.status === 'disqualified' ||
      car.status === 'dns'
    ) {
      return car
    }

    if (car.status === 'pit') {
      if (car.pitUntilSeconds !== null && elapsedSeconds >= car.pitUntilSeconds) {
        if (isTimedSession) {
          const releaseAtSeconds = Math.max(
            car.pitUntilSeconds,
            timedPitExitAvailableAt,
          )

          if (releaseAtSeconds > elapsedSeconds + 0.001) {
            timedPitExitAvailableAt = releaseAtSeconds + 1.35
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

          timedPitExitAvailableAt = elapsedSeconds + 1.35
        }

        const servesProceduralPenalty =
          car.pitServiceKind === 'drive-through' ||
          car.pitServiceKind === 'stop-go'
        const newTire = car.pendingTire ?? car.tire
        const compoundsUsed = car.compoundsUsed.includes(newTire)
          ? car.compoundsUsed
          : [...car.compoundsUsed, newTire]
        const pitExitProgress = config.track.pitLane?.exitProgress ?? 0.13
        const currentLap = Math.floor(car.totalDistance)
        const sameLapExitDistance = currentLap + pitExitProgress
        const totalDistance =
          sameLapExitDistance >= car.totalDistance
            ? sameLapExitDistance
            : sameLapExitDistance + 1
        const lap = Math.floor(totalDistance)

        return {
          ...car,
          status: 'running' as const,
          totalDistance,
          lap,
          progress: clamp01(totalDistance - lap),
          tire: newTire,
          tireAgeLaps: servesProceduralPenalty ? car.tireAgeLaps : 0,
          pendingTire: null,
          pitServiceKind: null,
          pitExitQueueSeconds: 0,
          pitStartedAtSeconds: null,
          pitUntilSeconds: null,
          pitExitUntilSeconds: elapsedSeconds + PIT_EXIT_VISUAL_SECONDS,
          pitPhase: 'exit' as const,
          pitLaneProgress: pitExitProgress,
          timedRunStartedAtSeconds: isTimedLapSession(weekendStage)
            ? elapsedSeconds
            : car.timedRunStartedAtSeconds,
          timedRunPhase: isTimedLapSession(weekendStage)
            ? 'out-lap'
            : car.timedRunPhase,
          lapStartedAtSeconds: isTimedSession ? null : elapsedSeconds,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          compoundsUsed,
          damage: servesProceduralPenalty ? car.damage : 0,
          activeAeroMode: 'corner' as const,
          overtakeStatus: 'disabled' as const,
          overtakeEligibility: null,
          ersMode: 'harvest' as const,
          ersPowerKw: 0,
          ersBatteryPercent: Math.min(100, car.ersBatteryPercent + 10),
          speedKph: 80,
          throttlePercent: 18,
          brakePercent: 0,
          rpm: 5200,
          gear: 1,
          tireTemperatureC: Math.max(62, car.tireTemperatureC - 5),
          tireWearPercent: servesProceduralPenalty ? car.tireWearPercent : 0,
          brakeTemperatureC: Math.max(380, car.brakeTemperatureC - 120),
        }
      }

      const pitSpeedLimit = config.track.pitLane?.speedLimitKph ?? 80
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
      const pitPhase =
        car.pitStartedAtSeconds === null
          ? ('box' as const)
          : pitFraction < 0.24
            ? ('lane' as const)
            : pitFraction < 0.72
              ? ('box' as const)
              : ('exit' as const)
      const pitLaneProgress =
        pitPhase === 'lane'
          ? progressBetween(pitEntry, pitBox, pitFraction / 0.24)
          : pitPhase === 'box'
            ? pitBox
            : progressBetween(pitBox, pitExit, (pitFraction - 0.72) / 0.28)

      return {
        ...car,
        pitPhase,
        pitLaneProgress,
        speedKph: pitPhase === 'box' ? 0 : pitSpeedLimit,
        throttlePercent: 12,
        brakePercent: 0,
        rpm: 4600,
        gear: 1,
        activeAeroMode: 'corner' as const,
        overtakeStatus: 'disabled' as const,
        overtakeEligibility: null,
        ersMode: 'harvest' as const,
        ersPowerKw: 0,
        ersBatteryPercent: Math.min(
          100,
          car.ersBatteryPercent + deltaSeconds * 0.6,
        ),
        tireTemperatureC: Math.max(58, car.tireTemperatureC - deltaSeconds * 0.7),
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
    const baseLocalTrackGrip = trackGripForSector(
      config.seed,
      config.track,
      elapsedSeconds,
      carSector,
    )
    const localTrackGrip = gripForSurfaceWater(
      baseLocalTrackGrip,
      trackWater.surfaceWaterMmBySector[carSector],
      trackWater.dryingLineBySector[carSector],
    )
    const controlPhase = phase ?? restartControlPhase
    const paceMultiplier = flagPaceMultiplier(controlPhase, carSector, {
      isLeader: car.position === 1,
      gapToAheadSeconds: car.gapToAhead,
    })
    const lapTime = projectedLapTime(
      driver,
      team,
      car,
      config,
      elapsedSeconds,
      raceLaps,
      controlPhase,
      restartUntilSeconds,
      localWeather,
      localTrackGrip,
    )
    const timedRun = timedRunPaceFor({
      car,
      stage: weekendStage,
    })
    const baselineEffectiveLapTime = Math.max(
      40,
      (lapTime +
        localTrackPaceDelta(config, driver, team, car.progress) +
        lineDeviationPenaltySeconds(
          config.track,
          car.progress,
          car.trackLateralOffset,
          car.battlePhase,
        )) *
        timedRun.paceFactor,
    )
    const raceControlOvertakeAvailable =
      !isRaceDistance ||
      (overtakeEnabled && restartProcedure === 'none')
    const { performanceDeltaSeconds, ...telemetry } = calculateCarTelemetry({
      car,
      deltaSeconds,
      driver,
      elapsedSeconds,
      paceScale: config.track.baseLapTime / baselineEffectiveLapTime,
      phase: controlPhase,
      raceControlOvertakeEnabled: raceControlOvertakeAvailable,
      raceLap: Math.max(1, Math.min(raceLaps, Math.floor(car.totalDistance))),
      sessionType: isRaceDistance ? 'race-distance' : 'limited-time',
      track: config.track,
      trackGrip: localTrackGrip,
      weather: localWeather,
    })
    const displayTelemetry = telemetryForTimedRunPhase(
      telemetry,
      timedRun.phase,
    )
    const racePaceMode = requestedPaceMode ?? car.racePaceMode
    const modeWearMultiplier: Record<RacePaceMode, number> = {
      defend: 1.11,
      push: 1.28,
      save: 0.68,
      standard: 1,
    }
    const modeBrakeMultiplier: Record<RacePaceMode, number> = {
      defend: 1.08,
      push: 1.16,
      save: 0.78,
      standard: 1,
    }
    const effectiveLapTime = Math.max(
      40,
      baselineEffectiveLapTime + performanceDeltaSeconds,
    )

    let totalDistance =
      car.totalDistance +
      progressForProfileSpeed(
        config.track,
        car.progress,
        displayTelemetry.speedKph,
        deltaSeconds,
      ) *
        paceMultiplier
    const battleDeltaStep =
      Math.sign(car.battleDeltaSecondsRemaining) *
      Math.min(
        Math.abs(car.battleDeltaSecondsRemaining),
        deltaSeconds * 0.95,
      )
    totalDistance += battleDeltaStep / baseLapTime
    const battleDeltaSecondsRemaining =
      car.battleDeltaSecondsRemaining - battleDeltaStep
    const leaderDistance = snapshot.cars[0]?.totalDistance ?? car.totalDistance
    const mayUnlap =
      phase?.flag === 'sc' &&
      elapsedSeconds >=
        (phase.lappedCarsMayOvertakeAtSeconds ??
          phase.startSeconds + (phase.endSeconds - phase.startSeconds) * 0.55) &&
      !car.hasUnlappedUnderSafetyCar &&
      leaderDistance - car.totalDistance >= 0.8

    if (mayUnlap) {
      totalDistance +=
        progressForProfileSpeed(
          config.track,
          car.progress,
          displayTelemetry.speedKph,
          deltaSeconds,
        ) *
        0.48
    }

    const carBehind = snapshot.cars[index + 1]
    const attacking =
      car.position > 1 &&
      car.gapToAhead > 0 &&
      car.gapToAhead < 0.72 &&
      !controlPhase
    const defending =
      carBehind?.status === 'running' &&
      carBehind.gapToAhead > 0 &&
      carBehind.gapToAhead < 0.72 &&
      !controlPhase
    const sideBySide = attacking && car.gapToAhead < 0.34
    const hasCommittedBattleWindow =
      car.battlePhaseUntilSeconds !== null &&
      car.battlePhaseUntilSeconds > elapsedSeconds &&
      (car.battlePhase === 'attacking' ||
        car.battlePhase === 'defending' ||
        car.battlePhase === 'side-by-side')
    const activeBattlePhase =
      controlPhase
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
        ? snapshot.cars[index - 1]?.driverId ?? null
        : activeBattlePhase === 'defending'
          ? carBehind?.driverId ?? null
          : activeBattlePhase === 'single-file'
            ? null
            : car.battleOpponentId
    const battlePhaseUntilSeconds =
      car.battlePhaseUntilSeconds !== null &&
      car.battlePhaseUntilSeconds > elapsedSeconds
        ? car.battlePhaseUntilSeconds
        : null
    const turnDirection = trackDynamicsAt(
      config.track,
      car.progress,
    ).turnDirection
    const lineAttackerId =
      activeBattlePhase === 'attacking' ||
      activeBattlePhase === 'side-by-side'
        ? car.driverId
        : carBehind?.driverId ?? car.driverId
    const lineDefenderId =
      activeBattlePhase === 'attacking' ||
      activeBattlePhase === 'side-by-side'
        ? snapshot.cars[index - 1]?.driverId ?? car.driverId
        : car.driverId
    const randomPassingSide =
      hashChance(
        `${config.seed}:battle-line:${lineAttackerId}:${lineDefenderId}`,
      ) < 0.5
        ? -1
        : 1
    const insideSide = turnDirection === 0 ? randomPassingSide : -turnDirection
    const passingSide =
      turnDirection !== 0 &&
      hashChance(
        `${config.seed}:inside-line:${lineAttackerId}:${lineDefenderId}`,
      ) < 0.72
        ? insideSide
        : -insideSide
    const blueFlag =
      isRaceDistance &&
      !controlPhase &&
      car.position > 1 &&
      leaderDistance - car.totalDistance >= 0.95
    const committedLineChange =
      hasCommittedBattleWindow &&
      (activeBattlePhase === 'attacking' ||
        activeBattlePhase === 'defending' ||
        activeBattlePhase === 'side-by-side')
    const targetLateralOffset =
      committedLineChange &&
      (activeBattlePhase === 'attacking' || activeBattlePhase === 'side-by-side')
      ? passingSide * Math.min(1.05, config.track.width * 0.28)
      : committedLineChange && activeBattlePhase === 'defending'
        ? -passingSide * Math.min(0.46, config.track.width * 0.13)
        : blueFlag
          ? randomPassingSide * Math.min(0.26, config.track.width * 0.08)
        : 0
    const lateralBlend = Math.min(
      1,
      deltaSeconds *
        (committedLineChange
          ? 4.2
          : 2.6),
    )
    const trackLateralOffset =
      car.trackLateralOffset + (targetLateralOffset - car.trackLateralOffset) * lateralBlend
    const wearPerLap =
      car.tire === 'S'
        ? 0.075
        : car.tire === 'M'
          ? 0.048
          : car.tire === 'H'
            ? 0.032
            : car.tire === 'I'
              ? 0.045
              : 0.035
    const tireWearPercent = Math.min(
      100,
      car.tireWearPercent +
        (deltaSeconds / Math.max(40, effectiveLapTime)) * 100 *
          wearPerLap *
          modeWearMultiplier[racePaceMode] *
          (localWeather === 'heavy-rain' && car.tire !== 'W' ? 1.6 : 1),
    )
    const brakeTemperatureTargetC = Math.min(
      1180,
      335 +
        displayTelemetry.brakePercent * 9.3 * modeBrakeMultiplier[racePaceMode] +
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
    const brakeFadeSeconds = Math.min(
      0.025,
      Math.max(0, brakeTemperatureC - 980) * 0.00015,
    )

    // No overtaking in the SC/VSC queue: hold a minimum spacing behind the
    // car ahead (ignoring cars in the pit lane or already finished).
    if (
      controlPhase &&
      (controlPhase.flag === 'sc' || controlPhase.flag === 'vsc') &&
      aheadTotal !== null &&
      !mayUnlap
    ) {
      const spacing = QUEUE_MIN_GAP_SECONDS / baseLapTime
      totalDistance = Math.min(
        totalDistance,
        Math.max(car.totalDistance, aheadTotal - spacing),
      )
    }

    totalDistance = Math.max(
      car.totalDistance,
      totalDistance - brakeFadeSeconds / baseLapTime,
    )
    const overtakeEligibility = isRaceDistance
      ? updateOvertakeEligibilityAfterTravel({
          car,
          nextTotalDistance: totalDistance,
          phase: controlPhase,
          previousTotalDistance: car.totalDistance,
          raceControlEnabled: raceControlOvertakeAvailable,
          track: config.track,
          trackGrip: localTrackGrip,
        })
      : null
    const distanceDelta = Math.max(0, totalDistance - car.totalDistance)
    const components = advanceComponentWear({
      components: car.components,
      deltaLaps: distanceDelta,
      engineStress:
        displayTelemetry.throttlePercent / 100 +
        (displayTelemetry.ersMode === 'deploy' ? 0.24 : 0),
      team,
    })
    const referenceSpeed = trackDynamicsAt(config.track, car.progress).referenceSpeedKph
    const allowedVscSpeed = Math.min(185, referenceSpeed * 0.68)
    const vscDeltaSeconds =
      phase?.flag === 'vsc'
        ? Math.max(
            -2,
            Math.min(
              5,
              car.vscDeltaSeconds +
                ((allowedVscSpeed - displayTelemetry.speedKph * paceMultiplier) /
                  Math.max(80, allowedVscSpeed)) *
                  deltaSeconds,
            ),
          )
        : 0
    const hasUnlappedUnderSafetyCar =
      phase?.flag === 'sc' &&
      (car.hasUnlappedUnderSafetyCar ||
        (mayUnlap && totalDistance >= leaderDistance - 0.08))

    if (hasUnlappedUnderSafetyCar && !car.hasUnlappedUnderSafetyCar) {
      newEvents.push(
        makeEvent(
          `unlapped-${car.driverId}-${phase?.id ?? 'sc'}`,
          'flag',
          elapsedSeconds,
          `${car.code} has rejoined the lead-lap Safety Car queue.`,
        ),
      )
    }

    const currentLapSectorTimes = measuredSectorTimesAfterTravel({
      current: car.currentLapSectorTimes,
      deltaSeconds,
      frameStartSeconds: snapshot.elapsedSeconds,
      lapStartedAtSeconds: car.lapStartedAtSeconds,
      nextTotalDistance: totalDistance,
      previousTotalDistance: car.totalDistance,
      sectorMarks: config.track.sectorMarks,
    })
    let next: CarSnapshot = {
      ...car,
      totalDistance,
      currentLapSectorTimes,
      trackLateralOffset,
      battlePhase: activeBattlePhase,
      battleOpponentId,
      battlePhaseUntilSeconds,
      battleDeltaSecondsRemaining,
      ...displayTelemetry,
      overtakeEligibility,
      timedRunPhase: timedRun.phase,
      racePaceMode,
      tireWearPercent,
      brakeTemperatureC,
      brakeOverheatSeconds,
      blueFlag,
      warningLightsUntilSeconds:
        car.warningLightsUntilSeconds !== null &&
        elapsedSeconds >= car.warningLightsUntilSeconds
          ? null
          : car.warningLightsUntilSeconds,
      components,
      hasUnlappedUnderSafetyCar,
      pitPhase:
        car.pitExitUntilSeconds !== null &&
        elapsedSeconds < car.pitExitUntilSeconds
          ? 'exit'
          : 'none',
      pitLaneProgress:
        car.pitExitUntilSeconds !== null &&
        elapsedSeconds < car.pitExitUntilSeconds
          ? (car.pitLaneProgress ?? config.track.pitLane?.exitProgress ?? 0.13)
          : null,
      vscDeltaSeconds,
    }

    // Evaluate close racing at most once per twelfth of a lap. This keeps the
    // model cheap while allowing moves to happen where cars meet, instead of
    // only when the attacker crosses the timing line.
    const battleSegment = Math.floor(next.totalDistance * 12)

    if (isRaceDistance && battleSegment > car.processedBattleSegment) {
      next = { ...next, processedBattleSegment: battleSegment }

      if (!controlPhase && !frame.proposedPhase) {
        const defenderCar = index > 0 ? snapshot.cars[index - 1] : null
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
            gapToAheadSeconds: car.gapToAhead,
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

            if (battle.kind === 'contact' || battle.kind === 'crash') {
              newEvents.push(
                makeEvent(
                  `investigation-contact-${driver.id}-${defender.id}-${battleSegment}`,
                  'investigation',
                  elapsedSeconds,
                  `Stewards investigating contact between ${driver.code} and ${defender.code}.`,
                ),
              )
              next = {
                ...next,
                stewardStatus: 'investigating',
                stewardNote: `Contact with ${defender.code} under review`,
              }
            }

            if (battle.attackerTimeGainSeconds > 0) {
              next = {
                ...next,
                battleDeltaSecondsRemaining:
                  next.battleDeltaSecondsRemaining +
                  battle.attackerTimeGainSeconds,
                battlePhase:
                  battle.kind === 'pass' ? 'side-by-side' : next.battlePhase,
                battleOpponentId: defender.id,
                battlePhaseUntilSeconds: elapsedSeconds + 1.6,
              }
            }

            if (
              battle.attackerTimeLossSeconds > 0 ||
              battle.attackerDamageDelta > 0
            ) {
              next = {
                ...next,
                battleDeltaSecondsRemaining:
                  next.battleDeltaSecondsRemaining -
                  battle.attackerTimeLossSeconds,
                battlePhase:
                  battle.kind === 'defended' ? 'attacking' : 'resolved',
                battleOpponentId: defender.id,
                battlePhaseUntilSeconds: elapsedSeconds + 1.6,
                damage: Math.min(1, next.damage + battle.attackerDamageDelta),
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
              })
            }

            if (battle.flagResponse) {
              frame.proposedPhase = {
                id: `battle-phase-${driver.id}-${defender.id}-${battleSegment}`,
                flag: battle.flagResponse,
                sector: battle.sector,
                startSeconds: elapsedSeconds,
                endSeconds: elapsedSeconds + battle.flagDurationSeconds,
                lappedCarsMayOvertakeAtSeconds:
                  battle.flagResponse === 'sc'
                    ? elapsedSeconds + battle.flagDurationSeconds * 0.55
                    : null,
                startMessage: flagDeployMessages[battle.flagResponse](battle.sector),
                endMessage: phaseEndMessages[battle.flagResponse],
              }
            }

            if (battle.attackerRetires) {
              next = {
                ...next,
                status: 'retired',
                activeAeroMode: 'corner',
                overtakeStatus: 'disabled',
                overtakeEligibility: null,
                ersPowerKw: 0,
                blueFlag: false,
                pitPhase: 'none',
                pitLaneProgress: null,
                retiredAtSeconds: elapsedSeconds,
                retiredReason: 'contact',
              }
            }
          }
        }
      }
    }

    const newLap = Math.floor(next.totalDistance)
    // Only process laps this car has never crossed before: an incident
    // time-loss can drop the car back across a boundary it already crossed,
    // and re-rolling that lap would deterministically repeat the same
    // incident forever.
    const startLap = Math.max(Math.floor(car.totalDistance), car.processedLap)

    // --- Lap-crossing decisions ----------------------------------------------
    for (let lap = startLap + 1; lap <= newLap && next.status === 'running'; lap += 1) {
      next = {
        ...next,
        processedLap: lap,
        overtakeEnergyRemainingMj: OVERTAKE_EXTRA_ENERGY_MJ,
        energyHarvestedThisLapMj: 0,
      }
      const frameDistance = Math.max(
        0.000001,
        next.totalDistance - car.totalDistance,
      )
      const crossingFraction = Math.min(
        1,
        Math.max(0, (lap - car.totalDistance) / frameDistance),
      )
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
          const completedRun = next.timedRunsCompleted + 1
          const segmentKey =
            timedSessionState.segment?.name ??
            snapshot.timedSegmentLabel ??
            weekendStageLabelFor(weekendStage)
          const rawLapTime = Math.max(
            1,
            crossedAtSeconds - next.lapStartedAtSeconds!,
          )
          const closestSlowerCar = snapshot.cars
            .filter((candidate) => {
              const distanceAhead = candidate.totalDistance - car.totalDistance

              return (
                candidate.driverId !== car.driverId &&
                candidate.status === 'running' &&
                distanceAhead > 0 &&
                distanceAhead < 0.035 &&
                candidate.timedRunPhase !== 'attack-lap'
              )
            })
            .sort(
              (left, right) =>
                left.totalDistance - right.totalDistance,
            )[0]
          const causedYellow =
            hashChance(
              `${config.seed}:timed-yellow:${segmentKey}:${driver.id}:${completedRun}`,
            ) <
            0.01 + (1 - driver.consistency) * 0.012
          const activeDoubleYellow =
            timedYellowUntilSeconds !== null &&
            next.lapStartedAtSeconds! < timedYellowUntilSeconds &&
            crossedAtSeconds >= timedYellowUntilSeconds - 12
          const trackLimitDeleted =
            hashChance(
              `${config.seed}:timed-track-limit:${segmentKey}:${driver.id}:${completedRun}`,
            ) <
            0.018 + (1 - driver.consistency) * 0.09
          const invalidReason = causedYellow
            ? 'Caused double yellow'
            : activeDoubleYellow
              ? `Double yellow S${(timedYellowSector ?? 0) + 1}`
              : trackLimitDeleted
                ? `Track limits T${
                    config.track.corners?.[
                      Math.floor(
                        hashChance(
                          `${config.seed}:deleted-corner:${segmentKey}:${driver.id}:${completedRun}`,
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
            timedYellowSector = Math.floor(
              hashChance(
                `${config.seed}:timed-yellow-sector:${segmentKey}:${driver.id}:${completedRun}`,
              ) * 3,
            )
            newEvents.push(
              makeEvent(
                `timed-yellow-${driver.id}-${segmentKey}-${completedRun}`,
                'flag',
                crossedAtSeconds,
                `DOUBLE YELLOW in sector ${timedYellowSector + 1}; ${driver.code} is off line.`,
              ),
            )
          }

          if (invalidReason) {
            newEvents.push(
              makeEvent(
                `lap-deleted-${driver.id}-${segmentKey}-${completedRun}`,
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
                `impeding-${closestSlowerCar.driverId}-${driver.id}-${segmentKey}-${completedRun}`,
                'investigation',
                crossedAtSeconds,
                `${closestSlowerCar.code} investigated for impeding ${driver.code} in ${segmentKey}.`,
              ),
            )
          }

          next = {
            ...next,
            lastLapTimeSeconds: recordedLapTime,
            bestLapTimeSeconds: isPersonalBest
              ? recordedLapTime
              : next.bestLapTimeSeconds,
            bestLapLap: isPersonalBest ? completedRun : next.bestLapLap,
            lapStartedAtSeconds: crossedAtSeconds,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            lapHistory: [
              ...next.lapHistory,
              {
                lap: completedRun,
                lapTimeSeconds: recordedLapTime,
                sectors: completedMeasuredSectors(
                  next.currentLapSectorTimes,
                  recordedLapTime,
                  config.track.sectorMarks,
                ),
                tire: next.tire,
                tireAgeLaps: next.tireAgeLaps + 1,
                weather: localWeather,
                trackGrip: localTrackGrip,
                position: next.position,
                pitStop: false,
                isValid: lapIsValid,
                invalidReason,
              },
            ],
            tireAgeLaps: next.tireAgeLaps + 1,
            timedRunsCompleted: completedRun,
            timedRunPhase: 'in-lap',
            deletedLapCount:
              next.deletedLapCount + (lapIsValid ? 0 : 1),
            timedSegmentBestSeconds: {
              ...next.timedSegmentBestSeconds,
              [segmentKey]: isSegmentBest
                ? recordedLapTime
                : previousSegmentBest,
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
          const releaseAtSeconds =
            crossedAtSeconds +
            28 +
            hashChance(
              `${config.seed}:next-run:${weekendStage}:${activeSegment?.name ?? 'practice'}:${driver.id}:${nextRunIndex}`,
            ) *
              58
          const hasTimeForAnotherRun =
            participantIds.has(driver.id) &&
            nextRunIndex < runLimit &&
            releaseAtSeconds + baseLapTime * 2.55 < activeWindowEndsAt
          const plannedCompound = timedRunCompound(
            weekendStage,
            nextRunIndex,
            activeSegment?.compound ?? null,
            localWeather,
            localTrackGrip,
          )
          const useFreshSet =
            hasTimeForAnotherRun &&
            shouldUseFreshTimedSet(
              weekendStage,
              activeSegment?.name ?? null,
              next.timedRunsCompleted,
            ) &&
            (next.tireSetsRemaining[plannedCompound] ?? 0) > 0
          const nextCompound = useFreshSet ? plannedCompound : next.tire
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
            activeAeroMode: 'corner',
            overtakeStatus: 'disabled',
            overtakeEligibility: null,
            ersMode: 'harvest',
            ersPowerKw: 0,
            pitPhase: 'box',
            pitLaneProgress: pitBox,
            pitStartedAtSeconds: null,
            pitUntilSeconds: hasTimeForAnotherRun ? releaseAtSeconds : null,
            pitExitUntilSeconds: null,
            pendingTire: hasTimeForAnotherRun ? nextCompound : null,
            tireSetsRemaining: useFreshSet
              ? {
                  ...next.tireSetsRemaining,
                  [nextCompound]: Math.max(
                    0,
                    (next.tireSetsRemaining[nextCompound] ?? 0) - 1,
                  ),
                }
              : next.tireSetsRemaining,
            lapStartedAtSeconds: null,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            timedRunStartedAtSeconds: null,
            timedRunPhase: 'garage',
          }
          break
        } else if (next.lapStartedAtSeconds === null) {
          next = {
            ...next,
            lapStartedAtSeconds: crossedAtSeconds,
            currentLapSectorTimes: emptyCurrentLapSectorTimes(),
            timedRunPhase: 'attack-lap',
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

        next = {
          ...next,
          lastLapTimeSeconds: recordedLapTime,
          bestLapTimeSeconds: isPersonalBest
            ? recordedLapTime
            : next.bestLapTimeSeconds,
          bestLapLap: isPersonalBest ? completedLap : next.bestLapLap,
          lapStartedAtSeconds: crossedAtSeconds,
          currentLapSectorTimes: emptyCurrentLapSectorTimes(),
          lapHistory: [
            ...next.lapHistory,
            {
              lap: completedLap,
              lapTimeSeconds: recordedLapTime,
              sectors: completedMeasuredSectors(
                next.currentLapSectorTimes,
                recordedLapTime,
                config.track.sectorMarks,
              ),
              tire: next.tire,
              tireAgeLaps: next.tireAgeLaps + 1,
              weather: localWeather,
              trackGrip: localTrackGrip,
              position: next.position,
              pitStop: false,
              isValid: true,
              invalidReason: null,
            },
          ],
          tireAgeLaps: next.tireAgeLaps + 1,
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

        const tireRuleViolation =
          weekendStage === 'race' && !compliesWithGrandPrixTireRule(next)

        if (tireRuleViolation) {
          next = {
            ...next,
            status: 'disqualified',
            finishedAtSeconds,
            stewardStatus: 'penalty',
            stewardNote: 'Mandatory dry-tyre rule',
          }
          newEvents.push(
            makeEvent(
              `tire-rule-dsq-${driver.id}`,
              'penalty',
              elapsedSeconds,
              `${driver.code} is disqualified for failing to use two dry tyre specifications.`,
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
        const incident = incidentForLap(config.seed, driver, team, lap, riskMultiplier)

        if (incident) {
          newEvents.push(
            makeEvent(
              `incident-${driver.id}-${lap}`,
              'incident',
              elapsedSeconds,
              incident.message,
            ),
          )

          if (incident.flagResponse) {
            const candidate: ActiveFlagPhase = {
              id: `phase-${driver.id}-${lap}`,
              flag: incident.flagResponse,
              sector: incident.sector,
              startSeconds: elapsedSeconds,
              endSeconds: elapsedSeconds + incident.flagDurationSeconds,
              lappedCarsMayOvertakeAtSeconds:
                incident.flagResponse === 'sc'
                  ? elapsedSeconds + incident.flagDurationSeconds * 0.55
                  : null,
              startMessage: flagDeployMessages[incident.flagResponse](incident.sector),
              endMessage: phaseEndMessages[incident.flagResponse],
            }

            // No active phase here (incidents only roll under green), so the
            // candidate only competes with other incidents from this frame.
            if (
              flagSeverityRank(candidate.flag) >
              flagSeverityRank(frame.proposedPhase?.flag ?? null)
            ) {
              frame.proposedPhase = candidate
            }
          }

          if (incident.retirement) {
            next = {
              ...next,
              status: 'retired',
              activeAeroMode: 'corner',
              overtakeStatus: 'disabled',
              overtakeEligibility: null,
              ersPowerKw: 0,
              blueFlag: false,
              pitPhase: 'none',
              pitLaneProgress: null,
              retiredAtSeconds: elapsedSeconds,
              retiredReason: incident.kind,
            }
            break
          }

          next = {
            ...next,
            totalDistance: next.totalDistance - incident.timeLossSeconds / baseLapTime,
            damage: Math.min(1, next.damage + incident.damageDelta),
          }
        }
      }

      const [weakestName, weakest] = weakestComponent(next.components)

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
        weakest.conditionPercent < 14 &&
        hashChance(`${config.seed}:component:${driver.id}:${weakestName}:${lap}`) <
          (14 - weakest.conditionPercent) * 0.018
      ) {
        newEvents.push(
          makeEvent(
            `component-failure-${driver.id}-${lap}`,
            'incident',
            elapsedSeconds,
            `${driver.code} retires with a ${weakestName} failure.`,
          ),
        )
        next = {
          ...next,
          status: 'retired',
          activeAeroMode: 'corner',
          overtakeStatus: 'disabled',
          overtakeEligibility: null,
          ersPowerKw: 0,
          blueFlag: false,
          pitPhase: 'none',
          pitLaneProgress: null,
          retiredAtSeconds: elapsedSeconds,
          retiredReason: `${weakestName} failure`,
        }
        break
      }

      // Track limits.
      if (
        isRaceDistance &&
        lapHasTrackLimitWarning(config.seed, driver.id, driver.consistency, lap)
      ) {
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
              : `Track limits: lap deleted warning for ${driver.code} (${warnings}).`,
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
      }

      if (
        phase?.flag === 'vsc' &&
        next.vscDeltaSeconds < -0.25 &&
        !next.penalties.some((penalty) => penalty.reason === 'VSC delta')
      ) {
        newEvents.push(
          makeEvent(
            `vsc-delta-${driver.id}-${lap}`,
            'penalty',
            elapsedSeconds,
            `${driver.code} exceeds the VSC delta and receives a +5s penalty.`,
          ),
        )
        next = {
          ...next,
          penaltySeconds: next.penaltySeconds + 5,
          penalties: [
            ...next.penalties,
            makePenalty(
              `vsc-delta-${driver.id}-${lap}`,
              'time-5',
              'VSC delta',
              elapsedSeconds,
              5,
            ),
          ],
          stewardStatus: 'penalty',
          stewardNote: 'VSC delta +5s',
        }
      }

      // Pit strategy.
      const requestedCompound = manualPitRequests?.get(driver.id)
      const manualCompoundAvailable =
        requestedCompound !== undefined &&
        (next.tireSetsRemaining[requestedCompound] ?? 0) > 0

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
      const modeledPitLaneLossSeconds =
        config.track.observedCalibration?.pitLaneTransitSeconds ??
        (14 +
          (80 - (config.track.pitLane?.speedLimitKph ?? 80)) * 0.1 +
          (config.track.kind === 'street' ? 2.5 : 0))
      const estimatedStopLoss = pitStopLossSeconds(
        config.seed,
        driver.id,
        team,
        next.pitStops + 1,
        next.damage > 0,
        modeledPitLaneLossSeconds,
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
      const proceduralPenalty = next.penalties.find(
        (penalty) =>
          !penalty.served &&
          (penalty.kind === 'drive-through' || penalty.kind === 'stop-go-10'),
      )

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
        !isRaceDistance || lap <= 2 || !pitLaneOpen
          ? null
          : proceduralPenalty && !controlPhase
            ? { compound: next.tire, reason: 'penalty-service' as const }
          : manualCompoundAvailable
            ? { compound: requestedCompound!, reason: 'manual' as const }
            : decidePitStop({
              seed: config.seed,
              driver,
              car: next,
              lap,
              raceLaps,
              underSafetyCar:
                controlPhase?.flag === 'sc' || controlPhase?.flag === 'vsc',
              weather: localWeather,
              trackGrip: localTrackGrip,
              forecast: weatherForecast,
              gapToAheadSeconds: next.gapToAhead,
              gapBehindSeconds: snapshot.cars[index + 1]?.gapToAhead ?? null,
              position: next.position,
              availableCompounds: next.tireSetsRemaining,
              pitLaneOpen,
              projectedRejoinPosition,
              teammateInPit,
              pitLaneOccupancy,
              tireNomination: config.track.tireNomination,
              mandatoryTwoDryCompounds: weekendStage === 'race',
            })

      if (decision) {
        teamsPittingThisFrame.add(next.teamId)

        if (decision.reason === 'manual') {
          manualPitRequests?.delete(driver.id)
        }
        const servesProceduralPenalty = decision.reason === 'penalty-service'
        const repairsDamage = !servesProceduralPenalty && next.damage > 0
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
        const loss =
          baseLoss + (servesProceduralPenalty ? 0 : servedPenalty)
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
        const releaseNoted = pitExitGapSeconds < 0.8
        const unsafeRelease = pitExitGapSeconds < 0.42
        const speedViolation =
          hashChance(`${config.seed}:pit-speed:${driver.id}:${lap}`) <
          0.003 + (1 - driver.consistency) * 0.018
        const pitOverspeedKph = speedViolation
          ? 0.3 +
            hashChance(`${config.seed}:pit-speed-value:${driver.id}:${lap}`) * 2.1
          : 0

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

        if (releaseNoted && !servesProceduralPenalty) {
          newEvents.push(
            makeEvent(
              `unsafe-release-${driver.id}-${lap}`,
              unsafeRelease ? 'penalty' : 'investigation',
              elapsedSeconds,
              unsafeRelease
                ? `${driver.code} receives a +5s penalty for an unsafe release.`
                : `${driver.code} release noted by Race Control at pit exit.`,
            ),
          )
          next = {
            ...next,
            penaltySeconds: next.penaltySeconds + (unsafeRelease ? 5 : 0),
            penalties: unsafeRelease
              ? [
                  ...next.penalties,
                  makePenalty(
                    `unsafe-release-${driver.id}-${lap}`,
                    'time-5',
                    'Unsafe release',
                    elapsedSeconds,
                    5,
                  ),
              ]
              : next.penalties,
            stewardStatus: unsafeRelease ? 'penalty' : 'investigating',
            stewardNote: unsafeRelease
              ? 'Unsafe release +5s'
              : 'Pit release under review',
          }
        }

        if (speedViolation) {
          newEvents.push(
            makeEvent(
              `pit-speed-${driver.id}-${lap}`,
              'penalty',
              elapsedSeconds,
              `${driver.code} gets a +5s penalty for pit-lane speed (+${pitOverspeedKph.toFixed(1)} km/h).`,
            ),
          )
          next = {
            ...next,
            penaltySeconds: next.penaltySeconds + 5,
            penalties: [
              ...next.penalties,
              makePenalty(
                `pit-speed-${driver.id}-${lap}`,
                'time-5',
                'Pit-lane speed',
                elapsedSeconds,
                5,
              ),
            ],
            stewardStatus: 'penalty',
            stewardNote: 'Pit-lane speed +5s',
          }
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
            : 'tire-stop',
          pitLaneProgress: config.track.pitLane?.entryProgress ?? 0.965,
          pitStartedAtSeconds: elapsedSeconds,
          pitUntilSeconds:
            elapsedSeconds + loss + (doubleStackRisk ? 2.2 : 0),
          pitExitUntilSeconds: null,
          pendingTire: servesProceduralPenalty ? null : decision.compound,
          tireSetsRemaining: servesProceduralPenalty
            ? next.tireSetsRemaining
            : {
                ...next.tireSetsRemaining,
                [decision.compound]: Math.max(
                  0,
                  (next.tireSetsRemaining[decision.compound] ?? 0) - 1,
                ),
              },
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

    if (next.status === 'running') {
      aheadTotal = next.totalDistance
    }

    return next
  })

  const carsWithBattleEffects = cars.map((car) => {
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
        pendingTire: null,
        activeAeroMode: 'corner' as const,
        overtakeStatus: 'disabled' as const,
        overtakeEligibility: null,
        ersPowerKw: 0,
        blueFlag: false,
        retiredAtSeconds: elapsedSeconds,
        retiredReason: effect.reason,
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
      battlePhase: 'defending' as const,
      battleOpponentId: effect.opponentId,
      battlePhaseUntilSeconds: elapsedSeconds + 1.6,
    }
  })
  const carsWithTimedPenalties = carsWithBattleEffects.map((car) => {
    const gridDrop = deferredTimedGridPenalties.get(car.driverId)

    if (!gridDrop) {
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

  // Activate the strongest incident flag from this frame.
  if (frame.proposedPhase) {
    phase = frame.proposedPhase
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
  const leader = rankedCars[0]
  const leaderLap = Math.max(1, Math.min(Math.floor(leader.totalDistance), raceLaps))
  const racingElapsedSeconds = Math.max(
    0,
    elapsedSeconds - (snapshot.raceStartedAtSeconds ?? elapsedSeconds),
  )
  const sessionTimeLimitSeconds =
    weekendStage === 'sprint'
      ? SPRINT_TIME_LIMIT_SECONDS
      : GRAND_PRIX_TIME_LIMIT_SECONDS
  const overallWindowSeconds =
    weekendStage === 'sprint'
      ? SPRINT_OVERALL_WINDOW_SECONDS
      : GRAND_PRIX_OVERALL_WINDOW_SECONDS
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

  if (timedSessionDone && weekendStage === 'qualifying') {
    const q1Times = rankedCars
      .map((car) => car.timedSegmentBestSeconds.Q1)
      .filter((time): time is number => typeof time === 'number')
    const q1Reference = q1Times.length > 0 ? Math.min(...q1Times) : null

    if (q1Reference !== null) {
      classifiedCars = rankCars(
        rankedCars.map((car) => {
          const q1Time = car.timedSegmentBestSeconds.Q1
          const outside107Percent =
            typeof q1Time !== 'number' || q1Time > q1Reference * 1.07
          const stewardsGrantedStart =
            outside107Percent &&
            hashChance(`${config.seed}:107-exemption:${car.driverId}`) < 0.72

          if (outside107Percent) {
            newEvents.push(
              makeEvent(
                `107-percent-${car.driverId}`,
                stewardsGrantedStart ? 'info' : 'penalty',
                elapsedSeconds,
                stewardsGrantedStart
                  ? `${car.code} is outside 107% in Q1 but receives permission to start based on practice pace.`
                  : `${car.code} is outside 107% in Q1 and has not qualified for the race.`,
              ),
            )
          }

          return {
            ...car,
            outside107Percent,
            stewardsGrantedStart,
            status:
              outside107Percent && !stewardsGrantedStart
                ? ('dns' as const)
                : car.status,
            stewardStatus:
              outside107Percent && !stewardsGrantedStart
                ? ('penalty' as const)
                : car.stewardStatus,
            stewardNote: outside107Percent
              ? stewardsGrantedStart
                ? '107% exemption granted'
                : 'Outside 107%'
              : car.stewardNote,
          }
        }),
        config,
      )
    }
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
    raceStartedAtSeconds: snapshot.raceStartedAtSeconds,
    restartProcedure,
    restartProcedureUntilSeconds,
    overtakeEnabled,
    overtakeEnableAtLeaderDistance,
    overtakeEnableTargetsByDriver,
    cars: classifiedCars,
    eventMessage: '',
    flag: timedSessionState.suspended
      ? 'red'
      : restartProcedureActive
        ? restartProcedure === 'standing'
          ? 'red'
          : 'sc'
        : (phase?.flag ?? 'clear'),
    flagLabel: timedSessionState.suspended
      ? 'RED FLAG'
      : restartProcedureActive
        ? restartProcedure === 'standing'
          ? 'SS'
          : 'RS'
        : flagLabelFor(phase),
    flagPhase: phase,
    restartUntilSeconds,
    fuelEffectSeconds: fuelEffectSeconds(
      Math.max(0, leader.totalDistance - 1),
      raceLaps,
    ) * (isRaceDistance ? 1 : 0.35),
    trackEvolutionLevel: trackEvolutionLevel(elapsedSeconds),
    weather,
    weatherLabel: weatherLabelFor(weather),
    weatherForecastLabel: weatherForecast.label,
    trackGrip,
    surfaceWaterMmBySector: trackWater.surfaceWaterMmBySector,
    dryingLineBySector: trackWater.dryingLineBySector,
    greenFlagLaps,
    raceClockSeconds,
    raceEndedEarly,
    checkeredLapTarget,
    timeLimitReachedAtSeconds,
    timedSegmentLabel,
    timedSessionSuspended: timedSessionState.suspended,
    timedParticipantDriverIds,
    timedYellowUntilSeconds,
    timedYellowSector,
    pitLaneOpen,
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
          ? phase.startMessage
          : fallbackTickerMessage(nextSnapshot)

  return {
    ...nextSnapshot,
    eventMessage,
  }
}
