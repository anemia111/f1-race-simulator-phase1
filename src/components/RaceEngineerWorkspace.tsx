import {useMemo,useState} from 'react'
import type {CarSetup} from '../types'
import {drivingSignature} from '../simulation/drivingSignature'
import {driverOverallAbilityPoints} from '../simulation/driverAbility'
import {makeEngineeringPlan,practiceConfounds,practiceMeasurement,strategyScenarios,watchMoments,type EngineerSession,type EngineeringPlan,type PracticeMeasurement} from '../domain/raceEngineer'
import './raceEngineer.css'

export type EngineeringControls={session:EngineerSession;onPlan:(id:string,plan:EngineeringPlan|null)=>void;onSetup?:(id:string,key:keyof CarSetup,value:number)=>void}
const setupFields:Record<keyof CarSetup,{label:string;min:number;max:number;step:number}>={frontWing:{label:'フロントウイング',min:1,max:10,step:1},rearWing:{label:'リアウイング',min:1,max:10,step:1},rideHeightMm:{label:'車高 mm',min:20,max:45,step:1},brakeBiasPercent:{label:'前ブレーキ配分 %',min:52,max:60,step:0.5},differentialPercent:{label:'デフロック %',min:35,max:75,step:1},coolingPercent:{label:'冷却開口 %',min:25,max:90,step:1}}
const value=(n:number|null|undefined,suffix='',digits=1)=>n===null||n===undefined?'記録なし':`${n.toFixed(digits)}${suffix}`

function PracticeExperiment({session,id,paused,onSetup}:{session:EngineerSession;id:string;paused:boolean;onSetup:EngineeringControls['onSetup']}) {
  const car=session.cars.find(c=>c.id===id)!
  const [baseline,setBaseline]=useState<PracticeMeasurement|null>(null)
  const [after,setAfter]=useState<PracticeMeasurement|null>(null)
  // Keep only aggregates. Every setup epoch needs a newly observed full lap.
  const fingerprint=JSON.stringify(car.setup)
  const [epoch,setEpoch]=useState({fingerprint,seconds:session.seconds,weather:session.weather,grip:session.grip})
  if(epoch.fingerprint!==fingerprint||epoch.weather!==session.weather||Math.abs(epoch.grip-session.grip)>0.02){setEpoch({fingerprint,seconds:session.seconds,weather:session.weather,grip:session.grip});setAfter(null)}
  const candidate=practiceMeasurement(car,session,epoch.seconds)
  const changed=!!baseline&&JSON.stringify(baseline.setup)!==fingerprint
  const canAfter=!!candidate&&!!baseline&&changed&&candidate.start>=baseline.end&&candidate.lap!==baseline.lap
  return <section className="engineer-card engineer-practice"><small>FP / SETUP EXPERIMENT</small><h3>変更前後の走りを比べる</h3><p>この画面を開いてから、同じ設定で全周記録できたラップを測定します。設定変更は一時停止中に行えます。</p>
    <div className="engineer-setup">{(car.setupKeys??Object.keys(setupFields) as (keyof CarSetup)[]).map(key=><label key={key}>{setupFields[key].label}<strong>{car.setup?.[key]??'—'}</strong><input aria-label={setupFields[key].label} type="range" {...setupFields[key]} value={car.setup?.[key]??setupFields[key].min} disabled={!paused||car.setupLocked||!onSetup} onChange={e=>onSetup?.(id,key,Number(e.target.value))}/></label>)}</div>
    <div className="engineer-actions"><button disabled={!candidate} onClick={()=>{setBaseline(candidate);setAfter(null)}}>変更前を測定</button><button disabled={!canAfter} onClick={()=>setAfter(candidate)}>変更後を測定</button><button disabled={!baseline&&!after} onClick={()=>{setBaseline(null);setAfter(null)}}>比較をリセット</button></div>
    <p role="status">{car.setupLocked?'このセッションでは設定が固定されています。':!paused?'設定を変えるときは一時停止してください。':!candidate?'設定・天候・路面条件が安定した全周記録を待っています。':!baseline?`LAP ${candidate.lap+1} を変更前として測定できます。`:!changed?'設定を変更し、次の全周記録を取ってください。':!canAfter?'変更後の全周記録を待っています。':'変更後を測定できます。'}</p>
    {baseline&&<><div className="engineer-table-scroll"><table><caption>実走の集計値</caption><thead><tr><th>測定項目</th><th>変更前 L{baseline.lap+1}</th><th>変更後 {after?`L${after.lap+1}`:'—'}</th></tr></thead><tbody>{[
      ['最高速度',value(baseline.topSpeed,' km/h'),value(after?.topSpeed,' km/h')],['高速旋回の平均速度',value(baseline.highSpeed,' km/h'),value(after?.highSpeed,' km/h')],['駆動スリップの平均',value(baseline.slip,' %'),value(after?.slip,' %')],['全開区間',value(baseline.summary.fullPercent,' %'),value(after?.summary.fullPercent,' %')],['制動区間',value(baseline.summary.brakePercent,' %'),value(after?.summary.brakePercent,' %')],['平均燃料',value(baseline.fuel,' kg'),value(after?.fuel,' kg')],['平均タイヤ残寿命',value(baseline.tyreLife,' %'),value(after?.tyreLife,' %')],
    ].map(([label,b,a])=><tr key={label}><th>{label}</th><td>{b}</td><td>{a}</td></tr>)}</tbody></table></div>{after&&<p className="engineer-caution">{practiceConfounds(baseline,after).join(' / ')}</p>}</>}
  </section>
}

