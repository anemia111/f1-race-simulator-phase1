import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const baseline=process.argv[2]
if(!baseline) throw new Error('Usage: node scripts/verify-suzuka-preservation.mjs <baseline checkout>')
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')
async function inspect(root) {
  const server=await createServer({root:resolve(root),logLevel:'error',server:{middlewareMode:true},appType:'custom'})
  try {
    const {tracks}=await server.ssrLoadModule('/src/data/tracks.ts')
    const {supportSeriesTracks}=await server.ssrLoadModule('/src/data/supportSeriesTracks.ts')
    const {measuredRoadProfiles}=await server.ssrLoadModule('/src/data/measuredRoadProfiles.ts')
    const geometry=await server.ssrLoadModule('/src/three/trackGeometry.ts')
    const metric=await server.ssrLoadModule('/src/three/tracks/suzukaSurface.ts')
    const seen=new Set()
    const maps=[...tracks,...supportSeriesTracks].filter(track=>!seen.has(track.id)&&seen.add(track.id)).map(track=>{
      const curve=geometry.createTrackCurve(track)
      const mesh=geometry.createTrackRibbonGeometry(curve,track.width)
      const meshHash=hash([Array.from(mesh.attributes.position.array),Array.from(mesh.index.array),Array.from(mesh.attributes.normal.array)])
      const definitionHash=hash(track)
      mesh.dispose()
      return {id:track.id,definitionHash,meshHash}
    })
    const poses=Array.from({length:2048},(_,i)=>{
      const p=i/2048,f=metric.roadPose(p)
      return [f.position.toArray(),f.tangent.toArray(),f.side.toArray(),f.up.toArray(),metric.pitOffset(p),metric.widthAt(p),metric.elevationAt(p)]
    })
    return {maps,profilesHash:hash(measuredRoadProfiles),suzukaPoseAndPitHash:hash(poses)}
  } finally {await server.close()}
}
const before=await inspect(baseline),after=await inspect('.')
const matches=JSON.stringify(before)===JSON.stringify(after)
await writeFile(resolve('../../outputs/suzuka-numeric-preservation.json'),JSON.stringify({matches,before,after,note:'Exact hashes of track definitions, Overview mesh buffers, all road profiles and 2048 unchanged Suzuka road/pit poses. Does not compare live weather/flags or camera settling.'},null,2))
if(!matches)throw new Error('Protected rendering coordinates or track data changed')
console.log(`All ${after.maps.length} track definitions and map meshes, road profiles and 2048 Suzuka/pit poses match the published baseline.`)
