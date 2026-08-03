import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { trackDynamicsAt } from './trackDynamics'
import {
  TIMED_TRAFFIC_PRIORITY,
  timedSessionTrafficPriority,
  timedSessionYieldDecision,
} from './timedSessionTraffic'

function safeStraightProgress() {
  const track = tracks[0]

  return (
    Array.from({ length: 1_000 }, (_, index) => index / 1_000).find(
      (progress) => {
        const dynamics = trackDynamicsAt(track, progress)

        return (
          dynamics.straightness >= 0.7 &&
          dynamics.brakingSeverity < 0.2 &&
          dynamics.referenceSpeedKph >= 175
        )
      },
    ) ?? 0
  )
}

function timedCar(options: {
  driverId: string
  phase: CarSnapshot['timedRunPhase']
  practiceProgram?: CarSnapshot['practiceProgram']
  progress: number
  speedKph?: number
}) {
  return {
    driverId: options.driverId,
    practiceProgram: options.practiceProgram ?? null,
    progress: options.progress,
    speedKph: options.speedKph ?? 200,
    status: 'running' as const,
    timedRunPhase: options.phase,
  }
}

describe('timed-session traffic etiquette', () => {
  it('orders attack, long-run and preparation traffic correctly', () => {
    expect(
      timedSessionTrafficPriority(
        timedCar({
          driverId: 'attack',
          phase: 'attack-lap',
          practiceProgram: 'qualifying-simulation',
          progress: 0,
        }),
        'fp2',
      ),
    ).toBe(TIMED_TRAFFIC_PRIORITY.qualifyingAttackLap)
    expect(
      timedSessionTrafficPriority(
        timedCar({
          driverId: 'long',
          phase: 'attack-lap',
          practiceProgram: 'race-simulation',
          progress: 0,
        }),
        'fp2',
      ),
    ).toBe(TIMED_TRAFFIC_PRIORITY.attackLap)
    expect(
      timedSessionTrafficPriority(
        timedCar({
          driverId: 'out',
          phase: 'out-lap',
          progress: 0,
        }),
        'fp2',
      ),
    ).toBe(TIMED_TRAFFIC_PRIORITY.transitLap)
  })

  it('puts a long run above a lap on its way to or from the pits', () => {
    const longRun = timedSessionTrafficPriority(
      timedCar({
        driverId: 'long-run',
        phase: null,
        practiceProgram: 'race-simulation',
        progress: 0,
      }),
      'fp2',
    )
    const inLap = timedSessionTrafficPriority(
      timedCar({ driverId: 'in', phase: 'in-lap', progress: 0 }),
      'fp2',
    )
    const attack = timedSessionTrafficPriority(
      timedCar({ driverId: 'attack', phase: 'attack-lap', progress: 0 }),
      'fp2',
    )

    // Measured work outranks a transit lap. This used to be the other way
    // round, so a driver mid-stint gave way to one heading for the pits.
    expect(longRun).toBeGreaterThan(inLap)
    expect(attack).toBeGreaterThan(longRun)
  })

  it('asks the lower-priority car to lift only at a safe passing point', () => {
    const track = tracks[0]
    const progress = safeStraightProgress()
    const attackSpeedKph = 216
    const requestedGapSeconds = 1.5
    const gapMeters = (attackSpeedKph / 3.6) * requestedGapSeconds
    const preparationCar = timedCar({
      driverId: 'preparation',
      phase: 'out-lap',
      progress,
    })
    const attackCar = timedCar({
      driverId: 'attack',
      phase: 'attack-lap',
      practiceProgram: 'qualifying-simulation',
      progress:
        (progress - gapMeters / (track.lengthKm * 1_000) + 1) % 1,
      speedKph: attackSpeedKph,
    })
    const decision = timedSessionYieldDecision({
      car: preparationCar,
      cars: [preparationCar, attackCar],
      stage: 'fp2',
      track,
    })

    expect(decision.approachingDriverId).toBe('attack')
    expect(decision.gapMeters).toBeCloseTo(gapMeters, 5)
    expect(decision.gapSeconds).toBeCloseTo(requestedGapSeconds, 5)
    expect(decision.safePassingPoint).toBe(true)
    expect(decision.shouldYield).toBe(true)
  })

  it('does not make an attack lap yield to a lower-priority car', () => {
    const track = tracks[0]
    const progress = safeStraightProgress()
    const attackCar = timedCar({
      driverId: 'attack',
      phase: 'attack-lap',
      practiceProgram: 'qualifying-simulation',
      progress,
    })
    const outLapCar = timedCar({
      driverId: 'out',
      phase: 'out-lap',
      progress:
        (progress - (200 / 3.6) / (track.lengthKm * 1_000) + 1) % 1,
    })

    expect(
      timedSessionYieldDecision({
        car: attackCar,
        cars: [attackCar, outLapCar],
        stage: 'fp2',
        track,
      }).shouldYield,
    ).toBe(false)
  })

  it('is exactly independent of the legacy base lap target', () => {
    const track = tracks[0]
    const progress = safeStraightProgress()
    const preparationCar = timedCar({
      driverId: 'preparation',
      phase: 'out-lap',
      progress,
      speedKph: 150,
    })
    const attackCar = timedCar({
      driverId: 'attack',
      phase: 'attack-lap',
      practiceProgram: 'qualifying-simulation',
      progress:
        (progress - 80 / (track.lengthKm * 1_000) + 1) % 1,
      speedKph: 240,
    })
    const decide = (baseLapTime: number) =>
      timedSessionYieldDecision({
        car: preparationCar,
        cars: [preparationCar, attackCar],
        stage: 'fp2',
        track: { ...track, baseLapTime },
      })

    expect(decide(40)).toEqual(decide(400))
  })
})
