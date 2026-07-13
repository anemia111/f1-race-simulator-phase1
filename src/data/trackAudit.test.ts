import { describe, expect, it } from 'vitest'
import { tracks } from './tracks'
import { auditTrackCalendar } from './trackAudit'

describe('2026 track data packs', () => {
  it('contains 24 audited circuits with only the documented Madrid fallback', () => {
    const audit = auditTrackCalendar(tracks)

    expect(audit.trackCount).toBe(24)
    expect(audit.realLayoutCount).toBe(23)
    expect(audit.fallbackLayoutCount).toBe(1)
    expect(audit.cancelledCount).toBe(2)
    expect(audit.errorCount).toBe(0)
    expect(audit.scorePercent).toBeLessThan(100)
    expect(audit.issues).toEqual([
      expect.objectContaining({ trackId: 'madrid-approx', severity: 'warning' }),
    ])
  })
})
