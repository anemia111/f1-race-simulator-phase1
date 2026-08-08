import { describe, expect, it } from 'vitest'
import {
  frozenRegulationSources2026,
  resolveEffectiveRuleSet,
  unavailableRegulationAuthorities,
  type RegulationAuthorityLevel,
  type RegulationRuleDefinition,
  type RegulationSourceRef,
} from './effectiveRuleResolver'

function source(options: {
  authorityLevel?: RegulationAuthorityLevel
  effectiveFrom?: string
  effectiveTo?: string
  eventIds?: readonly string[]
  id: string
  parameterSource?: RegulationSourceRef['parameterSource']
  rules: readonly RegulationRuleDefinition[]
  supersedes?: readonly string[]
}): RegulationSourceRef {
  return {
    authorityLevel: options.authorityLevel ?? 'binding-base-regulation',
    checksum: `checksum-${options.id}`,
    effectiveFrom: options.effectiveFrom ?? '2026-01-01',
    effectiveTo: options.effectiveTo,
    eventIds: options.eventIds,
    id: options.id,
    parameterSource: options.parameterSource ?? 'regulation',
    publishedAt: options.effectiveFrom ?? '2026-01-01',
    rules: options.rules,
    seriesId: 'super-formula',
    supersedes: options.supersedes,
    title: options.id,
    url: `https://example.test/${options.id}`,
  }
}

