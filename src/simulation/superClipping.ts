import type {
  BattlePhase,
  Driver,
  F1EnergyIntent,
  RacePaceMode,
  Team,
} from '../types'
import { driverSkillBlend } from './driverAbility'
import { effectiveMachineRating } from './machinePerformance'
import {
  FIA_2026_REGULATION_PROFILE,
  permittedMguKDcPowerKwForSpeed,
} from './regulations'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

export type SuperClippingLevel =
  | 'off'
  | 'light'
  | 'medium'
  | 'strong'
  | 'extreme'

/**
 * Strategy request only. The Energy Store owns every power, SOC, thermal and
 * recharge-ledger limit, and returns the mechanical power actually absorbed.
 */
export type SuperClippingRequest = {
  level: SuperClippingLevel
  requestedGeneratorMechanicalPowerKw: number
}

export type SuperClippingResult = SuperClippingRequest & {
  demandIntensity: number
  intensity: number
}

/**
 * High-speed opportunity derived from the authoritative C5.2.8 normal DC
 * curve. It deliberately contains no estimated terminal speed or setup/team
 * target: the opportunity grows only as permitted propulsion power falls.
 */
export function superClippingRegulatoryOpportunityForSpeedKph(speedKph: number) {
  const maximumDcPowerKw = FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw

  if (!Number.isFinite(speedKph)) {
    return {
      normalCurveReductionFraction: 0,
      normalDeploymentDcPowerKw: 0,
      opportunity: 0,
    }
  }

  const normalDeploymentDcPowerKw = permittedMguKDcPowerKwForSpeed({
    curve: 'normal',
    speedKph,
  })
  const normalCurveReductionFraction = clamp(
    1 - normalDeploymentDcPowerKw / Math.max(1, maximumDcPowerKw),
    0,
    1,
  )

  return {
    normalCurveReductionFraction,
    normalDeploymentDcPowerKw,
    opportunity: smoothstep(0.08, 0.72, normalCurveReductionFraction),
  }
}

export function superClippingLevelForIntensity(
  intensity: number,
): SuperClippingLevel {
  if (intensity < 0.04) return 'off'
  if (intensity < 0.34) return 'light'
  if (intensity < 0.63) return 'medium'
  if (intensity < 0.9) return 'strong'
  return 'extreme'
}

/**
 * Converts scheduling severity into a mechanical generator request. There is
 * no parallel ICE derate: accepted generator power is the sole propulsive
 * sacrifice applied by the longitudinal force model.
 */
export function superClippingGeneratorRequestForIntensity(
  intensityValue: number,
): SuperClippingRequest {
  const intensity = Number.isFinite(intensityValue)
    ? clamp(intensityValue, 0, 1)
    : 0

  return {
    level: superClippingLevelForIntensity(intensity),
    requestedGeneratorMechanicalPowerKw:
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw *
      Math.pow(intensity, 1.28),
  }
}

function deterministicStrategyVariation(key: string, lap: number) {
  let hash = 2166136261
  const input = `${key}:${lap}`

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return ((hash >>> 0) / 0xffffffff - 0.5) * 0.12
}

export type SuperClippingDemandOptions = {
  battlePhase: BattlePhase
  batteryPercent: number
  brakePercent: number
  deployedAtCuKBusThisLapMj: number
  driver: Driver
  energyIntent: F1EnergyIntent
  fuelLoadKg: number
  gapToAheadSeconds: number
  lap: number
  lowGripConditions: boolean
  phaseActive: boolean
  racePaceMode: RacePaceMode
  rechargeRemainingAtCuKBusMj: number
  rechargedAtCuKBusThisLapMj: number
  sessionType: 'race-distance' | 'limited-time'
  speedKph: number
  straightLengthAheadMeters: number
  straightness: number
  team: Team
  throttlePercent: number
}

