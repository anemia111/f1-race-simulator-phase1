import { describe, expect, it } from 'vitest'
import { courseAssetsFor, coursePreviewPoints, expansionMachineSpecifications,
  machineAssetsFor, machineSpecificationSources, quantityInSI } from './expansionAssets'
import { expansionCatalog } from './expansionCatalog'
import layouts from '../data/expansionCourseLayouts.json'
import snapshot from '../data/geodata/expansionCoursesOSM.json'

describe('2026 machine and physical course assets', () => {
  it('covers every SUPER GT model without merging similarly named cars or old engine generations', () => {
    for (const category of ['super-gt-gt500', 'super-gt-gt300']) {
      const assets = machineAssetsFor(category)
      expect(assets).toHaveLength(category.endsWith('gt500') ? 3 : 15)
      for (const asset of assets) {
        expect(asset).not.toHaveProperty('specificationUnavailable')
        if (!('specificationUnavailable' in asset)) expect(asset.gears.value).toBeNull()
      }
    }
    const supra500 = expansionMachineSpecifications.find((m) => m.name === 'TOYOTA GR Supra GT500')!
    const supra300 = expansionMachineSpecifications.find((m) => m.name === 'TOYOTA GR Supra')!
    expect(supra500.engine).toBe('RI4BG')
    expect(supra300.engine).toBe('2UR-G')
    expect(supra500.mass.value).toBe(1020)
    expect(supra300.mass.value).toBe(1250)
    expect(expansionMachineSpecifications.find((m) => m.name === 'SUBARU BRZ GT300')!.engine).toBe('EG33')
    expect(expansionMachineSpecifications.find((m) => m.name === 'Mercedes AMG GT3')!.height.value).toBeNull()
    expect(expansionMachineSpecifications.find((m) => m.name === 'BMW M4 GT3 EVO')!.power.value).toBeNull()
  })

  it('preserves PS/bhp, lower bounds, ranges and mass basis when converting units', () => {
    const kyojo = expansionMachineSpecifications.find((m) => m.name === 'KC-MG01')!
    expect(quantityInSI(kyojo.power).value).toBeCloseTo(131.243, 3)
    expect(quantityInSI(kyojo.wheelbase).value).toBeCloseTo(2.753, 6)
    expect(kyojo.mass.relation).toBe('manufacturer-vehicle-weight')
    const gt = expansionMachineSpecifications.find((m) => m.name === 'TOYOTA GR Supra GT500')!
    expect(quantityInSI(gt.power).value).toBeCloseTo(404.524, 3)
    expect(quantityInSI(gt.power).relation).toBe('lower-bound')
    const indy = expansionMachineSpecifications.find((m) => m.engineSupplier === 'Honda' && m.configuration === 'road-street')!
    expect(quantityInSI(indy.power).upper).toBeCloseTo(521.99, 2)
    expect(quantityInSI(indy.mass).value).toBeCloseTo(809.662, 3)
    expect(indy.massSourceId).toBe('indy-rulebook-2026-0528')
    expect(indy.driverEquivalencyPounds).toBe(185)
    expect(expansionMachineSpecifications.filter((m) => m.engineSupplier === 'Chevrolet')).toHaveLength(3)
    for (const variant of expansionMachineSpecifications.filter((m) => m.engineSupplier === 'Chevrolet')) {
      expect(variant.power.value).toBeNull()
    }
  })

  it('keeps manufacturer BoP references distinct from additional hybrid power', () => {
    const toyota = expansionMachineSpecifications.find((m) => m.name === 'Toyota TR010 Hybrid')!
    expect(toyota.power.value).toBe(520)
    expect(toyota.mass.value).toBe(1040)
    expect(toyota.power.relation).toBe('manufacturer-reference-subject-to-bop')
    for (const machine of expansionMachineSpecifications) {
      expect(machineSpecificationSources.has(machine.sourceId)).toBe(true)
      if (machine.massSourceId) expect(machineSpecificationSources.has(machine.massSourceId)).toBe(true)
    }
  })

  it('uses connected surveyed loops and checks measured lengths without forcing them to match', () => {
    expect(layouts.layouts).toHaveLength(20)
    const sourceWays = snapshot.ways as Record<string, { points: number[][] }>
    for (const course of snapshot.courses) {
      let first = -1, tail = -1
      for (const part of course.chain) {
        const raw = sourceWays[String(part.wayId)].points
        const points = part.reverse ? raw.toReversed() : raw
        if (tail !== -1) expect(points[0][0], `${course.id}: disconnected way`).toBe(tail)
        else first = points[0][0]
        tail = points.at(-1)![0]
      }
      expect(tail, `${course.id}: unclosed loop`).toBe(first)
    }
    for (const course of layouts.layouts) {
      expect(course.lengthDeviation).toBeLessThanOrEqual(0.04)
      expect(course.simulationReady).toBe(false)
      expect(course.pitLane).toBeNull()
      expect(course.controlLine).toBeNull()
      expect(course.banking).toBeNull()
      expect(course.centerlineMeters.length).toBeGreaterThan(30)
      expect(course.centerlineMeters.flat().every(Number.isFinite)).toBe(true)
    }
    const lemans = layouts.layouts.find((course) => course.id === 'le-mans')!
    expect(lemans.publishedLengthMeters).toBe(13626)
    expect(lemans.measuredLengthMeters).not.toBe(13626)
  })

  it('resolves every scheduled course and keeps IMS variants and Milwaukee event identities distinct', () => {
    const assets = new Map(expansionCatalog.categories.flatMap((category) =>
      courseAssetsFor(category.id).map((course) => [course.id, course] as const)))
    expect(assets.size).toBe(30)
    expect([...assets.values()].filter((asset) => asset.geometryStatus === 'existing-pack')).toHaveLength(10)
    expect([...assets.values()].filter((asset) => asset.geometryStatus === 'unavailable')).toHaveLength(0)
    expect([...assets.values()].filter((asset) => asset.geometryStatus === 'official-map-trace').map(asset => asset.id))
      .toEqual(['arlington', 'detroit', 'washington-dc'])
    const indy = courseAssetsFor('indycar')
    expect(indy).toHaveLength(17)
    expect(indy.filter((course) => course.id === 'milwaukee')).toHaveLength(1)
    expect(assets.get('indianapolis')!.centerline).not.toEqual(assets.get('indianapolis-500')!.centerline)
    for (const asset of assets.values()) {
      const points = coursePreviewPoints(asset)
      if (!asset.centerline.length) expect(points).toBe('')
      else for (const coordinate of points.split(/[ ,]/).map(Number)) {
        expect(coordinate).toBeGreaterThanOrEqual(9.999)
        expect(coordinate).toBeLessThanOrEqual(190.001)
      }
    }
  })
})
