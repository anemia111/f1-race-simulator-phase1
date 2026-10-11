import { describe, expect, it } from 'vitest'
import { freeModeTrackOptions } from '../freeMode/freeModeRegistry'
import { seriesPackageById } from '../series/seriesRegistry'
import { tracks } from '../data/tracks'
import { categoryPhysicsFor } from './categoryPhysics'
import { f1CourseCalibrationFor, f1PhysicsForTrack } from './f1CourseCalibration'
import { simulatePhysicalLap } from './physicalLap'

describe('F1 all-course contact calibration', () => {
  const courses = freeModeTrackOptions(seriesPackageById)
  it('covers every selectable layout, including all four foreign SF circuits', () => {
    expect(courses).toHaveLength(49)
    for (const course of courses) {
      const result = f1CourseCalibrationFor(course.physicalTrack)
      expect(result.referenceSeconds).toBeGreaterThan(15)
      expect(result.referenceSeconds).toBeLessThan(300)
      expect(result.physics.peakTyreFrictionCoefficient).toBeGreaterThanOrEqual(0.8)
      expect(result.physics.peakTyreFrictionCoefficient).toBeLessThanOrEqual(2.5)
      expect(f1PhysicsForTrack(course.physicalTrack)).toBe(result.physics)
    }
    for (const id of ['fuji-sf', 'motegi-sf', 'sugo-sf', 'autopolis-sf']) {
      const track = courses.find(course => course.id === id)!.physicalTrack
      expect(f1CourseCalibrationFor(track).referenceStatus).toBe('estimated')
      expect(f1CourseCalibrationFor(track).kind).toBe('sim-effective-contact-calibration')
    }
  })
  it('uses the same official Monza reference for both geometries and labels historical estimates', () => {
    const monza = courses.find(course => course.id === 'monza')!.physicalTrack
    expect(f1CourseCalibrationFor(monza).targetSeconds).toBe(81.846)
    for (const id of ['bahrain-approx', 'jeddah-approx', 'imola']) {
      expect(f1CourseCalibrationFor(courses.find(course => course.id === id)!.physicalTrack).referenceStatus).toBe('estimated')
    }
    const okayama = courses.find(course => course.id === 'okayama')!.physicalTrack
    expect(f1CourseCalibrationFor(okayama).targetSeconds).toBeNull()
    expect(f1PhysicsForTrack(okayama)).toBe(categoryPhysicsFor('f1-custom'))
  })
  it('changes only effective contact and retains fuel, weather, altitude and engine forces', () => {
    const track = tracks.find(track => track.id === 'suzuka-approx')!
    const base = categoryPhysicsFor('f1-custom')
    const physics = f1PhysicsForTrack(track)
    expect({...physics,peakTyreFrictionCoefficient:base.peakTyreFrictionCoefficient}).toEqual(base)
    const dry = simulatePhysicalLap(track,{physics,airTemperatureC:25}).lapTimeSeconds
    expect(simulatePhysicalLap(track,{physics,massKg:848,airTemperatureC:25}).lapTimeSeconds).toBeGreaterThan(dry)
    expect(simulatePhysicalLap(track,{physics,gripMultiplier:.7,airTemperatureC:25}).lapTimeSeconds).toBeGreaterThan(dry)
    expect(simulatePhysicalLap(track,{physics,deploymentPowerKw:0,airTemperatureC:25}).lapTimeSeconds).toBeGreaterThan(dry)
    expect(f1CourseCalibrationFor({...track,baseLapTime:track.baseLapTime*2}).physics).toEqual(physics)
    expect(base.peakTyreFrictionCoefficient).toBe(1.75)
    expect(categoryPhysicsFor('super-formula').peakTyreFrictionCoefficient).toBe(1.68)
  })
})
