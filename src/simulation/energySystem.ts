import type {
  BattlePhase,
  EnergyRecoveryMode,
  EnergyStoreState,
  RacePaceMode,
  Team,
  TimedRunPhase,
  TireCompound,
} from '../types'
import { FIA_2026_REGULATION_PROFILE } from './regulations'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback
const ENERGY_INTEGRATION_STEP_SECONDS = 0.5

export type EnergySystemParameters = {
  usableEnergyMJ: number
  minimumUsableEnergyMJ: number
  maximumUsableEnergyMJ: number
  maximumDeploymentPowerKw: number
  maximumRecoveryPowerKw: number
  batteryChargeEfficiency: number
  batteryDischargeEfficiency: number
  inverterEfficiency: number
  motorEfficiency: number
  recoveryEfficiency: number
  coolingEfficiency: number
  thermalResistance: number
  energyManagementSoftwareQuality: number
  brakeByWireQuality: number
  regenBlendingQuality: number
}

export type EnergyDeploymentRequestOptions = {
  battlePhase: BattlePhase
  driverErsManagement: number
  isFinalLap: boolean
  lapProgress: number
  overtakeActive: boolean
  paceMode: RacePaceMode
  phaseActive: boolean
  speedKph: number
  state: EnergyStoreState
  straightLengthAheadMeters: number
  straightness: number
  team: Team
  throttlePercent: number
  timedRunPhase: TimedRunPhase | null
}

export type AdvanceEnergyStoreOptions = {
  additionalRecoveryRequestKw?: number
  allowLiftCoastRecovery?: boolean
  ambientTemperatureC: number
  brakePercent: number
  deltaSeconds: number
  deploymentPowerLimitKw: number
  deploymentRequest: number
  driverErsManagement: number
  driverWetSkill: number
  gripMultiplier: number
  maxRechargePerLapMj: number
  speedKph: number
  state: EnergyStoreState
  surfaceWaterMm: number
  team: Team
  throttlePercent: number
  tire: TireCompound
  vehicleMassKg: number
}

export type EnergyStoreStep = {
  state: EnergyStoreState
  regenerativeResistancePowerKw: number
}

export function energySystemParametersFor(team: Team): EnergySystemParameters {
  const machine = team.machine
  const usableEnergyMJ =
    FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj
  const minimumUsableEnergyMJ = 0.36
  const deploymentRating = clamp(machine.electricalDeploymentEfficiency, 0, 1)
  const recoveryRating = clamp(machine.energyRecoveryEfficiency, 0, 1)
  const coolingRating = clamp(machine.coolingEfficiency, 0, 1)

  return {
    usableEnergyMJ,
    minimumUsableEnergyMJ,
    maximumUsableEnergyMJ: minimumUsableEnergyMJ + usableEnergyMJ,
    maximumDeploymentPowerKw: Math.min(
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
      300 + 50 * clamp(machine.puOutput * 0.45 + deploymentRating * 0.55, 0, 1),
    ),
    maximumRecoveryPowerKw: Math.min(
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
      270 + 80 * recoveryRating,
    ),
    batteryChargeEfficiency: 0.94 + recoveryRating * 0.035,
    batteryDischargeEfficiency: 0.955 + deploymentRating * 0.025,
    inverterEfficiency: 0.95 + deploymentRating * 0.035,
    motorEfficiency: 0.91 + deploymentRating * 0.065,
    recoveryEfficiency:
      (0.9 + recoveryRating * 0.075) *
      (0.945 + recoveryRating * 0.04) *
      (0.94 + recoveryRating * 0.035),
    coolingEfficiency: 0.72 + coolingRating * 0.28,
    thermalResistance: 1.14 - coolingRating * 0.24,
    energyManagementSoftwareQuality: clamp(
      machine.activeAeroEfficiency * 0.32 +
        deploymentRating * 0.38 +
        recoveryRating * 0.3,
      0,
      1,
    ),
    brakeByWireQuality: clamp(
      machine.brakingStability * 0.62 + recoveryRating * 0.38,
      0,
      1,
    ),
    regenBlendingQuality: clamp(
      machine.brakingPerformance * 0.35 +
        machine.brakingStability * 0.3 +
        recoveryRating * 0.35,
      0,
      1,
    ),
  }
}

