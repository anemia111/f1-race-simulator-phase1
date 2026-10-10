import { describe, expect, it } from 'vitest'
import { tirePaceGapsByTrack } from '../data/tirePaceGaps'
import { tracks } from '../data/tracks'
import { crossCategoryCoursePacks } from '../freeMode/crossCategoryTracks'
import { initialDrivers, initialTeams } from '../data/grid2026'
import { categoryPhysicsFor } from './categoryPhysics'
import { createInitialRace } from './race'
import { calculateCarTelemetry } from './telemetry'
import { trackDynamicsAt } from './trackDynamics'
import { simulatePhysicalLap } from './physicalLap'
import { compoundReferenceLapOptions, freshCompoundGripFor } from './tireCompoundPace'
import { freshTireOffsetSeconds, tireDeltaSeconds } from './tires'

describe('user-authored fresh compound pace targets', () => {
  it('retains all 24 entries and keeps Imola separate from Madrid', () => {
    expect(Object.keys(tirePaceGapsByTrack)).toHaveLength(24)
    expect(tirePaceGapsByTrack['imola-approx']).toMatchObject({ hardToMedium: 0.3, mediumToSoft: 0.125 })
    expect(tirePaceGapsByTrack['madrid-approx']).toBeUndefined()
    expect(tracks.find(track => track.id === 'barcelona-approx')?.tirePaceGaps)
      .toMatchObject({ hardToMedium: 0.95, mediumToSoft: 0.65 })
    expect(tracks.filter(track => track.tirePaceGaps)).toHaveLength(23)
  })

  it.each(tracks.filter(track => track.tirePaceGaps))('$id fits the isolated reference lap without overwriting live timing', (track) => {
    const gaps = track.tirePaceGaps!
    const lapAt = (compound: 'H' | 'M' | 'S') => simulatePhysicalLap(track, {
      ...compoundReferenceLapOptions, gripMultiplier: freshCompoundGripFor(track, compound),
    }).lapTimeSeconds
    const medium = lapAt('M')
    expect(lapAt('H') - medium).toBeCloseTo(gaps.hardToMedium, 2)
    expect(medium - lapAt('S')).toBeCloseTo(gaps.mediumToSoft, 2)
    expect(freshCompoundGripFor(track, 'H')).toBeLessThan(1)
    expect(freshCompoundGripFor(track, 'S')).toBeGreaterThan(1)
    expect(freshTireOffsetSeconds('H', track.tireNomination, gaps)).toBe(gaps.hardToMedium)
    expect(freshTireOffsetSeconds('S', track.tireNomination, gaps)).toBe(-gaps.mediumToSoft)
  }, 60000)

  it('uses authored offsets ahead of observed pace while preserving age degradation', () => {
    const track = tracks.find(track => track.id === 'baku-approx')!
    const delta = (age: number, compound: 'H' | 'M' | 'S') => tireDeltaSeconds(
      compound, age, 0.8, 'clear', 1, undefined, 0, track.tireNomination,
      { paceOffsetSeconds: 9, sampleCount: 40 }, 0, undefined, undefined, track.tirePaceGaps,
    )
    expect(delta(0, 'H') - delta(0, 'M')).toBe(0.45)
    expect(delta(0, 'M') - delta(0, 'S')).toBe(0.1)
    expect(delta(10, 'S')).toBeGreaterThan(delta(0, 'S'))
  })

  it('carries the supplied Imola gaps into the imported WEC layout for F1 Free Mode', () => {
    const track = crossCategoryCoursePacks.find(pack => pack.id === 'imola')!.track
    expect(track.tirePaceGaps).toEqual(tirePaceGapsByTrack['imola-approx'])
    const seconds = (compound: 'H' | 'M' | 'S') => simulatePhysicalLap(track, {
      ...compoundReferenceLapOptions, gripMultiplier: freshCompoundGripFor(track, compound),
    }).lapTimeSeconds
    expect(seconds('H') - seconds('M')).toBeCloseTo(0.3, 2)
    expect(seconds('M') - seconds('S')).toBeCloseTo(0.125, 2)
  })

  it('keeps wet tyres and unconfigured tracks outside the dry-pace fit', () => {
    const track = tracks[0]
    expect(freshCompoundGripFor(track, 'I')).toBe(1)
    expect(freshCompoundGripFor(track, 'W')).toBe(1)
    expect(freshCompoundGripFor({ ...track, tirePaceGaps: undefined }, 'S')).toBe(1)
  })

  it('feeds live tyre force while allowing slipstream to change the resulting speed', () => {
    const track = tracks.find(track => track.id === 'monza-approx')!
    const driver = initialDrivers[0]
    const team = initialTeams.find(candidate => candidate.id === driver.teamId)!
    const physics = categoryPhysicsFor('f1-custom')
    const initial = createInitialRace({ drivers: [driver], teams: [team], track, seed: 'compound-pace-tow' }).cars[0]
    if (initial.runtimeSystems.kind !== 'f1') throw new Error('Expected F1 fixture')
    const runtime = initial.runtimeSystems
    const progress = Array.from({ length: 96 }, (_, i) => i / 96)
      .sort((a, b) => trackDynamicsAt(track, b, physics).straightLengthAheadMeters - trackDynamicsAt(track, a, physics).straightLengthAheadMeters)[0]
    const speed = (compound: 'H' | 'M' | 'S', speedKph: number, gapToAhead: number) => calculateCarTelemetry({
      car: {
        ...initial, progress, totalDistance: progress, speedKph, gapToAhead,
        throttlePercent: 100, clutchEngagementFraction: 1, turboSpoolFraction: 1,
        status: 'running', pitPhase: 'none', timedRunPhase: null,
        runtimeSystems: { ...runtime, tires: { ...runtime.tires,
          tire: compound, tireWearPercent: 0, tireThermalStressPercent: 0,
          tireGrainingPercent: 0, tireOverheatingPercent: 0,
          tireTemperatureC: 98, tireCarcassTemperatureC: 98,
        } },
      }, driver, team, track, categoryPhysics: physics, deltaSeconds: 0.25,
      elapsedSeconds: 120, raceLap: 2, phase: null, lowGripConditions: false,
      trackGrip: 1, weather: 'clear',
    }).speedKph
    expect(speed('S', 28, 10)).toBeGreaterThan(speed('H', 28, 10))
    expect(speed('M', 250, 0.4)).toBeGreaterThan(speed('M', 250, 10))
  })
})