describe('effective regulation resolver', () => {
  it('freezes the current F1 and JAF authority references without inventing FIA event docs', () => {
    expect(frozenRegulationSources2026.map(({ id }) => id)).toEqual([
      'fia-f1-2026-sporting-b08',
      'fia-f1-2026-technical-c20',
      'fia-f1-2026-operational-f10',
      'jaf-sf-2026-unified-regulations',
      'jaf-sf-2026-correction-web011',
      'jaf-race-bulletin-003-2026',
      'jaf-sf-2026-substitute-round-3-web056',
    ])

    const frozenIds = new Set<string>(
      frozenRegulationSources2026.map(({ id }) => id),
    )
    const unavailableIds = unavailableRegulationAuthorities.flatMap(({ ids }) => ids)
    expect(unavailableIds).toEqual([
      'FIA-F1-DOC-034',
      'FIA-F1-DOC-058',
      'FIA-F1-DOC-111',
    ])
    expect(unavailableIds.every((id) => !frozenIds.has(id))).toBe(true)
    expect(
      frozenRegulationSources2026.find(
        ({ id }) => id === 'fia-f1-2026-technical-c20',
      ),
    ).toMatchObject({
      checksum: 'cf0b919eef5eecc27497fb6de012f8d27e200f6dbd34d62b7e5385f7274ff652',
      effectiveFrom: '2026-08-05',
    })
  })

  it('applies frozen sources by series, effective date, and event scope', () => {
    expect(
      resolveEffectiveRuleSet({
        eventDate: '2026-08-04',
        seriesId: 'f1-custom',
      }).effectiveSourceIds,
    ).toEqual([])
    expect(
      resolveEffectiveRuleSet({
        eventDate: '2026-08-05',
        seriesId: 'f1-custom',
      }).effectiveSourceIds,
    ).toEqual([
      'fia-f1-2026-operational-f10',
      'fia-f1-2026-sporting-b08',
      'fia-f1-2026-technical-c20',
    ])

    const replacement = resolveEffectiveRuleSet({
      eventDate: '2026-07-15',
      eventId: 'sf-03-replacement',
      seriesId: 'super-formula',
    })
    expect(replacement.effectiveSourceIds).toEqual([
      'jaf-race-bulletin-003-2026',
      'jaf-sf-2026-correction-web011',
      'jaf-sf-2026-substitute-round-3-web056',
      'jaf-sf-2026-unified-regulations',
    ])

    const unrelatedEvent = resolveEffectiveRuleSet({
      eventDate: '2026-07-15',
      eventId: 'sf-08',
      seriesId: 'super-formula',
    })
    expect(unrelatedEvent.effectiveSourceIds).not.toContain(
      'jaf-sf-2026-substitute-round-3-web056',
    )
    expect(unrelatedEvent.excludedSources).toContainEqual({
      reason: 'event-scope-mismatch',
      sourceId: 'jaf-sf-2026-substitute-round-3-web056',
    })
  })

  it('uses authority instead of input order', () => {
    const base = source({
      id: 'base',
      rules: [{ id: 'base-workers', key: 'tyre-change-workers', value: 5 }],
    })
    const correction = source({
      authorityLevel: 'binding-official-correction',
      effectiveFrom: '2026-02-03',
      id: 'correction',
      rules: [{ id: 'corrected-workers', key: 'tyre-change-workers', value: 6 }],
    })

    const forward = resolveEffectiveRuleSet({
      eventDate: '2026-03-01',
      seriesId: 'super-formula',
      sources: [base, correction],
    })
    const reverse = resolveEffectiveRuleSet({
      eventDate: '2026-03-01',
      seriesId: 'super-formula',
      sources: [correction, base],
    })

    expect(forward).toEqual(reverse)
    expect(forward.rules['tyre-change-workers'].value).toBe(6)
    expect(forward.discardedCandidates).toContainEqual({
      candidateId: 'base-workers',
      reason: 'lower-precedence',
    })
  })

  it('uses event specificity and then the latest effective date', () => {
    const generalOld = source({
      id: 'general-old',
      rules: [{ id: 'general-old-rule', key: 'start-mode', value: 'standing' }],
    })
    const generalNew = source({
      effectiveFrom: '2026-04-01',
      id: 'general-new',
      rules: [{ id: 'general-new-rule', key: 'start-mode', value: 'rolling' }],
    })
    const eventSpecific = source({
      eventIds: ['sf-06'],
      id: 'event-specific',
      rules: [{ id: 'event-rule', key: 'start-mode', value: 'pit-lane' }],
    })

    expect(
      resolveEffectiveRuleSet({
        eventDate: '2026-05-01',
        eventId: 'sf-05',
        seriesId: 'super-formula',
        sources: [generalOld, generalNew, eventSpecific],
      }).rules['start-mode'].value,
    ).toBe('rolling')
    expect(
      resolveEffectiveRuleSet({
        eventDate: '2026-05-01',
        eventId: 'sf-06',
        seriesId: 'super-formula',
        sources: [generalOld, generalNew, eventSpecific],
      }).rules['start-mode'].value,
    ).toBe('pit-lane')
  })

  it('removes explicitly superseded sources and rules', () => {
    const obsolete = source({
      id: 'obsolete',
      rules: [{ id: 'obsolete-limit', key: 'limit', value: 1 }],
    })
    const replacement = source({
      id: 'replacement',
      rules: [{ id: 'replacement-limit', key: 'limit', value: 2 }],
      supersedes: ['obsolete'],
    })

    const resolved = resolveEffectiveRuleSet({
      eventDate: '2026-01-01',
      seriesId: 'super-formula',
      sources: [replacement, obsolete],
    })
    expect(resolved.rules.limit.value).toBe(2)
    expect(resolved.supersededSourceIds).toEqual(['obsolete'])
    expect(resolved.excludedSources).toContainEqual({
      reason: 'superseded',
      sourceId: 'obsolete',
      supersededBy: ['replacement'],
    })

    const ruleLevel = source({
      id: 'rule-level',
      rules: [
        { id: 'old-rule', key: 'rule-limit', value: 3 },
        {
          id: 'new-rule',
          key: 'rule-limit',
          supersedes: ['old-rule'],
          value: 4,
        },
      ],
    })
    expect(
      resolveEffectiveRuleSet({
        eventDate: '2026-01-01',
        seriesId: 'super-formula',
        sources: [ruleLevel],
      }).rules['rule-limit'].value,
    ).toBe(4)
  })

  it('keeps equal-precedence disagreement unresolved instead of falling back', () => {
    const first = source({
      id: 'first',
      rules: [{ id: 'first-limit', key: 'pit-speed-kph', value: 60 }],
    })
    const second = source({
      id: 'second',
      rules: [{ id: 'second-limit', key: 'pit-speed-kph', value: 80 }],
    })
    const resolved = resolveEffectiveRuleSet({
      eventDate: '2026-01-01',
      seriesId: 'super-formula',
      sources: [second, first],
    })

    expect(resolved.rules['pit-speed-kph']).toBeUndefined()
    expect(resolved.unresolvedItems).toEqual(['pit-speed-kph'])
    expect(resolved.conflicts).toMatchObject([
      {
        candidateIds: ['first-limit', 'second-limit'],
        key: 'pit-speed-kph',
        reason: 'equal-precedence-conflict',
      },
    ])
  })

  it('coalesces equal values but keeps simulator policy in a separate lane', () => {
    const officialA = source({
      id: 'official-a',
      rules: [
        {
          id: 'official-a-rule',
          key: 'unsafe-release-model',
          value: { evidenceRequired: true },
        },
      ],
    })
    const officialB = source({
      id: 'official-b',
      rules: [
        {
          id: 'official-b-rule',
          key: 'unsafe-release-model',
          value: { evidenceRequired: true },
        },
      ],
    })
    const policy = source({
      authorityLevel: 'simulator-policy',
      id: 'policy',
      parameterSource: 'simulator-policy',
      rules: [
        {
          id: 'policy-threshold',
          key: 'unsafe-release-model',
          value: { projectionHorizonSeconds: 2 },
        },
      ],
    })
    const resolved = resolveEffectiveRuleSet({
      eventDate: '2026-01-01',
      seriesId: 'super-formula',
      sources: [policy, officialB, officialA],
    })

    expect(resolved.rules['unsafe-release-model']).toMatchObject({
      candidateIds: ['official-a-rule', 'official-b-rule'],
      parameterSources: ['regulation'],
      value: { evidenceRequired: true },
    })
    expect(resolved.simulatorPolicies['unsafe-release-model']).toMatchObject({
      parameterSources: ['simulator-policy'],
      value: { projectionHorizonSeconds: 2 },
    })
    expect(resolved.conflicts).toEqual([])
  })

  it('rejects policy metadata that could masquerade as an official authority', () => {
    const disguisedPolicy = source({
      id: 'disguised-policy',
      parameterSource: 'simulator-policy',
      rules: [{ id: 'policy-rule', key: 'threshold', value: 1 }],
    })

    expect(() =>
      resolveEffectiveRuleSet({
        eventDate: '2026-01-01',
        seriesId: 'super-formula',
        sources: [disguisedPolicy],
      }),
    ).toThrow(/simulator-policy authority and provenance together/)
  })
})
