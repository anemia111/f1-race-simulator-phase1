import type {
  QualifyingReleaseStrategy,
  RaceConfig,
  TimedSessionSegmentPlan,
  WeekendStage,
} from '../types'
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function qualifyingRunLimit(segmentName: string) {
  return segmentName === 'Q3' || segmentName === 'SQ3' ? 2 : 3
}

/**
 * Independent SIM team readiness windows, with only pit-exit separation shared.
 * Run-specific decisions preserve seeded replay without prescribing a field-wide
 * queue ordered by team strength. On-track preparation owns the clean-air gap.
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
  const releaseWindowSeconds = Math.min(
    Math.max(0, latestPitExitAtSeconds - segment.startsAtSeconds - 18),
    rainThreat ? 45 : finalRun ? 125 : 180,
  )
  const earliestWindowStart = segment.startsAtSeconds + (rainThreat ? 10 : 18)
  const windowStart = rainThreat || runIndex === 0
    ? earliestWindowStart
    : finalRun
      ? Math.max(earliestWindowStart, latestPitExitAtSeconds - releaseWindowSeconds - 12)
      : Math.max(earliestWindowStart, segment.startsAtSeconds + durationSeconds * runIndex / runLimit - 30)
  const candidates = config.drivers
    .filter((driver) => participants.has(driver.id))
    .map((driver) => {
      const team = teams.get(driver.teamId)

      if (!team) {
        throw new Error(`Missing team for qualifying release driver ${driver.id}`)
      }

      const teamRisk = hashChance(
        `${config.seed}:qualifying-release-risk:${stage}:${segment.name}:${team.id}:${runIndex}`,
      )
      const releaseVariation = hashChance(
        `${config.seed}:qualifying-release-order:${stage}:${segment.name}:${driver.id}:${runIndex}`,
      )
      const operationalConfidence = clamp(team.pitCrewSpeed, 0.5, 1.1)
      const readiness = clamp(teamRisk * 0.6 + releaseVariation * 0.4 + (1 - operationalConfidence) * 0.08, 0, 1)
      return { driver, desiredAt: windowStart + readiness * releaseWindowSeconds }
    })
  const ordered = candidates.sort((left, right) => left.desiredAt - right.desiredAt || left.driver.id.localeCompare(right.driver.id))
  const waveLengthSeconds = Math.max(
    0,
    (ordered.length - 1) * targetTrafficGapSeconds,
  )
  let previousExit = earliestWindowStart - targetTrafficGapSeconds
  return ordered.map((candidate, index) => {
    // Reserve enough space for the remaining cars instead of clamping several
    // delayed cars onto the same last-second release timestamp.
    const latestSlot = latestPitExitAtSeconds - waveLengthSeconds + index * targetTrafficGapSeconds
    let pitExitAtSeconds = Math.min(latestSlot, Math.max(previousExit + targetTrafficGapSeconds, candidate.desiredAt))

    if (
      segment.suspensionStartsAtSeconds !== null &&
      segment.suspensionEndsAtSeconds !== null &&
      pitExitAtSeconds >= segment.suspensionStartsAtSeconds &&
      pitExitAtSeconds < segment.suspensionEndsAtSeconds
    ) {
      pitExitAtSeconds =
        segment.suspensionEndsAtSeconds + index * targetTrafficGapSeconds
    }

    pitExitAtSeconds = Math.min(latestSlot, pitExitAtSeconds)
    previousExit = pitExitAtSeconds

    return {
      driverId: candidate.driver.id,
      expectedFlyingStartAtSeconds: pitExitAtSeconds + outLapSeconds,
      pitExitAtSeconds,
      strategy,
      targetTrafficGapSeconds,
    }
  })
}
