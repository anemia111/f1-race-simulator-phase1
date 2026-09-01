import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import {
  advanceLateralState,
  capRearLongitudinalCandidateM,
  lateralBoundsForTrack,
  lateralTrafficContext,
  MAX_LATERAL_ACCELERATION_MPS2,
  MAX_LATERAL_SPEED_MPS,
  reserveDesiredLateralOffsets,
  resolveLongitudinalOccupancy,
  vehicleOccupanciesOverlap,
  wrappedForwardDistanceM,
  wrappedSignedDistanceM,
  type LateralReservationRequest,
  type LongitudinalOccupancyCandidate,
} from './lateralDynamics'
import {
  FORMULA_VEHICLE_HALF_WIDTH_M,
  FORMULA_VEHICLE_WIDTH_M,
  requiredLateralCentreSeparationM,
  requiredLongitudinalCentreSeparationM,
  TRACK_EDGE_SAFETY_MARGIN_M,
} from './vehicleGeometry'

const trackById = (id: string) => tracks.find((track) => track.id === id)!
const silverstone = trackById('silverstone-approx')
const monaco = trackById('monaco-approx')
const sortedEntries = (map: ReadonlyMap<string, number>) =>
  [...map.entries()].sort(([first], [second]) => first.localeCompare(second))

describe('lateral vehicle geometry', () => {
  it('uses the 2026 physical vehicle width and keeps the whole car off the edge', () => {
    const bounds = lateralBoundsForTrack(monaco)

    expect(FORMULA_VEHICLE_WIDTH_M).toBe(1.9)
    expect(FORMULA_VEHICLE_HALF_WIDTH_M).toBe(0.95)
    expect(
      bounds.maxOffsetM +
        FORMULA_VEHICLE_HALF_WIDTH_M +
        TRACK_EDGE_SAFETY_MARGIN_M,
    ).toBeCloseTo(5, 10)
  })

  it('does not read the render-only track width', () => {
    const renderWidthClone = { ...silverstone, width: 100_000 }

    expect(lateralBoundsForTrack(renderWidthClone)).toEqual(
      lateralBoundsForTrack(silverstone),
    )
  })

  it('uses a wider footprint to reduce the available lane', () => {
    const normal = lateralBoundsForTrack(silverstone)
    const wide = lateralBoundsForTrack(silverstone, {
      footprint: { widthM: 2.5 },
    })

    expect(wide.maxOffsetM).toBeLessThan(normal.maxOffsetM)
    expect(normal.maxOffsetM - wide.maxOffsetM).toBeCloseTo(0.3, 10)
  })
})

describe('advanceLateralState', () => {
  it('changes line continuously rather than teleporting to the target', () => {
    const next = advanceLateralState({
      deltaSeconds: 0.05,
      desiredLateralOffsetM: 4,
      state: {
        desiredLateralOffsetM: 0,
        lateralOffsetM: 0,
        lateralVelocityMps: 0,
      },
      track: silverstone,
    })

    expect(next.lateralOffsetM).toBeGreaterThan(0)
    expect(next.lateralOffsetM).toBeLessThan(0.1)
    expect(next.lateralOffsetM).toBeLessThan(next.desiredLateralOffsetM)
  })

  it('respects lateral speed and acceleration and comes to rest on its line', () => {
    const deltaSeconds = 0.05
    let state = {
      desiredLateralOffsetM: 0,
      lateralOffsetM: 0,
      lateralVelocityMps: 0,
    }

    for (let step = 0; step < 160; step += 1) {
      const next = advanceLateralState({
        deltaSeconds,
        desiredLateralOffsetM: 3.4,
        state,
        track: silverstone,
      })

      expect(Math.abs(next.lateralVelocityMps)).toBeLessThanOrEqual(
        MAX_LATERAL_SPEED_MPS + 1e-9,
      )
      expect(
        Math.abs(next.lateralVelocityMps - state.lateralVelocityMps) /
          deltaSeconds,
      ).toBeLessThanOrEqual(MAX_LATERAL_ACCELERATION_MPS2 + 1e-7)
      state = next
    }

    expect(state.lateralOffsetM).toBeCloseTo(3.4, 5)
    expect(state.lateralVelocityMps).toBeCloseTo(0, 5)
  })

  it('keeps the footprint inside a narrow circuit even with outward velocity', () => {
    const bounds = lateralBoundsForTrack(monaco)
    const state = advanceLateralState({
      deltaSeconds: 3,
      desiredLateralOffsetM: Number.POSITIVE_INFINITY,
      state: {
        desiredLateralOffsetM: 99,
        lateralOffsetM: bounds.maxOffsetM + 20,
        lateralVelocityMps: 50,
      },
      track: monaco,
    })

    expect(state.lateralOffsetM).toBeLessThanOrEqual(bounds.maxOffsetM)
    expect(state.lateralOffsetM).toBeGreaterThanOrEqual(bounds.minOffsetM)
    expect(state.lateralVelocityMps).toBe(0)
  })

  it('contains malformed numeric state and a delayed three-second tick', () => {
    const state = advanceLateralState({
      deltaSeconds: 3,
      desiredLateralOffsetM: 2,
      state: {
        desiredLateralOffsetM: Number.NaN,
        lateralOffsetM: Number.NaN,
        lateralVelocityMps: Number.NEGATIVE_INFINITY,
      },
      track: silverstone,
    })

    expect(Object.values(state).every(Number.isFinite)).toBe(true)
    expect(Math.abs(state.lateralVelocityMps)).toBeLessThanOrEqual(
      MAX_LATERAL_SPEED_MPS,
    )
    expect(state.lateralOffsetM).toBeLessThanOrEqual(
      lateralBoundsForTrack(silverstone).maxOffsetM,
    )
  })
})

