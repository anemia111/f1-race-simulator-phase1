import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { Driver, Team, WeatherState } from '../types'
import { incidentForLap } from './incidents'
import { createInitialRace } from './race'
import { overtakeForLap } from './overtaking'
import { tireDeltaSeconds } from './tires'
import { performanceLapGainSeconds } from './vehicleDynamics'

const MONTE_CARLO_SAMPLES = 10_000
const f1 = seriesPackageById.get('f1-custom')!
const f2 = seriesPackageById.get('f2')!
const f3 = seriesPackageById.get('f3')!

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

function rankingForTrack(trackIndex: number, weather: WeatherState) {
  const track = f1.tracks[trackIndex % f1.tracks.length]
  const controlDriver = uniformDriver(f1.drivers[0], 0.9)

  return f1.teams
    .map((team) => ({
      id: team.id,
      gain: performanceLapGainSeconds({
        driver: controlDriver,
        session: 'race',
        team,
        track,
        weather,
      }),
    }))
    .sort((left, right) => right.gain - left.gain)
}

function spearman(leftOrder: string[], rightOrder: string[]) {
  const rightRank = new Map(rightOrder.map((id, index) => [id, index]))
  const squaredDistance = leftOrder.reduce((total, id, index) => {
    const distance = index - (rightRank.get(id) ?? index)
    return total + distance * distance
  }, 0)
  const count = leftOrder.length
  return 1 - (6 * squaredDistance) / (count * (count * count - 1))
}

describe('10,000-run statistical acceptance', () => {
  it('keeps a 100-rated driver clearly ahead of a 70-rated driver in matched conditions', () => {
    const base = f1.drivers[0]
    const high = uniformDriver(base, 1)
    const low = uniformDriver(base, 0.7)
    const team = f1.teams.find((candidate) => candidate.id === base.teamId)!
    const conditions = f1.tracks.flatMap((track) =>
      (['clear', 'heavy-rain'] as const).map((weather) => ({ track, weather })),
    )
    const gainCache = conditions.map(({ track, weather }) => ({
      high: performanceLapGainSeconds({ driver: high, team, track, weather }),
      low: performanceLapGainSeconds({ driver: low, team, track, weather }),
      lap: track.baseLapTime,
    }))
    let highTotal = 0
    let lowTotal = 0

    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample += 1) {
      const condition = gainCache[sample % gainCache.length]
      const commonRaceNoise = Math.sin(sample * 1.61803398875) * 0.42
      highTotal += condition.lap - condition.high + commonRaceNoise
      lowTotal += condition.lap - condition.low + commonRaceNoise
    }

    expect(lowTotal / MONTE_CARLO_SAMPLES - highTotal / MONTE_CARLO_SAMPLES).toBeGreaterThan(0.7)
  })

  it('preserves F1 source ordering without making every circuit ranking identical', () => {
    const sourceOrder = f1.teams
      .slice()
      .sort(
        (left, right) =>
          (right.performanceSource?.overall ?? 0) -
          (left.performanceSource?.overall ?? 0),
      )
      .map((team) => team.id)
    const rankings = [
      rankingForTrack(0, 'clear'),
      rankingForTrack(3, 'heavy-rain'),
      rankingForTrack(12, 'clear'),
      rankingForTrack(20, 'light-rain'),
    ]
    const averageRank = new Map<string, number>()
    for (const ranking of rankings) {
      ranking.forEach((entry, index) =>
        averageRank.set(entry.id, (averageRank.get(entry.id) ?? 0) + index),
      )
    }
    const modeledOrder = [...averageRank.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([id]) => id)

    expect(spearman(sourceOrder, modeledOrder)).toBeGreaterThan(0.72)
    expect(rankings[0].map((entry) => entry.id)).not.toEqual(
      rankings[1].map((entry) => entry.id),
    )
  })

  it('keeps one-make fields compact and avoids a team-order cliff', () => {
    for (const series of [f2, f3]) {
      const controlDriver = uniformDriver(series.drivers[0], 0.9)
      const track = series.tracks[0]
      const gains = series.teams
        .map((team) =>
          performanceLapGainSeconds({
            driver: controlDriver,
            session: 'race',
            team,
            track,
            weather: 'clear',
          }),
        )
        .sort((left, right) => right - left)
      const adjacentGaps = gains.slice(1).map((gain, index) => gains[index] - gain)

      expect(gains[0] - gains.at(-1)!).toBeLessThan(0.75)
      expect(Math.max(...adjacentGaps)).toBeLessThan(0.2)
    }
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
