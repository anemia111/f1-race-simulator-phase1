// Deterministic pit-strategy model. It compares the short-horizon cost of
// stopping now with staying out, and only runs at lap boundaries.

import type {
  CarSnapshot,
  Driver,
  Team,
  TireCompound,
  TireNomination,
  TrackDefinition,
  TrackObservedCalibration,
  WeatherState,
} from '../types'
import { hashChance } from './random'
import { driverAbilityValue, driverSkillBlend } from './driverAbility'
import {
  chooseCompound,
  compoundMatchesWeather,
  effectiveCliffLaps,
  isDryCompound,
  preferredTireCategoryFor,
  type TireTrackCondition,
} from './tires'
import type { WeatherForecast } from './weather'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export type PitDecision = {
  compound: TireCompound
  reason:
    | 'wear'
    | 'damage'
    | 'safety-car'
    | 'compound-rule'
    | 'weather'
    | 'forecast'
    | 'undercut'
    | 'overcut'
    | 'traffic'
    | 'tire-condition'
    | 'brake-cooling'
    | 'manual'
}

export type StrategyOutlook = {
  compound: TireCompound
  estimatedStopLap: number
  reason: string
  urgency: 'box' | 'window' | 'extend'
  expectedNetGainSeconds: number
  estimatedPitLossSeconds: number
  confidence: 'low' | 'medium' | 'high'
}

export type PitOpportunityEstimate = {
  /** Positive means pitting now is preferable to extending the stint. */
  netGainSeconds: number
  degradationAvoidedSeconds: number
  controlPhaseSavingSeconds: number
  undercutOpportunitySeconds: number
  rejoinTrafficCostSeconds: number
  doubleStackCostSeconds: number
  estimatedPitLossSeconds: number
}

export type PitControlPhase = 'green' | 'safety-car' | 'vsc' | 'red-flag'

export type RedFlagTireDecision = {
  compound: TireCompound
  reason: 'weather' | 'wear' | 'strategic-reset'
}

export function overtakeDifficultyForTrack(track: TrackDefinition) {
  const streetPremium = track.kind === 'street' ? 0.17 : 0
  const zoneRelief = Math.min(0.2, (track.overtakeControlLines?.length ?? 0) * 0.055)
  const widthRelief = clamp((track.width - 4.5) * 0.045, 0, 0.12)

  return clamp(0.6 + streetPremium - zoneRelief - widthRelief, 0.25, 0.9)
}

function normalizedPitControlPhase(options: {
  controlPhase?: PitControlPhase
  underSafetyCar?: boolean
}): PitControlPhase {
  return options.controlPhase ??
    (options.underSafetyCar ? 'safety-car' : 'green')
}

export function effectivePitLaneLossSecondsForControlPhase(options: {
  controlPhase: PitControlPhase
  pitLaneLossSeconds: number
  neutralisationSecondsRemaining?: number | null
  pitEntrySecondsAway?: number
}) {
  const {
    controlPhase,
    pitLaneLossSeconds,
    neutralisationSecondsRemaining,
    pitEntrySecondsAway = 0,
  } = options
  const savingShare =
    controlPhase === 'safety-car' ? 0.55 : controlPhase === 'vsc' ? 0.4 : 0
  const endingConfidence =
    controlPhase !== 'vsc' || neutralisationSecondsRemaining == null
      ? 1
      : clamp(
          (neutralisationSecondsRemaining - pitEntrySecondsAway) / 8,
          0,
          1,
        )

  return Math.max(
    5,
    pitLaneLossSeconds * (1 - savingShare * endingConfidence),
  )
}

