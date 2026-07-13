import { describe, expect, it } from 'vitest'
import {
  buildCenterlineModel,
  buildOpenF1TrackProgress,
  progressAtTime,
  projectLocationSample,
  projectPointToProgress,
} from './openF1Location'
import {
  chequeredFlagDate,
  type OpenF1Driver,
  type OpenF1Location,
  type OpenF1RaceControl,
} from './openF1'

// Square test track, perimeter 160, starting at (-20, -20) running clockwise
// in screen space (+x first). Local frame: z = -rawY after projection.
const squareCenterline: Array<[number, number, number]> = [
  [-20, 0, -20],
  [20, 0, -20],
  [20, 0, 20],
  [-20, 0, 20],
]

const identityProjection = {
  rotationDeg: 0,
  centerX: 0,
  centerY: 0,
  scale: 1,
}

const testDrivers: OpenF1Driver[] = [
  {
    driver_number: 1,
    full_name: 'Test Driver One',
    name_acronym: 'ONE',
    team_colour: '3671C6',
    team_name: 'Test Team',
  },
]

const locationSample = (
  driverNumber: number,
  isoDate: string,
  x: number,
  y: number,
): OpenF1Location => ({
  date: isoDate,
  driver_number: driverNumber,
  x,
  y,
  z: 0,
})

describe('projectPointToProgress', () => {
  const model = buildCenterlineModel(squareCenterline)

  it('maps the start point to zero progress', () => {
    const result = projectPointToProgress(model, -20, -20)

    expect(result.progress).toBeCloseTo(0, 5)
    expect(result.lateralDistance).toBeCloseTo(0, 5)
  })

  it('maps the middle of the first edge to a quarter of that edge share', () => {
    // 20 of 160 perimeter units into the lap, half a unit off centerline.
    const result = projectPointToProgress(model, 0, -20.5)

    expect(result.progress).toBeCloseTo(20 / 160, 5)
    expect(result.lateralDistance).toBeCloseTo(0.5, 5)
  })

  it('maps a point on the closing edge near the end of the lap', () => {
    // Fourth edge runs from (-20, 20) back to (-20, -20); its midpoint sits
    // at 140 of 160 perimeter units.
    const result = projectPointToProgress(model, -20, 0)

    expect(result.progress).toBeCloseTo(140 / 160, 5)
  })
})

describe('projectLocationSample', () => {
  it('applies scale, centering, and the y-to-z flip', () => {
    const projected = projectLocationSample(
      { rotationDeg: 0, centerX: 100, centerY: 50, scale: 0.5 },
      { x: 110, y: 40 },
    )

    expect(projected.x).toBeCloseTo(5, 5)
    expect(projected.z).toBeCloseTo(5, 5)
  })

  it('applies rotation before centering, matching the layout generator', () => {
    const projected = projectLocationSample(
      { rotationDeg: 90, centerX: 0, centerY: 0, scale: 1 },
      { x: 1, y: 0 },
    )

    expect(projected.x).toBeCloseTo(0, 5)
    expect(projected.z).toBeCloseTo(-1, 5)
  })
})

