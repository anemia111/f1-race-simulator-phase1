import { handlingSlip, type VehicleHandlingState } from './vehicleHandling'
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate'
export type TelemetryPoint = { lap: number; progress: number; seconds: number; speedKph: number; throttlePercent: number; brakePercent: number; gear: number; rpm: number; driveSlipPercent?: number; brakeSlipPercent?: number; lateralG?: number; steeringDegrees?: number; longitudinalG?: number; yawDegreesPerSecond?: number; rollDegrees?: number; pitchDegrees?: number; brakeTemperatureC?: number; tyreFLTemperatureC?: number; tyreFRTemperatureC?: number; tyreRLTemperatureC?: number; tyreRRTemperatureC?: number; tyreCoreTemperatureC?: number; tyreLifePercent?: number; fuelKg?: number; energyPercent?: number; deploymentKw?: number; recoveryKw?: number }
export const telemetryExtraKeys = ['driveSlipPercent','brakeSlipPercent','lateralG','steeringDegrees','longitudinalG','yawDegreesPerSecond','rollDegrees','pitchDegrees','brakeTemperatureC','tyreFLTemperatureC','tyreFRTemperatureC','tyreRLTemperatureC','tyreRRTemperatureC','tyreCoreTemperatureC','tyreLifePercent','fuelKg','energyPercent','deploymentKw','recoveryKw'] as const
const extraKeys = telemetryExtraKeys
export function handlingTelemetry(s: VehicleHandlingState | undefined): Partial<TelemetryPoint> {
  if (!s) return {}
  const slip = handlingSlip(s)
  return { driveSlipPercent: slip.drive*100, brakeSlipPercent: slip.brake*100, lateralG: Math.abs(s.lateralAcceleration)/9.80665, steeringDegrees: s.steeringRad*180/Math.PI,
    longitudinalG:s.longitudinalAcceleration/9.80665,yawDegreesPerSecond:s.yawRate*180/Math.PI,rollDegrees:s.rollRad*180/Math.PI,pitchDegrees:s.pitchRad*180/Math.PI,
    brakeTemperatureC:s.brakeTemperatureC,tyreFLTemperatureC:s.wheels[0].surfaceC,tyreFRTemperatureC:s.wheels[1].surfaceC,tyreRLTemperatureC:s.wheels[2].surfaceC,tyreRRTemperatureC:s.wheels[3].surfaceC,
    tyreCoreTemperatureC:s.wheels.reduce((sum,w)=>sum+w.coreC,0)/4 }
}

/** Spatial samples from the actual physics ticks, including fast-forward. Never synthesize missing bins. */
export function recordTelemetry(history: TelemetryPoint[] | undefined, point: TelemetryPoint): TelemetryPoint[] {
  const previous = history ?? []
  if (point.lap < 0) return previous
  const last = previous.at(-1)
  if (last && last.lap === point.lap && Math.floor(last.progress * 512) === Math.floor(point.progress * 512)) return previous
  point = {...point,progress:Math.min(0.999999,Number(point.progress.toFixed(6))),seconds:Number(point.seconds.toFixed(2)),speedKph:Number(point.speedKph.toFixed(2)),throttlePercent:Number(point.throttlePercent.toFixed(1)),brakePercent:Number(point.brakePercent.toFixed(1)),rpm:Math.round(point.rpm)}
  for(const key of extraKeys)if(point[key]!==undefined)point[key]=Number(point[key]!.toFixed(2))
  // Recorded laps are chronological. Prune once at a lap transition rather
  // than scanning and copying all 1536 points for every spatial sample.
  const retained = previous[0]?.lap < point.lap-2 ? previous.filter(sample=>sample.lap>=point.lap-2) : previous
  const next = retained.concat(point)
  return next.length>1536 ? next.slice(-1536) : next
}

/** Lossless for the recorder's declared precision; compact enough for localStorage. */
export function encodeTelemetryHistory(points: TelemetryPoint[]): string {
  const extended = points.some(p => extraKeys.some(k => p[k] !== undefined))
  const keys=points.some(p=>extraKeys.slice(4).some(k=>p[k]!==undefined))?extraKeys:extraKeys.slice(0,4)
  const plain=(extended?keys.length>4?'t3:':'t2:':'t1:')+points.map(point=>[point.lap,Math.round(point.progress*1e6),Math.round(point.seconds*100),Math.round(point.speedKph*100),Math.round(point.throttlePercent*10),Math.round(point.brakePercent*10),point.gear,point.rpm,...(extended?keys.map(k=>point[k]===undefined?undefined:Math.round(point[k]!*100)):[])].map(value=>value===undefined?'_':value.toString(36)).join('.')).join(',')
  if(!plain.startsWith('t3:')||plain.length<8192)return plain
  const bytes=zlibSync(strToU8(plain),{level:1})
  let binary=''
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  const packed=`t3z:${plain.length}:${btoa(binary)}`
  return packed.length<plain.length?packed:plain
}
export function decodeTelemetryHistory(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if(value.startsWith('t3z:')){
    try {
      const match=/^t3z:([0-9]{1,6}):([A-Za-z0-9+/=]+)$/.exec(value)
      if(!match)return null
      const size=Number(match[1])
      if(size<3||size>524288||match[2].length>700000)return null
      const bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0))
      value=strFromU8(unzlibSync(bytes,{out:new Uint8Array(size)}))
      if(typeof value!=='string'||value.length!==size||!value.startsWith('t3:'))return null
    } catch {return null}
  }
  if (!value.startsWith('t1:') && !value.startsWith('t2:') && !value.startsWith('t3:')) return null
  const keys=value.startsWith('t3:')?extraKeys:value.startsWith('t2:')?extraKeys.slice(0,4):[]
  const extended = keys.length>0
  const rows=value.slice(3) ? value.slice(3).split(',') : []
  if (rows.length>1536) return null
  const points: TelemetryPoint[]=[]
  for(const row of rows){
    const tokens=row.split('.')
    if(tokens.length!==8+keys.length || tokens.some((token,i)=>!(extended&&i>=8&&token==='_')&&!/^-?[0-9a-z]+$/.test(token))) return null
    const [lap,progress,seconds,speed,throttle,brake,gear,rpm]=tokens.slice(0,8).map(token=>parseInt(token,36))
    const point: TelemetryPoint={lap,progress:progress/1e6,seconds:seconds/100,speedKph:speed/100,throttlePercent:throttle/10,brakePercent:brake/10,gear,rpm}
    if(extended)keys.forEach((key,i)=>{if(tokens[i+8]!=='_')point[key]=parseInt(tokens[i+8],36)/100})
    if (Object.values(point).some(n => !Number.isFinite(n)) || extraKeys.some(key => point[key] !== undefined && Math.abs(point[key]!) > (key.includes('Temperature') ? 1500 : key==='deploymentKw'||key==='recoveryKw'?2000:key === 'steeringDegrees' ? 180 : key === 'lateralG'||key==='longitudinalG' ? 30 : 300))) return null
    points.push(point)
  }
  return points
}
