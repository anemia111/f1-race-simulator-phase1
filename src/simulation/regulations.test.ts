import { describe, expect, it } from 'vitest'
import { fiaSuzukaPuEventInput2026 } from '../data/fiaPuEventInputs2026'
import { sourceRegistry } from '../data/sourceRegistry'
import { tracks } from '../data/tracks'
import type { CarSnapshot, FiaPuEventInput, TireCompound } from '../types'
import {
  FIA_2026_REGULATION_PROFILE,
  compliesWithGrandPrixTireRule,
  deploymentPowerLimitKwForSpeed,
  nextLowGripCondition,
  permittedMguKDcPowerKwForSpeed,
  resolveF1RechargeRule,
  sessionDistanceLapsFor,
  shouldDeclareRainHazard,
  sprintLapsFor,
} from './regulations'

describe('2026 session regulations', () => {
  const silverstone = tracks.find((track) => track.id === 'silverstone-approx')!
  const f1TireRuleCar = (compoundsUsed: TireCompound[]) => ({
    runtimeSystems: {
      kind: 'f1',
      tires: { compoundsUsed },
    } as CarSnapshot['runtimeSystems'],
  })
  const superFormulaTireRuleCar = {
    runtimeSystems: {
      kind: 'super-formula',
    } as CarSnapshot['runtimeSystems'],
  }

  it('uses the least full-lap Sprint distance above 100 km', () => {
    expect(sprintLapsFor(silverstone)).toBe(17)
    expect(sprintLapsFor(silverstone) * silverstone.lengthKm).toBeGreaterThan(100)
    expect(sessionDistanceLapsFor(silverstone, 'race')).toBe(52)
  })

  it('requires two dry specifications unless wet-weather tyres were used', () => {
    expect(compliesWithGrandPrixTireRule(f1TireRuleCar(['M']))).toBe(false)
    expect(compliesWithGrandPrixTireRule(f1TireRuleCar(['M', 'H']))).toBe(true)
    expect(compliesWithGrandPrixTireRule(f1TireRuleCar(['S', 'I']))).toBe(true)
  })

  it('skips the FIA two-dry-compound check for SUPER FORMULA', () => {
    expect(compliesWithGrandPrixTireRule(superFormulaTireRuleCar)).toBe(true)
  })

  it('pins the frozen Sporting B08 and Operational F10 authorities', () => {
    expect(FIA_2026_REGULATION_PROFILE.sporting).toEqual({
      approvedAt: '2026-08-03',
      issue: '08',
      label: 'FIA 2026 F1 Sporting Regulations Issue 08',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_08_-_2026-08-05_7.pdf',
    })
    expect(sourceRegistry.fiaSporting2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Sporting Regulations Issue 08',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.sporting.url,
    })
    expect(FIA_2026_REGULATION_PROFILE.operational).toEqual({
      approvedAt: '2026-08-03',
      issue: '10',
      label: 'FIA 2026 F1 Operational Regulations Issue 10',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_10_-_2026-08-05.pdf',
    })
    expect(sourceRegistry.fiaOperational2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Operational Regulations Issue 10',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.operational.url,
    })
  })

  it('pins public ERS limits to frozen Technical Regulations Issue 20', () => {
    expect(FIA_2026_REGULATION_PROFILE.asOf).toBe('2026-08-05')
    expect(FIA_2026_REGULATION_PROFILE.technical).toEqual({
      approvedAt: '2026-08-03',
      issue: '20',
      label: 'FIA 2026 F1 Technical Regulations Issue 20',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf',
    })
    expect(sourceRegistry.fiaTechnical2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Technical Regulations Issue 20',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.technical.url,
    })
    expect(FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw).toBe(350)
    expect(
      FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj,
    ).toBe(4)
    expect(
      resolveF1RechargeRule({
        behindSafetyCar: true,
        lowGripConditions: true,
        stage: 'race',
      }),
    ).toMatchObject({
      baseLimitMJ: null,
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      measuredAt: 'CU-K-HV-DC-bus',
      resolution: 'technical-low-grip-safety-car',
    })
  })

  it('keeps the non-public low-grip MGU-K curve unavailable', () => {
    expect(FIA_2026_REGULATION_PROFILE.lowGripPowerCurve).toEqual({
      availability: 'unavailable',
      public: false,
      document: 'FIA-F1-DOC-111',
      permittedPowerCurve: null,
      note: 'Competition-specific low-grip ERS curves are not included in the public regulation PDF.',
    })
    const untypedGate = permittedMguKDcPowerKwForSpeed as (options: {
      curve: string
      speedKph: number
    }) => number
    expect(untypedGate({ curve: 'low-grip', speedKph: 100 })).toBe(0)
  })

  it('models Race Director grip declarations with drying hysteresis', () => {
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0,
        previous: false,
        trackGrip: 0.86,
        weather: 'light-rain',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.12,
        previous: true,
        trackGrip: 0.96,
        weather: 'clear',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.04,
        previous: true,
        trackGrip: 0.97,
        weather: 'clear',
      }),
    ).toBe(false)
  })

  it('declares Rain Hazard above the FIA 40 percent threshold', () => {
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.4,
        weather: 'clear',
      }),
    ).toBe(false)
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.401,
        weather: 'clear',
      }),
    ).toBe(true)
  })
})

