import type { TrackDefinition } from '../types'
import { deriveAeroActivationZones } from './aeroZoneGeometry'
import { supportSeriesTrackLayouts } from './supportSeriesTrackLayouts'

// The domestic circuits have no OpenF1 layout feed, so their geometry comes
// from surveyed OpenStreetMap ways instead of a hand-drawn placeholder. Each
// generated chain is length-checked against the published lap distance.
const layoutFor = (trackId: string) => {
  const layout = supportSeriesTrackLayouts[trackId]

  if (!layout) {
    throw new Error(`Missing generated layout for support track ${trackId}`)
  }

  return {
    centerline: layout.centerline,
    // Overrides the shared placeholder split so each circuit gets boundaries
    // that follow its own layout.
    sectorMarks: layout.sectorMarks,
    layoutSource: {
      detail: 'real' as const,
      label: `Surveyed centerline, ${layout.measuredKm} km measured (${layout.source.attribution})`,
      provider: 'openstreetmap' as const,
      url: layout.source.officialUrl,
      year: 2026,
    },
  }
}

const commonTrackData = {
  activeAeroUnavailable: false,
  altitudeMeters: 40,
  baseLapTimeSource: 'estimated' as const,
  kind: 'permanent' as const,
  lengthSource: 'official' as const,
  raceLapsSource: 'estimated' as const,
  rainProbability: 0.24,
  sectorMarks: [0, 0.34, 0.68],
  sectorMarksSource: 'derived' as const,
  surfaceRoughness: 0.5,
  width: 4.2,
}

/**
 * A straight has to be long enough that a following car can actually close and
 * complete a move on it. Below this the zone is theatre: the car reaches the
 * braking point before the overtake is on. Domestic circuits are short, so
 * without a floor the ranking alone would hand a zone to a corner exit.
 */
const MINIMUM_AERO_STRAIGHT_METERS = 300

/**
 * The zones follow each circuit's surveyed centerline rather than a
 * hand-written progress list, so a long straight cannot be missed and a short
 * one cannot be given a zone it does not deserve.
 */
const derivedZonesFor = (trackId: string, lapKm: number) =>
  deriveAeroActivationZones(
    supportSeriesTrackLayouts[trackId]!.centerline,
    'permanent',
    {
      label: (index) => `ZONE ${index + 1}`,
      lapMeters: lapKm * 1_000,
      lowGripMode: 'disabled',
      minimumStraightMeters: MINIMUM_AERO_STRAIGHT_METERS,
      targetCount: 3,
    },
  )

const operationalData = (
  entryProgress: number,
  exitProgress: number,
  trackId: string,
  lapKm: number,
) => {
  const aeroActivationZones = derivedZonesFor(trackId, lapKm)

  return {
    aeroActivationZones,
    // Detection sits a short way before each activation point, as the FIA maps
    // place it, so the gap is judged on the approach rather than mid-zone.
    overtakeControlLines: aeroActivationZones.map((zone) => ({
      activationProgress: zone.start,
      detectionGapSeconds: 1,
      detectionProgress: Number(((zone.start - 0.03 + 1) % 1).toFixed(3)),
      source: 'derived' as const,
    })),
    pitLane: {
      boxCount: 24,
      boxSpacingProgress: 0.0017,
      boxStartProgress: 0.965,
      entryProgress,
      exitProgress,
      geometrySource: 'derived' as const,
      sourceUrl: null,
      speedLimitKph: 80,
      speedLimitSource: 'official' as const,
    },
    safetyCarLines: {
      line1Progress: Number((exitProgress + 0.015).toFixed(3)),
      line2Progress: Number((entryProgress - 0.015).toFixed(3)),
    },
  }
}

export const supportSeriesTracks: TrackDefinition[] = [
  {
    ...commonTrackData,
    ...operationalData(0.955, 0.075, 'motegi-sf', 4.801),
    baseLapTime: 87,
    ...layoutFor('motegi-sf'),
    feature: 'Stop-start layout with four major braking zones',
    id: 'motegi-sf',
    isSprintWeekend: false,
    lengthKm: 4.801,
    location: 'Japan',
    name: 'Mobility Resort Motegi',
    raceLaps: 35,
  },
  {
    ...commonTrackData,
    ...operationalData(0.93, 0.08, 'autopolis-sf', 4.674),
    altitudeMeters: 820,
    baseLapTime: 90,
    ...layoutFor('autopolis-sf'),
    feature: 'High-elevation technical circuit with linked medium-speed bends',
    id: 'autopolis-sf',
    isSprintWeekend: false,
    lengthKm: 4.674,
    location: 'Japan',
    name: 'Autopolis',
    raceLaps: 42,
  },
  {
    ...commonTrackData,
    ...operationalData(0.945, 0.09, 'fuji-sf', 4.563),
    altitudeMeters: 550,
    baseLapTime: 79.2,
    ...layoutFor('fuji-sf'),
    feature: '1.5 km main straight followed by a technical final sector',
    id: 'fuji-sf',
    isSprintWeekend: false,
    lengthKm: 4.563,
    location: 'Japan',
    name: 'Fuji Speedway',
    raceLaps: 41,
  },
  {
    ...commonTrackData,
    ...operationalData(0.92, 0.085, 'sugo-sf', 3.586),
    altitudeMeters: 110,
    baseLapTime: 64.5,
    ...layoutFor('sugo-sf'),
    feature: 'Short narrow lap with elevation and a steep final climb',
    id: 'sugo-sf',
    isSprintWeekend: false,
    lengthKm: 3.586,
    location: 'Japan',
    name: 'Sportsland SUGO',
    raceLaps: 53,
  },
]
