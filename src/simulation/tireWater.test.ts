import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { TireCompound } from '../types'
import {
  advanceTireDynamicState,
  chooseCompound,
  effectiveLineWaterMm,
  preferredTireCategoryFor,
  tireTrackPenaltySeconds,
  type TireTrackCondition,
} from './tires'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'
import { createInitialRace } from './race'
import { legalStartCompoundForConditions } from './weekendTires'

function condition(surfaceWaterMm: number): TireTrackCondition {
  return {
    dryingLine: 0,
    rainIntensityMmH: 0,
    surfaceWaterMm,
  }
}

describe('surface-water tire crossover', () => {
  it('uses the requested slick, intermediate, and wet dominance ranges', () => {
    expect(preferredTireCategoryFor(condition(0.8))).toBe('M')
    expect(preferredTireCategoryFor(condition(0.81))).toBe('I')
    expect(preferredTireCategoryFor(condition(3.4))).toBe('I')
    expect(preferredTireCategoryFor(condition(3.5))).toBe('W')

    expect(tireTrackPenaltySeconds('M', condition(0.8))).toBeLessThan(
      tireTrackPenaltySeconds('I', condition(0.8)),
    )
    expect(tireTrackPenaltySeconds('I', condition(0.81))).toBeLessThan(
      tireTrackPenaltySeconds('M', condition(0.81)),
    )
    expect(tireTrackPenaltySeconds('I', condition(3.4))).toBeLessThan(
      tireTrackPenaltySeconds('W', condition(3.4)),
    )
    expect(tireTrackPenaltySeconds('W', condition(3.5))).toBeLessThan(
      tireTrackPenaltySeconds('I', condition(3.5)),
    )
  })

  it('keeps the best available tire slower as standing water increases', () => {
    const waterLevelsMm = [0, 0.4, 0.8, 0.81, 1.8, 3.4, 3.5, 4.5]
    let previousBestPenalty = Number.NEGATIVE_INFINITY

    waterLevelsMm.forEach((waterMm) => {
      const trackCondition = condition(waterMm)
      const preferred = preferredTireCategoryFor(trackCondition)
      const bestPenalty = tireTrackPenaltySeconds(preferred, trackCondition)

      expect(effectiveLineWaterMm(trackCondition)).toBe(waterMm)
      expect(bestPenalty).toBeGreaterThan(previousBestPenalty)
      previousBestPenalty = bestPenalty
    })
  })

  it('makes measured water authoritative for strategy and starting tires', () => {
    const shallowWater = condition(0.4)
    const deepWater = condition(4)

    expect(
      chooseCompound(20, null, 0.5, 'heavy-rain', 0.62, shallowWater),
    ).toBe('M')
    expect(
      chooseCompound(20, null, 0.5, 'clear', 1, deepWater),
    ).toBe('W')
    expect(
      legalStartCompoundForConditions(
        'S',
        'heavy-rain',
        0.62,
        false,
        shallowWater,
      ),
    ).toBe('S')
    expect(
      legalStartCompoundForConditions('S', 'clear', 1, false, deepWater),
    ).toBe('W')
    expect(
      legalStartCompoundForConditions(
        'S',
        'heavy-rain',
        0.62,
        true,
        shallowWater,
      ),
    ).toBe('W')
  })

  it('accelerates thermal degradation when a deep-water tire lacks cooling', () => {
    const runWetTire = (compound: TireCompound, surfaceWaterMm: number) =>
      advanceTireDynamicState({
        baseWearPercentPerLap: 2,
        brakePercent: 18,
        compound,
        current: {
          carcassTemperatureC: 72,
          grainingPercent: 0,
          overheatingPercent: 0,
          performanceState: 'optimal',
          surfaceTemperatureC: 72,
          thermalStressPercent: 0,
          wearPercent: 0,
        },
        curvature: 0.32,
        deltaLaps: 1,
        deltaSeconds: 20,
        dryingLine: 0,
        fuelLoadMultiplier: 1,
        paceMode: 'standard',
        rainIntensityMmH: 0,
        surfaceTemperatureC: 72,
        surfaceWaterMm,
        throttlePercent: 72,
        trackTemperatureC: 30,
        weather: 'heavy-rain',
      })
    const underCooledWet = runWetTire('W', 0.5)
    const cooledWet = runWetTire('W', 4)
    const underCooledIntermediate = runWetTire('I', 0.2)
    const cooledIntermediate = runWetTire('I', 1.2)

    expect(underCooledWet.surfaceTemperatureC).toBeGreaterThan(
      cooledWet.surfaceTemperatureC,
    )
    expect(underCooledWet.overheatingPercent).toBeGreaterThan(
      cooledWet.overheatingPercent,
    )
    expect(underCooledWet.wearPercent).toBeGreaterThan(cooledWet.wearPercent)
    expect(underCooledWet.thermalStressPercent).toBeGreaterThan(
      cooledWet.thermalStressPercent,
    )
    expect(underCooledIntermediate.overheatingPercent).toBeGreaterThan(
      cooledIntermediate.overheatingPercent,
    )
  })

  it('makes the actual corner speed progressively slower as track water rises', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const driver = initialDrivers[0]
    const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
    const progress = track.centerline
      .map((_, index) => index / track.centerline.length)
      .filter((candidate) => trackDynamicsAt(track, candidate).curvature > 0.2)[0]
    const initial = createInitialRace({
      drivers: [driver],
      seed: 'water-speed-progression',
      teams: [team],
      track,
    }).cars[0]
    const speedAt = (compound: TireCompound, surfaceWaterMm: number) => {
      let car = {
        ...initial,
        gapToAhead: 10,
        progress,
        speedKph: 260,
        tire: compound,
        totalDistance: 1 + progress,
      }

      for (let step = 0; step < 30; step += 1) {
        const telemetry = calculateCarTelemetry({
          car,
          deltaSeconds: 0.1,
          driver,
          elapsedSeconds: step * 0.1,
          lowGripConditions: surfaceWaterMm > 0.8,
          phase: null,
          raceLap: 2,
          team,
          track,
          trackCondition: condition(surfaceWaterMm),
          trackGrip: 1,
          weather: surfaceWaterMm >= 3.5 ? 'heavy-rain' : surfaceWaterMm > 0.8 ? 'light-rain' : 'clear',
        })

        car = { ...car, ...telemetry }
      }

      return car.speedKph
    }
    const drySpeed = speedAt('M', 0.4)
    const intermediateSpeed = speedAt('I', 1.8)
    const wetSpeed = speedAt('W', 4)

    expect(drySpeed).toBeGreaterThan(intermediateSpeed)
    expect(intermediateSpeed).toBeGreaterThan(wetSpeed)
  })
})
