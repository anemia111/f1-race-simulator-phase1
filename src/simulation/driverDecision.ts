import type {
  Driver,
  DriverSkillProfile,
  FlagState,
  SectorFlagState,
} from '../types'
import { hashChance } from './random'
import {
  FORMULA_VEHICLE_HALF_WIDTH_M,
  OVERTAKE_LATERAL_SAFETY_MARGIN_M,
} from './vehicleGeometry'

/**
 * Centre separation a pass needs before the occupancy model will let it
 * complete. A driver committing to a move aims past this, not short of it.
 */
const PASSING_LATERAL_SEPARATION_M =
  FORMULA_VEHICLE_HALF_WIDTH_M * 2 + OVERTAKE_LATERAL_SAFETY_MARGIN_M

/**
 * Driver choices are deliberately sampled at a lower frequency than the
 * longitudinal physics. This avoids turning sparse centreline data into a
 * new steering decision every simulation tick.
 */
export const DRIVER_DECISION_WINDOWS_PER_LAP = 12

export type DriverBehaviorTraits = {
  reaction: number
  brakingPrecision: number
  throttlePrecision: number
  lineAccuracy: number
  tyreLimitUtilisation: number
  consistency: number
  awareness: number
  racecraft: number
  aggression: number
  riskTolerance: number
  defenceTendency: number
  overtakeCommitment: number
  errorProbability: number
}

export type DriverDecisionIntent =
  | 'controlled-flag'
  | 'pit-entry'
  | 'emergency-avoidance'
  | 'attack'
  | 'defend'
  | 'dirty-air-avoidance'
  | 'tow-alignment'
  | 'blue-flag-yield'
  | 'physical-reference-line'

export type DriverDecisionRole =
  | 'controlled-flag'
  | 'pit'
  | 'emergency'
  | 'attack'
  | 'defend'
  | 'dirty-air'
  | 'tow'
  | 'yield'
  | 'reference'

export type DriverBattleCue = {
  active: boolean
  opponentId: string
  opponentLateralOffsetM: number
  /** Perceived longitudinal gap used by the causal observation layer. */
  gapSeconds?: number
  /** A physical opportunity or threat score, not a pace multiplier. */
  intensity: number
}

export type DriverWakeCue = {
  active: boolean
  opponentId: string
  opponentLateralOffsetM: number
  /** Perceived longitudinal gap used by the causal observation layer. */
  gapSeconds?: number
  intensity: number
}

export type DriverEmergencyCue = {
  active: boolean
  obstacleId?: string
  obstacleLateralOffsetM: number
  severity: number
  /** May be supplied when race control has already identified the clear side. */
  preferredSide?: -1 | 1
}

/**
 * A blue flag shown to a lapped car. Slowing alone does not let the faster car
 * through: the occupancy model needs a full car width plus margin of lateral
 * separation before the rear car may advance past the front one, so a car that
 * only lifts while holding the racing line blocks the leader indefinitely.
 */
export type DriverYieldCue = {
  active: boolean
  approachingId?: string
  /** Lateral offset of the car being let through. */
  approachingLateralOffsetM: number
  /** Centre separation the occupancy model needs before a pass may complete. */
  requiredSeparationM: number
}

export type DriverPitCue = {
  requested: boolean
  pitLaneLateralOffsetM: number
}

export type DriverDecisionContext = {
  seed: string
  driver: Driver
  lap: number
  trackProgress: number
  flagState?: FlagState | SectorFlagState
  currentLateralOffsetM: number
  physicalReferenceLineOffsetM: number
  trackHalfWidthM: number
  /** Keeps the car centre away from the physical track edge. */
  edgeClearanceM?: number
  pit?: DriverPitCue
  emergency?: DriverEmergencyCue
  attack?: DriverBattleCue
  defend?: DriverBattleCue
  dirtyAir?: DriverWakeCue
  tow?: DriverWakeCue
  yield?: DriverYieldCue
}

