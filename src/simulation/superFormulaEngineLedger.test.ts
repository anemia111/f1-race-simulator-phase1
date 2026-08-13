import { describe, expect, it } from 'vitest'
import {
  createSuperFormula2026EngineLedger,
  replaceSuperFormula2026Engine,
  superFormula2026EngineReplacementConsequences,
  validateSuperFormula2026EngineLedger,
} from './superFormulaEngineLedger'

describe('SUPER FORMULA 2026 engine ledger', () => {
  it('creates a single-engine entrant ledger from the Article 24 allowance', () => {
    const ledger = createSuperFormula2026EngineLedger({
      entrantId: 'team-mugen',
    })

    expect(ledger).toMatchObject({
      engine: { maximumPerEntrantPerSeason: 2, used: 1 },
      entrantId: 'team-mugen',
      kind: 'super-formula-2026-engine-ledger',
      ruleProvenance: {
        maximumPerEntrantPerSeason: {
          article: 'Article 24.2.3',
          sourceId: 'jaf-sf-2026-unified-regulations',
        },
        replacementConsequences: {
          article: 'Article 24.2.2, 24.2.4-24.2.7',
          sourceId: 'jaf-sf-2026-unified-regulations',
        },
      },
      seasonYear: 2026,
      seriesId: 'super-formula',
    })
  })

  it('carries published timing and force-majeure metadata without inventing a numeric penalty', () => {
    const consequences = superFormula2026EngineReplacementConsequences()

    expect(consequences).toMatchObject({
      availability: 'verified',
      provenance: { article: 'Article 24.2.2, 24.2.4-24.2.7' },
      resolution: 'event-timing-context-required',
      value: {
        declarationDeadline: '17:00 on the day before official qualifying',
        exemption: { excludesTimingConsequences: true },
        timingConsequences: expect.arrayContaining([
          expect.objectContaining({
            id: 'before-official-scrutineering',
            result: 'Ten-place grid drop from the official qualifying result.',
          }),
          expect.objectContaining({
            id: 'second-or-later-change-during-event',
            result: 'Pit-lane start.',
          }),
        ]),
      },
    })
    expect('gridPenalty' in consequences).toBe(false)
  })

  it('increments only the engine ledger and stops at the sourced seasonal maximum', () => {
    const original = createSuperFormula2026EngineLedger({
      entrantId: 'team-mugen',
    })
    const firstReplacement = replaceSuperFormula2026Engine(original)

    expect(firstReplacement).toMatchObject({
      ledger: { engine: { maximumPerEntrantPerSeason: 2, used: 2 } },
      remaining: 0,
      status: 'replaced',
    })
    expect(original.engine.used).toBe(1)

    if (firstReplacement.status !== 'replaced') {
      throw new Error('Expected the second declared engine to be available.')
    }

    expect(replaceSuperFormula2026Engine(firstReplacement.ledger)).toMatchObject({
      ledger: { engine: { maximumPerEntrantPerSeason: 2, used: 2 } },
      remaining: 0,
      status: 'season-allocation-exhausted',
    })
  })

  it('rejects malformed and F1-component-shaped persisted state', () => {
    const valid = createSuperFormula2026EngineLedger({
      entrantId: 'team-mugen',
    })
    const malformed = {
      ...valid,
      ice: { allocationLimit: 4, allocationUsed: 1 },
    }

    expect(validateSuperFormula2026EngineLedger(valid)).toMatchObject({
      valid: true,
    })
    expect(validateSuperFormula2026EngineLedger(malformed)).toEqual({
      issues: ['unexpected-ledger-fields'],
      valid: false,
    })
    expect(replaceSuperFormula2026Engine(malformed)).toEqual({
      issues: ['unexpected-ledger-fields'],
      status: 'invalid-ledger',
    })
  })
})
