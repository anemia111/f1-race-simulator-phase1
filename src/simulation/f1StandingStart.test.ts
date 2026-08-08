import { describe, expect, it } from 'vitest'
import { f1StandingStartMguKDecision } from './f1StandingStart'

const decide = (
  speedKph: number,
  options: Partial<{
    releaseLatched: boolean
    secuSafetyExceptionActive: boolean
    standingStartActive: boolean
  }> = {},
) =>
  f1StandingStartMguKDecision({
    releaseLatched: options.releaseLatched ?? false,
    secuSafetyExceptionActive: options.secuSafetyExceptionActive ?? false,
    speedKph,
    standingStartActive: options.standingStartActive ?? true,
  })

describe('F1 2026 standing-start MGU-K gate', () => {
  it('blocks positive MGU-K torque below 50 km/h during a normal launch', () => {
    expect(decide(49.999)).toEqual({
      positiveTorqueAllowed: false,
      reason: 'below-release-speed',
      releaseLatched: false,
    })
  })

  it('releases and latches at exactly 50 km/h', () => {
    expect(decide(50)).toEqual({
      positiveTorqueAllowed: true,
      reason: 'release-speed-reached',
      releaseLatched: true,
    })

    expect(decide(20, { releaseLatched: true })).toEqual({
      positiveTorqueAllowed: true,
      reason: 'release-latched',
      releaseLatched: true,
    })
  })

  it('models the SECU low-power-start safety exception without latching release', () => {
    expect(decide(0, { secuSafetyExceptionActive: true })).toEqual({
      positiveTorqueAllowed: true,
      reason: 'secu-safety-exception',
      releaseLatched: false,
    })
  })

  it('does not apply the restriction outside a standing start', () => {
    expect(decide(0, { standingStartActive: false })).toEqual({
      positiveTorqueAllowed: true,
      reason: 'not-standing-start',
      releaseLatched: false,
    })
  })
})
