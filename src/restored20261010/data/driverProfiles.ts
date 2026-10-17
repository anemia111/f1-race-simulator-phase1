import type { DriverSkillProfile } from '../types'

export type CompactDriverRatings = {
  adaptability: number
  consistency: number
  defending: number
  errorControl: number
  experience: number
  overtaking: number
  qualifyingPace: number
  racePace: number
  raceStart: number
  technicalFeedback: number
  tyreManagement: number
  wetSkill: number
}

const mean = (...values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/** Expands the 12 auditable source ratings into the detailed execution model. */
export function expandedDriverSkills(
  ratings: CompactDriverRatings,
): DriverSkillProfile {
  const {
    adaptability,
    consistency,
    defending,
    errorControl,
    experience,
    overtaking,
    qualifyingPace,
    racePace,
    raceStart,
    technicalFeedback,
    tyreManagement,
    wetSkill,
  } = ratings

  return {
    rawPace: mean(qualifyingPace, racePace),
    qualifyingPace,
    racePace,
    brakingSkill: mean(qualifyingPace, errorControl),
    lowSpeedCornerSkill: mean(racePace, adaptability),
    mediumSpeedCornerSkill: mean(qualifyingPace, racePace, adaptability),
    highSpeedCornerSkill: mean(qualifyingPace, adaptability),
    tractionControl: mean(racePace, raceStart, errorControl),
    throttleControl: mean(racePace, tyreManagement, errorControl),
    tireManagement: tyreManagement,
    tireWarmupSkill: mean(tyreManagement, adaptability, raceStart),
    wetSkill,
    intermediateSkill: mean(wetSkill, adaptability),
    overtakingSkill: overtaking,
    defendingSkill: defending,
    racecraft: mean(overtaking, defending, experience),
    consistency,
    mistakeResistance: errorControl,
    pressureHandling: mean(consistency, experience, errorControl),
    trafficManagement: mean(overtaking, adaptability, experience),
    dirtyAirManagement: mean(racePace, defending, experience),
    fuelManagement: mean(tyreManagement, technicalFeedback),
    ersManagement: mean(technicalFeedback, adaptability),
    restartSkill: mean(raceStart, experience),
    startSkill: raceStart,
    confidence: mean(qualifyingPace, racePace, experience),
    precision: mean(qualifyingPace, errorControl),
    adaptability,
    raceAwareness: mean(defending, errorControl, experience),
    carBalanceAdaptation: mean(technicalFeedback, adaptability),
  }
}
