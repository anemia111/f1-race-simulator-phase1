import { describe, expect, it } from 'vitest'
import {
  advanceTyreTransientForce,
  resolveTyreTransientParameters,
  validateTyreTransientParameters,
} from './tyreTransient'

describe('source-labelled tyre transient boundary', () => {
  it('keeps shipped F1 and SUPER FORMULA relaxation lengths unavailable', () => {
    for (const seriesId of ['f1-custom', 'super-formula'] as const) {
      expect(resolveTyreTransientParameters(seriesId)).toMatchObject({
        reason: 'series-specific-relaxation-lengths-not-public',
        seriesId,
        status: 'unavailable',
      })
    }
  })

  it('rejects incomplete or unlabelled tyre parameters', () => {
    expect(
      validateTyreTransientParameters({
        lateralRelaxationLengthM: 1,
        longitudinalRelaxationLengthM: 1,
      }),
    ).toEqual({
      reason: 'invalid-or-unlabelled-parameters',
      status: 'unavailable',
    })
  })

  it('applies the published first-order distance response only to validated inputs', () => {
    const validation = validateTyreTransientParameters({
      lateralRelaxationLengthM: 2,
      longitudinalRelaxationLengthM: 4,
      source: 'observed',
      sourceDate: '2026-08-27',
      sourceLabel: 'Test-only instrumented tyre response',
      sourceUrl: 'https://example.test/tyre-response',
    })
    expect(validation.status).toBe('available')
    if (validation.status !== 'available') throw new Error('test input rejected')

    const oneLength = advanceTyreTransientForce({
      distanceMeters: 2,
      parameters: validation.parameters,
      state: { lateralForceN: 0, longitudinalForceN: 0 },
      target: { lateralForceN: 1_000, longitudinalForceN: 1_000 },
    })

    expect(oneLength.lateralForceN).toBeCloseTo(1_000 * (1 - Math.exp(-1)))
    expect(oneLength.longitudinalForceN).toBeCloseTo(
      1_000 * (1 - Math.exp(-0.5)),
    )
  })

  it('is distance-step invariant for a constant target', () => {
    const validation = validateTyreTransientParameters({
      lateralRelaxationLengthM: 3,
      longitudinalRelaxationLengthM: 5,
      source: 'manufacturer',
      sourceDate: null,
      sourceLabel: 'Test-only manufacturer input',
      sourceUrl: 'https://example.test/manufacturer-input',
    })
    if (validation.status !== 'available') throw new Error('test input rejected')

    const whole = advanceTyreTransientForce({
      distanceMeters: 4,
      parameters: validation.parameters,
      state: { lateralForceN: 100, longitudinalForceN: -200 },
      target: { lateralForceN: 1_000, longitudinalForceN: 800 },
    })
    const half = advanceTyreTransientForce({
      distanceMeters: 2,
      parameters: validation.parameters,
      state: { lateralForceN: 100, longitudinalForceN: -200 },
      target: { lateralForceN: 1_000, longitudinalForceN: 800 },
    })
    const split = advanceTyreTransientForce({
      distanceMeters: 2,
      parameters: validation.parameters,
      state: half,
      target: { lateralForceN: 1_000, longitudinalForceN: 800 },
    })

    expect(split.lateralForceN).toBeCloseTo(whole.lateralForceN, 10)
    expect(split.longitudinalForceN).toBeCloseTo(whole.longitudinalForceN, 10)
  })
})