describe('FIA 2026 event recharge resolver', () => {
  const suzukaContext = {
    eventId: 'f1-03',
    eventInput: fiaSuzukaPuEventInput2026,
    trackId: 'suzuka-approx',
  } as const

  it('uses the C5.2.10 8.5 MJ base only for ordinary TTCS laps', () => {
    expect(resolveF1RechargeRule({ stage: 'race' })).toEqual({
      additionalAllowanceMJ: 0,
      baseLimitMJ: 8.5,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
      measuredAt: 'CU-K-HV-DC-bus',
      resolution: 'technical-default',
      ruleId: 'fia-c5.2.10-default',
      sourceId: 'fia-f1-2026-technical-c20',
    })

    for (const missingEventContext of [
      { stage: 'qualifying' as const },
      { stage: 'sprintQualifying' as const },
      { stage: 'fp1' as const },
      { overtakeAtLapStart: true, stage: 'race' as const },
    ]) {
      expect(resolveF1RechargeRule(missingEventContext)).toMatchObject({
        baseLimitMJ: null,
        limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
        resolution: 'event-context-unavailable',
        ruleId: 'fia-event-context-unavailable',
      })
    }
  })

  it('uses the simulator default recharge budget for Free Mode sessions', () => {
    expect(
      resolveF1RechargeRule({
        allowUnverifiedSessionDefault: true,
        stage: 'fp1',
      }),
    ).toMatchObject({
      baseLimitMJ: 8.5,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
      resolution: 'technical-default',
      ruleId: 'sim-free-mode-default',
    })
  })

  it('treats the Overtake row as a 9.0 MJ total latched at lap start', () => {
    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        overtakeAtLapStart: false,
        stage: 'race',
      }),
    ).toMatchObject({
      additionalAllowanceMJ: 0,
      baseLimitMJ: 8.5,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
      resolution: 'verified-event',
      ruleId: 'suzuka-race-overtake-inactive',
    })
    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        overtakeAtLapStart: true,
        stage: 'race',
      }),
    ).toMatchObject({
      additionalAllowanceMJ: 0.5,
      baseLimitMJ: 8.5,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
      resolution: 'verified-event',
      ruleId: 'suzuka-race-overtake-active-at-lap-start',
    })
  })

  it('selects the exact non-TTCS session and out-lap totals', () => {
    const cases = [
      {
        expectedLimitMj: 8,
        expectedRuleId: 'suzuka-qualifying',
        stage: 'qualifying' as const,
        timedRunPhase: 'attack-lap' as const,
      },
      {
        expectedLimitMj: 9,
        expectedRuleId: 'suzuka-out-lap-other-than-race',
        stage: 'qualifying' as const,
        timedRunPhase: 'out-lap' as const,
      },
      {
        expectedLimitMj: 9,
        expectedRuleId: 'suzuka-free-practice',
        stage: 'fp1' as const,
        timedRunPhase: 'attack-lap' as const,
      },
      {
        expectedLimitMj: 9,
        expectedRuleId: 'suzuka-out-lap-other-than-race',
        stage: 'fp1' as const,
        timedRunPhase: 'out-lap' as const,
      },
    ]

    for (const testCase of cases) {
      expect(
        resolveF1RechargeRule({
          ...suzukaContext,
          stage: testCase.stage,
          timedRunPhase: testCase.timedRunPhase,
        }),
      ).toMatchObject({
        limit: {
          kind: 'finite',
          maxCuKBusRechargeMj: testCase.expectedLimitMj,
        },
        resolution: 'verified-event',
        ruleId: testCase.expectedRuleId,
      })
    }

    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        stage: 'sprintQualifying',
      }),
    ).toMatchObject({
      limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
      resolution: 'event-context-unavailable',
    })
  })

  it('makes the low-grip Safety Car rule unlimited, not an allowance', () => {
    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        behindSafetyCar: true,
        lowGripConditions: true,
        stage: 'race',
      }),
    ).toMatchObject({
      additionalAllowanceMJ: 0,
      baseLimitMJ: null,
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      resolution: 'technical-low-grip-safety-car',
    })
    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        behindSafetyCar: true,
        lowGripConditions: false,
        stage: 'race',
      }).limit,
    ).toEqual({ kind: 'finite', maxCuKBusRechargeMj: 8.5 })
  })

  it('rejects mismatched provenance and fails closed on ambiguous rules', () => {
    expect(() =>
      resolveF1RechargeRule({
        ...suzukaContext,
        eventId: 'f1-04',
        stage: 'race',
      }),
    ).toThrow(/event mismatch/u)
    expect(() =>
      resolveF1RechargeRule({
        ...suzukaContext,
        stage: 'race',
        trackId: 'montreal-approx',
      }),
    ).toThrow(/track mismatch/u)

    const ambiguousInput: FiaPuEventInput = {
      ...fiaSuzukaPuEventInput2026,
      recharge: {
        ...fiaSuzukaPuEventInput2026.recharge,
        rules: [
          ...fiaSuzukaPuEventInput2026.recharge.rules.map((rule) => ({
            ...rule,
            limit: { ...rule.limit },
            sessionTypes: [...rule.sessionTypes],
          })),
          {
            ...fiaSuzukaPuEventInput2026.recharge.rules[0],
            id: 'suzuka-race-overtake-inactive-ambiguous',
            limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
            sessionTypes: ['race'],
          },
        ],
      },
    }
    expect(
      resolveF1RechargeRule({
        ...suzukaContext,
        eventInput: ambiguousInput,
        stage: 'race',
      }),
    ).toMatchObject({
      limit: { kind: 'unavailable', maxCuKBusRechargeMj: null },
      resolution: 'event-context-unavailable',
    })

    const nonClosingInput: FiaPuEventInput = {
      ...fiaSuzukaPuEventInput2026,
      recharge: {
        ...fiaSuzukaPuEventInput2026.recharge,
        rules: fiaSuzukaPuEventInput2026.recharge.rules.map((rule, index) => ({
          ...rule,
          baseLimitMj: index === 1 ? 9 : rule.baseLimitMj,
          limit: { ...rule.limit },
          sessionTypes: [...rule.sessionTypes],
        })),
      },
    }
    expect(() =>
      resolveF1RechargeRule({
        ...suzukaContext,
        eventInput: nonClosingInput,
        overtakeAtLapStart: true,
        stage: 'race',
      }),
    ).toThrow(/decomposition does not close/u)
  })
})

