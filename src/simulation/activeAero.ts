import type {
  ActiveAeroMode,
  ActiveAeroState,
  ActiveAeroTransitionState,
  ActiveFlagPhase,
  AeroActivationZone,
  CarSnapshot,
  DriverAdjustableBodyworkState,
  OvertakeEligibility,
  OvertakeStatus,
  TrackDefinition,
} from '../types'
import { FIA_2026_REGULATION_PROFILE } from './regulations'

export type {
  ActiveAeroFailureState,
  ActiveAeroState,
  ActiveAeroTransitionState,
  DriverAdjustableBodyworkState,
} from '../types'

const OVERTAKE_ACTIVATION_LENGTH = 0.12

/** C3.10.10/C3.11.6 require both wing systems to settle within 400 ms. */
export const ACTIVE_AERO_TRANSITION_LIMIT_SECONDS = 0.4

function progressIsInZone(progress: number, start: number, end: number) {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end
}

function firstCrossingAfter(totalDistance: number, progress: number) {
  const lap = Math.floor(totalDistance)
  const thisLap = lap + progress

  return thisLap > totalDistance + 1e-9 ? thisLap : thisLap + 1
}

function activationLapForDetection(
  detectionDistance: number,
  detectionProgress: number,
  activationProgress: number,
) {
  return (
    Math.floor(detectionDistance) +
    (activationProgress + 1e-9 < detectionProgress ? 1 : 0)
  )
}

function activationLapAtProgress(
  totalDistance: number,
  activationProgress: number,
) {
  const progress = ((totalDistance % 1) + 1) % 1
  const end = (activationProgress + OVERTAKE_ACTIVATION_LENGTH) % 1
  const wraps = end < activationProgress

  return Math.floor(totalDistance) - (wraps && progress <= end ? 1 : 0)
}

/**
 * Samples the time gap only when a car crosses an FIA detection line. The
 * result is deliberately latched: closing up after the line cannot make the
 * car eligible, and dropping back before activation cannot remove eligibility.
 */
export function updateOvertakeEligibilityAfterTravel(options: {
  car: CarSnapshot
  nextTotalDistance: number
  phase: ActiveFlagPhase | null
  previousTotalDistance: number
  raceControlEnabled: boolean
  track: TrackDefinition
  lowGripConditions: boolean
}): OvertakeEligibility | null {
  const {
    car,
    nextTotalDistance,
    phase,
    previousTotalDistance,
    raceControlEnabled,
    track,
    lowGripConditions,
  } = options

  // FIA Overtake eligibility belongs exclusively to the F1 runtime branch.
  // SUPER FORMULA carries an independently sourced OTS policy instead.
  if (car.runtimeSystems.kind !== 'f1') {
    return null
  }

  if (
    car.status !== 'running' ||
    phase ||
    !raceControlEnabled ||
    lowGripConditions
  ) {
    return null
  }

  const crossed = (track.overtakeControlLines ?? [])
    .map((line, controlLineIndex) => ({
      controlLineIndex,
      crossingDistance: firstCrossingAfter(
        previousTotalDistance,
        line.detectionProgress,
      ),
      line,
    }))
    .filter(
      ({ crossingDistance }) => crossingDistance <= nextTotalDistance + 1e-9,
    )
    .sort((left, right) => left.crossingDistance - right.crossingDistance)
    .at(-1)

  if (!crossed) {
    return car.runtimeSystems.overtakeEligibility
  }

  const detectedGapSeconds = Math.max(0, car.gapToAhead)

  return {
    activationLap: activationLapForDetection(
      crossed.crossingDistance,
      crossed.line.detectionProgress,
      crossed.line.activationProgress,
    ),
    controlLineIndex: crossed.controlLineIndex,
    detectedGapSeconds,
    eligible:
      car.position > 1 &&
      detectedGapSeconds > 0 &&
      detectedGapSeconds <= crossed.line.detectionGapSeconds,
  }
}

