/**
 * Deterministic lane-coordinate dynamics and rectangular occupancy checks.
 *
 * Lateral offset is measured in metres from the stored centreline. Positive
 * and negative are the two sides of the circuit; this module does not attach
 * either sign to "inside" because that depends on the local turn direction.
 * These are pure state transforms. They have no RNG, field-array ordering or
 * render-space dependency.
 */
import type { TrackDefinition } from '../types'
import { trackWidthMeters } from './physicalLap'
import {
  DEFAULT_FORMULA_VEHICLE_FOOTPRINT,
  LATERAL_VEHICLE_SAFETY_MARGIN_M,
  OVERTAKE_LATERAL_SAFETY_MARGIN_M,
  LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
  resolveVehicleFootprint,
  requiredLateralCentreSeparationM,
  requiredLongitudinalCentreSeparationM,
  TRACK_EDGE_SAFETY_MARGIN_M,
  type VehicleFootprint,
} from './vehicleGeometry'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const finiteOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? (value as number) : fallback
const positiveFiniteOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : fallback
const compareDriverIds = (first: string, second: string) =>
  first < second ? -1 : first > second ? 1 : 0

/**
 * These limits describe movement relative to the course centreline, not the
 * car's total cornering acceleration. A 2.8 m/s lane speed changes one car
 * width in roughly 0.7 s; 4.0 m/s^2 reaches it without a one-tick jump.
 */
export const MAX_LATERAL_SPEED_MPS = 2.8
export const MAX_LATERAL_ACCELERATION_MPS2 = 4
/** A long worker stall is integrated in small stable pieces, up to 3 seconds. */
export const MAX_LATERAL_STEP_SECONDS = 3
export const LATERAL_SUBSTEP_SECONDS = 0.05
/** Smooth final approach instead of a bang-bang limit cycle at the target. */
const LATERAL_TARGET_RESPONSE_SECONDS = 0.25
/** One millimetre is far below the accuracy of the stored centreline. */
const LATERAL_SETTLING_TOLERANCE_M = 0.001
/** Prevent strict rectangle tests from failing on a floating-point boundary. */
const OCCUPANCY_NUMERIC_BUFFER_M = 1e-6

export type LateralState = {
  lateralOffsetM: number
  lateralVelocityMps: number
  desiredLateralOffsetM: number
}

export type LateralMotionLimits = {
  maxLateralAccelerationMps2: number
  maxLateralSpeedMps: number
}

export type LateralBounds = {
  maxOffsetM: number
  minOffsetM: number
  usableHalfWidthM: number
}

export type LateralVehicle = {
  driverId: string
  footprint?: Partial<VehicleFootprint>
  lateralOffsetM: number
  totalDistanceM: number
}

export type RelativeTrafficVehicle = LateralVehicle & {
  forwardDistanceM: number
  lateralSeparationM: number
  signedLongitudinalDistanceM: number
}

export type LateralReservationRequest = LateralVehicle & {
  desiredLateralOffsetM: number
  /** Higher values reserve their intended corridor first. */
  priority: number
}

export type LongitudinalOccupancyCandidate = LateralVehicle & {
  candidateLateralOffsetM?: number
  candidateTotalDistanceM: number
  /** Used only to break an exact same-position tie deterministically. */
  priority?: number
  /**
   * The driver has conceded the road and is not defending it.
   *
   * The occupancy rule exists so two cars cannot occupy the same rectangle,
   * and it is the right rule between drivers who are racing. It is the wrong
   * rule when one has been told to let the other past: a lapped car under a
   * blue flag lifts and waves the leader through long before a full car width
   * plus margin of centre separation exists, and holding the leader behind
   * until that separation is measured leaves the flag with no effect at all.
   *
   * When set, the lateral requirement is treated as met without requiring the
   * offset to be reached. The concession stands in for the movement rather
   * than the movement being simulated.
   */
  concedesRoad?: boolean
}

export type OccupancyMargins = {
  lateralSafetyMarginM?: number
  longitudinalSafetyMarginM?: number
}

function finiteSafetyMargin(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback
}

