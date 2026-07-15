import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot } from '../types'
import { createInitialRace } from './race'
import {
  advanceSuperClipping,
  superClippingPowerForIntensity,
  superClippingSpeedWindowFor,
} from './superClipping'
import {
  airDensityKgM3,
  integrateVehicleSpeedKph,
} from './vehicleDynamics'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'

const team = initialTeams[0]
const driver = initialDrivers.find((candidate) => candidate.teamId === team.id)!
const lowDragSetup: CarSetup = {
  brakeBiasPercent: 56.5,
  coolingPercent: 55,
  differentialPercent: 58,
  frontWing: 2,
  rearWing: 2,
  rideHeightMm: 26,
}
const standardSetup: CarSetup = {
  brakeBiasPercent: 56,
  coolingPercent: 50,
  differentialPercent: 55,
  frontWing: 6,
  rearWing: 6,
  rideHeightMm: 30,
}
const highDownforceSetup: CarSetup = {
  brakeBiasPercent: 55.5,
  coolingPercent: 66,
  differentialPercent: 48,
  frontWing: 8,
  rearWing: 9,
  rideHeightMm: 38,
}

function carWithEnergyState(
  car: CarSnapshot,
  stateOfCharge: number,
  harvestedThisLapMJ: number,
  removedThisLapMJ: number,
): CarSnapshot {
  const currentEnergyMJ =
    car.energyStore.minimumUsableEnergyMJ +
    car.energyStore.usableEnergyMJ * stateOfCharge

  return {
    ...car,
    energyDeployedThisLapMj: removedThisLapMJ,
    energyHarvestedThisLapMj: harvestedThisLapMJ,
    ersBatteryPercent: Math.round(stateOfCharge * 100),
    energyStore: {
      ...car.energyStore,
      actualHarvestedThisLapMJ: harvestedThisLapMJ,
      currentEnergyMJ,
      energyRemovedThisLapMJ: removedThisLapMJ,
      lapStartEnergyMJ:
        currentEnergyMJ - harvestedThisLapMJ + removedThisLapMJ,
      stateOfCharge,
    },
  }
}

type StraightTracePoint = {
  distanceMeters: number
  drivePowerScale: number
  electricalRecoveryPowerKw: number
  regenerativeResistancePowerKw: number
  speedKph: number
  timeSeconds: number
}

function runStraight(options: {
  clippingStartsAtMeters?: number
  durationSeconds?: number
  initialSpeedKph?: number
  intensity: number
  setup: CarSetup
  straightLengthMeters?: number
}) {
  const durationSeconds = options.durationSeconds ?? 80
  const straightLengthMeters = options.straightLengthMeters ?? Number.POSITIVE_INFINITY
  const deltaSeconds = 0.1
  let distanceMeters = 0
  let recoveredMj = 0
  let speedKph = options.initialSpeedKph ?? 300
  let timeSeconds = 0
  let rampedIntensity = 0
  const trace: StraightTracePoint[] = []

  while (
    timeSeconds < durationSeconds - 1e-9 &&
    distanceMeters < straightLengthMeters
  ) {
    const clippingActive =
      distanceMeters >= (options.clippingStartsAtMeters ?? 0)
    const targetIntensity = clippingActive ? options.intensity : 0
    const rate = targetIntensity > rampedIntensity ? 0.46 : 0.82
    rampedIntensity =
      targetIntensity > rampedIntensity
        ? Math.min(targetIntensity, rampedIntensity + rate * deltaSeconds)
        : Math.max(targetIntensity, rampedIntensity - rate * deltaSeconds)
    const power = superClippingPowerForIntensity({
      batteryPercent: 5,
      deltaSeconds,
      intensity: rampedIntensity,
      maxRechargePerLapMj: 100,
      recoveredThisLapMj: recoveredMj,
      team,
    })
    const nextSpeedKph = integrateVehicleSpeedKph({
      activeAeroMode: 'straight',
      airDensityKgM3: airDensityKgM3({ altitudeMeters: 650, temperatureC: 28 }),
      brakePercent: 0,
      currentSpeedKph: speedKph,
      deltaSeconds,
      drivePowerScale: power.drivePowerScale,
      dynamics: { gradient: 0, straightness: 1 },
      ersPowerKw: speedKph < 355 && rampedIntensity < 0.04 ? 350 : 0,
      fuelLoadKg: 8,
      gripMultiplier: 1,
      regenerativeResistancePowerKw: power.regenerativeResistancePowerKw,
      setup: options.setup,
      team,
      throttlePercent: 100,
      towDragReduction: 0.1,
    })
    distanceMeters += ((speedKph + nextSpeedKph) / 2 / 3.6) * deltaSeconds
    recoveredMj += power.electricalRecoveryPowerKw * deltaSeconds / 1000
    speedKph = nextSpeedKph
    timeSeconds += deltaSeconds

    if (Math.abs(timeSeconds - Math.round(timeSeconds)) < 0.001) {
      trace.push({
        distanceMeters,
        drivePowerScale: power.drivePowerScale,
        electricalRecoveryPowerKw: power.electricalRecoveryPowerKw,
        regenerativeResistancePowerKw: power.regenerativeResistancePowerKw,
        speedKph,
        timeSeconds,
      })
    }
  }

  return { distanceMeters, recoveredMj, speedKph, timeSeconds, trace }
}

