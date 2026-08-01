import type { SeriesId } from '../series/types'

export type CategoryPhysicsProfile = {
  combustionPowerKw: number
  dragAreaScale: number
  /** Mechanical efficiency from crankshaft to the driven wheel contact patch. */
  drivetrainEfficiency: number
  gearCount: number
  hybridDeploymentPowerLimitKw: number
  id: SeriesId
  maximumBrakeDecelerationMps2: number
  /**
   * Downforce coefficient times reference area, in m^2. Vertical aerodynamic
   * load is `0.5 * rho * liftAreaM2 * v^2`, the same form as the drag term, so
   * grip rises with the square of speed instead of being a fixed multiplier.
   */
  liftAreaM2: number
  /** Peak tyre friction on a dry racing surface at the reference load. */
  peakTyreFrictionCoefficient: number
  /**
   * Real tyres lose grip per newton as load rises. `mu = mu0 * (Fz/Fz_ref)^-k`
   * with this exponent as `k`, which is what makes load transfer cost lap time
   * rather than being neutral.
   */
  tyreLoadSensitivity: number
  /**
   * Rolling radius of a driven wheel, in metres. Engine speed follows from
   * road speed through this and the gearing, so it is a physical input rather
   * than a display constant.
   */
  wheelRadiusM: number
  /**
   * Ratio between first and top gear. With the rev limit and the speed top
   * gear is geared for, this fixes every intermediate ratio.
   */
  gearSpread: number
  /**
   * Fraction of the rev range where the engine makes peak torque. Power peaks
   * later, nearer the limiter, which is what makes the torque curve a curve
   * rather than a constant-power assumption.
   */
  peakTorqueRevFraction: number
  /** Wheelbase, track width and centre-of-gravity height, in metres. */
  wheelbaseM: number
  trackWidthM: number
  centreOfGravityHeightM: number
  maximumEngineRpm: number
  minimumEngineRpm: number
  minimumMassKg: number
  overtakeBoostPowerKw: number
  partialAeroDragMultiplier: number
  rollingResistanceCoefficient: number
  straightAeroDragMultiplier: number
  /** Road speed at which top gear reaches the engine speed limit. */
  topGearDesignSpeedKph: number
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
 *
 * The aerodynamic and tyre figures below are derived, not published. Teams do
 * not release lift areas, friction coefficients or centre-of-gravity heights.
 * They are set so the resulting lateral acceleration matches the peak cornering
 * loads each category is known to reach, and `tyreForces.test.ts` is what holds
 * them to that. Never present them as official values.
 */
const CATEGORY_PHYSICS: Record<SeriesId, CategoryPhysicsProfile> = {
  'f1-custom': {
    combustionPowerKw: 400,
    dragAreaScale: 1,
    drivetrainEfficiency: 0.94,
    gearCount: 8,
    hybridDeploymentPowerLimitKw: 350,
    id: 'f1-custom',
    maximumBrakeDecelerationMps2: 49.05,
    liftAreaM2: 5.0,
    peakTyreFrictionCoefficient: 1.75,
    wheelRadiusM: 0.36,
    gearSpread: 4.0,
    peakTorqueRevFraction: 0.7,
    tyreLoadSensitivity: 0.12,
    wheelbaseM: 3.6,
    trackWidthM: 2.0,
    centreOfGravityHeightM: 0.3,
    maximumEngineRpm: 15_000,
    minimumEngineRpm: 4_200,
    minimumMassKg: 768,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.78,
    rollingResistanceCoefficient: 0.012,
    straightAeroDragMultiplier: 0.47,
    topGearDesignSpeedKph: 402,
  },
  f2: {
    combustionPowerKw: 456.3,
    dragAreaScale: 1.08,
    drivetrainEfficiency: 0.93,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'f2',
    maximumBrakeDecelerationMps2: 34.34,
    liftAreaM2: 3.05,
    peakTyreFrictionCoefficient: 1.62,
    wheelRadiusM: 0.34,
    gearSpread: 4.2,
    peakTorqueRevFraction: 0.66,
    tyreLoadSensitivity: 0.13,
    wheelbaseM: 3.135,
    trackWidthM: 1.9,
    centreOfGravityHeightM: 0.31,
    maximumEngineRpm: 8_750,
    minimumEngineRpm: 3_600,
    minimumMassKg: 795,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.91,
    rollingResistanceCoefficient: 0.013,
    straightAeroDragMultiplier: 0.8,
    topGearDesignSpeedKph: 326,
  },
  f3: {
    combustionPowerKw: 279.4,
    dragAreaScale: 0.76,
    drivetrainEfficiency: 0.92,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'f3',
    maximumBrakeDecelerationMps2: 18.64,
    liftAreaM2: 2.25,
    peakTyreFrictionCoefficient: 1.52,
    wheelRadiusM: 0.33,
    gearSpread: 4.3,
    peakTorqueRevFraction: 0.64,
    tyreLoadSensitivity: 0.14,
    wheelbaseM: 3.09,
    trackWidthM: 1.83,
    centreOfGravityHeightM: 0.31,
    maximumEngineRpm: 8_000,
    minimumEngineRpm: 3_400,
    minimumMassKg: 699,
    overtakeBoostPowerKw: 0,
    partialAeroDragMultiplier: 0.92,
    rollingResistanceCoefficient: 0.0135,
    straightAeroDragMultiplier: 0.83,
    topGearDesignSpeedKph: 288,
  },
  'super-formula': {
    combustionPowerKw: 405,
    dragAreaScale: 0.95,
    drivetrainEfficiency: 0.93,
    gearCount: 6,
    hybridDeploymentPowerLimitKw: 0,
    id: 'super-formula',
    maximumBrakeDecelerationMps2: 43.16,
    liftAreaM2: 3.95,
    peakTyreFrictionCoefficient: 1.68,
    wheelRadiusM: 0.33,
    gearSpread: 4.1,
    peakTorqueRevFraction: 0.68,
    tyreLoadSensitivity: 0.125,
    wheelbaseM: 3.115,
    trackWidthM: 1.91,
    centreOfGravityHeightM: 0.3,
    maximumEngineRpm: 10_500,
    minimumEngineRpm: 4_000,
    minimumMassKg: 670,
    overtakeBoostPowerKw: 37,
    partialAeroDragMultiplier: 1,
    rollingResistanceCoefficient: 0.0125,
    straightAeroDragMultiplier: 1,
    topGearDesignSpeedKph: 305,
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
