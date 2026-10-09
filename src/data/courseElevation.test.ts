import {describe,it,expect} from 'vitest'
import {courseElevationProfiles,elevationAt,elevationProfileFor} from './courseElevation'
import {tracks} from './tracks'
import {supportSeriesTracks} from './supportSeriesTracks'
import {motorsportCourses,createMotorsportConfig} from '../motorsport/packages'
import {dashboardCourse} from '../motorsport/dashboardAdapter'
import {createPresentationTrackCurve,edgePoints,poseOnTrack} from '../three/trackGeometry'

describe('road heights remain registered across every category',()=>{
 it('covers all selectable layouts with finite, closed elevation and grade',()=>{
  const native=[...tracks,...supportSeriesTracks]
  const extra=['kyojo','super-gt','wec','indycar'] as const
  for(const t of native){expect(elevationProfileFor(t.id,t.centerline.map(([x,,z])=>[x,-z]),t.lengthKm*1000),t.id).not.toBeNull()}
  for(const c of extra)for(const course of motorsportCourses(c)){
   expect(elevationProfileFor(course.id,course.points,course.lengthM),course.id).not.toBeNull()
   const track=dashboardCourse({...createMotorsportConfig(c),course}),curve=createPresentationTrackCurve(track)
   const y=curve.getSpacedPoints(192).map(p=>p.y)
   expect(Math.max(...y)-Math.min(...y),course.id).toBeGreaterThan(0)
  }
  expect(Object.keys(courseElevationProfiles)).toHaveLength(58)
  for(const profile of Object.values(courseElevationProfiles)){
   expect(profile.elevationsM).toHaveLength(192)
   expect(profile.grades.every(x=>Number.isFinite(x)&&Math.abs(x)<0.4)).toBe(true)
   expect(elevationAt(profile,1)).toEqual(elevationAt(profile,0))
  }
 })
 it('separates the Suzuka bridge from the underpass in all shared displays',()=>{
  const track=tracks.find(t=>t.id==='suzuka-approx')!,curve=createPresentationTrackCurve(track)
  // These are the two same-plan-position occurrences around Degner / before 130R.
  const under=poseOnTrack(curve,223/512),over=poseOnTrack(curve,433/512)
  expect(Math.hypot(under.position.x-over.position.x,under.position.z-over.position.z)).toBeLessThan(0.12)
  expect(over.position.y-under.position.y).toBeGreaterThan(0.1)
  const edges=edgePoints(curve,0.8,1,512)
  expect(edges[223].y).toBeCloseTo(under.position.y+0.06,8)
  expect(edges[433].y).toBeCloseTo(over.position.y+0.06,8)
 })
 it('keeps real metre scale and leaves the physics geometry untouched',()=>{
  const track=tracks.find(t=>t.id==='suzuka-approx')!,before=JSON.stringify(track)
  const profile=courseElevationProfiles[track.id],curve=createPresentationTrackCurve(track)
  const values=curve.getSpacedPoints(192).map(p=>p.y)
  expect(Math.max(...values)-Math.min(...values)).toBeLessThan(1.1)
  expect(Math.max(...profile.elevationsM)-Math.min(...profile.elevationsM)).toBeGreaterThan(39)
  expect(JSON.stringify(track)).toBe(before)
 })
 it('revalidates a cached point array when Free Mode changes the course id or distance',()=>{
  const profile=courseElevationProfiles['fuji'],points=profile.planarPoints
  expect(elevationProfileFor('fuji',points,profile.lengthM)).not.toBeNull()
  expect(elevationProfileFor('fuji',points,profile.lengthM*2)).toBeNull()
  expect(elevationProfileFor('unregistered-custom',points,profile.lengthM)).toBeNull()
  expect(elevationProfileFor('fuji',points,profile.lengthM)).not.toBeNull()
 })
 it('does not attach a named course profile to arbitrary Free Mode geometry',()=>{
  expect(elevationProfileFor('suzuka-approx',[[0,0],[1000,0],[1000,1000],[0,1000]],5807)).toBeNull()
 })
})
