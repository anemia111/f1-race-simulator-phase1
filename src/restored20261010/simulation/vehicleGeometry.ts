/**
 * Physical footprint used by the lane and occupancy model.
 *
 * The 2026 FIA Formula One chassis envelope is 1.900 m wide and has a maximum
 * 3.400 m wheelbase. The regulations do not specify one simple overall-length
 * number, so the longitudinal occupancy rectangle uses a conservative 5.2 m
 * simulation footprint around that wheelbase. It is a collision envelope, not
 * a claim that every category has identical bodywork.
 *
 * Source basis: 2026 FIA Formula One Technical Regulations, section C 2.8,
 * and the FIA's published 2026 "nimble car" dimensions.
 */
export const FORMULA_VEHICLE_WIDTH_M = 1.9
export const FORMULA_VEHICLE_HALF_WIDTH_M = FORMULA_VEHICLE_WIDTH_M / 2
export const FORMULA_VEHICLE_LENGTH_M = 5.2

/** Space deliberately left between the tyre envelope and the track edge. */
export const TRACK_EDGE_SAFETY_MARGIN_M = 0.25
/** Side-to-side clearance between rectangular vehicle envelopes. */
export const LATERAL_VEHICLE_SAFETY_MARGIN_M = 0.35
/**
 * Side-to-side clearance demanded before one car may complete a pass on
 * another.
 *
 * The general margin is the room a driver leaves when there is no reason not
 * to. Committing to a pass is the case where there is a reason: drivers race
 * wheel to wheel with centimetres, not with a third of a metre, and requiring
 * the relaxed figure refused most attempts on clearance rather than on pace.
 * Two half-widths still separate the bodywork, so this permits a pass that
 * comes close, not one that drives through.
 */
export const OVERTAKE_LATERAL_SAFETY_MARGIN_M = 0.05
/** Nose-to-tail clearance in addition to the two half-lengths. */
export const LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M = 1.25

export type VehicleFootprint = {
  lengthM: number
  widthM: number
}

export const DEFAULT_FORMULA_VEHICLE_FOOTPRINT: Readonly<VehicleFootprint> = {
  lengthM: FORMULA_VEHICLE_LENGTH_M,
  widthM: FORMULA_VEHICLE_WIDTH_M,
}

const positiveFiniteOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : fallback

/**
 * Contains malformed save/custom-category values before they enter collision
 * maths. Supplying only one dimension is supported for category overrides.
 */
export function resolveVehicleFootprint(
  footprint: Partial<VehicleFootprint> | undefined,
): VehicleFootprint {
  return {
    lengthM: positiveFiniteOr(
      footprint?.lengthM,
      DEFAULT_FORMULA_VEHICLE_FOOTPRINT.lengthM,
    ),
    widthM: positiveFiniteOr(
      footprint?.widthM,
      DEFAULT_FORMULA_VEHICLE_FOOTPRINT.widthM,
    ),
  }
}

export function requiredLateralCentreSeparationM(
  first: Partial<VehicleFootprint> | undefined,
  second: Partial<VehicleFootprint> | undefined,
  safetyMarginM = LATERAL_VEHICLE_SAFETY_MARGIN_M,
) {
  const firstResolved = resolveVehicleFootprint(first)
  const secondResolved = resolveVehicleFootprint(second)
  const finiteMargin = Number.isFinite(safetyMarginM)
    ? Math.max(0, safetyMarginM)
    : LATERAL_VEHICLE_SAFETY_MARGIN_M

  return (firstResolved.widthM + secondResolved.widthM) / 2 + finiteMargin
}

export function requiredLongitudinalCentreSeparationM(
  first: Partial<VehicleFootprint> | undefined,
  second: Partial<VehicleFootprint> | undefined,
  safetyMarginM = LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
) {
  const firstResolved = resolveVehicleFootprint(first)
  const secondResolved = resolveVehicleFootprint(second)
  const finiteMargin = Number.isFinite(safetyMarginM)
    ? Math.max(0, safetyMarginM)
    : LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M

  return (firstResolved.lengthM + secondResolved.lengthM) / 2 + finiteMargin
}
