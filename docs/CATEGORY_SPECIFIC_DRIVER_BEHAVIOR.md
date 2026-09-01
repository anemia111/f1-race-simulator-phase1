# Category-specific driver behavior

## Status and purpose — operational

Phase 7 is operationally complete as of 2026-08-29. The default live race path
consumes delayed/noisy, bounded self/track/traffic/race-control/team
observations, retains category mileage/confidence, and records a validated
goal -> intention/tactic -> control decision. F1 and SUPER FORMULA retain
separate policy discriminants and tactics; downstream physics and regulation
modules remain the sole outcome authorities. `legacy-direct` remains the
explicit exact-context rollback.

The historical sequence below records the incremental boundary introduced by
Phase 7.0 and extended through the first Phase 7.8B cleanups.
Phase 7.1 adds closed,
value-bearing observation readings and an immediate diagnostic projector.
Phase 7.2 moves dispatch ownership of the existing pure F1 energy intent behind
the category-agent switch, while the live race still produces exactly the same
generic decision and energy intent. Phase 7.3 routes the unchanged F1
Straight/Corner selector through the same switch. Phase 7.4 routes the unchanged
baseline F1 ERS-mode selector. Phase 7.5 makes the legacy implicit
always-use-when-permitted F1 Electrical Overtake request explicit and routes
only that ephemeral compatibility action. It does **not** claim that either
category policy is behaviorally operational. Phase 7.6 routes the unchanged
composite SUPER FORMULA OTS driver-use predicate through the same switch. Phase
7.7 routes the unchanged generic timed-session execution decision used by
qualifying, Sprint Qualifying, and practice through the reversible adapter.
Phase 7.8A documents the current driver-ability dependency graph and unresolved
compound effects without changing production behavior. The first Phase 7.8B
cleanups remove two unused helpers, correct a track-limit parameter label, and
narrow redundant decision and energy-intent return surfaces without changing a
consumed calculation. Phase 7.9A adds a bounded deterministic observation inbox
with causal delay, bounded sensor uncertainty, expiry, deduplication and finite
retention. The operational closure subsequently connects it to live decisions,
category experience, decision records and checkpoints.

The next Phase 7.8B slice intentionally resolves DA-11: every named raw,
performance, and direct energy-skill input saturates at 100, while the existing bounded
limit-break aggregate remains the only runtime owner of authored excess up to
120. It does not refit a coefficient or use an observed/validation target.

DA-08 is closed without behavior change: the 12 decision windows own local
execution loss, and the unchanged once-per-run `lap-execution` draw owns only a
bounded non-negative whole-run assembly shortfall. Pure helper tests fix its
symmetry, zero point, and consistency endpoints without using historical spread
or grid gaps as targets.

DA-04 is then resolved without coefficient fitting: the generic decision
windows retain adaptability, braking and throttle-control execution, while the
separate timed-session rain overlay reads only `wetSkill`. Dry execution,
weather severities, the established risk envelope, decision hashes, and cadence
remain unchanged.

DA-06 is resolved by separating practice programme execution from setup
feedback: `consistency` alone owns the programme score, and final
`carBalanceAdaptation` alone owns feedback, completeness, and convergence.
Removed adaptability weight is not redistributed; setup hashes and cadence are
unchanged.

DA-07 is resolved by returning qualifying pit-release ordering to team
operations. It reads no driver ability; existing machine qualifying rating,
pit-crew speed, teammate spacing and deterministic planning hashes remain.
Removed driver weights are not reassigned.

DA-02, DA-09 and DA-10 are closed without changing consumed results. Generic
window decisions and rare lap incidents have separate outputs and cadence; an
explicit brake decision lazily excludes the legacy skill fallback; and one
cached fuel-use value now feeds prediction and the single debit. The unused
returned nominal-line and error-risk copies are removed, while their local
values retain every existing calculation.

