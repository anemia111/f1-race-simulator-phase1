import { describe, expect, it } from 'vitest'
import { phaseOneConfig } from '../data/phaseOne'
import type { TimedSessionSegmentPlan } from '../types'
import { buildQualifyingReleaseSchedule } from './qualifyingStrategy'
import { seriesPackageById } from '../series/seriesRegistry'
import { runSeriesQualifying } from './qualifying'

const q1Segment = (): TimedSessionSegmentPlan => ({
  declaredWet: false,
  endsAtSeconds: 18 * 60,
  name: 'Q1',
  participantDriverIds: phaseOneConfig.drivers.map((driver) => driver.id),
  startsAtSeconds: 0,
  suspensionEndsAtSeconds: null,
  suspensionStartsAtSeconds: null,
  tire: {
    compound: 'S',
    kind: 'f1-pirelli-session-tire',
  },
})

describe('qualifying release strategy', () => {
  it('allocates a deterministic traffic gap to every Q1 car', () => {
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
    const fieldSize = phaseOneConfig.drivers.length
    expect(schedule).toHaveLength(fieldSize)
    expect(new Set(schedule.map((slot) => slot.driverId)).size).toBe(fieldSize)
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

describe('SUPER FORMULA grouped qualifying', () => {
  it('sends the fastest six of each Q1 group through to Q2', () => {
    const sf = seriesPackageById.get('super-formula')!
    const results = runSeriesQualifying(
      {
        drivers: sf.drivers,
        seed: 'sf-grouped-advance',
        seriesId: sf.id,
        teams: sf.teams,
        track: { ...sf.tracks[0], rainProbability: 0 },
        weekendStage: 'qualifying',
      },
      sf.rules,
    )
    const q1 = results.segments[0]
    const q2 = results.segments[1]
    const eliminated = new Set(q1.eliminatedDriverIds)
    const advanced = q1.results.filter((r) => !eliminated.has(r.driverId))

    expect(q2.results).toHaveLength(12)
    for (const group of ['A', 'B'] as const) {
      const inGroup = q1.results.filter((r) => r.qualifyingGroup === group)
      const advancedInGroup = advanced.filter(
        (r) => r.qualifyingGroup === group,
      )

      expect(advancedInGroup).toHaveLength(6)
      // They are the six fastest of that group, not the six fastest overall.
      const fastestSix = inGroup
        .slice()
        .sort((l, r) => l.lapTimeSeconds - r.lapTimeSeconds)
        .slice(0, 6)
        .map((r) => r.driverId)
        .sort()
      expect(advancedInGroup.map((r) => r.driverId).sort()).toEqual(fastestSix)
    }
  })
})