export function activeAeroZoneAt(
  track: TrackDefinition,
  progress: number,
  lowGripConditions = false,
): AeroActivationZone | null {
  return (
    track.aeroActivationZones?.find((zone) =>
      progressIsInZone(
        progress,
        lowGripConditions && zone.lowGripStart !== undefined
          ? zone.lowGripStart
          : zone.start,
        zone.end,
      ),
    ) ?? null
  )
}

export function activeAeroModeFor(options: {
  car: Pick<CarSnapshot, 'progress' | 'status'>
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  track: TrackDefinition
}): ActiveAeroMode {
  const { car, lowGripConditions, phase, track } = options
  const zone = activeAeroZoneAt(track, car.progress, lowGripConditions)

  if (!zone || car.status !== 'running' || phase) {
    return 'corner'
  }

  if (lowGripConditions) {
    return zone.lowGripMode === 'partial' ? 'partial-straight' : 'corner'
  }

  return 'straight'
}

export function createInitialActiveAeroState(): ActiveAeroState {
  return {
    activationZoneId: null,
    command: 'corner',
    commandAtSeconds: null,
    failureState: 'operational',
    front: 'corner',
    frontStraightFraction: 0,
    rear: 'corner',
    rearStraightFraction: 0,
    transition: null,
    transitionProgress: 1,
  }
}

/**
 * The technical regulations permit a State of Deployment change only while
 * stationary or while the car is inside the applicable Activation Zone.
 */
export function activeAeroStateOfDeploymentCanChange(options: {
  car: Pick<CarSnapshot, 'progress' | 'speedKph'>
  lowGripConditions: boolean
  track: TrackDefinition
}) {
  const { car, lowGripConditions, track } = options

  return (
    (Number.isFinite(car.speedKph) && car.speedKph <= 0) ||
    activeAeroZoneAt(track, car.progress, lowGripConditions) !== null
  )
}

function activeAeroTargetsFor(command: ActiveAeroMode) {
  switch (command) {
    case 'straight':
      return { front: 1, rear: 1 }
    case 'partial-straight':
      return { front: 1, rear: 0 }
    case 'corner':
      return { front: 0, rear: 0 }
  }
}

