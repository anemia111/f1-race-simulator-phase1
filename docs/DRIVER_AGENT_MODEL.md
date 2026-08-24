# Driver Agent model

## Status and Phase 7.6 boundary

Phase 7.0 established a typed Driver Agent boundary and a reversible runtime
seam. Phase 7.1 extended that boundary with closed, value-bearing observation
readings and an immediate diagnostic projector. Phase 7.2 moves dispatch
ownership of the existing pure F1 energy-scheduling intent behind the same
category-agent migration switch. Phase 7.3 does the same for the existing pure
F1 Straight/Corner mode selector. Phase 7.4 moves the existing baseline F1
ERS-mode request selector. Phase 7.5 makes the legacy runtime's implicit
always-use-when-permitted Electrical Overtake request explicit and routes only
that ephemeral compatibility request through the switch. Phase 7.6 routes the
unchanged composite SUPER FORMULA OTS driver-use predicate through the same
switch. All seven slices are deliberately behavior-neutral. They do **not**
complete Phase 7, activate an observation-consuming F1 or SUPER FORMULA
driving policy, add learned category experience, or claim that the current
generic driver logic is a complete agent or perception model.

The batch has four relevant implementation boundaries:

- `src/simulation/driverAgentContract.ts` defines the portable agent contract,
  category policy types, closed observation readings, requests, validation,
  and the decision-record schema;
- `src/simulation/categoryDriverAgent.ts` adapts that contract to the existing
  driver decision, F1 energy-intent and ERS-mode schedulers, F1 active-aero
  mode selector, and the F1 Electrical Overtake compatibility request without
  changing their results, plus the unchanged SF OTS use predicate;
- `src/simulation/driverPerception.ts` provides the opt-in immediate diagnostic
  projection without joining the live race path; and
- `src/simulation/race.ts` calls the reversible adapter wrapper at the
  pre-advance race decision seam and passes the same route metadata to
  `src/simulation/telemetry.ts` for F1 energy, active-aero, Electrical
  Overtake, and SF OTS request dispatch.

The behavior delegated by the adapter remains
`src/simulation/driverDecision.ts`. Existing category system truth remains in
`src/simulation/runtimeSystems.ts`, and the existing F1 energy scheduling
calculation remains in `src/simulation/driverEnergyIntent.ts`. Phase 7.2 moves
only caller ownership: it does not change a coefficient or transfer physical,
SOC, power-limit, recharge, or regulatory authority out of the existing owners.

Phase 7.6 does not call the diagnostic projector from the live race hot path.
It therefore adds no per-car hot-path observation allocation, random draw,
decision record, retained inbox, event/log entry, or behavior change.

## Runtime flow

