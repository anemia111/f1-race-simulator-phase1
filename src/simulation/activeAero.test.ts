import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import {
  ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
  activeAeroDisplayModeForState,
  activeAeroStateOfDeploymentCanChange,
  activeAeroZoneAt,
  advanceActiveAeroState,
  isActiveAeroState,
  overtakeStatusFor,
} from './activeAero'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'

const partialZoneEntry = tracks
  .flatMap((track) =>
    (track.aeroActivationZones ?? []).map((zone) => ({ track, zone })),
  )
  .find(
    ({ zone }) => zone.source === 'official' && zone.lowGripMode === 'partial',
  )

const disabledZoneEntry = tracks
  .flatMap((track) =>
    (track.aeroActivationZones ?? []).map((zone) => ({ track, zone })),
  )
  .find(
    ({ zone }) => zone.source === 'official' && zone.lowGripMode === 'disabled',
  )

if (!partialZoneEntry || !disabledZoneEntry) {
  throw new Error('Expected official partial and disabled low-grip aero zones')
}

const { track, zone } = partialZoneEntry
const outsideProgress = Array.from(
  { length: 1_000 },
  (_, index) => index / 1_000,
).find((progress) => activeAeroZoneAt(track, progress) === null)

if (outsideProgress === undefined) {
  throw new Error(`Expected an off-zone progress on ${track.id}`)
}

const movingCarAt = (progress: number) => ({
  progress,
  speedKph: 240,
  status: 'running' as const,
})

