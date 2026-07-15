import { describe, expect, it } from 'vitest'
import type { StewardCase } from '../types'
import {
  blueFlagDecision,
  collisionDecision,
  jumpStartDecision,
  pitLaneSpeedingDecision,
  proceduralPenaltyDeadlineLap,
  stewardCaseDecision,
  trackLimitPenaltyFromWarnings,
  unsafeReleaseDecision,
  vscEndingDeltaDecision,
  vscSpeedingDecision,
  yellowFlagDecision,
} from './stewarding'

const collisionCase = (
  overrides: Partial<StewardCase> = {},
): StewardCase => ({
  id: 'case-1',
  openedAtSeconds: 100,
  resolveAtSeconds: 122,
  driverId: 'attacker',
  otherDriverId: 'defender',
  offence: 'causing-collision',
  article: 'ISC App. L Ch. IV 2(d)',
  responsibilityShare: 0.7,
  consequence: 'significant',
  ...overrides,
})

describe('2026 stewarding guidelines', () => {
  it('uses a black-and-white flag at three track-limit offences and 5s for every offence from four', () => {
    expect(trackLimitPenaltyFromWarnings(0)).toBe(0)
    expect(trackLimitPenaltyFromWarnings(3)).toBe(0)
    expect(trackLimitPenaltyFromWarnings(4)).toBe(5)
    expect(trackLimitPenaltyFromWarnings(5)).toBe(10)
    expect(trackLimitPenaltyFromWarnings(6)).toBe(15)
    expect(trackLimitPenaltyFromWarnings(8)).toBe(25)
  })

  it('requires predominant responsibility and scales a collision sanction by consequence', () => {
    expect(
      collisionDecision(collisionCase({ responsibilityShare: 0.5 })).kind,
    ).toBeNull()
    expect(collisionDecision(collisionCase({ consequence: 'minor' }))).toMatchObject({
      kind: 'time-5',
      penaltyPoints: 1,
    })
    expect(collisionDecision(collisionCase())).toMatchObject({
      kind: 'time-10',
      penaltyPoints: 2,
    })
    expect(
      collisionDecision(
        collisionCase({ consequence: 'major', responsibilityShare: 0.75 }),
      ),
    ).toMatchObject({ kind: 'drive-through', penaltyPoints: 3 })
    expect(
      collisionDecision(collisionCase({ consequence: 'reckless' })),
    ).toMatchObject({ kind: 'stop-go-10', penaltyPoints: 4 })
  })

  it('applies the official pit-lane speeding threshold ladder', () => {
    expect(pitLaneSpeedingDecision(0).kind).toBeNull()
    expect(pitLaneSpeedingDecision(5.9).kind).toBe('time-5')
    expect(pitLaneSpeedingDecision(6).kind).toBe('drive-through')
    expect(pitLaneSpeedingDecision(15).kind).toBe('drive-through')
    expect(pitLaneSpeedingDecision(15.1).kind).toBe('stop-go-10')
  })

  it('scales VSC sanctions by red sectors and end-delta deficit', () => {
    expect(vscSpeedingDecision(1).kind).toBeNull()
    expect(vscSpeedingDecision(2).kind).toBe('time-5')
    expect(vscSpeedingDecision(4).kind).toBe('time-10')
    expect(vscSpeedingDecision(5).kind).toBe('drive-through')
    expect(vscSpeedingDecision(6).kind).toBe('stop-go-10')
    expect(vscEndingDeltaDecision(0).kind).toBeNull()
    expect(vscEndingDeltaDecision(3).kind).toBe('time-5')
    expect(vscEndingDeltaDecision(3.1).kind).toBe('time-10')
    expect(vscEndingDeltaDecision(5.1).kind).toBe('drive-through')
  })

  it('scales false starts and unsafe releases rather than imposing a fixed 5s', () => {
    expect(jumpStartDecision(0).kind).toBeNull()
    expect(jumpStartDecision(0.2).kind).toBe('time-5')
    expect(jumpStartDecision(0.7).kind).toBe('time-10')
    expect(jumpStartDecision(2).kind).toBe('drive-through')
    expect(jumpStartDecision(4).kind).toBe('stop-go-10')
    expect(unsafeReleaseDecision({ gapSeconds: 0.4 }).kind).toBe('time-5')
    expect(unsafeReleaseDecision({ gapSeconds: 0.3 }).kind).toBe('time-10')
    expect(unsafeReleaseDecision({ gapSeconds: 0.1 }).kind).toBe('drive-through')
    expect(unsafeReleaseDecision({ gapSeconds: 0.42 }).kind).toBeNull()
  })

  it('distinguishes an unsafe rejoin from an ordinary track-limit strike', () => {
    expect(
      stewardCaseDecision(
        collisionCase({
          offence: 'unsafe-rejoin',
          article: 'B1.8.6 / ISC App. L Ch. IV 2(c)',
          consequence: 'significant',
        }),
      ),
    ).toMatchObject({ kind: 'time-10', penaltyPoints: 2 })
  })

  it('uses different sanctions for ignored blue, single-yellow and double-yellow signals', () => {
    expect(blueFlagDecision(4.9).kind).toBeNull()
    expect(blueFlagDecision(5).kind).toBe('time-5')
    expect(blueFlagDecision(9).kind).toBe('time-10')
    expect(blueFlagDecision(12).kind).toBe('drive-through')
    expect(yellowFlagDecision(false)).toMatchObject({
      kind: 'time-10',
      penaltyPoints: 3,
    })
    expect(yellowFlagDecision(true)).toMatchObject({
      kind: 'stop-go-10',
      penaltyPoints: 3,
    })
  })

  it('allows two line crossings for a procedural penalty and three in the final three laps', () => {
    expect(proceduralPenaltyDeadlineLap(20, 57)).toBe(22)
    expect(proceduralPenaltyDeadlineLap(55, 57)).toBe(58)
  })
})
