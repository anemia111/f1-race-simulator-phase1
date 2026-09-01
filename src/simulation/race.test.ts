import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { beforeAll } from 'vitest'
import { tracks } from '../data/tracks'
import { fiaSuzukaPuEventInput2026 } from '../data/fiaPuEventInputs2026'
import { seriesPackageById } from '../series/seriesRegistry'
import { bestSectorTime, classifySectorTime } from '../domain/sectorTiming'
import { flagFromRaceControl } from '../services/openF1Derived'
import { calibrateFieldFromOpenF1 } from '../services/openF1Performance'
import type {
  CarSnapshot,
  PenaltyRecord,
  RaceConfig,
  RaceSnapshot,
  Team,
  TireCompound,
} from '../types'
import { incidentForLap, terminalCrashFlagResponse } from './incidents'
import {
  overtakeAllowanceBoundedDcPowerLimitKw,
  overtakeIncrementalDcEnergyUsedMj,
} from './telemetry'
import {
  battleDynamicsFor,
  crashFlagResponseFor,
  overtakeForLap,
} from './overtaking'
import {
  applyPracticeSetup,
  buildPracticeSetupSummary,
} from './practiceSetup'
import {
  QUALIFYING_GRID_SPACING,
  applyQualifyingGrid,
  runKnockoutQualifying,
  runPracticeSession,
  runQualifying,
  runSprintShootoutQualifying,
  superFormulaControlSessionTireForWeather,
} from './qualifying'
import {
  advanceRace,
  battleTravelAdjustment,
  blueFlagApproachingCarFor,
  carDefinesNeutralisationQueueOrder,
  createInitialRace,
  defenderBattleTimeLossSeconds,
  finalTimingLineSplit,
  formationLapDurationSecondsFor,
  formationLapsPlannedFor,
  postLineEnergyUsageForFinalCrossing,
  reformFieldForRedRestart,
  reformFieldForStandingRestart,
  rankCars,
  skipFormationLap,
} from './race'
import {
  dirtyAirDeltaSeconds,
  fuelEffectSeconds,
  owedPenaltySeconds,
  packFollowingLapTime,
  penaltyFromWarnings,
  raceLapsFor,
  trackEvolutionLevel,
} from './raceEvents'
import {
  referenceProfileLapTimeSeconds,
  speedForProfileTravelKph,
  trackDynamicsAt,
} from './trackDynamics'
import {
  lateralBoundsForTrack,
  MAX_LATERAL_SPEED_MPS,
} from './lateralDynamics'
import {
  applyLegacyTrackSurfaceSectorsToState,
  deserializeTrackSurfaceState,
  trackSurfaceSectorSummary,
  serializeTrackSurfaceState,
  trackSurfaceAt,
} from './trackSurface'
import { categoryPhysicsFor } from './categoryPhysics'
import { createInitialActiveAeroState } from './activeAero'
import { selectGear } from './drivetrain'
import { combustionPowerKwFor } from './vehicleDynamics'
import { startingGridDistance } from './startingGrid'
import {
  decidePitStop,
  decideRedFlagTireChange,
  effectivePitLaneLossSecondsForControlPhase,
  estimatePitOpportunity,
  pitTuning,
  strategyOutlookFor,
} from './strategy'
import {
  effectiveCliffLaps,
  isDryCompound,
  tireConditionFor,
  tireDeltaSeconds,
} from './tires'
import {
  buildWeekendTirePlan,
  legalStartCompoundForConditions,
  weekendTireAllocation,
} from './weekendTires'
import {
  applyWeekendGrid,
  completedQualifyingClassification,
  completePracticeSession,
  completeQualifyingSession,
  completeRaceSession,
  createWeekendContext,
} from './weekend'
import { replaceSuperFormula2026Engine } from './superFormulaEngineLedger'
import {
  trackGripForSector,
  trackGripForWeather,
  rainIntensityLevelFor,
  weatherFor,
  weatherForSector,
  weatherForecastFor,
} from './weather'

const makeConfig = (seed: string): RaceConfig => ({
  track: tracks[0],
  teams: initialTeams,
  drivers: initialDrivers,
  seed,
})

function runSteps(config: RaceConfig, steps: number, dt: number): RaceSnapshot {
  let snapshot = createInitialRace(config)

  for (let step = 0; step < steps; step += 1) {
    snapshot = advanceRace(snapshot, dt, config)
  }

  return snapshot
}

function runThroughStart(
  config: RaceConfig,
  initial = createInitialRace(config),
): RaceSnapshot {
  let snapshot = initial
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  snapshot = advanceRace(snapshot, 5, config)
  return snapshot
}

function canonicalTrackSurfaceFor(snapshot: RaceSnapshot) {
  const trackSurface = deserializeTrackSurfaceState(snapshot.trackSurface)

  if (!trackSurface) {
    throw new Error('Expected a valid canonical track surface')
  }

  return trackSurface
}

function expectCanonicalTrackSurfaceOnly(snapshot: RaceSnapshot) {
  const sectors = trackSurfaceSectorSummary(
    canonicalTrackSurfaceFor(snapshot),
  )

  expect(sectors.surfaceWaterMmBySector).toHaveLength(3)
  expect(sectors.dryingLineBySector).toHaveLength(3)
  expect(sectors.rubberLevelBySector).toHaveLength(3)
  expect(Object.hasOwn(snapshot, 'surfaceWaterMmBySector')).toBe(false)
  expect(Object.hasOwn(snapshot, 'dryingLineBySector')).toBe(false)
  expect(Object.hasOwn(snapshot, 'rubberLevelBySector')).toBe(false)
  expect(Object.hasOwn(snapshot, 'trackEvolutionLevel')).toBe(false)
}

function withCanonicalTrackSurfaceSectors(
  snapshot: RaceSnapshot,
  sectors: {
    dryingLineBySector: [number, number, number]
    rubberLevelBySector: [number, number, number]
    surfaceWaterMmBySector: [number, number, number]
  },
): RaceSnapshot {
  const trackSurface = applyLegacyTrackSurfaceSectorsToState(
    canonicalTrackSurfaceFor(snapshot),
    sectors,
  )
  return {
    ...snapshot,
    trackSurface: serializeTrackSurfaceState(trackSurface),
  }
}

describe('canonical track-surface snapshot authority', () => {
  it('keeps one canonical surface through formation and racing ticks', () => {
    const config: RaceConfig = {
      ...makeConfig('canonical-surface-lifecycle'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const initial = createInitialRace(config)
    const initialSurfaceJson = JSON.stringify(initial.trackSurface)

    expectCanonicalTrackSurfaceOnly(initial)

    const formation = advanceRace(initial, 0.5, config)
    expect(formation.startProcedure).toBe('formation')
    expectCanonicalTrackSurfaceOnly(formation)
    expect(JSON.stringify(initial.trackSurface)).toBe(initialSurfaceJson)

    const racing = advanceRace(runThroughStart(config), 0.5, config)
    expect(racing.startProcedure).toBe('racing')
    expectCanonicalTrackSurfaceOnly(racing)
  })

  it('uses canonical surface lanes without three-sector snapshot state', () => {
    const config: RaceConfig = {
      ...makeConfig('canonical-surface-off-line'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const initial = createInitialRace(config)
    const seededSurface = applyLegacyTrackSurfaceSectorsToState(
      canonicalTrackSurfaceFor(initial),
      {
        dryingLineBySector: [1, 1, 1],
        rubberLevelBySector: [0.6, 0.4, 0.2],
        surfaceWaterMmBySector: [0, 0, 0],
      },
    )
    const next = advanceRace(
      {
        ...initial,
        trackSurface: serializeTrackSurfaceState(seededSurface),
      },
      0,
      config,
    )

    expectCanonicalTrackSurfaceOnly(next)
    const nextSectors = trackSurfaceSectorSummary(next.trackSurface)
    nextSectors.rubberLevelBySector.forEach((level, sector) => {
      expect(level).toBeCloseTo([0.6, 0.4, 0.2][sector], 12)
    })
    expect(nextSectors.surfaceWaterMmBySector).toEqual([0, 0, 0])

    const canonicalSurface = canonicalTrackSurfaceFor(next)
    const racingLine = trackSurfaceAt(canonicalSurface, {
      lateralOffsetM: 0,
      progress: 0.1,
    })
    const offLine = trackSurfaceAt(canonicalSurface, {
      lateralOffsetM: 2,
      progress: 0.1,
    })

    expect(offLine.lane).toBe('off-line')
    expect(offLine.bondedRubber).toBeCloseTo(0.6 * 0.58, 12)
    expect(offLine.marbles).toBeCloseTo(0.6 * 0.24, 12)
    expect(offLine.baseGripMultiplier).toBeLessThan(
      racingLine.baseGripMultiplier,
    )
  })

  it('preserves cell and lane heterogeneity through zero and live ticks', () => {
    const config: RaceConfig = {
      ...makeConfig('canonical-surface-local-evolution'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const initial = createInitialRace(config)
    const local = canonicalTrackSurfaceFor(initial)
    local.waterFilmMm[0] = 1.2
    local.waterFilmMm[1] = 0.25
    local.waterFilmMm[2] = 0.1
    local.bondedRubber[0] = 0.55
    local.bondedRubber[1] = 0.15
    local.marbles[1] = 0.2
    const seeded = {
      ...initial,
      trackSurface: serializeTrackSurfaceState(local),
    }
    const zero = advanceRace(seeded, 0, config)

    expect(zero.trackSurface).toEqual(seeded.trackSurface)
    expectCanonicalTrackSurfaceOnly(zero)

    const live = advanceRace(zero, 0.25, config)
    const evolved = canonicalTrackSurfaceFor(live)

    expect(evolved.waterFilmMm[0]).toBeGreaterThan(evolved.waterFilmMm[2])
    expect(evolved.waterFilmMm[1]).not.toBe(evolved.waterFilmMm[0])
    expect(evolved.bondedRubber[0]).toBeGreaterThan(
      evolved.bondedRubber[1],
    )
    expectCanonicalTrackSurfaceOnly(live)
  })

  it('restores only an exact same-track completed-session surface', () => {
    const base = makeConfig('canonical-surface-weekend-carry')
    const config: RaceConfig = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    const firstSession = createInitialRace(config)
    const carriedState = {
      ...firstSession.trackSurface,
      bondedRubber: firstSession.trackSurface.bondedRubber.map(
        (value, index) => (index === 0 ? 0.48 : value),
      ),
      surfaceTemperatureC: firstSession.trackSurface.surfaceTemperatureC.map(
        (value, index) => (index === 0 ? 41 : value),
      ),
      waterFilmMm: firstSession.trackSurface.waterFilmMm.map((value, index) =>
        index === 0 ? 0.9 : value,
      ),
    }
    const weekendContext = {
      ...createWeekendContext(
        config.drivers,
        config.track.isSprintWeekend,
        config.track,
      ),
      trackSurfaceCarry: {
        state: carriedState,
        trackId: config.track.id,
      },
    }
    const restored = createInitialRace({
      ...config,
      weekendContext,
      weekendStage: 'qualifying',
    })

    expect(restored.trackSurface).toEqual(carriedState)
    expectCanonicalTrackSurfaceOnly(restored)

    const wrongTrack = createInitialRace({
      ...config,
      weekendContext: {
        ...weekendContext,
        trackSurfaceCarry: {
          ...weekendContext.trackSurfaceCarry,
          trackId: 'different-track',
        },
      },
      weekendStage: 'qualifying',
    })

    expect(wrongTrack.trackSurface).not.toEqual(carriedState)
    expect(canonicalTrackSurfaceFor(wrongTrack).bondedRubber[0]).toBe(0)
  })

  it('counts only moving on-track traversals, excluding pit and excursion cars', () => {
    const config: RaceConfig = {
      ...makeConfig('canonical-surface-traversal-filter'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const initial = createInitialRace(config)
    const stationaryCars = initial.cars.map((car, index) => ({
      ...car,
      lateralOffsetM: 0,
      offTrackSinceSeconds: null,
      pitPhase: 'none' as const,
      progress: index / initial.cars.length,
      speedKph: 0,
      status: 'running' as const,
    }))
    const stationary = advanceRace(
      { ...initial, cars: stationaryCars },
      0.25,
      config,
    )
    const excluded = advanceRace(
      {
        ...initial,
        cars: stationaryCars.map((car, index) =>
          index === 0
            ? { ...car, speedKph: 220, status: 'pit' as const }
            : index === 1
              ? { ...car, pitPhase: 'exit' as const, speedKph: 220 }
              : index === 2
                ? { ...car, offTrackSinceSeconds: 0, speedKph: 220 }
                : car,
        ),
      },
      0.25,
      config,
    )
    const moving = advanceRace(
      {
        ...initial,
        cars: stationaryCars.map((car, index) =>
          index === 0 ? { ...car, speedKph: 220 } : car,
        ),
      },
      0.25,
      config,
    )
    const stationarySurface = canonicalTrackSurfaceFor(stationary)
    const excludedSurface = canonicalTrackSurfaceFor(excluded)
    const movingSurface = canonicalTrackSurfaceFor(moving)
    const totalCoverage = (values: Float64Array) =>
      values.reduce((sum, value) => sum + value, 0)

    expect(excludedSurface.bondedRubber).toEqual(
      stationarySurface.bondedRubber,
    )
    expect(excludedSurface.marbles).toEqual(stationarySurface.marbles)
    expect(totalCoverage(movingSurface.bondedRubber)).toBeGreaterThan(
      totalCoverage(stationarySurface.bondedRubber),
    )
  })

  it('freezes incoming rubber and marbles throughout a timed-session tick', () => {
    const config: RaceConfig = {
      ...makeConfig('canonical-surface-timed-freeze'),
      track: { ...tracks[0], rainProbability: 0 },
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const seeded = canonicalTrackSurfaceFor(initial)
    seeded.bondedRubber[0] = 0.42
    seeded.marbles[0] = 0.16
    seeded.bondedRubber[1] = 0.21
    seeded.marbles[1] = 0.09
    const before = serializeTrackSurfaceState(seeded)
    const next = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                offTrackSinceSeconds: null,
                pitPhase: 'none' as const,
                speedKph: 220,
                status: 'running' as const,
              }
            : car,
        ),
        trackSurface: before,
      },
      0.25,
      config,
    )
    const after = canonicalTrackSurfaceFor(next)

    expect(Array.from(after.bondedRubber)).toEqual(before.bondedRubber)
    expect(Array.from(after.marbles)).toEqual(before.marbles)
  })
})

describe('lap-start energy rule authority', () => {
  it('carries only the physically accepted Overtake debit after a Line crossing', () => {
    const remainingAllowanceMj = 0.011
    const deltaSeconds = 1
    const normalLimitKw = 100
    const boundedLimitKw = overtakeAllowanceBoundedDcPowerLimitKw({
      active: true,
      declaredDeploymentDcPowerLimitKw: 350,
      deltaSeconds,
      normalDeploymentDcPowerLimitKw: normalLimitKw,
      remainingAllowanceMj,
    })
    const physicalDebitMj = overtakeIncrementalDcEnergyUsedMj({
      actualDeploymentDcPowerKw: boundedLimitKw,
      active: true,
      deltaSeconds,
      normalDeploymentDcLimitKw: normalLimitKw,
      remainingAllowanceMj,
    })
    const split = finalTimingLineSplit({
      nextTotalDistance: 4.02,
      previousTotalDistance: 3.98,
      processedLap: 3,
    })!
    const retained = postLineEnergyUsageForFinalCrossing({
      deploymentAcceptanceScale: 1,
      frameOvertakeEnergyUsedMJ: physicalDebitMj,
      frameSuperclipRecoveredMJ: 0,
      postLineFraction: split.postLineFraction,
      rechargeAcceptanceScale: 1,
    })

    expect(physicalDebitMj).toBeCloseTo(remainingAllowanceMj, 12)
    expect(retained.overtakeEnergyUsedMJ).toBeCloseTo(
      remainingAllowanceMj * split.postLineFraction,
      12,
    )
    expect(retained.overtakeEnergyUsedMJ).toBeLessThanOrEqual(
      remainingAllowanceMj,
    )
  })

  it('allocates an extreme multi-Line frame only after its final crossing', () => {
    const split = finalTimingLineSplit({
      nextTotalDistance: 5.1,
      previousTotalDistance: 2.9,
      processedLap: 2,
    })

    expect(split).toMatchObject({
      crossedLapCount: 3,
      finalCrossedLap: 5,
    })
    expect(split?.crossingFraction).toBeCloseTo(
      (5 - 2.9) / (5.1 - 2.9),
      12,
    )
    expect(split?.postLineFraction).toBeCloseTo(
      (5.1 - 5) / (5.1 - 2.9),
      12,
    )
    const retained = postLineEnergyUsageForFinalCrossing({
      deploymentAcceptanceScale: 1,
      frameOvertakeEnergyUsedMJ: 0.22,
      frameSuperclipRecoveredMJ: 0.44,
      postLineFraction: split!.postLineFraction,
      rechargeAcceptanceScale: 0.5,
    })

    expect(retained.overtakeEnergyUsedMJ).toBeCloseTo(
      0.22 * split!.postLineFraction,
      12,
    )
    expect(retained.superclipRecoveredMJ).toBeCloseTo(
      0.44 * split!.postLineFraction * 0.5,
      12,
    )
    expect(
      finalTimingLineSplit({
        nextTotalDistance: 5.1,
        previousTotalDistance: 5.1,
        processedLap: 5,
      }),
    ).toBeNull()
  })

  it('latches the Overtake recharge allowance at the line for the whole lap', () => {
    const suzuka = tracks.find((track) => track.id === 'suzuka-approx')!
    const config: RaceConfig = {
      ...makeConfig('lap-start-overtake-recharge-latch'),
      eventId: 'f1-03',
      fiaPuEventInput: fiaSuzukaPuEventInput2026,
      overtakeSystem: 'active-aero',
      track: {
        ...suzuka,
        rainProbability: 0,
        overtakeControlLines: [
          {
            activationProgress: 0.99,
            detectionGapSeconds: 1,
            detectionProgress: 0.95,
            source: 'derived',
          },
        ],
      },
    }
    const started = runThroughStart(config)
    const targetId = started.cars[0].driverId
    const prepared: RaceSnapshot = {
      ...started,
      flag: 'clear',
      flagLabel: 'CLEAR',
      flagPhase: null,
      lowGripConditions: false,
      overtakeEnabled: true,
      cars: started.cars.map((car, index) => {
        const totalDistance = 2.999 - index * 0.01

        return withF1RuntimeFields({
          ...car,
          battlePhase: 'single-file' as const,
          battleOpponentId: null,
          battlePhaseUntilSeconds: null,
          gapToAhead: index === 0 ? 0 : 2,
          gapToLeader: index * 2,
          lap: 2,
          lapStartedAtSeconds: started.elapsedSeconds - 80,
          overtakeStatus: index === 0 ? ('active' as const) : ('disabled' as const),
          position: index + 1,
          processedBattleSegment: Number.MAX_SAFE_INTEGER,
          processedLap: 2,
          progress: totalDistance - Math.floor(totalDistance),
          speedKph: 330,
          status: 'running' as const,
          totalDistance,
        }, {
          overtakeEligibility:
            index === 0
              ? {
                  activationLap: 2,
                  controlLineIndex: 0,
                  detectedGapSeconds: 0.5,
                  eligible: true,
                }
              : null,
        })
      }),
    }

    const crossed = advanceRace(prepared, 0.5, config)
    const crossedTarget = crossed.cars.find((car) => car.driverId === targetId)!

    expect(crossedTarget.processedLap).toBe(3)
    expect(f1Runtime(crossedTarget).overtakeRechargeAllowanceActiveThisLap).toBe(true)
    expect(f1Runtime(crossedTarget).energyStore.rechargeRule).toMatchObject({
      additionalAllowanceMJ: 0.5,
      baseLimitMJ: 8.5,
      limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
      ruleId: 'suzuka-race-overtake-active-at-lap-start',
      usedMJ: 0,
    })
    expect(f1Runtime(crossedTarget).energyDeployedThisLapMj).toBeGreaterThan(0)
    expect(f1Runtime(crossedTarget).energyDeployedThisLapMj).toBeCloseTo(
      f1Runtime(crossedTarget).energyStore.deployedAtCuKBusThisLapMJ,
      12,
    )
    expect(f1Runtime(crossedTarget).overtakeEnergyRemainingMj).toBeLessThan(0.5)
    expect(
      Math.abs(
        f1Runtime(crossedTarget).energyStore.currentEnergyMJ -
          (f1Runtime(crossedTarget).energyStore.lapStartEnergyMJ +
            f1Runtime(crossedTarget).energyStore.storedEnergyThisLapMJ -
            f1Runtime(crossedTarget).energyStore.energyRemovedThisLapMJ),
      ),
    ).toBeLessThan(1e-9)

    const afterOvertake = advanceRace(
      {
        ...crossed,
        cars: crossed.cars.map((car) =>
          car.driverId === targetId
            ? withF1RuntimeFields({
                ...car,
                overtakeStatus: 'disabled' as const,
              }, { overtakeEligibility: null })
            : car,
        ),
      },
      0.01,
      config,
    )
    const heldTarget = afterOvertake.cars.find(
      (car) => car.driverId === targetId,
    )!

    expect(f1Runtime(heldTarget).overtakeRechargeAllowanceActiveThisLap).toBe(true)
    expect(f1Runtime(heldTarget).energyStore.rechargeRule.ruleId).toBe(
      'suzuka-race-overtake-active-at-lap-start',
    )
  })

  it('latches the event out-lap rule at pit release and the attack-lap rule at the line', () => {
    const suzuka = tracks.find((track) => track.id === 'suzuka-approx')!
    const config: RaceConfig = {
      ...makeConfig('timed-session-recharge-latch'),
      eventId: 'f1-03',
      fiaPuEventInput: fiaSuzukaPuEventInput2026,
      track: { ...suzuka, rainProbability: 0 },
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const targetId = initial.cars[0].driverId
    const released = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: index === 0 ? 0 : null,
        })),
      },
      0.1,
      config,
    )
    const releasedTarget = released.cars.find(
      (car) => car.driverId === targetId,
    )!

    expect(releasedTarget).toMatchObject({
      status: 'running',
      timedRunPhase: 'out-lap',
    })
    expect(f1Runtime(releasedTarget).overtakeRechargeAllowanceActiveThisLap).toBe(false)
    expect(f1Runtime(releasedTarget).energyStore.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 9 },
      ruleId: 'suzuka-out-lap-other-than-race',
      usedMJ: 0,
    })

    const crossed = advanceRace(
      {
        ...released,
        cars: released.cars.map((car) =>
          car.driverId === targetId
            ? {
                ...car,
                lap: 0,
                lapStartedAtSeconds: null,
                processedBattleSegment: Number.MAX_SAFE_INTEGER,
                processedLap: 0,
                progress: 0.999,
                speedKph: 300,
                status: 'running' as const,
                timedRunPhase: 'out-lap' as const,
                totalDistance: 0.999,
              }
            : car,
        ),
      },
      0.5,
      config,
    )
    const crossedTarget = crossed.cars.find(
      (car) => car.driverId === targetId,
    )!

    expect(crossedTarget.processedLap).toBe(1)
    expect(crossedTarget.timedRunPhase).toBe('attack-lap')
    expect(f1Runtime(crossedTarget).energyStore.rechargeRule).toMatchObject({
      limit: { kind: 'finite', maxCuKBusRechargeMj: 8 },
      ruleId: 'suzuka-qualifying',
      usedMJ: 0,
    })
  })

  it('starts a fresh lap energy ledger only when pit release crosses the Line', () => {
    const config = makeConfig('race-pit-release-energy-line')
    const initial = runThroughStart(config)
    const withUsedEnergyLedger = (
      car: RaceSnapshot['cars'][number],
      usedMJ: number,
    ) => {
      const runtime = f1Runtime(car)

      return withF1RuntimeFields(car, {
        energyHarvestedThisLapMj: usedMJ,
        energyStore: {
          ...runtime.energyStore,
        rechargedAtCuKBusThisLapMJ: usedMJ,
        rechargeRule: {
            ...runtime.energyStore.rechargeRule,
          remainingMJ:
              runtime.energyStore.rechargeRule.limit.kind === 'finite'
                ? runtime.energyStore.rechargeRule.limit.maxCuKBusRechargeMj - usedMJ
              : null,
          usedMJ,
        },
        },
        overtakeEnergyRemainingMj: 0.05,
        superClippingRecoveredThisLapMj: Math.min(0.2, usedMJ),
      })
    }
    const pitExitProgress = config.track.pitLane?.exitProgress ?? 0.13
    const beforeLine = withUsedEnergyLedger(initial.cars[0], 1.25)
    const alreadyAfterLine = withUsedEnergyLedger(initial.cars[1], 0.75)
    const initialSurfaceSectors = trackSurfaceSectorSummary(
      canonicalTrackSurfaceFor(initial),
    )
    const forced: RaceSnapshot = {
      ...withCanonicalTrackSurfaceSectors(initial, {
        dryingLineBySector: initialSurfaceSectors.dryingLineBySector,
        rubberLevelBySector: initialSurfaceSectors.rubberLevelBySector,
        surfaceWaterMmBySector: [3, 3, 3],
      }),
      flag: 'sc',
      flagLabel: 'SC',
      flagPhase: {
        endMessage: 'Safety Car in.',
        endSeconds: 1_000,
        flag: 'sc',
        id: 'pit-release-energy-sc',
        lappedCarsMayOvertakeAtSeconds: null,
        sector: 0,
        startMessage: 'Safety Car deployed.',
        startSeconds: 0,
      },
      lowGripConditions: true,
      sectorFlags: ['sc', 'sc', 'sc'],
      trackGrip: 0.55,
      weather: 'heavy-rain',
      cars: initial.cars.map((car, index) => {
        if (index === 0) {
          return {
            ...beforeLine,
            lap: 3,
            pitPhase: 'box' as const,
            pitUntilSeconds: 0,
            processedLap: 3,
            progress: 0.98,
            status: 'pit' as const,
            totalDistance: 3.98,
          }
        }
        if (index === 1) {
          const progress = Math.max(0.001, pitExitProgress - 0.05)
          return {
            ...alreadyAfterLine,
            lap: 4,
            pitPhase: 'box' as const,
            pitUntilSeconds: 0,
            processedLap: 4,
            progress,
            status: 'pit' as const,
            totalDistance: 4 + progress,
          }
        }
        return car
      }),
    }
    const released = advanceRace(forced, 0.1, config)
    const crossed = released.cars[0]
    const sameLap = released.cars[1]

    expect(crossed.processedLap).toBe(4)
    expect(f1Runtime(crossed)).toMatchObject({
      energyHarvestedThisLapMj: 0,
      energyLapStartedBehindSafetyCar: true,
      energyLapStartedInLowGripConditions: true,
      overtakeEnergyRemainingMj: 0.5,
      overtakeRechargeAllowanceActiveThisLap: false,
      superClippingRecoveredThisLapMj: 0,
    })
    expect(f1Runtime(crossed).energyStore.rechargeRule).toMatchObject({
      limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
      resolution: 'technical-low-grip-safety-car',
      usedMJ: 0,
    })
    expect(f1Runtime(sameLap).energyStore.rechargeRule.usedMJ).toBeCloseTo(0.75, 12)
    expect(f1Runtime(sameLap).overtakeEnergyRemainingMj).toBe(0.05)
    expect(f1Runtime(sameLap).superClippingRecoveredThisLapMj).toBe(0.2)
  })

  it('recreates the opening energy ledger from the current grid and rolling-start context', () => {
    const base = makeConfig('formation-current-energy-context')
    const config: RaceConfig = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    const staleEnergyLedger = (
      car: RaceSnapshot['cars'][number],
      usedMJ: number,
    ) => {
      const runtime = f1Runtime(car)
      const rechargeLimit = runtime.energyStore.rechargeRule.limit

      return withF1RuntimeFields(car, {
        energyHarvestedThisLapMj: usedMJ,
        energyStore: {
          ...runtime.energyStore,
          rechargedAtCuKBusThisLapMJ: usedMJ,
          rechargeRule: {
            ...runtime.energyStore.rechargeRule,
            remainingMJ:
              rechargeLimit.kind === 'finite'
                ? rechargeLimit.maxCuKBusRechargeMj - usedMJ
                : null,
            usedMJ,
          },
        },
      })
    }
    const soakTrack = (snapshot: RaceSnapshot): RaceSnapshot => {
      const currentSectors = trackSurfaceSectorSummary(
        canonicalTrackSurfaceFor(snapshot),
      )

      return {
        ...withCanonicalTrackSurfaceSectors(snapshot, {
          dryingLineBySector: [0, 0, 0],
          rubberLevelBySector: currentSectors.rubberLevelBySector,
          surfaceWaterMmBySector: [3, 3, 3],
        }),
        lowGripConditions: true,
        cars: snapshot.cars.map((car) => staleEnergyLedger(car, 1.25)),
      }
    }
    const initial = createInitialRace(config)
    const grid = advanceRace(
      initial,
      initial.formationLapDurationSeconds * initial.formationLapsPlanned,
      config,
    )
    const lights = advanceRace(grid, 8, config)
    const startedFromGrid = advanceRace(soakTrack(lights), 5, config)

    expect(startedFromGrid.startProcedure).toBe('racing')
    expect(startedFromGrid.lowGripConditions).toBe(true)
    startedFromGrid.cars.forEach((car) => {
      expect(f1Runtime(car).energyLapStartedBehindSafetyCar).toBe(false)
      expect(f1Runtime(car).energyLapStartedInLowGripConditions).toBe(true)
      expect(f1Runtime(car).energyStore.rechargeRule).toMatchObject({
        limit: { kind: 'finite', maxCuKBusRechargeMj: 8.5 },
        usedMJ: 0,
      })
      expect(f1Runtime(car).energyStore.rechargedAtCuKBusThisLapMJ).toBe(0)
    })

    const rollingStart = advanceRace(
      {
        ...soakTrack(createInitialRace(config)),
        formationBehindSafetyCar: true,
      },
      initial.formationLapDurationSeconds * initial.formationLapsPlanned,
      config,
    )

    expect(rollingStart.startProcedure).toBe('racing')
    rollingStart.cars.forEach((car) => {
      expect(f1Runtime(car).energyLapStartedBehindSafetyCar).toBe(true)
      expect(f1Runtime(car).energyLapStartedInLowGripConditions).toBe(true)
      expect(f1Runtime(car).energyStore.rechargeRule).toMatchObject({
        limit: { kind: 'unlimited', maxCuKBusRechargeMj: null },
        usedMJ: 0,
      })
    })
  })

  it('resets only reformed cars whose red restart route crosses the Line', () => {
    const base = makeConfig('red-reform-energy-line')
    const config: RaceConfig = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    const started = runThroughStart(config)
    const sameLapId = started.cars[1].driverId
    const crossedLineId = started.cars[2].driverId
    const withUsedLedger = (
      car: RaceSnapshot['cars'][number],
      usedMJ: number,
    ) => {
      const runtime = f1Runtime(car)
      const rechargeLimit = runtime.energyStore.rechargeRule.limit

      return withF1RuntimeFields(car, {
        energyHarvestedThisLapMj: usedMJ,
        overtakeEnergyRemainingMj: 0.05,
        superClippingRecoveredThisLapMj: 0.2,
        energyStore: {
          ...runtime.energyStore,
          rechargedAtCuKBusThisLapMJ: usedMJ,
          rechargeRule: {
            ...runtime.energyStore.rechargeRule,
            remainingMJ:
              rechargeLimit.kind === 'finite'
                ? rechargeLimit.maxCuKBusRechargeMj - usedMJ
                : null,
            usedMJ,
          },
        },
      })
    }
    const redRestart = advanceRace(
      {
        ...started,
        flag: 'red',
        flagLabel: 'RED',
        flagPhase: {
          endMessage: 'Red flag lifted.',
          endSeconds: started.elapsedSeconds,
          flag: 'red',
          id: 'red-reform-energy-line',
          sector: 0,
          startMessage: 'Red flag.',
          startSeconds: started.elapsedSeconds - 10,
        },
        lowGripConditions: false,
        cars: started.cars.map((car, index) => {
          const totalDistance =
            index === 0
              ? 5.1
              : index === 1
                ? 5.05
                : index === 2
                  ? 4.99
                  : 4.98 - (index - 3) * 0.001
          const prepared =
            index === 1
              ? withUsedLedger(car, 0.75)
              : index === 2
                ? withUsedLedger(car, 1.25)
                : car

          return {
            ...prepared,
            lap: Math.floor(totalDistance),
            processedLap: Math.floor(totalDistance),
            progress: totalDistance - Math.floor(totalDistance),
            speedKph: 0,
            status: 'running' as const,
            totalDistance,
          }
        }),
      },
      0.1,
      config,
    )
    const sameLap = redRestart.cars.find(
      (car) => car.driverId === sameLapId,
    )!
    const crossedLine = redRestart.cars.find(
      (car) => car.driverId === crossedLineId,
    )!

    expect(redRestart.restartProcedure).toBe('standing')
    expect(crossedLine.totalDistance).toBeGreaterThan(5)
    expect(crossedLine.processedLap).toBe(5)
    expect(f1Runtime(crossedLine).energyLapStartedBehindSafetyCar).toBe(false)
    expect(f1Runtime(crossedLine).energyLapStartedInLowGripConditions).toBe(false)
    expect(f1Runtime(crossedLine).energyStore.rechargeRule.usedMJ).toBe(0)
    expect(f1Runtime(crossedLine).energyStore.rechargedAtCuKBusThisLapMJ).toBe(0)
    expect(f1Runtime(crossedLine).overtakeEnergyRemainingMj).toBe(0.5)
    expect(f1Runtime(crossedLine).superClippingRecoveredThisLapMj).toBe(0)

    expect(f1Runtime(sameLap).energyStore.rechargeRule.usedMJ).toBeCloseTo(0.75, 12)
    expect(f1Runtime(sameLap).overtakeEnergyRemainingMj).toBe(0.05)
    expect(f1Runtime(sameLap).superClippingRecoveredThisLapMj).toBe(0.2)
  })
})