DA-13 is resolved at the live caller: attack and defend cues are supplied only
for race-distance sessions. Timed sessions keep tow alignment, dirty-air
avoidance, yield, pit, emergency and flag controls, but no longer select
race-only battle intents.

DA-01 is resolved by leaving battle intent and physical controls in the generic
decision while making `overtaking.ts` the sole owner of attempt, pass/defend,
contact and crash rolls. The race loop calls it only for attack intent; removed
generic attempt/contact weight is not reassigned.

DA-05 is resolved by removing the battle-only tyre-management surrogate.
Physical wear, temperature, grip, resulting speed/gap/closing opportunity,
strategy and tyre selection retain their existing owners; no removed term is
replaced or refitted.

DA-12 is resolved by assigning abort, deletion, caused-yellow and track-limit
events to adjudication rather than rereading driver awareness after execution.
Existing event keys/base chances remain; race track limits also retain their
pressure, tyre-wear, grip and rain context. Removed awareness weight is not
redistributed.

DA-03 is resolved by making `F1EnergyIntent` the sole F1 energy scheduling
ability owner. Deployment, recovery and superclipping retain their existing
formulas at the ideal execution endpoint and no longer reread driver skills.
The intent blend and driver-ID strategy variation remain; physical, SOC,
recharge, power, regulatory and team-machine authorities do not move.

DA-14 is resolved without changing production formulas. The existing 12-to-30
skill expansion is fixed as a non-negative, row-normalized construction:
equal inputs stay equal, outputs remain inside the compact source envelope,
and representative normalized rejoin blends do not amplify an equal value.
The four aggregate-only skills gain no new consumer.

The contract is in `src/simulation/driverAgentContract.ts`; the behavior-neutral
adapter is in `src/simulation/categoryDriverAgent.ts`; the diagnostic projector
is in `src/simulation/driverPerception.ts`; and the race and offline
timed-session integration points are in `src/simulation/race.ts` and
`src/simulation/qualifying.ts`.

## Identity, policy, and experience are separate

A driver has one shared identity and base skill/style profile. Category-specific
behavior is represented separately by `SeriesDrivingPolicy`, and learned
adaptation is represented separately by `DriverCategoryExperience`.

```text
shared DriverIdentityModel
  + F1_2026_DrivingPolicy
  + F1 category experience
    -> future F1 behavior

shared DriverIdentityModel
  + SF_2026_DrivingPolicy
  + SUPER FORMULA category experience
    -> future SUPER FORMULA behavior
```

Changing category must not create a second independently fitted base driver.
Likewise, a driver's source-series provenance must not be used as a hidden pace
modifier. Phase 7.0 applies no learned category-experience effect, so the
adapter preserves the existing shared driver decision exactly.

## Category isolation contract

`SeriesDrivingPolicy` has two mutually exclusive branches:

- The F1 branch corresponds to executable series `f1-custom` and complements
  the F1 branch separation in `RuntimeSystems`. It may describe F1
  hybrid-energy intent, Straight/Corner Mode, and the F1 Overtake domain. It
  cannot expose DRS or SUPER FORMULA OTS requests.
- The SUPER FORMULA branch corresponds to executable series `super-formula`
  and complements the SUPER FORMULA branch separation in `RuntimeSystems`. It
  may describe the SUPER FORMULA OTS domain. It cannot expose F1 ERS, SOC,
  active-aero, Overtake, or DRS requests.

Both policy branches remain behaviorally inert in Phase 7.8A and delegate to the
same legacy decision. The F1 branch now validates ownership before dispatching
the unchanged energy, baseline ERS-mode, and active-aero selectors plus the
Electrical Overtake compatibility request; it does not replace them with an
observation-consuming policy. Value-bearing diagnostics do not make either
policy operational. The SF branch validates ownership of the unchanged OTS use
predicate only after downstream OTS availability passes.

