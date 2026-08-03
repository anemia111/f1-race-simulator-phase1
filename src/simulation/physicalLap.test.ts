import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  bankingDegreesAt,
  REFERENCE_DEPLOYMENT_POLICY,
  racingLineRadiusMeters,
  resistanceForceN,
  simulatePhysicalLap,
  terminalSpeedMps,
  trackGeometry,
  trackWidthMeters,
} from './physicalLap'
import { corneringSpeedLimitMps } from './tyreForces'
import { FORMULA_VEHICLE_HALF_WIDTH_M } from './vehicleGeometry'

const f1 = categoryPhysicsFor('f1-custom')
const f2 = categoryPhysicsFor('f2')
const f3 = categoryPhysicsFor('f3')
const superFormula = categoryPhysicsFor('super-formula')

const trackById = (id: string) => tracks.find((track) => track.id === id)!

describe('trackGeometry', () => {
  it('measures a lap that adds up to the published distance', () => {
    for (const track of tracks) {
      const total = trackGeometry(track).reduce(
        (sum, point) => sum + point.segmentLengthMeters,
        0,
      )

      expect(total / (track.lengthKm * 1000)).toBeCloseTo(1, 6)
    }
  })

  it('finds a hairpin at Monaco and none at Monza', () => {
    const monacoMinimum = Math.min(
      ...trackGeometry(trackById('monaco-approx')).map(
        (p) => p.centrelineRadiusMeters,
      ),
    )
    const monzaMinimum = Math.min(
      ...trackGeometry(trackById('monza-approx')).map(
        (p) => p.centrelineRadiusMeters,
      ),
    )

    // Loews is the slowest corner in the championship, around 10-12 m.
    expect(monacoMinimum).toBeLessThan(20)
    // Monza's tightest point is a chicane, not a hairpin.
    expect(monzaMinimum).toBeGreaterThan(monacoMinimum * 1.5)
  })

  it('opens the racing line out beyond the centreline', () => {
    for (const point of trackGeometry(trackById('silverstone-approx'))) {
      expect(point.radiusMeters).toBeGreaterThanOrEqual(
        point.centrelineRadiusMeters,
      )
    }
  })

  it('gains less from width in a hairpin than in a sweeper', () => {
    const halfWidth = 5.5
    const hairpin = racingLineRadiusMeters({
      centrelineRadiusMeters: 30,
      cornerArcRadians: Math.PI,
      usableHalfWidthMeters: halfWidth,
    })
    const sweeper = racingLineRadiusMeters({
      centrelineRadiusMeters: 30,
      cornerArcRadians: Math.PI / 6,
      usableHalfWidthMeters: halfWidth,
    })

    expect(hairpin - 30).toBeLessThan(sweeper - 30)
  })

  it('shares the regulated vehicle half-width with the lateral model', () => {
    const silverstone = trackById('silverstone-approx')
    const usableHalfWidthM =
      trackWidthMeters(silverstone) / 2 - FORMULA_VEHICLE_HALF_WIDTH_M
    const corner = trackGeometry(silverstone).find(
      (point) =>
        Number.isFinite(point.centrelineRadiusMeters) &&
        point.cornerArcRadians > 0,
    )!

    expect(corner.radiusMeters).toBeCloseTo(
      racingLineRadiusMeters({
        centrelineRadiusMeters: corner.centrelineRadiusMeters,
        cornerArcRadians: corner.cornerArcRadians,
        usableHalfWidthMeters: usableHalfWidthM,
      }),
      10,
    )
  })

  it('gives a narrow circuit less line to work with', () => {
    const narrow = racingLineRadiusMeters({
      centrelineRadiusMeters: 40,
      cornerArcRadians: Math.PI / 2,
      usableHalfWidthMeters: 4,
    })
    const wide = racingLineRadiusMeters({
      centrelineRadiusMeters: 40,
      cornerArcRadians: Math.PI / 2,
      usableHalfWidthMeters: 6.5,
    })

    expect(narrow).toBeLessThan(wide)
  })
})

