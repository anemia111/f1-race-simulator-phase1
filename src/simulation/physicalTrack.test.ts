import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { supportSeriesTracks } from '../data/supportSeriesTracks'
import type { TrackDefinition } from '../types'
import {
  MAX_PHYSICAL_TRACK_STATIONS,
  PHYSICAL_TRACK_FIELDS,
  physicalTrackStationAt,
  resolvePhysicalTrack,
  unavailablePhysicalTrackFieldProvenance,
} from './physicalTrack'

const referenceTrack = tracks.find((track) => track.id === 'suzuka-approx')!

function availableTrackFor(track: TrackDefinition) {
  const resolved = resolvePhysicalTrack(track)

  expect(resolved.status).toBe('available')
  if (resolved.status !== 'available') {
    throw new Error(`Expected physical track: ${resolved.validation.message}`)
  }

  return resolved.track
}

describe('physical track contract', () => {
  it('builds deterministic closed-loop metric stations from declared length', () => {
    const first = availableTrackFor(referenceTrack)
    const second = availableTrackFor(referenceTrack)
    const segmentTotal = first.stations.reduce(
      (total, station) => total + station.segmentLengthMeters,
      0,
    )

    expect(first).toEqual(second)
    expect(first.lapLengthMeters).toBe(referenceTrack.lengthKm * 1_000)
    expect(segmentTotal).toBeCloseTo(first.lapLengthMeters, 9)
    expect(first.stations).toHaveLength(referenceTrack.centerline.length)
    expect(first.closedLoop).toMatchObject({ isClosed: true })
    expect(first.closedLoop.closureSegmentMeters).toBeGreaterThan(0)
    expect(first.stations[0]).toMatchObject({ progress: 0, sMeters: 0 })
    expect(
      first.stations.every(
        (station, index) =>
          index === 0 || station.sMeters > first.stations[index - 1].sMeters,
      ),
    ).toBe(true)
  })

  it('resolves every configured F1 and SUPER FORMULA circuit as a closed loop', () => {
    for (const track of [...tracks, ...supportSeriesTracks]) {
      const resolved = resolvePhysicalTrack(track)

      expect(resolved.status, track.id).toBe('available')
      if (resolved.status === 'available') {
        expect(resolved.validation.status, track.id).toBe('valid')
        expect(resolved.track.closedLoop.isClosed, track.id).toBe(true)
      }
    }
  })

  it('labels every metric field and makes unsupported 3D inputs unavailable', () => {
    const physical = availableTrackFor(referenceTrack)

    for (const field of PHYSICAL_TRACK_FIELDS) {
      const provenance = physical.fieldProvenance[field]

      expect(provenance.source).toBeTruthy()
      expect(provenance.sourceLabel).not.toHaveLength(0)
      expect(provenance.method).toBeTruthy()
      expect(provenance.confidence).toBeTruthy()
      expect(provenance.sourceDate).toHaveProperty('precision')
      expect(provenance.sourceDate).toHaveProperty('value')
    }

    expect(physical.fieldProvenance.lapLengthMeters.source).toBe('official')
    expect(physical.fieldProvenance.elevationMeters).toMatchObject({
      confidence: 'unavailable',
      method: 'intentionally-unavailable',
      source: 'unavailable',
    })
    expect(physical.fieldProvenance.elevationMeters.sourceLabel).toContain(
      'render Y',
    )
    expect(physical.fieldProvenance.bankingDegrees.source).toBe('unavailable')
    expect(physical.fieldProvenance.usableWidthMeters.source).toBe(
      'unavailable',
    )
  })

  it('exports the same explicit unavailable provenance for road-input fallbacks', () => {
    expect(
      unavailablePhysicalTrackFieldProvenance('grade'),
    ).toMatchObject({
      confidence: 'unavailable',
      method: 'intentionally-unavailable',
      source: 'unavailable',
    })
    expect(
      unavailablePhysicalTrackFieldProvenance('grade').sourceLabel,
    ).toContain('grade')
    expect(
      unavailablePhysicalTrackFieldProvenance('usableWidthMeters').sourceLabel,
    ).toContain('render width')
  })

  it('does not infer a physical elevation, grade, or planar shape from render Y', () => {
    const alteredRenderY: TrackDefinition = {
      ...referenceTrack,
      centerline: referenceTrack.centerline.map((point, index) => [
        point[0],
        index % 2 === 0 ? Number.NaN : point[1] + 10_000,
        point[2],
      ]),
    }
    const baseline = availableTrackFor(referenceTrack)
    const altered = availableTrackFor(alteredRenderY)

    expect(altered.stations).toEqual(baseline.stations)
    expect(altered.fieldProvenance.elevationMeters).toEqual(
      baseline.fieldProvenance.elevationMeters,
    )
    expect(altered.fieldProvenance.grade).toEqual(
      baseline.fieldProvenance.grade,
    )
  })

  it('keeps a valid legacy layout as a low-confidence legacy fallback', () => {
    const legacy: TrackDefinition = {
      ...referenceTrack,
      layoutSource: {
        detail: 'fallback',
        label: 'Legacy test layout',
        provider: 'fallback',
        url: null,
        year: null,
      },
      lengthSource: 'estimated',
    }
    const physical = availableTrackFor(legacy)

    expect(physical.fieldProvenance.arcLengthMeters).toMatchObject({
      confidence: 'low',
      source: 'legacy-fallback',
    })
    expect(physical.fieldProvenance.lapLengthMeters).toMatchObject({
      confidence: 'low',
      source: 'legacy-fallback',
    })
  })

  it('derives a signed horizontal curvature from the metric planar shape', () => {
    const square: TrackDefinition = {
      ...referenceTrack,
      centerline: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      lengthKm: 0.004,
    }
    const physical = availableTrackFor(square)

    expect(
      physical.stations.every(
        (station) => station.signedHorizontalCurvaturePerMeter > 0,
      ),
    ).toBe(true)
    expect(
      physical.stations[0].signedHorizontalCurvaturePerMeter,
    ).toBeCloseTo(Math.SQRT2, 8)
  })

  it('fails closed on a degenerate closure instead of creating a neutral circuit', () => {
    const invalid: TrackDefinition = {
      ...referenceTrack,
      centerline: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 100, 0],
      ],
    }
    const resolved = resolvePhysicalTrack(invalid)

    expect(resolved.status).toBe('unavailable')
    if (resolved.status === 'unavailable') {
      expect(resolved.track).toBeNull()
      expect(resolved.validation).toMatchObject({
        code: 'degenerate-closing-segment',
        pointIndex: 2,
      })
      expect(resolved.fieldProvenance.arcLengthMeters.source).toBe(
        'unavailable',
      )
    }
  })

  it('fails closed before allocating an unbounded imported centreline', () => {
    const oversized: TrackDefinition = {
      ...referenceTrack,
      centerline: Array.from(
        { length: MAX_PHYSICAL_TRACK_STATIONS + 1 },
        (_, index) => [index, 0, index % 2] as [number, number, number],
      ),
    }
    const resolved = resolvePhysicalTrack(oversized)

    expect(resolved.status).toBe('unavailable')
    if (resolved.status === 'unavailable') {
      expect(resolved.validation.code).toBe('too-many-centerline-points')
    }
  })

  it('looks up the station at or before a wrapped progress deterministically', () => {
    const physical = availableTrackFor(referenceTrack)
    const midpoint = physicalTrackStationAt(physical, 0.5)

    expect(midpoint.sMeters).toBeLessThanOrEqual(
      physical.lapLengthMeters * 0.5,
    )
    expect(physicalTrackStationAt(physical, 1.5)).toEqual(midpoint)
    expect(physicalTrackStationAt(physical, -0.1)).toEqual(
      physicalTrackStationAt(physical, 0.9),
    )
  })
})
