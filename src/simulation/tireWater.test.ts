import { describe, expect, it } from 'vitest'
import { initialTeams } from '../data/grid2026'
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
import { trackDynamicsAt } from './trackDynamics'
import { legalStartCompoundForConditions } from './weekendTires'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  airDensityKgM3,
  liveCorneringSpeedLimitKph,
} from './vehicleDynamics'
import { gripForSurfaceWater } from './trackWater'

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

  it('makes the live corner limit progressively slower as track water rises', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const team = initialTeams[0]
    const physics = categoryPhysicsFor('f1-custom')
    const dynamics = track.centerline
      .map((_, index) =>
        trackDynamicsAt(track, index / track.centerline.length, physics),
      )
      .sort(
        (left, right) =>
          left.effectiveCornerRadiusM - right.effectiveCornerRadiusM,
      )[0]
    const speedAt = (surfaceWaterMm: number) =>
      liveCorneringSpeedLimitKph({
        airDensityKgM3: airDensityKgM3({
          altitudeMeters: track.altitudeMeters,
          temperatureC: 25,
        }),
        bankingDegrees: dynamics.bankingDegrees,
        categoryPhysics: physics,
        evaluationSpeedKph: dynamics.referenceSpeedKph,
        fuelLoadKg: 30,
        gripMultiplier: gripForSurfaceWater(1, surfaceWaterMm, 0),
        radiusMeters: dynamics.effectiveCornerRadiusM,
        team,
      })
    const drySpeed = speedAt(0.4)
    const intermediateSpeed = speedAt(1.8)
    const wetSpeed = speedAt(4)

    expect(drySpeed).toBeGreaterThan(intermediateSpeed)
    expect(intermediateSpeed).toBeGreaterThan(wetSpeed)
  })
})
