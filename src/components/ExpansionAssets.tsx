import { courseAssetsFor, courseGeometryAttribution, coursePreviewPoints, machineAssetsFor,
  machineSpecificationSources, quantityInSI, type TechnicalQuantity } from '../series/expansionAssets'

function displayQuantity(quantity: TechnicalQuantity) {
  if (quantity.value === null) return '非公表 / 未確認'
  const si = quantityInSI(quantity)
  const label: Record<string, string> = {
    'base-minimum': '基本最低値', 'lower-bound': '以上', 'upper-bound': '以下',
    'approximate': '概数', 'manufacturer-vehicle-weight': 'メーカー車両重量',
    'approximate-excluding-driver-fuel': '概数・ドライバー/燃料を除く', rounded: '丸め値',
    'regulatory-minimum-excluding-driver-fuel': '規則最低値・ドライバー/燃料等を除く',
    'manufacturer-reference-subject-to-bop': 'メーカー基準値・BoP依存',
  }
  return `${si.value?.toLocaleString('ja-JP', { maximumFractionDigits: 3 })}${si.upper === undefined ? '' : `–${si.upper.toLocaleString('ja-JP', { maximumFractionDigits: 3 })}`} ${si.unit} ${label[si.relation] ?? ''}`
}

export function ExpansionAssets({ categoryId }: { categoryId: string }) {
  const machines = machineAssetsFor(categoryId)
  const courses = courseAssetsFor(categoryId)
  return <div className="expansion-assets">
    <h4>マシン諸元</h4>
    <p>出力の下限・範囲と基本重量を区別して表示します。BoP、搭載燃料、成功重量を含む実走行時の性能は未校正です。</p>
    {machines.map((machine) => <article className="expansion-machine" key={machine.name}>
      <h5>{machine.name}</h5>
      {'specificationUnavailable' in machine ? <p>車種収録済み · 個別の物理諸元は検証中</p> : <>
        <dl><dt>重量</dt><dd>{displayQuantity(machine.mass)}</dd>
          <dt>公表出力</dt><dd>{displayQuantity(machine.power)}</dd>
          <dt>全長 × 全幅 × 全高</dt><dd>{displayQuantity(machine.length)} × {displayQuantity(machine.width)} × {displayQuantity(machine.height)}</dd>
          <dt>ホイールベース</dt><dd>{displayQuantity(machine.wheelbase)}</dd>
          <dt>エンジン</dt><dd>{machine.engine} · {machine.architecture}</dd>
          <dt>変速段数</dt><dd>{displayQuantity(machine.gears)}</dd></dl>
        <p>{machine.notes}</p>
        <a href={machineSpecificationSources.get(machine.sourceId)?.url} target="_blank" rel="noreferrer">公式諸元資料</a>
        {machine.massSourceId && <> · <a href={machineSpecificationSources.get(machine.massSourceId)?.url} target="_blank" rel="noreferrer">重量の規則資料</a></>}
      </>}
    </article>)}
    {categoryId === 'indycar' && <p>Honda／Chevroletは別仕様として管理します。INDYの最低重量にはドライバー等価重量185 lbと燃料等を別途加算します。</p>}
    <h4>コース形状</h4>
    <div className="expansion-course-grid">{courses.map((course) => <figure key={course.id}>
      {course.centerline.length > 0 ? <svg viewBox="0 0 200 200" role="img" aria-label={`${course.name} コース形状`}>
        <polygon points={coursePreviewPoints(course)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      </svg> : <div className="expansion-course-unavailable">形状検証中</div>}
      <figcaption><strong>{course.name}</strong><small>{course.geometryStatus === 'existing-pack' ? '既存形状' : course.geometryStatus === 'osm-centerline' ? 'OSM中心線 · 運用検証前' : '形状未収録'}</small>
        {course.publishedLengthMeters !== null && <span>公表周長 {(course.publishedLengthMeters / 1000).toFixed(3)} km</span>}
        {course.measuredLengthMeters !== null && <span>地図上実測 {(course.measuredLengthMeters / 1000).toFixed(3)} km</span>}
        <small>{course.notes}</small>
        {course.sourceUrl && <a href={course.sourceUrl} target="_blank" rel="noreferrer">周長・形状の資料</a>}
      </figcaption>
    </figure>)}</div>
    <small>{courseGeometryAttribution} · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">ライセンス</a></small>
  </div>
}