function terminalSpeed(setup: CarSetup) {
  return runStraight({ intensity: 0, setup }).speedKph
}

describe('super clipping physical integration', () => {
  it('SC-1: gradually trades wheel power for recovery and settles near 60 km/h below a 420-class setup', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const clipped = runStraight({
      durationSeconds: 16,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
    })
    const speedLossKph = normalTopSpeed - clipped.speedKph
    const firstSecond = clipped.trace[0]

    expect(normalTopSpeed).toBeGreaterThanOrEqual(410)
    expect(normalTopSpeed).toBeLessThanOrEqual(432)
    expect(firstSecond.speedKph).toBeLessThan(normalTopSpeed)
    expect(firstSecond.speedKph).toBeGreaterThan(normalTopSpeed - 35)
    expect(speedLossKph).toBeGreaterThanOrEqual(48)
    expect(speedLossKph).toBeLessThanOrEqual(72)
    expect(clipped.trace.at(-1)!.drivePowerScale).toBeLessThan(0.76)
    expect(clipped.trace.at(-1)!.electricalRecoveryPowerKw).toBeGreaterThan(35)
    expect(clipped.recoveredMj).toBeGreaterThan(0.45)
    expect(clipped.distanceMeters).toBeLessThan(
      normalTopSpeed / 3.6 * clipped.timeSeconds,
    )
  })

  it('SC-2: preserves setup-relative terminal speeds instead of converging on one clamp', () => {
    const setups = [lowDragSetup, standardSetup, highDownforceSetup]
    const results = setups.map((setup) => {
      const normal = terminalSpeed(setup)
      const clipped = runStraight({
        durationSeconds: 18,
        initialSpeedKph: normal,
        intensity: 1,
        setup,
      }).speedKph

      return { clipped, loss: normal - clipped, normal }
    })

    expect(results[0].normal).toBeGreaterThan(results[1].normal)
    expect(results[1].normal).toBeGreaterThan(results[2].normal)
    expect(results[0].clipped).toBeGreaterThan(results[1].clipped)
    expect(results[1].clipped).toBeGreaterThan(results[2].clipped)
    expect(new Set(results.map(({ clipped }) => Math.round(clipped))).size).toBe(3)
    results.forEach(({ loss }) => {
      expect(loss).toBeGreaterThan(42)
      expect(loss).toBeLessThan(72)
    })
  })

  it('SC-3: produces monotonic power, recovery, speed, and time-loss changes by intensity', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const results = [0.3, 0.6, 1].map((intensity) =>
      runStraight({
        durationSeconds: 14,
        initialSpeedKph: normalTopSpeed,
        intensity,
        setup: lowDragSetup,
      }),
    )

    expect(results[0].speedKph).toBeGreaterThan(results[1].speedKph)
    expect(results[1].speedKph).toBeGreaterThan(results[2].speedKph)
    expect(results[0].recoveredMj).toBeLessThan(results[1].recoveredMj)
    expect(results[1].recoveredMj).toBeLessThan(results[2].recoveredMj)
    expect(results[0].distanceMeters).toBeGreaterThan(results[1].distanceMeters)
    expect(results[1].distanceMeters).toBeGreaterThan(results[2].distanceMeters)
    expect(results[0].trace.at(-1)!.drivePowerScale).toBeGreaterThan(
      results[1].trace.at(-1)!.drivePowerScale,
    )
    expect(results[1].trace.at(-1)!.drivePowerScale).toBeGreaterThan(
      results[2].trace.at(-1)!.drivePowerScale,
    )
  })

  it('SC-4: loses more time when clipping begins near the start of a long straight', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const baseline = runStraight({
      initialSpeedKph: normalTopSpeed,
      intensity: 0,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })
    const early = runStraight({
      clippingStartsAtMeters: 150,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })
    const late = runStraight({
      clippingStartsAtMeters: 1_750,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
      straightLengthMeters: 2_200,
    })

    expect(early.timeSeconds - baseline.timeSeconds).toBeGreaterThan(
      late.timeSeconds - baseline.timeSeconds,
    )
    expect(early.recoveredMj).toBeGreaterThan(late.recoveredMj)
  })

  it('SC-5: lets a deploying follower close from integrated relative speed without forcing a pass', () => {
    const normalTopSpeed = terminalSpeed(lowDragSetup)
    const leader = runStraight({
      durationSeconds: 10,
      initialSpeedKph: normalTopSpeed,
      intensity: 1,
      setup: lowDragSetup,
    })
    const follower = runStraight({
      durationSeconds: 10,
      initialSpeedKph: normalTopSpeed,
      intensity: 0,
      setup: lowDragSetup,
    })
    const initialGapMeters = 75
    const finalGapMeters =
      initialGapMeters + leader.distanceMeters - follower.distanceMeters

    expect(follower.speedKph).toBeGreaterThan(leader.speedKph)
    expect(finalGapMeters).toBeLessThan(initialGapMeters)
  })

  it('only requests clipping when energy strategy and high-speed conditions require it', () => {
    const shared = {
      battlePhase: 'single-file' as const,
      brakePercent: 0,
      currentIntensity: 0,
      deltaSeconds: 0.5,
      deployedThisLapMj: 3.4,
      driver,
      fuelLoadKg: 70,
      gapToAheadSeconds: 3,
      harvestedThisLapMj: 0.4,
      lap: 8,
      lowGripConditions: false,
      maxRechargePerLapMj: 8.5,
      phaseActive: false,
      racePaceMode: 'standard' as const,
      sessionType: 'race-distance' as const,
      straightLengthAheadMeters: 900,
      straightness: 1,
      team,
      throttlePercent: 100,
    }
    const needed = advanceSuperClipping({
      ...shared,
      batteryPercent: 7,
      speedKph: 390,
    })
    const notNeeded = advanceSuperClipping({
      ...shared,
      batteryPercent: 82,
      deployedThisLapMj: 0.3,
      speedKph: 390,
    })
    const speedWindow = superClippingSpeedWindowFor(team, standardSetup)
    const atOldFixedThreshold = advanceSuperClipping({
      ...shared,
      batteryPercent: 7,
      setup: standardSetup,
      speedKph: 280,
    })
    const belowDynamicWindow = advanceSuperClipping({
      ...shared,
      batteryPercent: 7,
      setup: standardSetup,
      speedKph: speedWindow.onsetKph - 1,
    })

    expect(needed.demandIntensity).toBeGreaterThan(0.8)
    expect(needed.intensity).toBeGreaterThan(0)
    expect(notNeeded.intensity).toBe(0)
    expect(speedWindow.onsetKph).toBeGreaterThan(280)
    expect(atOldFixedThreshold.intensity).toBe(0)
    expect(belowDynamicWindow.intensity).toBe(0)
  })

  it('releases clipping smoothly instead of switching off at 280 km/h', () => {
    const shared = {
      battlePhase: 'single-file' as const,
      batteryPercent: 7,
      brakePercent: 0,
      currentIntensity: 0.8,
      deltaSeconds: 0.1,
      deployedThisLapMj: 3.4,
      driver,
      fuelLoadKg: 70,
      gapToAheadSeconds: 3,
      harvestedThisLapMj: 0.4,
      lap: 8,
      lowGripConditions: false,
      maxRechargePerLapMj: 8.5,
      phaseActive: false,
      racePaceMode: 'standard' as const,
      sessionType: 'race-distance' as const,
      setup: standardSetup,
      straightLengthAheadMeters: 900,
      straightness: 1,
      team,
      throttlePercent: 100,
    }
    const justBelow = advanceSuperClipping({ ...shared, speedKph: 279 })
    const justAbove = advanceSuperClipping({ ...shared, speedKph: 281 })

    expect(justBelow.intensity).toBeGreaterThan(0)
    expect(justAbove.intensity).toBeGreaterThan(0)
    expect(justBelow.intensity).toBeCloseTo(justAbove.intensity, 10)
    expect(justBelow.intensity).toBeLessThan(shared.currentIntensity)
  })

  it('integrates clipping state, recovery, and gradual speed loss into live telemetry', () => {
    const track = tracks.find(
      (candidate) => candidate.id === 'las-vegas-approx',
    )!
    const straight = track.centerline
      .map((_, index) => {
        const progress = index / track.centerline.length
        return { dynamics: trackDynamicsAt(track, progress), progress }
      })
      .filter(
        ({ dynamics }) =>
          dynamics.fullThrottle &&
          dynamics.brakingSeverity < 0.02 &&
          dynamics.straightness >= 0.78 &&
          dynamics.straightLengthAheadMeters >= 150,
      )
      .sort(
        (left, right) =>
          right.dynamics.straightLengthAheadMeters -
          left.dynamics.straightLengthAheadMeters,
      )[0]
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'super-clipping-telemetry',
      teams: initialTeams,
      track,
    })
    const clippingSpeedKph = Math.ceil(
      superClippingSpeedWindowFor(team).fullEffectKph + 5,
    )
    const car = {
      ...carWithEnergyState(snapshot.cars[0], 0.07, 0.4, 3.4),
      progress: straight.progress,
      racePaceMode: 'save' as const,
      speedKph: clippingSpeedKph,
      status: 'running' as const,
    }
    const telemetry = calculateCarTelemetry({
      car,
      deltaSeconds: 0.5,
      driver,
      elapsedSeconds: 240,
      lowGripConditions: false,
      paceScale: 1.14,
      phase: null,
      raceLap: 8,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })
    const healthyTelemetry = calculateCarTelemetry({
      car: {
        ...carWithEnergyState(car, 0.82, 0.4, 0.3),
      },
      deltaSeconds: 0.5,
      driver,
      elapsedSeconds: 240,
      lowGripConditions: false,
      paceScale: 1.14,
      phase: null,
      raceLap: 8,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })

    expect(telemetry.superClippingIntensity).toBeGreaterThan(0)
    expect(telemetry.superClippingDrivePowerScale).toBeLessThan(1)
    expect(telemetry.superClippingRegenPowerKw).toBeGreaterThan(0)
    expect(telemetry.energyHarvestedThisLapMj).toBeGreaterThan(
      car.energyHarvestedThisLapMj,
    )
    expect(telemetry.speedKph).toBeLessThan(healthyTelemetry.speedKph)
    expect(telemetry.speedKph).toBeGreaterThan(car.speedKph - 30)
  })
})
