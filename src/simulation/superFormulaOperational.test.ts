import { describe, expect, it } from 'vitest'
import {
  resolveSuperFormulaOperational,
  type SuperFormulaEventOtsPack,
  type SuperFormulaRefuellingSafetyEvidence,
} from './superFormulaOperational'

const allRefuellingInterlocksSatisfied: SuperFormulaRefuellingSafetyEvidence = {
  cowlAirOutletsProtected: true,
  cowlInstalled: true,
  dedicatedFireMarshalCount: 1,
  designatedWorkingArea: true,
  equipmentInspectedBeforeUse: true,
  equipmentSecuredAgainstTipping: true,
  fireExtinguisherCapacityKg: 4.5,
  postRefuellingLeakCheckScheduled: true,
}

describe('SUPER FORMULA operational resolver', () => {
  it('uses the verified 60 kph JAF pit-lane limit', () => {
    const operational = resolveSuperFormulaOperational()

    expect(operational.pitLane).toMatchObject({
      availability: 'verified',
      enforcement: 'enabled',
      speedLimitKph: 60,
      provenance: { article: 'Article 26.9' },
    })
  })

  it('fails closed when no event OTS pack is available', () => {
    const ots = resolveSuperFormulaOperational().ots

    expect(ots).toMatchObject({
      activationConditions: null,
      active: false,
      allocationSeconds: null,
      availability: 'unavailable',
      boostPowerKw: null,
      cooldownSeconds: null,
      eventPackStatus: 'missing',
      runtimeEligibility: { canActivate: false, status: 'unavailable' },
    })
    expect([ots.allocationSeconds, ots.boostPowerKw, ots.cooldownSeconds]).toEqual(
      [null, null, null],
    )
  })

  it('rejects an incomplete event OTS input instead of supplying 200 seconds, 37 kW, or a cooldown', () => {
    const ots = resolveSuperFormulaOperational({
      eventOtsPack: {
        allocationSeconds: 200,
        boostPowerKw: 37,
        cooldownSeconds: 120,
      },
    }).ots

    expect(ots).toMatchObject({
      allocationSeconds: null,
      availability: 'unavailable',
      boostPowerKw: null,
      cooldownSeconds: null,
      eventPackStatus: 'invalid',
      runtimeEligibility: { canActivate: false },
    })
  })

  it('accepts a complete, provenance-labelled event OTS pack but leaves activation to a runtime condition evaluator', () => {
    const eventPack: SuperFormulaEventOtsPack = {
      activationConditions: 'The event bulletin defines activation conditions.',
      allocationSeconds: 95,
      boostPowerKw: 20,
      cooldownSeconds: 45,
      kind: 'super-formula-ots-event-pack',
      provenance: {
        authority: 'official-notice',
        checksum: 'event-document-checksum',
        documentId: '2026-example-ots-notice',
        publishedAt: '2026-08-11',
        url: 'https://example.invalid/ots-notice',
      },
      schemaVersion: 1,
      seriesId: 'super-formula',
    }

    const ots = resolveSuperFormulaOperational({ eventOtsPack: eventPack }).ots

    expect(ots).toMatchObject({
      allocationSeconds: 95,
      availability: 'verified-event-rule',
      boostPowerKw: 20,
      cooldownSeconds: 45,
      eventPackStatus: 'accepted',
      runtimeEligibility: {
        canActivate: false,
        status: 'requires-event-condition-evaluation',
      },
    })
  })

  it('permits refuelling only after every published safety interlock is evidenced, while leaving timing and flow unavailable', () => {
    const blocked = resolveSuperFormulaOperational().refuelling
    const ready = resolveSuperFormulaOperational({
      refuellingSafetyEvidence: allRefuellingInterlocksSatisfied,
    }).refuelling

    expect(blocked).toMatchObject({
      availability: 'verified',
      permittedByRegulation: true,
      safetyGate: { status: 'blocked' },
    })
    expect(ready).toMatchObject({
      allowedLocations: ['pit', 'designated-pit-lane-working-area'],
      availability: 'verified',
      engineShutdownRequired: false,
      permittedByRegulation: true,
      safetyGate: { missingInterlocks: [], status: 'ready' },
      serviceDurationSeconds: { availability: 'unavailable', value: null },
      transferRateKgPerSecond: { availability: 'unavailable', value: null },
    })
  })
})
