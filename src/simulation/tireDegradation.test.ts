import { describe, expect, it } from 'vitest'
import type { DryCompoundFamily, RacePaceMode, TireCompound, TireNomination } from '../types'
import {
  advanceTireDynamicState,
  effectiveCliffLaps,
  tireConditionFor,
  tireDeltaSeconds,
  tireOperatingWindowFor,
  tireThermalWearForLap,
  tireWearPercentPerLap,
  type TireDynamicState,
} from './tires'

const cases: [TireCompound, DryCompoundFamily | null, number, number][] = [
  ['H', 'C1', 0.035, 40], ['H', 'C2', 0.05, 32], ['M', 'C3', 0.07, 25],
  ['S', 'C4', 0.095, 18], ['S', 'C5', 0.125, 13],
  ['I', null, 0.065, 26], ['W', null, 0.045, 34],
]

function nominationFor(compound: TireCompound, family: DryCompoundFamily | null): TireNomination {
  return {
    H: 'C2', M: 'C3', S: 'C4', ...(family ? { [compound]: family } : {}),
    source: 'pirelli', sourceUrl: 'https://press.pirelli.com/',
  }
}

// 90-second representative laps split into 180 half-second integration steps.
// These are controlled SIM acceptance targets, not real-world tyre telemetry.
function stint(compound: TireCompound, family: DryCompoundFamily | null, options: {
  laps?: number; paceMode?: RacePaceMode; heatC?: number; waterMm?: number
  current?: TireDynamicState
} = {}) {
  const nomination = nominationFor(compound, family)
  const targetC = tireOperatingWindowFor(compound, nomination).targetC
  let state: TireDynamicState = options.current ?? {
    carcassTemperatureC: targetC, surfaceTemperatureC: targetC,
    grainingPercent: 0, overheatingPercent: 0, thermalStressPercent: 0,
    wearPercent: 0, performanceState: 'optimal',
  }
  const waterMm = options.waterMm ?? (compound === 'W' ? 4 : compound === 'I' ? 1.2 : 0)
  for (let tick = 0; tick < (options.laps ?? 10) * 180; tick += 1) {
    state = advanceTireDynamicState({
      baseWearPercentPerLap: tireWearPercentPerLap(compound, 0.8, nomination),
      compound, nomination, current: state, deltaLaps: 1 / 180, deltaSeconds: 0.5,
      brakePercent: 18, throttlePercent: 72, curvature: 0.32,
      fuelLoadMultiplier: 1, dryingLine: 0, rainIntensityMmH: 0,
      surfaceTemperatureC: targetC + (options.heatC ?? 0), surfaceWaterMm: waterMm,
      trackTemperatureC: 35, weather: compound === 'W' ? 'heavy-rain' : compound === 'I' ? 'light-rain' : 'clear',
      paceMode: options.paceMode ?? 'standard',
    })
  }
  return state
}

