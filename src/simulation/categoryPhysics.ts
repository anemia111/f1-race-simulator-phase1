import type { SeriesId } from '../series/types'

export type CategoryPhysicsProfile = {
  combustionPowerKw: number
  downforceTractionScale: number
  dragAreaScale: number
  fullThrottleBrakeUtilizationLimit: number
  gearCount: number
  hybridDeploymentPowerLimitKw: number
  id: SeriesId
  internalAccelerationScale: number
  lowSpeedOverspeedBrakeBase: number
  lowSpeedOverspeedBrakeCurvatureScale: number
  maximumBrakeDecelerationMps2: number
  maximumEngineRpm: number
  minimumEngineRpm: number
  minimumMassKg: number
  minimumTopGearEfficiency: number
  overtakeBoostPowerKw: number
  partialAeroDragMultiplier: number
  rollingResistanceCoefficient: number
  straightAeroDragMultiplier: number
  topGearEfficiencyFalloffPerKph: number
  topGearEfficiencyStartKph: number
  tractionScale: number
}

/**
 * Category fundamentals used by the longitudinal model.
 *
 * Published figures are kept as physical inputs rather than converted into
 * speed caps. F1 uses the FIA 2026 400 kW ICE / 350 kW MGU-K split and 768 kg
 * minimum mass. F2 uses the official 620 hp, 795 kg and 3.5 g figures. F3 uses
 * the official 380 hp, 300 km/h, 2.6 g lateral and 1.9 g braking figures. SF
 * uses JRP's 405 kW and 670 kg specification; its OTS is combustion boost, not
 * an F1-style Energy Store.
 */
const CATEGORY_PHYSICS: Record<SeriesId, CategoryPhysicsProfile> = {
  'f1-custom': {
    combustionPowerKw: 400,
    downforceTractionScale: 1,
    dragAreaScale: 1,
    fullThrottleBrakeUtilizationLimit: 0.48,
    gearCount: 8,
    hybridDeploymentPowerLimitKw: 350,
    id: 'f1-custom',
    internalAccelerationScale: 1.06,
    lowSpeedOverspeedBrakeBase: 0.26,
    lowSpeedOverspeedBrakeCurvatureScale: 0.5,
    maximumBrakeDecelerationMps2: 49.05,
    maximumEngineRpm: 15_000,
    minimumEngineRpm: 4_200,
    minimumMassKg: 768,
    minimumTopGearEfficiency: 0.815,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.78,
    rollingResistanceCoefficient: 0.012,
    straightAeroDragMultiplier: 0.47,
    topGearEfficiencyFalloffPerKph: 0.0062,
    topGearEfficiencyStartKph: 402,
    tractionScale: 1,
  },
  f2: {
    combustionPowerKw: 456.3,
    downforceTractionScale: 0.76,
    dragAreaScale: 1.08,
    fullThrottleBrakeUtilizationLimit: 0.5,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'f2',
    internalAccelerationScale: 1,
    lowSpeedOverspeedBrakeBase: 0.15,
    lowSpeedOverspeedBrakeCurvatureScale: 0.16,
    maximumBrakeDecelerationMps2: 34.34,
    maximumEngineRpm: 8_750,
    minimumEngineRpm: 3_600,
    minimumMassKg: 795,
    minimumTopGearEfficiency: 0.68,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.91,
    rollingResistanceCoefficient: 0.013,
    straightAeroDragMultiplier: 0.8,
    topGearEfficiencyFalloffPerKph: 0.009,
    topGearEfficiencyStartKph: 326,
    tractionScale: 0.86,
  },
  f3: {
    combustionPowerKw: 279.4,
    downforceTractionScale: 0.55,
    dragAreaScale: 0.76,
    fullThrottleBrakeUtilizationLimit: 0.82,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'f3',
    internalAccelerationScale: 1,
    lowSpeedOverspeedBrakeBase: 0.1,
    lowSpeedOverspeedBrakeCurvatureScale: 0.08,
    maximumBrakeDecelerationMps2: 18.64,
    maximumEngineRpm: 8_000,
    minimumEngineRpm: 3_400,
    minimumMassKg: 699,
    minimumTopGearEfficiency: 0.62,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.92,
    rollingResistanceCoefficient: 0.0135,
    straightAeroDragMultiplier: 0.83,
    topGearEfficiencyFalloffPerKph: 0.014,
    topGearEfficiencyStartKph: 288,
    tractionScale: 0.78,
  },
  'super-formula': {
    combustionPowerKw: 405,
    downforceTractionScale: 0.9,
    dragAreaScale: 0.95,
    fullThrottleBrakeUtilizationLimit: 0.45,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'super-formula',
    internalAccelerationScale: 1.02,
    lowSpeedOverspeedBrakeBase: 0.13,
    lowSpeedOverspeedBrakeCurvatureScale: 0.12,
    maximumBrakeDecelerationMps2: 43.16,
    maximumEngineRpm: 10_500,
    minimumEngineRpm: 4_000,
    minimumMassKg: 670,
    minimumTopGearEfficiency: 0.68,
    overtakeBoostPowerKw: 37,
    partialAeroDragMultiplier: 1,
    rollingResistanceCoefficient: 0.0125,
    straightAeroDragMultiplier: 1,
    topGearEfficiencyFalloffPerKph: 0.01,
    topGearEfficiencyStartKph: 305,
    tractionScale: 0.94,
  },
}

export function categoryPhysicsFor(
  seriesId: SeriesId | undefined,
): CategoryPhysicsProfile {
  return CATEGORY_PHYSICS[seriesId ?? 'f1-custom']
}

export function categoryHasHybridEnergyStore(
  profile: CategoryPhysicsProfile,
) {
  return profile.hybridDeploymentPowerLimitKw > 0
}

export function categoryGearForSpeed(
  speedKph: number,
  profile: CategoryPhysicsProfile,
) {
  if (speedKph <= 0) {
    return 0
  }

  const usableSpeedRangeKph =
    profile.topGearEfficiencyStartKph * 1.04 - 28

  return Math.min(
    profile.gearCount,
    Math.max(
      1,
      Math.ceil(
        ((speedKph - 28) / Math.max(1, usableSpeedRangeKph)) *
          profile.gearCount,
      ),
    ),
  )
}

export function categoryEngineRpmForSpeed(options: {
  brakePercent: number
  gear: number
  profile: CategoryPhysicsProfile
  speedKph: number
  throttlePercent: number
}) {
  if (options.speedKph <= 0 || options.gear <= 0) {
    return 0
  }

  const gearBandProgress =
    ((options.speedKph /
      Math.max(1, options.profile.topGearEfficiencyStartKph)) *
      options.profile.gearCount -
      (options.gear - 1)) %
    1
  const normalizedBand = Math.min(
    1,
    Math.max(0, Number.isFinite(gearBandProgress) ? gearBandProgress : 0),
  )
  const throttleLift =
    (options.throttlePercent / 100) *
    (options.profile.maximumEngineRpm - options.profile.minimumEngineRpm) *
    0.08
  const brakingDrop =
    (options.brakePercent / 100) *
    (options.profile.maximumEngineRpm - options.profile.minimumEngineRpm) *
    0.08

  return Math.round(
    Math.min(
      options.profile.maximumEngineRpm,
      Math.max(
        options.profile.minimumEngineRpm,
        options.profile.minimumEngineRpm +
          normalizedBand *
            (options.profile.maximumEngineRpm -
              options.profile.minimumEngineRpm) *
            0.86 +
          throttleLift -
          brakingDrop,
      ),
    ),
  )
}
