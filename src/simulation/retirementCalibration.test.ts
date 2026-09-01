import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { RaceConfig, RaceSnapshot } from '../types'
import { overtakeForLap } from './overtaking'
import { advanceRace, createInitialRace } from './race'

// Keep the publish gate to a small deterministic full-race smoke sample. The
// fast wheel-to-wheel calibration below owns the much broader probability
// sample, including proof that terminal outcomes remain possible.
const calibrationSeeds = [
  'ret-probe-0',
]

function runRace(seed: string): RaceSnapshot {
  const config: RaceConfig = {
    drivers: initialDrivers,
    seed,
    teams: initialTeams,
    track: tracks[0],
  }
  let snapshot = createInitialRace(config)

  for (
    let step = 0;
    step < 4_000 && snapshot.sessionStatus !== 'finished';
    step += 1
  ) {
    snapshot = advanceRace(snapshot, 3, config)
  }

  return snapshot
}

describe('full-race retirement calibration', () => {
  it(
    'keeps a small full-race sample at low attrition',
    () => {
      const samples = calibrationSeeds.map((seed) => {
        const snapshot = runRace(seed)
        const retired = snapshot.cars.filter((car) => car.status === 'retired')

        expect(snapshot.sessionStatus, seed).toBe('finished')
        return {
          early: retired.filter((car) => car.totalDistance < 2).length,
          retired: retired.length,
          seed,
        }
      })

      const total = samples.reduce((sum, sample) => sum + sample.retired, 0)
      const early = samples.reduce((sum, sample) => sum + sample.early, 0)
      const mean = total / samples.length
      const maximum = Math.max(...samples.map((sample) => sample.retired))

      // The fictional field intentionally sits below the 2025 result average
      // after repeated user feedback that terminal incidents were excessive.
      // The full-race smoke gate prevents a crash-heavy field; the independent
      // probability test below verifies that retirement remains possible:
      // https://www.formula1.com/en/results/2025/races
      expect(mean).toBeLessThanOrEqual(3)
      expect(maximum).toBeLessThanOrEqual(5)
      const earlyRetirementLimit = Math.ceil(
        calibrationSeeds.length * initialDrivers.length * 0.01,
      )
      expect(early).toBeLessThanOrEqual(earlyRetirementLimit)
      expect(samples.some((sample) => sample.retired <= 1)).toBe(true)
    },
    300_000,
  )
})

describe('wheel-to-wheel retirement calibration', () => {
  it('keeps opening-lap contact possible without making most fights terminal', () => {
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'battle-calibration-fixture',
      teams: initialTeams,
      track: tracks[0],
    }
    const snapshot = createInitialRace(config)
    const baseDefender = initialDrivers.find((driver) => driver.code === 'HAM')!
    const baseAttacker = initialDrivers.find((driver) => driver.code === 'RUS')!
    const balancedSkills = Object.fromEntries(
      Object.keys(baseAttacker.skills).map((stat) => [stat, 0.9]),
    ) as typeof baseAttacker.skills
    const defender = { ...baseDefender, skills: balancedSkills }
    const attacker = { ...baseAttacker, skills: balancedSkills }
    const defenderCar = snapshot.cars.find(
      (car) => car.driverId === defender.id,
    )!
    const attackerCar = snapshot.cars.find(
      (car) => car.driverId === attacker.id,
    )!
    const outcomes = Array.from({ length: 5_000 }, (_, index) =>
      overtakeForLap({
        attacker,
        attackerCar,
        defender,
        defenderCar,
        evaluationsPerLap: 1,
        gapToAheadSeconds: 0.28,
        inRestartWindow: false,
        isOpeningLap: true,
        lap: 1,
        seed: `opening-battle-calibration-${index}`,
        trackGrip: 1,
        weather: 'clear',
      }),
    )
    const contacts = outcomes.filter(
      (outcome) => outcome?.kind === 'contact' || outcome?.kind === 'crash',
    )
    const crashes = outcomes.filter((outcome) => outcome?.kind === 'crash')
    const retirementOutcomes = crashes.filter(
      (outcome) => outcome?.attackerRetires || outcome?.defenderRetires,
    )

    expect(contacts.length).toBeGreaterThan(0)
    expect(crashes.length).toBeGreaterThan(0)
    expect(retirementOutcomes.length).toBeGreaterThan(0)
    expect(crashes.length / contacts.length).toBeLessThan(0.16)
    expect(retirementOutcomes.length / outcomes.length).toBeLessThan(0.008)
  })
})
