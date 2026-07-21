import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type {
  RaceConfig,
  TimedSegmentAttemptStatus,
  TimedSessionPlan,
} from '../types'
import { advanceRace, createInitialRace } from './race'
import { phaseOneConfig } from '../data/phaseOne'
import { seriesPackageById } from '../series/seriesRegistry'
import {
  qualifyingCutSizes,
  runKnockoutQualifying,
  runSeriesQualifying,
} from './qualifying'
import {
  buildTimedSessionPlan,
  timedSessionStateAt,
} from './timedSessionPlan'

describe('timed session plan', () => {
  it('scales the official knockout structure to the 30-car field', () => {
    expect(qualifyingCutSizes(22)).toEqual({ q2Size: 16, q3Size: 10 })
    expect(qualifyingCutSizes(30)).toEqual({ q2Size: 20, q3Size: 10 })
  })

  it('keeps Q1/Q2/Q3 participants and seven-minute breaks on one clock', () => {
    const qualifying = runKnockoutQualifying(phaseOneConfig)
    const plan = buildTimedSessionPlan(qualifying)

    expect(plan.segments.map((segment) => segment.name)).toEqual([
      'Q1',
      'Q2',
      'Q3',
    ])
    expect(plan.segments[0].participantDriverIds).toHaveLength(phaseOneConfig.drivers.length)
    expect(plan.segments[1].startsAtSeconds - plan.segments[0].endsAtSeconds).toBe(420)
    expect(timedSessionStateAt(plan, plan.segments[0].endsAtSeconds + 10).segment).toBeNull()
  })

  it('runs Super Formula Q1 as separate ten-minute groups with six advancing from each', () => {
    const series = seriesPackageById.get('super-formula')!
    const qualifying = runSeriesQualifying(
      {
        drivers: series.drivers,
        qualifyingDryCompound: series.rules.tires.qualifyingDryCompound,
        seed: 'sf-grouped-live-plan',
        teams: series.teams,
        tireAllocation: series.rules.tires.standardAllocation,
        track: series.tracks[0],
        weekendStage: 'qualifying',
      },
      series.rules,
    )
    const plan = buildTimedSessionPlan(
      qualifying,
      series.rules.qualifying.breakSeconds,
      series.rules.qualifying.format,
    )

    expect(plan.segments.map((segment) => segment.id)).toEqual([
      'Q1-A',
      'Q1-B',
      'Q2',
    ])
    expect(
      plan.segments.slice(0, 2).map(
        (segment) => segment.endsAtSeconds - segment.startsAtSeconds,
      ),
    ).toEqual([600, 600])
    // A gap between the groups lets Group A's flying laps finish before Group B
    // is released, and leaves no active segment during it.
    expect(plan.segments[1].startsAtSeconds - plan.segments[0].endsAtSeconds).toBe(
      180,
    )
    expect(
      timedSessionStateAt(plan, plan.segments[0].endsAtSeconds + 10).segment,
    ).toBeNull()
    expect(
      plan.segments.slice(0, 2).map(
        (segment) => segment.participantDriverIds.length,
      ),
    ).toEqual([12, 12])
    expect(
      plan.segments[2].promotionGroups?.map((group) => group.advanceCount),
    ).toEqual([6, 6])
    expect(plan.segments[2].participantDriverIds).toHaveLength(12)
  })

  it('uses official odd/even groups and alternating grids at Monaco', () => {
    const series = seriesPackageById.get('f2')!
    const event = series.calendar.find((candidate) => candidate.id === 'f2-04')!
    const rules = { ...series.rules, qualifying: event.qualifying! }
    const qualifying = runSeriesQualifying(
      {
        drivers: series.drivers,
        qualifyingDryCompound: rules.tires.qualifyingDryCompound,
        seed: 'f2-monaco-groups',
        teams: series.teams,
        tireAllocation: rules.tires.standardAllocation,
        track: series.tracks.find((track) => track.id === event.trackId)!,
        weekendStage: 'qualifying',
      },
      rules,
    )
    const driversById = new Map(
      series.drivers.map((driver) => [driver.id, driver]),
    )
    const plan = buildTimedSessionPlan(
      qualifying,
      rules.qualifying.breakSeconds,
      rules.qualifying.format,
    )

    expect(plan.segments.map((segment) => segment.id)).toEqual(['Q1-A', 'Q1-B'])
    expect(
      plan.segments.map(
        (segment) => segment.endsAtSeconds - segment.startsAtSeconds,
      ),
    ).toEqual([960, 960])
    expect(
      qualifying.segments[0].results.every((result) => {
        const number = driversById.get(result.driverId)!.carNumber
        return result.qualifyingGroup === (number % 2 === 0 ? 'A' : 'B')
      }),
    ).toBe(true)
    expect(
      driversById.get(qualifying.classification[0].driverId)!.carNumber % 2,
    ).not.toBe(
      driversById.get(qualifying.classification[1].driverId)!.carNumber % 2,
    )
  })

  it('opens the second qualifying group for its assigned cars, not group A leaders', () => {
    const drivers = initialDrivers.slice(0, 4)
    const groupBIds = drivers.slice(2).map((driver) => driver.id)
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          id: 'Q1-A',
          name: 'Q1',
          participantDriverIds: drivers.slice(0, 2).map((driver) => driver.id),
          selectFromPrevious: false,
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
        {
          compound: 'S',
          endsAtSeconds: 20,
          id: 'Q1-B',
          name: 'Q1',
          participantDriverIds: groupBIds,
          selectFromPrevious: false,
          startsAtSeconds: 10,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 20,
    }
    const config: RaceConfig = {
      drivers,
      seed: 'sf-group-window-transition',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: { Q1: index < 2 ? 80 + index : null },
        })),
        elapsedSeconds: 9.9,
      },
      0.2,
      config,
    )

    expect(snapshot.timedSegmentId).toBe('Q1-B')
    expect(snapshot.timedParticipantDriverIds).toEqual(groupBIds)
  })

  it('runs a dry qualifying attempt as a Soft out-attack-in cycle with aggressive ERS use', () => {
    const driver = initialDrivers[0]
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'M',
          declaredWet: false,
          endsAtSeconds: 1_080,
          name: 'Q1',
          participantDriverIds: [driver.id],
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 1_080,
    }
    const config: RaceConfig = {
      drivers: [driver],
      seed: 'qualifying-three-lap-run',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    let snapshot = createInitialRace(config)
    const phases = new Set<string>()
    let minimumAttackBatteryPercent = 100
    let maximumAttackSpeedKph = 0
    let maximumOutLapSpeedKph = 0
    let sawAttackDeployment = false
    let sawPreparationHarvest = false

    expect(snapshot.cars[0].tire).toBe('S')

    for (let elapsed = 0; elapsed < 650; elapsed += 1) {
      snapshot = advanceRace(snapshot, 1, config)
      const car = snapshot.cars[0]

      if (car.timedRunPhase) {
        phases.add(car.timedRunPhase)
      }

      if (car.timedRunPhase === 'out-lap') {
        maximumOutLapSpeedKph = Math.max(maximumOutLapSpeedKph, car.speedKph)
        sawPreparationHarvest ||= car.ersMode === 'harvest'
      }

      if (car.timedRunPhase === 'attack-lap') {
        minimumAttackBatteryPercent = Math.min(
          minimumAttackBatteryPercent,
          car.ersBatteryPercent,
        )
        maximumAttackSpeedKph = Math.max(maximumAttackSpeedKph, car.speedKph)
        sawAttackDeployment ||= car.ersMode === 'deploy' && car.ersPowerKw > 0
      }

      if (car.timedRunsCompleted === 1 && car.status === 'pit') {
        break
      }
    }

    const completedCar = snapshot.cars[0]

    expect(phases).toEqual(
      new Set(['garage', 'out-lap', 'attack-lap', 'in-lap']),
    )
    expect(completedCar.timedRunsCompleted).toBe(1)
    expect(completedCar.status).toBe('pit')
    expect(completedCar.tire).toBe('S')
    expect(sawPreparationHarvest).toBe(true)
    expect(sawAttackDeployment).toBe(true)
    expect(minimumAttackBatteryPercent).toBeLessThanOrEqual(28)
    expect(maximumAttackSpeedKph).toBeGreaterThan(maximumOutLapSpeedKph)
  })

  it('suspends the segment under red and releases only eligible cars', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 420,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: 150,
          suspensionStartsAtSeconds: 100,
        },
      ],
      totalDurationSeconds: 420,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'timed-red',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    let snapshot = createInitialRace(config)

    for (let second = 0; second < 120; second += 1) {
      snapshot = advanceRace(snapshot, 1, config)
    }

    expect(snapshot.flag).toBe('red')
    expect(snapshot.timedSessionSuspended).toBe(true)
    expect(snapshot.cars.every((car) => car.status === 'pit')).toBe(true)

    for (let second = 120; second < 180; second += 1) {
      snapshot = advanceRace(snapshot, 1, config)
    }

    expect(snapshot.flag).toBe('clear')
    expect(snapshot.timedSessionSuspended).toBe(false)
    expect(snapshot.cars.some((car) => car.status === 'running')).toBe(true)
  })

  it('classifies timed sessions by best lap rather than track position', () => {
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'timed-classification',
      teams: initialTeams,
      track: tracks[0],
      weekendStage: 'fp1',
    }
    const initial = createInitialRace(config)
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          bestLapTimeSeconds: index === 0 ? 82 : index === 1 ? 80 : null,
        })),
      },
      0.1,
      config,
    )

    expect(snapshot.cars[0].driverId).toBe(initial.cars[1].driverId)
    expect(snapshot.cars[0].gapToLeaderLabel).toBe('Leader')
    expect(snapshot.cars[1].gapToLeaderLabel).toBe('+2.000')
  })

  it('promotes the measured Q1 top group into Q2', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
        {
          compound: 'S',
          endsAtSeconds: 40,
          name: 'Q2',
          participantDriverIds: initialDrivers
            .slice(0, 16)
            .map((driver) => driver.id),
          startsAtSeconds: 20,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 40,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'measured-cut',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    let snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          bestLapTimeSeconds: 100 - index,
          status: 'pit' as const,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: { Q1: 100 - index },
        })),
        elapsedSeconds: 15,
        timedParticipantDriverIds: [],
        timedSegmentLabel: null,
      },
      0.1,
      config,
    )
    const measuredTop16 = snapshot.cars
      .slice(0, 16)
      .map((car) => car.driverId)

    snapshot = advanceRace(snapshot, 5, config)

    expect(snapshot.timedSegmentLabel).toBe('Q2')
    expect(snapshot.timedParticipantDriverIds).toEqual(measuredTop16)
    expect(snapshot.timedParticipantDriverIds).not.toEqual(
      plan.segments[1].participantDriverIds,
    )
  })

  it('fills the Q2 places only with cars that set a valid Q1 time', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
        {
          compound: 'S',
          endsAtSeconds: 40,
          name: 'Q2',
          // Fewer places than valid Q1 runners, so the cut has something to do.
          participantDriverIds: initialDrivers
            .slice(0, 15)
            .map((driver) => driver.id),
          startsAtSeconds: 20,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 40,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'valid-time-cut',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const noTimeDriverId = initial.cars[0].driverId
    let snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: null,
          timedSegmentAttemptStatus: { Q1: 'flying-lap' as const },
          timedSegmentBestSeconds: { Q1: index === 0 ? null : 100 - index },
        })),
        elapsedSeconds: 15,
        timedParticipantDriverIds: [],
        timedSegmentLabel: null,
      },
      0.1,
      config,
    )

    snapshot = advanceRace(snapshot, 5, config)

    expect(snapshot.timedParticipantDriverIds).toHaveLength(15)
    expect(snapshot.timedParticipantDriverIds).not.toContain(noTimeDriverId)
  })

  it('allows an attack lap started before zero to reach the chequered flag', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 10,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'chequered-attack',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    let snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) =>
          index === 0
            ? {
                ...car,
                lap: 1,
                lapStartedAtSeconds: 9,
                pitPhase: 'none' as const,
                pitUntilSeconds: null,
                processedLap: 1,
                progress: 0.82,
                status: 'running' as const,
                timedRunPhase: 'attack-lap' as const,
                totalDistance: 1.82,
              }
            : { ...car, pitUntilSeconds: null },
        ),
        elapsedSeconds: 10.1,
      },
      0.1,
      config,
    )

    expect(snapshot.sessionStatus).toBe('racing')
    expect(snapshot.cars.find((car) => car.driverId === initial.cars[0].driverId)?.timedRunPhase).toBe('attack-lap')

    snapshot = advanceRace(snapshot, 20, config)
    expect(snapshot.sessionStatus).toBe('finished')
    expect(snapshot.cars.some((car) => car.lapHistory.length > 0)).toBe(true)
    const completedCar = snapshot.cars.find(
      (car) => car.driverId === initial.cars[0].driverId,
    )!

    expect(completedCar.timedSegmentBestSeconds.Q1).toEqual(expect.any(Number))
    expect(completedCar.timedSegmentBestSeconds.Qualifying).toBeUndefined()
  })

  it('breaks an exact segment-time tie in favour of the earlier lap', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 120,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 120,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'earlier-identical-time',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: { Q1: index < 2 ? 80 : 82 + index },
          timedSegmentBestSetAtSeconds: {
            Q1: index === 0 ? 90 : index === 1 ? 75 : 95 + index,
          },
        })),
      },
      0.1,
      config,
    )

    expect(snapshot.cars[0].driverId).toBe(initial.cars[1].driverId)
    expect(snapshot.cars[1].driverId).toBe(initial.cars[0].driverId)
  })

  it('orders Q2 no-time cars by flying-lap, left-pits, then garage status', () => {
    const q2Drivers = initialDrivers.slice(0, 3)
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
        {
          compound: 'S',
          endsAtSeconds: 50,
          name: 'Q2',
          participantDriverIds: q2Drivers.map((driver) => driver.id),
          startsAtSeconds: 20,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 50,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'q2-no-time-order',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const attemptStatuses = ['garage', 'flying-lap', 'left-pits'] as const
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: null,
          timedSegmentAttemptStatus:
            (index < 3
              ? { Q1: 'flying-lap', Q2: attemptStatuses[index] }
              : { Q1: 'flying-lap' }) as Record<
              string,
              TimedSegmentAttemptStatus
            >,
          timedSegmentBestSeconds:
            (index < 3
              ? { Q1: 80 + index, Q2: null }
              : { Q1: 90 + index }) as Record<string, number | null>,
        })),
        elapsedSeconds: 25,
        timedParticipantDriverIds: q2Drivers.map((driver) => driver.id),
        timedSegmentId: 'Q2',
        timedSegmentLabel: 'Q2',
      },
      0.1,
      config,
    )

    expect(snapshot.cars.slice(0, 3).map((car) => car.driverId)).toEqual([
      initial.cars[1].driverId,
      initial.cars[2].driverId,
      initial.cars[0].driverId,
    ])
  })

  it('queues simultaneous timed-session pit releases', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 120,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 120,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'pit-exit-queue',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: index < 2 ? 20 : null,
        })),
        elapsedSeconds: 20,
      },
      0.1,
      config,
    )

    expect(snapshot.cars.filter((car) => car.status === 'running')).toHaveLength(1)
    expect(snapshot.cars.some((car) => car.pitExitQueueSeconds > 0)).toBe(true)
  })

  it('keeps every valid Q1 time classified regardless of its deficit', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 10,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'valid-q1-deficit',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          bestLapTimeSeconds: index === 0 ? 80 : index === 1 ? 100 : 82,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: {
            Q1: index === 0 ? 80 : index === 1 ? 100 : 82,
          },
        })),
        elapsedSeconds: 10,
      },
      0.1,
      config,
    )
    const slowCar = snapshot.cars.find(
      (car) => car.driverId === initial.cars[1].driverId,
    )!

    expect(slowCar.qualifyingClassificationStatus).toBe('classified')
    expect(slowCar.status).not.toBe('dns')
  })

  it('classifies a Q1 no-time separately from a slow valid lap', () => {
    const plan: TimedSessionPlan = {
      segments: [
        {
          compound: 'S',
          endsAtSeconds: 10,
          name: 'Q1',
          participantDriverIds: initialDrivers.map((driver) => driver.id),
          startsAtSeconds: 0,
          suspensionEndsAtSeconds: null,
          suspensionStartsAtSeconds: null,
        },
      ],
      totalDurationSeconds: 10,
    }
    const config: RaceConfig = {
      drivers: initialDrivers,
      seed: 'q1-no-time',
      teams: initialTeams,
      timedSessionPlan: plan,
      track: tracks[0],
      weekendStage: 'qualifying',
    }
    const initial = createInitialRace(config)
    const slowDriverId = initial.cars[1].driverId
    const snapshot = advanceRace(
      {
        ...initial,
        cars: initial.cars.map((car, index) => ({
          ...car,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: { Q1: index === 1 ? null : index === 0 ? 80 : 85 },
        })),
        elapsedSeconds: 10,
      },
      0.1,
      config,
    )
    const slowCar = snapshot.cars.find((car) => car.driverId === slowDriverId)!

    expect(slowCar.qualifyingClassificationStatus).toBe('no-time')
    expect(slowCar.stewardsGrantedStart || slowCar.status === 'dns').toBe(true)
  })
})
