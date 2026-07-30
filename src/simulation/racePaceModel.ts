/**
 * A fresh compound's isolated dyno-style advantage is not fully realised over
 * a race lap: the out-lap, temperature preparation and race energy map absorb
 * part of it. Slower-side degradation and the tire cliff remain uncompressed.
 */
export const RACE_FRESH_TIRE_ADVANTAGE_RESPONSE = 0.15

export function realizedRaceTireConditionDeltaSeconds(
  currentTireDeltaSeconds: number,
  referenceTireDeltaSeconds: number,
) {
  const conditionDelta =
    currentTireDeltaSeconds - referenceTireDeltaSeconds

  return conditionDelta < 0
    ? conditionDelta * RACE_FRESH_TIRE_ADVANTAGE_RESPONSE
    : conditionDelta
}

export function raceConditionTargetLapSeconds(options: {
  currentEvolutionGainSeconds: number
  currentTireDeltaSeconds: number
  referenceEvolutionGainSeconds: number
  referenceLapTimeSeconds: number
  referenceTireDeltaSeconds: number
}) {
  return (
    options.referenceLapTimeSeconds +
    realizedRaceTireConditionDeltaSeconds(
      options.currentTireDeltaSeconds,
      options.referenceTireDeltaSeconds,
    ) -
    (options.currentEvolutionGainSeconds -
      options.referenceEvolutionGainSeconds)
  )
}