export function superClippingDemandFor(options: SuperClippingDemandOptions) {
  const {
    battlePhase,
    batteryPercent,
    brakePercent,
    deployedAtCuKBusThisLapMj,
    driver,
    energyIntent,
    fuelLoadKg,
    gapToAheadSeconds,
    lap,
    lowGripConditions,
    phaseActive,
    racePaceMode,
    rechargeRemainingAtCuKBusMj,
    rechargedAtCuKBusThisLapMj,
    sessionType,
    speedKph,
    straightLengthAheadMeters,
    straightness,
    team,
    throttlePercent,
  } = options

  if (
    phaseActive ||
    lowGripConditions ||
    throttlePercent < 95 ||
    brakePercent > 3 ||
    straightness < 0.78 ||
    straightLengthAheadMeters < 150 ||
    Number.isNaN(rechargeRemainingAtCuKBusMj) ||
    rechargeRemainingAtCuKBusMj <= 0.01 ||
    batteryPercent >= 98
  ) {
    return 0
  }

  const ersManagement = driverSkillBlend(driver, {
    ersManagement: 0.72,
    raceAwareness: 0.16,
    adaptability: 0.12,
  })
  const isAttack =
    battlePhase === 'attacking' || battlePhase === 'side-by-side'
  const isDefend = battlePhase === 'defending'
  const intentReservePercent =
    (isAttack
      ? energyIntent.attackEnergyReserve
      : isDefend
        ? energyIntent.defendEnergyReserve
        : (energyIntent.attackEnergyReserve +
            energyIntent.defendEnergyReserve) /
          2) * 100
  const modeReserveAdjustment: Record<RacePaceMode, number> = {
    defend: -4,
    push: -7,
    save: 8,
    standard: 0,
  }
  const sessionReserveAdjustment = sessionType === 'limited-time' ? -5 : 0
  const reserveTarget = clamp(
    intentReservePercent +
      modeReserveAdjustment[racePaceMode] +
      sessionReserveAdjustment,
    6,
    58,
  )
  const isBattle =
    (gapToAheadSeconds > 0 && gapToAheadSeconds < 1.4) ||
    isAttack ||
    isDefend
  const batteryPressure = clamp(
    (reserveTarget - batteryPercent) / 31,
    0,
    1.2,
  )
  const netDeploymentMj = Math.max(
    0,
    deployedAtCuKBusThisLapMj - rechargedAtCuKBusThisLapMj,
  )

  if (batteryPercent >= reserveTarget + 18 && netDeploymentMj < 1) {
    return 0
  }

  const energyPressure = clamp(netDeploymentMj / 3.4, 0, 1)
  const recoveryHeadroom = Number.isFinite(rechargeRemainingAtCuKBusMj)
    ? clamp(rechargeRemainingAtCuKBusMj / 2.2, 0, 1)
    : 1
  const straightOpportunity = clamp(
    (straightLengthAheadMeters - 120) / 650,
    0.28,
    1,
  )
  const highSpeedOpportunity =
    superClippingRegulatoryOpportunityForSpeedKph(speedKph).opportunity
  const efficiencyPressure =
    (1 -
      effectiveMachineRating(team.machine.electricalDeploymentEfficiency)) *
      0.16 +
    (1 - effectiveMachineRating(team.machine.energyRecoveryEfficiency)) * 0.11
  const fuelPressure = clamp(fuelLoadKg / 110, 0, 1) * 0.055
  const managementCorrection = (0.82 - ersManagement) * 0.24
  const severeScarcity = batteryPercent < 14 ? (14 - batteryPercent) * 0.025 : 0
  const strategyVariation = deterministicStrategyVariation(driver.id, lap)
  const battleProtection = isBattle && batteryPercent >= 14 ? 0.68 : 1
  const intentAcceptance = clamp(
    0.3 + energyIntent.superclipAcceptance * 1.05,
    0.3,
    1.2,
  )
  const demand =
    (batteryPressure * 0.76 +
      energyPressure * 0.34 +
      efficiencyPressure +
      fuelPressure +
      managementCorrection +
      severeScarcity +
      strategyVariation) *
    recoveryHeadroom *
    straightOpportunity *
    highSpeedOpportunity *
    battleProtection *
    intentAcceptance

  return clamp(demand, 0, 1)
}

export function advanceSuperClipping(
  options: SuperClippingDemandOptions & {
    currentIntensity: number
    deltaSeconds: number
  },
): SuperClippingResult {
  const demandIntensity = superClippingDemandFor(options)
  const management = driverSkillBlend(options.driver, {
    ersManagement: 0.78,
    consistency: 0.12,
    raceAwareness: 0.1,
  })
  const currentIntensity = clamp(options.currentIntensity, 0, 1)
  const rising = demandIntensity > currentIntensity
  const ratePerSecond = rising
    ? 0.38 + (1 - management) * 0.26
    : 0.68 + management * 0.18
  const step = ratePerSecond * Math.max(0, options.deltaSeconds)
  const intensity = rising
    ? Math.min(demandIntensity, currentIntensity + step)
    : Math.max(demandIntensity, currentIntensity - step)
  const request = superClippingGeneratorRequestForIntensity(intensity)

  return {
    ...request,
    demandIntensity,
    intensity,
  }
}
