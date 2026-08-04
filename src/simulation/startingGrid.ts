import {
  FORMULA_VEHICLE_LENGTH_M,
  LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
} from './vehicleGeometry'

/**
 * Longitudinal pitch between consecutive grid boxes, in metres.
 *
 * The grid is painted on the road, so its spacing is a distance and not a
 * fraction of the lap. It used to be the fraction: 0.00105 of a lap on every
 * circuit, which is 7.35 m at Spa, 5.54 m at Albert Park and 3.50 m at Monaco.
 * The car is 5.2 m long, so at Monaco the field started the race inside one
 * another.
 *
 * That became a problem once the occupancy model began reading these
 * positions. `requiredLongitudinalCentreSeparationM` demands two half-lengths
 * plus `LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M`, which is 6.45 m, and every
 * circuit shorter than about 6.14 km opened the race already in breach of it.
 * The solver held those cars still until they were clear, so the field left the
 * line in stutters and holes rather than together.
 *
 * Eight metres is the FIA grid box pitch, and it clears the requirement by
 * 1.55 m on every circuit.
 */
export const STARTING_GRID_BOX_PITCH_M = 8

/**
 * Separation the occupancy model demands between two cars in line.
 *
 * Derived here rather than assumed, so the grid states what it clears.
 */
export const STARTING_GRID_REQUIRED_SEPARATION_M =
  FORMULA_VEHICLE_LENGTH_M + LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M

/** Longitudinal spacing between consecutive grid slots, as a lap fraction. */
export function startingGridSlotGap(lapLengthM: number) {
  return STARTING_GRID_BOX_PITCH_M / Math.max(1, lapLengthM)
}

/** A complete left/right row, as a lap fraction. */
export function startingGridRowGap(lapLengthM: number) {
  return startingGridSlotGap(lapLengthM) * 2
}

/** Even positions sit one box behind the odd position in the same row. */
export function startingGridStagger(lapLengthM: number) {
  return startingGridSlotGap(lapLengthM)
}

export function startingGridDistance(gridIndex: number, lapLengthM: number) {
  const normalizedIndex = Math.max(0, Math.floor(gridIndex))
  const row = Math.floor(normalizedIndex / 2)
  const stagger =
    normalizedIndex % 2 === 0 ? 0 : startingGridStagger(lapLengthM)

  return 1 - row * startingGridRowGap(lapLengthM) - stagger
}
