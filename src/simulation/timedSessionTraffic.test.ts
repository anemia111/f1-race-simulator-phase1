import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { CarSnapshot } from '../types'
import { trackDynamicsAt } from './trackDynamics'
import {
  TIMED_TRAFFIC_PRIORITY,
  timedSessionTrafficPriority,
  timedSessionYieldDecision,
  timedOutLapGapDecision,
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
  const gapDecision = (frontGapSeconds: number, overrides: { remainingSessionSeconds?: number; frontSpeed?: number; phase?: CarSnapshot['timedRunPhase']; rearAttack?: boolean; progress?: number } = {}) => {
    const track = tracks[0]
    const progress = overrides.progress ?? 0.5
    const speed = trackDynamicsAt(track, progress).referenceSpeedKph
    const car = timedCar({ driverId: 'preparing', phase: overrides.phase ?? 'out-lap', progress, speedKph: speed * 0.84 })
    const frontProgress = (progress + frontGapSeconds * speed / 3.6 / (track.lengthKm * 1000)) % 1
    const front = timedCar({ driverId: 'front', phase: 'out-lap', progress: frontProgress, speedKph: trackDynamicsAt(track, frontProgress).referenceSpeedKph * (overrides.frontSpeed ?? 0.84) })
    const rear = timedCar({ driverId: 'flying', phase: 'attack-lap', progress: (progress - 100 / (track.lengthKm * 1000) + 1) % 1, speedKph: 240 })
    return timedOutLapGapDecision({ car, cars: [car, front, ...(overrides.rearAttack ? [rear] : [])], track, stage: 'qualifying', seed: 'air-gap', runIndex: 0, remainingSessionSeconds: overrides.remainingSessionSeconds ?? 500 })
  }

  it('opens clean air before launch and anticipates a slower preparation car', () => {
    expect(gapDecision(2).speedScale).toBeLessThan(0.9)
    expect(gapDecision(12).speedScale).toBe(1)
    expect(gapDecision(9, { frontSpeed: 0.65 }).speedScale).toBeLessThan(1)
    expect(gapDecision(2)).toEqual(gapDecision(2))
  })

  it('prioritizes flying traffic, the flag deadline and committing to an attack', () => {
    expect(gapDecision(2, { rearAttack: true }).speedScale).toBe(1)
    expect(gapDecision(2, { remainingSessionSeconds: 10 }).speedScale).toBe(1)
    expect(gapDecision(2, { phase: 'attack-lap' }).speedScale).toBe(1)
    expect(gapDecision(2, { progress: 0.999 }).speedScale).toBe(1)
  })

  it('ranks attack above out above in in both qualifying formats', () => {
    for (const stage of ['qualifying', 'sprintQualifying', 'qualifying2'] as const) {
      const priority = (phase: CarSnapshot['timedRunPhase']) => timedSessionTrafficPriority(timedCar({ driverId: 'car', phase, progress: 0 }), stage)
      expect(priority('attack-lap')).toBeGreaterThan(priority('out-lap'))
      expect(priority('out-lap')).toBeGreaterThan(priority('in-lap'))
    }
  })

  it('keeps yielding for a second flying car and clears only after the train passes', () => {
    const track = tracks[0]
    const progress = safeStraightProgress()
    const car = { ...timedCar({ driverId: 'preparing', phase: 'in-lap', progress }), timedTrafficYield: true }
    const following = [100, 300].map((distance, index) => timedCar({ driverId: `flying-${index}`, phase: 'attack-lap', speedKph: 240, progress: (progress - distance / (track.lengthKm * 1000) + 1) % 1 }))
    const decide = (cars: typeof following) => timedSessionYieldDecision({ car, cars: [car, ...cars], stage: 'qualifying', track })
    expect(decide(following).approachingDriverIds).toHaveLength(2)
    expect(decide(following.slice(1)).shouldYield).toBe(true)
    const justPassed = { ...following[1], progress: (progress + 30 / (track.lengthKm * 1000)) % 1 }
    expect(decide([justPassed]).shouldYield).toBe(true)
    expect(decide([]).shouldYield).toBe(false)
  })

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
    ).toBe(TIMED_TRAFFIC_PRIORITY.outLap)
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