describe('buildOpenF1TrackProgress', () => {
  const track = {
    centerline: squareCenterline,
    locationProjection: identityProjection,
  }

  it('returns empty when the track has no projection (fallback layout)', () => {
    const result = buildOpenF1TrackProgress(
      {
        drivers: testDrivers,
        location: [locationSample(1, '2026-07-05T13:00:00+00:00', 0, 20)],
      },
      { centerline: squareCenterline, locationProjection: undefined },
    )

    expect(result.cars).toHaveLength(0)
    expect(result.latestSampleDate).toBeNull()
  })

  it('projects on-track samples and rejects garage-distance samples', () => {
    // Raw y = 20 lands on local z = -20: the first edge of the square.
    const result = buildOpenF1TrackProgress(
      {
        drivers: testDrivers,
        location: [
          locationSample(1, '2026-07-05T13:00:00+00:00', -20, 20),
          locationSample(1, '2026-07-05T13:00:10+00:00', 0, 20),
          // 15 units off the centerline: garage / building noise.
          locationSample(1, '2026-07-05T13:00:20+00:00', 0, 35),
          // OpenF1 placeholder when no position is known.
          locationSample(1, '2026-07-05T13:00:30+00:00', 0, 0),
        ],
      },
      track,
    )

    expect(result.cars).toHaveLength(1)
    expect(result.rejectedSamples).toBe(1)

    const car = result.cars[0]

    expect(car.code).toBe('ONE')
    expect(car.teamColor).toBe('#3671C6')
    expect(car.samples).toHaveLength(2)
    expect(car.samples[0].progress).toBeCloseTo(0, 5)
    expect(car.samples[1].progress).toBeCloseTo(20 / 160, 5)
  })

  it('unwraps progress across the start/finish line', () => {
    const result = buildOpenF1TrackProgress(
      {
        drivers: testDrivers,
        location: [
          // Just before the line on the closing edge...
          locationSample(1, '2026-07-05T13:00:00+00:00', -20, 10),
          // ...then just after it on the opening edge.
          locationSample(1, '2026-07-05T13:00:05+00:00', -10, 20),
        ],
      },
      track,
    )

    const car = result.cars[0]

    expect(car.samples[0].progress).toBeCloseTo(150 / 160, 5)
    expect(car.samples[1].progress).toBeCloseTo(1 + 10 / 160, 5)
  })

  it('labels unknown drivers by number instead of inventing an acronym', () => {
    const result = buildOpenF1TrackProgress(
      {
        drivers: [],
        location: [locationSample(63, '2026-07-05T13:00:00+00:00', 0, 20)],
      },
      track,
    )

    expect(result.cars[0].code).toBe('#63')
  })
})

describe('chequeredFlagDate', () => {
  const raceControlMessage = (
    date: string,
    message: string,
    flag: string | null = null,
  ): OpenF1RaceControl => ({
    category: 'Flag',
    date,
    driver_number: null,
    flag,
    lap_number: null,
    message,
    qualifying_phase: null,
    scope: 'Track',
    sector: null,
  })

  it('returns the latest chequered flag message date', () => {
    const date = chequeredFlagDate([
      raceControlMessage('2025-03-16T04:04:00+00:00', 'GREEN LIGHT - PIT EXIT OPEN'),
      raceControlMessage('2025-03-16T05:42:12+00:00', 'CHEQUERED FLAG', 'CHEQUERED'),
      raceControlMessage('2025-03-16T05:50:00+00:00', 'RISK OF RAIN FOR F1 RACE IS 60%'),
    ])

    expect(date).toBe('2025-03-16T05:42:12+00:00')
  })

  it('returns null when no chequered flag exists yet', () => {
    expect(
      chequeredFlagDate([
        raceControlMessage('2025-03-16T04:04:00+00:00', 'GREEN LIGHT - PIT EXIT OPEN'),
      ]),
    ).toBeNull()
  })
})

describe('progressAtTime', () => {
  const car = {
    driverNumber: 1,
    code: 'ONE',
    teamColor: '#3671C6',
    latestDate: '2026-07-05T13:00:10+00:00',
    samples: [
      { tMs: 0, progress: 0.9 },
      { tMs: 10_000, progress: 1.1 },
    ],
  }

  it('clamps to the sampled window instead of extrapolating', () => {
    expect(progressAtTime(car, -5_000)).toBeCloseTo(0.9, 5)
    expect(progressAtTime(car, 60_000)).toBeCloseTo(0.1, 5)
  })

  it('interpolates through the start/finish line without snapping back', () => {
    expect(progressAtTime(car, 5_000)).toBeCloseTo(0, 5)
    expect(progressAtTime(car, 7_500)).toBeCloseTo(0.05, 5)
  })
})
