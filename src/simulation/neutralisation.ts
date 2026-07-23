import type {
  ActiveFlagPhase,
  CarSnapshot,
  NeutralisationProcedure,
  TrackDefinition,
} from '../types'
import { hashChance } from './random'

const SAFETY_CAR_JOIN_SIGNAL_SECONDS = 2
/**
 * Ten car lengths, expressed as a time gap. The sporting regulations set the
 * same maximum for the safety car to the leader and for each car to the one
 * ahead, so both are measured against this.
 */
const SAFETY_CAR_QUEUE_GAP_SECONDS = 0.65
const SAFETY_CAR_PIT_ENTRY_PROGRESS = 0.965
const SAFETY_CAR_LINE_EPSILON = 0.001
export const SAFETY_CAR_LEADER_TARGET_GAP_SECONDS = SAFETY_CAR_QUEUE_GAP_SECONDS
const SAFETY_CAR_IN_THIS_LAP_PACE_SCALE = 0.82
/**
 * Safety car pace once it is leading the queue, as a fraction of racing pace.
 *
 * It has to sit under the pace the field actually manages while neutralised.
 * The cars run through the vehicle model and lose more to slow corners than a
 * flat fraction of a racing lap suggests, so a safety car circulating at the
 * queue's nominal 0.5 creeps away a few tenths every lap and the field is never
 * able to close up behind it. Driving marginally slower lets the leader arrive,
 * settle on the target gap, and hold there.
 */
const SAFETY_CAR_QUEUE_PACE_SCALE = 0.45
const finalCornerProgressCache = new WeakMap<TrackDefinition, number>()

type SafetyCarProcedure = Extract<
  NeutralisationProcedure,
  { kind: 'safety-car' }
>

export type NeutralisationEvent = {
  atSeconds: number
  id: string
  message: string
}

export type NeutralisationAdvanceResult = {
  completedFlag: 'sc' | 'vsc' | null
  events: NeutralisationEvent[]
  greenLightUntilSeconds: number | null
  penaltyLapDriverIds: string[]
  phase: ActiveFlagPhase | null
  restartTargetsByDriver: Record<string, number> | null
}

const lapProgress = (distance: number) =>
  distance - Math.floor(distance)

const runningOnTrackCars = (cars: CarSnapshot[]) =>
  cars
    .filter((car) => car.status === 'running' && car.pitPhase === 'none')
    .slice()
    .sort((left, right) => right.totalDistance - left.totalDistance)

const nextControlLine = (distance: number) => Math.floor(distance) + 1

const signedPhysicalGap = (carDistance: number, referenceDistance: number) =>
  ((lapProgress(carDistance) - lapProgress(referenceDistance) + 1.5) % 1) -
  0.5

function nextMarkerDistance(distance: number, progress: number) {
  let target = Math.floor(distance) + progress

  if (target <= distance + SAFETY_CAR_LINE_EPSILON) {
    target += 1
  }

  return target
}

function eligibilityLineTargets(
  cars: CarSnapshot[],
  track: TrackDefinition,
) {
  const firstSafetyCarLine =
    track.safetyCarLines?.line1Progress ??
    track.pitLane?.entryProgress ??
    SAFETY_CAR_PIT_ENTRY_PROGRESS

  return Object.fromEntries(
    cars
      .filter((car) => car.status === 'running' || car.status === 'pit')
      .map((car) => {
        const firstCrossing = nextMarkerDistance(
          car.totalDistance,
          firstSafetyCarLine,
        )
        const secondCrossing = firstCrossing + 1

        // B5.13.4c freezes eligibility at the Line ending the lap in which
        // the car crosses Safety Car Line 1 for the second time.
        return [
          car.driverId,
          Math.ceil(secondCrossing - SAFETY_CAR_LINE_EPSILON),
        ]
      }),
  )
}

function captureEligibilityAtReferenceLines(
  procedure: SafetyCarProcedure,
  cars: CarSnapshot[],
  leader: CarSnapshot,
) {
  const carsByDriver = new Map(cars.map((car) => [car.driverId, car]))
  const eligibilityStatusByDriver = {
    ...procedure.eligibilityStatusByDriver,
  }

  for (const [driverId, target] of Object.entries(
    procedure.eligibilityLineTargetByDriver,
  )) {
    if (eligibilityStatusByDriver[driverId] !== 'pending') {
      continue
    }

    const car = carsByDriver.get(driverId)

    if (
      !car ||
      car.status === 'retired' ||
      car.status === 'finished' ||
      car.status === 'disqualified' ||
      car.status === 'dns'
    ) {
      eligibilityStatusByDriver[driverId] = 'ineligible'
      continue
    }

    if (car.totalDistance + SAFETY_CAR_LINE_EPSILON < target) {
      continue
    }

    const leaderCompletedLaps = Math.floor(
      leader.totalDistance + SAFETY_CAR_LINE_EPSILON,
    )
    eligibilityStatusByDriver[driverId] =
      leaderCompletedLaps >= target + 1 ? 'eligible' : 'ineligible'
  }

  return {
    ...procedure,
    eligibilityStatusByDriver,
    eligibleLappedDriverIds: Object.entries(eligibilityStatusByDriver)
      .filter(([, status]) => status === 'eligible')
      .map(([driverId]) => driverId),
  }
}

