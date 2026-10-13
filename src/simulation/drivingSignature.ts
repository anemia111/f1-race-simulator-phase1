import type { Driver } from '../types'
import {hashChance} from './random'
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
export type DrivingSignature={entry:number;rotation:number;exit:number;preservation:number;correction:number;label:string;description:string;basis:'authored'|'simulated'}
const cache=new WeakMap<Driver,DrivingSignature>()
/** Explicit styles win. Neutral imported profiles receive stable SIM preferences
 * keyed by person, shared across categories and independent of overall ability. */
export function drivingSignature(driver:Driver):DrivingSignature {
  const cached=cache.get(driver);if(cached)return cached
  const style=driver.style,s=driver.skills
  const neutral=style.brakingAggression===0.5&&style.cornerShapePreference===0&&style.rearStabilityNeed===0
  // User-authored strongest-driver preset, shared by identity across series.
  // Explicit style or ability edits continue to take precedence.
  if(neutral && driver.id==='yuki_nakayama' && Object.values(s).every(value=>value===1.2)) {
    const signature:DrivingSignature={entry:1,rotation:1,exit:1,preservation:1,correction:1.2,
      label:'最強・全能力120',basis:'authored',description:'全カテゴリー共通の裕樹120設定。進入・旋回・脱出・タイヤ管理・操作精度をすべて最大に設定しています。'}
    cache.set(driver,signature);return signature
  }
  const preference=(axis:string)=>0.2+hashChance(`driving-preference-v1:${driver.id}:${axis}`)*0.6
  const entry=neutral?preference('entry'):clamp(style.brakingAggression,0,1)
  const rotation=neutral?preference('rotation'):clamp((style.cornerShapePreference+1)/2,0,1)
  const exit=neutral?preference('exit'):clamp((1-rotation)*0.6+(style.rearStabilityNeed+1)*0.2,0,1)
  const preservation=clamp(s.tireManagement/1.2,0,1)
  const correction=clamp((s.throttleControl+s.tractionControl+s.precision)/3,0,1.2)
  const label=entry>0.65?'進入で攻める':rotation>0.65?'最低速を保つ':exit>0.65?'立ち上がり重視':preservation>0.8?'タイヤをいたわる':'バランス型'
  const signature:DrivingSignature={entry,rotation,exit,preservation,correction,label,basis:neutral?'simulated':'authored',description:`制動 ${Math.round(entry*100)} / 回頭 ${Math.round(rotation*100)} / 脱出 ${Math.round(exit*100)}。好みと操作精度は別に計算します。`}
  cache.set(driver,signature);return signature
}
export function signaturePedalControl(signature:DrivingSignature,lateralUse:number,tyreLife=1) {
  const loaded=clamp(lateralUse,0,1)
  return {brakeReleaseScale:clamp(1+(signature.rotation-0.5)*0.45,0.75,1.25),
    throttleRiseScale:clamp(1+(signature.exit-0.5)*0.35-signature.preservation*Math.max(0,0.6-tyreLife)*0.4,0.65,1.2),
    brakeTimingSeconds:(0.5-signature.entry)*0.07,
    // Ordinary <=100 control retains its existing preference reserve. Precision
    // above100 progressively removes it;120 relies on actual slip/grip feedback.
    throttleCeiling:100*(1-loaded*Math.max(0,signature.exit-0.5)*0.10*clamp((1.2-signature.correction)/0.2,0,1))}
}
