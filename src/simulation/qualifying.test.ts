import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { isF1SeriesRules } from '../series/types'
import type { Driver, TimedSessionTire } from '../types'
import {
  baselineSetupForTrack,
  driverSetupFeedback,
} from './engineering'
import {
  runPracticeSession,
  runSeriesQualifying,
  superFormulaControlSessionTireForWeather,
  timedSessionPhysicalLapSeconds,
} from './qualifying'

const pirelliCompoundValues = new Set(['S', 'M', 'H', 'I', 'W'])

function expectNoPirelliCompoundState(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoPirelliCompoundState)
    return
  }

  if (typeof value === 'string') {
    expect(pirelliCompoundValues.has(value)).toBe(false)
    return
  }

  if (typeof value !== 'object' || value === null) {
    return
  }

  const record = value as Record<string, unknown>
  expect(Object.hasOwn(record, 'compound')).toBe(false)
  Object.values(record).forEach(expectNoPirelliCompoundState)
}

function superFormulaConfig() {
  const series = seriesPackageById.get('super-formula')!

  return {
    config: {
      drivers: series.drivers,
      seed: 'sf-timed-session-tyre-boundary',
      seriesId: 'super-formula' as const,
      teams: series.teams,
      track: { ...series.tracks[0], rainProbability: 0 },
      weekendStage: 'qualifying' as const,
    },
    series,
  }
}

describe('practice setup ability ownership', () => {
  it('partitions practice execution and setup feedback owners', () => {
    const series = seriesPackageById.get('f1-custom')!
    const driver = series.drivers[0]!
    const withSkills = (
      overrides: Partial<Driver['skills']>,
    ): Driver => ({
      ...driver,
      skills: { ...driver.skills, ...overrides },
    })
    const lowAdaptability = withSkills({
      adaptability: 0,
      carBalanceAdaptation: 0.7,
    })
    const highAdaptability = withSkills({
      adaptability: 1,
      carBalanceAdaptation: 0.7,
    })

    expect(driverSetupFeedback(lowAdaptability)).toBe(
      driverSetupFeedback(highAdaptability),
    )
    expect(
      driverSetupFeedback(withSkills({ carBalanceAdaptation: 1 })),
    ).toBeGreaterThan(
      driverSetupFeedback(withSkills({ carBalanceAdaptation: 0 })),
    )

    const config = {
      drivers: [lowAdaptability],
      seed: 'phase7-practice-setup-owner',
      seriesId: 'f1-custom' as const,
      teams: series.teams,
      track: { ...series.tracks[0], rainProbability: 0 },
      weekendStage: 'fp1' as const,
    }
    const lowResult = runPracticeSession(config, 'fp1')[0]!
    const highResult = runPracticeSession(
      { ...config, drivers: [highAdaptability] },
      'fp1',
    )[0]!

    expect(highResult.setupScore).toBe(lowResult.setupScore)
    expect(highResult.setupConfidence).toBe(lowResult.setupConfidence)
    expect(highResult.setupRecommendation).toEqual(
      lowResult.setupRecommendation,
    )

    const lowConsistency = runPracticeSession(
      {
        ...config,
        drivers: [withSkills({ consistency: 0 })],
      },
      'fp1',
    )[0]!
    const highConsistency = runPracticeSession(
      {
        ...config,
        drivers: [withSkills({ consistency: 1 })],
      },
      'fp1',
    )[0]!
    expect(highConsistency.setupScore).toBeGreaterThan(
      lowConsistency.setupScore,
    )
  })
})

describe('timed-session tyre boundary', () => {
  it('represents only Yokohama dry/wet control tyres for SUPER FORMULA qualifying', () => {
    const { config, series } = superFormulaConfig()
    const session = runSeriesQualifying(config, series.rules)

    expect(session.segments).not.toHaveLength(0)
    expect(session.classification).not.toHaveLength(0)
    expectNoPirelliCompoundState(session)

    for (const segment of session.segments) {
      expect(segment.tire.kind).toBe('super-formula-control-session-tire')
      if (segment.tire.kind !== 'super-formula-control-session-tire') {
        continue
      }

      expect(segment.tire.surface).toBe('dry')
      expect(segment.tire.physicalModel).toMatchObject({
        availability: 'unavailable',
        simulatorPolicy: 'do-not-apply-physical-tire-coefficients',
        value: null,
      })
    }
  })

  it('keeps SUPER FORMULA practice programme tyres dry/wet-only and coefficient-free', () => {
    const { config } = superFormulaConfig()
    const results = runPracticeSession(
      { ...config, weekendStage: 'fp1' },
      'fp1',
    )

    expect(results).not.toHaveLength(0)
    expectNoPirelliCompoundState(results)
    for (const result of results) {
      expect('runCompounds' in result).toBe(false)
      expect(result.runTires).toHaveLength(result.runCount)
      expect(
        result.runTires.every(
          (tire) => tire.kind === 'super-formula-control-session-tire',
        ),
      ).toBe(true)
      expect(
        result.programs.every(
          (program) => program.tire.kind === 'super-formula-control-session-tire',
        ),
      ).toBe(true)
    }
  })

  it('maps SF weather to the published dry/wet control inventory without a physical coefficient', () => {
    const dry = superFormulaControlSessionTireForWeather('clear')
    const wet = superFormulaControlSessionTireForWeather('heavy-rain')

    expect(dry.surface).toBe('dry')
    expect(wet.surface).toBe('wet')
    expect(dry.physicalModel.sourceInput.availability).toBe('unavailable')
    expect(wet.physicalModel.value).toBeNull()
    expectNoPirelliCompoundState([dry, wet])
  })

  it('fails closed before applying a Pirelli coefficient to a SUPER FORMULA session', () => {
    const { config, series } = superFormulaConfig()

    expect(() =>
      timedSessionPhysicalLapSeconds({
        config,
        fuelLoadKg: 8,
        setup: baselineSetupForTrack(config.track),
        team: series.teams[0]!,
        tire: { compound: 'S', kind: 'f1-pirelli-session-tire' },
        trackGrip: 1,
        weather: 'clear',
        weekendStage: 'qualifying',
      }),
    ).toThrow('SUPER FORMULA timed sessions require a dry/wet control-session tyre.')
  })

  it('preserves the F1 Pirelli timed-session descriptor', () => {
    const series = seriesPackageById.get('f1-custom')!
    if (!isF1SeriesRules(series.rules)) {
      throw new Error('Expected F1 rules for the F1 package')
    }

    const config = {
      drivers: series.drivers,
      seed: 'f1-timed-session-tyre-boundary',
      seriesId: 'f1-custom' as const,
      teams: series.teams,
      track: { ...series.tracks[0], rainProbability: 0 },
      weekendStage: 'qualifying' as const,
    }
    const qualifying = runSeriesQualifying(config, series.rules)
    const practice = runPracticeSession(
      { ...config, weekendStage: 'fp2' },
      'fp2',
    )

    expect(
      qualifying.classification.every(
        (result) => result.tire.kind === 'f1-pirelli-session-tire',
      ),
    ).toBe(true)
    expect(
      practice.every((result) =>
        result.runTires.every(
          (tire) => tire.kind === 'f1-pirelli-session-tire',
        ),
      ),
    ).toBe(true)
    expect(
      qualifying.classification.map((result) =>
        (result.tire as Extract<
          TimedSessionTire,
          { kind: 'f1-pirelli-session-tire' }
        >).compound,
      ),
    ).toContain(series.rules.tires.qualifyingDryCompound)
  })
})
