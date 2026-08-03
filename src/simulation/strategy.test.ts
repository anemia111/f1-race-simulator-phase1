import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { isDryCompound } from './tires'
import { f1PitCrewSpeedForTeam } from '../data/f1PitCrewCalibration'
import {
  F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026,
  F1_PIT_STOP_STATIONARY_POOLED_2026,
} from '../data/f1PitStopObservations2026'
import {
  F1_PIT_LANE_TRANSIT_OBSERVATIONS,
  F1_REFERENCE_PIT_LANE_TRANSIT_SECONDS,
} from '../data/f1PitLaneObservations2026'
import {
  decidePitStop,
  PIT_LANE_LOSS_PER_TRANSIT_SECOND,
  PIT_LANE_TRANSIT_BASE_SECONDS,
  pitLaneLossSecondsForTrack,
  pitStopLossSeconds,
  pitTuning,
} from './strategy'
import type { WeatherForecast } from './weather'

const driver = initialDrivers[0]

const carState = (overrides: Partial<Parameters<typeof decidePitStop>[0]['car']> = {}) => ({
  tire: 'M' as const,
  tireAgeLaps: 26,
  tireWearPercent: 74,
  tireThermalStressPercent: 0,
  brakeTemperatureC: 620,
  compoundsUsed: ['M' as const],
  damage: 0,
  pitStops: 0,
  ...overrides,
})

const rainForecast: WeatherForecast = {
  weather: 'light-rain',
  weatherLabel: 'Light rain',
  trackGrip: 0.88,
  secondsAhead: 120,
  confidence: 0.9,
  willChange: true,
  label: 'Rain expected',
}

const baseOptions = {
  seed: 'strategy-surface',
  driver,
  car: carState(),
  lap: 20,
  raceLaps: 58,
  weather: 'clear' as const,
  trackGrip: 1,
  position: 5,
  fieldSize: 20,
}

describe('tyre choice reads the racing line, not the forecast', () => {
  it('never fits a wet-weather tyre while the line is dry', () => {
    const decision = decidePitStop({
      ...baseOptions,
      car: carState({ tireWearPercent: 92 }),
      forecast: rainForecast,
      trackCondition: {
        dryingLine: 1,
        rainIntensityMmH: 0,
        surfaceWaterMm: 0,
      },
    })

    expect(decision).not.toBeNull()
    expect(isDryCompound(decision!.compound)).toBe(true)
  })

  it('still reaches for intermediates once water is standing on the line', () => {
    const decision = decidePitStop({
      ...baseOptions,
      forecast: rainForecast,
      trackCondition: {
        dryingLine: 0.2,
        rainIntensityMmH: 1.8,
        surfaceWaterMm: 1.6,
      },
    })

    expect(decision?.compound).toBe('I')
  })
})

describe('safety-car pit window', () => {
  const safetyCarOptions = {
    ...baseOptions,
    controlPhase: 'safety-car' as const,
    neutralisedLapSeconds: 130,
    trackCondition: {
      dryingLine: 1,
      rainIntensityMmH: 0,
      surfaceWaterMm: 0,
    },
  }

  it('takes the stop on the lap the Safety Car is called', () => {
    expect(
      decidePitStop({
        ...safetyCarOptions,
        neutralisationElapsedSeconds: 20,
      })?.reason,
    ).toBe('safety-car')
  })

  it('does not drop a midfield car to the back a lap later', () => {
    expect(
      decidePitStop({
        ...safetyCarOptions,
        neutralisationElapsedSeconds: 200,
      })?.reason,
    ).not.toBe('safety-car')
  })

  it('still lets the tail of the field stop once the queue has formed', () => {
    expect(
      decidePitStop({
        ...safetyCarOptions,
        neutralisationElapsedSeconds: 200,
        position: 18,
      })?.reason,
    ).toBe('safety-car')
  })
})

describe('team pit-stop loss', () => {
  it('uses the team crew calibration in both total loss and repair stops', () => {
    const ferrari = initialTeams.find((team) => team.id === 'ferrari')!
    const astonMartin = initialTeams.find(
      (team) => team.id === 'aston-martin',
    )!
    const common = ['pit-team-calibration', 'driver', 1] as const
    const ferrariLoss = pitStopLossSeconds(
      common[0],
      common[1],
      ferrari,
      common[2],
      false,
      18,
    )
    const astonLoss = pitStopLossSeconds(
      common[0],
      common[1],
      astonMartin,
      common[2],
      false,
      18,
    )

    expect(ferrariLoss).toBeLessThan(astonLoss)
    expect(astonLoss - ferrariLoss).toBeCloseTo(
      (ferrari.pitCrewSpeed - astonMartin.pitCrewSpeed) * 4,
      10,
    )
    expect(
      pitStopLossSeconds(
        common[0],
        common[1],
        ferrari,
        common[2],
        true,
        18,
      ) - ferrariLoss,
    ).toBe(3)
  })
})