```text
immutable pre-advance race frame
  -> RaceConfig.driverDecisionPath
     -> decideDriverBehaviorForPath
        -> legacy-direct: delegate unchanged to decideDriverBehavior
        -> category-agent-v1: resolve and check executable series / vehicle era
             -> delegate unchanged to decideDriverBehavior
        -> return the same DriverDecision without allocating a record
  -> existing race, telemetry, and physical integration

calculateCarTelemetry for a car with an F1 Energy Store
  -> RaceConfig.driverDecisionPath
     -> legacy-direct
        -> f1EnergyIntentFor(the existing options)
     -> category-agent-v1
        -> resolve and check F1 policy / energyStore capability
        -> f1EnergyIntentFor(the same existing options)
  -> existing superclip, deployment, regulatory, and Energy Store owners

calculateCarTelemetry baseline requested ERS mode
  -> RaceConfig.driverDecisionPath
     -> legacy-direct: f1ErsModeIntentFor(the existing options)
     -> category-agent-v1
        -> resolve and check F1 energyStore capability
        -> f1ErsModeIntentFor(the same existing options)
  -> telemetry keeps every effective-mode override and physical owner

calculateCarTelemetry for an F1 active-aero runtime
  -> RaceConfig.driverDecisionPath
     -> legacy-direct: activeAeroModeFor(the existing options)
     -> category-agent-v1
        -> resolve and check F1 Straight/Corner capabilities
        -> activeAeroModeFor(the same existing options)
  -> advanceActiveAeroState remains the regulatory and physical owner

calculateCarTelemetry for F1 Electrical Overtake
  -> RaceConfig.driverDecisionPath
     -> legacy-direct: f1ElectricalOvertakeIntentFor()
     -> category-agent-v1
        -> resolve and check F1 Electrical Overtake capability
        -> f1ElectricalOvertakeIntentFor()
  -> overtakeStatusFor retains every effective-status gate
  -> existing power-curve, allowance, and Energy Store owners

calculateCarTelemetry for SUPER FORMULA OTS after final pedal controls
  -> existing downstream otsAvailable gate
     -> unavailable: disabled without invoking the request selector
     -> available: RaceConfig.driverDecisionPath
        -> legacy-direct: sfOtsUseRequestedFor(the existing inputs)
        -> category-agent-v1
           -> resolve and check SF OTS attack/defend capabilities
           -> sfOtsUseRequestedFor(the same existing inputs)
  -> telemetry retains effective status and sourced boost-power authority

opt-in diagnostic path
  immutable pre-advance DriverDecisionContext
    -> immediate observation projector
       -> closed exact readings
       -> contract validation
       -> ephemeral diagnostic result only
```

The adapter is a migration seam, not a second decision authority. During this
batch, identical seed, driver, and context inputs with a supported executable
series/vehicle-era pair must produce an exactly equal `DriverDecision` through
both paths. An invalid pair fails closed on `category-agent-v1`; the explicit
rollback path deliberately skips that category check.

The diagnostic path projects from the same immutable
`DriverDecisionContext` used before any car advances. It does not receive a
mutable `RaceSnapshot`, duplicate snapshot truth into retained agent state, or
feed its readings back into `decideDriverBehavior` in this slice.

The F1 energy seam is likewise an ownership adapter, not new scheduling logic.
Both paths call `f1EnergyIntentFor` exactly once with the same
`F1EnergyIntentOptions` and must return an exactly equal object. The category
path requires the resolved F1 policy to expose `energyStore: requestable`; an
SF policy or mismatched era fails closed before the scheduler options are read.
The rollback path skips that policy check. A genuine SF runtime has no F1
Energy Store and never enters this seam.

The Phase 7.3 active-aero seam is also ownership-only. Both paths call the same
mode selector with the same options. SF runtime, preparation-lap forced Corner,
and OTS remain outside the seam. `advanceActiveAeroState` still owns zone and
Low-Grip legality, deployment-change permission, continuous transitions,
failure latching, Corner-safe return, and durable front/rear wing state.

Phase 7.4 similarly owns only the baseline requested ERS mode. Telemetry still
forces the effective mode for standing starts, preparation laps, traffic yield,
superclipping, and qualifying attack. Regulatory curves, deployment requests,
SOC/recharge ledgers, and `advanceEnergyStore` remain downstream authorities.
The compatibility selector still reads exact legacy inputs and is not an
observation-consuming policy.

Phase 7.5 formalizes the legacy automatic activation behavior as an always-armed,
ephemeral `request`. The request reads no car, track, battery, race-control,
Low-Grip, eligibility, or allowance state. `overtakeStatusFor` remains the sole
arbiter of `disabled`, `available`, and `active`, including session, lap,
detection-latch, activation-line, SOC, and remaining-energy gates. Downstream
power curves, allowance debit, lap-start recharge latching, and Energy Store
integration remain unchanged. No request ID, record, runtime field, checkpoint,
or replay state is created, and operational request/hold/release timing remains
future work.

