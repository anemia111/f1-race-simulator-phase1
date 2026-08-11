import { describe, expect, it } from 'vitest'
import { sourceRegistry } from './sourceRegistry'
import { superFormulaOperationalRules2026 } from './superFormulaRules2026'

describe('2026 SUPER FORMULA operational rule package', () => {
  it('pins the JAF source and the values that are directly published', () => {
    expect(sourceRegistry.jafSuperFormulaUnified2026).toMatchObject({
      checksum:
        '9e5eb324f2f4c8660d9b716cbf35a1874247fc6baa8706ae2b2539630ae2369a',
      publishedAt: '2026-01-23',
    })
    expect(superFormulaOperationalRules2026).toMatchObject({
      effectiveFrom: '2026-01-01',
      schemaVersion: 1,
      seriesId: 'super-formula',
    })
    expect(superFormulaOperationalRules2026.pitLane.speedLimitKph).toMatchObject({
      availability: 'verified',
      provenance: {
        article: 'Article 26.9',
        sourceId: 'jaf-sf-2026-unified-regulations',
      },
      value: 60,
    })
    expect(superFormulaOperationalRules2026.tires).toMatchObject({
      maxDrySetsPerCarPerRace: { availability: 'verified', value: 6 },
      maxWetSetsPerCarPerRace: { availability: 'verified', value: 6 },
    })
    expect(superFormulaOperationalRules2026.engines.maxPerEntrantPerSeason).toMatchObject({
      availability: 'verified',
      value: 2,
    })
  })

  it('preserves engine-change timing rather than reducing it to an invented generic penalty', () => {
    const { value } = superFormulaOperationalRules2026.engines.replacementConsequences

    expect(value.timingConsequences).toEqual([
      expect.objectContaining({
        id: 'before-official-scrutineering',
        result: 'Ten-place grid drop from the official qualifying result.',
      }),
      expect.objectContaining({
        id: 'after-scrutineering-before-race-day-free-practice-cutoff',
        result: 'Ten-place grid drop from the official qualifying result.',
      }),
      expect.objectContaining({
        id: 'after-race-day-free-practice-cutoff-before-start-procedure',
        result:
          "Start from the back of the grid; the car's original grid place remains vacant.",
      }),
      expect.objectContaining({
        id: 'second-or-later-change-during-event',
        result: 'Pit-lane start.',
      }),
    ])
    expect(value.exemption.excludesTimingConsequences).toBe(true)
  })

  it('allows refuelling only through the published pit-working-area safeguards', () => {
    expect(superFormulaOperationalRules2026.fuel.refuelling).toMatchObject({
      availability: 'verified',
      value: {
        allowedLocations: ['pit', 'designated-pit-lane-working-area'],
        engineShutdownRequired: false,
        safetyInterlocks: {
          cowlMustBeInstalled: true,
          designatedWorkingAreaOnly: true,
          equipmentMustBeInspectedBeforeUse: true,
          equipmentMustBeSecuredAgainstTipping: true,
          fireMarshalDedicatedToFireDuty: true,
          minimumDedicatedFireMarshalCount: 1,
          minimumFireExtinguisherCapacityKg: 4.5,
          postRefuellingLeakCheckRequired: true,
          protectCowlAirOutletsFromFuelSpray: true,
        },
      },
    })
    expect(superFormulaOperationalRules2026.fuel.transferRateKgPerSecond).toMatchObject({
      availability: 'unavailable',
      value: null,
    })
    expect(superFormulaOperationalRules2026.fuel.serviceDurationSeconds).toMatchObject({
      availability: 'unavailable',
      value: null,
    })
  })

  it('does not promote an unverified OTS baseline into a 2026 rule', () => {
    const ots = superFormulaOperationalRules2026.overtakeSystem

    for (const rule of Object.values(ots)) {
      expect(rule).toMatchObject({ availability: 'unavailable', value: null })
      expect(rule.provenance.article).toBe('Article 24.3.8')
    }
  })
})
