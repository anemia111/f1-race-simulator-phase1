import type { CarSetup,Driver,TireCompound } from '../types'
import type {TelemetryPoint} from '../simulation/telemetryHistory'
import {telemetryLaps,telemetrySummary} from './telemetryAnalysis'
export type EngineeringPlan={dueDistance:number;createdSeconds:number;startingPitStops:number;predictedPosition:number;positionLow:number;positionHigh:number;reason:string;compound?:TireCompound;status:'scheduled'|'in-pit'|'complete'|'cancelled';actualPosition?:number}
export type EngineerCar={id:string;name:string;color:string;team:string;classId:string;driver:Driver;distance:number;position:number;running:boolean;inPit:boolean;pitStops:number;lapTimes:number[];eligiblePracticeLaps?:number[];eligiblePracticeWindows?:{start:number;end:number}[];bestLap:number|null;lastLap:number|null;samples:TelemetryPoint[];tyreLife:number;fuelLaps:number|null;pitLoss:number;pitAllowed:boolean;setup?:CarSetup;setupLocked:boolean;setupKeys?:(keyof CarSetup)[];mandatoryReason?:string;plan?:EngineeringPlan}
export type EngineerSession={key:string;seconds:number;lengthM:number;remainingLaps:number;practice:boolean;race:boolean;flag:string;weather:string;grip:number;cars:EngineerCar[];decisionNotes?:string[]}
export type StrategyScenario={delay:number;allowed:boolean;reason:string;loss:number;cost:number;position:number;low:number;high:number;traffic:string|null;uncertainty:number}
export function validEngineeringPlan(value:unknown):value is EngineeringPlan {
  if(!value||typeof value!=='object')return false
  const p=value as EngineeringPlan
  return [p.dueDistance,p.createdSeconds,p.startingPitStops,p.predictedPosition,p.positionLow,p.positionHigh].every(n=>Number.isFinite(n)&&n>=0)&&[p.startingPitStops,p.predictedPosition,p.positionLow,p.positionHigh].every(Number.isSafeInteger)&&p.positionLow>=1&&p.positionLow<=p.predictedPosition&&p.predictedPosition<=p.positionHigh&&typeof p.reason==='string'&&p.reason.length<=200&&['scheduled','in-pit','complete','cancelled'].includes(p.status)&&(p.actualPosition===undefined||Number.isInteger(p.actualPosition)&&p.actualPosition>0)&&(p.compound===undefined||['S','M','H','I','W'].includes(p.compound))
}
export function settleEngineeringPlan(plan:EngineeringPlan|undefined,car:{pitStops:number;inPit:boolean;position:number;running:boolean}):EngineeringPlan|undefined {
  if(!plan||plan.status==='complete'||plan.status==='cancelled')return plan
  if(car.pitStops>plan.startingPitStops&&!car.inPit)return {...plan,status:'complete',actualPosition:car.position}
  if(!car.running)return {...plan,status:'cancelled'}
  // A drive-through/stop-go increments no tyre-stop counter and must not
  // consume a later tyre-stop instruction.
  if(car.inPit&&car.pitStops>plan.startingPitStops)return plan.status==='in-pit'?plan:{...plan,status:'in-pit'}
  return plan
}
export const measuredPace=(car:EngineerCar)=>{
  const laps=car.lapTimes.filter(n=>Number.isFinite(n)&&n>10).slice(-3).sort((a,b)=>a-b)
  return laps.length?laps[Math.floor(laps.length/2)]:null
}
function wearPerLap(car:EngineerCar) {
  const first=car.samples.find(p=>p.tyreLifePercent!==undefined),last=car.samples.at(-1)
  const span=first&&last?last.lap+last.progress-first.lap-first.progress:0
  return first&&last?.tyreLifePercent!==undefined&&span>0.5&&first.tyreLifePercent!>=last.tyreLifePercent?Math.min(0.15,(first.tyreLifePercent!-last.tyreLifePercent)/100/span):0.025
}
/** Short horizon SIM estimates; scenarios hold rival pace and flag constant. */
export function strategyScenarios(session:EngineerSession,car:EngineerCar):StrategyScenario[] {
  const pace=measuredPace(car)??90,wear=wearPerLap(car),horizon=Math.min(8,Math.max(1,session.remainingLaps)),life=Math.max(0,Math.min(1,car.tyreLife))
  const penalty=(value:number)=>Math.max(0,0.75-value)*2+Math.max(0,0.35-value)**2*24
  const control=session.flag==='sc'||session.flag==='vsc'||session.flag==='fcy'
  return [0,3,5].map(delay=>{
    const allowed=car.pitAllowed&&car.running&&!car.inPit&&delay<session.remainingLaps&&(car.fuelLaps===null||delay+0.8<car.fuelLaps)&&(!car.mandatoryReason||delay===0)
    const reason=!car.pitAllowed?'このカテゴリー・状態では停止を指示できません':car.mandatoryReason??(car.fuelLaps!==null&&delay+0.8>=car.fuelLaps?'燃料の安全余裕が不足':delay>=session.remainingLaps?'チェッカー以降':control?'中立化中の停止候補':life<0.4?'タイヤ損失を抑える':'タイヤ・交通を比較')
    const loss=car.pitLoss*(control?0.65:1)
    const projected=car.distance+delay-loss/pace
    const rivals=session.cars.filter(c=>c.id!==car.id&&c.classId===car.classId&&c.running)
    const positions=rivals.map(c=>({car:c,distance:c.distance+delay*pace/(measuredPace(c)??pace)}))
    const position=1+positions.filter(c=>c.distance>projected).length
    const close=positions.filter(c=>Math.abs(c.distance-projected)*pace<2).sort((a,b)=>Math.abs(a.distance-projected)-Math.abs(b.distance-projected))[0]
    const uncertainty=(car.lapTimes.length>=3?2:5)+delay*0.9+(control?3:0)
    const low=1+positions.filter(c=>c.distance>projected+uncertainty/pace).length,high=1+positions.filter(c=>c.distance>projected-uncertainty/pace).length
    let cost=loss+(close?2:0)+1.2 // Explicit SIM warm-up allowance, no clock changes.
    for(let i=0;i<horizon;i++)cost+=penalty(i<delay?life-wear*i:1-wear*(i-delay))
    return {delay,allowed,reason,loss,cost,position,low,high,traffic:close?.car.name??null,uncertainty}
  })
}
export function makeEngineeringPlan(session:EngineerSession,car:EngineerCar,scenario:StrategyScenario,compound?:TireCompound):EngineeringPlan {
  return {dueDistance:car.distance+scenario.delay,createdSeconds:session.seconds,startingPitStops:car.pitStops,predictedPosition:scenario.position,positionLow:scenario.low,positionHigh:scenario.high,reason:scenario.reason,...(compound?{compound}:{}),status:'scheduled'}
}
export type WatchMoment={id:string;driverId:string;opponentId?:string;title:string;detail:string;priority:number}
export function watchMoments(session:EngineerSession):WatchMoment[] {
  const active=session.cars.filter(c=>c.running&&!c.inPit).sort((a,b)=>b.distance-a.distance),moments:WatchMoment[]=[]
  for(let i=0;i<active.length;i++){
    const car=active[i],ahead=active.slice(0,i).findLast(c=>c.classId===car.classId)
    if(ahead&&session.race){
      const pace=measuredPace(car),other=measuredPace(ahead),gap=(ahead.distance-car.distance)*(pace??90)
      if(gap>0&&gap<6){
        const closure=pace!==null&&other!==null?other-pace:0
        if(closure>0.15&&gap/closure<=4)moments.push({id:`catch:${car.id}`,driverId:car.id,opponentId:ahead.id,title:'接近するクラス内バトル',detail:`${car.name} → ${ahead.name} · 約${(gap/closure).toFixed(1)}周で接近（直近ペースが続く場合）`,priority:90-gap})
        if(Math.abs(car.tyreLife-ahead.tyreLife)>=0.15)moments.push({id:`tyre:${car.id}`,driverId:car.id,opponentId:ahead.id,title:'タイヤ差のある勝負',detail:`${car.name} / ${ahead.name} · 残寿命 ${Math.round(car.tyreLife*100)}% / ${Math.round(ahead.tyreLife*100)}%`,priority:65-gap})
      }
    }
    const pace=measuredPace(car)
    if(pace&&session.race){
      const traffic=active.filter(c=>c.classId!==car.classId).map(c=>{const p=measuredPace(c),gap=((c.distance-car.distance)%1+1)%1;return {car:c,eta:p&&p>pace+2?gap/(1/pace-1/p):Infinity}}).sort((a,b)=>a.eta-b.eta)[0]
      if(traffic&&traffic.eta>0&&traffic.eta<90)moments.push({id:`traffic:${car.id}`,driverId:car.id,opponentId:traffic.car.id,title:'クラス混走が近づく',detail:`${car.name} → ${traffic.car.name} · 現在の平均ペースなら約${Math.round(traffic.eta)}秒`,priority:70-traffic.eta/10})
    }
    if(car.lastLap!==null&&car.bestLap!==null&&Math.abs(car.lastLap-car.bestLap)<0.002)moments.push({id:`pb:${car.id}`,driverId:car.id,title:'直近の周で自己ベスト',detail:`${car.name} · ${car.lastLap.toFixed(3)}秒`,priority:40})
    const times=car.lapTimes.slice(-3)
    if(times.length===3&&times[2]>Math.min(times[0],times[1])+2)moments.push({id:`loss:${car.id}`,driverId:car.id,title:'直近ラップにタイムロス',detail:`${car.name} · 前2周の速い方から +${(times[2]-Math.min(times[0],times[1])).toFixed(2)}秒（原因は未判定）`,priority:50})
  }
  return moments.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,6)
}
export type PracticeMeasurement={driverId:string;lap:number;start:number;end:number;setup:CarSetup;weather:string;grip:number;fuel:number|null;tyreLife:number|null;topSpeed:number;highSpeed:number|null;slip:number|null;summary:ReturnType<typeof telemetrySummary>}
export function practiceMeasurement(car:EngineerCar,session:EngineerSession,notBefore:number):PracticeMeasurement|null {
  const observed=telemetryLaps(car.samples).find(l=>l.complete&&l.points[0].seconds>=notBefore&&(car.eligiblePracticeLaps===undefined||car.eligiblePracticeLaps.includes(l.lap))&&(car.eligiblePracticeWindows===undefined||car.eligiblePracticeWindows.some(w=>l.points[0].seconds>=w.start-0.3&&l.points.at(-1)!.seconds<=w.end+0.3&&l.points.at(-1)!.seconds>=w.end-(w.end-w.start)*0.04)))
  if(!observed||!car.setup)return null
  const mean=(key:keyof TelemetryPoint,rows=observed.points)=>{const vals=rows.map(p=>p[key]).filter((v):v is number=>typeof v==='number');return vals.length?vals.reduce((s,n)=>s+n,0)/vals.length:null}
  const corners=observed.points.filter(p=>(p.lateralG??0)>1&&p.speedKph>150)
  return {driverId:car.id,lap:observed.lap,start:observed.points[0].seconds,end:observed.points.at(-1)!.seconds,setup:{...car.setup},weather:session.weather,grip:session.grip,fuel:mean('fuelKg'),tyreLife:mean('tyreLifePercent'),topSpeed:Math.max(...observed.points.map(p=>p.speedKph)),highSpeed:mean('speedKph',corners),slip:mean('driveSlipPercent'),summary:telemetrySummary(observed.points)}
}
export function practiceConfounds(before:PracticeMeasurement,after:PracticeMeasurement) {
  return [before.weather!==after.weather?'天候が異なる':null,Math.abs(before.grip-after.grip)>0.02?'路面グリップが異なる':null,before.fuel===null||after.fuel===null?'燃料記録が不足':Math.abs(before.fuel-after.fuel)>3?'燃料差が3kg超':null,before.tyreLife===null||after.tyreLife===null?'タイヤ記録が不足':Math.abs(before.tyreLife-after.tyreLife)>5?'タイヤ残寿命差が5ポイント超':null,'交通・走行ラインの影響を含む。セッティングだけの効果とは断定できません。'].filter((s):s is string=>s!==null)
}
