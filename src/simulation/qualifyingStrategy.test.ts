import { describe, expect, it } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import type { TimedSessionSegmentPlan } from '../types'
import { buildQualifyingReleaseSchedule } from './qualifyingStrategy'

const q1Segment = (): TimedSessionSegmentPlan => ({
  compound: 'S',
  declaredWet: false,
  endsAtSeconds: 18 * 60,
  name: 'Q1',
  participantDriverIds: phaseOneConfig.drivers.map((driver) => driver.id),
  startsAtSeconds: 0,
  suspensionEndsAtSeconds: null,
  suspensionStartsAtSeconds: null,
})

describe('qualifying release strategy', () => {
  it('allocates a deterministic traffic gap to all 30 Q1 cars', () => {
    const options = {
      config: phaseOneConfig,
      participantDriverIds: q1Segment().participantDriverIds,
      runIndex: 0,
      segment: q1Segment(),
      stage: 'qualifying' as const,
    }
    const schedule = buildQualifyingReleaseSchedule(options)
    const ordered = schedule.slice().sort(
      (left, right) => left.pitExitAtSeconds - right.pitExitAtSeconds,
    )

    expect(schedule).toEqual(buildQualifyingReleaseSchedule(options))
    expect(schedule).toHaveLength(30)
    expect(new Set(schedule.map((slot) => slot.driverId)).size).toBe(30)
    expect(schedule.every((slot) => slot.strategy === 'bank-lap')).toBe(true)
    expect(
      schedule.every(
        (slot) => slot.expectedFlyingStartAtSeconds < q1Segment().endsAtSeconds,
      ),
    ).toBe(true)

    for (let index = 1; index < ordered.length; index += 1) {
      expect(
        ordered[index].pitExitAtSeconds - ordered[index - 1].pitExitAtSeconds,
      ).toBeGreaterThanOrEqual(ordered[index].targetTrafficGapSeconds - 0.001)
    }
  })

  it('does not release team-mates consecutively when other cars are available', () => {
    const segment = q1Segment()
    const teamsByDriver = new Map(
      phaseOneConfig.drivers.map((driver) => [driver.id, driver.teamId]),
    )
    const ordered = buildQualifyingReleaseSchedule({
      config: phaseOneConfig,
      participantDriverIds: segment.participantDriverIds,
      runIndex: 2,
      segment,
      stage: 'qualifying',
    }).sort((left, right) => left.pitExitAtSeconds - right.pitExitAtSeconds)

    expect(ordered.every((slot) => slot.strategy === 'track-evolution')).toBe(true)
    expect(
      ordered.every(
        (slot) => slot.expectedFlyingStartAtSeconds < segment.endsAtSeconds,
      ),
    ).toBe(true)
    for (let index = 1; index < ordered.length; index += 1) {
      expect(teamsByDriver.get(ordered[index].driverId)).not.toBe(
        teamsByDriver.get(ordered[index - 1].driverId),
      )
    }
  })
})
