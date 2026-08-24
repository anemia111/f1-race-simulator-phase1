# Category-specific driver behavior

## Status and purpose

This document defines the F1 2026 and SUPER FORMULA 2026 Driver Agent boundary
introduced by Phase 7.0 and extended through Phase 7.3. Phase 7.1 adds closed,
value-bearing observation readings and an immediate diagnostic projector.
Phase 7.2 moves dispatch ownership of the existing pure F1 energy intent behind
the category-agent switch, while the live race still produces exactly the same
generic decision and energy intent. Phase 7.3 routes the unchanged F1
Straight/Corner selector through the same switch. It does **not** claim that
either category policy is behaviorally operational, that perception is
complete, or that Phase 7 is complete.

The contract is in `src/simulation/driverAgentContract.ts`; the behavior-neutral
adapter is in `src/simulation/categoryDriverAgent.ts`; the diagnostic projector
is in `src/simulation/driverPerception.ts`; and the race integration
point is in `src/simulation/race.ts`.

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

Both policy branches remain behaviorally inert in Phase 7.3 and delegate to the
same legacy decision. The F1 branch now validates ownership before dispatching
the unchanged energy scheduler; it does not replace that scheduler with an
observation-consuming policy. Value-bearing diagnostics do not make either
policy operational.

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
- `src/simulation/activeAero.ts` owns the F1 active-aero state transition and
  availability behavior;
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

## Phase 7.3 behavior and rollback

`RaceConfig.driverDecisionPath` in `src/types.ts` selects the race path:

- `category-agent-v1` resolves and checks the executable series/vehicle era,
  then delegates unchanged to `decideDriverBehavior` and, for F1 telemetry,
  the existing energy scheduler and active-aero mode selector;
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrappers directly to `decideDriverBehavior`, `f1EnergyIntentFor`, and
  `activeAeroModeFor`.

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
this slice because its driver request is not yet separated from regulatory
eligibility and power-ledger arbitration.

The race-path adapter does not add a random draw, rewrite the seed, create a
category pace factor, allocate observations, or allocate a decision record. An
explicit pure diagnostic projection may create immediate observations, and an
explicit pure diagnostic evaluation may construct a `DriverDecisionRecord`,
without touching race state. A legacy utility is recorded as not evaluated
rather than assigned an invented score. Runtime observation production on the
race hot path, retention, checkpoint storage, and replay comparison remain
later work.

`src/simulation/qualifying.ts` remains on the direct legacy decision call in
this batch. Race-path parity therefore does not imply qualifying migration or
qualifying policy coverage. Existing `timedRunPhase` and
`qualifyingSpendBias` inputs remain unchanged compatibility inputs, not evidence
of a qualifying Driver Agent.

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
behaviorally inert through Phase 7.3. The adapter uses the same decision context
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
change the delegated decision, energy intent, or active-aero mode in Phase 7.3.
Later operational policy versions may intentionally diverge only after
category-specific behavior and acceptance coverage are added explicitly.

## Required future F1 behavior

The F1 policy remains non-operational until it can make bounded, rule-aware
decisions for at least:

- Straight Mode command timing and Corner Mode return margin;
- energy deployment, harvesting, lift-and-coast, superclipping, SOC target, and
  attack/defend reserves;
- F1 Overtake eligibility and use without DRS or SUPER FORMULA OTS behavior;
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
- qualifying and other remaining compatibility-call migration; and
- a documented driver-ability dependency graph with unexplained duplicate
  effects removed.

Until those items and category acceptance cases are implemented, the phrase
"category-specific Driver Agent" refers to the contract boundary, Phase 7.1
diagnostic projection, Phase 7.2 ownership-only F1 energy dispatch, and Phase
7.3 ownership-only F1 mode-selector dispatch. It does not mean completed
category-specific driving behavior.
