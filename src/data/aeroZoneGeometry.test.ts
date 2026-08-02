import { describe, expect, it } from 'vitest'
import { deriveAeroActivationZones, runDistance } from './aeroZoneGeometry'
import { supportSeriesTracks } from './supportSeriesTracks'
import { supportSeriesTrackLayouts } from './supportSeriesTrackLayouts'
import type { TrackDefinition } from '../types'

/** Rectangle with rounded ends: one long straight per side, none across zero. */
const ovalCenterline = (): TrackDefinition['centerline'] => {
  const points: TrackDefinition['centerline'] = []

  for (let index = 0; index < 120; index += 1) {
    const angle = (index / 120) * Math.PI * 2
    points.push([Math.cos(angle) * 200, 0, Math.sin(angle) * 60])
  }

  return points
}

/** The same shape rotated so one straight sits across the start/finish line. */
const straightAcrossStartLine = (): TrackDefinition['centerline'] => {
  const base = ovalCenterline()
  const offset = Math.round(base.length * 0.25)

  return [...base.slice(offset), ...base.slice(0, offset)]
}

const spanOf = (zone: { start: number; end: number }) =>
  zone.start <= zone.end ? zone.end - zone.start : 1 - zone.start + zone.end

describe('aero activation zone geometry', () => {
  it('merges a straight that spans the start/finish line into one zone', () => {
    const centerline = straightAcrossStartLine()
    const zones = deriveAeroActivationZones(centerline, 'permanent')
    const wrapping = zones.filter((zone) => zone.start > zone.end)

    // Split, the same road would be published as two abutting zones.
    expect(wrapping).toHaveLength(1)
    expect(
      zones.some((zone) => zone.start === 0 && zone.end < 1),
    ).toBe(false)
  })

  it('never emits two zones that abut across the line', () => {
    const zones = deriveAeroActivationZones(
      straightAcrossStartLine(),
      'permanent',
    )
    const endsAtLine = zones.some((zone) => zone.end === 1)
    const startsAtLine = zones.some((zone) => zone.start === 0)

    expect(endsAtLine && startsAtLine).toBe(false)
  })

  it('applies the metre floor only when a lap distance is supplied', () => {
    const centerline = ovalCenterline()
    const lapMeters =
      (runDistance(centerline, 0, centerline.length) / 1) * 1

    const unbounded = deriveAeroActivationZones(centerline, 'permanent')
    const floored = deriveAeroActivationZones(centerline, 'permanent', {
      lapMeters,
      // Longer than the whole lap, so every run is rejected and the
      // longest-segment fallback is what remains.
      minimumStraightMeters: lapMeters * 2,
    })

    expect(unbounded.length).toBeGreaterThan(0)
    expect(floored.length).toBeGreaterThan(0)
    expect(floored).not.toEqual(unbounded)
  })

  it('honours the label and low-grip mode a circuit asks for', () => {
    const zones = deriveAeroActivationZones(ovalCenterline(), 'permanent', {
      label: (index) => `ZONE ${index + 1}`,
      lowGripMode: 'disabled',
    })

    expect(zones[0].label).toBe('ZONE 1')
    expect(zones.every((zone) => zone.lowGripMode === 'disabled')).toBe(true)
    expect(zones.every((zone) => zone.source === 'derived')).toBe(true)
  })
})

describe('domestic circuit activation zones', () => {
  it('gives every Japanese circuit at least one zone on a real straight', () => {
    expect(supportSeriesTracks.length).toBeGreaterThan(0)

    supportSeriesTracks.forEach((track) => {
      const zones = track.aeroActivationZones ?? []

      expect(zones.length, track.id).toBeGreaterThan(0)

      zones.forEach((zone) => {
        // Every zone must be long enough to be worth activating for.
        expect(
          spanOf(zone) * track.lengthKm * 1_000,
          `${track.id} ${zone.label}`,
        ).toBeGreaterThanOrEqual(250)
        expect(zone.start, `${track.id} ${zone.label}`).toBeGreaterThanOrEqual(0)
        expect(zone.start, `${track.id} ${zone.label}`).toBeLessThan(1)
      })
    })
  })

  it('covers the full Fuji main straight as a single wrapping zone', () => {
    const fuji = supportSeriesTracks.find((track) => track.id === 'fuji-sf')!
    const zones = fuji.aeroActivationZones ?? []
    const mainStraight = zones.find((zone) => zone.start > zone.end)

    expect(mainStraight).toBeDefined()
    // Fuji's main straight is about 1.5 km; a fragment of it would mean the
    // start/finish split had reappeared.
    expect(spanOf(mainStraight!) * fuji.lengthKm * 1_000).toBeGreaterThan(1_200)
  })

  it('pairs every zone with one detection line ahead of activation', () => {
    supportSeriesTracks.forEach((track) => {
      const zones = track.aeroActivationZones ?? []
      const lines = track.overtakeControlLines ?? []

      expect(lines, track.id).toHaveLength(zones.length)

      zones.forEach((zone, index) => {
        expect(lines[index].activationProgress, track.id).toBe(zone.start)
        expect(lines[index].detectionProgress, track.id).not.toBe(zone.start)
      })
    })
  })

  it('derives zones from the surveyed centerline rather than fixed values', () => {
    supportSeriesTracks.forEach((track) => {
      const layout = supportSeriesTrackLayouts[track.id]

      expect(layout, track.id).toBeDefined()
      expect(track.aeroActivationZones?.every((zone) => zone.source === 'derived'))
        .toBe(true)
    })
  })
})
