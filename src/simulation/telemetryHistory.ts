export type TelemetryPoint = { lap: number; progress: number; seconds: number; speedKph: number; throttlePercent: number; brakePercent: number; gear: number; rpm: number }

/** Spatial samples from the actual physics ticks, including fast-forward. Never synthesize missing bins. */
export function recordTelemetry(history: TelemetryPoint[] | undefined, point: TelemetryPoint): TelemetryPoint[] {
  const previous = history ?? []
  if (point.lap < 0) return previous
  const last = previous.at(-1)
  if (last && last.lap === point.lap && Math.floor(last.progress * 256) === Math.floor(point.progress * 256)) return previous
  point = {...point,progress:Math.min(0.999999,Number(point.progress.toFixed(6))),seconds:Number(point.seconds.toFixed(2)),speedKph:Number(point.speedKph.toFixed(2)),throttlePercent:Number(point.throttlePercent.toFixed(1)),brakePercent:Number(point.brakePercent.toFixed(1)),rpm:Math.round(point.rpm)}
  // Recorded laps are chronological. Prune once at a lap transition rather
  // than scanning and copying all 768 points for every spatial sample.
  const retained = previous[0]?.lap < point.lap-2 ? previous.filter(sample=>sample.lap>=point.lap-2) : previous
  const next = retained.concat(point)
  return next.length>768 ? next.slice(-768) : next
}

/** Lossless for the recorder's declared precision; compact enough for localStorage. */
export function encodeTelemetryHistory(points: TelemetryPoint[]): string {
  return 't1:'+points.map(point=>[point.lap,Math.round(point.progress*1e6),Math.round(point.seconds*100),Math.round(point.speedKph*100),Math.round(point.throttlePercent*10),Math.round(point.brakePercent*10),point.gear,point.rpm].map(value=>value.toString(36)).join('.')).join(',')
}
export function decodeTelemetryHistory(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (!value.startsWith('t1:')) return null
  const rows=value.slice(3) ? value.slice(3).split(',') : []
  if (rows.length>768) return null
  const points: TelemetryPoint[]=[]
  for(const row of rows){
    const tokens=row.split('.')
    if(tokens.length!==8 || tokens.some(token=>!/^-?[0-9a-z]+$/.test(token))) return null
    const [lap,progress,seconds,speed,throttle,brake,gear,rpm]=tokens.map(token=>parseInt(token,36))
    points.push({lap,progress:progress/1e6,seconds:seconds/100,speedKph:speed/100,throttlePercent:throttle/10,brakePercent:brake/10,gear,rpm})
  }
  return points
}
