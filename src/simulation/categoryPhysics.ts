import type { ExecutableSeriesId } from '../series/seriesIds'

export type CategoryPhysicsProfile = {
  combustionPowerKw: number
  dragAreaScale: number
  /** Mechanical efficiency from crankshaft to the driven wheel contact patch. */
  drivetrainEfficiency: number
  gearCount: number
  hybridDeploymentPowerLimitKw: number
  id: ExecutableSeriesId
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
 * minimum mass. SF uses JRP's 405 kW and 670 kg specification; its OTS is
 * combustion boost, not an F1-style Energy Store.
 *
 * The aerodynamic and tyre figures below are derived, not published. Teams do
 * not release lift areas, friction coefficients or centre-of-gravity heights.
 * They are set so the resulting lateral acceleration matches the peak cornering
 * loads each category is known to reach, and `tyreForces.test.ts` is what holds
 * them to that. Never present them as official values.
 */
const CATEGORY_PHYSICS: Record<ExecutableSeriesId, CategoryPhysicsProfile> = {
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
    /**
     * Straight-mode bodywork leaves roughly a third of the drag area behind,
     * not two thirds. At 0.47 the reference car's straight-mode CdA came out
     * near 0.38 m2, less than half of any Formula car ever measured, and gave
     * it a terminal velocity around 500 km/h. Solving the power balance the
     * other way — an ICE-only 376 kW at the wheels against a 340 km/h peak,
     * which is what the regulation's deployment ramp leaves at that speed —
     * asks for about 0.73 m2, which this multiplier produces.
     */
    straightAeroDragMultiplier: 0.639,
    topGearDesignSpeedKph: 402,
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
  seriesId: ExecutableSeriesId | undefined,
): CategoryPhysicsProfile {
  return CATEGORY_PHYSICS[seriesId ?? 'f1-custom']
}

export function categoryHasHybridEnergyStore(
  profile: CategoryPhysicsProfile,
) {
  return profile.hybridDeploymentPowerLimitKw > 0
}