export const pitTuning = {
  /** Fixed pit-lane transit loss vs staying out (seconds). */
  pitLaneLossSeconds: 16,
  /** Base stationary time for the crew (seconds). */
  crewBaseSeconds: 2.0,
  /** Extra stationary time for the slowest crews. */
  crewSpreadSeconds: 4,
  /** Deterministic per-stop variance range. */
  stopVarianceSeconds: 1.8,
  /** Chance of a slow stop (stuck wheel nut). */
  slowStopChance: 0.06,
  slowStopExtraSeconds: 6,
  /** Extra time to repair accumulated damage at a stop. */
  damageRepairSeconds: 3,
  /** Damage level above which the car pits for repairs. */
  damagePitThreshold: 0.25,
  /** Don't pit with fewer laps than this remaining. */
  minRemainingLaps: 4,
  /** Normal green-flag pit-lane capacity used to stagger routine stops. */
  normalPitLaneCapacity: 2,
  /** A peak brake temperature is normal; only sustained heat triggers a stop. */
  brakeOverheatPitSeconds: 35,
} as const

/**
 * Short-horizon expected-loss model. The normal pit-lane loss is reported for
 * the UI, but only its safety-car reduction enters the now-vs-later decision:
 * an eventual scheduled stop would pay the base loss either way.
 */
export function estimatePitOpportunity(options: {
  tireAgeLaps: number
  tireWearPercent: number
  cliffLaps: number
  remainingLaps: number
  pitLaneLossSeconds?: number
  underSafetyCar?: boolean
  controlPhase?: PitControlPhase
  neutralisationSecondsRemaining?: number | null
  pitEntrySecondsAway?: number
  overtakeDifficulty?: number
  gapToAheadSeconds?: number | null
  projectedRejoinPositionLoss?: number
  teammateInPit?: boolean
}): PitOpportunityEstimate {
  const {
    tireAgeLaps,
    tireWearPercent,
    cliffLaps,
    remainingLaps,
    pitLaneLossSeconds = pitTuning.pitLaneLossSeconds,
    underSafetyCar: legacyUnderSafetyCar,
    controlPhase: requestedControlPhase,
    neutralisationSecondsRemaining,
    pitEntrySecondsAway = 0,
    overtakeDifficulty = 0.5,
    gapToAheadSeconds,
    projectedRejoinPositionLoss = 0,
    teammateInPit = false,
  } = options
  const controlPhase = normalizedPitControlPhase({
    controlPhase: requestedControlPhase,
    underSafetyCar: legacyUnderSafetyCar,
  })
  const underNeutralisation =
    controlPhase === 'safety-car' || controlPhase === 'vsc'
  const horizonLaps = Math.max(1, Math.min(5, remainingLaps))
  const lapsIntoWindow = Math.max(0, tireAgeLaps - (cliffLaps - 4))
  const wearRisk = Math.max(0, tireWearPercent - 68) / 10
  const degradationAvoidedSeconds =
    (lapsIntoWindow * 0.34 + wearRisk * 0.48) * horizonLaps
  const effectivePitLossSeconds = effectivePitLaneLossSecondsForControlPhase({
    controlPhase,
    neutralisationSecondsRemaining,
    pitEntrySecondsAway,
    pitLaneLossSeconds,
  })
  const controlPhaseSavingSeconds = Math.max(
    0,
    pitLaneLossSeconds - effectivePitLossSeconds,
  )
  const undercutOpportunitySeconds =
    !underNeutralisation &&
    typeof gapToAheadSeconds === 'number' &&
    gapToAheadSeconds > 0 &&
    gapToAheadSeconds < 1.6
      ? (1.6 - gapToAheadSeconds) * 0.9
      : 0
  const rejoinTrafficCostSeconds =
    Math.max(0, projectedRejoinPositionLoss) *
    (0.48 + clamp(overtakeDifficulty, 0, 1) * 0.58)
  const doubleStackCostSeconds = teammateInPit ? 3.4 : 0
  const netGainSeconds =
    degradationAvoidedSeconds +
    controlPhaseSavingSeconds +
    undercutOpportunitySeconds -
    rejoinTrafficCostSeconds -
    doubleStackCostSeconds

  return {
    netGainSeconds,
    degradationAvoidedSeconds,
    controlPhaseSavingSeconds,
    undercutOpportunitySeconds,
    rejoinTrafficCostSeconds,
    doubleStackCostSeconds,
    estimatedPitLossSeconds:
      effectivePitLossSeconds + doubleStackCostSeconds,
  }
}

/** Distinct compounds used, for the two-dry-compound rule. */
function usedDistinct(compoundsUsed: TireCompound[]): Set<TireCompound> {
  return new Set(compoundsUsed)
}

