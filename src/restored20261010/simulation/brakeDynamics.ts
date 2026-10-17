/**
 * Temperature-dependent service-brake hardware capacity.
 *
 * The simulator has no public per-team disc, pad, duct, or cooling-flow
 * measurements. These bounds are therefore explicit simulator policy, not a
 * claim about a Formula 1 or SUPER FORMULA brake specification. They provide
 * a physically ordered capacity input for the force solver while allowing a
 * later source-backed hardware profile to replace the policy wholesale.
 */

export const BRAKE_HARDWARE_POLICY_VERSION = 1 as const

export type BrakeHardwareOperatingState =
  | 'cold'
  | 'operating-window'
  | 'hot'
  | 'overheated'

export type BrakeHardwareCapacity = {
  availability: 'simulator-policy'
  capacityMultiplier: number
  maximumBrakeDecelerationMps2: number
  operatingState: BrakeHardwareOperatingState
  policyVersion: typeof BRAKE_HARDWARE_POLICY_VERSION
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * Resolves the service-brake hardware limit before it is intersected with the
 * tyre longitudinal-force ellipse. The neutral 1.0 plateau intentionally
 * covers the established normal live-temperature range; cold and sustained
 * excessive temperatures only remove capacity and can never create it.
 */
export function brakeHardwareCapacityFor(options: {
  brakeTemperatureC: number
  maximumBrakeDecelerationMps2: number
}): BrakeHardwareCapacity {
  const temperatureC = clamp(finiteOr(options.brakeTemperatureC, 500), -40, 1_250)
  const nominalMaximumDecelerationMps2 = Math.max(
    0,
    finiteOr(options.maximumBrakeDecelerationMps2, 0),
  )
  let capacityMultiplier: number
  let operatingState: BrakeHardwareOperatingState

  if (temperatureC < 360) {
    operatingState = 'cold'
    // A cold disc/pad combination remains usable but cannot receive the full
    // commanded service-brake torque.  The lower clamp prevents a stalled
    // vehicle or a corrupt save from becoming an unphysical zero-brake state.
    capacityMultiplier = 0.72 + (temperatureC + 40) * (0.28 / 400)
  } else if (temperatureC <= 900) {
    operatingState = 'operating-window'
    capacityMultiplier = 1
  } else if (temperatureC <= 1_050) {
    operatingState = 'hot'
    capacityMultiplier = 1 - (temperatureC - 900) * (0.07 / 150)
  } else {
    operatingState = 'overheated'
    capacityMultiplier = 0.93 - (temperatureC - 1_050) * (0.18 / 200)
  }

  capacityMultiplier = clamp(capacityMultiplier, 0.72, 1)

  return {
    availability: 'simulator-policy',
    capacityMultiplier,
    maximumBrakeDecelerationMps2:
      nominalMaximumDecelerationMps2 * capacityMultiplier,
    operatingState,
    policyVersion: BRAKE_HARDWARE_POLICY_VERSION,
  }
}
