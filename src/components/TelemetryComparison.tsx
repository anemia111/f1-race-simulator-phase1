import { useMemo, useState } from 'react'
import type { TelemetryPoint } from '../simulation/telemetryHistory'
import { cornerTelemetry, selectTelemetryLap, telemetryCsv, telemetryDelta, telemetryLaps, telemetryMap, telemetrySummary, telemetryValue, type TelemetryChannel } from '../domain/telemetryAnalysis'
import './telemetryComparison.css'

export type TelemetryTrace = { id: string; name: string; color: string; samples: TelemetryPoint[] }
type Channel={key:TelemetryChannel;label:string;unit:string;low:number;high:number}
const groups:Record<string,{label:string;channels:Channel[]}>= {
  driving:{label:'ドライビング',channels:[{key:'speedKph',label:'速度',unit:'km/h',low:0,high:400},{key:'throttlePercent',label:'アクセル',unit:'%',low:0,high:100},{key:'brakePercent',label:'ブレーキ',unit:'%',low:0,high:100},{key:'gear',label:'ギア',unit:'',low:0,high:8},{key:'rpm',label:'エンジン回転',unit:'rpm',low:0,high:16000}]},
  handling:{label:'グリップ・車体',channels:[{key:'driveSlipPercent',label:'駆動輪の滑り',unit:'%',low:0,high:60},{key:'brakeSlipPercent',label:'制動時の滑り',unit:'%',low:0,high:60},{key:'lateralG',label:'横G（絶対値）',unit:'G',low:0,high:6},{key:'longitudinalG',label:'前後G',unit:'G',low:-6,high:3},{key:'steeringDegrees',label:'操舵角（前輪）',unit:'°',low:-40,high:40},{key:'yawDegreesPerSecond',label:'ヨーレート',unit:'°/s',low:-100,high:100},{key:'rollDegrees',label:'ロール',unit:'°',low:-5,high:5},{key:'pitchDegrees',label:'ピッチ',unit:'°',low:-5,high:5}]},
  tyres:{label:'タイヤ・ブレーキ',channels:[{key:'tyreFLTemperatureC',label:'左前タイヤ表面',unit:'°C',low:20,high:160},{key:'tyreFRTemperatureC',label:'右前タイヤ表面',unit:'°C',low:20,high:160},{key:'tyreRLTemperatureC',label:'左後タイヤ表面',unit:'°C',low:20,high:160},{key:'tyreRRTemperatureC',label:'右後タイヤ表面',unit:'°C',low:20,high:160},{key:'tyreCoreTemperatureC',label:'タイヤ内部（4輪平均）',unit:'°C',low:20,high:160},{key:'tyreLifePercent',label:'タイヤ残寿命',unit:'%',low:0,high:100},{key:'brakeTemperatureC',label:'ブレーキ温度',unit:'°C',low:0,high:1250}]},
  energy:{label:'燃料・エネルギー',channels:[{key:'fuelKg',label:'燃料残量',unit:'kg',low:0,high:110},{key:'energyPercent',label:'蓄電残量',unit:'%',low:0,high:100},{key:'deploymentKw',label:'電動アシスト出力',unit:'kW',low:0,high:350},{key:'recoveryKw',label:'回生出力',unit:'kW',low:0,high:350}]},
}
const fmt=(n:number|undefined,digits=1)=>n===undefined?'—':n.toFixed(digits)
const signed=(n:number|undefined)=>n===undefined?'—':`${n>0?'+':''}${n.toFixed(3)}`
const bounded=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n))

