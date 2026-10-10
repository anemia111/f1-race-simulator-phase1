import { it, expect } from 'vitest'
import { driverPool2026, seriesPackages } from '../series/seriesRegistry'
import { buildFreeModeRaceConfig } from '../freeMode/freeModeRegistry'
import { advanceRace, createInitialRace } from '../simulation/race'
import { recordTelemetry, type TelemetryPoint } from '../simulation/telemetryHistory'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from './raceSession'
it('persists a 40-car FREE field and three recorded laps inside the browser quota',()=>{
 const series=seriesPackages.find(series=>series.id==='f1-custom')!
 const config=buildFreeModeRaceConfig({version:1,categoryId:'f1-custom',entrants:driverPool2026.slice(0,40).map((driver,index)=>({carNumber:index+1,driverId:driver.id,id:`quota-${index}`,sourceTeamId:series.teams[index%series.teams.length].id})),equalCars:false,gridMode:'manual',practiceDurationMinutes:5,raceLaps:10,seed:'quota',sessionKind:'race',trackId:series.tracks[0].id,weatherMode:'clear'},{driverPool:driverPool2026,seriesById:new Map(seriesPackages.map(series=>[series.id,series]))})
 const initial=createInitialRace(config)
 let snapshot=advanceRace({...initial,startProcedure:'racing',raceStartedAtSeconds:0},3,config)
 let history:TelemetryPoint[]=[]
 for(let lap=0;lap<3;lap++)for(let bin=0;bin<256;bin++)history=recordTelemetry(history,{lap,progress:bin/256,seconds:lap*90+bin/3,speedKph:230.12,throttlePercent:82.4,brakePercent:0,gear:6,rpm:12000})
 snapshot={...snapshot,cars:snapshot.cars.map(car=>({...car,telemetryHistory:history}))}
 const now=Date.now(), raw=serializeRaceCheckpoint('quota',snapshot,now)!
 expect(raw).not.toBeNull()
 expect(raw.length*2).toBeLessThan(5*1024*1024)
 const restored=parseRaceCheckpoint(raw,'quota',config,now)
 expect(restored?.cars).toHaveLength(40)
 expect(restored?.cars.every(car=>car.telemetryHistory?.length===768)).toBe(true)
},30000)
