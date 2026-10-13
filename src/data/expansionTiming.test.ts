import { describe, expect, it } from 'vitest'
import { createMotorsportConfig, motorsportCourses } from '../motorsport/packages'
import { dashboardCourse } from '../motorsport/dashboardAdapter'
import { expansionCourseTiming } from './expansionTiming'
import { tracks } from './tracks'
import indyTiming from './indyTimingReferences2026.json'
import { sectorPresentationSpans } from '../three/sectorPresentation'
import layouts from './expansionCourseLayouts.json'

describe('extra-category official timing registration', () => {
  it('audits all 30 distinct tracks and never substitutes equal thirds for missing timing', () => {
    const courses = new Map(['kyojo', 'super-gt', 'wec', 'indycar'].flatMap(id =>
      motorsportCourses(id as 'kyojo').map(course => [course.id, course] as const)))
    expect(courses.size).toBe(30)
    const missing: string[] = []
    for (const course of courses.values()) {
      const data = expansionCourseTiming(course.id, course.points)
      if (!data.sectorMarks.length) {
        missing.push(course.id)
        expect(data.sectorTimingUnavailableReason).toBeTruthy()
      } else {
        expect(data.sectorBoundaryReference?.sourceUrl).toMatch(/^https:\/\//)
        expect(data.sectorMarks[0]).toBeCloseTo(0, 8)
        expect(sectorPresentationSpans(data.sectorMarks).reduce((sum, item) => sum + item.span, 0)).toBeCloseTo(1, 10)
      }
    }
    expect(missing.sort()).toEqual(['barcelona', 'monza'])
  })
  it('uses the published Fuji control-line distances for KYOJO, GT and WEC', () => {
    for (const id of ['kyojo', 'super-gt', 'wec'] as const) {
      const course = motorsportCourses(id).find(course => course.id === 'fuji')!
      expect(expansionCourseTiming(course.id, course.points).sectorMarks).toEqual([0, 1305 / 4563, 2828 / 4563])
    }
  })
  it('retains domestic four-section layouts and leaves the F1 Suzuka pack unchanged', () => {
    const f1 = tracks.find(track => track.id === 'suzuka-approx')!
    const before = structuredClone(f1)
    for (const id of ['suzuka', 'sugo', 'motegi']) {
      const course = motorsportCourses('super-gt').find(course => course.id === id)!
      expect(expansionCourseTiming(id, course.points).sectorMarks).toHaveLength(4)
    }
    expect(f1).toEqual(before)
    expect(f1.sectorMarks).toHaveLength(3)
  })
  it('covers all 17 Indy tracks with official reports and five named oval loop spans', () => {
    expect(indyTiming.references).toHaveLength(17)
    for (const course of motorsportCourses('indycar')) {
      const timing = expansionCourseTiming(course.id, course.points)
      const oval = course.kind === 'speedway' || course.kind === 'short-oval'
      expect(timing.sectorMarks).toHaveLength(oval ? 5 : 3)
      expect(timing.sectorLabels).toHaveLength(oval ? 5 : 3)
      expect(timing.sectorBoundaryReference?.sourceUrl).toContain('indycar-topsectiontimes-race.pdf')
    }
  })
  it('preserves race distances while matching the F1/SF 48-unit display span', () => {
    for (const id of ['kyojo', 'super-gt', 'wec', 'indycar'] as const) {
      const config = createMotorsportConfig(id), before = structuredClone(config)
      const track = dashboardCourse(config)
      const x = track.centerline.map(point => point[0]), z = track.centerline.map(point => point[2])
      expect(Math.max(Math.max(...x) - Math.min(...x), Math.max(...z) - Math.min(...z))).toBeCloseTo(48, 8)
      expect(track.lengthKm * 1000).toBeCloseTo(config.course.lengthM, 8)
      expect(config).toEqual(before)
    }
  })
  it('runs every oval counterclockwise in the east/north source frame', () => {
    const ovals = motorsportCourses('indycar').filter(course => course.kind === 'speedway' || course.kind === 'short-oval')
    expect(ovals).toHaveLength(5)
    for (const course of ovals) {
      const signedArea = course.points.reduce((area, a, index) => {
        const b = course.points[(index + 1) % course.points.length]
        return area + a[0] * b[1] - b[0] * a[1]
      }, 0)
      expect(signedArea, course.id).toBeGreaterThan(0)
    }
  })
  it('registers the origin of older saves without changing their geometry or state', () => {
    const points = layouts.layouts.find(layout => layout.id === 'imola')!.centerlineMeters as Array<[number, number]>
    const before = structuredClone(points)
    const timing = expansionCourseTiming('imola', points)
    expect(timing.sectorMarks[0]).toBeGreaterThan(.1)
    expect(sectorPresentationSpans(timing.sectorMarks).reduce((sum, section) => sum + section.span, 0)).toBeCloseTo(1, 10)
    expect(points).toEqual(before)
    const legacyReversed = layouts.layouts.find(layout => layout.id === 'indianapolis-500')!.centerlineMeters as Array<[number, number]>
    expect(expansionCourseTiming('indianapolis-500', legacyReversed).sectorMarks).toEqual([])
    expect(expansionCourseTiming('indianapolis-500', legacyReversed).sectorTimingUnavailableReason).toContain('旧コース')
  })
})
