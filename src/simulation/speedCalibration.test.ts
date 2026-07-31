import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { paceCalibrationFor } from '../data/paceCalibration'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot, TrackDefinition } from '../types'
import { calculateCarTelemetry } from './telemetry'
import { progressForProfileSpeed, trackDynamicsAt } from './trackDynamics'
import { advanceRace, createInitialRace } from './race'
import { baselineSetupForTrack, idealSetupForTrack } from './engineering'

function runSpeedTrace(
  track: TrackDefinition,
  options: {
    driverId?: string
    fuelLoadKg?: number
    gapToAheadSeconds?: number
    headwindMps?: number
    sessionType?: 'race-distance' | 'limited-time'
    setup?: CarSetup
    teamId?: string
  } = {},
) {
  const baseDriver = options.driverId
    ? initialDrivers.find(
        (candidate) => candidate.id === options.driverId,
      )!
    : initialDrivers.find(
        (candidate) =>
          candidate.teamId === (options.teamId ?? 'mercedes'),
      )!
  const teamId = options.teamId ?? baseDriver.teamId
  const team = initialTeams.find((candidate) => candidate.id === teamId)!
  const driver =
    baseDriver.teamId === teamId
      ? baseDriver
      : { ...baseDriver, teamId }
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

    // A 2026 F1 car can sustain roughly 5 g under peak braking. At 0.1 s this
    // is about 18 km/h before aerodynamic drag, so the physical trace may lose
    // around 21 km/h without being an instantaneous speed assignment.
    expect(entrySpeedKph - telemetry.speedKph).toBeLessThanOrEqual(22)
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

  it('does not brake through a near-flat bend before the real braking zone', () => {
    const candidates = tracks.flatMap((track) => {
      const pointLengthMeters =
        (track.lengthKm * 1000) / track.centerline.length

      return track.centerline.flatMap((_, index) => {
        const progress = index / track.centerline.length
        const dynamics = trackDynamicsAt(track, progress)
        let distanceToCommittedCorner = Number.POSITIVE_INFINITY

        for (
          let lookAhead = 1;
          lookAhead < Math.min(24, track.centerline.length / 3);
          lookAhead += 1
        ) {
          const target = trackDynamicsAt(
            track,
            (index + lookAhead) / track.centerline.length,
          )

          if (target.curvature >= 0.28 || target.referenceSpeedKph < 190) {
            distanceToCommittedCorner = lookAhead * pointLengthMeters
            break
          }
        }

        return dynamics.curvature >= 0.055 &&
          dynamics.curvature <= 0.18 &&
          dynamics.referenceSpeedKph >= 220 &&
          distanceToCommittedCorner >= 300
          ? [{ dynamics, progress, track }]
          : []
      })
    })

    expect(candidates.length).toBeGreaterThan(5)

    for (const candidate of candidates.slice(0, 12)) {
      const driver = initialDrivers[0]
      const team = initialTeams.find(({ id }) => id === driver.teamId)!
      const snapshot = createInitialRace({
        drivers: [driver],
        seed: `flat-bend:${candidate.track.id}`,
        teams: [team],
        track: candidate.track,
      })
      const telemetry = calculateCarTelemetry({
        car: {
          ...snapshot.cars[0],
          gapToAhead: 10,
          progress: candidate.progress,
          speedKph: Math.min(
            340,
            Math.max(235, candidate.dynamics.referenceSpeedKph),
          ),
          status: 'running',
          totalDistance: 2 + candidate.progress,
        },
        deltaSeconds: 0.1,
        driver,
        elapsedSeconds: 80,
        lowGripConditions: false,
        phase: null,
        raceLap: 3,
        team,
        track: candidate.track,
        trackGrip: 1,
        weather: 'clear',
      })

      expect(telemetry.brakePercent, candidate.track.id).toBe(0)
      expect(telemetry.throttlePercent, candidate.track.id).toBe(100)
    }
  })

  /**
   * Every circuit with an observed 2026 straight-line reference, measured
   * against that reference rather than against a hand-written band.
   *
   * The trace is a solo car in race trim, so it carries no tow and is compared
   * with the observed race field peak using a one-sided allowance below it: a
   * lone car should not reach what the quickest car of the race reached in
   * traffic, but it must not be far off it either, and it must never exceed it.
   *
   * `scripts/validate-speed-trap.mjs` is the full comparison, including
   * qualifying trim and a complete field. This test exists so the same
   * regression is caught by `npm test` without a Vite SSR run.
   */
  it('matches the observed 2026 straight-line speed of every referenced circuit', () => {
    const referenced = tracks.flatMap((track) => {
      const speed = paceCalibrationFor('f1-custom', track.id)?.speed
      const observedPeakKph = speed?.raceFieldPeakKph

      return observedPeakKph == null ? [] : [{ observedPeakKph, track }]
    })

    expect(referenced.length).toBeGreaterThanOrEqual(10)

    for (const { observedPeakKph, track } of referenced) {
      const trace = runSpeedTrace(track)

      expect(trace.maximumSpeedKph, track.id).toBeLessThanOrEqual(
        observedPeakKph + 6,
      )
      expect(trace.maximumSpeedKph, track.id).toBeGreaterThanOrEqual(
        observedPeakKph - 30,
      )
    }
  })

  it('keeps the unobserved circuits inside the physical envelope of the observed ones', () => {
    // Monza and Las Vegas have not run in 2026, so there is no reference to
    // compare them with. They are the two lowest-drag circuits on the calendar,
    // so they bound the model from above: the fastest observed 2026 peak is
    // Barcelona at 360 km/h, and a circuit built for top speed may exceed that
    // but not by the margin the former model produced, which reached 425 km/h.
    const monza = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
    )
    const lasVegas = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(330)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(375)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(335)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(380)
  })

  /**
   * The most favourable straight-line state the model can be put in.
   *
   * The former version of this test asserted 418-430 km/h and called it the
   * "420 km/h class". No Formula 1 car has been timed anywhere near that: the
   * fastest 2026 sample in `src/data/calibration` is Barcelona at 360 km/h, and
   * the fastest speed ever recorded by an F1 car in a race weekend is under
   * 380 km/h. The ceiling is now anchored to the observed maximum instead.
   */
  it('stays under the physical ceiling even in the most favourable low-drag tow', () => {
    const lowDragSetup: CarSetup = {
      brakeBiasPercent: 56.5,
      coolingPercent: 38,
      differentialPercent: 58,
      frontWing: 2,
      rearWing: 2,
      rideHeightMm: 24,
    }
    const fastestStraightLineTeam = [...initialTeams].sort(
      (left, right) =>
        right.machine.puOutput * 0.5 +
        right.machine.dragEfficiency * 0.35 +
        right.machine.straightLineEfficiency * 0.15 -
        (left.machine.puOutput * 0.5 +
          left.machine.dragEfficiency * 0.35 +
          left.machine.straightLineEfficiency * 0.15),
    )[0]
    const observedMaximumKph = Math.max(
      ...tracks.flatMap((track) => {
        const speed = paceCalibrationFor('f1-custom', track.id)?.speed

        return speed?.raceFieldPeakKph == null ? [] : [speed.raceFieldPeakKph]
      }),
    )
    const result = runSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
      {
        fuelLoadKg: 8,
        gapToAheadSeconds: 0.16,
        headwindMps: -5,
        driverId: 'yuki_nakayama',
        sessionType: 'limited-time',
        setup: lowDragSetup,
        teamId: fastestStraightLineTeam.id,
      },
    )

    expect(observedMaximumKph).toBeLessThanOrEqual(365)
    // The best case is a low-drag circuit, a low-drag setup, the lightest fuel,
    // a tailwind, and a tow, none of which the observed maximum had all at
    // once. It may exceed that maximum, but by a tow-and-tailwind margin.
    expect(result.maximumSpeedKph).toBeGreaterThanOrEqual(observedMaximumKph)
    expect(result.maximumSpeedKph).toBeLessThanOrEqual(observedMaximumKph + 35)
  })

  /**
   * Setup still moves top speed, but by what wings are worth.
   *
   * The former bound required at least 20 km/h between a low-drag and a
   * high-downforce setup, which the old setup range could only produce by
   * letting the wings alone remove nearly a third of the car's drag area. The
   * floor, bodywork, wheels, and suspension dominate CdA and no setup control
   * touches them, so the achievable difference is smaller than that.
   */
  it('preserves a setup-dependent speed difference at Las Vegas', () => {
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

    expect(lowDrag.maximumSpeedKph).toBeGreaterThanOrEqual(340)
    expect(
      lowDrag.maximumSpeedKph - highDownforce.maximumSpeedKph,
    ).toBeGreaterThanOrEqual(8)
  })

  it('reaches representative top speeds through the complete race loop', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(320)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(375)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(340)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(390)
    expect(monza.minimumBatteryPercent).toBeLessThanOrEqual(65)
    expect(lasVegas.minimumBatteryPercent).toBeLessThanOrEqual(78)
    expect(monza.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
    expect(lasVegas.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
  })

  /**
   * A full field adds tow, so it is faster than the solo trace above. In 2026
   * the observed race field peak runs 8-16 km/h above the qualifying peak at
   * the same circuit, which is the size of the effect this bounds.
   */
  it('keeps the speeds shown by a complete field in the calibrated range', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
      true,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
      true,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(325)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(380)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(345)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(395)
  }, 30_000)

  /**
   * Straight-line speed responds to the aerodynamic machine axes.
   *
   * Before the drag calibration the axes moved drag area by well under one
   * percent, so the whole field arrived at the speed trap within half a km/h of
   * each other. The real 2026 field spreads by around 8 km/h.
   */
  it('separates teams by straight-line speed', () => {
    const monza = tracks.find(
      (candidate) => candidate.id === 'monza-approx',
    )!
    const peaks = initialTeams.map(
      (team) => runSpeedTrace(monza, { teamId: team.id }).maximumSpeedKph,
    )
    const spreadKph = Math.max(...peaks) - Math.min(...peaks)

    expect(spreadKph).toBeGreaterThanOrEqual(3)
    expect(spreadKph).toBeLessThanOrEqual(18)
  }, 30_000)
})
