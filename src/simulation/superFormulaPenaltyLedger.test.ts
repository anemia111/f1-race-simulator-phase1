import { describe, expect, it } from 'vitest'
import {
  assessSuperFormula2026PenaltyPointSuspension,
  createSuperFormula2026PenaltyPointLedger,
  recordSuperFormula2026PenaltyPoints,
  serveSuperFormula2026NextEventSuspension,
  superFormula2026PenaltyPointTally,
  validateSuperFormula2026PenaltyPointLedger,
} from './superFormulaPenaltyLedger'

describe('SUPER FORMULA 2026 Article 5 penalty-point ledger', () => {
  it('uses the 6, 4, then 2 threshold sequence only after each suspension is explicitly served', () => {
    const initial = createSuperFormula2026PenaltyPointLedger({
      driverId: 't-abe',
    })
    const twoPoints = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-01-10',
      ledger: initial,
      pointEntryId: 'article-5-a',
      points: 2,
    })
    const initialSuspension = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-01-11',
      ledger: twoPoints.ledger,
      pointEntryId: 'article-5-b',
      points: 4,
    })

    expect(initial).toMatchObject({
      kind: 'super-formula-2026-penalty-point-ledger',
      seriesId: 'super-formula',
    })
    expect(initial).not.toHaveProperty('penaltyPoints')
    expect(twoPoints).toMatchObject({
      status: 'below-suspension-threshold',
      tally: { points: 2, thresholdPoints: 6 },
    })
    expect(initialSuspension).toMatchObject({
      status: 'next-event-suspension-assessed',
      suspension: {
        assessedOn: '2026-01-11',
        kind: 'next-event-suspension',
        relevantPointEntryIds: ['article-5-a', 'article-5-b'],
        servedOn: null,
        tallyAtAssessment: 6,
        thresholdPoints: 6,
      },
    })
    expect(initialSuspension.ledger.pointEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clearedOn: null,
          expiresOn: '2027-01-10',
          id: 'article-5-a',
        }),
        expect.objectContaining({
          clearedOn: null,
          expiresOn: '2027-01-11',
          id: 'article-5-b',
        }),
      ]),
    )

    const pendingAssessment = assessSuperFormula2026PenaltyPointSuspension({
      assessedOn: '2026-01-12',
      ledger: initialSuspension.ledger,
    })
    expect(pendingAssessment).toMatchObject({
      ledger: initialSuspension.ledger,
      status: 'next-event-suspension-pending',
    })
    expect(
      superFormula2026PenaltyPointTally({
        asOf: '2026-01-12',
        ledger: pendingAssessment.ledger,
      }),
    ).toMatchObject({ points: 6, thresholdPoints: 6 })

    if (!initialSuspension.suspension) {
      throw new Error('Expected an initial next-event suspension.')
    }
    const firstServed = serveSuperFormula2026NextEventSuspension({
      ledger: initialSuspension.ledger,
      suspensionId: initialSuspension.suspension.id,
      suspensionLiftedOn: '2026-02-01',
    })
    expect(firstServed.servedSuspension).toMatchObject({
      clearedPointEntryIds: ['article-5-a', 'article-5-b'],
      servedOn: '2026-02-01',
    })
    expect(
      superFormula2026PenaltyPointTally({
        asOf: '2026-02-01',
        ledger: firstServed.ledger,
      }),
    ).toMatchObject({ points: 0, thresholdPoints: 4 })

    const secondSuspension = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-02-02',
      ledger: firstServed.ledger,
      pointEntryId: 'article-5-c',
      points: 4,
    })
    expect(secondSuspension).toMatchObject({
      status: 'next-event-suspension-assessed',
      suspension: { thresholdPoints: 4 },
    })
    if (!secondSuspension.suspension) {
      throw new Error('Expected a second next-event suspension.')
    }
    const secondServed = serveSuperFormula2026NextEventSuspension({
      ledger: secondSuspension.ledger,
      suspensionId: secondSuspension.suspension.id,
      suspensionLiftedOn: '2026-02-03',
    })
    const thirdSuspension = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-02-04',
      ledger: secondServed.ledger,
      pointEntryId: 'article-5-d',
      points: 2,
    })

    expect(thirdSuspension).toMatchObject({
      status: 'next-event-suspension-assessed',
      suspension: { thresholdPoints: 2 },
    })
    expect(
      validateSuperFormula2026PenaltyPointLedger(thirdSuspension.ledger),
    ).toMatchObject({ valid: true })
  })

  it('expires point entries after the sourced continuous twelve-month period without reordering history', () => {
    const initial = createSuperFormula2026PenaltyPointLedger({
      driverId: 'k-kobayashi',
    })
    const first = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-01-31',
      ledger: initial,
      pointEntryId: 'expiry-a',
      points: 3,
    })

    expect(
      superFormula2026PenaltyPointTally({
        asOf: '2027-01-30',
        ledger: first.ledger,
      }),
    ).toMatchObject({ points: 3, thresholdPoints: 6 })
    expect(
      superFormula2026PenaltyPointTally({
        asOf: '2027-01-31',
        ledger: first.ledger,
      }),
    ).toMatchObject({ points: 0, thresholdPoints: 6 })

    const afterExpiry = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2027-01-31',
      ledger: first.ledger,
      pointEntryId: 'expiry-b',
      points: 3,
    })

    expect(afterExpiry).toMatchObject({
      status: 'below-suspension-threshold',
      tally: { points: 3, thresholdPoints: 6 },
    })
    expect(afterExpiry.ledger.pointEntries.map((entry) => entry.id)).toEqual([
      'expiry-a',
      'expiry-b',
    ])
  })

  it('clears only the tally captured by a served suspension, not newer entries', () => {
    const initial = createSuperFormula2026PenaltyPointLedger({
      driverId: 's-ono',
    })
    const thresholdReached = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-05-01',
      ledger: initial,
      pointEntryId: 'pending-a',
      points: 6,
    })
    const newerPoint = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-05-02',
      ledger: thresholdReached.ledger,
      pointEntryId: 'pending-b',
      points: 1,
    })

    expect(newerPoint).toMatchObject({
      status: 'next-event-suspension-pending',
      tally: { points: 7, thresholdPoints: 6 },
    })
    if (!newerPoint.suspension) {
      throw new Error('Expected the first suspension to remain pending.')
    }
    const served = serveSuperFormula2026NextEventSuspension({
      ledger: newerPoint.ledger,
      suspensionId: newerPoint.suspension.id,
      suspensionLiftedOn: '2026-05-03',
    })

    expect(served.servedSuspension.clearedPointEntryIds).toEqual(['pending-a'])
    expect(
      superFormula2026PenaltyPointTally({
        asOf: '2026-05-03',
        ledger: served.ledger,
      }),
    ).toMatchObject({ points: 1, thresholdPoints: 4 })
    expect(served.ledger.pointEntries).toEqual([
      expect.objectContaining({
        clearedBySuspensionId: newerPoint.suspension.id,
        clearedOn: '2026-05-03',
        id: 'pending-a',
      }),
      expect.objectContaining({
        clearedOn: null,
        id: 'pending-b',
      }),
    ])
  })

  it('rejects out-of-order entries and invalid explicit suspension transitions', () => {
    const initial = createSuperFormula2026PenaltyPointLedger({
      driverId: 'r-hirakawa',
    })
    const first = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-04-02',
      ledger: initial,
      pointEntryId: 'chronological-a',
      points: 1,
    })

    expect(() =>
      recordSuperFormula2026PenaltyPoints({
        assessedOn: '2026-04-01',
        ledger: first.ledger,
        pointEntryId: 'chronological-b',
        points: 1,
      }),
    ).toThrow(/chronological/)
    expect(() =>
      serveSuperFormula2026NextEventSuspension({
        ledger: first.ledger,
        suspensionId: 'missing-suspension',
        suspensionLiftedOn: '2026-04-03',
      }),
    ).toThrow(/does not exist/)
  })

  it('accepts only source-matching, internally derived persisted ledger fields', () => {
    const initial = createSuperFormula2026PenaltyPointLedger({
      driverId: 'n-fukuzumi',
    })
    const adjudicated = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-06-10',
      ledger: initial,
      pointEntryId: 'official-decision-2026-06-10',
      points: 2,
    })

    expect(
      validateSuperFormula2026PenaltyPointLedger(adjudicated.ledger),
    ).toMatchObject({ valid: true })
    expect(
      validateSuperFormula2026PenaltyPointLedger({
        ...adjudicated.ledger,
        pointEntries: adjudicated.ledger.pointEntries.map((entry) => ({
          ...entry,
          expiresOn: '2026-12-10',
        })),
      }),
    ).toMatchObject({ valid: false, issues: ['invalid-point-entry'] })
    expect(
      validateSuperFormula2026PenaltyPointLedger({
        ...adjudicated.ledger,
        fiaPenaltyPoints: 2,
      }),
    ).toMatchObject({
      valid: false,
      issues: ['invalid-ledger-schema-or-provenance'],
    })
  })

  it('validates a suspension-clearing ledger after the official served transition', () => {
    const assessed = recordSuperFormula2026PenaltyPoints({
      assessedOn: '2026-07-01',
      ledger: createSuperFormula2026PenaltyPointLedger({
        driverId: 't-matsushita',
      }),
      pointEntryId: 'official-clearing-1',
      points: 6,
    })

    if (!assessed.suspension) {
      throw new Error('Expected an Article 5 suspension.')
    }
    const served = serveSuperFormula2026NextEventSuspension({
      ledger: assessed.ledger,
      suspensionId: assessed.suspension.id,
      suspensionLiftedOn: '2026-07-08',
    })

    expect(
      validateSuperFormula2026PenaltyPointLedger(served.ledger),
    ).toMatchObject({ valid: true })
  })
})
