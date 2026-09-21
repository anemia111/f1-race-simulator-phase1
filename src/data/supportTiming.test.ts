import { describe, expect, it } from 'vitest'
import { tracks } from './tracks'
import { supportSeriesTracks } from './supportSeriesTracks'
import { supportSeriesTrackLayouts } from './supportSeriesTrackLayouts'
import { alignControlLine, superFormulaSuzukaTiming, supportTimingReferences } from './supportTiming'
import { projectPointToArcProgress } from './sectorBoundaries'
import { sourcedPhysicalRoadInputsAt } from '../simulation/physicalRoadProfiles'
import { sectorFlagStatesFor } from '../simulation/raceEvents'

describe('domestic circuit control lines and timing', () => {
  it('uses the published 3/4-sector distances on all four support circuits', () => {
    for (const track of supportSeriesTracks) {
      const reference = supportTimingReferences[track.id]
      expect(reference).toBeDefined()
      expect(track.sectorMarks.length).toBe(['motegi-sf', 'sugo-sf'].includes(track.id) ? 4 : 3)
      track.sectorMarks.forEach((p, index) => expect(p * reference.lengthKm * 1000).toBeCloseTo(reference.cumulativeMeters[index], 8))
      expect(track.sectorBoundaryReference?.sourceUrl).toBe(reference.sourceUrl)
      expect(track.sectorMarks.every((p, i, a) => p >= 0 && p < 1 && (i === 0 || p > a[i - 1]))).toBe(true)
    }
    expect(supportTimingReferences['autopolis-sf'].cumulativeMeters).toEqual([0, 1089, 2561.44])
  })

  it('moves Motegi from the downhill straight to the published control line', () => {
    const track = supportSeriesTracks.find((t) => t.id === 'motegi-sf')!
    expect(track.measuredRoadProgressOffset).toBeCloseTo(0.2156560817, 8)
    const legacy = supportSeriesTrackLayouts[track.id]!.centerline
    // Official GPS points projected into the unchanged OSM frame.
    const points = [[-6.803559, 0, -3.555204], [8.718559, 0, -2.145188], [8.242645, 0, 11.045282]]
    points.forEach((point, index) => {
      const actual = projectPointToArcProgress(track.centerline, point)
      expect(Math.abs(actual - track.sectorMarks[index + 1]) * 4801.3).toBeLessThan(12)
      expect(actual).toBeCloseTo((projectPointToArcProgress(legacy, point) + 1 - track.measuredRoadProgressOffset!) % 1, 8)
    })
  })

  it('keeps geodata in the same physical place after rotating the timing origin', () => {
    for (const track of supportSeriesTracks) {
      const offset = track.measuredRoadProgressOffset ?? 0
      const legacy = { ...track, measuredRoadProgressOffset: 0 }
      for (const p of [0, 0.3, 0.9]) {
        expect(sourcedPhysicalRoadInputsAt(track, p)).toEqual(sourcedPhysicalRoadInputsAt(legacy, p + offset))
      }
    }
  })

  it('preserves the closing edge and avoids duplicate vertices when aligning', () => {
    const line: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]]
    expect(alignControlLine(line, [0, 0, 5]).centerline[0]).toEqual([0, 0, 5])
    expect(alignControlLine(line, [10, 0, 0]).centerline).toHaveLength(4)
    expect(line[0]).toEqual([0, 0, 0])
  })

  it('keeps Suzuka F1 at three sectors but gives domestic timing four', () => {
    const f1 = tracks.find((t) => t.id === 'suzuka-approx')!
    expect(f1.sectorMarks).toHaveLength(3)
    const domestic = superFormulaSuzukaTiming(f1)
    expect(domestic.sectorMarks).toHaveLength(4)
    expect(domestic.sectorMarksSource).toBe('derived')
    expect(domestic.sectorMarks![2]).toBeLessThan(domestic.sectorMarks![3])
  })

  it('shows single/double yellow and neutralisation in the fourth sector', () => {
    expect(sectorFlagStatesFor('yellow', 3, null, 4)).toEqual(['clear', 'clear', 'clear', 'yellow'])
    expect(sectorFlagStatesFor('clear', null, 3, 4)).toEqual(['clear', 'clear', 'clear', 'double-yellow'])
    expect(sectorFlagStatesFor('sc', null, null, 4)).toEqual(['sc', 'sc', 'sc', 'sc'])
  })
})
