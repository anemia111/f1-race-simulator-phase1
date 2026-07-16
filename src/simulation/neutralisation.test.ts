import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type {
  ActiveFlagPhase,
  CarSnapshot,
  RaceConfig,
} from '../types'
import {
  advanceNeutralisationProcedure,
  ensureNeutralisationProcedure,
} from './neutralisation'
import { createInitialRace } from './race'

const config: RaceConfig = {
  drivers: initialDrivers,
  seed: 'fia-b5-13',
  teams: initialTeams,
  track: tracks[0],
}

const atDistance = (car: CarSnapshot, totalDistance: number): CarSnapshot => ({
  ...car,
  lap: Math.floor(totalDistance),
  pitPhase: 'none',
  progress: totalDistance - Math.floor(totalDistance),
  status: 'running',
  totalDistance,
})

function deployedScenario() {
  const base = createInitialRace(config).cars.slice(0, 3)
  const deployedCars = [
    atDistance(base[0], 10.2),
    atDistance(base[1], 9.2),
    atDistance(base[2], 10.1),
  ]
  const initialPhase: ActiveFlagPhase = {
    endMessage: 'Track clear.',
    endSeconds: 0,
    flag: 'sc',
    id: 'forced-sc-unlap',
    sector: 1,
    startMessage: 'SAFETY CAR DEPLOYED',
    startSeconds: 0,
  }
  const created = ensureNeutralisationProcedure(
    initialPhase,
    deployedCars,
    config.track,
  )
  const procedure = created.neutralisation

  if (!procedure || procedure.kind !== 'safety-car') {
    throw new Error('Safety Car procedure was not created.')
  }

  const leaderTarget = procedure.eligibilityLineTargetByDriver[base[0].driverId]
  const eligibleTarget =
    procedure.eligibilityLineTargetByDriver[base[1].driverId]
  const ineligibleTarget =
    procedure.eligibilityLineTargetByDriver[base[2].driverId]
  const referenceCars = [
    atDistance(base[0], leaderTarget + 0.2),
    atDistance(base[1], eligibleTarget + 0.01),
    atDistance(base[2], ineligibleTarget + 0.01),
  ]
  const safetyCarDistance = referenceCars[0].totalDistance + 0.025
  const phase: ActiveFlagPhase = {
    ...created,
    neutralisation: {
      ...procedure,
      fieldQueuedAtSeconds: 1,
      leaderCollectedAtSeconds: 1,
      leaderCollectionTargetDistance: safetyCarDistance,
      safetyCarDistance,
      safetyCarLastUpdatedAtSeconds: 100,
      stage: 'queue-formed',
    },
  }

  return { base, phase, referenceCars }
}

function beginUnlapping(overtakingPermitted = true) {
  const scenario = deployedScenario()
  const result = advanceNeutralisationProcedure({
    cars: scenario.referenceCars,
    elapsedSeconds: 100,
    overtakingPermitted,
    phase: scenario.phase,
    seed: config.seed,
    track: config.track,
  })

  return { ...scenario, result }
}