export function createInitialEnergyStore(
  team: Team,
  initialStateOfCharge = 0.82,
): EnergyStoreState {
  const parameters = energySystemParametersFor(team)
  const stateOfCharge = clamp(initialStateOfCharge, 0, 1)
  const currentEnergyMJ =
    parameters.minimumUsableEnergyMJ +
    parameters.usableEnergyMJ * stateOfCharge

  return {
    usableEnergyMJ: parameters.usableEnergyMJ,
    currentEnergyMJ,
    minimumUsableEnergyMJ: parameters.minimumUsableEnergyMJ,
    maximumUsableEnergyMJ: parameters.maximumUsableEnergyMJ,
    stateOfCharge,
    chargePowerKw: 0,
    dischargePowerKw: 0,
    requestedDeploymentPowerKw: 0,
    actualDeploymentPowerKw: 0,
    requestedRecoveryPowerKw: 0,
    actualRecoveryPowerKw: 0,
    requestedBrakePowerKw: 0,
    frictionBrakePowerKw: 0,
    recoveryTorqueNm: 0,
    motorMechanicalPowerKw: 0,
    batteryChargePowerKw: 0,
    batteryDischargePowerKw: 0,
    batteryTemperatureC: 42,
    motorGeneratorTemperatureC: 76,
    inverterTemperatureC: 58,
    harvestPotentialThisLapMJ: 0,
    actualHarvestedThisLapMJ: 0,
    deployedMechanicalEnergyThisLapMJ: 0,
    energyRemovedThisLapMJ: 0,
    conversionLossThisLapMJ: 0,
    lapStartEnergyMJ: currentEnergyMJ,
    energyBalanceErrorMJ: 0,
    thermalDerating: 1,
    socPowerLimitKw: parameters.maximumDeploymentPowerKw,
    batteryAcceptancePowerKw: parameters.maximumRecoveryPowerKw,
    maximumDeploymentPowerKw: parameters.maximumDeploymentPowerKw,
    deploymentRequest: 0,
    recoveryMode: 'none',
  }
}

export function normalizeEnergyStoreState(
  state: EnergyStoreState | undefined,
  team: Team,
  fallbackBatteryPercent = 82,
): EnergyStoreState {
  if (!state) {
    return createInitialEnergyStore(team, fallbackBatteryPercent / 100)
  }

  const parameters = energySystemParametersFor(team)
  const minimumUsableEnergyMJ = finite(
    state.minimumUsableEnergyMJ,
    parameters.minimumUsableEnergyMJ,
  )
  const usableEnergyMJ = Math.max(
    0.1,
    finite(state.usableEnergyMJ, parameters.usableEnergyMJ),
  )
  const maximumUsableEnergyMJ = Math.max(
    minimumUsableEnergyMJ + usableEnergyMJ,
    finite(
      state.maximumUsableEnergyMJ,
      minimumUsableEnergyMJ + usableEnergyMJ,
    ),
  )
  const currentEnergyMJ = clamp(
    finite(state.currentEnergyMJ, minimumUsableEnergyMJ + usableEnergyMJ * 0.82),
    minimumUsableEnergyMJ,
    maximumUsableEnergyMJ,
  )

  return {
    ...createInitialEnergyStore(team),
    ...state,
    usableEnergyMJ,
    minimumUsableEnergyMJ,
    maximumUsableEnergyMJ,
    currentEnergyMJ,
    stateOfCharge: clamp(
      (currentEnergyMJ - minimumUsableEnergyMJ) / usableEnergyMJ,
      0,
      1,
    ),
  }
}

export function startNextEnergyLap(state: EnergyStoreState): EnergyStoreState {
  return {
    ...state,
    chargePowerKw: 0,
    dischargePowerKw: 0,
    harvestPotentialThisLapMJ: 0,
    actualHarvestedThisLapMJ: 0,
    deployedMechanicalEnergyThisLapMJ: 0,
    energyRemovedThisLapMJ: 0,
    conversionLossThisLapMJ: 0,
    lapStartEnergyMJ: state.currentEnergyMJ,
    energyBalanceErrorMJ: 0,
  }
}

function batteryTemperaturePowerFactor(temperatureC: number) {
  return clamp(
    smoothstep(8, 29, temperatureC) *
      (1 - smoothstep(57, 88, temperatureC)),
    0,
    1,
  )
}

function batteryTemperatureChargeFactor(temperatureC: number) {
  return clamp(
    smoothstep(12, 31, temperatureC) *
      (1 - smoothstep(53, 82, temperatureC)),
    0,
    1,
  )
}

