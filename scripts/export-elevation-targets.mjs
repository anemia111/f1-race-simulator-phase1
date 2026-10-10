import {createServer} from 'vite'
import {writeFileSync} from 'node:fs'
const s=await createServer({server:{middlewareMode:true},appType:'custom'})
try{
 const {tracks}=await s.ssrLoadModule('/src/data/tracks.ts'); const {supportSeriesTracks}=await s.ssrLoadModule('/src/data/supportSeriesTracks.ts');
 const {measuredRoadProfiles}=await s.ssrLoadModule('/src/data/measuredRoadProfiles.ts');
 const {sourcedPhysicalRoadInputsAt}=await s.ssrLoadModule('/src/simulation/physicalRoadProfiles.ts');
 const {motorsportCourses}=await s.ssrLoadModule('/src/motorsport/packages.ts');
 const {trackCornerTelemetry}=await s.ssrLoadModule('/src/data/cornerReferences.ts');
 const {cornerElevations}=await s.ssrLoadModule('/src/data/cornerElevations.ts');
 const targets=[...tracks,...supportSeriesTracks].map(t=>({id:t.id,lengthM:t.lengthKm*1000,points:t.centerline.map(p=>[p[0],-p[2]]),existing:Array.from({length:192},(_,i)=>measuredRoadProfiles[t.id]?sourcedPhysicalRoadInputsAt(t,i/192)?.elevationMeters?.value??null:null)}));
 for(const c of ['kyojo','super-gt','wec','indycar'])for(const t of motorsportCourses(c)) if(!targets.some(x=>x.id===t.id))targets.push({id:t.id,lengthM:t.lengthM,points:t.points});
 for(const t of tracks){const target=targets.find(x=>x.id===t.id);target.corners=trackCornerTelemetry(t).map(c=>({number:Number(c.label.slice(1)),progress:c.progress,elevationM:cornerElevations[t.id]?.[Number(c.label.slice(1))-1]??null}));}
 writeFileSync('scripts/elevation-targets.json',JSON.stringify(targets)); console.log(targets.map(t=>t.id).join(','))
}finally{await s.close()}
