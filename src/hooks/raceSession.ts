import type {
  CarSnapshot,
  EnergyStoreState,
  RaceConfig,
  RaceSnapshot,
  RechargeRuleDefinition,
  Team,
} from '../types'
import {
  activeAeroDisplayModeForState,
  createInitialActiveAeroState,
  isActiveAeroState,
} from '../simulation/activeAero'
import { energySystemParametersFor } from '../simulation/energySystem'
import { resolveCategoryDrivingPolicy } from '../simulation/categoryDriverAgent'
import {
  createDriverObservationInbox,
  driverObservationTickAt,
  parseDriverObservationInboxState,
} from '../simulation/driverObservationInbox'
import {
  createDriverAgentRuntimeState,
  parseDriverAgentRuntimeState,
} from '../simulation/driverAgentRuntime'
import {
  FIA_2026_REGULATION_PROFILE,
  resolveF1RechargeRule,
} from '../simulation/regulations'
import {
  createSuperFormulaRuntimeSystems,
} from '../simulation/runtimeSystems'
import {
  createTrackSurfaceStateFromLegacySectors,
  deserializeTrackSurfaceState,
  serializeTrackSurfaceState,
} from '../simulation/trackSurface'
import { strictTrackSurfaceStateForTrack } from '../simulation/trackSurfaceValidation'
import {
  validateSuperFormulaControlTireInventory,
} from '../simulation/superFormulaControlTires2026'
import {
  validateSuperFormula2026EngineLedger,
} from '../simulation/superFormulaEngineLedger'
import {
  validateSuperFormulaLiveTireState,
} from '../simulation/superFormulaLiveTires'

export const RACE_CHECKPOINT_STORAGE_KEY = 'race-sim-race-checkpoint-v2-runtime-boundary'
export const RACE_CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60_000
/**
 * Bump whenever persisted physics/timing state can no longer be continued
 * faithfully. The storage schema can stay stable while old engine snapshots
 * are rejected instead of mixing lap histories from different pace models.
 */
export const RACE_SIMULATION_MODEL_VERSION = '2026.08.31.1'
const LEGACY_V2_RACE_SIMULATION_MODEL_VERSION = '2026.08.11.3'
const LEGACY_F1_RACE_SIMULATION_MODEL_VERSIONS = new Set([
  '2026.08.09.1',
  LEGACY_V2_RACE_SIMULATION_MODEL_VERSION,
])
const LEGACY_V3_RACE_CHECKPOINT_VERSION = 3
const RACE_CHECKPOINT_VERSION = 4
const MAX_CHECKPOINT_LENGTH = 4_500_000
/**
 * Persistence only rejects clearly corrupt lateral state. The live lateral
 * model applies the circuit-specific track-width clamp after restoration.
 */
const MAX_PERSISTED_LATERAL_OFFSET_M = 100
const MAX_PERSISTED_LATERAL_VELOCITY_MPS = 100
const MAX_PERSISTED_LAP_ENERGY_MJ = 10_000
const MAX_PERSISTED_POWER_KW = 20_000
const MAX_PERSISTED_RECOVERY_TORQUE_NM = 1_000_000
const ENERGY_EPSILON = 1e-7

const ERS_K_OPERATING_MODES = new Set([
  'propulsion',
  'braking-regeneration',
  'lift-coast-regeneration',
  'full-throttle-superclip',
  'inactive',
])
const RECHARGE_RULE_RESOLUTIONS = new Set([
  'technical-default',
  'technical-low-grip-safety-car',
  'verified-event',
  'event-context-unavailable',
])
const OVERTAKE_STATUSES = new Set(['disabled', 'available', 'active'])
const OVERTAKE_ELIGIBILITY_KEYS = new Set([
  'activationLap',
  'controlLineIndex',
  'detectedGapSeconds',
  'eligible',
])
const FLAG_STATES = new Set(['clear', 'yellow', 'vsc', 'sc', 'red'])
const SECTOR_FLAG_STATES = new Set([
  ...FLAG_STATES,
  'double-yellow',
])
const TIMED_RUN_PHASES = [
  null,
  'garage',
  'out-lap',
  'attack-lap',
  'in-lap',
  'cooldown',
] as const

const ENERGY_STORE_NUMERIC_FIELDS = [
  'usableEnergyMJ',
  'currentEnergyMJ',
  'minimumUsableEnergyMJ',
  'maximumUsableEnergyMJ',
  'stateOfCharge',
  'chargeDcPowerKw',
  'dischargeDcPowerKw',
  'storedChargePowerKw',
  'storedDischargePowerKw',
  'requestedDeploymentDcPowerKw',
  'actualDeploymentDcPowerKw',
  'actualDeploymentPowerKw',
  'requestedRecoveryPowerKw',
  'actualRecoveryPowerKw',
  'requestedBrakePowerKw',
  'frictionBrakePowerKw',
  'recoveryTorqueNm',
  'motorMechanicalPowerKw',
  'batteryLossPowerKw',
  'inverterLossPowerKw',
  'motorLossPowerKw',
  'batteryTemperatureC',
  'motorGeneratorTemperatureC',
  'inverterTemperatureC',
  'requestedRecoveryMechanicalEnergyThisLapMJ',
  'recoveredMechanicalEnergyThisLapMJ',
  'rechargedAtCuKBusThisLapMJ',
  'storedEnergyThisLapMJ',
  'deployedAtCuKBusThisLapMJ',
  'deployedMechanicalEnergyThisLapMJ',
  'energyRemovedThisLapMJ',
  'batteryLossThisLapMJ',
  'inverterLossThisLapMJ',
  'motorLossThisLapMJ',
  'unattributedConversionLossThisLapMJ',
  'conversionLossThisLapMJ',
  'lapStartEnergyMJ',
  'lastStepBalanceErrorMJ',
  'energyBalanceErrorMJ',
  'thermalDerating',
  'socDischargeDcPowerLimitKw',
  'batteryChargeDcPowerLimitKw',
  'maximumDeploymentDcPowerKw',
  'deploymentRequest',
] as const satisfies ReadonlyArray<keyof EnergyStoreState>

