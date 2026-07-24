// Timed weekend sessions: practice builds setup confidence, qualifying runs
// pit-release plans and ranks legal flying laps for the race grid.

import type {
  CarSetup,
  Driver,
  RaceConfig,
  Team,
  TimedSessionSegmentPlan,
  TireCompound,
  WeatherState,
} from '../types'
import type { SeriesRules } from '../series/types'
import {
  driverPerformanceAbility,
  driverSkillBlend,
} from './driverAbility'
import { practiceSetupRecommendation } from './engineering'
import { effectiveMachineReliability } from './machinePerformance'
import { hashChance } from './random'
import {
  buildQualifyingReleaseSchedule,
  type QualifyingReleaseSlot,
} from './qualifyingStrategy'
import { tireDeltaSeconds } from './tires'
import {
  fuelMassEffects,
  performanceLapGainSeconds,
} from './vehicleDynamics'
import {
  FREE_PRACTICE_DURATION_SECONDS,
  QUALIFYING_BREAK_SECONDS,
  QUALIFYING_SEGMENT_DURATIONS_SECONDS,
  SPRINT_QUALIFYING_SEGMENT_DURATIONS_SECONDS,
  type PracticeSessionName,
  type QualifyingSegmentName,
} from './sessionRules'
import { trackGripForWeather, weatherFor, weatherLabelFor } from './weather'

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
  compound: TireCompound
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
  runCompounds: TireCompound[]
  firstPitExitAtSeconds: number
  finalPitExitAtSeconds: number
  sessionDurationSeconds: number
  weather: WeatherState
  weatherLabel: string
}

