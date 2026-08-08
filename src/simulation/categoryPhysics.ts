import type { ExecutableSeriesId } from '../series/seriesIds'
import type { WeekendStage } from '../types'

export type F1MinimumMassRule = {
  readonly kind: 'f1-2026-session-base-plus-nominal-tyre-mass'
  /**
   * C4.7 published set mass measured from new production dry-weather tyres.
   * C4.1 uses that nominal value in dry and wet sessions; it is not replaced
   * by the actual mass of the fitted wet-weather tyres.
   */
  readonly nominalTyreMassInput:
    'fia-c4.7-published-dry-tyre-set-mass-event-input'
  readonly otherSessionBaseKg: 724
  readonly qualifyingBaseKg: 726
  readonly sourceId: 'fia-f1-2026-technical-c20'
}

export type FixedMinimumMassRule = {
  readonly kind: 'fixed-minimum-mass'
  readonly massKg: number
  readonly sourceId: string
}

export type CategoryMinimumMassRule =
  | F1MinimumMassRule
  | FixedMinimumMassRule

export type NonRegulatorySimulationMassReference = {
  readonly kind: 'non-regulatory-simulation-reference'
  readonly massKg: number
  readonly sourceId: 'legacy-f1-simulation-calibration'
}

type ResolvedMinimumVehicleMassBase = {
  readonly heatHazardAddedMassKg: number
  readonly minimumMassKg: number
  readonly regulationBaseMassKg: number
  readonly sourceId: string
  readonly status: 'resolved'
  readonly weekendStage: WeekendStage
}

export type ResolvedF1MinimumVehicleMass =
  ResolvedMinimumVehicleMassBase & {
    readonly nominalTyreMassKg: number
    readonly seriesId: 'f1-custom'
    readonly sourceId: 'fia-f1-2026-technical-c20'
  }

export type ResolvedFixedMinimumVehicleMass =
  ResolvedMinimumVehicleMassBase & {
    readonly nominalTyreMassKg: null
    readonly seriesId: 'super-formula'
  }

export type ResolvedMinimumVehicleMass =
  | ResolvedF1MinimumVehicleMass
  | ResolvedFixedMinimumVehicleMass

export type UnavailableMinimumVehicleMass = {
  readonly heatHazardAddedMassKg: number
  readonly minimumMassKg: null
  readonly nominalTyreMassKg: null
  readonly reason: 'nominal-tyre-mass-unavailable'
  readonly regulationBaseMassKg: number
  readonly seriesId: 'f1-custom'
  readonly sourceId: 'fia-f1-2026-technical-c20'
  readonly status: 'unavailable'
  readonly weekendStage: WeekendStage
}

export type MinimumVehicleMassResolution =
  | ResolvedMinimumVehicleMass
  | UnavailableMinimumVehicleMass

export type F1MinimumVehicleMassRequest = {
  readonly heatHazardAddedMassKg?: number
  /**
   * Event-supplied FIA C4.7 Nominal Tyre Mass for a dry-weather tyre set.
   * `null` is an honest unavailable state; the resolver never derives it
   * from an old all-in mass or substitutes the fitted wet-tyre mass.
   */
  readonly nominalTyreMassKg: number | null
  readonly seriesId: 'f1-custom'
  readonly weekendStage: WeekendStage
}

export type FixedMinimumVehicleMassRequest = {
  readonly seriesId: 'super-formula'
  readonly weekendStage: WeekendStage
}

export type MinimumVehicleMassRequest =
  | F1MinimumVehicleMassRequest
  | FixedMinimumVehicleMassRequest

export type OperationalVehicleMassRequest = {
  /** `null` means no FIA event observation is available. */
  readonly f1NominalTyreMassKg: number | null
  readonly heatHazardAddedMassKg?: number
  readonly physics: CategoryPhysicsProfile
  readonly weekendStage: WeekendStage
}

export type RegulatoryOperationalVehicleMass = {
  readonly basis: 'regulatory-minimum'
  readonly minimumMassResolution: ResolvedMinimumVehicleMass
  readonly operationalMassKg: number
  readonly status: 'resolved-regulatory-minimum'
}

