export type OfficialTrackAnchor = {
  offsetMeters: number
  /** Zero-based occurrence for layouts whose published corner labels repeat. */
  occurrence?: number
  reference: 'apex' | 'entry' | 'exit'
  turn: number
}

export type OfficialStraightModeZone = {
  /** Next braking corner identified on the map; its entry projection is SIM. */
  brakingTurn?: number
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

const atOccurrence = (
  turn: number,
  occurrence: number,
  reference: OfficialTrackAnchor['reference'],
  offsetMeters = 0,
): OfficialTrackAnchor => ({
  occurrence,
  offsetMeters,
  reference,
  turn,
})

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
  'spa-approx': {
    centerlineLengthKm: 7.004,
    overtake: {
      activation: after(19, 130),
      detection: at(19, 'entry'),
    },
    sectorLengthsKm: [2.254, 2.82, 1.93],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(19, 240), normal: after(19, 190) },
      { lowGrip: after(1, 195), normal: after(1, 140) },
      { lowGrip: after(4, 360), normal: after(4, 60) },
      { lowGrip: after(15, 190), normal: after(15, 140) },
      { lowGrip: after(17, 110), normal: after(17, 80) },
    ],
  },
  'hungaroring-approx': {
    centerlineLengthKm: 4.381,
    overtake: {
      activation: at(14, 'exit', -30),
      detection: at(14, 'entry'),
    },
    sectorLengthsKm: [1.736, 1.542, 1.103],
    sourceUrl:
      'https://www.fia.com/system/files/decision-document/2026_hungarian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { lowGrip: after(14, 100), normal: after(14, 40) },
      {
        lowGrip: atOccurrence(1, 1, 'entry', 100),
        normal: atOccurrence(1, 1, 'entry', 30),
      },
      { lowGrip: after(3, 80), normal: after(3, 50) },
      { lowGrip: after(11, 90), normal: after(11, 60) },
    ],
  },
  'zandvoort-approx': {
    centerlineLengthKm: 4.259,
    overtake: { activation: at(14, 'entry', 45), detection: after(13, -10) },
    sectorLengthsKm: [1.483, 1.452, 1.324],
    sourceUrl: 'https://www.fia.com/system/files/decision-document/2026_dutch_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf',
    straightMode: [
      { brakingTurn: 1, normal: after(14, 20), lowGrip: after(14, 80) },
      { brakingTurn: 11, normal: after(10, 50), lowGrip: after(10, 120) },
    ],
  },
  'monza-approx': {
    centerlineLengthKm: 5.793,
    overtake: { activation: at(11, 'apex'), detection: at(11, 'entry') },
    sectorLengthsKm: [1.909, 1.823, 2.061],
    sourceUrl: 'https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { brakingTurn: 1, normal: after(11, 30), lowGrip: after(11, 100) },
      { brakingTurn: 4, normal: after(3, 70), lowGrip: after(3, 110) },
      { brakingTurn: 8, normal: after(7, 170), lowGrip: after(7, 230) },
      { brakingTurn: 11, normal: after(10, 130), lowGrip: after(10, 180) },
    ],
  },
  'madrid-approx': {
    centerlineLengthKm: 5.414,
    overtake: { activation: after(22, 20), detection: at(22, 'entry') },
    sectorLengthsKm: [1.839, 2.049, 1.526],
    sourceUrl: 'https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf',
    straightMode: [
      { brakingTurn: 1, normal: after(22, 100), lowGrip: after(22, 130) },
      { brakingTurn: 5, normal: after(3, 40), lowGrip: after(3, 90) },
    ],
  },
  'baku-approx': {
    centerlineLengthKm: 6.003,
    overtake: { activation: after(17, -20), detection: after(16, 90) },
    sectorLengthsKm: [2.033, 2.025, 1.945],
    sourceUrl: 'https://www.fia.com/system/files/decision-document/2026_azerbaijan_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf',
    straightMode: [
      { brakingTurn: 1, normal: after(19, 45), lowGrip: after(20, 45) },
      { brakingTurn: 3, normal: after(2, 110), lowGrip: after(2, 160) },
    ],
  },
  'singapore-approx': {
    centerlineLengthKm: 4.927,
    overtake: { activation: after(17, 30), detection: at(17, 'entry') },
    sectorLengthsKm: [1.639, 1.782, 1.506],
    sourceUrl: 'https://www.fia.com/system/files/decision-document/2026_singapore_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf',
    straightMode: [
      { brakingTurn: 1, normal: after(19, 30), lowGrip: after(19, 90) },
      { brakingTurn: 7, normal: after(5, 50), lowGrip: null },
      { brakingTurn: 10, normal: after(9, 70), lowGrip: after(9, 120) },
      { brakingTurn: 14, normal: after(13, 115), lowGrip: after(13, 165) },
      { brakingTurn: 16, normal: after(15, 70), lowGrip: after(15, 90) },
    ],
  },
}