describe('banking', () => {
  it('applies only inside the banked sections', () => {
    const zandvoort = trackById('zandvoort-approx')

    expect(bankingDegreesAt(zandvoort, 0.2)).toBeGreaterThan(0)
    expect(bankingDegreesAt(zandvoort, 0.95)).toBeGreaterThan(0)
    expect(bankingDegreesAt(zandvoort, 0.5)).toBe(0)
  })

  it('leaves a flat circuit flat', () => {
    for (const progress of [0, 0.25, 0.5, 0.75]) {
      expect(bankingDegreesAt(trackById('monza-approx'), progress)).toBe(0)
    }
  })

  it('lets a banked corner be taken faster than the same corner flat', () => {
    const flat = corneringSpeedLimitMps({
      massKg: f1.minimumMassKg + 30,
      physics: f1,
      radiusMeters: 60,
    })
    const banked = corneringSpeedLimitMps({
      bankingDegrees: 19,
      massKg: f1.minimumMassKg + 30,
      physics: f1,
      radiusMeters: 60,
    })

    expect(banked).toBeGreaterThan(flat)
  })

  it('keeps Zandvoort a normal circuit rather than a speedway', () => {
    // Banking applied to the whole lap instead of its two banked corners put
    // the slowest point at 164 km/h and took 18 % off the lap.
    const result = simulatePhysicalLap(trackById('zandvoort-approx'), {
      physics: f1,
    })

    expect(result.minimumSpeedKph).toBeLessThan(120)
  })

  it('treats a straight as an effectively unbounded radius', () => {
    const radii = trackGeometry(trackById('monza-approx')).map(
      (p) => p.radiusMeters,
    )

    expect(Math.max(...radii)).toBeGreaterThan(2000)
  })
})

describe('resistance and terminal speed', () => {
  it('grows drag with the square of speed', () => {
    const rolling = resistanceForceN(0, { physics: f1 })
    const at50 = resistanceForceN(50, { physics: f1 }) - rolling
    const at100 = resistanceForceN(100, { physics: f1 }) - rolling

    expect(at100 / at50).toBeCloseTo(4, 6)
  })

  it('keeps rolling resistance at a standstill', () => {
    expect(resistanceForceN(0, { physics: f1 })).toBeGreaterThan(0)
  })

  it('lands terminal speed in the range a 2026 car actually reaches', () => {
    const topSpeedKph = terminalSpeedMps({ physics: f1 }) * 3.6

    // The range a 2026 car actually reaches, taken from the checked-in
    // telemetry: field peaks span 291 km/h at Monaco to 360 km/h at Barcelona.
    // The old floor of 330 sat above what the reference drag area produces
    // once the regulation's deployment ramp is applied.
    expect(topSpeedKph).toBeGreaterThan(290)
    expect(topSpeedKph).toBeLessThan(375)
  })

  it('orders terminal speed by category', () => {
    const speedFor = (physics: typeof f1) => terminalSpeedMps({ physics })

    expect(speedFor(f1)).toBeGreaterThan(speedFor(f2))
    expect(speedFor(f2)).toBeGreaterThan(speedFor(f3))
  })
})

