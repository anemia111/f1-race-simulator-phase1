export type OfficialTrackAnchor = {
  offsetMeters: number
  reference: 'apex' | 'entry' | 'exit'
  turn: number
}

export type OfficialStraightModeZone = {
  lowGrip: OfficialTrackAnchor | null
  normal: OfficialTrackAnchor
}

export type OfficialTrackOperations = {
  centerlineLengthKm: number
  overtake: {
    activation: OfficialTrackAnchor
    detection: OfficialTrackAnchor
  } | null
  sectorLengthsKm: readonly [number, number, number]
  sourceUrl: string
  straightMode: readonly OfficialStraightModeZone[]
}

const after = (turn: number, offsetMeters: number): OfficialTrackAnchor => ({
  offsetMeters,
  reference: 'apex',
  turn,
})

const at = (
  turn: number,
  reference: OfficialTrackAnchor['reference'],
  offsetMeters = 0,
): OfficialTrackAnchor => ({ offsetMeters, reference, turn })

/**
 * Published FIA 2026 event-map geometry. Future events deliberately remain
 * absent until the Race Director publishes their competition map.
 */
export const officialTrackOperations2026: Readonly<
  Record<string, OfficialTrackOperations>
> = {
  'albert-park-approx': {
    centerlineLengthKm: 5.278,
    overtake: {
      activation: at(14, 'entry'),
      detection: after(13, 15),
    },
    sectorLengthsKm: [1.753, 1.413, 2.112],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_australian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone.pdf',
    straightMode: [
      { lowGrip: after(14, 100), normal: after(14, 50) },
      { lowGrip: after(2, 45), normal: after(2, 20) },
      { lowGrip: after(5, 125), normal: after(5, 85) },
      { lowGrip: null, normal: after(8, 35) },
      { lowGrip: null, normal: after(10, 60) },
    ],
  },
  'shanghai-approx': {
    centerlineLengthKm: 5.451,
    overtake: {
      activation: after(16, 100),
      detection: at(16, 'entry'),
    },
    sectorLengthsKm: [1.43, 1.569, 2.452],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_chinese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(16, 150), normal: after(16, 100) },
      { lowGrip: after(4, 100), normal: after(4, 60) },
      { lowGrip: after(10, 140), normal: after(10, 100) },
      { lowGrip: after(13, 130), normal: after(13, 60) },
    ],
  },
  'suzuka-approx': {
    centerlineLengthKm: 5.807,
    overtake: {
      activation: at(18, 'apex'),
      detection: at(17, 'exit'),
    },
    sectorLengthsKm: [2.184, 2.526, 1.097],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(18, 100), normal: at(18, 'exit') },
      { lowGrip: after(14, 70), normal: at(14, 'exit') },
    ],
  },
  'miami-approx': {
    centerlineLengthKm: 5.412,
    overtake: {
      activation: after(18, 10),
      detection: after(17, 20),
    },
    sectorLengthsKm: [1.866, 1.73, 1.816],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(19, 70), normal: at(19, 'exit') },
      { lowGrip: null, normal: after(8, 165) },
      { lowGrip: after(16, 150), normal: after(16, 90) },
    ],
  },
  'montreal-approx': {
    centerlineLengthKm: 4.361,
    overtake: {
      activation: after(14, 70),
      detection: at(13, 'entry'),
    },
    sectorLengthsKm: [1.092, 1.396, 1.873],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_canadian_grand_prix_-_competition_notes_-_circuit_map_v2.pdf',
    straightMode: [
      { lowGrip: after(14, 160), normal: after(14, 100) },
      { lowGrip: after(7, 110), normal: after(7, 50) },
      { lowGrip: null, normal: after(9, 60) },
      { lowGrip: after(11, 120), normal: after(11, 30) },
    ],
  },
  'monaco-approx': {
    centerlineLengthKm: 3.337,
    overtake: {
      activation: after(18, 40),
      detection: after(16, 80),
    },
    sectorLengthsKm: [1.051, 1.419, 0.867],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [],
  },
  'barcelona-approx': {
    centerlineLengthKm: 4.657,
    overtake: {
      activation: at(14, 'entry'),
      detection: at(13, 'apex'),
    },
    sectorLengthsKm: [1.619, 1.765, 1.273],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf',
    straightMode: [
      { lowGrip: after(14, 85), normal: after(14, 45) },
      { lowGrip: at(3, 'exit'), normal: at(3, 'exit', -40) },
      { lowGrip: after(5, 90), normal: after(5, 90) },
      { lowGrip: after(9, 90), normal: after(9, 40) },
    ],
  },
  'red-bull-ring-approx': {
    centerlineLengthKm: 4.326,
    overtake: {
      activation: after(10, 110),
      detection: after(10, -50),
    },
    sectorLengthsKm: [1.215, 1.697, 1.414],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_austrian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(10, 160), normal: after(10, 110) },
      { lowGrip: after(1, 170), normal: after(1, 110) },
      { lowGrip: after(3, 160), normal: after(3, 90) },
      { lowGrip: after(8, 60), normal: after(8, 10) },
    ],
  },
  'silverstone-approx': {
    centerlineLengthKm: 5.891,
    overtake: {
      activation: after(17, 95),
      detection: at(17, 'exit'),
    },
    sectorLengthsKm: [1.823, 2.464, 1.604],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(18, 115), normal: after(18, 65) },
      { lowGrip: after(5, 115), normal: after(5, 55) },
      { lowGrip: null, normal: after(7, 155) },
      { lowGrip: after(14, 125), normal: after(14, 65) },
    ],
  },
}
