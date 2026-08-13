import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { createInitialRace } from './race'
import { automaticRacePaceModeFor } from './racePace'

const config = {
  drivers: initialDrivers,
  seed: 'pursuit-mode',
  teams: initialTeams,
  track: tracks[0],
}
const baseCar = {
  ...createInitialRace(config).cars[4],
  damage: 0,
  gapToAhead: 2,
  position: 5,
  status: 'running' as const,
  totalDistance: 18.4,
}

function mode(
  overrides: Partial<Omit<typeof baseCar, 'runtimeSystems'>> & {
    ersBatteryPercent?: number
    tireOverheatingPercent?: number
    tireWearPercent?: number
  } = {},
  optionOverrides: Partial<
    Parameters<typeof automaticRacePaceModeFor>[0]
  > = {},
) {
  const {
    ersBatteryPercent,
    tireOverheatingPercent,
    tireWearPercent,
    ...carOverrides
  } = overrides
  const runtimeSystems =
    baseCar.runtimeSystems.kind === 'f1'
      ? {
          ...baseCar.runtimeSystems,
          ersBatteryPercent:
            ersBatteryPercent ?? baseCar.runtimeSystems.ersBatteryPercent,
          tires: {
            ...baseCar.runtimeSystems.tires,
            tireOverheatingPercent:
              tireOverheatingPercent ??
              baseCar.runtimeSystems.tires.tireOverheatingPercent,
            tireWearPercent:
              tireWearPercent ?? baseCar.runtimeSystems.tires.tireWearPercent,
          },
        }
      : baseCar.runtimeSystems

  return automaticRacePaceModeFor({
    car: { ...baseCar, ...carOverrides, runtimeSystems },
    gapBehindSeconds: 2,
    isRaceDistance: true,
    phaseActive: false,
    pursuitSkill: 0.9,
    raceLaps: 58,
    seed: config.seed,
    ...optionOverrides,
  })
}

describe('automatic pursuit pace', () => {
  it('pushes with healthy tires and SOC while closing on the car ahead', () => {
    expect(mode()).toBe('push')
    expect(mode({ gapToAhead: 0.8 })).toBe('push')
  })

  it('recovers instead of forcing a push with low SOC or distressed tires', () => {
    expect(mode({ ersBatteryPercent: 20 })).toBe('save')
    expect(mode({ tireOverheatingPercent: 72 })).toBe('save')
    expect(mode({ tireWearPercent: 92 })).toBe('save')
  })

  it('does not waste a full attack when the next car is out of reach', () => {
    expect(mode({ gapToAhead: 8 })).toBe('standard')
  })

  it('saves under neutralisation and defends a threatened lead', () => {
    expect(mode({}, { phaseActive: true })).toBe('save')
    expect(
      mode(
        { position: 1 },
        { gapBehindSeconds: 0.7 },
      ),
    ).toBe('defend')
  })

  it('uses remaining energy for a reachable final-lap attack', () => {
    expect(
      mode({
        ersBatteryPercent: 22,
        gapToAhead: 4.5,
        totalDistance: 57.2,
      }),
    ).toBe('push')
  })

  it('saves fuel before spending the required finish reserve', () => {
    expect(mode({}, { fuelMarginKg: 0.8 })).toBe('save')
    expect(mode({}, { fuelMarginKg: 2.2 })).toBe('push')
  })
})
