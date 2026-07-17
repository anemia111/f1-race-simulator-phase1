import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import type { EnergyStoreState } from '../types'
import {
  advanceEnergyStore,
  type AdvanceEnergyStoreOptions,
  createInitialEnergyStore,
  energyBalanceErrorMJ,
  energyDeploymentRequestFor,
  energySystemParametersFor,
  startNextEnergyLap,
} from './energySystem'
import { FIA_2026_REGULATION_PROFILE } from './regulations'
import { advanceSuperClipping } from './superClipping'

const team = initialTeams.find((candidate) => candidate.id === 'ferrari')!
const driver = initialDrivers.find((candidate) => candidate.code === 'LEC')!
const maximumPowerKw = FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw
const maximumRechargeMJ =
  FIA_2026_REGULATION_PROFILE.energy.publicRechargeLimitMj

const defaultStep: Omit<AdvanceEnergyStoreOptions, 'state'> = {
  ambientTemperatureC: 25,
  brakePercent: 0,
  deltaSeconds: 1,
  deploymentPowerLimitKw: maximumPowerKw,
  deploymentRequest: 0,
  driverErsManagement: driver.skills.ersManagement,
  driverWetSkill: driver.skills.wetSkill,
  gripMultiplier: 1,
  maxRechargePerLapMj: maximumRechargeMJ,
  speedKph: 300,
  surfaceWaterMm: 0,
  team,
  throttlePercent: 100,
  tire: 'M',
  vehicleMassKg: 840,
}

function step(
  state: EnergyStoreState,
  overrides: Partial<Omit<AdvanceEnergyStoreOptions, 'state'>> = {},
) {
  return advanceEnergyStore({ ...defaultStep, ...overrides, state })
}

function deploymentRequest(
  state: EnergyStoreState,
  overrides: Partial<Parameters<typeof energyDeploymentRequestFor>[0]> = {},
) {
  return energyDeploymentRequestFor({
    battlePhase: 'single-file',
    driverErsManagement: driver.skills.ersManagement,
    isFinalLap: false,
    lapProgress: 0.2,
    overtakeActive: false,
    paceMode: 'standard',
    phaseActive: false,
    speedKph: 260,
    state,
    straightLengthAheadMeters: 900,
    straightness: 0.96,
    team,
    throttlePercent: 100,
    timedRunPhase: null,
    ...overrides,
  })
}

