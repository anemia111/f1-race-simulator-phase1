import { sourceRegistry } from './sourceRegistry'

/**
 * Source-bound operational values for the 2026 SUPER FORMULA package.
 *
 * Values that the consolidated JAF regulation delegates to an event special
 * regulation or official notice deliberately remain unavailable. In
 * particular, this module is not a licence to carry the simulator's historic
 * 200-second OTS default into a 2026 event.
 */

export type SuperFormulaRuleProvenance = {
  readonly article: string
  readonly authority: 'binding-base-regulation'
  readonly checksum: string
  readonly publishedAt: string
  readonly sourceId: 'jaf-sf-2026-unified-regulations'
  readonly url: string
}

export type VerifiedSuperFormulaRule<Value> = {
  readonly availability: 'verified'
  readonly provenance: SuperFormulaRuleProvenance
  readonly value: Value
}

export type UnavailableSuperFormulaRule = {
  readonly availability: 'unavailable'
  readonly reason: string
  readonly provenance: SuperFormulaRuleProvenance
  readonly value: null
}

export type SuperFormulaRule<Value> =
  | UnavailableSuperFormulaRule
  | VerifiedSuperFormulaRule<Value>

const unifiedRegulationProvenance = (
  article: string,
): SuperFormulaRuleProvenance => ({
  article,
  authority: 'binding-base-regulation',
  checksum: sourceRegistry.jafSuperFormulaUnified2026.checksum,
  publishedAt: sourceRegistry.jafSuperFormulaUnified2026.publishedAt,
  sourceId: 'jaf-sf-2026-unified-regulations',
  url: sourceRegistry.jafSuperFormulaUnified2026.url,
})

const verified = <Value>(
  value: Value,
  article: string,
): VerifiedSuperFormulaRule<Value> => ({
  availability: 'verified',
  provenance: unifiedRegulationProvenance(article),
  value,
})

const unavailable = (
  reason: string,
  article: string,
): UnavailableSuperFormulaRule => ({
  availability: 'unavailable',
  provenance: unifiedRegulationProvenance(article),
  reason,
  value: null,
})

export const superFormulaOperationalRules2026 = {
  effectiveFrom: '2026-01-01',
  engines: {
    maxPerEntrantPerSeason: verified(2, 'Article 24.2.3'),
    replacementConsequences: verified(
      {
        declarationDeadline: '17:00 on the day before official qualifying',
        exemption: {
          appliesWhen:
            'The stewards find engine damage caused by force majeure attributable to another car.',
          excludesTimingConsequences: true,
        },
        replacementDefinition:
          'Replacing an unsealed engine block, cylinder head, or both.',
        timingConsequences: [
          {
            id: 'before-official-scrutineering',
            result: 'Ten-place grid drop from the official qualifying result.',
            window: 'Before official scrutineering begins.',
          },
          {
            id: 'after-scrutineering-before-race-day-free-practice-cutoff',
            result: 'Ten-place grid drop from the official qualifying result.',
            window:
              'After official scrutineering until one hour after race-day free practice, or one hour after qualifying where that free practice is not held.',
          },
          {
            id: 'after-race-day-free-practice-cutoff-before-start-procedure',
            result:
              "Start from the back of the grid; the car's original grid place remains vacant.",
            window:
              'After the one-hour race-day free-practice/qualifying cutoff until the start procedure begins.',
          },
          {
            id: 'second-or-later-change-during-event',
            result: 'Pit-lane start.',
            window:
              'A second or later engine change under the preceding event-change cases.',
          },
        ],
        twoRaceWeekend: {
          afterScrutineeringBeforeRaceOneStart:
            'Ten-place grid drop for race one from the official qualifying result.',
          afterRaceOneStartBeforeRaceTwoStart:
            'Ten-place grid drop for race two from the official qualifying result.',
        },
      },
      'Article 24.2.2, 24.2.4-24.2.7',
    ),
  },
  fuel: {
    refuelling: verified(
      {
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
      'Article 25.1, 25.6.1-25.6.6',
    ),
    serviceDurationSeconds: unavailable(
      'The binding source permits refuelling but publishes no fixed service-duration requirement.',
      'Article 25',
    ),
    transferRateKgPerSecond: unavailable(
      'The binding source publishes no numerical fuel-transfer rate.',
      'Article 25',
    ),
  },
  overtakeSystem: {
    activationConditions: unavailable(
      'Article 24.3.8 delegates OTS operation to event special regulations or official notices; no exact event input is bundled.',
      'Article 24.3.8',
    ),
    allocationSeconds: unavailable(
      'Article 24.3.8 delegates OTS operation to event special regulations or official notices; no exact event input is bundled.',
      'Article 24.3.8',
    ),
    boostPowerKw: unavailable(
      'Article 24.3.8 delegates OTS operation to event special regulations or official notices; no exact event input is bundled.',
      'Article 24.3.8',
    ),
    cooldownSeconds: unavailable(
      'Article 24.3.8 delegates OTS operation to event special regulations or official notices; no exact event input is bundled.',
      'Article 24.3.8',
    ),
  },
  penaltyPoints: {
    suspension: verified(
      {
        clearsRelevantTallyWhen: 'suspension-is-lifted',
        kind: 'next-event-suspension',
        thresholdPoints: {
          afterFirstServedSuspension: 4,
          afterSubsequentServedSuspension: 2,
          initial: 6,
        },
      },
      'Article 5',
    ),
    validity: verified(
      {
        continuousMonths: 12,
      },
      'Article 5',
    ),
  },
  pitLane: {
    speedLimitKph: verified(60, 'Article 26.9'),
  },
  schemaVersion: 1,
  seriesId: 'super-formula',
  tires: {
    maxDrySetsPerCarPerRace: verified(6, 'Article 23.2'),
    maxWetSetsPerCarPerRace: verified(6, 'Article 23.4'),
  },
} as const
