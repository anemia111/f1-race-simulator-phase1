import {createServer} from 'vite'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
const repoRoot=resolve(import.meta.dirname,'..')
import {writeFileSync} from 'node:fs'
const server=await createServer({root:repoRoot,appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
try{
const {followingDemand}=await server.ssrLoadModule('/src/simulation/following.ts')
const {initialDrivers,initialTeams}=await server.ssrLoadModule('/src/data/grid2026.ts')
const {tracks}=await server.ssrLoadModule('/src/data/tracks.ts')
const {profileDistanceMAt,profileProgressAtDistanceM,trackDynamicsAt}=await server.ssrLoadModule('/src/simulation/trackDynamics.ts')
const {createInitialRace}=await server.ssrLoadModule('/src/simulation/race.ts')
const {calculateCarTelemetry}=await server.ssrLoadModule('/src/simulation/telemetry.ts')
const {towDragReductionFor}=await server.ssrLoadModule('/src/simulation/vehicleDynamics.ts')
const track=tracks.find(t=>t.id==='monza-approx'),driver=initialDrivers[0],team=initialTeams.find(t=>t.id===driver.teamId)
const init=createInitialRace({drivers:[driver],teams:initialTeams,track,seed:'train-diagnosis',freeMode:true})
const progress=track.centerline.findIndex((_,i)=>{const d=trackDynamicsAt(track,i/track.centerline.length);return d.fullThrottle&&d.straightness>0.99&&d.referenceSpeedKph>290&&d.straightLengthAheadMeters>350})/track.centerline.length
if(progress<0)throw Error('No straight fixture')
const dynamics=trackDynamicsAt(track,progress)
const base={...init.cars[0],progress,totalDistance:2+progress,speedKph:280,throttlePercent:100,brakePercent:0,status:'running',pitPhase:'none',lateralOffsetM:0,desiredLateralOffsetM:0}
const options={driver,team,track,deltaSeconds:0.05,elapsedSeconds:100,phase:null,lowGripConditions:false,raceLap:3,trackGrip:1,weather:'clear',aheadLateralOffsetM:0,aheadSpeedKph:280}
const control=[15,20,25,30,35,40,50].map(distanceM=>({distanceM,...followingDemand({speedKph:300,aheadSpeedKph:300,distanceM,lateralSeparationM:0})}))
const rows=[]
for(const distance of [null,20,30,40,60])for(const save of [false,true]){
if(distance===null&&save)continue
const car={...base,gapToAhead:distance===null?Infinity:distance/(280/3.6)}
const following=distance===null?undefined:followingDemand({speedKph:280,aheadSpeedKph:280,distanceM:distance,lateralSeparationM:0})
const plan=save?{opponentId:'rival',phase:'save',startedAt:90,phaseStartedAt:90,targetSoc:0.68}:undefined
const result=calculateCarTelemetry({...options,car,following,towEnergyPlan:plan})
rows.push({distanceM:distance,save,following,brake:result.brakePercent,throttle:result.throttlePercent,deploymentKw:result.runtimeSystems.ersPowerKw,speedKph:result.speedKph,towReduction:distance===null?0:towDragReductionFor({dynamics,gapSeconds:car.gapToAhead,lateralSeparationM:0,team})})
}
const trains=[]
for(const distance of [30,45])for(const follow of [false,true])for(const save of [false,true]){
 let cars=Array.from({length:8},(_,i)=>{
 const runtime=base.runtimeSystems;const energy=runtime.energyStore
 const current=energy.minimumUsableEnergyMJ+(energy.maximumUsableEnergyMJ-energy.minimumUsableEnergyMJ)*0.4
 const totalDistance=profileProgressAtDistanceM(track,profileDistanceMAt(track,2+progress)-distance*i)
 return {...base,driverId:'car-'+i,progress:totalDistance%1,totalDistance,handlingState:undefined,clutchEngagementFraction:1,turboSpoolFraction:1,gear:8,rpm:11000,
 runtimeSystems:{...runtime,energyStore:{...energy,currentEnergyMJ:current,stateOfCharge:0.4,lapStartEnergyMJ:current}}}
 })
 let brakeSamples=0,firstFollowDemand=0
 for(let tick=0;tick<60;tick++){
  const old=cars
  cars=old.map((car,i)=>{
   const ahead=old[i-1];const gap=ahead?(profileDistanceMAt(track,ahead.totalDistance)-profileDistanceMAt(track,car.totalDistance)):Infinity
   const following=follow&&ahead?followingDemand({speedKph:car.speedKph,aheadSpeedKph:ahead.speedKph,distanceM:gap,lateralSeparationM:0}):undefined
   if(tick===0&&i===1)firstFollowDemand=following?.decelerationMps2??0
   const result=calculateCarTelemetry({...options,elapsedSeconds:100+tick*0.05,car:{...car,gapToAhead:gap/Math.max(5,car.speedKph/3.6)},following,aheadSpeedKph:ahead?.speedKph,
    towEnergyPlan:save&&ahead?{opponentId:ahead.driverId,phase:'save',startedAt:90,phaseStartedAt:90,targetSoc:0.68}:undefined})
   if(result.brakePercent>5)brakeSamples++
   const totalDistance=profileProgressAtDistanceM(track,profileDistanceMAt(track,car.totalDistance)+(car.speedKph+result.speedKph)/7.2*0.05)
   return {...car,...result,totalDistance,progress:totalDistance%1}
  })
 }
 trains.push({initialGapM:distance,following:follow,save,seconds:3,firstFollowDemand,brakeSamples,leaderKph:cars[0].speedKph,lastKph:cars.at(-1).speedKph,
  speeds:cars.map(c=>c.speedKph),soc:cars.map(c=>c.runtimeSystems.energyStore.stateOfCharge)})
}
const report={trains,date:'2026-10-13',sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(),baseline:{source:'6e7fd56',spacingM:30,following:true,save:false,leaderKph:307.27,lastKph:246.44},fixture:{track:track.id,progress,referenceSpeedKph:dynamics.referenceSpeedKph,straightMeters:dynamics.straightLengthAheadMeters},control,rows}
const failures=[]
for(const row of trains.filter(r=>r.following)) {
 const reference=trains.find(r=>!r.following&&r.save===row.save&&r.initialGapM===row.initialGapM)
 if(row.lastKph < reference.lastKph-1 || row.brakeSamples>0) failures.push(`spacing-${row.initialGapM}:save-${row.save}`)
}
report.failures=failures
report.verdict=failures.length?'FAIL':'PASS'
writeFileSync(resolve(repoRoot,'artifacts/train-following-validation.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({verdict:report.verdict,failures,trains:trains.map(({initialGapM,following,save,leaderKph,lastKph,brakeSamples})=>({initialGapM,following,save,leaderKph,lastKph,brakeSamples}))},null,2))
if(failures.length)process.exitCode=1
}finally{await server.close()}
