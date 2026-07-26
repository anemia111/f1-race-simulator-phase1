import { describe, expect, it } from 'vitest'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { isDryCompound } from './tires'
import { decidePitStop, pitStopLossSeconds } from './strategy'
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
