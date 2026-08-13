import { describe, expect, it } from 'vitest'
import {
  resolveSuperFormulaRefuellingTask,
  type SuperFormulaEventRefuellingPack,
} from './superFormulaRefuelling'

const allSafetyInterlocksSatisfied = {
  cowlAirOutletsProtected: true,
  cowlInstalled: true,
  dedicatedFireMarshalCount: 1,
  designatedWorkingArea: true,
  equipmentInspectedBeforeUse: true,
  equipmentSecuredAgainstTipping: true,
  fireExtinguisherCapacityKg: 4.5,
  postRefuellingLeakCheckScheduled: true,
} as const

const verifiedEventPack: SuperFormulaEventRefuellingPack = {
  fuelMassGainKg: 17.25,
  kind: 'super-formula-refuelling-event-pack',
  provenance: {
    authority: 'official-notice',
    checksum: 'example-refuelling-document-checksum',
    documentId: '2026-example-refuelling-notice',
    publishedAt: '2026-08-11',
    url: 'https://example.invalid/refuelling-notice',
  },
  schemaVersion: 1,
  seriesId: 'super-formula',
  serviceDurationSeconds: 5.5,
  transferRateKgPerSecond: 3.1,
}

describe('SUPER FORMULA refuelling task resolver', () => {
  it('fails closed with no Article 25 safety evidence and exposes no numerical pit task', () => {
    const task = resolveSuperFormulaRefuellingTask()

    expect(task).toMatchObject({
      canExecute: false,
      eventPackStatus: 'missing',
      status: 'blocked-by-safety',
      safety: {
        permittedByRegulation: true,
        status: 'blocked',
      },
      numericalTask: {
        availability: 'unavailable',
        fuelMassGainKg: null,
        serviceDurationSeconds: null,
        transferRateKgPerSecond: null,
      },
    })
    expect(task.safety.missingInterlocks).toHaveLength(8)
  })

  it('does not turn a safety-cleared Article 25 permission into a timed or mass task without an event pack', () => {
    const task = resolveSuperFormulaRefuellingTask({
      safetyEvidence: allSafetyInterlocksSatisfied,
    })

    expect(task).toMatchObject({
      canExecute: false,
      eventPackStatus: 'missing',
      status: 'unavailable-event-task',
      safety: {
        allowedLocations: ['pit', 'designated-pit-lane-working-area'],
        engineShutdownRequired: false,
        status: 'ready',
      },
      numericalTask: {
        availability: 'unavailable',
        fuelMassGainKg: null,
        serviceDurationSeconds: null,
        transferRateKgPerSecond: null,
      },
    })
  })

  it('rejects incomplete or unprovenanced event input rather than applying a numeric fallback', () => {
    const task = resolveSuperFormulaRefuellingTask({
      eventPack: {
        fuelMassGainKg: 17.25,
        serviceDurationSeconds: 5.5,
        transferRateKgPerSecond: 3.1,
      },
      safetyEvidence: allSafetyInterlocksSatisfied,
    })

    expect(task).toMatchObject({
      canExecute: false,
      eventPackStatus: 'invalid',
      status: 'unavailable-event-task',
      numericalTask: {
        availability: 'unavailable',
        fuelMassGainKg: null,
        serviceDurationSeconds: null,
        transferRateKgPerSecond: null,
      },
    })
  })

  it('keeps a verified event pack numerically sealed while a fire or release interlock is missing', () => {
    const task = resolveSuperFormulaRefuellingTask({
      eventPack: verifiedEventPack,
      safetyEvidence: {
        ...allSafetyInterlocksSatisfied,
        postRefuellingLeakCheckScheduled: false,
      },
    })

    expect(task).toMatchObject({
      canExecute: false,
      eventPackStatus: 'accepted',
      status: 'blocked-by-safety',
      safety: {
        missingInterlocks: ['post-refuelling-leak-check-scheduled'],
        status: 'blocked',
      },
      numericalTask: {
        availability: 'unavailable',
        fuelMassGainKg: null,
        serviceDurationSeconds: null,
        transferRateKgPerSecond: null,
      },
    })
  })

  it('releases only provenance-labelled event values after every Article 25 gate is ready', () => {
    const task = resolveSuperFormulaRefuellingTask({
      eventPack: verifiedEventPack,
      safetyEvidence: allSafetyInterlocksSatisfied,
    })

    expect(task).toMatchObject({
      canExecute: true,
      eventPackStatus: 'accepted',
      kind: 'super-formula-refuelling-task',
      status: 'ready',
      numericalTask: {
        availability: 'verified-event-rule',
        fuelMassGainKg: 17.25,
        provenance: { documentId: '2026-example-refuelling-notice' },
        serviceDurationSeconds: 5.5,
        transferRateKgPerSecond: 3.1,
      },
    })

    if (task.numericalTask.availability !== 'verified-event-rule') {
      throw new Error('Expected a verified event refuelling task.')
    }
    // Deliberately inconsistent values prove no mass is inferred from rate × time.
    expect(
      task.numericalTask.transferRateKgPerSecond *
        task.numericalTask.serviceDurationSeconds,
    ).not.toBe(task.numericalTask.fuelMassGainKg)
  })

  it('treats malformed safety evidence as absent instead of accepting it structurally', () => {
    const task = resolveSuperFormulaRefuellingTask({
      eventPack: verifiedEventPack,
      safetyEvidence: {
        ...allSafetyInterlocksSatisfied,
        dedicatedFireMarshalCount: 'one',
      },
    })

    expect(task).toMatchObject({
      canExecute: false,
      eventPackStatus: 'accepted',
      status: 'blocked-by-safety',
      numericalTask: {
        availability: 'unavailable',
        fuelMassGainKg: null,
      },
    })
    expect(task.safety.missingInterlocks).toHaveLength(8)
  })
})