Phase 7.6 extracts only the existing SF OTS driver-use predicate after final
brake and throttle controls. Both paths read the same brake, throttle,
straightness, gap, battle-phase, pace-mode, and final-lap values and return the
same boolean request. Its thresholds are legacy simulator compatibility inputs,
not official JAF or event activation conditions. Telemetry preserves the old
short-circuit: the selector is called only after verified runtime eligibility,
session, preparation, Race Control, flag, and running-status availability gates
have passed. Effective status and the provenance-bearing event boost remain
downstream. The current runtime still has no event-condition evaluator and
therefore cannot activate and remains inactive; Phase 7.6 adds no evaluator,
allocation, cooldown, power, budget, distinct attack/defend policy, or durable
request state.

## Contract model

`src/simulation/driverAgentContract.ts` owns the following public concepts.

### Identity and category experience

`DriverIdentityModel` projects the driver's shared skills and style together
with reference-only decision/observation ID memory. A live seat, team, car number,
category, and vehicle era are deliberately excluded. The base values are not
re-fit or silently changed when the same driver is placed in another executable
category. Phase 7.0 does not yet define operational update/eviction bounds or
implement opponent learning.

`DriverCategoryExperience`, with its F1 and SUPER FORMULA branches, is separate
from shared identity. This allows future learning to be scoped by category and
vehicle era without modifying the driver's base skill profile. Phase 7.0 does
not learn, persist, or apply an experience modifier. Category experience must
therefore have no effect on the delegated decision in this batch.

### Series policy

`SeriesDrivingPolicy` is a discriminated union of
`F1_2026_DrivingPolicy` and `SF_2026_DrivingPolicy`. The discriminant is an
isolation boundary: F1-only energy and active-aero concepts cannot be exposed as
SUPER FORMULA capabilities, and SUPER FORMULA OTS cannot be exposed as an F1
capability.

Policy selection follows the executable series identity. It must not be
inferred from driver provenance, circuit identity, tyre supplier, or a generic
overtake-system label. Through Phase 7.6 the selected category metadata only
validates dispatch ownership at the F1 energy, ERS-mode, active-aero, and
Electrical Overtake request seams and the SF OTS request seam. It does not use
observations or a new policy algorithm to change driving behavior.

For compatibility with existing race configurations, an omitted `seriesId`
resolves to `f1-custom`; an omitted vehicle era resolves to the matching 2026
era of the selected series. An explicitly mismatched pair is rejected on the
category-agent path. These defaults are a migration rule, not category
inference from physical or driver data.

### Observation metadata and closed readings

`DriverObservationFor` defines what an agent can be told. Phase 7.1 adds a
closed set of value-bearing readings to the existing identity, provenance,
availability, and uncertainty envelope. A reading is not an open payload into
which arbitrary snapshot fields can be copied. Its legal kind and value bounds
are owned by the contract validator.

Validation also owns the correlation between category, observation scope,
`signalId`, and reading kind. A numerically valid reading is still invalid when
it is attached to the wrong scope or signal. F1-only system signals cannot be
projected into a SUPER FORMULA observation, and SUPER FORMULA OTS cannot be
projected into an F1 observation.

Observation timing must satisfy:

```text
observedAtTick <= availableAtTick <= decisionTime.tick
```

The Phase 7.1 projector produces immediate compatibility diagnostics, so its
exact readings use the same observation, availability, and decision tick.
They are ephemeral projections of selected legacy context fields, not a second
owner of simulation truth and not evidence that the driver has a complete
perception model.

SUPER FORMULA OTS may legitimately be source-unavailable. The contract lets an
explicit system-observation producer preserve that as an unavailable reading
without inventing an OTS budget, duration, power, or opponent estimate. The
Phase 7.1 immediate projector emits no category-system observation at all.

Operational policies still require a bounded inbox with delayed and noisy
readings, causal delivery, retention limits, and explicit consumption rules.
Those later inputs must remain inside this contract rather than handing an
agent an unrestricted `RaceSnapshot`, category runtime truth, future random
result, opponent internal state, or final outcome.

