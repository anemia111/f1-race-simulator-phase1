import { describe, expect, it } from 'vitest'
import { seriesPackageById } from '../series/seriesRegistry'
import type { ExecutableSeriesId } from '../series/seriesIds'
import type { DriverDecisionPath, RaceConfig, RaceSnapshot } from '../types'
import { advanceRace, createInitialRace } from './race'

function configFor(
  seriesId: ExecutableSeriesId,
  driverDecisionPath?: DriverDecisionPath,
): RaceConfig {
  const series = seriesPackageById.get(seriesId)

  if (!series) {
    throw new Error(`Missing ${seriesId} series package.`)
  }

  return {
    drivers: series.drivers,
    driverDecisionPath,
    overtakeSystem: series.rules.overtakeSystem,
    seed: `phase7-category-agent-race-parity:${seriesId}`,
    seriesId,
    sessionRaceLapsOverride: seriesId === 'super-formula' ? 25 : null,
    teams: series.teams,
    track: series.tracks[0],
    vehicleEraId: series.vehicleEraId,
    weekendStage: 'race',
  }
}

function runThroughStart(config: RaceConfig): RaceSnapshot {
  let snapshot = createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  return advanceRace(snapshot, 5, config)
}

describe('category driver-agent race seam', () => {
  for (const seriesId of [
    'f1-custom',
    'super-formula',
  ] as const satisfies readonly ExecutableSeriesId[]) {
    it(`keeps the complete ${seriesId} race snapshot equal to legacy`, () => {
      const legacyConfig = configFor(seriesId, 'legacy-direct')
      const categoryConfig = configFor(seriesId, 'category-agent-v1')
      const defaultConfig = configFor(seriesId)
      const commonStartedSnapshot = runThroughStart(legacyConfig)

      const legacy = advanceRace(commonStartedSnapshot, 0.25, legacyConfig)
      const category = advanceRace(commonStartedSnapshot, 0.25, categoryConfig)
      const defaulted = advanceRace(commonStartedSnapshot, 0.25, defaultConfig)

      expect(category).toEqual(legacy)
      expect(defaulted).toEqual(category)
    })
  }
})