const ENERGY_STORE_KEYS = new Set<string>([
  ...ENERGY_STORE_NUMERIC_FIELDS,
  'operatingMode',
  'rechargeRule',
])
const RECHARGE_RULE_KEYS = new Set([
  'limit',
  'baseLimitMJ',
  'additionalAllowanceMJ',
  'measuredAt',
  'resolution',
  'ruleId',
  'sourceId',
  'usedMJ',
  'remainingMJ',
])
const RECHARGE_LIMIT_KEYS = new Set(['kind', 'maxCuKBusRechargeMj'])
const F1_TIRE_COMPOUNDS = new Set(['S', 'M', 'H', 'I', 'W'])
const F1_TIRE_PERFORMANCE_STATES = new Set([
  'cold',
  'optimal',
  'graining',
  'overheating',
  'degraded',
])
const F1_TIRE_RUNTIME_KEYS = new Set([
  'compoundsUsed',
  'pendingTire',
  'tire',
  'tireAgeLaps',
  'tireCarcassTemperatureC',
  'tireGrainingPercent',
  'tireOverheatingPercent',
  'tirePerformanceState',
  'tireSetsRemaining',
  'tireTemperatureC',
  'tireThermalStressPercent',
  'tireWearPercent',
])
const F1_RUNTIME_KEYS = new Set([
  'activeAeroMode',
  'activeAeroState',
  'components',
  'energyDeployedThisLapMj',
  'energyHarvestedThisLapMj',
  'energyLapStartedBehindSafetyCar',
  'energyLapStartedInLowGripConditions',
  'energyStore',
  'ersBatteryPercent',
  'ersMode',
  'ersPowerKw',
  'kind',
  'overtakeEligibility',
  'overtakeEnergyRemainingMj',
  'overtakeRechargeAllowanceActiveThisLap',
  'standingStartMguKReleaseLatched',
  'superClippingDurationSeconds',
  'superClippingIntensity',
  'superClippingRecoveredThisLapMj',
  'superClippingRegenPowerKw',
  'superClippingStartedAtProgress',
  'superClippingStartedAtSeconds',
  'tires',
])
const SUPER_FORMULA_RUNTIME_KEYS = new Set([
  'controlTires',
  'engineLedger',
  'gearbox',
  'kind',
  'liveTires',
  'ots',
  'refuelling',
  'refuellingTask',
])
const SUPER_FORMULA_LIVE_TIRE_KEYS = new Set([
  'activeSurface',
  'fitment',
  'kind',
  'lapsOnCurrentSet',
  'physicalModel',
])
const SUPER_FORMULA_LIVE_TIRE_FITMENT_KEYS = new Set([
  'inventorySetCounted',
  'selectionProvenance',
  'sequence',
  'surface',
])
const SUPER_FORMULA_LIVE_TIRE_POLICY_KEYS = new Set([
  'authority',
  'id',
  'rationale',
])
const SUPER_FORMULA_LIVE_TIRE_PHYSICAL_MODEL_KEYS = new Set([
  'availability',
  'simulatorPolicy',
  'sourceInput',
  'value',
])
const SUPER_FORMULA_UNAVAILABLE_INPUT_KEYS = new Set([
  'availability',
  'provenance',
  'reason',
  'value',
])
const SUPER_FORMULA_RULE_PROVENANCE_KEYS = new Set([
  'article',
  'authority',
  'checksum',
  'publishedAt',
  'sourceId',
  'url',
])
const F1_ROOT_RUNTIME_FIELDS = new Set(
  [
    ...[...F1_RUNTIME_KEYS].filter((field) => field !== 'kind'),
    ...F1_TIRE_RUNTIME_KEYS,
  ],
)
const F1_COMPONENT_KEYS = new Set([
  'ice',
  'turbo',
  'exhaust',
  'energyStore',
  'controlElectronics',
  'mguK',
  'gearbox',
])
type StorageAdapter = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export type ActiveRaceSession = {
  config: RaceConfig
  key: string
}

type StoredRaceCheckpoint = {
  modelVersion: typeof RACE_SIMULATION_MODEL_VERSION
  savedAt: number
  sessionKey: string
  snapshot: RaceSnapshot
  version: typeof RACE_CHECKPOINT_VERSION
}

type LegacyTrackSurfaceProjection = {
  dryingLineBySector: [number, number, number]
  rubberLevelBySector: [number, number, number]
  surfaceWaterMmBySector: [number, number, number]
  trackEvolutionLevel?: number
}

type LegacySurfaceRaceSnapshot = RaceSnapshot & LegacyTrackSurfaceProjection

const carStatuses = new Set([
  'running',
  'pit',
  'retired',
  'finished',
  'disqualified',
  'dns',
])
const sessionStatuses = new Set(['racing', 'finished'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isFiniteInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number =>
  isFiniteNumber(value) && value >= minimum && value <= maximum

const approximatelyEqual = (
  left: number,
  right: number,
  tolerance = ENERGY_EPSILON,
) => Math.abs(left - right) <= tolerance

const hasExactKeys = (value: Record<string, unknown>, expected: Set<string>) => {
  const keys = Object.keys(value)

  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

const isOptionalUnitInterval = (value: unknown) =>
  value === undefined ||
  (isFiniteNumber(value) && value >= 0 && value <= 1)

const isOptionalFiniteWithin = (value: unknown, absoluteLimit: number) =>
  value === undefined ||
  (isFiniteNumber(value) && Math.abs(value) <= absoluteLimit)

const isNullableFiniteNumber = (value: unknown) =>
  value === null || isFiniteNumber(value)

const isFiniteTuple = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => isFiniteNumber(entry))

const isNullableFiniteTuple = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => isNullableFiniteNumber(entry))

function authoritativeRechargeRulesFor(
  config: RaceConfig,
  context: {
    behindSafetyCar: boolean
    lowGripConditions: boolean
    overtakeAtLapStart: boolean
    timedRunPhase: (typeof TIMED_RUN_PHASES)[number]
  },
) {
  try {
    return [
      resolveF1RechargeRule({
        ...context,
        eventId: config.eventId ?? undefined,
        eventInput: config.fiaPuEventInput,
        stage: config.weekendStage ?? 'race',
        trackId: config.track.id,
      }),
    ]
  } catch {
    // An invalid supplied event input cannot authorize a checkpoint.
    return []
  }
}

function rechargeLimitsMatch(
  left: RechargeRuleDefinition['limit'],
  right: RechargeRuleDefinition['limit'],
) {
  return (
    left.kind === right.kind &&
    left.maxCuKBusRechargeMj === right.maxCuKBusRechargeMj
  )
}

function rechargeRuleDefinitionsMatch(
  left: RechargeRuleDefinition,
  right: RechargeRuleDefinition,
) {
  return (
    rechargeLimitsMatch(left.limit, right.limit) &&
    left.baseLimitMJ === right.baseLimitMJ &&
    left.additionalAllowanceMJ === right.additionalAllowanceMJ &&
    left.measuredAt === right.measuredAt &&
    left.resolution === right.resolution &&
    left.ruleId === right.ruleId &&
    left.sourceId === right.sourceId
  )
}

function isCompatibleRechargeRuleState(
  value: unknown,
  rechargedAtCuKBusThisLapMJ: number,
  authoritativeRules: RechargeRuleDefinition[],
) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, RECHARGE_RULE_KEYS) ||
    !isRecord(value.limit) ||
    !hasExactKeys(value.limit, RECHARGE_LIMIT_KEYS) ||
    value.measuredAt !== 'CU-K-HV-DC-bus' ||
    typeof value.resolution !== 'string' ||
    !RECHARGE_RULE_RESOLUTIONS.has(value.resolution) ||
    typeof value.ruleId !== 'string' ||
    value.ruleId.length === 0 ||
    value.ruleId.length > 160 ||
    typeof value.sourceId !== 'string' ||
    value.sourceId.length === 0 ||
    value.sourceId.length > 160 ||
    !isFiniteInRange(value.additionalAllowanceMJ, 0, 12) ||
    !(
      value.baseLimitMJ === null ||
      isFiniteInRange(value.baseLimitMJ, 0, 12)
    ) ||
    !isFiniteInRange(value.usedMJ, 0, MAX_PERSISTED_LAP_ENERGY_MJ) ||
    !approximatelyEqual(value.usedMJ, rechargedAtCuKBusThisLapMJ)
  ) {
    return false
  }

  const limit = value.limit
  let validatedLimit: RechargeRuleDefinition['limit']
  if (limit.kind === 'finite') {
    if (
      !isFiniteInRange(limit.maxCuKBusRechargeMj, 0, 12) ||
      !isFiniteInRange(value.remainingMJ, 0, limit.maxCuKBusRechargeMj) ||
      value.usedMJ > limit.maxCuKBusRechargeMj + ENERGY_EPSILON ||
      !approximatelyEqual(
        value.remainingMJ,
        Math.max(0, limit.maxCuKBusRechargeMj - value.usedMJ),
      )
    ) {
      return false
    }
    validatedLimit = {
      kind: 'finite',
      maxCuKBusRechargeMj: limit.maxCuKBusRechargeMj,
    }
  } else if (limit.kind === 'unlimited') {
    if (limit.maxCuKBusRechargeMj !== null || value.remainingMJ !== null) {
      return false
    }
    validatedLimit = { kind: 'unlimited', maxCuKBusRechargeMj: null }
  } else if (limit.kind === 'unavailable') {
    if (
      limit.maxCuKBusRechargeMj !== null ||
      value.remainingMJ !== null ||
      !approximatelyEqual(value.usedMJ, 0)
    ) {
      return false
    }
    validatedLimit = { kind: 'unavailable', maxCuKBusRechargeMj: null }
  } else {
    return false
  }

  const definition: RechargeRuleDefinition = {
    additionalAllowanceMJ: value.additionalAllowanceMJ,
    baseLimitMJ: value.baseLimitMJ,
    limit: validatedLimit,
    measuredAt: value.measuredAt,
    resolution: value.resolution as RechargeRuleDefinition['resolution'],
    ruleId: value.ruleId,
    sourceId: value.sourceId,
  }

  return authoritativeRules.some((rule) =>
    rechargeRuleDefinitionsMatch(definition, rule),
  )
}

