import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import type { CarSetup, CarSnapshot, TrackDefinition } from '../types'
import { calculateCarTelemetry } from './telemetry'
import { progressForProfileSpeed, trackDynamicsAt } from './trackDynamics'
import { advanceRace, createInitialRace } from './race'
import { baselineSetupForTrack, idealSetupForTrack } from './engineering'
import { categoryPhysicsFor } from './categoryPhysics'
import {
  airDensityKgM3,
  integrateVehicleLongitudinalStep,
  liveCorneringSpeedLimitKph,
} from './vehicleDynamics'
import type { F1RuntimeSystems } from './runtimeSystems'

function requireF1Runtime(
  runtimeSystems: CarSnapshot['runtimeSystems'],
): F1RuntimeSystems {
  if (runtimeSystems.kind !== 'f1') {
    throw new Error('This F1 calibration fixture requires an F1 runtime')
  }

  return runtimeSystems
}

function withF1Runtime(
  car: CarSnapshot,
  patch: Partial<Omit<F1RuntimeSystems, 'kind'>>,
): CarSnapshot {
  const runtimeSystems = requireF1Runtime(car.runtimeSystems)

  return {
    ...car,
    runtimeSystems: {
      ...runtimeSystems,
      ...patch,
    },
  }
}

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
    const telemetryRuntime = requireF1Runtime(telemetry.runtimeSystems)
    const progressDelta = progressForProfileSpeed(
      track,
      car.progress,
      telemetry.speedKph,
      deltaSeconds,
    )

    maximumSpeedKph = Math.max(maximumSpeedKph, telemetry.speedKph)
    maximumErsPowerKw = Math.max(
      maximumErsPowerKw,
      telemetryRuntime.ersPowerKw,
    )
    maximumReferenceSpeedKph = Math.max(
      maximumReferenceSpeedKph,
      dynamics.referenceSpeedKph,
    )
    if (dynamics.fullThrottle) {
      fullThrottleSamples += 1
      fullThrottleErsTotalKw += telemetryRuntime.ersPowerKw
    }
    straightAeroSamples +=
      telemetryRuntime.activeAeroMode === 'straight' ? 1 : 0
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
      ...snapshot.cars.map((car) =>
        requireF1Runtime(car.runtimeSystems).ersBatteryPercent,
      ),
    )
  }

  return { maximumSpeedKph, minimumBatteryPercent, snapshot }
}

