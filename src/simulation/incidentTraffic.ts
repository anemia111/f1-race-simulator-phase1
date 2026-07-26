import type {
  CarSnapshot,
  IncidentStopLocation,
  IncidentTrackState,
} from '../types'

export function incidentTrackStateForLocation(
  location: IncidentStopLocation,
): Exclude<IncidentTrackState, 'clear'> {
  return location === 'on-track'
    ? 'on-track-stopped'
    : 'off-track-stopped'
}

export function incidentTrackStateForCar(
  car: Pick<CarSnapshot, 'incidentTrackState' | 'offTrackSinceSeconds'>,
): IncidentTrackState {
  if (car.offTrackSinceSeconds != null) {
    return 'off-track-stopped'
  }

  return car.incidentTrackState ?? 'clear'
}

/** Cars with an obvious problem are legal exceptions to the queue order. */
export function carCanDefineNeutralisationQueue(
  car: Pick<
    CarSnapshot,
    | 'incidentTrackState'
    | 'offTrackSinceSeconds'
    | 'pitPhase'
    | 'status'
  >,
): boolean {
  return (
    car.status === 'running' &&
    car.pitPhase === 'none' &&
    incidentTrackStateForCar(car) === 'clear'
  )
}
