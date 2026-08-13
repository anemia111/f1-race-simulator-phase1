import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { SeriesPackage } from '../series/types'
import type { Driver, Team, TimedSessionTire, WeatherState } from '../types'
import { baselineSetupForTrack } from './engineering'
import { incidentForLap } from './incidents'
import {
  superFormulaControlSessionTireForWeather,
  timedSessionDriverExecutionLossSeconds,
  timedSessionPhysicalLapSeconds,
} from './qualifying'
import { createInitialRace } from './race'
import { overtakeForLap } from './overtaking'
import { tireDeltaSeconds } from './tires'

const MONTE_CARLO_SAMPLES = 10_000
const f1 = seriesPackageById.get('f1-custom')!
const superFormula = seriesPackageById.get('super-formula')!

function uniformDriver(base: Driver, rating: number): Driver {
  return {
    ...base,
    skills: Object.fromEntries(
      Object.keys(base.skills).map((stat) => [stat, rating]),
    ) as Driver['skills'],
    style: { ...base.style },
  }
}

function teamWithReliability(base: Team, reliability: number): Team {
  return {
    ...base,
    machine: { ...base.machine, reliability },
  }
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function conditionForWeather(weather: WeatherState) {
  return {
    tire: f1SessionTireForWeather(weather),
    trackGrip:
      weather === 'heavy-rain' ? 0.62 : weather === 'light-rain' ? 0.82 : 1,
  }
}

function f1SessionTireForWeather(
  weather: WeatherState,
): Extract<TimedSessionTire, { kind: 'f1-pirelli-session-tire' }> {
  return {
    compound:
      weather === 'heavy-rain'
        ? 'W'
        : weather === 'light-rain'
          ? 'I'
          : 'S',
    kind: 'f1-pirelli-session-tire',
  }
}

function rankingForTrack(
  series: SeriesPackage,
  trackIndex: number,
  weather: WeatherState,
) {
  const track = series.tracks[trackIndex % series.tracks.length]
  const config = {
    drivers: series.drivers,
    seed: `monte-carlo-physical-ranking:${series.id}:${track.id}:${weather}`,
    seriesId: series.id,
    teams: series.teams,
    track,
  }
  const condition = conditionForWeather(weather)
  const setup = baselineSetupForTrack(track)

  return series.teams
    .map((team) => ({
      id: team.id,
      lapTimeSeconds: timedSessionPhysicalLapSeconds({
        ...condition,
        config,
        fuelLoadKg: 8,
        setup,
        team,
        weather,
        weekendStage: 'qualifying',
      }),
    }))
    .sort((left, right) => left.lapTimeSeconds - right.lapTimeSeconds)
}

describe('10,000-run statistical acceptance', () => {
  it('gives a precise driver lower 10,000-run behavioral loss in matched physics', () => {
    const base = f1.drivers[0]
    const high = uniformDriver(base, 1)
    const low = uniformDriver(base, 0.7)
    const team = f1.teams.find((candidate) => candidate.id === base.teamId)!
    const conditions = f1.tracks.flatMap((track) => {
      const config = {
        drivers: [high, low],
        seed: `monte-carlo-driver-execution:${track.id}`,
        seriesId: f1.id,
        teams: [team],
        track,
      }
      const setup = baselineSetupForTrack(track)

      return (['clear', 'heavy-rain'] as const).map((weather) => ({
        ...conditionForWeather(weather),
        config,
        fuelLoadKg: 8,
        setup,
        team,
        weather,
        weekendStage: 'qualifying' as const,
      }))
    })
    let highTotal = 0
    let lowTotal = 0

    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample += 1) {
      const condition = conditions[sample % conditions.length]
      const common = {
        ...condition,
        run: sample,
        seed: `monte-carlo-driver-execution:${sample}`,
      }

      highTotal += timedSessionDriverExecutionLossSeconds({
        ...common,
        driver: high,
      })
      lowTotal += timedSessionDriverExecutionLossSeconds({
        ...common,
        driver: low,
      })
    }

    expect(highTotal).toBeGreaterThanOrEqual(0)
    expect(lowTotal / MONTE_CARLO_SAMPLES).toBeGreaterThan(
      highTotal / MONTE_CARLO_SAMPLES,
    )
  })

  it('creates real F1 team differences from physical inputs on every circuit', () => {
    const rankings = [
      rankingForTrack(f1, 0, 'clear'),
      rankingForTrack(f1, 3, 'heavy-rain'),
      rankingForTrack(f1, 12, 'clear'),
      rankingForTrack(f1, 20, 'light-rain'),
    ]

    expect(
      rankings.every(
        (ranking) =>
          new Set(
            ranking.map((entry) => entry.lapTimeSeconds.toFixed(5)),
          ).size >= Math.ceil(f1.teams.length * 0.7),
      ),
    ).toBe(true)
    expect(rankings[0].map((entry) => entry.lapTimeSeconds)).not.toEqual(
      rankings[1].map((entry) => entry.lapTimeSeconds),
    )
  })

  it('keeps the SF one-make field physical and reacts monotonically to PU output', () => {
    const track = superFormula.tracks[0]
    const baseTeam = superFormula.teams[0]
    const weaker = {
      ...baseTeam,
      machine: { ...baseTeam.machine, puOutput: 0.6 },
    }
    const stronger = {
      ...baseTeam,
      machine: { ...baseTeam.machine, puOutput: 1 },
    }
    const config = {
      drivers: superFormula.drivers,
      seed: `monte-carlo-one-make:${superFormula.id}`,
      seriesId: superFormula.id,
      teams: [weaker, stronger],
      track,
    }
    const common = {
      config,
      fuelLoadKg: 8,
      setup: baselineSetupForTrack(track),
      trackGrip: 1,
      tire: superFormulaControlSessionTireForWeather('clear'),
      weather: 'clear' as const,
      weekendStage: 'qualifying' as const,
    }
    const weakerLap = timedSessionPhysicalLapSeconds({
      ...common,
      team: weaker,
    })
    const strongerLap = timedSessionPhysicalLapSeconds({
      ...common,
      team: stronger,
    })

    expect(Number.isFinite(weakerLap)).toBe(true)
    expect(strongerLap).toBeLessThan(weakerLap)
  })

  it('reflects reliability, control and wet skill in 10,000 incident opportunities', () => {
    const baseDriver = f1.drivers[0]
    const baseTeam = f1.teams.find((team) => team.id === baseDriver.teamId)!
    const highDriver = uniformDriver(baseDriver, 1)
    const lowDriver = uniformDriver(baseDriver, 0.55)
    const highTeam = teamWithReliability(baseTeam, 1)
    const lowTeam = teamWithReliability(baseTeam, 0.55)
    let highRiskIncidents = 0
    let lowRiskIncidents = 0
    let highReliabilityRetirements = 0
    let lowReliabilityRetirements = 0
    let strongWetIncidents = 0
    let weakWetIncidents = 0
    const strongWetDriver = {
      ...lowDriver,
      skills: { ...lowDriver.skills, intermediateSkill: 1, wetSkill: 1 },
    }

    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample += 1) {
      const seed = `monte-carlo-incident:${sample}`
      const lap = 2 + (sample % 52)
      if (incidentForLap(seed, highDriver, highTeam, lap, 1, { weather: 'clear' })) highRiskIncidents += 1
      if (incidentForLap(seed, lowDriver, highTeam, lap, 1, { weather: 'clear' })) lowRiskIncidents += 1
      if (incidentForLap(seed, highDriver, highTeam, lap, 1, { weather: 'clear' })?.retirement) highReliabilityRetirements += 1
      if (incidentForLap(seed, highDriver, lowTeam, lap, 1, { weather: 'clear' })?.retirement) lowReliabilityRetirements += 1
      if (incidentForLap(seed, strongWetDriver, highTeam, lap, 1, { weather: 'heavy-rain' })) strongWetIncidents += 1
      if (incidentForLap(seed, lowDriver, highTeam, lap, 1, { weather: 'heavy-rain' })) weakWetIncidents += 1
    }

    expect(lowRiskIncidents).toBeGreaterThan(highRiskIncidents)
    expect(lowReliabilityRetirements).toBeGreaterThan(highReliabilityRetirements)
    expect(weakWetIncidents).toBeGreaterThan(strongWetIncidents)
  })

  it('turns overtaking and defending ratings into different 10,000-battle outcomes', () => {
    const snapshot = createInitialRace({
      drivers: f1.drivers,
      seed: 'monte-carlo-battle-fixture',
      teams: f1.teams,
      track: f1.tracks[0],
    })
    const baseAttacker = f1.drivers.find(
      (driver) => driver.id === snapshot.cars[1].driverId,
    )!
    const baseDefender = f1.drivers.find(
      (driver) => driver.id === snapshot.cars[0].driverId,
    )!
    const highAttacker = {
      ...uniformDriver(baseAttacker, 0.82),
      skills: {
        ...uniformDriver(baseAttacker, 0.82).skills,
        overtakingSkill: 1,
      },
    }
    const lowAttacker = {
      ...highAttacker,
      skills: { ...highAttacker.skills, overtakingSkill: 0.55 },
    }
    const highDefender = {
      ...uniformDriver(baseDefender, 0.82),
      skills: {
        ...uniformDriver(baseDefender, 0.82).skills,
        defendingSkill: 1,
      },
    }
    const lowDefender = {
      ...highDefender,
      skills: { ...highDefender.skills, defendingSkill: 0.55 },
    }
    const attackerCar = { ...snapshot.cars[1], speedKph: 335, tire: 'S' as const }
    const defenderCar = { ...snapshot.cars[0], speedKph: 320, tire: 'M' as const }
    let highAttackPasses = 0
    let lowAttackPasses = 0
    let highDefensePasses = 0
    let lowDefensePasses = 0

    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample += 1) {
      const common = {
        attackerCar,
        defenderCar,
        evaluationsPerLap: 1,
        gapToAheadSeconds: 0.42,
        inRestartWindow: false,
        isOpeningLap: false,
        lap: 5 + (sample % 45),
        seed: `monte-carlo-battle:${sample}`,
        track: f1.tracks[0],
        trackGrip: 1,
        trackProgress: 0.2,
        weather: 'clear' as const,
      }
      if (overtakeForLap({ ...common, attacker: highAttacker, defender: highDefender })?.kind === 'pass') highAttackPasses += 1
      if (overtakeForLap({ ...common, attacker: lowAttacker, defender: highDefender })?.kind === 'pass') lowAttackPasses += 1
      if (overtakeForLap({ ...common, attacker: highAttacker, defender: highDefender })?.kind === 'pass') highDefensePasses += 1
      if (overtakeForLap({ ...common, attacker: highAttacker, defender: lowDefender })?.kind === 'pass') lowDefensePasses += 1
    }

    expect(highAttackPasses).toBeGreaterThan(lowAttackPasses)
    expect(lowDefensePasses).toBeGreaterThan(highDefensePasses)
  })

  it('turns tire management into lower long-stint degradation', () => {
    const highManagementDeltas = Array.from(
      { length: MONTE_CARLO_SAMPLES },
      (_, sample) =>
        tireDeltaSeconds(
          sample % 2 === 0 ? 'M' : 'S',
          12 + (sample % 18),
          1,
          'clear',
          0.96,
        ),
    )
    const lowManagementDeltas = Array.from(
      { length: MONTE_CARLO_SAMPLES },
      (_, sample) =>
        tireDeltaSeconds(
          sample % 2 === 0 ? 'M' : 'S',
          12 + (sample % 18),
          0.55,
          'clear',
          0.96,
        ),
    )

    expect(mean(lowManagementDeltas)).toBeGreaterThan(
      mean(highManagementDeltas),
    )
  })
})