export function RaceEngineerWorkspace({session,selectedId,paused,onFocus,onWatch,onCompare,onPlan,onSetup}:{selectedId:string;paused:boolean;onFocus:(id:string)=>void;onWatch:(id:string)=>void;onCompare:(id:string,opponent?:string)=>void}&EngineeringControls) {
  const car=session.cars.find(c=>c.id===selectedId)??session.cars[0]
  const moments=useMemo(()=>watchMoments(session),[session])
  if(!car)return <p>走行車両がありません。</p>
  const signature=drivingSignature(car.driver),scenarios=strategyScenarios(session,car),best=Math.min(...scenarios.filter(s=>s.allowed).map(s=>s.cost))
  return <div className="race-engineer" aria-label="Race engineer">
    <header className="engineer-heading"><div><small>RACE ENGINEER / SIM</small><h2>レースの流れを読んで、次の一手を。</h2><p>走りの個性、FPの比較、見どころ、ピット判断をひとつに。</p></div><label>注目する車両<select value={car.id} onChange={e=>onFocus(e.target.value)}>{session.cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></header>
    <section className="engineer-card"><small>WATCH MOMENTS</small><h3>いま見たい場面</h3><div className="engineer-moments">{moments.length?moments.map(m=><article key={m.id}><strong>{m.title}</strong><p>{m.detail}</p><div className="engineer-actions"><button onClick={()=>onWatch(m.driverId)}>マップで追う</button><button onClick={()=>onCompare(m.driverId,m.opponentId)}>{m.opponentId?'2台の走りを比較':'テレメトリーを見る'}</button></div></article>):<p>接近する勝負や自己ベストが見つかると、ここに表示します。</p>}</div></section>
    <section className="engineer-card"><small>DRIVER SIGNATURE / SIM</small><h3>{car.name} · {signature.label}</h3><p>{signature.description}　能力 {Math.round(driverOverallAbilityPoints(car.driver))} / 120</p><div className="engineer-signature">{[['進入の積極性',signature.entry],['旋回を重視',signature.rotation],['脱出を重視',signature.exit],['タイヤをいたわる',signature.preservation],['操作精度',signature.correction/1.2]].map(([label,n])=><label key={String(label)}>{label}<meter min="0" max="1" value={Number(n)}/></label>)}</div><p>好みはブレーキの開始・抜き方とアクセルの立ち上げに反映。能力とは別の特性です。{signature.basis==='simulated'?'未設定の好みには、同じ人物ならカテゴリーを移っても変わらないSIM特性を使用します。実測のドライビングスタイルではありません。':'設定されたドライバーの好みを使用しています。'}</p></section>
    {session.practice&&<PracticeExperiment key={`${session.key}:${car.id}`} session={session} id={car.id} paused={paused} onSetup={onSetup}/>}
    {session.race&&<section className="engineer-card"><small>STRATEGY / SIM FORECAST</small><h3>今止まるか、もう少し走るか</h3><p>同じクラスの直近3周の中央ペースを延長した概算です。燃料の安全余裕、タイヤ損失、復帰位置付近の交通を比較します。未計測時は仮定値を使います。</p><div className="engineer-table-scroll"><table><thead><tr><th>候補</th><th>停止損失</th><th>復帰クラス順位</th><th>交通</th><th>予測差 / 誤差目安</th><th>判断</th></tr></thead><tbody>{scenarios.map(s=><tr key={s.delay}><th>{s.delay===0?'この周でBOX':`${s.delay}周延長`}</th><td>{s.loss.toFixed(1)}秒</td><td>P{s.low}{s.high!==s.low?`–${s.high}`:''}</td><td>{s.traffic??'近傍なし'}</td><td>{s.allowed?`+${(s.cost-best).toFixed(1)}秒`:'—'} / ±{s.uncertainty.toFixed(1)}秒</td><td><p>{s.reason}</p><button disabled={!s.allowed} onClick={()=>onPlan(car.id,makeEngineeringPlan(session,car,s))}>{s.delay===0?'この周でBOX':`${s.delay}周延長してBOX`}</button></td></tr>)}</tbody></table></div>
      <p className="engineer-caution">停止損失にはカテゴリーごとのピット通過と作業のSIM推定を使用。延長中の天候・旗・他車の停止は固定の仮定です。安全・規則上の停止が指示を上書きする場合があります。SFはコントロールタイヤ交換のみ、他4カテゴリーは必要な給油とタイヤ交換です。</p>
      {car.plan&&<div className="engineer-plan" role="status"><strong>{({scheduled:'BOX指示を予約中','in-pit':'ピット作業中',complete:'停止完了',cancelled:'指示取消'} as const)[car.plan.status]}</strong><p>{car.plan.reason} · 予測 P{car.plan.positionLow}–{car.plan.positionHigh}{car.plan.actualPosition?` → 実際の復帰 P${car.plan.actualPosition}`:` · 進捗${car.plan.dueDistance.toFixed(2)}周以降の最初の停止機会`}</p>{car.plan.status==='scheduled'&&<button onClick={()=>onPlan(car.id,null)}>予約を取り消す</button>}</div>}
    </section>}
    {!!session.decisionNotes?.length&&<section className="engineer-card"><small>AI DECISION EVIDENCE</small><h3>直近の判断理由</h3><ul>{session.decisionNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></section>}
  </div>
}
