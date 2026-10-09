import { lazy, Suspense, useState } from 'react'
import App from './App'
import type { SeriesId } from './series/types'
import type { ChampionshipId } from './motorsport/types'
const MotorsportApp = lazy(() => import('./motorsport/MotorsportApp').then(module => ({ default: module.MotorsportApp })))
export default function AppShell() {
  const [championship, setChampionship] = useState<ChampionshipId | null>(null)
  const [returnSeries, setReturnSeries] = useState<SeriesId | undefined>(undefined)
  const [free, setFree] = useState(false)
  const openMotorsport = (id: ChampionshipId, free = false) => { setFree(free); setChampionship(id) }
  return championship === null ? <App onOpenMotorsport={openMotorsport} requestedSeriesId={returnSeries} requestedFreeMode={free}/>
    : <Suspense fallback={<p role="status">カテゴリーを読み込んでいます…</p>}><MotorsportApp initialChampionship={championship} initialFreeOpen={free} onBack={(id,free = false) => {setReturnSeries(id);setFree(free);setChampionship(null)}} /></Suspense>
}
