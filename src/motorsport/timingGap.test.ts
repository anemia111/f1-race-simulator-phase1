import {describe,it,expect} from 'vitest'
import {createMotorsportConfig} from './packages'
import {createMotorsportRace} from './race'
import {initialSectorTiming} from './sectorTiming'
import {motorsportTimingGap} from './timingGap'

function fixture(){
  const config=createMotorsportConfig('kyojo'),[ahead,behind]=createMotorsportRace(config).cars
  ahead.distanceM=1000;behind.distanceM=900
  ahead.timing={...initialSectorTiming(config.course),startedAt:0}
  behind.timing={...initialSectorTiming(config.course),startedAt:2}
  ahead.timing.crossings[0]=4;behind.timing.crossings[0]=4
  return {config,ahead,behind}
}
describe('shared measured category timing gaps',()=>{
  it('keeps the measured gap through braking, stopping and acceleration',()=>{
    const {config,ahead,behind}=fixture()
    for(const speed of [0,5,80]){
      behind.speedMps=speed;ahead.speedMps=80-speed
      expect(motorsportTimingGap(ahead,behind,config)).toEqual({seconds:2,label:'+2.0s'})
    }
  })
  it('holds the preceding lap at the control-line boundary',()=>{
    const {config,ahead,behind}=fixture(),count=ahead.timing!.crossings.length
    ahead.distanceM=config.course.lengthM+10;behind.distanceM=config.course.lengthM-10
    ahead.timing={...ahead.timing!,lap:2,startedAt:count*2,crossings:Array(count).fill(null),lastLap:{lap:1,miniSectors:Array(count).fill(2),sectors:Array(count/8).fill(16),valid:true}}
    behind.timing!.crossings=Array.from({length:count},(_,i)=>i<count-1?(i+1)*2:null)
    expect(motorsportTimingGap(ahead,behind,config).label).toBe('+2.0s')
  })
  it('waits for measured data and for new order after a pass',()=>{
    const {config,ahead,behind}=fixture()
    behind.timing!.startedAt=null
    expect(motorsportTimingGap(ahead,behind,config).label).toBe('--')
    behind.timing!.startedAt=2
    expect(motorsportTimingGap(behind,ahead,config).label).toBe('--')
  })
  it('uses class lap deficits and final penalties separately from live gaps',()=>{
    const {config,ahead,behind}=fixture()
    ahead.distanceM=behind.distanceM+config.course.lengthM+10
    expect(motorsportTimingGap(ahead,behind,config).label).toBe('+1L')
    ahead.finishTime=100;behind.finishTime=104;behind.penaltySeconds=5
    expect(motorsportTimingGap(ahead,behind,config).label).toBe('+9.0s')
    ahead.laps=2;behind.laps=1
    expect(motorsportTimingGap(ahead,behind,config).label).toBe('+1L')
  })
})