describe('compound degradation calibration', () => {
  it.each(cases)('%s / %s has a bounded stint, pace slope and life estimate', (compound, family, slope, cliff) => {
    const nomination = nominationFor(compound, family)
    const delta = (age: number) => tireDeltaSeconds(compound, age, 0.8, 'clear', 1, undefined, 0, nomination)
    expect(delta(6) - delta(5)).toBeCloseTo(slope * 0.95, 8)
    expect(effectiveCliffLaps(compound, 0.8, nomination)).toBeCloseTo(cliff * 1.01, 8)
    expect(delta(cliff + 5) - delta(cliff + 4)).toBeGreaterThan(slope * 2)
    const state = stint(compound, family)
    expect(state.wearPercent).toBeGreaterThan(15)
    expect(state.wearPercent).toBeLessThan(65)
    expect(state.thermalStressPercent).toBeLessThan(0.01)
    expect(tireConditionFor(compound, 10, 0.8, state.surfaceTemperatureC, state.wearPercent, nomination).lifeRemainingPercent)
      .toBe(Math.round(100 - state.wearPercent))
  })

  it('makes harder families last longer with slower degradation', () => {
    const states = cases.slice(0, 5).map(([compound, family]) => stint(compound, family))
    for (let i = 1; i < states.length; i += 1) {
      expect(states[i].wearPercent).toBeGreaterThan(states[i - 1].wearPercent)
    }
  })

  it.each(['S', 'M', 'H'] as const)('uses the same default and explicit allocation for %s', (compound) => {
    const nomination = nominationFor(compound, null)
    expect(tireWearPercentPerLap(compound, 0.8)).toBe(tireWearPercentPerLap(compound, 0.8, nomination))
    expect(tireDeltaSeconds(compound, 10, 0.8)).toBe(tireDeltaSeconds(compound, 10, 0.8, 'clear', 1, undefined, 0, nomination))
  })

  it.each(cases)('%s / %s rewards saving and penalizes sustained heat', (compound, family) => {
    const save = stint(compound, family, { paceMode: 'save' })
    const standard = stint(compound, family)
    const push = stint(compound, family, { paceMode: 'push' })
    const hot = stint(compound, family, { heatC: 30 })
    expect(save.wearPercent).toBeLessThan(standard.wearPercent)
    expect(push.wearPercent).toBeGreaterThan(standard.wearPercent)
    expect(hot.wearPercent).toBeGreaterThan(push.wearPercent)
    expect(hot.thermalStressPercent).toBeGreaterThan(0.5)
    const cooled = stint(compound, family, { laps: 5, current: hot })
    expect(cooled.overheatingPercent).toBeLessThan(hot.overheatingPercent)
    expect(cooled.thermalStressPercent).toBeGreaterThanOrEqual(hot.thermalStressPercent)
    expect(cooled.wearPercent).toBeGreaterThanOrEqual(hot.wearPercent)
  })

  it.each(['I', 'W'] as const)('wears %s faster when cooling water disappears', (compound) => {
    expect(stint(compound, null, { waterMm: 0, laps: 3 }).wearPercent)
      .toBeGreaterThan(stint(compound, null, { laps: 3 }).wearPercent * 2)
  })

  it('retains carcass heat damage after the surface has cooled', () => {
    const common = {
      compound: 'M' as const, tireTemperatureC: 98, trackTemperatureC: 35,
      brakePercent: 18, throttlePercent: 72, curvature: 0.32,
      paceMode: 'standard' as const, weather: 'clear' as const,
    }
    expect(tireThermalWearForLap({ ...common, tireCarcassTemperatureC: 135 }).permanentStressPercentPerLap)
      .toBeGreaterThan(tireThermalWearForLap(common).permanentStressPercentPerLap)
  })

  it('does not reduce measured life just because a saved tyre is old', () => {
    expect(tireConditionFor('S', 24, 0.8, 96, 40, undefined, 5).lifeRemainingPercent).toBe(55)
    expect(tireConditionFor('S', 24, 0.8, 96).lifeRemainingPercent).toBe(8)
    expect(tireConditionFor('M', 0, 0.8, 98, 0).lifeRemainingPercent).toBe(100)
    expect(tireConditionFor('M', 30, 0.8, 98, 95, undefined, 12).lifeRemainingPercent).toBe(0)
  })

  it('weights observed degradation consistently and rejects non-finite samples', () => {
    const base = tireWearPercentPerLap('M', 0.8)
    for (const rate of [Number.NaN, Number.POSITIVE_INFINITY, 0.3]) {
      expect(tireWearPercentPerLap('M', 0.8, undefined, { degradationPerLapSeconds: rate, sampleCount: 0 })).toBe(base)
    }
    const observed = { degradationPerLapSeconds: 0.14, sampleCount: 40 }
    const wearRatio = tireWearPercentPerLap('M', 0.8, undefined, observed) / base
    const delta = (age: number, samples?: typeof observed) => tireDeltaSeconds('M', age, 0.8, 'clear', 1, undefined, 0, undefined, samples)
    expect((delta(6, observed) - delta(5, observed)) / (delta(6) - delta(5))).toBeCloseTo(wearRatio, 8)
  })
})