/**
 * Course-coordinate limits from the retained simulator-policy road-width
 * fallback. `TrackDefinition.width` is render-only and no surveyed
 * carriageway width is currently available.
 */
export function lateralBoundsForTrack(
  track: TrackDefinition,
  options: {
    edgeSafetyMarginM?: number
    footprint?: Partial<VehicleFootprint>
  } = {},
): LateralBounds {
  const footprint = resolveVehicleFootprint(options.footprint)
  const edgeMarginM = finiteSafetyMargin(
    options.edgeSafetyMarginM,
    TRACK_EDGE_SAFETY_MARGIN_M,
  )
  const usableHalfWidthM = Math.max(
    0,
    trackWidthMeters(track) / 2 - footprint.widthM / 2 - edgeMarginM,
  )

  return {
    maxOffsetM: usableHalfWidthM,
    minOffsetM: -usableHalfWidthM,
    usableHalfWidthM,
  }
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus
}

/** Forward physical distance on a closed lap, independent of completed laps. */
export function wrappedForwardDistanceM(
  fromTotalDistanceM: number,
  toTotalDistanceM: number,
  lapLengthM: number,
) {
  const length = positiveFiniteOr(lapLengthM, 0)

  if (length <= 0) {
    return 0
  }

  return positiveModulo(
    finiteOr(toTotalDistanceM, 0) - finiteOr(fromTotalDistanceM, 0),
    length,
  )
}

/** Shortest signed physical separation on a closed lap. */
export function wrappedSignedDistanceM(
  fromTotalDistanceM: number,
  toTotalDistanceM: number,
  lapLengthM: number,
) {
  const length = positiveFiniteOr(lapLengthM, 0)

  if (length <= 0) {
    return 0
  }

  const forward = wrappedForwardDistanceM(
    fromTotalDistanceM,
    toTotalDistanceM,
    length,
  )

  return forward > length / 2 ? forward - length : forward
}

/**
 * Neighbours in physical course coordinates. Results are sorted by measured
 * separation and driver id, so reversing the input field cannot change them.
 */
export function lateralTrafficContext(options: {
  lapLengthM: number
  maxLongitudinalDistanceM?: number
  subject: LateralVehicle
  vehicles: readonly LateralVehicle[]
}): RelativeTrafficVehicle[] {
  const maxDistanceM = positiveFiniteOr(
    options.maxLongitudinalDistanceM,
    Number.POSITIVE_INFINITY,
  )
  const subjectOffsetM = finiteOr(options.subject.lateralOffsetM, 0)

  return options.vehicles
    .filter((vehicle) => vehicle.driverId !== options.subject.driverId)
    .map((vehicle): RelativeTrafficVehicle => {
      const signedLongitudinalDistanceM = wrappedSignedDistanceM(
        options.subject.totalDistanceM,
        vehicle.totalDistanceM,
        options.lapLengthM,
      )

      return {
        ...vehicle,
        forwardDistanceM: wrappedForwardDistanceM(
          options.subject.totalDistanceM,
          vehicle.totalDistanceM,
          options.lapLengthM,
        ),
        lateralOffsetM: finiteOr(vehicle.lateralOffsetM, 0),
        lateralSeparationM:
          finiteOr(vehicle.lateralOffsetM, 0) - subjectOffsetM,
        signedLongitudinalDistanceM,
        totalDistanceM: finiteOr(vehicle.totalDistanceM, 0),
      }
    })
    .filter(
      (vehicle) =>
        Math.abs(vehicle.signedLongitudinalDistanceM) <= maxDistanceM,
    )
    .sort(
      (first, second) =>
        Math.abs(first.signedLongitudinalDistanceM) -
          Math.abs(second.signedLongitudinalDistanceM) ||
        compareDriverIds(first.driverId, second.driverId),
    )
}

