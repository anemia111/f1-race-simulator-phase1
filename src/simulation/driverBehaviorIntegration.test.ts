import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { RaceConfig, RaceSnapshot } from '../types'
import { decideDriverBehavior } from './driverDecision'
import { lateralBoundsForTrack } from './lateralDynamics'
import { overtakeForLap } from './overtaking'
import {
  advanceRace,
  createInitialRace,
  driverDecisionRequestsFormalBattle,
  raceDistanceBattleCue,
} from './race'
import {
  calculateCarTelemetry,
  driverBrakePressureScale,
} from './telemetry'
import { trackDynamicsAt } from './trackDynamics'
import {
  dirtyAirDownforceMultiplier,
  towDragReductionFor,
} from './vehicleDynamics'

const makeConfig = (seed: string): RaceConfig => ({
  drivers: initialDrivers,
  seed,
  teams: initialTeams,
  track: tracks[0],
  weekendStage: 'race',
})

function startRace(config: RaceConfig): RaceSnapshot {
  let snapshot = createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  return advanceRace(snapshot, 9, config)
}

describe('driver behaviour integration', () => {
  it('exposes attack and defence cues only in race-distance sessions', () => {
    const cue = {
      active: true,
      intensity: 0.7,
      opponentId: 'opponent',
      opponentLateralOffsetM: 0.4,
    }

    expect(raceDistanceBattleCue(true, cue)).toBe(cue)
    expect(raceDistanceBattleCue(false, cue)).toBeUndefined()
    expect(raceDistanceBattleCue(true, undefined)).toBeUndefined()
  })

  it('requests formal battle resolution only from attack intent', () => {
    expect(
      driverDecisionRequestsFormalBattle({ intent: 'attack' }),
    ).toBe(true)
    expect(
      driverDecisionRequestsFormalBattle({ intent: 'defend' }),
    ).toBe(false)
    expect(driverDecisionRequestsFormalBattle(undefined)).toBe(false)
  })

  it('uses the skill brake blend only when no decision control exists', () => {
    const driver = initialDrivers[0]
    const withBrakeSkills = (value: number) => ({
      ...driver,
      skills: {
        ...driver.skills,
        brakingSkill: value,
        precision: value,
        pressureHandling: value,
      },
    })
    const weakest = withBrakeSkills(0)
    const strongest = withBrakeSkills(1)
    const explicitDecision = { brakePressureScale: 0.81 }

    expect(driverBrakePressureScale(weakest, explicitDecision)).toBe(0.81)
    expect(driverBrakePressureScale(strongest, explicitDecision)).toBe(0.81)
    expect(driverBrakePressureScale(strongest)).toBeGreaterThan(
      driverBrakePressureScale(weakest),
    )
  })

  it('turns pedal decisions into controller inputs without a speed multiplier', () => {
    const config = makeConfig('pedal-behaviour')
    const initial = createInitialRace(config)
    const driver = initialDrivers[0]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const brakingIndex = config.track.centerline.findIndex((_, index) => {
      const dynamics = trackDynamicsAt(
        config.track,
        index / config.track.centerline.length,
      )

      return dynamics.brakingDistanceAheadMeters > 20
    })
    const progress = brakingIndex / config.track.centerline.length
    const dynamics = trackDynamicsAt(config.track, progress)
    const car = {
      ...initial.cars[0],
      progress,
      speedKph: Math.max(220, dynamics.brakingTargetSpeedKph + 80),
      status: 'running' as const,
    }
    const baseDecision = decideDriverBehavior({
      currentLateralOffsetM: 0,
      driver,
      lap: 2,
      physicalReferenceLineOffsetM: dynamics.referenceLineOffsetM,
      seed: config.seed,
      trackHalfWidthM: 6,
      trackProgress: progress,
    })
    const telemetryFor = (
      brakeOnsetDeltaSeconds: number,
      brakePressureScale: number,
    ) =>
      calculateCarTelemetry({
        car,
        deltaSeconds: 0.1,
        driver,
        driverDecision: {
          ...baseDecision,
          brakeOnsetDeltaSeconds,
          brakePressureScale,
        },
        elapsedSeconds: 120,
        lowGripConditions: false,
        phase: null,
        raceLap: 2,
        team,
        track: config.track,
        trackGrip: 1,
        weather: 'clear',
      })
    const early = telemetryFor(0.3, 1.08)
    const late = telemetryFor(-0.18, 0.72)

    expect(early.brakePercent).toBeGreaterThan(late.brakePercent)
    expect(early.speedKph).not.toBe(late.speedKph)
  })

  it('uses lateral alignment for dirty air and tow', () => {
    const dynamics = { curvature: 0.7, straightness: 0.95 }
    const team = initialTeams[0]

    expect(
      dirtyAirDownforceMultiplier({
        dynamics,
        gapSeconds: 0.7,
        lateralSeparationM: 0,
        team,
      }),
    ).toBeLessThan(
      dirtyAirDownforceMultiplier({
        dynamics,
        gapSeconds: 0.7,
        lateralSeparationM: 4,
        team,
      }),
    )
    expect(
      towDragReductionFor({
        dynamics,
        gapSeconds: 0.7,
        lateralSeparationM: 0,
        team,
      }),
    ).toBeGreaterThan(
      towDragReductionFor({
        dynamics,
        gapSeconds: 0.7,
        lateralSeparationM: 4,
        team,
      }),
    )
  })

  it('does not create contact before physical occupancies are close', () => {
    const config = makeConfig('contact-clearance')
    const [attackerCar, defenderCar] = createInitialRace(config).cars
    const attacker = initialDrivers.find(
      (driver) => driver.id === attackerCar.driverId,
    )!
    const defender = initialDrivers.find(
      (driver) => driver.id === defenderCar.driverId,
    )!

    for (let sample = 0; sample < 250; sample += 1) {
      const result = overtakeForLap({
        attacker,
        attackerCar: { ...attackerCar, status: 'running' },
        defender,
        defenderCar: { ...defenderCar, status: 'running' },
        gapToAheadSeconds: 0.4,
        inRestartWindow: false,
        isOpeningLap: false,
        lap: sample,
        lateralSeparationM: 3,
        longitudinalSeparationM: 20,
        seed: `${config.seed}:${sample}`,
        track: config.track,
        trackGrip: 1,
        trackProgress: 0.5,
        weather: 'clear',
      })

      expect(result?.kind).not.toBe('contact')
      expect(result?.kind).not.toBe('crash')
    }
  })

  it('keeps live lateral state deterministic, bounded, and alias-synchronised', () => {
    const config = makeConfig('live-lateral-state')
    const started = startRace(config)
    const first = advanceRace(started, 0.5, config)
    const replay = advanceRace(started, 0.5, config)
    const bounds = lateralBoundsForTrack(config.track)

    expect(first).toEqual(replay)
    for (const car of first.cars) {
      expect(Number.isFinite(car.lateralOffsetM)).toBe(true)
      expect(Number.isFinite(car.lateralVelocityMps)).toBe(true)
      expect(car.lateralOffsetM).toBeGreaterThanOrEqual(bounds.minOffsetM)
      expect(car.lateralOffsetM).toBeLessThanOrEqual(bounds.maxOffsetM)
      expect(car.trackLateralOffset).toBe(car.lateralOffsetM)
    }
  })

  it('caps a same-lane rear candidate until there is physical clearance', () => {
    const config = makeConfig('live-occupancy-cap')
    const started = startRace(config)
    const lapLengthM = config.track.lengthKm * 1000
    const leader = started.cars[0]
    const attacker = started.cars[1]
    const leaderDistance = Math.max(2.2, leader.totalDistance)
    const cars = started.cars.map((car) => {
      if (car.driverId === leader.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: 0,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          speedKph: 45,
          status: 'running' as const,
          totalDistance: leaderDistance,
          trackLateralOffset: 0,
        }
      }
      if (car.driverId === attacker.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: 0,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          speedKph: 310,
          status: 'running' as const,
          totalDistance: leaderDistance - 7 / lapLengthM,
          trackLateralOffset: 0,
        }
      }

      return {
        ...car,
        status: 'retired' as const,
        hiddenFromTrack: true,
      }
    })
    const next = advanceRace({ ...started, cars }, 0.5, config)
    const nextLeader = next.cars.find((car) => car.driverId === leader.driverId)!
    const nextAttacker = next.cars.find(
      (car) => car.driverId === attacker.driverId,
    )!
    const separationM =
      (nextLeader.totalDistance - nextAttacker.totalDistance) * lapLengthM

    expect(separationM).toBeGreaterThanOrEqual(6.44)
  })

  it('keeps a close same-lane queue rolling while the lead car moves', () => {
    const config = makeConfig('live-occupancy-rolling-queue')
    const started = startRace(config)
    const lapLengthM = config.track.lengthKm * 1000
    const leader = started.cars[0]
    const follower = started.cars[1]
    const leaderDistance = Math.max(2.2, leader.totalDistance)
    const followerDistance = leaderDistance - 5.3 / lapLengthM
    const cars = started.cars.map((car) => {
      if (car.driverId === leader.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: 0,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          speedKph: 45,
          status: 'running' as const,
          totalDistance: leaderDistance,
          trackLateralOffset: 0,
        }
      }
      if (car.driverId === follower.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: 0,
          lateralOffsetM: 0,
          lateralVelocityMps: 0,
          speedKph: 310,
          status: 'running' as const,
          totalDistance: followerDistance,
          trackLateralOffset: 0,
        }
      }

      return {
        ...car,
        status: 'retired' as const,
        hiddenFromTrack: true,
      }
    })
    const next = advanceRace({ ...started, cars }, 0.05, config)
    const nextLeader = next.cars.find((car) => car.driverId === leader.driverId)!
    const nextFollower = next.cars.find(
      (car) => car.driverId === follower.driverId,
    )!
    const separationM =
      (nextLeader.totalDistance - nextFollower.totalDistance) * lapLengthM

    expect(nextLeader.totalDistance).toBeGreaterThan(leaderDistance)
    expect(nextFollower.totalDistance).toBeGreaterThan(followerDistance)
    expect(nextFollower.speedKph).toBeGreaterThan(0)
    expect(separationM).toBeGreaterThanOrEqual(5.29)
  })

  it('records a pass only after laterally clear physical distance crossing', () => {
    const config = makeConfig('live-pass-crossing')
    const started = startRace(config)
    const lapLengthM = config.track.lengthKm * 1000
    const defender = started.cars[0]
    const attacker = started.cars[1]
    const defenderDistance = Math.max(2.2, defender.totalDistance)
    const cars = started.cars.map((car) => {
      if (car.driverId === defender.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: -2.5,
          lateralOffsetM: -2.5,
          lateralVelocityMps: 0,
          speedKph: 35,
          status: 'running' as const,
          totalDistance: defenderDistance,
          trackLateralOffset: -2.5,
        }
      }
      if (car.driverId === attacker.driverId) {
        return {
          ...car,
          desiredLateralOffsetM: 2.5,
          lateralOffsetM: 2.5,
          lateralVelocityMps: 0,
          speedKph: 330,
          status: 'running' as const,
          totalDistance: defenderDistance - 1 / lapLengthM,
          trackLateralOffset: 2.5,
        }
      }

      return {
        ...car,
        status: 'retired' as const,
        hiddenFromTrack: true,
      }
    })
    const next = advanceRace({ ...started, cars }, 0.5, config)
    const nextDefender = next.cars.find(
      (car) => car.driverId === defender.driverId,
    )!
    const nextAttacker = next.cars.find(
      (car) => car.driverId === attacker.driverId,
    )!

    expect(nextAttacker.totalDistance).toBeGreaterThan(
      nextDefender.totalDistance,
    )
    expect(
      next.events.some(
        (event) =>
          event.kind === 'overtake' &&
          event.message.includes(`${attacker.code} passes ${defender.code}`),
      ),
    ).toBe(true)
  })
})