### Requests and records

`DriverAgentRequestFor` limits agent output to six request families:

- intention;
- goal;
- control;
- tactic;
- pit; and
- FIA.

These are requests to an owning subsystem. They are not authority to write
speed, rank, lap time, grip, power, damage, pass completion, a pit result, or a
race-control outcome.

`DriverDecisionRecord` is an auditable record schema for a decision. The schema
can describe the decision time, policy/category identity, observations,
candidates, constraints, candidate utilities, reason, and deterministic seed
context. A utility is discriminated as either an evaluated finite value or
`legacy-not-evaluated` with a null value. The latter records the current legacy
chooser honestly instead of inventing a score.

An explicit pure adapter evaluation may construct this diagnostic record, but
the race hot path does not allocate it. Phase 7.0 does not persist or retain
decision records in race snapshots, checkpoints, event logs, or another store.
Runtime retention, replay comparison, and bounded log lifetime remain later
work.

### Tick input and validation

`DriverAgentTickInput` defines the input schema, and
`canonicalizeDriverAgentTickInput` removes incidental collection order.
`validateDriverDecisionRecord` is the opt-in diagnostic validator for a record
and its replay input. It checks category alignment, causal observation timing,
scope/signal/reading correlation, reading bounds, references, requests,
constraints, utility status, and forbidden outcome fields. Canonicalization
must not normalize an invalid category combination or reading into a valid one,
or change a seed.

## Authority contract

The Driver Agent may choose or request behavior. Existing simulation owners
still decide outcomes:

- `src/simulation/driverDecision.ts` produces bounded lateral and pedal-control
  intent for the compatibility path;
- `src/simulation/race.ts` advances cars and owns the live race state;
- `src/simulation/telemetry.ts` and the race integration advance
  category-specific vehicle systems, while `src/simulation/runtimeSystems.ts`
  defines their isolated state branches and SUPER FORMULA initialization;
- `src/simulation/overtaking.ts` and the race integration determine whether a
  physical pass can occur; and
- race-control, steward, pit, damage, and classification modules remain owners
  of their respective results.

An FIA request channel does not let a driver decide an FIA outcome. Likewise,
a pit request does not complete a stop, and an overtake tactic does not move a
car through another car.

## Observability and causal separation

The live race constructs driver intent from one immutable physical field before
any car advances. Phase 7.1 preserves that evaluation point. The adapter must
not move a decision after one car has already been updated, because that would
make traversal order observable to later drivers.

The contract separates three things that must not be conflated:

1. simulation truth owned by the physical and regulatory runtime;
2. ephemeral diagnostic observations and, later, a bounded causal inbox
   available to a driver; and
3. requests emitted by the driver for downstream authorities to evaluate.

The immediate projector covers selected compatibility cues only. Phase 7.1
does not claim that every existing cue has been converted, that exact readings
model sensing error, or that a driver policy consumes those readings.

## Determinism

The category adapter must preserve the existing decision seed and context
without adding a category prefix or consuming an additional random draw. It
does not allocate a decision record on the race hot path. Contract-level record
creation and canonicalization are pure operations; when a later runtime producer
uses them, it must not use wall-clock time, global counters, mutable random
state, callback order, renderer state, or log retention as an input.

Through Phase 7.6, the required invariants are:

- for a supported series/vehicle-era pair, the direct and adapter paths return
  exactly equal `DriverDecision` objects;
- the adapter does not allocate or retain a record while producing that live
  decision;
- the immediate projector is opt-in and pure, consumes no random draw, and is
  not invoked by the live race path;
- the direct, category, and default F1 energy paths return exactly equal
  scheduling intent across the reviewed context matrix, without mutating the
  Energy Store input;
- the category energy path rejects SF or mismatched policy metadata before
  scheduling, while a genuine SF race never invokes the F1 scheduler;
- the direct, category, and default F1 active-aero paths return the same mode,
  while genuine SF runtime never invokes the selector;
