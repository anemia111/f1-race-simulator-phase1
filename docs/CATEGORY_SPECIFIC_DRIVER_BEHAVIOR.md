# Category-specific driver behavior

## Status and purpose

This document defines the F1 2026 and SUPER FORMULA 2026 Driver Agent boundary
introduced by Phase 7.0. The batch adds typed category policy metadata and a
reversible race adapter, but delegates to the existing generic driver decision
unchanged. It does **not** claim that either category policy is behaviorally
operational or that Phase 7 is complete.

The contract is in `src/simulation/driverAgentContract.ts`; the behavior-neutral
adapter is in `src/simulation/categoryDriverAgent.ts`; and the race integration
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

Both policy branches are metadata-only in Phase 7.0 and delegate to the same
legacy decision.

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
pre-advance evaluation point. The adapter's category/era check cannot alter the
delegated `DriverDecision`, and the hot path allocates no decision record.

## Phase 7.0 behavior and rollback

`RaceConfig.driverDecisionPath` in `src/types.ts` selects the race path:

- `category-agent-v1` resolves and checks the executable series/vehicle era,
  then delegates unchanged to `decideDriverBehavior`;
- `legacy-direct` skips category-policy resolution and delegates from the same
  wrapper directly to `decideDriverBehavior`.

Once exact parity coverage is satisfied, omission defaults to
`category-agent-v1`. The explicit `legacy-direct` value is the rollback path.
For the same seed and decision context, both paths must return an exactly equal
`DriverDecision`, not merely a similar lap trace, when the executable
series/vehicle-era pair is supported. An invalid pair is intentionally rejected
by `category-agent-v1` while `legacy-direct` skips category validation.

The race-path adapter does not add a random draw, rewrite the seed, create a
category pace factor, or allocate a decision record. A `DriverDecisionRecord`
schema exists for auditability, and an explicit pure diagnostic evaluation may
construct one without touching race state. A legacy utility is recorded as not
evaluated rather than assigned an invented score. Runtime production on the
race hot path, retention, checkpoint storage, and replay comparison remain
later work.

`src/simulation/qualifying.ts` remains on the direct legacy decision call in
this batch. Race-path parity therefore does not imply qualifying migration or
qualifying policy coverage.

## Observability and authority

Category policy must consume a driver observation, not unrestricted simulation
truth. `DriverObservationFor` establishes a provenance- and uncertainty-aware
signal boundary. Phase 7.0 carries signal metadata only and does not claim that
a complete value-bearing perception model exists.

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

Category metadata must be deterministic and observationally inert during Phase
7.0. The adapter uses the same decision context and the same seed as the legacy
path. Canonicalization removes incidental ordering from contract collections;
it does not add a seed namespace or convert unavailable observations into
invented values.

Any later record producer must use simulation identifiers and simulation time,
never wall-clock time, global counters, renderer timing, worker scheduling, or
callback order. Record creation, sorting, retention, or omission must not change
the returned decision.

Changing only the category policy branch in a contract-level parity case may
change category metadata, but it must not change the delegated decision in
Phase 7.0. Later operational policy versions may intentionally diverge only
after category-specific behavior and acceptance coverage are added explicitly.

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
"category-specific Driver Agent" refers to the Phase 7.0 contract boundary,
not to completed category-specific driving behavior.
