# Category-specific driver behavior

## Status and purpose

This document defines the F1 2026 and SUPER FORMULA 2026 Driver Agent boundary
introduced by Phase 7.0 and extended through the first Phase 7.8B cleanups.
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
consumed calculation. These slices do not claim that perception or Phase 7 is
complete.

The next Phase 7.8B slice intentionally resolves DA-11: every named raw,
performance, and direct energy-skill input saturates at 100, while the existing bounded
limit-break aggregate remains the only runtime owner of authored excess up to
120. It does not refit a coefficient or use an observed/validation target.

DA-08 is closed without behavior change: the 12 decision windows own local
execution loss, and the unchanged once-per-run `lap-execution` draw owns only a
bounded non-negative whole-run assembly shortfall. Pure helper tests fix its
symmetry, zero point, and consistency endpoints without using historical spread
or grid gaps as targets.

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
the live race hot path. Phase 7.2 also routes the existing F1 energy intent
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
and overall's construction/import/migration/profile-selection ancestry. The
review register deliberately leaves overlapping battle, incident, energy,
wet-execution, tyre, and practice effects unresolved for Phase 7.8B or later;
this slice changes no coefficient, seed, random draw, runtime field, or saved
state.

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
DA-03 remains unresolved.

DA-11 is resolved separately by saturating every named raw, performance, and
direct energy-skill input at 100. Values up to 120 remain valid and displayed; only the
existing `driverLimitBreakFraction` consumes the excess. The normal field,
coefficients, seeds, random cadence, authority, and saved shape remain unchanged.

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

The immediate diagnostic projector derives selected exact readings from the
immutable, pre-advance `DriverDecisionContext`. For this compatibility
projection, observation, availability, and decision ticks are equal. The
result is ephemeral: it is not retained in a live inbox, copied into a race
snapshot, or consumed to change the delegated decision.

Exact immediate readings are diagnostic compatibility evidence, not a model
of sensing delay, noise, limited attention, or stale information. A bounded
inbox with delayed/noisy delivery and operational consumption remains future
work.

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

Category metadata and immediate diagnostics must be deterministic and
behaviorally inert through Phase 7.8A. The adapter uses the same decision context
and the same seed as the legacy path. The projector is opt-in, pure, and uses no
random draw. Canonicalization removes incidental ordering from contract
collections; it does not add a seed namespace or convert unavailable
observations into invented values.

The energy ownership adapter also uses the same options and numerical kernel as
the legacy path. It adds no RNG, wall-clock input, global state, coefficient, or
category pace factor. Exact pure-output parity and multi-tick F1 snapshot parity
are required; SF snapshot parity and runtime discrimination remain required.

Any later record producer must use simulation identifiers and simulation time,
never wall-clock time, global counters, renderer timing, worker scheduling, or
callback order. Record creation, sorting, retention, or omission must not change
the returned decision.

Changing only the category policy branch in a contract-level parity case may
change category metadata and the legal diagnostic reading set, but it must not
change the delegated decision, energy intent, ERS-mode request, or active-aero
mode, and it must preserve the always-armed Electrical Overtake compatibility
request and downstream effective status in Phase 7.5. For SF OTS it must also
preserve the exact composite use predicate and every downstream availability,
status, and sourced-power result in Phase 7.6. Timed-session legacy, category,
and default paths must also preserve the exact execution loss for supported F1
and SF metadata; only category validation may reject an invalid series/era pair.
Later operational policy versions may intentionally diverge only after
category-specific behavior and acceptance coverage are added explicitly.

## Required future F1 behavior

The F1 policy remains non-operational until it can make bounded, rule-aware
decisions for at least:

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

Existing active-aero and energy runtime modules are inputs and downstream
authorities for this future policy. Their existence alone does not satisfy these
Driver Agent decisions.

## Required future SUPER FORMULA behavior

The SUPER FORMULA policy remains non-operational until it can make bounded,
rule-aware decisions for at least:

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

## Remaining shared Driver Agent work

Both category policies still require shared agent capabilities:

- a bounded delayed/noisy observation inbox and operational perception policy;
- strategic goal, tactical intent, and low-level control layers;
- finite memory and opponent beliefs;
- risk budget and team-order response;
- grip exploration and a time-based adaptive decision cadence;
- persistent category experience separated by series and vehicle era;
- decision-record retention and deterministic replay comparison;
- audit and migration of any newly found or newly introduced direct
  compatibility calls; and
- resolution and removal of the unexplained duplicate effects recorded in the
  Phase 7.8A driver-ability dependency graph in Phase 7.8B or a later slice.

Until those items and category acceptance cases are implemented, the phrase
"category-specific Driver Agent" refers to the contract boundary, Phase 7.1
diagnostic projection, Phase 7.2 ownership-only F1 energy dispatch, and Phase
7.3 ownership-only F1 mode-selector dispatch, plus Phase 7.4 ownership-only
baseline ERS-mode dispatch and Phase 7.5 ownership-only dispatch of the
explicit legacy Electrical Overtake compatibility request. Phase 7.6 adds only
ownership-checked dispatch of the unchanged SF OTS use predicate after
availability passes. Phase 7.7 adds only ownership-checked dispatch of the
unchanged timed-session execution decision. Phase 7.8A adds only the audited
driver-ability dependency graph and does not resolve its review-required
compound effects. It does not mean completed category-specific driving
behavior.
