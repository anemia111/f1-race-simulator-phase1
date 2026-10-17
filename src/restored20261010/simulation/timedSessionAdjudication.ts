import { hashChance } from './random'

/** Offline qualifying run validity. Driver execution is resolved separately. */
export function offlineQualifyingRunAdjudication(runKey: string): {
  aborted: boolean
  deleted: boolean
} {
  const aborted = hashChance(`${runKey}:abort`) < 0.012
  const deleted =
    !aborted && hashChance(`${runKey}:track-limit`) < 0.008

  return { aborted, deleted }
}

/** Live timed-lap steward events. Driver execution is resolved separately. */
export function liveTimedLapAdjudication(options: {
  completedTimedLap: number
  obstructed?: boolean
  driverId: string
  seed: string
  segmentKey: string
}): {
  causedYellow: boolean
  trackLimitDeleted: boolean
} {
  const { completedTimedLap, driverId, seed, segmentKey } = options

  return {
    causedYellow: options.obstructed === true,
    trackLimitDeleted:
      hashChance(
        `${seed}:timed-track-limit:${segmentKey}:${driverId}:${completedTimedLap}`,
      ) < 0.018,
  }
}
