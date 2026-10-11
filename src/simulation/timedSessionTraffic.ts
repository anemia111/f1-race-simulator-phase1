import type {
  CarSnapshot,
  PracticeProgramKind,
  TrackDefinition,
  WeekendStage,
} from '../types'
import type { CategoryPhysicsProfile } from './categoryPhysics'
import { trackDynamicsAt } from './trackDynamics'
import { timedLapLaunchStartProgress } from './timedLapPreparation'
import { hashChance } from './random'

type TimedTrafficCar = Pick<
  CarSnapshot,
  | 'driverId'
  | 'practiceProgram'
  | 'progress'
  | 'speedKph'
  | 'status'
  | 'timedRunPhase'
>
 & Partial<Pick<CarSnapshot, 'timedTrafficYield' | 'lateralOffsetM' | 'projectedLapTime'>>

/**
 * Who has the right to the road in a timed session, highest first.
 *
 * A lap on the clock outranks everything: it is the only run that cannot be
 * taken again cheaply. A long run is measured work and outranks a transit lap,
 * which is the reordering this replaces — an in-lap used to sit above a long
 * run, so a driver mid-stint gave way to one on their way to the pits.
 * Standing still ranks below all of it.
 */
export const TIMED_TRAFFIC_PRIORITY = {
  qualifyingAttackLap: 4,
  attackLap: 3,
  longRun: 2,
  transitLap: 1,
  outLap: 1.5,
  stopped: 0,
} as const

const qualifyingPracticePrograms = new Set<PracticeProgramKind>([
  'qualifying-preparation',
  'qualifying-simulation',
])

export function timedSessionTrafficPriority(
  car: Pick<TimedTrafficCar, 'practiceProgram' | 'status' | 'timedRunPhase'>,
  stage: WeekendStage,
) {
  if (car.status !== 'running') {
    return TIMED_TRAFFIC_PRIORITY.stopped
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
      return TIMED_TRAFFIC_PRIORITY.qualifyingAttackLap
    }

    return TIMED_TRAFFIC_PRIORITY.attackLap
  }

  if (car.timedRunPhase === 'out-lap') return TIMED_TRAFFIC_PRIORITY.outLap
  if (
    car.timedRunPhase === 'in-lap' ||
    car.timedRunPhase === 'cooldown'
  ) {
    return TIMED_TRAFFIC_PRIORITY.transitLap
  }

  return TIMED_TRAFFIC_PRIORITY.longRun
}

function forwardProgress(from: number, to: number) {
  return ((to - from) % 1 + 1) % 1
}