describe('FIA 2026 MGU-K DC power gate', () => {
  const boundaries = [
    { normal: 255, overtake: 350, powerLimited: 250, speedKph: 309 },
    { normal: 250, overtake: 350, powerLimited: 250, speedKph: 310 },
    { normal: 105, overtake: 320, powerLimited: 105, speedKph: 339 },
    { normal: 100, overtake: 300, powerLimited: 100, speedKph: 340 },
    {
      normal: 0.02,
      overtake: 200.02,
      powerLimited: 0.02,
      speedKph: 344.999,
    },
    { normal: 0, overtake: 200, powerLimited: 0, speedKph: 345 },
    {
      normal: 0,
      overtake: 0.02,
      powerLimited: 0,
      speedKph: 354.999,
    },
    { normal: 0, overtake: 0, powerLimited: 0, speedKph: 355 },
  ]

  it.each(boundaries)(
    'applies the exact C5.2.7/C5.2.8 curves at $speedKph km/h',
    ({ normal, overtake, powerLimited, speedKph }) => {
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'normal',
          speedKph,
        }),
      ).toBeCloseTo(normal, 6)
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'overtake',
          speedKph,
        }),
      ).toBeCloseTo(overtake, 6)
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'race-sprint-power-limited',
          speedKph,
        }),
      ).toBeCloseTo(powerLimited, 6)
    },
  )

  it('enforces the absolute 350 kW cap and clamps requested power', () => {
    expect(
      permittedMguKDcPowerKwForSpeed({ curve: 'normal', speedKph: 0 }),
    ).toBe(350)
    expect(
      permittedMguKDcPowerKwForSpeed({ curve: 'overtake', speedKph: 300 }),
    ).toBe(350)
    expect(
      permittedMguKDcPowerKwForSpeed({
        curve: 'race-sprint-power-limited',
        speedKph: 0,
      }),
    ).toBe(250)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: 500,
        speedKph: 0,
      }),
    ).toBe(350)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: 200,
        speedKph: 0,
      }),
    ).toBe(200)
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'race-sprint-power-limited',
        requestedPowerKw: 350,
        speedKph: 309,
      }),
    ).toBe(250)
  })

  it('requires an explicit Overtake curve and fails closed on invalid input', () => {
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'overtake',
        requestedPowerKw: 350,
        speedKph: 340,
      }),
    ).toBe(300)
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'normal',
        requestedPowerKw: 350,
        speedKph: 340,
      }),
    ).toBe(100)
    expect(
      permittedMguKDcPowerKwForSpeed({ speedKph: Number.NaN }),
    ).toBe(0)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: Number.POSITIVE_INFINITY,
        speedKph: 300,
      }),
    ).toBe(0)
  })
})
