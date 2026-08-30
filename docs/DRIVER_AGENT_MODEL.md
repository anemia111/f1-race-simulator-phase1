# Driver Agent model

## Status — Phase 7 operational closure

Phase 7 is operationally complete as of 2026-08-29. The default
`category-agent-v1` path now consumes the bounded causal inbox in live races,
projects self/track/race-control/team/traffic readings, and emits a validated
goal -> intention/tactic -> low-level-control record. F1 battle tactics remain
F1 energy/Electrical Overtake requests; SUPER FORMULA battle tactics remain
OTS attack/defend requests. All physical, system, pit, FIA, pass, contact and
classification outcomes stay with their existing downstream authorities.

`driverAgentRuntime.ts` persists versioned category mileage/confidence and one
complete replay record per car. The one-record bound keeps browser checkpoints
below their storage budget; the observation inbox retains the longer causal
history. Checkpoint parsing rejects future, cross-driver and cross-category
runtime state. `legacy-direct` remains an exact low-level rollback path and
does not collect operational records.

The historical phase sequence below explains how this boundary was reached.

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
  switch. Phase 7.7 routes the unchanged generic timed-session driver-execution
  decision used by qualifying, Sprint Qualifying, and practice through the same
  switch. Phase 7.8A documents the current driver-ability dependency graph and
  the compound effects then requiring review, without changing production
  behavior. Phase 7.8B closes DA-01 through DA-14 with explicit owner, cadence,
  session-boundary, normalization and removal contracts. It does not tune from
  observed, holdout or documentation-validation values. This graph review did
  not by itself complete Phase 7; the later operational closure described
  above supplies observation consumption, bounded category experience and
  retained decision records.

The completed model has six relevant implementation boundaries:

- `src/simulation/driverAgentContract.ts` defines the portable agent contract,
  category policy types, closed observation readings, requests, validation,
  and the decision-record schema;
- `src/simulation/categoryDriverAgent.ts` adapts that contract to the existing
  driver decision, F1 energy-intent and ERS-mode schedulers, F1 active-aero
  mode selector, and the F1 Electrical Overtake compatibility request without
  changing their results, plus the unchanged SF OTS use predicate;
- `src/simulation/driverPerception.ts` projects the closed common observation
  set, including subject-scoped traffic readings, into the live inbox;
- `src/simulation/driverObservationInbox.ts` and
  `src/simulation/driverAgentRuntime.ts` own causal delivery, finite retention,
  category experience and the persisted replay tail;
- `docs/DRIVER_ABILITY_DEPENDENCY_GRAPH.md` records source construction,
  normalization, production consumers, aggregate-only skills, and the resolved
  duplicate-effect register; and
- `src/simulation/race.ts` calls the reversible adapter wrapper at the
  pre-advance race decision seam and passes the same route metadata to
  `src/simulation/telemetry.ts` for F1 energy, active-aero, Electrical
  Overtake, and SF OTS request dispatch, while `src/simulation/qualifying.ts`
  uses it for the shared offline timed-session execution decision. The live
  race evaluates operational records only when the low-frequency lap/intent
  record cycle changes; all twelve control windows still produce decisions.

The behavior delegated by the adapter remains
`src/simulation/driverDecision.ts`. Existing category system truth remains in
`src/simulation/runtimeSystems.ts`, and the existing F1 energy scheduling
calculation remains in `src/simulation/driverEnergyIntent.ts`. Phase 7.2 moves
only caller ownership: it does not change a coefficient or transfer physical,
SOC, power-limit, recharge, or regulatory authority out of the existing owners.

Phase 7.8A does not call the diagnostic projector from the live race or offline
timed-session paths and changes no production source. It therefore adds no
hot-path observation allocation, random draw, decision record, retained inbox,
event/log entry, or behavior change.

