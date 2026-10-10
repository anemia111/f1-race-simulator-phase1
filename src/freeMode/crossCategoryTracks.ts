import { motorsportChampionships, motorsportCourses } from '../motorsport/packages'
import { expansionCourseTiming } from '../data/expansionTiming'
import type { TrackDefinition } from '../types'
import type { FreeModeTrackSource } from './types'

const aliases: Record<string, string> = { fuji: 'fuji-sf', motegi: 'motegi-sf', sugo: 'sugo-sf', autopolis: 'autopolis-sf', suzuka: 'suzuka-approx', spa: 'spa-approx', cota: 'cota-approx', interlagos: 'interlagos-approx', barcelona: 'barcelona-approx' }
const labels: Record<string, FreeModeTrackSource> = { kyojo: 'KYOJO', 'super-gt': 'SUPER GT', wec: 'WEC', indycar: 'INDYCAR' }
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
      centerline: course.points.map(([x, z]) => [x, 0, z]),
      width: course.widthM.value * geometricLength / course.lengthM,
      lengthKm: course.lengthM / 1000, lengthSource: 'official',
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
