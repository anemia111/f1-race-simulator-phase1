import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { TrackDefinition } from '../types'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  racingLineAt,
  referenceProfileLapTimeSeconds,
  trackDynamicsAt,
} from './trackDynamics'

const f1 = categoryPhysicsFor('f1-custom')
const superFormula = categoryPhysicsFor('super-formula')
const suzuka = tracks.find((track) => track.id === 'suzuka-approx')!

const sampledProfile = (
  track: TrackDefinition,
  physics: typeof f1,
) =>
  track.centerline.map((_, index) =>
    trackDynamicsAt(track, index / track.centerline.length, physics),
  )

describe('physical track-dynamics profile', () => {
  it('keeps category profiles separate when they share one track cache', () => {
    const firstF1 = sampledProfile(suzuka, f1)
    const superFormulaProfile = sampledProfile(suzuka, superFormula)
    const secondF1 = sampledProfile(suzuka, f1)

    expect(secondF1).toEqual(firstF1)
    expect(
      superFormulaProfile.some(
        (point, index) =>
          point.referenceSpeedKph !== firstF1[index].referenceSpeedKph,
      ),
    ).toBe(true)
  })

  it('orders representative reference laps from category physics alone', () => {
    const lapFor = (physics: typeof f1) =>
      referenceProfileLapTimeSeconds(suzuka, physics)

    expect(lapFor(f1)).toBeLessThan(lapFor(superFormula))
  })

  it('does not read baseLapTime when building speeds or lap time', () => {
    const changedBaseline: TrackDefinition = {
      ...suzuka,
      baseLapTime: suzuka.baseLapTime * 1.7,
    }
    const original = sampledProfile(suzuka, f1)
    const changed = sampledProfile(changedBaseline, f1)

    expect(changed).toEqual(original)
    expect(referenceProfileLapTimeSeconds(changedBaseline, f1)).toBeCloseTo(
      referenceProfileLapTimeSeconds(suzuka, f1),
      10,
    )
  })

  it('uses physical track width instead of render width for the line', () => {
    const changedRenderWidth: TrackDefinition = {
      ...suzuka,
      width: suzuka.width * 100,
    }
    const sharpestIndex = sampledProfile(suzuka, f1)
      .map((point, index) => ({ index, radius: point.effectiveCornerRadiusM }))
      .sort((left, right) => left.radius - right.radius)[0].index
    const progress = sharpestIndex / suzuka.centerline.length

    expect(racingLineAt(changedRenderWidth, progress, f1).offset).toBeCloseTo(
      racingLineAt(suzuka, progress, f1).offset,
      10,
    )
  })

  it('exposes finite physical planning fields at every point', () => {
    for (const point of sampledProfile(suzuka, f1)) {
      expect(
        [
          point.bankingDegrees,
          point.brakingDistanceAheadMeters,
          point.brakingTargetBankingDegrees,
          point.brakingTargetCornerRadiusM,
          point.brakingTargetSpeedKph,
          point.corneringSpeedLimitKph,
          point.effectiveCornerRadiusM,
          point.referenceLineOffsetM,
          point.referenceSpeedKph,
          point.requiredBrakingDecelerationMps2,
          point.segmentLengthMeters,
          point.signedCurvaturePerMeter,
          point.signedTurnRadians,
        ].every(Number.isFinite),
      ).toBe(true)
      expect(point.referenceSpeedKph).toBeGreaterThan(0)
      expect(point.corneringSpeedLimitKph).toBeGreaterThanOrEqual(
        point.referenceSpeedKph,
      )
      expect(point.brakingDistanceAheadMeters).toBeGreaterThanOrEqual(0)
    }
  })
})
