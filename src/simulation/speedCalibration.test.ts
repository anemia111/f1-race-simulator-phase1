import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot, TrackDefinition } from '../types'
import { calculateCarTelemetry } from './telemetry'
import { progressForProfileSpeed, trackDynamicsAt } from './trackDynamics'
import { createInitialRace } from './race'

function runSpeedTrace(
  track: TrackDefinition,
  options: {
    fuelLoadKg?: number
    gapToAheadSeconds?: number
    headwindMps?: number
    sessionType?: 'race-distance' | 'limited-time'
    setup?: CarSetup
    teamId?: string
  } = {},
) {
  const driver = initialDrivers.find(
    (candidate) => candidate.teamId === (options.teamId ?? 'mercedes'),
  )!
  const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
  const snapshot = createInitialRace({
    drivers: [driver],
    seed: `speed-calibration:${track.id}`,
    teams: [team],
    track,
  })
  let car: CarSnapshot = {
    ...snapshot.cars[0],
    fuelLoadKg: options.fuelLoadKg ?? snapshot.cars[0].fuelLoadKg,
    gapToAhead: options.gapToAheadSeconds ?? 10,
    position: 1,
    progress: 0,
    speedKph: 80,
    status: 'running',
    timedRunPhase: null,
    totalDistance: 1,
  }
  let maximumSpeedKph = car.speedKph
  let maximumReferenceSpeedKph = 0
  let maximumErsPowerKw = 0
  let fullThrottleSamples = 0
  let straightAeroSamples = 0
  let fullThrottleErsTotalKw = 0
  const deltaSeconds = 0.1
  const profile = track.centerline.map((_, index) =>
    trackDynamicsAt(track, index / track.centerline.length),
  )
  const sortedReferenceSpeeds = profile
    .map((point) => point.referenceSpeedKph)
    .sort((left, right) => left - right)

  for (let step = 0; step < 1_200; step += 1) {
    const dynamics = trackDynamicsAt(track, car.progress)
    const telemetry = calculateCarTelemetry({
      car,
      deltaSeconds,
      driver,
      elapsedSeconds: step * deltaSeconds,
      lowGripConditions: false,
      phase: null,
      raceLap: Math.max(1, Math.floor(car.totalDistance)),
      sessionType: options.sessionType,
      setup: options.setup,
      headwindMps: options.headwindMps,
      team,
      track,
      trackGrip: 1,
      weather: 'clear',
    })
    const progressDelta = progressForProfileSpeed(
      track,
      car.progress,
      telemetry.speedKph,
      deltaSeconds,
    )

    maximumSpeedKph = Math.max(maximumSpeedKph, telemetry.speedKph)
    maximumErsPowerKw = Math.max(maximumErsPowerKw, telemetry.ersPowerKw)
    maximumReferenceSpeedKph = Math.max(
      maximumReferenceSpeedKph,
      dynamics.referenceSpeedKph,
    )
    if (dynamics.fullThrottle) {
      fullThrottleSamples += 1
      fullThrottleErsTotalKw += telemetry.ersPowerKw
    }
    straightAeroSamples += telemetry.activeAeroMode === 'straight' ? 1 : 0
    car = {
      ...car,
      ...telemetry,
      progress: (car.progress + progressDelta) % 1,
      totalDistance: car.totalDistance + progressDelta,
    }
  }

  return {
    averageFullThrottleErsPowerKw:
      fullThrottleSamples > 0 ? fullThrottleErsTotalKw / fullThrottleSamples : 0,
    maximumCurvature: Math.max(...profile.map((point) => point.curvature)),
    fullThrottleShare: fullThrottleSamples / 1_200,
    maximumReferenceSpeedKph,
    maximumErsPowerKw,
    maximumStraightLengthMeters: Math.max(
      ...profile.map((point) => point.straightLengthAheadMeters),
    ),
    medianReferenceSpeedKph:
      sortedReferenceSpeeds[Math.floor(sortedReferenceSpeeds.length / 2)],
    minimumReferenceSpeedKph: sortedReferenceSpeeds[0],
    maximumSpeedKph,
    straightAeroShare: straightAeroSamples / 1_200,
  }
}

describe('on-track speed calibration', () => {
  it('keeps representative dry-running tracks above the old 260 km/h ceiling', () => {
    const albertPark = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'albert-park-approx')!,
    )
    const monza = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
    )
    const lasVegas = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
    )

    expect(albertPark.maximumSpeedKph).toBeGreaterThanOrEqual(295)
    expect(albertPark.maximumSpeedKph).toBeLessThanOrEqual(325)
    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(330)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(360)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(360)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(390)
  })

  it('only approaches the 420 km/h class in a favorable low-drag tow', () => {
    const lowDragSetup: CarSetup = {
      brakeBiasPercent: 56.5,
      coolingPercent: 38,
      differentialPercent: 58,
      frontWing: 2,
      rearWing: 2,
      rideHeightMm: 24,
    }
    const result = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
      {
        fuelLoadKg: 8,
        gapToAheadSeconds: 0.16,
        headwindMps: -5,
        sessionType: 'limited-time',
        setup: lowDragSetup,
        teamId: 'ferrari',
      },
    )

    expect(result.maximumSpeedKph).toBeGreaterThanOrEqual(395)
    expect(result.maximumSpeedKph).toBeLessThanOrEqual(430)
  })
})
