import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot, TrackDefinition } from '../types'
import { calculateCarTelemetry } from './telemetry'
import { progressForProfileSpeed, trackDynamicsAt } from './trackDynamics'
import { advanceRace, createInitialRace } from './race'
import { baselineSetupForTrack, idealSetupForTrack } from './engineering'

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

function runIntegratedRaceSpeedTrace(
  track: TrackDefinition,
  fullField = false,
) {
  const driver = initialDrivers.find((candidate) => candidate.teamId === 'ferrari')!
  const team = initialTeams.find((candidate) => candidate.id === driver.teamId)!
  const config = {
    drivers: fullField ? initialDrivers : [driver],
    seed: `integrated-speed:${track.id}:${fullField ? 'field' : 'solo'}`,
    teams: fullField ? initialTeams : [team],
    track: { ...track, rainProbability: 0 },
  }
  let snapshot = createInitialRace(config)
  const formationSeconds =
    snapshot.formationLapDurationSeconds * snapshot.formationLapsPlanned

  snapshot = advanceRace(snapshot, formationSeconds, config)
  snapshot = advanceRace(snapshot, 8, config)
  snapshot = advanceRace(snapshot, 5, config)

  let maximumSpeedKph = 0
  let minimumBatteryPercent = 100

  for (let step = 0; step < 480; step += 1) {
    snapshot = advanceRace(snapshot, 0.25, config)
    maximumSpeedKph = Math.max(
      maximumSpeedKph,
      ...snapshot.cars.map((car) => car.speedKph),
    )
    minimumBatteryPercent = Math.min(
      minimumBatteryPercent,
      ...snapshot.cars.map((car) => car.ersBatteryPercent),
    )
  }

  return { maximumSpeedKph, minimumBatteryPercent, snapshot }
}

