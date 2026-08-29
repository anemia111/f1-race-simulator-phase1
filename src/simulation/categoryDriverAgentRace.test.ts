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

function advanceFixedTickWindow(
  snapshot: RaceSnapshot,
  config: RaceConfig,
): RaceSnapshot {
  // Production integration splits this three-second window into six 0.5 s
  // physics ticks, long enough to exercise deployment and SOC evolution.
  return advanceRace(snapshot, 3, config)
}

describe('category driver-agent race seam', () => {
  for (const seriesId of [
    'f1-custom',
    'super-formula',
  ] as const satisfies readonly ExecutableSeriesId[]) {
    it(`runs the operational ${seriesId} agent deterministically with a legacy rollback`, () => {
      const legacyConfig = configFor(seriesId, 'legacy-direct')
      const categoryConfig = configFor(seriesId, 'category-agent-v1')
      const defaultConfig = configFor(seriesId)
      const commonStartedSnapshot = runThroughStart(legacyConfig)

      const legacy = advanceFixedTickWindow(
        commonStartedSnapshot,
        legacyConfig,
      )
      const category = advanceFixedTickWindow(
        commonStartedSnapshot,
        categoryConfig,
      )
      const defaulted = advanceFixedTickWindow(
        commonStartedSnapshot,
        defaultConfig,
      )

      expect(defaulted).toEqual(category)
      expect(category).not.toEqual(legacy)
      expect(
        category.cars.every((car) => {
          const inbox = car.driverObservationInbox
          return (
            inbox !== undefined &&
            inbox.driverId === car.driverId &&
            inbox.seriesId === seriesId &&
            inbox.pending.length + inbox.retained.length > 0
          )
        }),
      ).toBe(true)
      expect(
        category.cars.every(
          (car) =>
            car.driverAgentRuntime !== undefined &&
            car.driverAgentRuntime.experience.mileageKm > 0 &&
            car.driverAgentRuntime.recentDecisions.length > 0 &&
            car.driverAgentRuntime.recentDecisions.length <= 1,
        ),
      ).toBe(true)
      expect(
        legacy.cars.every(
          (car) => car.driverAgentRuntime?.recentDecisions.length === 0,
        ),
      ).toBe(true)

      if (seriesId === 'f1-custom') {
        const ersModesBefore = commonStartedSnapshot.cars.map((car) =>
          car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.ersMode
            : null,
        )
        const activeAeroBefore = commonStartedSnapshot.cars.map((car) =>
          car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.activeAeroState
            : null,
        )
        const energyBefore = commonStartedSnapshot.cars.map((car) => {
          expect(car.runtimeSystems.kind).toBe('f1')
          return car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.energyStore
            : null
        })
        const energyAfter = category.cars.map((car) => {
          expect(car.runtimeSystems.kind).toBe('f1')
          return car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.energyStore
            : null
        })
        const activeAeroAfter = category.cars.map((car) =>
          car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.activeAeroState
            : null,
        )
        const ersModesAfter = category.cars.map((car) =>
          car.runtimeSystems.kind === 'f1'
            ? car.runtimeSystems.ersMode
            : null,
        )

        expect(
          ersModesAfter.some(
            (mode, index) => mode !== null && mode !== ersModesBefore[index],
          ),
        ).toBe(true)
        expect(
          activeAeroAfter.some((state, index) => {
            const before = activeAeroBefore[index]
            return (
              state !== null &&
              before !== null &&
              (state.command !== before.command ||
                state.frontStraightFraction !==
                  before.frontStraightFraction ||
                state.rearStraightFraction !== before.rearStraightFraction)
            )
          }),
        ).toBe(true)
        expect(energyAfter).not.toEqual(energyBefore)
        expect(
          energyAfter.some(
            (state, index) =>
              state !== null &&
              energyBefore[index] !== null &&
              state.stateOfCharge !== energyBefore[index]!.stateOfCharge,
          ),
        ).toBe(true)
        expect(
          energyAfter.some(
            (state, index) =>
              state !== null &&
              energyBefore[index] !== null &&
              state.deployedAtCuKBusThisLapMJ !==
                energyBefore[index]!.deployedAtCuKBusThisLapMJ,
          ),
        ).toBe(true)
        expect(
          category.cars.every(
            (car) =>
              !('electricalOvertakeRequest' in car.runtimeSystems),
          ),
        ).toBe(true)
      } else {
        expect(
          category.cars.every(
            (car) =>
              car.runtimeSystems.kind === 'super-formula' &&
              !('activeAeroState' in car.runtimeSystems) &&
              !('overtakeEligibility' in car.runtimeSystems) &&
              !('ersMode' in car.runtimeSystems) &&
              !('energyStore' in car.runtimeSystems),
          ),
        ).toBe(true)
      }
    })
  }
})
