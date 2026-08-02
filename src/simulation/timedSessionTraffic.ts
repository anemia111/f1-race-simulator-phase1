import type {
  CarSnapshot,
  PracticeProgramKind,
  TrackDefinition,
  WeekendStage,
} from '../types'
import type { CategoryPhysicsProfile } from './categoryPhysics'
import { trackDynamicsAt } from './trackDynamics'

type TimedTrafficCar = Pick<
  CarSnapshot,
  | 'driverId'
  | 'practiceProgram'
  | 'progress'
  | 'speedKph'
  | 'status'
  | 'timedRunPhase'
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
  physics?: CategoryPhysicsProfile
  stage: WeekendStage
  track: TrackDefinition
}) {
  const { car, cars, physics, stage, track } = options
  const priority = timedSessionTrafficPriority(car, stage)
  const trackLengthMeters = Math.max(1, track.lengthKm * 1_000)
  const approaching = cars
    .filter(
      (candidate) =>
        candidate.driverId !== car.driverId &&
        timedSessionTrafficPriority(candidate, stage) > priority,
    )
    .map((candidate) => {
      const gapMeters =
        forwardProgress(candidate.progress, car.progress) * trackLengthMeters
      const currentSpeedKph = Number.isFinite(candidate.speedKph)
        ? Math.max(0, candidate.speedKph)
        : 0
      const profileSpeedKph = trackDynamicsAt(
        track,
        candidate.progress,
        physics,
      ).referenceSpeedKph
      // A just-released attack car may not have a useful first telemetry
      // sample yet. In that case use its category-aware physical profile at
      // the current point, never a whole-lap target time.
      const representativeSpeedMps =
        Math.max(
          5,
          currentSpeedKph >= 18 ? currentSpeedKph : profileSpeedKph,
        ) / 3.6

      return {
        candidate,
        gapMeters,
        gapSeconds: gapMeters / representativeSpeedMps,
      }
    })
    .filter(({ gapSeconds }) => gapSeconds > 0.1 && gapSeconds <= 4.2)
    .sort(
      (left, right) =>
        left.gapSeconds - right.gapSeconds ||
        (left.candidate.driverId < right.candidate.driverId ? -1 : 1),
    )[0]
  const dynamics = trackDynamicsAt(track, car.progress, physics)
  const safePassingPoint =
    dynamics.straightness >= 0.7 &&
    dynamics.brakingSeverity < 0.2 &&
    dynamics.referenceSpeedKph >= 175

  return {
    approachingDriverId: approaching?.candidate.driverId ?? null,
    gapMeters: approaching?.gapMeters ?? null,
    gapSeconds: approaching?.gapSeconds ?? null,
    priority,
    safePassingPoint,
    shouldYield: approaching !== undefined && safePassingPoint,
  }
}
