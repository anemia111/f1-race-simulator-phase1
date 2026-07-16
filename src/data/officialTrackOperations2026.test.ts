import { describe, expect, it } from 'vitest'
import { activeAeroZoneAt } from '../simulation/activeAero'
import { officialTrackOperations2026 } from './officialTrackOperations2026'
import { tracks } from './tracks'

const forwardProgress = (from: number, to: number) => ((to - from) % 1 + 1) % 1

describe('official FIA 2026 circuit operations', () => {
  it('uses published sector distances and source tags for every available map', () => {
    for (const [trackId, operations] of Object.entries(
      officialTrackOperations2026,
    )) {
      const track = tracks.find((candidate) => candidate.id === trackId)

      expect(track, trackId).toBeDefined()
      expect(track!.lengthKm, trackId).toBe(operations.centerlineLengthKm)
      expect(track!.sectorMarksSource, trackId).toBe('official')
      expect(track!.sectorMarks, trackId).toEqual([
        0,
        Number(
          (
            operations.sectorLengthsKm[0] / operations.centerlineLengthKm
          ).toFixed(6),
        ),
        Number(
          (
            (operations.sectorLengthsKm[0] +
              operations.sectorLengthsKm[1]) /
            operations.centerlineLengthKm
          ).toFixed(6),
        ),
      ])
      expect(
        track!.overtakeControlLines?.every((line) => line.source === 'official'),
        trackId,
      ).toBe(true)
    }
  })

  it('keeps official Straight Mode starts inside their projected activation runs', () => {
    for (const track of tracks.filter(
      (candidate) => officialTrackOperations2026[candidate.id],
    )) {
      const operations = officialTrackOperations2026[track.id]

      expect(track.aeroActivationZones, track.id).toHaveLength(
        operations.straightMode.length,
      )

      track.aeroActivationZones?.forEach((zone, index) => {
        const span = forwardProgress(zone.start, zone.end)

        expect(zone.label, track.id).toBe(`SM A${index + 1}`)
        expect(zone.source, track.id).toBe('official')
        expect(span, `${track.id}:${zone.label}`).toBeGreaterThan(0.01)

        if (zone.lowGripStart !== undefined) {
          expect(
            forwardProgress(zone.start, zone.lowGripStart),
            `${track.id}:${zone.label}:low-grip`,
          ).toBeLessThan(span)
        }
      })
    }
  })

  it('delays partial Straight Mode to the FIA low-grip activation marker', () => {
    const track = tracks.find(
      (candidate) => candidate.id === 'albert-park-approx',
    )!
    const zone = track.aeroActivationZones![0]
    const beforeLowGripStart =
      zone.start + forwardProgress(zone.start, zone.lowGripStart!) * 0.5

    expect(activeAeroZoneAt(track, beforeLowGripStart % 1, true)).toBeNull()
    expect(activeAeroZoneAt(track, zone.lowGripStart!, true)).toBe(zone)
  })

  it('represents Monaco Straight Mode as officially unavailable', () => {
    const monaco = tracks.find((track) => track.id === 'monaco-approx')!

    expect(monaco.activeAeroUnavailable).toBe(true)
    expect(monaco.aeroActivationZones).toEqual([])
    expect(monaco.overtakeControlLines).toHaveLength(1)
    expect(monaco.overtakeControlLines![0].source).toBe('official')
  })
})