/** True when two safety-expanded rectangular footprints intersect. */
export function vehicleOccupanciesOverlap(options: {
  first: LateralVehicle
  lapLengthM: number
  margins?: OccupancyMargins
  second: LateralVehicle
}) {
  const lateralRequiredM = requiredLateralCentreSeparationM(
    options.first.footprint,
    options.second.footprint,
    finiteSafetyMargin(
      options.margins?.lateralSafetyMarginM,
      LATERAL_VEHICLE_SAFETY_MARGIN_M,
    ),
  )
  const longitudinalRequiredM = requiredLongitudinalCentreSeparationM(
    options.first.footprint,
    options.second.footprint,
    finiteSafetyMargin(
      options.margins?.longitudinalSafetyMarginM,
      LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
    ),
  )
  const lateralDistanceM = Math.abs(
    finiteOr(options.first.lateralOffsetM, 0) -
      finiteOr(options.second.lateralOffsetM, 0),
  )
  const longitudinalDistanceM = Math.abs(
    wrappedSignedDistanceM(
      options.first.totalDistanceM,
      options.second.totalDistanceM,
      options.lapLengthM,
    ),
  )

  return (
    lateralDistanceM < lateralRequiredM &&
    longitudinalDistanceM < longitudinalRequiredM
  )
}

export function lateralClearanceM(options: {
  first: LateralVehicle
  margins?: OccupancyMargins
  second: LateralVehicle
}) {
  return (
    Math.abs(
      finiteOr(options.first.lateralOffsetM, 0) -
        finiteOr(options.second.lateralOffsetM, 0),
    ) -
    requiredLateralCentreSeparationM(
      options.first.footprint,
      options.second.footprint,
      finiteSafetyMargin(
        options.margins?.lateralSafetyMarginM,
        LATERAL_VEHICLE_SAFETY_MARGIN_M,
      ),
    )
  )
}

/**
 * Continuous lane change with a braking-distance target velocity. The state
 * stops at the requested line instead of oscillating through it, and a delayed
 * tick is split into 50 ms integrations.
 */
export function advanceLateralState(options: {
  deltaSeconds: number
  desiredLateralOffsetM?: number
  edgeSafetyMarginM?: number
  footprint?: Partial<VehicleFootprint>
  limits?: Partial<LateralMotionLimits>
  state: Partial<LateralState>
  track: TrackDefinition
}): LateralState {
  const bounds = lateralBoundsForTrack(options.track, {
    edgeSafetyMarginM: options.edgeSafetyMarginM,
    footprint: options.footprint,
  })
  const maxLateralSpeedMps = positiveFiniteOr(
    options.limits?.maxLateralSpeedMps,
    MAX_LATERAL_SPEED_MPS,
  )
  const maxLateralAccelerationMps2 = positiveFiniteOr(
    options.limits?.maxLateralAccelerationMps2,
    MAX_LATERAL_ACCELERATION_MPS2,
  )
  const desiredLateralOffsetM = clamp(
    finiteOr(
      options.desiredLateralOffsetM,
      finiteOr(options.state.desiredLateralOffsetM, 0),
    ),
    bounds.minOffsetM,
    bounds.maxOffsetM,
  )
  let lateralOffsetM = clamp(
    finiteOr(options.state.lateralOffsetM, 0),
    bounds.minOffsetM,
    bounds.maxOffsetM,
  )
  let lateralVelocityMps = clamp(
    finiteOr(options.state.lateralVelocityMps, 0),
    -maxLateralSpeedMps,
    maxLateralSpeedMps,
  )
  let remainingSeconds = clamp(
    finiteOr(options.deltaSeconds, 0),
    0,
    MAX_LATERAL_STEP_SECONDS,
  )

  if (
    (lateralOffsetM <= bounds.minOffsetM && lateralVelocityMps < 0) ||
    (lateralOffsetM >= bounds.maxOffsetM && lateralVelocityMps > 0)
  ) {
    lateralVelocityMps = 0
  }

  while (remainingSeconds > 1e-9) {
    const stepSeconds = Math.min(LATERAL_SUBSTEP_SECONDS, remainingSeconds)
    const errorM = desiredLateralOffsetM - lateralOffsetM
    const stoppingSpeedMps = Math.sqrt(
      Math.max(0, 2 * maxLateralAccelerationMps2 * Math.abs(errorM)),
    )
    const targetVelocityMps =
      Math.sign(errorM) *
      Math.min(
        maxLateralSpeedMps,
        stoppingSpeedMps,
        Math.abs(errorM) / LATERAL_TARGET_RESPONSE_SECONDS,
      )
    const velocityChangeMps = clamp(
      targetVelocityMps - lateralVelocityMps,
      -maxLateralAccelerationMps2 * stepSeconds,
      maxLateralAccelerationMps2 * stepSeconds,
    )
    const nextVelocityMps = clamp(
      lateralVelocityMps + velocityChangeMps,
      -maxLateralSpeedMps,
      maxLateralSpeedMps,
    )
    const nextOffsetM =
      lateralOffsetM +
      ((lateralVelocityMps + nextVelocityMps) / 2) * stepSeconds

    // Do not snap velocity on an overshoot. The next substep brakes/reverses
    // within the same acceleration limit; the low-speed settling check below
    // is the only path that comes to rest exactly on the requested line.
    lateralVelocityMps = nextVelocityMps

    lateralOffsetM = clamp(
      nextOffsetM,
      bounds.minOffsetM,
      bounds.maxOffsetM,
    )

    if (
      (lateralOffsetM <= bounds.minOffsetM && lateralVelocityMps < 0) ||
      (lateralOffsetM >= bounds.maxOffsetM && lateralVelocityMps > 0)
    ) {
      lateralVelocityMps = 0
    }

    if (
      Math.abs(desiredLateralOffsetM - lateralOffsetM) <
        LATERAL_SETTLING_TOLERANCE_M &&
      Math.abs(lateralVelocityMps) <
        maxLateralAccelerationMps2 * stepSeconds + 1e-9
    ) {
      lateralOffsetM = desiredLateralOffsetM
      lateralVelocityMps = 0
    }

    remainingSeconds -= stepSeconds
  }

  return {
    desiredLateralOffsetM,
    lateralOffsetM,
    lateralVelocityMps,
  }
}