/** SIM clean-air preparation. Adjust pedal speed demand, never lap timing or position. */
export function timedOutLapGapDecision(options: {
  car: TimedTrafficCar
  cars: readonly TimedTrafficCar[]
  physics?: CategoryPhysicsProfile
  stage: WeekendStage
  track: TrackDefinition
  seed: string
  runIndex: number
  remainingSessionSeconds: number
  approachingPriorityTraffic?: boolean
}) {
  const { car, cars, physics, track } = options
  const clear = { speedScale: 1, aheadDriverId: null as string | null, targetGapSeconds: 0, projectedGapSeconds: null as number | null }
  if (car.status !== 'running' || car.timedRunPhase !== 'out-lap' ||
    car.practiceProgram === 'systems-check') return clear
  const lengthM = Math.max(1, track.lengthKm * 1000)
  const referenceSpeedMps = Math.max(20, trackDynamicsAt(track, car.progress, physics).referenceSpeedKph / 3.6)
  const remainingOutLapSeconds = (1 - car.progress) * lengthM / referenceSpeedMps * 1.5
  // Commit from the final corner, and do not sacrifice reaching the line before
  // the flag. An approaching flying lap takes priority over making our own gap.
  if (car.progress >= timedLapLaunchStartProgress(track) ||
    options.remainingSessionSeconds <= remainingOutLapSeconds + 12 ||
    (options.approachingPriorityTraffic ?? (timedSessionYieldDecision(options).approachingDriverId !== null))) return clear
  const running = cars.filter(other => other.driverId !== car.driverId && other.status === 'running')
  const ahead = running.map(other => ({
    car: other,
    distanceM: forwardProgress(car.progress, other.progress) * lengthM,
  })).sort((a, b) => a.distanceM - b.distanceM)[0]
  if (!ahead || ahead.distanceM > Math.min(1200, lengthM * 0.4)) return clear
  const rearGapSeconds = running.reduce((gap, other) =>
    Math.min(gap, forwardProgress(other.progress, car.progress) * lengthM / Math.max(20, other.speedKph / 3.6)), Infinity)
  if (rearGapSeconds < 2) return clear
  const aheadReferenceMps = Math.max(20, trackDynamicsAt(track, ahead.car.progress, physics).referenceSpeedKph / 3.6)
  const ownPaceRatio = Math.min(1.1, Math.max(0.65, car.speedKph / 3.6 / referenceSpeedMps))
  const aheadPaceRatio = Math.min(1.1, Math.max(0.65, ahead.car.speedKph / 3.6 / aheadReferenceMps))
  // A fixed 6-9 s gap still closes during a flying lap when the car ahead is
  // materially slower. Reserve the expected lap-pace closure before launch.
  const paceClosureSeconds = Number.isFinite(car.projectedLapTime) && Number.isFinite(ahead.car.projectedLapTime)
    ? Math.max(0, ahead.car.projectedLapTime! - car.projectedLapTime!)
    : 0
  const targetGapSeconds = Math.min(20, 6 + hashChance(`${options.seed}:qualifying-air-gap:${car.driverId}:${options.runIndex}`) * 3 + paceClosureSeconds)
  const gapSeconds = ahead.distanceM / referenceSpeedMps
  const projectedGapSeconds = gapSeconds - Math.max(0, ownPaceRatio - aheadPaceRatio) * Math.min(30, remainingOutLapSeconds)
  // Begin opening the gap well before launch. Small, continuous corrections
  // avoid an artificial stop-and-go queue at the final corner.
  const deficit = Math.max(0, targetGapSeconds - Math.min(gapSeconds, projectedGapSeconds))
  return {
    aheadDriverId: ahead.car.driverId,
    targetGapSeconds,
    projectedGapSeconds,
    speedScale: Math.max(0.65, 1 - deficit * 0.045),
  }
}

export function timedSessionYieldDecision(options: {
  car: TimedTrafficCar
  cars: readonly TimedTrafficCar[]
  physics?: CategoryPhysicsProfile
  stage: WeekendStage
  track: TrackDefinition
}) {
  const { car, cars, physics, stage, track } = options
  const qualifying = stage === 'qualifying' || stage === 'qualifying2' || stage === 'sprintQualifying'
  const priority = timedSessionTrafficPriority(car, stage)
  // Once the out lap launches from the final corner, protect the run to the
  // timing line. This also releases an existing courtesy hold for a train.
  // Collision avoidance and flag instructions remain separate decisions.
  const launching = car.timedRunPhase === 'out-lap' &&
    car.progress >= timedLapLaunchStartProgress(track)
  const trackLengthMeters = Math.max(1, track.lengthKm * 1_000)
  const priorityTraffic = launching ? [] : cars.filter(
      (candidate) =>
        candidate.driverId !== car.driverId &&
        timedSessionTrafficPriority(candidate, stage) > priority,
    )
  const approaching = priorityTraffic.map((candidate) => {
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
    // A car still behind needs clearance even inside the last tenth of a
    // second. Dropping it here cancels the yield before its nose gets past.
    .filter(({ gapMeters, gapSeconds }) => gapMeters > 0 && gapSeconds <= (qualifying ? 16 : car.timedTrafficYield ? 12 : 8))
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
  const justPassed = car.timedTrafficYield === true && priorityTraffic.some(candidate =>
    forwardProgress(car.progress, candidate.progress) * trackLengthMeters < 80,
  )
  const shouldHoldAside = car.timedTrafficYield === true && (approaching !== undefined || justPassed)

  return {
    approachingDriverId: approaching?.candidate.driverId ?? null,
    gapMeters: approaching?.gapMeters ?? null,
    gapSeconds: approaching?.gapSeconds ?? null,
    priority,
    safePassingPoint,
    approachingDriverIds: priorityTraffic.filter(candidate =>
      forwardProgress(candidate.progress, car.progress) * trackLengthMeters / Math.max(5, candidate.speedKph / 3.6) <= 8).map(candidate => candidate.driverId),
    // In qualifying, move aside before the next straight rather than wait in
    // the attacker's path throughout a corner sequence. Pedal lifting waits
    // for actual lateral clearance in the live controller.
    shouldYield: (approaching !== undefined && (safePassingPoint || qualifying)) || shouldHoldAside,
  }
}
