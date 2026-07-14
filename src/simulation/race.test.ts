import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { flagFromRaceControl } from '../services/openF1Derived'
import { calibrateFieldFromOpenF1 } from '../services/openF1Performance'
import type { RaceConfig, RaceSnapshot, TireCompound } from '../types'
import { incidentForLap } from './incidents'
import { battleDynamicsFor, overtakeForLap } from './overtaking'
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
} from './qualifying'
import {
  advanceRace,
  createInitialRace,
  formationLapDurationSecondsFor,
  formationLapsPlannedFor,
  reformFieldForRedRestart,
  reformFieldForStandingRestart,
} from './race'
import {
  dirtyAirDeltaSeconds,
  fuelEffectSeconds,
  owedPenaltySeconds,
  penaltyFromWarnings,
  raceLapsFor,
  trackEvolutionLevel,
} from './raceEvents'
import { progressForProfileSpeed, trackDynamicsAt } from './trackDynamics'
import {
  decidePitStop,
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
import { buildWeekendTirePlan, weekendTireAllocation } from './weekendTires'
import {
  applyWeekendGrid,
  completePracticeSession,
  completeQualifyingSession,
  completeRaceSession,
  createWeekendContext,
} from './weekend'
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
    15_000,
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
    15_000,
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
    expect(snapshot.cars[0].stewardStatus).not.toBe('investigating')
  })
})

