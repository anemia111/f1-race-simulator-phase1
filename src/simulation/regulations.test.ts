import { describe, expect, it } from 'vitest'
import { sourceRegistry } from '../data/sourceRegistry'
import { tracks } from '../data/tracks'
import {
  FIA_2026_REGULATION_PROFILE,
  compliesWithGrandPrixTireRule,
  deploymentPowerLimitKwForSpeed,
  maxRechargePerLapMjFor,
  nextLowGripCondition,
  permittedMguKDcPowerKwForSpeed,
  sessionDistanceLapsFor,
  shouldDeclareRainHazard,
  sprintLapsFor,
} from './regulations'

describe('2026 session regulations', () => {
  const silverstone = tracks.find((track) => track.id === 'silverstone-approx')!

  it('uses the least full-lap Sprint distance above 100 km', () => {
    expect(sprintLapsFor(silverstone)).toBe(17)
    expect(sprintLapsFor(silverstone) * silverstone.lengthKm).toBeGreaterThan(100)
    expect(sessionDistanceLapsFor(silverstone, 'race')).toBe(52)
  })

  it('requires two dry specifications unless wet-weather tyres were used', () => {
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['M'] })).toBe(false)
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['M', 'H'] })).toBe(true)
    expect(compliesWithGrandPrixTireRule({ compoundsUsed: ['S', 'I'] })).toBe(true)
  })

  it('pins the frozen Sporting B08 and Operational F10 authorities', () => {
    expect(FIA_2026_REGULATION_PROFILE.sporting).toEqual({
      approvedAt: '2026-08-03',
      issue: '08',
      label: 'FIA 2026 F1 Sporting Regulations Issue 08',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_08_-_2026-08-05_7.pdf',
    })
    expect(sourceRegistry.fiaSporting2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Sporting Regulations Issue 08',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.sporting.url,
    })
    expect(FIA_2026_REGULATION_PROFILE.operational).toEqual({
      approvedAt: '2026-08-03',
      issue: '10',
      label: 'FIA 2026 F1 Operational Regulations Issue 10',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_10_-_2026-08-05.pdf',
    })
    expect(sourceRegistry.fiaOperational2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Operational Regulations Issue 10',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.operational.url,
    })
  })

  it('pins public ERS limits to frozen Technical Regulations Issue 20', () => {
    expect(FIA_2026_REGULATION_PROFILE.asOf).toBe('2026-08-05')
    expect(FIA_2026_REGULATION_PROFILE.technical).toEqual({
      approvedAt: '2026-08-03',
      issue: '20',
      label: 'FIA 2026 F1 Technical Regulations Issue 20',
      publishedAt: '2026-08-05',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf',
    })
    expect(sourceRegistry.fiaTechnical2026).toEqual({
      approvedAt: '2026-08-03',
      label: 'FIA 2026 F1 Technical Regulations Issue 20',
      publishedAt: '2026-08-05',
      url: FIA_2026_REGULATION_PROFILE.technical.url,
    })
    expect(FIA_2026_REGULATION_PROFILE.energy.maxErsPowerKw).toBe(350)
    expect(
      FIA_2026_REGULATION_PROFILE.energy.usableStateOfChargeWindowMj,
    ).toBe(4)
    expect(maxRechargePerLapMjFor({ stage: 'race' })).toBe(8.5)
    expect(maxRechargePerLapMjFor({ stage: 'qualifying' })).toBe(7)
    expect(
      maxRechargePerLapMjFor({ eventLimitMj: 6, stage: 'race' }),
    ).toBe(7)
    expect(
      maxRechargePerLapMjFor({
        eventLimitMj: 3,
        stage: 'qualifying',
      }),
    ).toBe(4)
    expect(
      maxRechargePerLapMjFor({
        behindSafetyCar: true,
        eventLimitMj: 7,
        lowGripConditions: true,
        stage: 'race',
      }),
    ).toBe(Number.POSITIVE_INFINITY)
  })

  it('keeps the non-public low-grip MGU-K curve unavailable', () => {
    expect(FIA_2026_REGULATION_PROFILE.lowGripPowerCurve).toEqual({
      availability: 'unavailable',
      public: false,
      document: 'FIA-F1-DOC-111',
      permittedPowerCurve: null,
      note: 'Competition-specific low-grip ERS curves are not included in the public regulation PDF.',
    })
    const untypedGate = permittedMguKDcPowerKwForSpeed as (options: {
      curve: string
      speedKph: number
    }) => number
    expect(untypedGate({ curve: 'low-grip', speedKph: 100 })).toBe(0)
  })

  it('models Race Director grip declarations with drying hysteresis', () => {
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0,
        previous: false,
        trackGrip: 0.86,
        weather: 'light-rain',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.12,
        previous: true,
        trackGrip: 0.96,
        weather: 'clear',
      }),
    ).toBe(true)
    expect(
      nextLowGripCondition({
        averageSurfaceWaterMm: 0.04,
        previous: true,
        trackGrip: 0.97,
        weather: 'clear',
      }),
    ).toBe(false)
  })

  it('declares Rain Hazard above the FIA 40 percent threshold', () => {
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.4,
        weather: 'clear',
      }),
    ).toBe(false)
    expect(
      shouldDeclareRainHazard({
        forecastProbability: 0.401,
        weather: 'clear',
      }),
    ).toBe(true)
  })
})

