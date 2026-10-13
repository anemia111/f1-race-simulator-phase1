import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createTrackCurve, createPresentationTrackCurve, presentationPoint, poseOnTrack } from './trackGeometry'
import { tracks } from '../data/tracks'
import { seriesPackageById } from '../series/seriesRegistry'
import { createMotorsportConfig, motorsportChampionships, motorsportCourses } from '../motorsport/packages'
import { dashboardCourse } from '../motorsport/dashboardAdapter'

describe('track geometry poses', () => {
  it('aligns every available control-line tangent horizontally without changing distance or progress', () => {
    const native = [...tracks, ...seriesPackageById.get('super-formula')!.tracks]
    const expansion = motorsportChampionships.flatMap(series => motorsportCourses(series.id).map(course => dashboardCourse({ ...createMotorsportConfig(series.id), course })))
    for (const track of [...native, ...expansion]) {
      const source = JSON.stringify(track.centerline)
      const raw = createTrackCurve(track), display = createPresentationTrackCurve(track)
      const tangent = display.getTangentAt(0)
      expect(Math.abs(tangent.z), track.id).toBeLessThan(1e-7)
      expect(tangent.x, track.id).toBeGreaterThan(0.98)
      expect(display.getLength(), track.id).toBeCloseTo(raw.getLength(), 8)
      for (const progress of [0, ...track.sectorMarks, 0.5, 0.999]) {
        expect(display.getPointAt(progress).setY(0).distanceTo(display.getPointAt(0).setY(0)), track.id).toBeCloseTo(raw.getPointAt(progress).distanceTo(raw.getPointAt(0)), 8)
      }
      for (const point of track.centerline.filter((_,i)=>i%40===0)) {
        const transformed = new THREE.Vector3(...presentationPoint(track,point))
        expect(transformed.setY(0).distanceTo(display.points[track.centerline.indexOf(point)].clone().setY(0))).toBeLessThan(1e-10)
        expect(transformed.distanceTo(new THREE.Vector3(...presentationPoint(track,track.centerline[0])).setY(0))).toBeCloseTo(new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...track.centerline[0])),8)
      }
      expect(JSON.stringify(track.centerline)).toBe(source)
    }
  })
  it('preserves a unit normal while applying the requested lateral offset', () => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-10, 0, -5),
        new THREE.Vector3(10, 0, -5),
        new THREE.Vector3(10, 0, 5),
        new THREE.Vector3(-10, 0, 5),
      ],
      true,
    )
    const center = poseOnTrack(curve, 0.2, 0)
    const offset = poseOnTrack(curve, 0.2, 3.5)

    expect(offset.normal.length()).toBeCloseTo(1, 8)
    expect(offset.position.distanceTo(center.position)).toBeCloseTo(3.5, 6)
    expect(Math.abs(offset.normal.dot(offset.tangent))).toBeLessThan(1e-8)
  })
})
