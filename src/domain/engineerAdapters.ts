import {resolveSuperFormulaOperational} from '../simulation/superFormulaOperational'
import {sfPitSimulation} from '../simulation/sfPitSimulation'
import type {RaceConfig,RaceSnapshot} from '../types'
import type {EngineerSession} from './raceEngineer'
import {pitLaneLossSecondsForTrack} from '../simulation/strategy'
import {decisionReasonLabels} from '../simulation/decisionLog'
import {defaultCarSetup} from '../simulation/engineering'
export function formulaEngineerSession(config:RaceConfig,snapshot:RaceSnapshot):EngineerSession {
  return {key:`${config.seed}:${config.track.id}:${config.weekendStage}`,seconds:snapshot.elapsedSeconds,lengthM:config.track.lengthKm*1000,remainingLaps:Math.max(0,snapshot.raceLaps-snapshot.leaderLap+1),practice:['fp1','fp2','fp3'].includes(config.weekendStage??''),race:['race','sprint'].includes(config.weekendStage??'race'),flag:snapshot.flag,weather:snapshot.weather,grip:snapshot.trackGrip,decisionNotes:(snapshot.strategyDecisions??[]).slice(-8).reverse().map(d=>`${snapshot.cars.find(c=>c.driverId===d.driverId)?.code??d.driverId}: ${decisionReasonLabels[d.reason]} · 予測P${d.projectedRejoinPosition}${d.outcome?` → 復帰P${d.outcome.position}`:''}`),
    cars:snapshot.cars.flatMap(car=>{const driver=config.drivers.find(d=>d.id===car.driverId);if(!driver)return []
      const samples=car.telemetryHistory??[],first=samples.find(p=>p.fuelKg!==undefined),last=samples.at(-1),span=first&&last?last.lap+last.progress-first.lap-first.progress:0
      const consumption=first?.fuelKg!==undefined&&last?.fuelKg!==undefined&&span>0.5?(first.fuelKg-last.fuelKg)/span:0
      const f1=car.runtimeSystems.kind==='f1'?car.runtimeSystems:null
      const tyreLife=f1?1-f1.tires.tireWearPercent/100:car.runtimeSystems.kind==='super-formula'?car.runtimeSystems.liveTires.simulatedPerformance?.life??1:1
      const inventory=f1?Object.values(f1.tires.tireSetsRemaining).some(n=>n!>0):car.runtimeSystems.kind==='super-formula'&&car.runtimeSystems.controlTires.sets[car.runtimeSystems.liveTires.activeSurface].remainingSets>0
      return [{id:car.driverId,name:`#${car.carNumber} ${car.driverName}`,color:car.teamColor,team:car.teamId,classId:config.seriesId??'f1-custom',driver,distance:car.totalDistance,position:car.position,running:car.status==='running'||car.status==='pit',inPit:car.pitPhase!=='none',pitStops:car.pitStops,eligiblePracticeWindows:car.lapHistory.filter(l=>l.isValid&&!l.pitStop&&l.completedAtSeconds!==undefined).slice(-8).map(l=>({start:l.completedAtSeconds!-l.lapTimeSeconds,end:l.completedAtSeconds!})),lapTimes:car.lapHistory.filter(l=>l.isValid&&!l.pitStop).slice(-4).map(l=>l.lapTimeSeconds),bestLap:car.bestLapTimeSeconds,lastLap:car.lastLapTimeSeconds,samples,tyreLife,fuelLaps:consumption>0?car.fuelLoadKg/consumption:null,pitLoss:f1?pitLaneLossSecondsForTrack(config.track)+3:sfPitSimulation(config.track,car.lastLapTimeSeconds??90).loss,pitAllowed:inventory&&(f1!==null||resolveSuperFormulaOperational().pitLane.enforcement==='enabled')&&car.lap>=2&&snapshot.pitLaneOpen&&!!config.track.pitLane,setup:config.weekendContext?.setupByDriver[driver.id]??defaultCarSetup,setupLocked:config.weekendContext?.parcFermeLockedByDriver[driver.id]??false,plan:car.engineeringPlan}]
    })}
}
