import type {
  CarSnapshot,
  TrackDefinition,
  WeekendStage,
} from '../types'
import { raceLapsFor } from './raceEvents'
import { isDryCompound } from './tires'

export function sprintLapsFor(track: TrackDefinition) {
  // FIA B2.3.2: least number of complete laps exceeding 100 km.
  return Math.floor(100 / track.lengthKm) + 1
}

export function sessionDistanceLapsFor(
  track: TrackDefinition,
  stage: WeekendStage,
) {
  return stage === 'sprint' ? sprintLapsFor(track) : raceLapsFor(track)
}

export function compliesWithGrandPrixTireRule(
  car: Pick<CarSnapshot, 'compoundsUsed'>,
) {
  const usedWetWeatherTire = car.compoundsUsed.some(
    (compound) => !isDryCompound(compound),
  )

  if (usedWetWeatherTire) {
    return true
  }

  return new Set(car.compoundsUsed.filter(isDryCompound)).size >= 2
}

