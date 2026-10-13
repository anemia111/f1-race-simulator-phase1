import { describe, expect, it } from 'vitest'
import { followingDemand } from './following'

const input = { speedKph:300, aheadSpeedKph:300, distanceM:30, lateralSeparationM:0 }

describe('race following without train braking waves', () => {
  it.each([60,150,200,280,300,350])('holds a matched-speed train at %i km/h', speedKph => {
    for (const distanceM of [15,20,25,30,35,45]) {
      expect(followingDemand({...input,speedKph,aheadSpeedKph:speedKph,distanceM}))
        .toEqual({decelerationMps2:0,throttleScale:1})
    }
  })
  it('does not brake a car whose gap is opening', () => {
    expect(followingDemand({...input,speedKph:280})).toEqual({decelerationMps2:0,throttleScale:1})
  })
  it('increases braking for real closure and shorter stopping distance', () => {
    const slow = {...input,aheadSpeedKph:260}
    const far = followingDemand({...slow,distanceM:60})
    const close = followingDemand({...slow,distanceM:20})
    expect(far.decelerationMps2).toBeGreaterThan(0)
    expect(close.decelerationMps2).toBeGreaterThan(far.decelerationMps2)
    expect(close.throttleScale).toBeLessThan(far.throttleScale)
  })
  it('reacts to observed braking before relative speed builds up', () => {
    const braking = followingDemand({...input,aheadDecelerationMps2:20})
    expect(braking.decelerationMps2).toBeGreaterThan(15)
    expect(braking.decelerationMps2).toBeLessThan(20)
    expect(braking.throttleScale).toBe(0)
    expect(followingDemand({...input,distanceM:100,aheadDecelerationMps2:20}).decelerationMps2)
      .toBeLessThan(braking.decelerationMps2)
  })
  it('keeps a minimal body clearance even at matched speed', () => {
    expect(followingDemand({...input,distanceM:7}).decelerationMps2).toBeGreaterThan(0)
    expect(followingDemand({...input,distanceM:7,lateralSeparationM:3}))
      .toEqual({decelerationMps2:0,throttleScale:1})
  })
  it('stops short of a stationary car in a short physical braking reproduction', () => {
    let speed = 200/3.6
    let gap = 100
    for (let tick=0;tick<100;tick++) {
      const demand=followingDemand({...input,speedKph:speed*3.6,aheadSpeedKph:0,distanceM:gap})
      const next=Math.max(0,speed-Math.min(30,demand.decelerationMps2)*0.05)
      gap-=(speed+next)*0.5*0.05
      speed=next
      expect(gap).toBeGreaterThan(5.6)
    }
    expect(speed*3.6).toBeLessThan(8)
  })
  it('follows an abrupt lead-car brake without overlap over five seconds', () => {
    let aheadSpeed=200/3.6, speed=aheadSpeed, gap=30
    for(let tick=0;tick<100;tick++) {
      const demand=followingDemand({...input,speedKph:speed*3.6,aheadSpeedKph:aheadSpeed,distanceM:gap,aheadDecelerationMps2:8})
      const nextAhead=Math.max(0,aheadSpeed-8*0.05)
      const next=Math.max(0,speed-Math.min(30,demand.decelerationMps2)*0.05)
      gap+=(aheadSpeed+nextAhead-speed-next)*0.5*0.05
      speed=next; aheadSpeed=nextAhead
      expect(gap).toBeGreaterThan(5.6)
    }
    expect(speed*3.6).toBeLessThan(100)
  })
})
