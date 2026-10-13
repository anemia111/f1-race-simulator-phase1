import type { BattlePhase, RacePaceMode } from '../types'

export type SfOtsUseRequestOptions = {
  alreadyActive?: boolean
  battlePhase: BattlePhase
  brakePercent: number
  gapToAheadSeconds: number
  isFinalLap: boolean
  paceMode: RacePaceMode
  straightness: number
  throttlePercent: number
}

/** Driver preference only: OTS has no circuit activation zone. */
export function sfOtsUseRequestedFor(
  options: SfOtsUseRequestOptions,
): boolean {
  const tacticalUse = (options.gapToAheadSeconds > 0 && options.gapToAheadSeconds < 2.2) ||
    options.battlePhase !== 'single-file' || options.paceMode === 'push' || options.isFinalLap
  // Releasing on every bend/pedal lift would unnecessarily trigger the long
  // event cooldown. A held tactical use can cross a braking/cornering section;
  // the physical engine still supplies power only through actual throttle/grip.
  return tacticalUse && (options.alreadyActive === true ||
    (options.brakePercent <= 3 && options.throttlePercent >= 55))
}