function isCompatibleEnergyStoreState(
  value: unknown,
  team: Team,
  authoritativeRules: RechargeRuleDefinition[],
) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ENERGY_STORE_KEYS) ||
    !ENERGY_STORE_NUMERIC_FIELDS.every((field) =>
      isFiniteNumber(value[field]),
    ) ||
    typeof value.operatingMode !== 'string' ||
    !ERS_K_OPERATING_MODES.has(value.operatingMode)
  ) {
    return false
  }

  const state = value as Record<
    (typeof ENERGY_STORE_NUMERIC_FIELDS)[number],
    number
  > &
    Record<string, unknown>
  const parameters = energySystemParametersFor(team)
  const energyLedgerFields = [
    'requestedRecoveryMechanicalEnergyThisLapMJ',
    'recoveredMechanicalEnergyThisLapMJ',
    'rechargedAtCuKBusThisLapMJ',
    'storedEnergyThisLapMJ',
    'deployedAtCuKBusThisLapMJ',
    'deployedMechanicalEnergyThisLapMJ',
    'energyRemovedThisLapMJ',
    'batteryLossThisLapMJ',
    'inverterLossThisLapMJ',
    'motorLossThisLapMJ',
    'unattributedConversionLossThisLapMJ',
    'conversionLossThisLapMJ',
  ] as const
  const nonnegativePowerFields = [
    'chargeDcPowerKw',
    'dischargeDcPowerKw',
    'storedChargePowerKw',
    'storedDischargePowerKw',
    'requestedDeploymentDcPowerKw',
    'actualDeploymentDcPowerKw',
    'actualDeploymentPowerKw',
    'requestedRecoveryPowerKw',
    'actualRecoveryPowerKw',
    'requestedBrakePowerKw',
    'frictionBrakePowerKw',
    'batteryLossPowerKw',
    'inverterLossPowerKw',
    'motorLossPowerKw',
    'socDischargeDcPowerLimitKw',
    'batteryChargeDcPowerLimitKw',
    'maximumDeploymentDcPowerKw',
  ] as const

  if (
    !approximatelyEqual(state.usableEnergyMJ, parameters.usableEnergyMJ) ||
    !approximatelyEqual(
      state.minimumUsableEnergyMJ,
      parameters.minimumUsableEnergyMJ,
    ) ||
    !approximatelyEqual(
      state.maximumUsableEnergyMJ,
      parameters.maximumUsableEnergyMJ,
    ) ||
    !approximatelyEqual(
      state.maximumUsableEnergyMJ - state.minimumUsableEnergyMJ,
      state.usableEnergyMJ,
    ) ||
    !isFiniteInRange(
      state.currentEnergyMJ,
      state.minimumUsableEnergyMJ,
      state.maximumUsableEnergyMJ,
    ) ||
    !isFiniteInRange(
      state.lapStartEnergyMJ,
      state.minimumUsableEnergyMJ,
      state.maximumUsableEnergyMJ,
    ) ||
    !isFiniteInRange(state.stateOfCharge, 0, 1) ||
    !approximatelyEqual(
      state.stateOfCharge,
      (state.currentEnergyMJ - state.minimumUsableEnergyMJ) /
        state.usableEnergyMJ,
    ) ||
    !energyLedgerFields.every((field) =>
      isFiniteInRange(state[field], 0, MAX_PERSISTED_LAP_ENERGY_MJ),
    ) ||
    !nonnegativePowerFields.every((field) =>
      isFiniteInRange(state[field], 0, MAX_PERSISTED_POWER_KW),
    ) ||
    !isFiniteInRange(
      state.recoveryTorqueNm,
      0,
      MAX_PERSISTED_RECOVERY_TORQUE_NM,
    ) ||
    Math.abs(state.motorMechanicalPowerKw) > MAX_PERSISTED_POWER_KW ||
    !isFiniteInRange(state.batteryTemperatureC, -100, 105) ||
    !isFiniteInRange(state.motorGeneratorTemperatureC, -100, 210) ||
    !isFiniteInRange(state.inverterTemperatureC, -100, 175) ||
    !isFiniteInRange(state.thermalDerating, 0, 1) ||
    !isFiniteInRange(state.deploymentRequest, 0, 1) ||
    !isFiniteInRange(state.lastStepBalanceErrorMJ, 0, 0.001) ||
    Math.abs(state.energyBalanceErrorMJ) > 0.001 ||
    state.maximumDeploymentDcPowerKw >
      parameters.maximumDeploymentDcPowerKw + ENERGY_EPSILON ||
    state.socDischargeDcPowerLimitKw >
      parameters.maximumDeploymentDcPowerKw + ENERGY_EPSILON ||
    state.actualDeploymentDcPowerKw >
      state.requestedDeploymentDcPowerKw + ENERGY_EPSILON ||
    state.actualDeploymentDcPowerKw >
      state.maximumDeploymentDcPowerKw + ENERGY_EPSILON ||
    state.actualDeploymentPowerKw >
      state.actualDeploymentDcPowerKw + ENERGY_EPSILON ||
    state.actualRecoveryPowerKw >
      state.requestedRecoveryPowerKw + ENERGY_EPSILON ||
    state.actualRecoveryPowerKw >
      parameters.maximumRecoveryMechanicalPowerKw + ENERGY_EPSILON ||
    state.storedEnergyThisLapMJ >
      state.rechargedAtCuKBusThisLapMJ + ENERGY_EPSILON ||
    state.rechargedAtCuKBusThisLapMJ >
      state.recoveredMechanicalEnergyThisLapMJ + ENERGY_EPSILON ||
    state.recoveredMechanicalEnergyThisLapMJ >
      state.requestedRecoveryMechanicalEnergyThisLapMJ + ENERGY_EPSILON ||
    state.deployedMechanicalEnergyThisLapMJ >
      state.deployedAtCuKBusThisLapMJ + ENERGY_EPSILON ||
    state.deployedAtCuKBusThisLapMJ >
      state.energyRemovedThisLapMJ + ENERGY_EPSILON ||
    (state.chargeDcPowerKw > ENERGY_EPSILON &&
      state.dischargeDcPowerKw > ENERGY_EPSILON) ||
    !approximatelyEqual(
      state.conversionLossThisLapMJ,
      state.unattributedConversionLossThisLapMJ +
        state.batteryLossThisLapMJ +
        state.inverterLossThisLapMJ +
        state.motorLossThisLapMJ,
    ) ||
    !approximatelyEqual(
      state.energyBalanceErrorMJ,
      state.currentEnergyMJ -
        (state.lapStartEnergyMJ +
          state.storedEnergyThisLapMJ -
          state.energyRemovedThisLapMJ),
    )
  ) {
    return false
  }

  return isCompatibleRechargeRuleState(
    value.rechargeRule,
    state.rechargedAtCuKBusThisLapMJ,
    authoritativeRules,
  )
}

