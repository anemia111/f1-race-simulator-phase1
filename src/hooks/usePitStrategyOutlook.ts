import { useMemo } from 'react'
import {
  pitLaneLossSecondsForTrack,
  strategyOutlookFor,
} from '../simulation/strategy'
import type { StrategyOutlook } from '../simulation/strategy'
import { trackSurfaceSectorSummary } from '../simulation/trackSurface'
import type {
  CarSnapshot,
  Driver,
  RaceSnapshot,
  TrackDefinition,
} from '../types'

export type PitStrategyOutlook = {
  /** Modelled pit-lane transit cost for this circuit, in seconds. */
  pitLaneLossSeconds: number
  /** Position the car would rejoin in if it boxed on this lap. */
  projectedRejoinPosition: number
  /** Positions lost by boxing now; negative means positions gained. */
  projectedRejoinPositionChange: number
  outlook: StrategyOutlook
  /** True while the other car of the same team is in any pit phase. */
  teammateInPit: boolean
  teammateInPitCode: string | null
}

export type PitStrategyOutlookOptions = {
  car: CarSnapshot
  driver: Driver
  snapshot: RaceSnapshot
  track: TrackDefinition
}

/**
 * Resolves the F1 Pirelli strategy read-out without making it a generic
 * category feature.  A SUPER FORMULA runtime intentionally returns `null`:
 * its control-tyre and refuelling operations must come from the sourced SF
 * runtime, not the F1 pit-loss/compound planner.
 */
export function pitStrategyOutlookFor(
  options: PitStrategyOutlookOptions,
): PitStrategyOutlook | null {
  const { car, driver, snapshot, track } = options

  if (car.runtimeSystems.kind !== 'f1') {
    return null
  }

  const surfaceSectors = trackSurfaceSectorSummary(snapshot.trackSurface)

  // The engineer's read-out and the stop the F1 race actually applies come
  // from the same base. They used to differ by 2 s, so the pit wall quoted a
  // cost the car never paid.
  const pitLaneLossSeconds = pitLaneLossSecondsForTrack(track)
  const projectedDistance =
    car.totalDistance - pitLaneLossSeconds / track.baseLapTime
  const projectedRejoinPosition =
    1 +
    snapshot.cars.filter(
      (candidate) =>
        candidate.driverId !== car.driverId &&
        candidate.status === 'running' &&
        candidate.totalDistance > projectedDistance,
    ).length
  const teammateInPitCar =
    snapshot.cars.find(
      (candidate) =>
        candidate.driverId !== car.driverId &&
        candidate.teamId === car.teamId &&
        candidate.pitPhase !== 'none',
    ) ?? null
  const outlook = strategyOutlookFor({
    car,
    driver,
    lap: snapshot.leaderLap,
    raceLaps: snapshot.raceLaps,
    seed: `${track.id}:${snapshot.weekend.stage}`,
    trackGrip: snapshot.trackGrip,
    underSafetyCar: snapshot.flag === 'sc' || snapshot.flag === 'vsc',
    weather: snapshot.weather,
    tireNomination: track.tireNomination,
    observedCalibration: track.observedCalibration,
    trackCondition: {
      dryingLine:
        surfaceSectors.dryingLineBySector.reduce(
          (total, value) => total + value,
          0,
        ) / 3,
      rainIntensityMmH:
        snapshot.weather === 'heavy-rain'
          ? 8
          : snapshot.weather === 'light-rain'
            ? 2
            : 0,
      surfaceWaterMm:
        surfaceSectors.surfaceWaterMmBySector.reduce(
          (total, value) => total + value,
          0,
        ) / 3,
    },
    pitLaneLossSeconds,
    gapToAheadSeconds: car.gapToAhead,
    projectedRejoinPositionLoss: projectedRejoinPosition - car.position,
    teammateInPit: teammateInPitCar !== null,
  })

  // `strategyOutlookFor` is intentionally nullable at the category boundary.
  // Do not turn the absence into a zero-value or made-up recommendation.
  if (outlook === null) {
    return null
  }

  return {
    outlook,
    pitLaneLossSeconds,
    projectedRejoinPosition,
    projectedRejoinPositionChange: projectedRejoinPosition - car.position,
    teammateInPit: teammateInPitCar !== null,
    teammateInPitCode: teammateInPitCar?.code ?? null,
  }
}

/**
 * Single owner of the race-analysis and pit-wall strategy read-out.
 *
 * Race analysis and the pit wall show the same call, so they must derive it
 * once. Keeping the pit-loss estimate, rejoin projection, and
 * `strategyOutlookFor` inputs here stops the two screens from drifting apart.
 */
export function usePitStrategyOutlook(
  options: PitStrategyOutlookOptions,
): PitStrategyOutlook | null {
  const { car, driver, snapshot, track } = options
  return useMemo(
    () => pitStrategyOutlookFor({ car, driver, snapshot, track }),
    [car, driver, snapshot, track],
  )
}
