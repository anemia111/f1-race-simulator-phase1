import { describe, expect, it } from 'vitest'
import { tracks } from '../data/tracks'
import type { TrackDefinition } from '../types'
import { resolveSourceBackedRoadGrip } from './physicalSurfaceMeasurements'

describe('source-backed road-surface coefficient boundary', () => {
  it('keeps every shipped numeric circuit coefficient unavailable', () => {
    for (const track of tracks) {
      expect(resolveSourceBackedRoadGrip(track)).toMatchObject({
        numericCoefficient: null,
        reason: 'numeric-track-surface-coefficient-not-published',
        status: 'unavailable',
        trackId: track.id,
      })
    }
  })

  it('retains qualitative Pirelli evidence without converting it to a number', () => {
    for (const trackId of ['zandvoort-approx', 'madrid-approx']) {
      const track = tracks.find((candidate) => candidate.id === trackId)!
      const resolution = resolveSourceBackedRoadGrip(track)

      expect(resolution.status).toBe('unavailable')
      if (resolution.status === 'unavailable') {
        expect(resolution.observations).toHaveLength(1)
        expect(resolution.observations[0].numericCoefficient).toBeNull()
        expect(resolution.observations[0].sourceUrl).toContain('pirelli.com')
      }
    }
  })

  it('accepts an explicitly sourced observed multiplier', () => {
    const reference = tracks[0]
    const observedTrack: Pick<TrackDefinition, 'id' | 'surfaceProfile'> = {
      id: reference.id,
      surfaceProfile: {
        baseFriction: 0.97,
        source: 'observed',
        sourceLabel: 'Test-only instrumented road measurement',
        sourceUrl: 'https://example.test/road-measurement',
      },
    }

    expect(resolveSourceBackedRoadGrip(observedTrack)).toMatchObject({
      coefficientKind: 'relative-base-grip-multiplier',
      profile: { baseFriction: 0.97, source: 'observed' },
      status: 'available',
    })
  })

  it('does not promote simulator policy to measured surface data', () => {
    const reference = tracks[0]
    expect(
      resolveSourceBackedRoadGrip({
        id: reference.id,
        surfaceProfile: {
          baseFriction: 0.97,
          source: 'simulator-policy',
          sourceLabel: 'Policy only',
          sourceUrl: 'https://example.test/policy',
        },
      }),
    ).toMatchObject({ status: 'unavailable' })
  })
})
