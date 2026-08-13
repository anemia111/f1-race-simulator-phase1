import type {
  ActiveAeroMode,
  ActiveAeroState,
  CarComponents,
  EnergyStoreState,
  ErsMode,
  OvertakeEligibility,
  TireCompound,
  TirePerformanceState,
} from '../types'
import {
  createSuperFormulaControlTireInventory,
  type SuperFormulaControlTireInventory,
  type SuperFormulaControlTireSurface,
} from './superFormulaControlTires2026'
import {
  createSuperFormula2026EngineLedger,
  type SuperFormula2026EngineLedger,
} from './superFormulaEngineLedger'
import {
  createSuperFormulaLiveTireRuntime,
  type SuperFormulaLiveTireState,
} from './superFormulaLiveTires'
import {
  resolveSuperFormulaRefuellingTask,
  type SuperFormulaRefuellingTaskResolution,
} from './superFormulaRefuelling'
import {
  resolveSuperFormulaOperational,
  type SuperFormulaEventOtsPack,
  type SuperFormulaOtsResolution,
  type SuperFormulaRefuellingResolution,
  type SuperFormulaRefuellingSafetyEvidence,
} from './superFormulaOperational'

/**
 * F1-only Pirelli tyre runtime. All prior live F1 tyre fields are grouped
 * here so a SUPER FORMULA snapshot cannot carry a compound family, Pirelli
 * allocation, or coefficient-based thermal/wear state as dormant aliases.
 */
export type F1RuntimeTireState = {
  readonly compoundsUsed: TireCompound[]
  readonly pendingTire: TireCompound | null
  readonly tire: TireCompound
  readonly tireAgeLaps: number
  readonly tireCarcassTemperatureC: number
  readonly tireGrainingPercent: number
  readonly tireOverheatingPercent: number
  readonly tirePerformanceState: TirePerformanceState
  readonly tireSetsRemaining: Partial<Record<TireCompound, number>>
  readonly tireTemperatureC: number
  readonly tireThermalStressPercent: number
  readonly tireWearPercent: number
}

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
  readonly tires: F1RuntimeTireState
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
  /**
   * Dry/wet fitted control-tyre state with source-bound set accounting. It
   * deliberately has no F1 compound or coefficient-based tyre model.
   */
  readonly liveTires: SuperFormulaLiveTireState
  readonly ots: SuperFormulaOtsResolution
  readonly refuelling: SuperFormulaRefuellingResolution
  /**
   * Numerical refuelling execution is unavailable unless both Article 25
   * safety evidence and a provenance-labelled event pack are present.
   */
  readonly refuellingTask: SuperFormulaRefuellingTaskResolution
}

export type RuntimeSystems = F1RuntimeSystems | SuperFormulaRuntimeSystems

export type CreateSuperFormulaRuntimeSystemsOptions = {
  readonly engineLedger?: SuperFormula2026EngineLedger
  readonly entrantId: string
  readonly eventOtsPack?: SuperFormulaEventOtsPack | null
  readonly initialTireSurface?: SuperFormulaControlTireSurface
  /** External event input is parsed fail-closed by the task resolver. */
  readonly refuellingEventPack?: unknown
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
  const liveTireRuntime = createSuperFormulaLiveTireRuntime({
    initialSurface: options.initialTireSurface,
    inventory:
      options.tireInventory ?? createSuperFormulaControlTireInventory(),
  })
  const operational = resolveSuperFormulaOperational({
    eventOtsPack: options.eventOtsPack ?? undefined,
    refuellingSafetyEvidence: options.refuellingSafetyEvidence,
  })
  const refuellingTask = resolveSuperFormulaRefuellingTask({
    eventPack: options.refuellingEventPack,
    safetyEvidence: options.refuellingSafetyEvidence,
  })

  return {
    controlTires: liveTireRuntime.controlTires,
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
    liveTires: liveTireRuntime.liveTires,
    ots: operational.ots,
    refuelling: refuellingTask.regulation,
    refuellingTask,
  }
}
