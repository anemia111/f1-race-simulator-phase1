import type {
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
import {
  FIA_2026_REGULATION_PROFILE,
  resolveF1RechargeRule,
} from '../simulation/regulations'

export const RACE_CHECKPOINT_STORAGE_KEY = 'f1-sim-race-checkpoint-v1'
export const RACE_CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60_000
/**
 * Bump whenever persisted physics/timing state can no longer be continued
 * faithfully. The storage schema can stay stable while old engine snapshots
 * are rejected instead of mixing lap histories from different pace models.
 */
export const RACE_SIMULATION_MODEL_VERSION = '2026.08.09.1'
const RACE_CHECKPOINT_VERSION = 1
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

function isCompatibleCarSnapshot(
  value: unknown,
  expectedDriverIds: Set<string>,
  expectedTeamsByDriverId: Map<string, Team>,
  config: RaceConfig,
) {
  if (!isRecord(value) || !expectedDriverIds.has(String(value.driverId))) {
    return false
  }

  const expectedTeam = expectedTeamsByDriverId.get(String(value.driverId))
  if (
    !expectedTeam ||
    value.teamId !== expectedTeam.id ||
    typeof value.overtakeRechargeAllowanceActiveThisLap !== 'boolean' ||
    typeof value.energyLapStartedBehindSafetyCar !== 'boolean' ||
    typeof value.energyLapStartedInLowGripConditions !== 'boolean' ||
    !TIMED_RUN_PHASES.includes(
      value.timedRunPhase as (typeof TIMED_RUN_PHASES)[number],
    )
  ) {
    return false
  }

  const authoritativeRechargeRules = authoritativeRechargeRulesFor(config, {
    behindSafetyCar: value.energyLapStartedBehindSafetyCar,
    lowGripConditions: value.energyLapStartedInLowGripConditions,
    overtakeAtLapStart: value.overtakeRechargeAllowanceActiveThisLap,
    timedRunPhase: value.timedRunPhase as (typeof TIMED_RUN_PHASES)[number],
  })
  const energyStore = isRecord(value.energyStore) ? value.energyStore : null
  const overtakeEligibility = value.overtakeEligibility
  const hasCompatibleOvertakeEligibility =
    overtakeEligibility === null ||
    (isRecord(overtakeEligibility) &&
      hasExactKeys(overtakeEligibility, OVERTAKE_ELIGIBILITY_KEYS) &&
      Number.isSafeInteger(overtakeEligibility.activationLap) &&
      Number(overtakeEligibility.activationLap) >= 0 &&
      Number.isSafeInteger(overtakeEligibility.controlLineIndex) &&
      Number(overtakeEligibility.controlLineIndex) >= 0 &&
      Number(overtakeEligibility.controlLineIndex) <
        (config.track.overtakeControlLines?.length ?? 0) &&
      isFiniteInRange(overtakeEligibility.detectedGapSeconds, 0, 1_000) &&
      typeof overtakeEligibility.eligible === 'boolean')
  const isRaceDistanceStage = ['sprint', 'race', 'race2'].includes(
    config.weekendStage ?? 'race',
  )
  const hasCompatibleOvertakeAuthorization =
    config.overtakeSystem === 'ots' ||
    !isRaceDistanceStage ||
    value.overtakeStatus === 'disabled' ||
    (isRecord(overtakeEligibility) && overtakeEligibility.eligible === true)
  const superclipActive =
    isFiniteNumber(value.superClippingIntensity) &&
    isFiniteNumber(value.superClippingRegenPowerKw) &&
    (value.superClippingIntensity > ENERGY_EPSILON ||
      value.superClippingRegenPowerKw > ENERGY_EPSILON)
  const hasCompatibleSuperclipEpisode = superclipActive
    ? isFiniteInRange(value.superClippingIntensity, 0, 1) &&
      isFiniteInRange(
        value.superClippingRegenPowerKw,
        0,
        MAX_PERSISTED_POWER_KW,
      ) &&
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
    hasCompatibleOvertakeEligibility &&
    hasCompatibleOvertakeAuthorization &&
    isFiniteInRange(
      value.overtakeEnergyRemainingMj,
      0,
      FIA_2026_REGULATION_PROFILE.energy.overtakeAdditionalEnergyPerLapMj,
    ) &&
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
    (value.activeAeroState === undefined ||
      isActiveAeroState(value.activeAeroState)) &&
    isFiniteInRange(value.ersBatteryPercent, 0, 100) &&
    isFiniteNumber(value.fuelLoadKg) &&
    isFiniteNumber(value.tireWearPercent) &&
    typeof value.passedDoubleYellowThisLap === 'boolean' &&
    isNullableFiniteTuple(value.currentLapSectorTimes, 3) &&
    isNullableFiniteTuple(value.currentLapMiniSectorTimes, 24) &&
    Array.isArray(value.lapHistory) &&
    Array.isArray(value.penalties) &&
    isCompatibleEnergyStoreState(
      value.energyStore,
      expectedTeam,
      authoritativeRechargeRules,
    ) &&
    isRecord(value.energyStore) &&
    isFiniteInRange(value.ersPowerKw, 0, MAX_PERSISTED_POWER_KW) &&
    approximatelyEqual(
      value.ersPowerKw,
      Number(value.energyStore.actualDeploymentPowerKw),
    ) &&
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
      value.superClippingRecoveredThisLapMj,
      0,
      Number(value.energyStore.rechargedAtCuKBusThisLapMJ),
    ) &&
    hasCompatibleSuperclipEpisode &&
    isRecord(value.components) &&
    isRecord(value.tireSetsRemaining)
  )
}

