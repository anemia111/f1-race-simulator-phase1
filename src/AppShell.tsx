import { lazy, Suspense, useState } from 'react'
import App from './App'
import type { SeriesId } from './series/types'
import type { ChampionshipId } from './restored20261010/motorsport/types'

const MotorsportApp = lazy(() => import('./restored20261010/motorsport/MotorsportApp')
  .then(module => ({ default: module.MotorsportApp })))

export default function AppShell() {
  const [championship, setChampionship] = useState<ChampionshipId | null>(null)
  const [returnSeries, setReturnSeries] = useState<SeriesId | undefined>()
  const [free, setFree] = useState(false)
  return championship === null
    ? <App onOpenMotorsport={(id, free = false) => { setFree(free); setChampionship(id) }}
        requestedSeriesId={returnSeries} requestedFreeMode={free} />
    : <div className="restored-motorsport"><Suspense fallback={<p role="status">カテゴリーを読み込んでいます…</p>}>
        <MotorsportApp initialChampionship={championship} initialFreeOpen={free}
          onBack={(id, free = false) => { setReturnSeries(id); setFree(free); setChampionship(null) }} />
      </Suspense></div>
}
