import type { TrackDefinition } from '../types'
import { tracks } from './tracks'
import { supportSeriesTracks } from './supportSeriesTracks'
import { alignControlLine } from './supportTiming'
import { superFormulaSuzukaTiming } from './supportTiming'
import { projectPointToArcProgress } from './sectorBoundaries'
import layouts from './expansionCourseLayouts.json'
import indyTiming from './indyTimingReferences2026.json'

const wec = (event: string, file = 'Circuit%20Map.pdf') =>
  `https://fiawec.alkamelsystems.com/Results/15_2026/${event}/00_Event%20Info/${file}`

/** Distances are from the FINISH/control line, never the offset start line.
 * Map registration on public geometry is derived, not a surveyed timing loop.
 * Do not infer another series' timing from an F1 three-sector configuration.
 */
type ExpansionTimingReference = {
  lengthM: number; cumulativeM: number[]; sourceUrl: string
  controlPoint?: number[]; reverse?: boolean; labels?: string[]
  year?: number
}
export const expansionTimingReferences: Record<string, ExpansionTimingReference> = {
  ...Object.fromEntries(indyTiming.references.map(reference => [reference.id, reference])),
  okayama: { year: 2025, lengthM: 3703, cumulativeM: [0, 962, 2520],
    sourceUrl: 'https://www.okayama-international-circuit.jp/guide/pdf/course.pdf',
    // Registration of the control line on the operator's course diagram.
    reverse: true, controlPoint: [-494.971752, -620.923134] },
  imola: { lengthM: 4909, cumulativeM: [0, 1214, 2728],
    sourceUrl: wec('01_IMOLA', '1_Circuit%20Map.pdf'), controlPoint: [-201.61676, 331.367596] },
  spa: { lengthM: 7003.9, cumulativeM: [0, 2243.5, 5112.7],
    sourceUrl: wec('02_SPA%20FRANCORCHAMPS') },
  'le-mans': { lengthM: 13625.7, cumulativeM: [0, 1900.7, 7672.13],
    sourceUrl: wec('03_LE%20MANS', 'Circuit%20Map%20v3.pdf'),
    controlPoint: [-1371.247, 3548.869] },
  interlagos: { lengthM: 4309, cumulativeM: [0, 1234, 3155],
    sourceUrl: wec('04_SAO%20PAULO') },
  cota: { lengthM: 5513, cumulativeM: [0, 1311, 3568],
    sourceUrl: wec('05_CIRCUIT%20OF%20THE%20AMERICAS', 'Circuit%20Map%20v3.pdf') },
}

const domesticIds: Record<string, string> = {
  fuji: 'fuji-sf', sugo: 'sugo-sf', motegi: 'motegi-sf', autopolis: 'autopolis-sf',
}
const sharedIds: Record<string, string> = {
  ...domesticIds, suzuka: 'suzuka-approx', spa: 'spa-approx',
  interlagos: 'interlagos-approx', cota: 'cota-approx',
}
const native = new Map([...tracks, ...supportSeriesTracks].map(track => [track.id, track]))

/** Rotate only the extra-category source geometry, preserving its vertices.
 * Correct the OSM chain direction when the official timing diagram
 * establishes the opposite direction. Lap zero/grid then use the control line.
 */
export function alignExpansionControlLine(id: string, points: Array<[number, number]>) {
  const reference = expansionTimingReferences[id]
  if (!reference?.controlPoint) return points
  const directed = reference.reverse ? [...points].reverse() : points
  return alignControlLine(directed.map(([x, y]) => [x, 0, y]),
    [reference.controlPoint[0], 0, reference.controlPoint[1]]).centerline.map(([x, , y]) => [x, y] as [number, number])
}

export function expansionCourseTiming(id: string, points: Array<[number, number]>): Pick<TrackDefinition,
  'sectorMarks' | 'sectorMarksSource' | 'sectorLabels' | 'sectorBoundaryReference' | 'sectorTimingUnavailableReason'> {
  const shared = native.get(sharedIds[id])
  let source: string | undefined
  let referencePoints: Array<[number, number]> | undefined
  let marks: number[] | undefined
  let lengthKm: number | undefined
  let year: number | undefined = 2026
  let labels: string[] | undefined
  if (domesticIds[id] && shared) {
    marks = shared.sectorMarks
    source = shared.sectorBoundaryReference?.sourceUrl
    year = shared.sectorBoundaryReference?.year
    lengthKm = shared.lengthKm
    referencePoints = shared.centerline.map(([x, , z]) => [x, -z])
  } else if (id === 'suzuka' && shared) {
    const domestic = superFormulaSuzukaTiming(shared)
    marks = domestic.sectorMarks
    source = domestic.sectorBoundaryReference?.sourceUrl
    year = domestic.sectorBoundaryReference?.year ?? 2009
    lengthKm = shared.lengthKm
    referencePoints = shared.centerline.map(([x, , z]) => [x, -z])
  } else {
    const reference = expansionTimingReferences[id]
    if (reference) {
      marks = reference.cumulativeM.map(m => m / reference.lengthM)
      source = reference.sourceUrl; lengthKm = reference.lengthM / 1000
      year = reference.year ?? 2026
      labels = reference.labels
      referencePoints = shared ? shared.centerline.map(([x, , z]) => [x, -z])
        : alignExpansionControlLine(id, layouts.layouts.find(layout => layout.id === id)!.centerlineMeters as Array<[number, number]>)
    }
  }
  if (!source || !marks || !referencePoints || !lengthKm) return {
    sectorMarks: [], sectorMarksSource: 'fallback' as const,
    sectorTimingUnavailableReason: '公式計測線と走路形状の対応未確認。等分セクターは表示しません。',
  }
  // Loaded FREE/save files can retain an older, unrotated geometry origin.
  // Locate the reference control line on that actual geometry before drawing.
  const origin = referencePoints[0]
  const signedArea = (line: Array<[number, number]>) => line.reduce((sum, a, i) => {
    const b = line[(i + 1) % line.length]; return sum + a[0] * b[1] - b[0] * a[1]
  }, 0)
  if (signedArea(points) * signedArea(referencePoints) < 0) return {
    sectorMarks: [], sectorMarksSource: 'fallback' as const,
    sectorTimingUnavailableReason: '保存された旧コースの走行方向が公式図と逆です。新規セッションで修正版を使用できます。',
  }
  const offset = projectPointToArcProgress(points.map(([x, y]) => [x, 0, y]), [origin[0], 0, origin[1]])
  return {
    sectorMarks: marks.map(mark => (mark + offset) % 1),
    sectorMarksSource: 'derived' as const,
    ...(labels ? { sectorLabels: labels } : {}),
    sectorBoundaryReference: { checkedOn: '2026-10-08', year, sourceUrl: source, lengthKm },
  } satisfies Partial<TrackDefinition>
}
