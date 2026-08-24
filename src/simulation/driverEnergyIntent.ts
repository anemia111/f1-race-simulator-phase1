import type {
  ActiveFlagPhase,
  BattlePhase,
  CarSnapshot,
  Driver,
  EnergyStoreState,
  ErsMode,
  F1EnergyIntent,
  OvertakeStatus,
  RacePaceMode,
  TimedRunPhase,
} from '../types'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export type F1EnergyIntentOptions = {
  battlePhase: BattlePhase
  driver: Pick<Driver, 'skills'>
  isFinalLap: boolean
  lapProgress: number
  paceMode: RacePaceMode
  phaseActive: boolean
  state: Readonly<EnergyStoreState>
  straightLengthAheadMeters: number
  straightness: number
  timedRunPhase: TimedRunPhase | null
}

export type F1ErsModeIntentOptions = {
  batteryPercent: number
  brakePercent: number
  car: Pick<CarSnapshot, 'gapToAhead' | 'status'>
  fullThrottle: boolean
  overtakeStatus: OvertakeStatus
  phase: ActiveFlagPhase | null
  straightLengthAheadMeters: number
  straightness: number
}

export type F1ElectricalOvertakeRequestAction =
  | 'request'
  | 'hold'
  | 'release'

/**
 * Pure compatibility request for the legacy automatic-use behavior. The live
 * arbiter still decides whether Electrical Overtake is disabled, available,
 * or active from regulatory and physical state.
 */
export function f1ElectricalOvertakeIntentFor(): F1ElectricalOvertakeRequestAction {
  return 'request'
}

/**
 * Pure baseline ERS-mode request. Telemetry remains the arbiter for standing
 * starts, preparation/yield, superclipping, qualifying, and physical limits.
 */
export function f1ErsModeIntentFor(
  options: F1ErsModeIntentOptions,
): ErsMode {
  const {
    batteryPercent,
    brakePercent,
    car,
    fullThrottle,
    overtakeStatus,
    phase,
    straightLengthAheadMeters,
    straightness,
  } = options

  if (phase || batteryPercent < 14 || brakePercent > 5) {
    return batteryPercent < 96 ? 'harvest' : 'balanced'
  }

  if (
    batteryPercent > 22 &&
    car.status === 'running' &&
    (overtakeStatus === 'active' ||
      car.gapToAhead < 1.4 ||
      fullThrottle ||
      straightness > 0.74 ||
      straightLengthAheadMeters >= 180)
  ) {
    return 'deploy'
  }

  return 'balanced'
}

/**
 * Pure driver/strategy scheduling intent. The returned unitless preferences
 * can select where energy is used, but cannot mutate SOC or increase any
 * physical or regulatory power/energy limit.
 */
export function f1EnergyIntentFor(
  options: F1EnergyIntentOptions,
): F1EnergyIntent {
  const {
    battlePhase,
    driver,
    isFinalLap,
    lapProgress,
    paceMode,
    phaseActive,
    state,
    straightLengthAheadMeters,
    straightness,
    timedRunPhase,
  } = options
  const skill = clamp01(
    driver.skills.ersManagement * 0.58 +
      driver.skills.raceAwareness * 0.24 +
      driver.skills.precision * 0.18,
  )
  const progress = clamp01(lapProgress)
  const straightOpportunity = clamp01(
    straightness * 0.62 +
      clamp01(straightLengthAheadMeters / 1_100) * 0.38,
  )
  const lowSocPressure = clamp01((0.5 - state.stateOfCharge) / 0.5)
  const highSocFreedom = clamp01((state.stateOfCharge - 0.12) / 0.78)
  const preparationLap =
    timedRunPhase === 'out-lap' ||
    timedRunPhase === 'in-lap' ||
    timedRunPhase === 'cooldown'
  const qualifyingAttack = timedRunPhase === 'attack-lap'
  const attacking =
    battlePhase === 'attacking' || battlePhase === 'side-by-side'
  const defending = battlePhase === 'defending'
  const paceAggression: Record<RacePaceMode, number> = {
    push: 1,
    defend: 0.9,
    standard: 0.64,
    save: 0.28,
  }
  const strategicAggression =
    paceAggression[paceMode] +
    (attacking ? 0.18 : 0) +
    (defending ? 0.14 : 0) +
    (isFinalLap ? 0.14 : 0) +
    (qualifyingAttack ? 0.3 : 0) -
    (preparationLap ? 0.7 : 0) -
    (phaseActive ? 0.72 : 0)

  const defendEnergyReserve = clamp01(
    0.1 +
      skill * 0.16 +
      (defending ? -0.2 : 0) +
      (progress < 0.75 ? 0.12 : -0.08),
  )
  const attackEnergyReserve = clamp01(
    0.08 +
      skill * 0.14 +
      (attacking ? -0.18 : 0) +
      (progress < 0.7 ? 0.11 : -0.07),
  )
  const propulsionAggression = clamp01(
    strategicAggression *
      (0.6 + straightOpportunity * 0.4) *
      (0.35 + highSocFreedom * 0.65),
  )
  const harvestPreference = clamp01(
    0.18 +
      lowSocPressure * (0.56 + skill * 0.12) +
      (paceMode === 'save' ? 0.24 : 0) +
      (preparationLap ? 0.35 : 0) +
      (phaseActive ? 0.2 : 0) -
      (qualifyingAttack ? 0.28 : 0),
  )
  const liftCoastPreference = clamp01(
    harvestPreference * (0.55 + skill * 0.28) +
      (1 - straightOpportunity) * 0.08,
  )
  const endOfStraightHarvestBias = clamp01(
    0.35 + skill * 0.35 + lowSocPressure * 0.2,
  )
  const superclipAcceptance = clamp01(
    harvestPreference *
      (0.35 + endOfStraightHarvestBias * 0.45) *
      straightOpportunity -
      (attacking || defending ? 0.24 : 0) -
      (qualifyingAttack ? 0.55 : 0) -
      (phaseActive ? 0.35 : 0),
  )

  return {
    propulsionAggression,
    harvestPreference,
    liftCoastPreference,
    superclipAcceptance,
    defendEnergyReserve,
    attackEnergyReserve,
  }
}