function motorTemperaturePowerFactor(temperatureC: number) {
  return clamp(1 - smoothstep(126, 182, temperatureC), 0, 1)
}

function inverterTemperaturePowerFactor(temperatureC: number) {
  return clamp(1 - smoothstep(96, 148, temperatureC), 0, 1)
}

function socDischargeFactor(stateOfCharge: number) {
  return smoothstep(0.025, 0.34, stateOfCharge)
}

function socChargeAcceptanceFactor(stateOfCharge: number) {
  return 1 - smoothstep(0.78, 1, stateOfCharge)
}

function tireRecoveryStability(tire: TireCompound, surfaceWaterMm: number) {
  if (surfaceWaterMm <= 0.05) return 1

  const tireFactor = tire === 'W' ? 1 : tire === 'I' ? 0.9 : 0.68
  return clamp((1 - surfaceWaterMm * 0.16) * tireFactor, 0.34, 1)
}

export function energyDeploymentRequestFor(
  options: EnergyDeploymentRequestOptions,
) {
  const {
    battlePhase,
    driverErsManagement,
    isFinalLap,
    lapProgress,
    overtakeActive,
    paceMode,
    phaseActive,
    speedKph,
    state,
    straightLengthAheadMeters,
    straightness,
    team,
    throttlePercent,
    timedRunPhase,
  } = options

  if (
    throttlePercent < 52 ||
    timedRunPhase === 'garage' ||
    state.stateOfCharge <= 0.01
  ) {
    return 0
  }

  const parameters = energySystemParametersFor(team)
  const management = clamp(
    driverErsManagement * 0.68 +
      parameters.energyManagementSoftwareQuality * 0.32,
    0,
    1,
  )
  const straightValue = clamp(
    0.12 +
      straightness * 0.48 +
      clamp(straightLengthAheadMeters / 1_250, 0, 1) * 0.25 +
      clamp((330 - speedKph) / 260, 0, 1) * 0.15,
    0,
    1,
  )
  const selectiveValue = Math.pow(
    straightValue,
    1.05 + management * 0.72,
  )
  const sessionBudgetShare =
    timedRunPhase === 'attack-lap'
      ? 0.98
      : timedRunPhase === 'out-lap' ||
          timedRunPhase === 'in-lap' ||
          timedRunPhase === 'cooldown'
        ? 0.18
        : 0.66
  const lapBudgetMJ = state.usableEnergyMJ * sessionBudgetShare
  const remainingBudgetMJ = Math.max(
    0,
    lapBudgetMJ - state.energyRemovedThisLapMJ,
  )
  const remainingLapShare = Math.max(0.09, 1 - clamp(lapProgress, 0, 1))
  const budgetPressure = clamp(
    remainingBudgetMJ /
      Math.max(0.2, lapBudgetMJ * (remainingLapShare + 0.1)),
    0,
    1.12,
  )
  const reserveSoc =
    (timedRunPhase === 'attack-lap' ? 0.08 : 0.22) +
    remainingLapShare * (0.09 + management * 0.06)
  const reserveFactor = smoothstep(
    reserveSoc,
    Math.min(0.72, reserveSoc + 0.34),
    state.stateOfCharge,
  )
  const paceMultiplier: Record<RacePaceMode, number> = {
    push: 1.16,
    standard: 1,
    save: 0.54,
    defend: 1.22,
  }
  const battleMultiplier =
    battlePhase === 'attacking' || battlePhase === 'side-by-side'
      ? 1.25
      : battlePhase === 'defending'
        ? 1.2
        : battlePhase === 'following'
          ? 1.08
          : 1
  const timedMultiplier =
    timedRunPhase === 'attack-lap'
      ? 1.32
      : timedRunPhase === 'out-lap' ||
          timedRunPhase === 'in-lap' ||
          timedRunPhase === 'cooldown'
        ? 0.12
        : 1
  const lowSkillWaste = (1 - management) * (1 - straightValue) * 0.16
  const neutralisationMultiplier = phaseActive ? 0.12 : 1

  return clamp(
    (selectiveValue * budgetPressure * reserveFactor + lowSkillWaste) *
      paceMultiplier[paceMode] *
      battleMultiplier *
      timedMultiplier *
      (overtakeActive ? 1.22 : 1) *
      (isFinalLap ? 1.14 : 1) *
      neutralisationMultiplier,
    0,
    1,
  )
}

