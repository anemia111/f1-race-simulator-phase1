import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import { isF1SeriesRules } from '../series/types'
import type { ExecutableSeriesId } from '../series/seriesIds'
import type {
  DriverDecisionPath,
  RaceConfig,
  TimedSessionTire,
} from '../types'
import { baselineSetupForTrack } from './engineering'
import {
  superFormulaControlSessionTireForWeather,
  timedSessionDriverExecutionLossSeconds,
  timedSessionRunAssemblyShortfallSeconds,
} from './qualifying'

function timedSessionOptionsFor(seriesId: ExecutableSeriesId) {
  const series = seriesPackageById.get(seriesId)

  if (!series) {
    throw new Error(`Missing ${seriesId} series package.`)
  }

  const tire: TimedSessionTire = isF1SeriesRules(series.rules)
    ? {
        compound: series.rules.tires.qualifyingDryCompound,
        kind: 'f1-pirelli-session-tire',
      }
    : superFormulaControlSessionTireForWeather('clear')
  const config: RaceConfig = {
    drivers: series.drivers,
    seed: `phase7-timed-session-parity:${seriesId}`,
    seriesId,
    teams: series.teams,
    track: series.tracks[0],
    vehicleEraId: series.vehicleEraId,
    weekendStage: 'qualifying',
  }
  const team = series.teams[0]
  const driver = series.drivers.find(
    (candidate) => candidate.teamId === team.id,
  )

  if (!driver) {
    throw new Error(`Missing ${seriesId} driver for ${team.id}.`)
  }

  return {
    config,
    driver,
    fuelLoadKg: 8,
    run: 1,
    seed: `${config.seed}:driver-execution`,
    setup: baselineSetupForTrack(config.track),
    team,
    tire,
    trackGrip: 1,
    weather: 'clear' as const,
    weekendStage: 'qualifying' as const,
  }
}

describe('category driver-agent timed-session seam', () => {
  it('bounds a symmetric once-per-run assembly shortfall', () => {
    const common = { consistency: 0.8, lapTimeSeconds: 90 }

    expect(
      timedSessionRunAssemblyShortfallSeconds({ ...common, signedDraw: -0.4 }),
    ).toBe(
      timedSessionRunAssemblyShortfallSeconds({ ...common, signedDraw: 0.4 }),
    )
    expect(
      timedSessionRunAssemblyShortfallSeconds({ ...common, signedDraw: 0 }),
    ).toBe(0)
    expect(
      timedSessionRunAssemblyShortfallSeconds({
        consistency: 1,
        lapTimeSeconds: 90,
        signedDraw: 1,
      }),
    ).toBeCloseTo(90 * 0.004, 12)
    expect(
      timedSessionRunAssemblyShortfallSeconds({
        consistency: 0,
        lapTimeSeconds: 90,
        signedDraw: 1,
      }),
    ).toBeCloseTo(90 * 0.016, 12)
  })

  for (const seriesId of [
    'f1-custom',
    'super-formula',
  ] as const satisfies readonly ExecutableSeriesId[]) {
    it(`keeps ${seriesId} driver execution loss exactly equal to legacy`, () => {
      const options = timedSessionOptionsFor(seriesId)
      const legacy = timedSessionDriverExecutionLossSeconds({
        ...options,
        config: {
          ...options.config,
          driverDecisionPath: 'legacy-direct',
        },
      })
      const category = timedSessionDriverExecutionLossSeconds({
        ...options,
        config: {
          ...options.config,
          driverDecisionPath: 'category-agent-v1',
        },
      })
      const defaulted = timedSessionDriverExecutionLossSeconds(options)

      expect(category).toBe(legacy)
      expect(defaulted).toBe(category)
    })
  }

  it('fails closed when a timed session selects an unknown decision path', () => {
    const options = timedSessionOptionsFor('f1-custom')

    expect(() =>
      timedSessionDriverExecutionLossSeconds({
        ...options,
        config: {
          ...options.config,
          driverDecisionPath:
            'future-timed-session-agent' as DriverDecisionPath,
        },
      }),
    ).toThrow(/Unsupported driver decision path future-timed-session-agent/)
  })

  it('validates SF metadata only on the category path', () => {
    const options = timedSessionOptionsFor('super-formula')
    const legacy = timedSessionDriverExecutionLossSeconds({
      ...options,
      config: {
        ...options.config,
        driverDecisionPath: 'legacy-direct',
      },
    })
    const mismatchedConfig: RaceConfig = {
      ...options.config,
      vehicleEraId: 'f1-2026-current',
    }

    expect(() =>
      timedSessionDriverExecutionLossSeconds({
        ...options,
        config: {
          ...mismatchedConfig,
          driverDecisionPath: 'category-agent-v1',
        },
      }),
    ).toThrow(/Unsupported driver policy super-formula\/f1-2026-current/)
    expect(
      timedSessionDriverExecutionLossSeconds({
        ...options,
        config: {
          ...mismatchedConfig,
          driverDecisionPath: 'legacy-direct',
        },
      }),
    ).toBe(legacy)
  })
})