The selected branch comes from the executable `seriesId`. It is not inferred
from the driver, track, tyre, or generic overtake configuration. This matters in
Free Mode, where a category can run on a circuit associated with another
series without becoming that series.

For compatibility with existing race configurations, omission defaults the
series to `f1-custom` and selects the matching 2026 era for whichever series is
resolved. An explicit series/era mismatch fails closed on the category-agent
path. This fallback is a migration rule and does not infer category from a
driver, track, or physical value.

The type boundary complements the existing runtime isolation in
`src/simulation/runtimeSystems.ts`. That file already keeps F1 vehicle-system
truth and SUPER FORMULA vehicle-system truth in different discriminated
branches. The Driver Agent contract must not reconstruct forbidden fields as
zero-valued compatibility aliases.

## Existing runtime foundations

The repository already has useful physical and behavioral foundations, but they
must not be confused with an operational category Driver Agent:

- `src/simulation/driverDecision.ts` selects generic flag, pit, emergency,
  attack, defend, wake, tow, yield, and reference-line intent and returns bounded
  lateral and pedal requests;
- `src/simulation/driverEnergyIntent.ts` produces bounded F1 energy-scheduling
  preferences while the physical energy system retains authority;
- `src/simulation/driverOtsIntent.ts` contains only the existing SF OTS
  driver-use compatibility predicate;
- `src/simulation/activeAero.ts` owns the F1 active-aero state transition and
  the effective Electrical Overtake availability/activation arbitration;
- `src/simulation/telemetry.ts` connects existing driver controls and
  category-specific systems to the live force path; and
- `src/simulation/runtimeSystems.ts` prevents the SUPER FORMULA runtime from
  carrying F1 ERS, SOC, or active-aero truth.

Phase 7.0 wraps the generic race decision at its existing immutable,
pre-advance evaluation point. Phase 7.1 can project immediate diagnostics from
that immutable `DriverDecisionContext`, but does not invoke the projector from
the live race hot path. Phase 7.9A can pass those readings through the pure
bounded inbox, but still does not retain or consume them in the hot path.
Phase 7.2 also routes the existing F1 energy intent
through `categoryDriverAgent.ts`. The adapter's category/era checks cannot
alter the delegated `DriverDecision` or energy-intent result, and the hot path
adds no observation inbox/projector, decision record, event/log entry, retained
agent state, or random draw.

## Phase 7.8A graph and rollback

`RaceConfig.driverDecisionPath` in `src/types.ts` selects the race and offline
timed-session generic decision paths:

- `category-agent-v1` resolves and checks the executable series/vehicle era,
  then delegates unchanged to `decideDriverBehavior` and, for F1 telemetry,
  the existing energy scheduler, baseline ERS-mode selector, and active-aero
  mode selector plus the Electrical Overtake compatibility request and, for SF
  telemetry, the OTS use predicate after downstream availability passes. The
  same branch also delegates each existing timed-session execution decision;
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrappers directly to `decideDriverBehavior`, `f1EnergyIntentFor`,
  `f1ErsModeIntentFor`, `activeAeroModeFor`, and
  `f1ElectricalOvertakeIntentFor`, plus `sfOtsUseRequestedFor` for SF OTS.

Once exact parity coverage is satisfied, omission defaults to
`category-agent-v1`. The explicit `legacy-direct` value is the rollback path.
For the same seed and decision context, both paths must return an exactly equal
`DriverDecision`, not merely a similar lap trace, when the executable
series/vehicle-era pair is supported. An invalid pair is intentionally rejected
by `category-agent-v1` while `legacy-direct` skips category validation.

For a car with an F1 Energy Store, both paths also call `f1EnergyIntentFor`
exactly once with the same `F1EnergyIntentOptions` and must return an exactly
equal intent object. The category path requires the resolved policy to be F1
and expose `energyStore: requestable`; an SF policy or mismatched era fails
closed before scheduler options are read. A genuine SF runtime has no F1 Energy
Store and never invokes the F1 scheduler. No live divergence is permitted in
this ownership-only slice.

