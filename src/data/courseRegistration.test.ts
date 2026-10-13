import { describe, expect, it } from 'vitest'
import { createMotorsportConfig, motorsportCourses } from '../motorsport/packages'
import { dashboardCourse } from '../motorsport/dashboardAdapter'
import { trackCornerTelemetry } from './cornerReferences'
import { supportSeriesTracks } from './supportSeriesTracks'
import { tracks } from './tracks'
import layouts from './expansionCourseLayouts.json'
import { coursePosition } from '../motorsport/coursePhysics'
import { parseMotorsportSave, serializeMotorsportSave } from '../motorsport/persistence'
import { createMotorsportRace } from '../motorsport/race'

const area = (line: number[][]) => line.reduce((sum,a,i) => {
  const b=line[(i+1)%line.length]; return sum+a[0]*b[2]-b[0]*a[2]
},0)

describe('shared circuit map handedness and numbered anchors', () => {
  it('draws Fuji with the same handedness and traversal as SF in every category', () => {
    const sf=supportSeriesTracks.find(track=>track.id==='fuji-sf')!
    for (const championship of ['kyojo','super-gt','wec'] as const) {
      const course=motorsportCourses(championship).find(course=>course.id==='fuji')!
      const track=dashboardCourse({...createMotorsportConfig(championship),course})
      expect(Math.sign(area(track.centerline))).toBe(Math.sign(area(sf.centerline)))
      expect(trackCornerTelemetry(track).map(corner=>corner.label)).toEqual(Array.from({length:16},(_,i)=>`T${i+1}`))
      for (const progress of [.1,.3,.6,.9]) {
        const point=track.centerline[Math.round(progress*512)]
        const source=coursePosition(course,Math.round(progress*512)/512*course.lengthM)
        const origin=coursePosition(course,0)
        expect(Math.sign(point[2]-track.centerline[0][2])).toBe(-Math.sign(source[1]-origin[1]))
      }
    }
  })
  it('covers every extra-category map with unique official labels shared by telemetry', () => {
    for (const championship of ['kyojo','super-gt','wec','indycar'] as const) {
      for (const course of motorsportCourses(championship)) {
        const track=dashboardCourse({...createMotorsportConfig(championship),course})
        const corners=trackCornerTelemetry(track)
        expect(corners.length,course.id).toBeGreaterThan(0)
        expect(new Set(corners.map(corner=>corner.label)).size,course.id).toBe(corners.length)
        expect(corners.every(corner=>corner.progress>=0 && corner.progress<1)).toBe(true)
        expect(corners.every(corner=>/^T\d+A?$/.test(corner.label))).toBe(true)
      }
    }
  })
  it('takes the corrected four road circuits through T1 then ascending turns', () => {
    for (const id of ['okayama','barber','indianapolis','mid-ohio']) {
      const championship=id==='okayama'?'super-gt':'indycar'
      const course=motorsportCourses(championship).find(course=>course.id===id)!
      const labels=trackCornerTelemetry(dashboardCourse({...createMotorsportConfig(championship),course})).map(corner=>corner.label)
      expect(labels,id).toEqual(Array.from({length:labels.length},(_,i)=>`T${i+1}`))
    }
  })
  it('preserves Laguna 8A and Hungaroring 1A/12A instead of duplicate label keys', () => {
    const course=motorsportCourses('indycar').find(course=>course.id==='laguna-seca')!
    const labels=trackCornerTelemetry(dashboardCourse({...createMotorsportConfig('indycar'),course})).map(corner=>corner.label)
    expect(labels.slice(7,10)).toEqual(['T8','T8A','T9'])
    const hungary=tracks.find(track=>track.id==='hungaroring-approx')!
    expect(hungary.corners?.filter(corner=>corner.label?.endsWith('A')).map(corner=>corner.label)).toEqual(['1A','12A'])
  })
  it('migrates legacy catalogue saves without losing fuel, tyres, crews or completed laps', () => {
    const config=createMotorsportConfig('indycar')
    const course=motorsportCourses('indycar').find(course=>course.id==='barber')!
    config.course={...course,points:layouts.layouts.find(layout=>layout.id==='barber')!.centerlineMeters as [number,number][]}
    const state=createMotorsportRace(config)
    state.phase='racing';state.raceSeconds=250
    const car=state.cars[0];car.laps=2;car.distanceM=2.4*course.lengthM;car.fuelKg=12
    car.timing={lap:3,startedAt:200,crossings:Array(24).fill(null),invalid:false,lastLap:null,bestSectors:Array(3).fill(null),bestMiniSectors:Array(24).fill(null)}
    const before=coursePosition(config.course,car.distanceM)
    const saved=parseMotorsportSave(serializeMotorsportSave(config,state))!
    expect(saved).not.toBeNull()
    expect(saved.config.course.points).toEqual(course.points)
    expect(saved.state.cars[0].fuelKg).toBe(12)
    expect(saved.state.cars[0].tyreLife).toBe(car.tyreLife)
    expect(saved.state.cars[0].driverSeconds).toEqual(car.driverSeconds)
    expect(saved.state.cars[0].laps).toBe(2)
    expect(saved.state.cars[0].lapInvalid).toBe(true)
    const after=coursePosition(saved.config.course,saved.state.cars[0].distanceM)
    expect(Math.hypot(after[0]-before[0],after[1]-before[1])).toBeLessThan(2)
  })
  it('does not replace a FREE custom circuit just because its id matches', () => {
    const config=createMotorsportConfig('indycar')
    config.applicationMode='free'
    const catalogue=motorsportCourses('indycar').find(course=>course.id==='barber')!
    config.course={...catalogue,points:catalogue.points.map(([x,y])=>[x+123,y+456])}
    const state=createMotorsportRace(config)
    const saved=parseMotorsportSave(serializeMotorsportSave(config,state))!
    expect(saved.config.course.points).toEqual(config.course.points)
  })
})
