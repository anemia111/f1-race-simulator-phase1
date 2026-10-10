import { describe, expect, it } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import { seriesPackageById } from '../series/seriesRegistry'
import { createInitialRace } from '../simulation/race'
import { recordTelemetry, type TelemetryPoint } from '../simulation/telemetryHistory'
import { parseRaceCheckpoint, serializeRaceCheckpoint } from './raceSession'

describe('telemetry and SF OTS checkpoint compatibility',()=>{
  it('round-trips maximum recorder history without consuming a browser quota',()=>{
    const snapshot=createInitialRace(phaseOneConfig)
    let history: TelemetryPoint[]=[]
    for(let lap=0;lap<3;lap++) for(let bin=0;bin<256;bin++) history=recordTelemetry(history,{lap,progress:bin/256,seconds:lap*90+bin/3,speedKph:230.12,throttlePercent:82.4,brakePercent:0,gear:6,rpm:12000})
    snapshot.cars=snapshot.cars.map(car=>({...car,telemetryHistory:history}))
    const now=Date.now(),raw=serializeRaceCheckpoint('trace',snapshot,now)!
    expect(raw.length*2).toBeLessThan(5*1024*1024)
    expect(parseRaceCheckpoint(raw,'trace',phaseOneConfig,now)?.cars[0].telemetryHistory).toEqual(history)
    const invalid=JSON.parse(raw);invalid.snapshot.cars[0].telemetryHistory='t1:0.bad'
    expect(parseRaceCheckpoint(JSON.stringify(invalid),'trace',phaseOneConfig,now)).toBeNull()
  })
  it('preserves a partially spent SF budget and rejects altered specification values',()=>{
    const series=seriesPackageById.get('super-formula')!
    const config={...phaseOneConfig,drivers:series.drivers,teams:series.teams,track:series.tracks[0],seriesId:'super-formula' as const,sessionRaceLapsOverride:25,overtakeSystem:'ots' as const}
    const snapshot=createInitialRace(config),runtime=snapshot.cars[0].runtimeSystems
    if(runtime.kind!=='super-formula' || !runtime.otsSimulation) throw new Error('missing SF OTS')
    const spent={...runtime.otsSimulation,remainingSeconds:147,cooldownUntilSeconds:220}
    snapshot.cars[0].runtimeSystems={...runtime,otsSimulation:spent}
    const now=Date.now(),raw=serializeRaceCheckpoint('ots',snapshot,now)!
    const restored=parseRaceCheckpoint(raw,'ots',config,now)?.cars[0].runtimeSystems
    expect(restored?.kind==='super-formula' && restored.otsSimulation).toEqual(spent)
    const legacy=JSON.parse(raw)
    delete legacy.snapshot.cars[0].runtimeSystems.otsSimulation
    const migrated=parseRaceCheckpoint(JSON.stringify(legacy),'ots',config,now)?.cars[0].runtimeSystems
    expect(migrated?.kind==='super-formula' && migrated.otsSimulation?.remainingSeconds).toBe(200)
    for(const patch of [{remainingSeconds:201},{boostPowerKw:999},{cooldownSeconds:1}]){
      const altered=JSON.parse(raw);Object.assign(altered.snapshot.cars[0].runtimeSystems.otsSimulation,patch)
      expect(parseRaceCheckpoint(JSON.stringify(altered),'ots',config,now)).toBeNull()
    }
  })
})