function isCompatibleF1Components(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, F1_COMPONENT_KEYS)) {
    return false
  }

  return [...F1_COMPONENT_KEYS].every((key) => {
    const component = value[key]

    return (
      isRecord(component) &&
      hasExactKeys(
        component,
        new Set(['allocationLimit', 'allocationUsed', 'conditionPercent']),
      ) &&
      isFiniteInRange(component.conditionPercent, 0, 100) &&
      Number.isSafeInteger(component.allocationUsed) &&
      Number(component.allocationUsed) >= 1 &&
      Number(component.allocationUsed) <= 99 &&
      (component.allocationLimit === null ||
        (Number.isSafeInteger(component.allocationLimit) &&
          Number(component.allocationLimit) >= 1 &&
          Number(component.allocationLimit) <= 99))
    )
  })
}

function isNonNegativeSafeInteger(value: unknown) {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  )
}

/**
 * The Pirelli model is intentionally validated only inside the F1 runtime
 * branch.  This keeps persisted SF snapshots unable to smuggle an F1 tyre
 * family in through a root compatibility alias.
 */
function isCompatibleF1RuntimeTires(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, F1_TIRE_RUNTIME_KEYS)) {
    return false
  }

  const tire = value.tire
  const compoundsUsed = value.compoundsUsed
  const pendingTire = value.pendingTire
  const tireSetsRemaining = value.tireSetsRemaining

  return (
    typeof tire === 'string' &&
    F1_TIRE_COMPOUNDS.has(tire) &&
    Array.isArray(compoundsUsed) &&
    compoundsUsed.every(
      (compound) =>
        typeof compound === 'string' && F1_TIRE_COMPOUNDS.has(compound),
    ) &&
    new Set(compoundsUsed).size === compoundsUsed.length &&
    compoundsUsed.includes(tire) &&
    (pendingTire === null ||
      (typeof pendingTire === 'string' && F1_TIRE_COMPOUNDS.has(pendingTire))) &&
    isNonNegativeSafeInteger(value.tireAgeLaps) &&
    isFiniteInRange(value.tireCarcassTemperatureC, -100, 500) &&
    isFiniteInRange(value.tireTemperatureC, -100, 500) &&
    isFiniteInRange(value.tireGrainingPercent, 0, 100) &&
    isFiniteInRange(value.tireOverheatingPercent, 0, 100) &&
    isFiniteInRange(value.tireThermalStressPercent, 0, 100) &&
    isFiniteInRange(value.tireWearPercent, 0, 100) &&
    typeof value.tirePerformanceState === 'string' &&
    F1_TIRE_PERFORMANCE_STATES.has(value.tirePerformanceState) &&
    isRecord(tireSetsRemaining) &&
    Object.entries(tireSetsRemaining).every(
      ([compound, remaining]) =>
        F1_TIRE_COMPOUNDS.has(compound) && isNonNegativeSafeInteger(remaining),
    )
  )
}

function isCompatibleOvertakeEligibility(
  value: unknown,
  config: RaceConfig,
) {
  return (
    value === null ||
    (isRecord(value) &&
      hasExactKeys(value, OVERTAKE_ELIGIBILITY_KEYS) &&
      Number.isSafeInteger(value.activationLap) &&
      Number(value.activationLap) >= 0 &&
      Number.isSafeInteger(value.controlLineIndex) &&
      Number(value.controlLineIndex) >= 0 &&
      Number(value.controlLineIndex) <
        (config.track.overtakeControlLines?.length ?? 0) &&
      isFiniteInRange(value.detectedGapSeconds, 0, 1_000) &&
      typeof value.eligible === 'boolean')
  )
}

