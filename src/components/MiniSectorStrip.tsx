import { miniSectorSummary } from '../domain/timingFormat'
import type { MiniSectorState } from '../types'

/**
 * The eight measured timing segments of one sector. Shared by the timing tower
 * and the pit wall so a segment cannot be purple in one and green in the other.
 */
export function MiniSectorStrip({
  sectorIndex,
  states,
}: {
  sectorIndex: number
  states: MiniSectorState[]
}) {
  return (
    <span
      className="broadcast-mini-sectors"
      aria-label={`Sector ${sectorIndex + 1} mini sectors: ${miniSectorSummary(states)}`}
    >
      {states.map((state, index) => (
        <span
          aria-hidden="true"
          className={`mini-${state}`}
          key={`${state}-${index}`}
        />
      ))}
    </span>
  )
}
