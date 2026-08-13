import { describe, expect, it } from 'vitest'
import {
  BRAKE_HARDWARE_POLICY_VERSION,
  brakeHardwareCapacityFor,
} from './brakeDynamics'

describe('brake hardware capacity', () => {
  const nominalMaximumBrakeDecelerationMps2 = 49.05

  it('keeps the established operating window neutral', () => {
    for (const brakeTemperatureC of [360, 460, 720, 900]) {
      const capacity = brakeHardwareCapacityFor({
        brakeTemperatureC,
        maximumBrakeDecelerationMps2: nominalMaximumBrakeDecelerationMps2,
      })

      expect(capacity.availability).toBe('simulator-policy')
      expect(capacity.capacityMultiplier).toBe(1)
      expect(capacity.maximumBrakeDecelerationMps2).toBe(
        nominalMaximumBrakeDecelerationMps2,
      )
      expect(capacity.operatingState).toBe('operating-window')
      expect(capacity.policyVersion).toBe(BRAKE_HARDWARE_POLICY_VERSION)
    }
  })

  it('reduces capacity monotonically when cold or increasingly overheated', () => {
    const cold = brakeHardwareCapacityFor({
      brakeTemperatureC: 180,
      maximumBrakeDecelerationMps2: nominalMaximumBrakeDecelerationMps2,
    })
    const window = brakeHardwareCapacityFor({
      brakeTemperatureC: 720,
      maximumBrakeDecelerationMps2: nominalMaximumBrakeDecelerationMps2,
    })
    const hot = brakeHardwareCapacityFor({
      brakeTemperatureC: 980,
      maximumBrakeDecelerationMps2: nominalMaximumBrakeDecelerationMps2,
    })
    const overheated = brakeHardwareCapacityFor({
      brakeTemperatureC: 1_150,
      maximumBrakeDecelerationMps2: nominalMaximumBrakeDecelerationMps2,
    })

    expect(cold.operatingState).toBe('cold')
    expect(hot.operatingState).toBe('hot')
    expect(overheated.operatingState).toBe('overheated')
    expect(cold.capacityMultiplier).toBeLessThan(window.capacityMultiplier)
    expect(hot.capacityMultiplier).toBeLessThan(window.capacityMultiplier)
    expect(overheated.capacityMultiplier).toBeLessThan(hot.capacityMultiplier)
    expect(overheated.maximumBrakeDecelerationMps2).toBeGreaterThan(0)
  })

  it('is finite, bounded, and deterministic for malformed inputs', () => {
    const inputs = [Number.NaN, Number.POSITIVE_INFINITY, -999, 9_999]

    for (const brakeTemperatureC of inputs) {
      const first = brakeHardwareCapacityFor({
        brakeTemperatureC,
        maximumBrakeDecelerationMps2: Number.NaN,
      })
      const second = brakeHardwareCapacityFor({
        brakeTemperatureC,
        maximumBrakeDecelerationMps2: Number.NaN,
      })

      expect(first).toEqual(second)
      expect(first.capacityMultiplier).toBeGreaterThanOrEqual(0.72)
      expect(first.capacityMultiplier).toBeLessThanOrEqual(1)
      expect(Number.isFinite(first.maximumBrakeDecelerationMps2)).toBe(true)
    }
  })
})