describe('closed-lap traffic context', () => {
  it('uses travelled distance modulo lap length across the timing line', () => {
    expect(wrappedForwardDistanceM(4_995, 5_002, 5_000)).toBe(7)
    expect(wrappedSignedDistanceM(4_995, 5_002, 5_000)).toBe(7)
    expect(wrappedSignedDistanceM(5_002, 4_995, 5_000)).toBe(-7)
  })

  it('is identical when the input field order is reversed', () => {
    const subject = {
      driverId: 'subject',
      lateralOffsetM: 0.4,
      totalDistanceM: 4_995,
    }
    const vehicles = [
      subject,
      { driverId: 'ahead', lateralOffsetM: -1, totalDistanceM: 5_002 },
      { driverId: 'behind', lateralOffsetM: 1.2, totalDistanceM: 4_989 },
      { driverId: 'far', lateralOffsetM: 0, totalDistanceM: 5_200 },
    ]
    const context = (field: typeof vehicles) =>
      lateralTrafficContext({
        lapLengthM: 5_000,
        maxLongitudinalDistanceM: 20,
        subject,
        vehicles: field,
      })

    expect(context(vehicles)).toEqual(context([...vehicles].reverse()))
    expect(context(vehicles).map((vehicle) => vehicle.driverId)).toEqual([
      'behind',
      'ahead',
    ])
  })
})

describe('desired-offset reservations', () => {
  const requests: LateralReservationRequest[] = [
    {
      desiredLateralOffsetM: 0,
      driverId: 'alpha',
      lateralOffsetM: 0,
      priority: 10,
      totalDistanceM: 100,
    },
    {
      desiredLateralOffsetM: 0,
      driverId: 'bravo',
      lateralOffsetM: 0,
      priority: 5,
      totalDistanceM: 100.5,
    },
    {
      desiredLateralOffsetM: 0,
      driverId: 'charlie',
      lateralOffsetM: 0,
      priority: 5,
      totalDistanceM: 99.5,
    },
  ]

  it('is stable by priority then driver id and independent of array order', () => {
    const reserve = (field: LateralReservationRequest[]) =>
      reserveDesiredLateralOffsets({
        lapLengthM: silverstone.lengthKm * 1_000,
        requests: field,
        track: silverstone,
      })
    const forward = reserve(requests)
    const reversed = reserve([...requests].reverse())

    expect(sortedEntries(forward)).toEqual(sortedEntries(reversed))
    expect(forward.get('alpha')).toBe(0)

    for (let first = 0; first < requests.length; first += 1) {
      for (let second = first + 1; second < requests.length; second += 1) {
        expect(
          Math.abs(
            forward.get(requests[first].driverId)! -
              forward.get(requests[second].driverId)!,
          ),
        ).toBeGreaterThanOrEqual(requiredLateralCentreSeparationM(undefined, undefined))
      }
    }
  })

  it('uses driver id as the deterministic equal-priority tie breaker', () => {
    const reservation = reserveDesiredLateralOffsets({
      lapLengthM: 5_000,
      requests: [
        { ...requests[1], desiredLateralOffsetM: 1, priority: 5 },
        { ...requests[0], desiredLateralOffsetM: 1, priority: 5 },
      ],
      track: silverstone,
    })

    expect(reservation.get('alpha')).toBe(1)
    expect(reservation.get('bravo')).not.toBe(1)
  })
})