The first Phase 7.8B cleanups change production source only by removing the
uncalled `driverAbilityDeficit` and `qualifyingSetupPenaltySeconds` exports,
renaming a positional track-limit parameter to match the supplied
race-awareness ability, and removing the redundant returned
`DriverDecision.decisionWindow` property. The local window still produces
`absoluteDecisionWindow`; `setupCompletenessPercent` and its UI consumer remain.
The cleanups preserve the legacy exported tuning key, every consumed value and
formula, argument order, seed/hash inputs, random evaluations, cadence, and
production results.

The next cleanup removes the terminal `F1EnergyIntent.qualifyingSpendBias`
calculation and returned field and the redundant returned
`endOfStraightHarvestBias` copy. Its local value remains in the unchanged
`superclipAcceptance` formula, and qualifying phase still changes consumed
intent outputs. The internal type/runtime surface narrows without changing SOC,
energy authority, seeds, random evaluation, saved state, or simulation results.

DA-11 is the first intentional sensitivity correction. Named raw/performance
paths and the direct F1 energy blend now saturate every input at 100. Authored values
through 120 remain valid and displayed, while only the existing bounded
`driverLimitBreakFraction` consumes their excess. The 0..100 field,
coefficients, seeds, random cadence, authority, and saved shape are unchanged;
no observed or validation target is used to compensate for the removed edge.

DA-08 is then closed with a behavior-neutral executable contract. The existing
12 decision windows retain local execution losses, while the unchanged
`lap-execution` hash is sampled once per run and contributes only a bounded
non-negative whole-run assembly shortfall. A pure helper test fixes its
symmetry, zero point, and consistency endpoints; no historical spread or grid
gap is used as an acceptance target.

DA-04 is resolved next by assigning the timed-session rain overlay to
`wetSkill` alone. Adaptability, braking and throttle control remain in the
generic decision windows that precede it. Existing rain severities and risk
bounds are retained without fitting or coefficient redistribution; dry output,
decision hashes, and cadence are unchanged.

DA-06 then separates setup responsibilities without coefficient replacement.
`consistency` owns practice programme execution, and final
`carBalanceAdaptation` owns feedback, completeness, and convergence. The direct
final-skill `adaptability` reads leave both setup stages; compact-source
expansion is covered by the separate normalized DA-14 contract.

DA-07 returns qualifying pit-release ordering to the team domain. No driver
ability now changes that schedule; machine qualifying rating, pit-crew speed,
teammate de-stacking and the existing deterministic planning hashes remain.
Removed driver weights are not reassigned or refitted.

DA-02, DA-09 and DA-10 are then fixed as behavior-neutral executable
contracts: window controls do not own rare lap incident outcomes, an explicit
brake decision short-circuits the skill fallback, and one cached fuel-use value
feeds prediction plus the sole debit. Two unconsumed returned decision fields
are removed without removing the local values that still feed consumed output.

DA-13 then restricts live attack and defend cues to race-distance sessions,
matching the formal battle boundary. Timed sessions retain tow, dirty-air,
yield, pit, emergency and flag controls. Race hashes/cadence are unchanged;
timed sessions intentionally stop selecting race battle intents.

DA-01 then gives stochastic battle resolution one owner. Generic decisions
retain intent and physical controls but no attempted-move or contact-risk
output. The race loop calls `overtaking.ts` only for attack intent, and that
module alone owns attempt, pass/defend, contact and crash rolls. Removed weights
are not reassigned; its deterministic hash keys and cadence remain.

DA-05 then removes the direct tyre-management/tyre-delta surrogate from battle
resolution. Physical wear, temperature, grip and their resulting speed/gap,
plus tyre strategy and selection, keep their existing owners. Removed terms are
not replaced; battle outcomes intentionally use only the physical state already
delivered to the resolver.

DA-12 then assigns timed abort/deletion/yellow and race track-limit outcomes to
adjudication alone. Existing event keys and base/context terms remain, but no
path rereads race awareness after generic execution. Removed sensitivity is
not redistributed; event outcomes intentionally narrow without changing
decision cadence or saved state.

DA-03 then makes `F1EnergyIntent` the sole driver-ability owner for F1 energy
scheduling. Deployment, recovery and superclipping keep their existing formulas
at the ideal execution endpoint and no longer reread skills. The intent blend,
driver-ID strategy variation, Energy Store accounting, regulatory limits and
team-machine authority remain in their existing owners.

