import recovered from '../data/recovered20261010/expansionMachineSpecs2026.json'
import archived from '../data/archivedMachineProfiles.json'
import { categoryPhysicsFor } from '../simulation/categoryPhysics'
import { seriesPackages } from '../series/seriesRegistry'

const fieldLabels: Record<string, string> = {
  mass: '重量', length: '全長', width: '全幅', height: '全高', wheelbase: 'ホイールベース',
  displacement: '排気量', power: '出力', gears: 'ギア数',
}

export function CategoryMachineInfo({ categoryId }: { categoryId: string }) {
  if (categoryId === 'f1-custom' || categoryId === 'super-formula') {
    const profile = categoryPhysicsFor(categoryId)
    const series = seriesPackages.find(series => series.id === categoryId)!
    const mass = profile.minimumMassRule.kind === 'fixed-minimum-mass'
      ? `${profile.minimumMassRule.massKg} kg`
      : `予選 ${profile.minimumMassRule.qualifyingBaseKg} kg / その他 ${profile.minimumMassRule.otherSessionBaseKg} kg + 大会指定タイヤ公称重量`
    return <div className="race-data-scroll machine-info" tabIndex={0}>
      <p>現在のシミュレーター設定。推定パラメータを含み、全項目が実測値という意味ではありません。</p>
      <dl><dt>内燃機関の基準出力</dt><dd>{profile.combustionPowerKw} kW</dd>
        <dt>ハイブリッド出力上限</dt><dd>{profile.hybridDeploymentPowerLimitKw} kW</dd>
        <dt>ギア数</dt><dd>{profile.gearCount}</dd><dt>最大回転数</dt><dd>{profile.maximumEngineRpm} rpm</dd>
        <dt>モデルのホイールベース</dt><dd>{profile.wheelbaseM} m</dd><dt>最低重量の扱い</dt><dd>{mass}</dd></dl>
      <table className="race-data-table" aria-label="Configured team machine ratings"><thead><tr><th>TEAM</th><th>設定項目</th><th>設定値</th></tr></thead>
        <tbody>{series.teams.flatMap(team => Object.entries(team.machine).map(([key, value]) =>
          <tr key={`${team.id}:${key}`}><td>{team.name}</td><td>{key}</td><td>{value}</td></tr>))}</tbody></table>
    </div>
  }
  if (categoryId === 'f2' || categoryId === 'f3') {
    const profile = archived[categoryId]
    return <div className="race-data-scroll machine-info" tabIndex={0}>
      <p>Git履歴から回収した旧シミュレーション入力値。現行の公式仕様として再検証した値ではありません。</p>
      <p>出典: {profile.sourceRevision} / {profile.sourceFile}</p>
      <table className="race-data-table" aria-label="Archived machine simulation inputs"><thead><tr><th>PARAMETER</th><th>VALUE</th></tr></thead>
        <tbody>{Object.entries(profile.values).map(([key, value]) => <tr key={key}><td>{key}</td><td>{value}</td></tr>)}</tbody></table>
    </div>
  }
  const ids = categoryId === 'wec' ? ['wec-hypercar', 'wec-lmp2', 'wec-lmgt3']
    : categoryId === 'gt500' ? ['super-gt-gt500'] : categoryId === 'gt300' ? ['super-gt-gt300'] : [categoryId]
  const machines = recovered.machines.filter(machine => ids.includes(machine.categoryId))
  return <div className="race-data-scroll machine-info" tabIndex={0}>
    <p>以前の作業フォルダから回収したマシン仕様。元データの確認日: {recovered.verifiedOn}。
      規則上限・メーカー参考値・概算・未確認を区別しています。大会別BoPの適用値ではありません。
      WECのLMP2はル・マン用です。</p>
    {machines.map(machine => <article className="machine-spec-card" key={`${machine.categoryId}:${machine.name}`}>
      <h3>{machine.name}</h3><p>{machine.categoryId} · {machine.engine}</p>
      <dl>{Object.entries(fieldLabels).map(([key, label]) => {
        const quantity = (machine as unknown as Record<string, unknown>)[key] as
          { value: number | null; text: string; unit: string; relation: string; upper?: number } | undefined
        if (!quantity) return null
        return <div key={key}><dt>{label}</dt><dd>{quantity.value === null ? '未確認' :
          `${quantity.value}${quantity.upper === undefined ? '' : `–${quantity.upper}`} ${quantity.unit}`}
          <small>{quantity.relation}</small></dd></div>
      })}</dl>
      <p>{machine.notes}</p>
      <div>{[machine.sourceId, 'massSourceId' in machine ? machine.massSourceId : null].filter((id, index, ids) => id && ids.indexOf(id) === index)
        .map(id => { const source = recovered.sources.find(source => source.id === id)
          return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer">{id}</a> : <span key={id}>{id}</span>
        })}</div>
    </article>)}
    {machines.length === 0 && <p>このカテゴリーの仕様データは未収録です。</p>}
  </div>
}
