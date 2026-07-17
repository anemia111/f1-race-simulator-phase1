import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { RaceConfig, TimedSessionPlan } from '../types'
import { advanceRace, createInitialRace } from './race'
import { phaseOneConfig } from '../data/phaseOne'
import { qualifyingCutSizes, runKnockoutQualifying } from './qualifying'
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

  it('applies Q1 107-percent status with explicit steward discretion', () => {
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
      seed: '107-percent',
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
          bestLapTimeSeconds: index === 0 ? 80 : index === 1 ? 87 : 82,
          pitUntilSeconds: null,
          timedSegmentBestSeconds: {
            Q1: index === 0 ? 80 : index === 1 ? 87 : 82,
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

    expect(slowCar.outside107Percent).toBe(true)
    expect(slowCar.stewardsGrantedStart || slowCar.status === 'dns').toBe(true)
  })
})
