import data from './courseElevations.json'
export type CourseElevationProfile = {
  lengthM: number; basis: string; sourceUrl: string
  planarPoints: number[][]; elevationsM: number[]; grades: number[]
}
export const courseElevationProfiles = data.profiles as Record<string, CourseElevationProfile>
const cache = new WeakMap<object, {id:string;lengthM:number;profile:CourseElevationProfile|null}>()
/** Geographic road estimates are bound to their reviewed layout, never merely
 * to an id supplied by an imported/custom Free Mode session. */
export function elevationProfileFor(id: string, points: readonly (readonly number[])[], lengthM: number) {
  const cached=cache.get(points)
  if (cached?.id===id && cached.lengthM===lengthM) return cached.profile
  const profile=courseElevationProfiles[id]
  let valid=!!profile && Math.abs(profile.lengthM-lengthM)<Math.max(2,lengthM*0.002)
  if (valid) {
    const sample=(source:readonly (readonly number[])[])=>{
      const lengths=source.map((p,i)=>Math.hypot(p[0]-source[(i+1)%source.length][0],p[1]-source[(i+1)%source.length][1]))
      const total=lengths.reduce((a,b)=>a+b,0);let edge=0,start=0
      const values=Array.from({length:64},(_,i)=>{const d=i/64*total;while(edge<lengths.length-1&&start+lengths[edge]<d)start+=lengths[edge++];const r=(d-start)/Math.max(1e-9,lengths[edge]),a=source[edge],b=source[(edge+1)%source.length];return [a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]})
      const cx=values.reduce((s,p)=>s+p[0],0)/64,cy=values.reduce((s,p)=>s+p[1],0)/64
      return values.map(p=>[(p[0]-cx)/total,(p[1]-cy)/total])
    }
    const a=sample(points),b=sample(profile.planarPoints)
    valid=a.every((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])<0.0025)
  }
  const resolved=valid?profile:null;cache.set(points,{id,lengthM,profile:resolved});return resolved
}
/** Periodic linear interpolation keeps start/finish continuous. Absolute
 * altitude is retained for physics; rendering subtracts one common datum. */
export function elevationAt(profile:CourseElevationProfile, progress:number) {
  const q=((progress%1)+1)%1*profile.elevationsM.length,i=Math.floor(q),j=(i+1)%profile.elevationsM.length,w=q-i
  return {elevationM:profile.elevationsM[i]+(profile.elevationsM[j]-profile.elevationsM[i])*w,
    grade:profile.grades[i]+(profile.grades[j]-profile.grades[i])*w}
}
