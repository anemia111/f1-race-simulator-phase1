import type {
  BattlePhase,
  EnergyStoreState,
  ErsKOperatingMode,
  RacePaceMode,
  RechargeRuleDefinition,
  RechargeRuleState,
  Team,
  TimedRunPhase,
  TireCompound,
} from '../types'
import { effectiveMachineRating } from './machinePerformance'
import {
  FIA_2026_REGULATION_PROFILE,
  resolveF1RechargeRule,
} from './regulations'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

const ENERGY_INTEGRATION_STEP_SECONDS = 0.5
// Driver ability belongs exclusively to F1EnergyIntent. Physical execution uses
// the ideal endpoint of the existing formulas instead of reading it again.
const IDEAL_DRIVER_ENERGY_EXECUTION = 1

export const INITIAL_ENERGY_STORE_STATE_OF_CHARGE = 1

/**
 * Midpoint conversion model used only by a team-neutral offline reference lap.
 * Live cars always use their own component efficiencies from the same model.
 */
export const REFERENCE_F1_ENERGY_CONVERSION = {
  batteryChargeEfficiency: 0.9575,
  batteryDischargeEfficiency: 0.9675,
  inverterEfficiency: 0.9675,
  motorEfficiency: 0.9425,
} as const

export type EnergySystemParameters = {
  usableEnergyMJ: number
  minimumUsableEnergyMJ: number
  maximumUsableEnergyMJ: number
  maximumDeploymentDcPowerKw: number
  maximumRecoveryMechanicalPowerKw: number
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
  isFinalLap: boolean
  lapProgress: number
  overtakeActive: boolean
  paceMode: RacePaceMode
  phaseActive: boolean
  speedKph: number
  standingStartLaunchActive?: boolean
  state: EnergyStoreState
  straightLengthAheadMeters: number
  straightness: number
  team: Team
  throttlePercent: number
  timedRunPhase: TimedRunPhase | null
}

export type AdvanceEnergyStoreOptions = {
  allowLiftCoastRecovery?: boolean
  ambientTemperatureC: number
  /**
   * Exact service-brake work for each equal-duration vehicle-solver slice.
   * The supplied length owns the slice cadence and takes precedence over the
   * scalar compatibility budget below.
   */
  brakeMechanicalEnergyProfileMJ?: readonly number[]
  /**
   * Exact service-brake work at the contact patch over this public call.
   * Retained for direct-call compatibility when no slice profile is supplied.
   */
  brakeMechanicalEnergyBudgetMJ?: number
  brakePercent: number
  /**
   * Physical service-brake deceleration ceiling supplied by the live vehicle
   * solver's inputs. This bounds the legacy predictor when no exact contact-
   * patch work budget is available.
   */
  brakeDecelerationLimitMps2?: number
  /** Positive ICE contribution at the wheels, used only to classify superclip. */
  combustionWheelPowerKw?: number
  deltaSeconds: number
  /** C5.2.8 CU-K HV DC-bus limit selected by the regulatory resolver. */
  deploymentDcPowerLimitKw: number
  deploymentRequest: number
  gripMultiplier: number
  /** Lap-start-latched rule; an in-lap option change cannot rewrite the ledger. */
  rechargeRule: RechargeRuleDefinition
  recoveryRequestScale?: number
  speedKph: number
  state: EnergyStoreState
  /** Mechanical generator request while ICE wheel power remains positive. */
  superclipGeneratorRequestKw?: number
  surfaceWaterMm: number
  team: Team
  throttlePercent: number
  tire: TireCompound
  vehicleMassKg: number
}

/**
 * Independent audit for one public integration call. Values are integrated
 * from instantaneous powers and are not reconstructed from displayed SOC.
 */
export type EnergyFlowAudit = {
  deltaSeconds: number
  initialStoredEnergyMJ: number
  finalStoredEnergyMJ: number
  requestedBrakeMechanicalEnergyMJ: number
  frictionBrakeMechanicalEnergyMJ: number
  acceptedBrakeRecoveryMechanicalEnergyMJ: number
  acceptedBrakeRecoveryMechanicalEnergyProfileMJ: readonly number[]
  requestedRecoveryMechanicalEnergyMJ: number
  recoveredMechanicalEnergyMJ: number
  requestedSuperclipMechanicalEnergyMJ: number
  recoveredSuperclipMechanicalEnergyMJ: number
  rechargedAtCuKBusMJ: number
  superclipRechargedAtCuKBusMJ: number
  storedChargeEnergyMJ: number
  energyRemovedFromStoreMJ: number
  deployedAtCuKBusMJ: number
  deployedMechanicalEnergyMJ: number
  batteryLossEnergyMJ: number
  inverterLossEnergyMJ: number
  motorLossEnergyMJ: number
  storeBalanceErrorMJ: number
  conversionChainErrorMJ: number
}

export type EnergyStoreStep = {
  state: EnergyStoreState
  regenerativeResistancePowerKw: number
  /** Accepted mechanical generator power, allocated by physical source. */
  actualRecoverySourcePowerKw: {
    braking: number
    liftCoast: number
    superclip: number
  }
  audit: EnergyFlowAudit
}

export function energySystemParametersFor(team: Team): EnergySystemParameters {
  const machine = team.machine
  const usableEnergyMJ =
    FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj
  const minimumUsableEnergyMJ = 0.36
  const deploymentRating = effectiveMachineRating(
    machine.electricalDeploymentEfficiency,
  )
  const recoveryRating = effectiveMachineRating(machine.energyRecoveryEfficiency)
  const coolingRating = effectiveMachineRating(machine.coolingEfficiency)
  const activeAeroRating = effectiveMachineRating(machine.activeAeroEfficiency)
  const brakingStabilityRating = effectiveMachineRating(
    machine.brakingStability,
  )
  const brakingPerformanceRating = effectiveMachineRating(
    machine.brakingPerformance,
  )

  const batteryChargeEfficiency = 0.94 + recoveryRating * 0.035
  const inverterEfficiency = 0.95 + deploymentRating * 0.035
  const motorEfficiency = 0.91 + deploymentRating * 0.065

  return {
    usableEnergyMJ,
    minimumUsableEnergyMJ,
    maximumUsableEnergyMJ: minimumUsableEnergyMJ + usableEnergyMJ,
    maximumDeploymentDcPowerKw:
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
    maximumRecoveryMechanicalPowerKw: Math.min(
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
      270 + 80 * recoveryRating,
    ),
    batteryChargeEfficiency,
    batteryDischargeEfficiency: 0.955 + deploymentRating * 0.025,
    inverterEfficiency,
    motorEfficiency,
    recoveryEfficiency:
      batteryChargeEfficiency * inverterEfficiency * motorEfficiency,
    coolingEfficiency: 0.72 + coolingRating * 0.28,
    thermalResistance: 1.14 - coolingRating * 0.24,
    energyManagementSoftwareQuality: clamp(
      activeAeroRating * 0.32 +
        deploymentRating * 0.38 +
        recoveryRating * 0.3,
      0,
      1,
    ),
    brakeByWireQuality: clamp(
      brakingStabilityRating * 0.62 + recoveryRating * 0.38,
      0,
      1,
    ),
    regenBlendingQuality: clamp(
      brakingPerformanceRating * 0.35 +
        brakingStabilityRating * 0.3 +
        recoveryRating * 0.35,
      0,
      1,
    ),
  }
}

function createRechargeRuleState(
  rule: RechargeRuleDefinition,
  usedMJ = 0,
): RechargeRuleState {
  const finiteLimit =
    rule.limit.kind === 'finite'
      ? Math.max(0, finite(rule.limit.maxCuKBusRechargeMj))
      : null
  const nonnegativeUsedMJ = Math.max(0, finite(usedMJ))
  const safeUsedMJ =
    finiteLimit === null
      ? nonnegativeUsedMJ
      : Math.min(finiteLimit, nonnegativeUsedMJ)

  return {
    ...rule,
    limit:
      finiteLimit === null
        ? rule.limit
        : { kind: 'finite', maxCuKBusRechargeMj: finiteLimit },
    usedMJ: safeUsedMJ,
    remainingMJ:
      finiteLimit === null ? null : Math.max(0, finiteLimit - safeUsedMJ),
  }
}

