import type {Driver,DriverTunableStat} from '../types'
import {DRIVER_ABILITY_GROUPS,DRIVER_ABILITY_STATS,driverAbilityCeiling,driverAbilityPoints} from '../simulation/driverAbility'
import './driverSkillEditor.css'
import {driverMachineDifficulty,MACHINE_DIFFICULTIES} from '../simulation/driverMachineDifficulty'

const skillInfo:Record<DriverTunableStat,[string,string]>={
  rawPace:['基本スピード','マシンとタイヤの性能を引き出す基礎能力'],
  qualifyingPace:['一発の速さ','予選アタックで限界へ近づける能力'],
  racePace:['レースペース','連続周回で速さを維持する能力'],
  brakingSkill:['ブレーキング','制動開始とブレーキ圧の精度'],
  lowSpeedCornerSkill:['低速コーナー','低速での旋回と速度維持'],
  mediumSpeedCornerSkill:['中速コーナー','中速での旋回と速度維持'],
  highSpeedCornerSkill:['高速コーナー','高速域のグリップを使い切る能力'],
  tractionControl:['トラクション操作','立ち上がりで空転を抑えるドライバーの操作能力'],
  throttleControl:['アクセル操作','横荷重に合わせた踏み増しと空転時の戻し'],
  tireManagement:['タイヤ管理','摩耗と温度負荷を抑える能力'],
  tireWarmupSkill:['タイヤの温め方','アウトラップや再スタートで作動域へ近づける能力'],
  wetSkill:['ウェット走行','雨の路面でグリップを使う能力'],
  intermediateSkill:['変化する路面','インターミディエイト条件での走行能力'],
  overtakingSkill:['オーバーテイク','追い抜き機会への判断と実行'],
  defendingSkill:['ディフェンス','後続への対応とポジション維持'],
  racecraft:['駆け引き','攻防の優先順位とスリップストリームから出る判断'],
  consistency:['安定性','周回ごとの操作ばらつきを抑える能力'],
  mistakeResistance:['ミス抑制','操作エラーや判断ミスを抑える能力'],
  pressureHandling:['プレッシャー耐性','接近戦でも操作と判断を維持する能力'],
  trafficManagement:['交通・スリップ活用','混走への対応と前車後方の位置取り'],
  dirtyAirManagement:['ダーティーエア対応','前車の乱流を受ける区間への対応'],
  fuelManagement:['燃料管理','走行ペースと燃料消費の管理'],
  ersManagement:['エネルギー管理','搭載カテゴリーでの回収・放出判断'],
  restartSkill:['再スタート','中立化解除時の反応と走行'],
  startSkill:['スタート','発進と序盤の反応'],
  confidence:['限界への自信','性能を使う積極性とリスク判断'],
  precision:['操作精度','ライン、アクセル、ブレーキの誤差を抑える能力'],
  adaptability:['適応力','路面や状況変化への反応'],
  raceAwareness:['周囲の把握','他車、交通、攻防の状況を読む能力'],
  carBalanceAdaptation:['マシン適応','車両バランスとセッティングへの適応'],
}

export function DriverSkillEditor({driver,onChange,category}:{driver:Driver;category?:string;onChange?:(stat:DriverTunableStat,value:number)=>void}) {
  const difficulty=category?driverMachineDifficulty(driver,category):null
  return <details className="driver-skill-details"><summary>詳細能力 · {DRIVER_ABILITY_STATS.length}項目{onChange?'を個別調整':'の内訳'}</summary>
    <p>初期値は既存の評価から展開したSIM評価です。各項目は別々に保持され、総合値はその集計です。</p>
    {difficulty?.machine&&<p><b>{difficulty.machine.label} · 難易度 Lv.{difficulty.machine.level}</b> / 操作能力目安 {difficulty.machine.required} / このドライバー {difficulty.capability.toFixed(1)}<br/>{difficulty.shortfall>0?`必要な操作能力が不足。限界活用率 ${Math.round(difficulty.gripUtilisation*100)}%、アクセル踏み増し ${Math.round(difficulty.pedalRateScale*100)}%。`:'このマシンの必要操作能力を満たしています。'}</p>}
    <details><summary>カテゴリー別のマシン難易度</summary><p>{Object.values(MACHINE_DIFFICULTIES).map(machine=>`${machine.label}: Lv.${machine.level} / 目安${machine.required}`).join(' · ')}</p><p>SIM用の難易度です。操作能力が不足すると旋回・制動の限界活用とアクセル操作が慎重になります。車両の最高出力は共通です。</p></details>
    {DRIVER_ABILITY_GROUPS.map(group=><fieldset key={group.key}><legend>{group.label}</legend>{group.stats.map(stat=>{const [label,description]=skillInfo[stat];const value=driverAbilityPoints(driver.skills[stat]);return <label key={stat} title={description}><span>{label}<small>{description}</small></span>{onChange?<input aria-label={label} type="range" min={0} max={driverAbilityCeiling(driver.id)} step={1} value={value} onChange={event=>onChange(stat,Number(event.target.value)/100)}/>:<meter aria-label={label} min={0} max={driverAbilityCeiling(driver.id)} value={value}/>}<output>{value}</output></label>})}</fieldset>)}
  </details>
}
