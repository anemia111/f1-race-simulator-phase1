export type FiaEventPackStatus =
  | 'verified'
  | 'event-page'
  | 'pending'
  | 'cancelled'

export type FiaEventPack = {
  trackId: string
  eventName: string
  status: FiaEventPackStatus
  asOf: string
  documents: {
    eventPageUrl: string
    circuitMapUrl: string | null
    powerUnitInformationUrl: string | null
    redZoneUrl: string | null
  }
  coverage: {
    circuitMap: boolean
    classifications: boolean
    deletedLaps: boolean
    powerUnitUsage: boolean
    raceDirectorNotes: boolean
  }
  /** True only when values have been normalized, not merely linked. */
  normalizedOperationalData: boolean
  /**
   * An event-specific power-unit input has been normalized for this pack.
   * This presentation flag is not an authority to reuse it by track ID;
   * runtime resolution remains exact-event-ID scoped.
   */
  normalizedPowerUnitInput: boolean
}

const FIA_EVENT_BASE =
  'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/event/'
const AS_OF = '2026-08-08'

const events: Record<string, string> = {
  'albert-park-approx': 'Australian Grand Prix',
  'shanghai-approx': 'Chinese Grand Prix',
  'suzuka-approx': 'Japanese Grand Prix',
  'bahrain-approx': 'Bahrain Grand Prix',
  'jeddah-approx': 'Saudi Arabian Grand Prix',
  'miami-approx': 'Miami Grand Prix',
  'montreal-approx': 'Canadian Grand Prix',
  'monaco-approx': 'Monaco Grand Prix',
  'barcelona-approx': 'Spanish Grand Prix',
  'red-bull-ring-approx': 'Austrian Grand Prix',
  'silverstone-approx': 'British Grand Prix',
  'spa-approx': 'Belgian Grand Prix',
  'hungaroring-approx': 'Hungarian Grand Prix',
  'zandvoort-approx': 'Dutch Grand Prix',
  'monza-approx': 'Italian Grand Prix',
  'madrid-approx': 'Spanish Grand Prix',
  'baku-approx': 'Azerbaijan Grand Prix',
  'singapore-approx': 'Singapore Grand Prix',
  'cota-approx': 'United States Grand Prix',
  'mexico-city-approx': 'Mexico City Grand Prix',
  'interlagos-approx': 'Sao Paulo Grand Prix',
  'las-vegas-approx': 'Las Vegas Grand Prix',
  'lusail-approx': 'Qatar Grand Prix',
  'yas-marina-approx': 'Abu Dhabi Grand Prix',
}

const verified = new Set([
  'albert-park-approx',
  'suzuka-approx',
  'montreal-approx',
  'monaco-approx',
  'silverstone-approx',
])
const completedWithEventPage = new Set([
  'shanghai-approx',
  'miami-approx',
  'barcelona-approx',
  'red-bull-ring-approx',
])
const cancelled = new Set(['bahrain-approx', 'jeddah-approx'])

const circuitMaps: Partial<Record<string, string>> = {
  'albert-park-approx':
    'https://www.fia.com/system/files/decision-document/2026_australian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_quarantine_zone.pdf',
  'suzuka-approx':
    'https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf',
  'montreal-approx':
    'https://www.fia.com/system/files/decision-document/2026_canadian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf',
}

const redZones: Partial<Record<string, string>> = {
  'silverstone-approx':
    'https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_red_zone_v2.pdf',
}

const powerUnitInformation: Partial<Record<string, string>> = {
  'suzuka-approx':
    'https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_power_unit_information.pdf',
}

function eventPageUrl(eventName: string) {
  return `${FIA_EVENT_BASE}${encodeURIComponent(eventName)}`
}

export const fiaEventPacks2026: FiaEventPack[] = Object.entries(events).map(
  ([trackId, eventName]) => {
    const status: FiaEventPackStatus = cancelled.has(trackId)
      ? 'cancelled'
      : verified.has(trackId)
        ? 'verified'
        : completedWithEventPage.has(trackId)
          ? 'event-page'
          : 'pending'
    const published = status === 'verified' || status === 'event-page'

    return {
      asOf: AS_OF,
      coverage: {
        circuitMap: circuitMaps[trackId] !== undefined,
        classifications: published,
        deletedLaps: published,
        powerUnitUsage: published,
        raceDirectorNotes: published,
      },
      documents: {
        circuitMapUrl: circuitMaps[trackId] ?? null,
        eventPageUrl: eventPageUrl(eventName),
        powerUnitInformationUrl: powerUnitInformation[trackId] ?? null,
        redZoneUrl: redZones[trackId] ?? null,
      },
      eventName,
      normalizedOperationalData: false,
      normalizedPowerUnitInput: powerUnitInformation[trackId] !== undefined,
      status,
      trackId,
    }
  },
)

const packsByTrack = new Map(
  fiaEventPacks2026.map((pack) => [pack.trackId, pack]),
)

export function fiaEventPackFor(trackId: string) {
  return packsByTrack.get(trackId) ?? null
}