function isCompatibleF1RuntimeSystems(
  value: unknown,
  team: Team,
  config: RaceConfig,
  timedRunPhase: unknown,
  overtakeStatus: unknown,
) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, F1_RUNTIME_KEYS) ||
    value.kind !== 'f1' ||
    !isActiveAeroState(value.activeAeroState) ||
    value.activeAeroMode !== activeAeroDisplayModeForState(value.activeAeroState) ||
    !isCompatibleF1Components(value.components) ||
    !isCompatibleF1RuntimeTires(value.tires) ||
    typeof value.energyLapStartedBehindSafetyCar !== 'boolean' ||
    typeof value.energyLapStartedInLowGripConditions !== 'boolean' ||
    typeof value.overtakeRechargeAllowanceActiveThisLap !== 'boolean' ||
    typeof value.standingStartMguKReleaseLatched !== 'boolean' ||
    (value.ersMode !== 'harvest' &&
      value.ersMode !== 'balanced' &&
      value.ersMode !== 'deploy') ||
    !isCompatibleOvertakeEligibility(value.overtakeEligibility, config)
  ) {
    return false
  }

  const authoritativeRechargeRules = authoritativeRechargeRulesFor(config, {
    behindSafetyCar: value.energyLapStartedBehindSafetyCar,
    lowGripConditions: value.energyLapStartedInLowGripConditions,
    overtakeAtLapStart: value.overtakeRechargeAllowanceActiveThisLap,
    timedRunPhase: timedRunPhase as (typeof TIMED_RUN_PHASES)[number],
  })
  const energyStore = isRecord(value.energyStore) ? value.energyStore : null
  const isRaceDistanceStage = ['sprint', 'race', 'race2'].includes(
    config.weekendStage ?? 'race',
  )
  const hasCompatibleOvertakeAuthorization =
    config.overtakeSystem === 'ots' ||
    !isRaceDistanceStage ||
    overtakeStatus === 'disabled' ||
    (isRecord(value.overtakeEligibility) &&
      value.overtakeEligibility.eligible === true)
  const superclipActive =
    isFiniteNumber(value.superClippingIntensity) &&
    isFiniteNumber(value.superClippingRegenPowerKw) &&
    (value.superClippingIntensity > ENERGY_EPSILON ||
      value.superClippingRegenPowerKw > ENERGY_EPSILON)
  const hasCompatibleSuperclipEpisode = superclipActive
    ? isFiniteInRange(value.superClippingIntensity, 0, 1) &&
      isFiniteInRange(value.superClippingRegenPowerKw, 0, MAX_PERSISTED_POWER_KW) &&
      isFiniteInRange(
        value.superClippingStartedAtSeconds,
        0,
        RACE_CHECKPOINT_MAX_AGE_MS / 1_000,
      ) &&
      isFiniteInRange(value.superClippingStartedAtProgress, 0, 1) &&
      isFiniteInRange(
        value.superClippingDurationSeconds,
        0,
        RACE_CHECKPOINT_MAX_AGE_MS / 1_000,
      ) &&
      energyStore?.operatingMode === 'full-throttle-superclip' &&
      approximatelyEqual(
        value.superClippingRegenPowerKw,
        Number(energyStore.actualRecoveryPowerKw),
      )
    : value.superClippingStartedAtSeconds === null &&
      value.superClippingStartedAtProgress === null &&
      value.superClippingDurationSeconds === 0 &&
      value.superClippingIntensity === 0 &&
      value.superClippingRegenPowerKw === 0

  return (
    isCompatibleEnergyStoreState(
      value.energyStore,
      team,
      authoritativeRechargeRules,
    ) &&
    isRecord(value.energyStore) &&
    isFiniteInRange(value.ersPowerKw, 0, MAX_PERSISTED_POWER_KW) &&
    approximatelyEqual(
      value.ersPowerKw,
      Number(value.energyStore.actualDeploymentPowerKw),
    ) &&
    isFiniteNumber(value.ersBatteryPercent) &&
    approximatelyEqual(
      value.ersBatteryPercent,
      Math.round(Number(value.energyStore.stateOfCharge) * 100),
    ) &&
    isFiniteNumber(value.energyHarvestedThisLapMj) &&
    approximatelyEqual(
      value.energyHarvestedThisLapMj,
      Number(value.energyStore.rechargedAtCuKBusThisLapMJ),
    ) &&
    isFiniteNumber(value.energyDeployedThisLapMj) &&
    approximatelyEqual(
      value.energyDeployedThisLapMj,
      Number(value.energyStore.deployedAtCuKBusThisLapMJ),
    ) &&
    isFiniteInRange(
      value.overtakeEnergyRemainingMj,
      0,
      FIA_2026_REGULATION_PROFILE.energy.overtakeAdditionalEnergyPerLapMj,
    ) &&
    isFiniteInRange(
      value.superClippingRecoveredThisLapMj,
      0,
      Number(value.energyStore.rechargedAtCuKBusThisLapMJ),
    ) &&
    hasCompatibleOvertakeAuthorization &&
    hasCompatibleSuperclipEpisode
  )
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameStructuredValue(entry, right[index]))
    )
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false
  }

  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameStructuredValue(left[key], right[key]),
    )
  )
}

/**
 * SF persisted tyre state is a small discriminated payload.  Exact key checks
 * complement the domain validator so an otherwise valid dry/wet inventory
 * cannot carry an extra F1 tyre alias or fabricated physical coefficient.
 */
function isCompatibleSuperFormulaLiveTires(
  controlTires: unknown,
  liveTires: unknown,
) {
  if (
    !isRecord(liveTires) ||
    !hasExactKeys(liveTires, SUPER_FORMULA_LIVE_TIRE_KEYS) ||
    !isRecord(liveTires.fitment) ||
    !hasExactKeys(
      liveTires.fitment,
      SUPER_FORMULA_LIVE_TIRE_FITMENT_KEYS,
    ) ||
    !isRecord(liveTires.fitment.selectionProvenance) ||
    !hasExactKeys(
      liveTires.fitment.selectionProvenance,
      SUPER_FORMULA_LIVE_TIRE_POLICY_KEYS,
    ) ||
    !isRecord(liveTires.physicalModel) ||
    !hasExactKeys(
      liveTires.physicalModel,
      SUPER_FORMULA_LIVE_TIRE_PHYSICAL_MODEL_KEYS,
    ) ||
    !isRecord(liveTires.physicalModel.sourceInput) ||
    !hasExactKeys(
      liveTires.physicalModel.sourceInput,
      SUPER_FORMULA_UNAVAILABLE_INPUT_KEYS,
    ) ||
    !isRecord(liveTires.physicalModel.sourceInput.provenance) ||
    !hasExactKeys(
      liveTires.physicalModel.sourceInput.provenance,
      SUPER_FORMULA_RULE_PROVENANCE_KEYS,
    )
  ) {
    return false
  }

  return validateSuperFormulaLiveTireState({ controlTires, liveTires }).valid
}

function isCompatibleSuperFormulaRuntimeSystems(
  value: unknown,
  teamId: string,
) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SUPER_FORMULA_RUNTIME_KEYS) ||
    value.kind !== 'super-formula' ||
    !validateSuperFormulaControlTireInventory(value.controlTires).valid ||
    !isCompatibleSuperFormulaLiveTires(value.controlTires, value.liveTires)
  ) {
    return false
  }

  const engine = validateSuperFormula2026EngineLedger(value.engineLedger)
  if (
    !engine.valid ||
    engine.ledger.entrantId !== teamId ||
    !isRecord(value.gearbox) ||
    !hasExactKeys(
      value.gearbox,
      new Set(['availability', 'conditionPercent', 'reason']),
    ) ||
    value.gearbox.availability !== 'unavailable' ||
    value.gearbox.conditionPercent !== null ||
    typeof value.gearbox.reason !== 'string' ||
    value.gearbox.reason.length === 0
  ) {
    return false
  }

  const expected = createSuperFormulaRuntimeSystems({
    entrantId: engine.ledger.entrantId,
    engineLedger: engine.ledger,
    tireInventory: value.controlTires as ReturnType<
      typeof createSuperFormulaRuntimeSystems
    >['controlTires'],
  })

  return (
    sameStructuredValue(value.gearbox, expected.gearbox) &&
    sameStructuredValue(value.ots, expected.ots) &&
    sameStructuredValue(value.refuelling, expected.refuelling) &&
    sameStructuredValue(value.refuellingTask, expected.refuellingTask)
  )
}

