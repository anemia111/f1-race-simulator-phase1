// Deterministic pit-strategy model. It compares the short-horizon cost of
// stopping now with staying out, and only runs at lap boundaries.

import type {
  CarSnapshot,
  Driver,
  Team,
  TireCompound,
  TireNomination,
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
  underSafetyCar: boolean
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
    underSafetyCar,
    gapToAheadSeconds,
    projectedRejoinPositionLoss = 0,
    teammateInPit = false,
  } = options
  const horizonLaps = Math.max(1, Math.min(5, remainingLaps))
  const lapsIntoWindow = Math.max(0, tireAgeLaps - (cliffLaps - 4))
  const wearRisk = Math.max(0, tireWearPercent - 68) / 10
  const degradationAvoidedSeconds =
    (lapsIntoWindow * 0.34 + wearRisk * 0.48) * horizonLaps
  const controlPhaseSavingSeconds = underSafetyCar
    ? pitLaneLossSeconds * 0.43
    : 0
  const undercutOpportunitySeconds =
    !underSafetyCar &&
    typeof gapToAheadSeconds === 'number' &&
    gapToAheadSeconds > 0 &&
    gapToAheadSeconds < 1.6
      ? (1.6 - gapToAheadSeconds) * 0.9
      : 0
  const rejoinTrafficCostSeconds = Math.max(0, projectedRejoinPositionLoss) * 0.7
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
    estimatedPitLossSeconds: Math.max(
      5,
      pitLaneLossSeconds - controlPhaseSavingSeconds + doubleStackCostSeconds,
    ),
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
  underSafetyCar: boolean
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
    underSafetyCar,
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

  // Damage repair takes priority.
  if (car.damage >= pitTuning.damagePitThreshold) {
    return { compound, reason: 'damage' }
  }

  // Sensor state is authoritative over the age-only tire model. A badly
  // overheated brake assembly also needs a safety stop before fade escalates.
  const sustainedBrakeOverheat =
    car.brakeTemperatureC >= 1090 &&
    (car.brakeOverheatSeconds ?? 0) >= pitTuning.brakeOverheatPitSeconds

  if (sustainedBrakeOverheat) {
    return { compound, reason: 'brake-cooling' }
  }

  if (effectiveWearPercent >= 88) {
    return { compound, reason: 'tire-condition' }
  }

  const emergencyStop =
    car.damage >= pitTuning.damagePitThreshold ||
    sustainedBrakeOverheat ||
    effectiveWearPercent >= 88 ||
    criticalWeatherMismatch

  if (teammateInPit && !emergencyStop && !underSafetyCar) {
    return null
  }

  // A green-flag pit lane can physically take more cars, but routine stops
  // are normally staggered to avoid release risk and a compressed pit queue.
  // Safety-car opportunities and genuinely urgent stops remain unrestricted.
  if (
    !underSafetyCar &&
    pitLaneOccupancy >= pitTuning.normalPitLaneCapacity &&
    !emergencyStop
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

  // Cheap stop under safety car once the tires have some age.
  if (
    underSafetyCar &&
    age >= strategicCliff * 0.45 &&
    opportunity.netGainSeconds >= 1.5 &&
    hashChance(`${seed}:sc-pit:${driver.id}:${lap}`) < 0.8
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
