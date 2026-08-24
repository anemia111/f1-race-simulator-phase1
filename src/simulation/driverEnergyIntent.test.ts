import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import type { ActiveFlagPhase, DriverDecisionPath } from '../types'
import {
  f1ElectricalOvertakeIntentForPath,
  f1EnergyIntentForPath,
  f1ErsModeIntentForPath,
} from './categoryDriverAgent'
import { createInitialEnergyStore } from './energySystem'
import {
  f1ElectricalOvertakeIntentFor,
  f1EnergyIntentFor,
  f1ErsModeIntentFor,
  type F1EnergyIntentOptions,
  type F1ErsModeIntentOptions,
} from './driverEnergyIntent'

const driver = initialDrivers[0]
const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!

function intentOptions(
  overrides: Partial<F1EnergyIntentOptions> = {},
): F1EnergyIntentOptions {
  return {
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
  }
}

function intent(overrides: Partial<F1EnergyIntentOptions> = {}) {
  return f1EnergyIntentFor(intentOptions(overrides))
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
    expect(first).not.toHaveProperty('endOfStraightHarvestBias')
    expect(first).not.toHaveProperty('qualifyingSpendBias')
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

describe('F1 energy-intent category ownership seam', () => {
  const parityCases = [
    { label: 'single-file standard', overrides: {} },
    {
      label: 'attacking push',
      overrides: { battlePhase: 'attacking', paceMode: 'push' },
    },
    {
      label: 'defending reserve',
      overrides: { battlePhase: 'defending', paceMode: 'defend' },
    },
    {
      label: 'saving under a controlled phase',
      overrides: {
        paceMode: 'save',
        phaseActive: true,
        state: createInitialEnergyStore(team, 0.18),
      },
    },
    { label: 'final lap', overrides: { isFinalLap: true, lapProgress: 0.92 } },
    { label: 'controlled phase', overrides: { phaseActive: true } },
    {
      label: 'low SOC',
      overrides: { state: createInitialEnergyStore(team, 0.12) },
    },
    {
      label: 'high SOC',
      overrides: { state: createInitialEnergyStore(team, 0.9) },
    },
    {
      label: 'long straight',
      overrides: {
        straightLengthAheadMeters: 1_300,
        straightness: 1,
      },
    },
    {
      label: 'corner',
      overrides: { straightLengthAheadMeters: 0, straightness: 0 },
    },
    { label: 'attack lap', overrides: { timedRunPhase: 'attack-lap' } },
    { label: 'out lap', overrides: { timedRunPhase: 'out-lap' } },
    { label: 'in lap', overrides: { timedRunPhase: 'in-lap' } },
    { label: 'cooldown', overrides: { timedRunPhase: 'cooldown' } },
  ] as const satisfies ReadonlyArray<{
    label: string
    overrides: Partial<F1EnergyIntentOptions>
  }>

  for (const testCase of parityCases) {
    it(`preserves the exact ${testCase.label} output on every supported path`, () => {
      const options = intentOptions(testCase.overrides)
      const optionsBefore = structuredClone(options)
      const direct = f1EnergyIntentFor(options)
      const legacy = f1EnergyIntentForPath({
        options,
        path: 'legacy-direct',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })
      const category = f1EnergyIntentForPath({
        options,
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      })
      const defaulted = f1EnergyIntentForPath({ options })

      expect(legacy).toEqual(direct)
      expect(category).toEqual(direct)
      expect(defaulted).toEqual(category)
      expect(options).toEqual(optionsBefore)
    })
  }

  it('fails closed before scheduling for unsupported category metadata or paths', () => {
    const options = intentOptions()
    let sfOptionsRead = false
    const sfInput = {
      get options(): F1EnergyIntentOptions {
        sfOptionsRead = true
        throw new Error('SF path read F1 energy scheduler options')
      },
      path: 'category-agent-v1' as const,
      seriesId: 'super-formula' as const,
      vehicleEraId: 'sf-2026' as const,
    }

    expect(() => f1EnergyIntentForPath(sfInput)).toThrow(
      /F1 energy intent requires an F1 energy-store policy/,
    )
    expect(sfOptionsRead).toBe(false)
    expect(() =>
      f1EnergyIntentForPath({
        options,
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(/Unsupported driver policy f1-custom\/sf-2026/)
    expect(() =>
      f1EnergyIntentForPath({
        options,
        path: 'future-energy-agent' as DriverDecisionPath,
      }),
    ).toThrow(/Unsupported driver decision path future-energy-agent/)

    expect(
      f1EnergyIntentForPath({
        options,
        path: 'legacy-direct',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      }),
    ).toEqual(f1EnergyIntentFor(options))
  })
})

describe('F1 Electrical Overtake compatibility request seam', () => {
  it('preserves the legacy implicit always-use request on every path', () => {
    const direct = f1ElectricalOvertakeIntentFor()
    const legacy = f1ElectricalOvertakeIntentForPath({
      path: 'legacy-direct',
      seriesId: 'super-formula',
      vehicleEraId: 'sf-2026',
    })
    const category = f1ElectricalOvertakeIntentForPath({
      path: 'category-agent-v1',
      seriesId: 'f1-custom',
      vehicleEraId: 'f1-2026-current',
    })
    const defaulted = f1ElectricalOvertakeIntentForPath({})

    expect(direct).toBe('request')
    expect(legacy).toBe(direct)
    expect(category).toBe(direct)
    expect(defaulted).toBe(category)
  })

  it('fails closed for SF, mismatched eras, and unknown paths', () => {
    expect(() =>
      f1ElectricalOvertakeIntentForPath({
        path: 'category-agent-v1',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(
      /F1 Electrical Overtake intent requires an F1 Electrical Overtake policy/,
    )
    expect(() =>
      f1ElectricalOvertakeIntentForPath({
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(/Unsupported driver policy f1-custom\/sf-2026/)
    expect(() =>
      f1ElectricalOvertakeIntentForPath({
        path: 'future-overtake-agent' as DriverDecisionPath,
      }),
    ).toThrow(/Unsupported driver decision path future-overtake-agent/)
  })
})

const controlledPhase: ActiveFlagPhase = {
  endMessage: 'Track clear.',
  endSeconds: 10,
  flag: 'sc',
  id: 'ers-mode-path-controlled-phase',
  sector: 1,
  startMessage: 'Safety Car deployed.',
  startSeconds: 0,
}

function ersModeOptions(
  overrides: Partial<F1ErsModeIntentOptions> = {},
): F1ErsModeIntentOptions {
  return {
    batteryPercent: 70,
    brakePercent: 0,
    car: { gapToAhead: 2, status: 'running' },
    fullThrottle: false,
    overtakeStatus: 'available',
    phase: null,
    straightLengthAheadMeters: 80,
    straightness: 0.4,
    ...overrides,
  }
}

describe('F1 baseline ERS-mode category ownership seam', () => {
  const parityCases = [
    { expected: 'balanced', label: 'neutral request', overrides: {} },
    {
      expected: 'harvest',
      label: 'low battery',
      overrides: { batteryPercent: 13 },
    },
    {
      expected: 'harvest',
      label: 'braking',
      overrides: { brakePercent: 6 },
    },
    {
      expected: 'balanced',
      label: 'controlled phase with full battery',
      overrides: { batteryPercent: 96, phase: controlledPhase },
    },
    {
      expected: 'harvest',
      label: 'controlled phase with recharge room',
      overrides: { phase: controlledPhase },
    },
    {
      expected: 'deploy',
      label: 'active electrical overtake opportunity',
      overrides: { overtakeStatus: 'active' },
    },
    {
      expected: 'deploy',
      label: 'straight opportunity',
      overrides: { straightLengthAheadMeters: 220, straightness: 0.8 },
    },
    {
      expected: 'balanced',
      label: 'non-running car',
      overrides: {
        car: { gapToAhead: 0.5, status: 'retired' },
        overtakeStatus: 'active',
      },
    },
  ] as const satisfies ReadonlyArray<{
    expected: ReturnType<typeof f1ErsModeIntentFor>
    label: string
    overrides: Partial<F1ErsModeIntentOptions>
  }>

  for (const testCase of parityCases) {
    it(`preserves the exact ${testCase.label} on every path`, () => {
      const options = ersModeOptions(testCase.overrides)
      const before = structuredClone(options)
      const direct = f1ErsModeIntentFor(options)
      const legacy = f1ErsModeIntentForPath({
        options,
        path: 'legacy-direct',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })
      const category = f1ErsModeIntentForPath({
        options,
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      })
      const defaulted = f1ErsModeIntentForPath({ options })

      expect(direct).toBe(testCase.expected)
      expect(legacy).toBe(direct)
      expect(category).toBe(direct)
      expect(defaulted).toBe(category)
      expect(options).toEqual(before)
    })
  }

  it('rejects SF and invalid paths before reading F1 ERS-mode options', () => {
    let optionsRead = false
    const sfInput = {
      get options(): F1ErsModeIntentOptions {
        optionsRead = true
        throw new Error('SF path read F1 ERS-mode options')
      },
      path: 'category-agent-v1' as const,
      seriesId: 'super-formula' as const,
      vehicleEraId: 'sf-2026' as const,
    }

    expect(() => f1ErsModeIntentForPath(sfInput)).toThrow(
      /F1 ERS-mode intent requires an F1 energy-store policy/,
    )
    expect(optionsRead).toBe(false)
    expect(() =>
      f1ErsModeIntentForPath({
        options: ersModeOptions(),
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(/Unsupported driver policy f1-custom\/sf-2026/)
    expect(() =>
      f1ErsModeIntentForPath({
        options: ersModeOptions(),
        path: 'future-ers-agent' as DriverDecisionPath,
      }),
    ).toThrow(/Unsupported driver decision path future-ers-agent/)
  })
})