function leaderCollectionTarget(
  leaderDistance: number,
  track: TrackDefinition,
) {
  const pitExitProgress = track.pitLane?.exitProgress ?? 0.13

  // The Safety Car waits at pit exit and joins ahead of the leader after the
  // leader rounds the final corner. Therefore its first on-track distance is
  // always the pit exit on the leader's next passage of the control line.
  return Math.floor(leaderDistance) + 1 + pitExitProgress
}

function finalCornerProgress(track: TrackDefinition) {
  const cached = finalCornerProgressCache.get(track)

  if (cached !== undefined) {
    return cached
  }

  const finalCorner = track.corners?.reduce<
    NonNullable<TrackDefinition['corners']>[number] | null
  >(
    (latest, corner) =>
      !latest || corner.number > latest.number ? corner : latest,
    null,
  )

  if (!finalCorner || track.centerline.length === 0) {
    const pitEntryProgress =
      track.pitLane?.entryProgress ?? SAFETY_CAR_PIT_ENTRY_PROGRESS
    const fallback = (pitEntryProgress - 0.035 + 1) % 1

    finalCornerProgressCache.set(track, fallback)
    return fallback
  }

  let closestIndex = 0
  let closestDistanceSquared = Number.POSITIVE_INFINITY

  track.centerline.forEach((point, index) => {
    const distanceSquared =
      (point[0] - finalCorner.position[0]) ** 2 +
      (point[2] - finalCorner.position[2]) ** 2

    if (distanceSquared < closestDistanceSquared) {
      closestIndex = index
      closestDistanceSquared = distanceSquared
    }
  })

  const progress = closestIndex / track.centerline.length

  finalCornerProgressCache.set(track, progress)
  return progress
}

function safetyCarReleaseLeaderDistance(
  leaderDistanceAtDeployment: number,
  track: TrackDefinition,
) {
  const finalCorner = finalCornerProgress(track)
  const currentProgress = lapProgress(leaderDistanceAtDeployment)

  return currentProgress + SAFETY_CAR_LINE_EPSILON >= finalCorner
    ? leaderDistanceAtDeployment
    : nextMarkerDistance(leaderDistanceAtDeployment, finalCorner)
}

function followingLapEndDistance(leaderDistance: number) {
  const progress = lapProgress(leaderDistance)

  // A message sent effectively at the Line refers to the lap just starting.
  // Otherwise finish the current lap and then the following lap.
  return progress <= 0.02
    ? Math.floor(leaderDistance) + 1
    : Math.floor(leaderDistance) + 2
}

function firstLineTargets(cars: CarSnapshot[]) {
  return Object.fromEntries(
    cars
      .filter((car) => car.status === 'running')
      .map((car) => [car.driverId, nextControlLine(car.totalDistance)]),
  )
}

export function isSafetyCarFieldQueued(
  cars: CarSnapshot[],
  referenceLapTimeSeconds: number,
  maximumQueueGapCarLengths: 10 | 20 = 10,
) {
  const running = runningOnTrackCars(cars)

  if (running.length <= 1) {
    return running.length === 1
  }

  const maximumGapLaps =
    (SAFETY_CAR_QUEUE_GAP_SECONDS * (maximumQueueGapCarLengths / 10)) /
    Math.max(45, referenceLapTimeSeconds)

  return running.slice(1).every((car, index) => {
    const ahead = running[index]
    const rawGap = Math.max(0, ahead.totalDistance - car.totalDistance)
    const physicalGapLaps = rawGap - Math.floor(rawGap)

    return physicalGapLaps <= maximumGapLaps
  })
}

function hasLeaderCaughtSafetyCar(
  procedure: SafetyCarProcedure,
  leader: CarSnapshot,
) {
  const maximumGapLaps = Math.max(
    0.0015,
    SAFETY_CAR_LEADER_TARGET_GAP_SECONDS /
      Math.max(55, leader.projectedLapTime),
  )
  const gapLaps = procedure.safetyCarDistance - leader.totalDistance

  return (
    gapLaps >= -SAFETY_CAR_LINE_EPSILON &&
    gapLaps <= maximumGapLaps + SAFETY_CAR_LINE_EPSILON
  )
}

