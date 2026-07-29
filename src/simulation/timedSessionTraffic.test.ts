import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { trackDynamicsAt } from './trackDynamics'
import {
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
}) {
  return {
    driverId: options.driverId,
    practiceProgram: options.practiceProgram ?? null,
    progress: options.progress,
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
    ).toBe(3)
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
    ).toBe(2)
    expect(
      timedSessionTrafficPriority(
        timedCar({
          driverId: 'out',
          phase: 'out-lap',
          progress: 0,
        }),
        'fp2',
      ),
    ).toBe(1)
  })

  it('asks the lower-priority car to lift only at a safe passing point', () => {
    const track = tracks[0]
    const progress = safeStraightProgress()
    const preparationCar = timedCar({
      driverId: 'preparation',
      phase: 'out-lap',
      progress,
    })
    const attackCar = timedCar({
      driverId: 'attack',
      phase: 'attack-lap',
      practiceProgram: 'qualifying-simulation',
      progress: (progress - 1.5 / track.baseLapTime + 1) % 1,
    })
    const decision = timedSessionYieldDecision({
      car: preparationCar,
      cars: [preparationCar, attackCar],
      stage: 'fp2',
      track,
    })

    expect(decision.approachingDriverId).toBe('attack')
    expect(decision.gapSeconds).toBeCloseTo(1.5, 5)
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
      progress: (progress - 1 / track.baseLapTime + 1) % 1,
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
})