export type DriverDecision = {
  intent: DriverDecisionIntent
  role: DriverDecisionRole
  absoluteDecisionWindow: number
  traits: DriverBehaviorTraits
  desiredLateralOffsetM: number
  lineErrorM: number
  /** Positive means begin braking earlier; negative means later. */
  brakeOnsetDeltaSeconds: number
  /** Multiplies the requested brake pedal pressure, never vehicle speed. */
  brakePressureScale: number
  /** Positive means open the throttle later; negative means earlier. */
  throttleTimingDeltaSeconds: number
  /** Multiplies throttle opening, never speed, grip, or power. */
  throttleOpeningScale: number
  controlError: number
  errorTriggered: boolean
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const clamp01 = (value: number) => clamp(value, 0, 1)

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function mean(...values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function weightedMean(
  values: ReadonlyArray<readonly [number, number]>,
): number {
  const weight = values.reduce((total, entry) => total + entry[1], 0)

  if (weight <= 0) {
    return 0.5
  }

  return clamp01(
    values.reduce(
      (total, [value, entryWeight]) => total + value * entryWeight,
      0,
    ) / weight,
  )
}

function skill(driver: Driver, key: keyof DriverSkillProfile): number {
  return clamp01(finiteOr(driver.skills[key], 0.5))
}

function unitStyle(value: number, fallback = 0.5): number {
  return clamp01(finiteOr(value, fallback))
}

function signedStyle(value: number): number {
  return clamp01((clamp(finiteOr(value, 0), -1, 1) + 1) / 2)
}

/**
 * Converts independent skills and driving preferences into behavioural
 * controls. Deliberately does not read `performanceSource`, its displayed
 * overall, or any special-driver threshold.
 */
export function driverBehaviorTraits(driver: Driver): DriverBehaviorTraits {
  const reaction = weightedMean([
    [skill(driver, 'raceAwareness'), 0.34],
    [skill(driver, 'startSkill'), 0.22],
    [skill(driver, 'adaptability'), 0.2],
    [skill(driver, 'precision'), 0.14],
    [skill(driver, 'pressureHandling'), 0.1],
  ])
  const brakingPrecision = weightedMean([
    [skill(driver, 'brakingSkill'), 0.48],
    [skill(driver, 'precision'), 0.3],
    [skill(driver, 'consistency'), 0.14],
    [skill(driver, 'mistakeResistance'), 0.08],
  ])
  const throttlePrecision = weightedMean([
    [skill(driver, 'throttleControl'), 0.44],
    [skill(driver, 'tractionControl'), 0.28],
    [skill(driver, 'precision'), 0.16],
    [skill(driver, 'consistency'), 0.12],
  ])
  const corneringSkill = mean(
    skill(driver, 'lowSpeedCornerSkill'),
    skill(driver, 'mediumSpeedCornerSkill'),
    skill(driver, 'highSpeedCornerSkill'),
  )
  const lineAccuracy = weightedMean([
    [skill(driver, 'precision'), 0.4],
    [corneringSkill, 0.28],
    [skill(driver, 'raceAwareness'), 0.17],
    [skill(driver, 'consistency'), 0.15],
  ])
  const tyreLimitUtilisation = weightedMean([
    [corneringSkill, 0.34],
    [skill(driver, 'rawPace'), 0.24],
    [skill(driver, 'tireManagement'), 0.2],
    [skill(driver, 'confidence'), 0.12],
    [skill(driver, 'carBalanceAdaptation'), 0.1],
  ])
  const consistency = weightedMean([
    [skill(driver, 'consistency'), 0.48],
    [skill(driver, 'mistakeResistance'), 0.34],
    [skill(driver, 'pressureHandling'), 0.18],
  ])
  const awareness = weightedMean([
    [skill(driver, 'raceAwareness'), 0.42],
    [skill(driver, 'trafficManagement'), 0.25],
    [skill(driver, 'adaptability'), 0.18],
    [skill(driver, 'pressureHandling'), 0.15],
  ])
  const racecraft = weightedMean([
    [skill(driver, 'racecraft'), 0.34],
    [skill(driver, 'overtakingSkill'), 0.2],
    [skill(driver, 'defendingSkill'), 0.2],
    [skill(driver, 'trafficManagement'), 0.16],
    [skill(driver, 'raceAwareness'), 0.1],
  ])

  const brakingAggression = unitStyle(driver.style.brakingAggression)
  const frontEndCommitment = signedStyle(driver.style.frontEndPreference)
  const rearStabilityPreference = signedStyle(driver.style.rearStabilityNeed)
  const cornerShapeCommitment = signedStyle(driver.style.cornerShapePreference)
  const balanceTolerance = mean(
    unitStyle(driver.style.oversteerTolerance),
    unitStyle(driver.style.understeerTolerance),
  )
  const aggression = weightedMean([
    [brakingAggression, 0.48],
    [skill(driver, 'confidence'), 0.18],
    [skill(driver, 'overtakingSkill'), 0.14],
    [frontEndCommitment, 0.1],
    [cornerShapeCommitment, 0.1],
  ])
  const riskTolerance = weightedMean([
    [aggression, 0.42],
    [balanceTolerance, 0.2],
    [skill(driver, 'confidence'), 0.2],
    [1 - skill(driver, 'mistakeResistance'), 0.1],
    [frontEndCommitment, 0.08],
  ])
  const defenceTendency = weightedMean([
    [skill(driver, 'defendingSkill'), 0.42],
    [racecraft, 0.22],
    [aggression, 0.14],
    [awareness, 0.12],
    [rearStabilityPreference, 0.1],
  ])
  const overtakeCommitment = weightedMean([
    [skill(driver, 'overtakingSkill'), 0.34],
    [racecraft, 0.22],
    [aggression, 0.22],
    [skill(driver, 'confidence'), 0.12],
    [frontEndCommitment, 0.1],
  ])
  const controlPrecision = mean(
    reaction,
    brakingPrecision,
    throttlePrecision,
    lineAccuracy,
  )
  const errorProbability = clamp01(
    0.002 +
      (1 - consistency) * 0.055 +
      (1 - awareness) * 0.04 +
      (1 - controlPrecision) * 0.035 +
      aggression * riskTolerance * 0.026,
  )

  return {
    reaction,
    brakingPrecision,
    throttlePrecision,
    lineAccuracy,
    tyreLimitUtilisation,
    consistency,
    awareness,
    racecraft,
    aggression,
    riskTolerance,
    defenceTendency,
    overtakeCommitment,
    errorProbability,
  }
}

export function driverDecisionWindow(trackProgress: number): number {
  const finiteProgress = finiteOr(trackProgress, 0)
  const wrappedProgress =
    finiteProgress >= 0 && finiteProgress < 1
      ? finiteProgress
      : ((finiteProgress % 1) + 1) % 1

  return Math.min(
    DRIVER_DECISION_WINDOWS_PER_LAP - 1,
    Math.floor(wrappedProgress * DRIVER_DECISION_WINDOWS_PER_LAP),
  )
}

function decisionRoll(
  context: DriverDecisionContext,
  role: DriverDecisionRole,
  opponentId: string | undefined,
  channel: string,
): number {
  const lap = Math.max(0, Math.floor(finiteOr(context.lap, 0)))
  const window = driverDecisionWindow(context.trackProgress)

  return hashChance(
    `${context.seed}:driver-decision:${context.driver.id}:lap:${lap}:window:${window}:role:${role}:opponent:${opponentId ?? 'none'}:${channel}`,
  )
}

function signedDecisionRoll(
  context: DriverDecisionContext,
  role: DriverDecisionRole,
  opponentId: string | undefined,
  channel: string,
): number {
  return decisionRoll(context, role, opponentId, channel) * 2 - 1
}

function activeBattleCue(cue: DriverBattleCue | undefined): boolean {
  return cue?.active === true && clamp01(finiteOr(cue.intensity, 0)) > 0
}

function activeWakeCue(cue: DriverWakeCue | undefined): boolean {
  return cue?.active === true && clamp01(finiteOr(cue.intensity, 0)) > 0
}

function controlledFlag(
  flagState: DriverDecisionContext['flagState'],
): flagState is Exclude<FlagState, 'clear'> | 'double-yellow' {
  return flagState !== undefined && flagState !== 'clear'
}

type ChosenIntent = {
  intent: DriverDecisionIntent
  role: DriverDecisionRole
  opponentId?: string
}

function chooseBattleIntent(
  context: DriverDecisionContext,
  traits: DriverBehaviorTraits,
): ChosenIntent | null {
  const attack = activeBattleCue(context.attack)
  const defend = activeBattleCue(context.defend)

  if (!attack && !defend) {
    return null
  }

  if (attack && !defend) {
    return {
      intent: 'attack',
      role: 'attack',
      opponentId: context.attack!.opponentId,
    }
  }

  if (defend && !attack) {
    return {
      intent: 'defend',
      role: 'defend',
      opponentId: context.defend!.opponentId,
    }
  }

  const attackScore =
    clamp01(finiteOr(context.attack!.intensity, 0)) *
    traits.overtakeCommitment
  const defenceScore =
    clamp01(finiteOr(context.defend!.intensity, 0)) * traits.defenceTendency

  if (attackScore === defenceScore) {
    const attackFirst =
      decisionRoll(
        context,
        'attack',
        context.attack!.opponentId,
        'battle-role',
      ) < 0.5

    return attackFirst
      ? {
          intent: 'attack',
          role: 'attack',
          opponentId: context.attack!.opponentId,
        }
      : {
          intent: 'defend',
          role: 'defend',
          opponentId: context.defend!.opponentId,
        }
  }

  return attackScore > defenceScore
    ? {
        intent: 'attack',
        role: 'attack',
        opponentId: context.attack!.opponentId,
      }
    : {
        intent: 'defend',
        role: 'defend',
        opponentId: context.defend!.opponentId,
      }
}

function chooseIntent(
  context: DriverDecisionContext,
  traits: DriverBehaviorTraits,
): ChosenIntent {
  if (controlledFlag(context.flagState)) {
    return { intent: 'controlled-flag', role: 'controlled-flag' }
  }

  if (context.pit?.requested === true) {
    return { intent: 'pit-entry', role: 'pit' }
  }

  if (context.emergency?.active === true) {
    return {
      intent: 'emergency-avoidance',
      role: 'emergency',
      opponentId: context.emergency.obstacleId,
    }
  }

  // A lapped car under a blue flag is not racing the car behind it. Yielding
  // outranks attack and defence so it cannot be overridden by a battle cue
  // against the very car it is being told to let past.
  if (context.yield?.active === true) {
    return {
      intent: 'blue-flag-yield',
      role: 'yield',
      opponentId: context.yield.approachingId,
    }
  }

  const battleIntent = chooseBattleIntent(context, traits)
  if (battleIntent) {
    return battleIntent
  }

  if (activeWakeCue(context.dirtyAir)) {
    return {
      intent: 'dirty-air-avoidance',
      role: 'dirty-air',
      opponentId: context.dirtyAir!.opponentId,
    }
  }

  if (activeWakeCue(context.tow)) {
    return {
      intent: 'tow-alignment',
      role: 'tow',
      opponentId: context.tow!.opponentId,
    }
  }

  return { intent: 'physical-reference-line', role: 'reference' }
}

function openSide(
  context: DriverDecisionContext,
  role: DriverDecisionRole,
  opponentId: string | undefined,
  opponentOffsetM: number,
): -1 | 1 {
  const separation =
    finiteOr(context.currentLateralOffsetM, 0) - finiteOr(opponentOffsetM, 0)

  if (Math.abs(separation) > 0.15) {
    return separation < 0 ? -1 : 1
  }

  return decisionRoll(context, role, opponentId, 'open-side') < 0.5 ? -1 : 1
}

function nominalLineFor(
  context: DriverDecisionContext,
  chosen: ChosenIntent,
  traits: DriverBehaviorTraits,
  usableHalfWidthM: number,
): number {
  const current = clamp(
    finiteOr(context.currentLateralOffsetM, 0),
    -usableHalfWidthM,
    usableHalfWidthM,
  )
  const reference = clamp(
    finiteOr(context.physicalReferenceLineOffsetM, 0),
    -usableHalfWidthM,
    usableHalfWidthM,
  )

  switch (chosen.intent) {
    case 'controlled-flag':
      // The flag remains the controlling intent, but a stopped car still has
      // to be driven around. This is obstacle avoidance at reduced pace, not
      // an overtake decision under yellow/SC/VSC.
      if (context.emergency?.active === true) {
        const obstacle = finiteOr(
          context.emergency.obstacleLateralOffsetM,
          current,
        )
        const severity = clamp01(finiteOr(context.emergency.severity, 1))
        const clearance = 1.65 + severity * 1.1
        const negativeFits = obstacle - clearance >= -usableHalfWidthM
        const positiveFits = obstacle + clearance <= usableHalfWidthM
        const side =
          context.emergency.preferredSide ??
          (negativeFits !== positiveFits
            ? positiveFits
              ? 1
              : -1
            : openSide(context, chosen.role, chosen.opponentId, obstacle))

        return clamp(
          obstacle + side * clearance,
          -usableHalfWidthM,
          usableHalfWidthM,
        )
      }

      // Avoid sudden weaving while gently returning toward the physical line.
      return current * 0.72 + reference * 0.28
    case 'pit-entry':
      return clamp(
        finiteOr(context.pit?.pitLaneLateralOffsetM, reference),
        -usableHalfWidthM,
        usableHalfWidthM,
      )
    case 'emergency-avoidance': {
      const obstacle = finiteOr(
        context.emergency?.obstacleLateralOffsetM,
        current,
      )
      const severity = clamp01(finiteOr(context.emergency?.severity, 1))
      const clearance = clamp(1.5 + severity * 1.25, 1.5, 2.75)
      const negativeFits = obstacle - clearance >= -usableHalfWidthM
      const positiveFits = obstacle + clearance <= usableHalfWidthM
      const side =
        context.emergency?.preferredSide ??
        (negativeFits !== positiveFits
          ? positiveFits
            ? 1
            : -1
          : openSide(context, chosen.role, chosen.opponentId, obstacle))

      return clamp(
        obstacle + side * clearance,
        -usableHalfWidthM,
        usableHalfWidthM,
      )
    }
    case 'attack': {
      const opponent = finiteOr(
        context.attack?.opponentLateralOffsetM,
        reference,
      )
      const side = openSide(context, chosen.role, chosen.opponentId, opponent)
      const intensity = clamp01(finiteOr(context.attack?.intensity, 0))
      // Commitment decides how far offline to run, and only a committed move
      // reaches the separation a pass needs. Holding every follower out at the
      // passing line instead cost more lap time than the clearance was worth:
      // the attack cue opens at 1.8 s, so the whole train drove two metres off
      // the racing line for the entire lap.
      const commitment = clamp01(
        intensity * 0.72 + traits.overtakeCommitment * 0.28,
      )
      const separation = clamp(
        1.25 + commitment * (PASSING_LATERAL_SEPARATION_M + 0.3 - 1.25),
        1.25,
        PASSING_LATERAL_SEPARATION_M + 0.3,
      )

      return clamp(
        opponent + side * separation,
        -usableHalfWidthM,
        usableHalfWidthM,
      )
    }
    case 'defend': {
      const opponent = clamp(
        finiteOr(context.defend?.opponentLateralOffsetM, reference),
        -usableHalfWidthM,
        usableHalfWidthM,
      )
      const cover = clamp(
        0.42 + traits.defenceTendency * 0.38,
        0.42,
        0.8,
      )

      return opponent * cover + reference * (1 - cover)
    }
    case 'dirty-air-avoidance': {
      const opponent = finiteOr(
        context.dirtyAir?.opponentLateralOffsetM,
        reference,
      )
      const side = openSide(context, chosen.role, chosen.opponentId, opponent)
      const intensity = clamp01(finiteOr(context.dirtyAir?.intensity, 0))
      const separation =
        0.85 + intensity * 0.8 + traits.awareness * 0.25

      return clamp(
        opponent + side * separation,
        -usableHalfWidthM,
        usableHalfWidthM,
      )
    }
    case 'blue-flag-yield': {
      const approaching = clamp(
        finiteOr(context.yield?.approachingLateralOffsetM, reference),
        -usableHalfWidthM,
        usableHalfWidthM,
      )
      // Clear the occupancy requirement outright rather than approach it. A
      // yield that lands just short of the threshold reads as compliance on
      // the timing screen while still blocking the road.
      const required =
        Math.max(0, finiteOr(context.yield?.requiredSeparationM, 2.25)) + 0.3
      const negativeFits = approaching - required >= -usableHalfWidthM
      const positiveFits = approaching + required <= usableHalfWidthM
      const side = negativeFits && positiveFits
        ? openSide(context, chosen.role, chosen.opponentId, approaching)
        : negativeFits
          ? -1
          : positiveFits
            ? 1
            : approaching <= 0
              ? 1
              : -1

      return clamp(
        approaching + side * required,
        -usableHalfWidthM,
        usableHalfWidthM,
      )
    }
    case 'tow-alignment': {
      const opponent = clamp(
        finiteOr(context.tow?.opponentLateralOffsetM, reference),
        -usableHalfWidthM,
        usableHalfWidthM,
      )
      const intensity = clamp01(finiteOr(context.tow?.intensity, 0))
      const alignment = clamp(0.55 + intensity * 0.35, 0.55, 0.9)

      return opponent * alignment + reference * (1 - alignment)
    }
    case 'physical-reference-line':
      return reference
  }
}

function nominalControls(intent: DriverDecisionIntent): {
  brakeOnsetDeltaSeconds: number
  brakePressureScale: number
  throttleTimingDeltaSeconds: number
  throttleOpeningScale: number
} {
  switch (intent) {
    case 'controlled-flag':
      // Race control already supplies the SC/VSC/yellow speed ceiling to the
      // physical pedal controller. Keep only the driver's small control error
      // here so the same restriction is not applied a second time.
      return {
        brakeOnsetDeltaSeconds: 0,
        brakePressureScale: 1,
        throttleTimingDeltaSeconds: 0,
        throttleOpeningScale: 1,
      }
    case 'blue-flag-yield':
      // The blue-flag speed reduction is applied by the pace controller. What
      // belongs here is only the cost of driving offline while lifting.
      return {
        brakeOnsetDeltaSeconds: 0.04,
        brakePressureScale: 0.98,
        throttleTimingDeltaSeconds: 0.05,
        throttleOpeningScale: 0.94,
      }
    case 'pit-entry':
      return {
        brakeOnsetDeltaSeconds: 0.12,
        brakePressureScale: 0.95,
        throttleTimingDeltaSeconds: 0.1,
        throttleOpeningScale: 0.72,
      }
    case 'emergency-avoidance':
      return {
        brakeOnsetDeltaSeconds: 0.28,
        brakePressureScale: 1.08,
        throttleTimingDeltaSeconds: 0.3,
        throttleOpeningScale: 0,
      }
    case 'attack':
      return {
        brakeOnsetDeltaSeconds: -0.035,
        brakePressureScale: 1,
        throttleTimingDeltaSeconds: -0.025,
        throttleOpeningScale: 1,
      }
    case 'defend':
      return {
        brakeOnsetDeltaSeconds: 0.015,
        brakePressureScale: 0.98,
        throttleTimingDeltaSeconds: 0.01,
        throttleOpeningScale: 0.98,
      }
    case 'dirty-air-avoidance':
      return {
        brakeOnsetDeltaSeconds: 0.025,
        brakePressureScale: 0.97,
        throttleTimingDeltaSeconds: 0.025,
        throttleOpeningScale: 0.96,
      }
    case 'tow-alignment':
    case 'physical-reference-line':
      return {
        brakeOnsetDeltaSeconds: 0,
        brakePressureScale: 1,
        throttleTimingDeltaSeconds: 0,
        throttleOpeningScale: 1,
      }
  }
}

/**
 * Makes one deterministic behavioural decision for the current low-frequency
 * window. The result contains only pedal timing/pressure and lateral intent;
 * vehicle speed remains an outcome of the live physical integrator.
 */
export function decideDriverBehavior(
  context: DriverDecisionContext,
): DriverDecision {
  const traits = driverBehaviorTraits(context.driver)
  const chosen = chooseIntent(context, traits)
  const decisionWindow = driverDecisionWindow(context.trackProgress)
  const lap = Math.max(0, Math.floor(finiteOr(context.lap, 0)))
  const absoluteDecisionWindow =
    lap * DRIVER_DECISION_WINDOWS_PER_LAP + decisionWindow
  const trackHalfWidthM = clamp(
    finiteOr(context.trackHalfWidthM, 6.5),
    1.5,
    20,
  )
  const edgeClearanceM = clamp(
    finiteOr(context.edgeClearanceM, 1.05),
    0.5,
    trackHalfWidthM - 0.25,
  )
  const usableHalfWidthM = Math.max(0.25, trackHalfWidthM - edgeClearanceM)
  const nominalLateralOffsetM = nominalLineFor(
    context,
    chosen,
    traits,
    usableHalfWidthM,
  )
  const lineNoise = signedDecisionRoll(
    context,
    chosen.role,
    chosen.opponentId,
    'line-error',
  )
  const lineErrorEnvelopeM =
    0.015 +
    usableHalfWidthM *
      (0.035 + (1 - traits.lineAccuracy) * 0.14) *
      (chosen.intent === 'emergency-avoidance' ? 0.45 : 1)
  const continuousControlNoise = signedDecisionRoll(
    context,
    chosen.role,
    chosen.opponentId,
    'control-error',
  )
  const controlPrecision = mean(
    traits.reaction,
    traits.brakingPrecision,
    traits.throttlePrecision,
    traits.consistency,
  )
  const controlErrorEnvelope =
    0.008 + (1 - controlPrecision) * 0.12 + (1 - traits.awareness) * 0.035
  const battleIntensity =
    chosen.intent === 'attack'
      ? clamp01(finiteOr(context.attack?.intensity, 0))
      : chosen.intent === 'defend'
        ? clamp01(finiteOr(context.defend?.intensity, 0))
        : chosen.intent === 'emergency-avoidance'
          ? clamp01(finiteOr(context.emergency?.severity, 0))
          : 0
  const errorRisk = clamp01(
    traits.errorProbability *
      (1 + battleIntensity * (0.3 + traits.aggression * 0.65)),
  )
  const errorTriggered =
    decisionRoll(
      context,
      chosen.role,
      chosen.opponentId,
      'error-trigger',
    ) < errorRisk
  const errorSpike = errorTriggered
    ? signedDecisionRoll(
        context,
        chosen.role,
        chosen.opponentId,
        'error-direction',
      ) *
      (0.08 + (1 - traits.awareness) * 0.18 + traits.aggression * 0.05)
    : 0
  const controlError = clamp(
    continuousControlNoise * controlErrorEnvelope + errorSpike,
    -1,
    1,
  )
  const lineErrorM = clamp(
    lineNoise * lineErrorEnvelopeM +
      errorSpike * usableHalfWidthM * 0.32,
    -usableHalfWidthM,
    usableHalfWidthM,
  )
  const desiredLateralOffsetM = clamp(
    nominalLateralOffsetM + lineErrorM,
    -usableHalfWidthM,
    usableHalfWidthM,
  )
  const nominalControl = nominalControls(chosen.intent)

  return {
    intent: chosen.intent,
    role: chosen.role,
    absoluteDecisionWindow,
    traits,
    desiredLateralOffsetM,
    lineErrorM,
    brakeOnsetDeltaSeconds: clamp(
      nominalControl.brakeOnsetDeltaSeconds + controlError * 0.18,
      -0.2,
      0.5,
    ),
    brakePressureScale: clamp(
      nominalControl.brakePressureScale - Math.abs(controlError) * 0.18,
      0,
      1.1,
    ),
    throttleTimingDeltaSeconds: clamp(
      nominalControl.throttleTimingDeltaSeconds + controlError * 0.16,
      -0.15,
      0.5,
    ),
    throttleOpeningScale: clamp(
      nominalControl.throttleOpeningScale - Math.abs(controlError) * 0.2,
      0,
      1,
    ),
    controlError,
    errorTriggered,
  }
}
