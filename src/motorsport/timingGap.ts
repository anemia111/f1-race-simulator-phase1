import {measuredMiniSectorGapSeconds} from '../domain/measuredTimingGap'
import {formatSignedSeconds} from '../domain/timingFormat'
import {motorsportMeasuredTimeline} from './sectorTiming'
import type {MotorsportCar,MotorsportRaceConfig} from './types'

/** Shared tower/classification readout. Never infer elapsed time from speed. */
export function motorsportTimingGap(ahead:MotorsportCar,car:MotorsportCar,config:Pick<MotorsportRaceConfig,'course'|'sessionKind'>) {
  if(car.status==='retired')return {seconds:null,label:'OUT'}
  if(ahead.entryId===car.entryId)return {seconds:0,label:'LEADER'}
  if(config.sessionKind==='practice'||config.sessionKind==='qualifying') {
    const seconds=car.bestLapSeconds===null||ahead.bestLapSeconds===null?null:Math.max(0,car.bestLapSeconds-ahead.bestLapSeconds)
    return {seconds,label:seconds===null?'--':`+${seconds.toFixed(3)}`}
  }
  const finished=car.finishTime!==null&&ahead.finishTime!==null
  const laps=finished?Math.max(0,ahead.laps-car.laps):Math.floor(Math.max(0,ahead.distanceM-car.distanceM)/config.course.lengthM)
  if(laps>0)return {seconds:null,label:`+${laps}L`}
  const seconds=finished?Math.max(0,car.finishTime!+car.penaltySeconds-ahead.finishTime!-ahead.penaltySeconds):
    measuredMiniSectorGapSeconds(motorsportMeasuredTimeline(ahead),motorsportMeasuredTimeline(car))
  return {seconds,label:formatSignedSeconds(seconds)}
}
