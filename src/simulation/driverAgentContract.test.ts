import { describe, expect, it } from 'vitest'
import { initialDrivers } from '../data/grid2026'
import { DRIVER_ABILITY_INTERNAL_MAX } from './driverAbility'
import {
  DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS,
  F1_2026_DRIVING_POLICY,
  SF_2026_DRIVING_POLICY,
  canonicalizeDriverAgentTickInput,
  canonicalizeDriverDecisionRecord,
  createDriverDecisionRecord,
  seriesDrivingPolicyFor,
  validateDriverDecisionRecord,
  type DriverAgentRequestFor,
  type DriverAgentTickInput,
  type DriverDecisionRecord,
  type F1DriverCategoryExperience,
  type F1_2026_DrivingPolicy,
  type SFDriverCategoryExperience,
  type SF_2026_DrivingPolicy,
} from './driverAgentContract'

type F1Policy = typeof F1_2026_DRIVING_POLICY
type F1Input = DriverAgentTickInput<F1Policy>
type F1Record = DriverDecisionRecord<F1Policy>
type F1Observation = F1Input['observations'][number]
type F1SelfObservation = Extract<F1Observation, { scope: 'self' }>
type F1TrafficObservation = Extract<F1Observation, { scope: 'traffic' }>
type SfPolicy = typeof SF_2026_DRIVING_POLICY
type SfInput = DriverAgentTickInput<SfPolicy>
type SfRecord = DriverDecisionRecord<SfPolicy>

const driver = initialDrivers[0]

function observation(
  observationId: string,
  scope: 'self',
): F1SelfObservation
function observation(
  observationId: string,
  scope: 'traffic',
): F1TrafficObservation
function observation(
  observationId: string,
  scope: 'self' | 'traffic',
): F1Observation {
  const common = {
    availableAtTick: 10,
    driverId: driver.id,
    observationId,
    observedAtTick: 9,
    provenance: {
      source: 'physics-sensor' as const,
      sourceId: `sensor:${observationId}`,
    },
    seriesId: 'f1-custom' as const,
    vehicleEraId: 'f1-2026-current' as const,
  }

  return scope === 'traffic'
    ? {
        ...common,
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 1.2,
            minimum: 0.8,
          },
          value: 1,
        },
        scope,
        signalId: 'gap-seconds',
        subjectId: 'other-driver',
      }
    : {
        ...common,
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 0.25,
        },
        scope,
        signalId: 'lap-progress',
      }
}

function f1Input(): F1Input {
  return {
    decisionTime: { elapsedSeconds: 0.5, tick: 10 },
    driverId: driver.id,
    experience: {
      confidence: 0,
      driverId: driver.id,
      learnedGripModel: {
        availability: 'unavailable',
        evidenceObservationIds: ['grip-evidence-b', 'grip-evidence-a'],
        kind: 'grip',
        modelId: null,
        reason: 'No category observations have been learned yet.',
        revision: 0,
      },
      learnedEnergyModel: {
        availability: 'unavailable',
        evidenceObservationIds: ['energy-evidence-b', 'energy-evidence-a'],
        kind: 'f1-energy',
        modelId: null,
        reason: 'No energy observations have been learned yet.',
        revision: 0,
      },
      mileageKm: 0,
      seriesId: 'f1-custom',
      vehicleEraId: 'f1-2026-current',
    },
    identity: {
      memory: {
        decisionIds: ['decision-b', 'decision-a'],
        observationIds: ['memory-b', 'memory-a'],
      },
      skills: { ...driver.skills },
      style: { ...driver.style },
    },
    observations: [observation('observation-b', 'traffic'), observation('observation-a', 'self')],
    policy: F1_2026_DRIVING_POLICY,
    seed: 'phase-7-contract',
  }
}

function f1Record(input: F1Input): F1Record {
  return {
    candidates: [
      {
        candidateId: 'candidate-b',
        requests: [
          {
            channel: 'intention',
            intention: 'defend',
            requestId: 'request-b',
          },
        ],
      },
      {
        candidateId: 'candidate-a',
        requests: [
          {
            channel: 'goal',
            goal: 'respond-to-observation',
            observationId: 'observation-a',
            requestId: 'request-a',
          },
        ],
      },
    ],
    constraints: [
      {
        candidateId: 'candidate-b',
        constraintId: 'constraint-b',
        observationIds: ['observation-b'],
        reasonCode: 'traffic-space-unavailable',
        status: 'blocked',
      },
    ],
    decisionId: 'decision-current',
    decisionTime: input.decisionTime,
    driverId: input.driverId,
    observationIds: ['observation-b', 'observation-a'],
    policyKind: input.policy.kind,
    reason: {
      code: 'deterministic-fallback',
      referenceIds: ['candidate-b', 'candidate-a'],
    },
    seed: input.seed,
    selectedCandidateId: 'candidate-a',
    seriesId: input.policy.seriesId,
    utilities: [
      {
        candidateId: 'candidate-b',
        status: 'legacy-not-evaluated',
        value: null,
      },
      {
        candidateId: 'candidate-a',
        status: 'legacy-not-evaluated',
        value: null,
      },
    ],
    vehicleEraId: input.policy.vehicleEraId,
  }
}

