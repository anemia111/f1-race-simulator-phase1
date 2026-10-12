import { handlingSlip, type VehicleHandlingState } from './vehicleHandling'
export type TelemetryPoint = { lap: number; progress: number; seconds: number; speedKph: number; throttlePercent: number; brakePercent: number; gear: number; rpm: number; driveSlipPercent?: number; brakeSlipPercent?: number; lateralG?: number; steeringDegrees?: number }
const extraKeys = ['driveSlipPercent','brakeSlipPercent','lateralG','steeringDegrees'] as const
export function handlingTelemetry(s: VehicleHandlingState | undefined): Partial<TelemetryPoint> {
  if (!s) return {}
  const slip = handlingSlip(s)
  return { driveSlipPercent: Number((slip.drive*100).toFixed(2)), brakeSlipPercent: Number((slip.brake*100).toFixed(2)), lateralG: Number((Math.abs(s.lateralAcceleration)/9.80665).toFixed(2)), steeringDegrees: Number((s.steeringRad*180/Math.PI).toFixed(2)) }
}

/** Spatial samples from the actual physics ticks, including fast-forward. Never synthesize missing bins. */
export function recordTelemetry(history: TelemetryPoint[] | undefined, point: TelemetryPoint): TelemetryPoint[] {
  const previous = history ?? []
  if (point.lap < 0) return previous
  const last = previous.at(-1)
  if (last && last.lap === point.lap && Math.floor(last.progress * 512) === Math.floor(point.progress * 512)) return previous
  point = {...point,progress:Math.min(0.999999,Number(point.progress.toFixed(6))),seconds:Number(point.seconds.toFixed(2)),speedKph:Number(point.speedKph.toFixed(2)),throttlePercent:Number(point.throttlePercent.toFixed(1)),brakePercent:Number(point.brakePercent.toFixed(1)),rpm:Math.round(point.rpm)}
  // Recorded laps are chronological. Prune once at a lap transition rather
  // than scanning and copying all 1536 points for every spatial sample.
  const retained = previous[0]?.lap < point.lap-2 ? previous.filter(sample=>sample.lap>=point.lap-2) : previous
  const next = retained.concat(point)
  return next.length>1536 ? next.slice(-1536) : next
}

/** Lossless for the recorder's declared precision; compact enough for localStorage. */
export function encodeTelemetryHistory(points: TelemetryPoint[]): string {
  const extended = points.some(p => extraKeys.some(k => p[k] !== undefined))
  return (extended?'t2:':'t1:')+points.map(point=>[point.lap,Math.round(point.progress*1e6),Math.round(point.seconds*100),Math.round(point.speedKph*100),Math.round(point.throttlePercent*10),Math.round(point.brakePercent*10),point.gear,point.rpm,...(extended?extraKeys.map(k=>point[k]===undefined?undefined:Math.round(point[k]!*100)):[])].map(value=>value===undefined?'_':value.toString(36)).join('.')).join(',')
}
export function decodeTelemetryHistory(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (!value.startsWith('t1:') && !value.startsWith('t2:')) return null
  const extended = value.startsWith('t2:')
  const rows=value.slice(3) ? value.slice(3).split(',') : []
  if (rows.length>1536) return null
  const points: TelemetryPoint[]=[]
  for(const row of rows){
    const tokens=row.split('.')
    if(tokens.length!==(extended?12:8) || tokens.some((token,i)=>!(extended&&i>=8&&token==='_')&&!/^-?[0-9a-z]+$/.test(token))) return null
    const [lap,progress,seconds,speed,throttle,brake,gear,rpm]=tokens.slice(0,8).map(token=>parseInt(token,36))
    const point: TelemetryPoint={lap,progress:progress/1e6,seconds:seconds/100,speedKph:speed/100,throttlePercent:throttle/10,brakePercent:brake/10,gear,rpm}
    if(extended)extraKeys.forEach((key,i)=>{if(tokens[i+8]!=='_')point[key]=parseInt(tokens[i+8],36)/100})
    if (Object.values(point).some(n => !Number.isFinite(n)) || extraKeys.some(key => point[key] !== undefined && Math.abs(point[key]!) > (key === 'steeringDegrees' ? 180 : key === 'lateralG' ? 30 : 300))) return null
    points.push(point)
  }
  return points
}
