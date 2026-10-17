import { describe, expect, it } from 'vitest'
import { followingDemand } from './following'

describe('physical following demand',()=>{
  it('does not cut the throttle at a steady-speed equilibrium gap',()=>{
    const speedKph=180
    const desiredBumperGap=4+(speedKph/3.6)*.35
    const demand=followingDemand({speedKph,aheadSpeedKph:speedKph,distanceM:5.6+desiredBumperGap,lateralSeparationM:0})
    expect(demand.decelerationMps2).toBeCloseTo(0,10)
    expect(demand.throttleScale).toBe(1)
  })
  it('increases braking demand with closing speed and reduces it as clearance opens',()=>{
    const common={speedKph:240,aheadSpeedKph:220,distanceM:30,lateralSeparationM:0}
    expect(followingDemand(common).decelerationMps2).toBeGreaterThan(followingDemand({...common,distanceM:60}).decelerationMps2)
    expect(followingDemand(common).throttleScale).toBeLessThan(1)
    expect(followingDemand({...common,lateralSeparationM:3})).toEqual({decelerationMps2:0,throttleScale:1})
  })
})