function sfInput(): SfInput {
  const input = f1Input()

  return {
    decisionTime: input.decisionTime,
    driverId: input.driverId,
    experience: {
      confidence: 0,
      driverId: input.driverId,
      learnedGripModel: input.experience.learnedGripModel,
      mileageKm: 0,
      seriesId: 'super-formula',
      vehicleEraId: 'sf-2026',
    },
    identity: input.identity,
    observations: [
      {
        availableAtTick: 10,
        driverId: input.driverId,
        observationId: 'sf-ots-observation',
        observedAtTick: 10,
        provenance: {
          source: 'category-system',
          sourceId: 'super-formula-event-source',
        },
        reading: {
          kind: 'unavailable',
          reason: 'source-unavailable',
        },
        scope: 'sf-system',
        seriesId: 'super-formula',
        signalId: 'ots',
        vehicleEraId: 'sf-2026',
      },
    ],
    policy: SF_2026_DRIVING_POLICY,
    seed: input.seed,
  }
}

function sfRecord(input: SfInput): SfRecord {
  return {
    candidates: [
      {
        candidateId: 'sf-candidate',
        requests: [
          {
            channel: 'intention',
            intention: 'follow-reference-line',
            requestId: 'sf-request',
          },
        ],
      },
    ],
    constraints: [],
    decisionId: 'sf-decision',
    decisionTime: input.decisionTime,
    driverId: input.driverId,
    observationIds: ['sf-ots-observation'],
    policyKind: input.policy.kind,
    reason: {
      code: 'deterministic-fallback',
      referenceIds: ['sf-candidate'],
    },
    seed: input.seed,
    selectedCandidateId: 'sf-candidate',
    seriesId: input.policy.seriesId,
    utilities: [
      {
        candidateId: 'sf-candidate',
        status: 'legacy-not-evaluated',
        value: null,
      },
    ],
    vehicleEraId: input.policy.vehicleEraId,
  }
}

