# Driver Agent model

## Status and Phase 7.0 boundary

Phase 7.0 establishes a typed Driver Agent boundary and a reversible runtime
seam. It is deliberately behavior-neutral. It does **not** complete Phase 7,
activate an F1- or SUPER FORMULA-specific driving policy, add learned category
experience, or claim that the current generic driver logic is a complete
agent.

The batch has three relevant implementation boundaries:

- `src/simulation/driverAgentContract.ts` defines the portable agent contract,
  category policy types, observation metadata, requests, and decision-record
  schema;
- `src/simulation/categoryDriverAgent.ts` adapts that contract to the existing
  driver decision without changing the returned `DriverDecision`; and
- `src/simulation/race.ts` calls the reversible adapter wrapper at the one
  pre-advance race decision seam.

The behavior delegated by the adapter remains
`src/simulation/driverDecision.ts`. Existing category system truth remains in
`src/simulation/runtimeSystems.ts`, and existing F1 energy scheduling intent
remains in `src/simulation/driverEnergyIntent.ts`. Phase 7.0 does not transfer
physical or regulatory authority out of those modules.

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
```

The adapter is a migration seam, not a second decision authority. During this
batch, identical seed, driver, and context inputs with a supported executable
series/vehicle-era pair must produce an exactly equal `DriverDecision` through
both paths. An invalid pair fails closed on `category-agent-v1`; the explicit
rollback path deliberately skips that category check.

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
overtake-system label. Phase 7.0 carries the selected policy as typed metadata;
it does not yet use that metadata to change driving behavior.

For compatibility with existing race configurations, an omitted `seriesId`
resolves to `f1-custom`; an omitted vehicle era resolves to the matching 2026
era of the selected series. An explicitly mismatched pair is rejected on the
category-agent path. These defaults are a migration rule, not category
inference from physical or driver data.

### Observation metadata

`DriverObservationFor` defines what an agent can be told. In Phase 7.0 its
signals describe identity, provenance, availability, and uncertainty; they do
not duplicate live numerical WorldTruth into a second state owner. This makes
the observation boundary inspectable without pretending that a complete
perception model already exists.

Operational policies will require later, explicitly bounded observation values
with causal timing and uncertainty. They must be added through this contract,
not by handing an agent an unrestricted `RaceSnapshot`, category runtime truth,
future random result, opponent internal state, or final outcome.

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
references, requests, constraints, utility status, and forbidden outcome
fields. Canonicalization must not normalize an invalid category combination
into a valid one or change a seed.

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
any car advances. Phase 7.0 preserves that evaluation point. The adapter must
not move a decision after one car has already been updated, because that would
make traversal order observable to later drivers.

The contract separates three things that must not be conflated:

1. simulation truth owned by the physical and regulatory runtime;
2. observation metadata and, later, bounded causal signals available to a
   driver; and
3. requests emitted by the driver for downstream authorities to evaluate.

The current compatibility context still predates a complete perception model.
Phase 7.0 exposes the boundary but does not claim that every existing cue has
already been converted to a source-labelled, uncertain driver observation.

## Determinism

The category adapter must preserve the existing decision seed and context
without adding a category prefix or consuming an additional random draw. It
does not allocate a decision record on the race hot path. Contract-level record
creation and canonicalization are pure operations; when a later runtime producer
uses them, it must not use wall-clock time, global counters, mutable random
state, callback order, renderer state, or log retention as an input.

For Phase 7.0, the required invariants are:

- for a supported series/vehicle-era pair, the direct and adapter paths return
  exactly equal `DriverDecision` objects;
- the adapter does not allocate or retain a record while producing that live
  decision;
- contract canonicalization orders IDs and record collections by stable keys;
  and
- the same seed and canonical contract input produce the same canonical data.

This is a determinism foundation, not a completed save/replay feature. Decision
records are not yet part of checkpoint state or a persisted replay contract.

## Rollback

`RaceConfig.driverDecisionPath`, defined in `src/types.ts`, is the explicit
migration switch:

- `category-agent-v1` uses the behavior-neutral adapter; and
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrapper directly to `decideDriverBehavior`.

After exact parity coverage, an omitted property resolves to
`category-agent-v1`. Setting `legacy-direct` is the rollback point. Both modes
remain available while the adapter is behavior-neutral, so a regression can be
isolated without changing category physics, seeds, or saved driver ratings.
Exact decision parity applies to supported series/vehicle-era pairs; invalid
pairs are intentionally rejected only by the category-agent validation path.

`src/simulation/qualifying.ts` still calls the legacy driver decision directly.
It is outside this race-only migration slice and is an explicit remaining gap,
not an implicit user of the adapter.

## Remaining Phase 7 work

Phase 7 is not complete until later slices provide and verify at least:

- bounded value-bearing driver perception with causal latency and uncertainty;
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

Until those items are implemented, `category-agent-v1` names the new contract
and adapter path only. It must not be presented as operational category-specific
Driver AI.