function createProcedure(
  phase: ActiveFlagPhase,
  cars: CarSnapshot[],
  track: TrackDefinition,
): NeutralisationProcedure | null {
  if (phase.flag === 'vsc') {
    return {
      kind: 'vsc',
      stage: 'deployed',
      endingStartedAtSeconds: null,
      resumeAtSeconds: null,
    }
  }

  if (phase.flag !== 'sc') {
    return null
  }

  const leader = runningOnTrackCars(cars)[0] ?? cars[0]
  const leaderDistance = leader?.totalDistance ?? 0
  const collectionTarget = leaderCollectionTarget(leaderDistance, track)
  const eligibilityLineTargetByDriver = eligibilityLineTargets(cars, track)

  return {
    kind: 'safety-car',
    stage: 'deployed',
    orangeLights: true,
    greenLight: false,
    maximumQueueGapCarLengths: 10,
    leaderDistanceAtDeployment: leaderDistance,
    leaderCollectionTargetDistance: collectionTarget,
    safetyCarDistance: collectionTarget,
    safetyCarLastUpdatedAtSeconds: phase.startSeconds,
    leaderCollectedAtSeconds: null,
    fieldQueuedAtSeconds: null,
    eligibilityLineTargetByDriver,
    eligibilityStatusByDriver: Object.fromEntries(
      Object.keys(eligibilityLineTargetByDriver).map((driverId) => [
        driverId,
        'pending' as const,
      ]),
    ),
    eligibleLappedDriverIds: [],
    unlappingOrderDriverIds: [],
    unlappingPassedSafetyCarAtDistanceByDriver: {},
    unlappingRejoinedDriverIds: [],
    unauthorizedSafetyCarOvertakeDriverIds: [],
    lastObservedSafetyCarGapByDriver: Object.fromEntries(
      cars.map((car) => [
        car.driverId,
        signedPhysicalGap(car.totalDistance, collectionTarget),
      ]),
    ),
    lappedCarsMayOvertakeAtSeconds: null,
    overtakingNotPermittedAtSeconds: null,
    pitExitClosed: false,
    pitLaneRouteRequired: phase.safetyCarUsesPitLane ?? false,
    pitLaneRouteAnnouncedAtSeconds: null,
    returnNotBeforeLeaderDistance: null,
    inThisLapEarliestLeaderDistance: null,
    inThisLapAtSeconds: null,
    pitEntryLeaderDistance: null,
    pitEntrySafetyCarDistance: null,
    pitEntryAtSeconds: null,
    restartLineDistance: null,
    restartTargetsByDriver: null,
    finishingUnderSafetyCar: false,
  }
}

export function ensureNeutralisationProcedure(
  phase: ActiveFlagPhase,
  cars: CarSnapshot[],
  track: TrackDefinition,
) {
  if (phase.neutralisation !== undefined) {
    return phase
  }

  return {
    ...phase,
    neutralisation: createProcedure(phase, cars, track),
  }
}

function beginSafetyCarWithdrawal(options: {
  cars: CarSnapshot[]
  elapsedSeconds: number
  leader: CarSnapshot
  procedure: Extract<NeutralisationProcedure, { kind: 'safety-car' }>
  requestedRestartLineDistance: number | null
  track: TrackDefinition
}) {
  const {
    cars,
    elapsedSeconds,
    leader,
    procedure,
    requestedRestartLineDistance,
    track,
  } = options
  const pitEntryProgress =
    track.pitLane?.entryProgress ?? SAFETY_CAR_PIT_ENTRY_PROGRESS
  const leadGapLaps = Math.max(
    0.009,
    1.35 / Math.max(55, leader.projectedLapTime),
  )
  let restartLineDistance =
    requestedRestartLineDistance ?? nextControlLine(leader.totalDistance)
  let pitEntryLeaderDistance =
    restartLineDistance - (1 - pitEntryProgress + leadGapLaps)

  // If operational readiness arrives after pit entry, the Race Director keeps
  // the Safety Car out for another lap rather than issuing a late unsafe call.
  while (pitEntryLeaderDistance <= leader.totalDistance + 0.015) {
    restartLineDistance += 1
    pitEntryLeaderDistance += 1
  }
  let pitEntrySafetyCarDistance =
    Math.floor(procedure.safetyCarDistance) + pitEntryProgress

  while (
    pitEntrySafetyCarDistance <= procedure.safetyCarDistance + 0.012
  ) {
    pitEntrySafetyCarDistance += 1
  }

  return {
    ...procedure,
    stage: 'in-this-lap' as const,
    orangeLights: false,
    greenLight: false,
    pitExitClosed: false,
    inThisLapAtSeconds: elapsedSeconds,
    pitEntryLeaderDistance,
    pitEntrySafetyCarDistance,
    pitEntryAtSeconds: null,
    restartLineDistance,
    restartTargetsByDriver: firstLineTargets(cars),
    returnNotBeforeLeaderDistance: restartLineDistance,
  }
}

function pitExitClosureWindow(
  safetyCarDistance: number,
  track: TrackDefinition,
) {
  const pitExitProgress = track.pitLane?.exitProgress ?? 0.13
  const distanceUntilPitExit =
    (pitExitProgress - lapProgress(safetyCarDistance) + 1) % 1

  return distanceUntilPitExit <= 0.1 || distanceUntilPitExit >= 0.975
}