function recoveryModeFor(options: {
  additionalRecoveryRequestKw: number
  brakePercent: number
  liftRecoveryRequestKw: number
}): EnergyRecoveryMode {
  if (options.additionalRecoveryRequestKw >= 8) return 'super-clipping'
  if (options.brakePercent >= 4) return 'braking'
  if (options.liftRecoveryRequestKw >= 3) return 'lift-coast'
  return 'none'
}

function advanceEnergyStoreSubstep(
  options: AdvanceEnergyStoreOptions,
  state: EnergyStoreState,
  deltaSeconds: number,
  speedKph: number,
): EnergyStoreState {
  const parameters = energySystemParametersFor(options.team)
  const speedMps = Math.max(0, speedKph) / 3.6
  const brakeRequest = clamp(options.brakePercent / 100, 0, 1)
  const grip = clamp(options.gripMultiplier, 0.25, 1.15)
  const wetStability =
    tireRecoveryStability(options.tire, options.surfaceWaterMm) *
    (0.82 + clamp(options.driverWetSkill, 0, 1) * 0.18)
  const maximumDecelerationMps2 = 5.1 * 9.81 * grip
  const predictedEndSpeedMps = Math.max(
    0,
    speedMps - maximumDecelerationMps2 * brakeRequest * deltaSeconds,
  )
  const kineticEnergyDeltaMJ = Math.max(
    0,
    (0.5 * Math.max(500, options.vehicleMassKg) *
      (speedMps ** 2 - predictedEndSpeedMps ** 2)) /
      1_000_000,
  )
  const aerodynamicLossShare = clamp(0.08 + (speedKph / 420) * 0.24, 0.08, 0.34)
  const requestedBrakePowerKw =
    deltaSeconds > 0
      ? (kineticEnergyDeltaMJ * 1000) / deltaSeconds
      : 0
  const rearAxleRecoveryShare = 0.56
  const driverRecoveryControl =
    0.82 + clamp(options.driverErsManagement, 0, 1) * 0.18
  const brakeRecoveryRequestKw =
    requestedBrakePowerKw *
    (1 - aerodynamicLossShare) *
    rearAxleRecoveryShare *
    wetStability *
    driverRecoveryControl *
    (0.84 + parameters.regenBlendingQuality * 0.16)
  const liftRecoveryRequestKw =
    options.allowLiftCoastRecovery !== false &&
    brakeRequest < 0.04 &&
    options.throttlePercent < 46 &&
    speedKph > 82
      ? clamp(
          ((46 - options.throttlePercent) / 46) *
            (speedKph / 420) *
            (58 + 32 * parameters.energyManagementSoftwareQuality),
          0,
          90,
        )
      : 0
  const additionalRecoveryRequestKw = Math.max(
    0,
    options.additionalRecoveryRequestKw ?? 0,
  )
  const requestedRecoveryPowerKw =
    brakeRecoveryRequestKw +
    liftRecoveryRequestKw +
    additionalRecoveryRequestKw
  const batteryChargeThermalFactor = batteryTemperatureChargeFactor(
    state.batteryTemperatureC,
  )
  const motorThermalFactor = motorTemperaturePowerFactor(
    state.motorGeneratorTemperatureC,
  )
  const inverterThermalFactor = inverterTemperaturePowerFactor(
    state.inverterTemperatureC,
  )
  const thermalRecoveryFactor = Math.min(
    batteryChargeThermalFactor,
    motorThermalFactor,
    inverterThermalFactor,
  )
  const chargeAcceptanceFactor = socChargeAcceptanceFactor(state.stateOfCharge)
  const batteryAcceptancePowerKw =
    parameters.maximumRecoveryPowerKw *
    chargeAcceptanceFactor *
    thermalRecoveryFactor
  const remainingRechargeMJ = Math.max(
    0,
    options.maxRechargePerLapMj - state.actualHarvestedThisLapMJ,
  )
  const energyRoomMJ = Math.max(
    0,
    state.maximumUsableEnergyMJ - state.currentEnergyMJ,
  )
  const storageLimitedMechanicalPowerKw =
    (Math.min(remainingRechargeMJ, energyRoomMJ) * 1000) /
    Math.max(0.000001, deltaSeconds * parameters.recoveryEfficiency)
  const actualRecoveryPowerKw = Math.min(
    requestedRecoveryPowerKw,
    parameters.maximumRecoveryPowerKw,
    batteryAcceptancePowerKw / Math.max(0.01, parameters.recoveryEfficiency),
    storageLimitedMechanicalPowerKw,
  )
  const batteryChargePowerKw =
    actualRecoveryPowerKw * parameters.recoveryEfficiency
  const storedEnergyMJ = Math.min(
    remainingRechargeMJ,
    energyRoomMJ,
    (batteryChargePowerKw * deltaSeconds) / 1000,
  )
  const deploymentThermalFactor = Math.min(
    batteryTemperaturePowerFactor(state.batteryTemperatureC),
    motorThermalFactor,
    inverterThermalFactor,
  )
  const socPowerLimitKw =
    parameters.maximumDeploymentPowerKw *
    socDischargeFactor(state.stateOfCharge)
  const maximumDeploymentPowerKw = Math.min(
    Math.max(0, options.deploymentPowerLimitKw),
    parameters.maximumDeploymentPowerKw,
  )
  const clippingDeploymentScale = clamp(
    1 - additionalRecoveryRequestKw / Math.max(1, parameters.maximumRecoveryPowerKw),
    0,
    1,
  )
  const requestedDeploymentPowerKw =
    brakeRequest >= 0.04
      ? 0
      : maximumDeploymentPowerKw *
        clamp(options.deploymentRequest, 0, 1) *
        clippingDeploymentScale
  const totalDeploymentEfficiency =
    parameters.batteryDischargeEfficiency *
    parameters.inverterEfficiency *
    parameters.motorEfficiency
  const availableStoredEnergyMJ = Math.max(
    0,
    state.currentEnergyMJ + storedEnergyMJ - state.minimumUsableEnergyMJ,
  )
  const energyLimitedMechanicalPowerKw =
    (availableStoredEnergyMJ * totalDeploymentEfficiency * 1000) /
    Math.max(0.000001, deltaSeconds)
  const actualDeploymentPowerKw = Math.min(
    requestedDeploymentPowerKw,
    maximumDeploymentPowerKw,
    socPowerLimitKw,
    maximumDeploymentPowerKw * deploymentThermalFactor,
    energyLimitedMechanicalPowerKw,
  )
  const batteryDischargePowerKw =
    actualDeploymentPowerKw / Math.max(0.01, totalDeploymentEfficiency)
  const removedEnergyMJ = Math.min(
    availableStoredEnergyMJ,
    (batteryDischargePowerKw * deltaSeconds) / 1000,
  )
  const deliveredMechanicalEnergyMJ =
    (actualDeploymentPowerKw * deltaSeconds) / 1000
  const recoveredMechanicalEnergyMJ =
    (actualRecoveryPowerKw * deltaSeconds) / 1000
  const conversionLossMJ = Math.max(
    0,
    recoveredMechanicalEnergyMJ - storedEnergyMJ +
      removedEnergyMJ - deliveredMechanicalEnergyMJ,
  )
  const currentEnergyMJ = clamp(
    state.currentEnergyMJ + storedEnergyMJ - removedEnergyMJ,
    state.minimumUsableEnergyMJ,
    state.maximumUsableEnergyMJ,
  )
  const stateOfCharge = clamp(
    (currentEnergyMJ - state.minimumUsableEnergyMJ) /
      Math.max(0.1, state.usableEnergyMJ),
    0,
    1,
  )
  const chargeRatio =
    batteryChargePowerKw / Math.max(1, parameters.maximumRecoveryPowerKw)
  const dischargeRatio =
    batteryDischargePowerKw / Math.max(1, parameters.maximumDeploymentPowerKw)
  const coolingAirflow = 0.35 + clamp(speedKph / 330, 0, 1.25)
  const batteryHeatPerSecond =
    (0.071 * Math.pow(dischargeRatio, 1.65) +
      0.061 * Math.pow(chargeRatio, 1.65)) *
    parameters.thermalResistance
  const batteryCoolingPerSecond =
    Math.max(0, state.batteryTemperatureC - options.ambientTemperatureC - 2) *
    0.00082 *
    coolingAirflow *
    parameters.coolingEfficiency
  const motorLoadRatio =
    Math.max(actualDeploymentPowerKw, actualRecoveryPowerKw) /
    Math.max(1, parameters.maximumDeploymentPowerKw)
  const motorHeatPerSecond =
    0.145 * Math.pow(motorLoadRatio, 1.55) * parameters.thermalResistance
  const motorCoolingPerSecond =
    Math.max(0, state.motorGeneratorTemperatureC - options.ambientTemperatureC) *
    0.00155 *
    coolingAirflow *
    parameters.coolingEfficiency
  const inverterLoadRatio =
    Math.max(batteryChargePowerKw, batteryDischargePowerKw) /
    Math.max(1, parameters.maximumDeploymentPowerKw)
  const inverterHeatPerSecond =
    0.102 * Math.pow(inverterLoadRatio, 1.5) * parameters.thermalResistance
  const inverterCoolingPerSecond =
    Math.max(0, state.inverterTemperatureC - options.ambientTemperatureC) *
    0.00175 *
    coolingAirflow *
    parameters.coolingEfficiency
  const batteryTemperatureC = clamp(
    state.batteryTemperatureC +
      (batteryHeatPerSecond - batteryCoolingPerSecond) * deltaSeconds,
    options.ambientTemperatureC - 4,
    105,
  )
  const motorGeneratorTemperatureC = clamp(
    state.motorGeneratorTemperatureC +
      (motorHeatPerSecond - motorCoolingPerSecond) * deltaSeconds,
    options.ambientTemperatureC,
    210,
  )
  const inverterTemperatureC = clamp(
    state.inverterTemperatureC +
      (inverterHeatPerSecond - inverterCoolingPerSecond) * deltaSeconds,
    options.ambientTemperatureC,
    175,
  )
  const actualHarvestedThisLapMJ =
    state.actualHarvestedThisLapMJ + storedEnergyMJ
  const energyRemovedThisLapMJ =
    state.energyRemovedThisLapMJ + removedEnergyMJ
  const balanceExpectedMJ =
    state.lapStartEnergyMJ +
    actualHarvestedThisLapMJ -
    energyRemovedThisLapMJ

  return {
    ...state,
    currentEnergyMJ,
    stateOfCharge,
    chargePowerKw: batteryChargePowerKw,
    dischargePowerKw: batteryDischargePowerKw,
    requestedDeploymentPowerKw,
    actualDeploymentPowerKw,
    requestedRecoveryPowerKw,
    actualRecoveryPowerKw,
    requestedBrakePowerKw,
    frictionBrakePowerKw: Math.max(
      0,
      requestedBrakePowerKw - actualRecoveryPowerKw,
    ),
    recoveryTorqueNm:
      speedMps > 0.5
        ? (actualRecoveryPowerKw * 1000 * 0.36) / speedMps
        : 0,
    motorMechanicalPowerKw:
      actualDeploymentPowerKw - actualRecoveryPowerKw,
    batteryChargePowerKw,
    batteryDischargePowerKw,
    batteryTemperatureC,
    motorGeneratorTemperatureC,
    inverterTemperatureC,
    harvestPotentialThisLapMJ:
      state.harvestPotentialThisLapMJ +
      (requestedRecoveryPowerKw * deltaSeconds) / 1000,
    actualHarvestedThisLapMJ,
    deployedMechanicalEnergyThisLapMJ:
      state.deployedMechanicalEnergyThisLapMJ + deliveredMechanicalEnergyMJ,
    energyRemovedThisLapMJ,
    conversionLossThisLapMJ:
      state.conversionLossThisLapMJ + conversionLossMJ,
    energyBalanceErrorMJ: currentEnergyMJ - balanceExpectedMJ,
    thermalDerating: Math.min(
      batteryTemperaturePowerFactor(batteryTemperatureC),
      motorTemperaturePowerFactor(motorGeneratorTemperatureC),
      inverterTemperaturePowerFactor(inverterTemperatureC),
    ),
    socPowerLimitKw,
    batteryAcceptancePowerKw,
    maximumDeploymentPowerKw,
    deploymentRequest: clamp(options.deploymentRequest, 0, 1),
    recoveryMode: recoveryModeFor({
      additionalRecoveryRequestKw,
      brakePercent: options.brakePercent,
      liftRecoveryRequestKw,
    }),
  }
}