function f1Runtime(car: CarSnapshot) {
  if (car.runtimeSystems.kind !== 'f1') {
    throw new Error(`Expected F1 runtime for ${car.driverId}`)
  }

  return car.runtimeSystems
}

function withF1RuntimeFields(
  car: CarSnapshot,
  fields: Partial<Omit<ReturnType<typeof f1Runtime>, 'kind'>>,
): CarSnapshot {
  return {
    ...car,
    runtimeSystems: {
      ...f1Runtime(car),
      ...fields,
    },
  }
}

function f1Tires(car: CarSnapshot) {
  return f1Runtime(car).tires
}

function withF1Tires(
  car: CarSnapshot,
  fields: Partial<ReturnType<typeof f1Tires>>,
): CarSnapshot {
  return withF1RuntimeFields(car, {
    tires: {
      ...f1Tires(car),
      ...fields,
    },
  })
}

describe('blue flags', () => {
  it('shows only when a lead car is right on the gearbox of lapping traffic', () => {
    const [leader, backmarker] = createInitialRace(makeConfig('blue-flag')).cars
    const farApproaching = {
      ...leader,
      position: 1,
      totalDistance: 4.91,
    }
    const lapped = {
      ...backmarker,
      position: 20,
      totalDistance: 4,
    }

    expect(
      blueFlagApproachingCarFor(
        lapped,
        [farApproaching, lapped],
        90,
      ),
    ).toBeNull()

    // 0.99 of a lap ahead is 0.01 of a lap from lapping this car: about 0.9s
    // at a 90s reference lap, so the flag is shown.
    const closeApproaching = {
      ...farApproaching,
      totalDistance: 4.99,
    }

    expect(
      blueFlagApproachingCarFor(
        lapped,
        [closeApproaching, lapped],
        90,
      )?.driverId,
    ).toBe(
      closeApproaching.driverId,
    )
    // Still 0.03 of a lap back (2.7s): closing, but not yet on the gearbox.
    expect(
      blueFlagApproachingCarFor(
        lapped,
        [{ ...closeApproaching, totalDistance: 4.97 }, lapped],
        90,
      ),
    ).toBeNull()
    expect(
      blueFlagApproachingCarFor(
        lapped,
        [
          { ...closeApproaching, totalDistance: 5.01 },
          lapped,
        ],
        90,
      ),
    ).toBeNull()

    expect(
      blueFlagApproachingCarFor(
        lapped,
        [
          { ...closeApproaching, totalDistance: 5.988 },
          lapped,
        ],
        90,
      )?.driverId,
    ).toBe(closeApproaching.driverId)
  })
})

function runToFinish(
  config: RaceConfig,
  dt = 0.5,
  maxSteps = 40000,
): { snapshot: RaceSnapshot; seenEventKinds: Set<string> } {
  let snapshot = createInitialRace(config)
  let steps = 0
  const seenEventKinds = new Set<string>()

  while (snapshot.sessionStatus !== 'finished' && steps < maxSteps) {
    snapshot = advanceRace(snapshot, dt, config)
    for (const event of snapshot.events) {
      seenEventKinds.add(event.kind)
    }
    steps += 1
  }

  return { snapshot, seenEventKinds }
}

describe('determinism', () => {
  it(
    'produces identical snapshots for the same seed and step pattern',
    () => {
      const a = runSteps(makeConfig('repeat-me'), 1200, 1)
      const b = runSteps(makeConfig('repeat-me'), 1200, 1)

      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    },
    40_000,
  )

  it(
    'produces different races for different seeds',
    () => {
      const a = runSteps(makeConfig('seed-one'), 1200, 1)
      const b = runSteps(makeConfig('seed-two'), 1200, 1)

      expect(JSON.stringify(a.cars.map((car) => car.driverId))).not.toBe(
        JSON.stringify(b.cars.map((car) => car.driverId)),
      )
    },
    40_000,
  )
})

describe('steward decisions', () => {
  it('resolves a contact investigation into a deterministic decision', () => {
    const config = makeConfig('steward-resolution')
    const initial = createInitialRace(config)
    const investigation = {
      elapsedSeconds: 0,
      id: `investigation-contact-${initial.cars[0].driverId}-${initial.cars[1].driverId}-99`,
      kind: 'investigation' as const,
      message: 'Contact under investigation.',
      timeLabel: '0:00',
    }
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                stewardNote: 'Contact under review',
                stewardStatus: 'investigating' as const,
              }
            : car,
        ),
        elapsedSeconds: 40,
        events: [investigation, ...initial.events],
        stewardCases: [
          {
            id: investigation.id,
            openedAtSeconds: 0,
            resolveAtSeconds: 22,
            driverId: initial.cars[0].driverId,
            otherDriverId: initial.cars[1].driverId,
            offence: 'causing-collision',
            article: 'ISC App. L Ch. IV 2(d)',
            responsibilityShare: 0.7,
            consequence: 'significant',
          },
        ],
        startProcedure: 'racing',
        startProcedureRemainingSeconds: 0,
      },
      0.5,
      config,
    )

    expect(
      snapshot.events.some(
        (event) => event.id === `decision-${investigation.id}`,
      ),
    ).toBe(true)
    const investigatedCar = snapshot.cars.find(
      (car) => car.driverId === initial.cars[0].driverId,
    )!
    expect(investigatedCar.stewardStatus).not.toBe('investigating')
    expect(investigatedCar.penaltyPoints).toBe(2)
  })

  it('fails closed for FIA/ISC automatic stewarding in SUPER FORMULA', () => {
    const series = seriesPackageById.get('super-formula')

    if (!series) {
      throw new Error('Missing SUPER FORMULA series package.')
    }

    const config: RaceConfig = {
      drivers: series.drivers,
      overtakeSystem: 'ots',
      seed: 'sf-steward-points-are-not-article-5',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
      teams: series.teams,
      track: series.tracks[0],
      weekendStage: 'race',
    }
    const initial = createInitialRace(config)
    const investigation = {
      elapsedSeconds: 0,
      id: `investigation-sf-contact-${initial.cars[0].driverId}-${initial.cars[1].driverId}`,
      kind: 'investigation' as const,
      message: 'Contact under investigation.',
      timeLabel: '0:00',
    }
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                stewardNote: 'Contact under review',
                stewardStatus: 'investigating' as const,
              }
            : car,
        ),
        elapsedSeconds: 40,
        events: [investigation, ...initial.events],
        stewardCases: [
          {
            id: investigation.id,
            openedAtSeconds: 0,
            resolveAtSeconds: 22,
            driverId: initial.cars[0].driverId,
            otherDriverId: initial.cars[1].driverId,
            offence: 'causing-collision',
            article: 'ISC App. L Ch. IV 2(d)',
            responsibilityShare: 0.7,
            consequence: 'significant',
          },
        ],
        startProcedure: 'racing',
        startProcedureRemainingSeconds: 0,
      },
      0.5,
      config,
    )
    const investigatedCar = snapshot.cars.find(
      (car) => car.driverId === initial.cars[0].driverId,
    )!

    expect(investigatedCar.runtimeSystems.kind).toBe('super-formula')
    expect(investigatedCar.penaltySeconds).toBe(0)
    expect(investigatedCar.penaltyPoints).toBe(0)
    expect(investigatedCar.penalties).toEqual([])
    expect(snapshot.stewardCases).toEqual([])
    const review = snapshot.events.find(
      (event) => event.id === `decision-${investigation.id}`,
    )
    expect(review).toMatchObject({ kind: 'investigation' })
    expect(review?.message).not.toMatch(/\b(?:FIA|ISC)\b/u)
    expect(review?.message).toContain('official event decision required')
  })
})

