import type {
  CarSnapshot,
  PracticeProgramKind,
  TrackDefinition,
  WeekendStage,
} from '../types'
import { trackDynamicsAt } from './trackDynamics'

type TimedTrafficCar = Pick<
  CarSnapshot,
  'driverId' | 'practiceProgram' | 'progress' | 'status' | 'timedRunPhase'
>

const qualifyingPracticePrograms = new Set<PracticeProgramKind>([
  'qualifying-preparation',
  'qualifying-simulation',
])

export function timedSessionTrafficPriority(
  car: Pick<TimedTrafficCar, 'practiceProgram' | 'status' | 'timedRunPhase'>,
  stage: WeekendStage,
) {
  if (car.status !== 'running') {
    return 0
  }

  if (car.timedRunPhase === 'attack-lap') {
    if (
      stage === 'qualifying' ||
      stage === 'qualifying2' ||
      stage === 'sprintQualifying' ||
      (car.practiceProgram !== null &&
        car.practiceProgram !== undefined &&
        qualifyingPracticePrograms.has(car.practiceProgram))
    ) {
      return 3
    }

    return 2
  }

  if (
    car.timedRunPhase === 'out-lap' ||
    car.timedRunPhase === 'in-lap' ||
    car.timedRunPhase === 'cooldown'
  ) {
    return 1
  }

  return 0
}

function forwardProgress(from: number, to: number) {
  return ((to - from) % 1 + 1) % 1
}

export function timedSessionYieldDecision(options: {
  car: TimedTrafficCar
  cars: readonly TimedTrafficCar[]
  stage: WeekendStage
  track: TrackDefinition
}) {
  const { car, cars, stage, track } = options
  const priority = timedSessionTrafficPriority(car, stage)
  const approaching = cars
    .filter(
      (candidate) =>
        candidate.driverId !== car.driverId &&
        timedSessionTrafficPriority(candidate, stage) > priority,
    )
    .map((candidate) => ({
      candidate,
      gapSeconds:
        forwardProgress(candidate.progress, car.progress) *
        track.baseLapTime,
    }))
    .filter(({ gapSeconds }) => gapSeconds > 0.1 && gapSeconds <= 4.2)
    .sort((left, right) => left.gapSeconds - right.gapSeconds)[0]
  const dynamics = trackDynamicsAt(track, car.progress)
  const safePassingPoint =
    dynamics.straightness >= 0.7 &&
    dynamics.brakingSeverity < 0.2 &&
    dynamics.referenceSpeedKph >= 175

  return {
    approachingDriverId: approaching?.candidate.driverId ?? null,
    gapSeconds: approaching?.gapSeconds ?? null,
    priority,
    safePassingPoint,
    shouldYield: approaching !== undefined && safePassingPoint,
  }
}