export function createInitialEnergyStore(
  team: Team,
  initialStateOfCharge = INITIAL_ENERGY_STORE_STATE_OF_CHARGE,
  rechargeRule: RechargeRuleDefinition = resolveF1RechargeRule({
    stage: 'race',
  }),
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
    chargeDcPowerKw: 0,
    dischargeDcPowerKw: 0,
    storedChargePowerKw: 0,
    storedDischargePowerKw: 0,
    requestedDeploymentDcPowerKw: 0,
    actualDeploymentDcPowerKw: 0,
    actualDeploymentPowerKw: 0,
    requestedRecoveryPowerKw: 0,
    actualRecoveryPowerKw: 0,
    requestedBrakePowerKw: 0,
    frictionBrakePowerKw: 0,
    recoveryTorqueNm: 0,
    motorMechanicalPowerKw: 0,
    batteryLossPowerKw: 0,
    inverterLossPowerKw: 0,
    motorLossPowerKw: 0,
    batteryTemperatureC: 42,
    motorGeneratorTemperatureC: 76,
    inverterTemperatureC: 58,
    requestedRecoveryMechanicalEnergyThisLapMJ: 0,
    recoveredMechanicalEnergyThisLapMJ: 0,
    rechargedAtCuKBusThisLapMJ: 0,
    storedEnergyThisLapMJ: 0,
    deployedAtCuKBusThisLapMJ: 0,
    deployedMechanicalEnergyThisLapMJ: 0,
    energyRemovedThisLapMJ: 0,
    batteryLossThisLapMJ: 0,
    inverterLossThisLapMJ: 0,
    motorLossThisLapMJ: 0,
    unattributedConversionLossThisLapMJ: 0,
    conversionLossThisLapMJ: 0,
    lapStartEnergyMJ: currentEnergyMJ,
    lastStepBalanceErrorMJ: 0,
    energyBalanceErrorMJ: 0,
    thermalDerating: 1,
    socDischargeDcPowerLimitKw: parameters.maximumDeploymentDcPowerKw,
    batteryChargeDcPowerLimitKw:
      parameters.maximumRecoveryMechanicalPowerKw *
      parameters.motorEfficiency *
      parameters.inverterEfficiency,
    maximumDeploymentDcPowerKw: parameters.maximumDeploymentDcPowerKw,
    deploymentRequest: 0,
    operatingMode: 'inactive',
    rechargeRule: createRechargeRuleState(rechargeRule),
  }
}

export function normalizeEnergyStoreState(
  state: EnergyStoreState | undefined,
  team: Team,
  fallbackBatteryPercent = INITIAL_ENERGY_STORE_STATE_OF_CHARGE * 100,
  fallbackRechargeRule: RechargeRuleDefinition = resolveF1RechargeRule({
    stage: 'race',
  }),
): EnergyStoreState {
  if (!state) {
    return createInitialEnergyStore(
      team,
      fallbackBatteryPercent / 100,
      fallbackRechargeRule,
    )
  }

  const parameters = energySystemParametersFor(team)
  // These capacities are regulatory/runtime constants, not checkpoint inputs.
  const minimumUsableEnergyMJ = parameters.minimumUsableEnergyMJ
  const usableEnergyMJ = parameters.usableEnergyMJ
  const maximumUsableEnergyMJ = parameters.maximumUsableEnergyMJ
  const currentEnergyMJ = clamp(
    finite(
      state.currentEnergyMJ,
      minimumUsableEnergyMJ +
        usableEnergyMJ *
          clamp(
            finite(state.stateOfCharge, fallbackBatteryPercent / 100),
            0,
            1,
          ),
    ),
    minimumUsableEnergyMJ,
    maximumUsableEnergyMJ,
  )
  const rechargeRule = createRechargeRuleState(
    state.rechargeRule ?? fallbackRechargeRule,
    finite(state.rechargedAtCuKBusThisLapMJ),
  )
  const initial = createInitialEnergyStore(
    team,
    fallbackBatteryPercent / 100,
    rechargeRule,
  )

  return {
    ...initial,
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
    requestedRecoveryMechanicalEnergyThisLapMJ: Math.max(
      0,
      finite(state.requestedRecoveryMechanicalEnergyThisLapMJ),
    ),
    recoveredMechanicalEnergyThisLapMJ: Math.max(
      0,
      finite(state.recoveredMechanicalEnergyThisLapMJ),
    ),
    rechargedAtCuKBusThisLapMJ: rechargeRule.usedMJ,
    storedEnergyThisLapMJ: Math.max(0, finite(state.storedEnergyThisLapMJ)),
    deployedAtCuKBusThisLapMJ: Math.max(
      0,
      finite(state.deployedAtCuKBusThisLapMJ),
    ),
    deployedMechanicalEnergyThisLapMJ: Math.max(
      0,
      finite(state.deployedMechanicalEnergyThisLapMJ),
    ),
    energyRemovedThisLapMJ: Math.max(
      0,
      finite(state.energyRemovedThisLapMJ),
    ),
    batteryLossThisLapMJ: Math.max(0, finite(state.batteryLossThisLapMJ)),
    inverterLossThisLapMJ: Math.max(0, finite(state.inverterLossThisLapMJ)),
    motorLossThisLapMJ: Math.max(0, finite(state.motorLossThisLapMJ)),
    unattributedConversionLossThisLapMJ: Math.max(
      0,
      finite(state.unattributedConversionLossThisLapMJ),
    ),
    rechargeRule,
  }
}

export function startNextEnergyLap(
  state: EnergyStoreState,
  rechargeRule: RechargeRuleDefinition = state.rechargeRule,
): EnergyStoreState {
  const next = {
    ...state,
    chargeDcPowerKw: 0,
    dischargeDcPowerKw: 0,
    storedChargePowerKw: 0,
    storedDischargePowerKw: 0,
    requestedDeploymentDcPowerKw: 0,
    actualDeploymentDcPowerKw: 0,
    actualDeploymentPowerKw: 0,
    requestedRecoveryPowerKw: 0,
    actualRecoveryPowerKw: 0,
    requestedBrakePowerKw: 0,
    frictionBrakePowerKw: 0,
    recoveryTorqueNm: 0,
    motorMechanicalPowerKw: 0,
    batteryLossPowerKw: 0,
    inverterLossPowerKw: 0,
    motorLossPowerKw: 0,
    requestedRecoveryMechanicalEnergyThisLapMJ: 0,
    recoveredMechanicalEnergyThisLapMJ: 0,
    rechargedAtCuKBusThisLapMJ: 0,
    storedEnergyThisLapMJ: 0,
    deployedAtCuKBusThisLapMJ: 0,
    deployedMechanicalEnergyThisLapMJ: 0,
    energyRemovedThisLapMJ: 0,
    batteryLossThisLapMJ: 0,
    inverterLossThisLapMJ: 0,
    motorLossThisLapMJ: 0,
    unattributedConversionLossThisLapMJ: 0,
    conversionLossThisLapMJ: 0,
    lapStartEnergyMJ: state.currentEnergyMJ,
    lastStepBalanceErrorMJ: 0,
    energyBalanceErrorMJ: 0,
    deploymentRequest: 0,
    operatingMode: 'inactive' as const,
    rechargeRule: createRechargeRuleState(rechargeRule),
  }

  return next
}

export type LapCrossingEnergyRebaseResult = {
  state: EnergyStoreState
  /** Share of the already-integrated recovery that the new rule accepted. */
  rechargeAcceptanceScale: number
  /** Share of the already-integrated deployment retained after SOC rebasing. */
  deploymentAcceptanceScale: number
}

/**
 * Rebases one already-integrated telemetry step at the final timing-line
 * crossing inside that step. The physical step is deliberately not run twice:
 * its cumulative deltas are divided at the interpolated crossing, then the
 * post-Line share is placed in a fresh, lap-start-latched ledger.
 *
 * If the old lap's recharge ceiling curtailed the original whole-frame flow,
 * this function cannot invent the recovery that a fresh rule might have
 * accepted after the Line. That creates a conservative, frame-bounded
 * under-recovery. Conversely, a tighter new rule scales the carried recovery,
 * stored charge and conversion losses together, so charge is never retained
 * without matching CU-K-bus ledger use.
 */