The returned values remain unitless scheduling requests. `advanceSuperClipping`,
`energyDeploymentRequestFor`, the regulatory power gates, and
`advanceEnergyStore` retain authority over power, SOC, recharge, and physical
state. No coefficient, pace multiplier, RNG input, or time source is added.
This compatibility adapter still receives the existing read-only Energy Store
state in its options; it therefore does not satisfy the future requirement for
an operational policy to consume only bounded causal observations.

For F1 active-aero runtime, both paths call `activeAeroModeFor` with the same
legacy options and return the same mode. The category path requires both
Straight and Corner capabilities. SF runtime, preparation laps, and OTS never
enter this seam. `advanceActiveAeroState` retains all authority over zone and
Low-Grip legality, State-of-Deployment changes, transitions, failures,
Corner-safe return, and durable wing state. Electrical Overtake remains outside
the active-aero selector and state machine.

For the baseline requested ERS mode, both paths call `f1ErsModeIntentFor` with
the same options. Telemetry retains the effective-mode overrides for standing
starts, preparation laps, traffic yield, superclipping, and qualifying attack.
Regulatory power curves, deployment requests, SOC/recharge ledgers, and Energy
Store integration remain downstream. This is not complete ERS strategy or an
observation-consuming policy.

For F1 Electrical Overtake, both paths emit the same ephemeral `request`. This
does not add an operational timing choice: it is the exact compatibility
representation of the legacy runtime's implicit automatic use whenever all
downstream gates permit it. The request receives no car, track, battery,
race-control, Low-Grip, eligibility, or allowance input. `overtakeStatusFor`
still owns the effective `disabled`/`available`/`active` result, including the
session, lap, latched detection, activation-line, SOC, and remaining-energy
checks. Power-curve selection, deployment limits, allowance debit, lap-start
recharge latching, and Energy Store integration remain downstream. SF stays on
its OTS branch and never enters this seam. No request is retained in runtime or
checkpoint state.

For SUPER FORMULA OTS, both paths evaluate the same composite use predicate
from final brake/throttle, straightness, gap, battle phase, pace mode, and
final-lap inputs. Its existing numerical thresholds are simulator compatibility
behavior, not official JAF or event activation conditions. The selector remains
behind the unchanged `otsAvailable` short-circuit. Verified event availability,
the still-missing event-condition evaluator, preparation/session, Race Control,
flag, and running-status gates remain downstream, as do the effective status
and provenance-bearing boost power. The default no-event-pack 2026 runtime
remains unavailable and inactive, while a verified event pack still cannot
activate without its evaluator. This slice adds no allocation, cooldown, power,
budget, request retention, or distinct attack/defend policy, and F1 never
enters the SF selector.

The race and timed-session adapters do not add a random draw, rewrite the seed,
create a category pace factor, allocate observations, or allocate a decision
record. An explicit pure diagnostic projection may create immediate
observations, and an explicit pure diagnostic evaluation may construct a
`DriverDecisionRecord`, without touching simulation state. A legacy utility is
recorded as not evaluated rather than assigned an invented score. Runtime
observation production, retention, checkpoint storage, and replay comparison
remain later work.

Phase 7.7 routes the generic execution decision shared by qualifying, Sprint
Qualifying, and practice through the same adapter at every existing decision
window. Context, progress, seed, execution-loss coefficients, physical lap,
tyres, weather, setup, release, traffic, classification, and practice programme
remain unchanged. This closes the known production direct call site, but does
not create an observation-consuming timed-session policy. Existing
`timedRunPhase` remains a compatibility input, not evidence of a qualifying
Driver Agent. Phase 7.8B subsequently removes the unconsumed returned
`qualifyingSpendBias` field.

