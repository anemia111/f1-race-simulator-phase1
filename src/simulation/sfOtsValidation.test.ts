import { describe, expect, it } from 'vitest'
import {
  resolveSuperFormulaOperational,
  type SuperFormulaEventOtsPack,
  type SuperFormulaOtsResolution,
} from './superFormulaOperational'
import { createSuperFormulaRuntimeSystems } from './runtimeSystems'

const fullyProvenancedEventPack: SuperFormulaEventOtsPack = {
  activationConditions:
    'The event bulletin defines the OTS activation conditions for this event.',
  allocationSeconds: 95,
  boostPowerKw: 20,
  cooldownSeconds: 45,
  kind: 'super-formula-ots-event-pack',
  provenance: {
    authority: 'official-notice',
    checksum: 'sf-ots-validation-event-notice-sha256',
    documentId: '2026-sf-ots-validation-event-notice',
    publishedAt: '2026-08-11',
    url: 'https://example.invalid/sf-ots-validation-event-notice',
  },
  schemaVersion: 1,
  seriesId: 'super-formula',
}

const malformedEventPack: SuperFormulaEventOtsPack = {
  ...fullyProvenancedEventPack,
  provenance: {
    ...fullyProvenancedEventPack.provenance,
    checksum: '',
  },
}

function runtimeOts(eventOtsPack?: SuperFormulaEventOtsPack) {
  return createSuperFormulaRuntimeSystems({
    entrantId: 'sf-ots-validation-entrant',
    ...(eventOtsPack === undefined ? {} : { eventOtsPack }),
  }).ots
}

function expectUnavailable(
  ots: SuperFormulaOtsResolution,
  eventPackStatus: 'invalid' | 'missing',
) {
  expect(ots).toMatchObject({
    activationConditions: null,
    active: false,
    allocationSeconds: null,
    availability: 'unavailable',
    boostPowerKw: null,
    cooldownSeconds: null,
    eventPackStatus,
    runtimeEligibility: { canActivate: false, status: 'unavailable' },
  })
  expect([ots.allocationSeconds, ots.boostPowerKw, ots.cooldownSeconds]).toEqual(
    [null, null, null],
  )
}

describe('SF OTS validation boundary', () => {
  it('keeps OTS null and inactive without an event pack in both resolver and runtime', () => {
    expectUnavailable(resolveSuperFormulaOperational().ots, 'missing')
    expectUnavailable(runtimeOts(), 'missing')
  })

  it('fails closed for a malformed event pack even when it carries plausible numeric values', () => {
    expectUnavailable(
      resolveSuperFormulaOperational({ eventOtsPack: malformedEventPack }).ots,
      'invalid',
    )
    expectUnavailable(runtimeOts(malformedEventPack), 'invalid')
  })

  it('accepts fully provenanced OTS values but cannot activate without an event-condition evaluator', () => {
    for (const ots of [
      resolveSuperFormulaOperational({ eventOtsPack: fullyProvenancedEventPack })
        .ots,
      runtimeOts(fullyProvenancedEventPack),
    ]) {
      expect(ots).toMatchObject({
        activationConditions: fullyProvenancedEventPack.activationConditions,
        active: false,
        allocationSeconds: fullyProvenancedEventPack.allocationSeconds,
        availability: 'verified-event-rule',
        boostPowerKw: fullyProvenancedEventPack.boostPowerKw,
        cooldownSeconds: fullyProvenancedEventPack.cooldownSeconds,
        eventPackStatus: 'accepted',
        provenance: fullyProvenancedEventPack.provenance,
        runtimeEligibility: {
          canActivate: false,
          status: 'requires-event-condition-evaluation',
        },
      })
    }
  })

  it('is deterministic for the fixed no-event, malformed, and provenanced inputs', () => {
    const exercise = () => [
      resolveSuperFormulaOperational().ots,
      runtimeOts(),
      resolveSuperFormulaOperational({ eventOtsPack: malformedEventPack }).ots,
      runtimeOts(malformedEventPack),
      resolveSuperFormulaOperational({
        eventOtsPack: fullyProvenancedEventPack,
      }).ots,
      runtimeOts(fullyProvenancedEventPack),
    ]

    expect(exercise()).toEqual(exercise())
  })
})