describe('stationary time against observed 2026 stops', () => {
  const stationarySeconds = (index: number) => {
    const team = initialTeams[index % initialTeams.length]

    // Zero lane transit, so what comes back is the stationary time alone.
    return pitStopLossSeconds(
      'stationary-distribution',
      `driver-${index}`,
      team,
      index,
      false,
      0,
    )
  }
  const samples = Array.from({ length: 4000 }, (_, index) =>
    stationarySeconds(index),
  ).sort((first, second) => first - second)
  const quantile = (fraction: number) =>
    samples[Math.floor(fraction * samples.length)]

  it('matches the observed median', () => {
    // The observed median carries penalties served in the box, so it is an
    // upper bound on a routine stop. Landing on it keeps the model from being
    // optimistic; the tolerance is the resolution of the observed data, which
    // OpenF1 reports to a tenth.
    expect(quantile(0.5)).toBeCloseTo(
      F1_PIT_STOP_STATIONARY_POOLED_2026.medianSeconds,
      1,
    )
  })

  it('leaves the quick stops quick', () => {
    // The uniform band this replaced put the tenth percentile at 2.74 s, above
    // every per-session p10 in the observed sample.
    expect(quantile(0.1)).toBeLessThan(2.7)
    // It does not reach the observed 2.4 s, and this records that. What is
    // left is the floor: `crewBaseSeconds` plus the quickest crew's share of
    // `crewSpreadSeconds` is 2.16 s, so no draw can go lower. Closing it means
    // moving the crew rating scale, which has no observed counterpart in this
    // repository - the ratings come from award winning frequency, not from
    // stationary times.
    expect(quantile(0.1)).toBeGreaterThan(
      F1_PIT_STOP_STATIONARY_POOLED_2026.p10Seconds,
    )
  })

  it('keeps a tail rather than a ceiling', () => {
    // A uniform draw cannot do this: its widest result was the crew's own
    // time plus a fixed band.
    expect(quantile(0.99)).toBeGreaterThan(2 * quantile(0.5))
  })

  it('never beats the quickest crew flat out', () => {
    expect(samples[0]).toBeGreaterThanOrEqual(pitTuning.crewBaseSeconds)
  })
})

describe('per-circuit pit lane loss', () => {
  const lossFor = (trackId: string) =>
    pitLaneLossSecondsForTrack({ id: trackId })

  it('separates the circuits the observations separate', () => {
    // Zandvoort has the shortest measured lane of the set and Lusail the
    // longest. They used to cost exactly the same.
    expect(lossFor('lusail-approx') - lossFor('zandvoort-approx')).toBeCloseTo(
      PIT_LANE_LOSS_PER_TRANSIT_SECOND * (25.79 - 15.02),
      6,
    )
  })

  it('leaves the calendar-wide level where it was set', () => {
    const observed = F1_PIT_LANE_TRANSIT_OBSERVATIONS.map((entry) =>
      lossFor(entry.trackId),
    )
    const mean =
      observed.reduce((total, value) => total + value, 0) / observed.length

    expect(mean).toBeCloseTo(PIT_LANE_TRANSIT_BASE_SECONDS, 1)
  })

  it('falls back to the base for a circuit with no observation', () => {
    // Monaco and Silverstone have no row, and both are known outliers.
    expect(lossFor('monaco-approx')).toBeCloseTo(
      PIT_LANE_TRANSIT_BASE_SECONDS,
      6,
    )
  })

  it('converts a live transit time rather than using it as a loss', () => {
    // Feeding a lane time straight in as a loss is what put the pit wall and
    // the race apart, so a transit equal to the reference must produce the
    // base rather than the reference.
    expect(
      pitLaneLossSecondsForTrack({
        id: 'monaco-approx',
        observedCalibration: {
          pitLaneTransitSeconds: F1_REFERENCE_PIT_LANE_TRANSIT_SECONDS,
        },
      }),
    ).toBeCloseTo(PIT_LANE_TRANSIT_BASE_SECONDS, 6)
  })

  it('lets live telemetry override the checked-in observation', () => {
    expect(
      pitLaneLossSecondsForTrack({
        id: 'lusail-approx',
        observedCalibration: { pitLaneTransitSeconds: 15.02 },
      }),
    ).toBeCloseTo(lossFor('zandvoort-approx'), 6)
  })
})

describe('crew ratings against observed team stationary times', () => {
  const teamStationaryP25 = (team: (typeof initialTeams)[number]) => {
    const draws = Array.from({ length: 4000 }, (_, index) =>
      pitStopLossSeconds(
        `crew-${team.id}`,
        `driver-${index}`,
        team,
        index,
        false,
        0,
      ),
    ).sort((first, second) => first - second)

    return draws[Math.floor(0.25 * draws.length)]
  }

  it.each(F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026)(
    'reproduces the observed lower quartile for $team',
    (observation) => {
      const team = initialTeams.find(
        (candidate) => candidate.name === observation.team,
      )

      // A team the grid data does not carry cannot be checked here; the
      // calibration still holds its observation.
      if (!team) {
        return
      }

      // The slow-stop draw fires on 6 % of stops, so it does not reach the
      // lower quartile. What is left is the crew floor plus the variance
      // quartile, which is exactly what the rating inverts.
      expect(teamStationaryP25(team)).toBeCloseTo(observation.p25Seconds, 1)
    },
  )

  it('spans the observed range rather than the award-derived one', () => {
    const quartiles = F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026.map(
      (observation) => observation.p25Seconds,
    )
    const observedSpread = Math.max(...quartiles) - Math.min(...quartiles)
    const ratings = F1_PIT_CREW_STATIONARY_OBSERVATIONS_2026.map((observation) =>
      f1PitCrewSpeedForTeam(observation.team),
    )
    const modelledSpread =
      (Math.max(...ratings) - Math.min(...ratings)) * pitTuning.crewSpreadSeconds

    // The award-derived ratings spanned 0.76 s.
    expect(modelledSpread).toBeGreaterThan(1)
    expect(modelledSpread).toBeCloseTo(observedSpread, 1)
  })
})