DA-14 then closes the compact-expansion review without production changes. The
existing 12-to-30 matrix is tested as non-negative and row-normalized, so equal
inputs remain equal and every output stays inside the compact source envelope.
Representative braking/racecraft rejoins and a performance blend preserve the
equal value. The four aggregate-only skills gain no new consumer.

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

timedSessionDriverExecutionLossSeconds for qualifying / Sprint Qualifying / practice
  -> each existing decision window uses RaceConfig.driverDecisionPath
     -> legacy-direct: delegate unchanged to decideDriverBehavior
     -> category-agent-v1: resolve and check executable series / vehicle era
          -> delegate unchanged to decideDriverBehavior
  -> existing execution-loss formula, physics, strategy, traffic, and results

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

Phase 7.7 replaces the remaining production direct driver-decision call in the
shared offline timed-session execution-loss path with the existing reversible
adapter. Every qualifying, Sprint Qualifying, and practice decision window
receives the identical context, progress, and seed and returns the identical
`DriverDecision`. The window count, execution-loss formula, physical lap,
tyres, weather, setup, release plan, traffic, classification, and practice
programme remain with their existing owners. This is call-site ownership only;
it does not create an observation-consuming qualifying or practice policy.

Phase 7.8A records the current 30-skill and six-style dependency graph, including
the separate raw-behavior, performance-normalized, limit-break, and display
domains. It also identifies aggregate-only skills, dead sinks, and compound
effects that required review at that boundary. The graph is documentation, not
a new runtime manifest; subsequent Phase 7.8B slices provide the explicit
resolution contracts.

The first Phase 7.8B cleanups remove confirmed dead helpers, resolve the
track-limit input-name mismatch, and narrow redundant decision and energy-intent
return surfaces recorded by that graph. Those initial pieces did not select a
new ability owner or resolve DA-03/DA-12. DA-11 is resolved by the subsequent
single-owner change;
DA-08 is resolved by its two-cadence executable contract, DA-04 by its
wet-skill-only rain overlay, and DA-06 by its programme/feedback owner split.
DA-07 is resolved by its team-owned qualifying-release contract; DA-02, DA-09
and DA-10 are resolved by the subsequent behavior-neutral contract cleanup.
DA-13 is resolved by the subsequent race-distance cue gate, and DA-01 by the
formal-battle-owner cleanup. DA-05 is resolved by removing the battle tyre
surrogate, DA-12 by the adjudication-owner cleanup, and DA-03 by keeping ability
only in `F1EnergyIntent` while downstream execution uses its ideal endpoint.
DA-14 closes the register with a normalized 12-to-30 construction contract and
no production formula change. The operational closure now consumes the bounded
observations without reopening those ability-owner decisions.

## Contract model

`src/simulation/driverAgentContract.ts` owns the following public concepts.

### Identity and category experience

`DriverIdentityModel` projects the driver's shared skills and style together
with reference-only decision/observation ID memory. A live seat, team, car number,
category, and vehicle era are deliberately excluded. The base values are not
re-fit or silently changed when the same driver is placed in another executable
category. Operational memory is bounded by the 96-observation inbox and the
single retained replay record; opponent traffic is perceived by subject ID
without exposing an opponent's private plan or internal state.

`DriverCategoryExperience`, with its F1 and SUPER FORMULA branches, is separate
from shared identity. This allows future learning to be scoped by category and
vehicle era without modifying the driver's base skill profile. The live runtime
persists category mileage and a bounded confidence value. Confidence only
weights noisy perception; no learned grip/energy/OTS estimator is claimed, and
those model references remain explicitly unavailable.

### Series policy

`SeriesDrivingPolicy` is a discriminated union of
`F1_2026_DrivingPolicy` and `SF_2026_DrivingPolicy`. The discriminant is an
isolation boundary: F1-only energy and active-aero concepts cannot be exposed as
SUPER FORMULA capabilities, and SUPER FORMULA OTS cannot be exposed as an F1
capability.

