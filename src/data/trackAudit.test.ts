import { describe, expect, it } from 'vitest'
import { tracks } from './tracks'
import { auditTrackCalendar } from './trackAudit'

describe('2026 track data packs', () => {
  it('contains 24 audited circuits with verified geometry', () => {
    const audit = auditTrackCalendar(tracks)

    expect(audit.trackCount).toBe(24)
    expect(audit.realLayoutCount).toBe(24)
    expect(audit.fallbackLayoutCount).toBe(0)
    expect(audit.cancelledCount).toBe(2)
    expect(audit.errorCount).toBe(0)
    expect(audit.warningCount).toBe(0)
    expect(audit.scorePercent).toBe(100)
    expect(audit.issues).toEqual([])
  })

  it('uses the official 2026 MADRING vector layout without inventing a telemetry projection', () => {
    const madrid = tracks.find((track) => track.id === 'madrid-approx')!

    expect(madrid.name).toBe('MADRING')
    expect(madrid.kind).toBe('hybrid')
    expect(madrid.lengthKm).toBe(5.416)
    expect(madrid.raceLaps).toBe(57)
    expect(madrid.centerline).toHaveLength(156)
    expect(madrid.centerline[1][2]).toBeLessThan(madrid.centerline[0][2])
    expect(madrid.corners?.map((corner) => corner.number)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 1),
    )
    expect(madrid.layoutSource).toMatchObject({
      detail: 'real',
      label: 'MADRING 2026',
      provider: 'official',
      url: 'https://www.madring.com/circuito',
      year: 2026,
    })
    expect(madrid.locationProjection).toBeUndefined()
    expect(madrid.sectorMarksSource).toBe('derived')
  })
})