describe('driver agent category contract', () => {
  it('closes category capabilities and learned models at compile time', () => {
    const invalidF1Policy: F1_2026_DrivingPolicy = {
      ...F1_2026_DRIVING_POLICY,
      capabilities: {
        ...F1_2026_DRIVING_POLICY.capabilities,
        // @ts-expect-error F1 2026 has no DRS driving capability.
        drs: 'requestable',
        // @ts-expect-error F1 2026 has no OTS capability.
        ots: 'requestable',
        // @ts-expect-error F1 2026 has no OTS attack capability.
        otsAttack: 'requestable',
      },
    }
    const invalidSfPolicy: SF_2026_DrivingPolicy = {
      ...SF_2026_DRIVING_POLICY,
      capabilities: {
        ...SF_2026_DRIVING_POLICY.capabilities,
        // @ts-expect-error SUPER FORMULA has no active-aero capability.
        activeAero: 'requestable',
        // @ts-expect-error SUPER FORMULA has no Energy Store capability.
        energyStore: 'requestable',
        // @ts-expect-error SUPER FORMULA exposes no ERS harvest request.
        ersHarvest: 'requestable',
        // @ts-expect-error SUPER FORMULA exposes no SOC observation capability.
        stateOfCharge: 'observable',
        // @ts-expect-error SUPER FORMULA has no Corner Mode capability.
        cornerMode: 'requestable',
      },
    }
    const invalidF1Experience: F1DriverCategoryExperience = {
      ...f1Input().experience,
      // @ts-expect-error F1 category experience cannot learn an OTS model.
      learnedOtsModel: {
        availability: 'unavailable',
        evidenceObservationIds: [],
        kind: 'sf-ots',
        modelId: null,
        reason: 'Not an F1 capability.',
        revision: 0,
      },
    }
    const sfExperience: SFDriverCategoryExperience = {
      confidence: 0,
      driverId: driver.id,
      learnedGripModel: {
        availability: 'unavailable',
        evidenceObservationIds: [],
        kind: 'grip',
        modelId: null,
        reason: 'No category observations have been learned yet.',
        revision: 0,
      },
      mileageKm: 0,
      seriesId: 'super-formula',
      vehicleEraId: 'sf-2026',
      // @ts-expect-error SUPER FORMULA cannot learn an F1 energy model.
      learnedEnergyModel: {
        availability: 'unavailable',
        evidenceObservationIds: [],
        kind: 'f1-energy',
        modelId: null,
        reason: 'Not a SUPER FORMULA capability.',
        revision: 0,
      },
    }
    const invalidF1Tactic: DriverAgentRequestFor<F1_2026_DrivingPolicy> = {
      action: 'request',
      channel: 'tactic',
      requestId: 'invalid-f1-ots',
      // @ts-expect-error F1 cannot emit an OTS request.
      tactic: 'ots-attack',
    }
    const invalidSfTactic: DriverAgentRequestFor<SF_2026_DrivingPolicy> = {
      action: 'request',
      channel: 'tactic',
      requestId: 'invalid-sf-energy',
      // @ts-expect-error SUPER FORMULA cannot emit an Energy Store request.
      tactic: 'energy',
    }
    const f1CapabilitiesWithSfOts = {
      ...F1_2026_DRIVING_POLICY.capabilities,
      otsAttack: 'requestable' as const,
    }
    const nonFreshF1Policy = {
      ...F1_2026_DRIVING_POLICY,
      capabilities: f1CapabilitiesWithSfOts,
    }
    // @ts-expect-error Optional-never capability guards reject non-fresh values too.
    const invalidNonFreshF1Policy: F1_2026_DrivingPolicy = nonFreshF1Policy
    const sfCapabilitiesWithCornerMode = {
      ...SF_2026_DRIVING_POLICY.capabilities,
      cornerMode: 'requestable' as const,
    }
    const nonFreshSfPolicy = {
      ...SF_2026_DRIVING_POLICY,
      capabilities: sfCapabilitiesWithCornerMode,
    }
    // @ts-expect-error Optional-never capability guards reject non-fresh values too.
    const invalidNonFreshSfPolicy: SF_2026_DrivingPolicy = nonFreshSfPolicy

    const compileOnlyCrossCategoryCalls = () => {
      const sfRecord = null as unknown as DriverDecisionRecord<SF_2026_DrivingPolicy>
      // @ts-expect-error A SUPER FORMULA record cannot be validated with an F1 input.
      validateDriverDecisionRecord(sfRecord, f1Input())
      // @ts-expect-error A SUPER FORMULA record cannot be created with an F1 input.
      createDriverDecisionRecord(sfRecord, f1Input())
    }
    void compileOnlyCrossCategoryCalls

    const sfOtsObservation = {
      ...observation('compile-sf-ots', 'self'),
      reading: {
        kind: 'unavailable',
        reason: 'source-unavailable',
      },
      scope: 'sf-system',
      signalId: 'ots',
    } as const
    // @ts-expect-error An F1 input cannot contain a SUPER FORMULA OTS reading.
    const invalidF1Observation: F1Input['observations'][number] = sfOtsObservation
    const f1EnergyObservation = {
      ...observation('compile-f1-energy', 'self'),
      reading: {
        kind: 'scalar',
        uncertainty: { kind: 'exact' },
        value: 0.5,
      },
      scope: 'f1-system',
      signalId: 'energy-store',
    } as const
    // @ts-expect-error A SUPER FORMULA input cannot contain an F1 Energy Store reading.
    const invalidSfObservation: SfInput['observations'][number] = f1EnergyObservation
    const trafficWithoutSubject = {
      ...observation('compile-traffic-no-subject', 'self'),
      scope: 'traffic',
      signalId: 'gap-seconds',
    } as const
    // @ts-expect-error Traffic readings require a subject id.
    const invalidTrafficObservation: F1Input['observations'][number] =
      trafficWithoutSubject
    const selfWithSubject = {
      ...observation('compile-self-with-subject', 'traffic'),
      scope: 'self',
      signalId: 'lap-progress',
    } as const
    // @ts-expect-error Non-traffic readings cannot carry a subject id.
    const invalidSelfObservation: F1Input['observations'][number] = selfWithSubject

    expect(invalidF1Policy.capabilities).toHaveProperty('ots')
    expect(invalidSfPolicy.capabilities).toHaveProperty('energyStore')
    expect(invalidF1Experience).toHaveProperty('learnedOtsModel')
    expect(sfExperience).toHaveProperty('learnedEnergyModel')
    expect(invalidF1Tactic).toHaveProperty('tactic', 'ots-attack')
    expect(invalidSfTactic).toHaveProperty('tactic', 'energy')
    expect(invalidNonFreshF1Policy.capabilities).toHaveProperty('otsAttack')
    expect(invalidNonFreshSfPolicy.capabilities).toHaveProperty('cornerMode')
    expect(invalidF1Observation).toHaveProperty('signalId', 'ots')
    expect(invalidSfObservation).toHaveProperty('signalId', 'energy-store')
    expect(invalidTrafficObservation).not.toHaveProperty('subjectId')
    expect(invalidSelfObservation).toHaveProperty('subjectId')
  })

  it('resolves only the matching 2026 series and vehicle-era policy', () => {
    expect(
      seriesDrivingPolicyFor('f1-custom', 'f1-2026-current'),
    ).toBe(F1_2026_DRIVING_POLICY)
    expect(
      seriesDrivingPolicyFor('super-formula', 'sf-2026'),
    ).toBe(SF_2026_DRIVING_POLICY)
    expect(() =>
      seriesDrivingPolicyFor('f1-custom', 'sf-2026'),
    ).toThrow(/Unsupported driver policy/)
  })

  it('accepts an explicit unavailable utility without inventing a score', () => {
    const input = f1Input()
    const record = createDriverDecisionRecord(f1Record(input), input)

    expect(record.utilities).toEqual([
      {
        candidateId: 'candidate-a',
        status: 'legacy-not-evaluated',
        value: null,
      },
      {
        candidateId: 'candidate-b',
        status: 'legacy-not-evaluated',
        value: null,
      },
    ])
  })

  it('rejects non-finite, future, and causally reversed observations', () => {
    const input = f1Input()
    const record = f1Record(input)
    const nonFinite = {
      ...input,
      decisionTime: { elapsedSeconds: Number.POSITIVE_INFINITY, tick: 10 },
    }
    const future = {
      ...input,
      observations: input.observations.map((entry, index) =>
        index === 0 ? { ...entry, availableAtTick: 11 } : entry,
      ),
    }
    const causallyReversed = {
      ...input,
      observations: input.observations.map((entry, index) =>
        index === 0 ? { ...entry, observedAtTick: 11 } : entry,
      ),
    }

    expect(() =>
      validateDriverDecisionRecord(record, nonFinite),
    ).toThrow(/finite/)
    expect(() => validateDriverDecisionRecord(record, future)).toThrow(
      /future tick/,
    )
    expect(() =>
      validateDriverDecisionRecord(record, causallyReversed),
    ).toThrow(/future tick/)
  })

  it('accepts every closed value-bearing reading family at its bounds', () => {
    const input = f1Input()
    const record = f1Record(input)
    const base = observation('supported-reading', 'self')
    const supported = [
      {
        ...base,
        observationId: 'self-lateral',
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: -20,
        },
        signalId: 'lateral-offset-m',
      },
      {
        ...base,
        observationId: 'track-reference',
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 20,
            minimum: -20,
          },
          value: 0,
        },
        scope: 'track',
        signalId: 'reference-line-offset-m',
      },
      {
        ...base,
        observationId: 'track-half-width',
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 20,
        },
        scope: 'track',
        signalId: 'track-half-width-m',
      },
      {
        ...base,
        observationId: 'traffic-gap',
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 28,
        },
        scope: 'traffic',
        signalId: 'gap-seconds',
        subjectId: 'traffic-a',
      },
      {
        ...base,
        observationId: 'traffic-lateral',
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 40,
            minimum: -40,
          },
          value: 0,
        },
        scope: 'traffic',
        signalId: 'lateral-separation-m',
        subjectId: 'traffic-b',
      },
      {
        ...base,
        observationId: 'race-control-flag',
        reading: {
          kind: 'state',
          uncertainty: { confidence: 0.75, kind: 'confidence' },
          value: 'double-yellow',
        },
        scope: 'race-control',
        signalId: 'flag-state',
      },
      {
        ...base,
        observationId: 'team-pit',
        reading: {
          kind: 'boolean',
          uncertainty: { confidence: 0, kind: 'confidence' },
          value: false,
        },
        scope: 'team',
        signalId: 'pit-instruction',
      },
      {
        ...base,
        observationId: 'f1-straight-mode',
        reading: {
          kind: 'boolean',
          uncertainty: { kind: 'exact' },
          value: true,
        },
        scope: 'f1-system',
        signalId: 'straight-mode',
      },
      {
        ...base,
        observationId: 'f1-corner-mode-unavailable',
        reading: {
          kind: 'unavailable',
          reason: 'sensor-unavailable',
        },
        scope: 'f1-system',
        signalId: 'corner-mode',
      },
      {
        ...base,
        observationId: 'f1-energy-store',
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 1,
            minimum: 0,
          },
          value: 1,
        },
        scope: 'f1-system',
        signalId: 'energy-store',
      },
      {
        ...base,
        observationId: 'f1-electrical-overtake',
        reading: {
          kind: 'state',
          uncertainty: { confidence: 1, kind: 'confidence' },
          value: 'available',
        },
        scope: 'f1-system',
        signalId: 'electrical-overtake',
      },
    ] as const satisfies readonly F1Input['observations'][number][]

    expect(() =>
      validateDriverDecisionRecord(record, {
        ...input,
        observations: [...input.observations, ...supported],
      }),
    ).not.toThrow()

    const superFormulaInput = sfInput()
    expect(() =>
      validateDriverDecisionRecord(sfRecord(superFormulaInput), superFormulaInput),
    ).not.toThrow()
  })

  it('rejects malformed, unbounded, and mis-correlated readings', () => {
    const input = f1Input()
    const record = f1Record(input)
    const base = observation('invalid-reading', 'self')
    const expectInvalid = (entry: unknown, error: RegExp) => {
      expect(() =>
        validateDriverDecisionRecord(record, {
          ...input,
          observations: [...input.observations, entry] as F1Input['observations'],
        }),
      ).toThrow(error)
    }

    expectInvalid(
      {
        ...base,
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 1.001,
        },
      },
      /between 0 and 1/,
    )
    expectInvalid(
      {
        ...base,
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 0.7,
            minimum: 0.6,
          },
          value: 0.5,
        },
      },
      /bounded interval must.*enclose/,
    )
    expectInvalid(
      {
        ...base,
        reading: {
          kind: 'scalar',
          uncertainty: {
            kind: 'bounded-interval',
            maximum: 0.5,
            minimum: -0.1,
          },
          value: 0.25,
        },
      },
      /bounded interval must.*remain between 0 and 1/,
    )
    expectInvalid(
      {
        ...base,
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: Number.NaN,
        },
      },
      /must be finite/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'invalid-confidence',
        reading: {
          kind: 'boolean',
          uncertainty: { confidence: 1.01, kind: 'confidence' },
          value: true,
        },
        scope: 'team',
        signalId: 'pit-instruction',
      },
      /confidence must be finite and between 0 and 1/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'invalid-unavailable-reason',
        reading: { kind: 'unavailable', reason: 'engineer-guessed' },
      },
      /reason is not supported/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'caller-domain',
        reading: {
          domain: [0, 1],
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 0.5,
        },
      },
      /contains unsupported field domain/,
    )
    const legacyMetadataOnly = {
      availableAtTick: base.availableAtTick,
      driverId: base.driverId,
      observationId: 'legacy-metadata-only',
      observedAtTick: base.observedAtTick,
      provenance: base.provenance,
      scope: base.scope,
      seriesId: base.seriesId,
      signalId: base.signalId,
      uncertainty: 'direct',
      vehicleEraId: base.vehicleEraId,
    }
    expectInvalid(legacyMetadataOnly, /unsupported field uncertainty/)
    expectInvalid(
      {
        ...base,
        observationId: 'unknown-common-signal',
        signalId: 'speed-kph',
      },
      /self observation signal is not supported/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'traffic-without-subject',
        scope: 'traffic',
        signalId: 'gap-seconds',
      },
      /missing required field subjectId/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'self-with-subject',
        subjectId: 'other-driver',
      },
      /contains unsupported field subjectId/,
    )
    expectInvalid(
      {
        ...base,
        observationId: 'wrong-reading-kind',
        reading: {
          kind: 'scalar',
          uncertainty: { kind: 'exact' },
          value: 1,
        },
        scope: 'team',
        signalId: 'pit-instruction',
      },
      /boolean value or be unavailable/,
    )
  })

  it('rejects cross-category observations and capabilities at runtime', () => {
    const input = f1Input()
    const record = f1Record(input)
    const crossObservation = {
      ...input,
      observations: [
        {
          ...input.observations[1],
          reading: {
            kind: 'unavailable',
            reason: 'source-unavailable',
          },
          scope: 'sf-system',
          seriesId: 'super-formula',
          signalId: 'ots',
          vehicleEraId: 'sf-2026',
        },
      ],
    } as unknown as F1Input
    const crossCapability = {
      ...input,
      policy: {
        ...input.policy,
        capabilities: {
          ...input.policy.capabilities,
          otsAttack: 'requestable',
        },
      },
    } as unknown as F1Input
    const superFormulaInput = sfInput()
    const crossF1SystemObservation = {
      ...superFormulaInput,
      observations: [
        {
          ...superFormulaInput.observations[0],
          reading: {
            kind: 'scalar',
            uncertainty: { kind: 'exact' },
            value: 0.5,
          },
          scope: 'f1-system',
          signalId: 'energy-store',
        },
      ],
    } as unknown as SfInput

    expect(() =>
      validateDriverDecisionRecord(record, crossObservation),
    ).toThrow(/crosses category/)
    expect(() =>
      validateDriverDecisionRecord(record, crossCapability),
    ).toThrow(/capabilities contains unsupported field otsAttack/)
    expect(() =>
      validateDriverDecisionRecord(
        sfRecord(superFormulaInput),
        crossF1SystemObservation,
      ),
    ).toThrow(/crosses category/)
  })

  it('rejects invented policies, capabilities, and category-system signals', () => {
    const input = f1Input()
    const record = f1Record(input)
    const inventedPolicy = {
      ...input,
      policy: { ...input.policy, kind: 'f1-2099-driving-policy' },
    } as unknown as F1Input
    const wrongEra = {
      ...input,
      policy: { ...input.policy, vehicleEraId: 'f1-2099' },
    } as unknown as F1Input
    const inventedCapabilityValue = {
      ...input,
      policy: {
        ...input.policy,
        capabilities: {
          ...input.policy.capabilities,
          cornerMode: 'automatic',
        },
      },
    } as unknown as F1Input
    const missingCapabilities = {
      ...input,
      policy: { ...input.policy, capabilities: {} },
    } as unknown as F1Input
    const sfInput = {
      decisionTime: input.decisionTime,
      driverId: input.driverId,
      experience: {
        confidence: 0,
        driverId: input.driverId,
        learnedGripModel: input.experience.learnedGripModel,
        mileageKm: 0,
        seriesId: 'super-formula',
        vehicleEraId: 'sf-2026',
      },
      identity: input.identity,
      observations: [],
      policy: SF_2026_DRIVING_POLICY,
      seed: input.seed,
    } satisfies SfInput
    const sfRecord = {
      ...record,
      policyKind: SF_2026_DRIVING_POLICY.kind,
      seriesId: SF_2026_DRIVING_POLICY.seriesId,
      vehicleEraId: SF_2026_DRIVING_POLICY.vehicleEraId,
    } as unknown as SfRecord
    const sfMissingCapabilities = {
      ...sfInput,
      policy: { ...sfInput.policy, capabilities: {} },
    } as unknown as SfInput
    const inventedSystemSignal = {
      ...input,
      observations: [
        {
          ...input.observations[1],
          scope: 'f1-system',
          signalId: 'ots',
        },
      ],
    } as unknown as F1Input

    expect(() => validateDriverDecisionRecord(record, inventedPolicy)).toThrow(
      /policy kind is not supported/,
    )
    expect(() => validateDriverDecisionRecord(record, wrongEra)).toThrow(
      /wrong series or vehicle era/,
    )
    expect(() =>
      validateDriverDecisionRecord(record, inventedCapabilityValue),
    ).toThrow(/capability must be requestable/)
    expect(() =>
      validateDriverDecisionRecord(record, missingCapabilities),
    ).toThrow(/capabilities is missing required field/)
    expect(() =>
      validateDriverDecisionRecord(sfRecord, sfMissingCapabilities),
    ).toThrow(/capabilities is missing required field/)
    expect(() =>
      validateDriverDecisionRecord(record, inventedSystemSignal),
    ).toThrow(/system observation signal is not supported/)
  })

  it('rejects unknown request fields and contract discriminants', () => {
    const input = f1Input()
    const record = f1Record(input)
    const withFirstRequest = (request: unknown) =>
      ({
        ...record,
        candidates: [
          { ...record.candidates[0], requests: [request] },
          record.candidates[1],
        ],
      }) as unknown as F1Record
    const originalRequest = record.candidates[0].requests[0]

    expect(() =>
      validateDriverDecisionRecord(
        withFirstRequest({ channel: 'world-write', requestId: 'request-b' }),
        input,
      ),
    ).toThrow(/request channel is not supported/)
    expect(() =>
      validateDriverDecisionRecord(
        withFirstRequest({ ...originalRequest, diagnosticNote: 'extra' }),
        input,
      ),
    ).toThrow(/contains unsupported field diagnosticNote/)
    expect(() =>
      validateDriverDecisionRecord(
        {
          ...record,
          utilities: record.utilities.map((utility, index) =>
            index === 0 ? { ...utility, status: 'estimated' } : utility,
          ),
        } as unknown as F1Record,
        input,
      ),
    ).toThrow(/utility status is not supported/)
    expect(() =>
      validateDriverDecisionRecord(
        {
          ...record,
          constraints: record.constraints.map((constraint) => ({
            ...constraint,
            status: 'ignored',
          })),
        } as unknown as F1Record,
        input,
      ),
    ).toThrow(/constraint status is not supported/)
    expect(() =>
      validateDriverDecisionRecord(
        {
          ...record,
          reason: { ...record.reason, code: 'because-agent-said-so' },
        } as unknown as F1Record,
        input,
      ),
    ).toThrow(/reason code is not supported/)
  })

  it('rejects duplicate constraints, invalid model state, and non-JSON values', () => {
    const input = f1Input()
    const record = f1Record(input)

    expect(() =>
      validateDriverDecisionRecord(
        {
          ...record,
          constraints: [record.constraints[0], { ...record.constraints[0] }],
        },
        input,
      ),
    ).toThrow(/duplicate constraint/)
    expect(() =>
      validateDriverDecisionRecord(record, {
        ...input,
        experience: {
          ...input.experience,
          learnedGripModel: {
            ...input.experience.learnedGripModel,
            evidenceObservationIds: ['duplicate', 'duplicate'],
          },
        },
      }),
    ).toThrow(/evidence ids contains duplicate/)

    for (const nonJsonValue of [
      new Date(0),
      new Map([['key', 'value']]),
      new Set(['value']),
    ]) {
      const nonJsonInput = {
        ...input,
        identity: {
          ...input.identity,
          skills: { ...input.identity.skills, nonJsonValue },
        },
      } as unknown as F1Input
      expect(() =>
        validateDriverDecisionRecord(record, nonJsonInput),
      ).toThrow(/plain JSON objects/)
    }
  })

  it('validates every shared identity rating and rejects hidden modifiers', () => {
    const input = f1Input()
    const record = f1Record(input)
    const missingRatings = {
      ...input,
      identity: { ...input.identity, skills: {}, style: {} },
    } as unknown as F1Input
    const hiddenModifier = {
      ...input,
      identity: {
        ...input.identity,
        skills: { ...input.identity.skills, categoryPaceBoost: 0.1 },
      },
    } as unknown as F1Input
    const outOfRangeStyle = {
      ...input,
      identity: {
        ...input.identity,
        style: { ...input.identity.style, brakingAggression: 1.01 },
      },
    }
    const limitBreakingSkill = {
      ...input,
      identity: {
        ...input.identity,
        skills: {
          ...input.identity.skills,
          rawPace: DRIVER_ABILITY_INTERNAL_MAX,
        },
      },
    }
    const outOfRangeSkill = {
      ...limitBreakingSkill,
      identity: {
        ...limitBreakingSkill.identity,
        skills: {
          ...limitBreakingSkill.identity.skills,
          rawPace: DRIVER_ABILITY_INTERNAL_MAX + 0.001,
        },
      },
    }

    expect(() =>
      validateDriverDecisionRecord(record, missingRatings),
    ).toThrow(/identity skills is missing required field/)
    expect(() =>
      validateDriverDecisionRecord(record, hiddenModifier),
    ).toThrow(/contains unsupported field categoryPaceBoost/)
    expect(() =>
      validateDriverDecisionRecord(record, outOfRangeStyle),
    ).toThrow(/brakingAggression must be finite and between 0 and 1/)
    expect(() =>
      validateDriverDecisionRecord(record, limitBreakingSkill),
    ).not.toThrow()
    expect(() =>
      validateDriverDecisionRecord(record, outOfRangeSkill),
    ).toThrow(/rawPace must be finite and between 0 and 1.2/)
  })

  it('rejects hidden, symbolic, and accessor state before canonicalization', () => {
    const input = f1Input()
    const record = f1Record(input)
    const replaceFirstRequest = (request: unknown) =>
      ({
        ...record,
        candidates: [
          { ...record.candidates[0], requests: [request] },
          record.candidates[1],
        ],
      }) as unknown as F1Record
    const sourceRequest = record.candidates[0].requests[0]
    const hiddenOutcome = { ...sourceRequest }
    Object.defineProperty(hiddenOutcome, 'speedKph', {
      enumerable: false,
      value: 300,
    })
    const symbolicState = { ...sourceRequest }
    Object.defineProperty(symbolicState, Symbol('hidden-state'), {
      enumerable: true,
      value: 'hidden',
    })
    let accessorRead = false
    const accessorState = {
      channel: 'intention' as const,
      intention: 'defend' as const,
    }
    Object.defineProperty(accessorState, 'requestId', {
      enumerable: true,
      get: () => {
        accessorRead = true
        return 'request-b'
      },
    })

    expect(() =>
      createDriverDecisionRecord(replaceFirstRequest(hiddenOutcome), input),
    ).toThrow(/must use enumerable data properties/)
    expect(() =>
      createDriverDecisionRecord(replaceFirstRequest(symbolicState), input),
    ).toThrow(/must use string property keys/)
    expect(() =>
      createDriverDecisionRecord(replaceFirstRequest(accessorState), input),
    ).toThrow(/must use enumerable data properties/)
    expect(accessorRead).toBe(false)
  })

  it('rejects invalid selection, utility coverage, and experience bounds', () => {
    const input = f1Input()
    const record = f1Record(input)

    expect(() =>
      validateDriverDecisionRecord(
        { ...record, selectedCandidateId: 'candidate-missing' },
        input,
      ),
    ).toThrow(/selected driver candidate does not exist/)
    expect(() =>
      validateDriverDecisionRecord(
        { ...record, utilities: record.utilities.slice(0, 1) },
        input,
      ),
    ).toThrow(/every driver candidate requires one utility record/)
    expect(() =>
      validateDriverDecisionRecord(
        {
          ...record,
          constraints: [
            {
              candidateId: record.selectedCandidateId,
              constraintId: 'selected-is-blocked',
              observationIds: [],
              reasonCode: 'not-feasible',
              status: 'blocked',
            },
          ],
        },
        input,
      ),
    ).toThrow(/selected candidate violates a blocked constraint/)
    expect(() =>
      validateDriverDecisionRecord(record, {
        ...input,
        experience: { ...input.experience, confidence: 1.01 },
      }),
    ).toThrow(/experience must be finite and bounded/)
  })

  it('canonicalizes input and record ordering without mutating either', () => {
    const input = f1Input()
    const record = f1Record(input)
    const canonicalInput = canonicalizeDriverAgentTickInput(input)
    const canonicalRecord = canonicalizeDriverDecisionRecord(record)

    expect(canonicalInput.observations.map(({ observationId }) => observationId)).toEqual([
      'observation-a',
      'observation-b',
    ])
    expect(canonicalInput.identity.memory.observationIds).toEqual([
      'memory-a',
      'memory-b',
    ])
    expect(canonicalInput.identity.memory.decisionIds).toEqual([
      'decision-a',
      'decision-b',
    ])
    expect(canonicalInput.experience.learnedGripModel.evidenceObservationIds).toEqual([
      'grip-evidence-a',
      'grip-evidence-b',
    ])
    expect(canonicalInput.experience.learnedEnergyModel?.evidenceObservationIds).toEqual([
      'energy-evidence-a',
      'energy-evidence-b',
    ])
    expect(canonicalRecord.candidates.map(({ candidateId }) => candidateId)).toEqual([
      'candidate-a',
      'candidate-b',
    ])
    expect(canonicalRecord.reason.referenceIds).toEqual([
      'candidate-a',
      'candidate-b',
    ])
    expect(input.observations[0].observationId).toBe('observation-b')
    expect(input.identity.memory.observationIds[0]).toBe('memory-b')
    expect(input.experience.learnedGripModel.evidenceObservationIds[0]).toBe(
      'grip-evidence-b',
    )
    expect(record.candidates[0].candidateId).toBe('candidate-b')
  })

  it('round-trips a canonical replay record through JSON', () => {
    const input = f1Input()
    const record = createDriverDecisionRecord(f1Record(input), input)

    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
  })

  it('rejects forbidden physical outcome fields even after an unsafe cast', () => {
    const input = f1Input()
    const record = f1Record(input)
    const polluted = {
      ...record,
      candidates: record.candidates.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              requests: candidate.requests.map((request) => ({
                ...request,
                speedKph: 300,
              })),
            }
          : candidate,
      ),
    } as unknown as F1Record

    expect(DRIVER_AGENT_FORBIDDEN_OUTCOME_FIELDS).toContain('speedKph')
    expect(() => validateDriverDecisionRecord(polluted, input)).toThrow(
      /cannot write outcome field speedKph/,
    )
  })
})
