import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { ActiveFlagPhase, DriverDecisionPath } from '../types'
import {
  ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
  activeAeroDisplayModeForState,
  activeAeroModeFor,
  activeAeroStateOfDeploymentCanChange,
  activeAeroZoneAt,
  advanceActiveAeroState,
  isActiveAeroState,
  overtakeStatusFor,
} from './activeAero'
import { f1ActiveAeroModeForPath } from './categoryDriverAgent'
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

const controlledPhase: ActiveFlagPhase = {
  endMessage: 'Track clear.',
  endSeconds: 10,
  flag: 'sc',
  id: 'active-aero-path-controlled-phase',
  sector: 1,
  startMessage: 'Safety Car deployed.',
  startSeconds: 0,
}

type ActiveAeroModeOptions = Parameters<typeof activeAeroModeFor>[0]

describe('F1 active-aero category ownership seam', () => {
  const parityCases: ReadonlyArray<{
    expected: ReturnType<typeof activeAeroModeFor>
    label: string
    options: ActiveAeroModeOptions
  }> = [
    {
      expected: 'straight',
      label: 'dry activation zone',
      options: {
        car: movingCarAt(zone.start),
        lowGripConditions: false,
        phase: null,
        track,
      },
    },
    {
      expected: 'corner',
      label: 'outside activation zone',
      options: {
        car: movingCarAt(outsideProgress),
        lowGripConditions: false,
        phase: null,
        track,
      },
    },
    {
      expected: 'partial-straight',
      label: 'declared partial low-grip zone',
      options: {
        car: movingCarAt(zone.lowGripStart ?? zone.start),
        lowGripConditions: true,
        phase: null,
        track,
      },
    },
    {
      expected: 'corner',
      label: 'disabled low-grip zone',
      options: {
        car: movingCarAt(disabledZoneEntry.zone.start),
        lowGripConditions: true,
        phase: null,
        track: disabledZoneEntry.track,
      },
    },
    {
      expected: 'corner',
      label: 'controlled phase',
      options: {
        car: movingCarAt(zone.start),
        lowGripConditions: false,
        phase: controlledPhase,
        track,
      },
    },
    {
      expected: 'corner',
      label: 'non-running car',
      options: {
        car: { ...movingCarAt(zone.start), status: 'retired' },
        lowGripConditions: false,
        phase: null,
        track,
      },
    },
  ]

  for (const testCase of parityCases) {
    it(`preserves the exact ${testCase.label} request on every path`, () => {
      const before = structuredClone(testCase.options)
      const direct = activeAeroModeFor(testCase.options)
      const legacy = f1ActiveAeroModeForPath({
        options: testCase.options,
        path: 'legacy-direct',
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      })
      const category = f1ActiveAeroModeForPath({
        options: testCase.options,
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'f1-2026-current',
      })
      const defaulted = f1ActiveAeroModeForPath({
        options: testCase.options,
      })

      expect(direct).toBe(testCase.expected)
      expect(legacy).toBe(direct)
      expect(category).toBe(direct)
      expect(defaulted).toBe(category)
      expect(testCase.options).toEqual(before)
    })
  }

  it('rejects SF and invalid paths before reading F1 mode options', () => {
    let optionsRead = false
    const sfInput = {
      get options(): ActiveAeroModeOptions {
        optionsRead = true
        throw new Error('SF path read F1 active-aero options')
      },
      path: 'category-agent-v1' as const,
      seriesId: 'super-formula' as const,
      vehicleEraId: 'sf-2026' as const,
    }

    expect(() => f1ActiveAeroModeForPath(sfInput)).toThrow(
      /F1 active-aero intent requires an F1 Straight\/Corner policy/,
    )
    expect(optionsRead).toBe(false)
    expect(() =>
      f1ActiveAeroModeForPath({
        options: parityCases[0].options,
        path: 'category-agent-v1',
        seriesId: 'f1-custom',
        vehicleEraId: 'sf-2026',
      }),
    ).toThrow(/Unsupported driver policy f1-custom\/sf-2026/)
    expect(() =>
      f1ActiveAeroModeForPath({
        options: parityCases[0].options,
        path: 'future-aero-agent' as DriverDecisionPath,
      }),
    ).toThrow(/Unsupported driver decision path future-aero-agent/)
  })
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
    expect(telemetry.runtimeSystems.kind).toBe('f1')
    if (telemetry.runtimeSystems.kind !== 'f1') {
      throw new Error('Expected F1 runtime telemetry')
    }
    expect(telemetry.runtimeSystems.ersPowerKw).toBe(0)
  })
})