function advanceUnlapping(options: {
  cars: CarSnapshot[]
  elapsedSeconds: number
  events: NeutralisationEvent[]
  leader: CarSnapshot
  phaseId: string
  procedure: SafetyCarProcedure
  track: TrackDefinition
}) {
  const {
    cars,
    elapsedSeconds,
    events,
    leader,
    phaseId,
    track,
  } = options
  const procedure = options.procedure
  const carsByDriver = new Map(cars.map((car) => [car.driverId, car]))
  const eligible = new Set(procedure.eligibleLappedDriverIds)
  const passedSafetyCarAt = {
    ...procedure.unlappingPassedSafetyCarAtDistanceByDriver,
  }
  const rejoined = new Set(procedure.unlappingRejoinedDriverIds)
  const unauthorized = new Set(
    procedure.unauthorizedSafetyCarOvertakeDriverIds,
  )
  const penaltyLapDriverIds: string[] = []

  for (const car of cars) {
    if (car.status !== 'running' || car.pitPhase !== 'none') {
      continue
    }

    const previousGap =
      procedure.lastObservedSafetyCarGapByDriver[car.driverId]
    const currentGap = signedPhysicalGap(
      car.totalDistance,
      procedure.safetyCarDistance,
    )
    const crossedSafetyCar =
      previousGap !== undefined &&
      previousGap <= SAFETY_CAR_LINE_EPSILON &&
      currentGap > SAFETY_CAR_LINE_EPSILON &&
      Math.abs(previousGap) < 0.12 &&
      currentGap < 0.12

    if (!crossedSafetyCar) {
      continue
    }

    if (eligible.has(car.driverId)) {
      if (passedSafetyCarAt[car.driverId] === undefined) {
        passedSafetyCarAt[car.driverId] = car.totalDistance
        events.push({
          atSeconds: elapsedSeconds,
          id: `sc-passed-${phaseId}-${car.driverId}`,
          message: `${car.code} has passed the Safety Car and must now proceed without overtaking to the back of the queue.`,
        })
      }
      continue
    }

    if (!unauthorized.has(car.driverId)) {
      unauthorized.add(car.driverId)
      penaltyLapDriverIds.push(car.driverId)
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-unauthorized-overtake-${phaseId}-${car.driverId}`,
        message: `${car.code} overtook the Safety Car without being named as eligible. Stewards: one penalty lap.`,
      })
    }
  }

  const allEligibleCarsPassed = procedure.eligibleLappedDriverIds.every(
    (driverId) => {
      const car = carsByDriver.get(driverId)
      return (
        !car ||
        car.status === 'retired' ||
        car.status === 'disqualified' ||
        car.status === 'dns' ||
        passedSafetyCarAt[driverId] !== undefined
      )
    },
  )

  if (procedure.greenLight && allEligibleCarsPassed) {
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-green-light-off-${phaseId}`,
      message: 'SAFETY CAR GREEN LIGHT OFF. Overtaking is no longer permitted except for the B5.13.2c exceptions.',
    })
  }

  const rejoiningDriverIds = procedure.eligibleLappedDriverIds.filter(
    (driverId) =>
      passedSafetyCarAt[driverId] !== undefined && !rejoined.has(driverId),
  )
  const rejoining = new Set(rejoiningDriverIds)
  const queueCandidates = runningOnTrackCars(cars)
    .filter((car) => !rejoining.has(car.driverId))
    .map((car) => ({
      car,
      gapBehindSafetyCar:
        (lapProgress(procedure.safetyCarDistance) -
          lapProgress(car.totalDistance) +
          1) %
        1,
    }))
    .filter(({ gapBehindSafetyCar }) => gapBehindSafetyCar <= 0.35)
    .sort((left, right) => right.gapBehindSafetyCar - left.gapBehindSafetyCar)
  const queueTail = queueCandidates[0]?.car ?? leader
  const joinGapLaps = Math.max(
    0.01,
    SAFETY_CAR_QUEUE_GAP_SECONDS / Math.max(45, leader.projectedLapTime),
  )

  for (const driverId of rejoiningDriverIds) {
    const car = carsByDriver.get(driverId)
    const passedAt = passedSafetyCarAt[driverId]

    if (!car || passedAt === undefined || car.totalDistance - passedAt < 0.2) {
      continue
    }

    const forwardGapToQueueTail =
      (lapProgress(queueTail.totalDistance) -
        lapProgress(car.totalDistance) +
        1) %
      1

    if (forwardGapToQueueTail <= joinGapLaps) {
      rejoined.add(driverId)
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-rejoined-${phaseId}-${driverId}`,
        message: `${car.code} has joined the back of the Safety Car queue and remains under the no-overtaking rule.`,
      })
    }
  }

  const allEligibleCarsRejoined = procedure.eligibleLappedDriverIds.every(
    (driverId) => {
      const car = carsByDriver.get(driverId)
      return (
        !car ||
        car.status === 'retired' ||
        car.status === 'disqualified' ||
        car.status === 'dns' ||
        rejoined.has(driverId)
      )
    },
  )
  const pitExitClosed =
    !allEligibleCarsRejoined &&
    pitExitClosureWindow(procedure.safetyCarDistance, track)

  if (pitExitClosed !== procedure.pitExitClosed) {
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-pit-exit-${pitExitClosed ? 'closed' : 'open'}-${phaseId}-${Math.floor(elapsedSeconds)}`,
      message: pitExitClosed
        ? 'PIT EXIT CLOSED while the Safety Car queue passes the exit.'
        : 'PIT EXIT OPEN after the Safety Car queue has cleared the exit.',
    })
  }

  return {
    penaltyLapDriverIds,
    procedure: {
      ...procedure,
      greenLight: !allEligibleCarsPassed,
      lastObservedSafetyCarGapByDriver: Object.fromEntries(
        cars.map((car) => [
          car.driverId,
          signedPhysicalGap(car.totalDistance, procedure.safetyCarDistance),
        ]),
      ),
      pitExitClosed,
      unauthorizedSafetyCarOvertakeDriverIds: [...unauthorized],
      unlappingPassedSafetyCarAtDistanceByDriver: passedSafetyCarAt,
      unlappingRejoinedDriverIds: [...rejoined],
    },
  }
}

