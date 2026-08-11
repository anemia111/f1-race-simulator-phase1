import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { createInitialEnergyStore } from './energySystem'
import { f1EnergyIntentFor } from './driverEnergyIntent'

const driver = initialDrivers[0]
const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!

function intent(
  overrides: Partial<Parameters<typeof f1EnergyIntentFor>[0]> = {},
) {
  return f1EnergyIntentFor({
    battlePhase: 'single-file',
    driver,
    isFinalLap: false,
    lapProgress: 0.35,
    paceMode: 'standard',
    phaseActive: false,
    state: createInitialEnergyStore(team, 0.55),
    straightLengthAheadMeters: 850,
    straightness: 0.9,
    timedRunPhase: null,
    ...overrides,
  })
}

describe('F1 driver energy intent', () => {
  it('is deterministic, bounded, and contains no energy truth or limit setter', () => {
    const state = createInitialEnergyStore(team, 0.55)
    const before = structuredClone(state)
    const first = intent({ state })
    const second = intent({ state })

    expect(first).toEqual(second)
    expect(state).toEqual(before)
    expect(Object.values(first).every((value) => value >= 0 && value <= 1)).toBe(
      true,
    )
    expect(Object.keys(first)).not.toContain('energyMj')
    expect(Object.keys(first)).not.toContain('stateOfCharge')
    expect(Object.keys(first).some((key) => /limit|powerKw/iu.test(key))).toBe(
      false,
    )
  })

  it('changes scheduling for save, attack, defend, and qualifying contexts', () => {
    const standard = intent()
    const saving = intent({ paceMode: 'save' })
    const attack = intent({ battlePhase: 'attacking', paceMode: 'push' })
    const defend = intent({ battlePhase: 'defending', paceMode: 'defend' })
    const qualifying = intent({ timedRunPhase: 'attack-lap' })
    const outLap = intent({ timedRunPhase: 'out-lap' })

    expect(saving.propulsionAggression).toBeLessThan(
      standard.propulsionAggression,
    )
    expect(saving.harvestPreference).toBeGreaterThan(
      standard.harvestPreference,
    )
    expect(attack.attackEnergyReserve).toBeLessThan(
      standard.attackEnergyReserve,
    )
    expect(defend.defendEnergyReserve).toBeLessThan(
      standard.defendEnergyReserve,
    )
    expect(qualifying.qualifyingSpendBias).toBeGreaterThan(
      outLap.qualifyingSpendBias,
    )
    expect(qualifying.propulsionAggression).toBeGreaterThan(
      outLap.propulsionAggression,
    )
  })

  it('accepts more optional superclip when SOC is low without changing limits', () => {
    const healthyState = createInitialEnergyStore(team, 0.82)
    const lowState = createInitialEnergyStore(team, 0.18)
    const healthy = intent({ state: healthyState })
    const low = intent({ state: lowState })

    expect(low.superclipAcceptance).toBeGreaterThan(
      healthy.superclipAcceptance,
    )
    expect(low.harvestPreference).toBeGreaterThan(healthy.harvestPreference)
    expect(lowState.maximumDeploymentDcPowerKw).toBe(
      healthyState.maximumDeploymentDcPowerKw,
    )
    expect(lowState.usableEnergyMJ).toBe(healthyState.usableEnergyMJ)
    expect(lowState.rechargeRule.limit).toEqual(healthyState.rechargeRule.limit)
  })
})