describe('physical Energy Store integration', () => {
  it('requests more electrical deployment in push mode than standard mode', () => {
    const state = createInitialEnergyStore(team, 0.62)
    const standard = deploymentRequest(state, {
      paceMode: 'standard',
      straightLengthAheadMeters: 420,
      straightness: 0.68,
    })
    const push = deploymentRequest(state, {
      paceMode: 'push',
      straightLengthAheadMeters: 420,
      straightness: 0.68,
    })

    expect(push).toBeGreaterThan(standard)
  })

  it('starts fully charged and spends stored energy through ERS deployment', () => {
    const initial = createInitialEnergyStore(team)
    const deployed = step(initial, {
      deltaSeconds: 1,
      deploymentRequest: 1,
    }).state

    expect(initial.stateOfCharge).toBe(1)
    expect(initial.currentEnergyMJ).toBe(initial.maximumUsableEnergyMJ)
    expect(deployed.actualDeploymentPowerKw).toBeGreaterThan(0)
    expect(deployed.currentEnergyMJ).toBeLessThan(initial.currentEnergyMJ)
    expect(deployed.stateOfCharge).toBeLessThan(1)
  })

  it('ENERGY-1: conserves stored energy through repeated recovery and deployment', () => {
    const initial = createInitialEnergyStore(team, 0.64)
    let state = initial

    for (let cycle = 0; cycle < 10; cycle += 1) {
      state = step(state, {
        brakePercent: 82,
        deltaSeconds: 0.75,
        deploymentRequest: 0,
        speedKph: 330,
        throttlePercent: 0,
      }).state
      state = step(state, {
        brakePercent: 0,
        deltaSeconds: 0.75,
        deploymentRequest: 0.72,
        speedKph: 285,
        throttlePercent: 100,
      }).state
    }

    expect(state.actualHarvestedThisLapMJ).toBeGreaterThan(0)
    expect(state.energyRemovedThisLapMJ).toBeGreaterThan(0)
    expect(state.conversionLossThisLapMJ).toBeGreaterThan(0)
    expect(state.currentEnergyMJ).toBeCloseTo(
      initial.currentEnergyMJ +
        state.actualHarvestedThisLapMJ -
        state.energyRemovedThisLapMJ,
      8,
    )
    expect(Math.abs(energyBalanceErrorMJ(state))).toBeLessThan(1e-8)

    const oneCall = step(createInitialEnergyStore(team, 0.7), {
      deltaSeconds: 2,
      deploymentRequest: 0.65,
    }).state
    let sliced = createInitialEnergyStore(team, 0.7)
    for (let index = 0; index < 40; index += 1) {
      sliced = step(sliced, {
        deltaSeconds: 0.05,
        deploymentRequest: 0.65,
      }).state
    }
    expect(
      Math.abs(oneCall.currentEnergyMJ - sliced.currentEnergyMJ),
    ).toBeLessThan(0.015)
  })

  it('ENERGY-2: high-speed heavy braking has more recovery potential than a low-speed stop', () => {
    const initial = createInitialEnergyStore(team, 0.45)
    const highSpeed = step(initial, {
      brakePercent: 92,
      deltaSeconds: 1,
      speedKph: 418,
      throttlePercent: 0,
    }).state
    const lowSpeed = step(initial, {
      brakePercent: 35,
      deltaSeconds: 0.45,
      speedKph: 150,
      throttlePercent: 0,
    }).state

    expect(highSpeed.harvestPotentialThisLapMJ).toBeGreaterThan(
      lowSpeed.harvestPotentialThisLapMJ,
    )
    expect(highSpeed.actualHarvestedThisLapMJ).toBeGreaterThan(
      lowSpeed.actualHarvestedThisLapMJ,
    )
  })

  it('ENERGY-3: high SOC reduces charge acceptance and shifts braking to friction', () => {
    const middle = step(createInitialEnergyStore(team, 0.5), {
      brakePercent: 90,
      speedKph: 350,
      throttlePercent: 0,
    }).state
    const high = step(createInitialEnergyStore(team, 0.97), {
      brakePercent: 90,
      speedKph: 350,
      throttlePercent: 0,
    }).state

    expect(high.harvestPotentialThisLapMJ).toBeCloseTo(
      middle.harvestPotentialThisLapMJ,
      6,
    )
    expect(high.actualHarvestedThisLapMJ).toBeLessThan(
      middle.actualHarvestedThisLapMJ,
    )
    expect(high.batteryAcceptancePowerKw).toBeLessThan(
      middle.batteryAcceptancePowerKw,
    )
    expect(high.frictionBrakePowerKw).toBeGreaterThan(
      middle.frictionBrakePowerKw,
    )
  })

  it('ENERGY-4: continuously derates deployment near the minimum SOC reserve', () => {
    const outputAt = (soc: number) =>
      step(createInitialEnergyStore(team, soc), {
        deltaSeconds: 0.25,
        deploymentRequest: 1,
      }).state.actualDeploymentPowerKw
    const high = outputAt(0.8)
    const low = outputAt(0.15)
    const critical = outputAt(0.025)

    expect(high).toBeGreaterThan(low)
    expect(low).toBeGreaterThan(critical)
    expect(critical).toBeLessThan(high * 0.05)
  })

  it('ENERGY-5: heats under repeated electrical load and cools gradually', () => {
    let state = createInitialEnergyStore(team, 0.62)
    const initialTemperatureC = state.batteryTemperatureC

    for (let cycle = 0; cycle < 120; cycle += 1) {
      state = step(state, {
        brakePercent: 88,
        deltaSeconds: 0.5,
        speedKph: 340,
        throttlePercent: 0,
      }).state
      state = step(state, {
        deltaSeconds: 0.5,
        deploymentRequest: 0.72,
        speedKph: 310,
      }).state
    }
    const hotTemperatureC = state.batteryTemperatureC
    const beforeOneCoolingSecondC = state.batteryTemperatureC
    state = step(state, {
      ambientTemperatureC: 18,
      deltaSeconds: 1,
      deploymentRequest: 0,
      speedKph: 230,
      throttlePercent: 25,
    }).state

    expect(hotTemperatureC).toBeGreaterThan(initialTemperatureC)
    expect(state.batteryTemperatureC).toBeLessThan(beforeOneCoolingSecondC)
    expect(beforeOneCoolingSecondC - state.batteryTemperatureC).toBeLessThan(1)
  })

  it('ENERGY-6: thermally derates a hot battery, motor-generator, and inverter', () => {
    const normal = step(createInitialEnergyStore(team, 0.8), {
      deltaSeconds: 0.25,
      deploymentRequest: 1,
    }).state
    const hotInitial = {
      ...createInitialEnergyStore(team, 0.8),
      batteryTemperatureC: 84,
      inverterTemperatureC: 142,
      motorGeneratorTemperatureC: 176,
    }
    const hot = step(hotInitial, {
      deltaSeconds: 0.25,
      deploymentRequest: 1,
    }).state

    expect(hot.thermalDerating).toBeLessThan(normal.thermalDerating)
    expect(hot.actualDeploymentPowerKw).toBeLessThan(
      normal.actualDeploymentPowerKw,
    )
  })

  it('ENERGY-7: stores less energy than the recovery machine absorbs', () => {
    const initial = createInitialEnergyStore(team, 0.4)
    const result = step(initial, {
      brakePercent: 100,
      deltaSeconds: 1,
      speedKph: 360,
      throttlePercent: 0,
    }).state
    const mechanicalRecoveryMJ = result.actualRecoveryPowerKw / 1000
    const storedMJ = result.currentEnergyMJ - initial.currentEnergyMJ

    expect(mechanicalRecoveryMJ).toBeGreaterThan(storedMJ)
    expect(storedMJ).toBeGreaterThan(0)
    expect(result.conversionLossThisLapMJ).toBeGreaterThan(0)
  })

  it('ENERGY-8: delivers less mechanical energy than it removes from storage', () => {
    const initial = createInitialEnergyStore(team, 0.8)
    const result = step(initial, {
      deltaSeconds: 1,
      deploymentRequest: 1,
    }).state
    const removedMJ = initial.currentEnergyMJ - result.currentEnergyMJ
    const deliveredMJ = result.deployedMechanicalEnergyThisLapMJ

    expect(removedMJ).toBeGreaterThan(deliveredMJ)
    expect(deliveredMJ).toBeGreaterThan(0)
    expect(result.conversionLossThisLapMJ).toBeCloseTo(
      removedMJ - deliveredMJ,
      8,
    )
  })

  it('ENERGY-9: keeps energy for later high-value straights in the lap', () => {
    const initial = createInitialEnergyStore(team, 0.9)
    const firstRequest = deploymentRequest(initial, {
      lapProgress: 0.08,
      straightLengthAheadMeters: 1_100,
    })
    const afterFirst = step(initial, {
      deltaSeconds: 1.5,
      deploymentRequest: firstRequest,
      speedKph: 250,
    }).state
    const secondRequest = deploymentRequest(afterFirst, {
      lapProgress: 0.42,
      straightLengthAheadMeters: 850,
    })
    const afterSecond = step(afterFirst, {
      deltaSeconds: 1.5,
      deploymentRequest: secondRequest,
      speedKph: 275,
    }).state
    const thirdRequest = deploymentRequest(afterSecond, {
      lapProgress: 0.76,
      straightLengthAheadMeters: 1_250,
    })

    expect(firstRequest).toBeGreaterThan(0)
    expect(secondRequest).toBeGreaterThan(0)
    expect(thirdRequest).toBeGreaterThan(0)
    expect(afterFirst.currentEnergyMJ).toBeGreaterThan(
      initial.minimumUsableEnergyMJ + initial.usableEnergyMJ * 0.45,
    )
    expect(afterSecond.currentEnergyMJ).toBeGreaterThan(
      initial.minimumUsableEnergyMJ,
    )
  })

  it('ENERGY-10: increases deployment allocation for an attack opportunity', () => {
    const state = createInitialEnergyStore(team, 0.75)
    const normal = deploymentRequest(state)
    const attack = deploymentRequest(state, {
      battlePhase: 'attacking',
      overtakeActive: true,
    })

    expect(attack).toBeGreaterThan(normal)
  })

  it('moves deployment away from terminal speed without cutting the throttle', () => {
    const state = createInitialEnergyStore(team, 0.9)
    const accelerating = deploymentRequest(state, { speedKph: 410 })
    const terminal = deploymentRequest(state, { speedKph: 432 })

    expect(accelerating).toBeGreaterThan(terminal)
    expect(terminal).toBeGreaterThan(0)
  })

  it('prioritizes the standing launch without delaying any grid row', () => {
    const state = createInitialEnergyStore(team, 1)
    const normal = deploymentRequest(state, {
      speedKph: 115,
      straightLengthAheadMeters: 260,
      straightness: 0.62,
      throttlePercent: 78,
    })
    const launch = deploymentRequest(state, {
      speedKph: 115,
      standingStartLaunchActive: true,
      straightLengthAheadMeters: 260,
      straightness: 0.62,
      throttlePercent: 78,
    })

    expect(normal).toBeGreaterThan(0)
    expect(launch).toBeGreaterThan(normal)
  })

  it('ENERGY-11: spends more while defending and carries the SOC cost forward', () => {
    const initial = createInitialEnergyStore(team, 0.72)
    const normalRequest = deploymentRequest(initial)
    const defendRequest = deploymentRequest(initial, {
      battlePhase: 'defending',
      paceMode: 'defend',
    })
    const normal = step(initial, {
      deltaSeconds: 2,
      deploymentRequest: normalRequest,
    }).state
    const defending = step(initial, {
      deltaSeconds: 2,
      deploymentRequest: defendRequest,
    }).state

    expect(defendRequest).toBeGreaterThan(normalRequest)
    expect(defending.currentEnergyMJ).toBeLessThan(normal.currentEnergyMJ)
    expect(defending.stateOfCharge).toBeLessThan(normal.stateOfCharge)
  })

  it('ENERGY-12: derives different race, VSC, and SC balances without auto-filling', () => {
    const initial = createInitialEnergyStore(team, 0.55)
    const racing = step(initial, {
      deltaSeconds: 2,
      deploymentRequest: deploymentRequest(initial),
      speedKph: 300,
    }).state
    const vsc = step(initial, {
      brakePercent: 22,
      deltaSeconds: 2,
      deploymentRequest: deploymentRequest(initial, {
        phaseActive: true,
        speedKph: 180,
        throttlePercent: 38,
      }),
      speedKph: 180,
      throttlePercent: 38,
    }).state
    const safetyCar = step(initial, {
      brakePercent: 8,
      deltaSeconds: 2,
      deploymentRequest: deploymentRequest(initial, {
        phaseActive: true,
        speedKph: 105,
        throttlePercent: 22,
      }),
      speedKph: 105,
      throttlePercent: 22,
    }).state

    expect(racing.currentEnergyMJ).toBeLessThan(initial.currentEnergyMJ)
    expect(vsc.actualHarvestedThisLapMJ).toBeGreaterThan(
      safetyCar.actualHarvestedThisLapMJ,
    )
    expect(vsc.stateOfCharge).toBeLessThan(1)
    expect(safetyCar.stateOfCharge).toBeLessThan(1)
  })

  it('ENERGY-13: reduces rear-axle recovery on a low-grip wet surface', () => {
    const initial = createInitialEnergyStore(team, 0.45)
    const dry = step(initial, {
      brakePercent: 40,
      speedKph: 220,
      throttlePercent: 0,
    }).state
    const wet = step(initial, {
      brakePercent: 40,
      driverWetSkill: 0.82,
      gripMultiplier: 0.58,
      speedKph: 220,
      surfaceWaterMm: 1.8,
      throttlePercent: 0,
      tire: 'W',
    }).state

    expect(wet.actualRecoveryPowerKw).toBeLessThan(dry.actualRecoveryPowerKw)
    expect(wet.recoveryTorqueNm).toBeLessThan(dry.recoveryTorqueNm)
    expect(
      wet.frictionBrakePowerKw / wet.requestedBrakePowerKw,
    ).toBeGreaterThan(dry.frictionBrakePowerKw / dry.requestedBrakePowerKw)
  })

  it('uses a qualifying recovery map without changing the recharge ceiling', () => {
    const initial = createInitialEnergyStore(team, 0.45)
    const normalRecovery = step(initial, {
      brakePercent: 54,
      recoveryRequestScale: 1,
      speedKph: 285,
      throttlePercent: 0,
    }).state
    const qualifyingRecovery = step(initial, {
      brakePercent: 54,
      recoveryRequestScale: 0.32,
      speedKph: 285,
      throttlePercent: 0,
    }).state

    expect(qualifyingRecovery.actualHarvestedThisLapMJ).toBeLessThan(
      normalRecovery.actualHarvestedThisLapMJ,
    )
    expect(qualifyingRecovery.stateOfCharge).toBeLessThan(
      normalRecovery.stateOfCharge,
    )
  })

  it('ENERGY-14: excessive early deployment creates real clipping recovery demand', () => {
    let state = createInitialEnergyStore(team, 0.88)

    for (let index = 0; index < 24; index += 1) {
      state = step(state, {
        deltaSeconds: 0.5,
        deploymentRequest: 1,
        speedKph: 355,
      }).state
    }
    const clipping = advanceSuperClipping({
      battlePhase: 'single-file',
      batteryPercent: state.stateOfCharge * 100,
      brakePercent: 0,
      currentIntensity: 0,
      deltaSeconds: 1,
      deployedThisLapMj: state.energyRemovedThisLapMJ,
      driver,
      fuelLoadKg: 70,
      gapToAheadSeconds: 3,
      harvestedThisLapMj: state.actualHarvestedThisLapMJ,
      lap: 8,
      lowGripConditions: false,
      maxRechargePerLapMj: maximumRechargeMJ,
      phaseActive: false,
      racePaceMode: 'standard',
      sessionType: 'race-distance',
      speedKph: 390,
      straightLengthAheadMeters: 900,
      straightness: 1,
      team,
      throttlePercent: 100,
    })
    const clippingStep = step(state, {
      additionalRecoveryRequestKw:
        clipping.regenerativeResistancePowerKw,
      deltaSeconds: 1,
      deploymentRequest: 1,
      speedKph: 390,
    }).state

    expect(state.stateOfCharge).toBeLessThan(0.15)
    expect(clipping.demandIntensity).toBeGreaterThan(0)
    expect(clipping.intensity).toBeGreaterThan(0)
    expect(clippingStep.recoveryMode).toBe('super-clipping')
    expect(clippingStep.actualRecoveryPowerKw).toBeGreaterThan(0)
    expect(clippingStep.actualDeploymentPowerKw).toBeLessThan(
      energySystemParametersFor(team).maximumDeploymentPowerKw,
    )
  })

  it('ENERGY-15: carries conserved SOC and thermal state through a 20-lap run', () => {
    let state = createInitialEnergyStore(team, 0.68)
    const laps: Array<{
      endSoc: number
      lossMJ: number
      maximumPowerKw: number
      startSoc: number
      temperatureC: number
    }> = []

    for (let lap = 1; lap <= 20; lap += 1) {
      const startSoc = state.stateOfCharge
      state = step(state, {
        brakePercent: 84,
        deltaSeconds: 1,
        deploymentRequest: 0,
        speedKph: 335,
        throttlePercent: 0,
      }).state
      state = step(state, {
        deltaSeconds: 1.1,
        deploymentRequest: deploymentRequest(state, {
          lapProgress: 0.28,
        }),
        speedKph: 285,
      }).state
      state = step(state, {
        brakePercent: 58,
        deltaSeconds: 0.7,
        deploymentRequest: 0,
        speedKph: 245,
        throttlePercent: 0,
      }).state
      state = step(state, {
        deltaSeconds: 1,
        deploymentRequest: deploymentRequest(state, {
          lapProgress: 0.72,
          straightLengthAheadMeters: 1_150,
        }),
        speedKph: 300,
      }).state

      expect(Math.abs(energyBalanceErrorMJ(state))).toBeLessThan(1e-8)
      laps.push({
        endSoc: state.stateOfCharge,
        lossMJ: state.conversionLossThisLapMJ,
        maximumPowerKw: state.maximumDeploymentPowerKw,
        startSoc,
        temperatureC: state.batteryTemperatureC,
      })
      const endEnergyMJ = state.currentEnergyMJ
      state = startNextEnergyLap(state)
      expect(state.currentEnergyMJ).toBeCloseTo(endEnergyMJ, 10)
      expect(state.stateOfCharge).toBeCloseTo(laps.at(-1)!.endSoc, 10)
    }

    expect(laps).toHaveLength(20)
    expect(laps.every((lap) => lap.lossMJ > 0)).toBe(true)
    expect(laps.every((lap) => lap.maximumPowerKw > 0)).toBe(true)
    expect(laps.every((lap) => lap.endSoc >= 0 && lap.endSoc <= 1)).toBe(true)
    expect(laps[1].startSoc).toBeCloseTo(laps[0].endSoc, 10)
    expect(new Set(laps.map((lap) => lap.endSoc.toFixed(4))).size).toBeGreaterThan(1)
    expect(new Set(laps.map((lap) => lap.temperatureC.toFixed(3))).size).toBeGreaterThan(1)
  })
})