function hasF1RuntimeFieldsAtCarRoot(value: Record<string, unknown>) {
  return [...F1_ROOT_RUNTIME_FIELDS].some((field) => Object.hasOwn(value, field))
}

/**
 * SUPER FORMULA race snapshots retain an observation-only steward status, but
 * never carry the F1/FIA automatic penalty counters or penalty records. Its
 * Article 5 record lives in the separate official season ledger instead.
 */
function hasNoSuperFormulaFiaPenaltyState(value: Record<string, unknown>) {
  return (
    value.penaltyPoints === 0 &&
    value.penaltySeconds === 0 &&
    value.penaltyLaps === 0 &&
    value.servedPenaltySeconds === 0 &&
    Array.isArray(value.penalties) &&
    value.penalties.length === 0
  )
}

/**
 * SF checkpoints are fail-closed even when a forged F1 field is hidden below
 * a nominal SF domain object. This deliberately scans only the SF runtime
 * payload; generic car fields such as tyre wear remain category-neutral.
 */
function hasNestedF1RuntimeFields(
  value: unknown,
  visited = new Set<object>(),
): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  if (visited.has(value)) {
    return false
  }
  visited.add(value)

  if (Array.isArray(value)) {
    return value.some((entry) => hasNestedF1RuntimeFields(entry, visited))
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      F1_ROOT_RUNTIME_FIELDS.has(key) ||
      hasNestedF1RuntimeFields(nested, visited),
  )
}

function isCompatibleCarSnapshot(
  value: unknown,
  expectedDriverIds: Set<string>,
  expectedTeamsByDriverId: Map<string, Team>,
  config: RaceConfig,
  options: {
    currentObservationTick: number
    requireDriverObservationInbox: boolean
  },
) {
  if (!isRecord(value) || !expectedDriverIds.has(String(value.driverId))) {
    return false
  }

  const expectedTeam = expectedTeamsByDriverId.get(String(value.driverId))
  if (
    !expectedTeam ||
    value.teamId !== expectedTeam.id ||
    !TIMED_RUN_PHASES.includes(
      value.timedRunPhase as (typeof TIMED_RUN_PHASES)[number],
    ) ||
    hasF1RuntimeFieldsAtCarRoot(value)
  ) {
    return false
  }

  const seriesId = config.seriesId ?? 'f1-custom'
  const driverPolicy = resolveCategoryDrivingPolicy(
    config.seriesId,
    config.vehicleEraId,
  )
  const hasCompatibleDriverObservationInbox =
    value.driverObservationInbox === undefined
      ? !options.requireDriverObservationInbox
      : parseDriverObservationInboxState(value.driverObservationInbox, {
          currentTick: options.currentObservationTick,
          driverId: String(value.driverId),
          seriesId: driverPolicy.seriesId,
          vehicleEraId: driverPolicy.vehicleEraId,
        }) !== null
  const hasCompatibleDriverAgentRuntime =
    value.driverAgentRuntime === undefined
      ? true
      : parseDriverAgentRuntimeState(value.driverAgentRuntime, {
          currentTick: options.currentObservationTick,
          driverId: String(value.driverId),
          policy: driverPolicy,
        }) !== null
  const hasCompatibleRuntime =
    seriesId === 'f1-custom'
      ? isCompatibleF1RuntimeSystems(
          value.runtimeSystems,
          expectedTeam,
          config,
          value.timedRunPhase,
          value.overtakeStatus,
        )
      : isCompatibleSuperFormulaRuntimeSystems(value.runtimeSystems, expectedTeam.id)

  return (
    typeof value.code === 'string' &&
    typeof value.status === 'string' &&
    carStatuses.has(value.status) &&
    isFiniteNumber(value.totalDistance) &&
    isFiniteNumber(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 1 &&
    isFiniteNumber(value.lap) &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.speedKph) &&
    typeof value.overtakeStatus === 'string' &&
    OVERTAKE_STATUSES.has(value.overtakeStatus) &&
    isOptionalFiniteWithin(
      value.lateralOffsetM,
      MAX_PERSISTED_LATERAL_OFFSET_M,
    ) &&
    isOptionalFiniteWithin(
      value.trackLateralOffset,
      MAX_PERSISTED_LATERAL_OFFSET_M,
    ) &&
    isOptionalFiniteWithin(
      value.desiredLateralOffsetM,
      MAX_PERSISTED_LATERAL_OFFSET_M,
    ) &&
    isOptionalFiniteWithin(
      value.lateralVelocityMps,
      MAX_PERSISTED_LATERAL_VELOCITY_MPS,
    ) &&
    isOptionalUnitInterval(value.turboSpoolFraction) &&
    isOptionalUnitInterval(value.clutchEngagementFraction) &&
    isFiniteNumber(value.fuelLoadKg) &&
    typeof value.passedDoubleYellowThisLap === 'boolean' &&
    isNullableFiniteTuple(value.currentLapSectorTimes, 3) &&
    isNullableFiniteTuple(value.currentLapMiniSectorTimes, 24) &&
    Array.isArray(value.lapHistory) &&
    Array.isArray(value.penalties) &&
    (seriesId !== 'super-formula' ||
      (!hasNestedF1RuntimeFields(value.runtimeSystems) &&
        hasNoSuperFormulaFiaPenaltyState(value))) &&
    hasCompatibleDriverAgentRuntime &&
    hasCompatibleDriverObservationInbox &&
    hasCompatibleRuntime
  )
}

const LEGACY_F1_REQUIRED_RUNTIME_FIELDS = new Set(
  [...F1_RUNTIME_KEYS].filter(
    (field) =>
      field !== 'activeAeroMode' &&
      field !== 'activeAeroState' &&
      field !== 'kind' &&
      field !== 'tires',
  ),
)

function legacyF1TiresFor(
  value: Record<string, unknown>,
): Record<string, unknown> | null {
  if (isRecord(value.tires)) {
    return value.tires
  }

  if (
    [...F1_TIRE_RUNTIME_KEYS].some((field) => !Object.hasOwn(value, field))
  ) {
    return null
  }

  return Object.fromEntries(
    [...F1_TIRE_RUNTIME_KEYS].map((field) => [field, value[field]]),
  )
}

