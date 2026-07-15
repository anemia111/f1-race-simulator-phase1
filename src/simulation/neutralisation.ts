import type {
  ActiveFlagPhase,
  CarSnapshot,
  NeutralisationProcedure,
  TrackDefinition,
} from '../types'
import { hashChance } from './random'

const SAFETY_CAR_JOIN_SIGNAL_SECONDS = 2
const SAFETY_CAR_QUEUE_GAP_SECONDS = 1.35
const SAFETY_CAR_PIT_ENTRY_PROGRESS = 0.965

export type NeutralisationEvent = {
  atSeconds: number
  id: string
  message: string
}

export type NeutralisationAdvanceResult = {
  completedFlag: 'sc' | 'vsc' | null
  events: NeutralisationEvent[]
  greenLightUntilSeconds: number | null
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

function leaderCollectionTarget(
  leaderDistance: number,
  track: TrackDefinition,
) {
  const pitExitProgress = track.pitLane?.exitProgress ?? 0.13
  let target = Math.floor(leaderDistance) + pitExitProgress

  // The Safety Car joins from pit exit regardless of where the leader is.
  // If it emerges behind the leader, the leader must complete the remainder
  // of the lap before catching it.
  while (target <= leaderDistance + 0.06) {
    target += 1
  }

  return target
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
) {
  const running = runningOnTrackCars(cars)

  if (running.length <= 1) {
    return running.length === 1
  }

  const maximumGapLaps =
    SAFETY_CAR_QUEUE_GAP_SECONDS / Math.max(45, referenceLapTimeSeconds)

  return running.slice(1).every((car, index) => {
    const ahead = running[index]
    const rawGap = Math.max(0, ahead.totalDistance - car.totalDistance)
    const physicalGapLaps = rawGap - Math.floor(rawGap)

    return physicalGapLaps <= maximumGapLaps
  })
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

  return {
    kind: 'safety-car',
    stage: 'deployed',
    orangeLights: true,
    leaderDistanceAtDeployment: leaderDistance,
    leaderCollectionTargetDistance: collectionTarget,
    safetyCarDistance: collectionTarget,
    safetyCarLastUpdatedAtSeconds: phase.startSeconds,
    leaderCollectedAtSeconds: null,
    fieldQueuedAtSeconds: null,
    eligibleLappedDriverIds: [],
    lappedCarsMayOvertakeAtSeconds: null,
    returnNotBeforeLeaderDistance: null,
    inThisLapEarliestLeaderDistance: null,
    inThisLapAtSeconds: null,
    pitEntryLeaderDistance: null,
    pitEntrySafetyCarDistance: null,
    pitEntryAtSeconds: null,
    restartLineDistance: null,
    restartTargetsByDriver: null,
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
    inThisLapAtSeconds: elapsedSeconds,
    pitEntryLeaderDistance,
    pitEntrySafetyCarDistance,
    pitEntryAtSeconds: null,
    restartLineDistance,
    restartTargetsByDriver: firstLineTargets(cars),
    returnNotBeforeLeaderDistance: restartLineDistance,
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
      phase: null,
      restartTargetsByDriver: null,
    }
  }

  return {
    completedFlag: null,
    events,
    greenLightUntilSeconds: null,
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
): NeutralisationAdvanceResult {
  const events: NeutralisationEvent[] = []
  const running = runningOnTrackCars(cars)
  const leader = running[0]

  if (!leader) {
    return {
      completedFlag: null,
      events,
      greenLightUntilSeconds: null,
      phase: { ...phase, neutralisation: initialProcedure },
      restartTargetsByDriver: null,
    }
  }

  let procedure = initialProcedure
  const leaderCollectionGapLaps = Math.max(
    0.018,
    1.7 / Math.max(55, leader.projectedLapTime),
  )
  const leaderWasWithinCollectionGap =
    initialProcedure.safetyCarDistance - leader.totalDistance <=
    leaderCollectionGapLaps
  const safetyCarDeltaSeconds = Math.max(
    0,
    elapsedSeconds - procedure.safetyCarLastUpdatedAtSeconds,
  )
  const safetyCarPaceScale =
    procedure.leaderCollectedAtSeconds === null
      ? 0.34
      : procedure.stage === 'in-this-lap'
        ? 0.54
        : 0.5

  if (procedure.stage !== 'pit-entry') {
    const safetyCarDistance =
      procedure.safetyCarDistance +
      (safetyCarDeltaSeconds / Math.max(45, track.baseLapTime)) *
        safetyCarPaceScale
    procedure = {
      ...procedure,
      leaderCollectionTargetDistance: safetyCarDistance,
      safetyCarDistance,
      safetyCarLastUpdatedAtSeconds: elapsedSeconds,
    }
  }

  if (
    procedure.stage === 'deployed' &&
    elapsedSeconds >= phase.startSeconds + SAFETY_CAR_JOIN_SIGNAL_SECONDS
  ) {
    procedure = { ...procedure, stage: 'collecting-field' }
    events.push({
      atSeconds: phase.startSeconds + SAFETY_CAR_JOIN_SIGNAL_SECONDS,
      id: `sc-on-track-${phase.id}`,
      message: 'SAFETY CAR ON TRACK. Drivers reduce speed and form a queue behind it.',
    })
  }

  if (
    procedure.stage === 'collecting-field' &&
    procedure.leaderCollectedAtSeconds === null &&
    (leaderWasWithinCollectionGap ||
      procedure.safetyCarDistance - leader.totalDistance <=
        leaderCollectionGapLaps)
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
    isSafetyCarFieldQueued(cars, leader.projectedLapTime)
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

  if (
    procedure.stage === 'queue-formed' &&
    procedure.fieldQueuedAtSeconds !== null &&
    elapsedSeconds >=
      Math.max(phase.endSeconds, procedure.fieldQueuedAtSeconds + 4)
  ) {
    const eligibleLappedCars = running.filter(
      (car) =>
        car.driverId !== leader.driverId &&
        leader.totalDistance - car.totalDistance >= 0.8 &&
        !car.hasUnlappedUnderSafetyCar,
    )

    if (eligibleLappedCars.length > 0) {
      const returnNotBeforeLeaderDistance =
        followingLapEndDistance(leader.totalDistance)
      const noticeLeadLaps =
        0.34 + hashChance(`${seed}:${phase.id}:sc-withdrawal-notice`) * 0.3
      procedure = {
        ...procedure,
        stage: 'unlapping',
        eligibleLappedDriverIds: eligibleLappedCars.map(
          (car) => car.driverId,
        ),
        lappedCarsMayOvertakeAtSeconds: elapsedSeconds,
        returnNotBeforeLeaderDistance,
        inThisLapEarliestLeaderDistance:
          returnNotBeforeLeaderDistance - noticeLeadLaps,
      }
      events.push({
        atSeconds: elapsedSeconds,
        id: `sc-unlap-${phase.id}`,
        message: 'LAPPED CARS MAY NOW OVERTAKE. Eligible cars pass the lead-lap queue and Safety Car.',
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
    const carsByDriver = new Map(cars.map((car) => [car.driverId, car]))
    const unlappingComplete = procedure.eligibleLappedDriverIds.every(
      (driverId) => {
        const car = carsByDriver.get(driverId)
        return !car || car.status !== 'running' || car.hasUnlappedUnderSafetyCar
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
      message: 'SAFETY CAR ENTERING PIT ENTRY ROAD. No overtaking before each car first crosses the Line.',
    })
  }

  if (
    procedure.stage === 'pit-entry' &&
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
      phase: null,
      restartTargetsByDriver:
        procedure.restartTargetsByDriver ?? firstLineTargets(cars),
    }
  }

  return {
    completedFlag: null,
    events,
    greenLightUntilSeconds: null,
    phase: { ...phase, neutralisation: procedure },
    restartTargetsByDriver: null,
  }
}

export function advanceNeutralisationProcedure(options: {
  cars: CarSnapshot[]
  elapsedSeconds: number
  phase: ActiveFlagPhase
  seed: string
  track: TrackDefinition
}): NeutralisationAdvanceResult {
  const { cars, elapsedSeconds, seed, track } = options
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
    )
  }

  return {
    completedFlag: null,
    events: [],
    greenLightUntilSeconds: null,
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

  switch (procedure.stage) {
    case 'deployed':
      return 'SAFETY CAR DEPLOYED. Reduce speed and observe the FIA delta.'
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
