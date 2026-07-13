import type { Driver, RaceConfig, Team } from '../types'
import {
  runPracticeSession,
  type PracticeSessionName,
  type PracticeSessionResult,
} from './qualifying'

export type DriverSetupSummary = {
  driverId: string
  code: string
  teamId: string
  score: number
  lapsCompleted: number
  setupDelta: number
}

export type TeamSetupSummary = {
  teamId: string
  teamName: string
  score: number
  lapsCompleted: number
  aeroDelta: number
  tireDelta: number
  coolingDelta: number
}

export type PracticeSetupSummary = {
  driverSummaries: DriverSetupSummary[]
  sessionResults: Record<PracticeSessionName, PracticeSessionResult[]>
  teamSummaries: TeamSetupSummary[]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]))

function stageWeight(stage: PracticeSessionName) {
  switch (stage) {
    case 'fp1':
      return 0.24
    case 'fp2':
      return 0.36
    case 'fp3':
      return 0.4
  }
}

function trackBias(config: RaceConfig) {
  if (config.track.kind === 'street') {
    return { aero: 1.15, straight: 0.85 }
  }

  if (config.track.kind === 'hybrid') {
    return { aero: 0.96, straight: 1.08 }
  }

  return { aero: 1, straight: 1 }
}

export function buildPracticeSetupSummary(
  config: RaceConfig,
  stages: PracticeSessionName[],
): PracticeSetupSummary {
  const teamsById = byId(config.teams)
  const resultsByStage = Object.fromEntries(
    stages.map((stage) => [stage, runPracticeSession(config, stage)]),
  ) as Record<PracticeSessionName, PracticeSessionResult[]>
  const weightedByDriver = new Map<
    string,
    {
      code: string
      score: number
      teamId: string
      weight: number
      lapsCompleted: number
    }
  >()

  for (const stage of stages) {
    const weight = stages.length === 1 ? 1 : stageWeight(stage)

    for (const result of resultsByStage[stage] ?? []) {
      const current = weightedByDriver.get(result.driverId) ?? {
        code: result.code,
        score: 0,
        teamId: result.teamId,
        weight: 0,
        lapsCompleted: 0,
      }

      current.score += result.setupScore * weight
      current.weight += weight
      current.lapsCompleted += result.lapsCompleted
      weightedByDriver.set(result.driverId, current)
    }
  }

  const driverSummaries = [...weightedByDriver.entries()]
    .map<DriverSetupSummary>(([driverId, value]) => {
      const score = value.weight > 0 ? value.score / value.weight : 50

      return {
        driverId,
        code: value.code,
        teamId: value.teamId,
        score,
        lapsCompleted: value.lapsCompleted,
        setupDelta: clamp((score - 70) / 1000, -0.018, 0.03),
      }
    })
    .sort((a, b) => b.score - a.score)

  const summariesByTeam = new Map<
    string,
    { lapsCompleted: number; score: number; weight: number }
  >()

  for (const driver of driverSummaries) {
    const current = summariesByTeam.get(driver.teamId) ?? {
      lapsCompleted: 0,
      score: 0,
      weight: 0,
    }

    current.lapsCompleted += driver.lapsCompleted
    current.score += driver.score * driver.lapsCompleted
    current.weight += driver.lapsCompleted
    summariesByTeam.set(driver.teamId, current)
  }

  const bias = trackBias(config)
  const teamSummaries = [...summariesByTeam.entries()]
    .map<TeamSetupSummary>(([teamId, value]) => {
      const score = value.weight > 0 ? value.score / value.weight : 50
      const normalized = clamp((score - 70) / 100, -0.22, 0.28)
      const lapConfidence = clamp(value.lapsCompleted / 130, 0.35, 1)
      const team = teamsById.get(teamId)

      return {
        teamId,
        teamName: team?.name ?? teamId,
        score,
        lapsCompleted: value.lapsCompleted,
        aeroDelta: normalized * 0.075 * lapConfidence * bias.aero,
        tireDelta: normalized * 0.055 * lapConfidence,
        coolingDelta: normalized * 0.045 * lapConfidence * bias.straight,
      }
    })
    .sort((a, b) => b.score - a.score)

  return {
    driverSummaries,
    sessionResults: resultsByStage,
    teamSummaries,
  }
}

export function applyPracticeSetup(
  config: RaceConfig,
  summary: PracticeSetupSummary,
): RaceConfig {
  const teamSummaries = new Map(summary.teamSummaries.map((team) => [team.teamId, team]))
  const driverSummaries = new Map(
    summary.driverSummaries.map((driver) => [driver.driverId, driver]),
  )

  return {
    ...config,
    drivers: config.drivers.map((driver) => applyDriverSetup(driver, driverSummaries)),
    teams: config.teams.map((team) => applyTeamSetup(team, teamSummaries)),
  }
}

function applyTeamSetup(team: Team, summaries: Map<string, TeamSetupSummary>): Team {
  const summary = summaries.get(team.id)

  if (!summary) {
    return team
  }

  return {
    ...team,
    cornering: clamp(team.cornering + summary.aeroDelta, 0.55, 1),
    reliability: clamp(team.reliability + summary.coolingDelta, 0.55, 1),
    straightLine: clamp(team.straightLine + summary.aeroDelta * 0.28, 0.55, 1),
  }
}

function applyDriverSetup(
  driver: Driver,
  summaries: Map<string, DriverSetupSummary>,
): Driver {
  const summary = summaries.get(driver.id)

  if (!summary) {
    return driver
  }

  return {
    ...driver,
    consistency: clamp(driver.consistency + summary.setupDelta * 0.8, 0.55, 1),
    tireManagement: clamp(driver.tireManagement + summary.setupDelta, 0.55, 1),
  }
}