export function rebaseEnergyStoreAtLapCrossing(options: {
  frameStartState: EnergyStoreState
  integratedState: EnergyStoreState
  postLineFraction: number
  rechargeRule: RechargeRuleDefinition
}): LapCrossingEnergyRebaseResult {
  const { frameStartState, integratedState, rechargeRule } = options
  const postLineFraction = clamp(finite(options.postLineFraction), 0, 1)
  const preLineFraction = 1 - postLineFraction
  const postDelta = (start: number, end: number) =>
    Math.max(0, finite(end) - finite(start)) * postLineFraction

  const rawRequestedRecoveryMJ = postDelta(
    frameStartState.requestedRecoveryMechanicalEnergyThisLapMJ,
    integratedState.requestedRecoveryMechanicalEnergyThisLapMJ,
  )
  const rawRecoveredMechanicalMJ = postDelta(
    frameStartState.recoveredMechanicalEnergyThisLapMJ,
    integratedState.recoveredMechanicalEnergyThisLapMJ,
  )
  const rawRechargedAtCuKBusMJ = postDelta(
    frameStartState.rechargedAtCuKBusThisLapMJ,
    integratedState.rechargedAtCuKBusThisLapMJ,
  )
  const rawStoredEnergyMJ = postDelta(
    frameStartState.storedEnergyThisLapMJ,
    integratedState.storedEnergyThisLapMJ,
  )
  const rawDeployedAtCuKBusMJ = postDelta(
    frameStartState.deployedAtCuKBusThisLapMJ,
    integratedState.deployedAtCuKBusThisLapMJ,
  )
  const rawDeployedMechanicalMJ = postDelta(
    frameStartState.deployedMechanicalEnergyThisLapMJ,
    integratedState.deployedMechanicalEnergyThisLapMJ,
  )
  const rawRemovedEnergyMJ = postDelta(
    frameStartState.energyRemovedThisLapMJ,
    integratedState.energyRemovedThisLapMJ,
  )
  const rawBatteryLossMJ = postDelta(
    frameStartState.batteryLossThisLapMJ,
    integratedState.batteryLossThisLapMJ,
  )
  const rawInverterLossMJ = postDelta(
    frameStartState.inverterLossThisLapMJ,
    integratedState.inverterLossThisLapMJ,
  )
  const rawMotorLossMJ = postDelta(
    frameStartState.motorLossThisLapMJ,
    integratedState.motorLossThisLapMJ,
  )

  const maximumNewLapRechargeMJ =
    rechargeRule.limit.kind === 'unlimited'
      ? Number.POSITIVE_INFINITY
      : rechargeRule.limit.kind === 'finite'
        ? Math.max(0, finite(rechargeRule.limit.maxCuKBusRechargeMj))
        : 0
  const acceptedRechargedAtCuKBusMJ = Math.min(
    rawRechargedAtCuKBusMJ,
    maximumNewLapRechargeMJ,
  )
  const rechargeAcceptanceScale =
    rawRechargedAtCuKBusMJ > 1e-12
      ? acceptedRechargedAtCuKBusMJ / rawRechargedAtCuKBusMJ
      : rawRecoveredMechanicalMJ > 1e-12 || rawStoredEnergyMJ > 1e-12
        ? 0
        : 1
  const recoveredMechanicalEnergyThisLapMJ =
    rawRecoveredMechanicalMJ * rechargeAcceptanceScale
  const storedEnergyThisLapMJ =
    rawStoredEnergyMJ * rechargeAcceptanceScale

  const interpolatedLapStartEnergyMJ = clamp(
    frameStartState.currentEnergyMJ +
      (integratedState.currentEnergyMJ - frameStartState.currentEnergyMJ) *
        preLineFraction,
    integratedState.minimumUsableEnergyMJ,
    integratedState.maximumUsableEnergyMJ,
  )
  const maximumRemovableEnergyMJ = Math.max(
    0,
    interpolatedLapStartEnergyMJ +
      storedEnergyThisLapMJ -
      integratedState.minimumUsableEnergyMJ,
  )
  const energyRemovedThisLapMJ = Math.min(
    rawRemovedEnergyMJ,
    maximumRemovableEnergyMJ,
  )
  const deploymentAcceptanceScale =
    rawRemovedEnergyMJ > 1e-12
      ? energyRemovedThisLapMJ / rawRemovedEnergyMJ
      : rawDeployedAtCuKBusMJ > 1e-12 || rawDeployedMechanicalMJ > 1e-12
        ? 0
        : 1
  const deployedAtCuKBusThisLapMJ =
    rawDeployedAtCuKBusMJ * deploymentAcceptanceScale
  const deployedMechanicalEnergyThisLapMJ =
    rawDeployedMechanicalMJ * deploymentAcceptanceScale
  const currentEnergyMJ = clamp(
    interpolatedLapStartEnergyMJ +
      storedEnergyThisLapMJ -
      energyRemovedThisLapMJ,
    integratedState.minimumUsableEnergyMJ,
    integratedState.maximumUsableEnergyMJ,
  )

  // The public state stores component losses jointly for charge and discharge.
  // Preserve their observed proportions while making their sum close the
  // accepted conversion chain exactly after either side has been curtailed.
  const acceptedConversionLossMJ = Math.max(
    0,
    recoveredMechanicalEnergyThisLapMJ +
      energyRemovedThisLapMJ -
      storedEnergyThisLapMJ -
      deployedMechanicalEnergyThisLapMJ,
  )
  const rawComponentLossMJ =
    rawBatteryLossMJ + rawInverterLossMJ + rawMotorLossMJ
  const batteryLossThisLapMJ =
    rawComponentLossMJ > 1e-12
      ? acceptedConversionLossMJ *
        (rawBatteryLossMJ / rawComponentLossMJ)
      : acceptedConversionLossMJ
  const inverterLossThisLapMJ =
    rawComponentLossMJ > 1e-12
      ? acceptedConversionLossMJ *
        (rawInverterLossMJ / rawComponentLossMJ)
      : 0
  const motorLossThisLapMJ = Math.max(
    0,
    acceptedConversionLossMJ -
      batteryLossThisLapMJ -
      inverterLossThisLapMJ,
  )
  const lossPowerScale =
    rawComponentLossMJ > 1e-12
      ? acceptedConversionLossMJ / rawComponentLossMJ
      : 0
  const balanceExpectedMJ =
    interpolatedLapStartEnergyMJ +
    storedEnergyThisLapMJ -
    energyRemovedThisLapMJ
  const conversionExpectedLossMJ =
    recoveredMechanicalEnergyThisLapMJ +
    energyRemovedThisLapMJ -
    storedEnergyThisLapMJ -
    deployedMechanicalEnergyThisLapMJ
  const storeBalanceErrorMJ = currentEnergyMJ - balanceExpectedMJ
  const conversionChainErrorMJ =
    conversionExpectedLossMJ -
    batteryLossThisLapMJ -
    inverterLossThisLapMJ -
    motorLossThisLapMJ
  const actualDeploymentDcPowerKw =
    integratedState.actualDeploymentDcPowerKw * deploymentAcceptanceScale
  const actualDeploymentPowerKw =
    integratedState.actualDeploymentPowerKw * deploymentAcceptanceScale
  const actualRecoveryPowerKw =
    integratedState.actualRecoveryPowerKw * rechargeAcceptanceScale
  const rechargeRuleState = createRechargeRuleState(
    rechargeRule,
    acceptedRechargedAtCuKBusMJ,
  )

  return {
    rechargeAcceptanceScale,
    deploymentAcceptanceScale,
    state: {
      ...integratedState,
      currentEnergyMJ,
      stateOfCharge: clamp(
        (currentEnergyMJ - integratedState.minimumUsableEnergyMJ) /
          Math.max(0.000001, integratedState.usableEnergyMJ),
        0,
        1,
      ),
      chargeDcPowerKw:
        integratedState.chargeDcPowerKw * rechargeAcceptanceScale,
      dischargeDcPowerKw:
        integratedState.dischargeDcPowerKw * deploymentAcceptanceScale,
      storedChargePowerKw:
        integratedState.storedChargePowerKw * rechargeAcceptanceScale,
      storedDischargePowerKw:
        integratedState.storedDischargePowerKw * deploymentAcceptanceScale,
      actualDeploymentDcPowerKw,
      actualDeploymentPowerKw,
      actualRecoveryPowerKw,
      frictionBrakePowerKw: Math.max(
        0,
        integratedState.requestedBrakePowerKw - actualRecoveryPowerKw,
      ),
      recoveryTorqueNm:
        integratedState.recoveryTorqueNm * rechargeAcceptanceScale,
      motorMechanicalPowerKw:
        actualDeploymentPowerKw - actualRecoveryPowerKw,
      batteryLossPowerKw:
        integratedState.batteryLossPowerKw * lossPowerScale,
      inverterLossPowerKw:
        integratedState.inverterLossPowerKw * lossPowerScale,
      motorLossPowerKw: integratedState.motorLossPowerKw * lossPowerScale,
      requestedRecoveryMechanicalEnergyThisLapMJ: rawRequestedRecoveryMJ,
      recoveredMechanicalEnergyThisLapMJ,
      rechargedAtCuKBusThisLapMJ: acceptedRechargedAtCuKBusMJ,
      storedEnergyThisLapMJ,
      deployedAtCuKBusThisLapMJ,
      deployedMechanicalEnergyThisLapMJ,
      energyRemovedThisLapMJ,
      batteryLossThisLapMJ,
      inverterLossThisLapMJ,
      motorLossThisLapMJ,
      unattributedConversionLossThisLapMJ: 0,
      conversionLossThisLapMJ: acceptedConversionLossMJ,
      lapStartEnergyMJ: interpolatedLapStartEnergyMJ,
      lastStepBalanceErrorMJ: Math.max(
        Math.abs(storeBalanceErrorMJ),
        Math.abs(conversionChainErrorMJ),
      ),
      energyBalanceErrorMJ: storeBalanceErrorMJ,
      operatingMode:
        actualDeploymentDcPowerKw <= 1e-9 && actualRecoveryPowerKw <= 1e-9
          ? 'inactive'
          : integratedState.operatingMode,
      rechargeRule: rechargeRuleState,
    },
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
    isFinalLap,
    lapProgress,
    overtakeActive,
    paceMode,
    phaseActive,
    speedKph,
    standingStartLaunchActive = false,
    state,
    straightLengthAheadMeters,
    straightness,
    team,
    throttlePercent,
    timedRunPhase,
  } = options

  const minimumDeploymentThrottle = timedRunPhase === 'attack-lap' ? 18 : 52
  if (
    throttlePercent < minimumDeploymentThrottle ||
    timedRunPhase === 'garage' ||
    state.stateOfCharge <= 0.01
  ) {
    return 0
  }

  const parameters = energySystemParametersFor(team)
  const management = clamp(
    IDEAL_DRIVER_ENERGY_EXECUTION * 0.68 +
      parameters.energyManagementSoftwareQuality * 0.32,
    0,
    1,
  )
  const straightValue = clamp(
    0.15 +
      straightness * 0.5 +
      clamp(straightLengthAheadMeters / 950, 0, 1) * 0.28 +
      clamp((350 - speedKph) / 280, 0, 1) * 0.17,
    0,
    1,
  )
  const selectiveValue = Math.pow(straightValue, 0.86 + management * 0.48)
  const sessionBudgetShare =
    timedRunPhase === 'attack-lap'
      ? 1
      : timedRunPhase === 'out-lap' ||
          timedRunPhase === 'in-lap' ||
          timedRunPhase === 'cooldown'
        ? 0.18
        : 1
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
    (timedRunPhase === 'attack-lap' ? 0.012 : 0.045) +
    remainingLapShare * (0.025 + management * 0.02)
  const reserveFactor = smoothstep(
    reserveSoc,
    Math.min(0.58, reserveSoc + 0.26),
    state.stateOfCharge,
  )
  const paceMultiplier: Record<RacePaceMode, number> = {
    push: 1.26,
    standard: 1,
    save: 0.54,
    defend: 1.22,
  }
  const battleMultiplier =
    battlePhase === 'attacking' || battlePhase === 'side-by-side'
      ? 1.38
      : battlePhase === 'defending'
        ? 1.32
        : battlePhase === 'following'
          ? 1.12
          : 1
  const timedMultiplier =
    timedRunPhase === 'attack-lap'
      ? 1.52
      : timedRunPhase === 'out-lap' ||
          timedRunPhase === 'in-lap' ||
          timedRunPhase === 'cooldown'
        ? 0.12
        : 1
  const lowSkillWaste = (1 - management) * (1 - straightValue) * 0.16
  const neutralisationMultiplier = phaseActive ? 0.12 : 1
  const longStraightMultiplier =
    1 + clamp((straightLengthAheadMeters - 500) / 900, 0, 1) * 0.18
  const baseStraightAllocationPriority =
    0.06 + clamp((straightLengthAheadMeters - 150) / 1_000, 0, 1) * 0.94
  const endOfLapSpend = smoothstep(0.74, 0.98, lapProgress)
  const straightAllocationPriority =
    baseStraightAllocationPriority +
    (1 - baseStraightAllocationPriority) * endOfLapSpend
  const terminalSpeedAllocation = 1 - smoothstep(420, 432, speedKph) * 0.65

  const strategicRequest =
    (selectiveValue * budgetPressure * reserveFactor + lowSkillWaste) *
      0.72 *
      longStraightMultiplier *
      straightAllocationPriority *
      paceMultiplier[paceMode] *
      battleMultiplier *
      timedMultiplier *
      (standingStartLaunchActive ? 1.34 : 1) *
      (overtakeActive ? 1.28 : 1) *
      (isFinalLap ? 1.14 : 1) *
      terminalSpeedAllocation *
      neutralisationMultiplier
  const qualifyingAttackMinimum =
    timedRunPhase === 'attack-lap'
      ? (0.18 + straightValue * 0.82) *
        straightAllocationPriority *
        smoothstep(18, 72, throttlePercent) *
        terminalSpeedAllocation *
        neutralisationMultiplier
      : 0

  return clamp(Math.max(strategicRequest, qualifyingAttackMinimum), 0, 1)
}

