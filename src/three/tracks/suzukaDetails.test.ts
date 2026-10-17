import { describe, expect, it } from 'vitest'
import { buildSuzukaDetails } from './suzukaDetails'
import { suzukaCornerVisuals, suzukaVisualEvidence } from './suzukaVisualData'
import { realTrackLayouts } from '../../data/realTrackLayouts'
import { measuredRoadProfiles } from '../../data/measuredRoadProfiles'
import { barrierOffsetAt, cornerStations, cornerInsideSign, widthAt } from './suzukaSurface'

describe('Suzuka-only visual details', () => {
  it('uses distinct corner extents and identifies estimated dimensions', () => {
    expect(suzukaCornerVisuals.map(v => v.corner)).toEqual(Array.from({length:18}, (_,i)=>i+1))
    expect(new Set(suzukaCornerVisuals.flatMap(v => v.kerb ? [v.kerb.beforeM + v.kerb.afterM] : [])).size).toBeGreaterThan(8)
    expect(suzukaCornerVisuals.some(v => v.exitKerb)).toBe(true)
    expect(suzukaVisualEvidence.confidence).toContain('not surveyed')
  })
  it('produces bounded, upward-facing raised kerbs and runoff in four shared meshes', () => {
    const details = buildSuzukaDetails()
    let triangles = 0
    for (const geometry of Object.values(details)) {
      const positions = geometry.attributes.position
      expect(positions.count).toBeGreaterThan(0)
      for (let i = 0; i < positions.count; i++) expect(Number.isFinite(positions.getY(i))).toBe(true)
      triangles += geometry.index!.count / 3
      geometry.dispose()
    }
    expect(triangles).toBeLessThan(20000)
    for (const kerb of [details.kerbRed, details.kerbWhite]) {
      const normal = kerb.attributes.normal
      for(let i=0;i<normal.count;i++) expect(normal.getY(i)).toBeGreaterThan(.1)
    }
  })
  it('does not mutate original centerlines, corner anchors or road profiles', () => {
    const before = JSON.stringify([realTrackLayouts, measuredRoadProfiles])
    const details = buildSuzukaDetails()
    Object.values(details).forEach(g=>g.dispose())
    expect(JSON.stringify([realTrackLayouts, measuredRoadProfiles])).toBe(before)
  })
  it('keeps outside barriers beyond the new runoff instead of cutting across it', () => {
    for (const visual of suzukaCornerVisuals) {
      if (!visual.runoff) continue
      const station = cornerStations.find(c => c.number === visual.corner)!
      const p = station.progress + (visual.runoff.afterM - visual.runoff.beforeM) / 2 / 5807
      const side = -cornerInsideSign(station.progress)
      expect(barrierOffsetAt(p, false, side)).toBeGreaterThan(widthAt(p)/2 + 1.8 + visual.runoff.widthM)
    }
  })
})
