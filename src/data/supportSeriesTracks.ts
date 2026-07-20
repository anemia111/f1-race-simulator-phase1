import type { TrackDefinition } from '../types'
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

const operationalData = (
  entryProgress: number,
  exitProgress: number,
  zoneStarts: number[],
) => ({
  aeroActivationZones: zoneStarts.map((start, index) => ({
    end: Number(((start + 0.105) % 1).toFixed(3)),
    label: `ZONE ${index + 1}`,
    lowGripMode: 'disabled' as const,
    source: 'derived' as const,
    start,
  })),
  overtakeControlLines: zoneStarts.map((start) => ({
    activationProgress: start,
    detectionGapSeconds: 1,
    detectionProgress: Number(((start - 0.03 + 1) % 1).toFixed(3)),
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
})

export const supportSeriesTracks: TrackDefinition[] = [
  {
    ...commonTrackData,
    ...operationalData(0.955, 0.075, [0.08, 0.49]),
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
    ...operationalData(0.93, 0.08, [0.09]),
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
    ...operationalData(0.945, 0.09, [0.095]),
    altitudeMeters: 550,
    baseLapTime: 80,
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
    ...operationalData(0.92, 0.085, [0.09]),
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
