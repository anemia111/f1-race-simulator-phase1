import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import { resolvedTerminalSpeedKph } from './longitudinalTravel'
import { progressForProfileDistance, profileDistanceKmBetween } from './trackDynamics'

describe('integrated travel and terminal velocity', () => {
  it('retains terminal speed instead of feeding mean speed into the next tick', () => {
    expect(resolvedTerminalSpeedKph({ requestedDistanceM: 100, resolvedDistanceM: 100,
      forceEndSpeedKph: 72, startSpeedKph: 0, deltaSeconds: 10 })).toBe(72)
  })
  it('caps terminal speed by resolved traffic pace without parking a rolling queue', () => {
    expect(resolvedTerminalSpeedKph({ requestedDistanceM: 100, resolvedDistanceM: 50,
      forceEndSpeedKph: 72, startSpeedKph: 0, deltaSeconds: 10 })).toBe(18)
    expect(resolvedTerminalSpeedKph({ requestedDistanceM: 4, resolvedDistanceM: 0.625,
      forceEndSpeedKph: 300, startSpeedKph: 310, deltaSeconds: 0.05 })).toBe(45)
    expect(resolvedTerminalSpeedKph({ requestedDistanceM: 100, resolvedDistanceM: 0,
      forceEndSpeedKph: 72, startSpeedKph: 100, deltaSeconds: 10 })).toBe(0)
  })
  it('converts physical distance through uneven vertices and multiple timing-line crossings', () => {
    const track = tracks.find(track => track.id === 'suzuka-approx')!
    for (const start of [0.01, 0.999, 3.997]) for (const distanceM of [0, 2.7, 150, 12000]) {
      const end = start + progressForProfileDistance(track, start, distanceM)
      expect(profileDistanceKmBetween(track, start, end) * 1000).toBeCloseTo(distanceM, 7)
    }
  })
})