function reservationConflicts(
  request: LateralReservationRequest,
  candidateOffsetM: number,
  reservation: LateralReservationRequest,
  reservedOffsetM: number,
  lapLengthM: number,
  margins: OccupancyMargins | undefined,
) {
  const longitudinalSeparationM = Math.abs(
    wrappedSignedDistanceM(
      request.totalDistanceM,
      reservation.totalDistanceM,
      lapLengthM,
    ),
  )
  const longitudinalRequiredM = requiredLongitudinalCentreSeparationM(
    request.footprint,
    reservation.footprint,
    finiteSafetyMargin(
      margins?.longitudinalSafetyMarginM,
      LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
    ),
  )

  if (longitudinalSeparationM >= longitudinalRequiredM) {
    return false
  }

  return (
    Math.abs(candidateOffsetM - reservedOffsetM) <
    requiredLateralCentreSeparationM(
      request.footprint,
      reservation.footprint,
      finiteSafetyMargin(
        margins?.lateralSafetyMarginM,
        LATERAL_VEHICLE_SAFETY_MARGIN_M,
      ),
    )
  )
}

function reservationCandidates(
  request: LateralReservationRequest,
  track: TrackDefinition,
  edgeSafetyMarginM: number | undefined,
) {
  const bounds = lateralBoundsForTrack(track, {
    edgeSafetyMarginM,
    footprint: request.footprint,
  })
  const desiredOffsetM = clamp(
    finiteOr(request.desiredLateralOffsetM, 0),
    bounds.minOffsetM,
    bounds.maxOffsetM,
  )
  const values = new Set<number>([
    desiredOffsetM,
    clamp(
      finiteOr(request.lateralOffsetM, 0),
      bounds.minOffsetM,
      bounds.maxOffsetM,
    ),
    bounds.minOffsetM,
    0,
    bounds.maxOffsetM,
  ])

  // A quarter-metre grid is coarser than the source centreline accuracy and
  // avoids pretending that millimetre-perfect lane reservations are known.
  for (
    let offsetM = bounds.minOffsetM;
    offsetM <= bounds.maxOffsetM + 1e-9;
    offsetM += 0.25
  ) {
    values.add(clamp(offsetM, bounds.minOffsetM, bounds.maxOffsetM))
  }

  return [...values].sort(
    (first, second) =>
      Math.abs(first - desiredOffsetM) - Math.abs(second - desiredOffsetM) ||
      first - second,
  )
}

