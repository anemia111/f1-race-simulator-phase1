import type { BattlePhase, RacePaceMode } from '../types'

export type SfOtsUseRequestOptions = {
  battlePhase: BattlePhase
  brakePercent: number
  gapToAheadSeconds: number
  isFinalLap: boolean
  paceMode: RacePaceMode
  straightness: number
  throttlePercent: number
}

/**
 * Pure compatibility predicate extracted from the legacy telemetry path. Its
 * thresholds are simulator behavior, not an official OTS activation rule.
 */
export function sfOtsUseRequestedFor(
  options: SfOtsUseRequestOptions,
): boolean {
  return (
    options.brakePercent <= 3 &&
    options.throttlePercent >= 88 &&
    options.straightness >= 0.72 &&
    ((options.gapToAheadSeconds > 0 &&
      options.gapToAheadSeconds < 2.2) ||
      options.battlePhase !== 'single-file' ||
      options.paceMode === 'push' ||
      options.isFinalLap)
  )
}
