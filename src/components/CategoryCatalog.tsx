import { useMemo, useState } from 'react'
import { CategoryMachineInfo } from './CategoryMachineInfo'
import { categoryCatalogs } from '../data/categoryCatalog'

export function CategoryCatalog() {
  const catalogs = useMemo(categoryCatalogs, [])
  const [selectedId, setSelectedId] = useState('f2')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'entries' | 'machines'>('entries')
  const catalog = catalogs.find(catalog => catalog.id === selectedId)!
  const query = search.trim().toLocaleLowerCase()
  const entries = catalog.entries.filter(entry =>
    [entry.number, entry.team, entry.car, ...entry.drivers].join(' ').toLocaleLowerCase().includes(query))
  return <section className="category-catalog" aria-label="Category data catalog">
    <div className="category-catalog-toolbar">
      <label>カテゴリー <select aria-label="Data category" value={selectedId} onChange={event => { setSelectedId(event.target.value); setSearch('') }}>
        {catalogs.map(catalog => <option key={catalog.id} value={catalog.id}>{catalog.label}</option>)}
      </select></label>
      <input aria-label="Search category drivers and teams" disabled={tab === 'machines'} placeholder="ドライバー・チーム・番号を検索" value={search} onChange={event => setSearch(event.target.value)} />
      <strong>{tab === 'entries' ? `${entries.length} / ${catalog.entries.length} entries` : 'マシン仕様'} · {catalog.season}</strong>
    </div>
    <p className="category-catalog-note">{catalog.note} {catalog.checkedAt && `資料確認日: ${catalog.checkedAt}。`}
      {catalog.sourceUrl && <> <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">公式資料</a></>}
      {' '}データ閲覧用です。選択しても観戦中のレースは切り替わりません。</p>
    <div className="category-catalog-tabs"><button type="button" aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>ドライバー・エントリー</button>
      <button type="button" aria-pressed={tab === 'machines'} onClick={() => setTab('machines')}>マシン情報</button></div>
    {tab === 'machines' ? <CategoryMachineInfo categoryId={selectedId} /> : <div className="race-data-scroll" tabIndex={0}>
      <table className="race-data-table" aria-label={`${catalog.label} category entries`}>
        <thead><tr><th scope="col">NO.</th><th scope="col">DRIVER / CREW</th><th scope="col">TEAM</th><th scope="col">CAR / CLASS</th><th scope="col">SOURCE</th></tr></thead>
        <tbody>{entries.map((entry, index) => <tr key={`${selectedId}:${entry.number}:${index}`}>
          <td>{entry.number || '--'}</td><td>{entry.drivers.join(' / ') || '--'}</td><td>{entry.team || '--'}</td>
          <td>{[entry.car, entry.className].filter(Boolean).join(' / ') || '--'}</td>
          <td>{entry.url ? <a href={entry.url} target="_blank" rel="noreferrer">公式</a> : '登録データ'}</td>
        </tr>)}</tbody>
      </table>
      {entries.length === 0 && <p className="race-data-empty">一致するデータがありません。</p>}
    </div>}
  </section>
}
