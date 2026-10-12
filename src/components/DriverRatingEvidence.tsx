import type {Driver} from '../types'
import {driverRatingReview} from '../data/reviewedDriverRatings'
import {driverAbilityCeiling,driverOverallAbilityPoints} from '../simulation/driverAbility'

/** Scores are editorial; result sources must never make them look official. */
export function DriverRatingEvidence({driver}:{driver:Driver}) {
  const row=driverRatingReview.drivers.find(r=>r.id===driver.id)
  const current=driverOverallAbilityPoints(driver)
  const status=row?.status==='user-custom'?'ユーザー指定':row?.status==='user-calibration'?'ユーザー指定の校正':row?.status==='retained-unverified'?'既存評価を共通尺度に整合（個別の再検証なし）':'成績を参考にしたSIM推定'
  const links=row?.sources.filter(s=>s.startsWith('https://')).slice(0,2)??[]
  return <p className="driver-rating-evidence"><strong>全カテゴリー共通 · {current} / {driverAbilityCeiling(driver.id)}</strong>{row?` · 初期評価 ${row.overall} · ${status} · ${driverRatingReview.reviewedOn}`:' · 既存のSIM評価'}<br/>同じ人物は移籍しても同じ能力。マシン性能・将来性とは別の現在の評価です。点数は公式評価ではありません。{links.map((url,index)=><span key={url}> <a href={url} target="_blank" rel="noreferrer">{index===0?'参考成績':'補足資料'}</a></span>)}</p>
}
