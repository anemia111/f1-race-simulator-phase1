import { describe, expect, it } from 'vitest'
import { initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import {
  forwardProgressBetween,
  pitBoxProgress,
  pitBoxProgressForTeam,
  pitLaneMotionAt,
  wrappedProgressSpan,
} from './pitLane'

describe('pit-lane geometry', () => {
  it('keeps every team box between pit entry and exit', () => {
    for (const track of tracks) {
      const entry = track.pitLane!.entryProgress
      const exit = track.pitLane!.exitProgress
      const laneSpan = wrappedProgressSpan(entry, exit)

      for (let slot = 0; slot < track.pitLane!.boxCount; slot += 1) {
        const box = pitBoxProgress(track, slot)
        expect(wrappedProgressSpan(entry, box)).toBeLessThan(laneSpan)
      }
    }
  })

  it('packs the garages around the start-finish straight', () => {
    for (const track of tracks) {
      const first = pitBoxProgress(track, 0)
      const last = pitBoxProgress(track, track.pitLane!.boxCount - 1)

      expect(wrappedProgressSpan(first, last)).toBeLessThan(0.025)
    }
  })

  it('gives teammates one stable garage and separates other teams', () => {
    const track = tracks[0]
    const firstMcLaren = pitBoxProgressForTeam(
      track,
      initialTeams,
      'mclaren',
    )
    const secondMcLaren = pitBoxProgressForTeam(
      track,
      initialTeams,
      'mclaren',
    )
    const ferrari = pitBoxProgressForTeam(track, initialTeams, 'ferrari')

    expect(firstMcLaren).toBe(secondMcLaren)
    expect(firstMcLaren).not.toBe(ferrari)
  })

  it('moves forward through a wrapped pit lane without reversing', () => {
    const entry = 0.94
    const box = 0.98
    const exit = 0.055
    const samples = Array.from({ length: 11 }, (_, index) =>
      forwardProgressBetween(entry, exit, index / 10),
    )

    expect(samples[0]).toBeCloseTo(entry)
    expect(samples.at(-1)).toBeCloseTo(exit)

    for (let index = 1; index < samples.length; index += 1) {
      expect(wrappedProgressSpan(entry, samples[index])).toBeGreaterThanOrEqual(
        wrappedProgressSpan(entry, samples[index - 1]),
      )
    }

    expect(wrappedProgressSpan(entry, box)).toBeLessThan(
      wrappedProgressSpan(entry, exit),
    )
  })

  it('drives to the box, stops for service, then drives to the exit', () => {
    const entry = 0.94
    const box = 0.98
    const exit = 0.055
    const arrival = pitLaneMotionAt(0, entry, box, exit)
    const serviceStart = pitLaneMotionAt(0.24, entry, box, exit)
    const serviceEnd = pitLaneMotionAt(0.71, entry, box, exit)
    const departure = pitLaneMotionAt(0.8, entry, box, exit)
    const released = pitLaneMotionAt(1, entry, box, exit)

    expect(arrival).toEqual({ phase: 'lane', progress: entry })
    expect(serviceStart).toEqual({ phase: 'box', progress: box })
    expect(serviceEnd).toEqual({ phase: 'box', progress: box })
    expect(departure.phase).toBe('exit')
    expect(wrappedProgressSpan(box, departure.progress)).toBeGreaterThan(0)
    expect(released.phase).toBe('exit')
    expect(released.progress).toBeCloseTo(exit)
  })
})
