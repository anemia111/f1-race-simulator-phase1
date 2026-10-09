import { motorsportCourses } from './packages'
import { coursePosition } from './coursePhysics'
import { projectPointToArcProgress } from '../data/sectorBoundaries'
import { initialSectorTiming } from './sectorTiming'
import type { MotorsportRaceConfig, MotorsportRaceState } from './types'

/** Only migrate registered catalogue geometry. User-authored FREE shapes stay intact.
 * Keep each car's physical location and completed laps; the interrupted lap cannot
 * be a record after a direction/control-line change. Fuel, tyres and crews survive. */
export function migrateCourseRegistration(config: MotorsportRaceConfig, state: MotorsportRaceState) {
  if (!['okayama', 'barber', 'indianapolis', 'mid-ohio', 'imola'].includes(config.course.id)) return
  const canonical = motorsportCourses(config.championship).find(course => course.id === config.course.id)
  if (!canonical) return
  const old = config.course
  if (JSON.stringify(old.points) === JSON.stringify(canonical.points)) return
  const line = canonical.points.map(([x,y]) => [x,0,y] as [number,number,number])
  // A rotation/reversal can add a control point but cannot change the road itself.
  if (Math.abs(old.points.length - line.length) > 2) return
  const onRoad = ([x,y]: [number,number]) => {
    const p = projectPointToArcProgress(line, [x,0,y])
    let total = 0
    const lengths = line.map((a,i) => Math.hypot(a[0]-line[(i+1)%line.length][0],a[2]-line[(i+1)%line.length][2]))
    total = lengths.reduce((sum,length) => sum+length,0) * p
    for (let i=0;i<line.length;i++) {
      if (total <= lengths[i] || i === line.length-1) {
        const a=line[i], b=line[(i+1)%line.length], f=total/Math.max(1e-12,lengths[i])
        return Math.hypot(x-a[0]-(b[0]-a[0])*f,y-a[2]-(b[2]-a[2])*f)<1e-4
      }
      total-=lengths[i]
    }
    return false
  }
  if (!old.points.every(onRoad)) return
  for (const car of state.cars) {
    if (car.distanceM >= 0) {
      const [x,y] = coursePosition(old,car.distanceM)
      const progress = projectPointToArcProgress(line,[x,0,y])
      car.distanceM=(car.laps+progress)*canonical.lengthM
    }
    car.lapInvalid=true
    car.lapStartedAt=state.raceSeconds
    car.timing=initialSectorTiming(canonical)
    car.timing.lap=car.laps+1
    car.telemetryHistory=[]
  }
  config.course={...old,points:canonical.points}
}