/**
 * Reserves desired corridors from immutable requests. Priority is descending;
 * driver id is the stable tie-breaker. Input array order cannot affect output.
 */
export function reserveDesiredLateralOffsets(options: {
  edgeSafetyMarginM?: number
  lapLengthM: number
  margins?: OccupancyMargins
  requests: readonly LateralReservationRequest[]
  track: TrackDefinition
}): ReadonlyMap<string, number> {
  const orderedRequests = [...options.requests].sort(
    (first, second) =>
      finiteOr(second.priority, 0) - finiteOr(first.priority, 0) ||
      compareDriverIds(first.driverId, second.driverId),
  )
  const reservations: Array<{
    offsetM: number
    request: LateralReservationRequest
  }> = []
  const result = new Map<string, number>()

  for (const request of orderedRequests) {
    const candidates = reservationCandidates(
      request,
      options.track,
      options.edgeSafetyMarginM,
    )
    const offsetM =
      candidates.find((candidateOffsetM) =>
        reservations.every(
          (reservation) =>
            !reservationConflicts(
              request,
              candidateOffsetM,
              reservation.request,
              reservation.offsetM,
              options.lapLengthM,
              options.margins,
            ),
        ),
      ) ?? candidates[0]

    reservations.push({ offsetM, request })
    result.set(request.driverId, offsetM)
  }

  return result
}

function exactPositionFrontWins(
  rear: LongitudinalOccupancyCandidate,
  front: LongitudinalOccupancyCandidate,
) {
  const rearPriority = finiteOr(rear.priority, 0)
  const frontPriority = finiteOr(front.priority, 0)

  return (
    frontPriority > rearPriority ||
    (frontPriority === rearPriority &&
      compareDriverIds(front.driverId, rear.driverId) < 0)
  )
}

/**
 * Caps one rear candidate at the safety-expanded tail of a car ahead. Once
 * their lateral rectangles have cleared, the candidate is left untouched and
 * a pass may complete naturally.
 */
export function capRearLongitudinalCandidateM(options: {
  front: LongitudinalOccupancyCandidate
  lapLengthM: number
  margins?: OccupancyMargins
  rear: LongitudinalOccupancyCandidate
}) {
  const rearCurrentM = finiteOr(options.rear.totalDistanceM, 0)
  const rearCandidateM = Math.max(
    rearCurrentM,
    finiteOr(options.rear.candidateTotalDistanceM, rearCurrentM),
  )
  const rearOffsetM = finiteOr(
    options.rear.candidateLateralOffsetM,
    finiteOr(options.rear.lateralOffsetM, 0),
  )
  const frontOffsetM = finiteOr(
    options.front.candidateLateralOffsetM,
    finiteOr(options.front.lateralOffsetM, 0),
  )
  // Passing uses the committed-racing margin, not the relaxed one. See
  // OVERTAKE_LATERAL_SAFETY_MARGIN_M.
  const requiredLateralM = requiredLateralCentreSeparationM(
    options.rear.footprint,
    options.front.footprint,
    finiteSafetyMargin(
      options.margins?.lateralSafetyMarginM,
      OVERTAKE_LATERAL_SAFETY_MARGIN_M,
    ),
  )
  const currentLateralSeparationM = Math.abs(
    finiteOr(options.rear.lateralOffsetM, 0) -
      finiteOr(options.front.lateralOffsetM, 0),
  )
  const candidateLateralSeparationM = Math.abs(rearOffsetM - frontOffsetM)

  // Both ends of the tick must be clear. Treating only a desired/end offset
  // as clear would let the rear rectangle pass through the front rectangle
  // while the lane change was still in progress.
  if (
    currentLateralSeparationM >= requiredLateralM &&
    candidateLateralSeparationM >= requiredLateralM
  ) {
    return rearCandidateM
  }

  // A conceded road is clear by declaration. See `concedesRoad`.
  if (options.front.concedesRoad === true) {
    return rearCandidateM
  }

  const lapLengthM = positiveFiniteOr(options.lapLengthM, 0)

  if (lapLengthM <= 0) {
    return rearCurrentM
  }

  const frontCurrentM = finiteOr(options.front.totalDistanceM, 0)
  const forwardDistanceM = wrappedForwardDistanceM(
    rearCurrentM,
    frontCurrentM,
    lapLengthM,
  )
  const exactPosition = forwardDistanceM < 1e-9
  const isFront = exactPosition
    ? frontCurrentM > rearCurrentM ||
      (frontCurrentM === rearCurrentM &&
        exactPositionFrontWins(options.rear, options.front))
    : true

  if (!isFront) {
    return rearCandidateM
  }

  const frontCandidateM = Math.max(
    frontCurrentM,
    finiteOr(options.front.candidateTotalDistanceM, frontCurrentM),
  )
  const frontAdvanceM = frontCandidateM - frontCurrentM
  const requiredLongitudinalM = requiredLongitudinalCentreSeparationM(
    options.rear.footprint,
    options.front.footprint,
    finiteSafetyMargin(
      options.margins?.longitudinalSafetyMarginM,
      LONGITUDINAL_VEHICLE_SAFETY_MARGIN_M,
    ),
  )
  const maximumRearAdvanceM = Math.max(
    0,
    forwardDistanceM +
      frontAdvanceM -
      requiredLongitudinalM -
      OCCUPANCY_NUMERIC_BUFFER_M,
  )

  return Math.min(rearCandidateM, rearCurrentM + maximumRearAdvanceM)
}

