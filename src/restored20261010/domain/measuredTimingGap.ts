/**
 * Rebuild absolute passage times for every measured mini-sector timing line.
 *
 * Completed laps store interval times rather than clock timestamps. The start
 * of the current lap is an absolute timestamp, so walking the immutable lap
 * history backwards gives an absolute origin for every recorded lap. This
 * also keeps a usable common checkpoint while the leader has already crossed
 * the Line and the following car is still finishing the preceding lap.
 */
import type {CarSnapshot} from '../types'
const MINI_SECTORS_PER_SECTOR = 8

type MeasuredMiniSectorLap = {
  completedMiniSectors: number
  finishedAtSeconds: number | null
  lapStartedAtSeconds: number
  miniSectorTimes: ReadonlyArray<number | null>
}

export type MeasuredMiniSectorTimeline = {
  currentLap: number
  currentLapStartedAtSeconds: number
  currentMiniSectorTimes: CarSnapshot['currentLapMiniSectorTimes']
  lapHistory: ReadonlyArray<Pick<CarSnapshot['lapHistory'][number], 'lap' | 'lapTimeSeconds' | 'miniSectors' | 'sectors'>>
}

export function measuredMiniSectorTimeline(
  car: CarSnapshot,
): MeasuredMiniSectorTimeline | null {
  if (
    car.lapStartedAtSeconds === null ||
    !Number.isFinite(car.lapStartedAtSeconds)
  ) {
    return null
  }

  return {
    currentLap: (car.lapHistory.at(-1)?.lap ?? 0) + 1,
    currentLapStartedAtSeconds: car.lapStartedAtSeconds,
    currentMiniSectorTimes: car.currentLapMiniSectorTimes,
    lapHistory: car.lapHistory,
  }
}

function measuredMiniSectorLapAt(
  timeline: MeasuredMiniSectorTimeline,
  targetLap: number,
): MeasuredMiniSectorLap | null {
  if (targetLap === timeline.currentLap) {
    const firstPendingMiniSector = timeline.currentMiniSectorTimes.findIndex(
      (intervalSeconds) => intervalSeconds === null,
    )

    return {
      completedMiniSectors:
        firstPendingMiniSector === -1
          ? timeline.currentMiniSectorTimes.length
          : firstPendingMiniSector,
      finishedAtSeconds: null,
      lapStartedAtSeconds: timeline.currentLapStartedAtSeconds,
      miniSectorTimes: timeline.currentMiniSectorTimes,
    }
  }

  if (targetLap > timeline.currentLap) {
    return null
  }

  // Normally the only historical lookup is the leader's immediately
  // preceding lap while a following car is still approaching the Line. Walk
  // backwards only as far as the requested common lap instead of rebuilding
  // every lap and all 24 crossings on every simulation tick.
  let completedLapEndedAtSeconds = timeline.currentLapStartedAtSeconds

  for (
    let index = timeline.lapHistory.length - 1;
    index >= 0;
    index -= 1
  ) {
    const lapRecord = timeline.lapHistory[index]

    if (
      !Number.isFinite(lapRecord.lapTimeSeconds) ||
      lapRecord.lapTimeSeconds <= 0
    ) {
      return null
    }

    const completedLapStartedAtSeconds =
      completedLapEndedAtSeconds - lapRecord.lapTimeSeconds

    if (lapRecord.lap === targetLap) {
      const miniSectorTimes = lapRecord.miniSectors

      return {
        completedMiniSectors:
          miniSectorTimes?.length === lapRecord.sectors.length * MINI_SECTORS_PER_SECTOR
            ? miniSectorTimes.length
            : 0,
        // A legacy checkpoint may predate measured mini-sectors. Its lap time
        // still gives one truthful passage timestamp: the start/finish line.
        finishedAtSeconds: completedLapEndedAtSeconds,
        lapStartedAtSeconds: completedLapStartedAtSeconds,
        miniSectorTimes: miniSectorTimes ?? [],
      }
    }

    if (lapRecord.lap < targetLap) {
      return null
    }

    completedLapEndedAtSeconds = completedLapStartedAtSeconds
  }

  return null
}

export function measuredMiniSectorGapSeconds(
  referenceTimeline: MeasuredMiniSectorTimeline | null,
  carTimeline: MeasuredMiniSectorTimeline | null,
) {
  if (!referenceTimeline || !carTimeline) {
    return null
  }

  const latestCommonLap = Math.min(
    referenceTimeline.currentLap,
    carTimeline.currentLap,
  )
  const referenceLap = measuredMiniSectorLapAt(
    referenceTimeline,
    latestCommonLap,
  )
  const carLap = measuredMiniSectorLapAt(carTimeline, latestCommonLap)

  if (!referenceLap || !carLap) {
    return null
  }

  const crossingAt = (lap: MeasuredMiniSectorLap, miniSectorIndex: number) => {
    let cumulativeSeconds = 0

    for (let index = 0; index <= miniSectorIndex; index += 1) {
      const miniSectorSeconds = lap.miniSectorTimes[index]

      if (
        miniSectorSeconds === null ||
        miniSectorSeconds === undefined ||
        !Number.isFinite(miniSectorSeconds) ||
        miniSectorSeconds <= 0
      ) {
        return null
      }

      cumulativeSeconds += miniSectorSeconds
    }

    return lap.lapStartedAtSeconds + cumulativeSeconds
  }

  if (
    referenceLap.finishedAtSeconds !== null &&
    carLap.finishedAtSeconds !== null
  ) {
    const difference=carLap.finishedAtSeconds-referenceLap.finishedAtSeconds
    return difference < -1e-6 ? null : Math.max(0,difference)
  }

  const latestCommonMiniSector =
    Math.min(
      referenceLap.completedMiniSectors,
      carLap.completedMiniSectors,
    ) - 1

  if (latestCommonMiniSector < 0) {
    return null
  }

  const referenceCrossedAtSeconds = crossingAt(
    referenceLap,
    latestCommonMiniSector,
  )
  const crossedAtSeconds = crossingAt(carLap, latestCommonMiniSector)

  if(referenceCrossedAtSeconds===null||crossedAtSeconds===null)return null
  const difference=crossedAtSeconds-referenceCrossedAtSeconds
  // Following an overtake, the last checkpoint may describe the old order.
  // Wait for a new common crossing rather than turn a negative gap positive.
  return difference < -1e-6 ? null : Math.max(0,difference)
}

