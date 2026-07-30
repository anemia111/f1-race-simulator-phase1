import { describe, expect, it } from 'vitest'
import {
  RACE_FRESH_TIRE_ADVANTAGE_RESPONSE,
  raceConditionTargetLapSeconds,
  realizedRaceTireConditionDeltaSeconds,
} from './racePaceModel'

describe('race pace condition model', () => {
  it('realises only the race-usable share of a fresher tire advantage', () => {
    expect(
      realizedRaceTireConditionDeltaSeconds(-0.4, 0.6),
    ).toBeCloseTo(-1 * RACE_FRESH_TIRE_ADVANTAGE_RESPONSE, 10)
  })

  it('keeps degradation and cliff losses at full strength', () => {
    expect(realizedRaceTireConditionDeltaSeconds(2.1, 0.6)).toBeCloseTo(
      1.5,
      10,
    )
  })

  it('applies tire and residual evolution changes to the physical lap target', () => {
    expect(
      raceConditionTargetLapSeconds({
        currentEvolutionGainSeconds: 0.18,
        currentTireDeltaSeconds: -0.4,
        referenceEvolutionGainSeconds: 0.1,
        referenceLapTimeSeconds: 83.4,
        referenceTireDeltaSeconds: 0.6,
      }),
    ).toBeCloseTo(
      83.4 - RACE_FRESH_TIRE_ADVANTAGE_RESPONSE - 0.08,
      10,
    )
  })
})
