import references from './courseCornerReferences.json'
import type { TrackDefinition } from '../types'
import { projectPointToArcProgress } from './sectorBoundaries'

type Reference = { id: string; sourceUrl: string; turns: { label: string; position: number[] }[] }
export function registeredCourseCorners(id: string, mirror = false): NonNullable<TrackDefinition['corners']> {
  const reference = (references.references as Reference[]).find(item => item.id === id)
  return reference?.turns.map(turn => ({ number: parseInt(turn.label, 10), label: turn.label,
    position: [turn.position[0], 0, turn.position[1] * (mirror ? -1 : 1)] })) ?? []
}

/** One label and spatial anchor feed both map furniture and comparison traces.
 * Project onto segments, not the nearest vertex/index of a nonuniform polyline. */
export function trackCornerTelemetry(track: Pick<TrackDefinition, 'corners' | 'centerline'>) {
  return (track.corners ?? []).map(corner => ({ label: `T${corner.label ?? corner.number}`,
    progress: projectPointToArcProgress(track.centerline, corner.position) })).sort((a, b) => a.progress - b.progress)
}
