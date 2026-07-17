import type {
  Driver,
  QualifyingReleaseStrategy,
  RaceConfig,
  Team,
  TimedSessionSegmentPlan,
  WeekendStage,
} from '../types'
import { driverPerformanceAbility } from './driverAbility'
import { effectiveMachineRating } from './machinePerformance'
import { hashChance } from './random'
import { weatherForecastFor } from './weather'

export type QualifyingReleaseSlot = {
  driverId: string
  expectedFlyingStartAtSeconds: number
  pitExitAtSeconds: number
  strategy: QualifyingReleaseStrategy
  targetTrafficGapSeconds: number
}

type QualifyingReleaseScheduleOptions = {
  config: RaceConfig
  participantDriverIds: string[]
  runIndex: number
  segment: TimedSessionSegmentPlan
  stage: Extract<WeekendStage, 'qualifying' | 'sprintQualifying'>
}

type ReleaseCandidate = {
  driver: Driver
  orderScore: number
  team: Team
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function qualifyingRunLimit(segmentName: string) {
  return segmentName === 'Q3' || segmentName === 'SQ3' ? 2 : 3
}

function orderWithoutTeammateStacking(candidates: ReleaseCandidate[]) {
  const sorted = candidates.slice().sort((left, right) =>
    left.orderScore === right.orderScore
      ? left.driver.id.localeCompare(right.driver.id)
      : left.orderScore - right.orderScore,
  )
  const queuesByTeam = new Map<string, ReleaseCandidate[]>()

  for (const candidate of sorted) {
    const queue = queuesByTeam.get(candidate.team.id) ?? []

    queue.push(candidate)
    queuesByTeam.set(candidate.team.id, queue)
  }

  const ordered: ReleaseCandidate[] = []

  while (ordered.length < candidates.length) {
    const previousTeamId = ordered.at(-1)?.team.id
    const nonEmptyTeams = [...queuesByTeam.entries()].filter(
      ([, queue]) => queue.length > 0,
    )
    const alternativeTeams = nonEmptyTeams.filter(
      ([teamId]) => teamId !== previousTeamId,
    )
    const candidateTeams =
      alternativeTeams.length > 0 ? alternativeTeams : nonEmptyTeams
    candidateTeams.sort((left, right) =>
      right[1].length === left[1].length
        ? left[1][0].orderScore - right[1][0].orderScore
        : right[1].length - left[1].length,
    )
    const selected = candidateTeams[0]?.[1].shift()

    if (!selected) {
      break
    }

    ordered.push(selected)
  }

  return ordered
}

/**
 * Creates one deterministic FIA-style pit release wave for a qualifying run.
 * Teams trade an early banker against later track evolution while a shared
 * slot allocator keeps the expected flying laps out of the same traffic gap.
 */
export function buildQualifyingReleaseSchedule({
  config,
  participantDriverIds,
  runIndex,
  segment,
  stage,
}: QualifyingReleaseScheduleOptions): QualifyingReleaseSlot[] {
  const participants = new Set(participantDriverIds)
  const teams = new Map(config.teams.map((team) => [team.id, team]))
  const runLimit = qualifyingRunLimit(segment.name)
  const finalRun = runIndex >= runLimit - 1
  const durationSeconds = segment.endsAtSeconds - segment.startsAtSeconds
  const outLapSeconds =
    config.track.baseLapTime * (segment.declaredWet ? 1.9 : 1.6)
  const targetTrafficGapSeconds = clamp(
    (config.track.kind === 'street' ? 2.8 : 2.35) +
      participantDriverIds.length * 0.012,
    2.35,
    3.25,
  )
  const latestPitExitAtSeconds = Math.max(
    segment.startsAtSeconds + 12,
    segment.endsAtSeconds - outLapSeconds - 2,
  )
  const forecast = weatherForecastFor(
    `${config.seed}:qualifying-release`,
    config.track,
    segment.startsAtSeconds,
  )
  const rainThreat =
    Boolean(segment.declaredWet) ||
    (forecast.willChange &&
      forecast.weather !== 'clear' &&
      forecast.secondsAhead <= durationSeconds)
  const strategy: QualifyingReleaseStrategy = rainThreat
    ? 'weather-priority'
    : runIndex === 0
      ? 'bank-lap'
      : finalRun
        ? 'track-evolution'
        : 'traffic-gap'
  const candidates = config.drivers
    .filter((driver) => participants.has(driver.id))
    .map<ReleaseCandidate>((driver) => {
      const team = teams.get(driver.teamId)

      if (!team) {
        throw new Error(`Missing team for qualifying release driver ${driver.id}`)
      }

      const driverConfidence =
        driverPerformanceAbility(driver, 'qualifyingPace') * 0.42 +
        driverPerformanceAbility(driver, 'pressureHandling') * 0.2 +
        driverPerformanceAbility(driver, 'trafficManagement') * 0.23 +
        driverPerformanceAbility(driver, 'raceAwareness') * 0.15
      const competitiveness =
        driverConfidence * 0.52 +
        effectiveMachineRating(team.machine.qualifyingPace) * 0.48
      const teamRisk = hashChance(
        `${config.seed}:qualifying-release-risk:${stage}:${segment.name}:${team.id}:${runIndex}`,
      )
      const driverVariation = hashChance(
        `${config.seed}:qualifying-release-order:${stage}:${segment.name}:${driver.id}:${runIndex}`,
      )
      const operationalConfidence = clamp(team.pitCrewSpeed, 0.5, 1.1)
      const orderScore = rainThreat
        ? -driverConfidence * 0.55 -
          operationalConfidence * 0.25 +
          driverVariation * 0.2
        : runIndex === 0
          ? competitiveness * 0.56 + teamRisk * 0.2 + driverVariation * 0.24
          : competitiveness * 0.62 + teamRisk * 0.25 + driverVariation * 0.13

      return { driver, orderScore, team }
    })
  const ordered = orderWithoutTeammateStacking(candidates)
  const waveLengthSeconds = Math.max(
    0,
    (ordered.length - 1) * targetTrafficGapSeconds,
  )
  const earliestWindowStart = segment.startsAtSeconds + (rainThreat ? 10 : 18)
  let windowStart = earliestWindowStart

  if (!rainThreat && finalRun) {
    windowStart = latestPitExitAtSeconds - waveLengthSeconds
  } else if (!rainThreat && runIndex > 0) {
    const targetCenter =
      segment.startsAtSeconds + durationSeconds * (runIndex / runLimit + 0.14)
    windowStart = targetCenter - waveLengthSeconds / 2
  }

  windowStart = clamp(
    windowStart,
    earliestWindowStart,
    Math.max(earliestWindowStart, latestPitExitAtSeconds - waveLengthSeconds),
  )

  return ordered.map((candidate, index) => {
    let pitExitAtSeconds = windowStart + index * targetTrafficGapSeconds

    if (
      segment.suspensionStartsAtSeconds !== null &&
      segment.suspensionEndsAtSeconds !== null &&
      pitExitAtSeconds >= segment.suspensionStartsAtSeconds &&
      pitExitAtSeconds < segment.suspensionEndsAtSeconds
    ) {
      pitExitAtSeconds =
        segment.suspensionEndsAtSeconds + index * targetTrafficGapSeconds
    }

    pitExitAtSeconds = Math.min(latestPitExitAtSeconds, pitExitAtSeconds)

    return {
      driverId: candidate.driver.id,
      expectedFlyingStartAtSeconds: pitExitAtSeconds + outLapSeconds,
      pitExitAtSeconds,
      strategy,
      targetTrafficGapSeconds,
    }
  })
}