function migrateRaceSnapshot(
  value: unknown,
  config: RaceConfig,
): RaceSnapshot {
  const snapshot = value as unknown as RaceSnapshot

  return {
    ...snapshot,
    cars: snapshot.cars.map((car) => {
      const persisted = car as CarSnapshotWithLegacyLateralState
      const lateralOffsetM =
        persisted.lateralOffsetM ?? persisted.trackLateralOffset ?? 0
      const lateralVelocityMps = persisted.lateralVelocityMps ?? 0
      const desiredLateralOffsetM =
        persisted.desiredLateralOffsetM ?? lateralOffsetM
      const activeAeroState =
        (config.seriesId ?? 'f1-custom') === 'f1-custom'
          ? (persisted.activeAeroState ?? createInitialActiveAeroState())
          : createInitialActiveAeroState()

      return {
        ...car,
        activeAeroMode: activeAeroDisplayModeForState(activeAeroState),
        activeAeroState,
        desiredLateralOffsetM,
        lateralOffsetM,
        lateralVelocityMps,
        trackLateralOffset: lateralOffsetM,
      }
    }),
  }
}

type CarSnapshotWithLegacyLateralState = Omit<
  RaceSnapshot['cars'][number],
  | 'desiredLateralOffsetM'
  | 'lateralOffsetM'
  | 'lateralVelocityMps'
  | 'trackLateralOffset'
> &
  Partial<
    Pick<
      RaceSnapshot['cars'][number],
      | 'desiredLateralOffsetM'
      | 'lateralOffsetM'
      | 'lateralVelocityMps'
      | 'trackLateralOffset'
    >
  >

function isCompatibleRaceSnapshot(value: unknown, config: RaceConfig) {
  if (!isRecord(value)) {
    return false
  }

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
    typeof value.lowGripConditions !== 'boolean' ||
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
    isFiniteTuple(value.rubberLevelBySector, 3) &&
    isFiniteTuple(value.surfaceWaterMmBySector, 3) &&
    isFiniteTuple(value.dryingLineBySector, 3) &&
    Array.isArray(value.events) &&
    Array.isArray(value.stewardCases) &&
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
      parsed.version !== RACE_CHECKPOINT_VERSION ||
      parsed.modelVersion !== RACE_SIMULATION_MODEL_VERSION ||
      parsed.sessionKey !== sessionKey ||
      !isFiniteNumber(parsed.savedAt) ||
      parsed.savedAt > now + 60_000 ||
      now - parsed.savedAt > RACE_CHECKPOINT_MAX_AGE_MS ||
      !isCompatibleRaceSnapshot(parsed.snapshot, config)
    ) {
      return null
    }

    return migrateRaceSnapshot(parsed.snapshot, config)
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
