import { motorsportChampionships, motorsportCourses } from '../motorsport/packages'
import { expansionCourseTiming } from '../data/expansionTiming'
import { tirePaceGapsByTrack } from '../data/tirePaceGaps'
import type { TrackDefinition } from '../types'
import type { FreeModeTrackSource } from './types'

const aliases: Record<string, string> = { fuji: 'fuji-sf', motegi: 'motegi-sf', sugo: 'sugo-sf', autopolis: 'autopolis-sf', suzuka: 'suzuka-approx', spa: 'spa-approx', cota: 'cota-approx', interlagos: 'interlagos-approx', barcelona: 'barcelona-approx' }
const labels: Record<string, FreeModeTrackSource> = { kyojo: 'KYOJO', 'super-gt': 'SUPER GT', wec: 'WEC', indycar: 'INDYCAR' }

/** Match the native layout generator's distance sampling. OSM vertices may
 * be millimetres apart on one bend and hundreds of metres apart on the next;
 * applying the three-vertex curvature stencil directly amplifies that noise.
 * Positions remain interpolated on the sourced polyline, not a fitted time.
 */
export function equallySpacedCoursePoints(points: readonly (readonly [number, number])[], count = 156): Array<[number, number, number]> {
  const lengths = points.map((point,index) => Math.hypot(point[0]-points[(index+1)%points.length][0],point[1]-points[(index+1)%points.length][1]))
  const total = lengths.reduce((a,b)=>a+b,0)
  let index=0
  let start=0
  return Array.from({length:count},(_unused,sample)=>{
    const distance=sample*total/count
    while(index<points.length-1 && start+lengths[index]<distance){start+=lengths[index];index+=1}
    const fraction=lengths[index]>0?(distance-start)/lengths[index]:0
    const a=points[index], b=points[(index+1)%points.length]
    return [a[0]+(b[0]-a[0])*fraction,0,a[1]+(b[1]-a[1])*fraction]
  })
}
export const crossCategoryCoursePacks = motorsportChampionships.flatMap(championship =>
  motorsportCourses(championship.id).map(course => {
    const id = aliases[course.id] ?? course.id
    const geometricLength = course.points.reduce((sum, point, index) => {
      const next = course.points[(index + 1) % course.points.length]
      return sum + Math.hypot(point[0] - next[0], point[1] - next[1])
    }, 0)
    const track: TrackDefinition = {
      id, name: course.name, location: labels[championship.id],
      kind: course.kind === 'street' ? 'street' : 'permanent',
      feature: `${course.geometryBasis}; Free Mode physical course`,
      isSprintWeekend: false, rainProbability: 0.2,
      centerline: equallySpacedCoursePoints(course.points),
      width: course.widthM.value * geometricLength / course.lengthM,
      lengthKm: course.lengthM / 1000, lengthSource: 'official',
      tirePaceGaps: tirePaceGapsByTrack[id] ?? tirePaceGapsByTrack[`${course.id}-approx`],
      // Scheduling estimate only. The force model derives running speed.
      baseLapTime: course.lengthM / 50, baseLapTimeSource: 'estimated',
      ...expansionCourseTiming(course.id, course.points),
      pitLane: { entryProgress: course.pitEntry.value, exitProgress: course.pitExit.value,
        boxStartProgress: 0.4, boxCount: 40, speedLimitKph: course.pitSpeedKph.value,
        geometrySource: 'geometry-derived-estimate', speedLimitSource: 'fallback' },
      layoutSource: { detail: 'real', provider: course.geometryBasis === 'official-map-trace' ? 'official'
        : course.geometryBasis === 'osm-centerline' ? 'openstreetmap' : 'fallback', label: course.geometryBasis,
        url: course.sourceUrl, year: 2026 },
    }
    return { id, track, source: labels[championship.id] }
  }),
)