Phase 7.8A records the 30-skill and six-style construction, normalization,
consumer, authority, and random-cadence graph in
`docs/DRIVER_ABILITY_DEPENDENCY_GRAPH.md`. It distinguishes named production
reads, aggregate-only limit-break participation, materialized display overall,
and overall's construction/import/migration/profile-selection ancestry. At that
boundary the review register deliberately left compound effects open for Phase
7.8B or later. The subsequent DA-01 through DA-14 slices assign explicit
owners, cadence/session contracts, removals, or the normalized construction
contract. The documentation slice itself changes no coefficient, seed, random
draw, runtime field, or saved state.

The first Phase 7.8B cleanups remove the uncalled `driverAbilityDeficit` and
`qualifyingSetupPenaltySeconds` exports, rename only the track-limit helper's
positional parameter to match the supplied race-awareness ability, and remove
the redundant returned `DriverDecision.decisionWindow` property while retaining
the local window used by `absoluteDecisionWindow`.
`setupCompletenessPercent` and its UI consumer remain. The exported legacy
tuning key, consumed values and formulas, argument order, seed/hash inputs,
random evaluations, cadence, and results remain unchanged. This does not choose
a new track-limit skill owner or resolve the DA-12 duplicate-effect review.

The next cleanup removes the terminal returned `qualifyingSpendBias` field and
calculation from `F1EnergyIntent`, plus only the redundant returned
`endOfStraightHarvestBias` copy. The local end-of-straight value remains in the
unchanged `superclipAcceptance` formula, and qualifying phase still affects
consumed intent outputs. The internal surface narrows without changing SOC,
energy authority, seeds, random evaluations, saved state, or simulation results;
DA-03 remained unresolved at that point and is closed by the later
single-ability-owner slice.

DA-11 is resolved separately by saturating every named raw, performance, and
direct energy-skill input at 100. Values up to 120 remain valid and displayed; only the
existing `driverLimitBreakFraction` consumes the excess. The normal field,
coefficients, seeds, random cadence, authority, and saved shape remain unchanged.

DA-08 is closed by its two-cadence executable contract, and DA-04 is closed by
making `wetSkill` the sole ability owner of the timed-session rain overlay.
Adaptability, braking and throttle control remain active in the generic
decision; no coefficient is redistributed to compensate for their removal from
the overlay.

DA-06 is closed by giving programme execution to `consistency` and setup
feedback/convergence to final `carBalanceAdaptation`. Direct final-skill
`adaptability` reads are removed from this setup path without redistributing
their coefficients. Compact-to-expanded construction is covered by the
separate normalized DA-14 contract.

DA-07 is closed by removing qualifying pace, pressure, traffic and awareness
from team pit-release ordering. Existing machine/crew inputs, hashes, traffic
gaps, and teammate de-stacking remain; dry and wet schedules are tested as
invariant to all driver skills.

DA-02, DA-09 and DA-10 are closed by executable contracts for distinct
window/lap outcomes, a mutually exclusive brake fallback, and one shared fuel
multiplier. Removing the two unconsumed decision return fields does not remove
their local calculations or alter hashes, cadence, state, or consumed output.

DA-13 is closed by a tested session gate around attack/defend cues. The race
path is unchanged, and the non-battle timed traffic cues remain available.

DA-01 is closed by removing the generic attempted-overtake, attempted-defence
and contact-risk outputs. Formal battle hashes retain their keys and cadence;
removed generic hash calls were stateless and cannot shift another stream.
The formal pass result is consumed by the race owner as bounded defender
concession loss after a successful attack; it cannot create super-physical
attacker speed and does not bypass lateral occupancy.

DA-05 is closed by removing the direct tyre-management/tire-delta edge from the
formal battle model. Tests fix its invariance to tyre skill and direct tyre
state while the physical vehicle remains the source of speed and gap inputs.