/**
 * Integrates in fixed internal slices so energy and temperature do not depend
 * on UI frame rate or the selected simulation speed multiplier.
 */
export function advanceEnergyStore(
  options: AdvanceEnergyStoreOptions,
): EnergyStoreStep {
  const totalSeconds = Math.max(0, finite(options.deltaSeconds))
  let state = normalizeEnergyStoreState(
    options.state,
    options.team,
    options.state.stateOfCharge * 100,
  )

  if (totalSeconds <= 0) {
    return { state, regenerativeResistancePowerKw: 0 }
  }

  let remainingSeconds = totalSeconds
  let localSpeedKph = Math.max(0, options.speedKph)
  const initialHarvestedEnergyMJ = state.actualHarvestedThisLapMJ
  const initialRemovedEnergyMJ = state.energyRemovedThisLapMJ
  const initialMechanicalDeploymentMJ =
    state.deployedMechanicalEnergyThisLapMJ
  let requestedDeploymentIntegral = 0
  let requestedRecoveryIntegral = 0
  let requestedBrakeIntegral = 0
  let frictionBrakeIntegral = 0
  let recoveryTorqueIntegral = 0

  while (remainingSeconds > 0.000001) {
    const stepSeconds = Math.min(
      ENERGY_INTEGRATION_STEP_SECONDS,
      remainingSeconds,
    )
    state = advanceEnergyStoreSubstep(
      options,
      state,
      stepSeconds,
      localSpeedKph,
    )
    requestedDeploymentIntegral +=
      state.requestedDeploymentPowerKw * stepSeconds
    requestedRecoveryIntegral +=
      state.requestedRecoveryPowerKw * stepSeconds
    requestedBrakeIntegral += state.requestedBrakePowerKw * stepSeconds
    frictionBrakeIntegral += state.frictionBrakePowerKw * stepSeconds
    recoveryTorqueIntegral += state.recoveryTorqueNm * stepSeconds
    const decelerationMps2 =
      5.1 *
      9.81 *
      clamp(options.gripMultiplier, 0.25, 1.15) *
      clamp(options.brakePercent / 100, 0, 1)
    localSpeedKph = Math.max(
      0,
      localSpeedKph - decelerationMps2 * stepSeconds * 3.6,
    )
    remainingSeconds -= stepSeconds
  }

  const storedEnergyMJ =
    state.actualHarvestedThisLapMJ - initialHarvestedEnergyMJ
  const removedEnergyMJ = state.energyRemovedThisLapMJ - initialRemovedEnergyMJ
  const mechanicalDeploymentMJ =
    state.deployedMechanicalEnergyThisLapMJ -
    initialMechanicalDeploymentMJ
  const averageStoredPowerKw = (storedEnergyMJ * 1000) / totalSeconds
  const parameters = energySystemParametersFor(options.team)
  const averageMechanicalRecoveryPowerKw = Math.min(
    requestedRecoveryIntegral / totalSeconds,
    averageStoredPowerKw / Math.max(0.01, parameters.recoveryEfficiency),
  )
  const averageDeploymentPowerKw =
    (mechanicalDeploymentMJ * 1000) / totalSeconds
  state = {
    ...state,
    chargePowerKw: averageStoredPowerKw,
    dischargePowerKw: (removedEnergyMJ * 1000) / totalSeconds,
    requestedDeploymentPowerKw:
      requestedDeploymentIntegral / totalSeconds,
    actualDeploymentPowerKw: averageDeploymentPowerKw,
    requestedRecoveryPowerKw: requestedRecoveryIntegral / totalSeconds,
    batteryChargePowerKw: averageStoredPowerKw,
    batteryDischargePowerKw: (removedEnergyMJ * 1000) / totalSeconds,
    actualRecoveryPowerKw: averageMechanicalRecoveryPowerKw,
    requestedBrakePowerKw: requestedBrakeIntegral / totalSeconds,
    frictionBrakePowerKw: frictionBrakeIntegral / totalSeconds,
    recoveryTorqueNm: recoveryTorqueIntegral / totalSeconds,
    motorMechanicalPowerKw:
      averageDeploymentPowerKw - averageMechanicalRecoveryPowerKw,
  }

  return {
    state,
    regenerativeResistancePowerKw: averageMechanicalRecoveryPowerKw,
  }
}

export function energyBalanceErrorMJ(state: EnergyStoreState) {
  return (
    state.currentEnergyMJ -
    (state.lapStartEnergyMJ +
      state.actualHarvestedThisLapMJ -
      state.energyRemovedThisLapMJ)
  )
}
