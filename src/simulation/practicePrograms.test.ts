import { describe, expect, it } from 'vitest'
import { practiceDryCompoundFor, practiceProgramFor } from './practicePrograms'

describe('free-practice run programmes', () => {
  it('uses FP1 for systems, aero and baseline work on hard or medium tyres', () => {
    const plans = Array.from({ length: 4 }, (_, runIndex) =>
      practiceProgramFor({
        driverId: 'driver-1',
        runIndex,
        seed: 'fp-programmes',
        stage: 'fp1',
      })!,
    )
    const compounds = plans.map((plan, runIndex) =>
      practiceDryCompoundFor({
        driverId: 'driver-1',
        plan,
        runIndex,
        seed: 'fp-programmes',
        stage: 'fp1',
      }),
    )

    expect(plans.map((plan) => plan.kind)).toEqual([
      'systems-check',
      'aero-correlation',
      'setup-baseline',
      'start-pit-practice',
    ])
    expect(compounds.every((compound) => compound === 'H' || compound === 'M')).toBe(
      true,
    )
    expect(plans.every((plan) => plan.energyIntent !== 'qualifying')).toBe(true)
  })

  it('combines a low-fuel soft run with a 10-20 lap FP2 race simulation', () => {
    const qualifyingPlan = practiceProgramFor({
      driverId: 'driver-2',
      runIndex: 0,
      seed: 'fp2-programmes',
      stage: 'fp2',
    })!
    const racePlan = practiceProgramFor({
      driverId: 'driver-2',
      runIndex: 1,
      seed: 'fp2-programmes',
      stage: 'fp2',
    })!
    const qualifyingCompound = practiceDryCompoundFor({
      driverId: 'driver-2',
      plan: qualifyingPlan,
      runIndex: 0,
      seed: 'fp2-programmes',
      stage: 'fp2',
    })
    const raceCompound = practiceDryCompoundFor({
      driverId: 'driver-2',
      plan: racePlan,
      runIndex: 1,
      seed: 'fp2-programmes',
      stage: 'fp2',
    })

    expect(qualifyingPlan.kind).toBe('qualifying-simulation')
    expect(qualifyingPlan.targetFlyingLaps).toBe(1)
    expect(qualifyingPlan.energyIntent).toBe('qualifying')
    expect(qualifyingCompound).toBe('S')
    expect(racePlan.kind).toBe('race-simulation')
    expect(racePlan.targetFlyingLaps).toBeGreaterThanOrEqual(10)
    expect(racePlan.targetFlyingLaps).toBeLessThanOrEqual(20)
    expect(racePlan.fuelLaps).toBeGreaterThan(racePlan.targetFlyingLaps)
    expect(racePlan.paceMode).toBe('standard')
    expect(['H', 'M']).toContain(raceCompound)
  })

  it('makes FP3 predominantly a soft-tyre qualifying preparation session', () => {
    const plans = [1, 2].map((runIndex) =>
      practiceProgramFor({
        driverId: 'driver-3',
        runIndex,
        seed: 'fp3-programmes',
        stage: 'fp3',
      })!,
    )

    expect(plans.every((plan) => plan.kind === 'qualifying-preparation')).toBe(
      true,
    )
    expect(plans.every((plan) => plan.targetFlyingLaps === 1)).toBe(true)
    expect(
      plans.every(
        (plan, index) =>
          practiceDryCompoundFor({
            driverId: 'driver-3',
            plan,
            runIndex: index + 1,
            seed: 'fp3-programmes',
            stage: 'fp3',
          }) === 'S',
      ),
    ).toBe(true)
  })
})
