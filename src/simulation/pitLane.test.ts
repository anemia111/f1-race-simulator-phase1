import { describe, expect, it } from 'vitest'
import { initialTeams } from '../data/grid2026'
import { tracks } from '../data/tracks'
import {
  pitBoxProgress,
  pitBoxProgressForTeam,
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
})