function observedStopTarget(options: {
  calibration?: Pick<
    TrackObservedCalibration,
    'medianPitStopsPerDriver' | 'strategySampleCount'
  >
  driver: Driver
  seed: string
}) {
  const { calibration, driver, seed } = options
  const observed = calibration?.medianPitStopsPerDriver

  if (
    observed === null ||
    observed === undefined ||
    (calibration?.strategySampleCount ?? 0) < 6
  ) {
    return null
  }

  const variation =
    (hashChance(`${seed}:observed-stop-target:${driver.id}`) - 0.5) * 0.7 +
    (0.8 - driverAbilityValue(driver, 'tireManagement')) * 0.45

  return Math.max(0, Math.min(4, Math.round(observed + variation)))
}

export function decideRedFlagTireChange(options: {
  availableCompounds?: Partial<Record<TireCompound, number>>
  car: Pick<
    CarSnapshot,
    | 'compoundsUsed'
    | 'tire'
    | 'tireAgeLaps'
    | 'tireThermalStressPercent'
    | 'tireWearPercent'
  >
  driver: Driver
  lap: number
  mandatoryTwoDryCompounds?: boolean
  raceLaps: number
  seed: string
  tireNomination?: TireNomination
  trackCondition?: TireTrackCondition
  trackGrip: number
  weather: WeatherState
}): RedFlagTireDecision | null {
  const {
    availableCompounds,
    car,
    driver,
    lap,
    mandatoryTwoDryCompounds = true,
    raceLaps,
    seed,
    tireNomination,
    trackCondition,
    trackGrip,
    weather,
  } = options
  const remainingLaps = Math.max(0, raceLaps - lap)
  const usedDryCompounds = new Set(car.compoundsUsed.filter(isDryCompound))
  const mustFitSecondDryCompound =
    mandatoryTwoDryCompounds &&
    !car.compoundsUsed.some((compound) => !isDryCompound(compound)) &&
    usedDryCompounds.size < 2 &&
    remainingLaps <= 14
  const preferred = chooseCompound(
    remainingLaps,
    mustFitSecondDryCompound ? car.tire : null,
    hashChance(`${seed}:red-flag-compound:${driver.id}:${lap}`),
    weather,
    trackGrip,
    trackCondition,
  )
  const compound =
    availableCompounds && (availableCompounds[preferred] ?? 0) <= 0
      ? (['S', 'M', 'H', 'I', 'W'] as TireCompound[]).find(
          (candidate) =>
            (availableCompounds[candidate] ?? 0) > 0 &&
            compoundMatchesWeather(candidate, weather, trackGrip, trackCondition),
        )
      : preferred

  if (!compound || (availableCompounds && (availableCompounds[compound] ?? 0) <= 0)) {
    return null
  }

  const weatherMismatch = !compoundMatchesWeather(
    car.tire,
    weather,
    trackGrip,
    trackCondition,
  )
  const effectiveWear = Math.min(
    100,
    car.tireWearPercent + (car.tireThermalStressPercent ?? 0),
  )
  const cliff = effectiveCliffLaps(
    car.tire,
    driverAbilityValue(driver, 'tireManagement'),
    tireNomination,
  )
  const recentlyFitted =
    car.tireAgeLaps < 3 && effectiveWear < 18 && !weatherMismatch

  if (recentlyFitted && !mustFitSecondDryCompound) {
    return null
  }

  const setScarcity = (availableCompounds?.[compound] ?? 2) <= 1 ? 1 : 0
  const strategyAggression = hashChance(
    `${seed}:strategy-profile:${driver.teamId}`,
  )
  const changeScore =
    (weatherMismatch ? 20 : 0) +
    effectiveWear * 0.075 +
    (car.tireAgeLaps / Math.max(1, cliff)) * 4.2 +
    (mustFitSecondDryCompound ? 4 : 0) +
    strategyAggression * 1.6 -
    setScarcity * 1.8
  const threshold =
    4.2 + hashChance(`${seed}:red-flag-call:${driver.id}:${lap}`) * 3.4

  if (changeScore < threshold) {
    return null
  }

  return {
    compound,
    reason: weatherMismatch
      ? 'weather'
      : effectiveWear >= 45
        ? 'wear'
        : 'strategic-reset',
  }
}