DA-12 is closed by pure adjudication helpers and a driver-independent race
track-limit chance. Decision-window control remains separate; hashes and event
cadence are retained while outcomes intentionally lose duplicate awareness
sensitivity.

DA-03 is closed by keeping the ERS-management, awareness and precision blend in
`driverEnergyIntent.ts` and removing every downstream F1 energy ability reread.
Existing deployment, recovery and superclipping coefficients use their ideal
execution endpoint without redistribution or fitting. Intent scheduling still
varies by driver ability, deterministic superclipping variation still uses the
driver ID, and the physical Energy Store remains authoritative.

DA-14 is closed by black-boxing the existing compact expansion as a convex
12-to-30 matrix. Tests require complete source/output coverage, non-negative
row coefficients summing to one, equal-input preservation, source-envelope
bounds and representative normalized-rejoin invariance. The mapping and all
runtime consumers remain unchanged, the four aggregate-only final skills gain
no named reader, and no validation or holdout value is used.

## Observability and authority

Category policy must consume a driver observation, not unrestricted simulation
truth. `DriverObservationFor` establishes a provenance- and uncertainty-aware
signal boundary. Phase 7.1 adds a closed set of value-bearing reading kinds;
it does not expose an open payload or claim that a complete perception model
exists.

The contract validator owns every reading bound and the allowed correlation
between executable category, observation scope, `signalId`, and reading kind.
A value within its numeric range is rejected when it is attached to an
unrelated signal. Every accepted observation must also satisfy:

```text
observedAtTick <= availableAtTick <= decisionTime.tick
```

The pure projector derives selected exact readings from the
immutable, pre-advance `DriverDecisionContext`. For this compatibility
projection, observation, availability, and decision ticks are equal. The
function itself owns no state; the live race passes its readings into the
causal inbox, which applies scope latency/noise and persists the result before
the operational policy consumes it.

Exact immediate readings are diagnostic compatibility evidence. Phase 7.9A's
`driverObservationInbox.ts` provides the separate perception substrate:

- race-control and team instructions are immediate and exact;
- physical and category-system readings use fixed scope latency;
- selected scalar sensors gain deterministic, bounded uncertainty from an
  observation-ID seed namespace;
- future readings and cross-driver/category observations are rejected;
- duplicate IDs are idempotent only when their complete perceived payloads
  match; and
- pending/retained collections have fixed bounds and retained readings expire
  by simulation tick.

The operation is pure, input-order independent, JSON-serializable and never
uses wall-clock or renderer time. It is stored in `RaceSnapshot`, strictly
restored from checkpoints, and consumed by the default live policy. The longer
inbox is bounded at 96 retained observations; the runtime retains the latest
complete decision record. Live projection follows the twelve physical decision
windows and additionally reacts to urgent flag, pit, emergency, battle-role,
and yield transitions; unchanged physics ticks reuse retained causal readings.

F1 and SUPER FORMULA system readings remain mutually isolated. In particular,
F1 observations cannot carry SUPER FORMULA OTS readings, and SUPER FORMULA
observations cannot carry F1 energy, SOC, Overtake, or active-aero readings.
When an authoritative SUPER FORMULA OTS source is unavailable, the contract
allows an explicit system producer to emit an unavailable reading rather than
invent a budget or substitute an F1 system value. The Phase 7.1 immediate
projector emits no F1 or SUPER FORMULA system observation.

Future category behavior must receive bounded causal signals through that
contract. It must not read future random results, opponent internal plans,
hidden exact condition state, final outcomes, or another subsystem's private
authority state.

The request boundary is equally strict. A category policy may request an
intention, goal, control, tactic, pit action, or FIA action. The receiving
physical or regulatory subsystem decides the outcome. In particular, category
policy cannot directly write:

- speed, position, rank, or lap time;
- grip, tyre force, power, energy balance, or damage;
- pass completion, collision result, pit result, or penalty; or
- race-control, steward, technical, or classification outcome.

## Determinism and category metadata