describe('starting grid', () => {
  it('starts every car on the home-straight grid before the race unfolds', () => {
    const config = makeConfig('grid-start')
    const lapLengthM = config.track.lengthKm * 1000
    const snapshot = createInitialRace(config)

    snapshot.cars.forEach((car, index) => {
      expect(car.totalDistance).toBeCloseTo(
        startingGridDistance(index, lapLengthM),
        10,
      )
      expect(car.progress).toBeCloseTo(
        startingGridDistance(index, lapLengthM) % 1,
        10,
      )
    })
    expect(snapshot.cars.every((car) => car.status === 'running')).toBe(true)
  })

  it('starts every car with a fully charged Energy Store', () => {
    const config = makeConfig('full-start-energy')
    const snapshot = createInitialRace(config)
    const lightsOut = runThroughStart(config, snapshot)
    const raceStates = [snapshot, lightsOut]

    raceStates.forEach((raceState) => {
      raceState.cars.forEach((car) => {
        expect(f1Runtime(car).ersBatteryPercent).toBe(100)
        expect(f1Runtime(car).energyStore.stateOfCharge).toBe(1)
        expect(f1Runtime(car).energyStore.currentEnergyMJ).toBeCloseTo(
          f1Runtime(car).energyStore.maximumUsableEnergyMJ,
          10,
        )
      })
    })
  })

  it('skips the remaining formation lap into the normal grid and lights sequence', () => {
    const base = makeConfig('skip-formation')
    const config: RaceConfig = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    const initial = createInitialRace(config)
    const partiallyCompleted = advanceRace(initial, 12, config)
    const skipped = skipFormationLap(partiallyCompleted, config)
    const gridStartsAt =
      partiallyCompleted.formationLapDurationSeconds *
      partiallyCompleted.formationLapsPlanned
    let manual = partiallyCompleted
    let remainingSeconds = Math.max(
      0.001,
      gridStartsAt - partiallyCompleted.elapsedSeconds,
    )
    while (
      remainingSeconds > 0 &&
      manual.sessionStatus !== 'finished' &&
      manual.startProcedure === 'formation'
    ) {
      const stepSeconds = Math.min(3, remainingSeconds)
      manual = advanceRace(manual, stepSeconds, config)
      remainingSeconds -= stepSeconds
    }

    expect(partiallyCompleted.startProcedure).toBe('formation')
    expect(skipped.startProcedure).toBe('grid')
    expect(skipped.trackSurface).toEqual(manual.trackSurface)
    expect(trackSurfaceSectorSummary(skipped.trackSurface)).toEqual(
      trackSurfaceSectorSummary(manual.trackSurface),
    )
    expect(skipped.formationLapsCompleted).toBe(skipped.formationLapsPlanned)
    expect(skipped.raceStartedAtSeconds).toBeNull()
    expect(skipped.cars.every((car) => car.lapHistory.length === 0)).toBe(true)
    skipped.cars.forEach((car, index) => {
      expect(car.totalDistance).toBeCloseTo(startingGridDistance(index, config.track.lengthKm * 1000), 10)
      expect(car.speedKph).toBe(0)
    })

    const lights = advanceRace(skipped, 8, config)
    expect(lights.startProcedure).toBe('lights')
    expect(advanceRace(lights, 5, config).startProcedure).toBe('racing')
  })

  it('ignores formation skipping after the race has started', () => {
    const config = makeConfig('skip-formation-idempotent')
    const racing = runThroughStart(config)

    expect(skipFormationLap(racing, config)).toBe(racing)
  })

  it('launches every grid row from rest through the live drivetrain', () => {
    const base = makeConfig('simultaneous-grid-launch')
    const config = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    let snapshot = createInitialRace(config)
    const formationSeconds =
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

    snapshot = advanceRace(snapshot, formationSeconds, config)
    snapshot = advanceRace(snapshot, 8, config)
    expect(snapshot.startProcedure).toBe('lights')
    const lightsOut = advanceRace(snapshot, 5, config)
    const onGrid = lightsOut.cars.filter((car) => !car.startsFromPitLane)

    expect(lightsOut.startProcedure).toBe('racing')
    // Lights-out changes control state only. The following physics tick, not a
    // seeded speed assignment, produces the launch from clutch slip and torque.
    expect(onGrid.every((car) => car.speedKph === 0)).toBe(true)
    expect(onGrid.every((car) => car.gear === 1 && car.rpm > 0)).toBe(true)
    expect(
      onGrid.every(
        (car) => f1Runtime(car).standingStartMguKReleaseLatched === false,
      ),
    ).toBe(true)
    expect(
      onGrid.every(
        (car) =>
          Number.isFinite(car.turboSpoolFraction ?? Number.NaN) &&
          (car.turboSpoolFraction ?? 0) > 0 &&
          car.clutchEngagementFraction === 0,
      ),
    ).toBe(true)
    expect(
      new Set(onGrid.map((car) => car.lapStartedAtSeconds)).size,
    ).toBe(1)

    const distanceAtLightsOut = new Map(
      onGrid.map((car) => [car.driverId, car.totalDistance]),
    )
    const launched = advanceRace(lightsOut, 0.25, config)

    launched.cars
      .filter((car) => !car.startsFromPitLane)
      .forEach((car) => {
        expect(Number.isFinite(car.speedKph)).toBe(true)
        expect(car.speedKph).toBeGreaterThan(0)
        expect(car.gear).toBeGreaterThanOrEqual(1)
        expect(car.rpm).toBeGreaterThan(0)
        expect(car.totalDistance).toBeGreaterThan(
          distanceAtLightsOut.get(car.driverId)!,
        )
        if (car.speedKph < 50) {
          expect(f1Runtime(car).ersPowerKw).toBe(0)
          expect(f1Runtime(car).standingStartMguKReleaseLatched).toBe(false)
        }
      })

    let releaseCheck = launched
    for (
      let step = 0;
      step < 30 &&
      !releaseCheck.cars.some(
        (car) => f1Runtime(car).standingStartMguKReleaseLatched === true,
      );
      step += 1
    ) {
      releaseCheck = advanceRace(releaseCheck, 0.25, config)
    }
    expect(
      releaseCheck.cars.some(
        (car) =>
          !car.startsFromPitLane &&
          car.speedKph >= 50 &&
          f1Runtime(car).standingStartMguKReleaseLatched === true,
      ),
    ).toBe(true)
  })

  it('does not treat a seeded low-power start as an SECU safety exception', () => {
    const base = makeConfig('low-power-is-not-secu')
    const config = {
      ...base,
      track: { ...base.track, rainProbability: 0 },
    }
    const lightsOut = runThroughStart(config)
    const target = lightsOut.cars.find((car) => !car.startsFromPitLane)!
    const flagged = {
      ...lightsOut,
      cars: lightsOut.cars.map((car) =>
        car.driverId === target.driverId
          ? withF1RuntimeFields({
              ...car,
              lowPowerStartDetected: true,
              speedKph: 0,
            }, { standingStartMguKReleaseLatched: false })
          : car,
      ),
    }
    const advanced = advanceRace(flagged, 0.1, config)
    const gated = advanced.cars.find(
      (car) => car.driverId === target.driverId,
    )!

    expect(gated.lowPowerStartDetected).toBe(true)
    expect(gated.speedKph).toBeLessThan(50)
    expect(f1Runtime(gated).ersPowerKw).toBe(0)
    expect(f1Runtime(gated).standingStartMguKReleaseLatched).toBe(false)
  })

  it('does not send cars straight into the pits on the opening tour', () => {
    const snapshot = runSteps(makeConfig('no-opening-pit'), 30, 0.5)

    expect(snapshot.cars.some((car) => car.status === 'pit')).toBe(false)
    expect(snapshot.events.some((event) => event.kind === 'pit')).toBe(false)
  })

  it('rejects a wet-weather starting compound on a dry track', () => {
    const base = makeConfig('dry-start-category')
    const config: RaceConfig = {
      ...base,
      drivers: base.drivers.map((driver, index) => ({
        ...driver,
        tire: index % 2 === 0 ? 'I' : 'W',
      })),
      track: { ...base.track, rainProbability: 0 },
    }
    const snapshot = createInitialRace(config)

    expect(snapshot.cars.every((car) => isDryCompound(f1Tires(car).tire))).toBe(true)
  })

  it('uses a Safety Car formation and compulsory wets in severe rain', () => {
    const track = { ...tracks[0], rainProbability: 0.75 }
    const seed = Array.from({ length: 5000 }, (_, index) => `wet-start-${index}`).find(
      (candidate) => weatherFor(candidate, track, 0) === 'heavy-rain',
    )

    expect(seed).toBeDefined()

    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: seed!,
      teams: initialTeams,
      track,
    }
    const initial = createInitialRace(config)

    expect(initial.formationBehindSafetyCar).toBe(true)
    expect(initial.wetWeatherTyresMandatory).toBe(true)
    expect(initial.flag).toBe('sc')
    expect(initial.sectorFlags).toEqual(['sc', 'sc', 'sc'])
    expect(initial.lowGripConditions).toBe(true)
    expect(initial.overtakeEnabled).toBe(false)
    expect(initial.cars.every((car) => f1Tires(car).tire === 'W')).toBe(true)

    const rollingStart = advanceRace(
      initial,
      initial.formationLapDurationSeconds * initial.formationLapsPlanned,
      config,
    )

    expect(rollingStart.startProcedure).toBe('racing')
    expect(rollingStart.sectorFlags).toEqual(['clear', 'clear', 'clear'])
    expect(rollingStart.wetWeatherTyresMandatory).toBe(false)
    expect(rollingStart.eventMessage).toContain('ROLLING START')
  })

  it('does not treat normal brake-temperature peaks as an early pit trigger', () => {
    const baseConfig = makeConfig('no-early-brake-stop')
    const config = {
      ...baseConfig,
      track: { ...baseConfig.track, rainProbability: 0 },
    }
    let snapshot = runThroughStart(config)

    for (let step = 0; step < 900 && snapshot.leaderLap < 15; step += 1) {
      snapshot = advanceRace(snapshot, 3, config)
    }

    const brakeStops = snapshot.events.filter(
      (event) => event.kind === 'pit' && event.message.includes('brake-cooling'),
    )
    const cleanLapTimes = snapshot.cars.flatMap((car) =>
      car.lapHistory
        .filter((lap) => lap.isValid && !lap.pitStop && lap.lap >= 3)
        .map((lap) => lap.lapTimeSeconds),
    )
    const fastestCleanLap = Math.min(...cleanLapTimes)
    const routineWearStops = snapshot.events.filter(
      (event) =>
        event.kind === 'pit' &&
        /\(\d+(?:\.\d+)?s, wear(?:,|\))/u.test(event.message),
    )

    expect(brakeStops).toHaveLength(0)
    // This test guards pit decisions, not an authored lap-time calibration.
    // Live pace is now force-derived and must not be bounded by baseLapTime.
    expect(Number.isFinite(fastestCleanLap)).toBe(true)
    expect(fastestCleanLap).toBeGreaterThan(40)
    expect(routineWearStops.length).toBeLessThan(snapshot.cars.length / 2)
  // Synchronous full-field physics varies substantially with host load. The
  // assertions are the regression gate; this is not a wall-clock benchmark.
  }, 180_000)

  it(
    'times a race out-lap from the line so the pit lane is never a free sector',
    () => {
      const config = makeConfig('out-lap-timing')
      let snapshot = runThroughStart(config)

      for (let tick = 0; tick < 4_000 && snapshot.leaderLap < 25; tick += 1) {
        snapshot = advanceRace(snapshot, 1, config)
      }

      const outLaps = snapshot.cars.flatMap((car) =>
        car.lapHistory.flatMap((lap, index) => {
          const previous = car.lapHistory[index - 1]

          return previous?.pitStop && !lap.pitStop ? [{ car, lap, previous }] : []
        }),
      )

      expect(outLaps.length).toBeGreaterThan(0)

      for (const { car, lap } of outLaps) {
        const greenLaps = car.lapHistory.filter(
          (candidate) =>
            candidate.isValid &&
            !candidate.pitStop &&
            candidate.lap !== lap.lap &&
            candidate.lap > 1,
        )

        if (greenLaps.length === 0) {
          continue
        }

        const fastestGreen = Math.min(
          ...greenLaps.map((candidate) => candidate.lapTimeSeconds),
        )
        const fastestGreenFirstSector = Math.min(
          ...greenLaps.map((candidate) => candidate.sectors[0]),
        )

        // The out-lap starts at the timing line, so it carries the pit-lane
        // exit run. It must never be the quickest lap of the run, and its first
        // sector must never be the quickest first sector.
        expect(lap.lapTimeSeconds).toBeGreaterThan(fastestGreen)
        expect(lap.sectors[0]).toBeGreaterThan(fastestGreenFirstSector)
      }
    },
    180_000,
  )

  it('stages routine green-flag stops instead of sending the field together', () => {
    const baseConfig = makeConfig('staggered-pit-window')
    const config = {
      ...baseConfig,
      track: { ...baseConfig.track, rainProbability: 0 },
    }
    const started = runThroughStart(config)
    const staged: RaceSnapshot = {
      ...started,
      cars: started.cars.map((car, index) => withF1Tires({
        ...car,
        totalDistance: 9.999 - index * 0.00001,
        lap: 9,
        progress: 0.999 - index * 0.00001,
        processedLap: 9,
        brakeTemperatureC: 760,
        brakeOverheatSeconds: 0,
        damage: 0,
        gapToAhead: index === 0 ? 0 : 1.8,
        gapToLeader: index * 1.8,
      }, {
        tire: 'S',
        tireAgeLaps: 17,
        tireWearPercent: 82,
      })),
    }
    const next = advanceRace(staged, 1, config)
    const routinePitting = next.cars.filter(
      (car) =>
        car.status === 'pit' &&
        car.damage < pitTuning.damagePitThreshold &&
        car.brakeOverheatSeconds < pitTuning.brakeOverheatPitSeconds &&
        f1Tires(car).tireWearPercent < 88,
    )

    expect(routinePitting.length).toBeLessThanOrEqual(
      pitTuning.normalPitLaneCapacity,
    )
    expect(new Set(routinePitting.map((car) => car.teamId)).size).toBe(
      routinePitting.length,
    )
  })

  it(
    'keeps the default early weather crossover and VSC response credible',
    () => {
      const config = makeConfig('phase-2-default')
      let snapshot = runThroughStart(config)
      let maximumCarsInPit = 0

      for (let tick = 0; tick < 1_800 && snapshot.leaderLap < 8; tick += 1) {
        snapshot = advanceRace(snapshot, 0.5, config)
        maximumCarsInPit = Math.max(
          maximumCarsInPit,
          snapshot.cars.filter((car) => car.status === 'pit').length,
        )
      }

      const vscPenalties = snapshot.cars.flatMap((car) =>
        car.penalties.filter((penalty) =>
          penalty.reason.startsWith('Exceeding the VSC'),
        ),
      )

      expect(maximumCarsInPit).toBeLessThan(snapshot.cars.length / 2)
      expect(vscPenalties.length).toBeLessThanOrEqual(2)
    },
    15_000,
  )

  it('starts practice from pit boxes and releases cars on staggered run plans', () => {
    const config = { ...makeConfig('fp-pit-release'), weekendStage: 'fp1' as const }
    let snapshot = createInitialRace(config)

    expect(snapshot.cars.every((car) => car.status === 'pit')).toBe(true)

    for (let step = 0; step < 90; step += 1) {
      snapshot = advanceRace(snapshot, 5, config)
    }

    expect(snapshot.cars.some((car) => car.status === 'running')).toBe(true)
    expect(
      new Set(
        snapshot.cars
          .map((car) => car.timedRunStartedAtSeconds)
          .filter((value): value is number => value !== null)
          .map((value) => value.toFixed(1)),
      ).size,
    ).toBeGreaterThan(1)
  })

  it('streams a healthy practice field out early with pit-exit spacing', () => {
    const config = {
      ...makeConfig('fp-early-stream'),
      weekendStage: 'fp1' as const,
    }
    let snapshot = createInitialRace(config)
    const starts = new Map<string, number>()

    for (let second = 0; second < 180; second += 1) {
      snapshot = advanceRace(snapshot, 1, config)

      snapshot.cars.forEach((car) => {
        if (car.timedRunStartedAtSeconds !== null && !starts.has(car.driverId)) {
          starts.set(car.driverId, car.timedRunStartedAtSeconds)
        }
      })
    }

    const startTimes = [...starts.values()].sort((left, right) => left - right)
    const minimumSpacing = Math.min(
      ...startTimes.slice(1).map((time, index) => time - startTimes[index]),
    )

    expect(starts.size).toBe(config.drivers.length)
    expect(startTimes[0]).toBeLessThan(60)
    expect(startTimes[startTimes.length - 1]).toBeLessThan(150)
    expect(minimumSpacing).toBeGreaterThanOrEqual(2)
  })

  it('finishes timed practice by clock instead of race distance', () => {
    const config = { ...makeConfig('fp-clock'), weekendStage: 'fp2' as const }
    let snapshot = createInitialRace(config)

    // The clock stops new laps at 60 minutes, while a lap started before the
    // chequered flag may still be completed.
    for (let step = 0; step < 78 && snapshot.sessionStatus !== 'finished'; step += 1) {
      snapshot = advanceRace(snapshot, 50, config)
    }

    expect(snapshot.sessionStatus).toBe('finished')
    expect(snapshot.eventMessage).toContain('FP2 complete')
  })
})

describe('CPU timing lines', () => {
  it('reports the speed implied by actual centerline travel', () => {
    const driver = initialDrivers[0]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const config: RaceConfig = {
      ...makeConfig('physical-speed-readout'),
      drivers: [driver],
      teams: [team],
      track: { ...tracks[0], rainProbability: 0 },
    }
    const before = runThroughStart(config)
    const deltaSeconds = 0.25
    const after = advanceRace(before, deltaSeconds, config)
    const beforeCar = before.cars[0]
    const afterCar = after.cars[0]
    const travelSpeedKph = speedForProfileTravelKph(
      config.track,
      beforeCar.totalDistance,
      afterCar.totalDistance,
      deltaSeconds,
    )

    expect(afterCar.speedKph).toBeCloseTo(travelSpeedKph, 2)
  })

  it('starts with no invented lap or sector times', () => {
    const snapshot = createInitialRace(makeConfig('timing-placeholders'))

    expect(
      snapshot.cars.every(
        (car) =>
          car.lastLapTimeSeconds === null &&
          car.bestLapTimeSeconds === null &&
          car.currentLapSectorTimes.every((sector) => sector === null) &&
          car.currentLapMiniSectorTimes.length === 24 &&
          car.currentLapMiniSectorTimes.every((sector) => sector === null) &&
          car.lapHistory.length === 0,
      ),
    ).toBe(true)
  })

  it('locks sectors at CPU crossings and builds the lap from those crossings', () => {
    const driver = initialDrivers[0]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const config: RaceConfig = {
      ...makeConfig('measured-timing-lines'),
      drivers: [driver],
      teams: [team],
      track: { ...tracks[0], rainProbability: 0 },
    }
    const driverId = driver.id
    const deltaSeconds = 0.1
    let previous = runThroughStart(config)
    let measuredS1: number | null = null
    let snapshot = previous

    for (let step = 0; step < 2_000 && measuredS1 === null; step += 1) {
      snapshot = advanceRace(previous, deltaSeconds, config)
      const previousCar = previous.cars.find((car) => car.driverId === driverId)!
      const currentCar = snapshot.cars.find((car) => car.driverId === driverId)!
      const boundary =
        Math.floor(previousCar.totalDistance) + config.track.sectorMarks[1]

      if (
        previousCar.totalDistance <= boundary &&
        currentCar.totalDistance >= boundary
      ) {
        const crossingFraction =
          (boundary - previousCar.totalDistance) /
          (currentCar.totalDistance - previousCar.totalDistance)
        const expectedS1 =
          previous.elapsedSeconds + deltaSeconds * crossingFraction -
          previousCar.lapStartedAtSeconds!

        measuredS1 = currentCar.currentLapSectorTimes[0]
        expect(measuredS1).toBeCloseTo(expectedS1, 6)
      }

      previous = snapshot
    }

    expect(measuredS1).not.toBeNull()

    const measuredMiniSector = snapshot.cars.find(
      (car) => car.driverId === driverId,
    )!.currentLapMiniSectorTimes[0]
    expect(measuredMiniSector).not.toBeNull()

    snapshot = advanceRace(snapshot, 0.05, config)
    const snapshotAfterCrossing = snapshot.cars.find(
      (car) => car.driverId === driverId,
    )!
    expect(snapshotAfterCrossing.currentLapSectorTimes[0]).toBe(measuredS1)
    expect(snapshotAfterCrossing.currentLapMiniSectorTimes[0]).toBe(
      measuredMiniSector,
    )

    for (
      let step = 0;
      step < 2_000 &&
      snapshot.cars.find((car) => car.driverId === driverId)!.lapHistory
        .length === 0;
      step += 1
    ) {
      snapshot = advanceRace(snapshot, deltaSeconds, config)
    }

    const completedLap = snapshot.cars.find(
      (car) => car.driverId === driverId,
    )!.lapHistory[0]

    expect(completedLap).toBeDefined()
    expect(completedLap.sectors[0]).toBeCloseTo(measuredS1!, 6)
    expect(completedLap.sectors[1]).toBeGreaterThan(0)
    expect(completedLap.sectors[2]).toBeGreaterThan(0)
    expect(
      completedLap.sectors.reduce((sum, sector) => sum + sector, 0),
    ).toBeCloseTo(completedLap.lapTimeSeconds, 8)
    expect(completedLap.miniSectors).toHaveLength(24)
    expect(completedLap.miniSectors?.every((sector) => sector > 0)).toBe(true)
    const completedMiniSectors = completedLap.miniSectors!
    expect(
      completedMiniSectors.reduce((sum, sector) => sum + sector, 0),
    ).toBeCloseTo(completedLap.lapTimeSeconds, 6)
  })

  it('moves lap-one provisional purple from the first car to a faster follower', () => {
    const skillsAt = (driver: (typeof initialDrivers)[number], value: number) =>
      Object.fromEntries(
        Object.keys(driver.skills).map((key) => [key, value]),
      ) as typeof driver.skills
    const slowDriver = {
      ...initialDrivers[0],
      skills: skillsAt(initialDrivers[0], 0.9),
    }
    const fastDriver = {
      ...initialDrivers[2],
      skills: skillsAt(initialDrivers[2], 1),
    }
    const slowTeam = {
      ...initialTeams.find((team) => team.id === slowDriver.teamId)!,
      machine: Object.fromEntries(
        Object.keys(initialTeams[0].machine).map((key) => [key, 0.95]),
      ) as Team['machine'],
    }
    const fastTeam = {
      ...initialTeams.find((team) => team.id === fastDriver.teamId)!,
      machine: Object.fromEntries(
        Object.keys(initialTeams[0].machine).map((key) => [key, 0.95]),
      ) as Team['machine'],
    }
    const config: RaceConfig = {
      ...makeConfig('lap-one-provisional-purple'),
      drivers: [slowDriver, fastDriver],
      teams: [slowTeam, fastTeam],
      track: { ...tracks[0], rainProbability: 0 },
    }
    let snapshot = runThroughStart(config)
    const firstCrossingByMiniSector: Array<{
      driverId: string
      time: number
    } | null> = Array.from({ length: 24 }, () => null)
    let transition:
      | { followerTime: number; leaderTime: number; miniSectorIndex: number }
      | null = null

    for (let tick = 0; tick < 10_000 && transition === null; tick += 1) {
      snapshot = advanceRace(snapshot, 0.01, config)
      const slowCar = snapshot.cars.find(
        (car) => car.driverId === slowDriver.id,
      )!
      const fastCar = snapshot.cars.find(
        (car) => car.driverId === fastDriver.id,
      )!

      for (let miniSectorIndex = 0; miniSectorIndex < 24; miniSectorIndex += 1) {
        const slowTime = slowCar.currentLapMiniSectorTimes[miniSectorIndex]
        const fastTime = fastCar.currentLapMiniSectorTimes[miniSectorIndex]

        if (firstCrossingByMiniSector[miniSectorIndex] === null) {
          if (slowTime !== null && fastTime === null) {
            firstCrossingByMiniSector[miniSectorIndex] = {
              driverId: slowDriver.id,
              time: slowTime,
            }
          } else if (fastTime !== null && slowTime === null) {
            firstCrossingByMiniSector[miniSectorIndex] = {
              driverId: fastDriver.id,
              time: fastTime,
            }
          }
        }

        const first = firstCrossingByMiniSector[miniSectorIndex]

        if (
          first?.driverId === slowDriver.id &&
          slowTime !== null &&
          fastTime !== null &&
          fastTime < slowTime
        ) {
          transition = {
            followerTime: fastTime,
            leaderTime: slowTime,
            miniSectorIndex,
          }
          break
        }
      }
    }

    expect(transition).not.toBeNull()
    expect(transition!.miniSectorIndex).toBeGreaterThanOrEqual(0)
    expect(
      classifySectorTime(
        transition!.leaderTime,
        transition!.leaderTime,
        transition!.leaderTime,
      ),
    ).toBe(
      'overall-best',
    )
    const overallBest = bestSectorTime([
      transition!.leaderTime,
      transition!.followerTime,
    ])

    expect(
      classifySectorTime(
        transition!.leaderTime,
        overallBest,
        transition!.leaderTime,
      ),
    ).toBe(
      'personal-best',
    )
    expect(
      classifySectorTime(
        transition!.followerTime,
        overallBest,
        transition!.followerTime,
      ),
    ).toBe('overall-best')
  })
})

describe('weekend grid penalties', () => {
  it('moves an over-allocation penalty down the race grid', () => {
    const context = createWeekendContext(initialDrivers)
    context.gridByStage.race = initialDrivers.map((driver) => driver.id)
    context.gridPenaltyByDriver[initialDrivers[0].id] = 10

    const grid = applyWeekendGrid(initialDrivers, context, 'race')!

    expect(grid.findIndex((driver) => driver.id === initialDrivers[0].id)).toBe(
      10,
    )
    expect(grid[0].id).toBe(initialDrivers[1].id)
  })
})