/**
 * Decide whether this car pits at the end of `lap`. Deterministic for
 * (seed, driver, lap). Returns null to stay out.
 */
export function decidePitStop(options: {
  seed: string
  driver: Driver
  car: Pick<
    CarSnapshot,
    | 'tire'
    | 'tireAgeLaps'
    | 'tireWearPercent'
    | 'tireThermalStressPercent'
    | 'brakeTemperatureC'
    | 'compoundsUsed'
    | 'damage'
    | 'pitStops'
  > & { brakeOverheatSeconds?: number }
  lap: number
  raceLaps: number
  underSafetyCar?: boolean
  controlPhase?: PitControlPhase
  neutralisationSecondsRemaining?: number | null
  pitEntrySecondsAway?: number
  overtakeDifficulty?: number
  weather: WeatherState
  trackGrip: number
  forecast?: WeatherForecast
  gapToAheadSeconds?: number | null
  gapBehindSeconds?: number | null
  position?: number
  availableCompounds?: Partial<Record<TireCompound, number>>
  pitLaneOpen?: boolean
  projectedRejoinPosition?: number | null
  teammateInPit?: boolean
  pitLaneOccupancy?: number
  tireNomination?: TireNomination
  mandatoryTwoDryCompounds?: boolean
  trackCondition?: TireTrackCondition
  observedCalibration?: Pick<
    TrackObservedCalibration,
    | 'medianPitStopsPerDriver'
    | 'medianStintLapsByCompound'
    | 'strategySampleCount'
  >
}): PitDecision | null {
  const {
    seed,
    driver,
    car,
    lap,
    raceLaps,
    underSafetyCar: legacyUnderSafetyCar,
    controlPhase: requestedControlPhase,
    neutralisationSecondsRemaining,
    pitEntrySecondsAway = 0,
    overtakeDifficulty = 0.5,
    weather,
    trackGrip,
    forecast,
    gapToAheadSeconds,
    gapBehindSeconds,
    position,
    availableCompounds,
    pitLaneOpen = true,
    projectedRejoinPosition,
    teammateInPit = false,
    pitLaneOccupancy = 0,
    tireNomination,
    mandatoryTwoDryCompounds = true,
    trackCondition,
    observedCalibration,
  } = options
  const controlPhase = normalizedPitControlPhase({
    controlPhase: requestedControlPhase,
    underSafetyCar: legacyUnderSafetyCar,
  })
  const underSafetyCar =
    controlPhase === 'safety-car' || controlPhase === 'vsc'
  const remaining = raceLaps - lap

  if (!pitLaneOpen || remaining < pitTuning.minRemainingLaps) {
    return null
  }

  const cliff = effectiveCliffLaps(
    car.tire,
    driverAbilityValue(driver, 'tireManagement'),
    tireNomination,
  )
  const observedStintLaps =
    observedCalibration?.medianStintLapsByCompound[car.tire]
  const observedWeight = Math.min(
    0.55,
    (observedCalibration?.strategySampleCount ?? 0) / 30,
  )
  const strategicCliff =
    observedStintLaps === undefined
      ? cliff
      : cliff * (1 - observedWeight) + observedStintLaps * observedWeight
  const effectiveWearPercent = Math.min(
    100,
    car.tireWearPercent + (car.tireThermalStressPercent ?? 0),
  )
  const targetStops = observedStopTarget({
    calibration: observedCalibration,
    driver,
    seed,
  })
  const age = car.tireAgeLaps
  const usedDryCompounds = [...usedDistinct(car.compoundsUsed)].filter(isDryCompound)
  const wetRaceExemption = car.compoundsUsed.some((compound) => !isDryCompound(compound))
  const needsSecondCompound =
    mandatoryTwoDryCompounds &&
    !wetRaceExemption &&
    usedDryCompounds.length < 2
  const compoundRoll = hashChance(`${seed}:compound:${driver.id}:${lap}`)
  const avoid = needsSecondCompound ? car.tire : null
  const forecastIsActionable =
    forecast?.willChange === true &&
    forecast.secondsAhead <= 180 &&
    forecast.confidence >= 0.65
  const strategicWeather = forecastIsActionable ? forecast.weather : weather
  const strategicGrip = forecastIsActionable ? forecast.trackGrip : trackGrip
  const preferredCompound = chooseCompound(
    remaining,
    avoid,
    compoundRoll,
    strategicWeather,
    strategicGrip,
    forecastIsActionable ? undefined : trackCondition,
  )
  const compound =
    availableCompounds && (availableCompounds[preferredCompound] ?? 0) <= 0
      ? (['S', 'M', 'H', 'I', 'W'] as TireCompound[]).find(
          (candidate) =>
            (availableCompounds[candidate] ?? 0) > 0 &&
            compoundMatchesWeather(candidate, strategicWeather, strategicGrip),
        ) ?? preferredCompound
      : preferredCompound
  const closeAhead =
    typeof gapToAheadSeconds === 'number' &&
    gapToAheadSeconds > 0 &&
    gapToAheadSeconds < 1.35
  const closeBehind =
    typeof gapBehindSeconds === 'number' &&
    gapBehindSeconds > 0 &&
    gapBehindSeconds < 1.25
  const frontRunner = (position ?? 99) <= 6
  const inPitWindow = age >= strategicCliff - 4
  const weatherMismatch = !compoundMatchesWeather(
    car.tire,
    weather,
    trackGrip,
    trackCondition,
  )
  const preferredTrackCategory = trackCondition
    ? preferredTireCategoryFor(trackCondition)
    : weather === 'heavy-rain' || trackGrip < 0.74
      ? 'W'
      : weather === 'light-rain' || trackGrip < 0.93
        ? 'I'
        : 'M'
  const criticalWeatherMismatch =
    (preferredTrackCategory === 'W' && isDryCompound(car.tire)) ||
    (preferredTrackCategory === 'M' && car.tire === 'W')
  const repairServiceAllowed = controlPhase !== 'vsc'

  // Damage repair takes priority.
  if (repairServiceAllowed && car.damage >= pitTuning.damagePitThreshold) {
    return { compound, reason: 'damage' }
  }

  // Sensor state is authoritative over the age-only tire model. A badly
  // overheated brake assembly also needs a safety stop before fade escalates.
  const sustainedBrakeOverheat =
    car.brakeTemperatureC >= 1090 &&
    (car.brakeOverheatSeconds ?? 0) >= pitTuning.brakeOverheatPitSeconds

  if (repairServiceAllowed && sustainedBrakeOverheat) {
    return { compound, reason: 'brake-cooling' }
  }

  if (effectiveWearPercent >= 88) {
    return { compound, reason: 'tire-condition' }
  }

  const emergencyStop =
    (repairServiceAllowed && car.damage >= pitTuning.damagePitThreshold) ||
    (repairServiceAllowed && sustainedBrakeOverheat) ||
    effectiveWearPercent >= 88 ||
    criticalWeatherMismatch

  if (teammateInPit && !emergencyStop) {
    const acceptsDoubleStack =
      underSafetyCar &&
      effectiveWearPercent >= 76 &&
      hashChance(`${seed}:double-stack-call:${driver.teamId}:${driver.id}:${lap}`) <
        0.14

    if (!acceptsDoubleStack) {
      return null
    }
  }

  // A green-flag pit lane can physically take more cars, but routine stops
  // are normally staggered to avoid release risk and a compressed pit queue.
  // Neutralised pit lanes still have release and double-stack constraints.
  if (
    !underSafetyCar &&
    pitLaneOccupancy >= pitTuning.normalPitLaneCapacity &&
    !emergencyStop
  ) {
    return null
  }

  if (
    underSafetyCar &&
    pitLaneOccupancy >= 5 &&
    !emergencyStop &&
    hashChance(`${seed}:neutralised-pit-traffic:${driver.id}:${lap}`) > 0.2
  ) {
    return null
  }

  if (weatherMismatch) {
    const responseCycle = 3
    const responseSlot = Math.floor(
      hashChance(`${seed}:weather-response:${driver.id}`) * responseCycle,
    )

    // Non-critical crossover calls are deliberately split across several
    // laps. Teams still react immediately to slicks in heavy rain, while an
    // inter-to-slick transition leaves room for traffic and crossover judgement.
    if (
      !criticalWeatherMismatch &&
      !underSafetyCar &&
      lap % responseCycle !== responseSlot
    ) {
      return null
    }

    return { compound, reason: 'weather' }
  }

  const rejoinLoss =
    projectedRejoinPosition === null || projectedRejoinPosition === undefined
      ? 0
      : projectedRejoinPosition - (position ?? projectedRejoinPosition)
  const opportunity = estimatePitOpportunity({
    tireAgeLaps: age,
    tireWearPercent: effectiveWearPercent,
    cliffLaps: strategicCliff,
    remainingLaps: remaining,
    underSafetyCar,
    controlPhase,
    neutralisationSecondsRemaining,
    pitEntrySecondsAway,
    overtakeDifficulty,
    gapToAheadSeconds,
    projectedRejoinPositionLoss: rejoinLoss,
    teammateInPit,
  })

  if (
    !underSafetyCar &&
    rejoinLoss >= 5 &&
    age < strategicCliff &&
    !emergencyStop
  ) {
    return null
  }

  // Deadline for the mandatory second compound.
  if (needsSecondCompound && remaining <= 10) {
    return { compound, reason: 'compound-rule' }
  }

  const targetStopsSatisfied =
    targetStops !== null && car.pitStops >= targetStops

  if (
    targetStopsSatisfied &&
    !underSafetyCar &&
    age < strategicCliff + 2 &&
    effectiveWearPercent < 88
  ) {
    return null
  }

  if (
    targetStops !== null &&
    car.pitStops < targetStops &&
    age >= Math.max(4, strategicCliff - 4) &&
    remaining <=
      (targetStops - car.pitStops) * Math.max(6, strategicCliff * 0.72)
  ) {
    return { compound, reason: 'wear' }
  }

  if (
    forecastIsActionable &&
    underSafetyCar &&
    !compoundMatchesWeather(car.tire, strategicWeather, strategicGrip) &&
    age >= strategicCliff * 0.35
  ) {
    return { compound, reason: 'forecast' }
  }

  const teamStrategyAggression = hashChance(
    `${seed}:strategy-profile:${driver.teamId}`,
  )
  const callVariation =
    (hashChance(`${seed}:neutralisation-call:${driver.id}:${lap}`) - 0.5) * 3.2
  const trackPositionPremium =
    (frontRunner ? 1.2 : 0) +
    (frontRunner && remaining <= 10 ? 2.8 : 0) +
    Math.max(0, rejoinLoss) * clamp(overtakeDifficulty, 0, 1) * 0.45
  const neutralisationThreshold =
    (controlPhase === 'safety-car' ? 1.6 : 2.4) +
    (1 - teamStrategyAggression) * 2.8 +
    trackPositionPremium +
    callVariation
  const minimumNeutralisationAgeShare =
    controlPhase === 'safety-car'
      ? 0.32 + (1 - teamStrategyAggression) * 0.16
      : 0.4 + (1 - teamStrategyAggression) * 0.14
  const vscEndingBeforeEntry =
    controlPhase === 'vsc' &&
    neutralisationSecondsRemaining !== null &&
    neutralisationSecondsRemaining !== undefined &&
    neutralisationSecondsRemaining <= pitEntrySecondsAway + 5

  // Neutralisation creates an opportunity, not a command. Stable team traits,
  // track position and this driver's rejoin traffic split the field's calls.
  if (
    underSafetyCar &&
    !vscEndingBeforeEntry &&
    age >= strategicCliff * minimumNeutralisationAgeShare &&
    opportunity.netGainSeconds >= neutralisationThreshold
  ) {
    return { compound, reason: 'safety-car' }
  }

  if (
    !underSafetyCar &&
    closeAhead &&
    inPitWindow &&
    remaining > 8 &&
    rejoinLoss <= 3 &&
    opportunity.netGainSeconds > 0.45
  ) {
    const roll =
      hashChance(`${seed}:undercut:${driver.id}:${lap}`) +
      driverSkillBlend(driver, {
        overtakingSkill: 0.65,
        raceAwareness: 0.2,
        trafficManagement: 0.15,
      }) * 0.18

    if (roll > 0.58) {
      return { compound, reason: 'undercut' }
    }
  }

  // Leading/front-running cars with tire life can deliberately stay out to
  // overcut a rival that is boxed in traffic.
  if (
    !underSafetyCar &&
    frontRunner &&
    closeBehind &&
    age >= strategicCliff - 2 &&
    age <= strategicCliff + 2 &&
    driverAbilityValue(driver, 'tireManagement') > 0.8 &&
    hashChance(`${seed}:overcut-hold:${driver.id}:${lap}`) < 0.64
  ) {
    return null
  }

  if (!underSafetyCar && closeAhead && closeBehind && inPitWindow && remaining > 6) {
    if (
      opportunity.netGainSeconds > 0.2 &&
      hashChance(`${seed}:traffic:${driver.id}:${lap}`) < 0.42
    ) {
      return { compound, reason: 'traffic' }
    }
  }

  // Past the cliff: box now.
  if (age >= strategicCliff + 2) {
    return {
      compound,
      reason:
        frontRunner && driverAbilityValue(driver, 'tireManagement') > 0.84
          ? 'overcut'
          : 'wear',
    }
  }

  // If a reliable weather change is close, stretch marginal tire wear to
  // avoid paying for an extra stop right before the crossover.
  if (forecastIsActionable && age >= strategicCliff - 3) {
    return null
  }

  // Inside the pit window: staggered entries via a per-lap roll.
  if (
    age >= strategicCliff - 3 &&
    hashChance(`${seed}:pit:${driver.id}:${lap}`) < 0.3
  ) {
    return { compound, reason: 'wear' }
  }

  return null
}

