import externalCategories from './categoryCatalog2026.json'
import { driverPool2026, seriesPackages } from '../series/seriesRegistry'

type CatalogEntry = {
  number: string; team: string; car: string; drivers: string[]; url: string; className?: string
}
type Catalog = {
  id: string; label: string; season: number; checkedAt: string; sourceUrl: string
  note: string; entries: CatalogEntry[]
}

export function categoryCatalogs(): Catalog[] {
  const executable = seriesPackages.map(series => ({
    id: series.id, label: series.label, season: 2026, checkedAt: '', sourceUrl: '',
    note: '現在の標準登録データ。能力値はシミュレーター設定値です。',
    entries: series.drivers.map(driver => ({ number: String(driver.carNumber),
      team: series.teams.find(team => team.id === driver.teamId)?.name ?? driver.teamId,
      car: '', drivers: [driver.name], url: '',
    })),
  }))
  const historical = ['f2', 'f3'].map(id => ({
    id, label: id.toUpperCase(), season: 2026, checkedAt: '2026-07-29', sourceUrl: '',
    note: '保存済み2026年データ。最新の実際の出走者一覧を保証するものではありません。能力値は編集・推定値です。',
    entries: driverPool2026.flatMap(driver => driver.provenance.filter(source => source.sourceSeriesId === id)
      .map(source => ({ number: source.sourceCarNumber === undefined ? '' : String(source.sourceCarNumber),
        team: source.sourceTeam?.name ?? '', car: '', drivers: [driver.name], url: '',
      }))),
  }))
  return [...executable, ...historical, ...externalCategories]
}