- the baseline ERS-mode paths return the same request, while telemetry retains
  identical effective-mode override priority;
- the Electrical Overtake paths return the same always-armed compatibility
  request, while the downstream arbiter returns the same effective status and
  a genuine SF runtime never enters the F1 seam;
- direct, legacy, category, and default SF OTS paths return the same use
  predicate without mutating inputs, while F1 is rejected and unavailable SF
  OTS remains disabled without invoking the selector;
- contract canonicalization orders IDs and record collections by stable keys;
  and
- the same seed and canonical contract input produce the same canonical data.

This is a determinism foundation, not a completed save/replay feature.
Projected observations and decision records are not yet part of checkpoint
state, a retained driver inbox, or a persisted replay contract.

## Rollback

`RaceConfig.driverDecisionPath`, defined in `src/types.ts`, is the explicit
migration switch:

- `category-agent-v1` validates category ownership before delegating the
  generic decision and, for F1 telemetry, the existing energy and active-aero
  requests plus the baseline ERS-mode and Electrical Overtake compatibility
  requests and, when downstream availability passes, the existing SF OTS use
  predicate; and
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrappers directly to `decideDriverBehavior`, `f1EnergyIntentFor`,
  `f1ErsModeIntentFor`, `activeAeroModeFor`, and
  `f1ElectricalOvertakeIntentFor`, plus `sfOtsUseRequestedFor` for SF OTS.

After exact parity coverage, an omitted property resolves to
`category-agent-v1`. Setting `legacy-direct` is the rollback point. Both modes
remain available while the adapter is behavior-neutral, so a regression can be
isolated without changing category physics, seeds, or saved driver ratings.
Exact decision parity applies to supported series/vehicle-era pairs; invalid
pairs are intentionally rejected only by the category-agent validation path.
The same exact parity and rollback rules apply to the F1 energy-intent object;
no live divergence is allowed in this ownership-only slice.

`src/simulation/qualifying.ts` still calls the legacy driver decision directly.
It is outside this race-only migration slice and is an explicit remaining gap,
not an implicit user of the adapter. Existing `timedRunPhase` and
`qualifyingSpendBias` telemetry inputs continue unchanged as compatibility
inputs; they are not qualifying-agent migration or coverage.

## Remaining Phase 7 work

Phase 7 is not complete until later slices provide and verify at least:

- a delayed/noisy bounded observation inbox with causal delivery, retention,
  uncertainty, and operational policy consumption;
- strategic goals, tactical intent, and low-level controls as distinct layers;
- finite memory, opponent beliefs, risk budget, team-order response, and grip
  exploration;
- persistent, versioned category experience and neutral-to-learned transitions;
- operational F1 Straight/Corner Mode, energy, Overtake, tyre, brake, start,
  flag, pit, track-limit, and racecraft policy;
- operational SUPER FORMULA OTS attack/defend, tow, tyre, pit/refuelling,
  start, and rule-aware racecraft policy;
- decision-record retention, checkpoint/replay integration, and bounded logging;
- migration of qualifying and any other direct compatibility call sites;
- a driver-ability dependency graph and removal of unexplained duplicate
  effects; and
- cross-category and rule-aware behavior acceptance coverage.

Until those items are implemented, `category-agent-v1` names the contract and
behavior-neutral adapter path. Phase 7.1 adds only an opt-in diagnostic
projection, and Phase 7.2 adds only ownership-checked dispatch of the unchanged
F1 energy scheduler. Phase 7.3 adds the same ownership check for the unchanged
active-aero mode selector. Phase 7.4 adds only the unchanged baseline ERS-mode
selector. Phase 7.5 adds only an explicit representation of the legacy implicit
Electrical Overtake request; effective status remains downstream. Phase 7.6
adds only category-owned dispatch of the unchanged SF OTS use predicate after
downstream availability passes. None is operational category-specific Driver
AI.
