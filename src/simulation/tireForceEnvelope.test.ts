import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import {
  f1TireForceEnvelopeFor,
  tireOperatingWindowFor,
  type F1TireForceEnvelopeInput,
} from './tires'
import { trackDynamicsAt } from './trackDynamics'

const driver = initialDrivers[0]
const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
const mediumWindow = tireOperatingWindowFor('M', track.tireNomination)

function envelopeFor(
  state: Partial<F1TireForceEnvelopeInput['state']> = {},
) {
  return f1TireForceEnvelopeFor({
    compound: 'M',
    nomination: track.tireNomination,
    state: {
      carcassTemperatureC: mediumWindow.targetC,
      grainingPercent: 0,
      overheatingPercent: 0,
      surfaceTemperatureC: mediumWindow.targetC,
      thermalStressPercent: 0,
      wearPercent: 0,
      ...state,
    },
  })
}

function f1CarForForceTrace(
  tirePatch: Partial<
    Extract<CarSnapshot['runtimeSystems'], { kind: 'f1' }>['tires']
  >,
) {
  const snapshot = createInitialRace({
    drivers: [driver],
    seed: 'f1-tire-force-envelope',
    teams: [team],
    track,
  })
  const initial = snapshot.cars[0]

  if (initial.runtimeSystems.kind !== 'f1') {
    throw new Error('Expected an F1 Pirelli runtime fixture.')
  }

  const straightProgress = Array.from(
    { length: track.centerline.length },
    (_, index) => index / track.centerline.length,
  ).find((progress) =>
    trackDynamicsAt(track, progress, categoryPhysicsFor('f1-custom')).fullThrottle,
  )

  return {
    ...initial,
    gapToAhead: 10,
    pitPhase: 'none' as const,
    progress: straightProgress ?? 0,
    speedKph: 28,
    status: 'running' as const,
    timedRunPhase: null,
    totalDistance: straightProgress ?? 0,
    runtimeSystems: {
      ...initial.runtimeSystems,
      tires: {
        ...initial.runtimeSystems.tires,
        tireCarcassTemperatureC: mediumWindow.targetC,
        tireGrainingPercent: 0,
        tireOverheatingPercent: 0,
        tirePerformanceState: 'optimal' as const,
        tireTemperatureC: mediumWindow.targetC,
        tireThermalStressPercent: 0,
        tireWearPercent: 0,
        ...tirePatch,
      },
    },
  }
}

function acceleratedSpeedFor(
  tirePatch: Parameters<typeof f1CarForForceTrace>[0],
) {
  let car: CarSnapshot = f1CarForForceTrace(tirePatch)

  for (let tick = 0; tick < 4; tick += 1) {
    const telemetry = calculateCarTelemetry({
      car,
      categoryPhysics: categoryPhysicsFor('f1-custom'),
      deltaSeconds: 0.25,
      driver,
      elapsedSeconds: tick * 0.25,
      lowGripConditions: false,
      phase: null,
      raceLap: 2,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })

    car = { ...car, ...telemetry }
  }

  return car.speedKph
}

describe('F1 live tyre force envelope', () => {
  it('is deterministic, neutral in the operating window, and monotonic outside it', () => {
    const window = envelopeFor()
    const mildlyCold = envelopeFor({
      surfaceTemperatureC: mediumWindow.lowerC - 4,
    })
    const deeplyCold = envelopeFor({
      surfaceTemperatureC: mediumWindow.lowerC - 28,
    })
    const mildlyHot = envelopeFor({
      surfaceTemperatureC: mediumWindow.upperC + 4,
    })
    const deeplyHot = envelopeFor({
      surfaceTemperatureC: mediumWindow.upperC + 28,
    })
    const lightlyWorn = envelopeFor({ wearPercent: 16 })
    const worn = envelopeFor({ wearPercent: 68 })
    const criticallyWorn = envelopeFor({ wearPercent: 100 })
    const grained = envelopeFor({ grainingPercent: 34 })
    const heavilyGrained = envelopeFor({ grainingPercent: 100 })
    const overheated = envelopeFor({ overheatingPercent: 38 })

    expect(window).toEqual({
      availability: 'simulator-policy',
      gripMultiplier: 1,
      thermalState: 'operating-window',
    })
    expect(envelopeFor()).toEqual(window)
    expect(mildlyCold.thermalState).toBe('cold')
    expect(deeplyCold.gripMultiplier).toBeLessThan(mildlyCold.gripMultiplier)
    expect(mildlyCold.gripMultiplier).toBeLessThan(window.gripMultiplier)
    expect(mildlyHot.thermalState).toBe('hot')
    expect(deeplyHot.gripMultiplier).toBeLessThan(mildlyHot.gripMultiplier)
    expect(mildlyHot.gripMultiplier).toBeLessThan(window.gripMultiplier)
    expect(criticallyWorn.gripMultiplier).toBeLessThan(worn.gripMultiplier)
    expect(worn.gripMultiplier).toBeLessThan(lightlyWorn.gripMultiplier)
    expect(lightlyWorn.gripMultiplier).toBeLessThan(window.gripMultiplier)
    expect(worn.gripMultiplier).toBeLessThan(window.gripMultiplier)
    expect(heavilyGrained.gripMultiplier).toBeLessThan(
      grained.gripMultiplier,
    )
    expect(grained.gripMultiplier).toBeLessThan(window.gripMultiplier)
    expect(overheated.gripMultiplier).toBeLessThan(window.gripMultiplier)
  })

  it('feeds the F1 tyre state into live traction before longitudinal integration', () => {
    const healthySpeedKph = acceleratedSpeedFor({})
    const wornSpeedKph = acceleratedSpeedFor({
      tireThermalStressPercent: 16,
      tireWearPercent: 92,
    })
    const grainedSpeedKph = acceleratedSpeedFor({
      tireGrainingPercent: 86,
    })

    expect(wornSpeedKph).toBeLessThan(healthySpeedKph)
    expect(grainedSpeedKph).toBeLessThan(healthySpeedKph)
  })
})