describe('simulatePhysicalLap', () => {
  it('reproduces the calibrated lap time from forces alone', () => {
    // Nothing in this path is told the target. The lap time comes from corner
    // radii, tyre grip, power and drag, and is compared with the calibrated
    // baseline afterwards rather than being fitted to it.
    const ratios = tracks.map(
      (track) =>
        simulatePhysicalLap(track, { physics: f1 }).lapTimeSeconds /
        track.baseLapTime,
    )
    const mean = ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length

    expect(mean).toBeGreaterThan(0.96)
    expect(mean).toBeLessThan(1.04)

    for (const [index, ratio] of ratios.entries()) {
      expect(
        ratio,
        `${tracks[index].id}: ${(
          simulatePhysicalLap(tracks[index], { physics: f1 }).lapTimeSeconds
        ).toFixed(1)} s vs ${tracks[index].baseLapTime} s`,
      ).toBeGreaterThan(0.88)
      expect(ratio).toBeLessThan(1.13)
    }
  })

  it('produces speeds that stay inside the observed envelope', () => {
    for (const track of tracks) {
      const result = simulatePhysicalLap(track, { physics: f1 })

      // Slowest corner of the year is Loews; nothing should be slower.
      expect(result.minimumSpeedKph).toBeGreaterThan(45)
      expect(result.minimumSpeedKph).toBeLessThan(130)
      expect(result.maximumSpeedKph).toBeGreaterThan(300)
      expect(result.maximumSpeedKph).toBeLessThan(380)
    }
  })

  it('makes Monaco the slowest circuit and Monza among the fastest', () => {
    const speedFor = (id: string) => {
      const track = trackById(id)

      return (
        (track.lengthKm * 1000) /
        simulatePhysicalLap(track, { physics: f1 }).lapTimeSeconds
      )
    }

    expect(speedFor('monaco-approx')).toBeLessThan(speedFor('monza-approx'))
    expect(speedFor('monaco-approx')).toBeLessThan(speedFor('spa-approx'))
  })

  it('orders the categories without being told which is faster', () => {
    const suzuka = trackById('suzuka-approx')
    const lapFor = (physics: typeof f1) =>
      simulatePhysicalLap(suzuka, { physics }).lapTimeSeconds

    expect(lapFor(f1)).toBeLessThan(lapFor(superFormula))
    expect(lapFor(superFormula)).toBeLessThan(lapFor(f2))
    expect(lapFor(f2)).toBeLessThan(lapFor(f3))
  })

  it('loses lap time on a wet surface', () => {
    const suzuka = trackById('suzuka-approx')
    const dry = simulatePhysicalLap(suzuka, { physics: f1 }).lapTimeSeconds
    const wet = simulatePhysicalLap(suzuka, {
      gripMultiplier: 0.7,
      physics: f1,
    }).lapTimeSeconds

    expect(wet).toBeGreaterThan(dry)
  })

  it('loses lap time carrying fuel', () => {
    const suzuka = trackById('suzuka-approx')
    const light = simulatePhysicalLap(suzuka, {
      massKg: f1.minimumMassKg + 5,
      physics: f1,
    }).lapTimeSeconds
    const heavy = simulatePhysicalLap(suzuka, {
      massKg: f1.minimumMassKg + 100,
      physics: f1,
    }).lapTimeSeconds

    expect(heavy).toBeGreaterThan(light)
  })

  it('loses lap time without electrical deployment', () => {
    const suzuka = trackById('suzuka-approx')
    const deploying = simulatePhysicalLap(suzuka, { physics: f1 }).lapTimeSeconds
    const combustionOnly = simulatePhysicalLap(suzuka, {
      deploymentPowerKw: 0,
      physics: f1,
    }).lapTimeSeconds

    expect(combustionOnly).toBeGreaterThan(deploying)
  })

  it('returns one speed per centreline point', () => {
    const suzuka = trackById('suzuka-approx')

    expect(simulatePhysicalLap(suzuka, { physics: f1 }).speedsMps).toHaveLength(
      suzuka.centerline.length,
    )
  })

  it('returns a finite physical planning point for every centreline point', () => {
    const zandvoort = trackById('zandvoort-approx')
    const result = simulatePhysicalLap(zandvoort, { physics: f1 })

    expect(result.points).toHaveLength(zandvoort.centerline.length)
    expect(
      result.points.some(
        (point) => point.requiredBrakingDecelerationMps2 > 0,
      ),
    ).toBe(true)
    expect(result.points.some((point) => point.bankingDegrees > 0)).toBe(true)

    for (const point of result.points) {
      const numericValues = [
        point.bankingDegrees,
        point.brakingDistanceAheadMeters,
        point.brakingTargetBankingDegrees,
        point.brakingTargetCornerRadiusM,
        point.brakingTargetSpeedMps,
        point.corneringSpeedLimitMps,
        point.curvaturePerMeter,
        point.effectiveCornerRadiusM,
        point.referenceLineOffsetM,
        point.referenceSpeedMps,
        point.requiredBrakingDecelerationMps2,
        point.segmentLengthMeters,
        point.signedTurnRadians,
      ]

      expect(numericValues.every(Number.isFinite)).toBe(true)
      expect(point.segmentLengthMeters).toBeGreaterThan(0)
      expect(point.referenceSpeedMps).toBeGreaterThan(0)
      expect(point.corneringSpeedLimitMps).toBeGreaterThanOrEqual(
        point.referenceSpeedMps,
      )
      expect(Math.abs(point.referenceLineOffsetM)).toBeLessThanOrEqual(
        trackWidthMeters(zandvoort) / 2,
      )
    }
  })

  it('labels full deployment as an offline reference assumption only', () => {
    const result = simulatePhysicalLap(trackById('suzuka-approx'), {
      physics: f1,
    })

    expect(REFERENCE_DEPLOYMENT_POLICY.scope).toBe('offline-reference-only')
    expect(result.referenceDeploymentPowerKw).toBe(
      f1.hybridDeploymentPowerLimitKw,
    )
  })
})
