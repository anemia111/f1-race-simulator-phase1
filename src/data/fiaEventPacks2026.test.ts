import { describe, expect, it } from 'vitest'
import { tracks } from './tracks'
import { fiaEventPackFor, fiaEventPacks2026 } from './fiaEventPacks2026'

describe('2026 FIA event packs', () => {
  it('covers every selectable circuit without claiming linked PDFs are normalized', () => {
    expect(fiaEventPacks2026).toHaveLength(tracks.length)

    for (const track of tracks) {
      const pack = fiaEventPackFor(track.id)
      expect(pack?.documents.eventPageUrl).toMatch(/^https:\/\/www\.fia\.com\//)
      expect(pack?.normalizedOperationalData).toBe(false)
    }
  })

  it('keeps cancelled and future events explicit', () => {
    expect(fiaEventPackFor('bahrain-approx')?.status).toBe('cancelled')
    expect(fiaEventPackFor('spa-approx')?.status).toBe('pending')
    expect(fiaEventPackFor('suzuka-approx')?.documents.circuitMapUrl).toContain(
      '2026_japanese_grand_prix',
    )
  })
})