const ACTIVE_AERO_MODES = new Set<ActiveAeroMode>([
  'corner',
  'partial-straight',
  'straight',
])
const BODYWORK_STATES = new Set<DriverAdjustableBodyworkState>([
  'corner',
  'transition-to-straight',
  'straight',
  'transition-to-corner',
  'failed-corner-safe',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1

const isActiveAeroMode = (value: unknown): value is ActiveAeroMode =>
  typeof value === 'string' &&
  ACTIVE_AERO_MODES.has(value as ActiveAeroMode)

/** Validates the complete durable shape before checkpoint restoration. */
export function isActiveAeroState(value: unknown): value is ActiveAeroState {
  if (
    !isRecord(value) ||
    !(value.activationZoneId === null ||
      typeof value.activationZoneId === 'string') ||
    !isActiveAeroMode(value.command) ||
    !(value.commandAtSeconds === null ||
      (typeof value.commandAtSeconds === 'number' &&
        Number.isFinite(value.commandAtSeconds) &&
        value.commandAtSeconds >= 0)) ||
    (value.failureState !== 'operational' &&
      value.failureState !== 'failed-corner-safe') ||
    typeof value.front !== 'string' ||
    !BODYWORK_STATES.has(value.front as DriverAdjustableBodyworkState) ||
    !isUnitInterval(value.frontStraightFraction) ||
    typeof value.rear !== 'string' ||
    !BODYWORK_STATES.has(value.rear as DriverAdjustableBodyworkState) ||
    !isUnitInterval(value.rearStraightFraction) ||
    !isUnitInterval(value.transitionProgress)
  ) {
    return false
  }

  if (value.failureState === 'failed-corner-safe') {
    return (
      value.command === 'corner' &&
      value.front === 'failed-corner-safe' &&
      value.frontStraightFraction === 0 &&
      value.rear === 'failed-corner-safe' &&
      value.rearStraightFraction === 0 &&
      value.transition === null &&
      value.transitionProgress === 1
    )
  }

  if (value.transition === null) {
    const target = activeAeroTargetsFor(value.command)

    return (
      value.frontStraightFraction === target.front &&
      value.rearStraightFraction === target.rear &&
      value.front === (target.front === 1 ? 'straight' : 'corner') &&
      value.rear === (target.rear === 1 ? 'straight' : 'corner') &&
      value.transitionProgress === 1
    )
  }

  const transition = value.transition
  const target = activeAeroTargetsFor(value.command)

  if (
    value.commandAtSeconds === null ||
    !isRecord(transition) ||
    !(
      typeof transition.durationSeconds === 'number' &&
      Number.isFinite(transition.durationSeconds) &&
      transition.durationSeconds > 0 &&
      transition.durationSeconds <= ACTIVE_AERO_TRANSITION_LIMIT_SECONDS &&
      typeof transition.elapsedSeconds === 'number' &&
      Number.isFinite(transition.elapsedSeconds) &&
      transition.elapsedSeconds >= 0 &&
      transition.elapsedSeconds < transition.durationSeconds &&
      isActiveAeroMode(transition.fromCommand) &&
      isActiveAeroMode(transition.toCommand) &&
      transition.toCommand === value.command &&
      isUnitInterval(transition.frontStartStraightFraction) &&
      isUnitInterval(transition.rearStartStraightFraction)
    )
  ) {
    return false
  }

  const progress = transition.elapsedSeconds / transition.durationSeconds
  const expectedFront =
    transition.frontStartStraightFraction +
    (target.front - transition.frontStartStraightFraction) * progress
  const expectedRear =
    transition.rearStartStraightFraction +
    (target.rear - transition.rearStartStraightFraction) * progress

  return (
    Math.abs(value.transitionProgress - progress) <= 1e-8 &&
    Math.abs(value.frontStraightFraction - expectedFront) <= 1e-8 &&
    Math.abs(value.rearStraightFraction - expectedRear) <= 1e-8 &&
    value.front ===
      bodyworkStateFor({
        current: expectedFront,
        failed: false,
        target: target.front,
      }) &&
    value.rear ===
      bodyworkStateFor({
        current: expectedRear,
        failed: false,
        target: target.rear,
      })
  )
}

/**
 * Legacy display adapter. A transition is shown as Corner Mode until both
 * commanded wing positions settle; force integration must use the fractions.
 */
export function activeAeroDisplayModeForState(
  state: ActiveAeroState,
): ActiveAeroMode {
  return state.failureState === 'failed-corner-safe' || state.transition
    ? 'corner'
    : state.command
}

function bodyworkStateFor(options: {
  current: number
  failed: boolean
  target: number
}): DriverAdjustableBodyworkState {
  const { current, failed, target } = options

  if (failed) {
    return 'failed-corner-safe'
  }

  if (Math.abs(current - target) <= 1e-9) {
    return target === 1 ? 'straight' : 'corner'
  }

  return current < target
    ? 'transition-to-straight'
    : 'transition-to-corner'
}

function commandAllowedByConditions(options: {
  car: Pick<CarSnapshot, 'progress' | 'speedKph' | 'status'>
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  requestedMode: ActiveAeroMode
  track: TrackDefinition
}) {
  const {
    car,
    lowGripConditions,
    phase,
    requestedMode,
    track,
  } = options
  const zone = activeAeroZoneAt(track, car.progress, lowGripConditions)

  if (
    requestedMode === 'corner' ||
    car.status !== 'running' ||
    phase ||
    !zone
  ) {
    return 'corner' satisfies ActiveAeroMode
  }

  if (lowGripConditions) {
    return zone.lowGripMode === 'partial'
      ? ('partial-straight' satisfies ActiveAeroMode)
      : ('corner' satisfies ActiveAeroMode)
  }

  return requestedMode === 'straight'
    ? ('straight' satisfies ActiveAeroMode)
    : ('corner' satisfies ActiveAeroMode)
}

function transitionForCommand(options: {
  command: ActiveAeroMode
  previous: ActiveAeroState
}) {
  const { command, previous } = options
  const target = activeAeroTargetsFor(command)
  const maximumTravel = Math.max(
    Math.abs(target.front - previous.frontStraightFraction),
    Math.abs(target.rear - previous.rearStraightFraction),
  )

  if (maximumTravel <= 1e-9) {
    return null
  }

  return {
    durationSeconds:
      maximumTravel * ACTIVE_AERO_TRANSITION_LIMIT_SECONDS,
    elapsedSeconds: 0,
    fromCommand: previous.command,
    frontStartStraightFraction: previous.frontStraightFraction,
    rearStartStraightFraction: previous.rearStraightFraction,
    toCommand: command,
  } satisfies ActiveAeroTransitionState
}

function advanceActiveAeroTransition(options: {
  command: ActiveAeroMode
  deltaSeconds: number
  transition: ActiveAeroTransitionState | null
}) {
  const { command, deltaSeconds, transition } = options
  const target = activeAeroTargetsFor(command)

  if (!transition) {
    return {
      frontStraightFraction: target.front,
      rearStraightFraction: target.rear,
      transition: null,
      transitionProgress: 1,
    }
  }

  const elapsedSeconds = Math.min(
    transition.durationSeconds,
    transition.elapsedSeconds + deltaSeconds,
  )
  const transitionProgress =
    transition.durationSeconds <= 1e-9
      ? 1
      : elapsedSeconds / transition.durationSeconds

  if (transitionProgress >= 1 - 1e-9) {
    return {
      frontStraightFraction: target.front,
      rearStraightFraction: target.rear,
      transition: null,
      transitionProgress: 1,
    }
  }

  return {
    frontStraightFraction:
      transition.frontStartStraightFraction +
      (target.front - transition.frontStartStraightFraction) *
        transitionProgress,
    rearStraightFraction:
      transition.rearStartStraightFraction +
      (target.rear - transition.rearStartStraightFraction) *
        transitionProgress,
    transition: { ...transition, elapsedSeconds },
    transitionProgress,
  }
}

/**
 * Advances the regulatory command and continuous front/rear wing state. A
 * detected failure latches the Corner-safe state; it may only be cleared while
 * stationary. Overtake state is intentionally absent from this API.
 */
export function advanceActiveAeroState(options: {
  car: Pick<CarSnapshot, 'progress' | 'speedKph' | 'status'>
  deltaSeconds: number
  elapsedSeconds: number
  failureDetected?: boolean
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  previous?: ActiveAeroState
  requestedMode?: ActiveAeroMode
  resetFailure?: boolean
  track: TrackDefinition
}): ActiveAeroState {
  const {
    car,
    deltaSeconds,
    elapsedSeconds,
    failureDetected = false,
    lowGripConditions,
    phase,
    previous = createInitialActiveAeroState(),
    resetFailure = false,
    track,
  } = options

  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Active-aero deltaSeconds must be finite and non-negative')
  }

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Active-aero elapsedSeconds must be finite and non-negative')
  }

  const stationary = Number.isFinite(car.speedKph) && car.speedKph <= 0

  if (
    failureDetected ||
    (previous.failureState === 'failed-corner-safe' &&
      !(resetFailure && stationary))
  ) {
    return {
      activationZoneId: null,
      command: 'corner',
      commandAtSeconds: failureDetected
        ? elapsedSeconds
        : previous.commandAtSeconds,
      failureState: 'failed-corner-safe',
      front: 'failed-corner-safe',
      frontStraightFraction: 0,
      rear: 'failed-corner-safe',
      rearStraightFraction: 0,
      transition: null,
      transitionProgress: 1,
    }
  }

  const zone = activeAeroZoneAt(track, car.progress, lowGripConditions)
  const requestedMode =
    options.requestedMode ??
    activeAeroModeFor({ car, lowGripConditions, phase, track })
  const allowedCommand = commandAllowedByConditions({
    car,
    lowGripConditions,
    phase,
    requestedMode,
    track,
  })
  const stateOfDeploymentCanChange =
    activeAeroStateOfDeploymentCanChange({
      car,
      lowGripConditions,
      track,
    })
  const safetyReturnRequired =
    allowedCommand === 'corner' && previous.command !== 'corner'
  const command =
    stateOfDeploymentCanChange || safetyReturnRequired
      ? allowedCommand
      : previous.command
  const commandChanged = command !== previous.command
  const transition = commandChanged
    ? transitionForCommand({ command, previous })
    : previous.transition
  const advanced = advanceActiveAeroTransition({
    command,
    deltaSeconds,
    transition,
  })
  const target = activeAeroTargetsFor(command)

  return {
    activationZoneId: zone?.label ?? null,
    command,
    commandAtSeconds: commandChanged
      ? Math.max(0, elapsedSeconds - deltaSeconds)
      : previous.commandAtSeconds,
    failureState: 'operational',
    front: bodyworkStateFor({
      current: advanced.frontStraightFraction,
      failed: false,
      target: target.front,
    }),
    frontStraightFraction: advanced.frontStraightFraction,
    rear: bodyworkStateFor({
      current: advanced.rearStraightFraction,
      failed: false,
      target: target.rear,
    }),
    rearStraightFraction: advanced.rearStraightFraction,
    transition: advanced.transition,
    transitionProgress: advanced.transitionProgress,
  }
}