Policy selection follows the executable series identity. It must not be
inferred from driver provenance, circuit identity, tyre supplier, or a generic
overtake-system label. Through Phase 7.8A the selected category metadata only
validates dispatch ownership at the F1 energy, ERS-mode, active-aero, and
Electrical Overtake request seams, the SF OTS request seam, and the generic
timed-session execution seam. It does not use observations or a new policy
algorithm to change driving behavior.

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

Operational policies consume the bounded inbox with delayed and noisy
readings, causal delivery, retention limits, and explicit consumption rules.
The live race projects one reading set per physical decision window and also
on an urgent flag, pit, emergency, battle-role, or yield transition. Pending
readings are delivered when their fixed latency expires; unchanged physics
ticks reuse the already retained causal view instead of rebuilding and
revalidating the inbox for every car.
Those inputs remain inside this contract rather than handing an
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

Through Phase 7.8A, the required invariants are:

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
- legacy, category, and default timed-session paths return exactly equal
  execution loss for supported F1 and SF metadata, while the category path
  rejects mismatched metadata and the legacy rollback preserves its result;
- materialized overall is not reread as a race/timed-session pace multiplier,
  while its construction, import/migration, and profile-selection ancestry is
  explicit; historical source-series provenance remains outside executable
  category-policy selection;
- contract canonicalization orders IDs and record collections by stable keys;
  and
- the same seed and canonical contract input produce the same canonical data.

This determinism foundation is now exercised by live checkpoint/replay state:
the inbox, category experience and latest complete decision record are saved,
strictly parsed and continued deterministically.

## Rollback

`RaceConfig.driverDecisionPath`, defined in `src/types.ts`, is the explicit
migration switch:

- `category-agent-v1` validates category ownership before delegating the
  generic race and timed-session decisions and, for F1 telemetry, the existing
  energy and active-aero requests plus the baseline ERS-mode and Electrical
  Overtake compatibility requests and, when downstream availability passes,
  the existing SF OTS use predicate; and
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrappers directly to `decideDriverBehavior`, `f1EnergyIntentFor`,
  `f1ErsModeIntentFor`, `activeAeroModeFor`, and
  `f1ElectricalOvertakeIntentFor`, plus `sfOtsUseRequestedFor` for SF OTS.

An omitted property resolves to `category-agent-v1`. Setting `legacy-direct`
is the rollback point. The operational path may intentionally differ because
it reads delayed/noisy perceptions and category experience; the rollback path
still calls the reviewed low-level controller from exact compatibility context.
Invalid series/era pairs are rejected only by category-agent validation.
The same exact parity and rollback rules apply to the F1 energy-intent object
and to generic timed-session execution loss; no supported-path divergence is
allowed in this ownership-only slice. `src/simulation/qualifying.ts` now routes
the shared qualifying, Sprint Qualifying, and practice execution call through
the adapter. The existing `timedRunPhase` input continues unchanged as a
compatibility input; neither it nor this call-site migration constitutes an
operational qualifying agent. Phase 7.8B subsequently removes the unconsumed
returned `qualifyingSpendBias` field.

## Phase 7 closure and bounded limits

The completion criteria are now covered by live integration and acceptance
tests: causal delayed/noisy observations, layered requests, category-isolated
F1/SF tactics, bounded memory and experience, a deterministic rollback,
decision-record retention, checkpoint continuation, malformed-state rejection,
and cross-category race coverage.

The following limitations are intentional boundaries rather than unfinished
Phase 7 code:

- opponent memory stores observed subject relationships, not hidden opponent
  beliefs or strategy plans;
- confidence adapts perception weighting, while learned grip/energy/OTS model
  references stay unavailable until a validated estimator and evidence exist;
- only the latest complete replay record is retained per car to meet browser
  checkpoint size constraints; the longer observation history stays bounded in
  the inbox, with live production aligned to the twelve control windows and
  urgent cue transitions; and
- category requests never bypass the existing legality and outcome authorities.

New capabilities or direct compatibility call sites must preserve these
boundaries and add their own category and replay acceptance coverage.
