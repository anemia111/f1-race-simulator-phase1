import {describe,it,expect} from 'vitest'
import {courseMotionAt,nextCourseMotion} from './courseMotion'
describe('category road interpolation',()=>{
  const a={distance:0.999,lateral:-2,pitBlend:0}
  const b={distance:1.003,lateral:2,pitBlend:1}
  it('crosses the finish line forwards on the road instead of cutting a Cartesian chord',()=>{
    const segment={from:a,to:b,startedMs:100,durationMs:100}
    expect(courseMotionAt(segment,150)).toEqual({distance:1.001,lateral:0,pitBlend:0.5})
    expect(courseMotionAt(segment,1000)).toEqual(b)
    expect(courseMotionAt(segment,0)).toEqual(a)
  })
  it('restarts from the current displayed path and freezes immediately on pause',()=>{
    const segment={from:a,to:b,startedMs:100,durationMs:100}
    const next=nextCourseMotion(segment,{...b,distance:1.01},150,100)
    expect(next.from).toEqual(courseMotionAt(segment,150))
    expect(courseMotionAt(next,150)).toEqual(next.from)
    expect(courseMotionAt(nextCourseMotion(next,b,160,0),160)).toEqual(b)
  })
  it('resets safely for a replacement session or a large imported distance',()=>{
    const segment={from:a,to:b,startedMs:100,durationMs:100}
    expect(nextCourseMotion(segment,{...a,distance:0},150,100).durationMs).toBe(0)
    expect(nextCourseMotion(segment,{...a,distance:20},150,100).durationMs).toBe(0)
  })
})
