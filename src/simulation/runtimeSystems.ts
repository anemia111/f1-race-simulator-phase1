import type {
  ActiveAeroMode,
  ActiveAeroState,
  CarComponents,
  EnergyStoreState,
  ErsMode,
  OvertakeEligibility,
} from '../types'
import {
  createSuperFormulaControlTireInventory,
  type SuperFormulaControlTireInventory,
} from './superFormulaControlTires2026'
import {
  createSuperFormula2026EngineLedger,
  type SuperFormula2026EngineLedger,
} from './superFormulaEngineLedger'
import {
  resolveSuperFormulaOperational,
  type SuperFormulaEventOtsPack,
  type SuperFormulaOtsResolution,
  type SuperFormulaRefuellingResolution,
  type SuperFormulaRefuellingSafetyEvidence,
} from './superFormulaOperational'

/**
 * F1-only runtime truth. These fields deliberately retain their established
 * names while moving one level below `CarSnapshot.runtimeSystems`; this makes
 * a category mistake impossible to conceal behind zero-valued aliases.
 */
export type F1RuntimeSystems = {
  readonly kind: 'f1'
  readonly activeAeroMode: ActiveAeroMode
  readonly activeAeroState: ActiveAeroState
  readonly components: CarComponents
  readonly energyDeployedThisLapMj: number
  readonly energyHarvestedThisLapMj: number
  readonly energyLapStartedBehindSafetyCar: boolean
  readonly energyLapStartedInLowGripConditions: boolean
  readonly energyStore: EnergyStoreState
  readonly ersBatteryPercent: number
  readonly ersMode: ErsMode
  readonly ersPowerKw: number
  readonly overtakeEligibility: OvertakeEligibility | null
  readonly overtakeEnergyRemainingMj: number
  readonly overtakeRechargeAllowanceActiveThisLap: boolean
  readonly standingStartMguKReleaseLatched: boolean
  readonly superClippingDurationSeconds: number
  readonly superClippingIntensity: number
  readonly superClippingRecoveredThisLapMj: number
  readonly superClippingRegenPowerKw: number
  readonly superClippingStartedAtProgress: number | null
  readonly superClippingStartedAtSeconds: number | null
}

/**
 * No verified 2026 SF gearbox allocation or wear rule is bundled yet. Its
 * explicit unavailable state prevents the F1 multi-component pool being
 * reused as a substitute.
 */
export type SuperFormulaGearboxRuntime = {
  readonly availability: 'unavailable'
  readonly conditionPercent: null
  readonly reason: string
}

/**
 * SUPER FORMULA runtime truth contains only the source-backed engine ledger,
 * control-tyre inventory, OTS policy, refuelling safety status, and an
 * explicitly unavailable gearbox model. It has no ERS, SOC, active-aero, or
 * F1-component compatibility fields.
 */
export type SuperFormulaRuntimeSystems = {
  readonly controlTires: SuperFormulaControlTireInventory
  readonly engineLedger: SuperFormula2026EngineLedger
  readonly gearbox: SuperFormulaGearboxRuntime
  readonly kind: 'super-formula'
  readonly ots: SuperFormulaOtsResolution
  readonly refuelling: SuperFormulaRefuellingResolution
}

export type RuntimeSystems = F1RuntimeSystems | SuperFormulaRuntimeSystems

export type CreateSuperFormulaRuntimeSystemsOptions = {
  readonly engineLedger?: SuperFormula2026EngineLedger
  readonly entrantId: string
  readonly eventOtsPack?: SuperFormulaEventOtsPack | null
  readonly refuellingSafetyEvidence?: SuperFormulaRefuellingSafetyEvidence | null
  readonly tireInventory?: SuperFormulaControlTireInventory
}

export function isF1RuntimeSystems(
  systems: RuntimeSystems,
): systems is F1RuntimeSystems {
  return systems.kind === 'f1'
}

export function isSuperFormulaRuntimeSystems(
  systems: RuntimeSystems,
): systems is SuperFormulaRuntimeSystems {
  return systems.kind === 'super-formula'
}

/**
 * Creates the SF branch from source-bound domain records. A missing event OTS
 * pack remains unavailable; this factory never introduces 200 seconds, 37 kW,
 * a cooldown, Pirelli compounds, or F1 electrical state.
 */
export function createSuperFormulaRuntimeSystems(
  options: CreateSuperFormulaRuntimeSystemsOptions,
): SuperFormulaRuntimeSystems {
  const operational = resolveSuperFormulaOperational({
    eventOtsPack: options.eventOtsPack ?? undefined,
    refuellingSafetyEvidence: options.refuellingSafetyEvidence,
  })

  return {
    controlTires:
      options.tireInventory ?? createSuperFormulaControlTireInventory(),
    engineLedger:
      options.engineLedger ??
      createSuperFormula2026EngineLedger({ entrantId: options.entrantId }),
    gearbox: {
      availability: 'unavailable',
      conditionPercent: null,
      reason:
        'No verified 2026 SUPER FORMULA gearbox allocation or wear rule is bundled.',
    },
    kind: 'super-formula',
    ots: operational.ots,
    refuelling: operational.refuelling,
  }
}