function advanceVsc(
  phase: ActiveFlagPhase,
  procedure: Extract<NeutralisationProcedure, { kind: 'vsc' }>,
  elapsedSeconds: number,
  seed: string,
): NeutralisationAdvanceResult {
  const events: NeutralisationEvent[] = []
  let nextProcedure = procedure

  if (procedure.stage === 'deployed' && elapsedSeconds >= phase.endSeconds) {
    const endingStartedAtSeconds = phase.endSeconds
    const resumeAtSeconds =
      endingStartedAtSeconds +
      10 +
      hashChance(`${seed}:${phase.id}:vsc-ending-delay`) * 5
    nextProcedure = {
      ...procedure,
      stage: 'ending',
      endingStartedAtSeconds,
      resumeAtSeconds,
    }
    events.push({
      atSeconds: endingStartedAtSeconds,
      id: `vsc-ending-${phase.id}`,
      message: 'VSC ENDING. FIA light panels will turn green in 10 to 15 seconds.',
    })
  }

  if (
    nextProcedure.stage === 'ending' &&
    nextProcedure.resumeAtSeconds !== null &&
    elapsedSeconds >= nextProcedure.resumeAtSeconds
  ) {
    events.push({
      atSeconds: nextProcedure.resumeAtSeconds,
      id: `vsc-green-${phase.id}`,
      message: 'GREEN FLAG. VSC procedure complete; racing resumes immediately.',
    })

    return {
      completedFlag: 'vsc',
      events,
      greenLightUntilSeconds: nextProcedure.resumeAtSeconds + 30,
      penaltyLapDriverIds: [],
      phase: null,
      restartTargetsByDriver: null,
    }
  }

  return {
    completedFlag: null,
    events,
    greenLightUntilSeconds: null,
    penaltyLapDriverIds: [],
    phase: { ...phase, neutralisation: nextProcedure },
    restartTargetsByDriver: null,
  }
}