export function overtakeStatusFor(options: {
  batteryPercent: number
  car: CarSnapshot
  lowGripConditions: boolean
  phase: ActiveFlagPhase | null
  raceControlEnabled?: boolean
  raceLap: number
  overtakeEnergyRemainingMj?: number
  sessionType?: 'race-distance' | 'limited-time'
  track: TrackDefinition
}): OvertakeStatus {
  const {
    batteryPercent,
    car,
    lowGripConditions,
    phase,
    raceControlEnabled = true,
    raceLap,
    overtakeEnergyRemainingMj =
      FIA_2026_REGULATION_PROFILE.energy.overtakeAdditionalEnergyPerLapMj,
    sessionType = 'race-distance',
    track,
  } = options

  if (car.runtimeSystems.kind !== 'f1') {
    return 'disabled'
  }

  const controlLines = track.overtakeControlLines ?? []
  const activeLineIndex = controlLines.findIndex((line) =>
    progressIsInZone(
      car.progress,
      line.activationProgress,
      (line.activationProgress + OVERTAKE_ACTIVATION_LENGTH) % 1,
    ),
  )
  const activeLine = controlLines[activeLineIndex]
  const systemEnabled =
    car.status === 'running' &&
    !phase &&
    raceControlEnabled &&
    !lowGripConditions &&
    batteryPercent > 24 &&
    overtakeEnergyRemainingMj > 0.01

  if (!systemEnabled) {
    return 'disabled'
  }

  // In limited-time sessions Overtake is activated whenever enabled. The
  // driver deployment is represented on the straights to avoid full-lap use.
  if (sessionType === 'limited-time') {
    return activeLine ? 'active' : 'available'
  }

  const eligibility = car.runtimeSystems.overtakeEligibility

  if (raceLap < 1 || !eligibility?.eligible) {
    return 'disabled'
  }

  if (activeLine) {
    const activationLap = activationLapAtProgress(
      car.totalDistance,
      activeLine.activationProgress,
    )

    return eligibility.controlLineIndex === activeLineIndex &&
      eligibility.activationLap === activationLap
      ? 'active'
      : 'disabled'
  }

  const eligibleLine = controlLines[eligibility.controlLineIndex]
  const activationDistance = eligibleLine
    ? eligibility.activationLap + eligibleLine.activationProgress
    : Number.NEGATIVE_INFINITY

  return car.totalDistance < activationDistance ? 'available' : 'disabled'
}