describe('2026 F1 active-aero State of Deployment', () => {
  it('permits state changes only while stationary or inside an Activation Zone', () => {
    expect(
      activeAeroStateOfDeploymentCanChange({
        car: movingCarAt(outsideProgress),
        lowGripConditions: false,
        track,
      }),
    ).toBe(false)
    expect(
      activeAeroStateOfDeploymentCanChange({
        car: { ...movingCarAt(outsideProgress), speedKph: 0 },
        lowGripConditions: false,
        track,
      }),
    ).toBe(true)
    expect(
      activeAeroStateOfDeploymentCanChange({
        car: movingCarAt(zone.start),
        lowGripConditions: false,
        track,
      }),
    ).toBe(true)

    const rejected = advanceActiveAeroState({
      car: movingCarAt(outsideProgress),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 10,
      lowGripConditions: false,
      phase: null,
      requestedMode: 'straight',
      track,
    })

    expect(rejected).toMatchObject({
      command: 'corner',
      front: 'corner',
      rear: 'corner',
      transition: null,
    })
  })

  it('moves both wing systems continuously and settles within 400 ms', () => {
    const started = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: 0,
      elapsedSeconds: 20,
      lowGripConditions: false,
      phase: null,
      requestedMode: 'straight',
      track,
    })

    expect(started).toMatchObject({
      activationZoneId: zone.label,
      command: 'straight',
      commandAtSeconds: 20,
      front: 'transition-to-straight',
      rear: 'transition-to-straight',
      transitionProgress: 0,
    })
    expect(started.transition?.durationSeconds).toBe(
      ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
    )
    expect(activeAeroDisplayModeForState(started)).toBe('corner')
    expect(isActiveAeroState(started)).toBe(true)

    const justBeforeLimit = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: 0.399,
      elapsedSeconds: 20.399,
      lowGripConditions: false,
      phase: null,
      previous: started,
      requestedMode: 'straight',
      track,
    })

    expect(justBeforeLimit.frontStraightFraction).toBeCloseTo(0.9975, 6)
    expect(justBeforeLimit.rearStraightFraction).toBeCloseTo(0.9975, 6)
    expect(justBeforeLimit.transition).not.toBeNull()

    const settled = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: 0.001,
      elapsedSeconds: 20.4,
      lowGripConditions: false,
      phase: null,
      previous: justBeforeLimit,
      requestedMode: 'straight',
      track,
    })

    expect(settled).toMatchObject({
      command: 'straight',
      front: 'straight',
      frontStraightFraction: 1,
      rear: 'straight',
      rearStraightFraction: 1,
      transition: null,
      transitionProgress: 1,
    })
    expect(activeAeroDisplayModeForState(settled)).toBe('straight')
    expect(isActiveAeroState(settled)).toBe(true)
    expect(
      isActiveAeroState({ ...settled, frontStraightFraction: 0.5 }),
    ).toBe(false)
  })

  it('commands Corner Mode at zone exit and never commands Straight outside', () => {
    const straight = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 30,
      lowGripConditions: false,
      phase: null,
      requestedMode: 'straight',
      track,
    })
    const returning = advanceActiveAeroState({
      car: movingCarAt(outsideProgress),
      deltaSeconds: 0,
      elapsedSeconds: 30.1,
      lowGripConditions: false,
      phase: null,
      previous: straight,
      requestedMode: 'straight',
      track,
    })

    expect(returning).toMatchObject({
      activationZoneId: null,
      command: 'corner',
      front: 'transition-to-corner',
      rear: 'transition-to-corner',
    })
    expect(returning.transition?.durationSeconds).toBeLessThanOrEqual(
      ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
    )

    const corner = advanceActiveAeroState({
      car: movingCarAt(outsideProgress),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 30.5,
      lowGripConditions: false,
      phase: null,
      previous: returning,
      requestedMode: 'straight',
      track,
    })

    expect(corner).toMatchObject({
      command: 'corner',
      front: 'corner',
      frontStraightFraction: 0,
      rear: 'corner',
      rearStraightFraction: 0,
      transition: null,
    })
  })

  it('latches a failure in Corner-safe state until a stationary reset', () => {
    const straight = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 40,
      lowGripConditions: false,
      phase: null,
      requestedMode: 'straight',
      track,
    })
    const failed = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: 0,
      elapsedSeconds: 41,
      failureDetected: true,
      lowGripConditions: false,
      phase: null,
      previous: straight,
      track,
    })

    expect(failed).toMatchObject({
      command: 'corner',
      failureState: 'failed-corner-safe',
      front: 'failed-corner-safe',
      frontStraightFraction: 0,
      rear: 'failed-corner-safe',
      rearStraightFraction: 0,
      transition: null,
    })

    const movingReset = advanceActiveAeroState({
      car: movingCarAt(zone.start),
      deltaSeconds: 1,
      elapsedSeconds: 42,
      lowGripConditions: false,
      phase: null,
      previous: failed,
      requestedMode: 'straight',
      resetFailure: true,
      track,
    })
    expect(movingReset.failureState).toBe('failed-corner-safe')

    const stationaryReset = advanceActiveAeroState({
      car: { ...movingCarAt(outsideProgress), speedKph: 0 },
      deltaSeconds: 0,
      elapsedSeconds: 43,
      lowGripConditions: false,
      phase: null,
      previous: movingReset,
      resetFailure: true,
      track,
    })
    expect(stationaryReset).toMatchObject({
      command: 'corner',
      failureState: 'operational',
      front: 'corner',
      frontStraightFraction: 0,
      rear: 'corner',
      rearStraightFraction: 0,
      transition: null,
    })
  })

  it('allows only an explicitly declared partial front-wing state in low grip', () => {
    const partialProgress = zone.lowGripStart ?? zone.start
    const partial = advanceActiveAeroState({
      car: movingCarAt(partialProgress),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 50,
      lowGripConditions: true,
      phase: null,
      requestedMode: 'straight',
      track,
    })

    expect(partial).toMatchObject({
      command: 'partial-straight',
      front: 'straight',
      frontStraightFraction: 1,
      rear: 'corner',
      rearStraightFraction: 0,
    })

    const disabled = advanceActiveAeroState({
      car: movingCarAt(disabledZoneEntry.zone.start),
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 51,
      lowGripConditions: true,
      phase: null,
      requestedMode: 'straight',
      track: disabledZoneEntry.track,
    })

    expect(disabled).toMatchObject({
      command: 'corner',
      front: 'corner',
      rear: 'corner',
    })
  })

  it('keeps Straight Mode independent from electrical Overtake eligibility', () => {
    const car = {
      ...createInitialRace({
        drivers: initialDrivers,
        seed: 'active-aero-overtake-independence',
        teams: initialTeams,
        track,
      }).cars[1],
      progress: zone.start,
      speedKph: 240,
      status: 'running' as const,
    }

    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car,
        lowGripConditions: false,
        overtakeEnergyRemainingMj: 0,
        phase: null,
        raceLap: 4,
        track,
      }),
    ).toBe('disabled')

    const aero = advanceActiveAeroState({
      car,
      deltaSeconds: ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
      elapsedSeconds: 60,
      lowGripConditions: false,
      phase: null,
      requestedMode: 'straight',
      track,
    })

    expect(aero.command).toBe('straight')
    expect(aero.front).toBe('straight')
    expect(aero.rear).toBe('straight')
  })

  it('fails ERS deployment closed before integration when the low-grip curve is unavailable', () => {
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'low-grip-ers-unavailable',
      teams: initialTeams,
      track,
    })
    const car = {
      ...snapshot.cars[0],
      progress: zone.lowGripStart ?? zone.start,
      speedKph: 220,
      status: 'running' as const,
    }
    const telemetry = calculateCarTelemetry({
      car,
      deltaSeconds: 0.02,
      driver: initialDrivers.find((driver) => driver.id === car.driverId)!,
      elapsedSeconds: 70,
      lowGripConditions: true,
      phase: null,
      raceLap: 4,
      team: initialTeams.find((team) => team.id === car.teamId)!,
      track,
      trackGrip: 0.84,
      weather: 'light-rain',
    })

    expect(telemetry.overtakeStatus).toBe('disabled')
    expect(telemetry.ersPowerKw).toBe(0)
  })
})