function operatingModeFor(options: {
  actualBrakeRecoveryPowerKw: number
  actualDeploymentDcPowerKw: number
  actualLiftRecoveryPowerKw: number
  actualRecoveryPowerKw: number
  actualSuperclipGeneratorPowerKw: number
  combustionWheelPowerKw: number
  throttlePercent: number
}): ErsKOperatingMode {
  if (options.actualRecoveryPowerKw > 0.001) {
    // A malformed mixed brake/superclip request remains braking regeneration.
    // Full-throttle superclip is reserved for actual accepted superclip flow,
    // not a request label attached to an unrelated recovery source.
    if (options.actualBrakeRecoveryPowerKw > 0.001) {
      return 'braking-regeneration'
    }
    if (
      options.actualSuperclipGeneratorPowerKw > 0.001 &&
      options.actualLiftRecoveryPowerKw <= 0.001 &&
      options.throttlePercent >= 95 &&
      options.combustionWheelPowerKw > 0.001
    ) {
      return 'full-throttle-superclip'
    }
    if (options.actualLiftRecoveryPowerKw > 0.001) {
      return 'lift-coast-regeneration'
    }
  }
  if (options.actualDeploymentDcPowerKw > 0.001) return 'propulsion'
  return 'inactive'
}

function remainingRechargeAtCuKBusMJ(state: EnergyStoreState) {
  if (state.rechargeRule.limit.kind === 'unlimited') {
    return Number.POSITIVE_INFINITY
  }
  if (state.rechargeRule.limit.kind === 'unavailable') return 0
  return Math.max(
    0,
    state.rechargeRule.limit.maxCuKBusRechargeMj -
      state.rechargedAtCuKBusThisLapMJ,
  )
}

type EnergyStoreSubstep = {
  state: EnergyStoreState
  actualBrakeRecoveryPowerKw: number
  actualLiftRecoveryPowerKw: number
  actualSuperclipGeneratorPowerKw: number
  requestedSuperclipMechanicalEnergyMJ: number
  recoveredSuperclipMechanicalEnergyMJ: number
  superclipRechargedAtCuKBusMJ: number
}