describe('on-track speed calibration', () => {
  it('smooths resampled layout noise without removing genuine slow corners', () => {
    const profileFor = (trackId: string) => {
      const track = tracks.find((candidate) => candidate.id === trackId)!

      return track.centerline
        .map((_, index) =>
          trackDynamicsAt(track, index / track.centerline.length),
        )
        .map((point) => point.referenceSpeedKph)
        .sort((left, right) => left - right)
    }
    const cota = profileFor('cota-approx')
    const bahrain = profileFor('bahrain-approx')
    const monaco = profileFor('monaco-approx')

    expect(cota[0]).toBeGreaterThanOrEqual(80)
    expect(bahrain[0]).toBeGreaterThanOrEqual(80)
    expect(monaco[0]).toBeGreaterThanOrEqual(65)
    expect(monaco[0]).toBeLessThan(80)
    expect(monaco[Math.floor(monaco.length / 2)]).toBeGreaterThan(190)
  })

  it('brakes through high-speed corners without snapping to a lower speed', () => {
    const candidate = tracks
      .flatMap((track) =>
        track.centerline.map((_, index) => ({
          dynamics: trackDynamicsAt(track, index / track.centerline.length),
          progress: index / track.centerline.length,
          track,
        })),
      )
      .filter(
        ({ dynamics }) =>
          dynamics.cornerClass === 'high' &&
          !dynamics.fullThrottle &&
          dynamics.brakingSeverity > 0.08,
      )
      .sort(
        (left, right) =>
          right.dynamics.brakingSeverity - left.dynamics.brakingSeverity,
      )[0]

    expect(candidate).toBeDefined()

    const driver = initialDrivers[0]
    const team = initialTeams.find(({ id }) => id === driver.teamId)!
    const snapshot = createInitialRace({
      drivers: [driver],
      seed: 'high-speed-corner-transition',
      teams: [team],
      track: candidate.track,
    })
    const entrySpeedKph = Math.min(
      390,
      Math.max(300, candidate.dynamics.referenceSpeedKph + 65),
    )
    const car = {
      ...snapshot.cars[0],
      gapToAhead: 10,
      progress: candidate.progress,
      speedKph: entrySpeedKph,
      status: 'running' as const,
      totalDistance: 1 + candidate.progress,
    }
    const telemetry = calculateCarTelemetry({
      car,
      deltaSeconds: 0.1,
      driver,
      elapsedSeconds: 30,
      lowGripConditions: false,
      phase: null,
      raceLap: 2,
      team,
      track: candidate.track,
      trackGrip: 1,
      weather: 'clear',
    })

    expect(entrySpeedKph - telemetry.speedKph).toBeLessThanOrEqual(8)
    expect(telemetry.speedKph).toBeGreaterThanOrEqual(235)
  })

  it('keeps full throttle on a straight until the modeled braking zone', () => {
    const lasVegas = tracks.find(
      (candidate) => candidate.id === 'las-vegas-approx',
    )!
    const candidate = lasVegas.centerline
      .map((_, index) => ({
        dynamics: trackDynamicsAt(lasVegas, index / lasVegas.centerline.length),
        progress: index / lasVegas.centerline.length,
      }))
      .filter(
        ({ dynamics }) =>
          dynamics.fullThrottle &&
          dynamics.referenceSpeedKph >= 360 &&
          dynamics.brakingSeverity > 0.02,
      )
      .sort(
        (left, right) =>
          right.dynamics.brakingSeverity - left.dynamics.brakingSeverity,
      )[0]

    expect(candidate).toBeDefined()

    const driver = initialDrivers.find(
      (candidateDriver) => candidateDriver.teamId === 'ferrari',
    )!
    const team = initialTeams.find(({ id }) => id === driver.teamId)!
    const snapshot = createInitialRace({
      drivers: [driver],
      seed: 'straight-throttle-commitment',
      teams: [team],
      track: lasVegas,
    })
    const telemetry = calculateCarTelemetry({
      car: {
        ...snapshot.cars[0],
        gapToAhead: 10,
        progress: candidate.progress,
        speedKph: 410,
        status: 'running',
        totalDistance: 2 + candidate.progress,
      },
      deltaSeconds: 0.1,
      driver,
      elapsedSeconds: 80,
      lowGripConditions: false,
      phase: null,
      raceLap: 3,
      setup: idealSetupForTrack(lasVegas),
      team,
      track: lasVegas,
      trackGrip: 1,
      weather: 'clear',
    })

    expect(telemetry.brakePercent).toBe(0)
    expect(telemetry.throttlePercent).toBe(100)
  })

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
    expect(albertPark.maximumSpeedKph).toBeLessThanOrEqual(335)
    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(330)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(370)
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

    expect(result.maximumSpeedKph).toBeGreaterThanOrEqual(418)
    expect(result.maximumSpeedKph).toBeLessThanOrEqual(430)
  })

  it('preserves a large setup-dependent speed difference at Las Vegas', () => {
    const lasVegas = tracks.find(
      (candidate) => candidate.id === 'las-vegas-approx',
    )!
    const common = {
      fuelLoadKg: 18,
      gapToAheadSeconds: 0.35,
      sessionType: 'race-distance' as const,
      teamId: 'ferrari',
    }
    const lowDrag = runSpeedTrace(lasVegas, {
      ...common,
      setup: idealSetupForTrack(lasVegas),
    })
    const highDownforce = runSpeedTrace(lasVegas, {
      ...common,
      setup: {
        ...baselineSetupForTrack(lasVegas),
        frontWing: 7,
        rearWing: 8,
        rideHeightMm: 34,
      },
    })

    expect(lowDrag.maximumSpeedKph).toBeGreaterThanOrEqual(405)
    expect(
      lowDrag.maximumSpeedKph - highDownforce.maximumSpeedKph,
    ).toBeGreaterThanOrEqual(20)
  })

  it('reaches representative top speeds through the complete race loop', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(320)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(400)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(430)
    expect(monza.minimumBatteryPercent).toBeLessThanOrEqual(65)
    expect(lasVegas.minimumBatteryPercent).toBeLessThanOrEqual(78)
    expect(monza.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
    expect(lasVegas.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
  })

  it('keeps the speeds shown by a complete 30-car field in the calibrated range', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
      true,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
      true,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(325)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(410)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(430)
  }, 10_000)
})