function advanceSafetyCar(
  phase: ActiveFlagPhase,
  initialProcedure: Extract<
    NeutralisationProcedure,
    { kind: 'safety-car' }
  >,
  cars: CarSnapshot[],
  elapsedSeconds: number,
  track: TrackDefinition,
  seed: string,
  overtakingPermitted: boolean,
  lowVisibility: boolean,
  finishingLap: boolean,
): NeutralisationAdvanceResult {
  const events: NeutralisationEvent[] = []
  const penaltyLapDriverIds: string[] = []
  const running = runningOnTrackCars(cars)
  const leader = running[0]

  if (!leader) {
    return {
      completedFlag: null,
      events,
      greenLightUntilSeconds: null,
      penaltyLapDriverIds,
      phase: { ...phase, neutralisation: initialProcedure },
      restartTargetsByDriver: null,
    }
  }

  let procedure = initialProcedure
  procedure = {
    ...procedure,
    maximumQueueGapCarLengths: lowVisibility ? 20 : 10,
  }
  if (
    lowVisibility &&
    initialProcedure.maximumQueueGapCarLengths !== 20
  ) {
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-low-visibility-${phase.id}`,
      message: 'LOW VISIBILITY - MAXIMUM GAP TWENTY CAR LENGTHS.',
    })
  }
  if (
    procedure.pitLaneRouteRequired &&
    procedure.pitLaneRouteAnnouncedAtSeconds == null &&
    elapsedSeconds >= phase.startSeconds + SAFETY_CAR_JOIN_SIGNAL_SECONDS
  ) {
    procedure = {
      ...procedure,
      pitLaneRouteAnnouncedAtSeconds: elapsedSeconds,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-use-pit-lane-${phase.id}`,
      message:
        'SAFETY CAR AND ALL CARS MUST USE PIT LANE. No overtaking in Pit Entry or Pit Exit Road unless a car has an obvious problem.',
    })
  }
  const releaseLeaderDistance = safetyCarReleaseLeaderDistance(
    procedure.leaderDistanceAtDeployment,
    track,
  )

  if (
    procedure.stage === 'deployed' &&
    elapsedSeconds >= phase.startSeconds + SAFETY_CAR_JOIN_SIGNAL_SECONDS &&
    leader.totalDistance + SAFETY_CAR_LINE_EPSILON >= releaseLeaderDistance
  ) {
    procedure = {
      ...procedure,
      stage: 'collecting-field',
      safetyCarLastUpdatedAtSeconds: elapsedSeconds,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-on-track-${phase.id}`,
      message:
        'SAFETY CAR ON TRACK - LEAVING PIT EXIT. The leader is through the final corner and the field must form the queue behind it.',
    })
  }
  const leaderWasCollected = hasLeaderCaughtSafetyCar(
    procedure,
    leader,
  )
  const safetyCarDeltaSeconds = Math.max(
    0,
    elapsedSeconds - procedure.safetyCarLastUpdatedAtSeconds,
  )
  const safetyCarPaceScale =
    procedure.leaderCollectedAtSeconds === null
      ? 0.34
      : procedure.stage === 'in-this-lap'
        ? SAFETY_CAR_IN_THIS_LAP_PACE_SCALE
        : SAFETY_CAR_QUEUE_PACE_SCALE

  if (procedure.stage !== 'deployed' && procedure.stage !== 'pit-entry') {
    // Once the leader is behind it, the safety car trims its pace to hold the
    // ten-car-length maximum the regulations set for that gap. The cars run
    // through the vehicle model and cover a neutralised lap a little slower
    // than a flat fraction of a racing lap implies, so a safety car left to its
    // own pace keeps gaining and the field is strung out behind it.
    //
    // This adjusts speed, not position. Clamping the safety car to a fixed
    // distance ahead of the leader looks right but throttles the whole field:
    // the leader may not pass the safety car, so tying the two together frame
    // by frame caps how far the leader can travel and the queue crawls.
    const lapSeconds = Math.max(55, leader.projectedLapTime)
    const holdsStationWithLeader =
      procedure.leaderCollectedAtSeconds !== null &&
      procedure.stage !== 'in-this-lap'
    const gapErrorSeconds = holdsStationWithLeader
      ? (procedure.safetyCarDistance - leader.totalDistance) * lapSeconds -
        SAFETY_CAR_LEADER_TARGET_GAP_SECONDS
      : 0
    const paceCorrection = Math.min(
      0.08,
      Math.max(-0.08, -gapErrorSeconds * 0.02),
    )
    const safetyCarDistance =
      procedure.safetyCarDistance +
      (safetyCarDeltaSeconds / Math.max(45, track.baseLapTime)) *
        (safetyCarPaceScale + paceCorrection)
    procedure = {
      ...procedure,
      leaderCollectionTargetDistance: safetyCarDistance,
      safetyCarDistance,
      safetyCarLastUpdatedAtSeconds: elapsedSeconds,
    }
  }

  procedure = captureEligibilityAtReferenceLines(procedure, cars, leader)

  if (finishingLap && !procedure.finishingUnderSafetyCar) {
    const pitEntryProgress =
      track.pitLane?.entryProgress ?? SAFETY_CAR_PIT_ENTRY_PROGRESS
    let pitEntrySafetyCarDistance =
      Math.floor(procedure.safetyCarDistance) + pitEntryProgress

    while (
      pitEntrySafetyCarDistance <= procedure.safetyCarDistance + 0.012
    ) {
      pitEntrySafetyCarDistance += 1
    }

    procedure = {
      ...procedure,
      stage: 'in-this-lap',
      orangeLights: false,
      greenLight: false,
      pitExitClosed: false,
      finishingUnderSafetyCar: true,
      inThisLapAtSeconds: elapsedSeconds,
      pitEntryLeaderDistance: null,
      pitEntrySafetyCarDistance,
      pitEntryAtSeconds: null,
      restartLineDistance: null,
      restartTargetsByDriver: null,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-final-lap-${phase.id}`,
      message:
        'FINAL LAP UNDER SAFETY CAR. Orange lights extinguished approaching pit entry; yellow flags and SC boards remain, and no overtaking is permitted before the Line.',
    })
  }

  if (
    procedure.stage === 'collecting-field' &&
    procedure.leaderCollectedAtSeconds === null &&
    (leaderWasCollected || hasLeaderCaughtSafetyCar(procedure, leader))
  ) {
    procedure = {
      ...procedure,
      leaderCollectedAtSeconds: elapsedSeconds,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-leader-collected-${phase.id}`,
      message: `${leader.code} is now behind the Safety Car; the remaining field is forming the queue.`,
    })
  }

  if (
    procedure.stage === 'collecting-field' &&
    procedure.leaderCollectedAtSeconds !== null &&
    isSafetyCarFieldQueued(
      cars,
      leader.projectedLapTime,
      procedure.maximumQueueGapCarLengths,
    )
  ) {
    procedure = {
      ...procedure,
      stage: 'queue-formed',
      fieldQueuedAtSeconds: elapsedSeconds,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-queue-formed-${phase.id}`,
      message: 'SAFETY CAR QUEUE FORMED. Race Control continues the safety check.',
    })
  }

  const eligibilityComplete = Object.values(
    procedure.eligibilityStatusByDriver,
  ).every((status) => status !== 'pending')

  if (
    procedure.stage === 'queue-formed' &&
    procedure.fieldQueuedAtSeconds !== null &&
    eligibilityComplete &&
    elapsedSeconds >=
      Math.max(phase.endSeconds, procedure.fieldQueuedAtSeconds + 4)
  ) {
    const eligibleLappedCars = procedure.eligibleLappedDriverIds
      .map((driverId) => cars.find((car) => car.driverId === driverId))
      .filter((car): car is CarSnapshot => Boolean(car))

    if (!overtakingPermitted) {
      procedure = beginSafetyCarWithdrawal({
        cars,
        elapsedSeconds,
        leader,
        procedure: {
          ...procedure,
          overtakingNotPermittedAtSeconds: elapsedSeconds,
        },
        requestedRestartLineDistance: null,
        track,
      })
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-no-overtaking-${phase.id}`,
        message: 'OVERTAKING WILL NOT BE PERMITTED. Track conditions are unsuitable for the lapped-car procedure.',
      })
    } else if (eligibleLappedCars.length > 0) {
      const returnNotBeforeLeaderDistance =
        followingLapEndDistance(leader.totalDistance)
      const noticeLeadLaps =
        0.34 + hashChance(`${seed}:${phase.id}:sc-withdrawal-notice`) * 0.3
      procedure = {
        ...procedure,
        stage: 'unlapping',
        greenLight: true,
        eligibleLappedDriverIds: eligibleLappedCars.map((car) => car.driverId),
        unlappingOrderDriverIds: eligibleLappedCars
          .slice()
          .sort((left, right) => right.totalDistance - left.totalDistance)
          .map((car) => car.driverId),
        lappedCarsMayOvertakeAtSeconds: elapsedSeconds,
        lastObservedSafetyCarGapByDriver: Object.fromEntries(
          cars.map((car) => [
            car.driverId,
            signedPhysicalGap(car.totalDistance, procedure.safetyCarDistance),
          ]),
        ),
        returnNotBeforeLeaderDistance,
        inThisLapEarliestLeaderDistance:
          returnNotBeforeLeaderDistance - noticeLeadLaps,
      }
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-unlap-${phase.id}`,
        message: `LAPPED CARS MAY NOW OVERTAKE: ${eligibleLappedCars.map((car) => car.code).join(', ')}. Only these named cars may pass the lead-lap queue and Safety Car.`,
      })
    } else {
      procedure = beginSafetyCarWithdrawal({
        cars,
        elapsedSeconds,
        leader,
        procedure,
        requestedRestartLineDistance: null,
        track,
      })
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-in-this-lap-${phase.id}`,
        message: 'SAFETY CAR IN THIS LAP. Orange lights extinguished; the leader now controls the queue pace.',
      })
    }
  }

  if (procedure.stage === 'unlapping') {
    const unlapping = advanceUnlapping({
      cars,
      elapsedSeconds,
      events,
      leader,
      phaseId: phase.id,
      procedure,
      track,
    })
    procedure = unlapping.procedure
    penaltyLapDriverIds.push(...unlapping.penaltyLapDriverIds)
    const carsByDriver = new Map(cars.map((car) => [car.driverId, car]))
    const rejoined = new Set(procedure.unlappingRejoinedDriverIds)
    const unlappingComplete = procedure.eligibleLappedDriverIds.every(
      (driverId) => {
        const car = carsByDriver.get(driverId)
        return !car || car.status !== 'running' || rejoined.has(driverId)
      },
    )
    const returnDistance = procedure.returnNotBeforeLeaderDistance
    const noticeDistance = procedure.inThisLapEarliestLeaderDistance

    if (
      unlappingComplete &&
      returnDistance !== null &&
      noticeDistance !== null &&
      leader.totalDistance >= noticeDistance
    ) {
      procedure = beginSafetyCarWithdrawal({
        cars,
        elapsedSeconds,
        leader,
        procedure,
        requestedRestartLineDistance: returnDistance,
        track,
      })
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-in-this-lap-${phase.id}`,
        message: 'SAFETY CAR IN THIS LAP. Orange lights extinguished; the leader now controls the queue pace.',
      })
    } else if (
      !unlappingComplete &&
      returnDistance !== null &&
      leader.totalDistance >= returnDistance - 0.04
    ) {
      procedure = {
        ...procedure,
        returnNotBeforeLeaderDistance: returnDistance + 1,
        inThisLapEarliestLeaderDistance:
          (noticeDistance ?? returnDistance - 0.5) + 1,
      }
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-unlap-extended-${phase.id}-${Math.floor(returnDistance)}`,
        message: 'SAFETY CAR REMAINS DEPLOYED. The unlapping procedure is still being completed.',
      })
    }
  }

  if (
    procedure.stage === 'in-this-lap' &&
    procedure.pitEntrySafetyCarDistance !== null &&
    procedure.safetyCarDistance >= procedure.pitEntrySafetyCarDistance
  ) {
    procedure = {
      ...procedure,
      stage: 'pit-entry',
      pitEntryAtSeconds: elapsedSeconds,
      safetyCarLastUpdatedAtSeconds: elapsedSeconds,
    }
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-pit-entry-${phase.id}`,
      message: procedure.finishingUnderSafetyCar
        ? 'SAFETY CAR ENTERING PIT ENTRY ROAD. The field takes the chequered flag without overtaking before the Line.'
        : 'SAFETY CAR ENTERING PIT ENTRY ROAD. No overtaking before each car first crosses the Line.',
    })
  }

  if (
    procedure.stage === 'pit-entry' &&
    !procedure.finishingUnderSafetyCar &&
    procedure.restartLineDistance !== null &&
    leader.totalDistance >= procedure.restartLineDistance
  ) {
    events.push({
      atSeconds: elapsedSeconds,
      id: `sc-green-${phase.id}`,
      message: 'GREEN FLAG. Safety Car is in the Pit Lane; racing resumes at the Line.',
    })

    return {
      completedFlag: 'sc',
      events,
      greenLightUntilSeconds: elapsedSeconds + 10,
      penaltyLapDriverIds,
      phase: null,
      restartTargetsByDriver:
        procedure.restartTargetsByDriver ?? firstLineTargets(cars),
    }
  }

  if (procedure.stage !== 'unlapping') {
    procedure = {
      ...procedure,
      lastObservedSafetyCarGapByDriver: Object.fromEntries(
        cars.map((car) => [
          car.driverId,
          signedPhysicalGap(car.totalDistance, procedure.safetyCarDistance),
        ]),
      ),
    }
  }

  return {
    completedFlag: null,
    events,
    greenLightUntilSeconds: null,
    penaltyLapDriverIds,
    phase: { ...phase, neutralisation: procedure },
    restartTargetsByDriver: null,
  }
}

