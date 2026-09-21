import type { TrackDefinition } from '../types'
import { officialTrackOperations2026 } from './officialTrackOperations2026'

/** Source distances are from the control line, not the standing-start line.
 * A corner-relative location projected onto an approximate layout stays derived.
 * The renderer uses getPointAt (arc length), not the control-point index.
 */
export type SectorBoundaryReference = {
  checkedOn: string
  year: number
  sourceUrl: string
  lengthKm: number
  sectorLengthsKm?: readonly [number, number, number]
  anchors?: readonly [readonly [number, number], readonly [number, number]]
}

const fia = (file: string) => `https://www.fia.com/system/files/decision-document/${file}.pdf`
const historical = (
  lengthKm: number,
  anchors: NonNullable<SectorBoundaryReference['anchors']>,
  file: string,
): SectorBoundaryReference => ({ checkedOn: '2026-09-21', year: 2025, lengthKm, anchors, sourceUrl: fia(file) })

export const sectorBoundaryReferences: Record<string, SectorBoundaryReference> = {
  ...Object.fromEntries(Object.entries(officialTrackOperations2026).map(([id, data]) => [id, {
    checkedOn: '2026-09-21', year: 2026, sourceUrl: data.sourceUrl,
    lengthKm: data.centerlineLengthKm, sectorLengthsKm: data.sectorLengthsKm,
  }])),
  'monza-approx': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 5.793,
    sectorLengthsKm: [1.909, 1.823, 2.061],
    sourceUrl: fia('2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone'),
  },
  'zandvoort-approx': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 4.259,
    sectorLengthsKm: [1.483, 1.452, 1.324],
    sourceUrl: fia('2026_dutch_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map'),
  },
  'madrid-approx': {
    checkedOn: '2026-09-21', year: 2026, lengthKm: 5.414,
    sectorLengthsKm: [1.839, 2.049, 1.526],
    sourceUrl: fia('2026_spanish_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map'),
  },
  'bahrain-approx': historical(5.412, [[5, 0], [13, -48]], '2025_bahrain_grand_prix_-_event_notes_-_circuit_map_v4'),
  'jeddah-approx': historical(6.174, [[13, -265], [22, -120]], '2025_saudi_arabian_grand_prix_-_event_notes_-_circuit_map_pit_lane_and_quarantine_zone'),
  'baku-approx': historical(6.003, [[5, -46], [16, -56]], '2025_baku_event_-_circuit_map_-_baku_2025'),
  'singapore-approx': historical(4.927, [[7, -150], [14, -140]], '2025_singapore_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_map_and_quarantine_zone'),
  'cota-approx': historical(5.513, [[7, -55], [13, -65]], '2025_united_states_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_map_red_zones_map'),
  'mexico-city-approx': historical(4.304, [[4, -136], [12, -242]], '2025_mexico_city_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone_area'),
  'interlagos-approx': historical(4.309, [[4, -168], [12, -85]], '2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map'),
  'las-vegas-approx': historical(6.201, [[5, 90], [12, 140]], '2025_las_vegas_grand_prix_-_event_notes_-_circuit_map_v2_pit_lane_drawing_emergency_map_exits_quarantine_zone_and_red_zones'),
  'lusail-approx': historical(5.419, [[6, -80], [12, -75]], '2025_qatar_grand_prix_-_event_notes_-_circuit_map._pit_lane_drawing_emergency_exits_map_ers_battery_containment_area_red_zones_map'),
  'yas-marina-approx': historical(5.281, [[5, -205], [9, -100]], '2025_abu_dhabi_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones'),
}

export function projectPointToArcProgress(centerline: TrackDefinition['centerline'], point: readonly number[]) {
  let total = 0
  let bestDistance = Infinity
  let bestAlong = 0
  centerline.forEach((a, index) => {
    const b = centerline[(index + 1) % centerline.length]
    const dx = b[0] - a[0]
    const dz = b[2] - a[2]
    const squared = dx * dx + dz * dz
    const length = Math.sqrt(squared)
    const t = squared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / squared))
    const distance = (point[0] - a[0] - t * dx) ** 2 + (point[2] - a[2] - t * dz) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestAlong = total + t * length
    }
    total += length
  })
  if (!(total > 0)) throw new Error('Cannot project sectors onto an empty layout')
  return bestAlong / total
}

export function sourcedSectorData(track: Pick<TrackDefinition, 'id' | 'centerline' | 'corners'>) {
  const reference = sectorBoundaryReferences[track.id]
  if (!reference) throw new Error(`Missing sector reference: ${track.id}`)
  const distances = reference.sectorLengthsKm
  const marks = distances ? [0, distances[0] / reference.lengthKm,
    (distances[0] + distances[1]) / reference.lengthKm] : [0, ...reference.anchors!.map(([turn, offset]) => {
    const corner = track.corners?.find((corner) => corner.number === turn)
    if (!corner) throw new Error(`Missing sector anchor T${turn}: ${track.id}`)
    return projectPointToArcProgress(track.centerline, corner.position) + offset / (reference.lengthKm * 1000)
  })]
  if (!(marks[1] > 0 && marks[2] > marks[1] && marks[2] < 1)) {
    throw new Error(`Invalid sourced sector boundaries: ${track.id}`)
  }
  return {
    sectorMarks: marks.map((value) => Number(value.toFixed(6))),
    sectorMarksSource: distances ? 'official' as const : 'derived' as const,
    sectorBoundaryReference: reference,
  }
}