/**
 * Resolves all proposed longitudinal positions against one immutable field.
 * Every rear candidate is the minimum of its pairwise caps, so reversing the
 * input array produces the same driver-id map.
 */
export function resolveLongitudinalOccupancy(options: {
  candidates: readonly LongitudinalOccupancyCandidate[]
  lapLengthM: number
  margins?: OccupancyMargins
}): ReadonlyMap<string, number> {
  const orderedCandidates = [...options.candidates].sort((first, second) =>
    compareDriverIds(first.driverId, second.driverId),
  )
  let result = new Map(
    orderedCandidates.map((candidate) => {
      const currentM = finiteOr(candidate.totalDistanceM, 0)

      return [
        candidate.driverId,
        Math.max(
          currentM,
          finiteOr(candidate.candidateTotalDistanceM, currentM),
        ),
      ] as const
    }),
  )

  // A cap can propagate backwards through a same-lane train. Relax all
  // constraints from the previous immutable iteration; at most N passes are
  // needed for a chain of N cars, and no array-order dependency is introduced.
  for (let iteration = 0; iteration < orderedCandidates.length; iteration += 1) {
    const next = new Map<string, number>()
    let changed = false

    for (const rear of orderedCandidates) {
      const currentM = finiteOr(rear.totalDistanceM, 0)
      let candidateM = result.get(rear.driverId) ?? currentM

      for (const front of orderedCandidates) {
        if (front.driverId === rear.driverId) {
          continue
        }

        candidateM = Math.min(
          candidateM,
          capRearLongitudinalCandidateM({
            front: {
              ...front,
              candidateTotalDistanceM:
                result.get(front.driverId) ?? front.totalDistanceM,
            },
            lapLengthM: options.lapLengthM,
            margins: options.margins,
            rear: { ...rear, candidateTotalDistanceM: candidateM },
          }),
        )
      }

      next.set(rear.driverId, candidateM)
      changed ||=
        Math.abs(candidateM - (result.get(rear.driverId) ?? currentM)) > 1e-9
    }

    result = next

    if (!changed) {
      break
    }
  }

  return result
}

/** Convenience export for callers that need the default footprint in state setup. */
export const DEFAULT_LATERAL_VEHICLE_FOOTPRINT =
  DEFAULT_FORMULA_VEHICLE_FOOTPRINT