function migrateLegacyF1CarRuntime(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.components)) {
    return null
  }
  if (
    [...LEGACY_F1_REQUIRED_RUNTIME_FIELDS].some(
      (field) => !Object.hasOwn(value, field),
    )
  ) {
    return null
  }

  const tires = legacyF1TiresFor(value)
  if (!tires) {
    return null
  }

  const activeAeroState = isActiveAeroState(value.activeAeroState)
    ? value.activeAeroState
    : createInitialActiveAeroState()
  const runtimeSystems = {
    activeAeroMode: activeAeroDisplayModeForState(activeAeroState),
    activeAeroState,
    components: value.components,
    energyDeployedThisLapMj: value.energyDeployedThisLapMj,
    energyHarvestedThisLapMj: value.energyHarvestedThisLapMj,
    energyLapStartedBehindSafetyCar: value.energyLapStartedBehindSafetyCar,
    energyLapStartedInLowGripConditions: value.energyLapStartedInLowGripConditions,
    energyStore: value.energyStore,
    ersBatteryPercent: value.ersBatteryPercent,
    ersMode: value.ersMode,
    ersPowerKw: value.ersPowerKw,
    kind: 'f1',
    overtakeEligibility: value.overtakeEligibility,
    overtakeEnergyRemainingMj: value.overtakeEnergyRemainingMj,
    overtakeRechargeAllowanceActiveThisLap:
      value.overtakeRechargeAllowanceActiveThisLap,
    standingStartMguKReleaseLatched: value.standingStartMguKReleaseLatched,
    superClippingDurationSeconds: value.superClippingDurationSeconds,
    superClippingIntensity: value.superClippingIntensity,
    superClippingRecoveredThisLapMj: value.superClippingRecoveredThisLapMj,
    superClippingRegenPowerKw: value.superClippingRegenPowerKw,
    superClippingStartedAtProgress: value.superClippingStartedAtProgress,
    superClippingStartedAtSeconds: value.superClippingStartedAtSeconds,
    tires,
  }
  const migrated = Object.fromEntries(
    Object.entries(value).filter(
      ([field]) => !F1_ROOT_RUNTIME_FIELDS.has(field),
    ),
  )

  return { ...migrated, runtimeSystems }
}

function migrateLegacyF1RaceSnapshot(
  value: unknown,
): LegacySurfaceRaceSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.cars)) {
    return null
  }

  const cars = value.cars.map(migrateLegacyF1CarRuntime)
  if (cars.some((car) => car === null)) {
    return null
  }

  return {
    ...value,
    cars,
  } as unknown as LegacySurfaceRaceSnapshot
}

/**
 * Validate and normalize the persisted canonical surface while discarding any
 * pre-v4 sector projections so they cannot return as a second state authority.
 */
function normalizeCanonicalTrackSurface(
  value: RaceSnapshot & Partial<LegacyTrackSurfaceProjection>,
): RaceSnapshot | null {
  const trackSurface = deserializeTrackSurfaceState(value.trackSurface)

  if (!trackSurface) {
    return null
  }

  const normalized: RaceSnapshot & Partial<LegacyTrackSurfaceProjection> = {
    ...value,
    // Serialization also ensures a plain JSON-compatible snapshot rather
    // than letting typed arrays leak through an externally supplied payload.
    trackSurface: serializeTrackSurfaceState(trackSurface),
  }
  delete normalized.dryingLineBySector
  delete normalized.rubberLevelBySector
  delete normalized.surfaceWaterMmBySector
  delete normalized.trackEvolutionLevel

  return normalized
}

/**
 * Checkpoint v2 did not persist the local two-lane substrate. Its three
 * sector values were the then-authoritative state, so hydrate exactly once
 * using the active track's source-labelled static profile and sector marks.
 */
function hydrateLegacyTrackSurface(
  value: LegacySurfaceRaceSnapshot,
  config: RaceConfig,
): RaceSnapshot | null {
  const trackSurface = createTrackSurfaceStateFromLegacySectors(
    {
      dryingLineBySector: value.dryingLineBySector,
      rubberLevelBySector: value.rubberLevelBySector,
      sectorMarks: config.track.sectorMarks,
      surfaceWaterMmBySector: value.surfaceWaterMmBySector,
    },
    {
      profile: config.track.surfaceProfile,
    },
  )

  return normalizeCanonicalTrackSurface({
    ...value,
    trackSurface: serializeTrackSurfaceState(trackSurface),
  })
}

function migrateRaceSnapshot(
  value: RaceSnapshot,
  config: RaceConfig,
): RaceSnapshot {
  const driverPolicy = resolveCategoryDrivingPolicy(
    config.seriesId,
    config.vehicleEraId,
  )

  return {
    ...value,
    cars: value.cars.map((car) => {
      const persisted = car as CarSnapshot &
        Partial<
          Pick<
            CarSnapshot,
            | 'desiredLateralOffsetM'
            | 'lateralOffsetM'
            | 'lateralVelocityMps'
            | 'trackLateralOffset'
          >
        >
      const lateralOffsetM =
        persisted.lateralOffsetM ?? persisted.trackLateralOffset ?? 0
      const lateralVelocityMps = persisted.lateralVelocityMps ?? 0
      const desiredLateralOffsetM =
        persisted.desiredLateralOffsetM ?? lateralOffsetM

      return {
        ...car,
        desiredLateralOffsetM,
        driverAgentRuntime:
          car.driverAgentRuntime ??
          createDriverAgentRuntimeState({
            driverId: car.driverId,
            policy: driverPolicy,
          }),
        driverObservationInbox:
          car.driverObservationInbox ??
          createDriverObservationInbox({
            driverId: car.driverId,
            seriesId: driverPolicy.seriesId,
            vehicleEraId: driverPolicy.vehicleEraId,
          }),
        lateralOffsetM,
        lateralVelocityMps,
        trackLateralOffset: lateralOffsetM,
      }
    }),
  }
}

