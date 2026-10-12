import {it, expect} from 'vitest'
import {phaseOneConfig} from '../data/phaseOne'
import {seriesPackageById} from '../series/seriesRegistry'
import {advanceRace,createInitialRace} from './race'
import {createMotorsportConfig} from '../motorsport/packages'
import {advanceMotorsportRace,createMotorsportRace} from '../motorsport/race'
import {profileDistanceMAt,profileProgressAtDistanceM} from './trackDynamics'
import {resolveLateralOccupancy,vehicleOccupanciesOverlap} from './lateralDynamics'
import {tracks} from '../data/tracks'
import type {RaceSnapshot} from '../types'
import type {MotorsportRaceState} from '../motorsport/types'

it.each(['f1-custom','super-formula'] as const)('%s keeps the whole field moving through launch and corner entry',seriesId=>{
 const series=seriesPackageById.get(seriesId)!
 const config={...phaseOneConfig,seriesId,drivers:series.drivers,teams:series.teams,track:{...series.tracks[0],rainProbability:0},weekendStage:'race' as const,sessionRaceLapsOverride:20,seed:'traffic-continuity'}
 let s=createInitialRace(config)
 s=advanceRace(s,s.formationLapDurationSeconds*s.formationLapsPlanned,config)
 s=advanceRace(s,8,config);s=advanceRace(s,s.startLightSequenceSeconds??5,config)
 const drops:unknown[]=[]
 for(let tick=0;tick<320;tick++){
  const old=s;s=advanceRace(s,.05,config)
  for(const car of s.cars){const before=old.cars.find(c=>c.driverId===car.driverId)!
   if(before.speedKph-car.speedKph>18) drops.push({t:tick*.05,id:car.driverId,from:before.speedKph,to:car.speedKph,lat:car.lateralOffsetM,status:car.status,incident:car.incidentTrackState})
  }
 }
 expect(drops).toEqual([])
 expect(s.cars.every(car=>car.speedKph>30)).toBe(true)
 // Separate mid-race packs exercise merges and traffic away from the start.
 for(const progress of [.2,.55,.999]){
  let pack:RaceSnapshot={...s,elapsedSeconds:s.elapsedSeconds+120,cars:s.cars.slice(0,8).map((car,i)=>{
   const totalDistance=profileProgressAtDistanceM(config.track,profileDistanceMAt(config.track,5+progress)-i*12)
   return {...car,totalDistance,lap:Math.floor(totalDistance),progress:totalDistance-Math.floor(totalDistance),
    processedLap:Math.ceil(totalDistance),speedKph:i%2?190:180,lateralOffsetM:i%2?1.5:-1.5,
    trackLateralOffset:i%2?1.5:-1.5,handlingState:undefined,lateralVelocityMps:0}
  })}
  for(let tick=0;tick<40;tick++){
   const before=pack;pack=advanceRace(pack,.05,config)
   pack.cars.forEach(car=>{
    const old=before.cars.find(other=>other.driverId===car.driverId)!
    expect(old.speedKph-car.speedKph,`${seriesId} mid-race ${progress} ${car.code}`).toBeLessThan(18)
    expect(car.totalDistance).toBeGreaterThanOrEqual(old.totalDistance)
   })
   for(let i=0;i<pack.cars.length;i++)for(let j=i+1;j<pack.cars.length;j++){
    const vehicle=(index:number)=>({driverId:pack.cars[index].driverId,totalDistanceM:profileDistanceMAt(config.track,pack.cars[index].totalDistance),lateralOffsetM:pack.cars[index].lateralOffsetM})
    expect(vehicleOccupanciesOverlap({first:vehicle(i),second:vehicle(j),lapLengthM:config.track.lengthKm*1000,margins:{lateralSafetyMarginM:0,longitudinalSafetyMarginM:0}})).toBe(false)
   }
  }
 }
},20000)

it.each(['kyojo','super-gt','wec','indycar'] as const)('%s avoids stopping waves at launch and in mid-race packs',category=>{
 const config=createMotorsportConfig(category)
 let s={...createMotorsportRace(config),phase:'racing' as const}
 const drops:unknown[]=[]
 for(let tick=0;tick<160;tick++){
  const old=s;s=advanceMotorsportRace(s,1,config) as typeof s
  for(const car of s.cars){const before=old.cars.find(c=>c.entryId===car.entryId)!
   if((before.speedMps-car.speedMps)*3.6>18) drops.push({t:tick*.1,id:car.entryId,from:before.speedMps*3.6,to:car.speedMps*3.6,lat:car.lateralM,status:car.status})
  }
 }
 expect(drops).toEqual([])
 expect(s.cars.every(car=>car.speedMps>5)).toBe(true)
 for(const progress of [.2,.55,.999]){
  let pack:MotorsportRaceState={...s,raceSeconds:120,cars:s.cars.slice(0,8).map((car,i)=>({...car,
   distanceM:(5+progress)*config.course.lengthM-i*12,speedMps:i%2?50:47,
   lateralM:i%2?1.5:-1.5,lateralVelocityMps:0,handlingState:undefined,
  }))}
  for(let tick=0;tick<20;tick++){
   const before=pack;pack=advanceMotorsportRace(pack,1,config) as typeof pack
   pack.cars.forEach(car=>{
    const old=before.cars.find(other=>other.entryId===car.entryId)!
    expect((old.speedMps-car.speedMps)*3.6,`${category} mid-race ${progress} ${car.entryId}`).toBeLessThan(18)
    expect(car.distanceM).toBeGreaterThanOrEqual(old.distanceM)
   })
   for(let i=0;i<pack.cars.length;i++)for(let j=i+1;j<pack.cars.length;j++){
    const vehicle=(index:number)=>({driverId:pack.cars[index].entryId,totalDistanceM:pack.cars[index].distanceM,lateralOffsetM:pack.cars[index].lateralM})
    expect(vehicleOccupanciesOverlap({first:vehicle(i),second:vehicle(j),lapLengthM:config.course.lengthM,margins:{lateralSafetyMarginM:0,longitudinalSafetyMarginM:0}})).toBe(false)
   }
  }
 }
},20000)

it('holds a merge until the closing neighbour has braking room, while allowing escape',()=>{
 const candidates=[{driverId:'rear',totalDistanceM:100,candidateTotalDistanceM:106,speedMps:60,lateralOffsetM:-1.2,candidateLateralOffsetM:-.9},
 {driverId:'front',totalDistanceM:120,candidateTotalDistanceM:124,speedMps:40,lateralOffsetM:1.2,candidateLateralOffsetM:.9}]
 const offsets=resolveLateralOccupancy({candidates,lapLengthM:1000})
 expect(offsets.get('front')!-offsets.get('rear')!).toBeGreaterThanOrEqual(1.95)
 const escape=resolveLateralOccupancy({candidates:candidates.map(car=>({...car,candidateLateralOffsetM:car.lateralOffsetM*2})),lapLengthM:1000})
 expect(escape.get('front')).toBe(2.4)
})

it('round trips physical traffic coordinates across nonuniform profiles and the timing line',()=>{
 for(const track of tracks)for(const progress of [-.01,0,.001,.25,.999,1,5.2]){
  expect(profileProgressAtDistanceM(track,profileDistanceMAt(track,progress))).toBeCloseTo(progress,8)
 }
})
