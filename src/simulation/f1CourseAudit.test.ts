import { describe, expect, it } from 'vitest'
import { f1CourseAuditFingerprint } from '../../scripts/f1-course-audit-fingerprint.mjs'
import report from '../../docs/validation/f1-course-times.json'
import { freeModeTrackOptions } from '../freeMode/freeModeRegistry'
import { seriesPackageById } from '../series/seriesRegistry'

describe('persisted F1 actual-lap audit', () => {
  it('belongs to the current production inputs and covers all selectable layouts', async () => {
    expect(report.sourceFingerprint).toBe(await f1CourseAuditFingerprint('.'))
    const ids = freeModeTrackOptions(seriesPackageById).map(course => course.id).sort()
    expect(report.rows.map(row => row.id).sort()).toEqual(ids)
    expect(report.summary.layouts).toBe(49)
    expect(report.summary.targetedLayouts).toBe(30)
    expect(report.summary.unavailableLayouts).toBe(19)
  })

  it('records completed laps on calibration and independent seeds without bounded fits', () => {
    expect(report.calibrationSeed).toBe(0)
    expect(report.independentSeeds).toEqual([1, 2])
    for (const row of report.rows) {
      expect(row.bounded, row.id).toBe(false)
      expect(row.seeds.map(seed => seed.seed), row.id).toEqual([0, 1, 2])
      for (const seed of row.seeds) {
        expect(seed.validLaps, row.id).toBeGreaterThanOrEqual(1)
        expect(seed.seconds, row.id).toBeGreaterThan(15)
        expect(seed.seconds, row.id).toBeLessThan(300)
        if (row.targetSeconds !== null) {
          expect(Math.abs(seed.seconds - row.targetSeconds), `${row.id}, seed ${seed.seed}`).toBeLessThan(3)
        }
      }
      if (row.targetSeconds === null) expect(row.referenceStatus).toBe('unavailable')
    }
  })
})
