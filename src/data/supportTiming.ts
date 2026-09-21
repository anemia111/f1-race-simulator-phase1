import type { TrackDefinition } from '../types'
import { projectPointToArcProgress } from './sectorBoundaries'
import { supportSeriesTrackLayouts } from './supportSeriesTrackLayouts'

type TimingReference = NonNullable<TrackDefinition['sectorBoundaryReference']> & {
  cumulativeMeters: readonly number[]
  /** Map-to-model registration, not a surveyed coordinate in model space. */
  controlPoint?: readonly [number, number, number]
}

export const supportTimingReferences: Record<string, TimingReference> = {
  'motegi-sf': {
    checkedOn: '2026-09-21', lengthKm: 4.8013,
    sourceUrl: 'https://www.mr-motegi.jp/mcom/pdf/measurement_point.pdf',
    cumulativeMeters: [0, 1235.2, 2576.7, 3762.7],
    // Official control-line GPS: 140.22673 E, 36.53298 N. Projected with the
    // generator's OSM bounds/scale (ways 28213529, 28213530; exact geometry match).
    controlPoint: [-19.1773230693, 0, -2.2361571059],
  },
  'autopolis-sf': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 4.674,
    sourceUrl: 'https://autopolis.jp/ap/wp-content/uploads/2026/04/2026-sf-flier-01.pdf',
    cumulativeMeters: [0, 1089, 2561.44],
    // FINISH LINE, not START LINE: diagram registration on the first third of
    // the home straight. Spatial accuracy is limited by the approximate layout.
    controlPoint: [1.73, 0, -8.17],
  },
  'fuji-sf': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 4.563,
    sourceUrl: 'https://www.fsw.tv/freeinfo/pdf-cms/6d29dfc71374015d52fdf769da9a76dfaa830c26.pdf',
    cumulativeMeters: [0, 1305, 2828],
    // Competition regulations p52: control line 0/4563 m, starting line 307 m.
    // Diagram registration places the control line near the middle of the
    // straight; the old two-thirds heuristic was near the starting grid.
    controlPoint: [-2.02, 0, -4.77],
  },
  'sugo-sf': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 3.586,
    sourceUrl: 'https://www.sportsland-sugo.co.jp/assets/docs/course/c-racing/2026_racing-course_layout.pdf',
    cumulativeMeters: [0, 833, 1821, 2568],
  },
}

/** Rotate the existing geometry, preserving its segments and their locations.
 * Generated arrays and geodata remain in their original frame. The returned
 * offset maps runtime progress back into that frame for elevation/grade data.
 */
export function alignControlLine(
  centerline: TrackDefinition['centerline'],
  controlPoint?: readonly [number, number, number],
) {
  if (!controlPoint) return { centerline, measuredRoadProgressOffset: 0 }
  const offset = projectPointToArcProgress(centerline, controlPoint)
  const lengths = centerline.map((a, i) => {
    const b = centerline[(i + 1) % centerline.length]
    return Math.hypot(b[0] - a[0], b[2] - a[2])
  })
  let remaining = offset * lengths.reduce((a, b) => a + b, 0)
  let segment = 0
  while (segment < lengths.length - 1 && remaining > lengths[segment]) {
    remaining -= lengths[segment++]
  }
  const fraction = lengths[segment] > 0 ? remaining / lengths[segment] : 0
  const a = centerline[segment], b = centerline[(segment + 1) % centerline.length]
  const origin: [number, number, number] = [a[0] + (b[0] - a[0]) * fraction, 0, a[2] + (b[2] - a[2]) * fraction]
  const rotated = [origin, ...centerline.slice(segment + 1), ...centerline.slice(0, segment + 1)]
  // Avoid a duplicate control point when a diagram anchor is already a vertex.
  const clean = rotated.filter((p, i) => {
    const next = rotated[(i + 1) % rotated.length]
    return Math.hypot(p[0] - next[0], p[2] - next[2]) > 1e-7
  })
  return { centerline: clean, measuredRoadProgressOffset: offset }
}

const alignedLayouts = new Map<string, ReturnType<typeof alignControlLine>>()
export function supportTimingFor(trackId: string) {
  const reference = supportTimingReferences[trackId]
  const layout = supportSeriesTrackLayouts[trackId]
  if (!reference || !layout) throw new Error(`Missing support timing reference: ${trackId}`)
  let aligned = alignedLayouts.get(trackId)
  if (!aligned) {
    aligned = alignControlLine(layout.centerline, reference.controlPoint)
    alignedLayouts.set(trackId, aligned)
  }
  return {
    ...aligned,
    sectorMarks: reference.cumulativeMeters.map((m) => m / (reference.lengthKm * 1000)),
    sectorMarksSource: 'official' as const,
    sectorBoundaryReference: reference,
  }
}

/** Domestic Suzuka timing is not the three-sector F1 event configuration.
 * The operator publishes locations, not surveyed distances, so these map
 * registrations remain derived. Fractions locate the drawn lines between
 * reverse bank/Dunlop and Degner exit/the following kink, respectively.
 */
export function superFormulaSuzukaTiming(track: TrackDefinition) {
  if (track.id !== 'suzuka-approx') return {}
  const cornerAt = (number: number) => {
    const corner = track.corners?.find((c) => c.number === number)
    if (!corner) throw new Error(`Missing Suzuka corner ${number}`)
    return projectPointToArcProgress(track.centerline, corner.position)
  }
  return {
    sectorMarks: [0,
      cornerAt(6) + (cornerAt(7) - cornerAt(6)) * 0.4,
      cornerAt(9) + (cornerAt(10) - cornerAt(9)) * 0.5,
      cornerAt(15) - 200 / (track.lengthKm * 1000)],
    sectorMarksSource: 'derived' as const,
    sectorBoundaryReference: {
      checkedOn: '2026-09-21', year: 2009, lengthKm: 5.807,
      sourceUrl: 'https://www.suzukacircuit.jp/result_s/2016/clubman/suzuka-sector-point.pdf',
    },
  }
}
