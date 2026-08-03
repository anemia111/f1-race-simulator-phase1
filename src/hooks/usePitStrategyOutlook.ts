import { useMemo } from 'react'
import {
  pitLaneLossSecondsForTrack,
  strategyOutlookFor,
} from '../simulation/strategy'
import type { StrategyOutlook } from '../simulation/strategy'
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

/**
 * Single owner of the race-analysis and pit-wall strategy read-out.
 *
 * Race analysis and the pit wall show the same call, so they must derive it
 * once. Keeping the pit-loss estimate, rejoin projection, and
 * `strategyOutlookFor` inputs here stops the two screens from drifting apart.
 */
export function usePitStrategyOutlook(options: {
  car: CarSnapshot
  driver: Driver
  snapshot: RaceSnapshot
  track: TrackDefinition
}): PitStrategyOutlook {
  const { car, driver, snapshot, track } = options
  const pitForecast = useMemo(() => {
    // The engineer's read-out and the stop the race actually applies come from
    // the same base. They used to differ by 2 s, so the pit wall quoted a cost
    // the car never paid.
    const lossSeconds = pitLaneLossSecondsForTrack(track)
    const projectedDistance = car.totalDistance - lossSeconds / track.baseLapTime
    const projectedPosition =
      1 +
      snapshot.cars.filter(
        (candidate) =>
          candidate.driverId !== car.driverId &&
          candidate.status === 'running' &&
          candidate.totalDistance > projectedDistance,
      ).length

    return { lossSeconds, projectedPosition }
    // `pitLaneLossSecondsForTrack` reads several fields off the track, so the
    // track itself is the dependency rather than the handful this used to
    // list.
  }, [car.driverId, car.totalDistance, snapshot.cars, track])
  const teammateInPitCar = useMemo(
    () =>
      snapshot.cars.find(
        (candidate) =>
          candidate.driverId !== car.driverId &&
          candidate.teamId === car.teamId &&
          candidate.pitPhase !== 'none',
      ) ?? null,
    [car.driverId, car.teamId, snapshot.cars],
  )
  const teammateInPit = teammateInPitCar !== null
  const outlook = useMemo(
    () =>
      strategyOutlookFor({
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
            snapshot.dryingLineBySector.reduce(
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
            snapshot.surfaceWaterMmBySector.reduce(
              (total, value) => total + value,
              0,
            ) / 3,
        },
        pitLaneLossSeconds: pitForecast.lossSeconds,
        gapToAheadSeconds: car.gapToAhead,
        projectedRejoinPositionLoss:
          pitForecast.projectedPosition - car.position,
        teammateInPit,
      }),
    [
      car,
      driver,
      pitForecast.lossSeconds,
      pitForecast.projectedPosition,
      snapshot.dryingLineBySector,
      snapshot.flag,
      snapshot.leaderLap,
      snapshot.raceLaps,
      snapshot.surfaceWaterMmBySector,
      snapshot.trackGrip,
      snapshot.weather,
      snapshot.weekend.stage,
      teammateInPit,
      track.id,
      track.observedCalibration,
      track.tireNomination,
    ],
  )

  return {
    outlook,
    pitLaneLossSeconds: pitForecast.lossSeconds,
    projectedRejoinPosition: pitForecast.projectedPosition,
    projectedRejoinPositionChange: pitForecast.projectedPosition - car.position,
    teammateInPit,
    teammateInPitCode: teammateInPitCar?.code ?? null,
  }
}
