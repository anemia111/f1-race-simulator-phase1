import { describe, expect, it } from 'vitest'
import { advancePedals } from './pedalControl'

describe('physical pedal commands', () => {
  it('lifts before building braking, releases pressure and progressively picks up throttle', () => {
    let state = { throttle: 100, brake: 0 }
    const step = (throttle: number, brake: number) => state = advancePedals({
      throttle, brake, previousThrottle: state.throttle, previousBrake: state.brake, seconds: 0.1,
    })
    expect(step(0, 100)).toEqual({ throttle: 0, brake: 45 })
    expect(step(0, 100).brake).toBe(90)
    expect(step(0, 100).brake).toBe(100)
    expect(step(100, 0)).toEqual({ throttle: 0, brake: 74 })
    step(100, 0); step(100, 0)
    expect(step(100, 0)).toEqual({ throttle: 20, brake: 0 })
    expect(step(100, 0).throttle).toBe(40)
  })
  it('preserves a partial traction demand instead of inventing full throttle', () => {
    let state = { throttle: 0, brake: 0 }
    for (let i = 0; i < 10; i++) state = advancePedals({
      throttle: 37, brake: 0, previousThrottle: state.throttle, previousBrake: state.brake, seconds: 0.1,
    })
    expect(state).toEqual({ throttle: 37, brake: 0 })
  })
  it('allows an immediate safety stop and never adds brake to a coast demand', () => {
    expect(advancePedals({ throttle: 0, brake: 0, previousThrottle: 80, previousBrake: 0, seconds: 0.1 })).toEqual({ throttle: 0, brake: 0 })
    expect(advancePedals({ throttle: 80, brake: 0, previousThrottle: 80, previousBrake: 0, seconds: 0.01, stop: true })).toEqual({ throttle: 0, brake: 100 })
  })
})