type QualifyingRun = {
  aborted: boolean
  deleted: boolean
  compound: TireCompound
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

const clampAbility = (value: number) => Math.min(1.5, Math.max(0, value))

function wetSkill(driver: Driver): number {
  return clampAbility(
    driverPerformanceAbility(driver, 'wetSkill') * 0.78 +
      driverPerformanceAbility(driver, 'adaptability') * 0.22,
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

function segmentEvolutionFor(segment: QualifyingSegmentName) {
  switch (segment) {
    case 'Q3':
      return 0.42
    case 'Q2':
      return 0.2
    case 'SQ3':
      return 0.24
    case 'SQ2':
      return 0.12
    default:
      return 0
  }
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

function qualifyingCompoundPenalty(compound: TireCompound) {
  switch (compound) {
    case 'S':
      return 0
    case 'M':
      return 0.78
    case 'H':
      return 1.52
    case 'I':
      return 0.35
    case 'W':
      return 0.8
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
  compound: TireCompound,
  run: number,
): number {
  const performanceGain = performanceLapGainSeconds({
    driver,
    session: 'qualifying',
    team,
    track: config.track,
    weather,
  })
  const consistency = driverPerformanceAbility(driver, 'consistency')
  const awareness = driverPerformanceAbility(driver, 'raceAwareness')
  const segmentEvolution = segmentEvolutionFor(segment)
  const compoundPenalty = qualifyingCompoundPenalty(compound)
  const wetPenalty =
    weather === 'clear'
      ? 0
      : weather === 'light-rain'
        ? 4.8 + (1 - wetSkill(driver)) * 2.7 + (1 - trackGrip) * 3.3
        : 10 + (1 - wetSkill(driver)) * 4.3 + (1 - trackGrip) * 5.6
  const key = `${seed}:qualifying:${segment}:${driver.id}:${run}`
  const variance =
    (hashChance(`${key}:variance`) - 0.5) *
    (1.45 - consistency * 0.65)
  const trafficLoss =
    segment === 'Q1' &&
    hashChance(`${key}:traffic`) < 0.12 + Math.max(0, 0.84 - awareness) * 0.12
      ? 0.15 + hashChance(`${key}:traffic-loss`) * 0.8
      : 0
  const mistakeControl = driverSkillBlend(driver, {
    consistency: 0.35,
    mistakeResistance: 0.3,
    precision: 0.2,
    pressureHandling: 0.15,
  })
  const mistakeChance = 0.008 + Math.max(0, 1 - mistakeControl) * 0.12
  const mistake =
    hashChance(`${key}:mistake`) < mistakeChance
      ? 0.35 + hashChance(`${key}:mistake-loss`) * 3.8
      : 0

  return Math.max(
    55,
    config.track.baseLapTime -
      performanceGain -
      segmentEvolution +
      compoundPenalty +
      wetPenalty +
      variance +
      trafficLoss +
      mistake,
  )
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
  const compound = compoundForQualifyingSegment(
    segment,
    weather,
    config.qualifyingDryCompound,
  )
  const maxRuns = segment === 'Q3' || segment === 'SQ3' ? 2 : 3
  const awareness = driverPerformanceAbility(driver, 'raceAwareness')

  return Array.from({ length: maxRuns }, (_, run) => {
    const rawLapTimeSeconds = qualifyingRunLapTime(
      seed,
      segment,
      driver,
      team,
      config,
      weather,
      trackGrip,
      compound,
      run,
    )
    const runKey = `${seed}:run-lap:${segment}:${driver.id}:${run}`
    const trafficLossSeconds = 0
    const aborted =
      hashChance(`${runKey}:abort`) <
      0.012 + Math.max(0, 1 - awareness) * 0.035
    const deleted =
      !aborted &&
      hashChance(`${runKey}:track-limit`) <
        0.008 + Math.max(0, 1 - awareness) * 0.035
    const lapTimeSeconds = rawLapTimeSeconds + trafficLossSeconds
    const rainMultiplier = weather === 'heavy-rain' ? 1.18 : weather === 'light-rain' ? 1.08 : 1
    const outLapTimeSeconds =
      config.track.baseLapTime *
      rainMultiplier *
      (1.35 + hashChance(`${runKey}:out`) * 0.22)
    const inLapTimeSeconds =
      config.track.baseLapTime *
      rainMultiplier *
      (1.42 + hashChance(`${runKey}:in`) * 0.28)
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
      compound,
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
    compound: compoundForQualifyingSegment(
      segment,
      weather,
      config.qualifyingDryCompound,
    ),
    declaredWet: weather !== 'clear',
    endsAtSeconds: sessionDurationSeconds,
    name: segment,
    participantDriverIds: participants.map((driver) => driver.id),
    startsAtSeconds: 0,
    suspensionEndsAtSeconds: null,
    suspensionStartsAtSeconds: null,
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
    const bestRun =
      validRuns.slice().sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)[0] ??
      ({
        aborted: true,
        deleted: false,
        compound: compoundForQualifyingSegment(
          segment,
          weather,
          config.qualifyingDryCompound,
        ),
        pitExitAtSeconds: 0,
        outLapTimeSeconds: config.track.baseLapTime * 1.5,
        flyingLapStartedAtSeconds: 0,
        flyingLapCompletedAtSeconds: sessionDurationSeconds,
        inLapTimeSeconds: config.track.baseLapTime * 1.55,
        isValid: false,
        pitReturnAtSeconds: sessionDurationSeconds + config.track.baseLapTime * 1.55,
        lapTimeSeconds: config.track.baseLapTime + 40,
        trafficLossSeconds: 0,
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
        weather: first[0]?.weather ?? 'clear',
        weatherLabel: first[0]?.weatherLabel ?? 'CLEAR',
      },
      {
        name: segments[1],
        results: second,
        eliminatedDriverIds: secondEliminated.map((result) => result.driverId),
        sessionDurationSeconds: durationForSegment(segments[1]),
        suspensionSeconds: qualifyingSuspensionSeconds(config, segments[1]),
        weather: second[0]?.weather ?? 'clear',
        weatherLabel: second[0]?.weatherLabel ?? 'CLEAR',
      },
      {
        name: segments[2],
        results: third,
        eliminatedDriverIds: [],
        sessionDurationSeconds: durationForSegment(segments[2]),
        suspensionSeconds: qualifyingSuspensionSeconds(config, segments[2]),
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
  return {
    eliminatedDriverIds,
    name,
    results,
    sessionDurationSeconds: durationSeconds,
    suspensionSeconds: qualifyingSuspensionSeconds(config, name),
    weather: results[0]?.weather ?? 'clear',
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
 * knockout qualifying, F2/F3 use one timed session, and Super Formula splits
 * the opening session into independent groups before its final segment.
 */
export function runSeriesQualifying(
  baseConfig: RaceConfig,
  rules: SeriesRules,
): KnockoutQualifying {
  const config: RaceConfig = {
    ...baseConfig,
    qualifyingDryCompound:
      baseConfig.qualifyingDryCompound ?? rules.tires.qualifyingDryCompound,
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
    const adaptability = driverPerformanceAbility(driver, 'adaptability')
    const consistency = driverPerformanceAbility(driver, 'consistency')
    const wetPenalty =
      weather === 'clear'
        ? 0
        : weather === 'light-rain'
          ? 4 + (1 - wetSkill(driver)) * 2.1 + (1 - trackGrip) * 2.7
          : 9 + (1 - wetSkill(driver)) * 3.8 + (1 - trackGrip) * 4.8
    const runCount = 3 + Math.floor(hashChance(`${config.seed}:practice:${stage}:${driver.id}:runs`) * 2)
    const firstPitExitAtSeconds =
      130 + index * 4 + hashChance(`${config.seed}:practice:${stage}:${driver.id}:out1`) * 520
    const finalPitExitAtSeconds =
      2350 + hashChance(`${config.seed}:practice:${stage}:${driver.id}:out3`) * 520
    const lapsCompleted = Math.max(
      7,
      Math.min(
        29,
        Math.round(
          13 +
            reliabilityRoll * 10 +
            machineReliability * 4 +
            consistency * 3 -
            (weather === 'heavy-rain' ? 4 : weather === 'light-rain' ? 1.5 : 0),
        ),
      ),
    )
    const performanceGain = performanceLapGainSeconds({
      driver,
      session: 'race',
      team,
      track: config.track,
      weather,
    })
    const bestLapTimeSeconds =
      config.track.baseLapTime +
      1.9 -
      performanceGain +
      wetPenalty +
      (hashChance(`${config.seed}:practice:${stage}:${driver.id}:best`) - 0.5) * 1.6
    const longRunFuelDelta =
      fuelMassEffects({ fuelLoadKg: 58, track: config.track }).lapTimeDeltaSeconds -
      fuelMassEffects({ fuelLoadKg: 10, track: config.track }).lapTimeDeltaSeconds
    const longRunTireDelta = tireDeltaSeconds(
      'M',
      8,
      driverPerformanceAbility(driver, 'tireManagement'),
      weather,
      trackGrip,
      96,
      28,
      config.track.tireNomination,
    )
    const longRunPaceSeconds =
      bestLapTimeSeconds +
      longRunFuelDelta +
      longRunTireDelta +
      hashChance(`${config.seed}:practice:${stage}:${driver.id}:long`) *
        (1.25 - consistency * 0.45)
    const setupScore = Math.round(
      Math.max(
        1,
        Math.min(
          100,
          28 +
            lapsCompleted * 1.45 +
            consistency * 13 +
            adaptability * 5 +
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
    const dryRunCompounds: TireCompound[] =
      stage === 'fp1'
        ? ['H', 'M', 'M', 'S']
        : stage === 'fp2'
          ? ['M', 'S', 'M', 'S']
          : ['S', 'S', 'M', 'S']
    const runCompounds = Array.from({ length: runCount }, (_, runIndex) =>
      weather === 'heavy-rain'
        ? ('W' as const)
        : weather === 'light-rain'
          ? ('I' as const)
          : dryRunCompounds[runIndex % dryRunCompounds.length],
    )

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
      runCompounds,
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