describe('FIA 2026 Safety Car unlapping procedure', () => {
  it('waits at pit exit until the leader rounds the final corner', () => {
    const base = createInitialRace(config).cars.slice(0, 3)
    const deployedCars = [
      atDistance(base[0], 10.05),
      atDistance(base[1], 10.02),
      atDistance(base[2], 9.99),
    ]
    const phase = ensureNeutralisationProcedure(
      {
        endMessage: 'Track clear.',
        endSeconds: 80,
        flag: 'sc',
        id: 'sc-pit-exit-release',
        sector: 1,
        startMessage: 'SAFETY CAR DEPLOYED',
        startSeconds: 0,
      },
      deployedCars,
      config.track,
    )
    const createdProcedure = phase.neutralisation

    if (!createdProcedure || createdProcedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure was not created.')
    }

    const waitingDistance = createdProcedure.safetyCarDistance
    const waiting = advanceNeutralisationProcedure({
      cars: deployedCars.map((car, index) =>
        atDistance(car, 10.4 - index * 0.02),
      ),
      elapsedSeconds: 30,
      phase,
      seed: config.seed,
      track: config.track,
    })

    expect(waiting.phase?.neutralisation?.kind).toBe('safety-car')
    expect(waiting.phase?.neutralisation?.stage).toBe('deployed')
    if (waiting.phase?.neutralisation?.kind !== 'safety-car') {
      throw new Error('Safety Car procedure ended unexpectedly.')
    }
    expect(waiting.phase.neutralisation.safetyCarDistance).toBe(
      waitingDistance,
    )

    const leaderThroughFinalCorner = deployedCars.map((car, index) =>
      atDistance(car, 10.999 - index * 0.02),
    )
    const released = advanceNeutralisationProcedure({
      cars: leaderThroughFinalCorner,
      elapsedSeconds: 30.1,
      phase: waiting.phase!,
      seed: config.seed,
      track: config.track,
    })

    expect(released.phase?.neutralisation?.kind).toBe('safety-car')
    expect(released.phase?.neutralisation?.stage).toBe('collecting-field')
    expect(
      released.events.some((event) =>
        event.message.includes('LEAVING PIT EXIT'),
      ),
    ).toBe(true)
    if (released.phase?.neutralisation?.kind !== 'safety-car') {
      throw new Error('Safety Car was not released.')
    }
    expect(
      released.phase.neutralisation.safetyCarDistance % 1,
    ).toBeCloseTo(config.track.pitLane?.exitProgress ?? 0.13, 6)
  })

  it('accelerates away from the leader once IN THIS LAP is announced', () => {
    const cars = createInitialRace(config).cars.slice(0, 3).map((car, index) =>
      atDistance(car, 10.2 - index * 0.003),
    )
    const phase = ensureNeutralisationProcedure(
      {
        endMessage: 'Track clear.',
        endSeconds: 1_000,
        flag: 'sc',
        id: 'sc-in-lap-acceleration',
        sector: 0,
        startMessage: 'SAFETY CAR DEPLOYED',
        startSeconds: 0,
      },
      cars,
      config.track,
    )
    const createdProcedure = phase.neutralisation

    if (!createdProcedure || createdProcedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure was not created.')
    }

    const safetyCarDistance = cars[0].totalDistance + 0.02
    const normal = advanceNeutralisationProcedure({
      cars,
      elapsedSeconds: 101,
      phase: {
        ...phase,
        neutralisation: {
          ...createdProcedure,
          leaderCollectedAtSeconds: 90,
          safetyCarDistance,
          safetyCarLastUpdatedAtSeconds: 100,
          stage: 'collecting-field',
        },
      },
      seed: config.seed,
      track: config.track,
    })
    const inThisLap = advanceNeutralisationProcedure({
      cars,
      elapsedSeconds: 101,
      phase: {
        ...phase,
        neutralisation: {
          ...createdProcedure,
          inThisLapAtSeconds: 100,
          leaderCollectedAtSeconds: 90,
          orangeLights: false,
          pitEntrySafetyCarDistance: safetyCarDistance + 0.5,
          restartLineDistance: 11,
          safetyCarDistance,
          safetyCarLastUpdatedAtSeconds: 100,
          stage: 'in-this-lap',
        },
      },
      seed: config.seed,
      track: config.track,
    })
    const normalProcedure = normal.phase?.neutralisation
    const inThisLapProcedure = inThisLap.phase?.neutralisation

    expect(normalProcedure?.kind).toBe('safety-car')
    expect(inThisLapProcedure?.kind).toBe('safety-car')
    if (
      !normalProcedure ||
      normalProcedure.kind !== 'safety-car' ||
      !inThisLapProcedure ||
      inThisLapProcedure.kind !== 'safety-car'
    ) {
      throw new Error('Safety Car procedure ended unexpectedly.')
    }
    expect(
      inThisLapProcedure.safetyCarDistance - safetyCarDistance,
    ).toBeGreaterThan(
      (normalProcedure.safetyCarDistance - safetyCarDistance) * 1.5,
    )
  })

  it('does not form the queue or withdraw until the leader reaches the Safety Car', () => {
    const cars = createInitialRace(config).cars.slice(0, 3)
    const leader = atDistance(cars[0], 5.4)
    const queuedCars = [
      leader,
      atDistance(cars[1], 5.398),
      atDistance(cars[2], 5.396),
    ]
    const created = ensureNeutralisationProcedure(
      {
        endMessage: 'Track clear.',
        endSeconds: 0,
        flag: 'sc',
        id: 'sc-waits-for-leader',
        sector: 0,
        startMessage: 'SAFETY CAR DEPLOYED',
        startSeconds: 0,
      },
      queuedCars,
      config.track,
    )
    const procedure = created.neutralisation

    if (!procedure || procedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure was not created.')
    }

    const waiting = advanceNeutralisationProcedure({
      cars: queuedCars,
      elapsedSeconds: 100,
      phase: {
        ...created,
        neutralisation: {
          ...procedure,
          eligibilityStatusByDriver: Object.fromEntries(
            queuedCars.map((car) => [car.driverId, 'ineligible' as const]),
          ),
          safetyCarDistance: leader.totalDistance + 0.012,
          safetyCarLastUpdatedAtSeconds: 100,
          stage: 'collecting-field',
        },
      },
      seed: config.seed,
      track: config.track,
    })

    expect(waiting.phase?.neutralisation?.kind).toBe('safety-car')
    expect(waiting.phase?.neutralisation?.stage).toBe('collecting-field')
    if (waiting.phase?.neutralisation?.kind !== 'safety-car') {
      throw new Error('Safety Car procedure ended unexpectedly.')
    }
    expect(waiting.phase.neutralisation.leaderCollectedAtSeconds).toBeNull()
    expect(
      waiting.events.some((event) =>
        event.message.includes('SAFETY CAR IN THIS LAP'),
      ),
    ).toBe(false)
  })

  it('freezes eligibility at the Line after each car crosses SC1 for the second time', () => {
    const { base, result } = beginUnlapping()
    const procedure = result.phase?.neutralisation

    expect(procedure?.kind).toBe('safety-car')
    if (!procedure || procedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure was not retained.')
    }

    expect(procedure.eligibilityStatusByDriver[base[1].driverId]).toBe(
      'eligible',
    )
    expect(procedure.eligibilityStatusByDriver[base[2].driverId]).toBe(
      'ineligible',
    )
    expect(procedure.eligibleLappedDriverIds).toEqual([base[1].driverId])
    expect(procedure.greenLight).toBe(true)
    const message = result.events.at(-1)?.message ?? ''
    expect(message).toMatch(new RegExp(`\\b${base[1].code}\\b`, 'u'))
    expect(message).not.toMatch(new RegExp(`\\b${base[2].code}\\b`, 'u'))
  })

  it('does not run the unlapping procedure when Race Control deems overtaking unsafe', () => {
    const { result } = beginUnlapping(false)
    const procedure = result.phase?.neutralisation

    expect(procedure?.kind).toBe('safety-car')
    expect(procedure?.stage).toBe('in-this-lap')
    expect(
      result.events.some((event) =>
        event.message.includes('OVERTAKING WILL NOT BE PERMITTED'),
      ),
    ).toBe(true)
  })

  it('penalizes a car that was excluded at the reference point but later overtakes the Safety Car', () => {
    const { base, referenceCars, result } = beginUnlapping()
    const procedure = result.phase?.neutralisation

    if (!procedure || procedure.kind !== 'safety-car') {
      throw new Error('Unlapping procedure was not created.')
    }

    const safetyCarProgress =
      procedure.safetyCarDistance - Math.floor(procedure.safetyCarDistance)
    const crossingProgress = (safetyCarProgress + 0.012) % 1
    const lateLappedDistance =
      Math.floor(procedure.safetyCarDistance) - 1 + crossingProgress
    const cars = referenceCars.map((car) =>
      car.driverId === base[2].driverId
        ? atDistance(car, lateLappedDistance)
        : car,
    )
    const next = advanceNeutralisationProcedure({
      cars,
      elapsedSeconds: 100.05,
      phase: {
        ...result.phase!,
        neutralisation: {
          ...procedure,
          lastObservedSafetyCarGapByDriver: {
            ...procedure.lastObservedSafetyCarGapByDriver,
            [base[2].driverId]: -0.01,
          },
          safetyCarLastUpdatedAtSeconds: 100.05,
        },
      },
      seed: config.seed,
      track: config.track,
    })

    expect(next.penaltyLapDriverIds).toEqual([base[2].driverId])
    expect(next.events.at(-1)?.message).toContain('one penalty lap')
  })

  it('extinguishes the SC green light after the named car passes, then records its queue-tail rejoin', () => {
    const { base, referenceCars, result } = beginUnlapping()
    const procedure = result.phase?.neutralisation

    if (!procedure || procedure.kind !== 'safety-car') {
      throw new Error('Unlapping procedure was not created.')
    }

    const safetyCarProgress =
      procedure.safetyCarDistance - Math.floor(procedure.safetyCarDistance)
    const passedDistance =
      Math.floor(procedure.safetyCarDistance) - 1 +
      ((safetyCarProgress + 0.012) % 1)
    const passingCars = referenceCars.map((car) =>
      car.driverId === base[1].driverId
        ? atDistance(car, passedDistance)
        : car,
    )
    const passed = advanceNeutralisationProcedure({
      cars: passingCars,
      elapsedSeconds: 100.05,
      phase: {
        ...result.phase!,
        neutralisation: {
          ...procedure,
          lastObservedSafetyCarGapByDriver: {
            ...procedure.lastObservedSafetyCarGapByDriver,
            [base[1].driverId]: -0.01,
          },
          safetyCarLastUpdatedAtSeconds: 100.05,
        },
      },
      seed: config.seed,
      track: config.track,
    })
    const passedProcedure = passed.phase?.neutralisation

    expect(passedProcedure?.kind).toBe('safety-car')
    if (!passedProcedure || passedProcedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure ended too early.')
    }
    expect(passedProcedure.greenLight).toBe(false)
    expect(
      passedProcedure.unlappingPassedSafetyCarAtDistanceByDriver[
        base[1].driverId
      ],
    ).toBeDefined()

    const leader = atDistance(
      passingCars[0],
      Math.floor(passedProcedure.safetyCarDistance) + 0.58,
    )
    let rejoinDistance =
      Math.floor(passedDistance) + 1 + leader.progress - 0.005
    while (rejoinDistance - passedDistance < 0.2) {
      rejoinDistance += 1
    }
    const rejoiningCars = [
      leader,
      atDistance(passingCars[1], rejoinDistance),
      { ...passingCars[2], status: 'retired' as const },
    ]
    const rejoined = advanceNeutralisationProcedure({
      cars: rejoiningCars,
      elapsedSeconds: 100.1,
      phase: {
        ...passed.phase!,
        neutralisation: {
          ...passedProcedure,
          safetyCarDistance: Math.floor(leader.totalDistance) + 0.6,
          safetyCarLastUpdatedAtSeconds: 100.1,
        },
      },
      seed: config.seed,
      track: config.track,
    })
    const rejoinedProcedure = rejoined.phase?.neutralisation

    expect(rejoinedProcedure?.kind).toBe('safety-car')
    if (!rejoinedProcedure || rejoinedProcedure.kind !== 'safety-car') {
      throw new Error('Safety Car procedure ended before the following lap.')
    }
    expect(rejoinedProcedure.unlappingRejoinedDriverIds).toContain(
      base[1].driverId,
    )
  })

  it('sends the Safety Car to pit entry on the final lap without a green-flag restart', () => {
    const { phase, referenceCars } = deployedScenario()
    const finalLap = advanceNeutralisationProcedure({
      cars: referenceCars,
      elapsedSeconds: 101,
      finishingLap: true,
      phase,
      seed: config.seed,
      track: config.track,
    })
    const procedure = finalLap.phase?.neutralisation

    expect(finalLap.completedFlag).toBeNull()
    expect(procedure?.kind).toBe('safety-car')
    if (!procedure || procedure.kind !== 'safety-car') {
      throw new Error('Final-lap Safety Car procedure was not retained.')
    }
    expect(procedure.finishingUnderSafetyCar).toBe(true)
    expect(procedure.orangeLights).toBe(false)
    expect(procedure.restartLineDistance).toBeNull()
    expect(
      finalLap.events.some((event) => event.message.includes('FINAL LAP')),
    ).toBe(true)

    const pitEntry = advanceNeutralisationProcedure({
      cars: referenceCars,
      elapsedSeconds: 101.1,
      finishingLap: true,
      phase: {
        ...finalLap.phase!,
        neutralisation: {
          ...procedure,
          safetyCarDistance: procedure.pitEntrySafetyCarDistance!,
          safetyCarLastUpdatedAtSeconds: 101.1,
        },
      },
      seed: config.seed,
      track: config.track,
    })

    expect(pitEntry.completedFlag).toBeNull()
    expect(pitEntry.phase?.neutralisation?.kind).toBe('safety-car')
    expect(pitEntry.phase?.neutralisation?.stage).toBe('pit-entry')
  })

  it('publishes the mandatory pit-lane route when ordered under B5.13.3', () => {
    const cars = createInitialRace(config).cars.slice(0, 3)
    const phase = ensureNeutralisationProcedure(
      {
        endMessage: 'Track clear.',
        endSeconds: 60,
        flag: 'sc',
        id: 'sc-pit-lane-route',
        safetyCarUsesPitLane: true,
        sector: 2,
        startMessage: 'SAFETY CAR DEPLOYED',
        startSeconds: 0,
      },
      cars,
      config.track,
    )
    const advanced = advanceNeutralisationProcedure({
      cars,
      elapsedSeconds: 5,
      phase,
      seed: config.seed,
      track: config.track,
    })

    expect(advanced.phase?.neutralisation?.kind).toBe('safety-car')
    if (advanced.phase?.neutralisation?.kind !== 'safety-car') {
      throw new Error('Safety Car route procedure was not created.')
    }
    expect(advanced.phase.neutralisation.pitLaneRouteRequired).toBe(true)
    expect(
      advanced.events.some((event) =>
        event.message.includes('ALL CARS MUST USE PIT LANE'),
      ),
    ).toBe(true)
  })
})
