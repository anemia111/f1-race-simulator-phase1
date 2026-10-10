import { catalogCalendarFor, catalogDriverCategories, catalogDriverId, expansionCatalog,
  expansionSourceById, catalogPoolDriverById } from '../series/expansionCatalog'
import { ExpansionAssets } from './ExpansionAssets'

export function ExpansionCatalog() {
  return <section className="expansion-catalog" aria-label="2026追加カテゴリー収録データ">
    <h3>2026 CATEGORY CATALOG</h3>
    <p>公式エントリーと開催コース · 確認日 {expansionCatalog.verifiedOn}。
      シリーズ選択の「追加カテゴリー」からレースを実行できます。公開仕様とSIM推定値は実行画面で確認できます。</p>
    {expansionCatalog.categories.map((category) => {
      const events = catalogCalendarFor(category.id)
      const tracks = [...new Set(events.map((event) => event.trackName))]
      const scope = expansionSourceById.get(category.entries[0].sourceId)?.scope
      return <details key={category.id}>
        <summary>{category.label} · {category.entries.length} 件 · {tracks.length} コース</summary>
        <p className="expansion-scope">{scope}</p>
        <ExpansionAssets categoryId={category.id} />
        <p>{category.id.startsWith('wec-') ? 'この一覧は年間の基本登録です。レース画面では公開済み7大会の名簿とル・マン62台を大会別に読み込みます。' :
          category.id === 'indycar' ? '年間ドライバー一覧です。各大会の同時出走台数や車番の割当とは区別しています。' :
            '公式一覧のスナップショットです。大会ごとの変更は別途確認が必要です。'}</p>
        <table><caption>{category.label} 車番・車両・ドライバー</caption>
          <thead><tr><th scope="col">No.</th><th scope="col">車両 / チーム</th><th scope="col">ドライバー</th></tr></thead>
          <tbody>{category.entries.map((entry) => <tr key={`${entry.number}:${entry.drivers.join('|')}`}>
            <td>{entry.number}</td>
            <td><a href={expansionSourceById.get(entry.sourceId)?.url} target="_blank" rel="noreferrer">
              {entry.machine ?? '車種未検証'}</a><small>{entry.team ?? 'チーム未確認'}</small>
              <small>{entry.tyreSupplier ?? entry.engine ?? ''}</small></td>
            <td>{entry.drivers.map((name) => {
              const id = catalogDriverId(name)
              const driver = catalogPoolDriverById.get(id)
              const categories = [...(catalogDriverCategories.get(id) ?? [])]
              return <div key={name}>{name}<small>{driver ? `SIM能力 ${driver.overall} · 選手プール登録済み` : '能力表との対応未確認'}</small>{categories.length > 1 &&
                <small title={categories.join(' / ')}>共通選手：{categories.join(' / ')}</small>}</div>
            })}</td>
          </tr>)}</tbody>
        </table>
        <table><caption>開催コースと日程（コース形状の実装とは別）</caption>
          <thead><tr><th scope="col">Round</th><th scope="col">日程</th><th scope="col">コース</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.round}><td>{event.round}</td><td>{event.dateLabel}</td>
            <td><a href={expansionSourceById.get(event.sourceId)?.url} target="_blank" rel="noreferrer">{event.trackName}</a></td></tr>)}</tbody>
        </table>
      </details>
    })}
  </section>
}