function advanceEnergyStoreSubstep(
  options: AdvanceEnergyStoreOptions,
  state: EnergyStoreState,
  deltaSeconds: number,
  speedKph: number,
  exactBrakeMechanicalPowerBudgetKw: number | null,
  exactBrakingOwnsGenerator: boolean,
): EnergyStoreSubstep {
  const parameters = energySystemParametersFor(options.team)
  const speedMps = Math.max(0, speedKph) / 3.6
  const brakeRequest = clamp(options.brakePercent / 100, 0, 1)
  const grip = clamp(options.gripMultiplier, 0.25, 1.15)
  const wetStability =
    tireRecoveryStability(options.tire, options.surfaceWaterMm) *
    (0.82 + IDEAL_DRIVER_ENERGY_EXECUTION * 0.18)
  // The legacy 5.1 g prediction remains only for callers without an exact
  // contact-patch work budget. Its optional hardware ceiling keeps that
  // compatibility path from crediting unavailable service-brake torque.
  const nominalMaximumDecelerationMps2 = 5.1 * 9.81 * grip
  const maximumDecelerationMps2 = Math.min(
    nominalMaximumDecelerationMps2,
    Math.max(
      0,
      finite(
        options.brakeDecelerationLimitMps2 ?? nominalMaximumDecelerationMps2,
        nominalMaximumDecelerationMps2,
      ),
    ),
  )
  const predictedEndSpeedMps = Math.max(
    0,
    speedMps - maximumDecelerationMps2 * brakeRequest * deltaSeconds,
  )
  const kineticEnergyDeltaMJ = Math.max(
    0,
    (0.5 *
      Math.max(500, options.vehicleMassKg) *
      (speedMps ** 2 - predictedEndSpeedMps ** 2)) /
      1_000_000,
  )
  const aerodynamicLossShare = clamp(0.08 + (speedKph / 420) * 0.24, 0.08, 0.34)
  const requestedBrakePowerKw =
    exactBrakeMechanicalPowerBudgetKw ??
    (deltaSeconds > 0 ? (kineticEnergyDeltaMJ * 1000) / deltaSeconds : 0)
  const recoveryRequestScale = clamp(options.recoveryRequestScale ?? 1, 0, 1.25)
  const brakeRecoveryRequestKw =
    requestedBrakePowerKw *
    (exactBrakeMechanicalPowerBudgetKw === null
      ? 1 - aerodynamicLossShare
      : 1) *
    0.56 *
    wetStability *
    (0.82 + IDEAL_DRIVER_ENERGY_EXECUTION * 0.18) *
    (0.84 + parameters.regenBlendingQuality * 0.16) *
    recoveryRequestScale
  const liftRecoveryRequestKw =
    !exactBrakingOwnsGenerator &&
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
        ) * recoveryRequestScale
      : 0
  const rawSuperclipGeneratorRequestKw = Math.max(
    0,
    finite(options.superclipGeneratorRequestKw ?? 0),
  )
  const combustionWheelPowerKw = Math.max(
    0,
    finite(options.combustionWheelPowerKw ?? 0),
  )
  // A superclip request is a scheduling intent, not proof of physical flow.
  // Without high throttle and positive ICE wheel power it is ineligible; any
  // independent braking/lift request remains attributable to its own source.
  const superclipGeneratorRequestKw =
    exactBrakingOwnsGenerator
      ? 0
      : options.throttlePercent >= 95 && combustionWheelPowerKw > 0.001
      ? rawSuperclipGeneratorRequestKw
      : 0
  const requestedRecoveryPowerKw =
    brakeRecoveryRequestKw +
    liftRecoveryRequestKw +
    superclipGeneratorRequestKw

  const motorThermalFactor = motorTemperaturePowerFactor(
    state.motorGeneratorTemperatureC,
  )
  const inverterThermalFactor = inverterTemperaturePowerFactor(
    state.inverterTemperatureC,
  )
  const thermalRecoveryFactor = Math.min(
    batteryTemperatureChargeFactor(state.batteryTemperatureC),
    motorThermalFactor,
    inverterThermalFactor,
  )
  const recoveryDcEfficiency =
    parameters.motorEfficiency * parameters.inverterEfficiency
  const batteryChargeDcPowerLimitKw =
    parameters.maximumRecoveryMechanicalPowerKw *
    recoveryDcEfficiency *
    thermalRecoveryFactor
  const remainingRechargeMJ = remainingRechargeAtCuKBusMJ(state)
  const energyRoomMJ = Math.max(
    0,
    state.maximumUsableEnergyMJ - state.currentEnergyMJ,
  )
  const ledgerLimitedMechanicalPowerKw = Number.isFinite(remainingRechargeMJ)
    ? (remainingRechargeMJ * 1000) /
      Math.max(0.000001, deltaSeconds * recoveryDcEfficiency)
    : Number.POSITIVE_INFINITY
  const storageLimitedMechanicalPowerKw =
    (energyRoomMJ * 1000) /
    Math.max(
      0.000001,
      deltaSeconds * recoveryDcEfficiency * parameters.batteryChargeEfficiency,
    )
  const actualRecoveryPowerKw = Math.max(
    0,
    Math.min(
      requestedRecoveryPowerKw,
      exactBrakingOwnsGenerator
        ? (exactBrakeMechanicalPowerBudgetKw ?? 0)
        : Number.POSITIVE_INFINITY,
      parameters.maximumRecoveryMechanicalPowerKw,
      batteryChargeDcPowerLimitKw / Math.max(0.01, recoveryDcEfficiency),
      ledgerLimitedMechanicalPowerKw,
      storageLimitedMechanicalPowerKw,
    ),
  )
  const recoveryAcceptanceFraction =
    requestedRecoveryPowerKw > 0
      ? clamp(actualRecoveryPowerKw / requestedRecoveryPowerKw, 0, 1)
      : 0
  const actualBrakeRecoveryPowerKw =
    brakeRecoveryRequestKw * recoveryAcceptanceFraction
  const actualLiftRecoveryPowerKw =
    liftRecoveryRequestKw * recoveryAcceptanceFraction
  const actualSuperclipGeneratorPowerKw =
    superclipGeneratorRequestKw * recoveryAcceptanceFraction
  const chargeDcPowerKw = actualRecoveryPowerKw * recoveryDcEfficiency
  const storedChargePowerKw =
    chargeDcPowerKw * parameters.batteryChargeEfficiency
  const rechargedAtCuKBusMJ = (chargeDcPowerKw * deltaSeconds) / 1000
  const requestedSuperclipMechanicalEnergyMJ =
    (superclipGeneratorRequestKw * deltaSeconds) / 1000
  const recoveredSuperclipMechanicalEnergyMJ =
    (actualSuperclipGeneratorPowerKw * deltaSeconds) / 1000
  const superclipRechargedAtCuKBusMJ =
    (actualSuperclipGeneratorPowerKw *
      recoveryDcEfficiency *
      deltaSeconds) /
    1000
  const storedEnergyMJ = Math.min(
    energyRoomMJ,
    (storedChargePowerKw * deltaSeconds) / 1000,
  )

  const deploymentThermalFactor = Math.min(
    batteryTemperaturePowerFactor(state.batteryTemperatureC),
    motorThermalFactor,
    inverterThermalFactor,
  )
  const socDischargeDcPowerLimitKw =
    parameters.maximumDeploymentDcPowerKw *
    socDischargeFactor(state.stateOfCharge)
  const maximumDeploymentDcPowerKw = Math.min(
    Math.max(0, finite(options.deploymentDcPowerLimitKw)),
    parameters.maximumDeploymentDcPowerKw,
  )
  // A single MGU-K cannot be a motor and generator in the same substep.
  const requestedDeploymentDcPowerKw =
    exactBrakingOwnsGenerator ||
    brakeRequest >= 0.04 ||
    actualRecoveryPowerKw > 0.001
      ? 0
      : maximumDeploymentDcPowerKw * clamp(options.deploymentRequest, 0, 1)
  const availableStoredEnergyMJ = Math.max(
    0,
    state.currentEnergyMJ + storedEnergyMJ - state.minimumUsableEnergyMJ,
  )
  const energyLimitedDcPowerKw =
    (availableStoredEnergyMJ * parameters.batteryDischargeEfficiency * 1000) /
    Math.max(0.000001, deltaSeconds)
  // C5.2.8 constrains CU-K DC power. Shaft power is derived after this cap.
  const actualDeploymentDcPowerKw = Math.max(
    0,
    Math.min(
      requestedDeploymentDcPowerKw,
      maximumDeploymentDcPowerKw,
      socDischargeDcPowerLimitKw,
      parameters.maximumDeploymentDcPowerKw * deploymentThermalFactor,
      energyLimitedDcPowerKw,
    ),
  )
  const storedDischargePowerKw =
    actualDeploymentDcPowerKw /
    Math.max(0.01, parameters.batteryDischargeEfficiency)
  const removedEnergyMJ = Math.min(
    availableStoredEnergyMJ,
    (storedDischargePowerKw * deltaSeconds) / 1000,
  )
  const actualDeploymentPowerKw =
    actualDeploymentDcPowerKw *
    parameters.inverterEfficiency *
    parameters.motorEfficiency
  const deployedAtCuKBusMJ =
    (actualDeploymentDcPowerKw * deltaSeconds) / 1000
  const deliveredMechanicalEnergyMJ =
    (actualDeploymentPowerKw * deltaSeconds) / 1000
  const recoveredMechanicalEnergyMJ =
    (actualRecoveryPowerKw * deltaSeconds) / 1000

  const recoveryMotorLossPowerKw =
    actualRecoveryPowerKw * (1 - parameters.motorEfficiency)
  const recoveryInverterInputPowerKw =
    actualRecoveryPowerKw * parameters.motorEfficiency
  const recoveryInverterLossPowerKw =
    recoveryInverterInputPowerKw * (1 - parameters.inverterEfficiency)
  const recoveryBatteryLossPowerKw =
    chargeDcPowerKw * (1 - parameters.batteryChargeEfficiency)
  const deploymentBatteryLossPowerKw =
    storedDischargePowerKw - actualDeploymentDcPowerKw
  const deploymentInverterLossPowerKw =
    actualDeploymentDcPowerKw * (1 - parameters.inverterEfficiency)
  const deploymentMotorInputPowerKw =
    actualDeploymentDcPowerKw * parameters.inverterEfficiency
  const deploymentMotorLossPowerKw =
    deploymentMotorInputPowerKw * (1 - parameters.motorEfficiency)
  const batteryLossPowerKw = Math.max(
    0,
    recoveryBatteryLossPowerKw + deploymentBatteryLossPowerKw,
  )
  const inverterLossPowerKw = Math.max(
    0,
    recoveryInverterLossPowerKw + deploymentInverterLossPowerKw,
  )
  const motorLossPowerKw = Math.max(
    0,
    recoveryMotorLossPowerKw + deploymentMotorLossPowerKw,
  )
  const batteryLossMJ = (batteryLossPowerKw * deltaSeconds) / 1000
  const inverterLossMJ = (inverterLossPowerKw * deltaSeconds) / 1000
  const motorLossMJ = (motorLossPowerKw * deltaSeconds) / 1000
  const conversionLossMJ = batteryLossMJ + inverterLossMJ + motorLossMJ

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
    chargeDcPowerKw / Math.max(1, parameters.maximumDeploymentDcPowerKw)
  const dischargeRatio =
    actualDeploymentDcPowerKw /
    Math.max(1, parameters.maximumDeploymentDcPowerKw)
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
    Math.max(1, parameters.maximumDeploymentDcPowerKw)
  const motorHeatPerSecond =
    0.145 * Math.pow(motorLoadRatio, 1.55) * parameters.thermalResistance
  const motorCoolingPerSecond =
    Math.max(0, state.motorGeneratorTemperatureC - options.ambientTemperatureC) *
    0.00155 *
    coolingAirflow *
    parameters.coolingEfficiency
  const inverterLoadRatio =
    Math.max(chargeDcPowerKw, actualDeploymentDcPowerKw) /
    Math.max(1, parameters.maximumDeploymentDcPowerKw)
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

  const rechargedAtCuKBusThisLapMJ =
    state.rechargedAtCuKBusThisLapMJ + rechargedAtCuKBusMJ
  const storedEnergyThisLapMJ = state.storedEnergyThisLapMJ + storedEnergyMJ
  const energyRemovedThisLapMJ =
    state.energyRemovedThisLapMJ + removedEnergyMJ
  const batteryLossThisLapMJ = state.batteryLossThisLapMJ + batteryLossMJ
  const inverterLossThisLapMJ = state.inverterLossThisLapMJ + inverterLossMJ
  const motorLossThisLapMJ = state.motorLossThisLapMJ + motorLossMJ
  const balanceExpectedMJ =
    state.lapStartEnergyMJ +
    storedEnergyThisLapMJ -
    energyRemovedThisLapMJ
  const storeBalanceErrorMJ =
    currentEnergyMJ -
    (state.currentEnergyMJ + storedEnergyMJ - removedEnergyMJ)
  const conversionChainErrorMJ =
    recoveredMechanicalEnergyMJ +
    removedEnergyMJ -
    storedEnergyMJ -
    deliveredMechanicalEnergyMJ -
    conversionLossMJ
  const operatingMode = operatingModeFor({
    actualBrakeRecoveryPowerKw,
    actualDeploymentDcPowerKw,
    actualLiftRecoveryPowerKw,
    actualRecoveryPowerKw,
    actualSuperclipGeneratorPowerKw,
    combustionWheelPowerKw,
    throttlePercent: options.throttlePercent,
  })
  const rechargeRule = createRechargeRuleState(
    state.rechargeRule,
    rechargedAtCuKBusThisLapMJ,
  )

  return {
    state: {
      ...state,
      currentEnergyMJ,
      stateOfCharge,
      chargeDcPowerKw,
      dischargeDcPowerKw: actualDeploymentDcPowerKw,
      storedChargePowerKw,
      storedDischargePowerKw,
      requestedDeploymentDcPowerKw,
      actualDeploymentDcPowerKw,
      actualDeploymentPowerKw,
      requestedRecoveryPowerKw,
      actualRecoveryPowerKw,
      requestedBrakePowerKw,
      frictionBrakePowerKw: Math.max(
        0,
        requestedBrakePowerKw -
          (exactBrakeMechanicalPowerBudgetKw === null
            ? actualRecoveryPowerKw
            : actualBrakeRecoveryPowerKw),
      ),
      recoveryTorqueNm:
        speedMps > 0.5
          ? (actualRecoveryPowerKw * 1000 * 0.36) / speedMps
          : 0,
      motorMechanicalPowerKw:
        actualDeploymentPowerKw - actualRecoveryPowerKw,
      batteryLossPowerKw,
      inverterLossPowerKw,
      motorLossPowerKw,
      batteryTemperatureC,
      motorGeneratorTemperatureC,
      inverterTemperatureC,
      requestedRecoveryMechanicalEnergyThisLapMJ:
        state.requestedRecoveryMechanicalEnergyThisLapMJ +
        (requestedRecoveryPowerKw * deltaSeconds) / 1000,
      recoveredMechanicalEnergyThisLapMJ:
        state.recoveredMechanicalEnergyThisLapMJ + recoveredMechanicalEnergyMJ,
      rechargedAtCuKBusThisLapMJ,
      storedEnergyThisLapMJ,
      deployedAtCuKBusThisLapMJ:
        state.deployedAtCuKBusThisLapMJ + deployedAtCuKBusMJ,
      deployedMechanicalEnergyThisLapMJ:
        state.deployedMechanicalEnergyThisLapMJ + deliveredMechanicalEnergyMJ,
      energyRemovedThisLapMJ,
      batteryLossThisLapMJ,
      inverterLossThisLapMJ,
      motorLossThisLapMJ,
      conversionLossThisLapMJ:
        state.unattributedConversionLossThisLapMJ +
        batteryLossThisLapMJ +
        inverterLossThisLapMJ +
        motorLossThisLapMJ,
      lastStepBalanceErrorMJ: Math.max(
        Math.abs(storeBalanceErrorMJ),
        Math.abs(conversionChainErrorMJ),
      ),
      energyBalanceErrorMJ: currentEnergyMJ - balanceExpectedMJ,
      thermalDerating: Math.min(
        batteryTemperaturePowerFactor(batteryTemperatureC),
        motorTemperaturePowerFactor(motorGeneratorTemperatureC),
        inverterTemperaturePowerFactor(inverterTemperatureC),
      ),
      socDischargeDcPowerLimitKw,
      batteryChargeDcPowerLimitKw,
      maximumDeploymentDcPowerKw,
      deploymentRequest: clamp(options.deploymentRequest, 0, 1),
      operatingMode,
      rechargeRule,
    },
    actualBrakeRecoveryPowerKw,
    actualLiftRecoveryPowerKw,
    actualSuperclipGeneratorPowerKw,
    requestedSuperclipMechanicalEnergyMJ,
    recoveredSuperclipMechanicalEnergyMJ,
    superclipRechargedAtCuKBusMJ,
  }
}