export type ReferenceOperationalVehicleMass = {
  readonly basis: 'non-regulatory-simulation-reference'
  readonly minimumMassResolution: UnavailableMinimumVehicleMass
  readonly operationalMassKg: number
  readonly referenceMassKg: number
  readonly sourceId: 'legacy-f1-simulation-calibration'
  readonly status: 'resolved-non-regulatory-simulation-reference'
}

export type OperationalVehicleMassResolution =
  | RegulatoryOperationalVehicleMass
  | ReferenceOperationalVehicleMass

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
  minimumMassRule: CategoryMinimumMassRule
  overtakeBoostPowerKw: number
  partialAeroDragMultiplier: number
  rollingResistanceCoefficient: number
  straightAeroDragMultiplier: number
  /** Road speed at which top gear reaches the engine speed limit. */
  topGearDesignSpeedKph: number
  /**
   * Transitional force-model fallback used only when the FIA Nominal Tyre
   * Mass observation is unavailable. It is never a C4.1 minimum-mass value.
   */
  unresolvedMinimumSimulationReference:
    | NonRegulatorySimulationMassReference
    | null
}

/**
 * Category fundamentals used by the longitudinal model.
 *
 * Published figures are kept as physical inputs rather than converted into
 * speed caps. F1 uses the FIA 2026 400 kW ICE / 350 kW MGU-K split. Its mass
 * is session-dependent and resolved separately from the FIA Nominal Tyre Mass
 * input. The old 768 kg value remains only as an explicitly non-regulatory
 * simulation reference until that event input is available. SF uses JRP's
 * 405 kW and 670 kg specification; its OTS is combustion boost, not an
 * F1-style Energy Store.
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
    // C2.3.3 caps wheelbase at 3400 mm. The public maximum is used here; this
    // is not a claim to know a team's shorter homologated dimension.
    wheelbaseM: 3.4,
    trackWidthM: 2.0,
    centreOfGravityHeightM: 0.3,
    maximumEngineRpm: 15_000,
    minimumEngineRpm: 4_200,
    minimumMassRule: {
      kind: 'f1-2026-session-base-plus-nominal-tyre-mass',
      nominalTyreMassInput:
        'fia-c4.7-published-dry-tyre-set-mass-event-input',
      otherSessionBaseKg: 724,
      qualifyingBaseKg: 726,
      sourceId: 'fia-f1-2026-technical-c20',
    },
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
    unresolvedMinimumSimulationReference: {
      kind: 'non-regulatory-simulation-reference',
      massKg: 768,
      sourceId: 'legacy-f1-simulation-calibration',
    },
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
    minimumMassRule: {
      kind: 'fixed-minimum-mass',
      massKg: 670,
      sourceId: 'jaf-sf-2026-unified-regulations',
    },
    overtakeBoostPowerKw: 37,
    partialAeroDragMultiplier: 1,
    rollingResistanceCoefficient: 0.0125,
    straightAeroDragMultiplier: 1,
    topGearDesignSpeedKph: 305,
    unresolvedMinimumSimulationReference: null,
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

const weekendStages = new Set<WeekendStage>([
  'fp1',
  'fp2',
  'fp3',
  'sprintQualifying',
  'sprint',
  'qualifying',
  'qualifying2',
  'race',
  'race2',
])

function assertWeekendStage(value: WeekendStage): WeekendStage {
  if (!weekendStages.has(value)) {
    throw new Error(`Unknown weekend stage: ${String(value)}`)
  }

  return value
}

function nonNegativeMass(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative mass`)
  }

  return value
}

export function f1MinimumMassBaseKgFor(
  weekendStage: WeekendStage,
): 724 | 726 {
  const stage = assertWeekendStage(weekendStage)
  return stage === 'sprintQualifying' || stage === 'qualifying' ? 726 : 724
}

/** Resolve the regulation minimum without guessing FIA Nominal Tyre Mass. */
export function resolveMinimumVehicleMass(
  request: F1MinimumVehicleMassRequest,
): ResolvedF1MinimumVehicleMass | UnavailableMinimumVehicleMass
export function resolveMinimumVehicleMass(
  request: FixedMinimumVehicleMassRequest,
): ResolvedFixedMinimumVehicleMass
export function resolveMinimumVehicleMass(
  request: MinimumVehicleMassRequest,
): MinimumVehicleMassResolution {
  const weekendStage = assertWeekendStage(request.weekendStage)

  if (request.seriesId === 'super-formula') {
    const rule = CATEGORY_PHYSICS['super-formula'].minimumMassRule

    if (rule.kind !== 'fixed-minimum-mass') {
      throw new Error('Super Formula minimum-mass rule is misconfigured')
    }

    return {
      heatHazardAddedMassKg: 0,
      minimumMassKg: rule.massKg,
      nominalTyreMassKg: null,
      regulationBaseMassKg: rule.massKg,
      seriesId: 'super-formula',
      sourceId: rule.sourceId,
      status: 'resolved',
      weekendStage,
    }
  }

  const rule = CATEGORY_PHYSICS['f1-custom'].minimumMassRule

  if (rule.kind !== 'f1-2026-session-base-plus-nominal-tyre-mass') {
    throw new Error('F1 minimum-mass rule is misconfigured')
  }

  const heatHazardAddedMassKg = nonNegativeMass(
    request.heatHazardAddedMassKg ?? 0,
    'Heat-hazard added mass',
  )
  const regulationBaseMassKg = f1MinimumMassBaseKgFor(weekendStage)

  if (request.nominalTyreMassKg === null) {
    return {
      heatHazardAddedMassKg,
      minimumMassKg: null,
      nominalTyreMassKg: null,
      reason: 'nominal-tyre-mass-unavailable',
      regulationBaseMassKg,
      seriesId: 'f1-custom',
      sourceId: rule.sourceId,
      status: 'unavailable',
      weekendStage,
    }
  }

  const nominalTyreMassKg = nonNegativeMass(
    request.nominalTyreMassKg,
    'Nominal Tyre Mass',
  )

  if (nominalTyreMassKg === 0) {
    throw new Error('Nominal Tyre Mass must be greater than zero')
  }

  if (!Number.isInteger(nominalTyreMassKg)) {
    throw new Error('Nominal Tyre Mass must use the C4.7 whole-kilogram value')
  }

  return {
    heatHazardAddedMassKg,
    minimumMassKg:
      regulationBaseMassKg + nominalTyreMassKg + heatHazardAddedMassKg,
    nominalTyreMassKg,
    regulationBaseMassKg,
    seriesId: 'f1-custom',
    sourceId: rule.sourceId,
    status: 'resolved',
    weekendStage,
  }
}

