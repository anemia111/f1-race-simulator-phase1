import { expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { advanceRace, createInitialRace } from './race'
import { trackDynamicsAt } from './trackDynamics'
import { categoryPhysicsFor } from './categoryPhysics'
import type { RaceConfig, RaceSnapshot, TireCompound } from '../types'

it.each(['f1-custom','super-formula'] as const)('keeps pending BOX at full normal pace in %s', seriesId => {
  const sf=seriesPackageById.get('super-formula')!
  const track=seriesId==='f1-custom' ? tracks.find(t=>t.id==='albert-park-approx')! : sf.tracks[0]
  const drivers=seriesId==='f1-custom' ? initialDrivers.slice(0,1) : sf.drivers.slice(0,1)
  const config: RaceConfig={seriesId,track:{...track,rainProbability:0},drivers,teams:seriesId==='f1-custom'?initialTeams:sf.teams,
    seed:'pending-box-pace',weekendStage:'race',freeMode:true,sessionRaceLapsOverride:25}
  const initial=createInitialRace(config)
  const progress=track.centerline.findIndex((_,i)=>{
    const point=trackDynamicsAt(track,i/track.centerline.length,categoryPhysicsFor(seriesId))
    return i/track.centerline.length<0.8 && point.fullThrottle && point.straightness>0.95
  })/track.centerline.length
  expect(progress).toBeGreaterThanOrEqual(0)
  const snapshot: RaceSnapshot={...initial,startProcedure:'racing',sessionStatus:'racing',raceStartedAtSeconds:0,
    elapsedSeconds:100,startProcedureRemainingSeconds:0,formationLapsCompleted:initial.formationLapsPlanned,
    cars:initial.cars.map(c=>({...c,status:'running',pitPhase:'none',totalDistance:2+progress,processedLap:2,progress,
      speedKph:240,throttlePercent:100,brakePercent:0,gear:6,clutchEngagementFraction:1,turboSpoolFraction:1,handlingState:undefined}))}
  const request=new Map<string,TireCompound>([[drivers[0].id,'M']])
  const baseline=advanceRace(snapshot,0.25,config)
  const boxed=advanceRace(snapshot,0.25,config,request)
  expect(boxed.cars[0]).toEqual(baseline.cars[0])
  expect(request.has(drivers[0].id)).toBe(true)
  expect(boxed.cars[0].pitPhase).toBe('none')
})

it('repairs a saved F1 race pit wait inflated by garage data without resetting the race', () => {
  const config: RaceConfig={track:{...tracks[0],rainProbability:0},drivers:initialDrivers.slice(0,1),teams:initialTeams,
    seed:'legacy-garage-wait',weekendStage:'race',freeMode:true}
  const initial=createInitialRace(config)
  const snapshot: RaceSnapshot={...initial,startProcedure:'racing',raceStartedAtSeconds:0,elapsedSeconds:100,
    startProcedureRemainingSeconds:0,formationLapsCompleted:initial.formationLapsPlanned,
    cars:initial.cars.map(car=>({...car,status:'pit',pitPhase:'box',pitServiceKind:'tire-stop',pitStops:1,
      pitStartedAtSeconds:70,pitUntilSeconds:970,pitExitQueueSeconds:0,totalDistance:2.001,progress:0.001,processedLap:2}))}
  const next=advanceRace(snapshot,0.05,config)
  expect(next.cars[0].status).toBe('running')
  expect(next.cars[0].pitUntilSeconds).toBeNull()
  expect(next.cars[0].pitStops).toBe(1)
  const queued={...snapshot,cars:snapshot.cars.map(car=>({...car,pitUntilSeconds:1000,pitExitQueueSeconds:900}))}
  const held=advanceRace(queued,0.05,config)
  expect(held.cars[0].status).toBe('pit')
  expect(held.cars[0].pitUntilSeconds).toBe(1000)
})