function emptyEnergyFlowAudit(storedEnergyMJ: number): EnergyFlowAudit {
  return {
    deltaSeconds: 0,
    initialStoredEnergyMJ: storedEnergyMJ,
    finalStoredEnergyMJ: storedEnergyMJ,
    requestedBrakeMechanicalEnergyMJ: 0,
    frictionBrakeMechanicalEnergyMJ: 0,
    acceptedBrakeRecoveryMechanicalEnergyMJ: 0,
    acceptedBrakeRecoveryMechanicalEnergyProfileMJ: [],
    requestedRecoveryMechanicalEnergyMJ: 0,
    recoveredMechanicalEnergyMJ: 0,
    requestedSuperclipMechanicalEnergyMJ: 0,
    recoveredSuperclipMechanicalEnergyMJ: 0,
    rechargedAtCuKBusMJ: 0,
    superclipRechargedAtCuKBusMJ: 0,
    storedChargeEnergyMJ: 0,
    energyRemovedFromStoreMJ: 0,
    deployedAtCuKBusMJ: 0,
    deployedMechanicalEnergyMJ: 0,
    batteryLossEnergyMJ: 0,
    inverterLossEnergyMJ: 0,
    motorLossEnergyMJ: 0,
    storeBalanceErrorMJ: 0,
    conversionChainErrorMJ: 0,
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
    options.rechargeRule,
  )

  if (totalSeconds <= 0) {
    return {
      state,
      regenerativeResistancePowerKw: 0,
      actualRecoverySourcePowerKw: {
        braking: 0,
        liftCoast: 0,
        superclip: 0,
      },
      audit: emptyEnergyFlowAudit(state.currentEnergyMJ),
    }
  }

  let remainingSeconds = totalSeconds
  let localSpeedKph = Math.max(0, options.speedKph)
  const suppliedBrakeMechanicalEnergyProfileMJ =
    options.brakeMechanicalEnergyProfileMJ
  const exactBrakeMechanicalEnergyProfileMJ =
    suppliedBrakeMechanicalEnergyProfileMJ === undefined
      ? null
      : Array.isArray(suppliedBrakeMechanicalEnergyProfileMJ) &&
          suppliedBrakeMechanicalEnergyProfileMJ.length > 0
        ? Array.from(suppliedBrakeMechanicalEnergyProfileMJ, (energyMJ) =>
            Math.max(0, finite(energyMJ)),
          )
        : [0]
  const exactBrakeMechanicalEnergyBudgetMJ =
    exactBrakeMechanicalEnergyProfileMJ !== null ||
    options.brakeMechanicalEnergyBudgetMJ === undefined
      ? null
      : Math.max(0, finite(options.brakeMechanicalEnergyBudgetMJ))
  const exactBrakeMechanicalPowerBudgetKw =
    exactBrakeMechanicalEnergyBudgetMJ === null
      ? null
      : (exactBrakeMechanicalEnergyBudgetMJ * 1000) / totalSeconds
  const exactProfileSliceSeconds =
    exactBrakeMechanicalEnergyProfileMJ === null
      ? null
      : totalSeconds / exactBrakeMechanicalEnergyProfileMJ.length
  const exactBrakingOwnsGenerator =
    exactBrakeMechanicalEnergyProfileMJ !== null &&
    exactProfileSliceSeconds !== null
      ? exactBrakeMechanicalEnergyProfileMJ.some(
          (energyMJ) =>
            (energyMJ * 1000) / exactProfileSliceSeconds > 1e-9,
        )
      : exactBrakeMechanicalPowerBudgetKw !== null &&
        exactBrakeMechanicalPowerBudgetKw > 1e-9
  const initialStoredEnergyMJ = state.currentEnergyMJ
  const initialRequestedRecoveryMJ =
    state.requestedRecoveryMechanicalEnergyThisLapMJ
  const initialRecoveredMechanicalMJ =
    state.recoveredMechanicalEnergyThisLapMJ
  const initialRechargedAtCuKBusMJ = state.rechargedAtCuKBusThisLapMJ
  const initialStoredEnergyThisLapMJ = state.storedEnergyThisLapMJ
  const initialRemovedEnergyMJ = state.energyRemovedThisLapMJ
  const initialDeployedAtCuKBusMJ = state.deployedAtCuKBusThisLapMJ
  const initialMechanicalDeploymentMJ =
    state.deployedMechanicalEnergyThisLapMJ
  const initialBatteryLossMJ = state.batteryLossThisLapMJ
  const initialInverterLossMJ = state.inverterLossThisLapMJ
  const initialMotorLossMJ = state.motorLossThisLapMJ
  let requestedDeploymentIntegral = 0
  let requestedRecoveryIntegral = 0
  let requestedBrakeIntegral = 0
  let frictionBrakeIntegral = 0
  let recoveryTorqueIntegral = 0
  let actualBrakeRecoveryIntegral = 0
  let actualLiftRecoveryIntegral = 0
  let actualSuperclipGeneratorIntegral = 0
  let requestedSuperclipMechanicalEnergyMJ = 0
  let recoveredSuperclipMechanicalEnergyMJ = 0
  let superclipRechargedAtCuKBusMJ = 0
  let exactProfileIndex = 0
  const acceptedBrakeRecoveryMechanicalEnergyProfileMJ: number[] = []

  while (
    exactBrakeMechanicalEnergyProfileMJ === null
      ? remainingSeconds > 0.000001
      : exactProfileIndex < exactBrakeMechanicalEnergyProfileMJ.length
  ) {
    const stepSeconds =
      exactProfileSliceSeconds ??
      Math.min(ENERGY_INTEGRATION_STEP_SECONDS, remainingSeconds)
    const exactBrakeMechanicalPowerKw =
      exactBrakeMechanicalEnergyProfileMJ === null
        ? exactBrakeMechanicalPowerBudgetKw
        : (exactBrakeMechanicalEnergyProfileMJ[exactProfileIndex] * 1000) /
          stepSeconds
    const substep = advanceEnergyStoreSubstep(
      options,
      state,
      stepSeconds,
      localSpeedKph,
      exactBrakeMechanicalPowerKw,
      exactBrakingOwnsGenerator,
    )
    state = substep.state
    requestedDeploymentIntegral +=
      state.requestedDeploymentDcPowerKw * stepSeconds
    requestedRecoveryIntegral += state.requestedRecoveryPowerKw * stepSeconds
    requestedBrakeIntegral += state.requestedBrakePowerKw * stepSeconds
    frictionBrakeIntegral += state.frictionBrakePowerKw * stepSeconds
    recoveryTorqueIntegral += state.recoveryTorqueNm * stepSeconds
    actualBrakeRecoveryIntegral +=
      substep.actualBrakeRecoveryPowerKw * stepSeconds
    if (exactBrakeMechanicalEnergyProfileMJ !== null) {
      acceptedBrakeRecoveryMechanicalEnergyProfileMJ.push(
        (substep.actualBrakeRecoveryPowerKw * stepSeconds) / 1000,
      )
    }
    actualLiftRecoveryIntegral +=
      substep.actualLiftRecoveryPowerKw * stepSeconds
    actualSuperclipGeneratorIntegral +=
      substep.actualSuperclipGeneratorPowerKw * stepSeconds
    requestedSuperclipMechanicalEnergyMJ +=
      substep.requestedSuperclipMechanicalEnergyMJ
    recoveredSuperclipMechanicalEnergyMJ +=
      substep.recoveredSuperclipMechanicalEnergyMJ
    superclipRechargedAtCuKBusMJ +=
      substep.superclipRechargedAtCuKBusMJ
    if (exactBrakeMechanicalPowerKw === null) {
      const decelerationMps2 =
        5.1 *
        9.81 *
        clamp(options.gripMultiplier, 0.25, 1.15) *
        clamp(options.brakePercent / 100, 0, 1)
      localSpeedKph = Math.max(
        0,
        localSpeedKph - decelerationMps2 * stepSeconds * 3.6,
      )
    } else {
      const localSpeedMps = localSpeedKph / 3.6
      const substepBrakeEnergyJ =
        exactBrakeMechanicalPowerKw * stepSeconds * 1000
      localSpeedKph =
        Math.sqrt(
          Math.max(
            0,
            localSpeedMps ** 2 -
              (2 * substepBrakeEnergyJ) /
                Math.max(500, options.vehicleMassKg),
          ),
        ) * 3.6
    }
    remainingSeconds -= stepSeconds
    exactProfileIndex += 1
  }

  const requestedRecoveryMechanicalEnergyMJ =
    state.requestedRecoveryMechanicalEnergyThisLapMJ -
    initialRequestedRecoveryMJ
  const recoveredMechanicalEnergyMJ =
    state.recoveredMechanicalEnergyThisLapMJ - initialRecoveredMechanicalMJ
  const rechargedAtCuKBusMJ =
    state.rechargedAtCuKBusThisLapMJ - initialRechargedAtCuKBusMJ
  const storedEnergyMJ =
    state.storedEnergyThisLapMJ - initialStoredEnergyThisLapMJ
  const removedEnergyMJ = state.energyRemovedThisLapMJ - initialRemovedEnergyMJ
  const deployedAtCuKBusMJ =
    state.deployedAtCuKBusThisLapMJ - initialDeployedAtCuKBusMJ
  const mechanicalDeploymentMJ =
    state.deployedMechanicalEnergyThisLapMJ - initialMechanicalDeploymentMJ
  const batteryLossEnergyMJ = state.batteryLossThisLapMJ - initialBatteryLossMJ
  const inverterLossEnergyMJ =
    state.inverterLossThisLapMJ - initialInverterLossMJ
  const motorLossEnergyMJ = state.motorLossThisLapMJ - initialMotorLossMJ
  const averageMechanicalRecoveryPowerKw =
    (recoveredMechanicalEnergyMJ * 1000) / totalSeconds
  const averageDeploymentPowerKw =
    (mechanicalDeploymentMJ * 1000) / totalSeconds
  const averageDeploymentDcPowerKw =
    (deployedAtCuKBusMJ * 1000) / totalSeconds
  const actualSuperclipGeneratorPowerKw =
    actualSuperclipGeneratorIntegral / totalSeconds
  const actualBrakeRecoveryPowerKw =
    actualBrakeRecoveryIntegral / totalSeconds
  const actualLiftRecoveryPowerKw =
    actualLiftRecoveryIntegral / totalSeconds
  const requestedBrakeMechanicalEnergyMJ = requestedBrakeIntegral / 1000
  const frictionBrakeMechanicalEnergyMJ = frictionBrakeIntegral / 1000
  const acceptedBrakeRecoveryMechanicalEnergyMJ =
    actualBrakeRecoveryIntegral / 1000
  const operatingMode = operatingModeFor({
    actualBrakeRecoveryPowerKw,
    actualDeploymentDcPowerKw: averageDeploymentDcPowerKw,
    actualLiftRecoveryPowerKw,
    actualRecoveryPowerKw: averageMechanicalRecoveryPowerKw,
    actualSuperclipGeneratorPowerKw,
    combustionWheelPowerKw: Math.max(
      0,
      finite(options.combustionWheelPowerKw ?? 0),
    ),
    throttlePercent: options.throttlePercent,
  })

  state = {
    ...state,
    chargeDcPowerKw: (rechargedAtCuKBusMJ * 1000) / totalSeconds,
    dischargeDcPowerKw: averageDeploymentDcPowerKw,
    storedChargePowerKw: (storedEnergyMJ * 1000) / totalSeconds,
    storedDischargePowerKw: (removedEnergyMJ * 1000) / totalSeconds,
    requestedDeploymentDcPowerKw:
      requestedDeploymentIntegral / totalSeconds,
    actualDeploymentDcPowerKw: averageDeploymentDcPowerKw,
    actualDeploymentPowerKw: averageDeploymentPowerKw,
    requestedRecoveryPowerKw: requestedRecoveryIntegral / totalSeconds,
    actualRecoveryPowerKw: averageMechanicalRecoveryPowerKw,
    requestedBrakePowerKw: requestedBrakeIntegral / totalSeconds,
    frictionBrakePowerKw: frictionBrakeIntegral / totalSeconds,
    recoveryTorqueNm: recoveryTorqueIntegral / totalSeconds,
    motorMechanicalPowerKw:
      averageDeploymentPowerKw - averageMechanicalRecoveryPowerKw,
    operatingMode,
    batteryLossPowerKw: (batteryLossEnergyMJ * 1000) / totalSeconds,
    inverterLossPowerKw: (inverterLossEnergyMJ * 1000) / totalSeconds,
    motorLossPowerKw: (motorLossEnergyMJ * 1000) / totalSeconds,
  }

  const storeBalanceErrorMJ =
    state.currentEnergyMJ -
    (initialStoredEnergyMJ + storedEnergyMJ - removedEnergyMJ)
  const conversionChainErrorMJ =
    recoveredMechanicalEnergyMJ +
    removedEnergyMJ -
    storedEnergyMJ -
    mechanicalDeploymentMJ -
    batteryLossEnergyMJ -
    inverterLossEnergyMJ -
    motorLossEnergyMJ
  const audit: EnergyFlowAudit = {
    deltaSeconds: totalSeconds,
    initialStoredEnergyMJ,
    finalStoredEnergyMJ: state.currentEnergyMJ,
    requestedBrakeMechanicalEnergyMJ,
    frictionBrakeMechanicalEnergyMJ,
    acceptedBrakeRecoveryMechanicalEnergyMJ,
    acceptedBrakeRecoveryMechanicalEnergyProfileMJ,
    requestedRecoveryMechanicalEnergyMJ,
    recoveredMechanicalEnergyMJ,
    requestedSuperclipMechanicalEnergyMJ,
    recoveredSuperclipMechanicalEnergyMJ,
    rechargedAtCuKBusMJ,
    superclipRechargedAtCuKBusMJ,
    storedChargeEnergyMJ: storedEnergyMJ,
    energyRemovedFromStoreMJ: removedEnergyMJ,
    deployedAtCuKBusMJ,
    deployedMechanicalEnergyMJ: mechanicalDeploymentMJ,
    batteryLossEnergyMJ,
    inverterLossEnergyMJ,
    motorLossEnergyMJ,
    storeBalanceErrorMJ,
    conversionChainErrorMJ,
  }
  state = {
    ...state,
    lastStepBalanceErrorMJ: Math.max(
      Math.abs(storeBalanceErrorMJ),
      Math.abs(conversionChainErrorMJ),
    ),
  }

  return {
    state,
    regenerativeResistancePowerKw: averageMechanicalRecoveryPowerKw,
    actualRecoverySourcePowerKw: {
      braking: actualBrakeRecoveryPowerKw,
      liftCoast: actualLiftRecoveryPowerKw,
      superclip: actualSuperclipGeneratorPowerKw,
    },
    audit,
  }
}

export function energyBalanceErrorMJ(state: EnergyStoreState) {
  return (
    state.currentEnergyMJ -
    (state.lapStartEnergyMJ +
      state.storedEnergyThisLapMJ -
      state.energyRemovedThisLapMJ)
  )
}