export function resolveF1MinimumMass(
  request: Omit<F1MinimumVehicleMassRequest, 'seriesId'>,
): ResolvedF1MinimumVehicleMass | UnavailableMinimumVehicleMass {
  return resolveMinimumVehicleMass({ ...request, seriesId: 'f1-custom' })
}

/**
 * Resolves the mass used by force-model consumers. A real Nominal Tyre Mass
 * produces the C4.1 minimum. When that observation is unavailable, F1 stays
 * runnable through a separately typed, explicitly non-regulatory simulation
 * reference. Heat-hazard mass is added once in either path.
 */
export function resolveOperationalVehicleMass(
  request: OperationalVehicleMassRequest,
): OperationalVehicleMassResolution {
  const minimumMassResolution =
    request.physics.id === 'f1-custom'
      ? resolveMinimumVehicleMass({
          heatHazardAddedMassKg: request.heatHazardAddedMassKg,
          nominalTyreMassKg: request.f1NominalTyreMassKg,
          seriesId: 'f1-custom',
          weekendStage: request.weekendStage,
        })
      : resolveMinimumVehicleMass({
          seriesId: 'super-formula',
          weekendStage: request.weekendStage,
        })

  if (minimumMassResolution.status === 'resolved') {
    return {
      basis: 'regulatory-minimum',
      minimumMassResolution,
      operationalMassKg: minimumMassResolution.minimumMassKg,
      status: 'resolved-regulatory-minimum',
    }
  }

  const reference = request.physics.unresolvedMinimumSimulationReference

  if (reference === null) {
    throw new Error(
      'No non-regulatory simulation mass reference is configured for the unresolved minimum',
    )
  }

  return {
    basis: reference.kind,
    minimumMassResolution,
    operationalMassKg:
      reference.massKg + minimumMassResolution.heatHazardAddedMassKg,
    referenceMassKg: reference.massKg,
    sourceId: reference.sourceId,
    status: 'resolved-non-regulatory-simulation-reference',
  }
}
