import {createServer} from 'vite'
import {writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
  const {tracks}=await server.ssrLoadModule('/src/data/tracks.ts')
  const {supportSeriesTracks}=await server.ssrLoadModule('/src/data/supportSeriesTracks.ts')
  const {motorsportCourses,createMotorsportConfig}=await server.ssrLoadModule('/src/motorsport/packages.ts')
  const {dashboardCourse}=await server.ssrLoadModule('/src/motorsport/dashboardAdapter.ts')
  const {trackCornerTelemetry}=await server.ssrLoadModule('/src/data/cornerReferences.ts')
  const {courseElevationProfiles,elevationProfileFor,elevationAt}=await server.ssrLoadModule('/src/data/courseElevation.ts')
  const {cornerElevations}=await server.ssrLoadModule('/src/data/cornerElevations.ts')
  const {seriesPackages}=await server.ssrLoadModule('/src/series/seriesRegistry.ts')
  const all=new Map([...tracks.map(t=>[t.id,{track:t,categories:['F1']}]),...supportSeriesTracks.map(t=>[t.id,{track:t,categories:['SF']}])])
  for(const track of seriesPackages.find(p=>p.id==='super-formula').tracks){
    const record=all.get(track.id)
    if(record&&!record.categories.includes('SF'))record.categories.push('SF')
  }
  for(const category of ['kyojo','super-gt','wec','indycar'])for(const course of motorsportCourses(category)){
    if(all.has(course.id))all.get(course.id).categories.push(category)
    else all.set(course.id,{track:dashboardCourse({...createMotorsportConfig(category),course}),categories:[category]})
  }
  const corners=[['categories','course_id','course','corner','progress','elevation_m','grade_percent','provided_elevation_m','basis','source','note']]
  const stations=[['categories','course_id','station','distance_m','elevation_m','grade_percent','basis','source']]
  const lines=['# 全カテゴリーのコース標高一覧','','対象は現在選択できるF1・SF・KYOJO・SUPER GT・WEC・INDYCARの58レイアウトです。同じ場所でもレイアウトや走行方向が異なるものは分けています。','',
    '各コース192地点の標高を使います。コーナーの数値は登録済みコーナー位置を路面距離へ投影し、このプロファイルから読み出した値です。ご提供のF1値は別列にそのまま残しました。コーナー間とDEM格子間の値は補間です。','',
    '- 鈴鹿は公式道路縦断図を基準にし、立体交差の上下を分離しています。',
    '- マドリードの絶対標高は公式T2=671m・T7=697m。8%・10m上昇と5%下降から追加点を推定し、残りは補間しています。全22コーナーの測量値ではありません。',
    '- バクーはご提供のT1〜T19を使います。T20=2mは原値列に保持し、路面形状には使いません。出典・標高基準は未検証です。',
    '- 公開DEM/LiDARは道路測量ではありません。建物、植生、橋、トンネル、バンク、後年の工事により実際の路面と異なる場合があります。',
    '- 地図の2D/1×/3×/5×は表示倍率です。コース長・車速・周回時間・物理計算の標高は変えません。','',
    '| カテゴリー | コース | 最低 m | 最高 m | 高低差 m | コーナー数 | データの基準 |','|---|---|---:|---:|---:|---:|---|']
  for(const [id,{track,categories}] of all){
    const profile=elevationProfileFor(id,track.centerline.map(([x,,z])=>[x,-z]),track.lengthKm*1000)
    if(!profile)throw new Error(`Unregistered elevation: ${id}`)
    const values=[...profile.elevationsM,...(profile.anchors?.map(a=>a[1])??[])]
    const min=Math.min(...values),max=Math.max(...values),turns=trackCornerTelemetry(track)
    const label=profile.basis.includes('official')?'公式固定点＋補間':profile.basis.includes('unverified')?'提供値＋補間・未検証':profile.basis.includes('national')?'国別標高モデル':'公開DEM・概算'
    lines.push(`| ${categories.join(' / ')} | ${track.name} (${id}) | ${min.toFixed(1)} | ${max.toFixed(1)} | ${(max-min).toFixed(1)} | ${turns.length} | ${label} |`)
    for(const corner of turns){
      const {elevationM,grade}=elevationAt(profile,corner.progress),number=Number(corner.label.slice(1))
      corners.push([categories.join('/'),id,track.name,corner.label,corner.progress.toFixed(7),elevationM.toFixed(3),(grade*100).toFixed(3),cornerElevations[id]?.[number-1]??'',profile.basis,profile.sourceUrl,id==='baku-approx'&&number===20?'提供T20=2mは不整合の疑いがあるため形状から除外':'' ])
    }
    for(let i=0;i<192;i++){
      const {elevationM,grade}=elevationAt(profile,i/192)
      stations.push([categories.join('/'),id,i,(i/192*profile.lengthM).toFixed(3),elevationM.toFixed(3),(grade*100).toFixed(3),profile.basis,profile.sourceUrl])
    }
  }
  if(all.size!==Object.keys(courseElevationProfiles).length)throw new Error('Unreported profile')
  lines.push('','コーナー位置のない任意のカスタムコースには、同名の公式コースの標高を自動で貼り付けません。位置とコース長が登録形状に一致する場合だけ使います。','',`コーナーCSV: ${corners.length-1}行。192地点CSV: ${stations.length-1}行。`,'')
  const output=resolve(process.env.ELEVATION_OUTPUT??'..');mkdirSync(output,{recursive:true})
  const csv=rows=>'\ufeff'+rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n'
  writeFileSync(resolve(output,'all-course-elevations.md'),lines.join('\n'))
  writeFileSync(resolve(output,'all-course-corner-elevations.csv'),csv(corners))
  writeFileSync(resolve(output,'all-course-elevation-stations.csv'),csv(stations))
  console.log(JSON.stringify({layouts:all.size,corners:corners.length-1,stations:stations.length-1,output}))
} finally {await server.close()}