describe('physical running order', () => {
  it('consumes resolved battle losses without creating super-physical speed', () => {
    expect(battleTravelAdjustment(1.2, 0.4)).toEqual({
      appliedSeconds: 0,
      nextRemainingSeconds: 0,
      travelSeconds: 0.4,
    })
    const loss = battleTravelAdjustment(-1.2, 0.4)
    expect(loss.appliedSeconds).toBeCloseTo(-0.2, 10)
    expect(loss.nextRemainingSeconds).toBeCloseTo(-1, 10)
    expect(loss.travelSeconds).toBeCloseTo(0.2, 10)
    expect(battleTravelAdjustment(Number.NaN, 0.4)).toEqual({
      appliedSeconds: 0,
      nextRemainingSeconds: 0,
      travelSeconds: 0.4,
    })
  })

  it('pays a completed pass gain through the conceding defender', () => {
    expect(
      defenderBattleTimeLossSeconds({
        attackerTimeGainSeconds: 0.72,
        defenderTimeLossSeconds: 0,
        kind: 'pass',
      }),
    ).toBeCloseTo(0.72, 10)
    expect(
      defenderBattleTimeLossSeconds({
        attackerTimeGainSeconds: 0,
        defenderTimeLossSeconds: 0,
        kind: 'defended',
      }),
    ).toBe(0)
  })

  it('keeps penalties and baseLapTime out of physical on-track gaps', () => {
    const config = makeConfig('pending-penalty-physical-order')
    const initial = createInitialRace(config)
    const cars = initial.cars.map((car, index) => {
      const totalDistance = 10 - index * 0.02

      return {
        ...car,
        gapToAhead: 0,
        lap: Math.floor(totalDistance),
        penaltySeconds: index === 0 ? 10 : 0,
        position: index + 1,
        progress: totalDistance - Math.floor(totalDistance),
        speedKph: index === 0 ? 180 : 170,
        status: 'running' as const,
        totalDistance,
      }
    })
    const ranked = rankCars(cars, config)
    const changedObservation = rankCars(cars, {
      ...config,
      track: {
        ...config.track,
        baseLapTime: config.track.baseLapTime * 1.8,
      },
    })
    const expectedGapSeconds =
      (config.track.lengthKm * 1000 * 0.02) / ((180 + 170) / 7.2)

    expect(ranked[0].driverId).toBe(cars[0].driverId)
    expect(ranked[0].position).toBe(1)
    expect(ranked[0].liveDisplayPosition).toBe(1)
    expect(ranked[1].gapToAhead).toBeCloseTo(expectedGapSeconds, 6)
    expect(changedObservation[1].gapToAhead).toBeCloseTo(
      ranked[1].gapToAhead,
      10,
    )
  })

  it('labels GAP and INT from the latest shared measured mini-sector', () => {
    const config = makeConfig('measured-mini-sector-gaps')
    const initial = createInitialRace(config)
    const measured = (
      intervals: number[],
    ): CarSnapshot['currentLapMiniSectorTimes'] => [
      ...intervals,
      ...Array.from({ length: 24 - intervals.length }, () => null),
    ]
    const cars = initial.cars.slice(0, 3).map((car, index) => {
      const totalDistance = 2.2 - index * 0.001
      const timing = [
        { intervals: [4, 4, 4, 4], lapStart: 100 },
        { intervals: [4.1, 3.9, 4.2], lapStart: 101.2 },
        { intervals: [4, 4.1, 4.1], lapStart: 102 },
      ][index]

      return {
        ...car,
        currentLapMiniSectorTimes: measured(timing.intervals),
        lap: 2,
        lapStartedAtSeconds: timing.lapStart,
        progress: totalDistance - 2,
        speedKph: 300 - index * 10,
        status: 'running' as const,
        totalDistance,
      }
    })

    const ranked = rankCars(cars, config)

    // The latest checkpoint shared by all three cars is mini-sector 3. Its
    // absolute passage times are 112.0, 113.4 and 114.2 seconds respectively.
    expect(ranked[1].gapToLeaderLabel).toBe('+1.4s')
    expect(ranked[1].gapToAheadLabel).toBe('+1.4s')
    expect(ranked[2].gapToLeaderLabel).toBe('+2.2s')
    expect(ranked[2].gapToAheadLabel).toBe('+0.8s')

    // Physics still sees the instantaneous road distance for battles, while
    // timing labels stay frozen until both cars cross another timing line.
    expect(ranked[1].gapToAhead).not.toBeCloseTo(1.4, 1)
    const movedBetweenLines = rankCars(
      cars.map((car, index) => ({
        ...car,
        speedKph: 180 + index * 50,
        totalDistance: car.totalDistance - index * 0.0003,
      })),
      config,
    )
    expect(movedBetweenLines[1].gapToAheadLabel).toBe('+1.4s')
    expect(movedBetweenLines[2].gapToAheadLabel).toBe('+0.8s')
  })

  it('keeps the preceding lap mini-sector available across the timing line', () => {
    const config = makeConfig('mini-sector-gap-across-line')
    const [leader, follower] = createInitialRace(config).cars.slice(0, 2)
    const leaderMiniSectors = Array.from({ length: 24 }, () => 3.5)
    const followerCurrentMiniSectors = [
      ...Array.from({ length: 20 }, () => 3.5),
      ...Array.from({ length: 4 }, () => null),
    ]
    const cars: CarSnapshot[] = [
      {
        ...leader,
        currentLapMiniSectorTimes: [
          3.5,
          ...Array.from({ length: 23 }, () => null),
        ],
        lap: 3,
        lapHistory: [
          {
            lap: 1,
            lapTimeSeconds: 84,
            sectors: [28, 28, 28],
            miniSectors: leaderMiniSectors,
            tireRun: {
              ageLaps: 1,
              compound: 'M',
              kind: 'f1-pirelli',
            },
            weather: 'clear',
            trackGrip: 1,
            position: 1,
            pitStop: false,
            isValid: true,
            invalidReason: null,
          },
        ],
        lapStartedAtSeconds: 184,
        progress: 0.04,
        status: 'running',
        totalDistance: 3.04,
      },
      {
        ...follower,
        currentLapMiniSectorTimes: followerCurrentMiniSectors,
        lap: 2,
        lapStartedAtSeconds: 101.2,
        progress: 0.84,
        status: 'running',
        totalDistance: 2.84,
      },
    ]

    const ranked = rankCars(cars, config)

    // The leader is already on the next lap, but its recorded lap-1 mini 20
    // remains comparable with the follower's current lap-1 mini 20.
    expect(ranked[1].gapToLeaderLabel).toBe('+1.2s')
    expect(ranked[1].gapToAheadLabel).toBe('+1.2s')
  })

  it('does not use a stopped or recovering car as the neutralisation queue reference', () => {
    const car = createInitialRace(makeConfig('neutralisation-obstruction')).cars[0]

    expect(carDefinesNeutralisationQueueOrder(car)).toBe(true)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        battleDeltaSecondsRemaining: -0.02,
        battlePhase: 'resolved',
        speedKph: 18,
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        battleDeltaSecondsRemaining: -1.2,
        battlePhase: 'attacking',
        speedKph: 18,
      }),
    ).toBe(true)
    // Any accident damage makes a car passable, so the field is never queued
    // behind one car's incident.
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        damage: 0.3,
        speedKph: 18,
        throttlePercent: 0,
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        damage: 0.05,
        speedKph: 210,
        throttlePercent: 90,
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        battleDeltaSecondsRemaining: 0,
        damage: 0.3,
        incidentTrackState: 'on-track-stopped',
        speedKph: 0,
        throttlePercent: 0,
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        damage: 0.8,
        speedKph: 18,
        throttlePercent: 0,
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        status: 'retired',
      }),
    ).toBe(false)
    expect(
      carDefinesNeutralisationQueueOrder({
        ...car,
        offTrackSinceSeconds: 20,
        rejoinEligibleAtSeconds: 22,
      }),
    ).toBe(false)
  })

  it('lets several followers clear one passable accident under local yellow', () => {
    const config = makeConfig('yellow-obstruction-field')
    // `runThroughStart` stops exactly at lights-out. Let the force model make
    // its first launch step before arranging an on-track incident.
    const started = advanceRace(runThroughStart(config), 0.25, config)
    const [leader, obstruction, ...followers] = started.cars.slice(0, 6)
    const orderedCars = [
      { ...leader, totalDistance: 2.47 },
      {
        ...obstruction,
        battleDeltaSecondsRemaining: -20,
        battlePhase: 'resolved' as const,
        damage: 0.35,
        incidentTrackState: 'on-track-stopped' as const,
        incidentTrackStateSinceSeconds: started.elapsedSeconds - 1,
        speedKph: 0,
        throttlePercent: 0,
        totalDistance: 2.445,
      },
      ...followers.map((car, index) => ({
        ...car,
        clutchEngagementFraction: 1,
        speedKph: 65,
        totalDistance: 2.442 - index * 0.002,
        turboSpoolFraction: 1,
      })),
    ].map((car, index) => ({
      ...car,
      // This fixture isolates obstruction clearance from any launch battle
      // that may have resolved in the setup step.
      battleDeltaSecondsRemaining: 0,
      battleOpponentId: null,
      battlePhase: 'single-file' as const,
      battlePhaseUntilSeconds: null,
      lap: 2,
      position: index + 1,
      processedBattleSegment: Number.MAX_SAFE_INTEGER,
      processedLap: 2,
      progress: car.totalDistance - 2,
      status: 'running' as const,
    }))
    let snapshot: RaceSnapshot = {
      ...started,
      cars: orderedCars,
      flag: 'yellow',
      flagLabel: 'DOUBLE YELLOW S2',
      flagPhase: {
        endMessage: 'Track clear',
        endSeconds: started.elapsedSeconds + 20,
        flag: 'yellow',
        id: 'test-local-yellow-obstruction',
        sector: 1,
        startMessage: 'Double yellow',
        startSeconds: started.elapsedSeconds - 1,
        yellowSeverity: 'double',
        yellowZone: {
          endProgress: 0.5,
          incidentProgress: 0.445,
          startProgress: 0.42,
        },
      },
      sectorFlags: ['clear', 'double-yellow', 'clear'],
    }

    // Cars now move laterally around the obstruction before the longitudinal
    // occupancy model permits them through; allow that continuous manoeuvre
    // to propagate through the four-car queue.
    for (let step = 0; step < 80; step += 1) {
      snapshot = advanceRace(snapshot, 0.2, config)
    }

    const stopped = snapshot.cars.find(
      (car) => car.driverId === obstruction.driverId,
    )!
    const clearedFollowers = followers.map(
      (follower) =>
        snapshot.cars.find(
          (car) => car.driverId === follower.driverId,
        )!,
    )

    expect(
      clearedFollowers.every(
        (follower) => follower.totalDistance > stopped.totalDistance,
      ),
      `stopped=${stopped.totalDistance}/${stopped.battlePhase}/${stopped.battleDeltaSecondsRemaining}/${stopped.damage}/${stopped.speedKph}/${stopped.lateralOffsetM}/${stopped.desiredLateralOffsetM}; followers=${clearedFollowers
        .map(
          (follower) =>
            `${follower.totalDistance}/${follower.speedKph}/${follower.lateralOffsetM}/${follower.desiredLateralOffsetM}`,
        )
        .join(',')}`,
    ).toBe(true)
    expect(
      clearedFollowers.map((follower) => follower.totalDistance),
    ).toEqual(
      clearedFollowers
        .map((follower) => follower.totalDistance)
        .slice()
        .sort((left, right) => right - left),
    )
  })

  it.each([
    ['on-track-stopped', 'sc'],
    ['off-track-stopped', 'vsc'],
  ] as const)(
    'stages double yellow then %s retirement escalates to %s',
    (incidentTrackState, expectedResponse) => {
      const config = makeConfig(`stopped-location-${expectedResponse}`)
      const started = runThroughStart(config)
      const stopped = started.cars[4]
      const snapshot = advanceRace(
        {
          ...started,
          cars: started.cars.map((car) =>
            car.driverId === stopped.driverId
              ? {
                  ...car,
                  hiddenFromTrack: false,
                  incidentTrackState,
                  incidentTrackStateSinceSeconds: started.elapsedSeconds,
                  retiredAtSeconds: started.elapsedSeconds,
                  retiredReason: 'test failure',
                  speedKph: 0,
                  status: 'retired' as const,
                  throttlePercent: 0,
                }
              : car,
          ),
          flag: 'clear',
          flagLabel: 'CLEAR',
          flagPhase: null,
          sectorFlags: ['clear', 'clear', 'clear'],
        },
        0.1,
        config,
      )

      expect(snapshot.flagPhase).toMatchObject({
        flag: 'yellow',
        yellowSeverity: 'double',
        escalation: { flag: expectedResponse },
      })
    },
  )
})