describe('on-track speed calibration', () => {
  it('does not let baseLapTime rescale a live physics tick', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const driver = initialDrivers.find(
      (candidate) => candidate.teamId === 'ferrari',
    )!
    const team = initialTeams.find(({ id }) => id === driver.teamId)!
    const snapshot = createInitialRace({
      drivers: [driver],
      seed: 'base-lap-time-is-not-live-speed',
      teams: [team],
      track,
    })
    const progress = track.centerline
      .map((_, index) => index / track.centerline.length)
      .sort(
        (left, right) =>
          trackDynamicsAt(track, right).straightLengthAheadMeters -
          trackDynamicsAt(track, left).straightLengthAheadMeters,
      )[0]
    const car: CarSnapshot = {
      ...snapshot.cars[0],
      clutchEngagementFraction: 1,
      gapToAhead: 10,
      progress,
      racePaceMode: 'push',
      speedKph: 250,
      status: 'running',
      totalDistance: 2 + progress,
      turboSpoolFraction: 1,
    }
    const telemetryFor = (candidateTrack: TrackDefinition) =>
      calculateCarTelemetry({
        car,
        deltaSeconds: 0.1,
        driver,
        elapsedSeconds: 60,
        lowGripConditions: false,
        phase: null,
        raceLap: 3,
        team,
        track: candidateTrack,
        trackGrip: 1,
        weather: 'clear',
      })
    const fasterBaseline = telemetryFor({
      ...track,
      baseLapTime: track.baseLapTime * 0.55,
    })
    const slowerBaseline = telemetryFor({
      ...track,
      baseLapTime: track.baseLapTime * 1.65,
    })

    expect(fasterBaseline.speedKph).toBe(slowerBaseline.speedKph)
    expect(fasterBaseline.gear).toBe(slowerBaseline.gear)
    expect(fasterBaseline.rpm).toBe(slowerBaseline.rpm)
    expect(fasterBaseline.throttlePercent).toBe(
      slowerBaseline.throttlePercent,
    )
    expect(fasterBaseline.brakePercent).toBe(slowerBaseline.brakePercent)
  })

  it('feeds Energy Store SOC and thermal limits into acceleration once', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const driver = initialDrivers.find(
      (candidate) => candidate.teamId === 'ferrari',
    )!
    const team = initialTeams.find(({ id }) => id === driver.teamId)!
    const snapshot = createInitialRace({
      drivers: [driver],
      seed: 'energy-limited-acceleration',
      teams: [team],
      track,
    })
    const progress = track.centerline
      .map((_, index) => index / track.centerline.length)
      .find((candidate) => trackDynamicsAt(track, candidate).fullThrottle)!
    const commonCar: CarSnapshot = {
      ...snapshot.cars[0],
      clutchEngagementFraction: 1,
      gapToAhead: 0.8,
      progress,
      racePaceMode: 'push',
      speedKph: 220,
      status: 'running',
      totalDistance: 3 + progress,
      turboSpoolFraction: 1,
    }
    const calculate = (car: CarSnapshot) =>
      calculateCarTelemetry({
        car,
        deltaSeconds: 0.25,
        driver,
        elapsedSeconds: 90,
        lowGripConditions: false,
        phase: null,
        raceLap: 4,
        team,
        track,
        trackGrip: 1,
        weather: 'clear',
      })
    const healthy = calculate(commonCar)
    const commonRuntime = requireF1Runtime(commonCar.runtimeSystems)
    const energyMinimum = commonRuntime.energyStore.minimumUsableEnergyMJ
    const depleted = calculate(withF1Runtime(commonCar, {
      energyStore: {
        ...commonRuntime.energyStore,
        currentEnergyMJ: energyMinimum,
        stateOfCharge: 0,
      },
      ersBatteryPercent: 0,
    }))
    const thermallyLimited = calculate(withF1Runtime(commonCar, {
      energyStore: {
        ...commonRuntime.energyStore,
        batteryTemperatureC: 96,
        inverterTemperatureC: 132,
        motorGeneratorTemperatureC: 154,
      },
    }))

    const healthyRuntime = requireF1Runtime(healthy.runtimeSystems)
    const depletedRuntime = requireF1Runtime(depleted.runtimeSystems)
    const thermallyLimitedRuntime = requireF1Runtime(
      thermallyLimited.runtimeSystems,
    )

    expect(healthyRuntime.ersPowerKw).toBeGreaterThan(
      depletedRuntime.ersPowerKw,
    )
    expect(depletedRuntime.ersPowerKw).toBe(0)
    expect(healthy.speedKph).toBeGreaterThan(depleted.speedKph)
    expect(healthyRuntime.ersPowerKw).toBeGreaterThan(
      thermallyLimitedRuntime.ersPowerKw,
    )
    expect(healthy.speedKph).toBeGreaterThan(thermallyLimited.speedKph)
  })

  it('recomputes a live corner limit for carried fuel mass', () => {
    const track = tracks.find((candidate) => candidate.id === 'suzuka-approx')!
    const driver = initialDrivers.find(
      (candidate) => candidate.teamId === 'ferrari',
    )!
    const team = initialTeams.find(({ id }) => id === driver.teamId)!
    const physics = categoryPhysicsFor(undefined)
    const dynamics = trackDynamicsAt(track, 0.5, physics)
    const setup = baselineSetupForTrack(track)
    const limitFor = (fuelLoadKg: number) =>
      liveCorneringSpeedLimitKph({
        airDensityKgM3: airDensityKgM3({
          altitudeMeters: track.altitudeMeters,
          temperatureC: 25,
        }),
        bankingDegrees: dynamics.bankingDegrees,
        categoryPhysics: physics,
        evaluationSpeedKph: dynamics.referenceSpeedKph,
        fuelLoadKg,
        gripMultiplier: 1,
        radiusMeters: dynamics.effectiveCornerRadiusM,
        setup,
        team,
      })
    const lightLimitKph = limitFor(5)
    const heavyLimitKph = limitFor(105)
    const snapshot = createInitialRace({
      drivers: [driver],
      seed: 'live-fuel-corner-limit',
      teams: [team],
      track,
    })
    const commonCar: CarSnapshot = {
      ...snapshot.cars[0],
      clutchEngagementFraction: 1,
      gapToAhead: 10,
      progress: 0.5,
      speedKph: (lightLimitKph + heavyLimitKph) / 2,
      status: 'running',
      totalDistance: 2.5,
      turboSpoolFraction: 1,
    }
    const calculate = (fuelLoadKg: number) =>
      calculateCarTelemetry({
        car: { ...commonCar, fuelLoadKg },
        deltaSeconds: 0.1,
        driver,
        elapsedSeconds: 60,
        lowGripConditions: false,
        phase: null,
        raceLap: 3,
        setup,
        team,
        track,
        trackGrip: 1,
        weather: 'clear',
      })
    const light = calculate(5)
    const heavy = calculate(105)

    expect(heavyLimitKph).toBeLessThan(lightLimitKph)
    expect(heavy.brakePercent).toBeGreaterThanOrEqual(light.brakePercent)
    expect(heavy.speedKph).toBeLessThan(light.speedKph)
  })

  it('turns active-aero drag reduction into a higher physical speed', () => {
    const track = tracks.find((candidate) => candidate.id === 'monza-approx')!
    const team = initialTeams.find(({ id }) => id === 'ferrari')!
    const physics = categoryPhysicsFor(undefined)
    const dynamics = trackDynamicsAt(track, 0, physics)
    const common = {
      airDensityKgM3: airDensityKgM3({
        altitudeMeters: track.altitudeMeters,
        temperatureC: 25,
      }),
      brakePercent: 0,
      categoryPhysics: physics,
      clutchEngagementFraction: 1,
      currentSpeedKph: 330,
      deltaSeconds: 1,
      dynamics,
      ersPowerKw: 0,
      fuelLoadKg: 20,
      gripMultiplier: 1,
      team,
      throttlePercent: 100,
      turboSpoolFraction: 1,
    } as const
    const corner = integrateVehicleLongitudinalStep({
      ...common,
      activeAeroMode: 'corner',
    })
    const straight = integrateVehicleLongitudinalStep({
      ...common,
      activeAeroMode: 'straight',
    })

    expect(straight.dragForceN).toBeLessThan(corner.dragForceN)
    expect(straight.speedKph).toBeGreaterThan(corner.speedKph)
    for (const value of Object.values(straight)) {
      expect(Number.isFinite(value)).toBe(true)
    }
    for (const value of [
      straight.speedKph,
      straight.driveForceN,
      straight.tractionLimitN,
      straight.dragForceN,
      straight.brakeForceN,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })

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
    // The physical radius model keeps the genuine Grand Hotel hairpin instead
    // of lifting every profile to the former calibrated 65 km/h floor.
    expect(monaco[0]).toBeGreaterThanOrEqual(50)
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
          dynamics.corneringSpeedLimitKph >= 360 &&
          dynamics.straightLengthAheadMeters >= 180,
      )
      .sort(
        (left, right) =>
          right.dynamics.straightLengthAheadMeters -
          left.dynamics.straightLengthAheadMeters,
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

  it('lets representative dry-running top speeds emerge from forces', () => {
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
    expect(albertPark.maximumSpeedKph).toBeLessThanOrEqual(410)
    // This synthetic one-car trace is not a per-circuit target-speed fit. Its
    // physical invariant is that Monza's longer declared straight produces a
    // higher clear-air terminal speed than Albert Park under the same model.
    expect(monza.maximumStraightLengthMeters).toBeGreaterThan(
      albertPark.maximumStraightLengthMeters,
    )
    expect(monza.maximumSpeedKph).toBeGreaterThan(albertPark.maximumSpeedKph)
    expect(monza.maximumSpeedKph).toBeLessThanOrEqual(410)
    // Bounds come from the checked-in 2026 telemetry, not from the gearing.
    // Observed field peaks run 291 km/h at Monaco to 360 km/h at Barcelona;
    // `topGearDesignSpeedKph` is 402 km/h and `physics-calibration.md` records
    // it as "never a top-speed clamp". These assertions used to demand 375 to
    // 400 km/h, which is the removed 68/395 clamp and above anything the
    // telemetry shows.
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(335)
    expect(lasVegas.maximumSpeedKph).toBeLessThanOrEqual(375)
  })

  it('respects the physical top-gear design speed in a low-drag tow', () => {
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

    // Top gear reaches the rev limit around 402 km/h, and the point is that
    // drag stops the car well short of it. Demanding the car nearly reach the
    // design speed treated a gearing input as a performance target.
    expect(result.maximumSpeedKph).toBeGreaterThanOrEqual(350)
    expect(result.maximumSpeedKph).toBeLessThan(402)
  })

  it('derives the Las Vegas setup speed ordering from drag', () => {
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

    expect(lowDrag.maximumSpeedKph).toBeGreaterThanOrEqual(345)
    // The removed target-speed calibration encoded a fixed 20 km/h spread.
    // The physical invariant is monotonic: adding wing costs terminal speed.
    expect(lowDrag.maximumSpeedKph).toBeGreaterThan(
      highDownforce.maximumSpeedKph,
    )
  })

  it('reaches representative top speeds through the complete race loop', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(320)
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(340)
    expect(lasVegas.maximumSpeedKph).toBeLessThan(402)
    // Both traces consume Energy Store charge through the live deployment
    // path; the exact remainder is an output, not a lap-time calibration gate.
    expect(monza.minimumBatteryPercent).toBeLessThan(70)
    expect(lasVegas.minimumBatteryPercent).toBeLessThan(70)
    expect(monza.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
    expect(lasVegas.minimumBatteryPercent).toBeGreaterThanOrEqual(10)
  })

  it('keeps a complete 30-car field inside physical top-gear bounds', () => {
    const monza = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'monza-approx')!,
      true,
    )
    const lasVegas = runIntegratedRaceSpeedTrace(
      tracks.find((candidate) => candidate.id === 'las-vegas-approx')!,
      true,
    )

    expect(monza.maximumSpeedKph).toBeGreaterThanOrEqual(325)
    // Traffic and line sharing need not reproduce the solo-run maximum, but
    // the field still reaches the top-gear region without overspeed.
    expect(lasVegas.maximumSpeedKph).toBeGreaterThanOrEqual(330)
    expect(lasVegas.maximumSpeedKph).toBeLessThan(402)
  }, 30_000)
})