describe('FIA 2026 MGU-K DC power gate', () => {
  const boundaries = [
    { normal: 255, overtake: 350, powerLimited: 250, speedKph: 309 },
    { normal: 250, overtake: 350, powerLimited: 250, speedKph: 310 },
    { normal: 105, overtake: 320, powerLimited: 105, speedKph: 339 },
    { normal: 100, overtake: 300, powerLimited: 100, speedKph: 340 },
    {
      normal: 0.02,
      overtake: 200.02,
      powerLimited: 0.02,
      speedKph: 344.999,
    },
    { normal: 0, overtake: 200, powerLimited: 0, speedKph: 345 },
    {
      normal: 0,
      overtake: 0.02,
      powerLimited: 0,
      speedKph: 354.999,
    },
    { normal: 0, overtake: 0, powerLimited: 0, speedKph: 355 },
  ]

  it.each(boundaries)(
    'applies the exact C5.2.7/C5.2.8 curves at $speedKph km/h',
    ({ normal, overtake, powerLimited, speedKph }) => {
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'normal',
          speedKph,
        }),
      ).toBeCloseTo(normal, 6)
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'overtake',
          speedKph,
        }),
      ).toBeCloseTo(overtake, 6)
      expect(
        permittedMguKDcPowerKwForSpeed({
          curve: 'race-sprint-power-limited',
          speedKph,
        }),
      ).toBeCloseTo(powerLimited, 6)
    },
  )

  it('enforces the absolute 350 kW cap and clamps requested power', () => {
    expect(
      permittedMguKDcPowerKwForSpeed({ curve: 'normal', speedKph: 0 }),
    ).toBe(350)
    expect(
      permittedMguKDcPowerKwForSpeed({ curve: 'overtake', speedKph: 300 }),
    ).toBe(350)
    expect(
      permittedMguKDcPowerKwForSpeed({
        curve: 'race-sprint-power-limited',
        speedKph: 0,
      }),
    ).toBe(250)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: 500,
        speedKph: 0,
      }),
    ).toBe(350)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: 200,
        speedKph: 0,
      }),
    ).toBe(200)
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'race-sprint-power-limited',
        requestedPowerKw: 350,
        speedKph: 309,
      }),
    ).toBe(250)
  })

  it('requires an explicit Overtake curve and fails closed on invalid input', () => {
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'overtake',
        requestedPowerKw: 350,
        speedKph: 340,
      }),
    ).toBe(300)
    expect(
      deploymentPowerLimitKwForSpeed({
        curve: 'normal',
        requestedPowerKw: 350,
        speedKph: 340,
      }),
    ).toBe(100)
    expect(
      permittedMguKDcPowerKwForSpeed({ speedKph: Number.NaN }),
    ).toBe(0)
    expect(
      deploymentPowerLimitKwForSpeed({
        requestedPowerKw: Number.POSITIVE_INFINITY,
        speedKph: 300,
      }),
    ).toBe(0)
  })
})