describe('full race', () => {
  const config = makeConfig('full-race')
  let finished: RaceSnapshot
  let seenEventKinds: Set<string>

  beforeAll(() => {
    const result = runToFinish(config)
    finished = result.snapshot
    seenEventKinds = result.seenEventKinds
  }, 180_000)

  it('completes with every car finished or retired', () => {
    expect(finished.sessionStatus).toBe('finished')
    const finishedDrivers = finished.cars.filter(
      (car) => car.status === 'finished',
    ).length
    const dnfDrivers = finished.cars.length - finishedDrivers

    expect(finished.cars).toHaveLength(initialDrivers.length)
    expect(new Set(finished.cars.map((car) => car.teamId)).size).toBe(
      initialTeams.length,
    )
    expect(finishedDrivers + dnfDrivers).toBe(initialDrivers.length)
    for (const car of finished.cars) {
      expect(['finished', 'retired', 'disqualified']).toContain(car.status)
    }
  })

  it('classifies a finished winner at position 1', () => {
    expect(finished.cars[0].status).toBe('finished')
    expect(finished.cars[0].position).toBe(1)
    expect(finished.cars[0].gapToLeaderLabel).toBe('Winner')
  })

  it('assigns unique consecutive positions', () => {
    const positions = finished.cars.map((car) => car.position)
    expect(positions).toEqual(
      Array.from({ length: finished.cars.length }, (_, index) => index + 1),
    )
  })

  it('places retired and excluded cars at the bottom with status labels', () => {
    const statuses = finished.cars.map((car) => car.status)
    const firstNonClassified = statuses.findIndex((status) =>
      ['retired', 'disqualified', 'dns'].includes(status),
    )

    if (firstNonClassified !== -1) {
      for (const car of finished.cars.slice(firstNonClassified)) {
        expect(['retired', 'disqualified', 'dns']).toContain(car.status)
        expect(car.gapToLeaderLabel).toBe(
          car.status === 'disqualified'
            ? 'DSQ'
            : car.status === 'dns'
              ? 'DNS'
              : 'OUT',
        )
      }
    }
  })

  it('enforces the two-compound rule for every finisher', () => {
    for (const car of finished.cars) {
      if (car.status === 'finished') {
        const wetRaceExemption = f1Tires(car).compoundsUsed.some(
          (compound) => !isDryCompound(compound),
        )
        const dryCompounds = f1Tires(car).compoundsUsed.filter(isDryCompound)

        if (!wetRaceExemption) {
          expect(new Set(dryCompounds).size).toBeGreaterThanOrEqual(2)
        }
        expect(car.pitStops).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('emits finish and pit events during the race', () => {
    expect(seenEventKinds.has('finish')).toBe(true)
    expect(seenEventKinds.has('pit')).toBe(true)
  })

  it('orders finishers by classified laps, then crossing time plus penalties', () => {
    const finishers = finished.cars.filter((car) => car.status === 'finished')

    expect(finishers.length).toBeGreaterThan(0)

    for (let index = 1; index < finishers.length; index += 1) {
      const previous = finishers[index - 1]
      const current = finishers[index]

      expect(previous.finishedAtSeconds).not.toBeNull()
      expect(current.finishedAtSeconds).not.toBeNull()
      const previousClassifiedLaps = previous.lap - previous.penaltyLaps
      const currentClassifiedLaps = current.lap - current.penaltyLaps

      expect(currentClassifiedLaps).toBeLessThanOrEqual(
        previousClassifiedLaps,
      )
      if (currentClassifiedLaps === previousClassifiedLaps) {
        expect(
          (current.finishedAtSeconds ?? 0) + current.penaltySeconds,
        ).toBeGreaterThanOrEqual(
          (previous.finishedAtSeconds ?? 0) + previous.penaltySeconds,
        )
      }
    }
  })

  it('records completed laps for the final fastest-lap classification', () => {
    const finishers = finished.cars.filter((car) => car.status === 'finished')

    expect(finishers.length).toBeGreaterThan(0)
    expect(finishers.every((car) => car.lastLapTimeSeconds !== null)).toBe(true)
    expect(finishers.every((car) => car.bestLapTimeSeconds !== null)).toBe(true)
    expect(
      finishers.every(
        (car) =>
          (car.bestLapTimeSeconds ?? Number.POSITIVE_INFINITY) <=
          (car.lastLapTimeSeconds ?? Number.NEGATIVE_INFINITY),
      ),
    ).toBe(true)
    expect(
      finishers.every(
        (car) =>
          car.lapHistory.length > 0 &&
          car.lapHistory.every(
            (lap) =>
              lap.sectors.length === 3 &&
              Math.abs(
                lap.sectors[0] + lap.sectors[1] + lap.sectors[2] -
                  lap.lapTimeSeconds,
              ) < 0.0001,
          ),
      ),
    ).toBe(true)
  })

  it('holds position, tire wear, and stored energy while waiting to rejoin', () => {
    const config = makeConfig('off-track-stationary-state')
    const started = runThroughStart(config)
    const target = started.cars[4]
    const rechargedAtCuKBusThisLapMJ = 1.2
    const deployedAtCuKBusThisLapMJ = 0.8
    const targetRuntime = f1Runtime(target)
    const rechargeLimit = targetRuntime.energyStore.rechargeRule.limit
    const waiting = withF1RuntimeFields({
      ...target,
      offTrackSinceSeconds: started.elapsedSeconds,
      rejoinEligibleAtSeconds: started.elapsedSeconds + 10,
    }, {
      energyDeployedThisLapMj: 99,
      energyHarvestedThisLapMj: 99,
      energyStore: {
        ...targetRuntime.energyStore,
        actualDeploymentDcPowerKw: 280,
        actualDeploymentPowerKw: 250,
        actualRecoveryPowerKw: 35,
        chargeDcPowerKw: 30,
        deployedAtCuKBusThisLapMJ,
        dischargeDcPowerKw: 280,
        rechargedAtCuKBusThisLapMJ,
        rechargeRule: {
          ...targetRuntime.energyStore.rechargeRule,
          remainingMJ:
            rechargeLimit.kind === 'finite'
              ? rechargeLimit.maxCuKBusRechargeMj -
                rechargedAtCuKBusThisLapMJ
              : null,
          usedMJ: rechargedAtCuKBusThisLapMJ,
        },
        requestedDeploymentDcPowerKw: 300,
        requestedRecoveryPowerKw: 40,
        storedChargePowerKw: 27,
        storedDischargePowerKw: 290,
      },
      ersBatteryPercent: 0,
    })
    const snapshot = {
      ...started,
      cars: started.cars.map((car) =>
        car.driverId === target.driverId ? waiting : car,
      ),
    }
    const advanced = advanceRace(snapshot, 1, config)
    const held = advanced.cars.find(
      (car) => car.driverId === target.driverId,
    )!

    expect(held.totalDistance).toBe(waiting.totalDistance)
    expect(held.speedKph).toBe(0)
    expect(f1Tires(held).tireWearPercent).toBe(f1Tires(waiting).tireWearPercent)
    expect(f1Runtime(held).energyStore.currentEnergyMJ).toBe(
      f1Runtime(waiting).energyStore.currentEnergyMJ,
    )
    expect(f1Runtime(held).energyStore).toMatchObject({
      actualDeploymentDcPowerKw: 0,
      actualDeploymentPowerKw: 0,
      actualRecoveryPowerKw: 0,
      chargeDcPowerKw: 0,
      deployedAtCuKBusThisLapMJ,
      dischargeDcPowerKw: 0,
      operatingMode: 'inactive',
      rechargedAtCuKBusThisLapMJ,
      requestedDeploymentDcPowerKw: 0,
      requestedRecoveryPowerKw: 0,
      storedChargePowerKw: 0,
      storedDischargePowerKw: 0,
    })
    expect(f1Runtime(held).energyHarvestedThisLapMj).toBe(
      rechargedAtCuKBusThisLapMJ,
    )
    expect(f1Runtime(held).energyDeployedThisLapMj).toBe(deployedAtCuKBusThisLapMJ)
    expect(f1Runtime(held).ersBatteryPercent).toBe(
      Math.round(f1Runtime(waiting).energyStore.stateOfCharge * 100),
    )
  })
})

describe('start procedure and persisted weekend', () => {
  it('holds the race on the grid through formation, grid and lights phases', () => {
    const config = makeConfig('start-sequence')
    let snapshot = createInitialRace(config)
    const initialLeaderDistance = snapshot.cars[0].totalDistance

    expect(snapshot.startProcedure).toBe('formation')
    snapshot = advanceRace(snapshot, 5, config)
    expect(snapshot.startProcedure).toBe('formation')
    expect(snapshot.cars[0].totalDistance).toBeGreaterThan(initialLeaderDistance)
    expect(snapshot.cars[0].speedKph).toBeGreaterThan(0)
    snapshot = advanceRace(
      snapshot,
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned - 5,
      config,
    )
    expect(snapshot.startProcedure).toBe('grid')
    expect(snapshot.cars[0].totalDistance).toBeCloseTo(initialLeaderDistance, 5)
    snapshot = advanceRace(snapshot, 8, config)
    expect(snapshot.startProcedure).toBe('lights')
    snapshot = advanceRace(snapshot, 5, config)
    expect(snapshot.startProcedure).toBe('racing')
  })

  it('keeps race-control history newest first through the start procedure', () => {
    const config = makeConfig('event-order')
    let snapshot = createInitialRace(config)

    snapshot = advanceRace(
      snapshot,
      snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned,
      config,
    )
    snapshot = advanceRace(snapshot, 8, config)
    snapshot = advanceRace(snapshot, 5, config)

    expect(snapshot.events.length).toBeGreaterThanOrEqual(4)
    expect(
      snapshot.events.every(
        (event, index) =>
          index === 0 || snapshot.events[index - 1].elapsedSeconds >= event.elapsedSeconds,
      ),
    ).toBe(true)
    expect(snapshot.events[0].elapsedSeconds).toBe(snapshot.elapsedSeconds)
  })

  it('uses a full circuit formation time and supports an aborted extra lap', () => {
    const base = makeConfig('formation-duration')
    const extraLapConfig = Array.from({ length: 250 }, (_, index) => ({
      ...base,
      seed: `extra-formation-${index}`,
    })).find((candidate) => formationLapsPlannedFor(candidate) === 2)

    expect(formationLapDurationSecondsFor(base)).toBeGreaterThan(
      base.track.baseLapTime,
    )
    expect(extraLapConfig).toBeDefined()

    const snapshot = createInitialRace(extraLapConfig!)
    expect(snapshot.formationLapsPlanned).toBe(2)
    expect(snapshot.raceLaps).toBe(raceLapsFor(base.track) - 1)
  })

  it('holds a designated pit-lane starter until the field passes pit exit', () => {
    const config = makeConfig('pit-lane-start')
    const context = createWeekendContext(config.drivers, false, config.track)
    context.pitLaneStartByDriver[config.drivers[0].id] = true
    const raceConfig = { ...config, weekendContext: context }
    let snapshot = createInitialRace(raceConfig)

    expect(snapshot.cars.find((car) => car.driverId === config.drivers[0].id)?.status).toBe('pit')
    snapshot = runThroughStart(raceConfig, snapshot)
    expect(snapshot.cars.find((car) => car.driverId === config.drivers[0].id)?.status).toBe('pit')
    snapshot = advanceRace(snapshot, config.track.baseLapTime * 0.15 + 2, raceConfig)
    expect(snapshot.cars.find((car) => car.driverId === config.drivers[0].id)?.status).toBe('running')
  })

  it('selects and completes a standing or rolling red-flag resumption', () => {
    const config = makeConfig('red-resumption')
    let snapshot = runThroughStart(config)
    const endSeconds = snapshot.elapsedSeconds + 1

    snapshot = advanceRace(
      {
        ...snapshot,
        flag: 'red',
        flagLabel: 'RED',
        flagPhase: {
          endMessage: 'Red flag lifted.',
          endSeconds,
          flag: 'red',
          id: 'forced-red',
          sector: 1,
          startMessage: 'Red flag.',
          startSeconds: snapshot.elapsedSeconds,
        },
      },
      2,
      config,
    )

    expect(['standing', 'rolling']).toContain(snapshot.restartProcedure)
    expect(snapshot.overtakeEnabled).toBe(false)

    const restartCars =
      snapshot.restartProcedure === 'standing'
        ? reformFieldForStandingRestart(
            snapshot.cars,
            config.track.lengthKm * 1000,
          )
        : reformFieldForRedRestart(snapshot.cars, 0.004)
    expect(restartCars[0].totalDistance).toBeGreaterThanOrEqual(
      restartCars[1].totalDistance,
    )

    snapshot = advanceRace(
      snapshot,
      (snapshot.restartProcedureUntilSeconds ?? snapshot.elapsedSeconds) -
        snapshot.elapsedSeconds +
        0.1,
      config,
    )
    expect(snapshot.restartProcedure).toBe('none')
  })

  it('publishes a local yellow timing-sector summary for its marshalling zone', () => {
    const config = makeConfig('sector-yellow-snapshot')
    let snapshot = runThroughStart(config)

    snapshot = advanceRace(
      {
        ...snapshot,
        flag: 'yellow',
        flagLabel: 'YELLOW ZONE S2',
        flagPhase: {
          endMessage: 'Sector clear.',
          endSeconds: snapshot.elapsedSeconds + 20,
          flag: 'yellow',
          id: 'forced-sector-two-yellow',
          sector: 1,
          startMessage: 'Yellow flag in sector 2.',
          startSeconds: snapshot.elapsedSeconds,
          yellowSeverity: 'single',
          yellowZone: {
            endProgress: 0.47,
            incidentProgress: 0.44,
            startProgress: 0.4,
          },
        },
      },
      0.1,
      config,
    )

    expect(snapshot.flagLabel).toBe('YELLOW ZONE S2')
    expect(snapshot.sectorFlags).toEqual(['clear', 'yellow', 'clear'])
  })

  it('waits for the on-track field to cross the control line after a Safety Car', () => {
    const config = makeConfig('sc-overtake-reenable')
    let snapshot = runThroughStart(config)
    const endSeconds = snapshot.elapsedSeconds + 10

    snapshot = advanceRace(
      {
        ...snapshot,
        flag: 'sc',
        flagLabel: 'SC',
        flagPhase: {
          endMessage: 'Safety Car in.',
          endSeconds,
          flag: 'sc',
          id: 'forced-sc',
          lappedCarsMayOvertakeAtSeconds: null,
          sector: 0,
          startMessage: 'Safety Car deployed.',
          startSeconds: snapshot.elapsedSeconds,
        },
        overtakeEnabled: false,
        overtakeEnableAtLeaderDistance: null,
        overtakeEnableTargetsByDriver: null,
      },
      2,
      config,
    )

    expect(snapshot.flagPhase?.flag).toBe('sc')
    expect(snapshot.overtakeEnabled).toBe(false)

    for (
      let step = 0;
      step < 240 &&
      (snapshot.flagPhase?.id === 'forced-sc' ||
        snapshot.overtakeEnableTargetsByDriver === null);
      step += 1
    ) {
      snapshot = advanceRace(snapshot, 2, config)
    }

    expect(
      snapshot.flagPhase?.flag,
      JSON.stringify(snapshot.flagPhase),
    ).not.toBe('sc')
    expect(snapshot.overtakeEnabled).toBe(false)
    expect(snapshot.overtakeEnableAtLeaderDistance).toBeNull()
    const controlMessages = snapshot.events.map((event) => event.message)
    for (const expectedMessage of [
      'SAFETY CAR ON TRACK',
      'behind the Safety Car',
      'SAFETY CAR QUEUE FORMED',
      'SAFETY CAR IN THIS LAP',
      'SAFETY CAR ENTERING PIT ENTRY ROAD',
    ]) {
      expect(
        controlMessages.some((message) => message.includes(expectedMessage)),
      ).toBe(true)
    }
    const targets = snapshot.overtakeEnableTargetsByDriver!
    expect(Object.keys(targets)).not.toHaveLength(0)
    snapshot = {
      ...snapshot,
      flag: 'clear',
      flagLabel: 'CLEAR',
      flagPhase: null,
      cars: snapshot.cars.map((car) => {
        const target = targets[car.driverId]

        if (target === undefined) {
          return car
        }

        const totalDistance = target + 0.002

        return {
          ...car,
          lap: Math.floor(totalDistance),
          processedBattleSegment: Number.MAX_SAFE_INTEGER,
          processedLap: Math.floor(totalDistance),
          progress: totalDistance - Math.floor(totalDistance),
          totalDistance,
        }
      }),
    }
    snapshot = advanceRace(snapshot, 0.01, config)

    expect(snapshot.overtakeEnabled).toBe(true)
    expect(snapshot.overtakeEnableTargetsByDriver).toBeNull()
  }, 30_000)

  it('measures VSC deltas against the pace-adjusted on-track speed', () => {
    const config = makeConfig('vsc-delta-pace')
    let snapshot = runThroughStart(config)

    snapshot = {
      ...snapshot,
      flag: 'vsc',
      flagLabel: 'VSC',
      flagPhase: {
        endMessage: 'VSC ending.',
        endSeconds: snapshot.elapsedSeconds + 40,
        flag: 'vsc',
        id: 'forced-vsc',
        sector: 0,
        startMessage: 'Virtual Safety Car deployed.',
        startSeconds: snapshot.elapsedSeconds,
      },
    }

    for (let tick = 0; tick < 20; tick += 1) {
      snapshot = advanceRace(snapshot, 0.5, config)
    }

    expect(Math.min(...snapshot.cars.map((car) => car.vscDeltaSeconds))).toBeGreaterThanOrEqual(-0.25)
    expect(
      Math.max(...snapshot.cars.map((car) => car.vscRedSectorCount ?? 0)),
    ).toBeLessThan(2)
  })

  it('reconciles gear and RPM after a VSC queue distance clamp', () => {
    const config = makeConfig('vsc-drivetrain-reconciliation')
    let snapshot = runThroughStart(config)
    const [leader, follower] = snapshot.cars
    const leaderDistance = 3.5
    const followerDistance = leaderDistance - 0.006
    const previousFollowerDistance = followerDistance

    snapshot = {
      ...snapshot,
      flag: 'vsc',
      flagLabel: 'VSC',
      flagPhase: {
        endMessage: 'VSC ending.',
        endSeconds: snapshot.elapsedSeconds + 40,
        flag: 'vsc',
        id: 'forced-vsc-drivetrain-reconciliation',
        sector: 0,
        startMessage: 'Virtual Safety Car deployed.',
        startSeconds: snapshot.elapsedSeconds,
      },
      cars: snapshot.cars.map((car) => {
        if (car.driverId === leader.driverId) {
          return {
            ...car,
            clutchEngagementFraction: 1,
            lap: Math.floor(leaderDistance),
            progress: leaderDistance % 1,
            speedKph: 55,
            totalDistance: leaderDistance,
            turboSpoolFraction: 1,
          }
        }

        if (car.driverId === follower.driverId) {
          return {
            ...car,
            clutchEngagementFraction: 1,
            lap: Math.floor(followerDistance),
            progress: followerDistance % 1,
            speedKph: 300,
            totalDistance: followerDistance,
            turboSpoolFraction: 1,
          }
        }

        return car
      }),
    }
    snapshot = advanceRace(snapshot, 0.25, config)

    const nextFollower = snapshot.cars.find(
      (car) => car.driverId === follower.driverId,
    )!
    const actualTravelSpeedKph = speedForProfileTravelKph(
      config.track,
      previousFollowerDistance,
      nextFollower.totalDistance,
      0.25,
    )

    expect(nextFollower.speedKph).toBeCloseTo(actualTravelSpeedKph, 2)
    expect(Number.isFinite(nextFollower.speedKph)).toBe(true)
    expect(nextFollower.speedKph).toBeGreaterThanOrEqual(0)

    const physics = categoryPhysicsFor(config.seriesId)
    const team = config.teams.find(
      (candidate) => candidate.id === nextFollower.teamId,
    )!
    const expected = selectGear({
      clutchEngagementFraction: nextFollower.clutchEngagementFraction,
      // Superclip is a real generator load in the longitudinal force balance;
      // it does not rewrite the ICE power used to reconcile the gearbox.
      combustionPowerKw:
        combustionPowerKwFor(team, physics) +
        (config.overtakeSystem === 'ots' &&
        nextFollower.overtakeStatus === 'active'
          ? (physics.overtakeBoostPowerKw ?? 0)
          : 0),
      deploymentPowerKw: f1Runtime(nextFollower).ersPowerKw,
      physics,
      speedMps: actualTravelSpeedKph / 3.6,
      transmissionEfficiency: physics.drivetrainEfficiency,
      turboSpoolFraction: nextFollower.turboSpoolFraction,
    })

    expect(nextFollower.gear).toBe(expected.gear)
    expect(nextFollower.rpm).toBeCloseTo(expected.rpm, 8)
    if (nextFollower.speedKph === 0) {
      expect(nextFollower.gear).toBe(1)
      expect(nextFollower.rpm).toBeGreaterThanOrEqual(
        physics.minimumEngineRpm,
      )
    }
  })

  it('runs the announced 10-to-15-second VSC ending sequence before green', () => {
    const config = makeConfig('vsc-ending-sequence')
    let snapshot = runThroughStart(config)
    const deploymentStart = snapshot.elapsedSeconds

    snapshot = advanceRace(
      {
        ...snapshot,
        flag: 'vsc',
        flagLabel: 'VSC',
        flagPhase: {
          endMessage: 'VSC ending.',
          endSeconds: deploymentStart + 2,
          flag: 'vsc',
          id: 'forced-vsc-ending',
          sector: 0,
          startMessage: 'Virtual Safety Car deployed.',
          startSeconds: deploymentStart,
        },
        overtakeEnabled: false,
      },
      2.1,
      config,
    )

    const procedure = snapshot.flagPhase?.neutralisation
    expect(procedure?.kind).toBe('vsc')
    expect(procedure?.stage).toBe('ending')
    if (!procedure || procedure.kind !== 'vsc') {
      throw new Error('VSC ending procedure was not created.')
    }

    const endingDuration =
      (procedure.resumeAtSeconds ?? 0) -
      (procedure.endingStartedAtSeconds ?? 0)
    expect(endingDuration).toBeGreaterThanOrEqual(10)
    expect(endingDuration).toBeLessThanOrEqual(15)
    expect(snapshot.eventMessage).toContain('VSC ENDING')

    snapshot = advanceRace(snapshot, endingDuration - 0.2, config)
    expect(snapshot.flagPhase?.flag).toBe('vsc')

    const violatingDriverId = snapshot.cars[0].driverId
    const priorVscPenalty: PenaltyRecord = {
      id: 'prior-vsc-penalty',
      issuedAtSeconds: snapshot.elapsedSeconds - 60,
      kind: 'time-5',
      mustServeByLap: null,
      penaltyPoints: 1,
      reason: 'Exceeding the VSC speed limit (B5.12.2(b))',
      seconds: 5,
      served: true,
      servedAtSeconds: snapshot.elapsedSeconds - 30,
    }
    snapshot = advanceRace(
      {
        ...snapshot,
        cars: snapshot.cars.map((car) =>
          car.driverId === violatingDriverId
            ? {
                ...car,
                penalties: [...car.penalties, priorVscPenalty],
                vscDeltaSeconds: -0.8,
                vscRedSectorCount: 4,
              }
            : { ...car, vscDeltaSeconds: 0.2, vscRedSectorCount: 0 },
        ),
      },
      0.3,
      config,
    )
    expect(snapshot.flagPhase).toBeNull()
    expect(snapshot.greenLightUntilSeconds).not.toBeNull()
    // Racing events raised in the same tick can take the headline, so assert
    // the green flag was announced rather than that it was announced last.
    expect(
      snapshot.events.some((event) => event.message.includes('GREEN FLAG')),
    ).toBe(true)
    expect(
      snapshot.cars
        .find((car) => car.driverId === violatingDriverId)
        ?.penalties.filter(
          (penalty) =>
            penalty.reason.startsWith('Exceeding the VSC speed limit'),
        ),
    ).toHaveLength(2)
    expect(
      snapshot.cars
        .find((car) => car.driverId === violatingDriverId)
        ?.penalties.some(
          (penalty) => penalty.seconds === 10 && !penalty.served,
        ),
    ).toBe(true)
  })

  it('persists practice setup and qualifying grid into the race weekend', () => {
    const config = makeConfig('weekend-persist')
    const practice = runPracticeSession(config, 'fp1')
    const qualifying = runQualifying(config)
    const afterPractice = completePracticeSession(
      createWeekendContext(config.drivers),
      'fp1',
      practice,
    )
    const context = completeQualifyingSession(afterPractice, 'qualifying', qualifying)
    const grid = applyWeekendGrid(config.drivers, context, 'race')

    expect(context.completed).toContain('fp1')
    expect(context.completed).toContain('qualifying')
    expect(context.setupBonusByDriver[practice[0].driverId]).toBeGreaterThan(0)
    expect(grid?.[0].id).toBe(qualifying[0].driverId)
  })

  it('deep-copies one category-neutral surface carry across weekend stages', () => {
    const config = makeConfig('weekend-surface-carry')
    const practice = runPracticeSession(config, 'fp1')
    const initial = createInitialRace(config)
    const playedSurface = {
      ...initial.trackSurface,
      waterFilmMm: initial.trackSurface.waterFilmMm.map((value, index) =>
        index === 0 ? 1.25 : value,
      ),
    }
    const sourceCarry = {
      state: playedSurface,
      trackId: config.track.id,
    }
    const afterPractice = completePracticeSession(
      createWeekendContext(
        config.drivers,
        config.track.isSprintWeekend,
        config.track,
      ),
      'fp1',
      practice,
      initial.cars,
      sourceCarry,
    )

    expect(afterPractice.trackSurfaceCarry).toEqual(sourceCarry)
    expect(afterPractice.trackSurfaceCarry).not.toBe(sourceCarry)
    expect(afterPractice.trackSurfaceCarry?.state).not.toBe(sourceCarry.state)

    sourceCarry.state.waterFilmMm[0] = 5
    expect(afterPractice.trackSurfaceCarry?.state.waterFilmMm[0]).toBe(1.25)

    const qualifying = runQualifying(config)
    const afterSyntheticQualifying = completeQualifyingSession(
      afterPractice,
      'qualifying',
      qualifying,
    )
    const afterRace = completeRaceSession(
      afterSyntheticQualifying,
      'race',
    )

    expect(afterSyntheticQualifying.trackSurfaceCarry).toBe(
      afterPractice.trackSurfaceCarry,
    )
    expect(afterRace.trackSurfaceCarry).toBe(
      afterPractice.trackSurfaceCarry,
    )
  })

  it('uses the measured qualifying order and tyre inventory as the completed result', () => {
    const config = makeConfig('measured-qualifying-result')
    const context = createWeekendContext(config.drivers)
    if (context.seriesId !== 'f1-custom') {
      throw new Error('Expected F1 weekend context')
    }
    const knockout = runKnockoutQualifying(config)
    const snapshot = createInitialRace({
      ...config,
      weekendContext: context,
      weekendStage: 'qualifying',
    })
    const measuredCars = snapshot.cars
      .slice()
      .reverse()
      .map((car, index) => {
        const startingSoftSets = context.tireSetsByDriver[car.driverId].S ?? 0
        const usedSets = index === 0 ? 3 : 1

        return withF1Tires({
          ...car,
          bestLapTimeSeconds: 88 + index * 0.2,
          position: index + 1,
        }, {
          tireSetsRemaining: {
            ...f1Tires(car).tireSetsRemaining,
            S: Math.max(0, startingSoftSets - usedSets),
          },
        })
      })
    const completed = completeQualifyingSession(
      context,
      'qualifying',
      knockout.classification,
      knockout.segments,
      measuredCars,
      true,
    )
    if (completed.seriesId !== 'f1-custom') {
      throw new Error('Expected completed F1 weekend context')
    }
    const classification = completedQualifyingClassification(
      knockout.classification,
      measuredCars,
      true,
    )

    expect(classification[0].driverId).toBe(measuredCars[0].driverId)
    expect(completed.gridByStage.race?.[0]).toBe(measuredCars[0].driverId)
    expect(completed.tireSetsByDriver[measuredCars[0].driverId].S).toBe(
      f1Tires(measuredCars[0]).tireSetsRemaining.S,
    )
    expect(
      completed.tireSetInventoryByDriver[measuredCars[0].driverId].filter(
        (set) => set.compound === 'S' && set.status === 'used',
      ),
    ).toHaveLength(3)
  })

  it('stores Madrid qualifying 2 independently for the second feature grid', () => {
    const config = makeConfig('madrid-qualifying-two')
    const teamsById = new Map(config.teams.map((team) => [team.id, team]))
    const qualifyingResult = (driver: (typeof config.drivers)[number], position: number) => {
      const team = teamsById.get(driver.teamId)!

      return {
        abortedRunCount: 0,
        classificationStatus: 'classified' as const,
        code: driver.code,
        tire: { compound: 'M' as const, kind: 'f1-pirelli-session-tire' as const },
        deletedRunCount: 0,
        deltaSeconds: position * 0.1,
        driverId: driver.id,
        driverName: driver.name,
        flyingLapCompletedAtSeconds: 400,
        flyingLapStartedAtSeconds: 300,
        inLapTimeSeconds: 110,
        lapTimeSeconds: 90 + position * 0.1,
        outLapTimeSeconds: 110,
        pitExitAtSeconds: 120,
        pitReturnAtSeconds: 510,
        position,
        runCount: 1,
        segment: 'Q1' as const,
        sessionDurationSeconds: 1800,
        setsUsed: 1,
        teamColor: team.color,
        teamId: team.id,
        teamName: team.name,
        trafficLossSeconds: 0,
        validRunCount: 1,
        weather: 'clear' as const,
        weatherLabel: 'Dry',
      }
    }
    const qualifying1 = config.drivers.map((driver, index) =>
      qualifyingResult(driver, index + 1),
    )
    const qualifying2 = config.drivers
      .slice()
      .reverse()
      .map((driver, index) => qualifyingResult(driver, index + 1))
    const afterQualifying1 = completeQualifyingSession(
      createWeekendContext(config.drivers),
      'qualifying',
      qualifying1,
    )
    const context = completeQualifyingSession(
      afterQualifying1,
      'qualifying2',
      qualifying2,
    )
    const featureOneGrid = applyWeekendGrid(config.drivers, context, 'race')
    const featureTwoGrid = applyWeekendGrid(config.drivers, context, 'race2')

    expect(context.completed).toEqual(['qualifying', 'qualifying2'])
    expect(featureOneGrid?.[0].id).toBe(qualifying1[0].driverId)
    expect(featureTwoGrid?.[0].id).toBe(qualifying2[0].driverId)
  })

  it('honors an event-specific replacement race lap count', () => {
    const snapshot = createInitialRace({
      ...makeConfig('sf-replacement-distance'),
      sessionRaceLapsOverride: 25,
      sessionRaceTimeLimitSecondsOverride: 50 * 60,
    })

    expect(snapshot.raceLaps).toBe(25)
  })
})

describe('fuel effect', () => {
  it('is maximal at the start and zero at the flag', () => {
    expect(fuelEffectSeconds(0, 50)).toBeGreaterThan(0)
    expect(fuelEffectSeconds(50, 50)).toBe(0)
  })

  it('decreases monotonically with laps completed', () => {
    let previous = Number.POSITIVE_INFINITY

    for (let lap = 0; lap <= 50; lap += 5) {
      const value = fuelEffectSeconds(lap, 50)
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })
})

describe('official race distances', () => {
  it('uses configured official lap counts instead of a one-hour estimate', () => {
    const albertPark = tracks.find((track) => track.id === 'albert-park-approx')!
    const madrid = tracks.find((track) => track.id === 'madrid-approx')!

    expect(raceLapsFor(albertPark)).toBe(58)
    expect(raceLapsFor(madrid)).toBeGreaterThanOrEqual(15)
  })
})

describe('track speed profile', () => {
  it('integrates a physical reference profile independently of baseLapTime', () => {
    const track = tracks[0]
    const physicalLapTimeSeconds = referenceProfileLapTimeSeconds(track)

    expect(Number.isFinite(physicalLapTimeSeconds)).toBe(true)
    expect(physicalLapTimeSeconds).toBeGreaterThan(0)
    expect(
      referenceProfileLapTimeSeconds({
        ...track,
        baseLapTime: track.baseLapTime * 1.5,
      }),
    ).toBeCloseTo(
      physicalLapTimeSeconds,
      5,
    )
  })
})

describe('track evolution', () => {
  it('clamps between 0 and 1', () => {
    expect(trackEvolutionLevel(0)).toBe(0)
    expect(trackEvolutionLevel(10000)).toBe(1)
  })
})

describe('dirty air', () => {
  it('is zero in open air and beyond the outer gap', () => {
    expect(dirtyAirDeltaSeconds(0)).toBe(0)
    expect(dirtyAirDeltaSeconds(-1)).toBe(0)
    expect(dirtyAirDeltaSeconds(2.5)).toBe(0)
  })

  it('costs time when following closely', () => {
    expect(dirtyAirDeltaSeconds(0.5)).toBeGreaterThan(0)
    expect(dirtyAirDeltaSeconds(1.2)).toBeGreaterThan(0)
  })

  it('fades as the gap opens', () => {
    expect(dirtyAirDeltaSeconds(1.8)).toBeLessThan(dirtyAirDeltaSeconds(1.0))
  })

  it('helps an attached car retain the train pace but ends smoothly when the gap breaks', () => {
    const closePackPace = packFollowingLapTime({
      aheadLapTimeSeconds: 90,
      gapToAheadSeconds: 0.55,
      ownLapTimeSeconds: 91.2,
      phaseActive: false,
    })
    const edgePackPace = packFollowingLapTime({
      aheadLapTimeSeconds: 90,
      gapToAheadSeconds: 1.85,
      ownLapTimeSeconds: 91.2,
      phaseActive: false,
    })

    expect(closePackPace).toBeGreaterThan(90)
    expect(closePackPace).toBeLessThan(91.2)
    expect(edgePackPace).toBeGreaterThan(closePackPace)
    expect(edgePackPace).toBeLessThanOrEqual(91.2)
    expect(
      packFollowingLapTime({
        aheadLapTimeSeconds: 90,
        gapToAheadSeconds: 1.9,
        ownLapTimeSeconds: 91.2,
        phaseActive: false,
      }),
    ).toBe(91.2)
  })
})

describe('track limit penalties', () => {
  it('starts at the threshold and escalates', () => {
    expect(penaltyFromWarnings(0)).toBe(0)
    expect(penaltyFromWarnings(3)).toBe(0)
    expect(penaltyFromWarnings(4)).toBe(5)
    expect(penaltyFromWarnings(5)).toBe(10)
    expect(penaltyFromWarnings(6)).toBe(15)
    expect(penaltyFromWarnings(8)).toBe(25)
  })

  it('subtracts penalties already served at pit stops', () => {
    expect(owedPenaltySeconds(4, 0)).toBe(5)
    expect(owedPenaltySeconds(4, 5)).toBe(0)
    expect(owedPenaltySeconds(6, 5)).toBe(10)
    expect(owedPenaltySeconds(8, 15)).toBe(10)
  })
})

describe('tires', () => {
  it('makes softer compounds faster when fresh', () => {
    expect(tireDeltaSeconds('S', 0, 0.8)).toBeLessThan(tireDeltaSeconds('M', 0, 0.8))
    expect(tireDeltaSeconds('M', 0, 0.8)).toBeLessThan(tireDeltaSeconds('H', 0, 0.8))
  })

  it('uses the nominated medium as the event pace reference', () => {
    const nomination = {
      H: 'C3',
      M: 'C4',
      S: 'C5',
      source: 'pirelli',
      sourceUrl: 'https://press.pirelli.com/',
    } as const

    expect(tireDeltaSeconds('M', 0, 0.8, 'clear', 1, undefined, 0, nomination)).toBe(0)
    expect(tireDeltaSeconds('S', 0, 0.8, 'clear', 1, undefined, 0, nomination)).toBeLessThan(0)
    expect(tireDeltaSeconds('H', 0, 0.8, 'clear', 1, undefined, 0, nomination)).toBeGreaterThan(0)
  })

  it('blends sufficient observed tire samples into pace and wear', () => {
    const modeled = tireDeltaSeconds('S', 6, 0.8)
    const calibrated = tireDeltaSeconds(
      'S',
      6,
      0.8,
      'clear',
      1,
      undefined,
      0,
      undefined,
      {
        degradationPerLapSeconds: 0.2,
        paceOffsetSeconds: -1.2,
        sampleCount: 40,
      },
    )

    expect(calibrated).not.toBe(modeled)
  })

  it('wears with age and falls off a cliff', () => {
    const cliff = effectiveCliffLaps('S', 0.8)
    const beforeCliffSlope =
      tireDeltaSeconds('S', 10, 0.8) - tireDeltaSeconds('S', 9, 0.8)
    const afterCliffSlope =
      tireDeltaSeconds('S', Math.ceil(cliff) + 5, 0.8) -
      tireDeltaSeconds('S', Math.ceil(cliff) + 4, 0.8)

    expect(beforeCliffSlope).toBeGreaterThan(0)
    expect(afterCliffSlope).toBeGreaterThan(beforeCliffSlope)
  })

  it('rewards tire management with a longer cliff', () => {
    expect(effectiveCliffLaps('M', 0.9)).toBeGreaterThan(effectiveCliffLaps('M', 0.7))
  })

  it('makes wet-weather compounds better in the rain', () => {
    expect(tireDeltaSeconds('I', 0, 0.8, 'light-rain', 0.82)).toBeLessThan(
      tireDeltaSeconds('S', 0, 0.8, 'light-rain', 0.82),
    )
    expect(tireDeltaSeconds('W', 0, 0.8, 'heavy-rain', 0.62)).toBeLessThan(
      tireDeltaSeconds('M', 0, 0.8, 'heavy-rain', 0.62),
    )
  })

  it('reports life and thermal state without changing tire ranking', () => {
    expect(tireConditionFor('S', 1, 0.82, 99)).toMatchObject({
      operatingState: 'window',
      wearState: 'fresh',
    })
    expect(tireConditionFor('S', 20, 0.82, 124).wearState).toBe('critical')
    expect(tireConditionFor('M', 2, 0.82, 96, 91)).toMatchObject({
      lifeRemainingPercent: 9,
      wearState: 'critical',
    })
    expect(tireConditionFor('M', 4, 0.82, 60).operatingState).toBe('cold')
  })

  it('reports tire life as a remaining value that falls from 100 toward 0', () => {
    const fresh = tireConditionFor('M', 0, 0.82, 96, 0, undefined, 0)
    const used = tireConditionFor('M', 8, 0.82, 101, 28, undefined, 4)
    const critical = tireConditionFor('M', 22, 0.82, 118, 82, undefined, 12)

    expect(fresh.lifeRemainingPercent).toBe(100)
    expect(used.lifeRemainingPercent).toBeLessThan(fresh.lifeRemainingPercent)
    expect(critical.lifeRemainingPercent).toBeLessThan(used.lifeRemainingPercent)
    expect(critical.lifeRemainingPercent).toBeGreaterThanOrEqual(0)
  })

  it('keeps measured wear within a credible first-lap range', () => {
    const config = {
      ...makeConfig('wear-sanity'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    let snapshot = createInitialRace(config)

    for (let step = 0; step < 600 && snapshot.cars.every((car) => car.lapHistory.length === 0); step += 1) {
      snapshot = advanceRace(snapshot, 0.5, config)
    }

    const sampledCars = snapshot.cars.filter((car) => car.lapHistory.length > 0)
    expect(sampledCars.length).toBeGreaterThan(0)
    expect(sampledCars.every((car) => f1Tires(car).tireWearPercent > 0)).toBe(true)
    expect(sampledCars.every((car) => f1Tires(car).tireWearPercent < 16)).toBe(true)
    expect(
      sampledCars.every((car) => {
        const lapTime = car.lapHistory[0].lapTimeSeconds
        return lapTime > 40 && lapTime < 200
      }),
    ).toBe(true)
  })
})

describe('weather and wet strategy', () => {
  it('values a safety-car stop while penalizing a traffic-heavy rejoin', () => {
    const clearTrack = estimatePitOpportunity({
      tireAgeLaps: 18,
      tireWearPercent: 74,
      cliffLaps: 20,
      remainingLaps: 30,
      pitLaneLossSeconds: 18,
      underSafetyCar: true,
      projectedRejoinPositionLoss: 0,
    })
    const traffic = estimatePitOpportunity({
      tireAgeLaps: 18,
      tireWearPercent: 74,
      cliffLaps: 20,
      remainingLaps: 30,
      pitLaneLossSeconds: 18,
      underSafetyCar: true,
      projectedRejoinPositionLoss: 6,
      teammateInPit: true,
    })

    expect(clearTrack.controlPhaseSavingSeconds).toBeGreaterThan(7)
    expect(clearTrack.netGainSeconds).toBeGreaterThan(traffic.netGainSeconds)
    expect(traffic.doubleStackCostSeconds).toBeGreaterThan(0)
  })

  it('prices green, VSC, and Safety Car pit losses separately', () => {
    const green = effectivePitLaneLossSecondsForControlPhase({
      controlPhase: 'green',
      pitLaneLossSeconds: 20,
    })
    const vsc = effectivePitLaneLossSecondsForControlPhase({
      controlPhase: 'vsc',
      pitLaneLossSeconds: 20,
    })
    const safetyCar = effectivePitLaneLossSecondsForControlPhase({
      controlPhase: 'safety-car',
      pitLaneLossSeconds: 20,
    })
    const endingVsc = effectivePitLaneLossSecondsForControlPhase({
      controlPhase: 'vsc',
      neutralisationSecondsRemaining: 3,
      pitEntrySecondsAway: 5,
      pitLaneLossSeconds: 20,
    })

    expect(safetyCar).toBeLessThan(vsc)
    expect(vsc).toBeLessThan(green)
    expect(endingVsc).toBe(green)
  })

  it('does not schedule a repair-only service while the VSC is active', () => {
    const driver = initialDrivers[0]
    const baseCar = createInitialRace(makeConfig('vsc-repair-rule')).cars[0]
    const car = withF1Tires({
      ...baseCar,
      damage: 0.85,
    }, {
      tireAgeLaps: 1,
      tireWearPercent: 4,
    })
    const shared = {
      car,
      driver,
      lap: 8,
      raceLaps: 58,
      seed: 'vsc-repair-rule',
      trackGrip: 1,
      weather: 'clear' as const,
    }

    expect(decidePitStop({ ...shared, controlPhase: 'vsc' })).toBeNull()
    expect(decidePitStop({ ...shared, controlPhase: 'green' })?.reason).toBe(
      'damage',
    )
  })

  it('splits strategic calls under the same Safety Car opportunity', () => {
    const baseConfig = makeConfig('sc-strategy-split')
    const baseCar = createInitialRace({
      ...baseConfig,
      track: { ...baseConfig.track, rainProbability: 0 },
    }).cars[0]
    const calls = initialDrivers.map((driver) =>
      decidePitStop({
        car: withF1Tires({
          ...baseCar,
        }, {
          tireAgeLaps: 8,
          tireWearPercent: 38,
        }),
        controlPhase: 'safety-car',
        driver,
        lap: 18,
        overtakeDifficulty: 0.72,
        position: initialDrivers.indexOf(driver) + 1,
        projectedRejoinPosition: initialDrivers.indexOf(driver) + 3,
        raceLaps: 58,
        seed: 'sc-strategy-split',
        trackGrip: 1,
        weather: 'clear',
      }),
    )
    const pitCalls = calls.filter((decision) => decision !== null)

    expect(pitCalls.length).toBeGreaterThan(0)
    expect(pitCalls.length).toBeLessThan(initialDrivers.length)
  })

  it('recalculates red-flag tyres while fresh-tyre cars retain track position', () => {
    const baseCar = createInitialRace(makeConfig('red-flag-strategy')).cars[0]
    const freshDecision = decideRedFlagTireChange({
      availableCompounds: f1Tires(baseCar).tireSetsRemaining,
      car: withF1Tires(baseCar, { tireAgeLaps: 1, tireWearPercent: 8 }),
      driver: initialDrivers[0],
      lap: 24,
      raceLaps: 58,
      seed: 'red-flag-strategy',
      trackGrip: 1,
      weather: 'clear',
    })
    const fieldDecisions = initialDrivers.map((driver) =>
      decideRedFlagTireChange({
        availableCompounds: f1Tires(baseCar).tireSetsRemaining,
        car: withF1Tires(baseCar, { tireAgeLaps: 9, tireWearPercent: 42 }),
        driver,
        lap: 24,
        raceLaps: 58,
        seed: 'red-flag-strategy',
        trackGrip: 1,
        weather: 'clear',
      }),
    )
    const changes = fieldDecisions.filter((decision) => decision !== null)

    expect(freshDecision).toBeNull()
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.length).toBeLessThan(initialDrivers.length)
  })

  it('is deterministic for a seed, track, and time', () => {
    expect(weatherFor('weather-seed', tracks[3], 720)).toBe(
      weatherFor('weather-seed', tracks[3], 720),
    )
    expect(trackGripForWeather('weather-seed', tracks[3], 720)).toBe(
      trackGripForWeather('weather-seed', tracks[3], 720),
    )
    expect(weatherForecastFor('weather-seed', tracks[3], 720)).toEqual(
      weatherForecastFor('weather-seed', tracks[3], 720),
    )
  })

  it('keeps sector weather and grip deterministic and within valid bounds', () => {
    for (let sector = 0; sector < 3; sector += 1) {
      const weather = weatherForSector('sector-weather', tracks[3], 720, sector)
      const grip = trackGripForSector('sector-weather', tracks[3], 720, sector)

      expect(['clear', 'light-rain', 'heavy-rain']).toContain(weather)
      expect(grip).toBeGreaterThanOrEqual(0.6)
      expect(grip).toBeLessThanOrEqual(1)
      expect(weather).toBe(weatherForSector('sector-weather', tracks[3], 720, sector))
      expect(grip).toBe(trackGripForSector('sector-weather', tracks[3], 720, sector))
    }
  })

  it('transitions rain and grip continuously at weather-segment boundaries', () => {
    const track = tracks[3]

    for (let segment = 1; segment <= 8; segment += 1) {
      const boundary = segment * 240
      const justBefore = rainIntensityLevelFor('smooth-weather', track, boundary - 0.01)
      const justAfter = rainIntensityLevelFor('smooth-weather', track, boundary + 0.01)
      const gripBefore = trackGripForWeather('smooth-weather', track, boundary - 0.01)
      const gripAfter = trackGripForWeather('smooth-weather', track, boundary + 0.01)

      expect(Math.abs(justAfter - justBefore)).toBeLessThan(0.01)
      expect(Math.abs(gripAfter - gripBefore)).toBeLessThan(0.01)
      expect(justAfter).toBeGreaterThanOrEqual(0)
      expect(justAfter).toBeLessThanOrEqual(1)
    }
  })

  it('pits for wets when caught on dry tires in heavy rain', () => {
    const driver = initialDrivers[0]
    const baseCar = createInitialRace(makeConfig('wet-call')).cars[0]
    const car = withF1Tires({
      ...baseCar,
      brakeTemperatureC: 720,
      damage: 0,
      pitStops: 0,
    }, {
      tire: 'M',
      tireAgeLaps: 8,
      tireWearPercent: 42,
      compoundsUsed: ['M'] as TireCompound[],
    })
    const decision = decidePitStop({
      seed: 'wet-call',
      driver,
      car,
      lap: 12,
      raceLaps: 40,
      underSafetyCar: false,
      weather: 'heavy-rain',
      trackGrip: 0.62,
    })

    expect(decision?.reason).toBe('weather')
    expect(decision?.compound).toBe('W')
  })

  it('stages a non-critical drying crossover instead of boxing the field together', () => {
    const baseCar = createInitialRace(makeConfig('drying-crossover')).cars[0]
    const decisions = initialDrivers.map((driver) =>
      decidePitStop({
        seed: 'drying-crossover',
        driver,
        car: withF1Tires({
          ...baseCar,
        }, {
          tire: 'I',
          compoundsUsed: ['I'],
          tireAgeLaps: 4,
          tireWearPercent: 24,
        }),
        lap: 5,
        raceLaps: 58,
        underSafetyCar: false,
        weather: 'clear',
        trackGrip: 0.96,
      }),
    )
    const crossoverCalls = decisions.filter(
      (decision) => decision?.reason === 'weather',
    )

    expect(crossoverCalls.length).toBeGreaterThan(0)
    expect(crossoverCalls.length).toBeLessThan(initialDrivers.length)
  })

  it('holds an ordinary crossover call while the green-flag pit lane is busy', () => {
    const baseCar = createInitialRace(makeConfig('drying-congestion')).cars[0]
    const decision = decidePitStop({
      seed: 'drying-congestion',
      driver: initialDrivers[0],
      car: withF1Tires({
        ...baseCar,
      }, {
        tire: 'I',
        compoundsUsed: ['I'],
        tireAgeLaps: 4,
        tireWearPercent: 24,
      }),
      lap: 5,
      raceLaps: 58,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 0.96,
      pitLaneOccupancy: pitTuning.normalPitLaneCapacity,
    })

    expect(decision).toBeNull()
  })

  it('explains a weather crossover as an immediate strategy call', () => {
    const car = createInitialRace(makeConfig('strategy-outlook')).cars[0]
    const outlook = strategyOutlookFor({
      car: withF1Tires(car, { tire: 'S', tireAgeLaps: 8 }),
      driver: initialDrivers[0],
      lap: 14,
      raceLaps: 58,
      seed: 'strategy-outlook',
      trackGrip: 0.66,
      underSafetyCar: false,
      weather: 'heavy-rain',
    })

    expect(outlook?.urgency).toBe('box')
    expect(outlook?.compound).toBe('W')
    expect(outlook?.estimatedStopLap).toBe(14)
  })

  it('keeps inters as the next choice in light rain', () => {
    const car = createInitialRace(makeConfig('strategy-inter')).cars[0]
    const outlook = strategyOutlookFor({
      car: withF1Tires(car, { tire: 'I', tireAgeLaps: 5 }),
      driver: initialDrivers[0],
      lap: 12,
      raceLaps: 58,
      seed: 'strategy-inter',
      trackGrip: 0.82,
      underSafetyCar: false,
      weather: 'light-rain',
    })

    expect(outlook?.compound).toBe('I')
  })

  it('can pit early for a reliable weather forecast under safety car', () => {
    const driver = initialDrivers[0]
    const baseCar = createInitialRace(makeConfig('forecast-call')).cars[0]
    const car = withF1Tires({
      ...baseCar,
      brakeTemperatureC: 760,
      damage: 0,
      pitStops: 0,
    }, {
      tire: 'M',
      tireAgeLaps: 12,
      tireWearPercent: 55,
      compoundsUsed: ['M'] as TireCompound[],
    })
    const decision = decidePitStop({
      seed: 'forecast-call',
      driver,
      car,
      lap: 14,
      raceLaps: 40,
      underSafetyCar: true,
      weather: 'clear',
      trackGrip: 1,
      forecast: {
        weather: 'light-rain',
        weatherLabel: 'LIGHT RAIN',
        trackGrip: 0.82,
        secondsAhead: 120,
        confidence: 0.78,
        willChange: true,
        label: 'LIGHT RAIN in 2m (78%)',
      },
    })

    expect(decision?.reason).toBe('forecast')
    expect(decision?.compound).toBe('I')
  })

  it('can call an undercut when a car is close ahead in the pit window', () => {
    const driver = {
      ...initialDrivers[0],
      skills: { ...initialDrivers[0].skills, overtakingSkill: 0.95 },
    }
    const cliff = effectiveCliffLaps('M', driver.skills.tireManagement)
    const baseCar = createInitialRace(makeConfig('undercut-window')).cars[0]
    const car = withF1Tires({
      ...baseCar,
      brakeTemperatureC: 780,
      damage: 0,
      pitStops: 0,
    }, {
      tire: 'M',
      tireAgeLaps: Math.ceil(cliff - 3),
      tireWearPercent: 58,
      compoundsUsed: ['M'] as TireCompound[],
    })
    const outcomes = Array.from({ length: 80 }, (_, index) =>
      decidePitStop({
        seed: `undercut-window-${index}`,
        driver,
        car,
        lap: 22,
        raceLaps: 52,
        underSafetyCar: false,
        weather: 'clear',
        trackGrip: 1,
        gapToAheadSeconds: 0.82,
        gapBehindSeconds: 2.8,
        position: 5,
      }),
    )

    expect(outcomes.some((outcome) => outcome?.reason === 'undercut')).toBe(true)
  })

  it('defers a routine green-flag stop when the pit lane is already busy', () => {
    const driver = {
      ...initialDrivers[0],
      skills: { ...initialDrivers[0].skills, overtakingSkill: 0.95 },
    }
    const cliff = effectiveCliffLaps('M', driver.skills.tireManagement)
    const baseCar = createInitialRace(makeConfig('pit-lane-congestion')).cars[0]
    const car = withF1Tires({
      ...baseCar,
      brakeTemperatureC: 780,
      damage: 0,
      pitStops: 0,
    }, {
      tire: 'M',
      tireAgeLaps: Math.ceil(cliff - 2),
      tireWearPercent: 64,
      compoundsUsed: ['M'] as TireCompound[],
    })
    const decision = decidePitStop({
      seed: 'pit-lane-congestion',
      driver,
      car,
      lap: 22,
      raceLaps: 52,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 1,
      gapToAheadSeconds: 0.82,
      gapBehindSeconds: 2.8,
      position: 5,
      pitLaneOccupancy: pitTuning.normalPitLaneCapacity,
    })

    expect(decision).toBeNull()
  })

  it('boxes for measured tire wear or sustained brake overheating', () => {
    const baseCar = createInitialRace(makeConfig('sensor-strategy')).cars[0]
    const tireDecision = decidePitStop({
      seed: 'sensor-strategy-tire',
      driver: initialDrivers[0],
      car: withF1Tires({ ...baseCar, brakeTemperatureC: 760 }, { tireWearPercent: 91 }),
      lap: 12,
      raceLaps: 57,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 1,
    })
    const brakeDecision = decidePitStop({
      seed: 'sensor-strategy-brake',
      driver: initialDrivers[0],
      car: withF1Tires({
        ...baseCar,
        brakeTemperatureC: 1115,
        brakeOverheatSeconds: pitTuning.brakeOverheatPitSeconds + 1,
      }, { tireWearPercent: 22 }),
      lap: 12,
      raceLaps: 57,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 1,
    })

    expect(tireDecision?.reason).toBe('tire-condition')
    expect(brakeDecision?.reason).toBe('brake-cooling')
  })

  it('does not pit for a normal short-lived brake temperature peak', () => {
    const baseCar = createInitialRace(makeConfig('brake-peak')).cars[0]
    const decision = decidePitStop({
      seed: 'brake-peak',
      driver: initialDrivers[0],
      car: withF1Tires({
        ...baseCar,
        brakeTemperatureC: 1115,
        brakeOverheatSeconds: 4,
      }, { tireWearPercent: 22 }),
      lap: 12,
      raceLaps: 57,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 1,
    })

    expect(decision).toBeNull()
  })
})

describe('manual strategy request', () => {
  it('consumes a requested tire set at the next eligible pit decision', () => {
    const config = makeConfig('manual-box')
    const requests = new Map([[initialDrivers[0].id, 'H' as const]])
    let snapshot = createInitialRace(config)

    snapshot = runThroughStart(config, snapshot)
    snapshot = advanceRace(snapshot, 210, config, requests)
    const car = snapshot.cars.find((candidate) => candidate.driverId === initialDrivers[0].id)!

    expect(requests.has(initialDrivers[0].id)).toBe(false)
    expect(car.pitStops).toBeGreaterThanOrEqual(1)
    expect(f1Tires(car).pendingTire === 'H' || f1Tires(car).tire === 'H').toBe(true)
    expect(car.lapHistory.some((lap) => lap.pitStop)).toBe(true)
  })

  it('applies a driver pace instruction to live wear and state', () => {
    const config = makeConfig('manual-pace')
    const paceModes = new Map([[initialDrivers[0].id, 'push' as const]])
    let snapshot = createInitialRace(config)

    snapshot = runThroughStart(config, snapshot)
    snapshot = advanceRace(snapshot, 1, config, undefined, paceModes)
    const car = snapshot.cars.find((candidate) => candidate.driverId === initialDrivers[0].id)!

    expect(car.racePaceMode).toBe('push')
    expect(f1Tires(car).tireWearPercent).toBeGreaterThan(0)
    expect(car.brakeTemperatureC).toBeGreaterThan(260)
  })

  it('automatically pushes when a healthy CPU car can catch the car ahead', () => {
    const config = makeConfig('automatic-pursuit-pace')
    let snapshot = runThroughStart(config)
    const target = snapshot.cars.find((car) => car.position === 5)!

    snapshot = {
      ...snapshot,
      cars: snapshot.cars.map((car) =>
        car.driverId === target.driverId
          ? withF1Tires(withF1RuntimeFields({
              ...car,
              damage: 0,
              gapToAhead: 1.8,
              racePaceMode: 'standard' as const,
            }, {
              ersBatteryPercent: 78,
            }), {
              tireOverheatingPercent: 10,
              tireWearPercent: 18,
            })
          : car,
      ),
    }
    // Pace is decided once per mini sector and a mode holds one timing sector
    // before it may change, so the decision is not visible within a tick. Run
    // out that hold rather than asserting on a state the model has not been
    // given the chance to reach.
    for (let second = 0; second < 30; second += 1) {
      snapshot = advanceRace(snapshot, 1, config)
    }

    const pursuing = snapshot.cars.find(
      (car) => car.driverId === target.driverId,
    )!

    expect(pursuing.racePaceMode).toBe('push')
  })
})

describe('procedural penalty service', () => {
  it('serves a drive-through without changing tires or counting a pit stop', () => {
    const config = makeConfig('drive-through-service')
    let snapshot = runThroughStart(config)
    const targetId = initialDrivers[0].id
    const target = snapshot.cars.find((car) => car.driverId === targetId)!
    const distance = 2.99

    snapshot = {
      ...snapshot,
      cars: snapshot.cars.map((car) =>
        car.driverId === targetId
          ? {
              ...car,
              lap: 2,
              lapStartedAtSeconds: snapshot.elapsedSeconds - 80,
              penalties: [
                {
                  id: 'forced-drive-through',
                  issuedAtSeconds: snapshot.elapsedSeconds,
                  kind: 'drive-through' as const,
                  mustServeByLap: 5,
                  penaltyPoints: 0,
                  reason: 'Test procedure',
                  seconds: 20,
                  served: false,
                  servedAtSeconds: null,
                },
              ],
              penaltySeconds: 20,
              processedLap: 2,
              progress: distance % 1,
              totalDistance: distance,
            }
          : car,
      ),
    }
    snapshot = advanceRace(snapshot, 8, config)
    const serving = snapshot.cars.find((car) => car.driverId === targetId)!

    expect(serving.status).toBe('pit')
    expect(serving.pitServiceKind).toBe('drive-through')
    expect(serving.pitStops).toBe(target.pitStops)
    expect(serving.penaltySeconds).toBe(0)
    expect(serving.penalties[0].served).toBe(true)
  })
})

describe('calendar regression', () => {
  it('keeps every configured round runnable with a mapped layout contract', () => {
    expect(tracks).toHaveLength(24)

    for (const track of tracks) {
      expect(track.layoutSource?.detail).toBe('real')
      expect(track.centerline.length).toBeGreaterThan(30)
      expect(track.sectorMarks).toHaveLength(3)
      expect(track.sectorMarks[0]).toBeLessThan(track.sectorMarks[1])
      expect(track.sectorMarks[1]).toBeLessThan(track.sectorMarks[2])
      expect(track.sectorMarks[2]).toBeLessThan(1)
      expect(track.pitLane?.boxCount).toBeGreaterThan(0)
      expect(raceLapsFor(track)).toBeGreaterThan(0)

      const config = {
        ...makeConfig(`calendar-${track.id}`),
        track,
      }
      const running = runThroughStart(config)

      expect(running.startProcedure).toBe('racing')
      expect(running.cars.every((car) => Number.isFinite(car.totalDistance))).toBe(true)
      expect(running.cars.every((car) => Number.isFinite(car.projectedLapTime))).toBe(true)
    }
  })
})

describe('OpenF1 race control mapping', () => {
  it('maps common race-control messages to local flag states', () => {
    expect(
      flagFromRaceControl({
        category: 'Flag',
        date: '2026-07-09T00:00:00+00:00',
        driver_number: null,
        flag: 'YELLOW',
        lap_number: 4,
        message: 'YELLOW FLAG IN SECTOR 2',
        qualifying_phase: null,
        scope: 'Sector',
        sector: 2,
      }),
    ).toEqual({ flag: 'yellow', flagLabel: 'YELLOW S2' })

    expect(
      flagFromRaceControl({
        category: 'SafetyCar',
        date: '2026-07-09T00:01:00+00:00',
        driver_number: null,
        flag: null,
        lap_number: 5,
        message: 'VIRTUAL SAFETY CAR DEPLOYED',
        qualifying_phase: null,
        scope: null,
        sector: null,
      }),
    ).toEqual({ flag: 'vsc', flagLabel: 'VSC' })
  })
})

describe('OpenF1 field calibration', () => {
  it('uses championship standings when factual standings are available', () => {
    const nor = initialDrivers.find((driver) => driver.code === 'NOR')!
    const source = {
      championshipDrivers: [
        {
          driver_number: 4,
          points_current: 100,
          points_start: 90,
          position_current: 1,
          position_start: 1,
        },
      ],
      championshipTeams: [
        {
          team_name: 'McLaren',
          points_current: 180,
          points_start: 160,
          position_current: 1,
          position_start: 1,
        },
      ],
      drivers: [
        {
          driver_number: 4,
          full_name: nor.name,
          name_acronym: 'NOR',
          team_colour: 'FF8700',
          team_name: 'McLaren',
        },
      ],
    }
    const calibrated = calibrateFieldFromOpenF1(initialTeams, initialDrivers, source)
    const mclaren = calibrated.teams.find((team) => team.id === 'mclaren')!
    const calibratedNor = calibrated.drivers.find((driver) => driver.code === 'NOR')!

    expect(calibrated.source).toBe('openf1-calibrated')
    expect(mclaren).toEqual(initialTeams.find((team) => team.id === 'mclaren'))
    expect(calibratedNor).toEqual(nor)
  })

  it('keeps configured values when standings are unavailable', () => {
    const calibrated = calibrateFieldFromOpenF1(initialTeams, initialDrivers, null)

    expect(calibrated.source).toBe('simulation')
    expect(calibrated.teams).toEqual(initialTeams)
    expect(calibrated.drivers).toEqual(initialDrivers)
  })

  it('uses observed team top speeds as a track-specific straight-line signal', () => {
    const nor = initialDrivers.find((driver) => driver.code === 'NOR')!
    const lec = initialDrivers.find((driver) => driver.code === 'LEC')!
    const standings = {
      championshipDrivers: [],
      championshipTeams: [
        {
          team_name: 'McLaren',
          points_current: 180,
          points_start: 160,
          position_current: 1,
          position_start: 1,
        },
        {
          team_name: 'Ferrari',
          points_current: 80,
          points_start: 70,
          position_current: 2,
          position_start: 2,
        },
      ],
      drivers: [],
    }
    const telemetry = {
      carData: [
        {
          brake: 0,
          date: '2026-03-15T12:00:00+00:00',
          driver_number: 4,
          drs: 12,
          n_gear: 8,
          rpm: 12000,
          speed: 342,
          throttle: 100,
        },
        {
          brake: 0,
          date: '2026-03-15T12:00:00+00:00',
          driver_number: 16,
          drs: 12,
          n_gear: 8,
          rpm: 12000,
          speed: 323,
          throttle: 100,
        },
      ],
      drivers: [
        {
          driver_number: 4,
          full_name: nor.name,
          name_acronym: 'NOR',
          team_colour: 'FF8700',
          team_name: 'McLaren',
        },
        {
          driver_number: 16,
          full_name: lec.name,
          name_acronym: 'LEC',
          team_colour: 'DC0000',
          team_name: 'Ferrari',
        },
      ],
    }
    const calibrated = calibrateFieldFromOpenF1(
      initialTeams,
      initialDrivers,
      standings,
      telemetry,
    )

    expect(calibrated.teams).toEqual(initialTeams)
  })
})

describe('overtaking', () => {
  function closeBattleFixture() {
    const snapshot = createInitialRace(makeConfig('battle-fixture'))
    const defenderCar = withF1Tires(snapshot.cars[0], { tire: 'H' })
    const attackerCar = withF1Tires(snapshot.cars[1], { tire: 'S' })
    const defender = {
      ...initialDrivers.find((driver) => driver.id === defenderCar.driverId)!,
      skills: {
        ...initialDrivers.find((driver) => driver.id === defenderCar.driverId)!.skills,
        consistency: 0.74,
        defendingSkill: 0.62,
      },
    }
    const attacker = {
      ...initialDrivers.find((driver) => driver.id === attackerCar.driverId)!,
      skills: {
        ...initialDrivers.find((driver) => driver.id === attackerCar.driverId)!.skills,
        rawPace: 0.96,
        overtakingSkill: 0.98,
      },
    }

    return { attacker, attackerCar, defender, defenderCar }
  }

  it('is deterministic for the same close-battle inputs', () => {
    const fixture = closeBattleFixture()
    const context = {
      ...fixture,
      seed: 'wheel-to-wheel',
      lap: 8,
      gapToAheadSeconds: 0.32,
      isOpeningLap: false,
      inRestartWindow: false,
      weather: 'clear' as const,
      trackGrip: 1,
    }

    expect(overtakeForLap(context)).toEqual(overtakeForLap(context))
  })

  it('does not manufacture a second battle edge from tyre-management skill', () => {
    const fixture = closeBattleFixture()
    const common = {
      ...fixture,
      seed: 'battle-physical-tyre-owner',
      lap: 8,
      gapToAheadSeconds: 0.32,
      trackGrip: 1,
      track: tracks[0],
      trackProgress: 0.5,
      weather: 'clear' as const,
    }
    const withTireManagement = (value: number) => ({
      ...fixture.attacker,
      skills: { ...fixture.attacker.skills, tireManagement: value },
    })
    const weakest = battleDynamicsFor({
      ...common,
      attacker: withTireManagement(0),
    })
    const strongest = battleDynamicsFor({
      ...common,
      attacker: withTireManagement(1),
    })

    expect(strongest).toEqual(weakest)
    expect(strongest).not.toHaveProperty('tirePerformanceEdge')
  })

  it('does nothing when the attacker is outside the passing window', () => {
    const fixture = closeBattleFixture()

    expect(
      overtakeForLap({
        ...fixture,
        seed: 'too-far-away',
        lap: 8,
        gapToAheadSeconds: 2.4,
        isOpeningLap: false,
        inRestartWindow: false,
        weather: 'clear',
        trackGrip: 1,
      }),
    ).toBeNull()
  })

  it('can convert a close pace advantage into a pass', () => {
    const fixture = closeBattleFixture()
    const outcomes = Array.from({ length: 80 }, (_, index) =>
      overtakeForLap({
        ...fixture,
        seed: `pass-window-${index}`,
        lap: 8,
        gapToAheadSeconds: 0.22,
        isOpeningLap: false,
        inRestartWindow: false,
        weather: 'clear',
        trackGrip: 1,
      }),
    )

    expect(outcomes.some((outcome) => outcome?.kind === 'pass')).toBe(true)
  })

  it('uses the mapped 2026 straight zone and current sector', () => {
    const fixture = closeBattleFixture()
    const track = {
      ...tracks[0],
      aeroActivationZones: [
        {
          start: 0.2,
          end: 0.3,
          label: 'AERO test',
          lowGripMode: 'partial' as const,
          source: 'derived' as const,
        },
      ],
    }
    const inZoneOutcomes = Array.from({ length: 100 }, (_, index) =>
      overtakeForLap({
        ...fixture,
        seed: `mapped-aero-${index}`,
        lap: 24 + index,
        gapToAheadSeconds: 0.22,
        isOpeningLap: false,
        inRestartWindow: false,
        weather: 'clear',
        trackGrip: 1,
        track,
        trackProgress: 0.25,
        sector: 1,
      }),
    ).filter((outcome) => outcome !== null)

    expect(inZoneOutcomes.length).toBeGreaterThan(0)
    expect(inZoneOutcomes.every((outcome) => outcome.zone === 'straight')).toBe(true)
    expect(inZoneOutcomes.every((outcome) => outcome.sector === 1)).toBe(true)
  })

  it('only credits Overtake when the detection result is active', () => {
    const fixture = closeBattleFixture()
    const track = {
      ...tracks[0],
      aeroActivationZones: [
        {
          start: 0.2,
          end: 0.3,
          label: 'AERO test',
          lowGripMode: 'partial' as const,
          source: 'derived' as const,
        },
      ],
    }
    const context = {
      ...fixture,
      seed: 'overtake-latch-truth',
      lap: 18,
      gapToAheadSeconds: 0.7,
      weather: 'clear' as const,
      trackGrip: 1,
      track,
      trackProgress: 0.25,
    }
    const withoutEligibility = battleDynamicsFor({
      ...context,
      attackerCar: withF1RuntimeFields({
        ...fixture.attackerCar,
        overtakeStatus: 'available',
      }, { ersPowerKw: 250 }),
      defenderCar: withF1RuntimeFields(fixture.defenderCar, { ersPowerKw: 250 }),
    })
    const withEligibility = battleDynamicsFor({
      ...context,
      attackerCar: withF1RuntimeFields({
        ...fixture.attackerCar,
        overtakeStatus: 'active',
      }, { ersPowerKw: 350 }),
      defenderCar: withF1RuntimeFields(fixture.defenderCar, { ersPowerKw: 250 }),
    })

    expect(withoutEligibility.assistance).toBe('tow')
    expect(withoutEligibility.electricalPerformanceEdge).toBe(0)
    expect(withEligibility.assistance).toBe('overtake')
    expect(withEligibility.ersPowerDeltaKw).toBe(100)
    expect(withEligibility.electricalPerformanceEdge).toBeGreaterThan(0)
  })

  it('uses the actual speed delta when the leading car is super clipping', () => {
    const fixture = closeBattleFixture()
    const track = {
      ...tracks[0],
      aeroActivationZones: [
        {
          start: 0.2,
          end: 0.3,
          label: 'Long straight',
          lowGripMode: 'partial' as const,
          source: 'derived' as const,
        },
      ],
    }
    const closing = battleDynamicsFor({
      ...fixture,
      attackerCar: withF1RuntimeFields({
        ...fixture.attackerCar,
        speedKph: 408,
      }, { ersPowerKw: 350 }),
      defenderCar: withF1RuntimeFields({
        ...fixture.defenderCar,
        speedKph: 350,
      }, { ersPowerKw: 0, superClippingIntensity: 1 }),
      gapToAheadSeconds: 0.7,
      lap: 14,
      seed: 'clipping-closing-speed',
      track,
      trackGrip: 1,
      trackProgress: 0.25,
      weather: 'clear',
    })

    expect(closing.speedDeltaKph).toBe(58)
    expect(closing.speedPerformanceEdge).toBeGreaterThan(0)
  })

  it('leaves live tyre wear and temperature to the physical car state', () => {
    const fixture = closeBattleFixture()
    const baseContext = {
      ...fixture,
      seed: 'battle-tire-state',
      lap: 21,
      gapToAheadSeconds: 0.45,
      weather: 'clear' as const,
      trackGrip: 1,
      track: tracks[0],
      trackProgress: 0.5,
    }
    const healthyTires = battleDynamicsFor({
      ...baseContext,
      attackerCar: withF1Tires(fixture.attackerCar, {
        tireAgeLaps: 2,
        tireTemperatureC: 98,
        tireWearPercent: 8,
      }),
      defenderCar: withF1Tires(fixture.defenderCar, {
        tireAgeLaps: 25,
        tireTemperatureC: 122,
        tireWearPercent: 88,
      }),
    })
    const reversedTires = battleDynamicsFor({
      ...baseContext,
      attackerCar: withF1Tires(fixture.attackerCar, {
        tireAgeLaps: 25,
        tireTemperatureC: 122,
        tireWearPercent: 88,
      }),
      defenderCar: withF1Tires(fixture.defenderCar, {
        tireAgeLaps: 2,
        tireTemperatureC: 98,
        tireWearPercent: 8,
      }),
    })

    expect(healthyTires).toEqual(reversedTires)
    expect(healthyTires).not.toHaveProperty('tirePerformanceEdge')
  })

  it('evaluates battle segments before a racing lap is complete', () => {
    const config = makeConfig('segment-battles')
    let snapshot = createInitialRace(config)

    snapshot = runThroughStart(config, snapshot)
    snapshot = advanceRace(snapshot, 1, config)

    expect(snapshot.startProcedure).toBe('racing')
    expect(snapshot.cars[0].lapHistory).toHaveLength(0)
    expect(snapshot.cars[0].processedBattleSegment).toBeGreaterThanOrEqual(12)
  })

  it('moves attack and defence lines continuously within physical bounds', () => {
    const drivers = initialDrivers.slice(0, 2)
    const teamIds = new Set(drivers.map((driver) => driver.teamId))
    const config: RaceConfig = {
      ...makeConfig('stable-straight-lines'),
      drivers,
      teams: initialTeams.filter((team) => teamIds.has(team.id)),
    }
    const straightProgress =
      Array.from({ length: 800 }, (_, index) => 0.08 + index / 1_000).find(
        (progress) =>
          progress < 0.9 &&
          trackDynamicsAt(config.track, progress).turnDirection === 0,
      ) ?? 0.5
    const started = runThroughStart(config)
    const leaderId = started.cars[0].driverId
    const attackerId = started.cars[1].driverId
    const attackerDistance = 2 + straightProgress
    const leaderDistance = attackerDistance + 0.004
    const prepared: RaceSnapshot = {
      ...started,
      cars: started.cars.map((car) => {
        const isLeader = car.driverId === leaderId
        const totalDistance = isLeader ? leaderDistance : attackerDistance

        return {
          ...car,
          battleOpponentId: null,
          battlePhase: 'single-file' as const,
          battlePhaseUntilSeconds: null,
          currentLapSectorTimes: [null, null, null],
          gapToAhead: isLeader ? 0 : 0.5,
          gapToLeader: isLeader ? 0 : 0.5,
          lap: Math.floor(totalDistance),
          lapStartedAtSeconds: started.elapsedSeconds - 20,
          position: isLeader ? 1 : 2,
          processedBattleSegment: Math.floor(totalDistance * 12) + 10,
          processedLap: Math.floor(totalDistance),
          progress: totalDistance - Math.floor(totalDistance),
          totalDistance,
          desiredLateralOffsetM: 0,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          trackLateralOffset: 0,
        }
      }),
    }
    const tickSeconds = 0.05
    let snapshot = prepared
    const attackerOffsets = [0]
    const leaderOffsets = [0]

    for (let step = 0; step < 20; step += 1) {
      snapshot = advanceRace(snapshot, tickSeconds, config)
      attackerOffsets.push(
        snapshot.cars.find((car) => car.driverId === attackerId)!
          .lateralOffsetM,
      )
      leaderOffsets.push(
        snapshot.cars.find((car) => car.driverId === leaderId)!.lateralOffsetM,
      )
    }

    const bounds = lateralBoundsForTrack(config.track)
    const maximumTickTravelM = MAX_LATERAL_SPEED_MPS * tickSeconds + 1e-6
    const assertContinuous = (offsets: number[]) => {
      expect(offsets.some((offset) => Math.abs(offset) > 0.01)).toBe(true)
      for (let index = 1; index < offsets.length; index += 1) {
        expect(Math.abs(offsets[index] - offsets[index - 1])).toBeLessThanOrEqual(
          maximumTickTravelM,
        )
      }
    }

    assertContinuous(attackerOffsets)
    assertContinuous(leaderOffsets)
    for (const car of snapshot.cars) {
      expect(Math.abs(car.lateralOffsetM)).toBeLessThanOrEqual(
        bounds.maxOffsetM + 1e-6,
      )
      expect(Math.abs(car.desiredLateralOffsetM)).toBeLessThanOrEqual(
        bounds.maxOffsetM + 1e-6,
      )
      expect(car.trackLateralOffset).toBeCloseTo(car.lateralOffsetM, 10)
    }
  })
})

describe('qualifying', () => {
  it('is deterministic for the same seed and config', () => {
    const config = makeConfig('qualifying-repeat')

    expect(runQualifying(config)).toEqual(runQualifying(config))
  })

  it('returns a complete ordered classification with pole at zero delta', () => {
    const results = runQualifying(makeConfig('qualifying-order'))
    const positions = results.map((result) => result.position)

    expect(results).toHaveLength(initialDrivers.length)
    expect(positions).toEqual(
      Array.from({ length: initialDrivers.length }, (_, index) => index + 1),
    )
    expect(results[0].deltaSeconds).toBe(0)
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index].deltaSeconds).toBeGreaterThanOrEqual(0)
    }
  })

  it('runs a Q1/Q2/Q3 knockout format', () => {
    const config = {
      ...makeConfig('qualifying-knockout'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const session = runKnockoutQualifying(config)

    expect(session.segments.map((segment) => segment.name)).toEqual(['Q1', 'Q2', 'Q3'])
    // The 22-car field follows the configured 22 -> 16 -> 10 knockout.
    expect(session.segments[0].results).toHaveLength(initialDrivers.length)
    expect(session.segments[0].eliminatedDriverIds).toHaveLength(6)
    expect(session.segments[1].results).toHaveLength(16)
    expect(session.segments[1].eliminatedDriverIds).toHaveLength(6)
    expect(session.segments[2].results).toHaveLength(10)
    expect(session.classification).toHaveLength(initialDrivers.length)
    expect(session.classification.map((result) => result.position)).toEqual(
      Array.from({ length: initialDrivers.length }, (_, index) => index + 1),
    )
    expect(session.segments[0].sessionDurationSeconds).toBe(18 * 60)
    expect(session.segments[1].sessionDurationSeconds).toBe(15 * 60)
    expect(session.segments[2].sessionDurationSeconds).toBe(13 * 60)
    expect(session.classification.every((result) => result.runCount > 0)).toBe(true)
    expect(
      session.classification.every(
        (result) =>
          result.validRunCount > 0 &&
          result.validRunCount <= result.runCount &&
          result.abortedRunCount >= 0,
      ),
    ).toBe(true)
    expect(
      session.classification.every(
        (result) =>
          result.tire.kind === 'f1-pirelli-session-tire' &&
          result.tire.compound === 'S',
      ),
    ).toBe(true)
    expect(
      session.classification.every(
        (result) =>
          result.outLapTimeSeconds > result.lapTimeSeconds &&
          result.inLapTimeSeconds > result.lapTimeSeconds,
      ),
    ).toBe(true)
  })

  it('uses medium tires for SQ1/SQ2 and soft tires for SQ3', () => {
    const config = {
      ...makeConfig('sprint-shootout'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const session = runSprintShootoutQualifying(config)

    expect(session.segments.map((segment) => segment.name)).toEqual([
      'SQ1',
      'SQ2',
      'SQ3',
    ])
    expect(session.segments[0].sessionDurationSeconds).toBe(12 * 60)
    expect(session.segments[1].sessionDurationSeconds).toBe(10 * 60)
    expect(session.segments[2].sessionDurationSeconds).toBe(8 * 60)
    expect(
      session.segments[0].results.every(
        (result) =>
          result.tire.kind === 'f1-pirelli-session-tire' &&
          result.tire.compound === 'M',
      ),
    ).toBe(true)
    expect(
      session.segments[1].results.every(
        (result) =>
          result.tire.kind === 'f1-pirelli-session-tire' &&
          result.tire.compound === 'M',
      ),
    ).toBe(true)
    expect(
      session.segments[2].results.every(
        (result) =>
          result.tire.kind === 'f1-pirelli-session-tire' &&
          result.tire.compound === 'S',
      ),
    ).toBe(true)
  })

  it('builds a weekend tire plan from qualifying and sprint qualifying usage', () => {
    const config = {
      ...makeConfig('weekend-tire-plan'),
      track: { ...tracks[0], rainProbability: 0 },
    }
    const qualifying = runKnockoutQualifying(config)
    const sprintShootout = runSprintShootoutQualifying(config)
    const plan = buildWeekendTirePlan(config, qualifying, sprintShootout)

    expect(plan.driverPlans).toHaveLength(initialDrivers.length)
    expect(plan.driverPlans.every((driverPlan) => driverPlan.remaining.S <= 6)).toBe(
      true,
    )
    expect(plan.driverPlans.every((driverPlan) => driverPlan.remaining.M <= 4)).toBe(
      true,
    )
    expect(
      plan.driverPlans.every((driverPlan) =>
        ['S', 'M', 'H', 'I', 'W'].includes(driverPlan.raceStartCompound),
      ),
    ).toBe(true)
    expect(
      plan.driverPlans.every((driverPlan) =>
        isDryCompound(driverPlan.raceStartCompound),
      ),
    ).toBe(true)
    expect(
      [...new Set(plan.driverPlans.map((driverPlan) => driverPlan.raceStartCompound))]
        .sort(),
    ).toEqual(['H', 'M', 'S'])
    const positions = new Map(
      qualifying.classification.map((result) => [result.driverId, result.position]),
    )
    const topTenCompounds = new Set(
      plan.driverPlans
        .filter((driverPlan) => (positions.get(driverPlan.driverId) ?? 99) <= 10)
        .map((driverPlan) => driverPlan.raceStartCompound),
    )
    const bottomTenCompounds = new Set(
      plan.driverPlans
        .filter(
          (driverPlan) =>
            (positions.get(driverPlan.driverId) ?? 0) >
            initialDrivers.length / 2,
        )
        .map((driverPlan) => driverPlan.raceStartCompound),
    )
    expect(topTenCompounds.size).toBeGreaterThan(1)
    expect(bottomTenCompounds.size).toBeGreaterThan(1)
    const alternatePlan = buildWeekendTirePlan(
      { ...config, seed: 'weekend-tire-plan-alternate' },
      qualifying,
      sprintShootout,
    )

    expect(
      alternatePlan.driverPlans.map((driverPlan) => driverPlan.raceStartCompound),
    ).not.toEqual(
      plan.driverPlans.map((driverPlan) => driverPlan.raceStartCompound),
    )
    expect(
      plan.driverPlans.some(
        (driverPlan) =>
          driverPlan.qualifyingUsed.S > 0 || driverPlan.qualifyingUsed.M > 0,
      ),
    ).toBe(true)
  })

  it('keeps starting compounds in the category required by track conditions', () => {
    expect(legalStartCompoundForConditions('W', 'clear', 1)).toBe('M')
    expect(legalStartCompoundForConditions('I', 'clear', 0.97)).toBe('M')
    expect(legalStartCompoundForConditions('S', 'light-rain', 0.88)).toBe('I')
    expect(legalStartCompoundForConditions('I', 'light-rain', 0.88)).toBe('I')
    expect(legalStartCompoundForConditions('W', 'light-rain', 0.88)).toBe('W')
    expect(legalStartCompoundForConditions('H', 'heavy-rain', 0.72)).toBe('W')
    expect(legalStartCompoundForConditions('I', 'heavy-rain', 0.72)).toBe('W')
    expect(legalStartCompoundForConditions('M', 'clear', 1)).toBe('M')
  })

  it('splits intermediate and wet starts near a wet crossover', () => {
    const wetTrack = { ...tracks[0], rainProbability: 0.75 }
    const seed = Array.from({ length: 2_000 }, (_, index) => `mixed-wet-${index}`).find(
      (candidate) => weatherFor(candidate, wetTrack, 0) === 'light-rain',
    )

    expect(seed).toBeDefined()
    const config = { ...makeConfig(seed!), seed: seed!, track: wetTrack }
    const qualifying = runKnockoutQualifying({
      ...config,
      track: { ...wetTrack, rainProbability: 0 },
    })
    const plan = buildWeekendTirePlan(config, qualifying)
    const compounds = new Set(
      plan.driverPlans.map((driverPlan) => driverPlan.raceStartCompound),
    )

    expect([...compounds].every((compound) => compound === 'I' || compound === 'W')).toBe(
      true,
    )
    expect(compounds).toEqual(new Set(['I', 'W']))
  })

  it('uses the 2026 FIA standard and sprint weekend tire allocations', () => {
    expect(weekendTireAllocation(false)).toEqual({ H: 2, I: 5, M: 3, S: 8, W: 2 })
    expect(weekendTireAllocation(true)).toEqual({ H: 2, I: 6, M: 4, S: 6, W: 2 })
  })

  it('makes a used qualifying set available when a feature-race specification is exhausted', () => {
    const base = makeConfig('reusable-feature-race-set')
    const driver = base.drivers[0]
    const drivers = base.drivers.map((candidate) =>
      candidate.id === driver.id ? { ...candidate, tire: 'H' as const } : candidate,
    )
    const weekendContext = createWeekendContext(drivers, false, base.track, {
      H: 3,
      I: 2,
      M: 0,
      S: 2,
      W: 1,
    })
    weekendContext.tireSetsByDriver[driver.id].S = 0
    weekendContext.tireSetInventoryByDriver[driver.id] =
      weekendContext.tireSetInventoryByDriver[driver.id].map((set) =>
        set.id === `${driver.id}-S-1`
          ? { ...set, laps: 4, status: 'used' as const }
          : set,
      )

    const snapshot = createInitialRace({
      ...base,
      drivers,
      featureRaceMandatoryPitStop: true,
      featureRaceTwoDryCompounds: true,
      tireAllocation: { H: 3, I: 2, M: 0, S: 2, W: 1 },
      weekendContext,
      weekendStage: 'race',
    })
    const car = snapshot.cars.find((candidate) => candidate.driverId === driver.id)

    expect(car?.runtimeSystems.kind).toBe('f1')
    expect(car && car.runtimeSystems.kind === 'f1'
      ? car.runtimeSystems.tires.tireSetsRemaining.S
      : undefined).toBe(1)
  })

  it('models practice as a one-hour setup session', () => {
    const results = runPracticeSession(makeConfig('practice-setup'), 'fp1')

    expect(results).toHaveLength(initialDrivers.length)
    expect(results[0].sessionDurationSeconds).toBe(60 * 60)
    expect(results.every((result) => result.setupScore >= 1)).toBe(true)
    expect(results.every((result) => result.lapsCompleted > 0)).toBe(true)
  })

  it('keeps fixed machine and driver capabilities while deriving setup data', () => {
    const config = makeConfig('practice-deltas')
    const summary = buildPracticeSetupSummary(config, ['fp1', 'fp2', 'fp3'])
    const adjusted = applyPracticeSetup(config, summary)

    expect(summary).toEqual(buildPracticeSetupSummary(config, ['fp1', 'fp2', 'fp3']))
    expect(summary.teamSummaries).toHaveLength(initialTeams.length)
    expect(summary.driverSummaries).toHaveLength(initialDrivers.length)
    expect(adjusted.teams).toEqual(config.teams)
    expect(adjusted.drivers).toEqual(config.drivers)
  })

  it('can seed race start offsets from qualifying order', () => {
    const results = runQualifying(makeConfig('qualifying-grid'))
    const grid = applyQualifyingGrid(initialDrivers, results)

    expect(grid[0].id).toBe(results[0].driverId)
    expect(grid[0].startOffset).toBe(0)
    expect(grid[1].startOffset).toBeCloseTo(-QUALIFYING_GRID_SPACING)
  })

  it('accepts a factual grid order without inventing qualifying telemetry', () => {
    const grid = applyQualifyingGrid(initialDrivers, [
      { driverId: initialDrivers[3].id, position: 2 },
      { driverId: initialDrivers[2].id, position: 1 },
    ])

    expect(grid[0].id).toBe(initialDrivers[2].id)
    expect(grid[1].id).toBe(initialDrivers[3].id)
  })
})

describe('incidents', () => {
  it('uses VSC off track, SC on track, and red for a major blocked accident', () => {
    // Both cars drive away: nothing is stopped, so the race is not neutralised.
    expect(
      crashFlagResponseFor({
        attackerRetires: false,
        defenderRetires: false,
        obstructionRoll: 0.99,
      }),
    ).toBe('yellow')
    expect(
      crashFlagResponseFor({
        attackerRetires: false,
        defenderRetires: false,
        obstructionRoll: 0.05,
      }),
    ).toBe('yellow')
    expect(
      crashFlagResponseFor({
        attackerRetires: true,
        defenderRetires: false,
        obstructionRoll: 0.2,
      }),
    ).toBe('vsc')
    expect(
      crashFlagResponseFor({
        attackerRetires: true,
        defenderRetires: false,
        obstructionRoll: 0.8,
      }),
    ).toBe('sc')
    expect(
      crashFlagResponseFor({
        attackerRetires: true,
        defenderRetires: true,
        obstructionRoll: 0.97,
      }),
    ).toBe('red')
    expect(terminalCrashFlagResponse(0.1)).toBe('vsc')
    expect(terminalCrashFlagResponse(0.5)).toBe('sc')
    expect(terminalCrashFlagResponse(0.98)).toBe('red')
  })

  it('is deterministic for the same inputs', () => {
    const driver = initialDrivers[5]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const a = incidentForLap('seed-x', driver, team, 12)
    const b = incidentForLap('seed-x', driver, team, 12)

    expect(a).toEqual(b)
  })

  it('never fires on the opening lap', () => {
    for (const driver of initialDrivers) {
      const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
      expect(incidentForLap('any-seed', driver, team, 1)).toBeNull()
    }
  })

  it('produces a plausible number of incidents across a race distance', () => {
    const raceLaps = raceLapsFor(tracks[0])
    let incidents = 0
    let retirements = 0

    for (const driver of initialDrivers) {
      const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!

      for (let lap = 2; lap <= raceLaps; lap += 1) {
        const incident = incidentForLap('frequency-seed', driver, team, lap)

        if (incident) {
          incidents += 1
          retirements += incident.retirement ? 1 : 0
        }
      }
    }

    // A 30-car field over a full distance should have action without attrition
    // scaling mechanically with entry count.
    expect(incidents).toBeGreaterThan(0)
    expect(incidents).toBeLessThan(24)
    expect(retirements).toBeLessThanOrEqual(4)
  })
})

describe('red-flag restart', () => {
  const spacingLaps = 0.4 / 90

  function scatteredField() {
    const snapshot = createInitialRace(makeConfig('red-restart'))
    const oneLapDownIndex = snapshot.cars.length - 2
    const twoLapsDownIndex = snapshot.cars.length - 1

    return snapshot.cars.map((car, index) => ({
      ...car,
      status: 'running' as const,
      // Leader on lap 21 (total 20.6); the field scattered behind, with the
      // last two cars one and two whole laps down.
      totalDistance:
        index === oneLapDownIndex
          ? 19.55
          : index === twoLapsDownIndex
            ? 18.35
            : 20.6 - index * 0.018,
      position: index + 1,
    }))
  }

  it('re-forms running cars nose to tail in classification order', () => {
    const cars = reformFieldForRedRestart(scatteredField(), spacingLaps)
    const firstLappedIndex = cars.length - 2

    // Leader is untouched; everyone else queues behind at fixed spacing.
    expect(cars[0].totalDistance).toBeCloseTo(20.6, 6)

    for (let index = 1; index < firstLappedIndex; index += 1) {
      expect(cars[index].totalDistance).toBeCloseTo(
        20.6 - index * spacingLaps,
        6,
      )
    }
  })

  it('keeps lapped cars lapped while joining the queue on track', () => {
    const cars = reformFieldForRedRestart(scatteredField(), spacingLaps)
    const oneLapDownIndex = cars.length - 2
    const twoLapsDownIndex = cars.length - 1
    const oneLapDeficit =
      cars[0].totalDistance - cars[oneLapDownIndex].totalDistance
    const twoLapDeficit =
      cars[0].totalDistance - cars[twoLapsDownIndex].totalDistance

    // Whole-lap deficits survive the re-formation...
    expect(Math.floor(oneLapDeficit)).toBe(1)
    expect(Math.floor(twoLapDeficit)).toBe(2)

    // ...while their on-track position joins the restart queue.
    const oneLapQueuePosition = cars[oneLapDownIndex].totalDistance % 1
    const twoLapQueuePosition = cars[twoLapsDownIndex].totalDistance % 1
    const leaderPosition = cars[0].totalDistance % 1

    expect(Math.abs(leaderPosition - oneLapQueuePosition)).toBeLessThan(
      spacingLaps * cars.length,
    )
    expect(Math.abs(leaderPosition - twoLapQueuePosition)).toBeLessThan(
      spacingLaps * cars.length,
    )
  })

  it('leaves pit, retired, and finished cars untouched', () => {
    const field = scatteredField()
    const modified = field.map((car, index) => ({
      ...car,
      status:
        index === 3
          ? ('pit' as const)
          : index === 5
            ? ('retired' as const)
            : car.status,
    }))
    const cars = reformFieldForRedRestart(modified, spacingLaps)

    expect(cars[3].totalDistance).toBe(modified[3].totalDistance)
    expect(cars[5].totalDistance).toBe(modified[5].totalDistance)
    // Queue indexes skip non-running cars, so the queue stays contiguous.
    expect(cars[4].totalDistance).toBeCloseTo(20.6 - 3 * spacingLaps, 6)
  })

  it('never reorders the classification during the re-formation', () => {
    const cars = reformFieldForRedRestart(scatteredField(), spacingLaps)
    const runningDistances = cars
      .filter((car) => car.status === 'running')
      .map((car) => car.totalDistance)
    const sorted = [...runningDistances].sort((a, b) => b - a)

    expect(runningDistances).toEqual(sorted)
  })
})

describe('race session completion', () => {
  it('records race and sprint completions exactly once', () => {
    const base = createWeekendContext(initialDrivers)
    const afterRace = completeRaceSession(base, 'race')
    const repeated = completeRaceSession(afterRace, 'race')

    expect(afterRace.completed).toContain('race')
    expect(afterRace.notes.at(-1)).toBe('Race classification recorded')
    expect(repeated).toBe(afterRace)
    expect(
      completeRaceSession(base, 'sprint').completed,
    ).toContain('sprint')
  })
})

describe('SUPER FORMULA race-distance authority', () => {
  const series = seriesPackageById.get('super-formula')!
  const baseConfig: RaceConfig = {
    drivers: series.drivers,
    overtakeSystem: 'ots',
    seed: 'sf-race-distance-authority',
    seriesId: 'super-formula',
    teams: series.teams,
    track: series.tracks[0],
    weekendStage: 'race',
  }

  it('does not invent a race distance from a Super Formula track or category default', () => {
    expect(() => createInitialRace(baseConfig)).toThrow(
      'SUPER FORMULA race distance is unavailable',
    )
  })

  it('uses an explicitly supplied event or Free Mode lap count without a fallback', () => {
    expect(
      createInitialRace({ ...baseConfig, sessionRaceLapsOverride: 25 }).raceLaps,
    ).toBe(25)
  })

  it('treats carried standing water as wet under clear weather at session start and a pit tire fit', () => {
    const track = { ...series.tracks[0], rainProbability: 0 }
    const baseWeekend = createWeekendContext(
      series.drivers,
      track.isSprintWeekend,
      track,
      undefined,
      'super-formula',
    )
    const fresh = createInitialRace({
      ...baseConfig,
      track,
      weekendContext: baseWeekend,
      weekendStage: 'qualifying',
    })
    const carriedState = {
      ...fresh.trackSurface,
      dryness: fresh.trackSurface.dryness.map(() => 0),
      waterFilmMm: fresh.trackSurface.waterFilmMm.map(() => 2),
    }
    const weekendContext = {
      ...baseWeekend,
      trackSurfaceCarry: { state: carriedState, trackId: track.id },
    }
    const config: RaceConfig = {
      ...baseConfig,
      track,
      weekendContext,
      sessionRaceLapsOverride: 25,
    }
    const initial = createInitialRace(config)
    const initialRuntime = initial.cars[0]!.runtimeSystems

    expect(initial.weather).toBe('clear')
    expect(
      trackSurfaceSectorSummary(initial.trackSurface).surfaceWaterMmBySector.every(
        (water) => water > 0,
      ),
    ).toBe(true)
    if (initialRuntime.kind !== 'super-formula') {
      throw new Error('Expected SUPER FORMULA runtime')
    }
    expect(initialRuntime.liveTires.activeSurface).toBe('wet')

    const released = advanceRace(
      {
        ...initial,
        elapsedLabel: '00:00:10',
        elapsedSeconds: 10,
        raceStartedAtSeconds: 0,
        startProcedure: 'racing',
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                pitLaneProgress: track.pitLane?.exitProgress ?? 0.13,
                pitPhase: 'box' as const,
                pitServiceKind: 'tire-stop' as const,
                pitStartedAtSeconds: 9,
                pitUntilSeconds: 10,
                status: 'pit' as const,
              }
            : car,
        ),
      },
      0.1,
      config,
    )
    const releasedRuntime = released.cars[0]!.runtimeSystems

    if (releasedRuntime.kind !== 'super-formula') {
      throw new Error('Expected SUPER FORMULA runtime')
    }
    expect(releasedRuntime.liveTires.activeSurface).toBe('wet')
    expect(releasedRuntime.liveTires.fitment.sequence).toBe(
      initialRuntime.liveTires.fitment.sequence + 1,
    )
  })

  it('fits wet control tires at a clear timed-segment transition when carried canonical water remains', () => {
    const track = { ...series.tracks[0], rainProbability: 0 }
    const baseWeekend = createWeekendContext(
      series.drivers,
      track.isSprintWeekend,
      track,
      undefined,
      'super-formula',
    )
    const fresh = createInitialRace({
      ...baseConfig,
      track,
      weekendContext: baseWeekend,
      weekendStage: 'qualifying',
    })
    const carriedState = {
      ...fresh.trackSurface,
      dryness: fresh.trackSurface.dryness.map(() => 0),
      waterFilmMm: fresh.trackSurface.waterFilmMm.map(() => 2),
    }
    const config: RaceConfig = {
      ...baseConfig,
      track,
      weekendContext: {
        ...baseWeekend,
        trackSurfaceCarry: { state: carriedState, trackId: track.id },
      },
      timedSessionPlan: {
        segments: [
          {
            declaredWet: false,
            endsAtSeconds: 2,
            id: 'Q1-A',
            name: 'Q1-A',
            participantDriverIds: series.drivers.map((driver) => driver.id),
            startsAtSeconds: 0,
            suspensionEndsAtSeconds: null,
            suspensionStartsAtSeconds: null,
            tire: superFormulaControlSessionTireForWeather('clear'),
          },
          {
            declaredWet: false,
            endsAtSeconds: 300,
            id: 'Q1-B',
            name: 'Q1-B',
            participantDriverIds: series.drivers.map((driver) => driver.id),
            selectFromPrevious: false,
            startsAtSeconds: 2,
            suspensionEndsAtSeconds: null,
            suspensionStartsAtSeconds: null,
            tire: superFormulaControlSessionTireForWeather('clear'),
          },
        ],
        totalDurationSeconds: 300,
      },
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const initialRuntime = initial.cars[0]!.runtimeSystems
    const transitioned = advanceRace(
      { ...initial, elapsedLabel: '00:00:01', elapsedSeconds: 1.9 },
      0.2,
      config,
    )
    const transitionedRuntime = transitioned.cars[0]!.runtimeSystems

    expect(initial.weather).toBe('clear')
    expect(transitioned.weather).toBe('clear')
    expect(transitioned.timedSegmentId).toBe('Q1-B')
    expect(
      trackSurfaceSectorSummary(
        transitioned.trackSurface,
      ).surfaceWaterMmBySector.some((water) => water > 0),
    ).toBe(true)
    if (
      initialRuntime.kind !== 'super-formula' ||
      transitionedRuntime.kind !== 'super-formula'
    ) {
      throw new Error('Expected SUPER FORMULA runtime')
    }
    expect(initialRuntime.liveTires.activeSurface).toBe('wet')
    expect(transitionedRuntime.liveTires.activeSurface).toBe('wet')
    expect(transitionedRuntime.liveTires.fitment.sequence).toBe(
      initialRuntime.liveTires.fitment.sequence + 1,
    )
  })

  it('seeds a later SF session from the prior control-tyre and entrant-engine lifecycle', () => {
    const initialWeekend = createWeekendContext(
      series.drivers,
      false,
      series.tracks[0],
      undefined,
      'super-formula',
    )
    const firstSession = createInitialRace({
      ...baseConfig,
      weekendContext: initialWeekend,
      sessionRaceLapsOverride: 25,
    })
    const firstCar = firstSession.cars[0]

    if (firstCar.runtimeSystems.kind !== 'super-formula') {
      throw new Error('Expected SUPER FORMULA runtime')
    }

    const afterFirstSession = completeRaceSession(
      initialWeekend,
      'race',
      firstSession.cars,
    )
    if (afterFirstSession.seriesId !== 'super-formula') {
      throw new Error('Expected SUPER FORMULA weekend lifecycle')
    }

    const engineReplacement = replaceSuperFormula2026Engine(
      afterFirstSession.engineLedgerByEntrant[firstCar.teamId],
    )
    expect(engineReplacement.status).toBe('replaced')
    if (engineReplacement.status !== 'replaced') {
      throw new Error('Expected a second allowed SUPER FORMULA engine')
    }

    const secondWeekend = {
      ...afterFirstSession,
      engineLedgerByEntrant: {
        ...afterFirstSession.engineLedgerByEntrant,
        [firstCar.teamId]: engineReplacement.ledger,
      },
    }
    const secondSession = createInitialRace({
      ...baseConfig,
      weekendContext: secondWeekend,
      sessionRaceLapsOverride: 25,
    })
    const secondCar = secondSession.cars.find(
      (car) => car.driverId === firstCar.driverId,
    )!

    if (secondCar.runtimeSystems.kind !== 'super-formula') {
      throw new Error('Expected SUPER FORMULA runtime')
    }

    const surface = firstCar.runtimeSystems.liveTires.activeSurface
    expect(
      secondCar.runtimeSystems.controlTires.sets[surface].usedSets,
    ).toBe(
      firstCar.runtimeSystems.controlTires.sets[surface].usedSets + 1,
    )
    expect(secondCar.runtimeSystems.engineLedger).toEqual(
      engineReplacement.ledger,
    )
    expect(secondCar.runtimeSystems.engineLedger.engine.used).toBe(2)
  })
})

describe('live active-aero persistence', () => {
  const aeroTrack = {
    ...tracks[0],
    aeroActivationZones: [
      {
        end: 0.8,
        label: 'TEST SM A1',
        lowGripMode: 'partial' as const,
        source: 'official' as const,
        start: 0.2,
      },
    ],
    rainProbability: 0,
  }
  const f1Config: RaceConfig = {
    ...makeConfig('live-active-aero'),
    overtakeSystem: 'active-aero',
    seriesId: 'f1-custom',
    track: aeroTrack,
  }

  const singleRunningCarAt = (
    config: RaceConfig,
    progress: number,
  ): RaceSnapshot => {
    const initial = createInitialRace(config)
    const totalDistance = 2 + progress

    return {
      ...initial,
      elapsedLabel: '00:00:10',
      elapsedSeconds: 10,
      raceStartedAtSeconds: 0,
      startProcedure: 'racing',
      startProcedureRemainingSeconds: 0,
      cars: initial.cars.map((car, index) =>
        index === 0
          ? car.runtimeSystems.kind === 'f1'
            ? withF1RuntimeFields({
              ...car,
              lap: 2,
              pitPhase: 'none' as const,
              pitLaneProgress: null,
              position: 1,
              progress,
              speedKph: 240,
              status: 'running' as const,
              totalDistance,
            }, {
              activeAeroMode: 'corner',
              activeAeroState: createInitialActiveAeroState(),
            })
            : {
                ...car,
                lap: 2,
                pitPhase: 'none' as const,
                pitLaneProgress: null,
                position: 1,
                progress,
                speedKph: 240,
                status: 'running' as const,
                totalDistance,
              }
          : {
              ...car,
              position: index + 1,
              status: 'dns' as const,
            },
      ),
    }
  }

  it('initializes F1 aero and keeps Super Formula clear of F1 aero state', () => {
    const f1 = createInitialRace(f1Config)
    const sfConfig: RaceConfig = {
      ...f1Config,
      overtakeSystem: 'ots',
      seed: 'sf-no-active-aero',
      seriesId: 'super-formula',
      sessionRaceLapsOverride: 25,
    }
    const sf = singleRunningCarAt(sfConfig, 0.3)
    const advancedSf = advanceRace(sf, 0.1, sfConfig)

    expect(f1.cars.every((car) => f1Runtime(car).activeAeroState !== undefined)).toBe(true)
    expect(
      createInitialRace(sfConfig).cars.every(
        (car) => car.runtimeSystems.kind === 'super-formula',
      ),
    ).toBe(true)
    expect(advancedSf.cars[0].runtimeSystems.kind).toBe('super-formula')
    expect('activeAeroState' in advancedSf.cars[0].runtimeSystems).toBe(false)
  })

  it('persists a continuous transition and returns safely at zone exit', () => {
    let snapshot = singleRunningCarAt(f1Config, 0.3)

    snapshot = advanceRace(snapshot, 0.1, f1Config)
    const started = f1Runtime(snapshot.cars[0]).activeAeroState
    expect(started).toMatchObject({
      command: 'straight',
      front: 'transition-to-straight',
      rear: 'transition-to-straight',
    })
    expect(started.frontStraightFraction).toBeGreaterThan(0)
    expect(started.frontStraightFraction).toBeLessThan(1)
    expect(f1Runtime(snapshot.cars[0]).activeAeroMode).toBe('corner')

    for (let step = 0; step < 3; step += 1) {
      snapshot = advanceRace(snapshot, 0.1, f1Config)
    }

    const settled = f1Runtime(snapshot.cars[0]).activeAeroState
    expect(settled.transition).toBeNull()
    expect(settled.frontStraightFraction).toBe(1)
    expect(settled.rearStraightFraction).toBe(1)
    expect(f1Runtime(snapshot.cars[0]).activeAeroMode).toBe('straight')
    expect(snapshot.elapsedSeconds - settled.commandAtSeconds!).toBeLessThanOrEqual(
      0.400_000_001,
    )

    snapshot = {
      ...snapshot,
      cars: snapshot.cars.map((car, index) =>
        index === 0
          ? {
              ...car,
              lap: 2,
              progress: 0.9,
              speedKph: 240,
              totalDistance: 2.9,
            }
          : car,
      ),
    }
    snapshot = advanceRace(snapshot, 0.1, f1Config)
    const returning = f1Runtime(snapshot.cars[0]).activeAeroState

    expect(returning).toMatchObject({
      activationZoneId: null,
      command: 'corner',
      front: 'transition-to-corner',
      rear: 'transition-to-corner',
    })
    expect(f1Runtime(snapshot.cars[0]).activeAeroMode).toBe('corner')

    for (let step = 0; step < 3; step += 1) {
      snapshot = advanceRace(snapshot, 0.1, f1Config)
    }

    expect(f1Runtime(snapshot.cars[0]).activeAeroState).toMatchObject({
      command: 'corner',
      front: 'corner',
      frontStraightFraction: 0,
      rear: 'corner',
      rearStraightFraction: 0,
      transition: null,
    })
  })
})

describe('road speed across the timing line', () => {
  // Centerline points are not evenly spaced, and the closing segment is where
  // that bites: Baku's is 6.1 m against a 39 m typical. Any code that turns a
  // lap-fraction difference into metres by scaling with lap length reads a
  // sixth of the real distance just before the line and the full value just
  // after, so differencing across the line invents speed. That is how a car
  // was reported at 829 km/h here.
  const nonUniformClosingSegmentTracks = [
    'baku-approx',
    'montreal-approx',
  ]

  it.each(nonUniformClosingSegmentTracks)(
    'keeps every car under the physical ceiling at %s',
    (trackId) => {
      const track = tracks.find((candidate) => candidate.id === trackId)!
      const config: RaceConfig = {
        drivers: initialDrivers,
        seed: 'timing-line-speed',
        teams: initialTeams,
        track,
      }
      let snapshot = createInitialRace(config)
      let maximumSpeedKph = 0
      let lapsCompleted = 0

      // Long enough for the field to cross the timing line several times.
      for (let step = 0; step < 2_400; step += 1) {
        snapshot = advanceRace(snapshot, 0.25, config)

        for (const car of snapshot.cars) {
          maximumSpeedKph = Math.max(maximumSpeedKph, car.speedKph)
        }
      }

      lapsCompleted = Math.max(...snapshot.cars.map((car) => car.lap))

      // The test is only meaningful once cars have crossed the line.
      expect(lapsCompleted, trackId).toBeGreaterThan(1)
      // Comfortably above the model's terminal velocity and far below the
      // values the lap-fraction difference produced.
      expect(maximumSpeedKph, trackId).toBeLessThan(430)
      expect(maximumSpeedKph, trackId).toBeGreaterThan(200)
    },
    120_000,
  )
})