export function TelemetryComparison({traces,selectedId,lengthM,corners=[],centerline=[]}:{traces:TelemetryTrace[];selectedId:string;lengthM:number;corners?:{label:string;progress:number}[];centerline?:readonly (readonly number[])[]}) {
  const [comparisonId,setComparisonId]=useState(''),[lapA,setLapA]=useState('latest'),[lapB,setLapB]=useState('latest')
  const [selfCompare,setSelfCompare]=useState(traces.length<2),[group,setGroup]=useState('driving')
  const [cursor,setCursor]=useState(0.5),[pinned,setPinned]=useState(false),[range,setRange]=useState<[number,number]>([0,1])
  const first=traces.find(t=>t.id===selectedId)??traces[0]
  const second=selfCompare?first:traces.find(t=>t.id===comparisonId&&t.id!==first?.id)??traces.find(t=>t.id!==first?.id)
  const a=useMemo(()=>selectTelemetryLap(first?.samples??[],lapA),[first?.samples,lapA])
  const b=useMemo(()=>selectTelemetryLap(second?.samples??[],selfCompare&&lapB==='latest'?String((a[0]?.lap??0)-1):lapB),[second?.samples,selfCompare,lapB,a])
  const delta=useMemo(()=>telemetryDelta(a,b),[a,b])
  const summaryA=useMemo(()=>telemetrySummary(a),[a]),summaryB=useMemo(()=>telemetrySummary(b),[b])
  const map=useMemo(()=>telemetryMap(centerline),[centerline])
  const colorA=first?.color??'#48d8ff',colorB=selfCompare||second?.color===colorA?'#ffbc66':second?.color??'#ffbc66'
  const x=(progress:number)=>35+(progress-range[0])/(range[1]-range[0])*555
  const channels=groups[group].channels
  const chartData=useMemo(()=>channels.map(channel=>{
    const values=[...a,...b].map(p=>p[channel.key]).filter((v):v is number=>v!==undefined)
    // Expand rather than clip peaks outside the usual display range.
    const low=Math.min(channel.low,...values),high=Math.max(channel.high,...values)
    const paths=[a,b].map(samples=>samples.map((point,i)=>{
      const value=point[channel.key]
      if(value===undefined||point.progress<range[0]||point.progress>range[1])return ''
      const previous=samples[i-1]
      const start=!previous||previous[channel.key]===undefined||previous.progress<range[0]||point.progress-previous.progress>0.03
      const px=35+(point.progress-range[0])/(range[1]-range[0])*555,py=95-(value-low)/(high-low)*85
      return `${start?'M':'L'}${px.toFixed(2)},${py.toFixed(2)}`
    }).join(' '))
    return {...channel,low,high,paths,available:values.length>0}
  }),[a,b,channels,range])
  const limit=Math.max(0.1,...delta.points.map(p=>Math.abs(p.value??0)))*1.1
  const deltaPath=useMemo(()=>delta.points.map((p,i)=>p.value===undefined||p.progress<range[0]||p.progress>range[1]?'':`${i===0||delta.points[i-1].value===undefined||delta.points[i-1].progress<range[0]||p.progress-delta.points[i-1].progress>0.03?'M':'L'}${(35+(p.progress-range[0])/(range[1]-range[0])*555).toFixed(2)},${(52.5-p.value/limit*42.5).toFixed(2)}`).join(' '),[delta,range,limit])
  const currentA=telemetryValue(a,cursor,'seconds'),currentB=telemetryValue(b,cursor,'seconds')
  const originA=telemetryValue(a,delta.origin,'seconds'),originB=telemetryValue(b,delta.origin,'seconds')
  const currentDelta=currentA===undefined||currentB===undefined||originA===undefined||originB===undefined?undefined:currentA-originA-(currentB-originB)
  const marker=map.reduce<(typeof map)[number]|undefined>((best,p)=>Math.abs(p.progress-cursor)<Math.abs((best?.progress??Infinity)-cursor)?p:best,undefined)
  const zones=corners.length?corners:Array.from({length:8},(_,i)=>({label:`区間 ${i+1}`,progress:(i+0.5)/8}))
  const zoom=(progress:number)=>{setCursor(progress);setRange([Math.max(0,progress-0.065),Math.min(1,progress+0.065)])}
  const exportCsv=()=>{
    const blob=new Blob([telemetryCsv([{name:first?.name??'A',samples:a},{name:second?.name??'B',samples:b}],lengthM)],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`telemetry-L${(a[0]?.lap??0)+1}-vs-L${(b[0]?.lap??0)+1}.csv`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const lapOptions=(trace:TelemetryTrace|undefined,isB=false)=><><option value="latest">{selfCompare&&isB?'Aのひとつ前の周':'直近の全周記録（なければ最新）'}</option><option value="current">最新の記録周</option><option value="previous">最新のひとつ前</option>{telemetryLaps(trace?.samples??[]).map(l=><option key={l.lap} value={l.lap}>LAP {l.lap+1} · {l.complete?'全周記録':`部分記録 ${Math.round(l.coverage*100)}%`}</option>)}</>
  const chartPointer=(event:React.PointerEvent<SVGSVGElement>)=>{if(pinned)return;const rect=event.currentTarget.getBoundingClientRect();setCursor(bounded(range[0]+((event.clientX-rect.left)/rect.width*600-35)/555*(range[1]-range[0]),range[0],range[1]))}
  const grid=(low:number,high:number)=><>{[0,0.5,1].map(ratio=><g key={ratio}><line x1="35" x2="590" y1={95-ratio*85} y2={95-ratio*85} stroke="#263c49"/><text x="0" y={98-ratio*85}>{fmt(low+ratio*(high-low),high-low>20?0:1)}</text></g>)}{corners.filter(c=>c.progress>=range[0]&&c.progress<=range[1]).map(c=><g key={c.label}><line x1={x(c.progress)} x2={x(c.progress)} y1="10" y2="95" stroke="#294653"/><text x={x(c.progress)} y="110">{c.label}</text></g>)}{cursor>=range[0]&&cursor<=range[1]&&<line x1={x(cursor)} x2={x(cursor)} y1="10" y2="95" stroke="#d5e9f4" strokeDasharray="3 3"/>}</>
  return <section className="telemetry-comparison" aria-label="Telemetry comparison">
    <div className="telemetry-title"><div><small>TELEMETRY LAB / SIM</small><h3>走りの差を、コーナーから読む。</h3></div><button onClick={exportCsv} disabled={!a.length&&!b.length}>CSVを書き出す</button></div>
    <div className="telemetry-selectors"><label>比較相手<select aria-label="Telemetry comparison car" value={selfCompare?'self':second?.id??''} onChange={e=>{setSelfCompare(e.target.value==='self');if(e.target.value!=='self')setComparisonId(e.target.value)}}><option value="self">自分の別の周回</option>{traces.filter(t=>t.id!==first?.id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Aの周回<select aria-label="Telemetry lap A" value={lapA} onChange={e=>setLapA(e.target.value)}>{lapOptions(first)}</select></label><label>Bの周回<select aria-label="Telemetry lap B" value={lapB} onChange={e=>setLapB(e.target.value)}>{lapOptions(second,true)}</select></label></div>
    <div className="telemetry-legends"><span style={{color:colorA}}>● A · {first?.name??'—'} · LAP {a[0]?a[0].lap+1:'—'} · {a.length}点</span><span style={{color:colorB}}>● B · {second?.name??'—'} · LAP {b[0]?b[0].lap+1:'—'} · {b.length}点</span></div>
    <div className="telemetry-explorer">
      <div className="telemetry-map"><small>コースをクリックして位置を選択</small>{map.length>0?<svg viewBox="0 0 370 200" role="img" aria-label="Telemetry circuit position" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*370,py=(e.clientY-rect.top)/rect.height*200;const closest=map.reduce((best,p)=>Math.hypot(p.x-px,p.y-py)<Math.hypot(best.x-px,best.y-py)?p:best,map[0]);setCursor(closest.progress);setPinned(true)}}><path d={map.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#304958" strokeWidth="7"/>{map.filter((_,i)=>i%3===0).map((p,i)=>{const speedA=telemetryValue(a,p.progress,'speedKph'),speedB=telemetryValue(b,p.progress,'speedKph');return <circle key={i} cx={p.x} cy={p.y} r="2.2" fill={speedA===undefined||speedB===undefined?'#51616a':speedA>=speedB?colorA:colorB}/>})}{marker&&<circle cx={marker.x} cy={marker.y} r="6" fill="#fff" stroke="#48d8ff" strokeWidth="3"/>}<text x="20" y="193">色：その地点の速度が高い車両 / 灰：比較データなし</text></svg>:<p>コース形状がありません。距離スライダーで選択できます。</p>}</div>
      <div className="telemetry-focus"><small>DISTANCE INSPECTOR</small><strong>{Math.round(cursor*lengthM).toLocaleString()} <small>m</small></strong><div className={currentDelta===undefined?'':currentDelta<=0?'telemetry-gain':'telemetry-loss'}>A − B　{signed(currentDelta)} s</div><p>マイナスはAが速い。共通の記録開始位置 {Number.isFinite(delta.origin)?Math.round(delta.origin*lengthM):'—'}m をゼロとする相対差。</p><input aria-label="Telemetry distance" type="range" min="0" max="1000" value={Math.round(cursor*1000)} onChange={e=>{setCursor(Number(e.target.value)/1000);setPinned(true)}}/><div className="telemetry-actions"><button aria-pressed={pinned} onClick={()=>setPinned(!pinned)}>{pinned?'位置固定中':'マウス追従'}</button><button onClick={()=>zoom(cursor)}>この位置を拡大</button><button onClick={()=>setRange([0,1])}>全周へ戻す</button></div></div>
    </div>
    <div className="telemetry-kpis">{[['最高速',fmt(summaryA.topSpeed),fmt(summaryB.topSpeed),'km/h'],['全開区間',fmt(summaryA.fullPercent),fmt(summaryB.fullPercent),'%'],['制動区間',fmt(summaryA.brakePercent),fmt(summaryB.brakePercent),'%'],['惰性区間',fmt(summaryA.coastPercent),fmt(summaryB.coastPercent),'%']].map(([label,av,bv,unit])=><div key={label}><small>{label}</small><strong style={{color:colorA}}>{av}<small> {unit}</small></strong><span style={{color:colorB}}>B {bv} {unit}</span></div>)}</div>
    <p>割合は観測できた距離に対する値です。直近2周＋記録中の周を保持。未記録・ピットなどの欠測区間を補完しません。</p>
    <figure className="telemetry-delta"><figcaption>距離ごとのタイム差 <span className="telemetry-gain">− Aが速い</span> / <span className="telemetry-loss">＋ Bが速い</span> · {signed(currentDelta)} s</figcaption><svg viewBox="0 0 600 115" role="img" aria-label="Relative elapsed time delta" onPointerMove={chartPointer} onClick={()=>setPinned(!pinned)}>{grid(-limit,limit)}<line x1="35" x2="590" y1="52.5" y2="52.5" stroke="#78909c"/><path d={deltaPath} fill="none" stroke="#53e4cb" strokeWidth="2"/></svg>{!delta.points.length&&<p>比較できる同じ距離の記録が揃うと表示されます。</p>}</figure>
    <div className="telemetry-tabs" role="group" aria-label="Telemetry channel groups">{Object.entries(groups).map(([id,item])=><button key={id} aria-pressed={group===id} onClick={()=>setGroup(id)}>{item.label}</button>)}</div>
    {chartData.map(channel=><figure key={channel.key}><figcaption>{channel.label} <small>{channel.unit}</small><span><b style={{color:colorA}}>{fmt(telemetryValue(a,cursor,channel.key))}</b> / <b style={{color:colorB}}>{fmt(telemetryValue(b,cursor,channel.key))}</b></span></figcaption><svg viewBox="0 0 600 115" role="img" aria-label={`${channel.label} distance comparison`} onPointerMove={chartPointer} onClick={()=>setPinned(!pinned)}>{grid(channel.low,channel.high)}{channel.paths.map((path,i)=><path key={i} d={path} fill="none" stroke={i?colorB:colorA} strokeWidth="1.8"/>)}</svg>{!channel.available&&<p>この記録・カテゴリーにはデータがありません。</p>}</figure>)}
    <div className="telemetry-corners"><h4>コーナー比較 <small>クリックで区間を拡大</small></h4><div className="telemetry-corner-buttons">{zones.map(zone=><button key={zone.label} onClick={()=>zoom(zone.progress)}>{zone.label}</button>)}</div><div className="telemetry-table-scroll"><table><thead><tr><th>モデル位置</th><th>A 進入 / 最低 / 出口 km/h</th><th>B 進入 / 最低 / 出口 km/h</th><th>A − B 最低速</th><th>A / B 制動位置 m</th><th>A / B 全開復帰 m</th></tr></thead><tbody>{zones.map(zone=>{const ca=cornerTelemetry(a,zone.progress),cb=cornerTelemetry(b,zone.progress);return <tr key={zone.label}><th><button onClick={()=>zoom(zone.progress)}>{zone.label} · {Math.round(zone.progress*lengthM)}m</button></th><td>{fmt(ca.entry)} / {fmt(ca.minimum)} / {fmt(ca.exit)}</td><td>{fmt(cb.entry)} / {fmt(cb.minimum)} / {fmt(cb.exit)}</td><td>{ca.minimum===undefined||cb.minimum===undefined?'—':fmt(ca.minimum-cb.minimum)}</td><td>{fmt(ca.brakeAt===undefined?undefined:ca.brakeAt*lengthM,0)} / {fmt(cb.brakeAt===undefined?undefined:cb.brakeAt*lengthM,0)}</td><td>{fmt(ca.pickupAt===undefined?undefined:ca.pickupAt*lengthM,0)} / {fmt(cb.pickupAt===undefined?undefined:cb.pickupAt*lengthM,0)}</td></tr>})}</tbody></table></div><p>進入・最低速・出口はモデル位置の前後2.5%の記録範囲。制動位置はその範囲で最初にブレーキ5%以上、全開復帰はモデル位置以降で最初にアクセル95%以上を記録した場所です。正確な制動開始点ではありません。</p></div>
    <p>表示範囲：{Math.round(range[0]*lengthM)}–{Math.round(range[1]*lengthM)}m。クリックで位置固定・解除、距離スライダーは矢印キーでも操作できます。旧セーブにない新項目は、新たに走行すると記録されます。</p>
    {!a.length&&<p className="telemetry-empty">走行を開始すると、ここにドライバーの走りが描かれます。</p>}
  </section>
}