/**
 * Read-only companion for the timing UI. It shares the strategy model but
 * never commits a pit stop or consumes a tire set.
 */
export function strategyOutlookFor(options: {
  seed: string
  driver: Driver
  car: Pick<
    CarSnapshot,
    | 'tire'
    | 'tireAgeLaps'
    | 'tireWearPercent'
    | 'tireThermalStressPercent'
    | 'brakeTemperatureC'
    | 'damage'
    | 'tireSetsRemaining'
  > & { brakeOverheatSeconds?: number }
  lap: number
  raceLaps: number
  underSafetyCar: boolean
  weather: WeatherState
  trackGrip: number
  tireNomination?: TireNomination
  pitLaneLossSeconds?: number
  gapToAheadSeconds?: number | null
  projectedRejoinPositionLoss?: number
  teammateInPit?: boolean
  observedCalibration?: Pick<
    TrackObservedCalibration,
    'medianStintLapsByCompound' | 'strategySampleCount'
  >
  trackCondition?: TireTrackCondition
}): StrategyOutlook {
  const {
    car,
    driver,
    lap,
    raceLaps,
    seed,
    trackGrip,
    underSafetyCar,
    weather,
    tireNomination,
    pitLaneLossSeconds,
    gapToAheadSeconds,
    projectedRejoinPositionLoss,
    teammateInPit,
    observedCalibration,
    trackCondition,
  } = options
  const cliff = effectiveCliffLaps(
    car.tire,
    driverAbilityValue(driver, 'tireManagement'),
    tireNomination,
  )
  const observedStintLaps =
    observedCalibration?.medianStintLapsByCompound[car.tire]
  const observedWeight = Math.min(
    0.55,
    (observedCalibration?.strategySampleCount ?? 0) / 30,
  )
  const strategicCliff =
    observedStintLaps === undefined
      ? cliff
      : cliff * (1 - observedWeight) + observedStintLaps * observedWeight
  const effectiveWearPercent = Math.min(
    100,
    car.tireWearPercent + (car.tireThermalStressPercent ?? 0),
  )
  const remaining = Math.max(0, raceLaps - lap)
  const compound = chooseCompound(
    remaining,
    // The two-compound rule is dry-only; in changing weather, retaining the
    // correct wet compound is a valid and often preferred prediction.
    weather === 'clear' ? car.tire : null,
    hashChance(`${seed}:outlook:${driver.id}:${lap}`),
    weather,
    trackGrip,
    trackCondition,
  )
  const weatherMismatch = !compoundMatchesWeather(
    car.tire,
    weather,
    trackGrip,
    trackCondition,
  )
  const estimatedStopLap = Math.min(
    raceLaps,
    Math.max(
      lap,
      lap + Math.max(0, Math.ceil(strategicCliff - car.tireAgeLaps)),
    ),
  )
  const opportunity = estimatePitOpportunity({
    tireAgeLaps: car.tireAgeLaps,
    tireWearPercent: effectiveWearPercent,
    cliffLaps: strategicCliff,
    remainingLaps: remaining,
    pitLaneLossSeconds,
    underSafetyCar,
    gapToAheadSeconds,
    projectedRejoinPositionLoss,
    teammateInPit,
  })
  const confidence: StrategyOutlook['confidence'] =
    weatherMismatch || underSafetyCar || effectiveWearPercent >= 82
      ? 'high'
      : car.tireAgeLaps >= strategicCliff - 4
        ? 'medium'
        : 'low'
  const shared = {
    expectedNetGainSeconds: opportunity.netGainSeconds,
    estimatedPitLossSeconds: opportunity.estimatedPitLossSeconds,
    confidence,
  }

  if (weatherMismatch || car.damage >= pitTuning.damagePitThreshold) {
    return {
      compound,
      estimatedStopLap: lap,
      reason: weatherMismatch ? 'weather crossover' : 'damage repair',
      urgency: 'box',
      ...shared,
    }
  }

  const sustainedBrakeOverheat =
    car.brakeTemperatureC >= 1090 &&
    (car.brakeOverheatSeconds ?? 0) >= pitTuning.brakeOverheatPitSeconds

  if (sustainedBrakeOverheat || effectiveWearPercent >= 88) {
    return {
      compound,
      estimatedStopLap: lap,
      reason: sustainedBrakeOverheat ? 'sustained brake overheating' : 'measured tire wear',
      urgency: 'box',
      ...shared,
    }
  }

  if (underSafetyCar && car.tireAgeLaps >= strategicCliff * 0.38) {
    return {
      compound,
      estimatedStopLap: lap,
      reason: 'SC/VSC opportunity',
      urgency: 'box',
      ...shared,
    }
  }

  if (car.tireAgeLaps >= strategicCliff - 3) {
    return {
      compound,
      estimatedStopLap,
      reason: 'wear window',
      urgency: opportunity.netGainSeconds > 0.5 ? 'box' : 'window',
      ...shared,
    }
  }

  return {
    compound,
    estimatedStopLap,
    reason: 'protect tire life',
    urgency: 'extend',
    ...shared,
  }
}

/** Total time lost for a pit stop (lane transit + stationary + variance). */
export function pitStopLossSeconds(
  seed: string,
  driverId: string,
  team: Team,
  stopIndex: number,
  repairsDamage: boolean,
  modeledPitLaneLossSeconds: number = pitTuning.pitLaneLossSeconds,
): number {
  const variance =
    hashChance(`${seed}:stop-var:${driverId}:${stopIndex}`) *
    pitTuning.stopVarianceSeconds
  const slowStop =
    hashChance(`${seed}:slow-stop:${driverId}:${stopIndex}`) <
    pitTuning.slowStopChance
      ? pitTuning.slowStopExtraSeconds *
        (0.5 + hashChance(`${seed}:slow-stop-size:${driverId}:${stopIndex}`) * 0.5)
      : 0

  return (
    modeledPitLaneLossSeconds +
    pitTuning.crewBaseSeconds +
    (1 - team.pitCrewSpeed) * pitTuning.crewSpreadSeconds +
    variance +
    slowStop +
    (repairsDamage ? pitTuning.damageRepairSeconds : 0)
  )
}