function isCompatibleRaceSnapshot(
  value: unknown,
  config: RaceConfig,
  options: {
    requireDriverObservationInbox?: boolean
    requireLegacySurfaceProjection?: boolean
    requireTrackSurface?: boolean
  } = {},
) {
  if (!isRecord(value)) {
    return false
  }

  const currentObservationTick =
    isFiniteNumber(value.elapsedSeconds) && value.elapsedSeconds >= 0
      ? driverObservationTickAt(value.elapsedSeconds)
      : -1

  const expectedDriverIds = new Set(config.drivers.map((driver) => driver.id))
  const teamsById = new Map(config.teams.map((team) => [team.id, team]))
  const expectedTeamsByDriverId = new Map(
    config.drivers.flatMap((driver) => {
      const team = teamsById.get(driver.teamId)

      return team ? [[driver.id, team] as const] : []
    }),
  )
  const cars = value.cars
  const hasSafetyCarControlProof =
    value.flag === 'sc' &&
    Array.isArray(value.sectorFlags) &&
    value.sectorFlags.every((sectorFlag) => sectorFlag === 'sc') &&
    (value.formationBehindSafetyCar === true ||
      (isRecord(value.flagPhase) && value.flagPhase.flag === 'sc'))

  if (
    expectedTeamsByDriverId.size !== expectedDriverIds.size ||
    (value.lowGripConditions !== null &&
      typeof value.lowGripConditions !== 'boolean') ||
    typeof value.formationBehindSafetyCar !== 'boolean' ||
    typeof value.flag !== 'string' ||
    !FLAG_STATES.has(value.flag) ||
    !isRecord(value.weekend) ||
    value.weekend.stage !== (config.weekendStage ?? 'race') ||
    !Array.isArray(value.sectorFlags) ||
    value.sectorFlags.length !== 3 ||
    !value.sectorFlags.every(
      (sectorFlag) =>
        typeof sectorFlag === 'string' && SECTOR_FLAG_STATES.has(sectorFlag),
    ) ||
    (value.flag === 'sc' &&
      !value.sectorFlags.every((sectorFlag) => sectorFlag === 'sc')) ||
    (value.flag === 'sc' && !hasSafetyCarControlProof) ||
    !Array.isArray(cars) ||
    cars.length !== expectedDriverIds.size ||
    !cars.every((car) =>
      isCompatibleCarSnapshot(
        car,
        expectedDriverIds,
        expectedTeamsByDriverId,
        config,
        {
          currentObservationTick,
          requireDriverObservationInbox:
            options.requireDriverObservationInbox === true,
        },
      ),
    ) ||
    new Set(cars.map((car) => String((car as Record<string, unknown>).driverId)))
      .size !== expectedDriverIds.size
  ) {
    return false
  }

  return (
    isFiniteNumber(value.elapsedSeconds) &&
    value.elapsedSeconds >= 0 &&
    typeof value.elapsedLabel === 'string' &&
    isFiniteNumber(value.leaderLap) &&
    isFiniteNumber(value.raceLaps) &&
    Number.isSafeInteger(value.raceLaps) &&
    value.raceLaps > 0 &&
    typeof value.sessionStatus === 'string' &&
    sessionStatuses.has(value.sessionStatus) &&
    typeof value.eventMessage === 'string' &&
    (!options.requireLegacySurfaceProjection ||
      (isFiniteTuple(value.rubberLevelBySector, 3) &&
        isFiniteTuple(value.surfaceWaterMmBySector, 3) &&
        isFiniteTuple(value.dryingLineBySector, 3))) &&
    (!options.requireTrackSurface ||
      strictTrackSurfaceStateForTrack(value.trackSurface, config.track) !==
        null) &&
    Array.isArray(value.events) &&
    Array.isArray(value.stewardCases) &&
    ((config.seriesId ?? 'f1-custom') !== 'super-formula' ||
      value.stewardCases.length === 0) &&
    Array.isArray(value.timedParticipantDriverIds) &&
    isNullableFiniteNumber(value.timedYellowProgress)
  )
}

/** Keep external calibration refreshes out of a race that is already running. */
export function activeRaceSessionFor(
  current: ActiveRaceSession,
  nextKey: string,
  nextConfig: RaceConfig,
): ActiveRaceSession {
  return current.key === nextKey
    ? current
    : { config: nextConfig, key: nextKey }
}

export function serializeRaceCheckpoint(
  sessionKey: string,
  snapshot: RaceSnapshot,
  savedAt = Date.now(),
): string | null {
  try {
    const serialized = JSON.stringify({
      modelVersion: RACE_SIMULATION_MODEL_VERSION,
      savedAt,
      sessionKey,
      snapshot,
      version: RACE_CHECKPOINT_VERSION,
    } satisfies StoredRaceCheckpoint)

    return serialized.length <= MAX_CHECKPOINT_LENGTH ? serialized : null
  } catch {
    return null
  }
}

export function parseRaceCheckpoint(
  raw: string | null,
  sessionKey: string,
  config: RaceConfig,
  now = Date.now(),
): RaceSnapshot | null {
  if (!raw || raw.length > MAX_CHECKPOINT_LENGTH) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      !isRecord(parsed) ||
      parsed.sessionKey !== sessionKey ||
      !isFiniteNumber(parsed.savedAt) ||
      parsed.savedAt > now + 60_000 ||
      now - parsed.savedAt > RACE_CHECKPOINT_MAX_AGE_MS
    ) {
      return null
    }

    if (
      parsed.version === RACE_CHECKPOINT_VERSION &&
      parsed.modelVersion === RACE_SIMULATION_MODEL_VERSION &&
      isCompatibleRaceSnapshot(parsed.snapshot, config, {
        requireDriverObservationInbox: true,
        requireTrackSurface: true,
      })
    ) {
      const normalized = normalizeCanonicalTrackSurface(
        parsed.snapshot as RaceSnapshot,
      )

      return normalized ? migrateRaceSnapshot(normalized, config) : null
    }

    if (
      parsed.version === LEGACY_V3_RACE_CHECKPOINT_VERSION &&
      parsed.modelVersion === RACE_SIMULATION_MODEL_VERSION &&
      isCompatibleRaceSnapshot(parsed.snapshot, config, {
        requireDriverObservationInbox: true,
        requireLegacySurfaceProjection: true,
        requireTrackSurface: true,
      })
    ) {
      const normalized = normalizeCanonicalTrackSurface(
        parsed.snapshot as LegacySurfaceRaceSnapshot,
      )

      return normalized ? migrateRaceSnapshot(normalized, config) : null
    }

    if (
      parsed.version === 2 &&
      parsed.modelVersion === LEGACY_V2_RACE_SIMULATION_MODEL_VERSION &&
      isCompatibleRaceSnapshot(parsed.snapshot, config, {
        requireLegacySurfaceProjection: true,
      })
    ) {
      const hydrated = hydrateLegacyTrackSurface(
        parsed.snapshot as LegacySurfaceRaceSnapshot,
        config,
      )

      return hydrated ? migrateRaceSnapshot(hydrated, config) : null
    }

    const isF1 = (config.seriesId ?? 'f1-custom') === 'f1-custom'
    const acceptsLegacyModel =
      typeof parsed.modelVersion === 'string' &&
      LEGACY_F1_RACE_SIMULATION_MODEL_VERSIONS.has(parsed.modelVersion)

    if (!isF1 || parsed.version !== 1 || !acceptsLegacyModel) {
      return null
    }

    const migratedLegacy = migrateLegacyF1RaceSnapshot(parsed.snapshot)
    if (
      !migratedLegacy ||
      !isCompatibleRaceSnapshot(migratedLegacy, config, {
        requireLegacySurfaceProjection: true,
      })
    ) {
      return null
    }

    const hydrated = hydrateLegacyTrackSurface(migratedLegacy, config)

    return hydrated ? migrateRaceSnapshot(hydrated, config) : null
  } catch {
    return null
  }
}

export function restoreRaceCheckpoint(
  storage: StorageAdapter,
  sessionKey: string,
  config: RaceConfig,
  now = Date.now(),
  storageKey = RACE_CHECKPOINT_STORAGE_KEY,
) {
  try {
    const restored = parseRaceCheckpoint(
      storage.getItem(storageKey),
      sessionKey,
      config,
      now,
    )

    if (!restored) {
      storage.removeItem(storageKey)
    }

    return restored
  } catch {
    return null
  }
}

export function saveRaceCheckpoint(
  storage: StorageAdapter,
  sessionKey: string,
  snapshot: RaceSnapshot,
  savedAt = Date.now(),
  storageKey = RACE_CHECKPOINT_STORAGE_KEY,
) {
  const serialized = serializeRaceCheckpoint(sessionKey, snapshot, savedAt)

  if (!serialized) {
    return false
  }

  try {
    storage.setItem(storageKey, serialized)
    return true
  } catch {
    return false
  }
}
