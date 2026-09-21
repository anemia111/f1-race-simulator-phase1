import { describe, expect, it } from 'vitest'
import { projectPointToArcProgress, sectorBoundaryReferences } from './sectorBoundaries'
import { tracks } from './tracks'

describe('source-backed sector boundaries', () => {
  it('covers every F1 course without mini-sector thirds', () => {
    expect(Object.keys(sectorBoundaryReferences).sort()).toEqual(tracks.map((t) => t.id).sort())
    for (const track of tracks) {
      const source = sectorBoundaryReferences[track.id]
      expect(source.sourceUrl).toMatch(/^https:\/\/www\.fia\.com\//)
      expect(track.sectorMarks[0]).toBe(0)
      expect(track.sectorMarks[1]).toBeGreaterThan(0)
      expect(track.sectorMarks[2]).toBeGreaterThan(track.sectorMarks[1])
      expect(track.sectorMarks[2]).toBeLessThan(1)
      if (source.sectorLengthsKm) {
        expect(source.sectorLengthsKm.reduce((a, b) => a + b, 0)).toBeCloseTo(source.lengthKm, 5)
        expect(track.sectorMarksSource).toBe('official')
      } else {
        expect(track.sectorMarksSource).toBe('derived')
        expect(source.year).toBe(2025)
      }
    }
  })

  it('reads the Dutch table in visual row order and the issued Madrid length', () => {
    expect(sectorBoundaryReferences['zandvoort-approx'].sectorLengthsKm).toEqual([1.483, 1.452, 1.324])
    expect(sectorBoundaryReferences['madrid-approx'].lengthKm).toBe(5.414)
    expect(tracks.find((t) => t.id === 'madrid-approx')!.sectorMarks).toEqual([0, 0.339675, 0.718138])
  })

  it('projects an anchor by road distance, not vertex index, including the closing edge', () => {
    const layout: [number, number, number][] = [[0, 0, 0], [9, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]]
    expect(projectPointToArcProgress(layout, [9, 0, 0])).toBeCloseTo(9 / 40)
    expect(projectPointToArcProgress(layout, [0, 0, 5])).toBeCloseTo(35 / 40)
  })
})