Category metadata and observations are deterministic. Perception uncertainty
uses an observation-ID seed namespace, not mutable RNG or traversal order.
Canonicalization removes incidental ordering from contract collections and
never converts unavailable observations into invented values. The operational
path may differ from legacy because it consumes causal perceptions; repeated
runs with the same seed and state must remain identical.

The energy ownership adapter also uses the same options and numerical kernel as
the legacy path. It adds no RNG, wall-clock input, global state, coefficient, or
category pace factor. Exact pure-output parity and multi-tick F1 snapshot parity
are required; SF snapshot parity and runtime discrimination remain required.

Any later record producer must use simulation identifiers and simulation time,
never wall-clock time, global counters, renderer timing, worker scheduling, or
callback order. Record creation, sorting, retention, or omission must not change
the returned decision.

Energy, ERS-mode, active-aero and OTS ownership wrappers continue to preserve
their downstream legality and numerical kernels. The live driving decision may
intentionally diverge from `legacy-direct` because the category path now reads
delayed/noisy observations and category confidence. Cross-category acceptance
tests require the default path to be deterministic, the rollback to remain
available, and F1-only/SF-only runtime state never to cross the discriminant.

## Operational F1 behavior boundary

The F1 policy owns bounded goal/tactic/control requests for the following live
contexts while the listed system modules retain execution authority:

- Straight Mode command timing and Corner Mode return margin;
- energy deployment, harvesting, lift-and-coast, superclipping, SOC target, and
  attack/defend reserves;
- F1 Overtake observation-driven request/hold/release timing and use without
  DRS or SUPER FORMULA OTS behavior;
- tyre warm-up/management and brake-temperature management;
- launch/start operation and the applicable standing-start energy restriction;
- dirty air, tow, and active-aero-transition vehicle balance;
- low-grip, yellow, VSC, and safety-car constraints;
- pit entry/exit and track limits; and
- geometric, evidence-based racecraft predicates for attack and defence.

Existing active-aero, energy, tyre, brake and race-control runtime modules are
the downstream authorities. Missing system observations or supplier inputs stay
unavailable; the agent never manufactures them.

## Operational SUPER FORMULA behavior boundary

The SUPER FORMULA policy owns category-isolated attack/defend/tow and pit/rule
requests for the following contexts:

- own and opponent OTS-budget estimates;
- distinct OTS attack and defend timing;
- long-straight tow and position creation in a close one-make field;
- tyre warm-up and single-dry-spec thermal management;
- opening-lap attack;
- push decisions around pit, refuelling, and mandatory-tyre windows;
- out-lap, undercut, and overcut behavior;
- adaptation to the category's high-cornering vehicle behavior;
- event-specific start and pit operation; and
- dangerous-driving and penalty-consequence awareness.

The SUPER FORMULA agent must not gain an F1 ERS-harvest decision, and the F1
agent must not gain a SUPER FORMULA OTS decision.

## Shared closure and intentional limits

Both category policies now share live inbox production/persistence,
goal/tactic/control layers, subject-scoped traffic memory, bounded category
experience, latest-record replay persistence, malformed-state rejection and
cross-category acceptance coverage.

The remaining limits are deliberate: no private opponent strategy is exposed;
learned grip/energy/OTS estimators stay unavailable until independently
validated; one full decision record is retained per car to satisfy checkpoint
size limits; and every physical/regulatory outcome remains downstream. New
compatibility calls must be audited when introduced, but that is an ongoing
change-control rule rather than unfinished Phase 7 implementation.

The phrase "category-specific Driver Agent" therefore refers to the live causal
policy and its authority boundary, plus the existing ownership-checked system
dispatches. Phase 7.7 owns timed-session execution dispatch, Phase 7.8A/7.8B
close the ability dependency register, and Phase 7.9A plus the operational
closure provide bounded perception, experience and replay state. This is the
completed Phase 7 boundary.
