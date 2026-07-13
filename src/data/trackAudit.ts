import type { TrackDefinition } from '../types'

export type TrackAuditIssue = {
  field: string
  message: string
  severity: 'error' | 'warning'
  trackId: string
}

export type TrackCalendarAudit = {
  cancelledCount: number
  derivedOperationalCount: number
  errorCount: number
  fallbackLayoutCount: number
  issues: TrackAuditIssue[]
  realLayoutCount: number
  scorePercent: number
  trackCount: number
  warningCount: number
}

const validProgress = (value: number) => value >= 0 && value <= 1

export function auditTrackCalendar(
  tracks: TrackDefinition[],
): TrackCalendarAudit {
  const issues: TrackAuditIssue[] = []
  const add = (
    track: TrackDefinition,
    field: string,
    severity: TrackAuditIssue['severity'],
    message: string,
  ) => issues.push({ field, message, severity, trackId: track.id })

  const ids = new Set<string>()
  const slots = new Set<number>()

  for (const track of tracks) {
    if (ids.has(track.id)) {
      add(track, 'id', 'error', 'Duplicate track id')
    }
    ids.add(track.id)

    if (!track.calendar2026) {
      add(track, 'calendar2026', 'error', 'Missing 2026 calendar record')
    } else if (slots.has(track.calendar2026.calendarSlot)) {
      add(track, 'calendar2026.calendarSlot', 'error', 'Duplicate calendar slot')
    } else {
      slots.add(track.calendar2026.calendarSlot)
    }

    if (track.centerline.length < 32 && track.layoutSource?.detail === 'real') {
      add(track, 'centerline', 'error', 'Observed layout has too few points')
    }

    if (track.layoutSource?.detail !== 'real') {
      add(
        track,
        'layoutSource',
        track.id === 'madrid-approx' ? 'warning' : 'error',
        'OpenF1 circuit layout unavailable; fallback active',
      )
    }

    if (
      track.sectorMarks.length !== 3 ||
      track.sectorMarks[0] !== 0 ||
      !track.sectorMarks.every(validProgress) ||
      track.sectorMarks[1] >= track.sectorMarks[2]
    ) {
      add(track, 'sectorMarks', 'error', 'Invalid sector timing boundaries')
    }

    if (track.lengthKm < 3 || track.lengthKm > 8) {
      add(track, 'lengthKm', 'error', 'Circuit length outside F1 range')
    }

    if (!track.raceLaps || track.raceLaps < 30 || track.raceLaps > 90) {
      add(track, 'raceLaps', 'error', 'Missing or invalid Grand Prix lap count')
    }

    if (
      !track.pitLane ||
      !validProgress(track.pitLane.entryProgress) ||
      !validProgress(track.pitLane.exitProgress) ||
      ![60, 80].includes(track.pitLane.speedLimitKph)
    ) {
      add(track, 'pitLane', 'error', 'Invalid pit-lane geometry or speed limit')
    }

    if (!track.aeroActivationZones?.length) {
      add(track, 'aeroActivationZones', 'error', 'Missing active-aero zones')
    }

    if (!track.overtakeControlLines?.length) {
      add(track, 'overtakeControlLines', 'error', 'Missing Overtake control lines')
    }

    if (!track.tireNomination) {
      add(track, 'tireNomination', 'error', 'Missing tire nomination')
    }
  }

  if (tracks.length !== 24 && tracks[0]) {
    add(tracks[0], 'calendar', 'error', `Expected 24 track packs, found ${tracks.length}`)
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length
  const warningCount = issues.length - errorCount
  const checksPerTrack = 9
  const scorePercent = Math.max(
    0,
    Math.floor(
      (1 - (errorCount + warningCount * 0.25) / (tracks.length * checksPerTrack)) *
        100,
    ),
  )

  return {
    cancelledCount: tracks.filter(
      (track) => track.calendar2026?.status === 'cancelled',
    ).length,
    derivedOperationalCount: tracks.filter(
      (track) =>
        track.aeroActivationZones?.some((zone) => zone.source === 'derived') ||
        track.overtakeControlLines?.some((line) => line.source === 'derived'),
    ).length,
    errorCount,
    fallbackLayoutCount: tracks.filter(
      (track) => track.layoutSource?.detail !== 'real',
    ).length,
    issues,
    realLayoutCount: tracks.filter(
      (track) => track.layoutSource?.detail === 'real',
    ).length,
    scorePercent,
    trackCount: tracks.length,
    warningCount,
  }
}