export function advanceNeutralisationProcedure(options: {
  cars: CarSnapshot[]
  elapsedSeconds: number
  finishingLap?: boolean
  lowVisibility?: boolean
  overtakingPermitted?: boolean
  phase: ActiveFlagPhase
  seed: string
  track: TrackDefinition
}): NeutralisationAdvanceResult {
  const {
    cars,
    elapsedSeconds,
    finishingLap = false,
    lowVisibility = false,
    overtakingPermitted = true,
    seed,
    track,
  } = options
  const phase = ensureNeutralisationProcedure(options.phase, cars, track)
  const procedure = phase.neutralisation

  if (phase.flag === 'vsc' && procedure?.kind === 'vsc') {
    return advanceVsc(phase, procedure, elapsedSeconds, seed)
  }

  if (phase.flag === 'sc' && procedure?.kind === 'safety-car') {
    return advanceSafetyCar(
      phase,
      procedure,
      cars,
      elapsedSeconds,
      track,
      seed,
      overtakingPermitted,
      lowVisibility,
      finishingLap,
    )
  }

  return {
    completedFlag: null,
    events: [],
    greenLightUntilSeconds: null,
    penaltyLapDriverIds: [],
    phase,
    restartTargetsByDriver: null,
  }
}

export function controlProcedureStatusMessage(phase: ActiveFlagPhase) {
  const procedure = phase.neutralisation

  if (procedure?.kind === 'vsc') {
    return procedure.stage === 'ending'
      ? 'VSC ENDING. Maintain the ECU delta until the FIA panels turn green.'
      : 'VSC DEPLOYED. Maintain the FIA ECU delta in every marshalling sector.'
  }

  if (procedure?.kind !== 'safety-car') {
    return phase.startMessage
  }

  if (procedure.finishingUnderSafetyCar) {
    return procedure.stage === 'pit-entry'
      ? 'SAFETY CAR IN PIT ENTRY ROAD. The field takes the chequered flag without overtaking.'
      : 'FINAL LAP UNDER SAFETY CAR. SC boards and yellow flags remain until the Line.'
  }

  switch (procedure.stage) {
    case 'deployed':
      return 'SAFETY CAR DEPLOYED. Reduce speed; the Safety Car is waiting at pit exit for the leader to round the final corner.'
    case 'collecting-field':
      return 'SAFETY CAR. The leader and remaining field are forming the queue.'
    case 'queue-formed':
      return 'SAFETY CAR QUEUE FORMED. Race Control is confirming the circuit is safe.'
    case 'unlapping':
      return 'LAPPED CARS MAY NOW OVERTAKE. Lead-lap cars remain on the racing line.'
    case 'in-this-lap':
      return 'SAFETY CAR IN THIS LAP. Lights out; the leader controls a steady restart pace.'
    case 'pit-entry':
      return 'SAFETY CAR IN PIT ENTRY ROAD. No overtaking before the Line.'
    default:
      return phase.startMessage
  }
}
