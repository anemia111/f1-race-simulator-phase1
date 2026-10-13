import{createServer}from'vite'
import{resolve}from'node:path'
const repoRoot=resolve(import.meta.dirname,'..')
import{writeFileSync}from'node:fs'
const s=await createServer({root:repoRoot,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
try{
const{tracks}=await s.ssrLoadModule('/src/data/tracks.ts');const{initialDrivers,initialTeams}=await s.ssrLoadModule('/src/data/grid2026.ts');const{advanceRace,createInitialRace}=await s.ssrLoadModule('/src/simulation/race.ts');
const track={...tracks.find(t=>t.id==='albert-park-approx'),rainProbability:0};const driver=initialDrivers[0];const config={track,drivers:[driver],teams:initialTeams,seed:'albert-pit-loss-probe',freeMode:true,weekendStage:'race'};
const initial=createInitialRace(config);const car={...initial.cars[0],status:'running',pitPhase:'none',totalDistance:2.999,progress:0.999,processedLap:2,lap:2,speedKph:220,throttlePercent:100,brakePercent:0,gear:5,rpm:10000,clutchEngagementFraction:1,turboSpoolFraction:1,handlingState:undefined,lapStartedAtSeconds:20};
const base={...initial,cars:[car],elapsedSeconds:100,startProcedure:'racing',sessionStatus:'racing',raceStartedAtSeconds:0,startProcedureRemainingSeconds:0,formationLapsCompleted:initial.formationLapsPlanned};let pit=structuredClone(base),control=structuredClone(base);const requests=new Map([[driver.id,'M']]);const rows=[];let entered=null,released=null,stopSeconds=0,pitCross=null,controlCross=null;
for(let i=0;i<240;i++){
const oldPit=pit.cars[0];pit=advanceRace(pit,0.25,config,requests);control=advanceRace(control,0.25,config);const p=pit.cars[0],c=control.cars[0];
if(entered===null&&p.status==='pit')entered={t:pit.elapsedSeconds,until:p.pitUntilSeconds,d:p.totalDistance};if(released===null&&oldPit.status==='pit'&&p.status==='running')released={t:pit.elapsedSeconds,d:p.totalDistance,speed:p.speedKph};if(p.pitPhase==='box')stopSeconds+=.25;
if(pitCross===null&&p.totalDistance>=3.3)pitCross=pit.elapsedSeconds;if(controlCross===null&&c.totalDistance>=3.3)controlCross=control.elapsedSeconds;
if(i%4===0)rows.push({t:pit.elapsedSeconds,p:p.pitPhase,status:p.status,speed:p.speedKph,brake:p.brakePercent,throttle:p.throttlePercent,gear:p.gear,d:p.totalDistance,mode:p.racePaceMode,ers:p.runtimeSystems.ersPowerKw,controlD:c.totalDistance,controlSpeed:c.speedKph});if(pitCross!==null&&controlCross!==null)break;
}
const report={scope:"one short dry tyre-stop against an identical no-stop control",entered,released,stopSeconds,pitCross,controlCross,measuredLoss:pitCross-controlCross,rows};report.baseline={source:'185ec27',stopSeconds:8.25,measuredLoss:16.5};
report.verdict=entered&&released&&pitCross!==null&&controlCross!==null&&stopSeconds>=2&&stopSeconds<=5&&report.measuredLoss<16?'PASS':'FAIL';
writeFileSync(resolve(repoRoot,'artifacts/albert-pit-loss-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));if(report.verdict!=='PASS')process.exitCode=1
}finally{await s.close()}


