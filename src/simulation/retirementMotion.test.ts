import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { createInitialRace } from './race'
import { advanceRetiredCarMotion } from './retirementMotion'

const retiredCar = (reason: string): CarSnapshot => ({
  ...createInitialRace({
    drivers: initialDrivers,
    seed: `retirement-motion:${reason}`,
    teams: initialTeams,
    track: tracks[0],
  }).cars[0],
  retiredAtSeconds: 100,
  retiredReason: reason,
  speedKph: 320,
  status: 'retired' as const,
  throttlePercent: 100,
})

describe('retired car motion', () => {
  it('decelerates an impact retirement before stopping instead of freezing telemetry', () => {
    const initial = retiredCar('terminal-crash')
    let car: CarSnapshot = initial

    for (let step = 1; step <= 60; step += 1) {
      car = advanceRetiredCarMotion(car, {
        deltaSeconds: 0.05,
        elapsedSeconds: 100 + step * 0.05,
        trackLengthKm: tracks[0].lengthKm,
      })
    }

    expect(car.speedKph).toBe(0)
    expect(car.throttlePercent).toBe(0)
    expect(car.rpm).toBe(0)
    expect(car.energyStore.actualDeploymentPowerKw).toBe(0)
    expect(car.totalDistance).toBeGreaterThan(initial.totalDistance)
    expect(car.totalDistance - initial.totalDistance).toBeLessThan(0.025)
  })

  it('lets a mechanical retirement coast farther than an impact retirement', () => {
    const impact = advanceRetiredCarMotion(retiredCar('contact'), {
      deltaSeconds: 0.5,
      elapsedSeconds: 100.5,
      trackLengthKm: tracks[0].lengthKm,
    })
    const mechanical = advanceRetiredCarMotion(retiredCar('power unit failure'), {
      deltaSeconds: 0.5,
      elapsedSeconds: 100.5,
      trackLengthKm: tracks[0].lengthKm,
    })

    expect(mechanical.speedKph).toBeGreaterThan(impact.speedKph)
    expect(mechanical.brakePercent).toBeLessThan(impact.brakePercent)
  })

  it('preserves CU-K lap ledgers while zeroing retired-car power flow', () => {
    const base = retiredCar('power unit failure')
    const rechargeLimit = base.energyStore.rechargeRule.limit
    const initial: CarSnapshot = {
      ...base,
      energyDeployedThisLapMj: 99,
      energyHarvestedThisLapMj: 99,
      ersBatteryPercent: 0,
      energyStore: {
        ...base.energyStore,
        actualDeploymentDcPowerKw: 300,
        actualDeploymentPowerKw: 275,
        actualRecoveryPowerKw: 40,
        chargeDcPowerKw: 35,
        deployedAtCuKBusThisLapMJ: 1.1,
        dischargeDcPowerKw: 300,
        rechargedAtCuKBusThisLapMJ: 2.2,
        rechargeRule: {
          ...base.energyStore.rechargeRule,
          remainingMJ:
            rechargeLimit.kind === 'finite'
              ? rechargeLimit.maxCuKBusRechargeMj - 2.2
              : null,
          usedMJ: 2.2,
        },
        requestedDeploymentDcPowerKw: 310,
        requestedRecoveryPowerKw: 45,
        storedChargePowerKw: 32,
        storedDischargePowerKw: 315,
      },
    }
    const retired = advanceRetiredCarMotion(initial, {
      deltaSeconds: 0.5,
      elapsedSeconds: 100.5,
      trackLengthKm: tracks[0].lengthKm,
    })

    expect(retired.energyStore).toMatchObject({
      actualDeploymentDcPowerKw: 0,
      actualDeploymentPowerKw: 0,
      actualRecoveryPowerKw: 0,
      chargeDcPowerKw: 0,
      deployedAtCuKBusThisLapMJ: 1.1,
      dischargeDcPowerKw: 0,
      operatingMode: 'inactive',
      rechargedAtCuKBusThisLapMJ: 2.2,
      requestedDeploymentDcPowerKw: 0,
      requestedRecoveryPowerKw: 0,
      storedChargePowerKw: 0,
      storedDischargePowerKw: 0,
    })
    expect(retired.energyHarvestedThisLapMj).toBe(2.2)
    expect(retired.energyDeployedThisLapMj).toBe(1.1)
    expect(retired.ersBatteryPercent).toBe(
      Math.round(retired.energyStore.stateOfCharge * 100),
    )
  })
})
