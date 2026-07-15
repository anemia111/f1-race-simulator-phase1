import type {
  BattlePhase,
  Driver,
  RacePaceMode,
  Team,
} from '../types'
import { driverSkillBlend } from './driverAbility'
import { FIA_2026_REGULATION_PROFILE } from './regulations'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const MIN_SUPER_CLIPPING_SPEED_KPH = 280

export type SuperClippingLevel =
  | 'off'
  | 'light'
  | 'medium'
  | 'strong'
  | 'extreme'

export type SuperClippingPower = {
  drivePowerScale: number
  electricalRecoveryPowerKw: number
  level: SuperClippingLevel
  regenerativeResistancePowerKw: number
}

export type SuperClippingResult = SuperClippingPower & {
  demandIntensity: number
  intensity: number
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
 * Converts clipping severity into wheel-power loss and recovery resistance.
 * Neither value contains a target speed: terminal speed emerges in the
 * longitudinal integrator where drag, wind, slope, setup, tow, and PU output
 * are all still active.
 */
export function superClippingPowerForIntensity(options: {
  batteryPercent: number
  deltaSeconds: number
  intensity: number
  maxRechargePerLapMj: number
  recoveredThisLapMj: number
  team: Team
}): SuperClippingPower {
  const {
    batteryPercent,
    deltaSeconds,
    maxRechargePerLapMj,
    recoveredThisLapMj,
    team,
  } = options
  const intensity = clamp(options.intensity, 0, 1)
  const deploymentEfficiency = clamp(
    team.machine.electricalDeploymentEfficiency,
    0.72,
    1,
  )
  const recoveryEfficiency = clamp(
    team.machine.energyRecoveryEfficiency,
    0.68,
    1,
  )
  const systemSeverity =
    1 +
    (0.9 - deploymentEfficiency) * 0.35 +
    (0.88 - team.machine.puOutput) * 0.12
  const drivePowerScale = clamp(
    1 - Math.pow(intensity, 1.08) * 0.285 * systemSeverity,
    0.64,
    1,
  )
  const requestedResistancePowerKw =
    Math.pow(intensity, 1.3) *
    (48 + (1 - recoveryEfficiency) * 65)
  const requestedElectricalPowerKw =
    requestedResistancePowerKw * recoveryEfficiency
  const remainingLapRecoveryMj = Math.max(
    0,
    maxRechargePerLapMj - recoveredThisLapMj,
  )
  const batteryRoomMj =
    ((100 - clamp(batteryPercent, 0, 100)) / 100) *
    FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj
  const acceptanceLimitKw =
    Math.min(remainingLapRecoveryMj, batteryRoomMj) *
    1000 /
    Math.max(0.01, deltaSeconds)
  const electricalRecoveryPowerKw = clamp(
    Math.min(
      requestedElectricalPowerKw,
      acceptanceLimitKw,
      FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
    ),
    0,
    FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw,
  )

  return {
    drivePowerScale,
    electricalRecoveryPowerKw,
    level: superClippingLevelForIntensity(intensity),
    regenerativeResistancePowerKw:
      electricalRecoveryPowerKw / recoveryEfficiency,
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

export function superClippingDemandFor(options: {
  battlePhase: BattlePhase
  batteryPercent: number
  brakePercent: number
  deployedThisLapMj: number
  driver: Driver
  fuelLoadKg: number
  gapToAheadSeconds: number
  harvestedThisLapMj: number
  lap: number
  lowGripConditions: boolean
  maxRechargePerLapMj: number
  phaseActive: boolean
  racePaceMode: RacePaceMode
  sessionType: 'race-distance' | 'limited-time'
  speedKph: number
  straightLengthAheadMeters: number
  straightness: number
  team: Team
  throttlePercent: number
}) {
  const {
    battlePhase,
    batteryPercent,
    brakePercent,
    deployedThisLapMj,
    driver,
    fuelLoadKg,
    gapToAheadSeconds,
    harvestedThisLapMj,
    lap,
    lowGripConditions,
    maxRechargePerLapMj,
    phaseActive,
    racePaceMode,
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
    speedKph < MIN_SUPER_CLIPPING_SPEED_KPH ||
    throttlePercent < 90 ||
    brakePercent > 3 ||
    straightness < 0.78 ||
    straightLengthAheadMeters < 150 ||
    harvestedThisLapMj >= maxRechargePerLapMj - 0.01 ||
    batteryPercent >= 98
  ) {
    return 0
  }

  const ersManagement = driverSkillBlend(driver, {
    ersManagement: 0.72,
    raceAwareness: 0.16,
    adaptability: 0.12,
  })
  const reserveByMode: Record<RacePaceMode, number> = {
    defend: 41,
    push: 32,
    save: 52,
    standard: 43,
  }
  const isBattle =
    (gapToAheadSeconds > 0 && gapToAheadSeconds < 1.4) ||
    battlePhase === 'attacking' ||
    battlePhase === 'defending' ||
    battlePhase === 'side-by-side'
  const sessionReserve = sessionType === 'limited-time' ? -6 : 0
  const battleReserve = isBattle ? -7 : 0
  const reserveTarget = reserveByMode[racePaceMode] + sessionReserve + battleReserve
  const batteryPressure = clamp(
    (reserveTarget - batteryPercent) / 31,
    0,
    1.2,
  )
  const netDeploymentMj = Math.max(
    0,
    deployedThisLapMj - harvestedThisLapMj * 0.82,
  )

  if (batteryPercent >= reserveTarget + 18 && netDeploymentMj < 1) {
    return 0
  }

  const energyPressure = clamp(netDeploymentMj / 3.4, 0, 1)
  const recoveryHeadroom = clamp(
    (maxRechargePerLapMj - harvestedThisLapMj) /
      Math.max(0.1, maxRechargePerLapMj),
    0,
    1,
  )
  const straightOpportunity = clamp(
    (straightLengthAheadMeters - 120) / 650,
    0.28,
    1,
  )
  const efficiencyPressure =
    (1 - team.machine.electricalDeploymentEfficiency) * 0.16 +
    (1 - team.machine.energyRecoveryEfficiency) * 0.11
  const fuelPressure = clamp(fuelLoadKg / 110, 0, 1) * 0.055
  const managementCorrection = (0.82 - ersManagement) * 0.24
  const severeScarcity = batteryPercent < 14 ? (14 - batteryPercent) * 0.025 : 0
  const strategyVariation = deterministicStrategyVariation(driver.id, lap)
  const battleProtection = isBattle && batteryPercent >= 14 ? 0.68 : 1
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
    battleProtection

  return clamp(demand, 0, 1)
}

export function advanceSuperClipping(options: Parameters<
  typeof superClippingDemandFor
>[0] & {
  currentIntensity: number
  deltaSeconds: number
}): SuperClippingResult {
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
  const intensity =
    options.speedKph < MIN_SUPER_CLIPPING_SPEED_KPH
      ? 0
      : rising
        ? Math.min(demandIntensity, currentIntensity + step)
        : Math.max(demandIntensity, currentIntensity - step)
  const power = superClippingPowerForIntensity({
    batteryPercent: options.batteryPercent,
    deltaSeconds: options.deltaSeconds,
    intensity,
    maxRechargePerLapMj: options.maxRechargePerLapMj,
    recoveredThisLapMj: options.harvestedThisLapMj,
    team: options.team,
  })

  return {
    ...power,
    demandIntensity,
    intensity,
  }
}
