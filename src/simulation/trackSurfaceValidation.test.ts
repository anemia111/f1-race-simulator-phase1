import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import {
  createTrackSurfaceState,
  serializeTrackSurfaceState,
} from './trackSurface'
import {
  isStrictTrackSurfaceSnapshot,
  strictTrackSurfaceStateForTrack,
} from './trackSurfaceValidation'

describe('strict track-surface authority boundary', () => {
  it('returns a config-bound deep copy of exact canonical state', () => {
    const track = tracks[0]
    const source = createTrackSurfaceState({
      profile: track.surfaceProfile,
      sectorMarks: track.sectorMarks,
    })
    source.waterFilmMm[0] = 1.25
    source.bondedRubber[1] = 0.4
    const snapshot = serializeTrackSurfaceState(source)
    const restored = strictTrackSurfaceStateForTrack(snapshot, track)

    expect(restored).not.toBeNull()
    expect(restored?.waterFilmMm[0]).toBe(1.25)
    expect(restored?.bondedRubber[1]).toBe(0.4)

    snapshot.waterFilmMm[0] = 5
    expect(restored?.waterFilmMm[0]).toBe(1.25)
  })

  it('rejects normalizable raw JSON and a different static track identity', () => {
    const track = tracks[0]
    const snapshot = serializeTrackSurfaceState(
      createTrackSurfaceState({
        profile: track.surfaceProfile,
        sectorMarks: track.sectorMarks,
      }),
    )
    const withExtraKey = { ...snapshot, extra: true }
    const outOfRange = {
      ...snapshot,
      waterFilmMm: snapshot.waterFilmMm.map((value, index) =>
        index === 0 ? 999 : value,
      ),
    }
    const differentTrack = {
      ...track,
      sectorMarks: [0, 0.25, 0.75],
    }

    expect(isStrictTrackSurfaceSnapshot(withExtraKey)).toBe(false)
    expect(isStrictTrackSurfaceSnapshot(outOfRange)).toBe(false)
    expect(strictTrackSurfaceStateForTrack(withExtraKey, track)).toBeNull()
    expect(strictTrackSurfaceStateForTrack(outOfRange, track)).toBeNull()
    expect(
      strictTrackSurfaceStateForTrack(snapshot, differentTrack),
    ).toBeNull()
  })
})
