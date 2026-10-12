import { telemetryExtraKeys, type TelemetryPoint } from '../simulation/telemetryHistory'

export type TelemetryChannel = Exclude<keyof TelemetryPoint,'lap'|'progress'|'seconds'>
export function telemetryLaps(samples:TelemetryPoint[]) {
  const laps=new Map<number,TelemetryPoint[]>()
  for(const point of samples){const rows=laps.get(point.lap)??[];rows.push(point);laps.set(point.lap,rows)}
  return [...laps].sort((a,b)=>b[0]-a[0]).map(([lap,points])=>({lap,points,coverage:points.reduce((sum,p,i)=>{const gap=i?p.progress-points[i-1].progress:0;return sum+(gap>0&&gap<=0.03?gap:0)},0),complete:points[0].progress<=0.01&&points.at(-1)!.progress>=0.97&&points.every((p,i)=>!i||p.progress-points[i-1].progress<=0.03)&&lap<(samples.at(-1)?.lap??lap)}))
}
export function selectTelemetryLap(samples:TelemetryPoint[],choice:string) {
  const laps=telemetryLaps(samples)
  if(choice==='latest')return (laps.find(lap=>lap.complete)??laps[0])?.points??[]
  if(choice==='current')return laps[0]?.points??[]
  if(choice==='previous')return laps[1]?.points??[]
  return laps.find(lap=>lap.lap===Number(choice))?.points??[]
}
/** Interpolate only between adjacent observations, never across missing road. */
export function telemetryValue(samples:TelemetryPoint[],progress:number,key:keyof TelemetryPoint):number|undefined {
  let lo=0,hi=samples.length-1
  while(lo<=hi){const mid=(lo+hi)>>1;if(samples[mid].progress<progress)lo=mid+1;else hi=mid-1}
  const right=samples[lo],left=samples[lo-1]
  if(right&&Math.abs(right.progress-progress)<1e-7)return right[key]
  if(!left||!right||right.progress-left.progress>0.03||left[key]===undefined||right[key]===undefined)return undefined
  if(key==='gear')return left[key]
  return left[key]!+(right[key]!-left[key]!)*(progress-left.progress)/(right.progress-left.progress)
}
/** Relative to a common observed distance, not a guessed start/finish time. */
export function telemetryDelta(a:TelemetryPoint[],b:TelemetryPoint[]) {
  const origin=Math.max(a[0]?.progress??Infinity,b[0]?.progress??Infinity)
  const end=Math.min(a.at(-1)?.progress??-Infinity,b.at(-1)?.progress??-Infinity)
  const startA=telemetryValue(a,origin,'seconds'),startB=telemetryValue(b,origin,'seconds')
  if(startA===undefined||startB===undefined||end<=origin)return {origin,end,points:[] as {progress:number;value:number|undefined}[]}
  return {origin,end,points:a.filter(p=>p.progress>=origin&&p.progress<=end).map(p=>{
    const other=telemetryValue(b,p.progress,'seconds')
    return {progress:p.progress,value:other===undefined?undefined:p.seconds-startA-(other-startB)}
  })}
}
export function telemetrySummary(samples:TelemetryPoint[]) {
  let observed=0,full=0,braking=0,lift=0
  for(let i=1;i<samples.length;i++){
    const previous=samples[i-1],span=samples[i].progress-previous.progress
    if(span<=0||span>0.03)continue
    observed+=span
    if(previous.throttlePercent>=95)full+=span
    if(previous.brakePercent>=5)braking+=span
    if(previous.throttlePercent<5&&previous.brakePercent<5)lift+=span
  }
  return {topSpeed:samples.length?Math.max(...samples.map(p=>p.speedKph)):undefined,observed,fullPercent:observed?full/observed*100:undefined,brakePercent:observed?braking/observed*100:undefined,coastPercent:observed?lift/observed*100:undefined}
}
export function cornerTelemetry(samples:TelemetryPoint[],progress:number) {
  // Deliberately non-wrapping: do not join the end and start of one sampled lap.
  const rows=samples.filter(p=>Math.abs(p.progress-progress)<=0.025)
  const braking=rows.find(p=>p.brakePercent>=5),pickup=rows.find(p=>p.progress>=progress&&p.throttlePercent>=95)
  return {entry:rows[0]?.speedKph,minimum:rows.length?Math.min(...rows.map(p=>p.speedKph)):undefined,exit:rows.at(-1)?.speedKph,brakeAt:braking?.progress,pickupAt:pickup?.progress}
}
export function telemetryCsv(traces:{name:string;samples:TelemetryPoint[]}[],lengthM:number) {
  const keys=['speedKph','throttlePercent','brakePercent','gear','rpm',...telemetryExtraKeys] as const
  const escape=(value:unknown)=>`"${String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`
  return '\uFEFF'+[['driver','lap','distanceM','simulationSeconds',...keys].join(','),...traces.flatMap(trace=>trace.samples.map(p=>[escape(trace.name),p.lap+1,(p.progress*lengthM).toFixed(2),p.seconds,...keys.map(key=>p[key]??'')].join(',')))].join('\r\n')
}

export function telemetryMap(centerline:readonly (readonly number[])[]) {
  if(centerline.length<2)return []
  const distances=[0]
  for(let i=1;i<centerline.length;i++)distances.push(distances[i-1]+Math.hypot(centerline[i][0]-centerline[i-1][0],centerline[i][2]-centerline[i-1][2]))
  const total=distances.at(-1)!
  if(total<=0)return []
  const xs=centerline.map(p=>p[0]),ys=centerline.map(p=>p[2]),minX=Math.min(...xs),minY=Math.min(...ys)
  const scale=Math.min(330/Math.max(1,Math.max(...xs)-minX),160/Math.max(1,Math.max(...ys)-minY))
  return centerline.map((p,i)=>({x:20+(p[0]-minX)*scale,y:20+(p[2]-minY)*scale,progress:distances[i]/total}))
}
