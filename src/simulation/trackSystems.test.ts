import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import { activeAeroModeFor, overtakeStatusFor } from './activeAero'
import { createInitialRace } from './race'
import {
  lineDeviationPenaltySeconds,
  racingLineAt,
  trackDynamicsAt,
} from './trackDynamics'
import {
  advanceTrackWater,
  createTrackWaterState,
  gripForSurfaceWater,
} from './trackWater'

describe('track-dependent systems', () => {
  it('disables Overtake in low grip while retaining partial active aero', () => {
    const track = tracks[0]
    const snapshot = createInitialRace({
      drivers: initialDrivers,
      seed: 'aero-test',
      teams: initialTeams,
      track,
    })
    const zone = track.aeroActivationZones![0]
    const car = {
      ...snapshot.cars[1],
      gapToAhead: 0.6,
      progress: zone.start,
      status: 'running' as const,
    }

    expect(
      activeAeroModeFor({
        car,
        phase: null,
        track,
        trackGrip: 0.8,
        weather: 'light-rain',
      }),
    ).toBe(zone.lowGripMode === 'partial' ? 'partial-straight' : 'corner')
    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car,
        phase: null,
        raceLap: 4,
        track,
        trackGrip: 0.8,
      }),
    ).toBe('disabled')
  })

  it('accumulates standing water, then drains and restores grip', () => {
    const track = tracks[0]
    const cars = createInitialRace({
      drivers: initialDrivers,
      seed: 'water-test',
      teams: initialTeams,
      track,
    }).cars
    const wet = advanceTrackWater({
      cars,
      deltaSeconds: 300,
      previous: createTrackWaterState(),
      rainIntensityMmH: 18,
      track,
    })
    const drying = advanceTrackWater({
      cars,
      deltaSeconds: 600,
      previous: wet,
      rainIntensityMmH: 0,
      track,
    })

    expect(wet.surfaceWaterMmBySector[0]).toBeGreaterThan(0)
    expect(drying.surfaceWaterMmBySector[0]).toBeLessThan(
      wet.surfaceWaterMmBySector[0],
    )
    expect(
      gripForSurfaceWater(1, drying.surfaceWaterMmBySector[0], 1),
    ).toBeGreaterThan(
      gripForSurfaceWater(1, wet.surfaceWaterMmBySector[0], 0),
    )
  })

  it('requires remaining per-lap electrical energy for Overtake', () => {
    const track = tracks[0]
    const line = track.overtakeControlLines![0]
    const car = {
      ...createInitialRace({
        drivers: initialDrivers,
        seed: 'overtake-energy',
        teams: initialTeams,
        track,
      }).cars[1],
      gapToAhead: 0.4,
      progress: line.activationProgress,
      status: 'running' as const,
    }

    expect(
      overtakeStatusFor({
        batteryPercent: 80,
        car,
        overtakeEnergyRemainingMj: 0,
        phase: null,
        raceLap: 4,
        track,
        trackGrip: 1,
      }),
    ).toBe('disabled')
  })

  it('uses one ideal racing line and charges an exit cost for battle offsets', () => {
    const track = tracks[0]
    const sharpest = Array.from(
      { length: track.centerline.length },
      (_, index) => index / track.centerline.length,
    ).sort(
      (left, right) =>
        trackDynamicsAt(track, right).curvature -
        trackDynamicsAt(track, left).curvature,
    )[0]
    const line = racingLineAt(track, sharpest)

    expect(Math.abs(line.offset)).toBeGreaterThan(0)
    expect(
      lineDeviationPenaltySeconds(
        track,
        sharpest,
        track.width * 0.25,
        'side-by-side',
      ),
    ).toBeGreaterThan(0)
    expect(
      lineDeviationPenaltySeconds(track, sharpest, 0, 'single-file'),
    ).toBe(0)
  })
})