describe('starting grid', () => {
  it('starts every car on the home-straight grid before the race unfolds', () => {
    const snapshot = createInitialRace(makeConfig('grid-start'))
    const progress = snapshot.cars.map((car) => car.progress)

    expect(progress[0]).toBe(0)
    expect(progress.slice(1).every((value) => value > 0.94)).toBe(true)
    expect(snapshot.cars.every((car) => car.status === 'running')).toBe(true)
  })

  it('does not send cars straight into the pits on the opening tour', () => {
    const snapshot = runSteps(makeConfig('no-opening-pit'), 30, 0.5)

    expect(snapshot.cars.some((car) => car.status === 'pit')).toBe(false)
    expect(snapshot.events.some((event) => event.kind === 'pit')).toBe(false)
  })

  it('does not treat normal brake-temperature peaks as an early pit trigger', () => {
    const baseConfig = makeConfig('no-early-brake-stop')
    const config = {
      ...baseConfig,
      track: { ...baseConfig.track, rainProbability: 0 },
    }
    let snapshot = runThroughStart(config)

    for (let step = 0; step < 300 && snapshot.leaderLap < 10; step += 1) {
      snapshot = advanceRace(snapshot, 5, config)
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
    const carsThatStopped = snapshot.cars.filter((car) => car.pitStops > 0)

    expect(brakeStops).toHaveLength(0)
    expect(fastestCleanLap).toBeGreaterThan(config.track.baseLapTime * 0.84)
    expect(fastestCleanLap).toBeLessThan(config.track.baseLapTime * 1.15)
    expect(carsThatStopped.length).toBeLessThan(snapshot.cars.length / 2)
  })

  it('stages routine green-flag stops instead of sending the field together', () => {
    const baseConfig = makeConfig('staggered-pit-window')
    const config = {
      ...baseConfig,
      track: { ...baseConfig.track, rainProbability: 0 },
    }
    const started = runThroughStart(config)
    const staged: RaceSnapshot = {
      ...started,
      cars: started.cars.map((car, index) => ({
        ...car,
        totalDistance: 9.999 - index * 0.00001,
        lap: 9,
        progress: 0.999 - index * 0.00001,
        processedLap: 9,
        tire: 'S' as const,
        tireAgeLaps: 17,
        tireWearPercent: 82,
        brakeTemperatureC: 760,
        brakeOverheatSeconds: 0,
        damage: 0,
        gapToAhead: index === 0 ? 0 : 1.8,
        gapToLeader: index * 1.8,
      })),
    }
    const next = advanceRace(staged, 1, config)
    const routinePitting = next.cars.filter(
      (car) =>
        car.status === 'pit' &&
        car.damage < pitTuning.damagePitThreshold &&
        car.brakeOverheatSeconds < pitTuning.brakeOverheatPitSeconds &&
        car.tireWearPercent < 88,
    )

    expect(routinePitting.length).toBeLessThanOrEqual(
      pitTuning.normalPitLaneCapacity,
    )
    expect(new Set(routinePitting.map((car) => car.teamId)).size).toBe(
      routinePitting.length,
    )
  })

  it('keeps the default early weather crossover and VSC response credible', () => {
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
      car.penalties.filter((penalty) => penalty.reason === 'VSC delta'),
    )

    expect(maximumCarsInPit).toBeLessThan(snapshot.cars.length / 2)
    expect(vscPenalties.length).toBeLessThanOrEqual(2)
  })

  it('starts practice from pit boxes and releases cars on staggered run plans', () => {
    const config = { ...makeConfig('fp-pit-release'), weekendStage: 'fp1' as const }
    let snapshot = createInitialRace(config)

    expect(snapshot.cars.every((car) => car.status === 'pit')).toBe(true)

    for (let step = 0; step < 90; step += 1) {
      snapshot = advanceRace(snapshot, 5, config)
    }

    expect(snapshot.cars.some((car) => car.status === 'running')).toBe(true)
    expect(snapshot.events.some((event) => event.kind === 'pit')).toBe(false)
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
  it('starts with no invented lap or sector times', () => {
    const snapshot = createInitialRace(makeConfig('timing-placeholders'))

    expect(
      snapshot.cars.every(
        (car) =>
          car.lastLapTimeSeconds === null &&
          car.bestLapTimeSeconds === null &&
          car.currentLapSectorTimes.every((sector) => sector === null) &&
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

    snapshot = advanceRace(snapshot, 0.05, config)
    expect(
      snapshot.cars.find((car) => car.driverId === driverId)!
        .currentLapSectorTimes[0],
    ).toBe(measuredS1)

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

describe('full race', () => {
  const config = makeConfig('full-race')
  const { snapshot: finished, seenEventKinds } = runToFinish(config)

  it('completes with every car finished or retired', () => {
    expect(finished.sessionStatus).toBe('finished')
    for (const car of finished.cars) {
      expect(['finished', 'retired']).toContain(car.status)
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

  it('places retired cars at the bottom with OUT labels', () => {
    const statuses = finished.cars.map((car) => car.status)
    const firstRetired = statuses.indexOf('retired')

    if (firstRetired !== -1) {
      for (const car of finished.cars.slice(firstRetired)) {
        expect(car.status).toBe('retired')
        expect(car.gapToLeaderLabel).toBe('OUT')
      }
    }
  })

  it('enforces the two-compound rule for every finisher', () => {
    for (const car of finished.cars) {
      if (car.status === 'finished') {
        const wetRaceExemption = car.compoundsUsed.some(
          (compound) => !isDryCompound(compound),
        )
        const dryCompounds = car.compoundsUsed.filter(isDryCompound)

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

  it('orders finishers by crossing time plus penalties', () => {
    const finishers = finished.cars.filter((car) => car.status === 'finished')

    expect(finishers.length).toBeGreaterThan(0)

    for (let index = 1; index < finishers.length; index += 1) {
      const previous = finishers[index - 1]
      const current = finishers[index]

      expect(previous.finishedAtSeconds).not.toBeNull()
      expect(current.finishedAtSeconds).not.toBeNull()
      expect(
        (current.finishedAtSeconds ?? 0) + current.penaltySeconds,
      ).toBeGreaterThanOrEqual(
        (previous.finishedAtSeconds ?? 0) + previous.penaltySeconds,
      )
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
        ? reformFieldForStandingRestart(snapshot.cars)
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

  it('waits for the on-track field to cross the control line after a Safety Car', () => {
    const config = makeConfig('sc-overtake-reenable')
    let snapshot = runThroughStart(config)
    const endSeconds = snapshot.elapsedSeconds + 1

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
      },
      2,
      config,
    )

    expect(snapshot.overtakeEnabled).toBe(false)
    expect(snapshot.overtakeEnableAtLeaderDistance).toBeNull()
    expect(
      Object.keys(snapshot.overtakeEnableTargetsByDriver ?? {}),
    ).not.toHaveLength(0)

    const targets = snapshot.overtakeEnableTargetsByDriver!
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
  })

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
      snapshot.cars.flatMap((car) =>
        car.penalties.filter((penalty) => penalty.reason === 'VSC delta'),
      ),
    ).toHaveLength(0)
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
  it('integrates the reference profile to the configured base lap time', () => {
    const track = tracks[0]
    const steps = 1_000
    const deltaSeconds = track.baseLapTime / steps
    let progress = 0

    for (let step = 0; step < steps; step += 1) {
      const referenceSpeed = trackDynamicsAt(track, progress).referenceSpeedKph
      progress += progressForProfileSpeed(
        track,
        progress,
        referenceSpeed,
        deltaSeconds,
      )
    }

    expect(progress).toBeCloseTo(1, 8)
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
})

describe('track limit penalties', () => {
  it('starts at the threshold and escalates', () => {
    expect(penaltyFromWarnings(0)).toBe(0)
    expect(penaltyFromWarnings(3)).toBe(0)
    expect(penaltyFromWarnings(4)).toBe(5)
    expect(penaltyFromWarnings(5)).toBe(5)
    expect(penaltyFromWarnings(6)).toBe(10)
    expect(penaltyFromWarnings(8)).toBe(15)
  })

  it('subtracts penalties already served at pit stops', () => {
    expect(owedPenaltySeconds(4, 0)).toBe(5)
    expect(owedPenaltySeconds(4, 5)).toBe(0)
    expect(owedPenaltySeconds(6, 5)).toBe(5)
    expect(owedPenaltySeconds(8, 15)).toBe(0)
  })
})

describe('tires', () => {
  it('makes softer compounds faster when fresh', () => {
    expect(tireDeltaSeconds('S', 0, 0.8)).toBeLessThan(tireDeltaSeconds('M', 0, 0.8))
    expect(tireDeltaSeconds('M', 0, 0.8)).toBeLessThan(tireDeltaSeconds('H', 0, 0.8))
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
    expect(sampledCars.every((car) => car.tireWearPercent > 0)).toBe(true)
    expect(sampledCars.every((car) => car.tireWearPercent < 16)).toBe(true)
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
    const car = {
      tire: 'M' as const,
      tireAgeLaps: 8,
      tireWearPercent: 42,
      brakeTemperatureC: 720,
      compoundsUsed: ['M'] as TireCompound[],
      damage: 0,
      pitStops: 0,
    }
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
        car: {
          ...baseCar,
          tire: 'I',
          compoundsUsed: ['I'],
          tireAgeLaps: 4,
          tireWearPercent: 24,
        },
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
      car: {
        ...baseCar,
        tire: 'I',
        compoundsUsed: ['I'],
        tireAgeLaps: 4,
        tireWearPercent: 24,
      },
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
      car: { ...car, tire: 'S', tireAgeLaps: 8 },
      driver: initialDrivers[0],
      lap: 14,
      raceLaps: 58,
      seed: 'strategy-outlook',
      trackGrip: 0.66,
      underSafetyCar: false,
      weather: 'heavy-rain',
    })

    expect(outlook.urgency).toBe('box')
    expect(outlook.compound).toBe('W')
    expect(outlook.estimatedStopLap).toBe(14)
  })

  it('keeps inters as the next choice in light rain', () => {
    const car = createInitialRace(makeConfig('strategy-inter')).cars[0]
    const outlook = strategyOutlookFor({
      car: { ...car, tire: 'I', tireAgeLaps: 5 },
      driver: initialDrivers[0],
      lap: 12,
      raceLaps: 58,
      seed: 'strategy-inter',
      trackGrip: 0.82,
      underSafetyCar: false,
      weather: 'light-rain',
    })

    expect(outlook.compound).toBe('I')
  })

  it('can pit early for a reliable weather forecast under safety car', () => {
    const driver = initialDrivers[0]
    const car = {
      tire: 'M' as const,
      tireAgeLaps: 12,
      tireWearPercent: 55,
      brakeTemperatureC: 760,
      compoundsUsed: ['M'] as TireCompound[],
      damage: 0,
      pitStops: 0,
    }
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
    const driver = { ...initialDrivers[0], overtaking: 0.95 }
    const cliff = effectiveCliffLaps('M', driver.tireManagement)
    const car = {
      tire: 'M' as const,
      tireAgeLaps: Math.ceil(cliff - 3),
      tireWearPercent: 58,
      brakeTemperatureC: 780,
      compoundsUsed: ['M'] as TireCompound[],
      damage: 0,
      pitStops: 0,
    }
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
    const driver = { ...initialDrivers[0], overtaking: 0.95 }
    const cliff = effectiveCliffLaps('M', driver.tireManagement)
    const car = {
      tire: 'M' as const,
      tireAgeLaps: Math.ceil(cliff - 2),
      tireWearPercent: 64,
      brakeTemperatureC: 780,
      compoundsUsed: ['M'] as TireCompound[],
      damage: 0,
      pitStops: 0,
    }
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
      car: { ...baseCar, tireWearPercent: 91, brakeTemperatureC: 760 },
      lap: 12,
      raceLaps: 57,
      underSafetyCar: false,
      weather: 'clear',
      trackGrip: 1,
    })
    const brakeDecision = decidePitStop({
      seed: 'sensor-strategy-brake',
      driver: initialDrivers[0],
      car: {
        ...baseCar,
        tireWearPercent: 22,
        brakeTemperatureC: 1115,
        brakeOverheatSeconds: pitTuning.brakeOverheatPitSeconds + 1,
      },
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
      car: {
        ...baseCar,
        tireWearPercent: 22,
        brakeTemperatureC: 1115,
        brakeOverheatSeconds: 4,
      },
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
    expect(car.pendingTire === 'H' || car.tire === 'H').toBe(true)
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
    expect(car.tireWearPercent).toBeGreaterThan(0)
    expect(car.brakeTemperatureC).toBeGreaterThan(260)
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
      if (track.layoutSource?.detail === 'real') {
        expect(track.centerline.length).toBeGreaterThan(30)
      } else {
        // Madrid is explicitly labeled as an API-unavailable fallback rather
        // than being presented as a surveyed layout.
        expect(track.id).toBe('madrid-approx')
        expect(track.centerline.length).toBeGreaterThan(8)
      }
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
    ).toEqual({ flag: 'yellow', flagLabel: 'YELLOW' })

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
    expect(mclaren.cornering).toBeGreaterThan(initialTeams[0].cornering)
    expect(calibratedNor.speed).toBeGreaterThan(nor.speed)
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

    expect(
      calibrated.teams.find((team) => team.id === 'mclaren')!.straightLine,
    ).toBeGreaterThan(
      calibrated.teams.find((team) => team.id === 'ferrari')!.straightLine,
    )
  })
})

describe('overtaking', () => {
  function closeBattleFixture() {
    const snapshot = createInitialRace(makeConfig('battle-fixture'))
    const defenderCar = { ...snapshot.cars[0], tire: 'H' as const }
    const attackerCar = { ...snapshot.cars[1], tire: 'S' as const }
    const defender = {
      ...initialDrivers.find((driver) => driver.id === defenderCar.driverId)!,
      consistency: 0.74,
      defense: 0.62,
    }
    const attacker = {
      ...initialDrivers.find((driver) => driver.id === attackerCar.driverId)!,
      speed: 0.96,
      overtaking: 0.98,
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
      attackerCar: {
        ...fixture.attackerCar,
        overtakeStatus: 'available',
        ersPowerKw: 250,
      },
      defenderCar: { ...fixture.defenderCar, ersPowerKw: 250 },
    })
    const withEligibility = battleDynamicsFor({
      ...context,
      attackerCar: {
        ...fixture.attackerCar,
        overtakeStatus: 'active',
        ersPowerKw: 350,
      },
      defenderCar: { ...fixture.defenderCar, ersPowerKw: 250 },
    })

    expect(withoutEligibility.assistance).toBe('tow')
    expect(withoutEligibility.electricalPerformanceEdge).toBe(0)
    expect(withEligibility.assistance).toBe('overtake')
    expect(withEligibility.ersPowerDeltaKw).toBe(100)
    expect(withEligibility.electricalPerformanceEdge).toBeGreaterThan(0)
  })

  it('uses live tire wear and temperature in close-battle grip', () => {
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
      attackerCar: {
        ...fixture.attackerCar,
        tireAgeLaps: 2,
        tireTemperatureC: 98,
        tireWearPercent: 8,
      },
      defenderCar: {
        ...fixture.defenderCar,
        tireAgeLaps: 25,
        tireTemperatureC: 122,
        tireWearPercent: 88,
      },
    })
    const reversedTires = battleDynamicsFor({
      ...baseContext,
      attackerCar: {
        ...fixture.attackerCar,
        tireAgeLaps: 25,
        tireTemperatureC: 122,
        tireWearPercent: 88,
      },
      defenderCar: {
        ...fixture.defenderCar,
        tireAgeLaps: 2,
        tireTemperatureC: 98,
        tireWearPercent: 8,
      },
    })

    expect(healthyTires.tirePerformanceEdge).toBeGreaterThan(0)
    expect(reversedTires.tirePerformanceEdge).toBeLessThan(0)
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

  it('holds the racing line until a passing move is actually committed', () => {
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
    const leaderDistance = 2 + straightProgress
    const attackerDistance = leaderDistance - 0.004
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
          trackLateralOffset: 0,
        }
      }),
    }
    let following = advanceRace(prepared, 0.05, config)

    following = advanceRace(following, 0.05, config)
    const followingAttacker = following.cars.find(
      (car) => car.driverId === attackerId,
    )!

    expect(followingAttacker.trackLateralOffset).toBeCloseTo(0, 8)
    expect(followingAttacker.battlePhaseUntilSeconds).toBeNull()

    let committed: RaceSnapshot = {
      ...prepared,
      cars: prepared.cars.map((car) =>
        car.driverId === attackerId
          ? {
              ...car,
              battleOpponentId: leaderId,
              battlePhase: 'attacking' as const,
              battlePhaseUntilSeconds: prepared.elapsedSeconds + 5,
            }
          : car,
      ),
    }
    const lateralSigns: number[] = []

    for (let step = 0; step < 5; step += 1) {
      committed = advanceRace(committed, 0.05, config)
      const lateralOffset = committed.cars.find(
        (car) => car.driverId === attackerId,
      )!.trackLateralOffset

      if (Math.abs(lateralOffset) > 0.0001) {
        lateralSigns.push(Math.sign(lateralOffset))
      }
    }

    expect(lateralSigns.length).toBeGreaterThan(1)
    expect(new Set(lateralSigns).size).toBe(1)
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
    expect(session.classification.every((result) => result.compound === 'S')).toBe(true)
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
    expect(session.segments[0].results.every((result) => result.compound === 'M')).toBe(
      true,
    )
    expect(session.segments[1].results.every((result) => result.compound === 'M')).toBe(
      true,
    )
    expect(session.segments[2].results.every((result) => result.compound === 'S')).toBe(
      true,
    )
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
      plan.driverPlans.some(
        (driverPlan) =>
          driverPlan.qualifyingUsed.S > 0 || driverPlan.qualifyingUsed.M > 0,
      ),
    ).toBe(true)
  })

  it('uses the 2026 FIA standard and sprint weekend tire allocations', () => {
    expect(weekendTireAllocation(false)).toEqual({ H: 2, I: 5, M: 3, S: 8, W: 2 })
    expect(weekendTireAllocation(true)).toEqual({ H: 2, I: 6, M: 4, S: 6, W: 2 })
  })

  it('models practice as a one-hour setup session', () => {
    const results = runPracticeSession(makeConfig('practice-setup'), 'fp1')

    expect(results).toHaveLength(initialDrivers.length)
    expect(results[0].sessionDurationSeconds).toBe(60 * 60)
    expect(results.every((result) => result.setupScore >= 1)).toBe(true)
    expect(results.every((result) => result.lapsCompleted > 0)).toBe(true)
  })

  it('turns practice mileage into deterministic setup deltas', () => {
    const config = makeConfig('practice-deltas')
    const summary = buildPracticeSetupSummary(config, ['fp1', 'fp2', 'fp3'])
    const adjusted = applyPracticeSetup(config, summary)

    expect(summary).toEqual(buildPracticeSetupSummary(config, ['fp1', 'fp2', 'fp3']))
    expect(summary.teamSummaries).toHaveLength(initialTeams.length)
    expect(summary.driverSummaries).toHaveLength(initialDrivers.length)
    expect(
      adjusted.teams.some((team, index) => {
        const original = config.teams[index]

        return (
          team.cornering !== original.cornering ||
          team.reliability !== original.reliability ||
          team.straightLine !== original.straightLine
        )
      }),
    ).toBe(true)
    expect(
      adjusted.drivers.some((driver, index) => {
        const original = config.drivers[index]

        return (
          driver.consistency !== original.consistency ||
          driver.tireManagement !== original.tireManagement
        )
      }),
    ).toBe(true)
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

    // 22 cars x ~50 laps: expect some action but not a demolition derby.
    expect(incidents).toBeGreaterThan(0)
    expect(incidents).toBeLessThan(24)
    expect(retirements).toBeLessThanOrEqual(4)
  })
})

describe('red-flag restart', () => {
  const spacingLaps = 0.4 / 90

  function scatteredField() {
    const snapshot = createInitialRace(makeConfig('red-restart'))

    return snapshot.cars.map((car, index) => ({
      ...car,
      status: 'running' as const,
      // Leader on lap 21 (total 20.6); the field scattered behind, with the
      // last two cars one and two whole laps down.
      totalDistance:
        index === 20
          ? 19.55
          : index === 21
            ? 18.35
            : 20.6 - index * 0.04,
      position: index + 1,
    }))
  }

  it('re-forms running cars nose to tail in classification order', () => {
    const cars = reformFieldForRedRestart(scatteredField(), spacingLaps)

    // Leader is untouched; everyone else queues behind at fixed spacing.
    expect(cars[0].totalDistance).toBeCloseTo(20.6, 6)

    for (let index = 1; index < 20; index += 1) {
      expect(cars[index].totalDistance).toBeCloseTo(
        20.6 - index * spacingLaps,
        6,
      )
    }
  })

  it('keeps lapped cars lapped while joining the queue on track', () => {
    const cars = reformFieldForRedRestart(scatteredField(), spacingLaps)
    const lapDeficit20 = cars[0].totalDistance - cars[20].totalDistance
    const lapDeficit21 = cars[0].totalDistance - cars[21].totalDistance

    // Whole-lap deficits survive the re-formation...
    expect(Math.floor(lapDeficit20)).toBe(1)
    expect(Math.floor(lapDeficit21)).toBe(2)

    // ...while their on-track position joins the restart queue.
    const queuePosition20 = cars[20].totalDistance % 1
    const queuePosition21 = cars[21].totalDistance % 1
    const leaderPosition = cars[0].totalDistance % 1

    expect(Math.abs(leaderPosition - queuePosition20)).toBeLessThan(
      spacingLaps * 22,
    )
    expect(Math.abs(leaderPosition - queuePosition21)).toBeLessThan(
      spacingLaps * 22,
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
