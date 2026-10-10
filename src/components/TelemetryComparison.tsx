import { useState } from 'react'
import type { TelemetryPoint } from '../simulation/telemetryHistory'
import './telemetryComparison.css'

export type TelemetryTrace = { id: string; name: string; color: string; samples: TelemetryPoint[] }
const channels = [ ['speedKph','速度','km/h',400], ['throttlePercent','アクセル','%',100], ['brakePercent','ブレーキ','%',100], ['gear','ギア','',8] ] as const
export function TelemetryComparison({ traces, selectedId, lengthM, corners = [] }: { traces: TelemetryTrace[]; selectedId: string; lengthM: number; corners?: { label: string; progress: number }[] }) {
  const [comparisonId,setComparisonId] = useState('')
  const [lap,setLap] = useState('latest')
  const [cursor,setCursor] = useState<number | null>(null)
  const first = traces.find(trace => trace.id === selectedId) ?? traces[0]
  const second = traces.find(trace => trace.id === comparisonId && trace.id !== first?.id) ?? traces.find(trace => trace.id !== first?.id)
  const laps = [...new Set((first?.samples ?? []).map(sample => sample.lap))].sort((a,b)=>b-a)
  const select = (trace: TelemetryTrace | undefined) => {
    if (!trace) return []
    const latest = trace.samples.at(-1)?.lap
    const completed = latest === undefined ? undefined : trace.samples.some(sample=>sample.lap===latest-1) ? latest-1 : latest
    return trace.samples.filter(sample=>sample.lap===(lap==='latest'?completed:Number(lap)))
  }
  const a=select(first), b=select(second)
  const nearest = (samples: TelemetryPoint[], progress: number) => {
    const point = samples.reduce<TelemetryPoint | undefined>((best,sample)=>Math.abs(sample.progress-progress)<Math.abs((best?.progress??Infinity)-progress)?sample:best,undefined)
    return point && Math.abs(point.progress-progress)<=0.03 ? point : undefined
  }
  const zones = corners.length ? corners : Array.from({length:8},(_,index)=>({label:`距離区間 ${index+1}`,progress:(index+0.5)/8}))
  const minimum = (samples: TelemetryPoint[],progress: number) => {
    const delta = (point: TelemetryPoint) => ((point.progress-progress+1.5)%1)-0.5
    const window = samples.filter(sample=>Math.abs(delta(sample))<0.025).sort((left,right)=>delta(left)-delta(right))
    if (!window.length) return '—'
    return `${window[0].speedKph.toFixed(1)} / ${Math.min(...window.map(sample=>sample.speedKph)).toFixed(1)} / ${window.at(-1)!.speedKph.toFixed(1)}`
  }
  return <section className="telemetry-comparison" aria-label="Telemetry comparison">
    <h3>テレメトリー比較 <small>SIM・走行計算値</small></h3>
    <p>同じコース距離で速度・アクセル・ブレーキ・ギアを比較。各車の直近2周と走行中の周を記録します。未走行区間は空欄です。</p>
    <div className="telemetry-selectors"><label>比較車両<select aria-label="Telemetry comparison car" value={second?.id ?? ''} onChange={event=>setComparisonId(event.target.value)}>{traces.filter(trace=>trace.id!==first?.id).map(trace=><option key={trace.id} value={trace.id}>{trace.name}</option>)}</select></label><label>周回<select aria-label="Telemetry comparison lap" value={lap} onChange={event=>setLap(event.target.value)}><option value="latest">各車の直近完了周（未完走時は走行中）</option>{laps.map(value=><option key={value} value={value}>LAP {value+1}</option>)}</select></label></div>
    <p><span style={{color:first?.color}}>{first?.name}</span> ／ <span style={{color:second?.color===first?.color?'#ffb74d':second?.color}}>{second?.name}</span> · {a.length} / {b.length} samples</p>
    {cursor!==null && <p aria-live="off">{Math.round(cursor*lengthM)}m · {channels.map(([key,label])=>`${label} ${nearest(a,cursor)?.[key] ?? '—'} / ${nearest(b,cursor)?.[key] ?? '—'}`).join(' · ')}</p>}
    {channels.map(([key,label,unit,ceiling])=><figure key={key}><figcaption>{label} {unit && `(${unit})`}</figcaption><svg viewBox="0 0 600 115" role="img" aria-label={`${label} distance comparison`} onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();setCursor(Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*600-35)/555)))}} onPointerLeave={()=>setCursor(null)}>
      {[0,0.5,1].map(ratio=><g key={ratio}><line x1="35" x2="590" y1={95-ratio*85} y2={95-ratio*85} stroke="#263c49"/><text x="0" y={98-ratio*85}>{ratio*ceiling}</text></g>)}
      {corners.map(corner=><g key={corner.label}><line x1={35+corner.progress*555} x2={35+corner.progress*555} y1="10" y2="95" stroke="#294653"/><text x={35+corner.progress*555} y="110">{corner.label}</text></g>)}
      {cursor!==null && <line x1={35+cursor*555} x2={35+cursor*555} y1="10" y2="95" stroke="#d5e9f4" strokeDasharray="3 3"/>}
      {[{samples:a,color:first?.color ?? '#40cfff'},{samples:b,color:second?.color===first?.color?'#ffb74d':second?.color ?? '#ffb74d'}].map(({samples,color},index)=><path key={index} fill="none" stroke={color} strokeWidth="1.8" d={samples.map((point,i)=>`${i===0||point.progress-(samples[i-1]?.progress??0)>0.03?'M':'L'}${(35+point.progress*555).toFixed(2)},${(95-Math.min(1,point[key]/ceiling)*85).toFixed(2)}`).join(' ')}/>)}
    </svg></figure>)}
    <p>横軸：0–{Math.round(lengthM)} m。速度域は印の前後2.5%で「進入 / 最低 / 立ち上がり」の順です。グラフにマウスを置くと最寄りの記録値を表示します。</p>
    <table><thead><tr><th>{corners.length?'コーナー（モデル位置）':'距離区間'}</th><th>{first?.name} km/h</th><th>{second?.name} km/h</th></tr></thead><tbody>{zones.map(zone=><tr key={zone.label}><td>{zone.label} · {Math.round(zone.progress*lengthM)}m</td><td>{minimum(a,zone.progress)}</td><td>{minimum(b,zone.progress)}</td></tr>)}</tbody></table>
    {!a.length && <p>走行を開始すると記録されます。保存前に収集していない過去の周回は再構成しません。</p>}
  </section>
}