describe('vehicle occupancy and longitudinal capping', () => {
  const rear: LongitudinalOccupancyCandidate = {
    candidateTotalDistanceM: 120,
    driverId: 'rear',
    lateralOffsetM: 0,
    totalDistanceM: 100,
  }
  const front: LongitudinalOccupancyCandidate = {
    candidateTotalDistanceM: 114,
    driverId: 'front',
    lateralOffsetM: 0,
    totalDistanceM: 112,
  }

  it('caps a rear candidate before it penetrates a car in the same corridor', () => {
    const capped = capRearLongitudinalCandidateM({
      front,
      lapLengthM: 5_000,
      rear,
    })
    const minimumGapM = requiredLongitudinalCentreSeparationM(
      undefined,
      undefined,
    )

    expect(capped).toBeCloseTo(front.candidateTotalDistanceM - minimumGapM, 5)
    expect(
      vehicleOccupanciesOverlap({
        first: { ...rear, totalDistanceM: capped },
        lapLengthM: 5_000,
        second: { ...front, totalDistanceM: front.candidateTotalDistanceM },
      }),
    ).toBe(false)
  })

  it('keeps a blocked follower rolling with a moving car ahead', () => {
    const closeRear: LongitudinalOccupancyCandidate = {
      ...rear,
      candidateTotalDistanceM: 112,
      totalDistanceM: 100,
    }
    const closeFront: LongitudinalOccupancyCandidate = {
      ...front,
      candidateTotalDistanceM: 106.25,
      totalDistanceM: 106,
    }
    const capped = capRearLongitudinalCandidateM({
      front: closeFront,
      lapLengthM: 5_000,
      rear: closeRear,
    })

    expect(capped).toBeGreaterThan(closeRear.totalDistanceM)
    expect(capped - closeRear.totalDistanceM).toBeCloseTo(
      closeFront.candidateTotalDistanceM - closeFront.totalDistanceM,
      5,
    )
    expect(closeFront.candidateTotalDistanceM - capped).toBeCloseTo(6, 5)
  })

  it('propagates rolling movement through a tightly spaced queue', () => {
    const train: LongitudinalOccupancyCandidate[] = [
      {
        candidateTotalDistanceM: 112,
        driverId: 'rear',
        lateralOffsetM: 0,
        totalDistanceM: 100,
      },
      {
        candidateTotalDistanceM: 118,
        driverId: 'middle',
        lateralOffsetM: 0,
        totalDistanceM: 106,
      },
      {
        candidateTotalDistanceM: 112.25,
        driverId: 'front',
        lateralOffsetM: 0,
        totalDistanceM: 112,
      },
    ]
    const resolved = resolveLongitudinalOccupancy({
      candidates: train,
      lapLengthM: 5_000,
    })

    expect(resolved.get('front')).toBeCloseTo(112.25, 5)
    expect(resolved.get('middle')).toBeGreaterThan(106)
    expect(resolved.get('rear')).toBeGreaterThan(100)
    expect(resolved.get('middle')! - 106).toBeCloseTo(0.25, 5)
    expect(resolved.get('rear')! - 100).toBeCloseTo(0.25, 5)
  })

  it('allows a safe overtake once the vehicle-width clearance exists', () => {
    const lateralSeparationM = requiredLateralCentreSeparationM(
      undefined,
      undefined,
    )
    const candidate = capRearLongitudinalCandidateM({
      front: {
        ...front,
        candidateLateralOffsetM: -lateralSeparationM / 2,
        lateralOffsetM: -lateralSeparationM / 2,
      },
      lapLengthM: 5_000,
      rear: {
        ...rear,
        candidateLateralOffsetM: lateralSeparationM / 2,
        lateralOffsetM: lateralSeparationM / 2,
      },
    })

    expect(candidate).toBe(rear.candidateTotalDistanceM)
  })

  it('waits for actual lateral clearance rather than a desired end position', () => {
    const lateralSeparationM = requiredLateralCentreSeparationM(
      undefined,
      undefined,
    )
    const candidate = capRearLongitudinalCandidateM({
      front: { ...front, candidateLateralOffsetM: -lateralSeparationM / 2 },
      lapLengthM: 5_000,
      rear: { ...rear, candidateLateralOffsetM: lateralSeparationM / 2 },
    })

    expect(candidate).toBeLessThan(rear.candidateTotalDistanceM)
  })

  it('accounts for category/custom vehicle width in occupancy', () => {
    const first = { driverId: 'a', lateralOffsetM: 0, totalDistanceM: 100 }
    const second = {
      driverId: 'b',
      lateralOffsetM: 2.3,
      totalDistanceM: 100,
    }

    expect(
      vehicleOccupanciesOverlap({ first, lapLengthM: 5_000, second }),
    ).toBe(false)
    expect(
      vehicleOccupanciesOverlap({
        first: { ...first, footprint: { widthM: 2.2 } },
        lapLengthM: 5_000,
        second: { ...second, footprint: { widthM: 2.2 } },
      }),
    ).toBe(true)
  })

  it('resolves a field independently of input order without overlap', () => {
    const sideBySide: LongitudinalOccupancyCandidate = {
      candidateLateralOffsetM: 2.5,
      candidateTotalDistanceM: 121,
      driverId: 'side',
      lateralOffsetM: 2.5,
      totalDistanceM: 99,
    }
    const field = [rear, front, sideBySide]
    const resolve = (candidates: LongitudinalOccupancyCandidate[]) =>
      resolveLongitudinalOccupancy({ candidates, lapLengthM: 5_000 })
    const forward = resolve(field)
    const reversed = resolve([...field].reverse())

    expect(sortedEntries(forward)).toEqual(sortedEntries(reversed))
    expect(forward.get('rear')).toBeLessThan(front.candidateTotalDistanceM)
    expect(forward.get('side')).toBe(sideBySide.candidateTotalDistanceM)

    const resolvedVehicles = field.map((vehicle) => ({
      ...vehicle,
      lateralOffsetM:
        vehicle.candidateLateralOffsetM ?? vehicle.lateralOffsetM,
      totalDistanceM: forward.get(vehicle.driverId)!,
    }))

    for (let first = 0; first < resolvedVehicles.length; first += 1) {
      for (
        let second = first + 1;
        second < resolvedVehicles.length;
        second += 1
      ) {
        expect(
          vehicleOccupanciesOverlap({
            first: resolvedVehicles[first],
            lapLengthM: 5_000,
            second: resolvedVehicles[second],
          }),
        ).toBe(false)
      }
    }
  })

  it('propagates a front-car cap safely through a same-lane train', () => {
    const train: LongitudinalOccupancyCandidate[] = [
      {
        candidateTotalDistanceM: 30,
        driverId: 'rear',
        lateralOffsetM: 0,
        totalDistanceM: 0,
      },
      {
        candidateTotalDistanceM: 35,
        driverId: 'middle',
        lateralOffsetM: 0,
        totalDistanceM: 10,
      },
      {
        candidateTotalDistanceM: 22,
        driverId: 'front',
        lateralOffsetM: 0,
        totalDistanceM: 20,
      },
    ]
    const resolved = resolveLongitudinalOccupancy({
      candidates: train,
      lapLengthM: 5_000,
    })
    const minimumGapM = requiredLongitudinalCentreSeparationM(
      undefined,
      undefined,
    )

    expect(resolved.get('middle')!).toBeLessThanOrEqual(
      resolved.get('front')! - minimumGapM,
    )
    expect(resolved.get('rear')!).toBeLessThanOrEqual(
      resolved.get('middle')! - minimumGapM,
    )
  })

  it('fails closed with invalid distance input', () => {
    const resolved = resolveLongitudinalOccupancy({
      candidates: [
        { ...rear, candidateTotalDistanceM: Number.NaN },
        { ...front, totalDistanceM: Number.NaN },
      ],
      lapLengthM: Number.NaN,
    })

    expect([...resolved.values()].every(Number.isFinite)).toBe(true)
    expect(resolved.get('rear')).toBe(rear.totalDistanceM)
  })
})
